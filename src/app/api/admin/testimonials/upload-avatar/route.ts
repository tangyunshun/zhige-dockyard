import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import crypto from "crypto";
import { requirePlatformPermission } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * 评价者头像上传
 * 权限：content:update（与用户评价模块守卫一致）
 * 目标目录：public/uploads/testimonials/
 * 限制：图片格式，最大 2MB
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "无权限上传头像" },
        { status }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未找到上传文件" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片格式（PNG / JPG / WEBP）" }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "头像图片大小不能超过 2MB" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const fileName = `avatar_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;

    const uploadDir = join(process.cwd(), "public", "uploads", "testimonials");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    await writeFile(join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

    const url = `/uploads/testimonials/${fileName}`;
    return NextResponse.json({ success: true, url, message: "头像上传成功" });
  } catch (error) {
    console.error("Upload testimonial avatar error:", error);
    return NextResponse.json({ error: "上传头像失败，服务器处理异常" }, { status: 500 });
  }
}
