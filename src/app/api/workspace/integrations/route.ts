﻿import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 获取集成列表
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    const integrations = await prisma.integration.findMany({
      where: { userId, workspaceId },
      select: {
        id: true,
        provider: true,
        name: true,
        configured: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error("获取集成列表失败:", error);
    return NextResponse.json(
      { error: "获取集成列表失败" },
      { status: 500 }
    );
  }
}

// 添加新的集成
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const { provider, name, workspaceId, credentials } = await req.json();

    if (!provider || !name || !workspaceId) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 加密敏感信息
    let encryptedCredentials = null;
    if (credentials) {
      encryptedCredentials = await bcrypt.hash(
        JSON.stringify(credentials),
        10
      );
    }

    const integration = await prisma.integration.create({
      data: {
        userId,
        workspaceId,
        provider,
        name,
        credentials: encryptedCredentials,
        configured: true,
      },
    });

    return NextResponse.json({
      success: true,
      integration: {
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        configured: integration.configured,
      },
    });
  } catch (error) {
    console.error("添加集成失败:", error);
    return NextResponse.json(
      { error: "添加集成失败" },
      { status: 500 }
    );
  }
}
