/**
 * C07 模型注册表初始化（幂等）
 *
 * 用法：npm run init:model-registry
 *
 * 约定：
 *  - 不写入任何 API Key；只记录密钥所在环境变量名（默认 MODEL_API_KEY）；
 *  - 仅在记录不存在时创建；已存在时**不覆盖**管理员修改过的 enabled / 价格 / Base URL；
 *  - 初始化完成后，C07 合同（providerId/modelId）必须与该注册表中的部署一致，否则执行时返回 MODEL_NOT_ALLOWED。
 *
 * 环境变量（可选）：
 *  - C07_PROVIDER_NAME     默认 MagicAI
 *  - C07_MODEL_ID          默认 gpt-5.5
 *  - C07_UPSTREAM_MODEL    默认与 C07_MODEL_ID 相同
 *  - C07_PROVIDER_BASE_URL 模型供应商 Base URL，优先取 C07_PROVIDER_BASE_URL，其次取 MODEL_BASE_URL；
 *                          ⚠️ 严格禁止默认回落至 OpenAI 等外部公网端点，缺失时返回 C07_BASE_URL_REQUIRED 硬失败。
 *  - C07_API_KEY_ENV       默认 MODEL_API_KEY
 *
 * ⚠️ 运维说明：真实调用前请在服务器环境变量中配置 C07_API_KEY_ENV 指向的密钥；
 *   未配置时执行会返回 MODEL_NOT_CONFIGURED(503)，且不会降级为模拟执行。
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  loadCliEnv,
  resolveC07BaseUrl,
  sanitizeEndpointForDisplay,
  formatSecretConfiguredStatus,
} from "./cli-env";

export function showHelpMessage(): void {
  console.log(
    [
      "C07 模型注册表初始化工具 (init:model-registry)",
      "",
      "用法:",
      "  npm run init:model-registry",
      "  npx tsx scripts/init-c07-model-registry.ts [--help]",
      "",
      "配置项（环境变量）:",
      "  C07_PROVIDER_NAME     供应商名称 (默认: MagicAI)",
      "  C07_MODEL_ID          模型标识 (默认: gpt-5.5)",
      "  C07_UPSTREAM_MODEL    上游模型标识 (默认与 C07_MODEL_ID 相同)",
      "  C07_PROVIDER_BASE_URL 供应商 Base URL (必须显式提供，未配置时硬失败 C07_BASE_URL_REQUIRED)",
      "  MODEL_BASE_URL        通用模型 Base URL (次优回落)",
      "  C07_API_KEY_ENV       存储 API 密钥的环境变量名 (默认: MODEL_API_KEY)",
      "",
      "安全守则:",
      "  - 严格禁止默认回退至 OpenAI 等外部端点；",
      "  - 不向数据库写入明文 API Key；",
      "  - 记录已存在时保持幂等，不覆盖现有价格与配置。",
    ].join("\n")
  );
}

// 优先检查 --help / -h：必须在加载任何环境文件与数据库连接之前快速纯净退出
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelpMessage();
  process.exit(0);
}

// 仅在非 --help 时加载 CLI 环境变量（系统变量 > .env.local > .env）
loadCliEnv();

let defaultPrisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!defaultPrisma) {
    defaultPrisma = new PrismaClient();
  }
  return defaultPrisma;
}

export async function initModelRegistry(client?: PrismaClient) {
  const prismaClient = client || getPrisma();
  const providerName = (process.env.C07_PROVIDER_NAME || "MagicAI").trim();
  const modelId = (process.env.C07_MODEL_ID || "gpt-5.5").trim();
  const upstreamModel = (process.env.C07_UPSTREAM_MODEL || modelId).trim();
  const apiKeyEnv = (process.env.C07_API_KEY_ENV || "MODEL_API_KEY").trim();

  // 1) 检查供应商端点 Base URL（严格禁止默认回退至 OpenAI）
  const resolved = resolveC07BaseUrl();
  if (!resolved.success || !resolved.baseUrl) {
    throw new Error(resolved.error || "C07_BASE_URL_REQUIRED");
  }
  const baseUrl = resolved.baseUrl;

  const safeEndpoint = sanitizeEndpointForDisplay(baseUrl);
  const secretStatus = formatSecretConfiguredStatus(process.env[apiKeyEnv]);

  // 2) 供应商（不存在才创建，已存在则保持幂等不覆盖）
  let provider = await prismaClient.modelprovider.findUnique({ where: { name: providerName } });
  if (!provider) {
    provider = await prismaClient.modelprovider.create({
      data: {
        id: randomUUID(),
        name: providerName,
        protocol: "OPENAI_COMPATIBLE",
        baseUrl,
        apiKeyEnv,
        enabled: true,
        sortOrder: 0,
      },
    });
    console.log(
      `[init] 已创建供应商：${providerName}（端点=${safeEndpoint}, 密钥环境变量=${apiKeyEnv}, 密钥状态=${secretStatus}）`,
    );
  } else {
    const existingSafeEndpoint = sanitizeEndpointForDisplay(provider.baseUrl);
    console.log(
      `[init] 供应商已存在，保留现有配置：${providerName}（enabled=${provider.enabled}, 端点=${existingSafeEndpoint}, 密钥环境变量=${provider.apiKeyEnv}, 密钥状态=${secretStatus}）`,
    );
  }

  // 2) 模型部署（不存在才创建）
  const existing = await prismaClient.modeldeployment.findUnique({
    where: { providerId_modelId: { providerId: providerName, modelId } },
  });
  if (!existing) {
    const dep = await prismaClient.modeldeployment.create({
      data: {
        id: randomUUID(),
        providerId: providerName,
        modelId,
        upstreamModel,
        displayName: modelId,
        contextLimit: 32_000,
        // 价格不在此处配置：唯一真源为 modelpricing（走 /api/admin/model-pricing 或 set-model-pricing 脚本）
        enabled: true,
      },
    });
    console.log(`[init] 已创建模型部署：${providerName}/${modelId}（upstream=${upstreamModel}, id=${dep.id}）`);
  } else {
    console.log(
      `[init] 模型部署已存在，保留现有配置：${providerName}/${modelId}（enabled=${existing.enabled}；价格见 modelpricing，本脚本不修改）`,
    );
  }

  console.log(
    [
      "",
      "[init] 完成。后续运维说明：",
      `  1. 在服务器环境变量中配置密钥：${apiKeyEnv}=<真实密钥>（切勿写入数据库或提交到 Git）；`,
      `  2. C07 组件合同的 model.defaultProviderId/defaultModelId 必须为 ${providerName}/${modelId}；`,
      "  3. 如需调整价格、启用状态或 Base URL，请在「后台 → 模型注册表」修改（本脚本不会覆盖）；",
      "  4. 未注册/未启用/不在空间白名单时，C07 会返回 MODEL_NOT_ALLOWED，不会降级为模拟执行。",
    ].join("\n"),
  );
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("init-c07-model-registry.ts") ||
    process.argv[1].endsWith("init-c07-model-registry.js")) &&
  !process.argv[1].includes(".test.");

if (isDirectRun) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelpMessage();
    process.exit(0);
  }

  initModelRegistry()
    .catch((e) => {
      console.error("[init] 初始化失败:", (e as Error)?.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (defaultPrisma) {
        await defaultPrisma.$disconnect();
      }
    });
}

