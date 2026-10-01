/**
 * 模型服务连通性探测（安全：不打印密钥、不打印完整 URL、不发送鉴权头）
 *
 * 用法：
 *   npx tsx scripts/model-connectivity-check.ts            # 只探测
 *   npx tsx scripts/model-connectivity-check.ts --sync     # 同时把 provider.baseUrl 同步为 .env.local 的 MODEL_BASE_URL
 *
 * 说明：
 *  - 读取 .env.local 中 MODEL_BASE_URL 作为真实端点（Next.js 运行时也是读取该文件）；
 *  - 探测仅访问 `${base}/models` 且 **不携带 API Key**：返回 401/403 即代表网络可达；
 *  - 若出现网络错误/超时，说明当前环境无外网出口，真实模型调用无法在此环境完成。
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { validateModelBaseUrl } from "../src/lib/model-endpoint";

const prisma = new PrismaClient();

function readEnvLocal(): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function probe(baseUrl: string): Promise<string> {
  const target = `${baseUrl.replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // 故意不带 Authorization：只判断网络可达性
    const res = await fetch(target, { method: "GET", signal: controller.signal, redirect: "manual" });
    return `HTTP_${res.status}（可达；未发送密钥）`;
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError" ? "TIMEOUT（15s 内无响应）" : (e as Error)?.message;
    return `UNREACHABLE: ${msg}`;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const env = readEnvLocal();
  const has = (k: string) => (env[k] ? "已配置" : "缺失");
  console.log(`[check] .env.local：MODEL_API_KEY=${has("MODEL_API_KEY")} MODEL_BASE_URL=${has("MODEL_BASE_URL")} MODEL_ID=${has("MODEL_ID")} MODEL_PROVIDER_ID=${has("MODEL_PROVIDER_ID")}`);

  const rawBase = env.MODEL_BASE_URL || process.env.MODEL_BASE_URL || "";
  if (!rawBase) {
    console.log("[check] 未找到 MODEL_BASE_URL，无法探测。");
    return;
  }
  const validation = validateModelBaseUrl(rawBase);
  if (!validation.ok) {
    console.log(`[check] MODEL_BASE_URL 未通过安全校验：${validation.error}`);
    return;
  }
  const host = (() => {
    try {
      return new URL(validation.url).host;
    } catch {
      return "(invalid)";
    }
  })();
  console.log(`[check] 真实端点 host=${host}`);

  const providers = await prisma.modelprovider.findMany({ select: { id: true, name: true, baseUrl: true } });
  console.log(`[check] 当前注册表供应商：${providers.map((p) => `${p.name}(${p.baseUrl === validation.url ? "已是真实端点" : "与 .env.local 不一致"})`).join(", ") || "无"}`);

  if (process.argv.includes("--sync")) {
    for (const p of providers) {
      if (p.baseUrl !== validation.url) {
        await prisma.modelprovider.update({ where: { id: p.id }, data: { baseUrl: validation.url } });
        console.log(`[check] 已同步 ${p.name} 的 Base URL 为 .env.local 中的真实端点`);
      }
    }
  }

  console.log(`[check] 连通性探测结果：${await probe(validation.url)}`);
}

main()
  .catch((e) => {
    console.error("[check] 失败:", (e as Error)?.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
