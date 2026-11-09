export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { readAssetFile } from "@/lib/file-store";
import { getFileExtension } from "@/lib/file-type";
import { runIsolatedParse } from "@/lib/parse-runner";
import {
  PARSE_CODES,
  PARSE_LIMITS,
  ParseResourceError,
  RootBudget,
  parseErrorBody,
  checkRealInput,
} from "@/lib/parse-policy";
import {
  acquireParseLease,
  releaseParseLease,
  quarantineParseLease,
} from "@/lib/parse-admission";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tif", "tiff"]);
const TABLE_EXTS = new Set(["xlsx", "xls", "csv", "ods"]);

/**
 * [R0-K / 原 F14 K04] 预览重解析接线。
 * 图片/PDF 仅返回已鉴权文件 URL（不做服务端重解析，保持既有行为）；
 * XLSX / mammoth / 文本兜底重解析全部走同一共享准入 + 根预算 + 隔离 worker。
 * 权限（认证、空间成员、私密归属）在准入与 worker 启动之前验证。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  let lease: Awaited<ReturnType<typeof acquireParseLease>> | null = null;
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
    if (doc.visibility === "PRIVATE" && doc.uploaderId !== auth.user.id) {
      return NextResponse.json({ error: "越权警告：个人私密资料仅上传人本人可预览" }, { status: 403 });
    }

    const ext = (doc.fileExt || getFileExtension(doc.title || "")).toLowerCase();
    const mime = (doc.mimeType || "").toLowerCase();
    const fileUrl = doc.filePath ? `/api/workspace/assets/${doc.id}/file` : null;

    // 已鉴权 URL 分支：不启动重解析、不制造 worker、不占准入名额
    if (IMAGE_EXTS.has(ext) || mime.startsWith("image/")) {
      return NextResponse.json({ success: true, data: { type: "image", url: fileUrl } });
    }
    if (ext === "pdf" || mime === "application/pdf") {
      return NextResponse.json({ success: true, data: { type: "pdf", url: fileUrl } });
    }

    // 仅纯文本类文件可在已有正文时直接返回；表格/docx 等必须走 table/html 重解析协议，
    // 不得把已有缓存正文伪造成功的 text，否则 xlsx/docx 在有缓存时丢失结构化预览。
    const PLAIN_TEXT_EXTS = new Set([".txt", ".text", ".md", ".markdown", ".json", ".xml", ".log", ".html", ".htm"]);
    const extNorm = ext.startsWith(".") ? ext : "." + ext;
    if (PLAIN_TEXT_EXTS.has(extNorm) && doc.content && String(doc.content).trim()) {
      return NextResponse.json({ success: true, data: { type: "text", content: String(doc.content) } });
    }

    let buffer: Buffer | null = null;
    if (doc.filePath) {
      try {
        buffer = await readAssetFile(doc.filePath, doc.workspaceId); // [R0-J3 J-KEYS] 授权空间边界
      } catch {
        buffer = null;
      }
    }

    if (!buffer) {
      return NextResponse.json({ success: true, data: { type: "notice", message: "原文件缺失，无法生成预览，可下载原文件查看" } });
    }

    // 权限通过后才准入；任何未就绪/繁忙在 worker 启动之前拒绝
    lease = await acquireParseLease({
      userId: String(auth.user.id),
      workUnits: PARSE_LIMITS.WORK_UNITS_PER_PARSE,
      now: Date.now(),
    });
    // 分配后按真实字节核验（客户端元数据不作为依据）；各任务的输入字节
    // 由 worker 随 usage 上报并合并进同一根预算，避免重复计数。
    checkRealInput(buffer, PARSE_LIMITS.ROOT_MAX_INPUT_BYTES);
    const budget = new RootBudget({ deadlineMs: PARSE_LIMITS.HARD_DEADLINE_MS });

    let reparse: Awaited<ReturnType<typeof runIsolatedParse>>;
    try {
      const taskKind = TABLE_EXTS.has(ext)
        ? "table-preview"
        : (ext === "docx" || mime.includes("wordprocessingml")) ? "docx-html" : "parse";
      reparse = await runIsolatedParse({
        task: { kind: taskKind, buffer, fileName: doc.originalName || doc.title || "file", mimeType: mime },
        budget,
        deadlineMs: PARSE_LIMITS.HARD_DEADLINE_MS,
        signal: request.signal,
      });
    } catch (err) {
      if (err instanceof ParseResourceError && err.code === PARSE_CODES.STOP_UNCONFIRMED) {
        await quarantineParseLease(lease, "预览解析 worker 退出未确认").catch(() => {});
        lease = null;
      }
      const e = err instanceof ParseResourceError ? err : new ParseResourceError(PARSE_CODES.FAILED);
      return NextResponse.json({
        success: false,
        code: e.code,
        error: `${e.message}；可下载原文件查看。`,
        data: { type: "notice", message: "预览解析失败，请下载原文件查看" },
      }, { status: e.status });
    }

    if (taskKindIsTable(ext)) {
      return NextResponse.json({
        success: true,
        data: { type: "table", sheetName: reparse.sheetName, sheetNames: reparse.sheetNames, rows: reparse.rows },
      });
    }
    if (taskKindIsDocx(ext, mime) && reparse.html) {
      return NextResponse.json({ success: true, data: { type: "html", html: reparse.html } });
    }
    const text = String(reparse.text || "");
    if (text.trim()) {
      return NextResponse.json({ success: true, data: { type: "text", content: text } });
    }
    return NextResponse.json({
      success: true,
      data: { type: "notice", message: "该文件无文字内容可提取，可下载原文件查看。" },
    });
  } catch (error: any) {
    if (lease && error instanceof ParseResourceError && error.code === PARSE_CODES.STOP_UNCONFIRMED) {
      await quarantineParseLease(lease, "预览解析 worker 退出未确认").catch(() => {});
      lease = null;
    }
    if (error instanceof ParseResourceError) {
      return NextResponse.json({ ...parseErrorBody(error), data: { type: "notice", message: "可下载原文件查看" } }, { status: error.status });
    }
    console.error("Asset preview error:", error instanceof Error ? error.name : "internal");
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  } finally {
    if (lease) await releaseParseLease(lease).catch(() => {});
  }
}

function taskKindIsTable(ext: string): boolean {
  return TABLE_EXTS.has(ext);
}
function taskKindIsDocx(ext: string, mime: string): boolean {
  return ext === "docx" || mime.includes("wordprocessingml");
}
