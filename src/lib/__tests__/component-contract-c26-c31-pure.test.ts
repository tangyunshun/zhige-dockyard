/**
 * 批次 2E3（C26/C27/C28/C29/C30/C31）合同纯函数与门禁测试（vitest 风格）
 *
 * 覆盖范围（不依赖真实外部模型，可离线确定性运行）：
 *  - 批次范围与冻结保护：仅 C26-C31，绝不触碰 C07 / 暂停中的 C09，也不覆盖 2B 的 C06/C08/C10/C11、
 *    2C 的 C12-C15、E1 的 C16-C19、以及 E2 的 C20-C25；
 *  - 合同结构校验：结构合法、输出类型仅 DOCUMENT/JSON、无模型绑定/可执行代码/密钥字段；
 *  - 差异化输出选型：代码/方案/脚本类 C26/C27/C28/C30/C31 用 DOCUMENT；
 *    结构化扫描结果类 C29 用 JSON（schemaDefinition 结构化校验，要求 STRUCTURED_OUTPUT）；
 *  - 输入约束：C26/C27/C29=both（文件或文本任一非空）、C28/C30/C31=text（必填）；
 *  - 每个合同必须声明 requiredSections（JSON 类 C29 用 schemaDefinition 等价替代）
 *    且 promptTemplate 逐字包含引导模型产出该章节/结构的指令（禁止只写占位提示词）；
 *  - 能力门禁：真实部署能力、空能力两种情形下的发布资格裁决；C29 额外要求 STRUCTURED_OUTPUT。
 */

import { describe, it, expect } from "vitest";

import {
  validateComponentContract,
  validateComponentInput,
  validateModelOutput,
} from "@/lib/component-contract/validators";
import { ComponentContractError } from "@/lib/component-contract/errors";
import {
  assertNoExecutableCode,
  assertNoModelBindingFields,
  assertNoSecretFields,
} from "@/lib/component-contract/capabilities";
import {
  BATCH_2E3,
  BATCH_2E3_ANALYSIS,
  BATCH_2E3_COMPONENT_IDS,
  BATCH_2E3_FORBIDDEN_IDS,
  SUPPORTED_OUTPUT_KINDS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c26-c31";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 数据库实测的平台默认部署能力（只读核验所得，非编造） */
const REAL_CAPABILITIES = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];
/** 冻结的批次 2B 组件（不得被本批次覆盖） */
const FROZEN_2B_IDS = ["C06", "C08", "C10", "C11"] as const;
/** 批次 2C 组件（本批次不得重复覆盖） */
const BATCH_2C_IDS = ["C12", "C13", "C14", "C15"] as const;
/** E1 批次组件（本批次不得重复覆盖） */
const BATCH_2E_IDS = ["C16", "C17", "C18", "C19"] as const;
/** E2 批次组件（本批次不得重复覆盖） */
const BATCH_2E2_IDS = ["C20", "C21", "C22", "C23", "C24", "C25"] as const;
/** 本批次明确禁止触碰的组件 */
const FORBIDDEN_IDS = ["C07", "C09"] as const;

/** 目录记录的估算 Token（DB 实际核验值，与合同 billingPolicy.estimatedTokens 一致） */
const CATALOG_ESTIMATED_TOKENS: Record<string, number> = {
  C26: 80,
  C27: 100,
  C28: 200,
  C29: 120,
  C30: 180,
  C31: 60,
};

/** 每个合同 promptTemplate 必须逐字包含的「引导产出必填章节/结构」指令（C07 教训防线） */
const PROMPT_VERBATIM: Record<string, string[]> = {
  C26: ["测试用例", "边界"],
  C27: ["接口用例", "并发"],
  C28: ["压测脚本"],
  C29: ["合法 JSON", "issues"],
  C30: ["自动化脚本"],
  C31: ["Dockerfile"],
};

/** 每个 DOCUMENT 合同必须声明的必填章节（JSON 类 C29 以 schemaDefinition 等价替代，此处为空） */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  C26: ["测试用例", "边界"],
  C27: ["接口用例", "并发"],
  C28: ["压测脚本"],
  C29: [],
  C30: ["自动化脚本"],
  C31: ["Dockerfile"],
};

function asPublished(contract: ComponentContract): ComponentContract {
  return {
    ...contract,
    lifecycle: "PUBLISHED",
    publishedAt: "2026-01-01T00:00:00.000Z",
    publishedBy: "unit-test",
  } as ComponentContract;
}

function expectCode(fn: () => unknown, code: string, label: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `${label}：应抛出 ComponentContractError(${code})`).toBeDefined();
  expect(thrown).toBeInstanceOf(ComponentContractError);
  expect((thrown as { code?: string }).code).toBe(code);
}

describe("批次 2E3：范围、冻结与越界保护", () => {
  it("目标组件精确为 C26/C27/C28/C29/C30/C31", () => {
    expect([...BATCH_2E3_COMPONENT_IDS]).toEqual(["C26", "C27", "C28", "C29", "C30", "C31"]);
    expect(BATCH_2E3.map((b) => b.componentId as string)).toEqual([
      "C26",
      "C27",
      "C28",
      "C29",
      "C30",
      "C31",
    ]);
  });

  it("禁止触碰集合包含 C07 与暂停中的 C09，且批次内无任何禁止组件", () => {
    for (const id of FORBIDDEN_IDS) {
      expect((BATCH_2E3_FORBIDDEN_IDS as readonly string[]).includes(id)).toBe(true);
    }
    for (const { componentId } of BATCH_2E3) {
      expect((BATCH_2E3_FORBIDDEN_IDS as readonly string[]).includes(componentId as string)).toBe(false);
    }
  });

  it("批次 2E3 不得覆盖冻结的 2B（C06/C08/C10/C11）、2C（C12-C15）、E1（C16-C19）与 E2（C20-C25）组件", () => {
    for (const overlap of [FROZEN_2B_IDS, BATCH_2C_IDS, BATCH_2E_IDS, BATCH_2E2_IDS]) {
      const hit = (overlap as readonly string[]).filter((id) =>
        (BATCH_2E3_COMPONENT_IDS as readonly string[]).includes(id),
      );
      expect(hit, `批次 2E3 不得与 [${overlap.join(",")}] 重叠`).toEqual([]);
    }
  });

  it("每个合同的 componentId 与其分析记录严格一致，且模板保持 DRAFT", () => {
    for (const { componentId, contract, analysis } of BATCH_2E3) {
      const id = componentId as string;
      expect(contract.componentId).toBe(id);
      expect(analysis.componentId).toBe(id);
      expect(contract.lifecycle).toBe("DRAFT");
      expect(contract.publishedAt).toBeNull();
      expect(contract.publishedBy).toBeNull();
    }
  });
});

describe("批次 2E3：合同结构与安全校验", () => {
  for (const { componentId, contract, analysis } of BATCH_2E3) {
    const id = componentId as string;

    it(`${id} 合同结构通过 validateComponentContract 强校验`, () => {
      const validated = validateComponentContract(contract);
      expect(validated.componentId).toBe(id);
    });

    it(`${id} 输出类型落在支持白名单内（DOCUMENT/JSON，差异化选型）`, () => {
      const kind = contract.output.kind;
      expect(SUPPORTED_OUTPUT_KINDS.includes(kind)).toBe(true);
      expect(analysis.outputKind).toBe(kind);
    });

    it(`${id} 合同不含模型绑定字段 / 可执行代码 / 密钥字段`, () => {
      assertNoModelBindingFields(contract);
      assertNoExecutableCode(contract);
      assertNoSecretFields(contract);
    });

    it(`${id} 输出结构约束非空，且与估算 Token 对齐目录真实值`, () => {
      const sc = contract.output.structureConstraints;
      if (id === "C29") {
        expect(sc?.schemaDefinition && typeof sc.schemaDefinition === "object").toBe(true);
        const props = (sc!.schemaDefinition as Record<string, unknown>).properties as Record<string, unknown>;
        for (const f of ["summary", "issues"]) {
          expect(f in props, `${id} schemaDefinition 必须定义扫描结果顶层字段 ${f}`).toBe(true);
        }
      } else {
        expect((sc?.requiredProperties ?? []).length > 0, `${id} 必须声明 requiredProperties`).toBe(true);
      }
      expect(contract.billingPolicy.estimatedTokens).toBe(CATALOG_ESTIMATED_TOKENS[id]);
      expect(analysis.estimatedTokens).toBe(CATALOG_ESTIMATED_TOKENS[id]);
    });

    it(`${id} 质量策略必须含 requireHumanReview=true 与 disclaimerPolicy`, () => {
      expect(contract.qualityPolicy.requireHumanReview).toBe(true);
      expect(contract.qualityPolicy.disclaimerPolicy?.required).toBe(true);
    });

    it(`${id} C07 教训防线：requiredSections 与 promptTemplate 逐字引导断言`, () => {
      if (id !== "C29") {
        expect(contract.qualityPolicy.requiredSections ?? []).toEqual(REQUIRED_SECTIONS[id]);
      }
      const tpl = contract.executionPlan.steps[0].promptTemplate;
      for (const kw of PROMPT_VERBATIM[id]) {
        expect(tpl.includes(kw), `${id} promptTemplate 必须逐字包含引导指令片段「${kw}」`).toBe(true);
      }
    });

    it(`${id} 必须显式登记不支持项（无需求时为显式空数组，绝不静默补默认值）`, () => {
      expect(Array.isArray(analysis.unsupportedRequirements)).toBe(true);
    });
  }
});

describe("批次 2E3：六份合同两两不同（禁止复制改 ID）", () => {
  it("提示词模板互不相同且均非空", () => {
    const prompts = BATCH_2E3.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    expect(new Set(prompts).size).toBe(6);
    for (const p of prompts) expect(p.length > 100).toBe(true);
  });

  it("输出结构签名互不相同（含差异化 JSON 选型，且 C26/C27 以提示词差异区分）", () => {
    const signatures = BATCH_2E3.map((b) =>
      [
        b.contract.input.kind,
        b.contract.output.kind,
        b.contract.output.artifactMime,
        (b.contract.output.structureConstraints?.requiredProperties ?? []).join("|"),
        b.contract.executionPlan.steps[0].promptTemplate.slice(0, 48),
      ].join("#"),
    );
    expect(new Set(signatures).size).toBe(6);
  });

  it("输入形态互不相同且贴合目录真实 inputMode（C26/C27/C29=both，C28/C30/C31=text）", () => {
    const kinds = BATCH_2E3.map((b) => b.contract.input.kind);
    expect(new Set(kinds).size).toBe(2);
    const byId = Object.fromEntries(BATCH_2E3.map((b) => [b.componentId, b.contract.input.kind]));
    expect(byId.C26).toBe("TEXT_AND_FILES");
    expect(byId.C27).toBe("TEXT_AND_FILES");
    expect(byId.C29).toBe("TEXT_AND_FILES");
    for (const id of ["C28", "C30", "C31"]) expect(byId[id]).toBe("TEXT");
  });
});

describe("批次 2E3：输入约束（必填 / 最短长度 / 合法通过 / 文件 MIME）", () => {
  for (const { componentId, contract } of BATCH_2E3) {
    const id = componentId as string;
    const published = asPublished(contract);

    if (id === "C26" || id === "C27" || id === "C29") {
      it(`${id} 文本为空且未上传文件时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 文本文件皆空`);
      });
      it(`${id} 仅粘贴文本即通过（TEXT_AND_FILES 任一非空）`, () => {
        expect(validateComponentInput(published, { text: "请基于这段源码生成对应的单元测试与边界用例。" })).toBeTruthy();
      });
      it(`${id} 仅上传白名单源码/定义文件即通过（MIME 扩展名在白名单内）`, () => {
        const name = id === "C27" ? "openapi.json" : "src.ts";
        const mime = id === "C27" ? "application/json" : "text/plain";
        expect(
          validateComponentInput(published, {
            files: [{ name, mimeType: mime, sizeBytes: 120 }],
          }),
        ).toBeTruthy();
      });
      it(`${id} 上传非白名单 MIME 必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () => validateComponentInput(published, { files: [{ name: "x.png", mimeType: "image/png", sizeBytes: 120 }] }),
          "INPUT_VALIDATION_FAILED",
          `${id} 非法 MIME`,
        );
      });
      it(`${id} 文件超过 maxCount=1 必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () =>
            validateComponentInput(published, {
              files: [
                { name: "a.ts", mimeType: "text/plain", sizeBytes: 100 },
                { name: "b.ts", mimeType: "text/plain", sizeBytes: 100 },
              ],
            }),
          "INPUT_VALIDATION_FAILED",
          `${id} 文件超量`,
        );
      });
    } else {
      it(`${id} 纯文本为空时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 空文本`);
      });
      it(`${id} 合法长度文本通过输入校验`, () => {
        expect(
          validateComponentInput(published, {
            text: "请对 https://api.example.com/health 做压测，最大并发 3000 用户，阶梯递增至峰值。",
          }),
        ).toBeTruthy();
      });
    }
  }
});

describe("批次 2E3：输出结构校验（DOCUMENT 章节 / JSON 合法结构）", () => {
  const docValidMap: Record<string, string> = {
    C26:
      "# 单元测试方案\n\n- 测试用例：覆盖正常路径、边界输入与异常输入，标注预期结果；\n".repeat(10) +
      "- 边界：空值、极值与特殊字符的异常模拟策略，附可直接运行的 Vitest 测试代码块。\n".repeat(10),
    C27:
      "# 接口测试方案\n\n- 接口用例：鉴权、正常参数、异常参数、越权与并发校验，标注请求方法与状态码；\n".repeat(10) +
      "- 并发：高并发压测与防越权检查策略，附 k6 测试脚本代码块。\n".repeat(10),
    C28:
      "# 服务器压测方案\n\n- 压测脚本：k6 阶梯递增并发脚本，含响应耗时采集与失败率阈值；\n".repeat(15),
    C30:
      "# UI 自动化测试方案\n\n- 自动化脚本：Playwright 覆盖登录-搜索-下单-支付全流程，含元素定位与断言；\n".repeat(15),
    C31:
      "# Docker 打包方案\n\n- Dockerfile：多阶段构建，含基础镜像、依赖安装、构建与启动命令；\n".repeat(15),
  };

  for (const { componentId, contract } of BATCH_2E3) {
    const id = componentId as string;
    const kind = contract.output.kind;

    if (kind === "DOCUMENT") {
      it(`${id} DOCUMENT 空输出必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "   "), "MODEL_OUTPUT_INVALID", `${id} 空文档`);
      });
      it(`${id} DOCUMENT 满足必填章节与最小长度的合法输出通过`, () => {
        const out = validateModelOutput(contract, docValidMap[id] || docValidMap.C26);
        expect(out.kind).toBe("DOCUMENT");
      });
      it(`${id} DOCUMENT 缺失必填章节必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const dummy = "# 通用设计文档\n\n" + "这是一个没有任何必填业务关键词的长篇描述内容。".repeat(25);
        expectCode(() => validateModelOutput(contract, dummy), "OUTPUT_VALIDATION_FAILED", `${id} 缺失必填章节`);
      });
    } else if (kind === "JSON") {
      it(`${id} JSON 合法扫描结果通过结构校验`, () => {
        const json = JSON.stringify({
          summary: { files: 1, issuesCount: 2, errorCount: 1, warnCount: 1 },
          issues: [
            { file: "src.ts", line: 12, severity: "ERROR", type: "LOGIC", message: "可能为空的返回值未判空", suggestion: "增加空值守卫" },
            { file: "src.ts", line: 20, severity: "WARN", type: "DUPLICATION", message: "重复代码块", suggestion: "抽取公共函数" },
          ],
        });
        const out = validateModelOutput(contract, json);
        expect(out.kind).toBe("JSON");
      });
      it(`${id} JSON 非合法结构必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "这不是 JSON"), "MODEL_OUTPUT_INVALID", `${id} 非法 JSON`);
      });
    }
  }
});

describe("批次 2E3：能力门禁裁决", () => {
  it("真实部署能力下六组件均满足能力（C29 额外需要 STRUCTURED_OUTPUT）", () => {
    for (const { componentId, contract } of BATCH_2E3) {
      const elig = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
      expect(elig.missingCapabilities).toEqual([]);
      expect(elig.eligible).toBe(true);
    }
  });

  it("空部署能力下六组件均缺 TEXT_GENERATION（C29 另缺 STRUCTURED_OUTPUT，不得发布）", () => {
    for (const { componentId, contract } of BATCH_2E3) {
      const elig = evaluateActivationEligibility(contract, []);
      const expected =
        componentId === "C29" ? ["TEXT_GENERATION", "STRUCTURED_OUTPUT"] : ["TEXT_GENERATION"];
      expect(elig.missingCapabilities).toEqual(expected);
      expect(elig.eligible).toBe(false);
    }
  });

  it("C29 在缺少 STRUCTURED_OUTPUT 时不得发布（差异化能力要求）", () => {
    const c29 = BATCH_2E3.find((b) => b.componentId === "C29")!.contract;
    const elig = evaluateActivationEligibility(c29, ["TEXT_GENERATION"]);
    expect(elig.missingCapabilities).toEqual(["STRUCTURED_OUTPUT"]);
    expect(elig.eligible).toBe(false);
  });
});
