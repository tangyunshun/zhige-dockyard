/**
 * 按合同声明自动校准组件预估 Token（幂等，只校准未被动过的组件）。
 *
 * 背景：预估 Token 曾长期停留在无意义默认值 4000/2000，导致
 *  - 成本底线失真（按 4000/2000 算，与组件真实负载脱节）；
 *  - 3 倍熔断预算过紧，大文档组件会被误熔断；
 *  - 后台面板展示的预估量与组件真实处理能力不符。
 *
 * 校准口径（全部来自组件合同自身声明，无需管理员猜测）：
 *  - 预估输出 Token = 合同 executionPlan.steps 声明的 maxOutputTokens 之和（缺省 2000）；
 *  - 预估输入 Token = 合同 input.textConstraints.maxLength（字符≈Token，中文 1 字符≈1 Token）；
 *    合同未声明时用宽松默认 60000（覆盖大文档场景，宁可高估不可误伤）。
 *
 * 安全护栏：仅当组件当前仍为默认值 4000/2000（即管理员未手动调过）时才写入，
 * 绝不覆盖管理员的显式配置。重跑安全。
 *
 * 用法：
 *   npx tsx scripts/calibrate-component-tokens.ts          # 正式写入
 *   DRY_RUN=1 npx tsx scripts/calibrate-component-tokens.ts # 只预览不写入
 */
import { prisma } from "../src/lib/prisma";
import { computeCostFloorPoints } from "../src/lib/component-cost-floor";

const DEFAULT_IN = 4000;
const DEFAULT_OUT = 2000;
const UNDECLARED_IN = 60000; // 合同未声明输入容量时的宽松默认

(async () => {
  const dryRun = process.env.DRY_RUN === "1";
  const comps = await prisma.componentcatalog.findMany({
    select: {
      id: true,
      name: true,
      costModelDeploymentId: true,
      estimatedInputTokens: true,
      estimatedOutputTokens: true,
      activeContract: { select: { contract: true } },
    },
    orderBy: { id: "asc" },
  });

  let calibrated = 0;
  let skipped = 0;
  const changes: string[] = [];

  for (const c of comps) {
    const untouched =
      (c.estimatedInputTokens ?? DEFAULT_IN) === DEFAULT_IN &&
      (c.estimatedOutputTokens ?? DEFAULT_OUT) === DEFAULT_OUT;
    if (!untouched) {
      skipped += 1;
      continue;
    }
    const ct: any = c.activeContract?.contract || {};
    const maxLen = typeof ct?.input?.textConstraints?.maxLength === "number" ? ct.input.textConstraints.maxLength : 0;
    const declaredOut = Array.isArray(ct?.executionPlan?.steps)
      ? ct.executionPlan.steps.reduce(
          (a: number, s: any) => a + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0),
          0,
        )
      : 0;
    const inEst = maxLen > 0 ? maxLen : UNDECLARED_IN;
    const outEst = declaredOut > 0 ? declaredOut : DEFAULT_OUT;

    const floor = await computeCostFloorPoints(c.costModelDeploymentId, inEst, outEst);
    if (!dryRun) {
      await prisma.componentcatalog.update({
        where: { id: c.id },
        data: {
          estimatedInputTokens: inEst,
          estimatedOutputTokens: outEst,
          ...(floor != null ? { costFloorPoints: floor } : {}),
        },
      });
    }
    calibrated += 1;
    changes.push(
      `${c.id} ${c.name}：输入 ${DEFAULT_IN}→${inEst}${maxLen > 0 ? "（合同声明）" : "（默认宽松值）"}，输出 ${DEFAULT_OUT}→${outEst}（合同声明）${floor != null ? `，底线重算 ${floor} 点` : ""}`,
    );
  }

  console.log(`===== 预估 Token 校准${dryRun ? "（空跑预览，未写入）" : ""} =====`);
  changes.forEach((l) => console.log("  " + l));
  console.log(`校准 ${calibrated} 个，跳过（管理员已调过）${skipped} 个`);

  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("校准失败:", String(e).slice(0, 800));
  await prisma.$disconnect();
  process.exit(1);
});
