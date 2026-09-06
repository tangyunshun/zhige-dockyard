import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import crypto from "crypto";
import { ensureDefaultComponents, getBoundComponentCount } from "@/lib/workspaceInit";
import { getMembershipTokenLimit } from "@/lib/quota-token";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// P1-2 优化：自愈逻辑节流缓存，避免每次 list 都触发大量写操作
// 同一用户 5 分钟内只跑一次自愈
const SELF_HEAL_THROTTLE_MS = 5 * 60 * 1000;
const globalForHeal = globalThis as unknown as {
  workspaceSelfHealCache: Map<string, number>;
};
const selfHealCache: Map<string, number> =
  globalForHeal.workspaceSelfHealCache || new Map();
if (!globalForHeal.workspaceSelfHealCache) {
  globalForHeal.workspaceSelfHealCache = selfHealCache;
}

function shouldRunSelfHeal(userId: string): boolean {
  const now = Date.now();
  const last = selfHealCache.get(userId) || 0;
  if (now - last < SELF_HEAL_THROTTLE_MS) return false;
  selfHealCache.set(userId, now);
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      } else {
        userId = authResult.user!.id;
      }
    }

    // 查询用户的所有工作空间（包括作为成员和作为所有者的空间）
    // P3 优化：成员列表与"作为所有者"的列表互不依赖，并行发起缩短总等待
    const [workspaceMembers, ownedWorkspaces] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
              ownerId: true,
              description: true,
              logo: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: {
          joinedAt: "desc",
        },
      }),
      prisma.workspace.findMany({
        where: {
          ownerId: userId,
        },
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          description: true,
          logo: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    // 合并两个结果集，去重
    const workspaceMap = new Map<string, any>();
    
    // P1-3 优化：批量预取逻辑角色，替代循环内逐个查询造成的 N+1
    const { getLogicalWorkspaceRolesBatch } = require("@/lib/security");
    const memberWorkspaceIds = workspaceMembers.map((m: any) => m.workspace.id);
    const roleMap = await getLogicalWorkspaceRolesBatch(userId, memberWorkspaceIds);
    
    for (const member of workspaceMembers) {
      const logicalRole = roleMap.get(member.workspace.id) || member.role;
      workspaceMap.set(member.workspace.id, {
        id: member.workspace.id,
        name: member.workspace.name,
        type: member.workspace.type as "PERSONAL" | "ENTERPRISE",
        role: logicalRole,
        logo: member.workspace.logo,
        description: member.workspace.description,
        createdAt: member.workspace.createdAt,
        updatedAt: member.workspace.updatedAt,
      });
    }

    ownedWorkspaces.forEach((workspace: any) => {
      const existing = workspaceMap.get(workspace.id);
      workspaceMap.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type as "PERSONAL" | "ENTERPRISE",
        role: (existing?.role || "OWNER") as any,
        logo: workspace.logo,
        description: workspace.description,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt || existing?.updatedAt,
      });
    });

    // P1-2 优化：自愈与自动创建逻辑加 5 分钟节流，避免每次 list 都触发大量写操作
    if (shouldRunSelfHeal(userId)) {
    // 检测并修复多重个人工作空间脏数据漏洞 (自愈哨兵)
    const allPersonalWorkspaces = Array.from(workspaceMap.values()).filter(
      (ws: any) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );

    if (allPersonalWorkspaces.length > 1) {
      console.log(`[自愈哨兵] 检测到用户 ${userId} 拥有 ${allPersonalWorkspaces.length} 个个人空间，启动去脏数据清理...`);
      // 按照创建时间升序排序，保留最早的那一个
      const sortedPersonals = allPersonalWorkspaces.sort(
        (a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
      const keepWorkspace = sortedPersonals[0];
      const deleteWorkspaces = sortedPersonals.slice(1);

      for (const deleteWs of deleteWorkspaces) {
        try {
          // 1. 删除该空间绑定的 WorkspaceQuota 配额
          await prisma.workspacequota.deleteMany({
            where: { workspaceId: deleteWs.id }
          });
          // 2. 删除该空间下的成员关联记录
          await prisma.workspacemember.deleteMany({
            where: { workspaceId: deleteWs.id }
          });
          // 3. 删除该工作空间数据本身
          await prisma.workspace.delete({
            where: { id: deleteWs.id }
          });
          
          // 从 map 中移除
          workspaceMap.delete(deleteWs.id);
          console.log(`[自愈哨兵] 成功清理多余个人空间脏数据: ${deleteWs.id} (${deleteWs.name})`);
        } catch (e) {
          console.error(`[自愈哨兵] 清除多余个人空间失败: ${deleteWs.id}`, e);
        }
      }
    }
    // 检测并修复因报错残留的无用空壳企业工作空间 (企业空间自愈去脏哨兵)
    const allOwnedEnterprises = Array.from(workspaceMap.values()).filter(
      (ws: any) => ws.type === "ENTERPRISE" && ws.role === "OWNER"
    );

    // 查询用户的 membershipLevel 以获取其合法的最大空间额度限制
    const dbUserObj = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true }
    });
    const isVipUser = dbUserObj && dbUserObj.membershipLevel !== "FREE";
    const allowedLimit = isVipUser ? 3 : 1;

    // 当且仅当用户名下的企业空间数量已经超出了当前会员等级配额限制时，才激活哨兵去清洗报错多余空壳
    if (allOwnedEnterprises.length > allowedLimit) {
      console.log(`[自愈哨兵] 检测到用户拥有企业空间数 ${allOwnedEnterprises.length} 超过限制 ${allowedLimit}，启动超额去脏清理...`);
      for (const ent of allOwnedEnterprises) {
        if (workspaceMap.size <= allowedLimit) break;
        
        // 检查其关联的成员数量是否为 1
        const memberCount = await prisma.workspacemember.count({
          where: { workspaceId: ent.id }
        });
        if (memberCount <= 1) {
          const wsObj = await prisma.workspace.findUnique({
            where: { id: ent.id },
            select: { createdAt: true }
          });
          const isCreatedToday = wsObj && new Date(wsObj.createdAt).toDateString() === new Date().toDateString();
          
          if (isCreatedToday) {
            console.log(`[自愈哨兵] 清理多余空壳企业空间: ${ent.id} (${ent.name})`);
            try {
              // 1. 删除该空间绑定的 WorkspaceQuota 配额
              await prisma.workspacequota.deleteMany({
                where: { workspaceId: ent.id }
              });
              // 2. 删除该空间下的成员关联记录
              await prisma.workspacemember.deleteMany({
                where: { workspaceId: ent.id }
              });
              // 3. 删除该工作空间数据本身
              await prisma.workspace.delete({
                where: { id: ent.id }
              });
              
              // 从 map 中将该脏数据移除，恢复配额容量
              workspaceMap.delete(ent.id);
            } catch (e) {
              console.error(`[自愈哨兵] 清除残余企业空间失败: ${ent.id}`, e);
            }
          }
        }
      }
    }

    // 检查用户是否拥有归属于自己的个人工作空间
    const hasPersonalWorkspace = Array.from(workspaceMap.values()).some(
      (ws: any) => ws.type === "PERSONAL" && ws.role === "OWNER"
    );

    // 如果用户没有个人工作空间，则自动创建并开通一个默认的个人工作空间，并同步绑定配额
    if (!hasPersonalWorkspace) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true, email: true, membershipLevel: true },
      });
      if (user) {
        const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
        const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const now = new Date();
        
        // 创建 workspace
        const workspace = await prisma.workspace.create({
          data: {
            id: workspaceId,
            name: workspaceName,
            type: 'PERSONAL',
            ownerId: userId,
            description: `${user.name || '用户'}的个人工作空间`,
            createdAt: now,
            updatedAt: now,
          },
        });
        
        // 创建 WorkspaceMember 记录
        const memberId = `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        await prisma.workspacemember.create({
          data: {
            id: memberId,
            userId,
            workspaceId: workspace.id,
            role: 'OWNER',
            joinedAt: now,
          },
        });

        // 匹配会员等级并同步为该个人空间配置 WorkspaceQuota 配额数据，为工坊模拟运行提供算力余额
        const membershipLevel = user.membershipLevel || "FREE";
        let ml = await prisma.membershiplevel.findUnique({
          where: { id: membershipLevel }
        });
        if (!ml) {
          ml = await prisma.membershiplevel.findFirst();
        }
        const mlId = ml?.id || "FREE";
        // tokenLimit 一律从 membershiplevel 表读取真实值，不再写死档位数值
        const tokenLimit = Number(await getMembershipTokenLimit(membershipLevel));

        await prisma.workspacequota.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: workspace.id,
            membershipLevelId: mlId,
            tokenBalance: BigInt(tokenLimit),
            updatedAt: now,
          }
        });
        
        // 更新用户的 lastWorkspaceId
        await prisma.user.update({
          where: { id: userId },
          data: {
            lastWorkspaceId: workspace.id,
          },
        });
        
        // 加入 Map
        workspaceMap.set(workspace.id, {
          id: workspace.id,
          name: workspace.name,
          type: 'PERSONAL',
          role: 'OWNER',
          description: workspace.description,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      }
    }
    } // end P1-2 自愈节流

    // 批量拉取所有工作空间的配额信息，保证前端 WorkspaceInternalLayoutV3 与组件调度面板能准确读取 tokenBalance
    const allWsIds = Array.from(workspaceMap.keys());
    const quotaRecords = await prisma.workspacequota.findMany({
      where: { workspaceId: { in: allWsIds } },
    });
    const quotaMap = new Map<string, any>(quotaRecords.map(q => [q.workspaceId, q]));

    // 获取每个工作空间的组件数量与配额挂载
    const workspacesWithComponents = await Promise.all(
      Array.from(workspaceMap.values()).map(async (workspace) => {
        // 执行自愈兜底初始化（仅全新空间初始化默认组件，不覆盖用户装配/解除结果）
        await ensureDefaultComponents(workspace.id, userId);

        // 组件数统计与空间内 bound 口径一致（仅计真实装配记录）
        const componentCount = await getBoundComponentCount(workspace.id);

        let wsQuota = quotaMap.get(workspace.id);

        // 自愈哨兵：若个人空间缺失配额或免费个人空间算力 <= 0，自动创建/补偿为 100 算力点
        if (workspace.type === "PERSONAL") {
          const userDb = await prisma.user.findUnique({
            where: { id: userId },
            select: { membershipLevel: true },
          });
          const mLevel = userDb?.membershipLevel || "FREE";
          const defaultLimit = Number(await getMembershipTokenLimit(mLevel));
          const targetTokens = defaultLimit > 0 ? defaultLimit : 100;

          if (!wsQuota) {
            let ml = await prisma.membershiplevel.findUnique({ where: { id: mLevel } });
            try {
              wsQuota = await prisma.workspacequota.create({
                data: {
                  id: crypto.randomUUID(),
                  workspaceId: workspace.id,
                  membershipLevelId: ml?.id || "FREE",
                  tokenBalance: BigInt(targetTokens),
                  updatedAt: new Date(),
                },
              });
              quotaMap.set(workspace.id, wsQuota);
            } catch (e) {
              console.warn("[/api/workspace/list] 补齐个人空间配额非致命提示:", e);
            }
          } else if (Number(wsQuota.tokenBalance) <= 0 && mLevel === "FREE") {
            try {
              wsQuota = await prisma.workspacequota.update({
                where: { id: wsQuota.id },
                data: {
                  tokenBalance: BigInt(targetTokens),
                  updatedAt: new Date(),
                },
              });
              quotaMap.set(workspace.id, wsQuota);
            } catch (e) {
              console.warn("[/api/workspace/list] 补偿个人空间 0 算力非致命提示:", e);
            }
          }
        }

        const serializedQuota = wsQuota ? {
          id: wsQuota.id,
          workspaceId: wsQuota.workspaceId,
          membershipLevelId: wsQuota.membershipLevelId,
          tokenBalance: Number(wsQuota.tokenBalance),
          enterpriseSlots: Number(wsQuota.enterpriseSlots || 0),
          usedSlots: Number(wsQuota.usedSlots || 0),
          storageUsed: Number(wsQuota.storageUsed || 0),
          storageLimit: Number(wsQuota.storageLimit || 0),
          apiCallsUsed: Number(wsQuota.apiCallsUsed || 0),
          apiCallsLimit: Number(wsQuota.apiCallsLimit || 0),
        } : null;

        return {
          ...workspace,
          componentCount,
          quota: serializedQuota,
          workspacequota: serializedQuota,
        };
      }),
    );

    // 用户进入空间时（loadWorkspace 带 workspaceId 参数请求）记录最近访问空间，
    // 保证后续 refreshUserState / 组件大厅读取的 currentWorkspaceId 与用户实际所在空间一致，
    // 避免 lastWorkspaceId 停留过期空间导致进入空间后被错误空间数据覆盖
    const targetWsId = request.nextUrl.searchParams.get("workspaceId");
    if (targetWsId && workspaceMap.has(targetWsId)) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { lastWorkspaceId: targetWsId },
        })
        .catch(() => {});
    }

    // 获取用户 lastWorkspaceId 或者是默认第一个
    const userForLastWs = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastWorkspaceId: true },
    });
    
    let currentWorkspaceId = userForLastWs?.lastWorkspaceId || null;
    
    // 确保当前活跃空间在列表中且有效
    if (!currentWorkspaceId && workspacesWithComponents.length > 0) {
      currentWorkspaceId = workspacesWithComponents[0].id;
    } else if (currentWorkspaceId && !workspaceMap.has(currentWorkspaceId) && workspacesWithComponents.length > 0) {
      currentWorkspaceId = workspacesWithComponents[0].id;
    }

    return NextResponse.json({
      workspaces: workspacesWithComponents,
      currentWorkspaceId,
    });
  } catch (error) {
    console.warn("Get workspace list error:", error);
    return NextResponse.json(
      { error: "获取工作空间列表失败" },
      { status: 500 },
    );
  }
}
