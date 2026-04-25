import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 验证用户登录
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    const userId = authResult.user!.id;

    // 获取上传的文件
    const formData = await request.formData();
    const file = formData.get("icon") as File;

    if (!file) {
      return NextResponse.json(
        { message: "请上传文件" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { message: "只能上传图片文件" },
        { status: 400 }
      );
    }

    // 验证文件大小（最大 2MB）
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: "图片大小不能超过 2MB" },
        { status: 400 }
      );
    }

    // 将图片转换为 Base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const iconUrl = `data:${file.type};base64,${base64}`;

    return NextResponse.json({
      success: true,
      iconUrl,
    });
  } catch (error) {
    console.error("Upload icon error:", error);
    return NextResponse.json(
      { message: "上传失败，请重试" },
      { status: 500 }
    );
  }
}
