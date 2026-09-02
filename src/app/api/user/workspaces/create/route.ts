import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { storageMbToBytes, type WorkspacePlanKey } from "@/constants/workspace-plans";
import { getWorkspacePlanByKey } from "@/lib/workspace-plan-service";

/**
 * 创建工作空间
 *
 * 说明：本路由与 /api/workspace/create-enterprise 为两条并存的创建入口，
 * 必须保持配额初始化口径一致（套餐快照、空间配额记录、默认组件装配），
 * 否则会造成新建空间 quota 为空、算力与存储限额缺失。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

    const body = await request.json();
    const { name, type, description, industry, contactEmail, contactPhone, plan } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 验证工作空间类型
    if (type !== "PERSONAL" && type !== "ENTERPRISE") {
      return NextResponse.json({ error: "无效的工作空间类型" }, { status: 400 });
    }

    // 会员等级与套餐配置：企业空间按套餐初始化，个人空间固定使用标准版
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    const membershipLevelName = dbUser?.membershipLevel || "FREE";

    let ml = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevelName },
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";

    // 创建企业空间需要检查会员等级配额（以数据库 membershiplevel 为准）
    if (type === "ENTERPRISE") {
      const maxEnterprise = ml ? Number(ml.maxEnterpriseWorkspaces) : 1;

      // 统计企业空间数量
      const enterpriseCount = await prisma.workspace.count({
        where: {
          type: "ENTERPRISE",
          OR: [
            { ownerId: userId },
            {
              workspacemember: {
                some: { userId },
              },
            },
          ],
        },
      });

      if (maxEnterprise !== -1 && enterpriseCount >= maxEnterprise) {
        return NextResponse.json(
          {
            error: `企业空间数量已达上限（${maxEnterprise} 个），请升级会员等级`,
            currentLevel: mlId,
            maxEnterprise,
          },
          { status: 403 }
        );
      }
    }

    // 套餐与配额：个人空间固定 STANDARD，企业空间取请求指定的套餐
    const planKey: WorkspacePlanKey =
      type === "ENTERPRISE" ? ((plan || "STANDARD").toString().toUpperCase() as WorkspacePlanKey) : "STANDARD";
    const planConfig = await getWorkspacePlanByKey(planKey);

    // 创建工作空间（同步写入套餐快照与空间配额记录）
    const generateId = (prefix: string) =>
      `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const workspaceId = generateId("ws");

    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name,
        type,
        description: description || null,
        industry: industry || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        ownerId: userId,
        plan: planKey,
        quota: {
          maxMembers: planConfig.maxMembers,
          maxComponents: planConfig.maxComponents,
          maxStorage: planConfig.maxStorage,
          maxApiCalls: planConfig.maxApiCalls,
          features: planConfig.features,
        },
        updatedAt: new Date(),
        workspacemember: {
          create: {
            id: generateId("wsm"),
            userId,
            role: "OWNER",
            updatedAt: new Date(),
          },
        },
        workspacequota: {
          create: {
            id: generateId("wsq"),
            workspaceId: workspaceId,
            membershipLevelId: mlId,
            tokenBalance: BigInt(planConfig.tokenLimit + 100), // 新开通工作空间免费赠送 100 算力点
            storageLimit: BigInt(storageMbToBytes(planConfig.maxStorage)),
            apiCallsLimit: BigInt(planConfig.maxApiCalls),
            updatedAt: new Date(),
          },
        },
      },
      include: {
        workspacemember: true,
        workspacequota: true,
      },
    });

    // 物理载入并初始化默认组件（与另一条创建入口保持一致）
    try {
      await ensureDefaultComponents(workspace.id, userId);
    } catch (e) {
      console.error("[创建工作空间] 默认组件装配失败:", e);
    }

    const serializedWorkspace = JSON.parse(
      JSON.stringify(workspace, (key, value) =>
        typeof value === "bigint" ? Number(value) : value
      )
    );

    return NextResponse.json({
      success: true,
      workspace: serializedWorkspace,
      message: "工作空间创建成功",
    });
  } catch (error) {
    console.error("Create workspace error:", error);
    return NextResponse.json({ error: "创建工作空间失败" }, { status: 500 });
  }
}
