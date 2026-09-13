/**
 * 管理员删除用户 —— 归属优先的安全删除（A-01）
 *
 * 核心原则：先定归属，再定策略。删除用户「绝对不能」简单粗暴地直接物理删除。
 *
 * 删除前必须先判断数据归属（看他是谁）：
 *   情况 A：个人工作空间的所有者（Owner）
 *     - 删除后个人空间数据将变成无主；
 *     - 必须移交所有权给其他成员，或勾选「一并归档/删除个人空间数据」才能执行。
 *   情况 B：企业工作空间的普通成员
 *     - 个人私密数据（个人笔记等）应清除/匿名化；
 *     - 企业空间内的协作数据（共享文档、代码提交）属于企业资产，必须保留；
 *     - 协作记录中的作者名由展示层显示为「已注销用户」。
 *   情况 C：企业工作空间的唯一所有者（Owner）
 *     - 删除后企业空间将变成无主（操作红线）；
 *     - 后端直接拦截，禁止删除。
 *
 * 执行策略（默认软删除）：
 *   - 逻辑删除（软删除）：status = "deleted"，清空邮箱/手机号等隐私信息（匿名化），
 *     保留 userId 与操作日志，账号不可登录。
 *   - 物理删除（硬删除）：仅当符合「被遗忘权」且数据已备份时由独立定时任务执行，
 *     本仓库为单体 Next.js（无独立调度器），故管理员端点默认只做软删除；
 *     物理清理作为后续独立的 30 天冷静期/备份任务落地。
 */
import { prisma } from "@/lib/prisma";
import { finalizeAccountDeletion } from "@/lib/account-deletion";

/** 归属分类 */
export type DeletionCase =
  | "REGULAR" // 普通用户：无个人空间所有权、非企业成员
  | "PERSONAL_OWNER" // 情况 A：个人空间所有者
  | "ENTERPRISE_MEMBER" // 情况 B：企业空间普通成员
  | "ENTERPRISE_SOLE_OWNER"; // 情况 C：企业空间唯一所有者（红线，拦截）

export interface OwnedWorkspaceSummary {
  id: string;
  name: string;
  /** 是否还有其它 OWNER 成员（false = 唯一所有者，触发情况 C） */
  soleOwner: boolean;
}

export interface DeletionPreview {
  exists: boolean;
  name: string | null;
  email: string | null;
  case: DeletionCase;
  dataSummary: {
    /** 拥有的工作空间数量（个人 + 企业） */
    ownedWorkspaceCount: number;
    /** 作为成员参与（非所有者）的企业空间数量 */
    enterpriseMemberWorkspaceCount: number;
    ownedPersonalWorkspaces: OwnedWorkspaceSummary[];
    ownedEnterpriseWorkspaces: OwnedWorkspaceSummary[];
    /** 个人空间内上传的文件数（asset） */
    fileCount: number;
    /** 个人空间内的知识库条目数（document） */
    docCount: number;
    /** 该用户累计消耗的算力 Token（pointledger 出账） */
    tokenConsumed: number;
    /** 该用户相关空间当前剩余算力点余额合计 */
    tokenBalance: number;
  };
  /** 情况 C：拦截原因（含企业空间名） */
  blockers: string[];
  /** 情况 A / B：提示信息 */
  warnings: string[];
  /** 是否为情况 A，需要移交或归档才能执行 */
  requiresTransferOrArchive: boolean;
}

const EMPTY_PREVIEW: DeletionPreview = {
  exists: false,
  name: null,
  email: null,
  case: "REGULAR",
  dataSummary: {
    ownedWorkspaceCount: 0,
    enterpriseMemberWorkspaceCount: 0,
    ownedPersonalWorkspaces: [],
    ownedEnterpriseWorkspaces: [],
    fileCount: 0,
    docCount: 0,
    tokenConsumed: 0,
    tokenBalance: 0,
  },
  blockers: [],
  warnings: [],
  requiresTransferOrArchive: false,
};

/**
 * 删除前分析：判断数据归属并汇总该用户的数据价值。
 * 纯只读，不修改任何数据，供前端弹窗展示与后端执行前二次校验复用。
 */
export async function analyzeUserDeletion(userId: string): Promise<DeletionPreview> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true },
  });
  if (!user) {
    return { ...EMPTY_PREVIEW, exists: false };
  }

  // 1. 拥有哪些工作空间（ownerId = userId）
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, type: true },
  });
  const ownedPersonal = ownedWorkspaces
    .filter((w) => w.type === "PERSONAL")
    .map((w) => ({ id: w.id, name: w.name, soleOwner: false }));
  const ownedEnterprise: OwnedWorkspaceSummary[] = [];
  let soleOwnerBlocked = false;
  for (const w of ownedWorkspaces.filter((w) => w.type === "ENTERPRISE")) {
    const otherOwnerCount = await prisma.workspacemember.count({
      where: { workspaceId: w.id, role: "OWNER", userId: { not: userId } },
    });
    const soleOwner = otherOwnerCount === 0;
    ownedEnterprise.push({ id: w.id, name: w.name, soleOwner });
    if (soleOwner) soleOwnerBlocked = true;
  }

  // 2. 作为成员参与的工作空间（用于判断企业成员 / 资产保留）
  const memberships = await prisma.workspacemember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const memberWsIds = memberships.map((m) => m.workspaceId);
  const memberWorkspaces = memberWsIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: memberWsIds } },
        select: { id: true, type: true, ownerId: true },
      })
    : [];
  const enterpriseMemberWorkspaceCount = memberWorkspaces.filter(
    (w) => w.type === "ENTERPRISE" && w.ownerId !== userId
  ).length;

  // 3. 数据价值汇总
  const personalWsIds = ownedPersonal.map((w) => w.id);
  const fileCount = personalWsIds.length
    ? await prisma.asset.count({ where: { workspaceId: { in: personalWsIds } } })
    : 0;
  const docCount = personalWsIds.length
    ? await prisma.document.count({ where: { workspaceId: { in: personalWsIds } } })
    : 0;

  const tokenConsumedAgg = await prisma.pointledger.aggregate({
    where: { userId, direction: "OUT" },
    _sum: { points: true },
  });
  const tokenConsumed = tokenConsumedAgg._sum.points
    ? Number(tokenConsumedAgg._sum.points)
    : 0;

  const balanceWsIds = Array.from(
    new Set([...ownedWorkspaces.map((w) => w.id), ...memberWsIds])
  );
  let tokenBalance = 0;
  if (balanceWsIds.length) {
    const quotas = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: balanceWsIds } },
    });
    tokenBalance = quotas.reduce((s, q) => s + Number(q.tokenBalance || 0), 0);
  }

  // 4. 归属判定
  const blockers: string[] = [];
  const warnings: string[] = [];
  // 核心安全红线校验：只有已被封禁的用户才允许被删除
  if (user.status !== "banned") {
    const statusText = user.status === "active" ? "正常活跃" : user.status === "inactive" ? "已停用" : user.status;
    blockers.push(
      `该用户当前状态为「${statusText}」，未被封禁。根据平台安全合规红线，只有处于「已封禁」状态的用户才允许被删除。请先对其执行封禁后再行删除。`
    );
  }

  if (soleOwnerBlocked) {
    dc = "ENTERPRISE_SOLE_OWNER";
    const names = ownedEnterprise
      .filter((w) => w.soleOwner)
      .map((w) => w.name)
      .join("、");
    blockers.push(
      `该用户是企业空间「${names}」的唯一所有者，删除将导致企业空间变成无主状态（操作红线）。请先移交企业所有权或注销该企业空间后再删除。`
    );
  } else if (ownedPersonal.length > 0) {
    dc = "PERSONAL_OWNER";
    warnings.push(
      `该用户拥有 ${ownedPersonal.length} 个个人工作空间。删除后其数据将变成无主，必须先将所有权移交给其他成员，或勾选「一并归档/删除个人空间数据」才能执行。`
    );
  } else if (enterpriseMemberWorkspaceCount > 0) {
    dc = "ENTERPRISE_MEMBER";
    warnings.push(
      `该用户是 ${enterpriseMemberWorkspaceCount} 个企业空间的成员。删除后将清除其个人私密数据，企业空间内的协作数据（共享文档、代码提交等）将保留，作者名显示为「已注销用户」。`
    );
  }

  return {
    exists: true,
    name: user.name,
    email: user.email,
    case: dc,
    dataSummary: {
      ownedWorkspaceCount: ownedWorkspaces.length,
      enterpriseMemberWorkspaceCount,
      ownedPersonalWorkspaces: ownedPersonal,
      ownedEnterpriseWorkspaces: ownedEnterprise,
      fileCount,
      docCount,
      tokenConsumed,
      tokenBalance,
    },
    blockers,
    warnings,
    requiresTransferOrArchive: dc === "PERSONAL_OWNER",
  };
}

export interface ExecuteOptions {
  adminId: string;
  /** 情况 A：移交个人空间所有权到的目标用户 ID */
  transferToUserId?: string;
  /** 情况 A：勾选「一并归档/删除个人空间数据」 */
  archivePersonalData?: boolean;
  /** 删除原因（审计用） */
  reason?: string;
}

export interface ExecuteResult {
  case: DeletionCase;
  /** 已软删除（逻辑删除 + 匿名化） */
  softDeleted: boolean;
  /** 已移交所有权的个人/企业空间 ID 列表 */
  transferredWorkspaces: string[];
  /** 已归档的个人空间 ID 列表 */
  archivedWorkspaces: string[];
  message: string;
}

/**
 * 执行管理员删除：归属优先 + 默认软删除。
 * - 只有 status === 'banned'（已封禁）用户才允许删除。
 * - 情况 C 或存在 blocker：直接抛错（不执行任何删除）。
 * - 情况 A：必须 transferToUserId 或 archivePersonalData 二选一，否则抛错。
 * - 情况 B / REGULAR：软删除（逻辑删除 + 匿名化），保留企业资产。
 */
export async function executeAdminUserDeletion(
  userId: string,
  opts: ExecuteOptions
): Promise<ExecuteResult> {
  const preview = await analyzeUserDeletion(userId);
  if (!preview.exists) {
    throw new Error("用户不存在");
  }

  // 核心安全红线拦截：未封禁用户或存在阻断项，坚决禁止删除
  if (preview.blockers.length > 0) {
    throw new Error(preview.blockers.join(" "));
  }

  // 二次数据库状态硬校验
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });
  if (!targetUser || targetUser.status !== "banned") {
    throw new Error("平台安全红线拦截：只有已被封禁的用户才允许被删除。请先封禁该用户。");
  }

  const transferredWorkspaces: string[] = [];
  const archivedWorkspaces: string[] = [];

  // 情况 A-企业侧：若用户是企业空间所有者且存在其它 OWNER 成员，自动把 ownerId 改派给其它所有者，
  // 避免企业空间因 ownerId 指向已注销用户而悬空。
  for (const w of preview.dataSummary.ownedEnterpriseWorkspaces) {
    if (!w.soleOwner) {
      const newOwner = await prisma.workspacemember.findFirst({
        where: { workspaceId: w.id, role: "OWNER", userId: { not: userId } },
        select: { userId: true },
      });
      if (newOwner) {
        await prisma.workspace.update({
          where: { id: w.id },
          data: { ownerId: newOwner.userId },
        });
        transferredWorkspaces.push(w.id);
      }
    }
  }

  // 情况 A-个人侧：移交 or 归档
  if (preview.case === "PERSONAL_OWNER") {
    const personal = preview.dataSummary.ownedPersonalWorkspaces;
    if (opts.transferToUserId) {
      const target = await prisma.user.findUnique({
        where: { id: opts.transferToUserId },
        select: { id: true },
      });
      if (!target) throw new Error("移交目标用户不存在");
      if (target.id === userId) throw new Error("不能将所有权移交给用户本人");
      for (const w of personal) {
        await prisma.workspace.update({
          where: { id: w.id },
          data: { ownerId: target.id },
        });
        await prisma.workspacemember.upsert({
          where: {
            userId_workspaceId: { userId: target.id, workspaceId: w.id },
          },
          create: {
            id: crypto.randomUUID(),
            userId: target.id,
            workspaceId: w.id,
            role: "OWNER",
          },
          update: { role: "OWNER" },
        });
        transferredWorkspaces.push(w.id);
      }
    } else if (opts.archivePersonalData) {
      for (const w of personal) {
        await prisma.workspace.update({
          where: { id: w.id },
          data: { status: "ARCHIVED" },
        });
        archivedWorkspaces.push(w.id);
      }
    } else {
      throw new Error(
        "该用户拥有个人工作空间，删除前必须先将所有权移交给其他成员，或勾选「一并归档/删除个人空间数据」"
      );
    }
  }

  // 默认：软删除（逻辑删除 + 隐私匿名化 + 销毁会话），复用账号注销的脱敏逻辑
  await finalizeAccountDeletion(userId);
  // 额外清理设备索引与 API 密钥，确保账号彻底不可用
  await prisma.userdevice.deleteMany({ where: { userId } });
  await prisma.apikey.deleteMany({ where: { userId } });

  return {
    case: preview.case,
    softDeleted: true,
    transferredWorkspaces,
    archivedWorkspaces,
    message: "用户已软删除（账号不可登录，企业协作数据保留，个人数据已脱敏）",
  };
}
