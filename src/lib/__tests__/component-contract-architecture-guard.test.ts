import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 架构守护：彻底退出旧 detail.executionProfile 运营路径
 *
 * 三条硬性断言（任一违反即 CI 失败）：
 *  1. 生产运行路径（Studio 路由）不得读写 detail.executionProfile；
 *  2. seed 不得写入旧字段，必须基于 component_contract + activeContractId；
 *  3. 能力审计脚本不得以旧字段作为执行证据。
 */

const ROOT = path.resolve(process.cwd());
const ROUTE = path.join(ROOT, "src", "app", "api", "studio", "route.ts");
const SEED = path.join(ROOT, "prisma", "seed-c07-contract.ts");
const AUDIT = path.join(ROOT, "scripts", "audit-component-capabilities.ts");

function read(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

/** 剔除注释行与块注释，避免“注释中提及旧字段”误伤守护断言 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

describe("架构守护：旧 executionProfile 路径已彻底退出", () => {
  test("① Studio 生产路由不得读写 detail.executionProfile", () => {
    const code = stripComments(read(ROUTE));
    assert.ok(
      !/\.executionProfile\b/.test(code),
      "Studio 路由代码中不得再读写 detail.executionProfile（唯一真源为 component_contract + activeContractId）",
    );
    assert.ok(
      !/executionProfile\s*[:=]/.test(code),
      "Studio 路由不得再构造/写入 executionProfile 字段",
    );
    // 执行模型必须由数据库唯一裁决，严禁按创建时间隐式挑选
    assert.ok(
      !/modeldeployment\.findFirst\(\{[\s\S]{0,240}?orderBy:\s*\{\s*createdAt/.test(code),
      "Studio 路由严禁通过 modeldeployment.findFirst(orderBy: createdAt) 隐式挑选执行模型",
    );
  });

  test("② seed 不得写入旧字段，必须基于 component_contract + activeContractId", () => {
    const seed = stripComments(read(SEED));
    assert.ok(!/executionProfile\s*:/.test(seed), "seed 不得写入 detail.executionProfile 旧字段");
    assert.ok(!/buildPilotProfile/.test(seed), "seed 不得再构建旧 pilot profile");
    assert.ok(!/resolvePilotContractBinding/.test(seed), "seed 不得再做旧模型绑定决策");
    assert.ok(/componentcontract/.test(seed), "seed 必须基于 component_contract 校验/激活");
    assert.ok(/activeContractId/.test(seed), "seed 必须处理 activeContractId");
  });

  test("③ 能力审计脚本不得以旧字段作为执行证据", () => {
    const audit = stripComments(read(AUDIT));
    // 允许出现“遗留检测”字样，但不得再把 executionProfile 用于执行链/证据判定
    assert.ok(
      !/executionChainEvidence\s*=[^\n]*executionProfile/.test(audit),
      "审计脚本不得将 detail.executionProfile 作为执行链证据",
    );
    assert.ok(
      !/hasProfileRealModel/.test(audit),
      "审计脚本不得再使用旧的 hasProfileRealModel 判定（应基于激活的 PUBLISHED 合同）",
    );
    assert.ok(
      /activeContractId|active_contract_id/.test(audit),
      "审计脚本必须基于 activeContractId 读取 componentcontract",
    );
    assert.ok(!/componentcontract|component_contract/.test(audit) === false, "审计脚本必须引用 componentcontract");
  });

  test("④ Studio 生产路由不得导入含旧合同读取能力的模块", () => {
    const src = read(ROUTE);
    assert.ok(
      !/from\s+"@\/lib\/component-execution-profile"/.test(src),
      "Studio 不得导入 component-execution-profile（该模块含 detail.executionProfile 旧读取函数）",
    );
    assert.ok(
      /from\s+"@\/lib\/component-runtime-utils"/.test(src),
      "Studio 的通用运行时工具必须来自中立模块 component-runtime-utils",
    );
    // 旧读取函数名不得出现在 Studio 生产源码中
    for (const legacy of ["getComponentExecutionProfile", "parseExecutionProfile", "assertPilotContractOrThrow"]) {
      assert.ok(!src.includes(legacy), `Studio 不得再引用旧合同读取函数 ${legacy}`);
    }
  });

  test("⑤ 旧合同读取函数不得进入生产 import 图，且旧绑定模块必须已退役", () => {
    // 1. 旧绑定模块必须已退役（不得再存在）
    const legacyModule = path.join(ROOT, "src", "lib", "pilot-contract-binding.ts");
    assert.ok(!fs.existsSync(legacyModule), "src/lib/pilot-contract-binding.ts 必须已退役，不得再存在");

    // 2. 递归扫描生产源码（排除测试），不得引用旧合同读取函数
    const legacyFns = [
      "getComponentExecutionProfile",
      "parseExecutionProfile",
      "parseExecutionProfileValue",
      "assertPilotContractOrThrow",
    ];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        // 剥离注释：只有真实代码引用才算违规（注释中提及函数名（如迁移说明）不算）
        const content = stripComments(fs.readFileSync(full, "utf-8"));
        for (const fn of legacyFns) {
          if (content.includes(fn)) offenders.push(`${path.relative(ROOT, full)} -> ${fn}`);
        }
      }
    };
    walk(path.join(ROOT, "src", "app"));
    walk(path.join(ROOT, "src", "lib"));
    // 不允许任何例外：旧读取函数已物理删除，全仓不得再出现
    assert.deepEqual(offenders, [], `源码不得引用旧合同读取函数: ${offenders.join(", ")}`);

    // 旧读取器已从旧模块中物理删除：文件中不得再保留任何旧读取器标识
    const profileModule = path.join(ROOT, "src", "lib", "component-execution-profile.ts");
    const legacySrc = stripComments(read(profileModule));
    for (const fn of [
      ...legacyFns,
      "PILOT_COMPONENT_ID",
      "buildPilotProfile",
      "ComponentCatalogLikeForProfile",
      "ParseExecutionProfileResult",
      "PilotModelBinding",
    ]) {
      assert.ok(!legacySrc.includes(fn), `旧模块不得再保留旧读取器 ${fn}`);
    }
  });

  test("⑥ seed 不得自动挑选候选合同（禁止 published[0] / 隐式 findFirst）", () => {
    const seed = stripComments(read(SEED));
    assert.ok(!/published\s*\[\s*0\s*\]/.test(seed), "seed 严禁 published[0] 自动挑选合同");
    assert.ok(!/contracts\s*\[\s*0\s*\]/.test(seed), "seed 严禁 contracts[0] 自动挑选合同");
    assert.ok(!/componentcontract\.findFirst/.test(seed), "seed 严禁用 findFirst 隐式挑选 componentcontract");
    assert.ok(/contract-id/.test(seed), "seed 必须支持显式 --contract-id");
    assert.ok(/rebind/.test(seed), "seed 必须支持显式 --rebind 换绑，禁止隐式改绑");
    assert.ok(/REBIND_FLAG_REQUIRED/.test(seed), "seed 必须拒绝未加 --rebind 的换绑意图");
    assert.ok(/CONTRACT_ACTIVATION_TARGET_REQUIRED/.test(seed), "seed 必须要求显式目标合同");
  });

  test("⑦ 生产源码不得出现 published[0] 隐式选择", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/published\s*\[\s*0\s*\]/.test(fs.readFileSync(full, "utf-8"))) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, "src", "app"));
    walk(path.join(ROOT, "src", "lib"));
    assert.deepEqual(offenders, [], `生产源码不得出现 published[0]: ${offenders.join(", ")}`);
  });

  test("⑧ 模型后台页面不得硬编码厂商/模型清单，能力必须来自数据库 API", () => {
    const page = path.join(ROOT, "src", "app", "admin", "models", "page.tsx");
    const src = stripComments(read(page));
    for (const vendor of ["MagicAI", "gpt-5.5", "deepseek", "DeepSeek", "zhipu", "智谱", "glm-4"]) {
      assert.ok(!src.includes(vendor), `模型后台页面不得硬编码厂商/模型 ${vendor}`);
    }
    assert.ok(/capabilities/.test(src), "模型后台页面必须展示来自数据库 API 的 capabilities");
    assert.ok(/apiKeyEnv/.test(src), "模型后台只能展示 apiKeyEnv");
    assert.ok(!/\bapiKey\b(?!Env)/.test(src), "模型后台不得展示任何 API key 字段");
    assert.ok(/model-deployments\/default/.test(src), "平台默认必须通过后台接口读写");
  });

  test("⑨ 旧 aiEngine 字段必须被显式拒绝写入，不得存在写入路径", () => {
    const prefs = stripComments(read(path.join(ROOT, "src", "app", "api", "user", "preferences", "route.ts")));
    assert.ok(/FORBIDDEN_MODEL_FIELDS/.test(prefs), "用户偏好接口必须以白名单禁止旧模型字段写入");
    assert.ok(
      /FORBIDDEN_MODEL_FIELDS\s*=\s*\[[^\]]*aiEngine/.test(prefs),
      "aiEngine 必须列在禁止写入字段中（旧执行路径已退役）",
    );
  });
});
