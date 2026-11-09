import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEnterpriseWorkspaceName } from "@/lib/workspace-naming";
import { validateUser } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { storageMbToBytes, type WorkspacePlanKey } from "@/constants/workspace-plans";
import { verifyEnterprisePlanForCreation, getWorkspacePlanByKey } from "@/lib/workspace-plan-service";
import { mergeLimits } from "@/lib/limit-utils";

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

    if (!type) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 验证工作空间类型
    if (type !== "PERSONAL" && type !== "ENTERPRISE") {
      return NextResponse.json({ error: "无效的工作空间类型" }, { status: 400 });
    }

    // 会员等级与套餐配置：企业空间按套餐初始化，个人空间固定使用标准版
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true, name: true },
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

    // 个人空间固定 STANDARD（非套餐购买行为，恢复本批前既有初始化语义，不新增企业购买门禁）；
    // 企业空间取请求指定的套餐，并执行严格核验（仅真实配置一致的免费基础档可直接创建）。
    const planKey: WorkspacePlanKey =
      type === "ENTERPRISE" ? ((plan || "STANDARD").toString().toUpperCase() as WorkspacePlanKey) : "STANDARD";

    let planConfig: any;
    if (type === "ENTERPRISE") {
      // [R0-A] 企业创建入口：严格核验目标套餐，仅真实配置一致的免费基础档可直接创建；
      // 付费档/异常配置拒绝，且不回退常量授予企业权益。门禁仅作用于 ENTERPRISE。
      const planVerify = await verifyEnterprisePlanForCreation(planKey);
      if (planVerify.status === "REJECT") {
        return NextResponse.json(
          { error: planVerify.code, message: planVerify.message },
          { status: planVerify.httpStatus },
        );
      }
      if (planVerify.status === "PAID") {
        return NextResponse.json(
          {
            error: "PAID_PLAN_REQUIRES_CHECKOUT",
            message: "该套餐为付费套餐，需先完成在线购买流程，本次未创建空间、未产生扣款",
            success: false,
          },
          { status: 402 },
        );
      }
      planConfig = planVerify.plan;
    } else {
      // 个人分支：沿用本批前既有配置读取语义（含常量兼容回退），不新增企业付费门禁；
      // 即便 STANDARD 配置缺失也按常量基线创建，保持个人空间初始化行为不变。
      planConfig = await getWorkspacePlanByKey(planKey);
    }

    // 创建工作空间（同步写入套餐快照与空间配额记录）
    const generateId = (prefix: string) =>
      `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const workspaceId = generateId("ws");

    // 企业空间：填了用用户的，留空按「企业空间-<用户名>」自动命名（重名加序号）；个人空间沿用填写名
    const workspaceName =
      type === "ENTERPRISE"
        ? name?.trim()
          ? name.trim()
          : await generateEnterpriseWorkspaceName(userId, dbUser?.name)
        : name;

    const workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: workspaceName,
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
            // 余额制：新空间初始算力 0 起步，不预置任何会员免费额度
            // （算力仅来自注册福利 / 充值 / 购买算力加油包，杜绝“按会员等级白送”）
            tokenBalance: BigInt(0),
            // 存储/调用上限 = max(空间扩容包额度, 账号会员等级基础保底)
            storageLimit: BigInt(
              mergeLimits(storageMbToBytes(planConfig.maxStorage), ml?.maxStorage)
            ),
            apiCallsLimit: BigInt(
              mergeLimits(planConfig.maxApiCalls, ml?.maxApiCalls)
            ),
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
