import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * 统一 CLI 环境加载器
 *
 * 优先级规范：
 * 1. 已存在的系统环境变量（process.env 原生值）优先，不被覆盖；
 * 2. .env.local 补全未定义变量；
 * 3. .env 补全剩余变量。
 *
 * ⚠️ 仅供 scripts/ 和测试代码引用，严禁导入到 Next.js 生产运行时路径中。
 */
export function loadCliEnv(): void {
  const cwd = process.cwd();
  const envLocalPath = path.resolve(cwd, ".env.local");
  const envPath = path.resolve(cwd, ".env");

  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: false });
  }

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

/**
 * 脱敏展示服务端点：仅显示协议与主机名/端口，禁止泄露路径敏感信息
 */
export function sanitizeEndpointForDisplay(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "[非合法 URL 格式]";
  }
}

/**
 * 脱敏展示密钥配置状态：仅输出已配置/未配置，绝不打印密钥明文
 */
export function formatSecretConfiguredStatus(value: string | undefined | null): string {
  if (value && value.trim().length > 0) {
    return "已配置 (长度: " + value.trim().length + " 字符)";
  }
  return "未配置 (缺失)";
}

/**
 * 解析并校验 C07 模型的 Base URL 决策函数
 *
 * 核心安全红线：缺少 Base URL 时必须硬失败（抛出或返回 C07_BASE_URL_REQUIRED），
 * 绝不得隐式默认降级至 https://api.openai.com/v1！
 */
export function resolveC07BaseUrl(envSource: Record<string, string | undefined> = process.env): {
  success: boolean;
  baseUrl?: string;
  error?: string;
} {
  const explicit = (envSource.C07_PROVIDER_BASE_URL || envSource.MODEL_BASE_URL || "").trim();
  if (!explicit) {
    return {
      success: false,
      error: "C07_BASE_URL_REQUIRED: 未配置 MODEL_BASE_URL 或 C07_PROVIDER_BASE_URL，禁止隐式默认写入！",
    };
  }
  return {
    success: true,
    baseUrl: explicit,
  };
}
