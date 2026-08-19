﻿import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";
import { sessionCache } from "@/lib/session-cache";
import { maybeFinalizeDeletionIfDue } from "@/lib/account-deletion";

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

    // 优先从header获取token；但仅接受 JWT 格式（包含点号）的 header token，
    // 防止前端误传 localStorage userId（明文）覆盖掉 cookie 中的合法临时令牌
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const headerToken = authHeader.substring(7);
      if (headerToken.includes(".")) {
        token = headerToken;
      }
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
      select: { id: true, status: true, deletionRequestedAt: true, email: true, role: true },
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

    // D-02：冷静期已过则执行最终注销，注销不可逆，不再允许撤销
    const deletionFinalized = await maybeFinalizeDeletionIfDue(userId);
    if (deletionFinalized) {
      console.log("[撤销注销] 冷静期已过，账号已被永久注销，拒绝撤销:", userId);
      return NextResponse.json({ error: "账号注销冷静期已过，账号已被永久注销" }, { status: 400 });
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

    // 撤销成功：保持登录态——重新签发正常会话令牌并更新数据库会话，
    // 用户无需重新登录即可直接进入系统（不再清除 cookie）
    const now = new Date();
    const newSessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h（与"未记住我"绝对超时策略一致）
    const newRefreshToken = crypto.randomUUID();
    const refreshTokenExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken: newSessionToken,
        sessionExpiresAt,
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt,
        lastActivityAt: now,
      },
    });

    // 内存同步（与正常登录一致）：清除旧会话并注册新会话
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === userId) {
        sessionCache.delete(key);
      }
    }
    sessionCache.set(newSessionToken, {
      userId,
      expiresAt: sessionExpiresAt,
    });

    const newToken = await new SignJWT({
      userId,
      email: user.email,
      role: user.role,
      sessionToken: newSessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      message: "注销申请已撤销，账号已恢复正常",
    });

    response.cookies.set("auth_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60,
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