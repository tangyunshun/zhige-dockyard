/**
 * 批次 2E（C16/C17/C18/C19）合同纯函数与门禁测试
 *
 * 覆盖范围（不依赖真实外部模型，可离线确定性运行）：
 *  - 批次范围与冻结保护：仅 C16-C19，绝不触碰 C07 / 暂停中的 C09，也不覆盖 2B 的 C06/C08/C10/C11，且不重复 2C 的 C12-C15；
 *  - 合同结构校验：合同结构合法、输出类型仅 DOCUMENT、无模型绑定/可执行代码/密钥字段；
 *  - 输入约束：C16/C17/C18 纯文本必填；C19 文本+文件任一非空即可（TEXT_AND_FILES）；
 *  - 输出结构与非空规则：DOCUMENT 空输出 / 缺失必填章节 / 长度不足，分别落到确定的失败码；
 *  - 能力门禁：真实部署能力、空能力两种情形下的发布资格裁决；
 *  - 不支持输出类型门禁：C18 的「ER 实体图」（图形化）登记为 unsupportedRequirements 阻断项，不得发布；
 *  - 两两不同：四份合同的提示词、输出结构签名、输入占位互不相同。
 *
 * 注意：本文件**不发起任何真实模型调用**，因此不构成「真实模型成功证据」，
 * 也不构成任何组件的业务验收结论（批次状态仍为「待真实验收 / 待人工验收」）。
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

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
  BATCH_2E,
  BATCH_2E_ANALYSIS,
  BATCH_2E_COMPONENT_IDS,
  BATCH_2E_FORBIDDEN_IDS,
  SUPPORTED_OUTPUT_KINDS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c16-c19";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 数据库实测的平台默认部署能力（只读核验所得，非编造） */
const REAL_CAPABILITIES = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];
/** 冻结的批次 2B 组件（不得被本批次覆盖，必须保持「待人工验收」） */
const FROZEN_2B_IDS = ["C06", "C08", "C10", "C11"] as const;
/** 批次 2C 组件（本批次不得重复覆盖） */
const BATCH_2C_IDS = ["C12", "C13", "C14", "C15"] as const;
/** 本批次明确禁止触碰的组件 */
const FORBIDDEN_IDS = ["C07", "C09"] as const;

/** 目录记录的估算 Token（prisma/component-catalog-data.ts 真实值） */
const CATALOG_ESTIMATED_TOKENS: Record<string, number> = {
  C16: 100,
  C17: 60,
  C18: 120,
  C19: 150,
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
  assert.throws(
    fn,
    (err: unknown) => {
      assert.ok(err instanceof ComponentContractError, `${label}：应抛出 ComponentContractError`);
      assert.equal((err as { code?: string }).code, code, `${label}：失败码应为 ${code}`);
      return true;
    },
    label,
  );
}

describe("批次 2E：范围、冻结与越界保护", () => {
  test("目标组件精确为 C16/C17/C18/C19", () => {
    assert.deepEqual([...BATCH_2E_COMPONENT_IDS], ["C16", "C17", "C18", "C19"]);
    assert.deepEqual(
      BATCH_2E.map((b) => b.componentId as string),
      ["C16", "C17", "C18", "C19"],
    );
  });

  test("禁止触碰集合包含 C07 与暂停中的 C09，且批次内无任何禁止组件", () => {
    for (const id of FORBIDDEN_IDS) {
      assert.ok(
        (BATCH_2E_FORBIDDEN_IDS as readonly string[]).includes(id),
        `禁止集合必须包含 ${id}`,
      );
    }
    for (const { componentId } of BATCH_2E) {
      assert.ok(
        !(BATCH_2E_FORBIDDEN_IDS as readonly string[]).includes(componentId as string),
        `批次 2E 不得包含被禁止的 ${componentId}`,
      );
    }
  });

  test("批次 2E 不得覆盖冻结的 2B 组件（C06/C08/C10/C11）", () => {
    const overlapping = FROZEN_2B_IDS.filter((id) =>
      (BATCH_2E_COMPONENT_IDS as readonly string[]).includes(id),
    );
    assert.deepEqual(overlapping, [], `批次 2E 不得与冻结的 2B 组件重叠，实际重叠：${overlapping.join(",")}`);
  });

  test("批次 2E 不得重复覆盖 2C 组件（C12-C15）", () => {
    const overlapping = BATCH_2C_IDS.filter((id) =>
      (BATCH_2E_COMPONENT_IDS as readonly string[]).includes(id),
    );
    assert.deepEqual(overlapping, [], `批次 2E 不得与 2C 组件重叠，实际重叠：${overlapping.join(",")}`);
  });

  test("每个合同的 componentId 与其分析记录严格一致，且模板保持 DRAFT", () => {
    for (const { componentId, contract, analysis } of BATCH_2E) {
      const id = componentId as string;
      assert.equal(contract.componentId, id);
      assert.equal(analysis.componentId, id);
      assert.equal(contract.lifecycle, "DRAFT", "合同模板必须保持 DRAFT，发布与否由能力裁决决定");
      assert.equal(contract.publishedAt, null);
      assert.equal(contract.publishedBy, null);
    }
  });
});

describe("批次 2E：合同结构与安全校验", () => {
  for (const { componentId, contract, analysis } of BATCH_2E) {
    const id = componentId as string;

    test(`${id} 合同结构通过 validateComponentContract 强校验`, () => {
      const validated = validateComponentContract(contract);
      assert.equal(validated.componentId, id);
    });

    test(`${id} 输出类型仅使用当前确实支持的 DOCUMENT`, () => {
      const kind = contract.output.kind;
      assert.ok(
        SUPPORTED_OUTPUT_KINDS.includes(kind),
        `${id} 输出类型 ${kind} 不在支持白名单 ${SUPPORTED_OUTPUT_KINDS.join("/")} 内`,
      );
      assert.equal(kind, "DOCUMENT", `${id} 真实输出形态仅为 DOCUMENT（图形化 ER 图已登记为阻断项）`);
      assert.equal(analysis.outputKind, kind, "分析记录的输出类型必须与合同一致");
    });

    test(`${id} 合同不含模型绑定字段 / 可执行代码 / 密钥字段`, () => {
      assertNoModelBindingFields(contract);
      assertNoExecutableCode(contract);
      assertNoSecretFields(contract);
    });

    test(`${id} 输出结构约束非空，且与估算 Token 对齐目录真实值`, () => {
      const required = contract.output.structureConstraints?.requiredProperties ?? [];
      assert.ok(required.length > 0, `${id} 必须声明 requiredProperties`);
      assert.equal(
        contract.billingPolicy.estimatedTokens,
        CATALOG_ESTIMATED_TOKENS[id],
        `${id} estimatedTokens 必须与目录真实值一致`,
      );
      assert.equal(analysis.estimatedTokens, CATALOG_ESTIMATED_TOKENS[id]);
    });

    test(`${id} 质量策略必须含 requireHumanReview=true 与 disclaimerPolicy`, () => {
      assert.equal(contract.qualityPolicy.requireHumanReview, true, `${id} 安全/性能类产出必须 requireHumanReview`);
      assert.equal(contract.qualityPolicy.disclaimerPolicy?.required, true, `${id} 必须声明草案免责声明策略`);
    });

    test(`${id} 必须显式登记不支持项（无需求时为显式空数组，绝不静默补默认值）`, () => {
      assert.ok(Array.isArray(analysis.unsupportedRequirements), `${id} 必须显式声明 unsupportedRequirements`);
    });
  }

  test("C18 因「ER 实体图」图形化输出不支持而登记为阻断项（activationStatus=BLOCKED）", () => {
    const c18 = BATCH_2E_ANALYSIS.C18;
    assert.equal(c18.activationStatus, "BLOCKED", "C18 必须维持 BLOCKED");
    assert.ok(c18.unsupportedRequirements.length > 0, "C18 必须显式登记图形化阻断项");
    // 迁移脚本口径：isEligible = 能力满足 且 无 unsupportedRequirements；C18 因阻断项不得发布
    const contract = BATCH_2E.find((b) => b.componentId === "C18")!.contract;
    const elig = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
    assert.equal(elig.eligible, true, "C18 能力本身满足");
    assert.equal(elig.eligible && c18.unsupportedRequirements.length === 0, false, "C18 因阻断项不得发布");
  });

  test("C16/C17/C19 能力满足且无阻断项，可进入发布激活", () => {
    for (const id of ["C16", "C17", "C19"] as const) {
      const analysis = BATCH_2E_ANALYSIS[id];
      const contract = BATCH_2E.find((b) => b.componentId === id)!.contract;
      const elig = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
      assert.equal(elig.eligible && analysis.unsupportedRequirements.length === 0, true, `${id} 应具备发布资格`);
    }
  });
});

describe("批次 2E：四份合同两两不同（禁止复制改 ID）", () => {
  test("提示词模板互不相同且均非空", () => {
    const prompts = BATCH_2E.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    assert.equal(new Set(prompts).size, 4, "四份合同的 promptTemplate 必须两两不同");
    for (const p of prompts) assert.ok(p.length > 100, "提示词不得为占位短文本");
  });

  test("输出结构签名互不相同", () => {
    const signatures = BATCH_2E.map((b) =>
      [
        b.contract.output.kind,
        b.contract.output.artifactMime,
        (b.contract.output.structureConstraints?.requiredProperties ?? []).join("|"),
      ].join("#"),
    );
    assert.equal(new Set(signatures).size, 4, "四份合同的输出结构签名必须两两不同");
  });

  test("C19 输入为 TEXT_AND_FILES，其余为 TEXT，占位提示各自贴合业务且互不相同", () => {
    for (const { componentId, contract } of BATCH_2E) {
      const id = componentId as string;
      if (id === "C19") {
        assert.equal(contract.input.kind, "TEXT_AND_FILES", "C19 必须为 TEXT_AND_FILES");
        assert.ok(contract.input.fileConstraints, "C19 必须声明 fileConstraints");
      } else {
        assert.equal(contract.input.kind, "TEXT", `${id} 必须为 TEXT`);
      }
    }
    const placeholders = BATCH_2E.map((b) => {
      const c = b.contract;
      return c.input.kind === "TEXT_AND_FILES"
        ? c.input.textConstraints?.placeholder ?? ""
        : c.input.textConstraints?.placeholder ?? "";
    });
    assert.equal(new Set(placeholders).size, 4);
    for (const p of placeholders) assert.ok(p.length > 10);
  });
});

describe("批次 2E：输入约束（必填 / 最短长度 / 合法通过 / C19 文本+文件）", () => {
  for (const { componentId, contract } of BATCH_2E) {
    const id = componentId as string;
    const published = asPublished(contract);

    if (id !== "C19") {
      test(`${id} 纯文本为空时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 空文本`);
      });
      test(`${id} 合法长度文本通过输入校验`, () => {
        const ok = validateComponentInput(published, {
          text: "请基于用户与订单的关系，设计登录鉴权与角色权限校验方案，区分管理员与普通成员。",
        });
        assert.ok(ok);
      });
    } else {
      test(`${id} 文本为空且未上传文件时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 文本文件皆空`);
      });
      test(`${id} 仅粘贴日志文本即通过（TEXT_AND_FILES 任一非空）`, () => {
        const ok = validateComponentInput(published, {
          text: "SELECT * FROM orders WHERE user_id=? AND status=? ORDER BY created_at DESC 耗时 3.2s，EXPLAIN 显示 type=ALL。",
        });
        assert.ok(ok);
      });
      test(`${id} 仅上传 .log 文件即通过（MIME 白名单内）`, () => {
        const ok = validateComponentInput(published, {
          files: [{ name: "slow.log", mimeType: "text/plain", sizeBytes: 120 }],
        });
        assert.ok(ok);
      });
      test(`${id} 上传非白名单 MIME 必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () =>
            validateComponentInput(published, {
              files: [{ name: "x.png", mimeType: "image/png", sizeBytes: 120 }],
            }),
          "INPUT_VALIDATION_FAILED",
          `${id} 非法 MIME`,
        );
      });
      test(`${id} 文件超过数量上限必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () =>
            validateComponentInput(published, {
              files: Array.from({ length: 4 }, (_, i) => ({
                name: `s${i}.log`,
                mimeType: "text/plain",
                sizeBytes: 100,
              })),
            }),
          "INPUT_VALIDATION_FAILED",
          `${id} 文件超量`,
        );
      });
    }
  }
});

describe("批次 2E：输出结构、质量门槛与非空规则（DOCUMENT 失败码确定性）", () => {
  const validDocMap: Record<string, string> = {
    C16:
      "# 登录权限与安全卡点设计\n\n- 鉴权中间件：基于 JWT 的令牌生成与过期检查，未登录请求一律拦截；\n" +
      "- 角色权限模型：区分超级管理员与普通成员，越权请求返回 403；\n- 核心骨架代码包含令牌解析与角色判断；\n" +
      "- 安全卡点清单逐条列出必须拦截的越权场景与测试要点。\n".repeat(13),
    C17:
      "# SQL 查询与索引方案\n\n- 需求拆解：涉及 orders 与 users 两表，按金额排序取前 10；\n" +
      "- 标准 SQL 语句带注释，正确处理多表关联与分页；\n- 索引建议：在 user_id 与 status 上建联合索引避免全表扫描。\n".repeat(10),
    C18:
      "# 数据表结构与关系设计\n\n- 实体与字段清单：商品表含主键、标题、分类、库存；\n" +
      "- DDL 建表语句含主键与外键；\n- 关系说明：订单与用户为一对多，外键落于订单表指向用户。\n".repeat(10),
    C19:
      "# 慢 SQL 诊断与提速方案\n\n- 瓶颈定位：EXPLAIN type=ALL 表明全表扫描，根因为 status 字段缺索引；\n" +
      "- 索引整改：在 (user_id, status) 上建联合索引；\n- SQL 重写：缩小扫描范围、下推过滤条件；\n" +
      "- 验证与回滚：在从库验证执行计划后上线，失败回滚索引。\n".repeat(10),
  };

  for (const { componentId, contract } of BATCH_2E) {
    const id = componentId as string;
    const kind = contract.output.kind;

    if (kind === "DOCUMENT") {
      test(`${id} DOCUMENT 空输出必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "   "), "MODEL_OUTPUT_INVALID", `${id} 空文档`);
      });

      test(`${id} DOCUMENT 满足必填章节与最小长度的合法输出通过`, () => {
        const docText = validDocMap[id] || validDocMap.C16;
        const out = validateModelOutput(contract, docText);
        assert.equal(out.kind, "DOCUMENT");
        assert.equal(typeof out.content, "string");
        assert.ok(
          typeof out.content === "string" && out.content.length >= (contract.qualityPolicy.minOutputLength ?? 0),
        );
      });

      test(`${id} DOCUMENT 缺失必填章节必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const dummyWithoutKeyword = "# 系统通用设计文档\n\n" + "这是一个没有任何必填业务关键词的长篇描述内容。".repeat(25);
        expectCode(
          () => validateModelOutput(contract, dummyWithoutKeyword),
          "OUTPUT_VALIDATION_FAILED",
          `${id} 缺失必填章节`,
        );
      });

      test(`${id} DOCUMENT 长度低于基线要求必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const keyword = contract.qualityPolicy.requiredSections?.[0] ?? "系统";
        const tooShort = `# ${keyword}\n\n内容过短`;
        expectCode(() => validateModelOutput(contract, tooShort), "OUTPUT_VALIDATION_FAILED", `${id} 长度过短`);
      });
    }
  }
});

describe("批次 2E：能力门禁裁决", () => {
  test("真实部署能力下四组件均满足能力（TEXT_GENERATION）", () => {
    for (const { componentId, contract } of BATCH_2E) {
      const elig = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
      assert.deepEqual(elig.missingCapabilities, [], `${componentId} 不应缺能力`);
      assert.equal(elig.eligible, true);
    }
  });

  test("空部署能力下四组件均缺 TEXT_GENERATION（不得发布）", () => {
    for (const { componentId, contract } of BATCH_2E) {
      const elig = evaluateActivationEligibility(contract, []);
      assert.deepEqual(elig.missingCapabilities, ["TEXT_GENERATION"], `${componentId} 应缺 TEXT_GENERATION`);
      assert.equal(elig.eligible, false);
    }
  });
});
