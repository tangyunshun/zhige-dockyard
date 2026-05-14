import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify, SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

interface VerificationCode {
  code: string;
  expiresAt: Date;
  userId: string;
  type: "login" | "binding" | "password";
  ip: string;
}

/**
 * 存储验证码的临时对象（实际应该用Redis）
 */
const verificationCodes: Map<string, VerificationCode> = new Map();

/**
 * 生成6位数字验证码
 */
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 发送登录验证码API
 * 用于异地登录时的二次验证
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, type = "login" } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for") ||
               request.headers.get("x-real-ip") ||
               "unknown";

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟有效期

    // 存储验证码
    const key = `${userId}_${type}`;
    verificationCodes.set(key, {
      code,
      expiresAt,
      userId,
      type,
      ip,
    });

    // 实际应该发送短信/邮箱，这里简化处理，只在日志中显示
    console.log(`[验证码] 用户 ${userId} 类型 ${type} 验证码: ${code}（5分钟内有效）`);

    // 实际发送短信/邮箱的逻辑应该在这里
    // await sendSMS(user.phone, `您的验证码是 ${code}，5分钟内有效`);

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      // 开发环境下直接返回验证码方便测试
      devCode: process.env.NODE_ENV === "development" ? code : undefined,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Send verification code error:", error);
    return NextResponse.json({ error: "发送验证码失败" }, { status: 500 });
  }
}

/**
 * 验证验证码API
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId, code, type = "login" } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const key = `${userId}_${type}`;
    const stored = verificationCodes.get(key);

    if (!stored) {
      return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
    }

    if (stored.userId !== userId) {
      return NextResponse.json({ error: "验证码无效" }, { status: 400 });
    }

    if (new Date() > stored.expiresAt) {
      verificationCodes.delete(key);
      return NextResponse.json({ error: "验证码已过期，请重新获取" }, { status: 400 });
    }

    if (stored.code !== code) {
      return NextResponse.json({ error: "验证码错误" }, { status: 400 });
    }

    // 验证成功，删除验证码
    verificationCodes.delete(key);

    // 生成验证通过的临时token（5分钟内有效）
    const verifyToken = await new SignJWT({
      userId,
      verified: true,
      type,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(JWT_SECRET);

    return NextResponse.json({
      success: true,
      message: "验证成功",
      verifyToken,
    });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}