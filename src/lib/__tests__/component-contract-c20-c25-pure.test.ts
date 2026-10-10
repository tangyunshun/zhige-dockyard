/**
 * 批次 2E2（C20/C21/C22/C23/C24/C25）合同纯函数与门禁测试（vitest 风格）
 *
 * 覆盖范围（不依赖真实外部模型，可离线确定性运行）：
 *  - 批次范围与冻结保护：仅 C20-C25，绝不触碰 C07 / 暂停中的 C09，也不覆盖 2B 的 C06/C08/C10/C11、
 *    2C 的 C12-C15、以及 E1 的 C16-C19；
 *  - 合同结构校验：结构合法、输出类型仅 DOCUMENT/TABLE/JSON、无模型绑定/可执行代码/密钥字段；
 *  - 差异化输出选型（E2 强制项 B）：代码/方案/诊断类 C20/C21/C22/C23/C25 用 DOCUMENT；
 *    数据/配置/映射类 C24 用 JSON（ECharts option，结构化校验强于 MARKDOWN）；
 *  - 输入约束：C20=FILE 单文件必填、C24=TEXT_AND_FILES 任一非空、C21/C22/C23/C25=TEXT 必填；
 *  - C07 教训防线：每个合同必须声明 requiredSections（JSON 类 C24 用 structureConstraints.schemaDefinition 等价替代）
 *    且 promptTemplate 逐字包含引导模型产出该章节/结构的指令（禁止只写占位提示词）；
 *  - 能力门禁：真实部署能力、空能力两种情形下的发布资格裁决；C24 额外要求 STRUCTURED_OUTPUT。
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
  BATCH_2E2,
  BATCH_2E2_ANALYSIS,
  BATCH_2E2_COMPONENT_IDS,
  BATCH_2E2_FORBIDDEN_IDS,
  SUPPORTED_OUTPUT_KINDS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c20-c25";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 数据库实测的平台默认部署能力（只读核验所得，非编造） */
const REAL_CAPABILITIES = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];
/** 冻结的批次 2B 组件（不得被本批次覆盖） */
const FROZEN_2B_IDS = ["C06", "C08", "C10", "C11"] as const;
/** 批次 2C 组件（本批次不得重复覆盖） */
const BATCH_2C_IDS = ["C12", "C13", "C14", "C15"] as const;
/** E1 批次组件（本批次不得重复覆盖） */
const BATCH_2E_IDS = ["C16", "C17", "C18", "C19"] as const;
/** 本批次明确禁止触碰的组件 */
const FORBIDDEN_IDS = ["C07", "C09"] as const;

/** 目录记录的估算 Token（DB 实际核验值，C22 经 migrate 修复后亦为 80） */
const CATALOG_ESTIMATED_TOKENS: Record<string, number> = {
  C20: 200,
  C21: 80,
  C22: 80,
  C23: 100,
  C24: 150,
  C25: 300,
};

/** 每个合同 promptTemplate 必须逐字包含的「引导产出必填章节/结构」指令（C07 教训防线） */
const PROMPT_VERBATIM: Record<string, string[]> = {
  C20: ["映射"],
  C21: ["组件"],
  C22: ["组件"],
  C23: ["断点"],
  C24: ["合法 JSON", "series"],
  C25: ["轮询"],
};

/** 每个 DOCUMENT 合同必须声明的必填章节（JSON 类 C24 以 schemaDefinition 等价替代，此处为空） */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  C20: ["映射"],
  C21: ["组件"],
  C22: ["组件"],
  C23: ["断点"],
  C24: [],
  C25: ["轮询"],
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

describe("批次 2E2：范围、冻结与越界保护", () => {
  it("目标组件精确为 C20/C21/C22/C23/C24/C25", () => {
    expect([...BATCH_2E2_COMPONENT_IDS]).toEqual(["C20", "C21", "C22", "C23", "C24", "C25"]);
    expect(BATCH_2E2.map((b) => b.componentId as string)).toEqual([
      "C20",
      "C21",
      "C22",
      "C23",
      "C24",
      "C25",
    ]);
  });

  it("禁止触碰集合包含 C07 与暂停中的 C09，且批次内无任何禁止组件", () => {
    for (const id of FORBIDDEN_IDS) {
      expect((BATCH_2E2_FORBIDDEN_IDS as readonly string[]).includes(id)).toBe(true);
    }
    for (const { componentId } of BATCH_2E2) {
      expect((BATCH_2E2_FORBIDDEN_IDS as readonly string[]).includes(componentId as string)).toBe(false);
    }
  });

  it("批次 2E2 不得覆盖冻结的 2B（C06/C08/C10/C11）、2C（C12-C15）与 E1（C16-C19）组件", () => {
    for (const overlap of [FROZEN_2B_IDS, BATCH_2C_IDS, BATCH_2E_IDS]) {
      const hit = (overlap as readonly string[]).filter((id) =>
        (BATCH_2E2_COMPONENT_IDS as readonly string[]).includes(id),
      );
      expect(hit, `批次 2E2 不得与 [${overlap.join(",")}] 重叠`).toEqual([]);
    }
  });

  it("每个合同的 componentId 与其分析记录严格一致，且模板保持 DRAFT", () => {
    for (const { componentId, contract, analysis } of BATCH_2E2) {
      const id = componentId as string;
      expect(contract.componentId).toBe(id);
      expect(analysis.componentId).toBe(id);
      expect(contract.lifecycle).toBe("DRAFT");
      expect(contract.publishedAt).toBeNull();
      expect(contract.publishedBy).toBeNull();
    }
  });
});

describe("批次 2E2：合同结构与安全校验", () => {
  for (const { componentId, contract, analysis } of BATCH_2E2) {
    const id = componentId as string;

    it(`${id} 合同结构通过 validateComponentContract 强校验`, () => {
      const validated = validateComponentContract(contract);
      expect(validated.componentId).toBe(id);
    });

    it(`${id} 输出类型落在支持白名单内（DOCUMENT/TABLE/JSON，差异化选型）`, () => {
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
      if (id === "C24") {
        expect(sc?.schemaDefinition && typeof sc.schemaDefinition === "object").toBe(true);
        const props = (sc!.schemaDefinition as Record<string, unknown>).properties as Record<string, unknown>;
        for (const f of ["title", "tooltip", "legend", "xAxis", "yAxis", "series"]) {
          expect(f in props, `${id} schemaDefinition 必须定义 ECharts 顶层字段 ${f}`).toBe(true);
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
      if (id !== "C24") {
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

describe("批次 2E2：六份合同两两不同（禁止复制改 ID）", () => {
  it("提示词模板互不相同且均非空", () => {
    const prompts = BATCH_2E2.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    expect(new Set(prompts).size).toBe(6);
    for (const p of prompts) expect(p.length > 100).toBe(true);
  });

  it("输出结构签名互不相同（含差异化 JSON 选型，且 C21/C22 以提示词差异区分）", () => {
    const signatures = BATCH_2E2.map((b) =>
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

  it("输入形态互不相同且贴合目录真实 inputMode（C20=FILE, C24=both, 其余=TEXT）", () => {
    const kinds = BATCH_2E2.map((b) => b.contract.input.kind);
    expect(new Set(kinds).size).toBe(3);
    const byId = Object.fromEntries(BATCH_2E2.map((b) => [b.componentId, b.contract.input.kind]));
    expect(byId.C20).toBe("FILE");
    expect(byId.C24).toBe("TEXT_AND_FILES");
    for (const id of ["C21", "C22", "C23", "C25"]) expect(byId[id]).toBe("TEXT");
  });
});

describe("批次 2E2：输入约束（必填 / 最短长度 / 合法通过 / 文件 MIME）", () => {
  for (const { componentId, contract } of BATCH_2E2) {
    const id = componentId as string;
    const published = asPublished(contract);

    if (id === "C20") {
      it(`${id} 文件为空时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { files: [] }), "INPUT_VALIDATION_FAILED", `${id} 空文件`);
      });
      it(`${id} 上传合法 .sql 文件即通过（MIME 白名单内）`, () => {
        expect(
          validateComponentInput(published, {
            files: [{ name: "src.sql", mimeType: "application/sql", sizeBytes: 120 }],
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
      it(`${id} FILE 模式超过 maxCount=1 必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () =>
            validateComponentInput(published, {
              files: [
                { name: "a.sql", mimeType: "application/sql", sizeBytes: 100 },
                { name: "b.sql", mimeType: "application/sql", sizeBytes: 100 },
              ],
            }),
          "INPUT_VALIDATION_FAILED",
          `${id} 文件超量`,
        );
      });
    } else if (id === "C24") {
      it(`${id} 文本为空且未上传文件时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 文本文件皆空`);
      });
      it(`${id} 仅粘贴数据结构文本即通过（TEXT_AND_FILES 任一非空）`, () => {
        expect(validateComponentInput(published, { text: "销售排行：A 120, B 90, C 60" })).toBeTruthy();
      });
      it(`${id} 仅上传 .json 文件即通过（MIME 白名单内）`, () => {
        expect(
          validateComponentInput(published, {
            files: [{ name: "data.json", mimeType: "application/json", sizeBytes: 120 }],
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
                { name: "a.json", mimeType: "application/json", sizeBytes: 100 },
                { name: "b.json", mimeType: "application/json", sizeBytes: 100 },
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
            text: "请基于用户与订单的关系，设计支持关键词搜索与分页的数据列表页，并给出 TypeScript 类型定义。",
          }),
        ).toBeTruthy();
      });
    }
  }
});

describe("批次 2E2：输出结构校验（DOCUMENT 章节 / JSON 合法结构）", () => {
  const docValidMap: Record<string, string> = {
    C20:
      "# 跨数据库 DDL 平移方案\n\n- 源库识别：源库为 MySQL 8.0，含 orders 表；\n".repeat(8) +
      "- 映射：源表 orders → 目标库表 orders；源字段 id(INT) → 目标字段 id(BIGINT)。\n".repeat(10),
    C21:
      "# React 组件方案\n\n- 组件：以下为 React + TypeScript 代码块，含 Props 与状态管理；\n".repeat(15),
    C22:
      "# Vue3 组件方案\n\n- 组件：以下为 Vue 3 单文件组件，含 <script setup> 与 Props/Emits；\n".repeat(15),
    C23:
      "# 响应式排版方案\n\n- CSS 代码：媒体查询覆盖三档断点；\n".repeat(10) +
      "- 断点：≥1200px 三栏、768-1199px 两栏、<768px 单栏。\n".repeat(10),
    C25:
      "# 数据监控大屏方案\n\n- HTML+ECharts 单文件大屏代码：含边框特效与自适应布局；\n".repeat(15) +
      "- 轮询：setInterval 每 5 秒 fetch 接口更新图表与指标，失败降级重连。\n".repeat(10),
  };

  for (const { componentId, contract } of BATCH_2E2) {
    const id = componentId as string;
    const kind = contract.output.kind;

    if (kind === "DOCUMENT") {
      it(`${id} DOCUMENT 空输出必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "   "), "MODEL_OUTPUT_INVALID", `${id} 空文档`);
      });
      it(`${id} DOCUMENT 满足必填章节与最小长度的合法输出通过`, () => {
        const out = validateModelOutput(contract, docValidMap[id] || docValidMap.C20);
        expect(out.kind).toBe("DOCUMENT");
      });
      it(`${id} DOCUMENT 缺失必填章节必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const dummy = "# 通用设计文档\n\n" + "这是一个没有任何必填业务关键词的长篇描述内容。".repeat(25);
        expectCode(() => validateModelOutput(contract, dummy), "OUTPUT_VALIDATION_FAILED", `${id} 缺失必填章节`);
      });
    } else if (kind === "JSON") {
      it(`${id} JSON 合法 ECharts option 通过结构校验`, () => {
        const echarts = JSON.stringify({
          title: { text: "销售排行TOP3" },
          tooltip: { trigger: "axis" },
          legend: { data: ["销量", "环比"] },
          xAxis: { type: "category", data: ["华东", "华南", "华北", "西南", "东北"] },
          yAxis: { type: "value" },
          series: [
            { name: "销量", type: "bar", data: [120, 90, 60, 45, 30] },
            { name: "环比", type: "line", data: [12, 8, -3, 5, 2] },
          ],
        });
        const out = validateModelOutput(contract, echarts);
        expect(out.kind).toBe("JSON");
      });
      it(`${id} JSON 非合法结构必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "这不是 JSON"), "MODEL_OUTPUT_INVALID", `${id} 非法 JSON`);
      });
    }
  }
});

describe("批次 2E2：能力门禁裁决", () => {
  it("真实部署能力下六组件均满足能力（C24 额外需要 STRUCTURED_OUTPUT）", () => {
    for (const { componentId, contract } of BATCH_2E2) {
      const elig = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
      expect(elig.missingCapabilities).toEqual([]);
      expect(elig.eligible).toBe(true);
    }
  });

  it("空部署能力下六组件均缺 TEXT_GENERATION（C24 另缺 STRUCTURED_OUTPUT，不得发布）", () => {
    for (const { componentId, contract } of BATCH_2E2) {
      const elig = evaluateActivationEligibility(contract, []);
      const expected =
        componentId === "C24" ? ["TEXT_GENERATION", "STRUCTURED_OUTPUT"] : ["TEXT_GENERATION"];
      expect(elig.missingCapabilities).toEqual(expected);
      expect(elig.eligible).toBe(false);
    }
  });

  it("C24 在缺少 STRUCTURED_OUTPUT 时不得发布（差异化能力要求）", () => {
    const c24 = BATCH_2E2.find((b) => b.componentId === "C24")!.contract;
    const elig = evaluateActivationEligibility(c24, ["TEXT_GENERATION"]);
    expect(elig.missingCapabilities).toEqual(["STRUCTURED_OUTPUT"]);
    expect(elig.eligible).toBe(false);
  });
});
