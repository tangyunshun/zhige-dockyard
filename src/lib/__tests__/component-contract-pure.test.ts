/**
 * 通用组件合同纯领域基础层全面回归测试套件 (严格类型，0 any)
 *
 * 覆盖核心验收场景：
 * 1. 文本输入有效/无效；
 * 2. 单文件 MIME 和大小校验；
 * 3. 多文件数量与总大小校验；
 * 4. 文本加文件组合校验；
 * 5. 结构化表单必填字段校验；
 * 6. 上游 artifact 类型校验；
 * 7. 多步骤执行计划依赖顺序（显式 ComponentExecutionPlan / Record<string, string>）；
 * 8. 未知 pipeline step 拒绝；
 * 9. 未知 renderer 拒绝；
 * 10. 未知模型 capability 拒绝；
 * 11. DRAFT 不可执行；
 * 12. ARCHIVED 不可执行；
 * 13. PUBLISHED 可生成快照；
 * 14. 快照深拷贝，不受原合同修改影响；
 * 15. 输出结构错误不能标记成功；
 * 16. 合同缺失不得生成默认合同；
 * 17. 合同中出现密钥字段或可执行代码字段时拒绝；
 * 18. 合同结构中不得携带 providerId/modelId 等模型绑定字段；业务 Prompt 提及厂商不误报；
 * 19. 计费规则不得包含成本价兜底；
 * 20. 大小、数量、Token 预算必须为安全整数；
 * 21. 合同交叉验证：数值上下界校验 (min <= max)；
 * 22. 合同交叉验证：MIME 格式与唯一性去重校验；
 * 23. 合同交叉验证：表单字段名唯一与 select options 非空唯一；
 * 24. 合同交叉验证：PUBLISHED 必须有发布人与时间，DRAFT 不得伪装；
 * 25. 执行计划交叉验证：stepId 与 outputKey 全局唯一；
 * 26. 输出格式交叉验证：artifactMime 与 schemaVersion 格式校验；
 * 27. 引用约束交叉验证：requireCitations 结构声明与输出内容真实校验；
 * 28. Schema 交叉验证：不支持的 schema 关键字拒绝 (SCHEMA_KEYWORD_UNSUPPORTED) 与真实输出数据校验。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  ComponentContract,
  ComponentContractError,
  ComponentExecutionPlan,
  validateComponentContract,
  validateComponentInput,
  validateExecutionPlan,
  validateComponentOutput,
  buildComponentContractSnapshot,
} from "../component-contract";

/** 构造一个标准合法的 PUBLISHED 合同基础样本 */
function createBaseValidContract(overrides?: Partial<ComponentContract>): ComponentContract {
  return {
    componentId: "C99",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    publishedAt: "2026-09-20T10:00:00.000Z",
    publishedBy: "admin_user_01",
    input: {
      kind: "TEXT",
      textConstraints: {
        required: true,
        minLength: 5,
        maxLength: 2000,
      },
    },
    materialPipeline: {
      steps: [
        { name: "文本清洗", type: "TEXT_NORMALIZE" },
      ],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step_1",
          name: "核心语义提取",
          promptTemplateVersion: "v1.0",
          promptTemplate: "请总结以下文本：{{text}}",
          inputMapping: { text: "inputs.text" },
          outputKey: "summary",
          contextBudgetTokens: 4000,
          maxOutputTokens: 1000,
          timeoutMs: 30000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "v1.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
    },
    qualityPolicy: {
      requiredSections: ["结论"],
      minOutputLength: 20,
      allowAutoRetry: true,
      maxRetryCount: 2,
      requireHumanReview: false,
    },
    billingPolicy: {
      mode: "REAL_SETTLEMENT_ELIGIBLE",
      minServiceFeePoints: 10,
      estimatedTokens: 2000,
    },
    ...overrides,
  };
}

test("通用组件合同纯领域层回归测试套件", async (t) => {
  // 1. 文本输入有效/无效
  await t.test("1. 文本输入有效/无效校验", () => {
    const contract = createBaseValidContract();

    // 有效输入
    const validRes = validateComponentInput(contract, { text: "这是一段合法的有效测试文本内容。" });
    assert.equal(validRes.text, "这是一段合法的有效测试文本内容。");

    // 缺少必填文本
    assert.throws(
      () => validateComponentInput(contract, { text: "" }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 文本过短 (minLength = 5)
    assert.throws(
      () => validateComponentInput(contract, { text: "短" }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );
  });

  // 2. 单文件 MIME 和大小校验
  await t.test("2. 单文件 MIME 和大小校验", () => {
    const contract = createBaseValidContract({
      input: {
        kind: "FILE",
        fileConstraints: {
          required: true,
          maxCount: 1,
          acceptedMimes: ["application/pdf"],
          maxSingleFileBytes: 1024 * 1024 * 10, // 10MB
          maxTotalBytes: 1024 * 1024 * 10,
        },
      },
    });

    // 正常单个 PDF 文件
    const valid = validateComponentInput(contract, {
      files: [{ name: "test.pdf", mimeType: "application/pdf", sizeBytes: 1024 * 500 }],
    });
    assert.equal(valid.files?.length, 1);

    // MIME 类型不合法
    assert.throws(
      () =>
        validateComponentInput(contract, {
          files: [{ name: "test.exe", mimeType: "application/x-msdownload", sizeBytes: 1024 }],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 文件大小超限
    assert.throws(
      () =>
        validateComponentInput(contract, {
          files: [{ name: "huge.pdf", mimeType: "application/pdf", sizeBytes: 1024 * 1024 * 20 }],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );
  });

  // 3. 多文件数量与总大小校验
  await t.test("3. 多文件数量与总大小校验", () => {
    const contract = createBaseValidContract({
      input: {
        kind: "MULTI_FILE",
        fileConstraints: {
          required: true,
          minCount: 2,
          maxCount: 3,
          acceptedMimes: ["application/pdf", "text/plain"],
          maxSingleFileBytes: 1024 * 1024 * 5, // 5MB
          maxTotalBytes: 1024 * 1024 * 8, // 总共 8MB
        },
      },
    });

    // 文件数量少于 minCount
    assert.throws(
      () =>
        validateComponentInput(contract, {
          files: [{ name: "1.txt", mimeType: "text/plain", sizeBytes: 100 }],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 文件数量超过 maxCount
    assert.throws(
      () =>
        validateComponentInput(contract, {
          files: [
            { name: "1.txt", mimeType: "text/plain", sizeBytes: 100 },
            { name: "2.txt", mimeType: "text/plain", sizeBytes: 100 },
            { name: "3.txt", mimeType: "text/plain", sizeBytes: 100 },
            { name: "4.txt", mimeType: "text/plain", sizeBytes: 100 },
          ],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 单个文件合法，但总大小超过 maxTotalBytes (8MB)
    assert.throws(
      () =>
        validateComponentInput(contract, {
          files: [
            { name: "1.pdf", mimeType: "application/pdf", sizeBytes: 1024 * 1024 * 4.5 },
            { name: "2.pdf", mimeType: "application/pdf", sizeBytes: 1024 * 1024 * 4.5 },
          ],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );
  });

  // 4. 文本加文件组合校验
  await t.test("4. 文本加文件组合校验", () => {
    const contract = createBaseValidContract({
      input: {
        kind: "TEXT_AND_FILES",
        textConstraints: { required: true, minLength: 10 },
        fileConstraints: {
          required: true,
          maxCount: 2,
          acceptedMimes: ["text/markdown"],
          maxSingleFileBytes: 1024 * 1024,
          maxTotalBytes: 1024 * 1024 * 2,
        },
      },
    });

    // 缺少文件
    assert.throws(
      () => validateComponentInput(contract, { text: "这是一段足够长的说明文本内容。" }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 缺少文本
    assert.throws(
      () =>
        validateComponentInput(contract, {
          text: "",
          files: [{ name: "doc.md", mimeType: "text/markdown", sizeBytes: 500 }],
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 两者均合法
    const valid = validateComponentInput(contract, {
      text: "这是一段足够长的说明文本内容。",
      files: [{ name: "doc.md", mimeType: "text/markdown", sizeBytes: 500 }],
    });
    assert.ok(valid.text);
    assert.equal(valid.files?.length, 1);
  });

  // 5. 结构化表单必填字段校验
  await t.test("5. 结构化表单必填字段校验", () => {
    const contract = createBaseValidContract({
      input: {
        kind: "STRUCTURED_FORM",
        formConstraints: {
          fields: [
            { name: "projectName", label: "项目名称", type: "string", required: true },
            { name: "budget", label: "预算金额", type: "number", required: true },
            { name: "remark", label: "备注", type: "string", required: false },
          ],
        },
      },
    });

    // 缺少必填字段 budget
    assert.throws(
      () =>
        validateComponentInput(contract, {
          formData: { projectName: "舟坊系统" },
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 必填字段齐全
    const valid = validateComponentInput(contract, {
      formData: { projectName: "舟坊系统", budget: 50000 },
    });
    assert.equal(valid.formData?.projectName, "舟坊系统");
  });

  // 6. 上游 artifact 类型校验
  await t.test("6. 上游 artifact 类型校验", () => {
    const contract = createBaseValidContract({
      input: {
        kind: "UPSTREAM_ARTIFACT",
        artifactConstraints: {
          acceptedArtifactTypes: ["TABLE", "DOCUMENT"],
          requiredSchemaVersions: ["v1", "v2"],
        },
      },
    });

    // 传入不被接受的 artifact 类型 (SCORE)
    assert.throws(
      () =>
        validateComponentInput(contract, {
          upstreamArtifact: {
            artifactId: "art_1",
            artifactType: "SCORE",
            schemaVersion: "v1",
            data: {},
          },
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 传入版本不兼容
    assert.throws(
      () =>
        validateComponentInput(contract, {
          upstreamArtifact: {
            artifactId: "art_1",
            artifactType: "TABLE",
            schemaVersion: "v99_incompatible",
            data: {},
          },
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "INPUT_VALIDATION_FAILED"
    );

    // 匹配通过
    const valid = validateComponentInput(contract, {
      upstreamArtifact: {
        artifactId: "art_1",
        artifactType: "TABLE",
        schemaVersion: "v1",
        data: { rows: [] },
      },
    });
    assert.ok(valid.upstreamArtifact);
  });

  // 7. 多步骤执行计划依赖顺序（显式 ComponentExecutionPlan / Record<string, string>，无 any）
  await t.test("7. 多步骤执行计划依赖顺序强类型校验", () => {
    // 步骤 1 依赖了步骤 2 尚未产出的输出 -> 抛出顺序错乱异常
    const invalidMapping: Record<string, string> = { prev: "steps.step2_out" };
    const invalidPlan: ComponentExecutionPlan = {
      steps: [
        {
          stepId: "step_1",
          name: "第一步",
          promptTemplateVersion: "v1.0",
          promptTemplate: "基于第二步结论深入分析: {{prev}}",
          inputMapping: invalidMapping,
          outputKey: "step1_out",
          contextBudgetTokens: 2000,
          maxOutputTokens: 1000,
          timeoutMs: 10000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
        {
          stepId: "step_2",
          name: "第二步",
          promptTemplateVersion: "v1.0",
          promptTemplate: "基础分析",
          inputMapping: {},
          outputKey: "step2_out",
          contextBudgetTokens: 2000,
          maxOutputTokens: 1000,
          timeoutMs: 10000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    };

    assert.throws(
      () => validateExecutionPlan(invalidPlan),
      (err: unknown) => err instanceof ComponentContractError && err.code === "EXECUTION_PLAN_INVALID"
    );

    // 正确顺序：先 step1 产出 step1_out，step2 依赖 step1_out
    const validMapping: Record<string, string> = { prev: "steps.step1_out" };
    const validPlan: ComponentExecutionPlan = {
      steps: [
        {
          stepId: "step_1",
          name: "第一步",
          promptTemplateVersion: "v1.0",
          promptTemplate: "基础分析",
          inputMapping: {},
          outputKey: "step1_out",
          contextBudgetTokens: 2000,
          maxOutputTokens: 1000,
          timeoutMs: 10000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
        {
          stepId: "step_2",
          name: "第二步",
          promptTemplateVersion: "v1.0",
          promptTemplate: "基于第一步结论深入分析: {{prev}}",
          inputMapping: validMapping,
          outputKey: "step2_out",
          contextBudgetTokens: 2000,
          maxOutputTokens: 1000,
          timeoutMs: 10000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    };
    validateExecutionPlan(validPlan); // 校验通过不抛错
  });

  // 8. 未知 pipeline step 拒绝
  await t.test("8. 未知 pipeline step 拒绝", () => {
    const rawUnknownStep: unknown = {
      ...createBaseValidContract(),
      materialPipeline: {
        steps: [
          { name: "非法未知处理", type: "DYNAMIC_CODE_EXECUTION" },
        ],
      },
    };

    assert.throws(
      () => validateComponentContract(rawUnknownStep),
      (err: unknown) => err instanceof ComponentContractError && err.code === "UNKNOWN_PIPELINE_STEP"
    );
  });

  // 9. 未知 renderer 拒绝
  await t.test("9. 未知 renderer 拒绝", () => {
    const rawUnknownRenderer: unknown = {
      ...createBaseValidContract(),
      output: {
        kind: "DOCUMENT",
        artifactMime: "text/markdown",
        schemaVersion: "v1.0",
        rendererType: "CUSTOM_UNKNOWN_CANVAS",
        previewable: true,
        downloadable: true,
      },
    };

    assert.throws(
      () => validateComponentContract(rawUnknownRenderer),
      (err: unknown) => err instanceof ComponentContractError && err.code === "UNKNOWN_RENDERER_TYPE"
    );
  });

  // 10. 未知模型 capability 拒绝
  await t.test("10. 未知模型 capability 拒绝", () => {
    const rawUnknownCapability: unknown = {
      ...createBaseValidContract(),
      executionPlan: {
        steps: [
          {
            stepId: "step_1",
            name: "未知能力测试",
            promptTemplateVersion: "v1.0",
            promptTemplate: "test",
            inputMapping: {},
            outputKey: "res",
            contextBudgetTokens: 1000,
            maxOutputTokens: 500,
            timeoutMs: 5000,
            requiredCapabilities: ["QUANTUM_COMPUTATION"],
          },
        ],
      },
    };

    assert.throws(
      () => validateComponentContract(rawUnknownCapability),
      (err: unknown) => err instanceof ComponentContractError && err.code === "UNKNOWN_MODEL_CAPABILITY"
    );
  });

  // 11. DRAFT 不可执行
  await t.test("11. DRAFT 状态合同不可执行", () => {
    const draftContract = createBaseValidContract({ lifecycle: "DRAFT", publishedAt: null, publishedBy: null });

    assert.throws(
      () => validateComponentInput(draftContract, { text: "合法的输入文本" }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_LIFECYCLE_INVALID"
    );
  });

  // 12. ARCHIVED 不可执行
  await t.test("12. ARCHIVED 状态合同不可执行", () => {
    const archivedContract = createBaseValidContract({ lifecycle: "ARCHIVED" });

    assert.throws(
      () => validateComponentInput(archivedContract, { text: "合法的输入文本" }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_LIFECYCLE_INVALID"
    );
  });

  // 13. PUBLISHED 可生成快照
  await t.test("13. PUBLISHED 状态合同可生成快照", () => {
    const publishedContract = createBaseValidContract({ lifecycle: "PUBLISHED" });
    const snapshot = buildComponentContractSnapshot(publishedContract);

    assert.ok(snapshot.snapshotId.startsWith("snapshot_C99_v1.0.0_"));
    assert.ok(snapshot.snapshotCreatedAt);
    assert.equal(snapshot.contract.componentId, "C99");
    assert.equal(snapshot.contract.lifecycle, "PUBLISHED");
  });

  // 14. 快照深拷贝，不受原合同修改影响（显式类型，不使用 any）
  await t.test("14. 快照深拷贝，不受原合同修改影响", () => {
    const originalContract = createBaseValidContract();
    const snapshot = buildComponentContractSnapshot(originalContract);

    // 篡改原合同对象的内部属性
    originalContract.componentId = "TAMPERED_ID";
    if (originalContract.input.textConstraints) {
      originalContract.input.textConstraints.minLength = 99999;
    }
    originalContract.executionPlan.steps[0].promptTemplate = "MALICIOUS_PROMPT";

    // 快照中的内容绝不受任何影响
    assert.equal(snapshot.contract.componentId, "C99");
    assert.equal(snapshot.contract.input.textConstraints?.minLength, 5);
    assert.equal(snapshot.contract.executionPlan.steps[0].promptTemplate, "请总结以下文本：{{text}}");

    // 快照被深冻结，试图修改快照会抛错（严格模式下）
    assert.throws(() => {
      const snapMutable = snapshot.contract as Record<string, unknown>;
      snapMutable.componentId = "ILLEGAL_WRITE";
    }, TypeError);
  });

  // 15. 输出结构错误不能标记成功
  await t.test("15. 输出结构错误不能标记成功", () => {
    const contract = createBaseValidContract({
      qualityPolicy: {
        requiredSections: ["核心风险", "处理建议"],
        minOutputLength: 50,
        requiredFields: ["statusCode", "score"],
        allowAutoRetry: false,
        requireHumanReview: false,
      },
    });

    // 缺失必填章节
    assert.throws(
      () =>
        validateComponentOutput(contract, {
          kind: "DOCUMENT",
          mimeType: "text/markdown",
          content: "这是输出文本，长度足够五十个字了吧应该足够了确实足够了但是缺少了必要的章节",
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "OUTPUT_VALIDATION_FAILED"
    );

    // 长度不足
    assert.throws(
      () =>
        validateComponentOutput(contract, {
          kind: "DOCUMENT",
          mimeType: "text/markdown",
          content: "核心风险 处理建议 文本太短",
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "OUTPUT_VALIDATION_FAILED"
    );

    // 结构化字段缺失
    assert.throws(
      () =>
        validateComponentOutput(contract, {
          kind: "DOCUMENT",
          mimeType: "text/markdown",
          content: { statusCode: 200 }, // 缺少 score
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "OUTPUT_VALIDATION_FAILED"
    );
  });

  // 16. 合同缺失不得生成默认合同
  await t.test("16. 合同缺失不得生成默认合同", () => {
    assert.throws(
      () => validateComponentContract(null),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
    assert.throws(
      () => validateComponentContract(undefined),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
    assert.throws(
      () => validateComponentContract({}),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 17. 合同中出现密钥字段或可执行代码字段时拒绝
  await t.test("17. 合同中出现密钥字段或可执行代码字段时拒绝", () => {
    // 携带密钥属性
    const withSecret: unknown = {
      ...createBaseValidContract(),
      apiKey: "sk-live-1234567890",
    };
    assert.throws(
      () => validateComponentContract(withSecret),
      (err: unknown) => err instanceof ComponentContractError && err.code === "FORBIDDEN_SECRET_FIELD"
    );

    // 包含可执行 eval 片段
    const withEval = createBaseValidContract();
    withEval.executionPlan.steps[0].promptTemplate = "hello eval(process.exit())";
    assert.throws(
      () => validateComponentContract(withEval),
      (err: unknown) => err instanceof ComponentContractError && err.code === "FORBIDDEN_EXECUTABLE_CODE"
    );
  });

  // 18. 合同结构中不得携带 providerId/modelId 等模型绑定字段；业务 Prompt 提及厂商不误报
  await t.test("18. 结构性禁止模型绑定字段，普通 Prompt 提及厂商不误报", () => {
    // 合同结构包含 providerId
    const withProviderKey: unknown = {
      ...createBaseValidContract(),
      providerId: "MagicAI",
    };
    assert.throws(
      () => validateComponentContract(withProviderKey),
      (err: unknown) => err instanceof ComponentContractError && err.code === "FORBIDDEN_MODEL_BINDING"
    );

    // 合同步骤包含 modelId
    const withModelId: unknown = {
      ...createBaseValidContract(),
      executionPlan: {
        steps: [
          {
            ...createBaseValidContract().executionPlan.steps[0],
            modelId: "gpt-5.5",
          },
        ],
      },
    };
    assert.throws(
      () => validateComponentContract(withModelId),
      (err: unknown) => err instanceof ComponentContractError && err.code === "FORBIDDEN_MODEL_BINDING"
    );

    // 普通 Prompt 中提及厂商（如用户业务需要让 AI 学习业界标准）必须正常通过！
    const normalPromptWithVendor = createBaseValidContract();
    normalPromptWithVendor.executionPlan.steps[0].promptTemplate =
      "请按照类似 OpenAI 或 DeepSeek 的专业技术文档格式撰写报告：{{text}}";
    const validated = validateComponentContract(normalPromptWithVendor);
    assert.ok(validated.executionPlan.steps[0].promptTemplate.includes("OpenAI"));
  });

  // 19. 计费规则不得包含成本价兜底
  await t.test("19. 计费规则不得包含成本价兜底", () => {
    const withCostFallback: unknown = {
      ...createBaseValidContract(),
      billingPolicy: {
        mode: "REAL_SETTLEMENT_ELIGIBLE",
        useCostAsPrice: true, // 违规声明成本价兜底
      },
    };

    assert.throws(
      () => validateComponentContract(withCostFallback),
      (err: unknown) => err instanceof ComponentContractError && err.code === "COST_PRICE_FALLBACK_FORBIDDEN"
    );
  });

  // 20. 大小、数量、Token 预算必须为安全整数
  await t.test("20. 大小、数量、Token 预算必须为安全整数", () => {
    // Token 预算为小数
    const withFloatBudget = createBaseValidContract();
    withFloatBudget.executionPlan.steps[0].contextBudgetTokens = 1000.5;

    assert.throws(
      () => validateComponentContract(withFloatBudget),
      (err: unknown) => err instanceof ComponentContractError && err.code === "UNSAFE_INTEGER_VALUE"
    );

    // 文件大小为负数
    const withNegativeSize = createBaseValidContract({
      input: {
        kind: "FILE",
        fileConstraints: {
          required: true,
          maxCount: 1,
          acceptedMimes: ["application/pdf"],
          maxSingleFileBytes: -100, // 负数
          maxTotalBytes: 1000,
        },
      },
    });

    assert.throws(
      () => validateComponentContract(withNegativeSize),
      (err: unknown) => err instanceof ComponentContractError && err.code === "UNSAFE_INTEGER_VALUE"
    );
  });

  // 21. 合同交叉验证：数值上下界校验 (min <= max)
  await t.test("21. 合同交叉验证：数值上下界校验 (min <= max)", () => {
    // textConstraints minLength > maxLength
    const invalidTextMinMax: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "TEXT",
        textConstraints: {
          required: true,
          minLength: 100,
          maxLength: 50, // 冲突
        },
      },
    };
    assert.throws(
      () => validateComponentContract(invalidTextMinMax),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // fileConstraints minCount > maxCount
    const invalidCountMinMax: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "MULTI_FILE",
        fileConstraints: {
          required: true,
          minCount: 5,
          maxCount: 2, // 冲突
          acceptedMimes: ["application/pdf"],
          maxSingleFileBytes: 1000,
          maxTotalBytes: 2000,
        },
      },
    };
    assert.throws(
      () => validateComponentContract(invalidCountMinMax),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // maxSingleFileBytes > maxTotalBytes
    const invalidFileBytes: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "MULTI_FILE",
        fileConstraints: {
          required: true,
          maxCount: 2,
          acceptedMimes: ["application/pdf"],
          maxSingleFileBytes: 5000,
          maxTotalBytes: 2000, // 冲突
        },
      },
    };
    assert.throws(
      () => validateComponentContract(invalidFileBytes),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 22. 合同交叉验证：MIME 格式与唯一性去重校验
  await t.test("22. 合同交叉验证：MIME 格式与唯一性去重校验", () => {
    // 重复 MIME
    const duplicateMimes: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "FILE",
        fileConstraints: {
          required: true,
          maxCount: 1,
          acceptedMimes: ["application/pdf", "application/pdf"], // 重复
          maxSingleFileBytes: 1000,
          maxTotalBytes: 1000,
        },
      },
    };
    assert.throws(
      () => validateComponentContract(duplicateMimes),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // 非法 MIME 格式
    const invalidMimeFormat: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "FILE",
        fileConstraints: {
          required: true,
          maxCount: 1,
          acceptedMimes: ["not_a_mime"], // 非法
          maxSingleFileBytes: 1000,
          maxTotalBytes: 1000,
        },
      },
    };
    assert.throws(
      () => validateComponentContract(invalidMimeFormat),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 23. 合同交叉验证：表单字段名唯一与 select options 非空唯一
  await t.test("23. 合同交叉验证：表单字段名唯一与 select options 非空唯一", () => {
    // 字段名重复
    const dupFieldName: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "STRUCTURED_FORM",
        formConstraints: {
          fields: [
            { name: "title", label: "标题", type: "string", required: true },
            { name: "title", label: "重复标题", type: "string", required: false },
          ],
        },
      },
    };
    assert.throws(
      () => validateComponentContract(dupFieldName),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // select 缺少 options
    const selectWithoutOptions: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "STRUCTURED_FORM",
        formConstraints: {
          fields: [
            { name: "type", label: "类型", type: "select", required: true },
          ],
        },
      },
    };
    assert.throws(
      () => validateComponentContract(selectWithoutOptions),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // select options 包含重复项
    const selectDupOptions: unknown = {
      ...createBaseValidContract(),
      input: {
        kind: "STRUCTURED_FORM",
        formConstraints: {
          fields: [
            { name: "type", label: "类型", type: "select", required: true, options: ["A", "A"] },
          ],
        },
      },
    };
    assert.throws(
      () => validateComponentContract(selectDupOptions),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 24. 合同交叉验证：PUBLISHED 必须有发布人与时间，DRAFT 不得伪装
  await t.test("24. 合同交叉验证：PUBLISHED 必须有发布人与时间，DRAFT 不得伪装", () => {
    // PUBLISHED 缺少 publishedAt
    const publishedNoTime: unknown = {
      ...createBaseValidContract(),
      lifecycle: "PUBLISHED",
      publishedAt: null,
    };
    assert.throws(
      () => validateComponentContract(publishedNoTime),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // DRAFT 伪装已发布 (携带 publishedAt)
    const draftFakePublish: unknown = {
      ...createBaseValidContract(),
      lifecycle: "DRAFT",
      publishedAt: "2026-09-20T10:00:00.000Z",
    };
    assert.throws(
      () => validateComponentContract(draftFakePublish),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 25. 执行计划交叉验证：stepId 与 outputKey 全局唯一
  await t.test("25. 执行计划交叉验证：stepId 与 outputKey 全局唯一", () => {
    // 重复 stepId
    const dupStepIdPlan: ComponentExecutionPlan = {
      steps: [
        {
          stepId: "step_1",
          name: "步骤1",
          promptTemplateVersion: "v1.0",
          promptTemplate: "test",
          inputMapping: {},
          outputKey: "out_1",
          contextBudgetTokens: 1000,
          maxOutputTokens: 500,
          timeoutMs: 5000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
        {
          stepId: "step_1", // 重复
          name: "步骤2",
          promptTemplateVersion: "v1.0",
          promptTemplate: "test",
          inputMapping: {},
          outputKey: "out_2",
          contextBudgetTokens: 1000,
          maxOutputTokens: 500,
          timeoutMs: 5000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    };
    assert.throws(
      () => validateExecutionPlan(dupStepIdPlan),
      (err: unknown) => err instanceof ComponentContractError && err.code === "EXECUTION_PLAN_INVALID"
    );

    // 重复 outputKey
    const dupOutputKeyPlan: ComponentExecutionPlan = {
      steps: [
        {
          stepId: "step_1",
          name: "步骤1",
          promptTemplateVersion: "v1.0",
          promptTemplate: "test",
          inputMapping: {},
          outputKey: "same_key",
          contextBudgetTokens: 1000,
          maxOutputTokens: 500,
          timeoutMs: 5000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
        {
          stepId: "step_2",
          name: "步骤2",
          promptTemplateVersion: "v1.0",
          promptTemplate: "test",
          inputMapping: {},
          outputKey: "same_key", // 重复
          contextBudgetTokens: 1000,
          maxOutputTokens: 500,
          timeoutMs: 5000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    };
    assert.throws(
      () => validateExecutionPlan(dupOutputKeyPlan),
      (err: unknown) => err instanceof ComponentContractError && err.code === "EXECUTION_PLAN_INVALID"
    );
  });

  // 26. 输出格式交叉验证：artifactMime 与 schemaVersion 格式校验
  await t.test("26. 输出格式交叉验证：artifactMime 与 schemaVersion 格式校验", () => {
    // artifactMime 缺少 subtype
    const invalidArtifactMime: unknown = {
      ...createBaseValidContract(),
      output: {
        ...createBaseValidContract().output,
        artifactMime: "markdown", // 缺少 type/
      },
    };
    assert.throws(
      () => validateComponentContract(invalidArtifactMime),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );

    // schemaVersion 格式非法
    const invalidSchemaVersion: unknown = {
      ...createBaseValidContract(),
      output: {
        ...createBaseValidContract().output,
        schemaVersion: "version_alpha_release", // 非语义格式
      },
    };
    assert.throws(
      () => validateComponentContract(invalidSchemaVersion),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CONTRACT_VALIDATION_FAILED"
    );
  });

  // 27. 引用约束交叉验证：requireCitations 结构声明与输出内容真实校验
  await t.test("27. 引用约束交叉验证：requireCitations 结构声明与输出内容真实校验", () => {
    // 声明 requireCitations: true，但输出结构未定义 citations 属性
    const citationsWithoutStructure: unknown = {
      ...createBaseValidContract(),
      qualityPolicy: {
        ...createBaseValidContract().qualityPolicy,
        requireCitations: true,
      },
      output: {
        ...createBaseValidContract().output,
        structureConstraints: {
          requiredProperties: ["summary"], // 未包含 citations 或 references
        },
      },
    };
    assert.throws(
      () => validateComponentContract(citationsWithoutStructure),
      (err: unknown) => err instanceof ComponentContractError && err.code === "CITATIONS_STRUCTURE_REQUIRED"
    );

    // 正确声明引用结构
    const validCitationContract = createBaseValidContract({
      qualityPolicy: {
        ...createBaseValidContract().qualityPolicy,
        requireCitations: true,
      },
      output: {
        ...createBaseValidContract().output,
        structureConstraints: {
          requiredProperties: ["citations"],
        },
      },
    });
    validateComponentContract(validCitationContract);

    // 输出成果物未提供引用：抛错拦截
    assert.throws(
      () =>
        validateComponentOutput(validCitationContract, {
          kind: "DOCUMENT",
          mimeType: "text/markdown",
          content: { summary: "正文内容无引用" },
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "OUTPUT_VALIDATION_FAILED"
    );

    // 输出成果物提供合法引用：通过校验
    const validOutput = validateComponentOutput(validCitationContract, {
      kind: "DOCUMENT",
      mimeType: "text/markdown",
      content: { summary: "结论分析 [1]", citations: ["文献来源1"] },
    });
    assert.ok(validOutput);
  });

  // 28. Schema 交叉验证：不支持的 schema 关键字拒绝 (SCHEMA_KEYWORD_UNSUPPORTED) 与真实输出数据校验
  await t.test("28. Schema 交叉验证：不支持的 schema 关键字拒绝与真实校验", () => {
    // 合同使用了不支持的高级关键字 ($ref)
    const unsupportedSchemaContract: unknown = {
      ...createBaseValidContract(),
      output: {
        ...createBaseValidContract().output,
        structureConstraints: {
          schemaDefinition: {
            type: "object",
            $ref: "#/definitions/User", // 不支持的未实现关键字
          },
        },
      },
    };
    assert.throws(
      () => validateComponentContract(unsupportedSchemaContract),
      (err: unknown) => err instanceof ComponentContractError && err.code === "SCHEMA_KEYWORD_UNSUPPORTED"
    );

    // 合法支持的 schemaDefinition
    const validSchemaContract = createBaseValidContract({
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
      },
      output: {
        ...createBaseValidContract().output,
        structureConstraints: {
          schemaDefinition: {
            type: "object",
            required: ["statusCode", "items"],
            properties: {
              statusCode: { type: "number" },
              items: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    });
    validateComponentContract(validSchemaContract);

    // 输出不符合 schema (items 期望 array，实际为 string)
    assert.throws(
      () =>
        validateComponentOutput(validSchemaContract, {
          kind: "DOCUMENT",
          mimeType: "text/markdown",
          content: { statusCode: 200, items: "not_an_array" },
        }),
      (err: unknown) => err instanceof ComponentContractError && err.code === "OUTPUT_VALIDATION_FAILED"
    );

    // 输出完全符合 schema
    const validSchemaOut = validateComponentOutput(validSchemaContract, {
      kind: "DOCUMENT",
      mimeType: "text/markdown",
      content: { statusCode: 200, items: ["item1", "item2"] },
    });
    assert.ok(validSchemaOut);
  });
});
