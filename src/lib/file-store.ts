import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "assets");

export function sanitizeFileExt(ext?: string | null): string {
  if (!ext) return "";
  return ext
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
}

export function resolveAssetAbsolute(relativePath: string): string {
  const root = path.resolve(UPLOAD_ROOT);
  const target = path.resolve(root, relativePath.replace(/^assets[\\/]/, ""));
  if (!target.startsWith(root + path.sep)) {
    throw new Error("INVALID_ASSET_PATH");
  }
  return target;
}

export async function saveAssetFile(
  workspaceId: string,
  originalName: string,
  buffer: Buffer,
  ext?: string | null,
): Promise<{ filePath: string; size: number; mimeType: string }> {
  const safeExt = sanitizeFileExt(ext);
  const dir = path.join(UPLOAD_ROOT, workspaceId);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}${safeExt ? "." + safeExt : ""}`;
  const absolute = path.join(dir, fileName);
  await fs.writeFile(absolute, buffer);
  return {
    filePath: `assets/${workspaceId}/${fileName}`,
    size: buffer.length,
    mimeType: inferMimeType(originalName, safeExt),
  };
}

export async function deleteAssetFile(relativePath?: string | null): Promise<void> {
  if (!relativePath) return;
  try {
    await fs.unlink(resolveAssetAbsolute(relativePath));
  } catch {
    // 文件不存在时静默忽略，避免删除流程被历史脏数据阻断
  }
}

export async function readAssetFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveAssetAbsolute(relativePath));
}

function inferMimeType(name: string, ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "application/xml",
    csv: "text/csv",
    zip: "application/zip",
    rar: "application/vnd.rar",
  };
  if (mimeMap[ext]) return mimeMap[ext];
  const dot = name.lastIndexOf(".");
  const nameExt = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return mimeMap[nameExt] || "application/octet-stream";
}
