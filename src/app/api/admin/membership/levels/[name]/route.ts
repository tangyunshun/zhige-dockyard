import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * GET /api/admin/membership/levels/[name]
 * 获取单个会员等级详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } },
) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    const { name } = params;

    const level = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (!level) {
      return NextResponse.json({ message: "会员等级不存在" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: level,
    });
  } catch (error) {
    console.error("Get membership level error:", error);
    return NextResponse.json({ message: "获取会员等级失败" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/membership/levels/[name]
 * 更新会员等级
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } },
) {
  try {
    console.log("=== 开始更新会员等级 ===");
    console.log("请求 URL:", request.url);
    console.log("params 对象:", params);
    console.log("params.name:", (params as any).name);
    
    const name = (params as any).name;
    
    // 如果 name 是 undefined，尝试从 URL 路径中提取
    const urlPath = new URL(request.url).pathname;
    const nameFromPath = urlPath.split('/').pop();
    console.log("从 URL 提取的 name:", nameFromPath);
    
    const finalName = name || nameFromPath;
    
    if (!finalName) {
      console.error("无法获取会员等级名称");
      return NextResponse.json(
        { message: "缺少会员等级名称参数" },
        { status: 400 }
      );
    }
    
    console.log("最终使用的 name:", finalName);
    
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    console.log("Auth Header:", authHeader ? authHeader.substring(0, 20) + "..." : "无");
    
    const authResult = await validateUser(authHeader);
    console.log("Auth Result:", authResult);

    if (!authResult.valid) {
      console.log("认证失败:", authResult.error);
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdmin(authResult.user!)) {
      console.log("用户不是管理员:", authResult.user);
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    // 检查是否存在
    const existing = await prisma.membershipLevel.findUnique({
      where: { name: finalName },
    });
    
    console.log("现有记录:", existing ? `存在 (${existing.nameZh})` : "不存在");

    if (!existing) {
      return NextResponse.json({ message: "会员等级不存在" }, { status: 404 });
    }

    // 解析请求体
    const body = await request.json();
    console.log("请求体:", JSON.stringify(body, null, 2));
    
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
      isRecommended,
      isPopular,
    } = body;

    // 调试：打印接收到的数据
    console.log("=== 字段值 ===");
    console.log("maxPersonalWorkspaces:", maxPersonalWorkspaces, typeof maxPersonalWorkspaces);
    console.log("maxEnterpriseWorkspaces:", maxEnterpriseWorkspaces, typeof maxEnterpriseWorkspaces);
    console.log("maxStorage:", maxStorage, typeof maxStorage);

    // 更新会员等级
    console.log("=== 执行数据库更新 ===");
    
    // 构建更新数据对象
    const updateData: any = {};
    
    if (nameZh !== undefined) updateData.nameZh = nameZh;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (description !== undefined) updateData.description = description;
    if (maxPersonalWorkspaces !== undefined) updateData.maxPersonalWorkspaces = Number(maxPersonalWorkspaces);
    if (maxEnterpriseWorkspaces !== undefined) updateData.maxEnterpriseWorkspaces = BigInt(maxEnterpriseWorkspaces);
    if (maxComponents !== undefined) updateData.maxComponents = BigInt(maxComponents);
    if (maxTeamSize !== undefined) updateData.maxTeamSize = BigInt(maxTeamSize);
    if (maxStorage !== undefined) updateData.maxStorage = BigInt(maxStorage);
    if (maxApiCalls !== undefined) updateData.maxApiCalls = BigInt(maxApiCalls);
    if (features !== undefined) updateData.features = Array.isArray(features) ? features : [];
    if (priceMonthly !== undefined) updateData.priceMonthly = Number(priceMonthly);
    if (priceYearly !== undefined) updateData.priceYearly = Number(priceYearly);
    if (trialDays !== undefined) updateData.trialDays = Number(trialDays);
    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (isRecommended !== undefined) updateData.isRecommended = Boolean(isRecommended);
    if (isPopular !== undefined) updateData.isPopular = Boolean(isPopular);
    
    console.log("updateData:", updateData);

    const level = await prisma.membershipLevel.update({
      where: { name: finalName },
      data: updateData,
    });

    console.log("=== 更新成功 ===");
    console.log("更新后的记录:", level);

    // 序列化 BigInt 字段
    const serializedLevel = {
      ...level,
      maxEnterpriseWorkspaces: level.maxEnterpriseWorkspaces.toString(),
      maxComponents: level.maxComponents.toString(),
      maxTeamSize: level.maxTeamSize.toString(),
      maxStorage: level.maxStorage.toString(),
      maxApiCalls: level.maxApiCalls.toString(),
      createdAt: level.createdAt.toISOString(),
      updatedAt: level.updatedAt.toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: serializedLevel,
      message: "更新成功",
    });
  } catch (error: any) {
    const errorLog = {
      "=== 更新失败 ===": true,
      "错误类型": error.constructor.name,
      "错误消息": error.message,
      "错误代码": error.code,
      "错误详情": error.meta || {},
      "时间": new Date().toISOString(),
    };
    
    console.error("API ERROR:", JSON.stringify(errorLog, null, 2));
    
    return NextResponse.json(
      { 
        message: "更新失败",
        error: error.message,
        code: error.code,
        details: error.meta,
        debug: errorLog,
      }, 
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
  { params }: { params: { name: string } },
) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    const { name } = params;

    // 检查是否存在
    const existing = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (!existing) {
      return NextResponse.json({ message: "会员等级不存在" }, { status: 404 });
    }

    // 检查是否有用户正在使用该会员等级
    const userCount = await prisma.user.count({
      where: { membershipLevel: name },
    });

    if (userCount > 0) {
      return NextResponse.json(
        { message: `有 ${userCount} 个用户正在使用该会员等级，无法删除` },
        { status: 400 },
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
    return NextResponse.json({ message: "删除会员等级失败" }, { status: 500 });
  }
}
