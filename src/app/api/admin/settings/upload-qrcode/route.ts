import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import crypto from "crypto";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 社交二维码（微信、QQ群、微博）上传 API
 * 权限：仅系统管理员
 * 目标目录：public/uploads/qrcodes/
 * 格式支持：PNG, JPG, JPEG, SVG, WEBP (最大 5MB)
 * 联动：可选自动持久化更新 systemconfig 表中的对应二维码字段
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请重新登录" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const configKey = formData.get("configKey") as string | null;

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
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "仅支持上传常见图片格式（PNG / JPG / JPEG / SVG / WEBP）" },
        { status: 400 }
      );
    }

    // 大小限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "二维码图片大小不能超过 5MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const prefix = configKey ? configKey.replace(/[^a-zA-Z0-9]/g, "_") : "qr";
    const fileName = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;

    const uploadDir = join(process.cwd(), "public", "uploads", "qrcodes");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filePath = join(uploadDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const qrUrl = `/uploads/qrcodes/${fileName}`;

    // 如果传入了有效的配置项 Key，自动写入 systemconfig 表实现真实落库
    if (
      configKey &&
      ["footerWechatQr", "footerQqQr", "footerWeiboQr"].includes(configKey)
    ) {
      await prisma.systemconfig.upsert({
        where: { key: configKey },
        create: { key: configKey, value: qrUrl },
        update: { value: qrUrl },
      });
    }

    return NextResponse.json({
      success: true,
      url: qrUrl,
      configKey,
      message: "二维码图片已成功上传并生效",
    });
  } catch (error) {
    console.error("上传二维码失败:", error);
    return NextResponse.json({ error: "上传二维码失败，服务器异常" }, { status: 500 });
  }
}
