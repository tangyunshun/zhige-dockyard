import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

// 获取用户的 API Keys
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error("获取 API Keys 失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 创建新的 API Key
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "请输入 API Key 名称" },
        { status: 400 }
      );
    }

    // 生成 API Key
    const keyPrefix = "sk-";
    const keyBody = uuidv4().replace(/-/g, "");
    const apiKey = keyPrefix + keyBody;

    // 只存储哈希值
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

    // 只在创建时返回完整的 key，之后无法再查看
    return NextResponse.json({
      success: true,
      apiKey: {
        id: newApiKey.id,
        name: newApiKey.name,
        key: apiKey, // 只显示一次
        createdAt: newApiKey.createdAt,
      },
      message: "请妥善保存此 API Key，它只会显示一次！",
    });
  } catch (error) {
    console.error("创建 API Key 失败:", error);
    return NextResponse.json(
      { error: "创建失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 删除 API Key
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "请提供 API Key ID" }, { status: 400 });
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
      message: "API Key 已删除",
    });
  } catch (error) {
    console.error("删除 API Key 失败:", error);
    return NextResponse.json(
      { error: "删除失败，请稍后重试" },
      { status: 500 }
    );
  }
}
