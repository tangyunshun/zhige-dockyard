﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

/**
 * 用户偏好设置。
 *
 * ⚠ 模型选择不属于用户偏好：真实执行模型由「组件执行合同 + 模型注册表 + 空间模型策略」决定。
 *   历史字段 userpreference.aiEngine / defaultModel 已弃用，既不返回也不接受写入，
 *   避免出现「用户可选 第三方模型 / 自带 Key，但实际不生效」的假功能。
 */

/** 不允许由用户设置的模型选择字段（写入即拒绝，杜绝假功能） */
const FORBIDDEN_MODEL_FIELDS = ["aiEngine", "defaultModel"] as const;

// 获取用户偏好设置
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = token.id as string;

    // 获取用户偏好设置
    const preferences = await prisma.userpreference.findFirst({
      where: { userId },
    });

    return NextResponse.json({
      preferences: {
        systemPrompt: preferences?.systemPrompt ?? "",
        temperature: preferences?.temperature ?? 0.7,
        modelTokenLimit: preferences?.modelTokenLimit ?? 2000,
      },
      // 模型选择权归属：由管理员通过空间模型策略配置，用户侧只读
      modelSelection: {
        managedByAdmin: true,
        note: "本空间可用模型由管理员在「模型注册表 / 空间模型策略」中配置，用户无需也无法自行选择。",
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { systemPrompt, temperature, modelTokenLimit } = body;

    // 模型选择不允许由用户设置：显式拒绝，绝不静默忽略后假装保存成功
    const attempted = FORBIDDEN_MODEL_FIELDS.filter((f) => body[f] !== undefined);
    if (attempted.length > 0) {
      return NextResponse.json(
        {
          error: "模型选择由管理员统一配置，用户不可自行选择。",
          code: "MODEL_SELECTION_MANAGED_BY_ADMIN",
          fields: attempted,
        },
        { status: 400 }
      );
    }

    const systemPromptValue = typeof systemPrompt === "string" ? systemPrompt : undefined;
    const temperatureValue = temperature === undefined || temperature === null ? undefined : Number(temperature);
    const modelTokenLimitValue =
      modelTokenLimit === undefined || modelTokenLimit === null ? undefined : Number(modelTokenLimit);

    // 验证 temperature
    if (temperatureValue !== undefined && (!Number.isFinite(temperatureValue) || temperatureValue < 0 || temperatureValue > 1)) {
      return NextResponse.json(
        { error: "temperature 必须在 0-1 之间" },
        { status: 400 }
      );
    }

    // 验证 modelTokenLimit
    if (
      modelTokenLimitValue !== undefined &&
      (!Number.isInteger(modelTokenLimitValue) || modelTokenLimitValue < 100 || modelTokenLimitValue > 8000)
    ) {
      return NextResponse.json(
        { error: "modelTokenLimit 必须在 100-8000 之间" },
        { status: 400 }
      );
    }

    // 检查是否已存在偏好设置
    const existingPreference = await prisma.userpreference.findFirst({
      where: { userId },
    });

    let preferences;
    if (existingPreference) {
      // 注意：不再写入 aiEngine / defaultModel（已弃用字段，保持原值不动）
      preferences = await prisma.userpreference.update({
        where: { id: existingPreference.id },
        data: {
          systemPrompt: systemPromptValue ?? existingPreference.systemPrompt,
          temperature: temperatureValue ?? existingPreference.temperature,
          modelTokenLimit: modelTokenLimitValue ?? existingPreference.modelTokenLimit,
          updatedAt: new Date(),
        },
      });
    } else {
      // aiEngine / defaultModel 走数据库默认值（已弃用，不参与真实执行）
      preferences = await prisma.userpreference.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          systemPrompt: systemPromptValue ?? "",
          temperature: temperatureValue ?? 0.7,
          modelTokenLimit: modelTokenLimitValue ?? 2000,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      // 仅回传用户可维护的偏好；不暴露已弃用的 aiEngine / defaultModel
      preferences: {
        systemPrompt: preferences.systemPrompt ?? "",
        temperature: preferences.temperature,
        modelTokenLimit: preferences.modelTokenLimit,
      },
      modelSelection: {
        managedByAdmin: true,
        note: "本空间可用模型由管理员在「模型注册表 / 空间模型策略」中配置。",
      },
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
