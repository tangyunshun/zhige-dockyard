export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { readAssetFile } from "@/lib/file-store";
import { getFileExtension } from "@/lib/file-type";
import { extractTextFromBuffer } from "@/lib/text-extract";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tif", "tiff"]);
const TABLE_EXTS = new Set(["xlsx", "xls", "csv", "ods"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { assetId } = await params;
    const doc = await prisma.document.findUnique({ where: { id: assetId } });
    if (!doc) {
      return NextResponse.json({ error: "资料不存在" }, { status: 404 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, doc.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您不属于该工作空间，无权预览资料" }, { status: 403 });
    }

    // 个人私密资料严格隔离：仅上传人本人可预览，管理员/所有者也不可越权访问
    if (doc.visibility === "PRIVATE" && doc.uploaderId !== auth.user.id) {
      return NextResponse.json({ error: "越权警告：个人私密资料仅上传人本人可预览" }, { status: 403 });
    }

    const ext = (doc.fileExt || getFileExtension(doc.title || "")).toLowerCase();
    const mime = (doc.mimeType || "").toLowerCase();
    const fileUrl = doc.filePath ? `/api/workspace/assets/${doc.id}/file` : null;

    if (IMAGE_EXTS.has(ext) || mime.startsWith("image/")) {
      return NextResponse.json({ success: true, data: { type: "image", url: fileUrl } });
    }
    if (ext === "pdf" || mime === "application/pdf") {
      return NextResponse.json({ success: true, data: { type: "pdf", url: fileUrl } });
    }

    let buffer: Buffer | null = null;
    if (doc.filePath) {
      try {
        buffer = await readAssetFile(doc.filePath);
      } catch {
        buffer = null;
      }
    }

    if (TABLE_EXTS.has(ext)) {
      if (!buffer) {
        return NextResponse.json({ success: true, data: { type: "notice", message: "原文件缺失，无法生成表格预览" } });
      }
      try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0] || "Sheet1";
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }).slice(0, 500);
        return NextResponse.json({
          success: true,
          data: {
            type: "table",
            sheetName: firstSheetName,
            sheetNames: workbook.SheetNames.slice(0, 10),
            rows,
          },
        });
      } catch (error) {
        console.error("Excel preview parse error:", error);
        return NextResponse.json({ success: true, data: { type: "notice", message: "表格解析失败，请下载原文件查看" } });
      }
    }

    if (ext === "docx" || mime.includes("wordprocessingml")) {
      if (buffer) {
        try {
          const result = await mammoth.convertToHtml({ buffer });
          return NextResponse.json({ success: true, data: { type: "html", html: result.value } });
        } catch (error) {
          console.error("Word preview parse error:", error);
        }
      }
    }

    let text = doc.content || "";
    if (!text && buffer) {
      text = await extractTextFromBuffer(buffer, doc.originalName || doc.title || "file", mime);
    }
    if (text && text.trim()) {
      return NextResponse.json({ success: true, data: { type: "text", content: text } });
    }

    return NextResponse.json({
      success: true,
      data: {
        type: "notice",
        message: "该文件无文字内容可提取，可下载原文件查看。",
      },
    });
  } catch (error) {
    console.error("Asset preview error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
