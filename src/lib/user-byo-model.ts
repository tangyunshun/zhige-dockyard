/**
 * 中央「我的模型库」（BYO 多空间绑定）
 *
 * 设计目标：一处维护（user_byo_model_def）、多处引用（user_byo_model_assignment）。
 * 空间实际生效的 BYO 行仍 materialize 到既有的 workspace_byo_model（按 workspaceId 唯一），
 * 由本模块在「绑定 / 解绑 / 定义更新 / 定义删除」时同步，复用现有解析与展示逻辑，不改动执行核心。
 *
 * 安全约束（与 workspace-byo_model 一致）：
 *  - API Key 以 AES-256-GCM 密文落库，明文不出服务端；
 *  - Base URL 复用 SSRF/格式校验；
 *  - 协议仅 OPENAI_COMPATIBLE / ANTHROPIC / GEMINI；
 *  - 单空间任一时刻仅允许绑定到一个模型定义（写入时清理同空间的其他绑定，保证 materialize 唯一）。
 */
import { prisma } from "@/lib/prisma";
import { ContractValidationError } from "@/lib/component-runtime-utils";
import { isSupportedModelProtocol, validateModelBaseUrlForRequest, SUPPORTED_MODEL_PROTOCOLS, MODEL_INPUT_LIMITS, validateModelNameField, validateModelBaseUrlLength, validateModelApiKeyLength, validateModelNumericFields } from "@/lib/model-endpoint";
import { encryptSecret, decryptSecret } from "@/lib/crypto-secrets";
import { normCapabilities, ensureByoShareWithMembersColumn } from "@/lib/workspace-byo-model";

export interface UserByoDefInput {
  label: string;
  /** 供应商（厂商）名称，如 DeepSeek / OpenAI / Ollama / 通义千问；可空 */
  providerName?: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
  capabilities: string[];
  contextLimit: number;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  /** 编辑时留空 API Key 且已有密钥 → 保留现有密钥 */
  keepExistingKey?: boolean;
}

/** 校验并规范化中央模型库定义输入（不含 per-space 的 enabled/shareWithMembers） */
export function validateByoDefInput(
  body: Partial<UserByoDefInput>,
  opts?: { requireApiKey?: boolean },
): { ok: true; data: UserByoDefInput } | { ok: false; error: string } {
  const requireApiKey = opts?.requireApiKey !== false;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
  const protocol = typeof body.protocol === "string" ? body.protocol.trim().toUpperCase() : "OPENAI_COMPATIBLE";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const capabilities = normCapabilities(body.capabilities);
  const contextLimit = typeof body.contextLimit === "number" ? body.contextLimit : 32000;

  const nameErr = validateModelNameField(label, "展示名", MODEL_INPUT_LIMITS.label);
  if (nameErr) return { ok: false, error: nameErr };
  if (!isSupportedModelProtocol(protocol)) {
    return { ok: false, error: `协议暂不支持：${protocol}（可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}）` };
  }
  const urlErr = validateModelBaseUrlLength(baseUrl);
  if (urlErr) return { ok: false, error: urlErr };
  if (providerName.length > MODEL_INPUT_LIMITS.providerName) {
    return { ok: false, error: `供应商名称过长（最长 ${MODEL_INPUT_LIMITS.providerName} 个字符）` };
  }
  if (!apiKey) {
    if (requireApiKey) return { ok: false, error: "API Key 不能为空" };
  } else {
    const keyErr = validateModelApiKeyLength(apiKey);
    if (keyErr) return { ok: false, error: keyErr };
  }
  // 能力白名单校验（已 norm 为大写）
  for (const c of capabilities) {
    const allowed = ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT", "FILE_ANALYSIS"];
    if (!allowed.includes(c)) return { ok: false, error: `不支持的能力声明：${c}` };
  }
  const priceInput = body.priceInputMicrosPerMillion ?? null;
  const priceOutput = body.priceOutputMicrosPerMillion ?? null;
  if (priceInput === null || priceOutput === null) {
    return { ok: false, error: "厂商官方单价（输入/输出）必须配置，系统按此向用户计费" };
  }
  const numErr = validateModelNumericFields({ contextLimit, priceInputMicros: priceInput, priceOutputMicros: priceOutput });
  if (numErr) return { ok: false, error: numErr };
  return {
    ok: true,
    data: { label, providerName, protocol, baseUrl, apiKey, capabilities, contextLimit, priceInputMicrosPerMillion: priceInput, priceOutputMicrosPerMillion: priceOutput, keepExistingKey: !apiKey },
  };
}

export interface ByoAssignmentInput {
  workspaceId: string;
  enabled?: boolean;
  shareWithMembers?: boolean;
}

/** 当前用户可绑定的空间列表（仅本人拥有的空间，含个人与企业空间） */
export async function listOwnedWorkspacesForBinding(userId: string) {
  const rows = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, type: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

export interface UserByoDefView {
  id: string;
  label: string;
  providerName: string;
  protocol: string;
  baseUrl: string;
  hasApiKey: boolean;
  /** 脱敏钥匙串（前 6 + 后 4 局部明文，中间掩码），完整明文永不下发 */
  apiKeyMasked: string | null;
  capabilities: string[];
  contextLimit: number;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceStatus: string;
  createdAt: string;
  updatedAt: string;
  assignments: { workspaceId: string; enabled: boolean; shareWithMembers: boolean }[];
}

/** 列出当前用户的中央模型库定义（含绑定关系） */
export async function listUserByoModels(ownerUserId: string): Promise<UserByoDefView[]> {
  const rows = await prisma.user_byo_model_def.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "asc" },
    include: {
      assignments: { select: { workspaceId: true, enabled: true, shareWithMembers: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    providerName: r.providerName || "",
    protocol: r.protocol,
    baseUrl: r.baseUrl,
    hasApiKey: true,
    apiKeyMasked: (() => {
      try {
        const plain = decryptSecret(r.apiKeyCipher);
        return plain.length <= 10
          ? "••••••••" + plain.slice(-2)
          : plain.slice(0, 6) + "••••••••" + plain.slice(-4);
      } catch {
        return null;
      }
    })(),
    capabilities: normCapabilities(r.capabilities),
    contextLimit: r.contextLimit,
    priceInputMicrosPerMillion: r.priceInputMicrosPerMillion,
    priceOutputMicrosPerMillion: r.priceOutputMicrosPerMillion,
    priceStatus: r.priceStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    assignments: r.assignments.map((a) => ({
      workspaceId: a.workspaceId,
      enabled: a.enabled,
      shareWithMembers: a.shareWithMembers,
    })),
  }));
}

async function assertDefOwner(defId: string, actorUserId: string, actorIsAdmin: boolean) {
  if (actorIsAdmin) return;
  const def = await prisma.user_byo_model_def.findUnique({ where: { id: defId }, select: { ownerUserId: true } });
  if (!def) throw new ContractValidationError("NOT_FOUND", "模型库定义不存在", 404);
  if (def.ownerUserId !== actorUserId) {
    throw new ContractValidationError("FORBIDDEN", "仅模型库所有者或平台管理员可操作该定义", 403);
  }
}

async function assertWorkspaceAssignable(workspaceId: string, actorUserId: string, actorIsAdmin: boolean) {
  if (actorIsAdmin) return;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  if (!ws) throw new ContractValidationError("NOT_FOUND", "工作空间不存在", 404);
  if (ws.ownerId !== actorUserId) {
    throw new ContractValidationError("FORBIDDEN", "仅可绑定到你本人拥有的工作空间", 403);
  }
}

/** 将某个中央定义 materialize 为该空间的 workspace_byo_model 行（按 workspaceId 唯一覆盖） */
async function materializeToWorkspace(
  def: { label: string; providerName: string; protocol: string; baseUrl: string; apiKeyCipher: string; capabilities: unknown; contextLimit: number; priceInputMicrosPerMillion: number | null; priceOutputMicrosPerMillion: number | null; priceStatus: string },
  workspaceId: string,
  enabled: boolean,
  shareWithMembers: boolean,
) {
  await ensureByoShareWithMembersColumn();
  await prisma.workspace_byo_model.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      label: def.label,
      providerName: def.providerName || "",
      protocol: def.protocol,
      baseUrl: def.baseUrl,
      apiKeyCipher: def.apiKeyCipher,
      capabilities: def.capabilities as any,
      contextLimit: def.contextLimit,
      enabled,
      shareWithMembers,
      priceInputMicrosPerMillion: def.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: def.priceOutputMicrosPerMillion,
      priceStatus: def.priceStatus,
    },
    update: {
      label: def.label,
      providerName: def.providerName || "",
      protocol: def.protocol,
      baseUrl: def.baseUrl,
      apiKeyCipher: def.apiKeyCipher,
      capabilities: def.capabilities as any,
      contextLimit: def.contextLimit,
      enabled,
      shareWithMembers,
      priceInputMicrosPerMillion: def.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: def.priceOutputMicrosPerMillion,
      priceStatus: def.priceStatus,
    },
  });
}

async function removeMaterialized(workspaceId: string) {
  await prisma.workspace_byo_model.deleteMany({ where: { workspaceId } });
}

/** 创建中央模型库定义 */
export async function createUserByoModelDef(ownerUserId: string, input: UserByoDefInput) {
  const urlCheck = await validateModelBaseUrlForRequest(input.baseUrl);
  if (!urlCheck.ok) {
    throw new ContractValidationError("MODEL_NOT_ALLOWED", `BYO Base URL 校验失败：${urlCheck.error}`, 400);
  }
  const cipher = encryptSecret(input.apiKey);
  const def = await prisma.user_byo_model_def.create({
    data: {
      ownerUserId,
      label: input.label,
      providerName: input.providerName || "",
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiKeyCipher: cipher,
      capabilities: input.capabilities,
      contextLimit: input.contextLimit,
      priceInputMicrosPerMillion: input.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: input.priceOutputMicrosPerMillion,
      priceStatus: "VERIFIED",
    },
  });
  return def;
}

/** 更新中央模型库定义，并重新 materialize 其所有已绑定空间 */
export async function updateUserByoModelDef(defId: string, actorUserId: string, actorIsAdmin: boolean, input: UserByoDefInput) {
  await assertDefOwner(defId, actorUserId, actorIsAdmin);
  const urlCheck = await validateModelBaseUrlForRequest(input.baseUrl);
  if (!urlCheck.ok) {
    throw new ContractValidationError("MODEL_NOT_ALLOWED", `BYO Base URL 校验失败：${urlCheck.error}`, 400);
  }
  const existing = await prisma.user_byo_model_def.findUnique({ where: { id: defId }, select: { apiKeyCipher: true } });
  if (!existing) throw new ContractValidationError("NOT_FOUND", "模型库定义不存在", 404);
  const cipher = input.keepExistingKey ? existing.apiKeyCipher : encryptSecret(input.apiKey);

  await prisma.user_byo_model_def.update({
    where: { id: defId },
    data: {
      label: input.label,
      providerName: input.providerName || "",
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiKeyCipher: cipher,
      capabilities: input.capabilities,
      contextLimit: input.contextLimit,
      priceInputMicrosPerMillion: input.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: input.priceOutputMicrosPerMillion,
      priceStatus: "VERIFIED",
    },
  });

  // 重新 materialize 所有已绑定空间，保持定义与生效行一致
  const assignments = await prisma.user_byo_model_assignment.findMany({ where: { defId } });
  const fresh = await prisma.user_byo_model_def.findUnique({ where: { id: defId } });
  if (fresh) {
    for (const a of assignments) {
      await materializeToWorkspace(fresh, a.workspaceId, a.enabled, a.shareWithMembers);
    }
  }
  return fresh;
}

/** 删除中央模型库定义（级联清理绑定与其 materialized 行） */
export async function deleteUserByoModelDef(defId: string, actorUserId: string, actorIsAdmin: boolean) {
  await assertDefOwner(defId, actorUserId, actorIsAdmin);
  const assignments = await prisma.user_byo_model_assignment.findMany({ where: { defId }, select: { workspaceId: true } });
  await prisma.$transaction([
    prisma.user_byo_model_assignment.deleteMany({ where: { defId } }),
    prisma.user_byo_model_def.delete({ where: { id: defId } }),
  ]);
  for (const a of assignments) {
    await removeMaterialized(a.workspaceId);
  }
}

/**
 * 设置某定义的空间绑定（全量替换）。
 *  - 对每个目标空间：清理「同空间其他定义的绑定」后写入本定义绑定并 materialize；
 *  - 对原绑定但本次未包含的 workspaceId：解除绑定并移除 materialized 行。
 */
export async function setDefAssignments(
  defId: string,
  actorUserId: string,
  actorIsAdmin: boolean,
  assignments: ByoAssignmentInput[],
) {
  await assertDefOwner(defId, actorUserId, actorIsAdmin);
  const def = await prisma.user_byo_model_def.findUnique({ where: { id: defId } });
  if (!def) throw new ContractValidationError("NOT_FOUND", "模型库定义不存在", 404);

  const targetWs = Array.from(new Set(assignments.map((a) => a.workspaceId).filter(Boolean)));
  const incoming = new Map<string, { enabled: boolean; shareWithMembers: boolean }>();
  for (const a of assignments) {
    if (!a.workspaceId) continue;
    incoming.set(a.workspaceId, { enabled: a.enabled !== false, shareWithMembers: a.shareWithMembers !== false });
  }

  // 校验每个目标空间的归属权
  for (const wsId of targetWs) {
    await assertWorkspaceAssignable(wsId, actorUserId, actorIsAdmin);
  }

  // 原绑定（用于计算需要解绑的 workspace）
  const prevAssignments = await prisma.user_byo_model_assignment.findMany({ where: { defId }, select: { workspaceId: true } });
  const prevWs = new Set(prevAssignments.map((a) => a.workspaceId));

  await prisma.$transaction(async (tx) => {
    // 单空间单绑定约束：删除「同空间、其他定义」的绑定（避免两个定义竞争同一 workspace_byo_model 行）
    if (targetWs.length > 0) {
      await tx.user_byo_model_assignment.deleteMany({
        where: { workspaceId: { in: targetWs }, NOT: { defId } },
      });
    }
    // 写入/更新本定义的绑定
    for (const wsId of targetWs) {
      const cfg = incoming.get(wsId)!;
      await tx.user_byo_model_assignment.upsert({
        where: { defId_workspaceId: { defId, workspaceId: wsId } },
        create: { defId, workspaceId: wsId, enabled: cfg.enabled, shareWithMembers: cfg.shareWithMembers },
        update: { enabled: cfg.enabled, shareWithMembers: cfg.shareWithMembers },
      });
    }
    // 解除本次未包含的旧绑定
    const toUnbind = Array.from(prevWs).filter((w) => !incoming.has(w));
    if (toUnbind.length > 0) {
      await tx.user_byo_model_assignment.deleteMany({ where: { defId, workspaceId: { in: toUnbind } } });
    }
  });

  // materialize：写入的目标空间同步生效行；解绑的空间移除生效行
  for (const wsId of targetWs) {
    const cfg = incoming.get(wsId)!;
    await materializeToWorkspace(def, wsId, cfg.enabled, cfg.shareWithMembers);
  }
  const toUnbind = Array.from(prevWs).filter((w) => !incoming.has(w));
  for (const wsId of toUnbind) {
    await removeMaterialized(wsId);
  }

  return await listUserByoModels(def.ownerUserId);
}
