import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

/**
 * 架构守护测试：确保生产执行路径只走数据库模型注册表。
 *  - 不得存在环境变量兜底（ENV_FALLBACK）；
 *  - 生产执行/解析路径不得读取 MODEL_PROVIDER_ID / MODEL_ID / MODEL_BASE_URL；
 *  - /api/studio 路由不得引用旧环境变量适配器入口。
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const ROUTE = "src/app/api/studio/route.ts";
const REGISTRY = "src/lib/model-registry.ts";
const ADAPTER = "src/lib/model-adapter.ts";

describe("模型执行入口架构守护", () => {
  test("studio 路由不得引用旧环境变量适配器入口", () => {
    const src = read(ROUTE);
    assert.ok(!src.includes("getRealModelAdapter"), "route 不得调用 getRealModelAdapter");
    assert.ok(!src.includes("readRealModelEnv"), "route 不得调用 readRealModelEnv");
    assert.ok(!src.includes("model-adapter-env-compat"), "route 不得引用测试专用兼容模块");
    assert.ok(!src.includes("ENV_FALLBACK"), "route 不得出现 ENV_FALLBACK");
  });

  test("studio 路由必须使用注册表解析 + 计划适配器", () => {
    const src = read(ROUTE);
    assert.ok(
      src.includes("resolveDefaultDeployment"),
      "route 必须调用数据库唯一裁决入口 resolveDefaultDeployment（空间默认 -> 平台默认 -> 拒绝）",
    );
    assert.ok(src.includes("createModelAdapter"), "route 必须调用 createModelAdapter");
    assert.ok(
      !/modeldeployment\.findFirst\(\{[\s\S]{0,240}?orderBy:\s*\{\s*createdAt/.test(src),
      "route 严禁通过 modeldeployment.findFirst(orderBy: createdAt) 隐式挑选执行模型",
    );
  });

  test("生产解析器不得存在 ENV_FALLBACK，也不得读取模型环境变量", () => {
    const src = read(REGISTRY);
    assert.ok(!src.includes("ENV_FALLBACK"), "model-registry 不得存在 ENV_FALLBACK");
    assert.ok(!src.includes("MODEL_PROVIDER_ID"), "model-registry 不得读取 MODEL_PROVIDER_ID");
    assert.ok(!src.includes("MODEL_BASE_URL"), "model-registry 不得读取 MODEL_BASE_URL");
    // MODEL_ID 需精确匹配独立读取，避免误伤 MODEL_API_KEY / MODEL_MAX_OUTPUT_TOKENS 等
    assert.ok(!/process\.env\.MODEL_ID\b/.test(src), "model-registry 不得读取 MODEL_ID");
  });

  test("生产路径不得再出现旧价格字段与旧快照构建器", () => {
    const files = [
      "src/app/api/studio/route.ts",
      "src/lib/model-registry.ts",
      "src/lib/model-pricing.ts",
      "src/lib/component-execution-profile.ts",
      "src/app/api/admin/model-deployments/route.ts",
      "src/app/api/admin/model-deployments/[id]/route.ts",
      "src/app/api/admin/model-pricing/[deploymentId]/route.ts",
    ];
    for (const f of files) {
      const src = read(f);
      assert.ok(!src.includes("inputPricePer1KCents"), `${f} 不得读取/写入旧价格字段 inputPricePer1KCents`);
      assert.ok(!src.includes("outputPricePer1KCents"), `${f} 不得读取/写入旧价格字段 outputPricePer1KCents`);
      assert.ok(!src.includes("buildPricingSnapshot("), `${f} 不得调用旧快照构建器 buildPricingSnapshot`);
    }
  });

  test("价格快照不得残留无生产消费者的旧兼容字段", () => {
    const src = read("src/lib/model-pricing.ts");
    assert.ok(!src.includes("inputPricePerMillion"), "快照兼容字段 inputPricePerMillion 必须删除（无生产消费者）");
    assert.ok(!src.includes("outputPricePerMillion"), "快照兼容字段 outputPricePerMillion 必须删除（无生产消费者）");
    // 有效售价必须四类齐全且同源
    assert.ok(src.includes("resolveEffectiveUserPrice"), "有效用户售价必须由统一出口计算");
  });

  test("结算判断唯一入口：生产路径不得出现旧 isSettlementReady", () => {
    const files = ["src/lib/model-registry.ts", "src/lib/model-pricing.ts", "src/app/api/studio/route.ts"];
    for (const f of files) {
      assert.ok(!read(f).includes("isSettlementReady"), `${f} 不得使用旧结算判断入口`);
    }
    assert.ok(read("src/lib/model-pricing.ts").includes("evaluateSettlementReadiness"), "必须保留统一结算入口");
  });

  test("生产适配器不得保留旧环境变量入口与模型环境变量读取", () => {
    const src = read(ADAPTER);
    assert.ok(!src.includes("readRealModelEnv"), "model-adapter 不得导出 readRealModelEnv");
    assert.ok(!src.includes("RealModelEnv"), "model-adapter 不得保留 RealModelEnv 类型");
    assert.ok(!src.includes("MODEL_PROVIDER_ID"), "model-adapter 不得读取 MODEL_PROVIDER_ID");
    assert.ok(!src.includes("MODEL_BASE_URL"), "model-adapter 不得读取 MODEL_BASE_URL");
    assert.ok(!/process\.env\.MODEL_ID\b/.test(src), "model-adapter 不得读取 MODEL_ID");
  });
});

/** 递归收集 src 下的生产源码文件（排除测试文件） */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "__tests__"].includes(entry.name)) continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

describe("价格唯一真源架构守护（旧价格链路必须彻底移除）", () => {
  test("旧价格模块 / 页面 / 接口文件必须已删除", () => {
    const removed = [
      "src/lib/model-rate.ts",
      "src/lib/pricing-config.ts",
      "src/app/admin/ai-pricing/page.tsx",
      "src/app/api/admin/settings/pricing/route.ts",
    ];
    for (const rel of removed) {
      assert.ok(!fs.existsSync(path.join(process.cwd(), rel)), `${rel} 必须已删除（价格唯一真源为 modelpricing）`);
    }
  });

  test("生产代码不得引用旧价格模块，也不得内置厂商价格表", () => {
    const files = collectSourceFiles(path.join(process.cwd(), "src"));
    assert.ok(files.length > 100, "源码收集异常（应收集到全量生产文件）");
    const forbidden: Array<[RegExp | string, string]> = [
      ["@/lib/model-rate", "不得引用旧价格折算引擎 @/lib/model-rate"],
      ["@/lib/pricing-config", "不得引用旧计价配置 @/lib/pricing-config"],
      ["DEFAULT_PRICING_CONFIG", "不得保留旧计价默认配置（内置价格回退）"],
      ["AI_PROVIDERS", "不得保留内置厂商价格表 AI_PROVIDERS"],
      ["ZHIGE_ENGINE", "不得保留内置自研引擎价格 ZHIGE_ENGINE"],
      ["ai_pricing_config", "不得再读取旧的 ai_pricing_config 配置键"],
      ["deepseek-chat", "不得内置具体厂商模型价格"],
      ["gpt-4o-mini", "不得内置具体厂商模型价格"],
      ["glm-4-flash", "不得内置具体厂商模型价格"],
    ];
    for (const f of files) {
      const src = read(f);
      for (const [needle, msg] of forbidden) {
        assert.ok(!src.includes(needle as string), `${f}：${msg}`);
      }
    }
  });

  test("数据库价格读取不得静默回退到硬编码默认值", () => {
    const src = read("src/lib/model-registry.ts");
    assert.ok(!/catch[\s\S]{0,200}DEFAULT_/.test(src), "model-registry 不得在异常时回退硬编码默认价格");
    // 缺失价格必须显式表达为未配置 / 报错
    assert.ok(src.includes("MODEL_NOT_ALLOWED"), "缺失或未启用的模型必须显式报错");
  });

  test("后台导航与权限目录不得指向已删除的旧定价页", () => {
    const layout = read("src/app/admin/layout.tsx");
    assert.ok(!layout.includes("/admin/ai-pricing"), "后台导航不得再指向已删除的 /admin/ai-pricing");
    const perms = read("src/app/api/admin/permissions/route.ts");
    assert.ok(!perms.includes('"/admin/ai-pricing"'), "权限目录 moduleRoute 不得再指向已删除页面");
    assert.ok(perms.includes('"/admin/models"'), "权限目录应指向新的模型注册表页面");
  });
});

describe("模型选择旧链路架构守护（用户不可自选模型）", () => {
  test("studio 路由不得再出现旧引擎折算与用户引擎偏好读取", () => {
    const src = read("src/app/api/studio/route.ts");
    assert.ok(!src.includes("resolveEngineProviderId"), "已删除的 resolveEngineProviderId 不得回归");
    assert.ok(!src.includes("aiEngine"), "studio 路由不得读取用户引擎偏好（模型由合同+注册表+策略决定）");
  });

  test("用户偏好接口不得接受或返回模型/引擎选择", () => {
    const src = read("src/app/api/user/preferences/route.ts");
    assert.ok(!src.includes("validEngines"), "不得保留旧引擎白名单");
    assert.ok(!src.includes('"deepseek"'), "不得保留 deepseek 选项");
    assert.ok(!src.includes('"custom"'), "不得保留自带 Key（BYOK）伪选项");
    assert.ok(!src.includes("aiEngine:"), "不得写入 aiEngine");
    assert.ok(!src.includes("defaultModel:"), "不得写入 defaultModel");
    assert.ok(src.includes("MODEL_SELECTION_MANAGED_BY_ADMIN"), "写入模型选择必须显式拒绝");
  });

  test("工作空间设置页不得展示硬编码模型选项或失效的后台入口文案", () => {
    const src = read("src/app/workspace-hub/settings/page.tsx");
    for (const forbidden of [
      "aiEngine",
      "DeepSeek-V3",
      "自带 API 密钥",
      "知阁自研引擎",
      "算力计价",
    ]) {
      assert.ok(!src.includes(forbidden), `工作空间设置页不得出现旧模型选项/失效文案：${forbidden}`);
    }
  });

  test("全量生产代码不得保留旧引擎选项清单或引擎偏好读写", () => {
    const files = collectSourceFiles(path.join(process.cwd(), "src"));
    for (const f of files) {
      const src = read(f);
      assert.ok(!src.includes("resolveEngineProviderId"), `${f}：不得保留 resolveEngineProviderId`);
      assert.ok(!src.includes("validEngines"), `${f}：不得保留旧引擎白名单 validEngines`);
      assert.ok(!src.includes("zhige-v3"), `${f}：不得保留旧默认模型 zhige-v3`);
      assert.ok(!src.includes("deepseek-chat"), `${f}：不得保留旧厂商模型选项`);
      // 旧「引擎选择」清单特征：同一文件同时出现 zhige 与 deepseek 引擎字面量
      // （单独出现 "custom" 属于日期区间/图标类型等合法枚举，故不在此禁止）
      assert.ok(
        !(src.includes('"zhige"') && src.includes('"deepseek"')),
        `${f}：不得同时保留 zhige / deepseek 旧引擎选项`,
      );
    }
  });

  test("锁实现必须是「提交时自动释放」的行锁，禁止手工提前放锁", () => {
    const raw = read("src/lib/model-registry-lock.ts");
    // 注释中会解释「为何不能用命名锁」，故仅在剥离注释后的真实代码中检查
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!src.includes("RELEASE_LOCK"), "禁止手工 RELEASE_LOCK（Prisma 回调 finally 早于 COMMIT，会在提交前放锁）");
    assert.ok(!src.includes("GET_LOCK"), "禁止会话级命名锁（无法与事务提交边界对齐）");
    assert.ok(src.includes("FOR UPDATE"), "必须使用锁行 + SELECT ... FOR UPDATE");
    assert.ok(src.includes("ReadCommitted"), "必须使用 ReadCommitted，确保拿锁后读到最新已提交数据");
    assert.ok(src.includes("isolationLevel"), "必须显式声明事务隔离级别");
    // 三个写操作必须共用同一串行边界
    for (const f of [
      "src/app/api/admin/model-deployments/[id]/route.ts",
      "src/app/api/admin/workspaces/[id]/model-policy/route.ts",
      "src/app/api/admin/model-providers/[id]/route.ts",
    ]) {
      assert.ok(read(f).includes("withModelRegistryLock"), `${f} 必须使用统一的模型注册表串行锁`);
    }
  });

  test("C07 seed 必须走新合同路径：校验/激活 component_contract，且不得写旧 executionProfile", () => {
    const seed = read("prisma/seed-c07-contract.ts");
    // 旧路径已退役：不得写入 detail.executionProfile，不得再构建旧 pilot profile
    assert.ok(!seed.includes("executionProfile:"), "seed 不得写入 detail.executionProfile 旧字段");
    assert.ok(!seed.includes("buildPilotProfile"), "seed 不得再构建旧 pilot profile");
    assert.ok(!seed.includes("resolvePilotContractBinding"), "seed 不得再做旧模型绑定决策");
    // 新路径：基于 component_contract + activeContractId
    assert.ok(seed.includes("componentcontract"), "seed 必须基于 component_contract 校验/激活");
    assert.ok(seed.includes("activeContractId"), "seed 必须处理 activeContractId");
    assert.ok(
      !/findFirst\(\{[\s\S]{0,160}?enabled:\s*true/.test(seed),
      "seed 不得自动挑选第一个启用部署（执行模型由数据库默认裁决）",
    );
  });

  test("管理端偏好页的引擎字段必须显式标注为历史弃用", () => {
    const src = read("src/app/admin/preferences/page.tsx");
    assert.ok(src.includes("已弃用"), "管理端展示 aiEngine 时必须标注已弃用");
    const api = read("src/app/api/admin/preferences/route.ts");
    assert.ok(api.includes("engineFieldDeprecated"), "管理端接口必须声明 aiEngine 字段已弃用");
  });
});
