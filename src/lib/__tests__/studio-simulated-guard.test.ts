import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 架构守护：生产 Studio 路由严禁产出模拟结果。
 *
 * 生产路径已彻底删除模拟执行开关与全部模拟执行分支，无有效 PUBLISHED 激活合同时
 * 必须返回 COMPONENT_CONTRACT_NOT_READY (409)；任何环境变量都不能恢复生产模拟。
 */
const ROUTE = resolve(__dirname, "../../app/api/studio/route.ts");

describe("Studio 生产路径禁止模拟执行（架构守护）", () => {
  const src = readFileSync(ROUTE, "utf8");

  test("禁止模拟执行开关：不得存在 STUDIO_ALLOW_SIMULATED", () => {
    assert.ok(
      !src.includes("STUDIO_ALLOW_SIMULATED"),
      "生产路由不得存在 STUDIO_ALLOW_SIMULATED 开关；任何环境变量都不得恢复生产模拟执行",
    );
  });

  test('禁止模拟结果：不得出现任何 SIMULATED 常量或赋值（含 executionMode = "SIMULATED"）', () => {
    assert.ok(
      !src.includes("SIMULATED"),
      '生产路由源码中不得再出现 SIMULATED（含 executionMode = "SIMULATED" 与 billingMode 兜底）',
    );
  });

  test("禁止模拟成功路径：不得以 buildComponentResult 作为成功执行路径", () => {
    assert.ok(
      !src.includes("buildComponentResult"),
      "生产路由不得调用 buildComponentResult 生成模拟成果物",
    );
  });

  test("无有效 PUBLISHED 激活合同必须返回 COMPONENT_CONTRACT_NOT_READY (409)", () => {
    const idx = src.indexOf('code: "COMPONENT_CONTRACT_NOT_READY"');
    assert.ok(idx >= 0, "无有效合同时必须返回 COMPONENT_CONTRACT_NOT_READY 拒绝码");
    const near = src.slice(Math.max(0, idx - 240), idx + 300);
    assert.ok(
      /\{\s*status:\s*409\s*\}/.test(near),
      "COMPONENT_CONTRACT_NOT_READY 必须以 HTTP 409 返回",
    );
  });

  test("不得以任何环境变量开启生产模拟执行", () => {
    assert.ok(
      !/process\.env\.[A-Z0-9_]*SIMULAT/i.test(src),
      "生产路由不得读取任何 *SIMULAT* 环境变量来开启模拟执行",
    );
  });
});

/**
 * 架构守护：所有组件执行入口诚实化。
 * 每个组件执行入口必须使用 API 返回的合同就绪字段（contractReady / activeContractLifecycle），
 * 不得硬编码 C01-C60 的完成/可用状态。
 */
const ENTRY_FILES: Array<{ path: string; label: string }> = [
  { path: "../../components/studio/ComponentsTab.tsx", label: "ComponentsTab" },
  {
    path: "../../components/WorkspaceInternalLayoutV3.tsx",
    label: "WorkspaceInternalLayoutV3（个人/企业空间工作台组件执行入口）",
  },
  { path: "../../components/studio/OverviewTab.tsx", label: "OverviewTab" },
  {
    path: "../../components/studio/ComponentBrowser.tsx",
    label: "ComponentBrowser（/studio、/market、/components 入口）",
  },
  { path: "../../components/studio/ComponentDispatcherPanelNew.tsx", label: "ComponentDispatcherPanelNew" },
  { path: "../../app/user/components/page.tsx", label: "/user/components" },
];

/** 硬编码 C01-C60 完成/可用状态的形态（对象字面量状态映射） */
const HARDCODED_STATUS_RE =
  /["']?C0[1-9]["']?\s*:\s*(true|false|["'](PUBLISHED|COMPLETED|READY|ACTIVE|可用|已完成)["'])/;

describe("组件执行入口诚实化（架构守护）", () => {
  for (const { path, label } of ENTRY_FILES) {
    test(`${label} 必须使用合同就绪字段且不得硬编码 C01-C60 状态`, () => {
      const file = readFileSync(resolve(__dirname, path), "utf8");
      assert.ok(
        file.includes("contractReady") || file.includes("activeContractLifecycle"),
        `${label} 必须使用 API 返回的 contractReady/activeContractLifecycle 决定可执行性`,
      );
      assert.ok(
        !HARDCODED_STATUS_RE.test(file),
        `${label} 不得硬编码 C01-C60 的完成/可用状态`,
      );
    });
  }

  // 批次 2B（C06/C08/C10/C11）：可执行性必须来自合同字段，入口不得按组件 ID 特判
  test("批次 2B 组件（C06/C08/C10/C11）不得在组件入口被 ID 特判", () => {
    for (const { path, label } of ENTRY_FILES) {
      const file = readFileSync(resolve(__dirname, path), "utf8");
      for (const id of ["C06", "C08", "C10", "C11"]) {
        assert.ok(
          !new RegExp(`\\b${id}\\b`).test(file),
          `${label} 不得按组件 ID 特判 ${id}（可执行性/状态必须来自 contractReady / activeContractLifecycle / requiredCapabilities）`,
        );
      }
    }
  });
});

/**
 * 架构守护：组件数量文案诚实化。
 * 组件数量只能来自真实数据（COMPONENTS.length 或后端数据库聚合字段）；
 * 组件列表为空时必须显示空态文案，绝不得回退为固定数字（如 60/54/6）。
 */
describe("组件数量文案诚实化（架构守护）", () => {
  const browser = readFileSync(resolve(__dirname, "../../components/studio/ComponentBrowser.tsx"), "utf8");

  test("ComponentBrowser 不得出现固定组件数量回退（|| 60 / || 54 / || 6）", () => {
    assert.ok(!/\|\|\s*60\b/.test(browser), "不得出现 || 60 固定组件数量回退");
    assert.ok(!/\|\|\s*54\b/.test(browser), "不得出现 || 54 固定组件数量回退");
    assert.ok(!/\|\|\s*6\b/.test(browser), "不得出现 || 6 固定组件数量回退");
    assert.ok(!/COMPONENTS\.length\s*\|\|/.test(browser), "组件数量不得使用 || 回退，只能使用真实 COMPONENTS.length");
  });

  test("所有组件入口不得出现固定组件数量回退（|| 60 / || 54）", () => {
    for (const { path, label } of ENTRY_FILES) {
      const file = readFileSync(resolve(__dirname, path), "utf8");
      assert.ok(!/\|\|\s*(60|54)\b/.test(file), `${label} 不得出现固定组件数量回退`);
    }
  });

  test("组件数量必须来自真实数据（COMPONENTS.length 或后端聚合字段）", () => {
    const compareLines = browser.split("\n").filter((l) => l.includes("个应用组件进行功能适配度比对"));
    assert.ok(compareLines.length > 0, "必须存在「功能适配度比对」日志文案");
    for (const line of compareLines) {
      assert.ok(line.includes("${COMPONENTS.length}"), "比对文案中的组件数量必须来自真实 COMPONENTS.length");
      assert.ok(!line.includes("||"), "比对文案中的组件数量不得使用回退");
    }

    const goodsLines = browser.split("\n").filter((l) => l.includes("个精品效能组件"));
    assert.equal(goodsLines.length, 1, "「精品效能组件」文案必须唯一");
    assert.ok(goodsLines[0].includes("{COMPONENTS.length}"), "「精品效能组件」数量必须来自真实 COMPONENTS.length");
    assert.ok(browser.includes("COMPONENTS.length > 0"), "必须按真实数量是否为空分支渲染");
  });

  test("组件列表为空时必须显示空态文案，不得显示虚假总数", () => {
    assert.ok(browser.includes("暂未上架可用组件"), "组件列表为空时必须展示空态文案");
    const guardIdx = browser.indexOf("COMPONENTS.length > 0");
    const emptyStateIdx = browser.indexOf("暂未上架可用组件");
    assert.ok(guardIdx >= 0 && emptyStateIdx > guardIdx, "空态文案必须位于「数量 > 0」条件分支的 else 分支中");
    assert.ok(!/60 个精品效能组件/.test(browser), "不得出现固定「60 个精品效能组件」文案");
  });

  test("不得硬编码 C01-C60 的完成状态", () => {
    assert.ok(!HARDCODED_STATUS_RE.test(browser), "ComponentBrowser 不得硬编码组件完成状态映射");
  });

  test("研发阶段数量必须来自数据库动态分组，不得写死固定阶段数字", () => {
    assert.ok(!/10 大/.test(browser), "不得出现固定的「10 大」阶段数字表述");
    assert.ok(browser.includes("const stageCount = Object.keys(stageConfigs).length"), "阶段数量必须由数据库分组结果（stageConfigs）计算");
    assert.ok(browser.includes("{stageCount}"), "阶段数量文案必须使用真实 stageCount");
    assert.ok(browser.includes("stageCount > 0"), "阶段数为空时必须走空态分支，不得显示固定数字");
  });
});

/**
 * 架构守护：结构化表单（STRUCTURED_FORM）入口。
 * 合同声明 STRUCTURED_FORM 的组件必须由前端渲染合同字段表单并以 formData 提交，
 * 且合同输入结构必须由数据库 API 下发（前端禁止硬编码字段）。
 */
describe("结构化表单入口（架构守护）", () => {
  test("工作台必须按合同渲染结构化表单并以 formData 提交", () => {
    const file = readFileSync(resolve(__dirname, "../../components/WorkspaceInternalLayoutV3.tsx"), "utf8");
    assert.ok(file.includes("STRUCTURED_FORM"), "工作台必须识别合同的 STRUCTURED_FORM 输入类型");
    assert.ok(file.includes("formConstraints"), "工作台必须从 API 下发的合同结构渲染字段");
    assert.ok(file.includes("formData"), "工作台必须以 formData 提交结构化表单");
    assert.ok(file.includes("quickFormData"), "工作台必须维护结构化表单的受控状态");
  });

  test("catalog API 必须下发合同输入结构（inputContractKind / formConstraints）", () => {
    const route = readFileSync(ROUTE, "utf8");
    assert.ok(route.includes("inputContractKind"), "catalog 必须下发 inputContractKind");
    assert.ok(route.includes("formConstraints"), "catalog 必须下发 formConstraints");
  });

  test("生产路由必须注入真实历史成本基准占位符（{{COST_BASELINE}}）", () => {
    const route = readFileSync(ROUTE, "utf8");
    assert.ok(route.includes("COST_BASELINE_PLACEHOLDER"), "路由必须支持 {{COST_BASELINE}} 注入");
    assert.ok(route.includes("getComponentCostBaseline"), "路由必须读取真实历史基准（未配置时回退假设）");
  });
});
