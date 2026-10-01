/**
 * C07 真实模型调用验收（**模型层**：数据库注册表 → 策略 → 适配器 → 真实外部 HTTP）
 *
 * 用法：
 *   npx tsx scripts/acceptance-c07-model.ts            # 真实文本调用 + 401 鉴权错误映射
 *   $env:MODEL_TIMEOUT_MS='1'; npx tsx scripts/acceptance-c07-model.ts --timeout   # 超时映射
 *
 * 安全：只输出主机名、状态与统计信息；**绝不打印 API Key 或完整请求/响应正文**。
 * 注意：本脚本不覆盖 HTTP 路由层（multipart、余额扣点/退款、幂等），那些需要登录态。
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
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
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const { resolveModelExecutionPlan } = await import("../src/lib/model-registry");
  const { createModelAdapter, ModelAdapterError } = await import("../src/lib/model-adapter");
  const { buildRegistryPricingSnapshot } = await import("../src/lib/model-pricing");

  // 读取 C07 数据库合同，保证契约与实际执行一致
  const comp = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { detail: true } });
  const contract = (comp?.detail as any)?.executionProfile;
  const contractProviderId: string = contract?.model?.defaultProviderId ?? "MagicAI";
  const contractModelId: string = contract?.model?.defaultModelId ?? "gpt-5.5";
  console.log(`[accept] C07 合同模型：${contractProviderId}/${contractModelId}（模式=${contract?.execution?.mode ?? "缺失"}）`);

  // 1. 数据库注册表解析
  const plan = await resolveModelExecutionPlan({
    contractProviderId,
    contractModelId,
    workspaceId: "acceptance_ws",
  });
  const host = (() => {
    try {
      return new URL(plan.baseUrl).host;
    } catch {
      return "(invalid)";
    }
  })();
  console.log(`[accept] 解析来源=${plan.source} 部署=${plan.deploymentId || "(env兜底)"} 端点=${host} 上游模型=${plan.upstreamModelId}`);
  console.log(
    `[accept] 注册表价格（唯一真源 modelpricing）：成本输入 ${plan.pricing?.costInputMicrosPerMillion ?? "未配置"} 微元/百万、输出 ${plan.pricing?.costOutputMicrosPerMillion ?? "未配置"} 微元/百万；成本状态=${plan.pricing ? "已配置" : "未配置"}，售价状态=${plan.pricing?.priceInputMicrosPerMillion === null || plan.pricing?.priceInputMicrosPerMillion === undefined ? "未配置" : "已配置"}`,
  );

  const snapshot = buildRegistryPricingSnapshot({
    providerId: plan.providerId,
    modelId: plan.modelId,
    pricing: plan.pricing,
  });
  console.log(
    `[accept] 价格快照：source=${snapshot.pricingSource} 成本状态=${snapshot.supplierCostStatus} 售价状态=${snapshot.userPriceStatus} 可结算=${snapshot.settlementEnabled} 结算模式=${snapshot.billingMode}`,
  );

  if (process.argv.includes("--timeout")) {
    const adapter = await createModelAdapter(plan);
    try {
      await adapter.execute({
        providerId: plan.providerId,
        modelId: plan.upstreamModelId,
        userPrompt: "超时映射测试",
      });
      console.log("[accept] 超时用例：未超时（环境较快），未复现 —— 映射逻辑见单元测试");
    } catch (e) {
      const err = e as InstanceType<typeof ModelAdapterError>;
      console.log(`[accept] 超时用例映射：${err?.code ?? (e as Error)?.name}`);
    }
    return;
  }

  // 2. 真实文本调用
  const adapter = await createModelAdapter(plan);
  const started = Date.now();
  const result = await adapter.execute({
    providerId: plan.providerId,
    modelId: plan.upstreamModelId,
    userPrompt: "请用一句话（不超过 40 字）说明什么是产品需求文档（PRD）。",
    maxOutputTokens: 96,
  });
  console.log(
    `[accept] 文本调用成功：latency=${result.latencyMs ?? Date.now() - started}ms provider=${result.providerId} model=${result.modelId} usage=${JSON.stringify(result.usage)} textLen=${result.text.length}`,
  );
  console.log(`[accept] 模型原文片段：${result.text.slice(0, 60).replace(/\s+/g, " ")}…`);

  // 3. 401 鉴权错误映射（使用无效密钥，不消耗额度）
  const badAdapter = await createModelAdapter({ ...plan, apiKey: "sk-invalid-key-for-401-check" });
  try {
    await badAdapter.execute({ providerId: plan.providerId, modelId: plan.upstreamModelId, userPrompt: "401 映射测试" });
    console.log("[accept] 401 用例：未按预期失败");
  } catch (e) {
    const err = e as InstanceType<typeof ModelAdapterError>;
    console.log(`[accept] 401 用例映射：${err?.code ?? (e as Error)?.name}（status=${err?.status ?? "-"}）`);
  }
}

main()
  .catch((e) => {
    console.error("[accept] 失败:", (e as Error)?.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
