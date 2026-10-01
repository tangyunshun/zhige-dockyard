/**
 * 批次 2B 输出质量：模型结果服务端统一校验（纯函数，无数据库依赖）
 *
 * 覆盖：
 *  - C08 TABLE 结构化输出：合法 JSON 通过；非法 JSON / 缺 required / 字段类型错误 → MODEL_OUTPUT_INVALID；
 *  - 规范化：```json 代码围栏被剥离，返回解析后的对象（作为结构化 artifact 内容）；
 *  - C10 隐私边界：手机号脱敏、身份证/银行卡明文拒绝、privacyNotes 非空；
 *  - DOCUMENT / MARKDOWN_DOCUMENT：仅非空校验，既有文档结果行为不变。
 *
 * 注：本测试在「写成功 task / 保存成功 artifact」之前运行，对应路由中的 validateModelOutput 调用。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { validateModelOutput } from "@/lib/component-contract/validators";
import type { ComponentContract } from "@/lib/component-contract/types";
import { C08_CONTRACT, C10_CONTRACT, C06_CONTRACT, C11_CONTRACT } from "@/lib/component-contract/catalog-contracts-c06-c08-c10-c11";

describe("批次 2B 输出质量：模型结果服务端校验", () => {
  // ---- C08 结构化（TABLE / application/json）----
  test("C08 合法 JSON 通过校验并返回规范化对象", () => {
    const text = JSON.stringify({
      scenarios: [
        { scenario: "下单后断网", trigger: "网络中断", impact: "状态不明", handling: "重试", priority: "高", category: "网络中断" },
      ],
      coverageSummary: "已覆盖网络中断等维度",
      openQuestions: ["支付失败是否自动退款？"],
    });
    const r = validateModelOutput(C08_CONTRACT, text);
    assert.equal(typeof r.content, "object", "C08 合法 JSON 应解析为对象");
    assert.equal((r.content as { scenarios: unknown[] }).scenarios.length, 1);
  });

  test("C08 带 ```json 围栏的合法 JSON 仍能解析（规范化）", () => {
    const fenced = "```json\n" + JSON.stringify({ scenarios: [], coverageSummary: "x", openQuestions: [] }) + "\n```";
    const r = validateModelOutput(C08_CONTRACT, fenced);
    assert.equal(typeof r.content, "object");
  });

  test("C08 非法 JSON 被拒绝并抛 MODEL_OUTPUT_INVALID", () => {
    assert.throws(
      () => validateModelOutput(C08_CONTRACT, "这不是合法 JSON {{{"),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "非法 JSON 必须抛 MODEL_OUTPUT_INVALID",
    );
  });

  test("C08 缺 required 字段被拒绝", () => {
    assert.throws(
      () => validateModelOutput(C08_CONTRACT, JSON.stringify({ scenarios: [], coverageSummary: "已覆盖异常维度".repeat(40) })),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID" || (e as { code?: string })?.code === "OUTPUT_VALIDATION_FAILED",
      "缺 openQuestions 必须被拒绝",
    );
  });

  test("C08 字段类型错误被拒绝（scenarios 应为数组）", () => {
    assert.throws(
      () => validateModelOutput(C08_CONTRACT, JSON.stringify({ scenarios: "应为数组", coverageSummary: "x", openQuestions: [] })),
      (e: unknown) => (e as { code?: string })?.code === "OUTPUT_VALIDATION_FAILED" || (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "scenarios 类型错误必须被拒绝",
    );
  });

  // ---- C10 隐私边界 ----
  const c10ValidBase = {
    schema: [{ field: "user_name", type: "string", description: "虚构姓名" }],
    rows: [{ user_name: "测试用户甲", mobile: "138****1234", amount: 199 }],
    privacyNotes: "姓名全部虚构；手机号中间四位打码；不含真实个人身份信息。",
    summary: "可用于联调压测，严禁回流生产。",
  };

  test("C10 脱敏合规 JSON 通过校验", () => {
    const r = validateModelOutput(C10_CONTRACT, JSON.stringify(c10ValidBase));
    assert.equal(typeof r.content, "object");
    assert.equal((r.content as { privacyNotes: string }).privacyNotes.length > 0, true);
  });

  test("C10 手机号未脱敏被拒绝（MODEL_OUTPUT_INVALID）", () => {
    const bad = { ...c10ValidBase, rows: [{ user_name: "甲", mobile: "13812345678", amount: 199 }] };
    assert.throws(
      () => validateModelOutput(C10_CONTRACT, JSON.stringify(bad)),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "未脱敏手机号必须拒绝",
    );
  });

  test("C10 缺失非空 privacyNotes 被拒绝", () => {
    const { privacyNotes, ...noNotes } = c10ValidBase;
    // 缺失 privacyNotes 会被 schema 先拦截（OUTPUT_VALIDATION_FAILED），仍属有效拒绝
    assert.throws(
      () => validateModelOutput(C10_CONTRACT, JSON.stringify(noNotes)),
      (e: unknown) => {
        const c = (e as { code?: string })?.code;
        return c === "MODEL_OUTPUT_INVALID" || c === "OUTPUT_VALIDATION_FAILED";
      },
      "缺失 privacyNotes 必须拒绝",
    );
    // 仅声明但为空：schema 通过、隐私规则拦截（MODEL_OUTPUT_INVALID）
    const emptyNotes = { ...c10ValidBase, privacyNotes: "   " };
    assert.throws(
      () => validateModelOutput(C10_CONTRACT, JSON.stringify(emptyNotes)),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "空 privacyNotes 必须拒绝",
    );
  });

  test("C10 未脱敏身份证号被拒绝", () => {
    const bad = { ...c10ValidBase, rows: [{ user_name: "甲", mobile: "138****1234", idcard: "11010119900307891X", amount: 199 }] };
    assert.throws(
      () => validateModelOutput(C10_CONTRACT, JSON.stringify(bad)),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "未脱敏身份证号必须拒绝",
    );
  });

  test("C10 未脱敏银行卡号被拒绝", () => {
    const bad = { ...c10ValidBase, rows: [{ user_name: "甲", mobile: "138****1234", card: "6222021234567890123", amount: 199 }] };
    assert.throws(
      () => validateModelOutput(C10_CONTRACT, JSON.stringify(bad)),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "未脱敏银行卡号必须拒绝",
    );
  });

  test("C10 姓名字段不被服务端声称已验证（仅约束可机器判定项）", () => {
    // 合同声明 nameVerifiability=NOT_SERVER_VERIFIABLE：服务端不校验姓名真假，仅校验手机号/证件/隐私说明
    const onlyNameWeird = {
      schema: [{ field: "user_name", type: "string", description: "姓名" }],
      rows: [{ user_name: "习近平", mobile: "138****1234", amount: 1 }],
      privacyNotes: "说明",
      summary: "s",
    };
    // 不应因“真实姓名”而被拒（服务端无此能力）；只应因其它硬约束是否满足而定（此处满足）
    const r = validateModelOutput(C10_CONTRACT, JSON.stringify(onlyNameWeird));
    assert.equal(typeof r.content, "object");
  });

  // ---- DOCUMENT 类不受影响 ----
  test("C06 DOCUMENT 非空通过；空文本被拒绝", () => {
    const ok = validateModelOutput(
      C06_CONTRACT,
      "## 投入明细与投资回收测算\n| 投入项 | 金额 |\n| --- | --- |\n| 研发 | 120 |\n".repeat(20),
    );
    assert.equal(typeof ok.content, "string");
    assert.throws(
      () => validateModelOutput(C06_CONTRACT, "   "),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "空文档必须被拒绝",
    );
  });

  test("C11 DOCUMENT 类结果不受影响（仍按非空校验）", () => {
    const ok = validateModelOutput(C11_CONTRACT, "## 接口清单\n| 方法 | 路径 |\n| --- | --- |\n| POST | /api/register |\n".repeat(20));
    assert.equal(typeof ok.content, "string");
  });

  // ---- DOCUMENT 显式分派（非空校验，行为不变）----
  const docContract = {
    componentId: "TEST_DOC",
    output: { kind: "DOCUMENT", artifactMime: "text/markdown", schemaVersion: "v1", rendererType: "MARKDOWN_DOCUMENT" },
  } as unknown as ComponentContract;
  test("DOCUMENT 显式分派：非空文本通过；空白文本被拒绝（MODEL_OUTPUT_INVALID）", () => {
    const ok = validateModelOutput(docContract, "# 标题\n正文".repeat(10));
    assert.equal(typeof ok.content, "string");
    assert.throws(
      () => validateModelOutput(docContract, "   "),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "空白文档必须被拒绝",
    );
  });

  // ---- JSON 显式分派（复用 schema 校验，不再走隐式分支）----
  const jsonContract = {
    componentId: "TEST_JSON",
    output: {
      kind: "JSON",
      artifactMime: "application/json",
      schemaVersion: "v1",
      rendererType: "JSON_VIEWER",
      structureConstraints: {
        schemaDefinition: { type: "object", required: ["a"], properties: { a: { type: "string" } } },
      },
    },
  } as unknown as ComponentContract;
  test("JSON 显式分派：合法对象通过校验", () => {
    const r = validateModelOutput(jsonContract, JSON.stringify({ a: "ok" }));
    assert.equal(typeof r.content, "object");
    assert.equal((r.content as { a: string }).a, "ok");
  });
  test("JSON 显式分派：非法文本被拒绝（MODEL_OUTPUT_INVALID，不静默当成功）", () => {
    assert.throws(
      () => validateModelOutput(jsonContract, "not json {{{"),
      (e: unknown) => (e as { code?: string })?.code === "MODEL_OUTPUT_INVALID",
      "非法 JSON 必须抛 MODEL_OUTPUT_INVALID",
    );
  });
  test("JSON 显式分派：缺 required 字段被拒绝（OUTPUT_VALIDATION_FAILED）", () => {
    assert.throws(
      () => validateModelOutput(jsonContract, JSON.stringify({})),
      (e: unknown) => {
        const c = (e as { code?: string })?.code;
        return c === "OUTPUT_VALIDATION_FAILED" || c === "MODEL_OUTPUT_INVALID";
      },
      "JSON 缺 required 必须被拒绝",
    );
  });

  // ---- 未支持类型（SCORE / TIMELINE / FILE / DOCUMENT_PACKAGE）：明确拒绝并退款，不猜测 ----
  const unsupportedCases: Array<{ kind: "SCORE" | "TIMELINE" | "FILE" | "DOCUMENT_PACKAGE"; label: string }> = [
    { kind: "SCORE", label: "SCORE" },
    { kind: "TIMELINE", label: "TIMELINE" },
    { kind: "FILE", label: "FILE" },
    { kind: "DOCUMENT_PACKAGE", label: "DOCUMENT_PACKAGE" },
  ];
  for (const uc of unsupportedCases) {
    const contract = {
      componentId: `TEST_${uc.kind}`,
      output: { kind: uc.kind, artifactMime: "application/json", schemaVersion: "v1", rendererType: "JSON_VIEWER" },
    } as unknown as ComponentContract;

    test(`输出类型 ${uc.label}：无正式合同/构建协议，明确抛 OUTPUT_KIND_NOT_SUPPORTED 并退款`, () => {
      assert.throws(
        () => validateModelOutput(contract, "任意文本甚至合法 JSON { \"x\": 1 }"),
        (e: unknown) => (e as { code?: string })?.code === "OUTPUT_KIND_NOT_SUPPORTED",
        `${uc.label} 必须明确抛 OUTPUT_KIND_NOT_SUPPORTED`,
      );
    });

    test(`输出类型 ${uc.label}：即便模型返回合法 JSON 也不得强行当 JSON 猜测`, () => {
      assert.throws(
        () => validateModelOutput(contract, '{"score":90,"x":1}'),
        (e: unknown) => (e as { code?: string })?.code === "OUTPUT_KIND_NOT_SUPPORTED",
        `${uc.label} 不得把文本强行解析为 JSON`,
      );
    });
  }
});
