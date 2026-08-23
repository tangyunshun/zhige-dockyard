import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { addNotification } from "@/lib/notifications-store";
import { assertCSRF } from "@/lib/csrf";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json({ error: "CSRF_INVALID", message: "请求来源校验失败" }, { status: 403 });
    }

    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { currentPassword, newPassword, forceChange } = await request.json();

    // 验证输入
    if (!newPassword) {
      return NextResponse.json(
        { error: "请填写新密码" },
        { status: 400 }
      );
    }

    // 如果不是强制修改，则需要验证当前密码
    if (!forceChange && !currentPassword) {
      return NextResponse.json(
        { error: "请填写当前密码" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "新密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 获取当前用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user || !user.password) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 400 }
      );
    }

    // 如果不是强制修改，验证当前密码
    if (!forceChange) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return NextResponse.json(
          { error: "当前密码不正确" },
          { status: 400 }
        );
      }
    }

    // 加密新密码并更新
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 修改密码后使所有已登录终端下线
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        sessionToken: null,           // 使所有会话失效
        sessionExpiresAt: null,       // 清除会话过期时间
        refreshToken: null,           // 清除refresh token
        refreshTokenExpiresAt: null,  // 清除refresh token过期时间
        lastForcedLogoutAt: new Date(), // 标记被强制下线
      },
    });

    // 写入审计日志
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        action: "Password:Change",
        resource: "Password",
        details: JSON.stringify({ reason: "user initiated password change" }),
        createdAt: new Date(),
      },
    });

    console.log(`[密码修改] 用户 ${userId} 修改密码，所有终端已被强制下线`);

    // I-02：密码被改实时通知用户（防黑客静默攻击）
    try {
      await addNotification(
        userId,
        "密码已修改",
        "您的账号密码已被修改，所有设备已强制下线。若非本人操作，请立即联系客服。",
        "security",
      );
    } catch {
      /* 通知失败不影响主流程 */
    }

    // 清除Cookie
    const response = NextResponse.json({
      success: true,
      message: "密码已修改成功，请使用新密码重新登录",
      needReLogin: true,
    });

    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set("session_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    response.cookies.set("refresh_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "修改密码失败" },
      { status: 500 }
    );
  }
}
