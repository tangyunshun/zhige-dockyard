﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueInstallGrant } from "@/lib/install-auth";

/**
 * 安装向导第一步：校验已批准的 SETUP_TOKEN，并在空库前提下签发短期一次性安装授权。
 * 该授权由 init-admin 在创建初始管理员的同一事务内原子消费；光验证成功不等于可创建。
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    const setupToken = process.env.SETUP_TOKEN;

    if (!setupToken) {
      return NextResponse.json(
        { message: "服务器未配置 SETUP_TOKEN，无法验证" },
        { status: 500 },
      );
    }
    if (typeof token !== "string" || !token || token !== setupToken) {
      return NextResponse.json({ message: "Setup Token 无效" }, { status: 401 });
    }

    // 已初始化则不再签发授权（避免向导在已建管理员的环境拿到新凭证）。
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { message: "系统已初始化，无法使用 Setup Token" },
        { status: 400 },
      );
    }

    const grant = issueInstallGrant();
    if (!grant) {
      return NextResponse.json({ message: "安装授权签发失败，请检查服务器配置" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      initToken: grant.token,
      expiresAt: grant.expiresAt,
      message: "安装令牌验证通过，请在有效期内完成创世管理员创建",
    });
  } catch (error) {
    console.error("Verify setup token error:", error);
    return NextResponse.json({ message: "验证 Setup Token 失败" }, { status: 500 });
  }
}
