﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUsername } from "@/lib/validators";

/**
 * 检查用户名是否可用
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    const userId = authHeader.replace("Bearer ", "");
    const body = await request.json();
    const { username } = body;

    // 验证用户名格式
    const validation = validateUsername(username);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.message },
        { status: 400 }
      );
    }

    // 检查用户名是否已被其他用户使用
    const existingUser = await prisma.user.findFirst({
      where: {
        name: username.trim(),
        id: { not: userId }, // 排除当前用户
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { available: false, message: "该用户名已被使用" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { available: true, message: "该用户名可以使用" },
      { status: 200 }
    );
  } catch (error) {
    console.warn("Check username error:", error);
    return NextResponse.json(
      { error: "检测失败，请稍后重试" },
      { status: 500 }
    );
  }
}
