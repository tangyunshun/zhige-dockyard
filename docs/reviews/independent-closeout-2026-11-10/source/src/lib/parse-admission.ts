/**
 * [R0-K / 原 F14 K03] 解析专用跨实例共享原子准入与租约。
 *
 * 仅使用 MySQL/Prisma 的解析专用表 parselease / parseadmissioncounter；
 * 不挪用退款、计费或模型注册表锁，不把任何数据库事务持有整个慢解析期间
 * （事务只覆盖毫秒级准入认领/释放，慢解析在隔离 worker 中进行）。
 * 平台与用户额度用单条条件 UPDATE 原子认领，两个独立实例不能各自获得整份额度。
 * 缺 delegate / 缺表 / 缺列 / 后端不可用 → 稳定 503 未就绪，任何重解析前拒绝；
 * 绝不静默回退为本机 Map 无限放行，业务请求中不建表/迁移。
 */
import { prisma } from "./prisma";
import {
  PARSE_CODES,
  PARSE_LIMITS,
  ParseResourceError,
  newParseIdentity,
} from "./parse-policy";

export type ParseLease = {
  leaseId: string;
  claimToken: string;
  instanceId: string;
  userId: string;
  workUnits: number;
};

export type AcquireInput = {
  userId: string;
  workUnits: number;
  now: number;
  /** 服务端裁决的覆写值只允许离线测试注入小预算；生产忽略客户端输入 */
  limits?: { platformMaxConcurrent?: number; platformMaxWorkUnits?: number; userMaxConcurrent?: number; userMaxPerMinute?: number };
};

export type AcquireOutcome = "granted" | "busy" | "rate_limited";

/** 有条件求值的隔离后端接口；生产为 Prisma/MySQL，测试为共享内存后端 */
export interface ParseAdmissionBackend {
  acquire(input: AcquireInput & { lease: ParseLease }): Promise<AcquireOutcome>;
  release(lease: ParseLease): Promise<boolean>;
  quarantine(lease: ParseLease, note: string): Promise<void>;
  /** 租约是否仍由持有者有效持有（ACTIVE 且未过期、claimToken 匹配）；用于启动 worker 前二次核验所有权 */
  isLeaseActive(lease: ParseLease): Promise<boolean>;
  sweep(now: number): Promise<number>;
}

let backendOverride: ParseAdmissionBackend | null = null;
/** 仅用于离线隔离测试：注入共享后端（两个实例指向同一后端） */
export function __setParseAdmissionBackendForTest(backend: ParseAdmissionBackend | null): void {
  backendOverride = backend;
}

function isSchemaError(e: any): boolean {
  const code = String(e?.code || "");
  const msg = String(e?.message || "");
  return code === "P2021" || code === "P2022" || code === "P2010" ||
    msg.includes("does not exist") || msg.includes("Unknown column") || msg.includes("doesn't exist");
}

function notReady(e: unknown): ParseResourceError {
  void e;
  return new ParseResourceError(PARSE_CODES.ADMISSION_NOT_READY);
}

/** 生产后端：短事务内两条原子条件 UPDATE + 唯一租约插入；检查与认领原子完成 */
export function createPrismaBackend(): ParseAdmissionBackend {
  const models = (client: any) => {
    const counter = client?.parseadmissioncounter;
    const lease = client?.parselease;
    if (!counter || !lease || typeof counter.updateMany !== "function" || typeof lease.create !== "function") {
      throw notReady(null);
    }
    return { counter, lease };
  };

  return {
    async acquire(input) {
      const { lease: ident } = input;
      const l = input.limits ?? {};
      const platformMax = l.platformMaxConcurrent ?? PARSE_LIMITS.PLATFORM_MAX_CONCURRENT;
      const workMax = l.platformMaxWorkUnits ?? PARSE_LIMITS.PLATFORM_MAX_WORK_UNITS;
      const userMax = l.userMaxConcurrent ?? PARSE_LIMITS.USER_MAX_CONCURRENT;
      const rateMax = l.userMaxPerMinute ?? PARSE_LIMITS.USER_MAX_PER_MINUTE;
      const nowDate = new Date(input.now);
      const windowStart = new Date(input.now - PARSE_LIMITS.RATE_WINDOW_MS);
      const userKey = `user:${input.userId}`;
      let client: any;
      try {
        client = prisma as any;
        const { counter, lease } = models(client);
        return await client.$transaction(async (tx: any) => {
          const m = models(tx);
          // 幂等建立计数行（不是建表；并发冲突忽略）
          for (const id of ["platform", userKey]) {
            try { await m.counter.create({ data: { id, active: 0, workUnits: 0, requests: 0, windowStart: nowDate, updatedAt: nowDate } }); }
            catch (e: any) { if (String(e?.code) !== "P2002" && isSchemaError(e)) throw notReady(e); }
          }
          // 平台：单条条件 UPDATE 原子认领并发与工作预算
          const platform = await m.counter.updateMany({
            where: { id: "platform", active: { lt: platformMax }, workUnits: { lte: workMax - ident.workUnits } },
            data: { active: { increment: 1 }, workUnits: { increment: ident.workUnits }, updatedAt: nowDate },
          });
          if (platform.count !== 1) throw new ParseResourceError(PARSE_CODES.BUSY);

          // 用户：窗口过期先重置（条件 UPDATE），再原子认领并发 + 频次
          await m.counter.updateMany({
            where: { id: userKey, windowStart: { lt: windowStart } },
            data: { requests: 0, windowStart: nowDate, updatedAt: nowDate },
          });
          const user = await m.counter.updateMany({
            where: { id: userKey, active: { lt: userMax }, requests: { lt: rateMax } },
            data: { active: { increment: 1 }, requests: { increment: 1 }, updatedAt: nowDate },
          });
          if (user.count !== 1) {
            const current = await m.counter.findUnique({ where: { id: userKey } });
            if (current && current.requests >= rateMax) throw new ParseResourceError(PARSE_CODES.RATE_LIMITED);
            throw new ParseResourceError(PARSE_CODES.BUSY);
          }
          try {
            await m.lease.create({
              data: {
                leaseId: ident.leaseId, claimToken: ident.claimToken, userId: input.userId,
                instanceId: ident.instanceId, status: "ACTIVE", workUnits: ident.workUnits,
                leaseUntil: new Date(input.now + PARSE_LIMITS.LEASE_TTL_MS),
                createdAt: nowDate, updatedAt: nowDate,
              },
            });
          } catch (e: any) {
            if (isSchemaError(e)) throw notReady(e);
            throw new ParseResourceError(PARSE_CODES.BUSY);
          }
          void counter; void lease;
          return "granted" as AcquireOutcome;
        });
      } catch (e) {
        if (e instanceof ParseResourceError) throw e;
        if (isSchemaError(e)) throw notReady(e);
        throw notReady(e);
      }
    },
    async release(ident) {
      try {
        const client: any = prisma as any;
        const { lease } = models(client);
        return await client.$transaction(async (tx: any) => {
          const m = models(tx);
          // [KR2] 读取持久化租约事实：只归还 DB 中真实记录的权重与用户，不信任调用方传入值；
          // 内部对象被改变也不能改变应归还量。重复/迟到/旧执行者（claimToken 不匹配）不会命中。
          const foundRow: any = await m.lease.findUnique({
            where: { leaseId: ident.leaseId },
            select: { status: true, claimToken: true, userId: true, workUnits: true },
          });
          if (!foundRow || (foundRow.status !== "ACTIVE" && foundRow.status !== "QUARANTINED") || foundRow.claimToken !== ident.claimToken) {
            return false;
          }
          const persistedUnits = foundRow.workUnits;
          const persistedUser = foundRow.userId;
          // 先标记终态，再完整归还权重；任一步计数更新未命中（count!==1）则事务整体回滚，
          // 不提交虚假 RELEASED 终态、不钳 0 掩盖不一致（保守保留，由有界恢复重试）。
          const upd = await m.lease.updateMany({
            where: { leaseId: ident.leaseId, claimToken: ident.claimToken, status: { in: ["ACTIVE", "QUARANTINED"] } },
            data: { status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() },
          });
          if (upd.count !== 1) return false;
          const platform = await m.counter.updateMany({
            where: { id: "platform", workUnits: { gte: persistedUnits }, active: { gt: 0 } },
            data: { active: { decrement: 1 }, workUnits: { decrement: persistedUnits } },
          });
          if (platform.count !== 1) throw new Error("PLATFORM_RECLAIM_MISSED");
          const user = await m.counter.updateMany({
            where: { id: `user:${persistedUser}`, active: { gt: 0 } },
            data: { active: { decrement: 1 } },
          });
          if (user.count !== 1) throw new Error("USER_RECLAIM_MISSED");
          return true;
        });
      } catch (e) {
        if (isSchemaError(e)) throw notReady(e);
        return false; // 释放提交失败：保守保留，由有界恢复处理
      }
    },
    async isLeaseActive(ident) {
      try {
        const { lease } = models(prisma as any);
        const row: any = await lease.findUnique({
          where: { leaseId: ident.leaseId },
          select: { status: true, claimToken: true, leaseUntil: true },
        });
        if (!row || row.status !== "ACTIVE" || row.claimToken !== ident.claimToken) return false;
        return row.leaseUntil.getTime() > Date.now();
      } catch {
        return false; // 校验失败保守视为不可用，由准入在 worker 启动前拒绝
      }
    },
    async quarantine(ident, note) {
      try {
        const { lease } = models(prisma as any);
        await lease.updateMany({
          where: { leaseId: ident.leaseId, claimToken: ident.claimToken, status: "ACTIVE" },
          data: { status: "QUARANTINED", note: note.slice(0, 240) },
        });
      } catch { /* 隔离失败由有界恢复兜底，不盲目腾槽 */ }
    },
    async sweep(now) {
      try {
        const client: any = prisma as any;
        const { lease } = models(client);
        const cutoff = new Date(now - PARSE_LIMITS.LEASE_SWEEP_GRACE_MS);
        // 有界：仅处理超过宽限期的过期租约；租约过期不等于物理工作已停止，故必须超宽限
        const expired: any[] = await lease.findMany({
          where: { status: "ACTIVE", leaseUntil: { lt: cutoff } },
          take: PARSE_LIMITS.LEASE_SWEEP_BATCH,
          select: { leaseId: true, userId: true, workUnits: true },
        });
        let recovered = 0;
        // [F14 §7.1] 无停止证据不得腾槽：已启动 ACTIVE 过租约 TTL 只转 QUARANTINED（诊断保留，计数不动），
        // 时间仅触发核验/诊断；真正的退出证据由 runner 的 exit 事件驱动（onWorkerExited → claimToken CAS 归还）。
        for (const row of expired) {
          const q = await client.$transaction(async (tx: any) => {
            const t = models(tx);
            const upd = await t.lease.updateMany({
              where: { leaseId: row.leaseId, status: "ACTIVE" },
              data: { status: "QUARANTINED", note: "LEASE_TTL_EXCEEDED_AWAITING_STOP_EVIDENCE", updatedAt: new Date() },
            });
            return upd.count === 1;
          });
          if (q) recovered++;
        }
        // [F14 §7.1/§7.2] 隔离回收必须凭退出证据（EXIT_CONFIRMED 标记，由退出确认路径写入 note）：
        // 无停止证据的 QUARANTINED 仅凭 createdAt 时限不腾槽（保留诊断，由管理员带证据恢复）；
        // 有证据且超过安全时限的按 CAS + 计数命中守恒回收，任一计数未命中整笔回滚可重试。
        const quarantineCutoff = new Date(now - (PARSE_LIMITS.LEASE_TTL_MS + PARSE_LIMITS.LEASE_SWEEP_GRACE_MS));
        const quarantined: any[] = await lease.findMany({
          where: { status: "QUARANTINED", note: { startsWith: "EXIT_CONFIRMED:" }, createdAt: { lt: quarantineCutoff } },
          take: PARSE_LIMITS.LEASE_SWEEP_BATCH,
          select: { leaseId: true, userId: true, workUnits: true, claimToken: true },
        });
        for (const row of quarantined) {
          const done = await client.$transaction(async (tx: any) => {
            const t = models(tx);
            const upd = await t.lease.updateMany({
              where: { leaseId: row.leaseId, claimToken: row.claimToken, status: "QUARANTINED" },
              data: { status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() },
            });
            if (upd.count !== 1) return false;
            const p = await t.counter.updateMany({
              where: { id: "platform", workUnits: { gte: row.workUnits }, active: { gt: 0 } },
              data: { active: { decrement: 1 }, workUnits: { decrement: row.workUnits } },
            });
            if (p.count !== 1) throw new Error("PLATFORM_RECLAIM_MISSED");
            const u = await t.counter.updateMany({
              where: { id: `user:${row.userId}`, active: { gt: 0 } },
              data: { active: { decrement: 1 } },
            });
            if (u.count !== 1) throw new Error("USER_RECLAIM_MISSED");
            return true;
          });
          if (done) recovered++;
        }
        // 状态记录有界：清理已终结的旧记录，避免永久累积造成新的无上限成本
        const old = await lease.deleteMany({
          where: { status: { in: ["RELEASED", "EXPIRED"] }, createdAt: { lt: new Date(now - PARSE_LIMITS.RATE_WINDOW_MS * 2) } },
        });
        return recovered + (old?.count ?? 0);
      } catch (e) {
        if (isSchemaError(e)) throw notReady(e);
        return 0;
      }
    },
  };
}

let defaultBackend: ParseAdmissionBackend | null = null;
function backend(): ParseAdmissionBackend {
  if (backendOverride) return backendOverride;
  if (!defaultBackend) defaultBackend = createPrismaBackend();
  return defaultBackend;
}

/** 认领：认证之后、worker 启动之前调用。任何失败都不允许继续重解析 */
export async function acquireParseLease(input: AcquireInput): Promise<ParseLease> {
  const lease: ParseLease = { ...newParseIdentity(), userId: input.userId, workUnits: input.workUnits };
  let outcome: AcquireOutcome;
  try {
    outcome = await backend().acquire({ ...input, lease });
  } catch (e) {
    if (e instanceof ParseResourceError) throw e;
    // 缺 delegate / 缺表 / 缺列 / 后端不可用：稳定 503，绝不静默回退本机 Map
    throw notReady(e);
  }
  if (outcome === "rate_limited") throw new ParseResourceError(PARSE_CODES.RATE_LIMITED);
  if (outcome !== "granted") throw new ParseResourceError(PARSE_CODES.BUSY);
  return lease;
}

/**
 * 释放：只由持有者按 claimToken 归还一次。重复释放 / 迟到释放 / 旧执行者释放新租约
 * 都会因条件不匹配返回 false，不重复归还、不影响新租约。
 */
export async function releaseParseLease(lease: ParseLease): Promise<boolean> {
  return backend().release(lease);
}

/** 退出确认失败：保守隔离占用，可诊断，不盲目腾槽 */
export async function quarantineParseLease(lease: ParseLease, note: string): Promise<void> {
  await backend().quarantine(lease, note);
}

/** 有界恢复：进程崩溃/重启/租约中断后有限回收，不永久卡槽 */
export async function sweepParseLeases(now = Date.now()): Promise<number> {
  return backend().sweep(now);
}

/** worker 启动前二次核验：租约仍由持有者有效持有（ACTIVE 且未过期、claimToken 匹配） */
export async function isParseLeaseActive(lease: ParseLease): Promise<boolean> {
  return backend().isLeaseActive(lease);
}
