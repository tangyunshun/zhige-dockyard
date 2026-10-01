/**
 * 服务端 JWT 配置唯一真源 (Server JWT Configuration Single Source of Truth)
 *
 * 安全设计原则：
 * 1. 严禁使用任何形式的弱硬编码默认值（如 "your-secret-key-change-in-production"）；
 * 2. 运行时缺少 JWT_SECRET 或强度不达标（< 32 字符）时直接拒绝签发与验签；
 * 3. 校验逻辑仅在调用时执行（延迟求值），避免在 Next.js 构建或静态导出期阻断构建；
 * 4. 严禁直接向外泄露密钥明文。
 */

export class JwtConfigurationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[JWT_CONFIG_ERROR][${code}] ${message}`);
    this.name = "JwtConfigurationError";
    this.code = code;
  }
}

// 内部测试显式注入槽位（仅用于自动化测试，严禁在生产中使用）
let explicitTestSecret: string | null = null;

// 缓存已编码的 Uint8Array，避免每次请求重复编码
let cachedSecretString: string | null = null;
let cachedSecretKey: Uint8Array | null = null;

/**
 * 校验并获取服务端 JWT 签名密钥字符串
 */
export function getJwtSecretString(): string {
  const secret = explicitTestSecret || process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    console.error("[JWT_SECURITY_ERROR] 严重安全错误：系统未配置 JWT_SECRET 环境变量！鉴权已被拒绝。");
    throw new JwtConfigurationError(
      "MISSING_JWT_SECRET",
      "JWT_SECRET environment variable is missing or empty. Please configure a secure random key in .env."
    );
  }

  const trimmed = secret.trim();

  // 严格安全加固：HS256 算法建议至少 256 位（32 字节/字符），防止弱密钥被彩虹表碰撞暴力破解
  if (trimmed.length < 32) {
    console.error("[JWT_SECURITY_ERROR] 严重安全错误：JWT_SECRET 长度不足 32 字符！");
    throw new JwtConfigurationError(
      "INSECURE_JWT_SECRET",
      "JWT_SECRET is too short: at least 32 characters are required for secure token signing."
    );
  }

  return trimmed;
}

/**
 * 校验并获取用于 jose 库验签与签名的 Uint8Array 密钥
 */
export function getJwtSecretKey(): Uint8Array {
  const secretStr = getJwtSecretString();

  if (cachedSecretKey && cachedSecretString === secretStr) {
    return cachedSecretKey;
  }

  cachedSecretString = secretStr;
  cachedSecretKey = new TextEncoder().encode(secretStr);
  return cachedSecretKey;
}

/**
 * 仅用于自动化测试环境显式注入测试密钥（严禁在生产调用）
 */
export function setExplicitTestJwtSecret(secret: string | null): void {
  explicitTestSecret = secret;
  cachedSecretString = null;
  cachedSecretKey = null;
}
