/**
 * 组件合同审计纯函数单测：证明审计不会把缺失字段静默当成已配置。
 *
 * 正式口径（与 ComponentContract 类型 / 项目总纲一致）：
 *  - billingPolicy.mode 为合同计费口径；
 *  - 退款由 refund 服务（refund-status.ts）按 pointledger / refundrecovery 事实派生，
 *    不再要求合同内 failureRefundPolicy 字符串字段（该字段不在类型与总纲中）。
 * 脚本本身只读、不写库、不改合同；本测试仅验证其缺失字段上报逻辑。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditComponentContractEntry } from "../../../scripts/audit-component-contracts";

function baseComponent() {
  return {
    id: "C01",
    name: "招标文件解析",
    inputMode: "file" as string | null,
    accept: ".pdf" as string | null,
    isPublished: true,
    activeContractId: "cc1",
  };
}

function publishedContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "cc1",
    componentId: "C01",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    contract: {
      input: { kind: "FILE" },
      output: { kind: "DOCUMENT" },
      executionPlan: { steps: [{ requiredCapabilities: ["TEXT_GENERATION"] }] },
      qualityPolicy: { requireHumanReview: false },
      ...overrides,
    },
  };
}

describe("audit-component-contracts 缺失字段不静默当已配置（CORE-3 退款口径）", () => {
  it("1. 合同缺失 billingPolicy.mode 时，missing 必须包含 billingPolicy.mode（不得静默视为已配置）", () => {
    const a = auditComponentContractEntry({
      component: baseComponent(),
      activeContract: publishedContract() as never,
    });
    assert.ok(a.missing.includes("billingPolicy.mode"), "缺失计费口径必须被报告，不得静默当成已配置");
  });

  it("2. 合同含 billingPolicy.mode 时，missing 不得包含 billingPolicy.mode", () => {
    const a = auditComponentContractEntry({
      component: baseComponent(),
      activeContract: publishedContract({ billingPolicy: { mode: "ESTIMATED_COMPATIBILITY" } }) as never,
    });
    assert.strictEqual(a.missing.includes("billingPolicy.mode"), false);
    assert.equal(a.contract.billingPolicyMode, "ESTIMATED_COMPATIBILITY");
  });

  it("3. 不再要求合同内 failureRefundPolicy 字符串字段；含正式计费口径时 missing 不得包含 failureRefundPolicy", () => {
    const a = auditComponentContractEntry({
      component: baseComponent(),
      activeContract: publishedContract({ billingPolicy: { mode: "ESTIMATED_COMPATIBILITY" } }) as never,
    });
    assert.strictEqual(
      a.missing.includes("failureRefundPolicy"),
      false,
      "审计不再要求 failureRefundPolicy（退款由 refund 服务按账务事实派生）",
    );
  });

  it("4. 真实 C01 合同形态（billingPolicy.mode 存在、无 failureRefundPolicy）视为计费口径完整", () => {
    const a = auditComponentContractEntry({
      component: baseComponent(),
      activeContract: publishedContract({ billingPolicy: { mode: "ESTIMATED_COMPATIBILITY" } }) as never,
    });
    assert.strictEqual(a.missing.includes("billingPolicy.mode"), false);
    assert.strictEqual(a.missing.includes("failureRefundPolicy"), false);
  });
});
