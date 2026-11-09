import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-config";

/**
 * 绑定占用预检 API（手机号/邮箱是否已被其他账号绑定）
 *
 * 用途：个人设置页在用户「输完手机号/邮箱」时即时校验占用情况，
 * 而不是等到提交时才报错（滞后反馈用户无法立刻定位问题）。
 * 仅做只读检查，不做任何变更；最终以后端提交时的校验为准（此处失败不阻塞）。
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const userId = payload.userId as string;

    const type = request.nextUrl.searchParams.get("type");
    const value = (request.nextUrl.searchParams.get("value") || "").trim();

    if (!type || !["phone", "email"].includes(type) || !value) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 格式预检：格式不合法直接判定为不可用，并返回与提交校验一致的文案
    if (type === "phone" && !/^1[3-9]\d{9}$/.test(value)) {
      return NextResponse.json({
        available: false,
        message: "手机号不规范，请输入规范的 11 位有效手机号码",
      });
    }
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return NextResponse.json({
        available: false,
        message: "请输入正确的邮箱地址",
      });
    }

    // 占用检查：排除当前账号自身
    const existing = await prisma.user.findFirst({
      where: {
        [type]: value,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({
        available: false,
        message:
          type === "phone"
            ? "该手机号码已被其他账号绑定，请更换其他号码"
            : "该邮箱已被其他账号使用，请更换其他邮箱",
      });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error("Check binding error:", error);
    return NextResponse.json({ error: "预检失败" }, { status: 500 });
  }
}
