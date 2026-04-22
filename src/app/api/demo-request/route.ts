import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/demo-request
 * 处理私有化演示申请
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, phone, requirements } = body;

    // 基础验证
    if (!name || !email || !company) {
      return NextResponse.json(
        {
          success: false,
          error: "姓名、邮箱和公司为必填项",
        },
        { status: 400 }
      );
    }

    // 邮箱格式验证
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

    // TODO: 将申请保存到数据库
    // TODO: 发送邮件通知给销售团队
    // TODO: 发送邮件确认给用户

    console.log("收到演示申请:", {
      name,
      email,
      company,
      phone,
      requirements,
      timestamp: new Date().toISOString(),
    });

    // 模拟保存成功
    return NextResponse.json({
      success: true,
      message: "演示申请已提交",
      data: {
        id: "DEMO-" + Date.now(),
        status: "pending",
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("演示申请处理失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: "服务器错误，请稍后重试",
      },
      { status: 500 }
    );
  }
}
