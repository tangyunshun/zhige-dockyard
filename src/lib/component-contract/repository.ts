/**
 * 通用组件合同持久化仓储、生命周期并发锁与审计事务保障
 *
 * 核心架构与工程防线：
 * 1. 严格 0 any 类型：全面采用 Prisma.InputJsonValue 与结构化序列化保证类型绝对安全；
 * 2. CAS 乐观锁防并发篡改：
 *    - updateDraft: 必须要求 id + lifecycle='DRAFT'，防止并发发布后慢更新篡改已发布只读内容；
 *    - publish: 严格执行 DRAFT -> PUBLISHED 原子转换，并发发布只能有一次成功；
 *    - archive: 严格原子迁移至 ARCHIVED，具备确定性的重复归档幂等语义；
 *    - create: 捕获底层唯一键冲突 (P2002)，精确映射为稳定领域错误码 CONTRACT_VERSION_EXISTS；
 * 3. 严格审计与生命周期同事务绑定：
 *    - 核心发布/归档与 operationlog 在同一 prisma.$transaction 中执行；
 *    - 审计写入失败则全事务强制回滚，杜绝“吞掉异常导致无审计变更”的安全隐患；
 * 4. publishedBy 历史操作者快照语义：
 *    - publishedBy 记录发版时刻平台管理员身份快照，作为版本不可变审计元数据锁入合同行与快照，历史不可篡改。
 */

import { NextRequest } from "next/server";
import { Prisma, componentcontract } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClientIP } from "@/lib/ip-risk";
import { ComponentContractError } from "./errors";
import {
  ComponentContract,
  ComponentContractSnapshot,
  ContractLifecycle,
} from "./types";
import { validateComponentContract } from "./validators";
import { assertNoModelBindingFields } from "./capabilities";
import { buildComponentContractSnapshot } from "./snapshot";

/** 数据库持久化实体结构映射 (0 any) */
export interface ComponentContractRecord {
  id: string;
  componentId: string;
  contractVersion: string;
  lifecycle: ContractLifecycle;
  description: string | null;
  contract: ComponentContract;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 将已校验的合同对象纯净转换为 Prisma 可接收的 InputJsonValue (0 any)
 */
function toPrismaJson(contract: ComponentContract): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(contract)) as Prisma.InputJsonValue;
}

/**
 * 校验模型绑定禁用项
 */
function assertCleanContractStructure(contractRaw: unknown): void {
  // 1. 递归校验字段名，严禁包含 providerId, modelId, upstreamModel, baseUrl, apiKeyEnv 等
  assertNoModelBindingFields(contractRaw);

  // 2. 额外对顶层及常见层级进行防御性直接检测
  if (contractRaw && typeof contractRaw === "object") {
    const rawObj = contractRaw as Record<string, unknown>;
    const forbiddenTopKeys = [
      "providerId",
      "modelId",
      "upstreamModel",
      "baseUrl",
      "apiKeyEnv",
      "apiKey",
      "endpoint",
    ];
    for (const key of forbiddenTopKeys) {
      if (key in rawObj) {
        throw new ComponentContractError(
          "FORBIDDEN_MODEL_BINDING",
          `合同中显式包含了被禁止的模型绑定字段 [${key}]！合同结构不得绑定具体模型或提供商。`
        );
      }
    }
  }
}

/**
 * 在事务内部执行强一致性审计日志持久化
 *
 * 关键安全保障：
 * 本函数绝不吞掉任何数据库或类型异常。一旦审计日志写入失败，
 * 异常立即向外抛出并促使外部 prisma.$transaction 整体回滚，确保审计与状态变更同生共死。
 */
export async function writeStrictAuditLogInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
  details: Prisma.InputJsonValue,
  ipAddress?: string | null,
  workspaceId?: string | null
): Promise<void> {
  const randomId =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  await tx.operationlog.create({
    data: {
      id: randomId,
      userId,
      workspaceId: workspaceId || null,
      action,
      resource: action.split(":")[0] || "component_contract",
      details,
      ipAddress: ipAddress || null,
    },
  });
}

/**
 * 获取指定组件的所有合同版本列表（按创建时间与版本倒序）
 */
export async function listComponentContracts(
  componentId: string
): Promise<ComponentContractRecord[]> {
  if (!componentId || typeof componentId !== "string") {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      "缺少合法的 componentId 参数！"
    );
  }

  // 校验组件是否存在
  const comp = await prisma.componentcatalog.findUnique({
    where: { id: componentId },
    select: { id: true, name: true },
  });
  if (!comp) {
    throw new ComponentContractError(
      "COMPONENT_NOT_FOUND",
      `组件 [${componentId}] 在系统目录中不存在！`
    );
  }

  const records = await prisma.componentcontract.findMany({
    where: { componentId },
    orderBy: [{ createdAt: "desc" }],
  });

  return records.map((r: componentcontract) => ({
    id: r.id,
    componentId: r.componentId,
    contractVersion: r.contractVersion,
    lifecycle: r.lifecycle as ContractLifecycle,
    description: r.description,
    contract: r.contract as unknown as ComponentContract,
    publishedAt: r.publishedAt,
    publishedBy: r.publishedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * 获取指定组件的指定版本合同
 */
export async function getComponentContract(
  componentId: string,
  contractVersion: string
): Promise<ComponentContractRecord | null> {
  const record = await prisma.componentcontract.findUnique({
    where: {
      componentId_contractVersion: {
        componentId,
        contractVersion,
      },
    },
  });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    componentId: record.componentId,
    contractVersion: record.contractVersion,
    lifecycle: record.lifecycle as ContractLifecycle,
    description: record.description,
    contract: record.contract as unknown as ComponentContract,
    publishedAt: record.publishedAt,
    publishedBy: record.publishedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * 创建新草稿合同 (DRAFT)
 * 并发安全：捕获底层唯一索引冲突 (Prisma P2002)，确定性映射为 CONTRACT_VERSION_EXISTS
 */
export async function createDraftContract(params: {
  componentId: string;
  contractVersion: string;
  contract: unknown;
  description?: string;
}): Promise<ComponentContractRecord> {
  const { componentId, contractVersion, contract, description } = params;

  // 1. 检查组件是否存在
  const comp = await prisma.componentcatalog.findUnique({
    where: { id: componentId },
    select: { id: true, name: true },
  });
  if (!comp) {
    throw new ComponentContractError(
      "COMPONENT_NOT_FOUND",
      `组件 [${componentId}] 在系统目录中不存在！`
    );
  }

  // 2. 强安全校验：严禁模型绑定字段
  assertCleanContractStructure(contract);

  // 3. 纯领域完整校验
  const validated = validateComponentContract(contract);

  // 4. 校验元信息一致性
  if (validated.componentId !== componentId) {
    throw new ComponentContractError(
      "CONTRACT_IDENTITY_MISMATCH",
      `合同内 componentId [${validated.componentId}] 与请求参数 [${componentId}] 不一致！`
    );
  }
  if (validated.contractVersion !== contractVersion) {
    throw new ComponentContractError(
      "CONTRACT_VERSION_MISMATCH",
      `合同内 contractVersion [${validated.contractVersion}] 与请求参数 [${contractVersion}] 不一致！`
    );
  }
  if (validated.lifecycle !== "DRAFT") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `新建合同状态必须为 [DRAFT]，实际为 [${validated.lifecycle}]！`
    );
  }

  // 5. 持久化写入（带 P2002 唯一键并发冲突映射）
  try {
    const created = await prisma.componentcontract.create({
      data: {
        componentId,
        contractVersion,
        lifecycle: "DRAFT",
        description: description || null,
        contract: toPrismaJson(validated),
        publishedAt: null,
        publishedBy: null,
      },
    });

    return {
      id: created.id,
      componentId: created.componentId,
      contractVersion: created.contractVersion,
      lifecycle: created.lifecycle as ContractLifecycle,
      description: created.description,
      contract: created.contract as unknown as ComponentContract,
      publishedAt: created.publishedAt,
      publishedBy: created.publishedBy,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  } catch (error) {
    // 捕获 Prisma 唯一索引冲突代码 P2002
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ComponentContractError(
        "CONTRACT_VERSION_EXISTS",
        `组件 [${componentId}] 的合同版本 [${contractVersion}] 已存在，不可重复创建！`
      );
    }
    throw error;
  }
}

/**
 * 修改草稿合同 (CAS 防并发篡改机制)
 *
 * 核心并发安全机制：
 * 采用原子条件更新 `updateMany({ where: { id: current.id, lifecycle: "DRAFT" } })`。
 * 哪怕并发操作在读取当前状态后立即发布了该版本，本修改由于找不到处于 DRAFT 的记录，
 * 将原子性地返回 count=0，并抛出 CONTRACT_IMMUTABLE，绝不让慢速的草稿修改覆盖已发布上线的只读合同！
 */
export async function updateDraftContract(params: {
  componentId: string;
  contractVersion: string;
  contract: unknown;
  description?: string;
}): Promise<ComponentContractRecord> {
  const { componentId, contractVersion, contract, description } = params;

  // 1. 查询现有记录
  const current = await prisma.componentcontract.findUnique({
    where: {
      componentId_contractVersion: {
        componentId,
        contractVersion,
      },
    },
  });
  if (!current) {
    throw new ComponentContractError(
      "CONTRACT_NOT_FOUND",
      `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
    );
  }

  // 2. 状态机硬防线：前置判断
  if (current.lifecycle !== "DRAFT") {
    throw new ComponentContractError(
      "CONTRACT_IMMUTABLE",
      `当前合同版本处于 [${current.lifecycle}] 状态，已发布或已归档合同版本不可原地修改！如需调整请创建新版本。`
    );
  }

  // 3. 强安全校验：严禁模型绑定字段
  assertCleanContractStructure(contract);

  // 4. 纯领域完整校验
  const validated = validateComponentContract(contract);

  // 5. 校验元信息一致性
  if (validated.componentId !== componentId) {
    throw new ComponentContractError(
      "CONTRACT_IDENTITY_MISMATCH",
      `合同内 componentId [${validated.componentId}] 与参数 [${componentId}] 不一致！`
    );
  }
  if (validated.contractVersion !== contractVersion) {
    throw new ComponentContractError(
      "CONTRACT_VERSION_MISMATCH",
      `合同内 contractVersion [${validated.contractVersion}] 与参数 [${contractVersion}] 不一致！`
    );
  }
  if (validated.lifecycle !== "DRAFT") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `草稿合同修改后状态必须保持为 [DRAFT]，实际为 [${validated.lifecycle}]！`
    );
  }

  // 6. CAS 原子条件更新：必须且仅当生命周期仍为 DRAFT 时才允许更新！
  const casResult = await prisma.componentcontract.updateMany({
    where: {
      id: current.id,
      lifecycle: "DRAFT",
    },
    data: {
      description: description !== undefined ? description : current.description,
      contract: toPrismaJson(validated),
    },
  });

  if (casResult.count === 0) {
    // 说明在读取和更新的毫秒级窗口内，该版本已被发布或归档
    throw new ComponentContractError(
      "CONTRACT_IMMUTABLE",
      `并发冲突：合同版本 [${contractVersion}] 已在并发请求中被发布或归档，不可修改已发布内容！`
    );
  }

  const updated = await prisma.componentcontract.findUniqueOrThrow({
    where: { id: current.id },
  });

  return {
    id: updated.id,
    componentId: updated.componentId,
    contractVersion: updated.contractVersion,
    lifecycle: updated.lifecycle as ContractLifecycle,
    description: updated.description,
    contract: updated.contract as unknown as ComponentContract,
    publishedAt: updated.publishedAt,
    publishedBy: updated.publishedBy,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * 发布合同版本 (CAS 状态机 + 强一致事务审计)
 *
 * 核心语义与事务保证：
 * 1. CAS: 严格限定 DRAFT -> PUBLISHED，并发发布仅 1 次成功，冲突抛出 CONCURRENT_PUBLISH_CONFLICT；
 * 2. 同事务提交：合同状态变更与 operationlog 写入置于同一个 prisma.$transaction 中；
 *    若审计失败抛出异常，整个生命周期变更彻底回滚，杜绝无审计的幽灵发版；
 * 3. publishedBy 语义：
 *    - 严格记录当时审批发版的管理员 ID，作为历史操作者不可变快照字段落库；
 *    - 后续哪怕该管理员角色调整或离职，该历史版本的发版人证据链永久固化。
 */
export async function publishContract(params: {
  componentId: string;
  contractVersion: string;
  publishedBy: string;
  autoActivate?: boolean;
  request?: NextRequest;
}): Promise<ComponentContractRecord> {
  const { componentId, contractVersion, publishedBy, autoActivate = true, request } = params;

  // 1. 查询现有版本
  const current = await prisma.componentcontract.findUnique({
    where: {
      componentId_contractVersion: {
        componentId,
        contractVersion,
      },
    },
  });
  if (!current) {
    throw new ComponentContractError(
      "CONTRACT_NOT_FOUND",
      `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
    );
  }

  // 校验归属组件一致性
  if (current.componentId !== componentId) {
    throw new ComponentContractError(
      "CONTRACT_IDENTITY_MISMATCH",
      `合同记录所属组件 [${current.componentId}] 与请求组件 [${componentId}] 不一致！`
    );
  }

  if (current.lifecycle === "PUBLISHED") {
    throw new ComponentContractError(
      "CONTRACT_ALREADY_PUBLISHED",
      `该合同版本 [${contractVersion}] 已经处于发布状态，不可重复发布！`
    );
  }

  if (current.lifecycle === "ARCHIVED") {
    throw new ComponentContractError(
      "CONTRACT_ARCHIVED_CANNOT_PUBLISH",
      `已归档版本 [${contractVersion}] 无法直接发布！`
    );
  }

  // 2. 构造准备发布的合同对象并进行完整校验
  const draftContract = current.contract as unknown as ComponentContract;
  const publishTime = new Date().toISOString();
  const toPublishContract: ComponentContract = {
    ...draftContract,
    componentId,
    contractVersion,
    lifecycle: "PUBLISHED",
    publishedAt: publishTime,
    publishedBy,
  };

  // 校验模型绑定与纯领域规则
  assertCleanContractStructure(toPublishContract);
  const validated = validateComponentContract(toPublishContract);

  let clientIp: string | null = null;
  if (request) {
    clientIp = getClientIP(request);
  }

  // 3. 在同一显式事务中执行 CAS 更新、目录激活原子绑定与严格审计日志写入
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 3.1 CAS 条件更新：仅在处于 DRAFT 时原子升级为 PUBLISHED
    const updateResult = await tx.componentcontract.updateMany({
      where: {
        id: current.id,
        lifecycle: "DRAFT",
      },
      data: {
        lifecycle: "PUBLISHED",
        contract: toPrismaJson(validated),
        publishedAt: new Date(publishTime),
        publishedBy,
      },
    });

    if (updateResult.count === 0) {
      throw new ComponentContractError(
        "CONCURRENT_PUBLISH_CONFLICT",
        `并发冲突：合同版本 [${contractVersion}] 正在被发布或已被其他操作更新，发布操作已中止！`
      );
    }

    // 3.2 稳定激活语义：同事务原子将该版本设置为组件的 activeContractId
    if (autoActivate) {
      await tx.componentcatalog.update({
        where: { id: componentId },
        data: { activeContractId: current.id },
      });
    }

    // 3.3 严格审计：写入失败直接抛出，触发外层事务自动全量回滚
    await writeStrictAuditLogInTx(
      tx,
      publishedBy,
      "component_contract:publish",
      {
        componentId,
        contractVersion,
        contractId: current.id,
        publishedAt: publishTime,
        activated: autoActivate,
      } as Prisma.InputJsonValue,
      clientIp
    );
  });

  // 4. 重新查询最新状态并返回
  const refreshed = await prisma.componentcontract.findUniqueOrThrow({
    where: { id: current.id },
  });

  return {
    id: refreshed.id,
    componentId: refreshed.componentId,
    contractVersion: refreshed.contractVersion,
    lifecycle: refreshed.lifecycle as ContractLifecycle,
    description: refreshed.description,
    contract: refreshed.contract as unknown as ComponentContract,
    publishedAt: refreshed.publishedAt,
    publishedBy: refreshed.publishedBy,
    createdAt: refreshed.createdAt,
    updatedAt: refreshed.updatedAt,
  };
}

/**
 * 切换/激活指定的已发布合同版本 (同事务严格审计)
 */
export async function activateContract(params: {
  componentId: string;
  contractVersion: string;
  operatorId: string;
  request?: NextRequest;
}): Promise<ComponentContractRecord> {
  const { componentId, contractVersion, operatorId, request } = params;

  const current = await prisma.componentcontract.findUnique({
    where: {
      componentId_contractVersion: {
        componentId,
        contractVersion,
      },
    },
  });
  if (!current) {
    throw new ComponentContractError(
      "CONTRACT_NOT_FOUND",
      `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
    );
  }

  if (current.componentId !== componentId) {
    throw new ComponentContractError(
      "CONTRACT_IDENTITY_MISMATCH",
      `合同所属组件 [${current.componentId}] 与目标组件 [${componentId}] 不一致！`
    );
  }

  if (current.lifecycle !== "PUBLISHED") {
    throw new ComponentContractError(
      "CONTRACT_NOT_PUBLISHED_CANNOT_ACTIVATE",
      `合同版本 [${contractVersion}] 处于 [${current.lifecycle}] 状态，仅有已发布 (PUBLISHED) 版本允许激活！`
    );
  }

  let clientIp: string | null = null;
  if (request) {
    clientIp = getClientIP(request);
  }

  // 统一事务 + 固定锁序（component_catalog 行 -> component_contract 行）：
  // 生命周期状态与 activeContractId 一律在**事务内重新读取**后再裁决，杜绝检查-写入之间的竞态窗口。
  const activatedId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 固定锁序 1：锁 component_catalog 行
    const catalogs = await tx.$queryRaw<Array<{ id: string; active_contract_id: string | null }>>`
      SELECT \`id\`, \`active_contract_id\` FROM \`component_catalog\` WHERE \`id\` = ${componentId} FOR UPDATE
    `;
    if (catalogs.length === 0) {
      throw new ComponentContractError("COMPONENT_NOT_FOUND", `目标组件 [${componentId}] 不存在！`);
    }

    // 固定锁序 2：锁目标 component_contract 行并重新读取 lifecycle
    const rows = await tx.$queryRaw<
      Array<{ id: string; component_id: string; contract_version: string; lifecycle: string }>
    >`
      SELECT \`id\`, \`component_id\`, \`contract_version\`, \`lifecycle\`
      FROM \`component_contract\` WHERE \`id\` = ${current.id} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new ComponentContractError(
        "CONTRACT_NOT_FOUND",
        `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
      );
    }
    const cur = rows[0];
    if (cur.component_id !== componentId) {
      throw new ComponentContractError(
        "CONTRACT_IDENTITY_MISMATCH",
        `合同所属组件 [${cur.component_id}] 与目标组件 [${componentId}] 不一致！`
      );
    }
    // 事务内重新裁决：只有**仍为 PUBLISHED** 的合同才允许被激活，
    // 从而保证 activeContractId 永远不可能指向 DRAFT / ARCHIVED。
    if (cur.lifecycle !== "PUBLISHED") {
      throw new ComponentContractError(
        "CONTRACT_NOT_PUBLISHED_CANNOT_ACTIVATE",
        `合同版本 [${cur.contract_version}] 处于 [${cur.lifecycle}] 状态，仅有已发布 (PUBLISHED) 版本允许激活！`
      );
    }

    // 更新组件激活外键
    await tx.componentcatalog.update({
      where: { id: componentId },
      data: { activeContractId: cur.id },
    });

    // 严格审计日志：与状态更新处于同一事务，失败触发整体回滚
    await writeStrictAuditLogInTx(
      tx,
      operatorId,
      "component_contract:activate",
      {
        componentId,
        contractVersion,
        contractId: cur.id,
      } as Prisma.InputJsonValue,
      clientIp
    );

    return cur.id;
  });

  const fresh = await prisma.componentcontract.findUniqueOrThrow({ where: { id: activatedId } });
  return {
    id: fresh.id,
    componentId: fresh.componentId,
    contractVersion: fresh.contractVersion,
    lifecycle: fresh.lifecycle as ContractLifecycle,
    description: fresh.description,
    contract: fresh.contract as unknown as ComponentContract,
    publishedAt: fresh.publishedAt,
    publishedBy: fresh.publishedBy,
    createdAt: fresh.createdAt,
    updatedAt: fresh.updatedAt,
  };
}

/**
 * 归档合同版本 (CAS 状态机 + 激活保护 + 幂等语义 + 同事务严格审计)
 *
 * 核心并发与生命周期防线：
 * 1. 激活版本保护：若当前版本为组件正在生效的 activeContractId，严厉阻断归档（抛出 409 ACTIVE_CONTRACT_CANNOT_ARCHIVE）；
 *    必须先切换激活其他已发布版本后再执行归档；
 * 2. 幂等语义：若当前记录已经是 ARCHIVED，直接幂等返回当前已归档实体，不报错；
 * 3. 严格审计同事务：更新为 ARCHIVED 与 operationlog 记录严格在同一事务提交，审计写入失败时生命周期更新整体回滚。
 */
export async function archiveContract(params: {
  componentId: string;
  contractVersion: string;
  operatorId: string;
  request?: NextRequest;
}): Promise<ComponentContractRecord> {
  const { componentId, contractVersion, operatorId, request } = params;

  const current = await prisma.componentcontract.findUnique({
    where: {
      componentId_contractVersion: {
        componentId,
        contractVersion,
      },
    },
  });
  if (!current) {
    throw new ComponentContractError(
      "CONTRACT_NOT_FOUND",
      `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
    );
  }

  // 约定幂等行为：如果已经是 ARCHIVED，直接幂等返回已归档记录，不重复执行变更与审计
  if (current.lifecycle === "ARCHIVED") {
    return {
      id: current.id,
      componentId: current.componentId,
      contractVersion: current.contractVersion,
      lifecycle: "ARCHIVED",
      description: current.description,
      contract: current.contract as unknown as ComponentContract,
      publishedAt: current.publishedAt,
      publishedBy: current.publishedBy,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
  }

  const contractObj = current.contract as unknown as ComponentContract;
  const archivedContract: ComponentContract = {
    ...contractObj,
    lifecycle: "ARCHIVED",
  };

  let clientIp: string | null = null;
  if (request) {
    clientIp = getClientIP(request);
  }

  // 在同一显式事务中执行 CAS 更新与严格审计；固定锁序与 activateContract 完全一致（先目录后合同）
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 固定锁序 1：锁 component_catalog 行，并在事务内重新读取 activeContractId，
    // 确保「目标合同是否为激活版本」的判定发生在锁内（杜绝检查-更新之间的竞态窗口）
    const catalogs = await tx.$queryRaw<Array<{ id: string; active_contract_id: string | null }>>`
      SELECT \`id\`, \`active_contract_id\` FROM \`component_catalog\` WHERE \`id\` = ${componentId} FOR UPDATE
    `;
    if (catalogs.length === 0) {
      throw new ComponentContractError("COMPONENT_NOT_FOUND", `目标组件 [${componentId}] 不存在！`);
    }
    if (catalogs[0].active_contract_id === current.id) {
      throw new ComponentContractError(
        "ACTIVE_CONTRACT_CANNOT_ARCHIVE",
        `当前合同版本 [${contractVersion}] 处于正在生效的激活状态，禁止直接归档！请先切换激活其他已发布版本后再归档。`
      );
    }

    // 固定锁序 2：锁目标合同行并在事务内重新读取真实 lifecycle
    const rows = await tx.$queryRaw<Array<{ id: string; lifecycle: string }>>`
      SELECT \`id\`, \`lifecycle\` FROM \`component_contract\` WHERE \`id\` = ${current.id} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new ComponentContractError(
        "CONTRACT_NOT_FOUND",
        `组件 [${componentId}] 的合同版本 [${contractVersion}] 不存在！`
      );
    }
    // 幂等：若事务内重读已是 ARCHIVED，则直接跳过变更与审计（不产生重复审计）
    if (rows[0].lifecycle === "ARCHIVED") {
      return;
    }

    // CAS 条件更新：仅在 lifecycle 等于**事务内重读到的**状态时更新
    const updateResult = await tx.componentcontract.updateMany({
      where: {
        id: current.id,
        lifecycle: rows[0].lifecycle,
      },
      data: {
        lifecycle: "ARCHIVED",
        contract: toPrismaJson(archivedContract),
      },
    });

    if (updateResult.count === 0) {
      throw new ComponentContractError(
        "CONCURRENT_PUBLISH_CONFLICT",
        `并发冲突：合同版本 [${contractVersion}] 状态已发生变更，归档操作已中止！`
      );
    }

    // 严格审计：失败则事务全量回滚
    await writeStrictAuditLogInTx(
      tx,
      operatorId,
      "component_contract:archive",
      {
        componentId,
        contractVersion,
        contractId: current.id,
        previousLifecycle: current.lifecycle,
      } as Prisma.InputJsonValue,
      clientIp
    );
  });

  const refreshed = await prisma.componentcontract.findUniqueOrThrow({
    where: { id: current.id },
  });

  return {
    id: refreshed.id,
    componentId: refreshed.componentId,
    contractVersion: refreshed.contractVersion,
    lifecycle: refreshed.lifecycle as ContractLifecycle,
    description: refreshed.description,
    contract: refreshed.contract as unknown as ComponentContract,
    publishedAt: refreshed.publishedAt,
    publishedBy: refreshed.publishedBy,
    createdAt: refreshed.createdAt,
    updatedAt: refreshed.updatedAt,
  };
}

/**
 * 获取组件当前激活生效的不可变合同快照 (Studio 运行时直连服务，0 回落，0 猜测)
 *
 * 核心裁决原则：
 * 1. 严格以 componentcatalog.activeContractId 外键为唯一生产真源；
 * 2. 缺失激活外键或激活记录不存在，直接抛出 NO_ACTIVE_CONTRACT；
 * 3. 激活合同为 DRAFT 或 ARCHIVED 时，坚决阻断执行并抛出明确领域错误码；
 * 4. 绝对不允许回退到旧 detail.executionProfile，绝不降级模拟。
 */
export async function getActiveContractSnapshot(
  componentId: string
): Promise<{
  contractId: string;
  contractVersion: string;
  snapshot: ComponentContractSnapshot;
}> {
  if (!componentId || typeof componentId !== "string") {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      "必须指定有效的 componentId！"
    );
  }

  const comp = await prisma.componentcatalog.findUnique({
    where: { id: componentId },
    include: {
      activeContract: true,
    },
  });

  if (!comp) {
    throw new ComponentContractError(
      "COMPONENT_NOT_FOUND",
      `组件 [${componentId}] 在系统目录中不存在！`
    );
  }

  if (!comp.activeContractId || !comp.activeContract) {
    throw new ComponentContractError(
      "NO_ACTIVE_CONTRACT",
      `组件 [${componentId}] 尚未配置或激活有效执行合同，无法执行！`
    );
  }

  const activeContract = comp.activeContract;

  if (activeContract.lifecycle === "ARCHIVED") {
    throw new ComponentContractError(
      "CONTRACT_ARCHIVED_CANNOT_EXECUTE",
      `当前激活合同版本 [${activeContract.contractVersion}] 已被归档，不可作为可执行快照！`
    );
  }

  if (activeContract.lifecycle === "DRAFT") {
    throw new ComponentContractError(
      "CONTRACT_DRAFT_CANNOT_EXECUTE",
      `当前激活合同版本 [${activeContract.contractVersion}] 处于草稿状态，不可执行，请先发布！`
    );
  }

  if (activeContract.lifecycle !== "PUBLISHED") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `当前激活合同版本 [${activeContract.contractVersion}] 处于异常状态 [${activeContract.lifecycle}]，无法执行！`
    );
  }

  if (activeContract.componentId !== componentId) {
    throw new ComponentContractError(
      "CONTRACT_IDENTITY_MISMATCH",
      `合同绑定异常：激活合同所属组件 [${activeContract.componentId}] 与目录组件 [${componentId}] 不一致！`
    );
  }

  const snapshot = buildComponentContractSnapshot(
    activeContract.contract as unknown as ComponentContract
  );

  return {
    contractId: activeContract.id,
    contractVersion: activeContract.contractVersion,
    snapshot,
  };
}

/**
 * 获取不可变已发布合同快照（只读服务，深拷贝并递归深冻结）
 *
 * 核心保障：
 * 1. 只有 PUBLISHED 状态可以生成并返回执行快照；
 * 2. ARCHIVED 状态明确拒绝（抛出 CONTRACT_ARCHIVED_CANNOT_EXECUTE）；
 * 3. DRAFT 状态明确拒绝（抛出 CONTRACT_DRAFT_CANNOT_EXECUTE）；
 * 4. 当未指定 contractVersion 时，严格通过 activeContractId 裁决当前激活版本，绝不“按时间猜最新版本”！
 */
export async function getImmutableContractSnapshot(
  componentId: string,
  contractVersion?: string
): Promise<ComponentContractSnapshot> {
  if (!componentId) {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      "必须指定有效的 componentId！"
    );
  }

  if (!contractVersion) {
    // 严格按 activeContractId 裁决，消除“按时间猜版本”的双真源隐患
    const activeResult = await getActiveContractSnapshot(componentId);
    return activeResult.snapshot;
  }

  const record = await getComponentContract(componentId, contractVersion);
  if (!record) {
    throw new ComponentContractError(
      "CONTRACT_NOT_FOUND",
      `未找到组件 [${componentId}] 的指定合同版本 [${contractVersion}]！`
    );
  }

  // 状态检查
  if (record.lifecycle === "ARCHIVED") {
    throw new ComponentContractError(
      "CONTRACT_ARCHIVED_CANNOT_EXECUTE",
      `合同版本 [${record.contractVersion}] 已被归档，不可作为可执行快照！`
    );
  }

  if (record.lifecycle === "DRAFT") {
    throw new ComponentContractError(
      "CONTRACT_DRAFT_CANNOT_EXECUTE",
      `合同版本 [${record.contractVersion}] 处于草稿状态，不可生成可执行快照，请先完成发布！`
    );
  }

  // 利用纯领域快照构建器，执行深拷贝与深冻结
  return buildComponentContractSnapshot(record.contract);
}
