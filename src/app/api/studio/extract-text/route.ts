export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { extractTextFromBuffer, isExtractableFile } from "@/lib/text-extract";

export async function POST(request: NextRequest) {
  try {
    // 提取文件必须登录，避免未授权上传与算力滥用
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: "缺少文件" }, { status: 400 });
    }

    const fileName = (file as any).name || "unknown";
    const fileType = file.type || "";

    if (!isExtractableFile(fileName, fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: `「${fileName}」属于可执行文件或无文本内容的音视频文件，无法提取文本。`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 限制单文件 20MB，避免服务器资源被占满
    const MAX_SIZE = 20 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "文件过大，请上传 20MB 以内的文件" },
        { status: 400 }
      );
    }

    // 解析整体超时兜底：避免 OfficeParser/OCR 等占用过久导致前端请求挂死
    const text = await Promise.race([
      extractTextFromBuffer(buffer, fileName, fileType),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 60000)),
    ]);
    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: "未能从文件中提取到有效文本，请检查文件内容或换一份文件重试" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileSize: buffer.length,
      text,
    });
  } catch (error: any) {
    console.error("extract-text error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "文件解析失败" },
      { status: 500 }
    );
  }
}
