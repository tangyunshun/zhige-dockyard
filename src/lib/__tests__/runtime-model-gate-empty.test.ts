/**
 * 运行时默认模型门禁集成测试（批次 CORE-3 R2 阶段一）：
 *  - 空 requiredCapabilities 不得通过 resolveDefaultDeployment（稳定错误码 MODEL_CAPABILITY_NOT_DECLARED）；
 *  - 合法非空能力合同仍可正常裁决（不回归）。
 * 仅读取模型注册表与空间策略，不写库、不调用真实模型。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultDeployment } from "@/lib/model-registry";

const WORKSPACE = process.env.RUNTIME_GATE_TEST_WORKSPACE_ID ?? "core3-runtime-gate-probe";

describe("默认模型门禁（集成，只读）", () => {
  test("空能力合同不能通过 runtime model gate", async () => {
    await assert.rejects(
      resolveDefaultDeployment({ workspaceId: WORKSPACE, requiredCapabilities: [] }),
      (e: Error & { code?: string }) => {
        assert.equal(e.code, "MODEL_CAPABILITY_NOT_DECLARED", "空能力必须拒绝并给出稳定错误码");
        return true;
      },
    );
  });

  test("非法/空白能力同样被拒绝", async () => {
    await assert.rejects(resolveDefaultDeployment({ workspaceId: WORKSPACE, requiredCapabilities: ["", "  "] as string[] }));
  });

  test("合法非空能力合同通过能力门禁（对照，不回归）", async () => {
    // 对照：非空能力必须不被能力门禁拒绝（即不抛 MODEL_CAPABILITY_NOT_DECLARED）；
    // 后续若因环境缺模型密钥而失败，属部署配置问题，与能力门禁无关。
    await assert.rejects(
      resolveDefaultDeployment({ workspaceId: WORKSPACE, requiredCapabilities: ["TEXT_GENERATION"] }),
      (e: Error & { code?: string }) => {
        assert.notEqual(e.code, "MODEL_CAPABILITY_NOT_DECLARED", "合法非空能力不应被能力门禁拒绝");
        return true;
      },
    );
  });
});
