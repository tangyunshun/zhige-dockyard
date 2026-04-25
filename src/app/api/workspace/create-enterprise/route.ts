import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getMembershipConfig, isTeamSizeExceeded, formatTeamSize } from "@/lib/membership";

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 解析请求体
    const body = await request.json();
    const { 
      name, 
      description,
      teamSize,
      industry,
      contactEmail,
      contactPhone,
      logo,
      plan = "STANDARD", // STANDARD | PRO | ENTERPRISE | CUSTOM
      visibility = "PRIVATE", // PRIVATE | PUBLIC
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "空间名称不能为空" }, { status: 400 });
    }

    if (!contactEmail || !contactEmail.trim()) {
      return NextResponse.json({ error: "联系邮箱不能为空" }, { status: 400 });
    }

    // 检查会员状态和配额
    const userMembershipLevel = (authResult.user!.membershipLevel || 'FREE') as keyof typeof getMembershipConfig;
    const membershipConfig = getMembershipConfig(userMembershipLevel);
    
    // 检查企业空间数量
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    if (enterpriseWorkspaces.length >= membershipConfig.maxEnterpriseWorkspaces && membershipConfig.maxEnterpriseWorkspaces !== -1) {
      return NextResponse.json(
        { 
          error: `${membershipConfig.nameZh}最多只能创建 ${membershipConfig.maxEnterpriseWorkspaces} 个企业空间，如需更多请升级会员` 
        },
        { status: 403 }
      );
    }

    // 检查团队规模是否超出会员等级限制
    if (teamSize && isTeamSizeExceeded(teamSize, userMembershipLevel)) {
      const availableTeamSizes = ['1-5', '6-20', '21-50', '51-100', '101-200', '200+'].filter(size => {
        return !isTeamSizeExceeded(size, userMembershipLevel);
      });
      
      return NextResponse.json(
        {
          error: `您的${membershipConfig.nameZh}最多支持 ${membershipConfig.maxTeamSize} 人的团队规模，请选择以下规模：${availableTeamSizes.join('、')}，或升级会员`,
          currentLevel: membershipConfig.nameZh,
          maxTeamSize: membershipConfig.maxTeamSize,
        },
        { status: 403 }
      );
    }

    // 根据套餐类型设置配额
    const quotaConfig = getQuotaConfig(plan);

    // 创建企业空间
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: "ENTERPRISE",
        ownerId: userId,
        teamSize: teamSize || null,
        industry: industry || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        logo: logo || null,
        plan: plan.toUpperCase(),
        visibility: visibility.toUpperCase(),
        status: "ACTIVE",
        quota: quotaConfig,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        members: true,
      },
    });

    // 记录操作日志
    await prisma.operationLog.create({
      data: {
        userId,
        workspaceId: workspace.id,
        action: "CREATE_ENTERPRISE_WORKSPACE",
        resource: "Workspace",
        details: {
          workspaceName: name,
          workspaceType: "ENTERPRISE",
          workspacePlan: plan,
          workspaceVisibility: visibility,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "企业空间创建成功",
      workspace,
    });
  } catch (error) {
    console.error("Create enterprise workspace error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      type: typeof error,
    });
    return NextResponse.json(
      { 
        error: "创建失败", 
        details: errorMessage,
        type: typeof error,
      },
      { status: 500 }
    );
  }
}

// 获取套餐配额配置
function getQuotaConfig(plan: string) {
  const configs = {
    STANDARD: {
      maxComponents: 100,      // 最多组件数
      maxMembers: 10,          // 最多成员数
      maxStorage: 1024,        // 最多存储（MB）
      maxApiCalls: 1000,       // 每月最多 API 调用
      features: ["basic_components", "standard_support"],
    },
    PRO: {
      maxComponents: 500,
      maxMembers: 50,
      maxStorage: 10240,       // 10GB
      maxApiCalls: 10000,
      features: ["all_components", "priority_support", "analytics", "custom_theme"],
    },
    ENTERPRISE: {
      maxComponents: -1,       // 无限
      maxMembers: -1,          // 无限
      maxStorage: 102400,      // 100GB
      maxApiCalls: 100000,
      features: ["all_components", "dedicated_support", "advanced_analytics", "full_customization", "sla"],
    },
    CUSTOM: {
      maxComponents: -1,
      maxMembers: -1,
      maxStorage: -1,
      maxApiCalls: -1,
      features: ["all"],
    },
  };

  return configs[plan.toUpperCase() as keyof typeof configs] || configs.STANDARD;
}
