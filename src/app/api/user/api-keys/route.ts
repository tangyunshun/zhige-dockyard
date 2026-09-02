import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 鉴权：统一使用项目标准 JWT 校验（与 /api/user/* 其它接口一致）
async function requireUser(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) return null;
  return auth.user.id as string;
}

// 对外脱敏：绝不返回 keyHash
function toPublic(key: any) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

// 获取用户 API Keys
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const apiKeys = await prisma.apikey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ apiKeys: apiKeys.map(toPublic) });
  } catch (error) {
    console.error("获取 API Keys 错误:", error);
    return NextResponse.json({ error: "获取 API Keys 失败" }, { status: 500 });
  }
}

// 创建新的 API Key
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "缺少 API Key 名称" }, { status: 400 });
    }

    // 生成 API Key
    const keyPrefix = "sk-";
    const keyBody = uuidv4().replace(/-/g, "");
    const apiKey = keyPrefix + keyBody;

    // 哈希处理
    const hashedKey = await bcrypt.hash(apiKey, 10);

    const newApiKey = await prisma.apikey.create({
      data: {
        id: uuidv4(),
        userId,
        name,
        description: description || null,
        keyHash: hashedKey,
        keyPrefix,
        lastUsedAt: null,
        updatedAt: new Date(),
      },
    });

    // 写入审计日志
    await prisma.operationlog
      .create({
        data: {
          id: uuidv4(),
          userId,
          action: "APIKey:Create",
          resource: "APIKey",
          details: JSON.stringify({ id: newApiKey.id, name: newApiKey.name }),
          createdAt: new Date(),
        },
      })
      .catch(() => {});

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
    return NextResponse.json({ error: "创建 API Key 失败" }, { status: 500 });
  }
}

// 删除 API Key
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "缺少 API Key ID" }, { status: 400 });
    }

    const apiKey = await prisma.apikey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return NextResponse.json({ error: "API Key 不存在" }, { status: 404 });
    }

    await prisma.apikey.delete({
      where: { id },
    });

    // 写入审计日志
    await prisma.operationlog
      .create({
        data: {
          id: uuidv4(),
          userId,
          action: "APIKey:Delete",
          resource: "APIKey",
          details: JSON.stringify({ id, name: apiKey.name }),
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, message: "API Key 删除成功" });
  } catch (error) {
    console.error("删除 API Key 错误:", error);
    return NextResponse.json({ error: "删除 API Key 失败" }, { status: 500 });
  }
}
