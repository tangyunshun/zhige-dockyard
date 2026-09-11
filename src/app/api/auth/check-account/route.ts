import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json({ message: "账号不能为空" }, { status: 400 });
    }

    // 查找用户（支持邮箱、手机号、账号名）
    // 与 /api/auth/login 保持同一套匹配方式：raw 只用于大小写敏感的账号名匹配（仅取 id），兼容表名大小写
    let matchedId: string | null = null;
    try {
      const matched = (await prisma.$queryRaw`
        SELECT id FROM User WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}
      `) as { id: string }[];
      if (matched.length > 0) matchedId = matched[0].id;
    } catch {
      try {
        const matched = (await prisma.$queryRaw`
          SELECT id FROM user WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}
        `) as { id: string }[];
        if (matched.length > 0) matchedId = matched[0].id;
      } catch {
        const fallbackUser = await prisma.user.findFirst({
          where: {
            OR: [{ email: account }, { phone: account }, { name: account }],
          },
          select: { id: true },
        });
        if (fallbackUser) matchedId = fallbackUser.id;
      }
    }
    const user = matchedId
      ? await prisma.user.findUnique({ where: { id: matchedId } })
      : null;

    if (!user) {
      return NextResponse.json({
        exists: false,
        message: "该账号未注册",
      });
    }

    // 检查账号状态：先处理deleted，因为已注销账号不应该显示为"存在"
    if (user.status === "deleted") {
      return NextResponse.json({
        exists: false, // 已注销账号，视为不存在
        message: "该账号未注册",
      });
    }

    // 检查是否被封禁（临时封禁到期则与登录接口一致：自动解封后按正常账号处理）
    if (user.status === "banned") {
      const bannedUntil = user.bannedUntil ?? null;
      if (bannedUntil && bannedUntil.getTime() <= Date.now()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { status: "active", bannedUntil: null },
        });
        user.status = "active";
        user.bannedUntil = null;
      } else {
        return NextResponse.json({
          exists: true,
          status: "banned",
          message: bannedUntil ? "该账号已被临时封禁" : "该账号已被永久封禁",
        });
      }
    }

    // 检查是否被禁用
    if (user.status === "inactive") {
      return NextResponse.json({
        exists: true,
        status: "disabled",
        message: "账号已被禁用，请联系管理员",
      });
    }

    // 检查是否正在注销中
    if (user.status === "deleting") {
      return NextResponse.json({
        exists: true,
        status: "deleting",
        message: "账号正在注销中",
      });
    }

    // 检查是否被锁定
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const lockedDate = user.lockedUntil;
      const minutes = Math.ceil(
        (lockedDate.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json({
        exists: true,
        status: "locked",
        lockedUntil: lockedDate.toISOString(),
        minutesRemaining: minutes,
        identifiers: [user.name, user.email, user.phone].filter(Boolean),
        message: "账号已锁定，" + minutes + "分钟后再试",
      });
    }

    return NextResponse.json({
      exists: true,
      status: "active",
      message: "账号存在",
    });
  } catch (error) {
    console.error("Check account error:", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
