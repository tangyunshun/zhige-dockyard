import { prisma } from "./prisma";
import crypto from "crypto";

/**
 * 自动确保指定的 Workspace 已经初始化了默认绑定的 3 个效能组件
 * 默认组件包括：
 * 1. C01: 招标文件智能解析
 * 2. C02: 方案安全合规体检
 * 3. C07: 会议纪要自动转需求(PRD)
 * 
 * 如果该空间在 componentusage 表中没有任何记录，说明这是一个全新空间或测试老空间，
 * 我们在此为其进行兜底物理数据初始化，以实现自愈。
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

    // 2. 检查该空间是否已经在 componentusage 表中配置过任何记录
    const count = await prisma.componentusage.count({
      where: { workspaceId }
    });

    // 3. 若 count === 0，说明该空间从来没有初始化过任何组件绑定关系
    // 此时我们需要物理导入 C01, C02, C07
    if (count === 0) {
      console.log(`[自愈哨兵] 检测到全新工作空间 ${workspaceId} (类型: ${ws.type})，自动执行默认组件物理载入初始化...`);
      
      const defaultIds = ["C01", "C02", "C07"];
      const targetUserId = userId || ws.ownerId;

      await prisma.componentusage.createMany({
        data: defaultIds.map(componentId => ({
          id: crypto.randomUUID(),
          userId: targetUserId,
          componentId,
          workspaceId,
          usedAt: new Date(),
          metadata: { enabled: true },
        }))
      });

      console.log(`[自愈哨兵] 空间 ${workspaceId} 默认组件初始化完成！已绑定组件: [C01, C02, C07]`);
    }
  } catch (error) {
    console.error(`[自愈哨兵] 初始化空间 ${workspaceId} 默认组件失败:`, error);
  }
}
