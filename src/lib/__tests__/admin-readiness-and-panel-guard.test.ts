/**
 * 2A 产品化收口守护测试
 *
 * 覆盖：
 *  - 组件进度页面：数据必须来自后端聚合接口、具备加载/错误/403 状态、只读、无硬编码数量、无密钥；
 *  - 装配面板（ComponentDispatcherPanelNew）：结构化表单由合同字段驱动、多文件提示来自 fileConstraints、
 *    C05 基准缺失提示来自 costBaselineStatus、绝不提交 providerId/modelId；
 *  - 进度接口聚合数据：settlementEnabled=false、BYOK 未实现、覆盖率由数据库计算、C08+ 可汇总。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildComponentProgressAudit } from "@/lib/component-progress-audit";

const PAGE = resolve(__dirname, "../../app/admin/components/readiness/page.tsx");
const PANEL = resolve(__dirname, "../../components/studio/ComponentDispatcherPanelNew.tsx");

describe("组件进度页面守护（管理员只读视图）", () => {
  const src = readFileSync(PAGE, "utf8");

  test("1. 数据全部来自后端聚合接口，且具备加载/错误/403 状态与刷新", () => {
    assert.ok(src.includes("/api/admin/components/progress-audit"), "必须调用后端聚合接口");
    assert.ok(src.includes("getAuthToken"), "必须携带登录态");
    assert.ok(src.includes("正在读取组件进度"), "必须有加载状态");
    assert.ok(src.includes("error.code") && src.includes("error.message"), "必须展示后端明确的 code/message");
    assert.ok(src.includes("FORBIDDEN"), "403 权限错误必须可见");
    assert.ok(src.includes("刷新"), "必须支持刷新");
  });

  test("2. 只读：不存在任何提交/修改合同状态的请求", () => {
    assert.ok(!/method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(src), "页面不得发起任何写请求");
    assert.ok(!/componentcontract/i.test(src), "页面不得直接操作合同表/接口");
    assert.ok(src.includes("本页为只读视图"), "必须显式声明只读");
  });

  test("3. 所有指标均来自接口数据，不得硬编码数量/比例", () => {
    for (const field of [
      "data.catalog.total",
      "data.catalog.published",
      "data.catalog.withActiveContract",
      "data.catalog.noContract",
      "data.catalog.draftOnly",
      "data.catalog.contractCoveragePercent",
      "data.capabilities.capabilitySatisfiedCount",
      "data.capabilities.executableCount",
      "data.capabilities.blockedByCapabilityCount",
      "data.execution.recentRealModelTasks",
      "data.execution.realModelCoveragePercent",
      "data.billing.settlementEnabled",
      "data.billing.byokImplemented",
    ]) {
      assert.ok(src.includes(field), `页面必须直接消费接口字段 ${field}`);
    }
    // 反例：不得把统计数字写死在标签里（如「组件总数：60」）
    assert.ok(!/[:：]\s*60\b/.test(src), "不得硬编码 60");
    assert.ok(!/[:：]\s*54\b/.test(src), "不得硬编码 54");
  });

  test("4. 不展示任何密钥", () => {
    assert.ok(!/\.apiKey|\.apiKeyEnv|["']apiKey["']/.test(src), "页面不得访问 apiKey 字段");
    assert.ok(!/\.baseUrl|["']baseUrl["']/.test(src), "页面不得访问 baseUrl 字段");
    assert.ok(!/sk-[A-Za-z0-9_-]{8,}/.test(src), "页面不得出现形如密钥的字面量");
  });

  test("5. 不得按组件 ID 数字范围固定分组（动态扩展收口）", () => {
    for (const forbidden of ["C01–C07", "C01-C07", "C08–C60", "C08-C60", "n >= 1 && n <= 7", "n >= 8", "lastSeven", "restAggregate"]) {
      assert.ok(!src.includes(forbidden), `页面不得出现固定范围逻辑：${forbidden}`);
    }
    assert.ok(
      !/\.replace\(\/\\D\/g,\s*""\)/.test(src),
      "页面不得从组件 ID 中提取数字用于分组（新增 C61/C78/C100 或非 Cxx 组件会失效）",
    );
  });

  test("6. 必须遍历后端返回的完整组件列表，并使用纯视图助手与状态筛选", () => {
    assert.ok(src.includes("capabilities.components"), "组件列表必须来自后端聚合字段 capabilities.components");
    assert.ok(src.includes("visibleRows.map("), "必须遍历渲染组件行（不得按固定范围取子集）");
    for (const helper of ["READINESS_FILTERS", "deriveReadinessStatus", "filterReadinessRows", "summarizeReadiness"]) {
      assert.ok(src.includes(helper), `必须使用纯视图助手 ${helper}`);
    }
    // 筛选项由纯视图模块提供（页面不重复字面量），页面必须渲染其标签与计数
    assert.ok(src.includes("READINESS_FILTERS.map("), "必须渲染筛选器清单");
    assert.ok(src.includes("f.label"), "筛选按钮必须使用筛选器清单的标签");
    assert.ok(src.includes("statusCounts[f.key]"), "筛选按钮必须展示各状态的真实计数");
    assert.ok(src.includes("setStatusFilter"), "必须支持切换筛选状态");
  });

  test("7. 不得硬编码 60 / 54 / 6 / 10", () => {
    assert.ok(!/[:：]\s*60\b/.test(src), "不得硬编码 60");
    assert.ok(!/[:：]\s*54\b/.test(src), "不得硬编码 54");
    assert.ok(!/[:：]\s*6\b/.test(src), "不得硬编码 6");
    assert.ok(!/[:：]\s*10\b/.test(src), "不得硬编码 10");
  });

  test("8. 结算 / BYOK / 计费口径展示不得改变", () => {
    assert.ok(src.includes("data.billing.settlementEnabled"), "必须展示 settlementEnabled");
    assert.ok(src.includes("data.billing.byokImplemented"), "必须展示 BYOK 状态");
    assert.ok(src.includes("data.billing.billingMode"), "必须展示 billingMode");
    assert.ok(src.includes("真实 Token 结算") && src.includes("BYOK"), "结算与 BYOK 文案必须保留");
    assert.ok(src.includes("合同覆盖率"), "合同覆盖率展示必须保留");
    assert.ok(src.includes("能力阻断"), "能力阻断展示必须保留");
    assert.ok(src.includes("无合同"), "无合同（待配置）数量展示必须保留");
  });
});

describe("装配面板守护（合同驱动的表单/提示/对齐）", () => {
  const panel = readFileSync(PANEL, "utf8");

  test("1. 结构化表单完全由合同字段驱动，并以 formData 提交到既有 Studio API", () => {
    assert.ok(panel.includes("inputContractKind"), "必须识别合同输入类型");
    assert.ok(panel.includes('"STRUCTURED_FORM"'), "必须识别 STRUCTURED_FORM");
    assert.ok(panel.includes("formConstraints"), "必须读取合同字段定义");
    assert.ok(panel.includes("formData"), "必须以 formData 提交");
    assert.ok(panel.includes('fetch("/api/studio"'), "必须复用既有 Studio API（不得新建第二套入口）");
    assert.ok(panel.includes("executionMode"), "成功后必须展示 executionMode");
    assert.ok(panel.includes("contractVersion"), "成功后必须展示合同版本");
  });

  test("2. 绝不提交 providerId/modelId（模型由服务端注册表裁决）", () => {
    assert.ok(!/providerId\s*:/.test(panel), "前端不得以 providerId 字段提交模型选择");
    assert.ok(!/modelId\s*:/.test(panel), "前端不得以 modelId 字段提交模型选择");
    // 提交体只允许 action/workspaceId/componentId/formData
    assert.ok(
      /body:\s*JSON\.stringify\(\{[\s\S]{0,200}?action:\s*"simulate"[\s\S]{0,200}?\}\)/.test(panel),
      "提交体必须收敛为 simulate + workspaceId + componentId + formData",
    );
  });

  test("3. 多文件提示来自合同 fileConstraints，不得把多文件显示为单文件", () => {
    assert.ok(panel.includes("fileConstraints"), "必须读取合同文件约束");
    assert.ok(panel.includes("maxCount"), "必须使用合同 maxCount 作为数量提示");
    assert.ok(panel.includes("acceptedMimes"), "必须展示合同允许的格式");
    assert.ok(panel.includes("多文件组件"), "多文件组件必须显式标注为多文件");
  });

  test("4. C05 基准缺失必须显示警告状态，前端不得写死假设单价", () => {
    assert.ok(panel.includes("costBaselineStatus"), "必须读取后端下发的基准状态");
    assert.ok(panel.includes("ASSUMPTION"), "必须区分「假设估算」状态");
    assert.ok(panel.includes("不代表平台真实报价"), "必须明确声明不代表平台真实报价");
    // 不得在前端硬编码假设单价（如 2.0 万元/人月）
    assert.ok(!/2\.0\s*万/.test(panel), "前端不得写死假设单价");
    assert.ok(!/人月单价/.test(panel), "前端不得写死人月单价");
  });
});

describe("进度接口聚合数据（数据库实时）", () => {
  test("1. 计费/商业化状态与覆盖率必须由数据库计算", async () => {
    const audit = await buildComponentProgressAudit({ windowDays: 7 });
    assert.equal(audit.billing.settlementEnabled, false, "settlementEnabled 必须为 false");
    assert.equal(audit.billing.byokImplemented, false, "BYOK 必须显示为未实现");
    assert.equal(audit.billing.billingMode, "ESTIMATED_COMPATIBILITY");

    const { recentRealModelTasks, recentTotalTasks, realModelCoveragePercent } = audit.execution;
    if (recentTotalTasks > 0) {
      const expected = Math.round((recentRealModelTasks / recentTotalTasks) * 1000) / 10;
      assert.equal(realModelCoveragePercent, expected, "覆盖率必须由真实模型任务数/任务总数实时计算");
    } else {
      assert.equal(realModelCoveragePercent, null, "无任务时覆盖率必须为 null（不得伪造 0% 或 100%）");
    }
  });

  test("2. C01-C07 逐项可枚举、C08+ 可汇总、能力声明无未具证据项", async () => {
    const audit = await buildComponentProgressAudit();
    const ids = new Set(audit.capabilities.components.map((c) => c.componentId));
    for (const id of ["C01", "C02", "C03", "C04", "C05", "C06", "C07"]) {
      assert.ok(ids.has(id), `必须能枚举 ${id} 的逐项状态`);
    }
    const rest = audit.capabilities.components.filter((c) => Number(c.componentId.replace(/\D/g, "")) >= 8);
    assert.ok(rest.length > 0, "C08+ 必须可汇总（用于页面汇总区）");
    assert.equal(
      rest.filter((r) => r.activeContractId === null).length,
      rest.filter((r) => r.activeLifecycle === null).length,
      "C08+ 无合同组件计数口径必须一致",
    );
    for (const cap of ["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"]) {
      assert.ok(
        !audit.capabilities.needsReviewDeploymentCapabilities.some((x) => x.capability === cap),
        `部署不得声明未具证据能力：${cap}`,
      );
    }
  });
});
