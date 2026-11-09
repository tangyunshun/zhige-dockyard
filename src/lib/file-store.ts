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

/**
 * [R0-J3 J-KEYS] 对象键路径越界错误：键中残留目录穿越段（..）或不在授权空间时拒绝。
 * 全部解析入口（保存/读取/删除/绝对路径解析）共用。
 */
export class ObjectPathEscapeError extends Error {
  code = "OBJECT_PATH_ESCAPE";
  constructor(message: string) {
    super(message);
    this.name = "ObjectPathEscapeError";
  }
}

/** 空间边界：归一键首段（工作空间目录）必须等于授权空间 ID */
export function assertObjectKeyInWorkspace(normalizedKey: string, workspaceId: string): void {
  const first = normalizedKey.split("/")[0];
  if (first !== workspaceId) {
    throw new ObjectPathEscapeError(`对象键不在授权空间内（${first} ≠ ${workspaceId}），已拒绝`);
  }
}

/** 清洗历史路径为对象键（防目录穿越，兼容 uploads/、assets/ 前缀）。
 *  [R0-J3 J-KEYS] 只剥开头 ../ 不再足够：任何位置的 .. / . 穿越段一律拒绝。 */
function toObjectKey(relativePath: string): string {
  const s = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^(?:uploads\/)?(?:assets\/)?/, "");
  const segs = s.split("/").filter((seg) => seg.length > 0);
  if (segs.length === 0 || segs.some((seg) => seg === ".." || seg === ".")) {
    throw new ObjectPathEscapeError(`对象键包含目录穿越段（${relativePath}），已拒绝`);
  }
  return segs.join("/");
}

/**
 * [R0-J1 J-KEYS] 解析对象候选键列表（本地磁盘按候选顺序探测；S3 使用规范键）：
 * 1. 归一键 {wsId}/{file}——本批新保存的正确位置；
 * 2. 历史 assets/{wsId}/{file}——R0-J 修复前保存的双 assets 前缀实际位置。
 */
function resolveObjectCandidates(relativePath: string): string[] {
  const normalized = toObjectKey(relativePath);
  if (!normalized) return [];
  const candidates = [normalized];
  const withAssets = `assets/${normalized}`;
  if (withAssets !== normalized) candidates.push(withAssets);
  return candidates;
}

/** S3 规范键：PUT/GET/DELETE 同一 key（修复 PUT assets/w1/uuid 而 GET/DELETE w1/uuid 的分叉） */
function s3ObjectKey(relativePath: string): string {
  return `assets/${toObjectKey(relativePath)}`;
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
  const key = toObjectKey(relativePath);
  const absolute = path.resolve(path.join(UPLOAD_ROOT, key));
  // [R0-J3 J-KEYS] 双保险：解析结果必须仍在存储根内（toObjectKey 拒绝穿越段后的根级兜底）
  const rootAbs = path.resolve(UPLOAD_ROOT);
  if (!(absolute + path.sep).startsWith(rootAbs + path.sep) && absolute !== rootAbs) {
    throw new ObjectPathEscapeError(`解析路径越出存储根（${relativePath}），已拒绝`);
  }
  return absolute;
}

/**
 * [R0-J3 J-UPLOAD §二.1] 对象键预分配：在外部写入之前由调用方生成并可持久关联操作，
 * 不再由保存函数私自随机命名导致"丢失响应后无法关联对象"。
 */
export function allocateObjectKey(workspaceId: string, ext?: string | null): { key: string; mimeType: string; safeExt: string } {
  const safeExt = sanitizeFileExt(ext);
  const fileName = `${crypto.randomUUID()}${safeExt ? "." + safeExt : ""}`;
  const key = buildObjectKey(workspaceId, fileName);
  return { key, mimeType: inferMimeType(fileName, safeExt), safeExt };
}

/** 按【已预分配】的对象键落盘（S3/本地同构）。键必须经 allocateObjectKey 生成或为已验证历史键。 */
export async function saveAssetFileToKey(
  key: string,
  buffer: Buffer,
  scopeWorkspaceId?: string,
): Promise<{ filePath: string; size: number; mimeType: string }> {
  const normalized = toObjectKey(key);
  if (scopeWorkspaceId) assertObjectKeyInWorkspace(normalized, scopeWorkspaceId);
  const mimeType = inferMimeType(normalized, normalized.split(".").pop() || "");

  if (isS3Enabled()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const s3Key = s3ObjectKey(key);
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config().bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
        // 私有桶：对象本身不设公开可读，读取走服务端
      }),
    );
    return { filePath: s3Key, size: buffer.length, mimeType };
  }

  // [R0-J S04] 本地路径与读取/删除同一契约：key 经 toObjectKey 归一后再拼接
  const absolute = resolveAssetAbsolute(normalized);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  // 返回与历史一致的规范存储格式 assets/{wsId}/{uuid}（document.filePath 契约不变）
  return { filePath: `assets/${normalized}`, size: buffer.length, mimeType };
}

export async function saveAssetFile(
  workspaceId: string,
  originalName: string,
  buffer: Buffer,
  ext?: string | null,
): Promise<{ filePath: string; size: number; mimeType: string }> {
  // [R0-J3 J-UPLOAD] 保持旧签名兼容：内部改为预分配键 + 按键落盘（同一契约）
  const { key } = allocateObjectKey(workspaceId, ext);
  return saveAssetFileToKey(key, buffer, workspaceId);
}

export interface DeleteAssetFileResult {
  /** true：对象已删除或确认不存在（幂等成功） */
  ok: boolean;
  /** false 且 notExists=false：删除失败（权限/磁盘/云服务错误），调用方不得伪装成功 */
  notExists: boolean;
  /** [R0-J3 J-KEYS] true：多候选歧义（新位置与历史位置并存），未删除任何对象，待人工核实 */
  ambiguous?: boolean;
  error?: string;
}

/**
 * [R0-J S04] 删除物理对象：只有确认不存在才按幂等成功处理；
 * 权限错误、磁盘错误、云服务错误都如实返回失败结果，不再静默吞掉。
 */
export async function deleteAssetFile(relativePath?: string | null, scopeWorkspaceId?: string): Promise<DeleteAssetFileResult> {
  if (!relativePath) return { ok: true, notExists: true };
  let key: string;
  try {
    key = toObjectKey(relativePath);
    // [R0-J3 J-KEYS] 授权空间边界
    if (scopeWorkspaceId) assertObjectKeyInWorkspace(key, scopeWorkspaceId);
  } catch (e) {
    if ((e as Error)?.name === "ObjectPathEscapeError") {
      return { ok: false, notExists: false, error: (e as Error).message };
    }
    throw e;
  }
  try {
    if (isS3Enabled()) {
      // [R0-J1 J-KEYS] S3 DELETE 与 PUT 同一规范键
      const s3Key = s3ObjectKey(key);
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3Client();
      await client.send(new DeleteObjectCommand({ Bucket: s3Config().bucket, Key: s3Key }));
      return { ok: true, notExists: false };
    }
    // [R0-J1 J-KEYS] 本地按候选顺序删除（新位置 → 历史位置）；候选均不存在才视为不存在
    const candidates = resolveObjectCandidates(relativePath);
    // [R0-J3 J-KEYS] 多候选歧义拒绝：归一位置与历史双 assets 位置同时存在时，
    // 任何实际删除前安全拒绝并提示待核实——不删第一个就成功，也不擅自删掉所有候选
    const existing: string[] = [];
    for (const c of candidates) {
      try {
        await fs.stat(path.join(UPLOAD_ROOT, c));
        existing.push(c);
      } catch (e: any) {
        if (e?.code !== "ENOENT") throw e;
      }
    }
    if (existing.length > 1) {
      return {
        ok: false,
        notExists: false,
        ambiguous: true,
        error: `同一对象键存在 ${existing.length} 个候选位置（${existing.join("、")}），为避免误删已拒绝，请人工核实后处理`,
      };
    }
    let lastErr: any = null;
    for (const c of candidates) {
      try {
        await fs.unlink(path.join(UPLOAD_ROOT, c));
        return { ok: true, notExists: false };
      } catch (e: any) {
        if (e?.code !== "ENOENT") throw e;
        lastErr = e;
      }
    }
    return { ok: true, notExists: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return { ok: true, notExists: true };
    }
    return { ok: false, notExists: false, error: err?.message || "物理文件删除失败" };
  }
}

export async function readAssetFile(relativePath: string, scopeWorkspaceId?: string): Promise<Buffer> {
  const key = toObjectKey(relativePath);
  // [R0-J3 J-KEYS] 授权空间边界（调用方传入已鉴权工作空间 ID 时强制校验）
  if (scopeWorkspaceId) assertObjectKeyInWorkspace(key, scopeWorkspaceId);
  if (isS3Enabled()) {
    // [R0-J1 J-KEYS] S3 GET 与 PUT 使用同一规范键
    const s3Key = s3ObjectKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const result = await client.send(
      new GetObjectCommand({ Bucket: s3Config().bucket, Key: s3Key }),
    );
    const chunks: Buffer[] = [];
    const body = result.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  // [R0-J1 J-KEYS] 本地按候选顺序探测（新位置 → 历史双 assets 位置）；候选均不存在才报 ENOENT
  const candidates = resolveObjectCandidates(relativePath);
  const errors: string[] = [];
  for (const c of candidates) {
    try {
      return await fs.readFile(path.join(UPLOAD_ROOT, c));
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
      errors.push(c);
    }
  }
  const wrapped: any = new Error("ENOENT: no such file or directory at any known candidate location");
  wrapped.code = "ENOENT";
  wrapped.candidates = errors;
  throw wrapped;
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
