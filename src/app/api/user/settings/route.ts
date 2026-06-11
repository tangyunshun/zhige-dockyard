﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    // 获取用户设置
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        preferences: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: user?.preferences || {},
    });
  } catch (error) {
    console.error("Get user settings error:", error);
    return NextResponse.json(
      { error: "获取用户设置失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // 更新用户设置
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: body,
      },
    });

    return NextResponse.json({
      success: true,
      data: user.preferences || {},
    });
  } catch (error) {
    console.warn("Update user settings error:", error);
    return NextResponse.json(
      { error: "更新用户设置失败" },
      { status: 500 }
    );
  }
}
