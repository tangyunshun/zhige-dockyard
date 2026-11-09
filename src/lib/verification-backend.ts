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
  /** 发送结果回填：failed 返还额度；unknown 不返还（防盲目重发）；accepted 不动。 */
  onSendResult(args: AdmitArgs, outcome: SendOutcome): Promise<void>;
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
      return { ok: true };
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

  onSendResult(args: AdmitArgs, outcome: SendOutcome): Promise<void> {
    if (outcome === "failed") {
      // 返还额度（仅本次发送占用的目标日限/平台/IP）
      return this.run(async () => {
        const now = Date.now();
        const k = `${args.channel}:${args.target}`;
        const st = this.targetState.get(k);
        if (st && st.dailyCount > 0) st.dailyCount -= 1;
        if (this.platformCount > 0) this.platformCount -= 1;
        const ip = args.ip;
        if (ip) {
          const ipSt = this.ipCount.get(ip);
          if (ipSt && ipSt.count > 0) ipSt.count -= 1;
        }
        void now;
      });
    }
    // unknown / accepted：不返还（unknown 防盲目重发）
    return Promise.resolve();
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

/** 测试注入：用替身模型运行真实生产算法（不连真实库）。生产代码不得调用。 */
export function __setVerificationModelsForTest(budget: any | null, smscode: any | null): void {
  testBudgetModel = budget;
  testSmsCodeModel = smscode;
}

/** 重置数据访问层为生产 prisma 客户端（测试清理用） */
export function __resetVerificationModels(): void {
  testBudgetModel = null;
  testSmsCodeModel = null;
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
    try {
      return await getBudgetModel().findUnique({ where: { id } });
    } catch {
      return null;
    }
  }

  /** 原子预约一次发送额度：检查失败锁定、60s 间隔、日窗口/日限；用 version CAS 防并发，失败回滚。 */
  private async reserveBudget(id: string, limit: number, now: number, enforceInterval: boolean): Promise<AdmitResult> {
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
          return { ok: true };
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
          return { ok: true };
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
        return { ok: true };
      } catch (e: any) {
        if (String(e?.code) === "P2025") continue; // version 冲突，重试
        return { ok: false, error: "发送预算服务不可用", status: 503 };
      }
    }
    return { ok: false, error: "发送预算服务繁忙，请稍后重试", status: 429 };
  }

  private async releaseBudget(id: string): Promise<void> {
    try {
      // 条件 decrement：仅当 count>0 才减，杜绝重复回填/退款把计数打到负数；不无条件 decrement。
      await getBudgetModel().update({
        where: { id, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      });
    } catch {
      /* 未命中（已为 0 或不存在）时不回滚；下一日窗口自愈 */
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
    if (ipId) {
      const ipRes = await this.reserveBudget(ipId, VERIFY_POLICY.ipLimit, now, false);
      if (!ipRes.ok) {
        await this.releaseBudget(platId);
        return ipRes;
      }
      ipReserved = true;
    }
    const tgt = await this.reserveBudget(tgtId, VERIFY_POLICY.dailyLimit, now, true);
    if (!tgt.ok) {
      await this.releaseBudget(platId);
      if (ipReserved) await this.releaseBudget(ipId!);
      return tgt;
    }
    return { ok: true };
  }

  async issue(args: IssueArgs): Promise<AdmitResult> {
    try {
      // 取代旧有效码：先标记旧码 used
      await getSmsCodeModel().updateMany({
        where: { phone: args.target, type: args.purpose, used: false },
        data: { used: true, usedAt: new Date() },
      });
      await getSmsCodeModel().create({
        data: {
          id: `vc_${randomBytes(12).toString("hex")}`,
          phone: args.target,
          code: args.codeHash,
          type: args.purpose,
          used: false,
        },
      });
      return { ok: true };
    } catch {
      return { ok: false, error: "验证服务不可用", status: 503 };
    }
  }

  async lookup(args: AdmitArgs): Promise<VerifyRecord | null> {
    try {
      // 失败锁定先于核验：锁定期间任何码都不可验证（挡住「5 次失败后正确码仍 valid」）
      const bRow = await this.budgetRow(`target:${args.channel}:${args.target}`);
      if (bRow && Number(bRow.lockedUntil) > Date.now()) return null;
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
    } catch {
      return null;
    }
  }

  async recordFailure(args: AdmitArgs): Promise<void> {
    const id = `target:${args.channel}:${args.target}`;
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const row = await this.budgetRow(id);
      if (!row) {
        try {
          await getBudgetModel().upsert({
            where: { id },
            create: {
              id,
              count: 0,
              windowStart: Date.now(),
              lastSentAt: 0,
              failCount: 1,
              lockedUntil: 0,
              version: 1,
            },
            update: {},
          });
          return;
        } catch (e: any) {
          if (String(e?.code) === "P2002") continue;
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
        return;
      }
    }
  }

  async consume(args: AdmitArgs): Promise<AdmitResult> {
    try {
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
    } catch {
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

  async onSendResult(args: AdmitArgs, outcome: SendOutcome): Promise<void> {
    if (outcome === "failed") {
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
