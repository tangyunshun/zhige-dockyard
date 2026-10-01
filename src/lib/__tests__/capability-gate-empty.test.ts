/**
 * 共享能力门禁测试（批次 CORE-3 R2 阶段一）：
 *  - 空能力合同不能通过 seed 激活门禁；
 *  - 空能力合同不能显示为 EXECUTABLE（目录 readiness）；
 *  - 步骤能力与顶层能力合并去重；
 *  - C01/C02/C07 与任意自定义 componentId 结果一致（无组件 ID 特判）。
 * 纯函数，无 DB 依赖。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractRequiredCapabilities, isCapabilitySatisfied } from "@/lib/component-contract/capabilities";
import { calculateMissingCapabilities } from "@/lib/model-registry";
import { deriveCatalogComponentReadiness } from "@/lib/component-readiness-view";
import { C01_CONTRACT, C02_CONTRACT } from "@/lib/component-contract/catalog-contracts-c01-c05";

function contractWithCaps(stepsCaps: string[], topCaps: string[] = []) {
  return {
    executionPlan: { steps: [{ requiredCapabilities: stepsCaps }] },
    ...(topCaps.length ? { requiredCapabilities: topCaps } : {}),
  };
}

describe("空能力门禁", () => {
  test("seed 激活门禁：空 requiredCapabilities 显式判不满足", () => {
    assert.equal(isCapabilitySatisfied(["TEXT_GENERATION"], []), false, "空要求必须判不满足");
    assert.equal(isCapabilitySatisfied([], []), false);
    assert.equal(isCapabilitySatisfied([], ["TEXT_GENERATION"]), false, "空要求不得被部署能力覆盖为通过");
  });

  test("seed 激活门禁：提取为空能力的合同整体不通过", () => {
    const emptyContract = { componentId: "C07", executionPlan: { steps: [{ requiredCapabilities: [] as string[] }] } };
    const req = extractRequiredCapabilities(emptyContract);
    assert.deepEqual(req, []);
    assert.equal(isCapabilitySatisfied(["TEXT_GENERATION", "STRUCTURED_OUTPUT"], req), false);
  });

  test("目录 readiness：空能力合同不得判定为 EXECUTABLE", () => {
    const missing = calculateMissingCapabilities([], ["TEXT_GENERATION"], true);
    assert.deepEqual(missing, ["CONTRACT_CAPABILITY_NOT_DECLARED"]);
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C01_CONTRACT,
      missingCapabilities: missing,
    });
    assert.notEqual(res.readinessStatus, "EXECUTABLE");
    assert.equal(res.readinessStatus, "NOT_EXECUTABLE");
    assert.equal(res.contractReady, false);
    assert.ok(
      res.blockingReasons.some((r) => r.includes("未声明任何模型能力")),
      "必须生成明确阻断原因",
    );
  });

  test("目录 readiness：能力齐备的合同仍可 EXECUTABLE（对照，不回归）", () => {
    const missing = calculateMissingCapabilities(["TEXT_GENERATION"], ["TEXT_GENERATION", "STRUCTURED_OUTPUT"], true);
    assert.deepEqual(missing, []);
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract: C01_CONTRACT,
      missingCapabilities: missing,
    });
    assert.equal(res.readinessStatus, "EXECUTABLE");
    assert.equal(res.contractReady, true);
  });
});

describe("能力提取合并去重", () => {
  test("步骤能力与顶层能力合并并去重，保留声明顺序", () => {
    const c = contractWithCaps(["TEXT_GENERATION", "STRUCTURED_OUTPUT"], ["TEXT_GENERATION", "VISION"]);
    assert.deepEqual(extractRequiredCapabilities(c), ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION"]);
  });
});

describe("无组件 ID 特判", () => {
  test("相同能力结构在不同 componentId 下提取与门禁结果一致", () => {
    const base = () => ({
      executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"] }] },
    });
    const ids = ["C01", "C02", "C07", "ZZ9", "X100"];
    const extracted = ids.map((id) => extractRequiredCapabilities({ ...base(), componentId: id }));
    for (const r of extracted) assert.deepEqual(r, ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]);
    const gate = ids.map((id) =>
      isCapabilitySatisfied(["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION"], extractRequiredCapabilities({ ...base(), componentId: id })),
    );
    for (const g of gate) assert.equal(g, true);
  });
});
