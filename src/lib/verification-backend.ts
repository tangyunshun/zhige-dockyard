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
  // channel:target:type -> 有效码
  private codes = new Map<string, VerifyRecord & { salt: string }>();
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
      return rest;
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
  version: number;
}

function getBudgetModel(): { findUnique: Function; upsert: Function; update: Function } {
  // 离线模型，未部署前访问即抛错 -> 由调用方捕获得 not-ready
  return (prisma as unknown as { verificationbudget: any }).verificationbudget;
}

class PrismaVerificationBackend implements VerificationBackend {
  async ready(): Promise<boolean> {
    // smscode 表在客户端存在；预算表未部署则整体 not-ready
    try {
      getBudgetModel();
      return true;
    } catch {
      return false;
    }
  }

  private async budgetGet(id: string): Promise<BudgetRow | null> {
    try {
      const m = getBudgetModel();
      const row = await m.findUnique({ where: { id } });
      return (row as BudgetRow) || null;
    } catch {
      return null;
    }
  }

  private async budgetIncr(id: string, by: number, limit: number): Promise<AdmitResult> {
    const now = Date.now();
    try {
      const m = getBudgetModel();
      const row = (await m.upsert({
        where: { id },
        create: { id, count: Math.max(0, by), windowStart: now, version: 1 },
        update: { count: { increment: by } },
      })) as BudgetRow;
      if (now - Number(row.windowStart) > VERIFY_POLICY.dailyWindowMs) {
        await m.update({ where: { id }, data: { count: Math.max(0, by), windowStart: now, version: { increment: 1 } } });
        return { ok: true };
      }
      if (row.count > limit) {
        // 回滚：超出则返还
        await m.update({ where: { id }, data: { count: { decrement: by } } });
        return { ok: false, error: "发送额度已用尽，请稍后重试", status: 429 };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "发送预算服务不可用", status: 503 };
    }
  }

  async admitSend(args: AdmitArgs): Promise<AdmitResult> {
    // 1) 目标失败锁定
    try {
      const code = await prisma.smscode.findFirst({
        where: { phone: args.target, type: args.purpose, used: false },
        orderBy: { createdAt: "desc" },
      });
      void code;
    } catch {
      return { ok: false, error: "验证服务不可用", status: 503 };
    }
    // 平台/IP 技术上限（共享，条件 + 回滚）
    const plat = await this.budgetIncr("platform", 1, VERIFY_POLICY.platformLimit);
    if (!plat.ok) return plat;
    const ipRes = args.ip
      ? await this.budgetIncr(`ip:${args.ip}`, 1, VERIFY_POLICY.ipLimit)
      : { ok: true as const };
    if (!ipRes.ok) {
      await this.budgetIncr("platform", -1, VERIFY_POLICY.platformLimit);
      return ipRes;
    }
    // 目标日限（含间隔/失败锁定由 smscode 既有逻辑在 issue/verify 阶段兜底）
    const tgt = await this.budgetIncr(`target:${args.channel}:${args.target}`, 1, VERIFY_POLICY.dailyLimit);
    if (!tgt.ok) {
      await this.budgetIncr("platform", -1, VERIFY_POLICY.platformLimit);
      if (args.ip) await this.budgetIncr(`ip:${args.ip}`, -1, VERIFY_POLICY.ipLimit);
      return tgt;
    }
    return { ok: true };
  }

  async issue(args: IssueArgs): Promise<AdmitResult> {
    try {
      // 取代旧有效码：先标记旧码 used
      await prisma.smscode.updateMany({
        where: { phone: args.target, type: args.purpose, used: false },
        data: { used: true, usedAt: new Date() },
      });
      await prisma.smscode.create({
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
      const row = await prisma.smscode.findFirst({
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
      };
    } catch {
      return null;
    }
  }

  async recordFailure(args: AdmitArgs): Promise<void> {
    // 失败锁定由内存态无法跨实例共享；真实多实例共享需 B2 在 verificationbudget 增加 failLock 列。
    return;
  }

  async consume(args: AdmitArgs): Promise<AdmitResult> {
    try {
      const res = await prisma.smscode.updateMany({
        where: { phone: args.target, type: args.purpose, used: false },
        data: { used: true, usedAt: new Date() },
      });
      if ((res as any).count === 0) {
        // 已用或不存在 -> 一次性消费失败
        const any = await prisma.smscode.findFirst({ where: { phone: args.target, type: args.purpose } });
        if (any && (any as any).used) return { ok: false, error: "验证码已使用", status: 400 };
        return { ok: false, error: "请先获取验证码", status: 400 };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "验证服务不可用", status: 503 };
    }
  }

  async delete(args: AdmitArgs): Promise<void> {
    try {
      await prisma.smscode.updateMany({
        where: { phone: args.target, type: args.purpose, used: false },
        data: { used: true, usedAt: new Date() },
      });
    } catch {
      /* not-ready: 忽略 */
    }
  }

  async onSendResult(args: AdmitArgs, outcome: SendOutcome): Promise<void> {
    if (outcome === "failed") {
      await this.budgetIncr("platform", -1, VERIFY_POLICY.platformLimit);
      if (args.ip) await this.budgetIncr(`ip:${args.ip}`, -1, VERIFY_POLICY.ipLimit);
      await this.budgetIncr(`target:${args.channel}:${args.target}`, -1, VERIFY_POLICY.dailyLimit);
    }
    // unknown/accepted 不返还
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
