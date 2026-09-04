import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import crypto from "crypto";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 平台系统 Logo 上传 API
 * 权限：仅管理员
 * 目标目录：public/uploads/system/
 * 格式支持：PNG, JPG, JPEG, SVG, WEBP, ICO (最大 5MB)
 * 联动：自动持久化更新 systemconfig 表中的 logo 字段
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "未找到上传文件" }, { status: 400 });
    }

    // 格式校验
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
      "image/webp",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持上传图片格式文件（PNG / JPG / SVG / WEBP / ICO）" }, { status: 400 });
    }

    // 大小限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo 图片大小不能超过 5MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `logo_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;

    const uploadDir = join(process.cwd(), "public", "uploads", "system");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filePath = join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const logoUrl = `/uploads/system/${fileName}`;

    // 自动将上传的 logoUrl 写入系统配置表
    await prisma.systemconfig.upsert({
      where: { key: "logo" },
      create: { key: "logo", value: logoUrl },
      update: { value: logoUrl },
    });

    return NextResponse.json({
      success: true,
      url: logoUrl,
      message: "平台 Logo 上传成功并已自动保存生效",
    });
  } catch (error) {
    console.error("上传平台 Logo 失败:", error);
    return NextResponse.json({ error: "上传 Logo 失败，服务器处理异常" }, { status: 500 });
  }
}
