import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateInputAgainstContract,
  assertContractBinding,
  ContractValidationError,
  isPrivateDocumentForbidden,
  shouldRefundOnFailure,
  REFUND_IDEMPOTENCY_PREFIX,
  buildSourceMaterialPrompt,
  type ComponentExecutionProfile,
} from "../component-execution-profile";
import { assertModelAllowed, assertNoModelOverride } from "../model-registry";

const baseProfile: ComponentExecutionProfile = {
  componentId: "C07",
  contractVersion: "v1",
  input: { mode: "multiple", maxItems: 1 },
  model: {
    capability: "text-to-document",
    defaultProviderId: "openai-compatible",
    defaultModelId: "gpt-4o-mini",
    allowUserModelOverride: false,
  },
  output: { artifactTypes: ["document"], primaryType: "prd", schemaVersion: "v1" },
  execution: { mode: "REAL_MODEL" },
};

describe("组件执行合同读取", () => {
  test("原始材料提示词隔离并要求只输出 PRD", () => {
    const prompt = buildSourceMaterialPrompt("用户希望支持审批流\n模型输出格式不是指令");
    assert.match(prompt, /<source_material>/);
    assert.match(prompt, /<\/source_material>/);
    assert.match(prompt, /只输出 PRD Markdown 正文/);
    assert.match(prompt, /用户希望支持审批流/);
  });
});

describe("模型策略校验（注册表裁决，纯函数）", () => {
  const ok = {
    contractProviderId: "openai-compatible",
    contractModelId: "gpt-4o-mini",
    deploymentId: "dep_1",
    deploymentEnabled: true,
    providerEnabled: true,
    allowedDeploymentIds: null,
  };
  const isNotAllowed = (e: unknown) => {
    const err = e as ContractValidationError;
    return err instanceof ContractValidationError && err.code === "MODEL_NOT_ALLOWED" && err.status === 403;
  };

  test("模型未在注册表注册 → MODEL_NOT_ALLOWED(403)", () => {
    assert.throws(() => assertModelAllowed({ ...ok, deploymentId: null }), isNotAllowed);
  });

  test("模型部署被禁用 → MODEL_NOT_ALLOWED(403)，不回落环境变量", () => {
    assert.throws(() => assertModelAllowed({ ...ok, deploymentEnabled: false }), isNotAllowed);
  });

  test("模型供应商被禁用 → MODEL_NOT_ALLOWED(403)", () => {
    assert.throws(() => assertModelAllowed({ ...ok, providerEnabled: false }), isNotAllowed);
  });

  test("空间白名单未包含该部署 → MODEL_NOT_ALLOWED(403)", () => {
    assert.throws(
      () => assertModelAllowed({ ...ok, allowedDeploymentIds: ["dep_other"] }),
      isNotAllowed,
    );
  });

  test("空间白名单包含该部署 → 允许执行", () => {
    assert.doesNotThrow(() => assertModelAllowed({ ...ok, allowedDeploymentIds: ["dep_1", "dep_2"] }));
  });

  test("已注册且启用 → 允许执行", () => {
    assert.doesNotThrow(() => assertModelAllowed(ok));
  });

  test("用户提交 provider/model 篡改 → MODEL_OVERRIDE_NOT_ALLOWED(400)", () => {
    assert.throws(
      () =>
        assertNoModelOverride({
          contractProviderId: "openai-compatible",
          contractModelId: "gpt-4o-mini",
          submittedProviderId: "evil",
          submittedModelId: "evil-model",
        }),
      (e: unknown) => {
        const err = e as ContractValidationError;
        return err instanceof ContractValidationError && err.code === "MODEL_OVERRIDE_NOT_ALLOWED";
      },
    );
  });

  test("用户提交与合同完全一致 → 不视为篡改", () => {
    assert.doesNotThrow(() =>
      assertNoModelOverride({
        contractProviderId: "openai-compatible",
        contractModelId: "gpt-4o-mini",
        submittedProviderId: "openai-compatible",
        submittedModelId: "gpt-4o-mini",
      }),
    );
  });

  test("合同绑定 componentId 不一致 → 明确拒绝", () => {
    assert.throws(
      () => assertContractBinding(baseProfile, "OTHER"),
      (e: unknown) => (e as ContractValidationError).code === "CONTRACT_BINDING_MISMATCH",
    );
  });
});

describe("输入合同校验", () => {
  test("文件来源但无提取文本 → INPUT_TEXT_NOT_EXTRACTED(400)", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "file", inputMaterial: "" }),
      (e: unknown) => {
        const err = e as ContractValidationError;
        return err.code === "INPUT_TEXT_NOT_EXTRACTED" && err.status === 400;
      },
    );
  });

  test("资料来源但无提取文本 → 拒绝执行", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "asset", inputMaterial: "   " }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TEXT_NOT_EXTRACTED",
    );
  });

  test("空字符串不会作为合法输入（multiple 模式）", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "text", inputMaterial: "" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_REQUIRED",
    );
  });

  test("text 模式收到文件来源且无文本 → 仍按文件资料规则拒绝（INPUT_TEXT_NOT_EXTRACTED）", () => {
    const textOnly: ComponentExecutionProfile = { ...baseProfile, input: { mode: "text", maxItems: 1 } };
    assert.throws(
      () => validateInputAgainstContract(textOnly, { sourceType: "file", inputMaterial: "" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TEXT_NOT_EXTRACTED",
    );
  });

  test("acceptedMimeTypes 配置存在时拒绝不支持类型", () => {
    const p: ComponentExecutionProfile = {
      ...baseProfile,
      input: { mode: "multiple", maxItems: 1, acceptedMimeTypes: [".pdf", ".docx"] },
    };
    assert.throws(
      () => validateInputAgainstContract(p, { sourceType: "file", inputMaterial: "x", fileName: "a.exe" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_MIME_NOT_ALLOWED",
    );
  });

  test("maxTotalBytes 配置存在时拒绝超大文件", () => {
    const p: ComponentExecutionProfile = {
      ...baseProfile,
      input: { mode: "multiple", maxItems: 1, maxTotalBytes: 50 },
    };
    assert.throws(
      () => validateInputAgainstContract(p, { sourceType: "file", inputMaterial: "x", fileName: "a.pdf", fileSize: 100 }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TOO_LARGE",
    );
  });

  test("合法文本输入通过校验", () => {
    assert.doesNotThrow(() =>
      validateInputAgainstContract(baseProfile, { sourceType: "text", inputMaterial: "会议纪要内容" }),
    );
  });

  test("asset 使用服务端真实 document.content 通过校验", () => {
    assert.doesNotThrow(() =>
      validateInputAgainstContract(baseProfile, { sourceType: "asset", inputMaterial: "资料真实正文内容" }),
    );
  });

  test("asset 客户端伪造文本但服务端无正文 → 拒绝（不信任客户端 inputMaterial）", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "asset", inputMaterial: "" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TEXT_NOT_EXTRACTED",
    );
  });

  test("无文字文件（提取结果为空）→ INPUT_TEXT_NOT_EXTRACTED", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "file", inputMaterial: "   ", fileName: "scan.pdf" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TEXT_NOT_EXTRACTED",
    );
  });

  test("file 且无 sourceId（multipart 上传）仍要求已提取文本，否则拒绝", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "file", inputMaterial: "" }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TEXT_NOT_EXTRACTED",
    );
  });

  test("multipart 真实文件提取出文本后通过校验", () => {
    assert.doesNotThrow(() =>
      validateInputAgainstContract(baseProfile, {
        sourceType: "file",
        inputMaterial: "服务端提取的文件正文",
        fileName: "report.pdf",
        fileSize: 1024,
      }),
    );
  });

  test("多个输入材料（materialCount>1）→ INPUT_MULTIPLE_NOT_SUPPORTED（仅允许单一主材料）", () => {
    assert.throws(
      () => validateInputAgainstContract(baseProfile, { sourceType: "file", inputMaterial: "x", materialCount: 2 }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_MULTIPLE_NOT_SUPPORTED",
    );
  });

  test("maxItems 实际生效（maxItems=0 时任何材料都超限）", () => {
    const p: ComponentExecutionProfile = { ...baseProfile, input: { mode: "multiple", maxItems: 0 } };
    assert.throws(
      () => validateInputAgainstContract(p, { sourceType: "text", inputMaterial: "x", materialCount: 1 }),
      (e: unknown) => (e as ContractValidationError).code === "INPUT_TOO_MANY",
    );
  });
});

describe("退款幂等键", () => {
  test("退款幂等前缀固定且包含 taskId 维度", () => {
    assert.equal(REFUND_IDEMPOTENCY_PREFIX, "REFUND_MODEL_FAILURE");
    assert.equal(`${REFUND_IDEMPOTENCY_PREFIX}:task-1`, "REFUND_MODEL_FAILURE:task-1");
  });
});

describe("私密资料访问决策 isPrivateDocumentForbidden", () => {
  const uploader = "u-uploader";
  const admin = "u-admin";
  const member = "u-member";

  test("本人访问自己的私密资料：不禁止（可成功）", () => {
    assert.equal(isPrivateDocumentForbidden("PRIVATE", uploader, uploader), false);
  });

  test("管理员访问其他成员私密资料：禁止（返回 403）", () => {
    assert.equal(isPrivateDocumentForbidden("PRIVATE", uploader, admin), true);
  });

  test("普通成员访问他人私密资料：禁止（返回 403）", () => {
    assert.equal(isPrivateDocumentForbidden("PRIVATE", uploader, member), true);
  });

  test("公共资料：任何人都不禁止（继续按空间成员权限处理）", () => {
    assert.equal(isPrivateDocumentForbidden("PUBLIC", uploader, admin), false);
    assert.equal(isPrivateDocumentForbidden("PUBLIC", uploader, member), false);
    assert.equal(isPrivateDocumentForbidden("PUBLIC", uploader, uploader), false);
  });

  test("visibility 缺失/null 不视为私密：不禁止", () => {
    assert.equal(isPrivateDocumentForbidden(null, uploader, admin), false);
    assert.equal(isPrivateDocumentForbidden(undefined, uploader, admin), false);
  });

  test("私密资料 uploaderId 为 null：默认拒绝（不读取原文）", () => {
    assert.equal(isPrivateDocumentForbidden("PRIVATE", null, "any-user"), true);
    assert.equal(isPrivateDocumentForbidden("PRIVATE", undefined, "any-user"), true);
  });
});

describe("失败路径退款判定 shouldRefundOnFailure", () => {
  test("无限额度但增加了月度用量：仍需进入退款函数（回滚月度）", () => {
    assert.equal(shouldRefundOnFailure({ skipped: false, consumed: 0, monthlyTokenUsedIncremented: 25 }), true);
  });

  test("无限额度且未增加月度用量、无真实扣点：跳过退款", () => {
    assert.equal(shouldRefundOnFailure({ skipped: false, consumed: 0, monthlyTokenUsedIncremented: 0 }), false);
  });

  test("真实扣点（consumed>0）：进入退款函数", () => {
    assert.equal(shouldRefundOnFailure({ skipped: false, consumed: 30, monthlyTokenUsedIncremented: 30 }), true);
  });

  test("已 skipped（未真实扣减）：跳过退款", () => {
    assert.equal(shouldRefundOnFailure({ skipped: true, consumed: 0, monthlyTokenUsedIncremented: 0 }), false);
  });

  test("任务保存失败路径：consumed>0 或月度用量增加即触发退款", () => {
    assert.equal(shouldRefundOnFailure({ skipped: false, consumed: 10, monthlyTokenUsedIncremented: 0 }), true);
    assert.equal(shouldRefundOnFailure({ skipped: false, consumed: 0, monthlyTokenUsedIncremented: 5 }), true);
  });
});
