﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/demo-request
 * 处理演示请求
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, phone, requirements } = body;

    // 验证必填字段
    if (!name || !email || !company) {
      return NextResponse.json(
        {
          success: false,
          error: "请填写所有必填字段",
        },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "请输入有效的邮箱地址",
        },
        { status: 400 }
      );
    }

    // TODO: 发送邮件通知
    // TODO: 保存到数据库
    // TODO: 触发CRM工作流
    console.log("收到演示请求:", {
      name,
      email,
      company,
      phone,
      requirements,
      timestamp: new Date().toISOString(),
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      message: "演示请求已提交",
      data: {
        id: "DEMO-" + Date.now(),
        status: "pending",
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("处理演示请求时发生错误:", error);
    return NextResponse.json(
      {
        success: false,
        error: "服务器内部错误，请稍后重试",
      },
      { status: 500 }
    );
  }
}
