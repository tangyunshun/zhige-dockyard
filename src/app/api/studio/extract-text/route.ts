export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { extractTextFromBuffer, isExtractableFile } from "@/lib/text-extract";

// 单账号并发解析上限与每分钟请求频控，避免 OCR 等重算力被刷爆
const MAX_CONCURRENT_PER_USER = 3;
const MAX_REQUESTS_PER_MIN = 20;

// 进程内（单实例）简单限流计数，足够拦住异常高频的批量调用
const userInFlight = new Map<string, number>();
const userReqLog = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  try {
    // 提取文件必须登录，避免未授权上传与算力滥用
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const uid = String(
      (auth.user as any).id ||
        (auth.user as any).userId ||
        (auth.user as any).email ||
        "anonymous"
    );

    const now = Date.now();
    const inflight = userInFlight.get(uid) || 0;
    if (inflight >= MAX_CONCURRENT_PER_USER) {
      return NextResponse.json(
        { success: false, error: "当前账号文件解析任务过多，请稍候片刻再上传" },
        { status: 429 }
      );
    }
    const recent = (userReqLog.get(uid) || []).filter((t) => now - t < 60000);
    if (recent.length >= MAX_REQUESTS_PER_MIN) {
      return NextResponse.json(
        { success: false, error: "文件解析请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }
    recent.push(now);
    userReqLog.set(uid, recent);
    userInFlight.set(uid, inflight + 1);

    try {
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
        // 图片提取不到文字时给出明确的友好提示（多为纯图形/照片，无 OCR 可识别文字）
        const isImageFile =
          /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(fileName) ||
          fileType.toLowerCase().startsWith("image/");
        if (isImageFile) {
          return NextResponse.json(
            {
              success: false,
              error: `「${fileName}」中未检测到文字内容，无法处理。请上传包含文字的图片（如截图、需求文档照片），或直接在输入框中描述您的任务需求。`,
            },
            { status: 400 }
          );
        }
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
    } finally {
      const n = (userInFlight.get(uid) || 1) - 1;
      if (n <= 0) userInFlight.delete(uid);
      else userInFlight.set(uid, n);
    }
  } catch (error: any) {
    console.error("extract-text error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "文件解析失败" },
      { status: 500 }
    );
  }
}
