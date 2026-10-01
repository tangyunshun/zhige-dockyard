/**
 * 批次 2C（C12/C13/C14/C15）合同纯函数与门禁测试
 *
 * 覆盖范围（不依赖真实外部模型，可离线确定性运行）：
 *  - 批次范围与冻结保护：仅 C12-C15，绝不触碰 C07 / 暂停中的 C09，也不覆盖 2B 的 C06/C08/C10/C11；
 *  - 合同结构校验：合同结构合法、输出类型仅 DOCUMENT/TABLE/JSON、无模型绑定/可执行代码/密钥字段；
 *  - 输入约束：文本必填、最短长度、合法输入通过；
 *  - 输出结构与非空规则：DOCUMENT 空输出 / TABLE 非 JSON / TABLE 缺必填字段，分别落到确定的失败码；
 *  - 能力门禁：真实部署能力、空能力、缺 STRUCTURED_OUTPUT 三种情形下的发布资格裁决；
 *  - 不支持输出类型门禁：SCORE/TIMELINE/FILE/DOCUMENT_PACKAGE 明确拒绝（OUTPUT_KIND_NOT_SUPPORTED）。
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
  BATCH_2C,
  BATCH_2C_ANALYSIS,
  BATCH_2C_COMPONENT_IDS,
  BATCH_2C_FORBIDDEN_IDS,
  SUPPORTED_OUTPUT_KINDS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c12-c15";
import { deriveQualityHints, deriveCatalogComponentReadiness } from "@/lib/component-readiness-view";
import { extractTaskExecutionMeta } from "@/lib/task-execution-meta";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 数据库实测的平台默认部署能力（只读核验所得，非编造） */
const REAL_CAPABILITIES = ["TEXT_GENERATION", "STRUCTURED_OUTPUT"];
/** 冻结的批次 2B 组件（不得被本批次覆盖，必须保持「待人工验收」） */
const FROZEN_2B_IDS = ["C06", "C08", "C10", "C11"] as const;
/** 本批次明确禁止触碰的组件 */
const FORBIDDEN_IDS = ["C07", "C09"] as const;

/** 目录记录的估算 Token（prisma/component-catalog-data.ts 真实值） */
const CATALOG_ESTIMATED_TOKENS: Record<string, number> = {
  C12: 120,
  C13: 150,
  C14: 200,
  C15: 100,
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
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ComponentContractError, `${label}：应抛出 ComponentContractError`);
    assert.equal((err as { code?: string }).code, code, `${label}：失败码应为 ${code}`);
    return true;
  }, label);
}

describe("批次 2C：范围、冻结与越界保护", () => {
  test("目标组件精确为 C12/C13/C14/C15", () => {
    assert.deepEqual([...BATCH_2C_COMPONENT_IDS], ["C12", "C13", "C14", "C15"]);
    assert.deepEqual(
      BATCH_2C.map((b) => b.componentId as string),
      ["C12", "C13", "C14", "C15"],
    );
  });

  test("禁止触碰集合包含 C07 与暂停中的 C09，且批次内无任何禁止组件", () => {
    for (const id of FORBIDDEN_IDS) {
      assert.ok(
        (BATCH_2C_FORBIDDEN_IDS as readonly string[]).includes(id),
        `禁止集合必须包含 ${id}`,
      );
    }
    for (const { componentId } of BATCH_2C) {
      assert.ok(
        !(BATCH_2C_FORBIDDEN_IDS as readonly string[]).includes(componentId as string),
        `批次 2C 不得包含被禁止的 ${componentId}`,
      );
    }
  });

  test("批次 2C 不得覆盖冻结的 2B 组件（C06/C08/C10/C11 保持待人工验收）", () => {
    const overlapping = FROZEN_2B_IDS.filter((id) =>
      (BATCH_2C_COMPONENT_IDS as readonly string[]).includes(id),
    );
    assert.deepEqual(overlapping, [], `批次 2C 不得与冻结的 2B 组件重叠，实际重叠：${overlapping.join(",")}`);
  });

  test("每个合同的 componentId 与其分析记录严格一致", () => {
    for (const { componentId, contract, analysis } of BATCH_2C) {
      const id = componentId as string;
      assert.equal(contract.componentId, id);
      assert.equal(analysis.componentId, id);
      assert.equal(contract.lifecycle, "DRAFT", "合同模板必须保持 DRAFT，发布与否由能力裁决决定");
      assert.equal(contract.publishedAt, null);
      assert.equal(contract.publishedBy, null);
    }
  });
});

describe("批次 2C：合同结构与安全校验", () => {
  for (const { componentId, contract, analysis } of BATCH_2C) {
    const id = componentId as string;

    test(`${id} 合同结构通过 validateComponentContract 强校验`, () => {
      const validated = validateComponentContract(contract);
      assert.equal(validated.componentId, id);
    });

    test(`${id} 输出类型仅使用当前确实支持的 DOCUMENT/TABLE/JSON`, () => {
      const kind = contract.output.kind;
      assert.ok(
        SUPPORTED_OUTPUT_KINDS.includes(kind),
        `${id} 输出类型 ${kind} 不在支持白名单 ${SUPPORTED_OUTPUT_KINDS.join("/")} 内`,
      );
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

    test(`${id} 必须显式登记不支持项（无需求时为显式空数组，绝不静默补默认值）`, () => {
      assert.ok(Array.isArray(analysis.unsupportedRequirements), `${id} 必须显式声明 unsupportedRequirements`);
    });
  }

  test("C15 为 TABLE 输出时必须提供 schemaDefinition（结构化校验的唯一依据）", () => {
    const c15 = BATCH_2C.find((b) => b.componentId === "C15")!.contract;
    assert.equal(c15.output.kind, "TABLE");
    assert.ok(c15.output.structureConstraints?.schemaDefinition, "TABLE 输出必须提供 schemaDefinition");
    assert.ok(
      (c15.executionPlan.steps[0].requiredCapabilities as string[]).includes("STRUCTURED_OUTPUT"),
      "声明 TABLE 结构化输出的能力依据必须存在于执行计划中",
    );
  });
});

describe("批次 2C：四份合同两两不同（禁止复制改 ID）", () => {
  test("提示词模板互不相同且均非空", () => {
    const prompts = BATCH_2C.map((b) => b.contract.executionPlan.steps[0].promptTemplate);
    assert.equal(new Set(prompts).size, 4, "四份合同的 promptTemplate 必须两两不同");
    for (const p of prompts) {
      assert.ok(p.length > 100, "提示词不得为占位短文本");
    }
  });

  test("输出结构签名互不相同", () => {
    const signatures = BATCH_2C.map((b) =>
      [
        b.contract.output.kind,
        b.contract.output.artifactMime,
        (b.contract.output.structureConstraints?.requiredProperties ?? []).join("|"),
      ].join("#"),
    );
    assert.equal(new Set(signatures).size, 4, "四份合同的输出结构签名必须两两不同");
  });

  test("输入占位提示各自贴合真实业务语义且互不相同", () => {
    const placeholders = BATCH_2C.map((b) => b.contract.input.textConstraints?.placeholder ?? "");
    assert.equal(new Set(placeholders).size, 4);
    for (const p of placeholders) assert.ok(p.length > 10);
  });
});

describe("批次 2C：输入约束（必填 / 最短长度 / 合法通过）", () => {
  for (const { componentId, contract } of BATCH_2C) {
    const id = componentId as string;
    const published = asPublished(contract);

    test(`${id} 文本为空时必须拒绝（INPUT_VALIDATION_FAILED）`, () => {
      expectCode(() => validateComponentInput(published, { text: "   " }), "INPUT_VALIDATION_FAILED", `${id} 空文本`);
    });

    test(`${id} 文本短于最短长度时必须拒绝`, () => {
      expectCode(
        () => validateComponentInput(published, { text: "太短了" }),
        "INPUT_VALIDATION_FAILED",
        `${id} 超短文本`,
      );
    });

    test(`${id} 合法长度文本通过输入校验`, () => {
      const ok = validateComponentInput(published, { text: "用户在系统内下多个订单，订单归属于唯一商家，请设计数据关联。" });
      assert.ok(ok);
    });
  }
});

describe("批次 2C：输出结构、质量门槛与非空规则（失败码确定性）", () => {
  const c12ValidDoc =
    "# 实体清单与关系设计\n\n- 用户实体（User）：包含 id, name, role 等基础字段；\n- 订单实体（Order）：包含 id, userId, amount, status 等交易字段；\n\n```sql\nCREATE TABLE t_user (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128));\n```\n\n" +
    "说明：实体与关系全部来自用户输入描述，未声明项显式标注待确认。".repeat(12);

  const c13ValidDoc =
    "# 即时消息通道设计\n\n- 协议：包含消息帧结构与类型定义；\n- 重连机制：支持指数退避重连与断线补偿；\n- 服务端代码骨架与客户端收发逻辑完备。\n\n" +
    "说明：心跳与重连策略必须在断线后自动触发，重试参数待人工确认。".repeat(12);

  const c14ValidDoc =
    "# 高并发排队队列集成方案\n\n- 拓扑：交换机与路由绑定规范；\n- 死信队列：消费失败重试 3 次后转入死信队列（DLQ），支持人工补偿与重投；\n- 生产者与消费者骨架代码完整。\n\n" +
    "说明：死信处理与幂等消费机制确保消息不丢失不重复。".repeat(15);

  const validDocMap: Record<string, string> = {
    C12: c12ValidDoc,
    C13: c13ValidDoc,
    C14: c14ValidDoc,
  };

  for (const { componentId, contract } of BATCH_2C) {
    const id = componentId as string;
    const kind = contract.output.kind;

    if (kind === "DOCUMENT") {
      test(`${id} DOCUMENT 空输出必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "   "), "MODEL_OUTPUT_INVALID", `${id} 空文档`);
      });

      test(`${id} DOCUMENT 满足必填章节与最小长度的合法输出通过`, () => {
        const docText = validDocMap[id] || c12ValidDoc;
        const out = validateModelOutput(contract, docText);
        assert.equal(out.kind, "DOCUMENT");
        assert.equal(typeof out.content, "string");
        assert.ok(typeof out.content === "string" && out.content.length >= (contract.qualityPolicy.minOutputLength ?? 0));
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
        expectCode(
          () => validateModelOutput(contract, tooShort),
          "OUTPUT_VALIDATION_FAILED",
          `${id} 长度过短`,
        );
      });
    }

    if (kind === "TABLE") {
      const validC15 = JSON.stringify(
        {
          schema: [
            { field: "cacheKey", type: "string", description: "缓存键命名规范（含业务前缀与参数占位）" },
            { field: "ttlSeconds", type: "number", description: "缓存过期秒数（正整数，必须 >= 1）" },
            { field: "invalidation", type: "string", description: "主动失效与更新机制" },
            { field: "purpose", type: "string", description: "业务提速目的" },
            { field: "riskNote", type: "string", description: "数据倾斜/冷启动等风险备注" },
          ],
          rows: [
            {
              cacheKey: "product:detail:{id}",
              ttlSeconds: 300,
              invalidation: "更新即删，采用 Cache-Aside 旁路更新策略",
              purpose: "缓存高频访问的商品详情数据以降低数据库查询压力",
              riskNote: "热点 key 需配置本地二级缓存以防击穿",
            },
          ],
          antiPenetration: "空值缓存 + 互斥重建分布式锁 + 过期时间随机打散防雪崩",
          summary: "缓存设计方案：预期命中率提升至 95% 以上，口径需人工压测验证；一致性容忍度待业务方确认。",
        },
        null,
        2,
      );

      test(`${id} TABLE 合法 JSON 输出通过`, () => {
        const out = validateModelOutput(contract, validC15);
        assert.equal(out.kind, "TABLE");
        assert.ok(typeof out.content === "object" && out.content !== null);
      });

      test(`${id} TABLE 非 JSON 输出必须拒绝（MODEL_OUTPUT_INVALID）`, () => {
        expectCode(() => validateModelOutput(contract, "这不是JSON"), "MODEL_OUTPUT_INVALID", `${id} 非 JSON`);
      });

      test(`${id} TABLE 缺少必填根字段必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        expectCode(
          () => validateModelOutput(contract, JSON.stringify({ rows: [] })),
          "OUTPUT_VALIDATION_FAILED",
          `${id} 缺必填字段`,
        );
      });

      test(`${id} TABLE 缺失必填章节必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const noCacheKeyword = JSON.stringify({
          schema: [{ field: "key", type: "string", description: "desc" }],
          rows: [{ key: "k", ttlSeconds: 100, invalidation: "inv", purpose: "pur", riskNote: "rn" }],
          antiPenetration: "击穿防护与随机过期打散",
          summary: "通用数据加速方案小结，字数需要足够长达到三百字符以上以满足最小长度要求。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, noCacheKeyword),
          "OUTPUT_VALIDATION_FAILED",
          `${id} 缺必填章节`,
        );
      });

      test(`${id} TABLE 长度低于基线要求必须拒绝（OUTPUT_VALIDATION_FAILED）`, () => {
        const tooShortTable = JSON.stringify({
          schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
          rows: [{ cacheKey: "k", ttlSeconds: 60, invalidation: "i", purpose: "p", riskNote: "r" }],
          antiPenetration: "缓存防穿透",
          summary: "缓存短小结",
        });
        expectCode(
          () => validateModelOutput(contract, tooShortTable),
          "OUTPUT_VALIDATION_FAILED",
          `${id} 长度过短`,
        );
      });

      // C15 专属 items 约束测试（缺字段、类型错误、非法 ttl）
      test("C15 schema/items 缺少必填属性必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const missingSchemaField = JSON.stringify({
          schema: [{ field: "cacheKey" /* 缺 type 与 description */ }],
          rows: [{ cacheKey: "k", ttlSeconds: 60, invalidation: "i", purpose: "p", riskNote: "r" }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, missingSchemaField),
          "OUTPUT_VALIDATION_FAILED",
          "schema items 缺字段",
        );
      });

      test("C15 rows/items 缺少必填属性必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const missingRowField = JSON.stringify({
          schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
          rows: [{ cacheKey: "k" /* 缺 ttlSeconds, invalidation, purpose, riskNote */ }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, missingRowField),
          "OUTPUT_VALIDATION_FAILED",
          "rows items 缺字段",
        );
      });

      // C15 专属 items 约束测试（缺字段、类型错误、非法 ttl、安全整数校验）
      test("C15 schema/items 缺少必填属性必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const missingSchemaField = JSON.stringify({
          schema: [{ field: "cacheKey" /* 缺 type 与 description */ }],
          rows: [{ cacheKey: "k", ttlSeconds: 60, invalidation: "i", purpose: "p", riskNote: "r" }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, missingSchemaField),
          "OUTPUT_VALIDATION_FAILED",
          "schema items 缺字段",
        );
      });

      test("C15 rows/items 缺少必填属性（如缺失 ttlSeconds）必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const missingTtlField = JSON.stringify({
          schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
          rows: [{ cacheKey: "k", invalidation: "i", purpose: "p", riskNote: "r" /* 缺失 ttlSeconds */ }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, missingTtlField),
          "OUTPUT_VALIDATION_FAILED",
          "rows items 缺失 ttlSeconds",
        );
      });

      test("C15 rows/items ttlSeconds=1 安全整数边界值通过校验", () => {
        const boundaryTtl1 = JSON.stringify({
          schema: [
            { field: "cacheKey", type: "string", description: "缓存键" },
            { field: "ttlSeconds", type: "integer", description: "过期秒数" },
            { field: "invalidation", type: "string", description: "失效机制" },
            { field: "purpose", type: "string", description: "目的" },
            { field: "riskNote", type: "string", description: "备注" },
          ],
          rows: [{ cacheKey: "test:cache:1", ttlSeconds: 1, invalidation: "主动淘汰", purpose: "测试", riskNote: "无" }],
          antiPenetration: "防穿透、防击穿、防雪崩完整设计方案说明".repeat(5),
          summary: "缓存提速详细总结，满足基线长度要求的三百字符以上内容。".repeat(6),
        });
        const out = validateModelOutput(contract, boundaryTtl1);
        assert.equal(out.kind, "TABLE");
        const parsed = out.content as any;
        assert.equal(parsed.rows[0].ttlSeconds, 1);
      });

      test("C15 rows/items ttlSeconds=1.5 浮点数非安全整数必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const floatTtl = JSON.stringify({
          schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
          rows: [{ cacheKey: "k", ttlSeconds: 1.5, invalidation: "i", purpose: "p", riskNote: "r" }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, floatTtl),
          "OUTPUT_VALIDATION_FAILED",
          "ttlSeconds=1.5 浮点数非安全整数",
        );
      });

      test("C15 rows/items ttlSeconds=0 低于最小值 minimum:1 必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        const zeroTtl = JSON.stringify({
          schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
          rows: [{ cacheKey: "k", ttlSeconds: 0, invalidation: "i", purpose: "p", riskNote: "r" }],
          antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
          summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
        });
        expectCode(
          () => validateModelOutput(contract, zeroTtl),
          "OUTPUT_VALIDATION_FAILED",
          "ttlSeconds=0 低于最小值",
        );
      });

      test("C15 rows/items ttlSeconds 负数（-1, -10）必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        for (const badTtl of [-1, -10]) {
          const negativeTtl = JSON.stringify({
            schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
            rows: [{ cacheKey: "k", ttlSeconds: badTtl, invalidation: "i", purpose: "p", riskNote: "r" }],
            antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
            summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
          });
          expectCode(
            () => validateModelOutput(contract, negativeTtl),
            "OUTPUT_VALIDATION_FAILED",
            `负数 ttlSeconds=${badTtl}`,
          );
        }
      });

      test("C15 rows/items ttlSeconds 字符串类型（'300', '1'）必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
        for (const strTtl of ["300", "1"]) {
          const stringTtl = JSON.stringify({
            schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
            rows: [{ cacheKey: "k", ttlSeconds: strTtl, invalidation: "i", purpose: "p", riskNote: "r" }],
            antiPenetration: "缓存防穿透与防雪崩机制说明".repeat(5),
            summary: "缓存方案小结，字数需要足够长达到三百字符以上。".repeat(6),
          });
          expectCode(
            () => validateModelOutput(contract, stringTtl),
            "OUTPUT_VALIDATION_FAILED",
            `字符串 ttlSeconds="${strTtl}"`,
          );
        }
      });
    }
  }
});

describe("批次 2C：能力门禁（部署能力裁决）", () => {
  test("具备 TEXT_GENERATION + STRUCTURED_OUTPUT 时四份合同均可发布", () => {
    for (const { componentId, contract } of BATCH_2C) {
      const res = evaluateActivationEligibility(contract, REAL_CAPABILITIES);
      assert.equal(res.eligible, true, `${componentId} 在真实能力下应可发布`);
      assert.deepEqual(res.missingCapabilities, []);
    }
  });

  test("部署能力为空时四份合同一律不得发布（绝不强行 PUBLISH）", () => {
    for (const { componentId, contract } of BATCH_2C) {
      const res = evaluateActivationEligibility(contract, []);
      assert.equal(res.eligible, false, `${componentId} 在无能力凭据时不得发布`);
      assert.ok(res.missingCapabilities.length > 0);
    }
  });

  test("缺少 STRUCTURED_OUTPUT 时 C15 被阻断，而纯文本类组件仍具备资格", () => {
    const partial = ["TEXT_GENERATION"];
    const c15 = evaluateActivationEligibility(
      BATCH_2C.find((b) => b.componentId === "C15")!.contract,
      partial,
    );
    assert.equal(c15.eligible, false);
    assert.ok(c15.missingCapabilities.includes("STRUCTURED_OUTPUT"));

    for (const id of ["C12", "C13", "C14"]) {
      const res = evaluateActivationEligibility(BATCH_2C.find((b) => b.componentId === id)!.contract, partial);
      assert.equal(res.eligible, true, `${id} 仅依赖 TEXT_GENERATION，不应被阻断`);
    }
  });

  test("需证据能力守卫：四份合同均不得声明 VISION/FILE_ANALYSIS/LONG_CONTEXT", () => {
    for (const { componentId, contract } of BATCH_2C) {
      const caps = contract.executionPlan.steps.flatMap((s) => s.requiredCapabilities as string[]);
      for (const banned of ["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"]) {
        assert.ok(!caps.includes(banned), `${componentId} 无证据不得声明 ${banned}`);
      }
    }
  });
});

describe("批次 2C：不支持输出类型门禁（禁止伪支持，如实声明纯函数覆盖边界）", () => {
  test("SCORE/TIMELINE/FILE/DOCUMENT_PACKAGE 一律由纯函数明确拒绝（抛出 OUTPUT_KIND_NOT_SUPPORTED，纯函数层未覆盖路由/退款流水）", () => {
    const base = BATCH_2C.find((b) => b.componentId === "C15")!.contract;
    for (const kind of ["SCORE", "TIMELINE", "FILE", "DOCUMENT_PACKAGE"] as const) {
      const contract = {
        ...base,
        output: { ...base.output, kind },
      } as ComponentContract;
      expectCode(
        () => validateModelOutput(contract, JSON.stringify({ any: 1 })),
        "OUTPUT_KIND_NOT_SUPPORTED",
        `输出类型 ${kind}`,
      );
    }
  });

  test("C12 将「关联拓扑图」登记为不支持项，业务阻断状态为 BLOCKED，未发布伪支持合同", () => {
    const notes = BATCH_2C_ANALYSIS.C12.unsupportedRequirements.join(" ");
    assert.match(notes, /拓扑图/);
    assert.equal(BATCH_2C_ANALYSIS.C12.outputKind, "DOCUMENT");
    assert.equal(BATCH_2C_ANALYSIS.C12.activationStatus, "BLOCKED", "存在未支持项时 activationStatus 必须为 BLOCKED");
  });
});

describe("批次 2C：合同元数据驱动的代码产物质量提示（严禁组件 ID 特判）", () => {
  test("C12-C14 代码产物由元数据派生提示：明确代码未经目标工程编译/运行", () => {
    for (const id of ["C12", "C13", "C14"]) {
      const contract = BATCH_2C.find((b) => b.componentId === id)!.contract;
      const hints = deriveQualityHints(contract);
      assert.ok(
        hints.some((h) => h.includes("生成代码未经目标工程编译/运行验证")),
        `${id} 必须派生出「生成代码未经目标工程编译/运行验证」的质量提示`,
      );
    }
  });

  test("普通非代码文档合同不派生代码提示（证明非按 ID 特判）", () => {
    const nonCodeContract: ComponentContract = {
      ...BATCH_2C.find((b) => b.componentId === "C12")!.contract,
      componentId: "C12_MOCK_NON_CODE",
      executionPlan: {
        steps: [
          {
            stepId: "step-text-only",
            name: "纯文本背景分析",
            promptTemplateVersion: "1.0.0",
            promptTemplate: "请仅根据输入生成纯文本分析总结，严禁产出任何脚本。",
            inputMapping: {},
            outputKey: "text_summary",
            contextBudgetTokens: 1000,
            maxOutputTokens: 500,
            timeoutMs: 10000,
            requiredCapabilities: ["TEXT_GENERATION"],
          },
        ],
      },
      output: {
        kind: "DOCUMENT",
        artifactMime: "text/markdown",
        schemaVersion: "1.0",
        rendererType: "MARKDOWN_DOCUMENT",
        previewable: true,
        downloadable: true,
        structureConstraints: {
          requiredProperties: ["background", "summary"],
        },
      },
    };
    const hints = deriveQualityHints(nonCodeContract);
    assert.ok(
      !hints.some((h) => h.includes("代码")),
      "非代码合同不得误触发代码质量提示",
    );
  });
});

describe("批次 2C：Integer 双路径校验与 MAX_SAFE_INTEGER 门禁", () => {
  test("路径 1（合同结构校验）：接受 type: 'integer'，拒绝非法类型（如 'float'）", () => {
    const validContract = BATCH_2C.find((b) => b.componentId === "C15")!.contract;
    assert.doesNotThrow(() => {
      validateComponentContract(validContract);
    }, "C15 声明 type: 'integer' 在合同结构校验中必须合法接受");

    const invalidTypeContract: ComponentContract = JSON.parse(JSON.stringify(validContract));
    // 将 ttlSeconds 改为不支持的类型
    (invalidTypeContract.output.structureConstraints!.schemaDefinition as any).properties.rows.items.properties.ttlSeconds.type = "float";

    assert.throws(
      () => validateComponentContract(invalidTypeContract),
      (err: any) => {
        assert.equal(err.code, "SCHEMA_TYPE_UNSUPPORTED");
        assert.ok(err.message.includes("声明了不支持的数据类型: \"float\""));
        return true;
      },
      "结构校验必须拒绝不支持的 schema 类型 'float'",
    );
  });

  test("路径 2（模型输出校验）：必须拒绝超出 Number.MAX_SAFE_INTEGER 的不安全大整数", () => {
    const c15Contract = BATCH_2C.find((b) => b.componentId === "C15")!.contract;
    const validSchema = [
      { field: "cacheKey", type: "string", description: "缓存键规范" },
      { field: "ttlSeconds", type: "integer", description: "过期秒数" },
      { field: "invalidation", type: "string", description: "主动失效" },
      { field: "purpose", type: "string", description: "提速目的" },
      { field: "riskNote", type: "string", description: "风险备注" },
    ];
    const baseRow = {
      cacheKey: "user:session:{userId}",
      ttlSeconds: 86400,
      invalidation: "用户主动退出时调用 DEL",
      purpose: "加速会话鉴权",
      riskNote: "需配置内存淘汰兜底",
    };

    // 1. 合法安全整数 (如 86400)
    assert.doesNotThrow(() => {
      validateModelOutput(
        c15Contract,
        JSON.stringify({
          schema: validSchema,
          rows: [baseRow],
          antiPenetration: "布隆过滤器与随机过期防雪崩机制",
          summary: "缓存方案小结，字数需要足够长达到三百字符以上以满足最小长度要求，确保缓存性能测试。".repeat(4),
        }),
      );
    });

    // 2. 超出 Number.MAX_SAFE_INTEGER 的数值（如 9007199254740992 即 2^53）
    const overflowRow = { ...baseRow, ttlSeconds: 9007199254740992 };
    assert.throws(
      () => {
        validateModelOutput(
          c15Contract,
          JSON.stringify({
            schema: validSchema,
            rows: [overflowRow],
            antiPenetration: "布隆过滤器与随机过期防雪崩机制",
            summary: "缓存方案小结，字数需要足够长达到三百字符以上以满足最小长度要求，确保缓存性能测试。".repeat(4),
          }),
        );
      },
      (err: any) => {
        assert.equal(err.code, "OUTPUT_VALIDATION_FAILED");
        assert.ok(err.message.includes("期望安全整数 integer"));
        return true;
      },
      "必须拒绝超界的大数 9007199254740992 (MAX_SAFE_INTEGER + 1)",
    );

    // 3. 极大浮点科学计数法 (如 1e20)
    const sciRow = { ...baseRow, ttlSeconds: 1e20 };
    assert.throws(
      () => {
        validateModelOutput(
          c15Contract,
          JSON.stringify({
            schema: validSchema,
            rows: [sciRow],
            antiPenetration: "布隆过滤器与随机过期防雪崩机制",
            summary: "缓存方案小结，字数需要足够长达到三百字符以上以满足最小长度要求，确保缓存性能测试。".repeat(4),
          }),
        );
      },
      (err: any) => {
        assert.equal(err.code, "OUTPUT_VALIDATION_FAILED");
        assert.ok(err.message.includes("期望安全整数 integer"));
        return true;
      },
      "必须拒绝超大数 1e20",
    );
  });
});

describe("批次 2C：目录通用就绪状态、阻断原因与质量提示（API 序列化契约）", () => {
  const c12Candidate = BATCH_2C.find((b) => b.componentId === "C12")!;
  const c13Candidate = BATCH_2C.find((b) => b.componentId === "C13")!;
  const c14Candidate = BATCH_2C.find((b) => b.componentId === "C14")!;
  const c15Candidate = BATCH_2C.find((b) => b.componentId === "C15")!;

  test("C12 准确输出 BLOCKED 且阻断原因来自受控元数据登记（非组件 ID 硬编码）", () => {
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: null,
      activeContract: null,
      candidateMeta: { contract: c12Candidate.contract, analysis: c12Candidate.analysis },
    });

    assert.equal(res.readinessStatus, "BLOCKED");
    assert.equal(res.contractReady, false, "未发布候选绝不得标记为可执行");
    assert.equal(res.hasPublishedContract, false);
    assert.equal(res.isCandidateEligible, false);
    assert.ok(
      res.blockingReasons.some((r) => r.includes("关联拓扑图（图形化 ER 图）")),
      "阻断信息必须来自受控元数据的 unsupportedRequirements",
    );
  });

  test("C13/C14 满足候选能力 (ELIGIBLE) 但未发布时，显示为 UNCONFIGURED 且不可执行", () => {
    for (const c of [c13Candidate, c14Candidate]) {
      const res = deriveCatalogComponentReadiness({
        activeContractLifecycle: null,
        activeContract: null,
        candidateMeta: { contract: c.contract, analysis: c.analysis },
      });

      assert.equal(res.readinessStatus, "UNCONFIGURED", "未发布候选绝不能显示为 EXECUTABLE");
      assert.equal(res.contractReady, false, "contractReady 必须为 false");
      assert.equal(res.hasPublishedContract, false);
      assert.equal(res.isCandidateEligible, true, "标记候选能力满足但尚未发布");
      assert.deepEqual(res.blockingReasons, []);
      assert.ok(
        res.qualityHints.some((h) => h.includes("生成代码未经目标工程编译/运行验证")),
        "必须派生出代码骨架未编译验证的质量提示",
      );
    }
  });

  test("C15 派生未压测限制与结构化 schema 校验限制，且未发布时不可执行", () => {
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: null,
      activeContract: null,
      candidateMeta: { contract: c15Candidate.contract, analysis: c15Candidate.analysis },
    });

    assert.equal(res.readinessStatus, "UNCONFIGURED");
    assert.equal(res.contractReady, false);
    assert.equal(res.isCandidateEligible, true);
    assert.ok(
      res.qualityHints.some((h) => h.includes("性能、命中率与容量未经实际压测，不构成性能保证")),
      "C15 必须派生出性能未压测的质量提示",
    );
    assert.ok(
      res.qualityHints.some((h) => h.includes("服务端 schema 校验")),
      "C15 必须派生出 schema 校验提示",
    );
  });

  test("无合同、无候选组件不等于已就绪（严格保持 UNCONFIGURED）", () => {
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: null,
      activeContract: null,
      candidateMeta: null,
    });

    assert.equal(res.readinessStatus, "UNCONFIGURED");
    assert.equal(res.contractReady, false);
    assert.equal(res.hasPublishedContract, false);
    assert.equal(res.isCandidateEligible, false);
    assert.deepEqual(res.blockingReasons, []);
    assert.deepEqual(res.qualityHints, []);
  });

  test("数据库中已发布 PUBLISHED 合同的组件正常输出 EXECUTABLE，且质量提示来自自身合同", () => {
    const activeContract = BATCH_2C.find((b) => b.componentId === "C13")!.contract;
    const res = deriveCatalogComponentReadiness({
      activeContractLifecycle: "PUBLISHED",
      activeContract,
      missingCapabilities: [],
      candidateMeta: null,
    });

    assert.equal(res.readinessStatus, "EXECUTABLE");
    assert.equal(res.contractReady, true);
    assert.equal(res.hasPublishedContract, true);
    assert.equal(res.isCandidateEligible, false);
    assert.deepEqual(res.blockingReasons, []);
    assert.ok(res.qualityHints.some((h) => h.includes("生成代码未经目标工程编译/运行验证")));
  });
});

describe("批次 2C：历史任务合同版本与快照提示绑定（避免最新目录提示替代历史任务）", () => {
  test("持有历史不可变快照的任务，提示严格由该快照派生", () => {
    const historicalContract = BATCH_2C.find((b) => b.componentId === "C15")!.contract;
    const meta = extractTaskExecutionMeta(
      {
        executionMode: "REAL_MODEL",
        contractVersion: "1.0.0",
        contractSnapshot: historicalContract,
      },
      {},
    );

    assert.equal(meta.hasContractSnapshot, true);
    assert.ok(
      meta.qualityHints.some((h) => h.includes("性能、命中率与容量未经实际压测")),
      "持有快照的历史任务必须从该快照派生提示",
    );
  });

  test("无快照的旧历史任务（legacy）qualityHints 保持为空，不拿最新目录提示回填", () => {
    const meta = extractTaskExecutionMeta(
      {
        executionMode: "REAL_MODEL",
        contractVersion: "0.9.0",
      },
      {},
      "2026-09-18T00:00:00.000Z", // 早于 EXEC_META_CUTOFF_ISO 的旧任务
    );

    assert.equal(meta.hasContractSnapshot, false);
    assert.deepEqual(meta.qualityHints, [], "无快照历史任务提示明确为空，不污染历史呈现");
  });
});

