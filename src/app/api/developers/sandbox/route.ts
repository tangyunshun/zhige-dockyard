import { NextRequest, NextResponse } from "next/server";

/**
 * 开发者沙盒接口（阶段一：完全停止）
 *
 * 安全整改：
 *  - 入口直接返回 HTTP 501，不读取 API Key、不遍历 apikey 表、不执行 bcrypt；
 *  - 不创建任何任务、不写 SUCCESS 记录；
 *  - 后续若恢复沙盒，必须复用统一的真实模型执行服务（/api/studio 的 REAL_MODEL 分支）。
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      code: "SANDBOX_NOT_AVAILABLE",
      message:
        "开发者沙盒暂未开放：当前阶段尚未接入真实模型执行服务，请勿调用。后续恢复时将复用统一的真实模型执行服务。",
    },
    { status: 501 },
  );
}
