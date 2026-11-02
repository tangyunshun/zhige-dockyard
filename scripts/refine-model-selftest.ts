/**
 * REFINE-MODEL 验收自测脚本（只读 + 受控计费往返）
 *
 * 用法：
 *   REFINE_TEST_USER_ID=<某用户id> npx tsx scripts/refine-model-selftest.ts
 *   # 真实扣点往返（consume + refund，跑完余额应对账归零）需显式开启：
 *   REFINE_TEST_USER_ID=<某用户id> ENABLE_REAL_BILLING_TEST=1 npx tsx scripts/refine-model-selftest.ts
 *
 * 说明：
 * - 模型解析链（①个人空间默认 / ②企业空间默认 / ③无模型→NO_MODEL_AVAILABLE）为只读校验，不调用上游模型；
 * - ④计费往返仅在 ENABLE_REAL_BILLING_TEST=1 时执行一次 consume 后立即 refund，余额应对账归零；
 * - ⑤BYO 由脚本在解析时标注（byok=true → 不估算/不扣平台点），真实 BYO 调用需用户自备密钥；
 * - ⑥限频（每人每分钟 3 次）为进程内滑动窗口，建议在 UI 连续点击验证，本脚本不覆盖。
 */
import { prisma } from "@/lib/prisma";
import { resolvePolishModelPlan } from "@/lib/model-registry";
import { estimatePoints, resolvePricingSource } from "@/lib/billing/pricing-center";
import { consumePoints, refundConsumedPoints, getBalanceSummary } from "@/lib/credit-service";

const userId = process.env.REFINE_TEST_USER_ID as string;
if (!userId) {
  console.error("✗ 请设置环境变量 REFINE_TEST_USER_ID（要验证的用户 ID）");
  process.exit(2);
}

async function usableBalance(workspaceId: string | null): Promise<number> {
  const s = await getBalanceSummary(userId, workspaceId);
  const wallet = (s as { wallet?: number }).wallet ?? 0;
  const workspace = (s as { workspace?: number }).workspace ?? 0;
  return wallet + workspace;
}

async function main() {
  console.log(`\n=== REFINE-MODEL 验收自测：用户 ${userId} ===\n`);

  // ── ① ② ③ 模型解析链 ──
  let resolved: { deploymentId: string; workspaceId: string; byok: boolean } | null = null;
  try {
    const { plan, workspaceId: billingWsId } = await resolvePolishModelPlan(userId, { targetDeploymentId: null });
    const ws = await prisma.workspace.findUnique({
      where: { id: billingWsId },
      select: { type: true, name: true },
    });
    const byok = resolvePricingSource(plan.deploymentId) === "USER_BYOK";
    resolved = { deploymentId: plan.deploymentId, workspaceId: billingWsId, byok };
    console.log(`[解析链] 命中：空间 ${billingWsId}（${ws?.type}${ws?.name ? ` / ${ws.name}` : ""}）`);
    console.log(`         模型 ${plan.deploymentId}  byok=${byok}`);
    if (byok) {
      console.log(`[⑤ BYO] byok=true → 不估算点数、不扣平台算力点，审计标注 byok=true（符合预期）`);
    } else {
      const est = await estimatePoints({
        modelDeploymentId: plan.deploymentId,
        inputTokens: 50,
        outputTokens: 800,
        pricingSource: resolvePricingSource(plan.deploymentId),
        estimateSource: "REFINE_PROMPT",
      });
      console.log(`[估算] 50 输入 + 800 输出 => ${est.points} 算力点（与组件执行同口径）`);
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.log(`[③ 无可用模型] 抛错误码：${code}`);
    console.log(`         文案：${(e as { message?: string }).message}`);
    if (code !== "NO_MODEL_AVAILABLE") {
      console.log(`⚠ 预期为 NO_MODEL_AVAILABLE，实际为 ${code}，请检查 resolvePolishModelPlan`);
    }
  }

  // ── ④ 计费往返（受控）──
  if (process.env.ENABLE_REAL_BILLING_TEST === "1") {
    if (!resolved || resolved.byok) {
      console.log(`\n[④ 计费往返] 跳过：${!resolved ? "无可用模型" : "BYO 不扣平台点"}`);
    } else {
      const est = await estimatePoints({
        modelDeploymentId: resolved.deploymentId,
        inputTokens: 50,
        outputTokens: 800,
        pricingSource: resolvePricingSource(resolved.deploymentId),
        estimateSource: "REFINE_PROMPT",
      });
      const points = est.points ?? 0;
      const before = await usableBalance(resolved.workspaceId);
      const taskId = `refine-selftest-${Date.now()}`;
      const cr = await consumePoints({
        workspaceId: resolved.workspaceId,
        userId,
        points,
        taskId,
        componentName: "AI 需求润色",
        idempotencyKey: `refine:${userId}:${Date.now()}`,
      });
      const afterConsume = await usableBalance(resolved.workspaceId);
      const delta = before - afterConsume;
      console.log(`\n[④ 计费往返] 扣前=${before} 扣后=${afterConsume} 差=${delta} 应扣=${points} => ${delta === points ? "OK" : "FAIL"}`);
      console.log(`         ledger 应有 CONSUME 流水（componentName=AI 需求润色，idempotencyKey 前缀 refine:${userId}:）`);
      await refundConsumedPoints({ consumeResult: cr, userId, workspaceId: resolved.workspaceId, taskId, componentName: "AI 需求润色" });
      const afterRefund = await usableBalance(resolved.workspaceId);
      console.log(`[④ 退款] 退后=${afterRefund} 应回=${before} => ${afterRefund === before ? "OK（对账归零）" : "FAIL"}`);
      console.log(`         ledger 应有 REFUND 流水，余额恢复`);
    }
  } else {
    console.log(`\n[④ 计费往返] 未开启 ENABLE_REAL_BILLING_TEST，跳过真实扣点（如需请显式设置）`);
  }

  console.log(`\n[⑥ 限频] 每人每分钟 3 次为进程内滑动窗口，请在 UI 连续点击「AI 润色」验证（本脚本不覆盖）\n`);
}

main()
  .catch((e) => {
    console.error("自测脚本异常:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
