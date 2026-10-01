/**
 * 密钥加密工具（仅用于「用户/空间自带模型」的 API Key 落库）
 *
 * 设计要点：
 *  - 采用 AES-256-GCM（认证加密，防篡改）；
 *  - 主密钥取自服务端环境变量 MODEL_SECRET_ENCRYPTION_KEY（32 字节，hex 编码共 64 字符）；
 *  - 明文密钥**绝不**以可读形式写入数据库，只存密文；
 *  - 主密钥缺失时 fail-closed（直接抛错，不允许降级为明文）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const raw = process.env.MODEL_SECRET_ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "MODEL_SECRET_ENCRYPTION_KEY 未配置或格式非法（需 32 字节 hex，共 64 个十六进制字符）。BYO 模型密钥无法加解密。",
    );
  }
  return Buffer.from(raw, "hex");
}

/** 加密明文密钥，返回 base64(iv | authTag | ciphertext) */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** 解密密文（base64(iv | authTag | ciphertext)）为明文密钥 */
export function decryptSecret(cipherB64: string): string {
  const key = getKey();
  const buf = Buffer.from(cipherB64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const enc = buf.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
