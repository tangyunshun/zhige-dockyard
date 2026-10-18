import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireSystemSettingsAdmin } from "@/lib/security";

/**
 * POST /api/upload —— 通用图片上传（仅超管可用）
 *
 * 接收 multipart/form-data 的 `file` 字段，写入 public/uploads 目录（Next.js 静态托管），
 * 返回可公开访问的 URL（/uploads/xxx.png）。用于后台二维码等图片资源上传。
 */
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  // 鉴权：复用系统设置超管权限
  const result = await requireSystemSettingsAdmin(
    request,
    "system:manage",
    "system:config_read",
    "system:update",
    "system:maintenance_toggle",
    "system:read"
  );
  if (!result.authorized || !result.user) {
    const status = result.errorResponse?.status === 401 ? 401 : 403;
    return NextResponse.json(
      { success: false, error: result.errorResponse?.message || "无权限上传文件" },
      { status }
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "未找到上传文件" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "仅支持 PNG / JPG / WEBP / GIF 图片" },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "图片大小不能超过 2MB" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? ext : "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${filename}`,
    });
  } catch (error) {
    console.error("[upload] 上传失败:", error);
    return NextResponse.json({ success: false, error: "文件写入失败，请稍后重试" }, { status: 500 });
  }
}
