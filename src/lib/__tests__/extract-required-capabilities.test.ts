/**
 * 通用合同能力提取 helper 纯函数测试（无 DB、无组件 ID 特判）
 *
 * 覆盖批次 CORE-3 阶段 A 要求：
 *  - 仅步骤能力；
 *  - 仅顶层能力；
 *  - 两者合并去重；
 *  - 非法能力被忽略；
 *  - 空能力返回 []（不得使门禁静默通过）；
 *  - helper 不读取 componentId。
 * 以及 isCapabilitySatisfied 空能力显式判不满足。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractRequiredCapabilities, isCapabilitySatisfied } from "@/lib/component-contract/capabilities";

describe("extractRequiredCapabilities", () => {
  test("仅步骤能力：从 executionPlan.steps[].requiredCapabilities 提取", () => {
    const c = {
      componentId: "C07",
      executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"] }] },
    };
    assert.deepStrictEqual(extractRequiredCapabilities(c), ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]);
  });

  test("仅顶层能力：兼容合法的顶层 requiredCapabilities 字段", () => {
    const c = { componentId: "C02", requiredCapabilities: ["TEXT_GENERATION"] };
    assert.deepStrictEqual(extractRequiredCapabilities(c), ["TEXT_GENERATION"]);
  });

  test("两者合并去重：步骤与顶层合并并去重，保留声明顺序", () => {
    const c = {
      componentId: "C01",
      requiredCapabilities: ["TEXT_GENERATION", "VISION"],
      executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"] }] },
    };
    assert.deepStrictEqual(extractRequiredCapabilities(c), ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION"]);
  });

  test("非法能力被忽略：仅保留白名单内能力", () => {
    const c = {
      componentId: "C07",
      requiredCapabilities: ["NOT_A_REAL_CAP"],
      executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION", "ANOTHER_FAKE"] }] },
    };
    assert.deepStrictEqual(extractRequiredCapabilities(c), ["TEXT_GENERATION"]);
  });

  test("空能力返回 []：合同未声明任何能力", () => {
    assert.deepStrictEqual(extractRequiredCapabilities({ componentId: "C07" }), []);
    assert.deepStrictEqual(extractRequiredCapabilities(null), []);
    assert.deepStrictEqual(extractRequiredCapabilities({}), []);
  });

  test("helper 不读取 componentId：相同能力不同 componentId 结果一致", () => {
    const base = { executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION"] }] } };
    const withC07 = { ...base, componentId: "C07" };
    const withC01 = { ...base, componentId: "C01" };
    assert.deepStrictEqual(extractRequiredCapabilities(withC07), extractRequiredCapabilities(withC01));
    assert.deepStrictEqual(extractRequiredCapabilities(withC07), ["TEXT_GENERATION"]);
  });
});

describe("isCapabilitySatisfied", () => {
  test("空能力集合显式判不满足（杜绝空能力静默通过门禁）", () => {
    assert.strictEqual(isCapabilitySatisfied(["TEXT_GENERATION", "STRUCTURED_OUTPUT"], []), false);
    assert.strictEqual(isCapabilitySatisfied([], []), false);
  });

  test("部署能力完整覆盖合同要求时满足", () => {
    assert.strictEqual(isCapabilitySatisfied(["TEXT_GENERATION", "STRUCTURED_OUTPUT"], ["TEXT_GENERATION"]), true);
    assert.strictEqual(
      isCapabilitySatisfied(["TEXT_GENERATION", "STRUCTURED_OUTPUT"], ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]),
      true,
    );
  });

  test("部署能力缺失合同要求时不满足", () => {
    assert.strictEqual(isCapabilitySatisfied(["TEXT_GENERATION"], ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]), false);
  });

  test("大小写不敏感", () => {
    assert.strictEqual(isCapabilitySatisfied(["text_generation"], ["TEXT_GENERATION"]), true);
  });
});
