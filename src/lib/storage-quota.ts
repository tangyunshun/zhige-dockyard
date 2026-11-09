import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * 空间文件存储配额（真实记账，原子占用闭环）——原方案 F13 / R0-J → R0-J1 → R0-J2。
 *
 * 统计口径：知识库/资料上传的真实物理文件（document.fileSize = 服务端收到的实际字节），
 * 物理载体为服务器本地磁盘 uploads/assets/{workspaceId}/ 或 S3 私有桶。
 * 配额数据落在 workspacequota.storageUsed / storageLimit（单位：字节，BigInt）。
 *
 * [R0-J S01] 配额语义（不得默认无限）：
 *  - 配额行缺失 / limit=0 / limit 非法（< -1）/ usage 非法（负数）→ 新增物理文件前明确拒绝（稳定 code）；
 *  - limit = 0：不允许新增正字节文件；
 *  - limit = -1：唯一表示不限（服务端既有事实），仍如实记录真实占用；
 *  - 判定与增减全程 BigInt，不接受 number 精度绕过；
 *  - JSON 文本兼容上传没有物理文件 → 不计入物理占用，也不按客户端伪造 fileSize 入账。
 *
 * [R0-J S02 + R0-J1/R0-J2 J-UPLOAD/J-WRITE-BOUND] 原子占用与写边界：
 *  - 预留 = 数据库级条件 UPDATE（核验+预留同一语句），不依赖进程内锁或先读后无条件累加；
 *  - [-1 不限] 分支同样在写边界核验（WHERE storageLimit = -1 AND storageUsed >= 0），
 *    限额收紧或用量变负后不再按旧快照放行；
 *  - 预留与操作记录在同一事务提交（原子），P2002 唯一冲突 → 幂等去重并按最新事实分类；
 *  - opId 去重核验空间/操作者/字节/状态，不只是 opId 字符串匹配；
 *  - userId 来自服务端身份，不写空字符串。
 *
 * [R0-J1/R0-J2 J-RELEASE] 释放与文档删除在事务中原子绑定；物理删除先核验，释放失败不假报成功；
 * 历史漂移（used < bytes）保留差异并阻断危险释放（不自动清零）；共享引用仍存在时不释放底层文件。
 */

export const STORAGE_QUOTA_CODES = {
  NOT_READY: "STORAGE_QUOTA_NOT_READY",
  LIMIT_ZERO: "STORAGE_LIMIT_ZERO",
  LIMIT_INVALID: "STORAGE_LIMIT_INVALID",
  USAGE_INVALID: "STORAGE_USAGE_INVALID",
  EXCEEDED: "STORAGE_QUOTA_EXCEEDED",
  BYTES_INVALID: "STORAGE_BYTES_INVALID",
  OP_CONFLICT: "STORAGE_OP_CONFLICT",
  OP_PENDING: "STORAGE_OP_PENDING",
  CONFIRM_FAILED: "STORAGE_CONFIRM_FAILED",
  CLAIM_FAILED: "STORAGE_CLAIM_FAILED",
  RELEASE_DRIFT: "STORAGE_RELEASE_DRIFT",
  SHARED_REF_EXISTS: "STORAGE_SHARED_REF_EXISTS",
  OP_UNAVAILABLE: "STORAGE_OP_UNAVAILABLE",
} as const;

export class StorageQuotaError extends Error {
  code: string;
  status: number;
  opId?: string;
  constructor(code: string, message: string, status = 403, opId?: string) {
    super(message);
    this.name = "StorageQuotaError";
    this.code = code;
    this.status = status;
    this.opId = opId;
  }
}

function normalizeBytes(raw: number | bigint | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function resolveQuotaRow(row: {
  storageUsed: unknown;
  storageLimit: unknown;
} | null): { used: bigint; limit: bigint } {
  if (!row) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.NOT_READY,
      "空间存储配额尚未初始化，暂无法上传文件。请联系管理员完成空间初始化后重试（本次未扣点、未写入任何文件）。",
      503,
    );
  }
  const used = typeof row.storageUsed === "bigint" ? row.storageUsed : BigInt(Math.trunc(Number(row.storageUsed ?? 0)));
  const limitRaw = typeof row.storageLimit === "bigint" ? row.storageLimit : BigInt(Math.trunc(Number(row.storageLimit ?? 0)));
  if (used < BigInt(0)) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.USAGE_INVALID,
      "空间存储用量数据异常（负值），暂无法上传文件。请联系管理员核对存储计量数据。",
      503,
    );
  }
  if (limitRaw < BigInt(-1)) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.LIMIT_INVALID,
      "空间存储上限数据异常（小于 -1），暂无法上传文件。请联系管理员核对存储配额配置。",
      503,
    );
  }
  return { used, limit: limitRaw };
}

function formatGb(bytes: bigint): string {
  return (Number(bytes) / 1073741824).toFixed(2);
}
function formatMb(bytes: bigint | number): string {
  return (Number(bytes) / 1048576).toFixed(2);
}

function exceededError(used: bigint, limit: bigint, incoming: bigint): StorageQuotaError {
  return new StorageQuotaError(
    STORAGE_QUOTA_CODES.EXCEEDED,
    `空间文件存储空间不足：已用 ${formatGb(used)}GB / 上限 ${formatGb(limit)}GB，无法再上传 ${formatMb(incoming)}MB 的文件。请先清理不需要的资料（删除后容量会释放），或联系空间管理员提升存储额度。`,
    403,
  );
}

// ---- [R0-J2] storageoperation 持久化（离线 schema 草案；迁移未执行时诚实拒绝） ----

function opModel(client?: unknown): any {
  const c = (client ?? prisma) as any;
  return c.storageoperation;
}

/**
 * [R0-J3 §二.5] 模型能力检查：delegate 未生成/表未就绪 → 在任何副作用前稳定拒绝 503，
 * 不再出现 undefined.findUnique → TypeError 普通 500。
 */
function ensureOpModel(client?: unknown): any {
  const delegate = opModel(client);
  if (!delegate?.findUnique) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.NOT_READY,
      "存储操作记录表未就绪（需先执行数据库迁移并重新生成 Prisma 客户端），暂无法执行存储操作。请联系管理员完成部署。",
      503,
    );
  }
  return delegate;
}

async function findStorageOp(client: any, opId: string): Promise<any | null> {
  try {
    return await ensureOpModel(client).findUnique({ where: { opId } });
  } catch (e: any) {
    if (String(e?.code) === "P2021" || String(e?.message || "").includes("does not exist")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.NOT_READY,
        "存储操作记录表未就绪（需先执行数据库迁移），暂无法上传文件。请联系管理员完成部署。",
        503,
      );
    }
    // [R0-J4 J3-07] 缺失列（迁移未含新增字段）→ 稳定 503 + 可识别 code，不泄露原始 Prisma 错误
    if (String(e?.code) === "P2022" || String(e?.message || "").includes("is missing")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.OP_UNAVAILABLE,
        "存储操作记录表结构校验失败（缺失列），存储计量暂时不可用，请稍后重试。",
        503,
      );
    }
    throw e;
  }
}

/** [R0-J2] 原子预留 + 操作记录创建在同一事务提交；P2002 → 已有操作按最新事实分类 */
async function reserveAtomic(client: any, workspaceId: string, bytes: bigint, opId: string, userId: string): Promise<{ unlimited: boolean; deduped: boolean; conflict: boolean }> {
  // 步骤 1：-1 不限条件预留（含 usage >= 0 写边界核验）
  const unlimitedOk = await client.$executeRaw`
    UPDATE \`workspacequota\`
    SET \`storageUsed\` = \`storageUsed\` + ${bytes}
    WHERE \`workspaceId\` = ${workspaceId}
      AND \`storageLimit\` = -1
      AND \`storageUsed\` >= 0
  `;
  if (unlimitedOk === 1) {
    // 步骤 2：操作记录在同一事务创建（原子提交）
    await ensureOpModel(client).create({
      data: { opId, workspaceId, userId, opType: "RESERVE", status: "RESERVED", bytes: Number(bytes), updatedAt: new Date() },
    });
    return { unlimited: true, deduped: false, conflict: false };
  }
  // 步骤 3：有限上限条件预留（核验 + 预留同一语句）
  const finiteOk = await client.$executeRaw`
    UPDATE \`workspacequota\`
    SET \`storageUsed\` = \`storageUsed\` + ${bytes}
    WHERE \`workspaceId\` = ${workspaceId}
      AND \`storageLimit\` >= 0
      AND \`storageUsed\` >= 0
      AND \`storageUsed\` + ${bytes} <= \`storageLimit\`
  `;
  if (finiteOk === 1) {
    await ensureOpModel(client).create({
      data: { opId, workspaceId, userId, opType: "RESERVE", status: "RESERVED", bytes: Number(bytes), updatedAt: new Date() },
    });
    return { unlimited: false, deduped: false, conflict: false };
  }
  return { unlimited: false, deduped: false, conflict: true };
}

async function updateStorageOpStatus(client: any, opId: string, status: string, extra?: { filePath?: string | null; documentId?: string | null; note?: string }): Promise<boolean> {
  try {
    const result = await ensureOpModel(client).update({
      where: { opId },
      data: { status, updatedAt: new Date(), ...(extra?.filePath !== undefined ? { filePath: extra.filePath } : {}), ...(extra?.documentId !== undefined ? { documentId: extra.documentId } : {}), ...(extra?.note ? { note: extra.note } : {}) },
    });
    return Boolean(result);
  } catch (e: any) {
    if (String(e?.code) === "P2025") return false;
    throw e;
  }
}

/**
 * [R0-J1/R0-J2 J-UPLOAD] 确认操作：对象定位与文档 ID 回填，状态 → CONFIRMED。
 * 确认失败/记录未找到不吞掉（不得返回完整成功）：抛出让调用方走清理协议如实返回。
 */
export async function confirmStorageOperation(opId: string, filePath: string | null, documentId: string | null): Promise<void> {
  const ok = await updateStorageOpStatus(prisma, opId, "CONFIRMED", { filePath, documentId });
  if (!ok) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.CONFIRM_FAILED,
      "存储操作确认失败（操作记录未找到或更新未生效），请稍后重试。",
      500,
      opId,
    );
  }
}

/**
 * [R0-J3 §二.1] 对象键预绑定：在外部写入之前把目标对象键持久关联到操作（保持 RESERVED）。
 * 丢失响应后可凭该操作定位具体未知对象，不再只凭 opId 猜测。
 */
export async function bindOperationObjectKey(opId: string, filePath: string): Promise<void> {
  const ok = await updateStorageOpStatus(prisma, opId, "RESERVED", { filePath });
  if (!ok) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.CONFIRM_FAILED,
      "操作记录未找到，无法绑定对象定位（上传已中止，无文件副作用）。",
      500,
      opId,
    );
  }
}

/**
 * [R0-J1 J-UPLOAD] 待清理标记：未知保存结果 / 清理删除失败 → 持久化 PENDING_CLEANUP 状态。
 */
export async function markStorageOperationPendingCleanup(opId: string, note: string, filePath?: string | null): Promise<void> {
  const ok = await updateStorageOpStatus(prisma, opId, "PENDING_CLEANUP", { note, filePath: filePath ?? undefined });
  if (!ok) {
    console.error("[storage-op] 待清理标记失败（需人工核对）:", opId);
  }
}

// ---- [R0-J S01/S02 + R0-J1/R0-J2 J-WRITE-BOUND] 存储预留 ----

/**
 * [R0-J3 §二.6] 操作身份一致性核验：空间/操作者/字节/活动状态。
 * 普通重放分支与 P2002 并发分支共用同一口径，避免核验不一致。
 */
function classifyExistingOp(existing: any, workspaceId: string, serverUserId: string, bytes: number, opType: string): "deduped" | "conflict" {
  const sameWorkspace = existing?.workspaceId === workspaceId;
  const sameUser = existing?.userId === serverUserId;
  const sameBytes = Number(existing?.bytes) === bytes;
  const sameType = existing?.opType === opType;
  // [R0-J4 J3-06] opType 必须一致：RELEASE 清理认领与 RESERVE 预留不是同一操作的重放；
  // RELEASED 是终态，opId 不应被重放复用。两者都按冲突处理，不得 dedup 后继续创建新对象。
  const nonConflictStatus = ["RESERVED", "CONFIRMED", "PENDING_CLEANUP"].includes(existing?.status);
  return sameWorkspace && sameUser && sameBytes && sameType && nonConflictStatus ? "deduped" : "conflict";
}

/**
 * 存储预留：操作身份认领 + 容量预留 + 操作记录创建在同一事务提交。
 * - opId 去重核验空间/操作者/字节/状态（不只是 opId 字符串匹配）；
 * - [-1 不限] 分支同样在写边界核验（WHERE storageLimit = -1 AND storageUsed >= 0）；
 * - 有限上限 → 原子条件 UPDATE（核验+预留同一语句）；count=0 时重读分类；
 * - 预留与操作记录在同一事务（原子提交），P2002 → 已有操作按事实分类。
 */
export async function reserveStorageBytes(
  workspaceId: string,
  incomingBytes: number,
  opId: string,
  userId?: string,
): Promise<{ unlimited: boolean; deduped: boolean; opConflict: boolean }> {
  if (!workspaceId) {
    throw new StorageQuotaError(STORAGE_QUOTA_CODES.NOT_READY, "缺少工作空间，无法核定存储配额。", 400, opId);
  }
  if (!opId) {
    throw new StorageQuotaError(STORAGE_QUOTA_CODES.NOT_READY, "操作身份不能为空。", 400, opId);
  }
  const bytes = normalizeBytes(incomingBytes);
  if (bytes === null) {
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.BYTES_INVALID,
      "上传文件字节数非法，无法核定存储占用。请重新上传；若反复出现请联系管理员。",
      400,
      opId,
    );
  }
  const serverUserId = userId || "";

  // opId 幂等去重：核验空间/操作者/字节/状态（不只是 opId 字符串匹配）
  const existingOp = await findStorageOp(prisma, opId);
  if (existingOp) {
    if (classifyExistingOp(existingOp, workspaceId, serverUserId, bytes, "RESERVE") === "deduped") {
      // 同一操作重放：返回原结果，不重复占用
      // [R0-J2 §2.1] storageoperation 模型无 storageLimit 列，不读不存在字段；调用方仅消费 deduped/opConflict
      return { unlimited: false, deduped: true, opConflict: false };
    }
    // 跨空间/不同主体/不同载荷/已释放状态 → 冲突，不得 dedup 后继续创建新对象
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.OP_CONFLICT,
      "操作身份冲突（不同空间/主体/载荷/已释放状态），请使用新的操作 ID。",
      409,
      opId,
    );
  }

  // 原子预留 + 操作记录创建在同一事务
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const r = await reserveAtomic(tx, workspaceId, BigInt(bytes), opId, serverUserId);
      return r;
    });
    if (result.conflict) {
      // [R0-J2 §7 J-WRITE-BOUND] 冲突必须按最新配额事实分类并明确拒绝（不得静默放行未预留上传）：
      // 重读配额行 → LIMIT_ZERO / LIMIT_INVALID / USAGE_INVALID / EXCEEDED，零副作用（未入账）
      const row = await prisma.workspacequota.findUnique({
        where: { workspaceId },
        select: { storageUsed: true, storageLimit: true },
      });
      const q = resolveQuotaRow(row); // 缺行/负用量/非法限额 → NOT_READY/USAGE_INVALID/LIMIT_INVALID
      if (q.limit === BigInt(0)) {
        throw new StorageQuotaError(
          STORAGE_QUOTA_CODES.LIMIT_ZERO,
          "空间存储上限为 0，无法上传文件。请联系空间管理员配置存储额度。",
          403,
          opId,
        );
      }
      throw exceededError(q.used, q.limit, BigInt(bytes));
    }
    return { unlimited: result.unlimited, deduped: result.deduped, opConflict: result.conflict };
  } catch (e: any) {
    // P2002 = opId 唯一约束冲突（并发同 opId）→ 按已有操作事实分类
    // [R0-J3 §二.6] 与普通重放分支同一核验口径：空间/操作者/字节/状态（缺 userId/状态核验会让另一主体的操作被 dedup）
    if (String(e?.code) === "P2002") {
      const existing = await findStorageOp(prisma, opId);
      if (existing && classifyExistingOp(existing, workspaceId, serverUserId, bytes, "RESERVE") === "deduped") {
        return { unlimited: false, deduped: true, opConflict: false };
      }
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.OP_CONFLICT,
        "并发操作身份冲突（不同空间/主体/载荷/状态），请使用新的操作 ID。",
        409,
        opId,
      );
    }
    if (e instanceof StorageQuotaError) throw e;
    // 模型/表未就绪
    if (String(e?.code) === "P2021" || String(e?.message || "").includes("does not exist")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.NOT_READY,
        "存储操作记录表未就绪（需先执行数据库迁移），暂无法上传文件。请联系管理员完成部署。",
        503,
        opId,
      );
    }
    throw e;
  }
}

// ---- [R0-J S05 + R0-J1/R0-J2 J-RELEASE] 释放 ----

/**
 * 释放：原子条件扣减。无 drift SET 0 后备；
 * used < bytes → 不释放并返回 drift=true（调用方阻断危险释放，保留差异）。
 * [R0-J2 J-WRITE-BOUND] WHERE 同时包含 storageUsed >= 0 核验。
 */
async function releaseBytesOnClient(
  client: any,
  workspaceId: string,
  bytes: bigint,
): Promise<{ released: boolean; drift: boolean }> {
  const released = await client.$executeRaw`
    UPDATE \`workspacequota\`
    SET \`storageUsed\` = \`storageUsed\` - ${bytes}
    WHERE \`workspaceId\` = ${workspaceId}
      AND \`storageUsed\` >= ${bytes}
      AND \`storageUsed\` >= 0
  `;
  if (released === 1) return { released: true, drift: false };
  // used < bytes：历史漂移 → 不清零、不假报成功；调用方阻断并保留差异
  return { released: false, drift: true };
}

export async function releaseStorageBytes(
  workspaceId: string,
  bytes: number,
): Promise<{ released: boolean; drift: boolean }> {
  const n = normalizeBytes(bytes);
  if (!workspaceId || n === null || n <= 0) return { released: false, drift: false };
  return releaseBytesOnClient(prisma, workspaceId, BigInt(n));
}

/**
 * [R0-J2] 规范化对象键（唯一对象身份去重用；大小写敏感，不合并 A.txt 和 a.txt）
 */
function normalizeObjectKeyForDedup(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(?:uploads\/)?(?:assets\/)?/, "")
    .replace(/^(\.\.[\/\\])+/, "");
}

/**
 * [R0-J3 J-RELEASE §一.2] 确定性认领 opId：同一对象（唯一规范化键）的删除/清空/重试
 * 共用一份恢复事实。并发两方认领同一对象 → opId 唯一约束 P2002 → 后到者按已有认领状态处理。
 */
export function objectClaimOpId(workspaceId: string, filePath: string | null | undefined): string | null {
  const key = normalizeObjectKeyForDedup(filePath);
  if (!key) return null;
  return `del-${workspaceId}-${key}`;
}

/**
 * [R0-J3 §一.5] 同一对象的已知路径别名集合（原始值、归一键、assets/ 与 uploads/assets/ 历史形式）。
 * `assets/w1/shared` 与 `w1/shared` 指向同一对象——共享引用判断用一致身份，不按原始字符串相等遗漏。
 */
export function objectPathAliases(filePath: string | null | undefined): string[] {
  if (!filePath) return [];
  const key = normalizeObjectKeyForDedup(filePath);
  if (!key) return [];
  const set = new Set<string>([filePath.replace(/\\/g, "/"), key, `assets/${key}`, `uploads/assets/${key}`]);
  return [...set];
}

/**
 * [R0-J3 §一.5] 共享引用检查（别名一致身份）：同对象的已知别名路径仍有其他文档引用时，
 * 调用方必须保留物理对象与其占用的容量，不得删除对象或释放仍被占用的字节。
 */
export async function countOtherReferences(
  workspaceId: string,
  filePath: string | null | undefined,
  excludeDocIds: string[],
): Promise<number> {
  const aliases = objectPathAliases(filePath);
  if (aliases.length === 0) return 0;
  return prisma.document.count({
    where: { workspaceId, filePath: { in: aliases }, id: { notIn: excludeDocIds } },
  });
}

/**
 * [R0-J3 §一.2/§一.3] 清理认领：在任何破坏性步骤（物理删除/删行/扣减）之前持久化恢复事实
 * （对象定位、真实字节、主体、空间、状态，确定性 opId 幂等）。认领写失败 → 抛错中止删除：
 * 不允许出现"最后一份元数据被删、计量被释放、文件仍在"的无依据状态。
 * 返回状态：
 * - claimed：本方新建认领成功，可继续物理删除与终结；
 * - already-pending：已有待清理认领（前次物理失败或并发在途）→ 可恢复重试；
 * - already-released：对象此前已确认删除并释放（重放幂等）→ 不得再删除/释放。
 */
export async function claimObjectCleanup(
  workspaceId: string,
  filePath: string | null | undefined,
  bytes: number | null,
  opts: { userId?: string; documentId?: string | null; source?: string } = {},
): Promise<{ state: "claimed" | "already-pending" | "already-released" | "blocked"; claimOpId: string | null; reason?: string }> {
  const claimOpId = objectClaimOpId(workspaceId, filePath);
  if (!claimOpId) return { state: "claimed", claimOpId: null }; // 无物理对象（JSON 文本等）：无需认领
  // [R0-J4 J3-03] 大小未知（null/负/非法/NaN）不得伪装为真实零字节：阻断并保留文件/记录/占用/认领，交由人工核实
  const n = normalizeBytes(bytes);
  if (n === null) {
    return { state: "blocked", claimOpId: null, reason: "unknown-size" };
  }
  const delegate = ensureOpModel(prisma); // delegate 未就绪 → 503（任何破坏性步骤之前）
  try {
    await delegate.create({
      data: {
        opId: claimOpId,
        workspaceId,
        userId: opts.userId || "system",
        opType: "RELEASE",
        status: "PENDING_CLEANUP",
        filePath: filePath ?? null,
        bytes: Math.max(0, n ?? 0),
        documentId: opts.documentId ?? null,
        note: `清理认领（${opts.source ?? "delete"}）：物理删除未确认前占用保持计量`,
        updatedAt: new Date(),
      },
    });
    return { state: "claimed", claimOpId };
  } catch (e: any) {
    if (String(e?.code) === "P2002") {
      const existing = await findStorageOp(prisma, claimOpId);
      if (existing?.status === "RELEASED") return { state: "already-released", claimOpId };
      // [R0-J5 J3-03] 任何可继续破坏性动作的分支（CANCELLED 重开 / PENDING 复用）之前，
      // 先核对已有持久事实：空间 / 操作类型 / 规范对象身份（含历史别名）/ 可信字节。
      // 矛盾或无法证明一致 → 阻断保留：不改状态、不覆盖历史字节、不允许调用方继续删除。
      const existingBytes = normalizeBytes(existing?.bytes);
      const sameWorkspace = existing?.workspaceId === workspaceId;
      const sameType = existing?.opType === "RELEASE";
      const sameObject = objectClaimOpId(workspaceId, existing?.filePath) === claimOpId;
      if (!sameWorkspace || !sameType || !sameObject || existingBytes === null || existingBytes !== n) {
        return { state: "blocked", claimOpId, reason: existingBytes === null ? "unknown-size" : "fact-mismatch" };
      }
      if (existing?.status === "CANCELLED") {
        // [R0-J3] 认领曾被关闭（共享保留/并发让位）：事实核对通过后，同一对象再次删除 → 重开认领继续本次清理
        const reopen = await opModel(prisma).updateMany({
          where: { opId: claimOpId, status: "CANCELLED" },
          data: { status: "PENDING_CLEANUP", note: `清理认领重开（${opts.source ?? "delete"}）：对象仍存在，需重新清理`, updatedAt: new Date() },
        });
        if (reopen.count === 1) return { state: "claimed", claimOpId };
        return { state: "already-pending", claimOpId }; // 并发重开竞态 → 按待清理处理
      }
      return { state: "already-pending", claimOpId };
    }
    if (String(e?.code) === "P2021" || String(e?.message || "").includes("does not exist")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.NOT_READY,
        "存储操作记录表未就绪（需先执行数据库迁移），暂无法执行文件删除。请联系管理员完成部署。",
        503,
      );
    }
    // [R0-J4 J3-07] 缺失列（迁移未含新增字段）→ 稳定 503 + 可识别 code，不泄露原始错误
    if (String(e?.code) === "P2022" || String(e?.message || "").includes("is missing")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.OP_UNAVAILABLE,
        "存储操作记录表结构校验失败（缺失列），存储计量暂时不可用，请稍后重试。",
        503,
      );
    }
    // [R0-J3 §一.3] 认领持久化失败 → 中止删除，保留记录与占用（可重试依据不丢）
    throw new StorageQuotaError(
      STORAGE_QUOTA_CODES.CLAIM_FAILED,
      "清理认领持久化失败，为保留恢复依据已中止删除（文件、记录与占用均未变更）。请稍后重试。",
      500,
    );
  }
}

/**
 * [R0-J6 J3-02] 终结事务回滚后，用「事务外」的独立读取核对已提交终态。
 * 两个终结事务都可能先读到旧 PENDING，不能用原事务旧快照当最新事实；
 * 也不能把「存在一条操作」当成功。只有同一认领（opId）确已 RELEASED，
 * 且空间/操作类型/规范对象/可信字节一致，才判定为幂等已完成。
 */
async function readCommittedFinalState(workspaceId: string, claimOpId: string, expectedBytes: number | null): Promise<boolean> {
  const op = await findStorageOp(prisma, claimOpId);
  if (!op || op.status !== "RELEASED") return false;
  if (op.workspaceId !== workspaceId || op.opType !== "RELEASE") return false;
  if (op.filePath && objectClaimOpId(workspaceId, op.filePath) !== claimOpId) return false;
  const persistedBytes = normalizeBytes(op?.bytes);
  if (persistedBytes === null) return false;
  if (expectedBytes !== null && persistedBytes !== expectedBytes) return false;
  return true;
}

/**
 * [R0-J3 §一.2/§三] 清理终结：物理对象已确认删除/不存在后，同一事务内
 * { 条件扣减 + 认领状态 PENDING_CLEANUP→RELEASED } —— 元数据终态与额度释放受同一原子条件控制，
 * 并发双终结靠状态条件互斥（后到者回滚，不重复扣减）。漂移 → 整体回滚，认领保持待清理（占用保留）。
 */
export async function finalizeObjectCleanup(
  workspaceId: string,
  claimOpId: string,
  bytes: number | null,
): Promise<{ released: boolean; drift: boolean; finalized: boolean; alreadyReleased: boolean; conflicted?: boolean }> {
  const n = normalizeBytes(bytes);
  try {
    return await prisma.$transaction(async (tx: any) => {
      const existing = await opModel(tx).findUnique({ where: { opId: claimOpId } });
      if (!existing) return { released: false, drift: false, finalized: false, alreadyReleased: false, conflicted: false };
      // [R0-J5 J3-02] 事务内先识别已释放终态：已完成重放是幂等事实，不再扣量、不报新漂移
      // （当前用量为 0 不能当作本次发生漂移；未完成且真实用量不足仍由下方条件扣减阻断）
      if (existing.status === "RELEASED") {
        return { released: false, drift: false, finalized: true, alreadyReleased: true, conflicted: false };
      }
      // [R0-J4 J3-03] 终结时以受保护的持久事实为准确定应释放量；调用方快照不得任意覆盖认领量
      const persistedBytes = normalizeBytes(existing?.bytes);
      const releaseAmount = persistedBytes ?? n ?? 0;
      // 调用方大小未知（null）或与持久事实矛盾：阻断，保留文件/占用/认领待核实，不释放
      if (n !== null && persistedBytes !== null && persistedBytes !== n) {
        throw new StorageQuotaError(
          STORAGE_QUOTA_CODES.RELEASE_DRIFT,
          `存储清理字节矛盾（认领 ${formatMb(persistedBytes)}MB 与调用方 ${formatMb(n)}MB 不一致），已保留占用与待清理认领，请人工核实。`,
          500,
        );
      }
      let released = false;
      if (releaseAmount > 0) {
        const r = await releaseBytesOnClient(tx, workspaceId, BigInt(releaseAmount));
        if (r.drift) {
          throw new StorageQuotaError(
            STORAGE_QUOTA_CODES.RELEASE_DRIFT,
            `存储历史漂移：配额占用不足以扣减待释放 ${formatMb(releaseAmount)}MB，已回滚。占用保持计量，请人工核对。`,
            500,
          );
        }
        released = true;
      }
      const upd = await opModel(tx).updateMany({
        where: { opId: claimOpId, status: "PENDING_CLEANUP" },
        data: { status: "RELEASED", note: "物理对象已确认删除，占用已原子释放（终态）", updatedAt: new Date() },
      });
      if (upd.count !== 1) {
        // 并发终结竞态：回滚本事务（含扣减），对方已释放
        throw new Error("STORAGE_CLAIM_FINALIZE_RACE");
      }
      return { released, drift: false, finalized: true, alreadyReleased: false, conflicted: false };
    });
  } catch (e: any) {
    if (e instanceof StorageQuotaError && e.code === STORAGE_QUOTA_CODES.RELEASE_DRIFT) {
      // [R0-J6 J3-02] 条件扣减失败有两种原因：真实用量不足（仍 PENDING，须保持 drift），
      // 或另一完成请求已提交 RELEASED 并释放额度（本请求应幂等完成）。事务已整体回滚，
      // 用事务外独立读取核对已提交终态后再区分；不无条件把 drift/count=0 改成成功，不清零用量。
      if (await readCommittedFinalState(workspaceId, claimOpId, n)) {
        return { released: false, drift: false, finalized: true, alreadyReleased: true, conflicted: false };
      }
      return { released: false, drift: true, finalized: false, alreadyReleased: false, conflicted: false };
    }
    if (String(e?.message) === "STORAGE_CLAIM_FINALIZE_RACE") {
      // 状态条件转换竞态：同样只在核对到已提交 RELEASED 终态时按幂等完成，否则如实抛出
      if (await readCommittedFinalState(workspaceId, claimOpId, n)) {
        return { released: false, drift: false, finalized: true, alreadyReleased: true, conflicted: false };
      }
      throw e;
    }
    if (e instanceof StorageQuotaError && e.code === STORAGE_QUOTA_CODES.OP_UNAVAILABLE) throw e;
    throw e;
  }
}

/**
 * [R0-J4 J3-05] 按持久化文档身份查找该空间待清理认领，用于文档已删除后的恢复终结（避免认领与占用卡死）。
 * 仅依据空间/文档身份核权，不接受客户端提供的路径作为授权依据。
 */
export async function findStorageOpByDocument(documentId: string, workspaceId: string): Promise<any | null> {
  try {
    await ensureOpModel(prisma);
    return await opModel(prisma).findFirst({
      where: { documentId, workspaceId, status: "PENDING_CLEANUP" },
      orderBy: { updatedAt: "desc" },
    });
  } catch (e: any) {
    // [R0-J5 J3-07] 恢复查询缺表/缺列 → 与上传就绪错误同一稳定口径；普通业务/网络异常原样抛出，不伪装成未迁移
    if (e instanceof StorageQuotaError) throw e;
    if (String(e?.code) === "P2021" || String(e?.message || "").includes("does not exist")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.NOT_READY,
        "存储操作记录表未就绪（需先执行数据库迁移），暂无法恢复清理。请联系管理员完成部署。",
        503,
      );
    }
    if (String(e?.code) === "P2022" || String(e?.message || "").includes("is missing")) {
      throw new StorageQuotaError(
        STORAGE_QUOTA_CODES.OP_UNAVAILABLE,
        "存储操作记录表结构校验失败（缺失列），存储计量暂时不可用，请稍后重试。",
        503,
      );
    }
    throw e;
  }
}

/**
 * [R0-J3] 关闭认领而不释放：共享引用保留 / 并发后到者等场景，对象与占用保持原状，
 * 认领转 CANCELLED 终态（对账不再当在途，恢复重试不再处理）。
 */
export async function closeClaimWithoutRelease(claimOpId: string, note: string): Promise<void> {
  await opModel(prisma).updateMany({
    where: { opId: claimOpId, status: "PENDING_CLEANUP" },
    data: { status: "CANCELLED", note, updatedAt: new Date() },
  });
}

/**
 * [R0-J3 §二.3] 预留释放原子化：条件扣减 + RESERVED→RELEASED 终态同一事务
 * （修复"已清理却仍 RESERVED/活动状态"——操作状态与净占用保持一致）。
 */
export async function releaseReservationAtomic(
  workspaceId: string,
  opId: string,
  bytes: number,
  note: string,
): Promise<{ released: boolean; drift: boolean }> {
  const n = normalizeBytes(bytes);
  return prisma.$transaction(async (tx: any) => {
    let released = false;
    if (n !== null && n > 0) {
      const r = await releaseBytesOnClient(tx, workspaceId, BigInt(n));
      if (r.drift) return { released: false, drift: true };
      released = true;
    }
    const upd = await opModel(tx).updateMany({
      where: { opId, status: "RESERVED" },
      data: { status: "RELEASED", note, updatedAt: new Date() },
    });
    if (upd.count !== 1) throw new Error("STORAGE_RESERVATION_RELEASE_RACE");
    return { released, drift: false };
  }).catch((e: any) => {
    if (String(e?.message) === "STORAGE_RESERVATION_RELEASE_RACE") return { released: false, drift: false };
    throw e;
  });
}

// ---- [R0-J S06 + R0-J1/R0-J2 J-RECONCILE] 只读对账 ----

export interface StorageReconcileDocRow {
  id: string;
  title?: string | null;
  status?: string | null;
  visibility?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
}

export interface StorageReconcileReport {
  quota: { present: boolean; used: string | null; limit: string | null; kind: "unlimited" | "finite" | "invalid" | "missing" };
  docs: {
    totalRows: number;
    uniqueObjects: number;
    duplicateRefs: Array<{ key: string; refs: number }>;
    physicalBytesSum: string;
    softDeletedWithFile: number;
    sizeUnknownOrInvalid: Array<{ id: string; title: string | null; reason: string }>;
    conflictingSizes: Array<{ key: string; sizes: string }>;
  };
  operations: {
    reserved: number;
    pendingCleanup: number;
    confirmed: number;
    reservedBytes: string;
    pendingCleanupBytes: string;
    items: Array<{ opId: string; status: string; filePath: string | null; bytes: number }>;
  };
  physical: {
    checked: boolean;
    missingFiles: Array<{ key: string }>;
    orphanObjects: Array<{ key: string; size: string }>;
    sizeMismatches: Array<{ key: string; recorded: string; actual: string }>;
  };
  usageDrift: { quotaUsed: string; uniqueObjectBytesSum: string; diff: string; inFlightBytes: string } | null;
  notes: string[];
  coverage: {
    physicalVerified: boolean;
    objectListProvided: boolean;
    operationStatesIncluded: boolean;
    caseSensitive: boolean;
  };
}

/**
 * [R0-J S06 + R0-J1/R0-J2 J-RECONCILE] 只读对账（唯一对象计量 + 在途/待清理 + 未核实标注）。
 * 对象身份保留大小写敏感（不合并 A.txt 和 a.txt）；空文档集合+非零用量仍参与核对；
 * 独立 listObjects 清单被使用（不要求额外传 fileExists）；coverage 区分核验范围。
 * 绝不改库、不删文件、不释放。
 */
export async function reconcileWorkspaceStorage(
  workspaceId: string,
  opts?: {
    docRows?: StorageReconcileDocRow[];
    quotaRow?: { storageUsed: unknown; storageLimit: unknown } | null;
    fileExists?: (filePath: string) => Promise<boolean>;
    listObjects?: () => Promise<Array<{ key: string; size: number | null }>>;
  },
): Promise<StorageReconcileReport> {
  const notes: string[] = [];
  let quota: StorageReconcileReport["quota"];
  let quotaUsed: bigint | null = null;
  if (opts?.quotaRow !== undefined) {
    try {
      const q = resolveQuotaRow(opts.quotaRow);
      quotaUsed = q.used;
      quota = { present: true, used: q.used.toString(), limit: q.limit.toString(), kind: q.limit === BigInt(-1) ? "unlimited" : "finite" };
    } catch (e) {
      const code = (e as StorageQuotaError).code;
      quota = { present: opts.quotaRow !== null, used: null, limit: null, kind: code === STORAGE_QUOTA_CODES.NOT_READY ? "missing" : "invalid" };
      notes.push(`配额行异常（${code}），占用无法与记录核对`);
    }
  } else {
    const row = await prisma.workspacequota.findUnique({
      where: { workspaceId },
      select: { storageUsed: true, storageLimit: true },
    });
    if (!row) {
      quota = { present: false, used: null, limit: null, kind: "missing" };
      notes.push("配额行缺失，占用无法与记录核对");
    } else {
      try {
        const q = resolveQuotaRow(row);
        quotaUsed = q.used;
        quota = { present: true, used: q.used.toString(), limit: q.limit.toString(), kind: q.limit === BigInt(-1) ? "unlimited" : "finite" };
      } catch (e) {
        quota = { present: true, used: String(row.storageUsed ?? ""), limit: String(row.storageLimit ?? ""), kind: "invalid" };
        notes.push(`配额行数值异常（${(e as StorageQuotaError).code}）`);
      }
    }
  }

  const docRows: StorageReconcileDocRow[] = opts?.docRows ?? (await prisma.document.findMany({
    where: { workspaceId },
    select: { id: true, title: true, status: true, visibility: true, filePath: true, fileSize: true },
  }) as any[]);

  // [R0-J2 J-RECONCILE] 唯一对象身份去重（大小写敏感，不合并 A.txt 和 a.txt）
  const objectMap = new Map<string, { sizes: Set<number>; refs: number; softDeleted: number; docIds: Set<string> }>();
  const sizeUnknownOrInvalid: Array<{ id: string; title: string | null; reason: string }> = [];
  let withPhysicalFile = 0;
  let softDeletedWithFile = 0;
  for (const d of docRows) {
    if (!d.filePath) continue;
    withPhysicalFile++;
    const isSoftDeleted = d.status === "REMOVED" || d.status === "deleted";
    if (isSoftDeleted) softDeletedWithFile++;
    const key = normalizeObjectKeyForDedup(d.filePath);
    if (!key) continue;
    const n = normalizeBytes(d.fileSize);
    let entry = objectMap.get(key);
    if (!entry) { entry = { sizes: new Set(), refs: 0, softDeleted: 0, docIds: new Set() }; objectMap.set(key, entry); }
    entry.refs++;
    entry.docIds.add(d.id);
    if (isSoftDeleted) entry.softDeleted++;
    if (n === null) {
      sizeUnknownOrInvalid.push({ id: d.id, title: d.title ?? null, reason: "有物理文件路径但 fileSize 缺失或非法，占用待核实" });
      continue;
    }
    entry.sizes.add(n);
  }
  let physicalBytesSum = BigInt(0);
  const duplicateRefs: Array<{ key: string; refs: number }> = [];
  const conflictingSizes: Array<{ key: string; sizes: string }> = [];
  for (const [key, entry] of objectMap) {
    if (entry.refs > 1) duplicateRefs.push({ key, refs: entry.refs });
    if (entry.sizes.size > 1) conflictingSizes.push({ key, sizes: [...entry.sizes].join(",") });
    const sz = entry.sizes.size === 1 ? [...entry.sizes][0] : null;
    if (sz !== null && sz > 0) physicalBytesSum += BigInt(sz);
  }

  // [R0-J2] 操作记录（在途预留/待清理，含字节合计）
  let opItems: Array<{ opId: string; status: string; filePath: string | null; bytes: number }> = [];
  let opReserved = 0, opPendingCleanup = 0, opConfirmed = 0;
  let opReservedBytes = BigInt(0), opPendingCleanupBytes = BigInt(0);
  try {
    const ops = await opModel(prisma).findMany({ where: { workspaceId } });
    for (const op of ops) {
      const opBytes = BigInt(op.bytes ?? 0);
      opItems.push({ opId: op.opId, status: op.status, filePath: op.filePath ?? null, bytes: Number(op.bytes ?? 0) });
      if (op.status === "RESERVED") { opReserved++; opReservedBytes += opBytes; }
      else if (op.status === "PENDING_CLEANUP") { opPendingCleanup++; opPendingCleanupBytes += opBytes; }
      else if (op.status === "CONFIRMED") opConfirmed++;
    }
    if (opReserved > 0 || opPendingCleanup > 0) {
      notes.push(`存在 ${opReserved} 个在途预留（${opReservedBytes} 字节）/ ${opPendingCleanup} 个待清理操作（${opPendingCleanupBytes} 字节）`);
    }
  } catch {
    notes.push("存储操作记录不可读（可能未迁移），在途/待清理状态未纳入核对");
  }

  // [R0-J2] 物理核验：listObjects 独立使用（不要求额外传 fileExists）
  const physical = { checked: false, missingFiles: [] as Array<{ key: string }>, orphanObjects: [] as Array<{ key: string; size: string }>, sizeMismatches: [] as Array<{ key: string; recorded: string; actual: string }> };
  if (opts?.fileExists) {
    physical.checked = true;
    for (const [key] of objectMap) {
      const exists = await opts.fileExists(key);
      if (!exists) physical.missingFiles.push({ key });
    }
  }
  if (opts?.listObjects) {
    physical.checked = true;
    const objList = await opts.listObjects();
    const docKeys = new Set(objectMap.keys());
    for (const obj of objList) {
      const objKey = normalizeObjectKeyForDedup(obj.key);
      if (!objKey || docKeys.has(objKey)) continue;
      physical.orphanObjects.push({ key: obj.key, size: obj.size === null ? "未知" : String(obj.size) });
    }
    for (const [key, entry] of objectMap) {
      if (entry.sizes.size !== 1) continue;
      const actual = objList.find((o) => normalizeObjectKeyForDedup(o.key) === key);
      if (actual && actual.size !== null && actual.size !== [...entry.sizes][0]) {
        physical.sizeMismatches.push({ key, recorded: String([...entry.sizes][0]), actual: String(actual.size) });
      }
    }
  } else if (!opts?.fileExists) {
    notes.push("物理存在性未核实（未提供 fileExists/listObjects），占用与记录一致性仅限数据库层面");
  }

  let usageDrift: StorageReconcileReport["usageDrift"] = null;
  if (quotaUsed !== null) {
    // [R0-J3] 在途净占用 = RESERVED 预留 + PENDING_CLEANUP 待清理认领（物理未确认删除，
    // 占用保持计量）——已 RELEASED/CANCELLED 终态不再计入，操作状态与净占用一致
    const inFlightBytes = opReservedBytes + opPendingCleanupBytes;
    const diff = quotaUsed - physicalBytesSum;
    usageDrift = { quotaUsed: quotaUsed.toString(), uniqueObjectBytesSum: physicalBytesSum.toString(), diff: diff.toString(), inFlightBytes: inFlightBytes.toString() };
    if (diff !== BigInt(0)) {
      const explained = diff === inFlightBytes ? "（可由在途预留/待清理认领解释）" : "";
      notes.push(`配额占用与唯一对象记录求和不一致（diff=${diff.toString()} 字节）${explained}，需人工核实`);
    }
    // 空文档集合但非零占用：objectMap.size === 0 → physicalBytesSum = 0 → diff = quotaUsed，
    // 由上方同一分支输出差异说明（可解释预留 / 真实差异），无需单独分支。
  }
  if (sizeUnknownOrInvalid.length > 0) notes.push(`存在 ${sizeUnknownOrInvalid.length} 条大小未知/非法记录，未按 0 处理`);
  if (duplicateRefs.length > 0) notes.push(`存在 ${duplicateRefs.length} 个重复引用对象`);

  return {
    quota,
    docs: {
      totalRows: docRows.length,
      uniqueObjects: objectMap.size,
      duplicateRefs,
      physicalBytesSum: physicalBytesSum.toString(),
      softDeletedWithFile,
      sizeUnknownOrInvalid,
      conflictingSizes,
    },
    operations: {
      reserved: opReserved,
      pendingCleanup: opPendingCleanup,
      confirmed: opConfirmed,
      reservedBytes: opReservedBytes.toString(),
      pendingCleanupBytes: opPendingCleanupBytes.toString(),
      items: opItems,
    },
    physical,
    usageDrift,
    notes,
    coverage: {
      physicalVerified: physical.checked,
      objectListProvided: Boolean(opts?.listObjects),
      operationStatesIncluded: opItems.length > 0,
      caseSensitive: true,
    },
  };
}

// ---- 兼容旧调用名 ----

export async function addStorageUsed(workspaceId: string, deltaBytes: number): Promise<void> {
  await reserveStorageBytes(workspaceId, deltaBytes, `legacy_add_${Date.now()}`);
}

export async function subtractStorageUsed(workspaceId: string, deltaBytes: number): Promise<void> {
  try {
    await releaseStorageBytes(workspaceId, deltaBytes);
  } catch {
    // 由对账报告呈现差异
  }
}
