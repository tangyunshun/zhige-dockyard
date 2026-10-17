import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * 资料文件存储（双驱动，接口不变）：
 *
 * 1. 本地磁盘（默认）：uploads/assets/{workspaceId}/，文件名随机 UUID，不对外公开，
 *    读取一律经服务端鉴权接口（登录 + 空间成员校验）。
 *
 * 2. 云存储私有桶（S3 兼容协议，覆盖阿里云 OSS / 腾讯云 COS / AWS S3 / MinIO 等）：
 *    环境变量开启：
 *      STORAGE_DRIVER=s3
 *      S3_BUCKET=<私有桶名>
 *      S3_REGION=<地域，如 oss-cn-hangzhou / ap-guangzhou / us-east-1>
 *      S3_ENDPOINT=<S3 兼容端点，如 https://oss-cn-hangzhou.aliyuncs.com；AWS 原生可省略>
 *      S3_ACCESS_KEY_ID=<访问密钥>
 *      S3_SECRET_ACCESS_KEY=<密钥>
 *    隐私约束：桶必须为「私有读写」，本系统永不生成公开访问 URL，
 *    所有读取都经服务端 readAssetFile 流式转发并做成员权限校验。
 *    切换驱动后，新上传写入云桶；历史本地文件仍按本地驱动读取（filePath 前缀相同，按 key 兼容）。
 */

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "assets");

const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();

function s3Config() {
  return {
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  };
}

function isS3Enabled(): boolean {
  if (STORAGE_DRIVER !== "s3") return false;
  const { bucket, accessKeyId, secretAccessKey } = s3Config();
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { region, endpoint, accessKeyId, secretAccessKey } = s3Config();
  return new S3Client({
    region: region || "us-east-1",
    // OSS/COS/MinIO 等 S3 兼容端点需要 path-style；AWS 原生不带 endpoint 时自动 virtual-host
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** 统一的对象键：assets/{workspaceId}/{uuid}.{ext}（本地磁盘与云桶同构） */
function buildObjectKey(workspaceId: string, fileName: string): string {
  const safeWsId = (workspaceId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return `assets/${safeWsId}/${fileName}`;
}

/** 清洗历史路径为对象键（防目录穿越，兼容 uploads/、assets/ 前缀） */
function toObjectKey(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(?:uploads\/)?(?:assets\/)?/, "")
    .replace(/^(\.\.[\/\\])+/, "");
}

export function sanitizeFileExt(ext?: string | null): string {
  if (!ext) return "";
  return ext
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
}

export function resolveAssetAbsolute(relativePath: string): string {
  return path.join(UPLOAD_ROOT, toObjectKey(relativePath));
}

export async function saveAssetFile(
  workspaceId: string,
  originalName: string,
  buffer: Buffer,
  ext?: string | null,
): Promise<{ filePath: string; size: number; mimeType: string }> {
  const safeExt = sanitizeFileExt(ext);
  const fileName = `${crypto.randomUUID()}${safeExt ? "." + safeExt : ""}`;
  const key = buildObjectKey(workspaceId, fileName);
  const mimeType = inferMimeType(originalName, safeExt);

  if (isS3Enabled()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config().bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // 私有桶：对象本身不设公开可读，读取走服务端
      }),
    );
    return { filePath: key, size: buffer.length, mimeType };
  }

  const absolute = path.join(UPLOAD_ROOT, key);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return { filePath: key, size: buffer.length, mimeType };
}

export async function deleteAssetFile(relativePath?: string | null): Promise<void> {
  if (!relativePath) return;
  const key = toObjectKey(relativePath);
  try {
    if (isS3Enabled()) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3Client();
      await client.send(new DeleteObjectCommand({ Bucket: s3Config().bucket, Key: key }));
      return;
    }
    await fs.unlink(path.join(UPLOAD_ROOT, key));
  } catch {
    // 文件不存在时静默忽略，避免删除流程被历史脏数据阻断
  }
}

export async function readAssetFile(relativePath: string): Promise<Buffer> {
  const key = toObjectKey(relativePath);
  if (isS3Enabled()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const result = await client.send(
      new GetObjectCommand({ Bucket: s3Config().bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    const body = result.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return fs.readFile(path.join(UPLOAD_ROOT, key));
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
