import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { addNotification } from "@/lib/notifications-store";

/**
 * POST /api/user/complete-oauth-profile
 * 针对第三方快捷登录（微信/QQ等）的新用户，完善独立账号名、独立登录密码、绑定手机号与邮箱
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await request.json().catch(() => ({}));
    const { username, password, confirmPassword, phone, email } = body;

    // 1. 账号名校验
    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return NextResponse.json({ error: "请输入至少 2 个字符的登录账号名" }, { status: 400 });
    }
    const cleanUsername = username.trim();

    // 2. 密码一致性与强度校验
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "请设置至少 6 位的新登录密码" }, { status: 400 });
    }
    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: "两次输入的密码不一致，请重新核对" }, { status: 400 });
    }

    // 3. 手机号校验（如填写）
    let cleanPhone: string | null = null;
    if (phone && typeof phone === "string" && phone.trim()) {
      cleanPhone = phone.trim();
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return NextResponse.json({ error: "请输入正确的 11 位中国大陆手机号码" }, { status: 400 });
      }

      // 检查手机号唯一性
      const phoneOccupied = await prisma.user.findFirst({
        where: {
          phone: cleanPhone,
          id: { not: userId },
        },
      });
      if (phoneOccupied) {
        return NextResponse.json({ error: "该手机号已被其他账号绑定，请更换" }, { status: 400 });
      }
    }

    // 4. 邮箱校验（如填写）
    let cleanEmail: string | null = null;
    if (email && typeof email === "string" && email.trim()) {
      cleanEmail = email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return NextResponse.json({ error: "请输入规范的电子邮箱地址" }, { status: 400 });
      }

      // 检查邮箱唯一性
      const emailOccupied = await prisma.user.findFirst({
        where: {
          email: cleanEmail,
          id: { not: userId },
        },
      });
      if (emailOccupied) {
        return NextResponse.json({ error: "该邮箱已被其他账号绑定，请更换" }, { status: 400 });
      }
    }

    // 5. 加盐哈希加密新密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. 更新数据库用户资料
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: cleanUsername,
        password: hashedPassword,
        passwordChangedAt: new Date(),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        ...(cleanEmail ? { email: cleanEmail } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        status: true,
      },
    });

    // 7. 发送落库安全通知
    await addNotification(
      userId,
      "🔐 账号独立密码与安全绑定设置成功",
      `尊敬的 ${cleanUsername}，您已成功设置独立登录密码${cleanPhone ? `并绑定手机（${cleanPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}）` : ""}${cleanEmail ? `与邮箱（${cleanEmail}）` : ""}。今后您在任意设备均可直接使用账号密码快捷登录！`,
      "security"
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "账号信息与安全绑定更新成功！",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Complete oauth profile error:", error);
    return NextResponse.json({ error: error?.message || "更新失败，请稍后重试" }, { status: 500 });
  }
}
