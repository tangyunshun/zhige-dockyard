/**
 * 中转站钥匙迁移：把 .env.local 里的 MODEL_API_KEY（MagicAI 中转站钥匙）加密后写入
 * MagicAI 供应商记录的 apiKeyCipher（密文落库），保留 apiKeyEnv=MODEL_API_KEY 作为兜底，
 * 实现「页面存优先、文件兜底」，迁移期间不停机。
 *
 * 安全约束（与系统既有做法一致）：
 *  - 复用 crypto-secrets.encryptSecret（AES-256-GCM），不新写加密；
 *  - 全程不读取、不打印钥匙明文；仅打印 provider 名、密文长度、连通测试结果；
 *  - 迁移前/后各做一次真实上游连通测试（testDeploymentConnection），验证「不断粮」。
 *
 * 用法：
 *   npx tsx scripts/migrate-magicai-key.ts            # 仅预检 + 前后连通测试，不写库
 *   npx tsx scripts/migrate-magicai-key.ts --apply    # 真正写库
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto-secrets";
import { testDeploymentConnection } from "@/lib/model-registry";

const PROVIDER_NAME = "MagicAI";
const ENV_KEY = "MODEL_API_KEY";

/** 从 .env.local 解析变量（不返回给调用方明文以外的内容；本脚本只用值，绝不打印） */
function readEnvValue(key: string): string | null {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      if (k !== key) continue;
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v || null;
    }
  } catch {
    // .env.local 可能不存在，降级用 process.env
  }
  return process.env[key] ?? null;
}

async function connectivityTest(deploymentId: string | null): Promise<string> {
  if (!deploymentId) return "[SKIP] 无可用部署，无法连通测试";
  try {
    const r = await testDeploymentConnection(deploymentId);
    return r.ok
      ? `[OK] 连通成功 latency=${r.latencyMs}ms${r.sampleReply ? " reply=" + JSON.stringify(r.sampleReply.slice(0, 40)) : ""}`
      : `[FAIL] ${r.label ?? ""} ${r.message ?? ""} latency=${r.latencyMs}ms`;
  } catch (e) {
    return `[ERR] ${(e as Error)?.message ?? "未知错误"}`;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  const provider = await prisma.modelprovider.findFirst({ where: { name: PROVIDER_NAME } });
  if (!provider) {
    console.error(`未找到供应商 ${PROVIDER_NAME}`);
    process.exit(1);
  }
  const deployment = await prisma.modeldeployment.findFirst({ where: { providerId: PROVIDER_NAME } });
  const deploymentId = deployment?.id ?? null;

  console.log(`供应商 ${PROVIDER_NAME} (id=${provider.id}) env=${provider.apiKeyEnv} cipher?=${!!provider.apiKeyCipher} deployments=${deploymentId ?? "无"}`);
  console.log("--- 迁移前连通测试 ---");
  console.log(await connectivityTest(deploymentId));

  const plain = readEnvValue(ENV_KEY);
  if (!plain) {
    console.error(`未在 .env.local 找到 ${ENV_KEY}，无法迁移`);
    process.exit(1);
  }
  console.log(`读取到 ${ENV_KEY}（长度=${plain.length}，明文不打印）`);

  if (provider.apiKeyCipher) {
    console.log("[INFO] 该供应商已存在密文钥匙，迁移视为已完成；如需重置请先清空 apiKeyCipher。");
  } else if (!apply) {
    const cipher = encryptSecret(plain);
    console.log(`[DRY-RUN] 将写入密文（长度=${cipher.length}），不实际落库。加 --apply 执行。`);
  } else {
    const cipher = encryptSecret(plain);
    await prisma.modelprovider.updateMany({
      where: { name: PROVIDER_NAME },
      data: { apiKeyCipher: cipher },
    });
    console.log(`[APPLY] 已写入密文（长度=${cipher.length}），apiKeyEnv=${provider.apiKeyEnv} 保留为兜底。`);
  }

  if (apply) {
    console.log("--- 迁移后连通测试 ---");
    console.log(await connectivityTest(deploymentId));
  }
  console.log("完成。");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[迁移失败]", (e as Error)?.message ?? e);
    process.exit(1);
  });
