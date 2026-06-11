﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 撤销账号注销申请API
 * 在冷静期内撤销注销申请
 */
export async function POST(request: NextRequest) {
  try {
  // 从Authorization header获取token
    const authHeader = request.headers.get("Authorization");
    let token = request.cookies.get("auth_token")?.value;

    // 优先从header获取token
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token) {
      console.log("[撤销注销] 没有token");
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // 验证token获取userId
    let userId;
    let deletionStatus;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      userId = payload.userId as string;
      deletionStatus = payload.deletionStatus as string;
      console.log("[撤销注销] Token payload:", payload);
    } catch (e) {
      console.error("[撤销注销] Token验证失败:", e);
      return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    }

    console.log("[撤销注销] 用户ID:", userId, "删除状态:", deletionStatus);

    // 只要能提取到userId就可以撤销
    if (!userId) {
      console.log("[撤销注销] 错误：无法从token获取用户ID");
      return NextResponse.json({ error: "无效的令牌，请重新登录" }, { status: 401 });
    }

    console.log("[撤销注销] 用户ID:", userId);

    // 检查用户是否存在且正在注销中
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletionRequestedAt: true },
    });

    if (!user) {
      console.log("[撤销注销] 错误：用户不存在");
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    console.log("[撤销注销] 用户当前状态:", user.status, "期望状态: deleting");

    if (user.status !== "deleting") {
      console.log("[撤销注销] 错误：账号未在注销状态，当前状态:", user.status);
      return NextResponse.json({ error: "账号未在注销状态，当前状态: " + user.status }, { status: 400 });
    }

    console.log("[撤销注销] 开始更新数据库，userId:", userId);
    // 恢复用户状态
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "active",
        deletionRequestedAt: null,
      },
    });

    console.log("[撤销注销] 数据库更新完成，updatedUser:", JSON.stringify(updatedUser));

    // 验证更新是否成功
    const verifyUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletionRequestedAt: true },
    });
    console.log("[撤销注销] 验证查询结果:", JSON.stringify(verifyUser));

    if (!verifyUser || verifyUser.status !== "active") {
      console.log("[撤销注销] 错误：验证失败，状态不是active");
      return NextResponse.json({ error: "撤销失败，请重试" }, { status: 500 });
    }

    // 清除Cookie
    const response = NextResponse.json({
      success: true,
      message: "注销申请已撤销，账号已恢复正常",
    });

    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return NextResponse.json(
      { error: "撤销注销失败" },
      { status: 500 }
    );
  }
}