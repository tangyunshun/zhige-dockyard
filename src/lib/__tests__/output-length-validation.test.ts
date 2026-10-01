/**
 * 共享输出长度校验测试（批次 CORE-3 R2 阶段二）：
 *  - C01/C02/C07 DOCUMENT 短输出必须拒绝（OUTPUT_VALIDATION_FAILED）；
 *  - C15 TABLE 短输出（序列化长度低于基线）必须拒绝；
 *  - 达到最小长度的合法输出通过；
 *  - 禁用词、必填章节、免责声明行为不回归。
 * 纯函数，无 DB 依赖。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateModelOutput } from "@/lib/component-contract/validators";
import { C01_CONTRACT, C02_CONTRACT } from "@/lib/component-contract/catalog-contracts-c01-c05";
import { C07_CANDIDATE_1_1_0 } from "../../../scripts/candidates-core3-1.1.0";

describe("DOCUMENT 最小长度校验", () => {
  test("C01 短输出（含必填章节但长度不足）必须拒绝", () => {
    const short = "# 招标要求\n能力匹配\n偏离\n风险";
    assert.throws(() => validateModelOutput(C01_CONTRACT, short), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C01 达到最小长度的合法输出通过", () => {
    const ok =
      "# 招标要求\n\n本次招标要求供应商提供完整的系统集成能力，并明确交付时间、验收口径与质保条款，避免后续履约时出现范围争议。\n\n" +
      "## 能力匹配\n\n我方在类似项目中具备成熟的实施经验，团队配置可覆盖全部关键路径，并已在过往交付中验证过同类接口集成。\n\n" +
      "## 偏离\n\n对部分非关键条款提出偏离说明，并提交替代方案供评审，所有偏离均标注对工期与成本的影响。\n\n" +
      "## 风险\n\n识别工期与第三方接口两类风险，给出缓释措施与责任边界，并明确风险升级后的应急联络机制。";
    const out = validateModelOutput(C01_CONTRACT, ok);
    assert.equal(out.kind, "DOCUMENT");
    assert.ok(typeof out.content === "string" && out.content.length >= (C01_CONTRACT.qualityPolicy.minOutputLength ?? 0));
  });

  test("C02 短输出（含必填章节但长度不足）必须拒绝", () => {
    const short = "# 合规结论\n问题清单\n待补充材料\n整改顺序";
    assert.throws(() => validateModelOutput(C02_CONTRACT, short), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C02 命中禁用词必须拒绝（不回归）", () => {
    const withFake =
      "# 合规结论\n\n系统满足基础安全合规框架要求。\n\n## 问题清单\n\n发现权限粒度不足。\n\n" +
      "## 待补充材料\n\n需补充数据分类分级说明。\n\n## 整改顺序\n\n先修高危项。已通过等保测评结论可作参考。";
    assert.throws(() => validateModelOutput(C02_CONTRACT, withFake), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C02 缺失必填章节必须拒绝（不回归）", () => {
    const noKeyword = "# 通用安全说明\n\n" + "这是一段没有任何必填业务关键词的长篇描述内容。".repeat(25);
    assert.throws(() => validateModelOutput(C02_CONTRACT, noKeyword), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C02 免责声明 required：缺失 marker 时由服务端补入 template（不回归）", () => {
    const ok =
      "# 合规结论\n\n系统当前满足基础安全合规框架要求，但在高危项治理与日志留存策略上仍存在改进空间，需结合业务实际补齐。\n\n" +
      "## 问题清单\n\n发现权限粒度不足、日志留存周期偏短、密钥轮换机制缺失三类问题，均已按风险等级标注。\n\n" +
      "## 待补充材料\n\n需补充数据分类分级说明与第三方渗透测试报告，并由法务确认跨境数据传输口径。\n\n" +
      "## 整改顺序\n\n建议先修复高危项再补充材料，形成闭环，并设定复检时间节点与责任归属。";
    const out = validateModelOutput(C02_CONTRACT, ok);
    assert.equal(out.kind, "DOCUMENT");
    assert.ok(
      typeof out.content === "string" &&
        out.content.includes("本结果为 AI 生成的安全合规整改建议"),
      "免责声明 template 应被补入输出",
    );
  });

  test("C07 短输出（含必填章节但长度不足）必须拒绝", () => {
    const short = "背景与目标\n用户与使用场景\n功能需求\n非功能需求\n数据与接口\n验收标准";
    assert.throws(() => validateModelOutput(C07_CANDIDATE_1_1_0, short), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C07 达到最小长度的合法输出通过", () => {
    const ok =
      "# 背景与目标\n\n本项目旨在将会议纪要与需求讨论转化为可执行的产品需求规格，明确范围、成功标准与边界条件，避免需求在传递过程中被稀释或误读。" +
      "背景部分还需说明项目立项动机、核心干系人以及本需求文档的适用范围，防止后续评审时出现范围漂移。\n\n" +
      "## 用户与使用场景\n\n主要用户为产品经理与研发负责人，典型场景为会后快速形成可评审的需求草案，并支持在评审会上直接对照讨论与修订。" +
      "还需覆盖管理员、运营等次要角色的使用诉求，说明不同角色在需求确认环节中的职责边界。\n\n" +
      "## 功能需求\n\n系统需支持章节结构化生成、关键约束提取与待确认项标注，便于后续拆分任务与排期估算，输出应可被研发直接引用。" +
      "逐条功能应给出优先级、验收口径与依赖关系，避免把非功能诉求混入功能列表。\n\n" +
      "## 非功能需求\n\n要求输出稳定可读，重要假设必须显式标注为待确认，避免被误读为已确认结论，且需保留可追溯的来源引用与版本信息。" +
      "还需说明性能、安全与可观测性等非功能约束，未给出量化指标的项统一标注待确认。\n\n" +
      "## 数据与接口\n\n需求草案应厘清外部系统依赖与接口边界，未声明项统一标注待确认，接口契约以既有接口文档为准，不得自行扩展字段。" +
      "应列出数据实体、读写频次与一致性要求，明确哪些能力由平台提供、哪些需外部系统配合。\n\n" +
      "## 验收标准\n\n以业务负责人评审通过为验收口径，技术估算需经研发负责人复核后方可纳入排期；本草案不构成研发排期、交付或上线承诺，须经业务负责人确认。" +
      "验收标准需可度量、可复核，并明确未达标的回退路径与责任归属，避免把草案误当作已立项结论。";
    const out = validateModelOutput(C07_CANDIDATE_1_1_0, ok);
    assert.equal(out.kind, "DOCUMENT");
    assert.ok(typeof out.content === "string" && out.content.length >= (C07_CANDIDATE_1_1_0.qualityPolicy.minOutputLength ?? 0));
  });
});

describe("TABLE 最小长度校验（规范化序列化长度）", () => {
  const tooShortTable = JSON.stringify({
    schema: [{ field: "cacheKey", type: "string", description: "缓存键" }],
    rows: [{ cacheKey: "k", ttlSeconds: 60, invalidation: "i", purpose: "p", riskNote: "r" }],
    antiPenetration: "缓存防穿透",
    summary: "缓存短小结",
  });

  test("C15 TABLE 长度低于基线要求必须拒绝（OUTPUT_VALIDATION_FAILED）", () => {
    assert.throws(() => validateModelOutput(C15_CONTRACT, tooShortTable), (e: Error & { code?: string }) => {
      assert.equal(e.code, "OUTPUT_VALIDATION_FAILED");
      return true;
    });
  });

  test("C15 TABLE 合法 JSON 输出通过", () => {
    const valid = JSON.stringify({
      schema: [
        { field: "cacheKey", type: "string", description: "缓存键命名规范（含业务前缀与参数占位）" },
        { field: "ttlSeconds", type: "integer", description: "缓存过期秒数（正整数，必须 >= 1）" },
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
    });
    const out = validateModelOutput(C15_CONTRACT, valid);
    assert.equal(out.kind, "TABLE");
  });
});

// 由 C15 目录合同构造最小 TABLE 合同对象
import { C15_CONTRACT } from "@/lib/component-contract/catalog-contracts-c12-c15";
