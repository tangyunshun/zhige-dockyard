import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 获取用户偏好设置
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;

    // 获取用户偏好设置
    const preferences = await prisma.userPreference.findFirst({
      where: { userId },
    });

    return NextResponse.json({
      preferences: preferences || {
        aiEngine: "zhige",
        systemPrompt: "",
        defaultModel: "zhige-v3",
        temperature: 0.7,
        maxTokens: 2000,
      },
    });
  } catch (error) {
    console.error("获取偏好设置错误:", error);
    return NextResponse.json(
      { error: "获取偏好设置失败" },
      { status: 500 }
    );
  }
}

// 更新用户偏好设置
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;
    const {
      aiEngine,
      systemPrompt,
      defaultModel,
      temperature,
      maxTokens,
    } = await req.json();

    // 验证 AI 引擎
    const validEngines = ["zhige", "deepseek", "custom"];
    if (aiEngine && !validEngines.includes(aiEngine)) {
      return NextResponse.json(
        { error: "无效的 AI 引擎" },
        { status: 400 }
      );
    }

    // 验证 temperature
    if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
      return NextResponse.json(
        { error: "temperature 必须在 0-1 之间" },
        { status: 400 }
      );
    }

    // 验证 maxTokens
    if (maxTokens !== undefined && (maxTokens < 100 || maxTokens > 8000)) {
      return NextResponse.json(
        { error: "maxTokens 必须在 100-8000 之间" },
        { status: 400 }
      );
    }

    // 检查是否已存在偏好设置
    const existingPreference = await prisma.userPreference.findFirst({
      where: { userId },
    });

    let preferences;
    if (existingPreference) {
      preferences = await prisma.userPreference.update({
        where: { id: existingPreference.id },
        data: {
          aiEngine: aiEngine || existingPreference.aiEngine,
          systemPrompt: systemPrompt || existingPreference.systemPrompt,
          defaultModel: defaultModel || existingPreference.defaultModel,
          temperature: temperature ?? existingPreference.temperature,
          maxTokens: maxTokens ?? existingPreference.maxTokens,
        },
      });
    } else {
      preferences = await prisma.userPreference.create({
        data: {
          userId,
          aiEngine: aiEngine || "zhige",
          systemPrompt: systemPrompt || "",
          defaultModel: defaultModel || "zhige-v3",
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 2000,
        },
      });
    }

    return NextResponse.json({
      success: true,
      preferences,
      message: "偏好设置保存成功",
    });
  } catch (error) {
    console.error("保存偏好设置错误:", error);
    return NextResponse.json(
      { error: "保存偏好设置失败" },
      { status: 500 }
    );
  }
}
