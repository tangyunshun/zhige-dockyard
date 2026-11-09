/**
 * 验证码共享后端（F15 / B1 核心）
 *
 * 设计要点（对应 L01/L02/L03）：
 * - 验证码用安全随机数生成，存储只保存「盐 + 哈希」，绝不保存明文。
 * - 发送前统一裁决：目标间隔/每日上限/失败锁定、平台总上限、IP 上限 —— 全部走共享
 *   后端（并发实例共用同一份限制，不靠两份本机 Map 假装共享）。
 * - 真实委托（MySQL/Prisma 表）未就绪时，在任何发送/签发前返回 503，不本机放行、不业务请求建表。
 * - 供应商明确 accepted / failed / unknown 三种结果分开处理：unknown 不盲目返还全部额度并立即重发。
 * - 一次性消费（consume）原子标记已用，两个实例并发不可重复消费。
 *
 * 生产实现见 PrismaVerificationBackend；测试可注入 MemoryVerificationBackend（模拟共享算法）。
 * 二者实现同一 VerificationBackend 接口，因此测试证明的算法与生产关系一致。
 */

import { randomInt, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type Channel = "sms" | "email";
export type VerifyPurpose = "register" | "reset-password" | "login" | "binding";

/** 既有已核实基线阈值 */
export const VERIFY_POLICY = {
  /** 验证码有效期：5 分钟（与既有短信一致） */
  codeExpiryMs: 5 * 60 * 1000,
  /** 同一目标发送间隔：60 秒 */
  sendIntervalMs: 60 * 1000,
  /** 同一目标每滚动窗口发送上限：10 次 */
  dailyLimit: 10,
  /** 滚动窗口：24 小时 */
  dailyWindowMs: 24 * 60 * 60 * 1000,
  /** 失败累计上限：5 次后锁定 */
  failLimit: 5,
  /** 失败锁定时长：30 分钟 */
  failLockMs: 30 * 60 * 1000,
  /**
   * 平台技术总上限（保守，非现金预算）：每窗口 10000 次。
   * 依据：防单租户/异常脚本把平台短信/邮件通道打爆；更严格规则保留。
   */
  platformLimit: 10000,
  /** 单 IP 技术上限（保守）：每窗口 1000 次 */
  ipLimit: 1000,
} as const;

export interface AdmitArgs {
  channel: Channel;
  /** 归一化后的目标：手机号或邮箱 */
  target: string;
  purpose: VerifyPurpose;
  /** 仅取自服务端已可信来源（如 x-forwarded-for 经代理规范化后的首个 IP），绝不信任 body 中的任意头 */
  ip?: string;
  /** 已认证账号（如存在）；匿名注册场景可为 null，不得强制已有账号才能用 */
  actorId?: string | null;
  /**
   * 可选：消费时绑定的 challenge 身份（由 deriveChallengeId 派生的不可逆标识）。
   * 提供时，只有当前有效码与挑战身份完全一致才允许消费，防止旧凭证消费后来签发的码。
   */
  challengeId?: string;
}

export interface AdmitResult {
  ok: boolean;
  error?: string;
  /** 建议的 HTTP 状态码：未就绪 503、限流 429 */
  status?: number;
  /** 还需等待的秒数（限流间隔） */
  waitSeconds?: number;
  /** [U02] 本次发送的稳定身份（回填幂等绑定）：failed 回填须携带，重复回填零效果 */
  sendId?: string;
}

/**
 * [U02 §2.1.3] 后端结构/服务不可用：与「锁记录不存在」严格区分。
 * lookup/consume 等核验与敏感消费路径遇到本错误必须 fail-closed（503/拒绝），
 * 不得吞成 null/ok 继续放行。
 */
export class VerificationBackendUnavailableError extends Error {
  constructor(message = "验证服务暂不可用") {
    super(message);
    this.name = "VerificationBackendUnavailableError";
  }
}

export interface IssueArgs extends AdmitArgs {
  codeHash: string;
  expiresAt: number;
}

export interface VerifyRecord {
  codeHash: string;
  expiresAt: number;
  used: boolean;
  usedAt: number | null;
  failCount: number;
  lockedUntil: number;
  /** 由 codeHash 派生的不可替换 challenge 身份 */
  challengeId: string;
}

export type SendOutcome = "accepted" | "failed" | "unknown";

export interface VerificationBackend {
  /** 后端是否就绪（真实表/委托可用）。未就绪时 admitSend/issue 一律 503。 */
  ready(): boolean | Promise<boolean>;
  /** 发送前共享原子预算裁决（目标间隔/日限/失败锁定/平台/IP 上限）。不可逾矩放行。 */
  admitSend(args: AdmitArgs): Promise<AdmitResult>;
  /** 签发验证码（写入哈希；同一目标+用途仅一个有效码，重发会取代旧码）。 */
  issue(args: IssueArgs): Promise<AdmitResult>;
  /** 查当前有效（未用、未过期）验证码记录。 */
  lookup(args: AdmitArgs): Promise<VerifyRecord | null>;
  /** 记录一次核验失败（达到上限锁 30 分钟）。 */
  recordFailure(args: AdmitArgs): Promise<void>;
  /** 一次性消费：原子标记已用；已用则返回失败（防并发重复消费）。 */
  consume(args: AdmitArgs): Promise<AdmitResult>;
  /** 删除有效码（注册成功后调用）。 */
  delete(args: AdmitArgs): Promise<void>;
  /**
   * 发送结果回填：failed 返还额度；unknown 不返还（防盲目重发）；accepted 置终态。
   * [U02] 携带 admitSend 返回的 sendId 时按「预约身份绑定」幂等回退：
   * 同一次 failed 重复回填只退一次，A 的重复回填不会退掉 B 的占用；
   * 跨窗口迟到回填只标 OBSOLETE，不动新窗口计数。不带 sendId（旧调用）保持旧语义。
   */
  onSendResult(args: AdmitArgs, outcome: SendOutcome, sendId?: string): Promise<void>;
}

/** 生成 6 位安全数字验证码（密码学随机，替代 Math.random） */
export function generateSecureCode(): string {
  return String(randomInt(100000, 1000000)).padStart(6, "0");
}

/** 生成每记录随机盐，并对验证码做 SHA-256 摘要（存储最小化秘密） */
export function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * 由存储的「盐+哈希」派生不可逆 challenge 身份。
 * 每次签发新码都会产生新的随机盐，因此旧 challenge 身份天然无法匹配新码；
 * 该值可安全放入签名 token，不泄露验证码哈希本身。
 */
export function deriveChallengeId(codeHash: string): string {
  return createHash("sha256").update(`challenge:${codeHash}`).digest("hex").slice(0, 32);
}

/** 生成一个随机的一次性授权 id（jti） */
export function newGrantId(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// 内存实现：用于测试与单实例降级边界清晰；多实例必须由 Prisma 后端共享。
// 注意：本实现通过单进程锁串行化，模拟数据库事务的“条件 + 唯一 + 回滚”语义。
// ---------------------------------------------------------------------------

export class MemoryVerificationBackend implements VerificationBackend {
  private lock: Promise<unknown> = Promise.resolve();
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    // 保证锁链不断（catch 吸收异常，避免锁链断裂）
    this.lock = next.catch(() => undefined);
    return next;
  }

  // target -> 发送/失败状态
  private targetState = new Map<
    string,
    {
      lastSentAt: number;
      dailyCount: number;
      dailyWindowStart: number;
      failCount: number;
      lockedUntil: number;
    }
  >();
  // channel:target:type -> 有效码（challengeId 由 codeHash 派生，不冗余存储）
  private codes = new Map<string, Omit<VerifyRecord, "challengeId"> & { salt: string }>();
  private platformCount = 0;
  private platformWindowStart = Date.now();
  private ipCount = new Map<string, { count: number; windowStart: number }>();
  // [U02] 发送预约身份绑定：`${sendId}:${scope}` -> { scope, key, windowStart, status }
  private sendClaims = new Map<string, { scope: string; key: string; windowStart: number; status: string }>();

  private tkey(channel: Channel, target: string, purpose: VerifyPurpose) {
    return `${channel}:${target}:${purpose}`;
  }

  ready(): boolean {
    return true;
  }

  admitSend(args: AdmitArgs): Promise<AdmitResult> {
    return this.run(async () => {
      const now = Date.now();
      const k = `${args.channel}:${args.target}`;
      const st =
        this.targetState.get(k) || {
          lastSentAt: 0,
          dailyCount: 0,
          dailyWindowStart: now,
          failCount: 0,
          lockedUntil: 0,
        };

      if (st.lockedUntil > now) {
        return { ok: false, error: "验证码错误次数过多，请稍后再试", status: 429 };
      }
      if (st.lastSentAt && now - st.lastSentAt < VERIFY_POLICY.sendIntervalMs) {
        const waitSeconds = Math.ceil(
          (VERIFY_POLICY.sendIntervalMs - (now - st.lastSentAt)) / 1000,
        );
        return { ok: false, error: `请${waitSeconds}秒后再试`, status: 429, waitSeconds };
      }
      if (now - st.dailyWindowStart > VERIFY_POLICY.dailyWindowMs) {
        st.dailyWindowStart = now;
        st.dailyCount = 0;
      }
      if (st.dailyCount >= VERIFY_POLICY.dailyLimit) {
        return { ok: false, error: "今日发送次数已达上限，请明日再试", status: 429 };
      }
      // 平台/IP 技术上限（保守，非现金）
      if (now - this.platformWindowStart > VERIFY_POLICY.dailyWindowMs) {
        this.platformWindowStart = now;
        this.platformCount = 0;
      }
      if (this.platformCount >= VERIFY_POLICY.platformLimit) {
        return { ok: false, error: "平台发送额度已用尽，请稍后重试", status: 429 };
      }
      const ip = args.ip;
      if (ip) {
        const ipSt = this.ipCount.get(ip) || { count: 0, windowStart: now };
        if (now - ipSt.windowStart > VERIFY_POLICY.dailyWindowMs) {
          ipSt.windowStart = now;
          ipSt.count = 0;
        }
        if (ipSt.count >= VERIFY_POLICY.ipLimit) {
          return { ok: false, error: "当前网络发送过于频繁，请稍后重试", status: 429 };
        }
        ipSt.count += 1;
        this.ipCount.set(ip, ipSt);
      }
      // 全部通过：提交（原子）
      st.dailyCount += 1;
      st.lastSentAt = now;
      this.platformCount += 1;
      this.targetState.set(k, st);
      // [U02] 发送预约身份绑定：记录本次占用的各维度与窗口，供 failed 幂等回退
      const sendId = `vs_${randomBytes(12).toString("hex")}`;
      const claims: Array<{ scope: string; key: string; windowStart: number }> = [
        { scope: "target", key: k, windowStart: st.dailyWindowStart },
        { scope: "platform", key: "platform", windowStart: this.platformWindowStart },
      ];
      if (args.ip) claims.push({ scope: "ip", key: args.ip, windowStart: this.ipCount.get(args.ip)?.windowStart ?? now });
      for (const c of claims) this.sendClaims.set(`${sendId}:${c.scope}`, { ...c, status: "PENDING" });
      return { ok: true, sendId };
    });
  }

  issue(args: IssueArgs): Promise<AdmitResult> {
    return this.run(async () => {
      const key = this.tkey(args.channel, args.target, args.purpose);
      const existing = this.codes.get(key);
      // 取代旧有效码（保证同一目标+用途仅一个有效码）
      if (existing && !existing.used && existing.expiresAt > Date.now()) {
        existing.used = true;
        existing.usedAt = Date.now();
      }
      this.codes.set(key, {
        codeHash: args.codeHash,
        expiresAt: args.expiresAt,
        used: false,
        usedAt: null,
        failCount: 0,
        lockedUntil: 0,
        salt: newSalt(),
      });
      return { ok: true };
    });
  }

  lookup(args: AdmitArgs): Promise<VerifyRecord | null> {
    return this.run(async () => {
      const key = this.tkey(args.channel, args.target, args.purpose);
      const r = this.codes.get(key);
      if (!r) return null;
      if (r.used || r.expiresAt <= Date.now()) return null;
      const { salt, ...rest } = r;
      void salt;
      return { ...rest, challengeId: deriveChallengeId(r.codeHash) };
    });
  }

  recordFailure(args: AdmitArgs): Promise<void> {
    return this.run(async () => {
      const k = `${args.channel}:${args.target}`;
      const st =
        this.targetState.get(k) || {
          lastSentAt: 0,
          dailyCount: 0,
          dailyWindowStart: Date.now(),
          failCount: 0,
          lockedUntil: 0,
        };
      st.failCount += 1;
      if (st.failCount >= VERIFY_POLICY.failLimit) {
        st.lockedUntil = Date.now() + VERIFY_POLICY.failLockMs;
        st.failCount = 0;
      }
      this.targetState.set(k, st);
    });
  }

  consume(args: AdmitArgs): Promise<AdmitResult> {
    return this.run(async () => {
      // [U02 §2.1.2] 消费端与 lookup 使用同一失败锁定事实：锁定期间即使持有效码/凭证也不得消费
      const bk = `${args.channel}:${args.target}`;
      const bst = this.targetState.get(bk);
      if (bst && bst.lockedUntil > Date.now()) {
        return { ok: false, error: "验证码错误次数过多，请稍后再试", status: 429 };
      }
      const key = this.tkey(args.channel, args.target, args.purpose);
      const r = this.codes.get(key);
      if (!r) return { ok: false, error: "请先获取验证码", status: 400 };
      if (r.used) return { ok: false, error: "验证码已使用", status: 400 };
      if (r.expiresAt <= Date.now()) {
        this.codes.delete(key);
        return { ok: false, error: "验证码已过期", status: 400 };
      }
      // [U02] challenge 身份绑定：旧凭证不得消费后来签发的新码（同一锁内原子比对）。
      if (args.challengeId && deriveChallengeId(r.codeHash) !== args.challengeId) {
        return { ok: false, error: "凭证与当前验证码不匹配，请重新获取验证码", status: 400 };
      }
      r.used = true;
      r.usedAt = Date.now();
      return { ok: true };
    });
  }

  delete(args: AdmitArgs): Promise<void> {
    return this.run(async () => {
      this.codes.delete(this.tkey(args.channel, args.target, args.purpose));
    });
  }

  onSendResult(args: AdmitArgs, outcome: SendOutcome, sendId?: string): Promise<void> {
    return this.run(async () => {
      if (sendId) {
        // [U02] 按预约身份幂等回退：每维度认领只退一次；跨窗口迟到回填只标 OBSOLETE
        const scopes = ["target", "platform", "ip"];
        for (const scope of scopes) {
          const claim = this.sendClaims.get(`${sendId}:${scope}`);
          if (!claim || claim.status !== "PENDING") continue; // 重复回填/已终态 → 零效果
          if (outcome === "failed") {
            const released = this.releaseClaimedCount(claim);
            claim.status = released ? "REFUNDED" : "OBSOLETE";
          } else if (outcome === "accepted") {
            claim.status = "SETTLED";
          }
          // unknown：保持 PENDING（不返还也不终态，保留可诊断事实）
        }
        return;
      }
      if (outcome === "failed") {
        // 旧调用（无 sendId）：保持旧语义返还（仅本次发送占用的目标日限/平台/IP）
        const k = `${args.channel}:${args.target}`;
        const st = this.targetState.get(k);
        if (st && st.dailyCount > 0) st.dailyCount -= 1;
        if (this.platformCount > 0) this.platformCount -= 1;
        const ip = args.ip;
        if (ip) {
          const ipSt = this.ipCount.get(ip);
          if (ipSt && ipSt.count > 0) ipSt.count -= 1;
        }
      }
    });
  }

  /** [U02] 仅当预算仍在认领时的窗口内且 count>0 才返还；窗口已翻新 → 返回 false（标 OBSOLETE） */
  private releaseClaimedCount(claim: { scope: string; key: string; windowStart: number }): boolean {
    if (claim.scope === "target") {
      const st = this.targetState.get(claim.key);
      if (!st || st.dailyWindowStart !== claim.windowStart || st.dailyCount <= 0) return false;
      st.dailyCount -= 1;
      return true;
    }
    if (claim.scope === "platform") {
      if (this.platformWindowStart !== claim.windowStart || this.platformCount <= 0) return false;
      this.platformCount -= 1;
      return true;
    }
    const ipSt = this.ipCount.get(claim.key);
    if (!ipSt || ipSt.windowStart !== claim.windowStart || ipSt.count <= 0) return false;
    ipSt.count -= 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Prisma 实现：真实共享后端。表未就绪时诚实 503（不准本机 Map 降级）。
// 代码存于既有 smscode 表（code 列存哈希）；预算计数存于 verificationbudget 表
// （由 B2 按本批离线 SQL 部署；未部署前 admitSend 一律 not-ready → 503）。
// ---------------------------------------------------------------------------

interface BudgetRow {
  id: string;
  count: number;
  windowStart: number;
  lastSentAt: number;
  failCount: number;
  lockedUntil: number;
  version: number;
}

// 数据访问层注入：测试可注入实现相同接口的替身，以在隔离环境下运行真实生产算法。
let testBudgetModel: any = null;
let testSmsCodeModel: any = null;

export function getBudgetModel(): any {
  if (testBudgetModel !== null) return testBudgetModel;
  const m = (prisma as unknown as { verificationBudget?: any }).verificationBudget;
  if (!m) throw new Error("VerificationBudget model not available");
  return m;
}

export function getSmsCodeModel(): any {
  if (testSmsCodeModel !== null) return testSmsCodeModel;
  const m = (prisma as unknown as { smscode?: any }).smscode;
  if (!m) throw new Error("smscode model not available");
  return m;
}

let testClaimModel: any = null;

/** [U02] 发送认领模型访问（结构未部署时抛 NOT_READY 口径错误） */
export function getClaimModel(): any {
  if (testClaimModel !== null) return testClaimModel;
  const m = (prisma as unknown as { verificationSendClaim?: any }).verificationSendClaim;
  if (!m) throw new VerificationBackendUnavailableError("发送认领表未就绪");
  return m;
}

/** 测试注入：用替身模型运行真实生产算法（不连真实库）。生产代码不得调用。 */
export function __setVerificationModelsForTest(budget: any | null, smscode: any | null, claim?: any | null): void {
  testBudgetModel = budget;
  testSmsCodeModel = smscode;
  testClaimModel = claim ?? null;
}

/** 重置数据访问层为生产 prisma 客户端（测试清理用） */
export function __resetVerificationModels(): void {
  testBudgetModel = null;
  testSmsCodeModel = null;
  testClaimModel = null;
}

const CAS_RETRIES = 32;

export class PrismaVerificationBackend implements VerificationBackend {
  async ready(): Promise<boolean> {
    try {
      const b = testBudgetModel !== null ? testBudgetModel : (prisma as unknown as { verificationBudget?: any }).verificationBudget;
      const s = testSmsCodeModel !== null ? testSmsCodeModel : (prisma as unknown as { smscode?: any }).smscode;
      return !!b && !!s;
    } catch {
      return false;
    }
  }

  private async budgetRow(id: string): Promise<any | null> {
    // [U02 §2.1.3] 结构/服务故障与「锁记录不存在」严格区分：
    // 表未部署（P2021）等读取失败 → 抛 VerificationBackendUnavailableError（调用方 fail-closed），
    // 不再吞成 null 当"没有锁"继续放行。
    try {
      return await getBudgetModel().findUnique({ where: { id } });
    } catch (e: any) {
      if (String(e?.code) === "P2021" || String(e?.message || "").includes("does not exist")) {
        throw new VerificationBackendUnavailableError();
      }
      throw new VerificationBackendUnavailableError((e as Error)?.message);
    }
  }

  /** [U02 §2.1.2] 读取失败锁定事实（lookup/consume 同一口径）；失败按不可用抛出 */
  private async failLockedUntil(id: string, now: number): Promise<number> {
    const row = await this.budgetRow(id);
    return row && Number(row.lockedUntil) > now ? Number(row.lockedUntil) : 0;
  }

  /** 原子预约一次发送额度：检查失败锁定、60s 间隔、日窗口/日限；用 version CAS 防并发，失败回滚。 */
  private async reserveBudget(id: string, limit: number, now: number, enforceInterval: boolean): Promise<AdmitResult & { windowStart?: number }> {
    try {
      return await this.reserveBudgetInner(id, limit, now, enforceInterval);
    } catch (e: any) {
      // [U02 §2.1.3] 结构/服务不可用 → 稳定 503（不在发送前内存放行）
      if (e instanceof VerificationBackendUnavailableError) {
        return { ok: false, error: "发送预算服务不可用", status: 503 };
      }
      throw e;
    }
  }

  private async reserveBudgetInner(id: string, limit: number, now: number, enforceInterval: boolean): Promise<AdmitResult & { windowStart?: number }> {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const row = await this.budgetRow(id);
      if (!row) {
        // 冷启动：尝试「占有创建」，仅一笔请求真正创建并计数 1；其余因唯一约束冲突转入下方增量分支，
        // 杜绝「两笔同时读到不存在 → 都 upsert 且第二笔命中已有行却只 update:{} 放行」的漏计。
        try {
          await getBudgetModel().create({
            data: {
              id,
              count: 1,
              windowStart: now,
              lastSentAt: now,
              failCount: 0,
              lockedUntil: 0,
              version: 1,
            },
          });
          return { ok: true, windowStart: now };
        } catch (e: any) {
          if (String(e?.code) === "P2002") continue; // 他人已创建，重试读取后增量
          return { ok: false, error: "发送预算服务不可用", status: 503 };
        }
      }
      if (Number(row.lockedUntil) > now) {
        return { ok: false, error: "验证码错误次数过多，请稍后再试", status: 429 };
      }
      if (enforceInterval && row.lastSentAt != null && now - Number(row.lastSentAt) < VERIFY_POLICY.sendIntervalMs) {
        const waitSeconds = Math.ceil((VERIFY_POLICY.sendIntervalMs - (now - Number(row.lastSentAt))) / 1000);
        return { ok: false, error: `请${waitSeconds}秒后再试`, status: 429, waitSeconds };
      }
      const windowExpired = now - Number(row.windowStart) > VERIFY_POLICY.dailyWindowMs;
      if (windowExpired) {
        // 窗口已过期：原子重置为「本次新窗口第一次」，count=1，而非在旧 10 上 increment 成 11。
        try {
          await getBudgetModel().update({
            where: { id, version: Number(row.version) },
            data: { count: 1, windowStart: now, lastSentAt: now, version: { increment: 1 } },
          });
          return { ok: true, windowStart: now };
        } catch (e: any) {
          if (String(e?.code) === "P2025") continue; // version 冲突，重试
          return { ok: false, error: "发送预算服务不可用", status: 503 };
        }
      }
      if (Number(row.count) >= limit) {
        return { ok: false, error: "今日发送次数已达上限，请明日再试", status: 429 };
      }
      try {
        await getBudgetModel().update({
          where: { id, version: Number(row.version) },
          data: {
            count: { increment: 1 },
            lastSentAt: now,
            version: { increment: 1 },
          },
        });
        return { ok: true, windowStart: Number(row.windowStart) };
      } catch (e: any) {
        if (String(e?.code) === "P2025") continue; // version 冲突，重试
        return { ok: false, error: "发送预算服务不可用", status: 503 };
      }
    }
    return { ok: false, error: "发送预算服务繁忙，请稍后重试", status: 429 };
  }

  private async releaseBudget(id: string, expectedWindowStart?: number): Promise<void> {
    try {
      // [U02] 条件 decrement：count>0 且（提供窗口判据时）窗口仍为预约时窗口——
      // 旧窗口迟到回填不污染新窗口计数；无判据（旧调用）仅 count>0 防负。
      const where: any = { id, count: { gt: 0 } };
      if (expectedWindowStart !== undefined) where.windowStart = expectedWindowStart;
      await getBudgetModel().update({
        where,
        data: { count: { decrement: 1 } },
      });
    } catch {
      /* 未命中（已为 0 / 窗口已翻新 / 不存在）时不回滚 */
    }
  }

  async admitSend(args: AdmitArgs): Promise<AdmitResult> {
    const now = Date.now();
    const tgtId = `target:${args.channel}:${args.target}`;
    const platId = "platform";
    const ipId = args.ip ? `ip:${args.ip}` : null;

    const plat = await this.reserveBudget(platId, VERIFY_POLICY.platformLimit, now, false);
    if (!plat.ok) return plat;
    let ipReserved = false;
    let ipWindowStart = 0;
    if (ipId) {
      const ipRes = await this.reserveBudget(ipId, VERIFY_POLICY.ipLimit, now, false);
      if (!ipRes.ok) {
        await this.releaseBudget(platId);
        return ipRes;
      }
      ipReserved = true;
      ipWindowStart = ipRes.windowStart ?? 0;
    }
    const tgt = await this.reserveBudget(tgtId, VERIFY_POLICY.dailyLimit, now, true);
    if (!tgt.ok) {
      await this.releaseBudget(platId);
      if (ipReserved) await this.releaseBudget(ipId!);
      return tgt;
    }
    // [U02 §2.1.1] 发送预约身份绑定：为各维度持久化 PENDING 认领（含窗口起点），
    // failed 回填凭 sendId 幂等回退——重复回填 count=0 零效果、A 重复回填不动 B、
    // 跨窗口迟到回填标 OBSOLETE。认领写失败 → 释放本次占用并 503（无认领不发送）。
    const sendId = `vs_${randomBytes(12).toString("hex")}`;
    const claims: Array<{ scope: string; budgetKey: string; windowStart: number }> = [
      { scope: "target", budgetKey: tgtId, windowStart: tgt.windowStart! },
      { scope: "platform", budgetKey: platId, windowStart: plat.windowStart! },
    ];
    if (ipId && ipReserved) claims.push({ scope: "ip", budgetKey: ipId, windowStart: ipWindowStart });
    try {
      const claimModel = getClaimModel();
      for (const c of claims) {
        await claimModel.create({
          data: {
            id: `${sendId}:${c.scope}`,
            sendId,
            scope: c.scope,
            budgetKey: c.budgetKey,
            windowStart: c.windowStart,
          },
        });
      }
    } catch {
      await this.releaseBudget(tgtId);
      await this.releaseBudget(platId);
      if (ipReserved && ipId) await this.releaseBudget(ipId);
      return { ok: false, error: "发送预约服务不可用", status: 503 };
    }
    return { ok: true, sendId };
  }

  async issue(args: IssueArgs): Promise<AdmitResult> {
    try {
      // [U02 §2.1.6] 原子签发：旧码标用与新码创建在同一事务——中断不会出现"旧码已废而新码未建"的空窗。
      // 生产：真实库交互事务；测试替身：prisma.$transaction 不可用时按注入模型顺序执行（等价语义由替身保证）。
      const prismaAny = prisma as any;
      if (typeof prismaAny?.$transaction === "function" && !testSmsCodeModel) {
        await prismaAny.$transaction(async (tx: any) => {
          const m = tx.smscode ?? getSmsCodeModel();
          await m.updateMany({
            where: { phone: args.target, type: args.purpose, used: false },
            data: { used: true, usedAt: new Date() },
          });
          await m.create({
            data: {
              id: `vc_${randomBytes(12).toString("hex")}`,
              phone: args.target,
              code: args.codeHash,
              type: args.purpose,
              used: false,
            },
          });
        });
      } else {
        const m = getSmsCodeModel();
        await m.updateMany({
          where: { phone: args.target, type: args.purpose, used: false },
          data: { used: true, usedAt: new Date() },
        });
        await m.create({
          data: {
            id: `vc_${randomBytes(12).toString("hex")}`,
            phone: args.target,
            code: args.codeHash,
            type: args.purpose,
            used: false,
          },
        });
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "验证服务不可用", status: 503 };
    }
  }

  async lookup(args: AdmitArgs): Promise<VerifyRecord | null> {
    // 失败锁定先于核验：锁定期间任何码都不可验证（挡住「5 次失败后正确码仍 valid」）。
    // [U02 §2.1.3] 锁服务读取失败 → 抛 VerificationBackendUnavailableError（fail-closed），
    // 不再吞成 null 当"没有锁"继续放行。
    const lockedUntil = await this.failLockedUntil(`target:${args.channel}:${args.target}`, Date.now());
    if (lockedUntil > 0) return null;
    const row = await getSmsCodeModel().findFirst({
      where: { phone: args.target, type: args.purpose, used: false },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    const created = (row as any).createdAt?.getTime?.() ?? Date.now();
    if (created + VERIFY_POLICY.codeExpiryMs <= Date.now()) return null;
    return {
      codeHash: (row as any).code,
      expiresAt: created + VERIFY_POLICY.codeExpiryMs,
      used: false,
      usedAt: null,
      failCount: 0,
      lockedUntil: 0,
      challengeId: deriveChallengeId((row as any).code),
    };
  }

  async recordFailure(args: AdmitArgs): Promise<void> {
    const id = `target:${args.channel}:${args.target}`;
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      let row: any = null;
      try {
        row = await this.budgetRow(id);
      } catch {
        // [U02 §2.1.3] 结构/服务不可用：失败计数无法持久（锁定保护失效风险），记录诊断日志。
        // 不阻断本次「验证码错误」的拒绝结果；服务恢复后再次失败会重新累计。
        console.error("[verification] 失败计数写入不可用（锁定保护暂时失效）:", id);
        return;
      }
      if (!row) {
        // [U02 §2.1.4] 首次创建并发安全：create + P2002 重试读改（不再 upsert update={} 丢增量）
        try {
          await getBudgetModel().create({
            data: {
              id,
              count: 0,
              windowStart: Date.now(),
              lastSentAt: 0,
              failCount: 1,
              lockedUntil: 0,
              version: 1,
            },
          });
          return;
        } catch (e: any) {
          if (String(e?.code) === "P2002") continue;
          console.error("[verification] 失败计数创建失败:", (e as Error)?.message);
          return;
        }
      }
      const newFail = Number(row.failCount) + 1;
      const lockedUntil =
        newFail >= VERIFY_POLICY.failLimit ? Date.now() + VERIFY_POLICY.failLockMs : Number(row.lockedUntil);
      try {
        await getBudgetModel().update({
          where: { id, version: Number(row.version) },
          data: { failCount: newFail, lockedUntil, version: { increment: 1 } },
        });
        return;
      } catch (e: any) {
        if (String(e?.code) === "P2025") continue;
        console.error("[verification] 失败计数更新失败:", (e as Error)?.message);
        return;
      }
    }
  }

  async consume(args: AdmitArgs): Promise<AdmitResult> {
    try {
      // [U02 §2.1.2] 消费端与 lookup 使用同一失败锁定事实：
      // 已锁定的 challenge 即使持有效 token/凭证也不得越过锁消费敏感效果。
      const lockedUntil = await this.failLockedUntil(`target:${args.channel}:${args.target}`, Date.now());
      if (lockedUntil > 0) {
        return { ok: false, error: "验证码错误次数过多，请稍后再试", status: 429 };
      }
      // 先定位未用码并核对过期，过期则标记清理并拒绝（挡住「过期码仍可消费」）
      const row = await getSmsCodeModel().findFirst({
        where: { phone: args.target, type: args.purpose, used: false },
        orderBy: { createdAt: "desc" },
      });
      if (!row) {
        const any = await getSmsCodeModel().findFirst({ where: { phone: args.target, type: args.purpose } });
        if (any && (any as any).used) return { ok: false, error: "验证码已使用", status: 400 };
        return { ok: false, error: "请先获取验证码", status: 400 };
      }
      const created = (row as any).createdAt?.getTime?.() ?? Date.now();
      if (created + VERIFY_POLICY.codeExpiryMs <= Date.now()) {
        await getSmsCodeModel().updateMany({
          where: { phone: args.target, type: args.purpose, used: false },
          data: { used: true, usedAt: new Date() },
        });
        return { ok: false, error: "验证码已过期", status: 400 };
      }
      // [U02] challenge 身份绑定：仅当当前未用码正是签发凭证时那一枚才允许消费；
      // 条件带 code（存储哈希），使「比对 + 标记」落在同一条原子条件更新里，并发只有一个赢家。
      const consumeWhere: any = { phone: args.target, type: args.purpose, used: false };
      if (args.challengeId) {
        if (deriveChallengeId((row as any).code) !== args.challengeId) {
          return { ok: false, error: "凭证与当前验证码不匹配，请重新获取验证码", status: 400 };
        }
        consumeWhere.code = (row as any).code;
      }
      const res = await getSmsCodeModel().updateMany({
        where: consumeWhere,
        data: { used: true, usedAt: new Date() },
      });
      if ((res as any).count === 0) {
        return { ok: false, error: "验证码已使用", status: 400 };
      }
      return { ok: true };
    } catch (e: any) {
      // [U02 §2.1.3] 结构/服务不可用 → fail-closed 503，绝不在敏感消费端内存放行
      if (e instanceof VerificationBackendUnavailableError) {
        return { ok: false, error: "验证服务暂不可用，请稍后重试", status: 503 };
      }
      return { ok: false, error: "验证服务不可用", status: 503 };
    }
  }

  async delete(args: AdmitArgs): Promise<void> {
    try {
      await getSmsCodeModel().updateMany({
        where: { phone: args.target, type: args.purpose, used: false },
        data: { used: true, usedAt: new Date() },
      });
    } catch {
      /* not-ready: 忽略 */
    }
  }

  async onSendResult(args: AdmitArgs, outcome: SendOutcome, sendId?: string): Promise<void> {
    if (sendId) {
      // [U02 §2.1.1] 按预约身份幂等回退：每维度认领 PENDING→(REFUNDED|SETTLED|OBSOLETE) 只转一次
      let claims: Array<{ id: string; scope: string; budgetKey: string; windowStart: any; status: string }> = [];
      try {
        claims = await getClaimModel().findMany({ where: { sendId } });
      } catch {
        // 认领不可读（结构未部署等）：无可回退依据 → 不做无绑定返还，记录诊断
        console.error("[verification] 发送认领不可读，跳过回退（sendId=", sendId, "）");
        return;
      }
      for (const c of claims) {
        if (c.status !== "PENDING") continue; // 重复回填/已终态 → 零效果
        if (outcome === "failed") {
          const claimedWindow = Number(c.windowStart ?? 0);
          const res = await getClaimModel().updateMany({
            where: { id: c.id, status: "PENDING" },
            data: { status: "REFUNDED" },
          });
          if ((res as any).count === 1) {
            // 仅当预算仍处预约时窗口才真正返还；窗口已翻新 → 标 OBSOLETE
            const row = await this.budgetRow(c.budgetKey).catch(() => null);
            if (row && Number(row.windowStart) === claimedWindow) {
              await this.releaseBudget(c.budgetKey, claimedWindow);
            } else {
              await getClaimModel().updateMany({
                where: { id: c.id, status: "REFUNDED" },
                data: { status: "OBSOLETE" },
              });
            }
          }
        } else if (outcome === "accepted") {
          await getClaimModel().updateMany({
            where: { id: c.id, status: "PENDING" },
            data: { status: "SETTLED" },
          });
        }
        // unknown：保持 PENDING（不返还也不终态）
      }
      return;
    }
    if (outcome === "failed") {
      // 旧调用（无 sendId）：保持旧语义
      await this.releaseBudget(`target:${args.channel}:${args.target}`);
      await this.releaseBudget("platform");
      if (args.ip) await this.releaseBudget(`ip:${args.ip}`);
    }
    // unknown/accepted 不返还（防盲目重发）
  }
}

// ---------------------------------------------------------------------------
// 后端获取与测试注入
// ---------------------------------------------------------------------------

let injected: VerificationBackend | null = null;
let productionBackend: VerificationBackend | null = null;

export function getVerificationBackend(): VerificationBackend {
  if (injected) return injected;
  if (!productionBackend) productionBackend = new PrismaVerificationBackend();
  return productionBackend;
}

/** 测试注入：替换为内存后端（或自定义实现），模拟共享算法。生产代码不得调用。 */
export function __setVerificationBackendForTest(backend: VerificationBackend | null): void {
  injected = backend;
}

/** 重置为生产后端（测试清理用） */
export function __resetVerificationBackend(): void {
  injected = null;
}
