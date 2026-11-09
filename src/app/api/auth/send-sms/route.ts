﻿import { NextRequest, NextResponse } from "next/server";

/**
 * 发送短信验证码。
 *
 * F15 / L01：短信通道（供应商）当前未接通 —— 在生成/保存任何有效验证码、任何成功提示
 * 或外部调用之前，直接返回稳定 503（CHANNEL_NOT_READY）。绝不生成验证码、绝不返回
 * 调试码、绝不把“未发送”伪装成“已发送”。本批不选择或接通短信供应商。
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { message: "请输入正确的手机号" },
        { status: 400 },
      );
    }

    // 真实短信供应商未接通：诚实未就绪，不在本接口签发/存储/下发任何验证码。
    return NextResponse.json(
      {
        message: "短信通道暂未接通，请使用邮箱验证码或稍后重试",
        code: "CHANNEL_NOT_READY",
      },
      { status: 503 },
    );
  } catch (error) {
    console.error("Send SMS error:", error);
    return NextResponse.json({ message: "发送失败" }, { status: 500 });
  }
}
