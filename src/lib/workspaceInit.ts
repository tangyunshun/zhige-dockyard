import { prisma } from "./prisma";
import crypto from "crypto";

/**
 * 统计指定工作空间的"已装配组件数"。
 * 统计口径与空间内 /api/studio?action=bound 完全一致：
 * - 仅统计真实装配记录（componentusage.metadata 含 enabled 布尔标记），纯使用日志不计入；
 * - 仅统计已发布组件（component_catalog.isPublished = true），
 *   系统内部引擎（如 AI_ENGINE，isPublished = false）不计入用户可见组件数，
 *   保证"中枢显示数量"与"进入空间后组件大厅可见组件数量"严格一致。
 * 该函数是空间中枢、空间列表、企业空间列表等所有组件数量展示的唯一权威来源。
 */
export async function getBoundComponentCount(workspaceId: string): Promise<number> {
  const usages = await prisma.componentusage.findMany({
    where: { workspaceId },
    select: { componentId: true, metadata: true },
  });

  const boundIdSet = new Set<string>();
  usages.forEach(u => {
    if (!u.metadata) return;
    try {
      const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
      if (meta && typeof meta.enabled === "boolean") {
        boundIdSet.add(u.componentId);
      }
    } catch {
      // metadata 解析失败：保守视为装配记录
      boundIdSet.add(u.componentId);
    }
  });

  // 过滤未发布组件：仅保留已发布目录中的组件，避免内部引擎导致中枢计数与空间内可见数不一致
  if (boundIdSet.size > 0) {
    const published = await prisma.componentcatalog.findMany({
      where: { id: { in: Array.from(boundIdSet) }, isPublished: true },
      select: { id: true },
    });
    return published.length;
  }

  return 0;
}

/**
 * 自动确保指定的 Workspace 已经初始化了默认绑定的 5 个效能组件
 * 默认组件包括：
 * 1. C01: 招标文件智能解析
 * 2. C02: 方案安全合规体检
 * 3. C07: 会议纪要自动转需求(PRD)
 * 4. C11: 原型图自动生成
 * 5. C12: 部署状态可视化看板
 *
 * 自愈规则（与 componentusage 绑定语义严格一致）：
 * - 仅当该空间当前【不存在任何 componentusage 记录（含纯使用日志）且无任何组件操作审计】时，
 *   才视为全新空间，兜底物理初始化默认组件。
 * - 一旦空间内存在使用 / 装配 / 解除 / 启停任一记录，即视为"用户已介入"，一律尊重用户操作，绝不干预：
 *   用户解除过的组件不会因自愈哨兵而"复活"，解除后刷新页面仍然保持已解除状态。
 *
 * @param workspaceId 工作空间 ID
 * @param userId 操作用户 ID（非必填，自动读取空间所有者 ID 进行兜底）
 */
export async function ensureDefaultComponents(workspaceId: string, userId?: string) {
  try {
    // 1. 获取工作空间信息
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { type: true, ownerId: true }
    });

    if (!ws) {
      console.log(`[自愈哨兵] 未找到 ID 为 ${workspaceId} 的工作空间，跳过组件初始化`);
      return;
    }

    // 2. 获取该空间现有 componentusage 记录，判定是否已有"真实装配记录"
    const existingUsages = await prisma.componentusage.findMany({
      where: { workspaceId },
      select: { componentId: true, metadata: true }
    });

    // 3. 防御性判定：只要该空间存在任何 componentusage 记录（含纯使用日志）
    //    或用户操作过组件（装配/解绑/启停/执行任一动作），即视为"用户已介入"，
    //    一律尊重用户结果，绝对不自动复活补绑默认组件。
    //    注意：组件"使用日志"（metadata 无 enabled 标记）也计入"已介入"，
    //    防止卸载后执行任务产生的使用记录在特定时序下被自愈哨兵误判为全新空间而重新装配。
    const hasAnyUsage = existingUsages.length > 0;
    const hasAuditLog = await prisma.operationlog.findFirst({
      where: {
        workspaceId,
        action: { in: [
          "UNBIND_COMPONENT", "UNINSTALL_COMPONENT", "DELETE_COMPONENT",
          "BIND_COMPONENT", "SET_RESTRICTED_COMPONENTS",
          "ENABLE_COMPONENT", "DISABLE_COMPONENT", "component:execute",
        ] }
      },
      select: { id: true }
    });

    if (hasAnyUsage || hasAuditLog) {
      return;
    }

    const existingIds = new Set(existingUsages.map(u => u.componentId));
    // 默认装配组件列表：一律从 component_catalog.isDefault 标记读取（不再硬编码组件 ID）
    const defaultCatalog = await prisma.componentcatalog.findMany({
      where: { isDefault: true },
      select: { id: true },
    });
    const targetDefaultIds = defaultCatalog.map(c => c.id);
    const missingIds = targetDefaultIds.filter(id => !existingIds.has(id));

    // 4. 全新空间（无任何真实装配记录）：兜底补全默认 5 套件组件
    if (missingIds.length > 0) {
      console.log(`[自愈哨兵] 检测到全新工作空间 ${workspaceId} (类型: ${ws.type}) 无任何装配记录，自动执行标准 5 套件组件初始化...`);

      const targetUserId = userId || ws.ownerId;

      await prisma.componentusage.createMany({
        data: missingIds.map(componentId => ({
          id: crypto.randomUUID(),
          userId: targetUserId,
          componentId,
          workspaceId,
          usedAt: new Date(),
          metadata: { enabled: true },
        }))
      });

      console.log(`[自愈哨兵] 空间 ${workspaceId} 组件装配初始化完成！新装配: [${missingIds.join(", ")}]`);
    }
  } catch (error) {
    console.error(`[自愈哨兵] 初始化空间 ${workspaceId} 默认组件失败:`, error);
  }
}
