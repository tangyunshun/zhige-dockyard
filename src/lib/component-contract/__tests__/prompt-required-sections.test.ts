/**
 * 【P2 事故防线】确定性测试：Prompt 模板必填章节前置校验
 *
 * 背景（C07 v1.1.0 七连败全额退款事故）：qualityPolicy.requiredSections 是执行期
 * 输出质量门禁，若 Prompt 模板未写明这些章节，模型输出必缺章节 → 输出校验必败。
 * assertPromptCoversRequiredSections 在起草/修改/发布三个写入入口前置拦截。
 *
 * 匹配语义与运行时输出门禁一致：逐字包含、支持 | 分隔多选一（任一命中即通过）、
 * 全部步骤的模板合并后判定（章节可分布在不同步骤）。
 */
import { describe, it, expect } from "vitest";
import { assertPromptCoversRequiredSections } from "../validators";
import { ComponentContractError } from "../errors";
import type { ComponentContract } from "../types";

/** 构造最小可用合同（仅含被测函数读取的字段） */
function makeContract(overrides: {
  requiredSections?: string[];
  templates?: string[];
}): ComponentContract {
  return {
    executionPlan: {
      steps: (overrides.templates ?? []).map((promptTemplate, i) => ({
        stepId: `step_${String(i + 1).padStart(2, "0")}`,
        name: `步骤${i + 1}`,
        promptTemplateVersion: "v1.0",
        promptTemplate,
        inputMapping: {},
        outputKey: `out_${i + 1}`,
        contextBudgetTokens: 4096,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        requiredCapabilities: ["TEXT_GENERATION"],
      })),
    },
    qualityPolicy: {
      requiredSections: overrides.requiredSections ?? [],
    },
  } as unknown as ComponentContract;
}

describe("assertPromptCoversRequiredSections（P2 前置校验）", () => {
  it("用例一：模板包含全部必填章节 → 通过，不抛错", () => {
    const contract = makeContract({
      requiredSections: ["测试结论", "执行摘要"],
      templates: [
        "你是一名测试分析专家，请分析：{{sourceText}}\n先输出「执行摘要」，再输出「测试结论」。",
      ],
    });
    expect(() => assertPromptCoversRequiredSections(contract)).not.toThrow();
  });

  it("用例二：模板缺少任一必填章节 → 抛 PROMPT_MISSING_REQUIRED_SECTION", () => {
    const contract = makeContract({
      requiredSections: ["测试结论", "执行摘要"],
      templates: ["请分析：{{sourceText}}\n输出「执行摘要」与整体评价。（故意不写结论章节要求）"],
    });
    let caught: unknown;
    try {
      assertPromptCoversRequiredSections(contract);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ComponentContractError);
    const e = caught as ComponentContractError;
    expect(e.code).toBe("PROMPT_MISSING_REQUIRED_SECTION");
    expect(e.message).toContain("测试结论");
    expect(e.message).toContain("质量门禁");
  });

  it("补充：| 分隔多选一，任一命中即通过", () => {
    const contract = makeContract({
      requiredSections: ["测试结论|结论与建议"],
      templates: ["分析完成。请给出「结论与建议」。"],
    });
    expect(() => assertPromptCoversRequiredSections(contract)).not.toThrow();
  });

  it("补充：章节分布在多个步骤时按合并模板判定", () => {
    const contract = makeContract({
      requiredSections: ["执行摘要", "测试结论"],
      templates: ["第一步：输出「执行摘要」。", "第二步：输出「测试结论」。"],
    });
    expect(() => assertPromptCoversRequiredSections(contract)).not.toThrow();
  });

  it("补充：requiredSections 为空 → 不启用该校验（放行）", () => {
    const contract = makeContract({
      requiredSections: [],
      templates: ["无章节要求的模板"],
    });
    expect(() => assertPromptCoversRequiredSections(contract)).not.toThrow();
  });
});
