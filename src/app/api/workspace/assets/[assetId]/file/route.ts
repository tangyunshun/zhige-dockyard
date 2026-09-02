export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { readAssetFile } from "@/lib/file-store";

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
      return NextResponse.json({ error: "越权警告：您不属于该工作空间，无权访问资料文件" }, { status: 403 });
    }

    // 个人私密资料严格隔离：仅上传人本人可读取原文件，管理员/所有者也不可越权访问
    if (doc.visibility === "PRIVATE" && doc.uploaderId !== auth.user.id) {
      return NextResponse.json({ error: "越权警告：个人私密资料仅上传人本人可访问" }, { status: 403 });
    }

    let buffer: Buffer | null = null;
    let contentType = doc.mimeType || "application/octet-stream";

    if (doc.filePath) {
      try {
        buffer = await readAssetFile(doc.filePath);
      } catch {
        buffer = null;
      }
    }

    // 历史文本资料未落盘时，直接以文本形式返回 content，保证预览不空白
    if (!buffer && doc.content && !doc.content.startsWith("data:")) {
      buffer = Buffer.from(doc.content, "utf-8");
      contentType = "text/plain; charset=utf-8";
    }

    if (!buffer) {
      return NextResponse.json({ error: "资料原文件缺失，请重新上传" }, { status: 404 });
    }

    const downloadName = doc.originalName || doc.title || assetId;
    const encodedName = encodeURIComponent(downloadName);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Asset file serve error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
