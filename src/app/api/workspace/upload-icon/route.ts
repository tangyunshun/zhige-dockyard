﻿import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import crypto from "crypto";
import { validateUser } from "@/lib/auth";

/**
 * 空间 Logo 上传 API
 *
 * 存储方式（与项目其他上传接口一致）：
 *  - 图片文件落盘至 public/uploads/workspace-icons/；
 *  - 数据库（workspace.logo）只保存访问地址 /uploads/workspace-icons/xxx.png；
 *  - 不再把图片转成 base64 塞进数据库，避免单条记录数百 KB、拖慢接口与备份。
 *
 * 注意：本接口只负责存文件并返回地址，是否写入空间 logo 字段由调用方落库
 * （空间设置页上传后立即 PATCH /api/workspace/update 持久化）。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("authorization"), request);
    if (!authResult.valid) {
      return NextResponse.json({ message: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user!.id;

    // 获取上传的文件
    const formData = await request.formData();
    const file = formData.get("icon") as File;

    if (!file) {
      return NextResponse.json({ message: "请上传文件" }, { status: 400 });
    }

    // 验证文件类型（仅图片）
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ message: "只能上传图片文件" }, { status: 400 });
    }

    // 验证文件大小（最大 2MB）
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ message: "文件大小不能超过 2MB" }, { status: 400 });
    }

    // 生成安全文件名：仅允许字母数字扩展名，避免路径穿越与非法后缀
    const rawExt = (file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "png";
    const fileName = `${userId}_${crypto.randomBytes(8).toString("hex")}.${safeExt}`;

    const uploadDir = join(process.cwd(), "public", "uploads", "workspace-icons");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, fileName), buffer);

    const iconUrl = `/uploads/workspace-icons/${fileName}`;

    return NextResponse.json({
      success: true,
      iconUrl,
      message: "上传图标成功",
    });
  } catch (error) {
    console.warn("Upload icon error:", error);
    return NextResponse.json({ message: "上传图标失败" }, { status: 500 });
  }
}
