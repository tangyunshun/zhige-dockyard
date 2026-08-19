import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 允许的反馈类型
const FEEDBACK_TYPES = ["suggestion", "bug", "experience", "other"] as const;

// POST /api/feedback
// 用户从"帮助与反馈"页面提交意见反馈（允许匿名提交，登录用户自动关联账号）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, content, contact } = body || {};

    // 校验反馈类型
    const feedbackType = FEEDBACK_TYPES.includes(type) ? type : "other";

    // 校验必填字段
    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "请填写反馈标题" },
        { status: 400 },
      );
    }
    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "请填写详细反馈内容" },
        { status: 400 },
      );
    }
    if (title.trim().length > 50) {
      return NextResponse.json(
        { success: false, error: "反馈标题不能超过 50 个字符" },
        { status: 400 },
      );
    }
    if (content.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: "反馈内容至少需要 10 个字符" },
        { status: 400 },
      );
    }
    if (content.trim().length > 5000) {
      return NextResponse.json(
        { success: false, error: "反馈内容不能超过 5000 个字符" },
        { status: 400 },
      );
    }

    // 尝试识别登录用户（失败不阻断，允许匿名反馈）
    let userId: string | null = null;
    try {
      const auth = await validateUser(
        request.headers.get("Authorization"),
        request,
      );
      if (auth.valid && auth.user) {
        userId = auth.user.id;
      }
    } catch {
      userId = null;
    }

    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await prisma.userfeedback.create({
      data: {
        id: feedbackId,
        userId,
        type: feedbackType,
        title: title.trim(),
        content: content.trim(),
        contact: contact?.trim() || null,
        status: "pending",
        updatedAt: new Date(),
      },
    });

    console.log(
      `[Feedback] 收到新反馈 ${feedbackId} (type=${feedbackType}, user=${userId || "匿名"})`,
    );

    return NextResponse.json({
      success: true,
      message: "反馈提交成功，感谢您的宝贵意见",
      data: { id: feedbackId },
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误，请稍后重试" },
      { status: 500 },
    );
  }
}
