import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 获取用户的集成配置
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "请提供工作空间 ID" },
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
    console.error("获取集成配置失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 保存或更新集成 Token
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { workspaceId, provider, name, tokenValue } = await req.json();

    // 验证必填项
    if (!workspaceId || !provider || !tokenValue) {
      return NextResponse.json(
        { error: "请提供完整的信息" },
        { status: 400 }
      );
    }

    // 验证 provider
    const validProviders = ["github", "gitlab", "gitee"];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: "无效的集成提供商" },
        { status: 400 }
      );
    }

    // 验证 Token 格式（简单验证）
    if (tokenValue.length < 10) {
      return NextResponse.json(
        { error: "Token 格式不正确" },
        { status: 400 }
      );
    }

    // 加密 Token
    const hashedToken = await bcrypt.hash(tokenValue, 10);

    // 检查是否已存在
    const existingIntegration = await prisma.integration.findFirst({
      where: { userId, workspaceId, provider },
    });

    let integration;
    if (existingIntegration) {
      integration = await prisma.integration.update({
        where: { id: existingIntegration.id },
        data: {
          tokenHash: hashedToken,
          configured: true,
          name: name || existingIntegration.name,
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          workspaceId,
          provider,
          name: name || provider,
          tokenHash: hashedToken,
          configured: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      integration: {
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        configured: integration.configured,
      },
      message: "集成配置已保存",
    });
  } catch (error) {
    console.error("保存集成配置失败:", error);
    return NextResponse.json(
      { error: "保存失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 删除集成配置
export async function DELETE(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const { integrationId } = await req.json();

    if (!integrationId) {
      return NextResponse.json(
        { error: "请提供集成 ID" },
        { status: 400 }
      );
    }

    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, userId },
    });

    if (!integration) {
      return NextResponse.json(
        { error: "集成配置不存在" },
        { status: 404 }
      );
    }

    await prisma.integration.delete({
      where: { id: integrationId },
    });

    return NextResponse.json({
      success: true,
      message: "集成配置已删除",
    });
  } catch (error) {
    console.error("删除集成配置失败:", error);
    return NextResponse.json(
      { error: "删除失败，请稍后重试" },
      { status: 500 }
    );
  }
}
