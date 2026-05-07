import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 获取用户 API Keys
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error("获取 API Keys 错误:", error);
    return NextResponse.json(
      { error: "获取 API Keys 失败" },
      { status: 500 }
    );
  }
}

// 创建新的 API Key
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "缺少 API Key 名称" },
        { status: 400 }
      );
    }

    // 生成 API Key
    const keyPrefix = "sk-";
    const keyBody = uuidv4().replace(/-/g, "");
    const apiKey = keyPrefix + keyBody;

    // 哈希处理
    const hashedKey = await bcrypt.hash(apiKey, 10);

    const newApiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        description,
        keyHash: hashedKey,
        keyPrefix,
        lastUsedAt: null,
      },
    });

    // 只返回一次完整的 key
    return NextResponse.json({
      success: true,
      apiKey: {
        id: newApiKey.id,
        name: newApiKey.name,
        key: apiKey,
        createdAt: newApiKey.createdAt,
      },
      message: "请妥善保管您的 API Key，这是唯一一次显示",
    });
  } catch (error) {
    console.error("创建 API Key 错误:", error);
    return NextResponse.json(
      { error: "创建 API Key 失败" },
      { status: 500 }
    );
  }
}

// 删除 API Key
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "缺少 API Key ID" }, { status: 400 });
    }

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return NextResponse.json({ error: "API Key 不存在" }, { status: 404 });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "API Key 删除成功",
    });
  } catch (error) {
    console.error("删除 API Key 错误:", error);
    return NextResponse.json(
      { error: "删除 API Key 失败" },
      { status: 500 }
    );
  }
}
