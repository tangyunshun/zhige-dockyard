/**
 * 组件进度只读审计测试
 *
 * 断言：
 *  - 统计口径全部来自数据库（与直接查询结果一致，禁止硬编码）；
 *  - 计费与商业化状态只读核验（结算关闭 / 兼容口径 / 无售价 / 无加价 / 无 BYOK）；
 *  - **不泄露密钥**：输出不得包含 apiKey / baseUrl / sk- 等敏感内容，部署条目字段严格受限；
 *  - 不得出现未具证据的 VISION / FILE_ANALYSIS / LONG_CONTEXT。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { buildComponentProgressAudit, COMPATIBILITY_BILLING_MODE } from "@/lib/component-progress-audit";

describe("组件进度只读审计（数据库驱动）", () => {
  test("1. 统计口径与数据库直接查询一致", async () => {
    const audit = await buildComponentProgressAudit({ windowDays: 7 });

    assert.equal(audit.catalog.total, await prisma.componentcatalog.count(), "组件总数必须来自数据库");
    assert.equal(
      audit.catalog.published,
      await prisma.componentcatalog.count({ where: { isPublished: true } }),
      "已发布组件数必须来自数据库",
    );

    const catalogs = await prisma.componentcatalog.findMany({ select: { id: true, activeContractId: true } });
    const withActive = catalogs.filter((c) => c.activeContractId).length;
    assert.equal(audit.catalog.withActiveContract, withActive, "有 activeContractId 的组件数必须一致");

    // 分类互斥性：有激活合同的 + 无合同的 + 仅草稿的不得超过总数
    assert.ok(
      audit.catalog.activePublished + audit.catalog.noContract + audit.catalog.draftOnly <= audit.catalog.total,
      "分类统计不得超过组件总数",
    );
    assert.equal(audit.catalog.invalidActiveRef, audit.catalog.invalidActiveRefComponents.length, "无效激活引用数必须与清单一致");

    // 可执行数必须与逐组件明细一致
    assert.equal(
      audit.capabilities.executableCount,
      audit.capabilities.components.filter((c) => c.executable).length,
      "可执行组件数必须等于明细中 executable=true 的数量",
    );
  });

  test("2. 计费与商业化状态只读核验", async () => {
    const audit = await buildComponentProgressAudit();
    assert.equal(audit.billing.settlementEnabled, false, "settlementEnabled 必须为 false");
    assert.equal(audit.billing.billingMode, COMPATIBILITY_BILLING_MODE, "billingMode 必须为 ESTIMATED_COMPATIBILITY");
    assert.equal(audit.billing.actualPoints, null, "actualPoints 必须为 null（未开启真实结算）");
    assert.equal(audit.billing.userPriceConfigured, false, "不得配置用户售价");
    assert.equal(audit.billing.markupRateBpsConfigured, false, "不得配置平台加价 markupRateBps");
    assert.equal(audit.billing.byokImplemented, false, "BYOK 未实现");
    assert.deepEqual(audit.billing.markupRateBpsValues, [], "不得存在任何加价率数值");
  });

  test("3. 不泄露密钥：输出不含 apiKey/baseUrl/sk- 等敏感信息", async () => {
    const audit = await buildComponentProgressAudit();
    const json = JSON.stringify(audit);
    assert.ok(!json.includes("apiKey"), "审计输出不得包含 apiKey 字段");
    assert.ok(!json.includes("apiKeyEnv"), "审计输出不得包含 apiKeyEnv");
    assert.ok(!json.includes("baseUrl"), "审计输出不得包含 baseUrl");
    assert.ok(!/sk-[A-Za-z0-9_-]{8,}/.test(json), "审计输出不得包含形如密钥的字符串");

    for (const d of audit.capabilities.enabledDeployments) {
      assert.deepEqual(Object.keys(d).sort(), ["capabilities", "modelId", "providerId"], "部署条目字段必须严格受限");
    }
  });

  test("4. 不得出现未具证据的 VISION / FILE_ANALYSIS / LONG_CONTEXT", async () => {
    const audit = await buildComponentProgressAudit();
    const suspicious = ["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"];
    for (const cap of suspicious) {
      assert.ok(
        !audit.capabilities.needsReviewDeploymentCapabilities.some((x) => x.capability === cap),
        `部署不得声明未具证据能力：${cap}`,
      );
      assert.ok(
        !audit.capabilities.contractsRequiringUnsupportedCapabilities.some((x) => x.capability === cap),
        `不得存在要求未覆盖能力的合同：${cap}`,
      );
    }
    // C07 / C01 / C03 覆盖关系必须成立
    for (const id of ["C07", "C01", "C03"]) {
      const row = audit.capabilities.components.find((c) => c.componentId === id);
      assert.ok(row, `审计必须包含 ${id}`);
      assert.deepEqual(row!.missingCapabilities, [], `${id} 的能力缺口必须为空`);
      assert.equal(row!.executable, true, `${id} 必须可执行`);
    }
  });

  test("5. 收口清单 14 项统计全部来自数据库（逐项口径可核对，不得写死）", async () => {
    const audit = await buildComponentProgressAudit({ windowDays: 7 });

    // 1 组件总数 / 2 已发布组件数
    assert.equal(audit.catalog.total, await prisma.componentcatalog.count());
    assert.equal(audit.catalog.published, await prisma.componentcatalog.count({ where: { isPublished: true } }));

    // 3 有激活合同数
    const catalogs = await prisma.componentcatalog.findMany({ select: { id: true, activeContractId: true } });
    assert.equal(audit.catalog.withActiveContract, catalogs.filter((c) => c.activeContractId).length);

    // 4 PUBLISHED 合同数（合同行级计数，含历史版本）
    assert.equal(
      audit.catalog.publishedContracts,
      await prisma.componentcontract.count({ where: { lifecycle: "PUBLISHED" } }),
      "PUBLISHED 合同数必须等于合同表中 lifecycle=PUBLISHED 的行数",
    );

    // 5 无合同数 / 6 DRAFT 数（仅有合同但无 PUBLISHED 版本）/ 7 activeContractId 无效数
    const allContracts = await prisma.componentcontract.findMany({ select: { id: true, componentId: true, lifecycle: true } });
    const byComp = new Map<string, string[]>();
    allContracts.forEach((c) => byComp.set(c.componentId, [...(byComp.get(c.componentId) ?? []), c.lifecycle]));
    const lifecycleById = new Map(allContracts.map((c) => [c.id, c.lifecycle]));

    assert.equal(audit.catalog.noContract, catalogs.filter((c) => !byComp.has(c.id)).length);
    assert.equal(
      audit.catalog.draftOnly,
      catalogs.filter((c) => {
        const l = byComp.get(c.id);
        return Boolean(l && l.length > 0 && !l.includes("PUBLISHED"));
      }).length,
    );
    assert.equal(audit.catalog.invalidActiveRef, audit.catalog.invalidActiveRefComponents.length);
    assert.equal(
      audit.catalog.invalidActiveRef,
      catalogs.filter((c) => c.activeContractId && lifecycleById.get(c.activeContractId) !== "PUBLISHED").length,
    );

    // （附）合同覆盖率：正式激活（PUBLISHED）组件数 / 组件总数
    assert.equal(
      audit.catalog.contractCoveragePercent,
      audit.catalog.total > 0 ? Math.round((audit.catalog.activePublished / audit.catalog.total) * 1000) / 10 : null,
      "合同覆盖率必须由数据库实时计算",
    );

    // 8 能力满足数 / 9 能力阻断数
    assert.equal(audit.capabilities.capabilitySatisfiedCount, audit.capabilities.executableCount, "能力满足数必须等于可执行组件数");
    assert.equal(
      audit.capabilities.capabilitySatisfiedCount,
      audit.capabilities.components.filter((c) => c.activeLifecycle === "PUBLISHED" && c.missingCapabilities.length === 0).length,
    );
    assert.equal(
      audit.capabilities.blockedByCapabilityCount,
      audit.capabilities.components.filter((c) => c.activeLifecycle === "PUBLISHED" && c.missingCapabilities.length > 0).length,
    );

    // 10 REAL_MODEL 任务数 / 11-14 计费与商业化状态
    assert.ok(audit.execution.recentRealModelTasks <= audit.execution.recentTotalTasks, "真实模型任务数不得超过窗口内任务总数");
    assert.ok(audit.execution.recentSuccessfulRealExecutions <= audit.execution.recentRealModelTasks, "成功数不得超过真实模型任务数");
    assert.equal(audit.billing.settlementEnabled, false);
    assert.equal(audit.billing.billingMode, "ESTIMATED_COMPATIBILITY");
    assert.equal(audit.billing.byokImplemented, false);
    assert.equal(typeof audit.billing.userPriceConfigured, "boolean");
    assert.equal(typeof audit.billing.markupRateBpsConfigured, "boolean");
  });

  test("6. 质量提示由激活合同元数据派生（C06/C08/C10/C11 可见，不硬编码完成度）", async () => {
    const audit = await buildComponentProgressAudit({ windowDays: 7 });
    const byId = new Map(audit.capabilities.components.map((c) => [c.componentId, c]));
    const c06 = byId.get("C06");
    const c08 = byId.get("C08");
    const c10 = byId.get("C10");
    const c11 = byId.get("C11");
    assert.ok(c06 && c08 && c10 && c11, "四组件必须出现在审计明细");

    assert.ok(c06!.qualityHints.some((h) => h.includes("ROI") || h.includes("收益")), "C06 提示数值须人工复核");
    assert.ok(c08!.qualityHints.some((h) => h.includes("schema 校验")), "C08 提示服务端 schema 校验");
    assert.ok(c10!.qualityHints.some((h) => h.includes("schema 校验")), "C10 提示服务端 schema 校验");
    assert.ok(c10!.qualityHints.some((h) => h.includes("个人信息")), "C10 提示个人信息脱敏");
    assert.ok(c11!.qualityHints.some((h) => h.includes("代码")), "C11 提示代码须人工审查");

    // 无 privacyPolicy 的组件不得冒用隐私提示
    assert.equal(c06!.qualityHints.some((h) => h.includes("个人信息")), false, "C06 不提示隐私（无 privacyPolicy）");
    assert.equal(c11!.qualityHints.some((h) => h.includes("个人信息")), false, "C11 不提示隐私（无 privacyPolicy）");
  });
});
