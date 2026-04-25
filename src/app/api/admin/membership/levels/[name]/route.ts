import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/membership/levels/[name]
 * 获取单个会员等级详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    if (authResult.user!.role !== "admin" && authResult.user!.role !== "superadmin") {
      return NextResponse.json(
        { message: "需要管理员权限" },
        { status: 403 }
      );
    }

    const { name } = params;

    const level = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (!level) {
      return NextResponse.json(
        { message: "会员等级不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: level,
    });
  } catch (error) {
    console.error("Get membership level error:", error);
    return NextResponse.json(
      { message: "获取会员等级失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/membership/levels/[name]
 * 更新会员等级
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    if (authResult.user!.role !== "admin" && authResult.user!.role !== "superadmin") {
      return NextResponse.json(
        { message: "需要管理员权限" },
        { status: 403 }
      );
    }

    const { name } = params;

    // 检查是否存在
    const existing = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "会员等级不存在" },
        { status: 404 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const {
      nameZh,
      icon,
      color,
      description,
      maxPersonalWorkspaces,
      maxEnterpriseWorkspaces,
      maxComponents,
      maxTeamSize,
      maxStorage,
      maxApiCalls,
      features,
      priceMonthly,
      priceYearly,
      trialDays,
      sortOrder,
      isActive,
    } = body;

    // 更新会员等级
    const level = await prisma.membershipLevel.update({
      where: { name },
      data: {
        ...(nameZh !== undefined && { nameZh }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(description !== undefined && { description }),
        ...(maxPersonalWorkspaces !== undefined && { maxPersonalWorkspaces }),
        ...(maxEnterpriseWorkspaces !== undefined && { maxEnterpriseWorkspaces: BigInt(maxEnterpriseWorkspaces) }),
        ...(maxComponents !== undefined && { maxComponents: BigInt(maxComponents) }),
        ...(maxTeamSize !== undefined && { maxTeamSize: BigInt(maxTeamSize) }),
        ...(maxStorage !== undefined && { maxStorage: BigInt(maxStorage) }),
        ...(maxApiCalls !== undefined && { maxApiCalls: BigInt(maxApiCalls) }),
        ...(features !== undefined && { features }),
        ...(priceMonthly !== undefined && { priceMonthly }),
        ...(priceYearly !== undefined && { priceYearly }),
        ...(trialDays !== undefined && { trialDays }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({
      success: true,
      data: level,
      message: "更新成功",
    });
  } catch (error) {
    console.error("Update membership level error:", error);
    return NextResponse.json(
      { message: "更新会员等级失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/membership/levels/[name]
 * 删除会员等级
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    if (authResult.user!.role !== "admin" && authResult.user!.role !== "superadmin") {
      return NextResponse.json(
        { message: "需要管理员权限" },
        { status: 403 }
      );
    }

    const { name } = params;

    // 检查是否存在
    const existing = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "会员等级不存在" },
        { status: 404 }
      );
    }

    // 检查是否有用户正在使用该会员等级
    const userCount = await prisma.user.count({
      where: { membershipLevel: name },
    });

    if (userCount > 0) {
      return NextResponse.json(
        { message: `有 ${userCount} 个用户正在使用该会员等级，无法删除` },
        { status: 400 }
      );
    }

    // 删除会员等级
    await prisma.membershipLevel.delete({
      where: { name },
    });

    return NextResponse.json({
      success: true,
      message: "删除成功",
    });
  } catch (error) {
    console.error("Delete membership level error:", error);
    return NextResponse.json(
      { message: "删除会员等级失败" },
      { status: 500 }
    );
  }
}
