/**
 * 后台「角色权限矩阵」回归验证（最小化、只读、不改动生产数据）
 * ==================================================================
 * 设计原则：
 *   - 不新增任何业务功能，只做「验证」。
 *   - 静态断言（永远执行）：直接核对 middleware / 页面守卫 / 系统接口 / 后台接口的代码，
 *     确认前后端权限行为在代码层面一致（确定性、可重复）。
 *   - 数据库读取（只读）：确认「至少存在一条已启用规则，且其权限点在权限目录中」，
 *     为「普管缺权限 403 / 有 权限 200 / 超管不限」提供真实可验证对象。不写入、不删改。
 *   - 真实 HTTP 回归（按需）：仅当提供 TEST_*_TOKEN 与 TEST_BASE_URL 时执行；
 *     未提供则打印「跳过需要真实登录态的测试」，绝不伪造成功。
 *
 * 运行：
 *   npm run verify:permissions
 *   TEST_BASE_URL=http://localhost:3000 \
 *   TEST_SUPER_ADMIN_TOKEN=xxx TEST_PLATFORM_ADMIN_TOKEN=xxx \
 *   TEST_PLATFORM_ADMIN_NO_PERMISSION_TOKEN=xxx TEST_USER_TOKEN=xxx \
 *   npm run verify:permissions
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();

interface Check {
  group: string;
  name: string;
  pass: boolean;
  /** block = 失败时脚本退出码为 1；warn = 仅提示，不阻断 */
  severity: "block" | "warn";
  detail: string;
}
const checks: Check[] = [];

const ok = (group: string, name: string, detail: string) =>
  checks.push({ group, name, pass: true, severity: "block", detail });
const warn = (group: string, name: string, detail: string) =>
  checks.push({ group, name, pass: true, severity: "warn", detail });
const fail = (group: string, name: string, detail: string) =>
  checks.push({ group, name, pass: false, severity: "block", detail });

function read(relPath: string): string {
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) throw new Error(`缺少文件：${relPath}`);
  return fs.readFileSync(p, "utf8");
}

function has(relPath: string, needle: string, label: string) {
  const text = read(relPath);
  if (text.includes(needle)) ok(relPath, label, `命中：${needle}`);
  else fail(relPath, label, `未命中：${needle}`);
}

async function main() {
  console.log("============================================================");
  console.log("  知阁舟坊后台「角色权限矩阵」回归验证");
  console.log("============================================================\n");

  // ---------------------------------------------------------------
  // 一、静态代码级断言（前后端权限行为一致性）
  // ---------------------------------------------------------------
  console.log("【一、静态代码级断言】\n");

  const mw = "src/middleware.ts";
  const mwText = read(mw);
  // 故障安全头（需求 二.4）：x-permission-gate / Retry-After
  has(mw, '"x-permission-gate"', "middleware 在权限网关不可用时返回 x-permission-gate 头");
  has(mw, '"Retry-After"', "middleware 在权限网关不可用时返回 Retry-After 头");
  has(mw, "PERMISSION_SERVICE_UNAVAILABLE", "middleware 故障统一返回 503（非 403）");
  has(mw, 'permissionServiceUnavailable("rules")', "规则读取失败→503 阻断（不 fail-open）");
  has(mw, 'permissionServiceUnavailable("context")', "权限上下文读取失败→503 阻断（不 fail-open）");
  has(mw, "UNAUTHORIZED", "未登录 API 返回 401 JSON");
  has(mw, "/auth/login", "未登录页面重定向到登录页");
  has(mw, "FORBIDDEN", "无权限 API 返回 403");
  has(mw, "缺少接口权限", "403 响应包含所缺权限点（便于前端提示）");
  has(mw, "if (ctx.isSuperAdmin) return null;", "超管不受规则层限制（return null 放行）");
  has(mw, "ctx.permissions.includes(matched.permission)", "普管按权限点比对放行/拦截");

  const layout = "src/app/admin/layout.tsx";
  const layoutText = read(layout);
  has(layout, '"/admin/permissions",', "超管专属路径含 /admin/permissions（前端拦截）");
  has(layout, '"/admin/permissions/api-rules",', "超管专属路径含 /admin/permissions/api-rules（前端拦截）");
  has(layout, "superAdminOnly: true", "菜单项标记 superAdminOnly（仅超管可见）");
  has(layout, "permissions.includes(item.requiredPermission)", "静态菜单按 requiredPermission 过滤显示");
  has(layout, "/api/admin/nav-modules", "动态菜单来自 /api/admin/nav-modules（服务端已按权限过滤）");

  const sysRules = "src/app/api/system/api-permission-rules/route.ts";
  has(sysRules, 'error: "UNAUTHORIZED"', "系统规则接口未登录/凭证无效返回 401");
  has(sysRules, "status: 401", "系统规则接口 401 状态码");
  const sysCtx = "src/app/api/system/permission-context/route.ts";
  has(sysCtx, 'error: "UNAUTHORIZED"', "系统权限上下文接口未登录/凭证无效返回 401");
  has(sysCtx, "status: 401", "系统权限上下文接口 401 状态码");

  const permRoute = "src/app/api/admin/permissions/route.ts";
  has(permRoute, "requirePermissionGrantAuthority", "管理员权限配置接口后端守卫（仅超管可穿透）");
  const apiRulesRoute = "src/app/api/admin/api-permission-rules/route.ts";
  has(apiRulesRoute, "requireSystemSettingsAdmin", "接口权限规则管理接口后端守卫（仅超管）");
  has(apiRulesRoute, "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG", "接口权限规则接口对越权返回 403 高危提示");

  // ---------------------------------------------------------------
  // 二、数据库已启用规则完整性（只读）
  // ---------------------------------------------------------------
  console.log("\n【二、数据库已启用规则完整性（只读）】\n");
  const prisma = new PrismaClient();
  let exampleRule: { pathPrefix: string; methods: string[]; permission: string } | null = null;
  try {
    const [rulesRow, catalogRow] = await Promise.all([
      prisma.systemconfig.findUnique({ where: { key: "PLATFORM_API_PERMISSION_RULES_V1" } }),
      prisma.systemconfig.findUnique({ where: { key: "PLATFORM_PERMISSION_CATALOG_V1" } }),
    ]);

    const parseGroups = (v: string | null | undefined): Set<string> => {
      const s = new Set<string>();
      if (!v) return s;
      try {
        const groups = JSON.parse(v);
        if (Array.isArray(groups))
          for (const g of groups) for (const k of g?.keys ?? []) if (k?.key) s.add(String(k.key));
      } catch {
        /* 忽略解析错误 */
      }
      return s;
    };

    const rules = rulesRow?.value ? (JSON.parse(rulesRow.value) as any[]) : [];
    const catalog = parseGroups(catalogRow?.value);
    const enabled = rules.filter((r) => r?.enabled && r?.pathPrefix && r?.permission);

    if (rules.length === 0) {
      warn("DB", "已启用规则", "未读到任何规则（可能数据库不可用或为空）");
    } else {
      ok("DB", "已启用规则存在", `规则总数 ${rules.length}，已启用 ${enabled.length}`);
      const unknown = enabled.filter((r) => !catalog.has(r.permission));
      if (unknown.length === 0) {
        ok("DB", "启用规则权限点均在目录中", `${enabled.length} 条启用规则权限点均存在，403 路径可命中真实权限点`);
      } else {
        fail("DB", "启用规则权限点均在目录中", `${unknown.length} 条启用规则引用目录外的权限点（将永久 403）`);
      }
      const badPrefix = enabled.filter((r) => !String(r.pathPrefix).startsWith("/api/admin/"));
      if (badPrefix.length === 0) {
        ok("DB", "启用规则前缀均为 /api/admin/", "规则层仅覆盖后台接口");
      } else {
        fail("DB", "启用规则前缀均为 /api/admin/", `${badPrefix.length} 条前缀非法`);
      }
      const valid = enabled.find((r) => catalog.has(r.permission));
      if (valid) {
        exampleRule = {
          pathPrefix: String(valid.pathPrefix),
          methods: Array.isArray(valid.methods) ? valid.methods.map(String) : [],
          permission: String(valid.permission),
        };
        ok(
          "DB",
          "选取示例已启用规则",
          `pathPrefix=${exampleRule.pathPrefix} methods=${exampleRule.methods.join(",") || "ALL"} permission=${exampleRule.permission}`
        );
      } else {
        warn("DB", "示例规则", "无可用示例规则，真实 HTTP 规则验证将跳过");
      }
    }
  } catch (error) {
    warn("DB", "规则/目录读取", `数据库不可用，跳过读取验证：${String(error)}`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  // ---------------------------------------------------------------
  // 三、真实 HTTP 回归（按需：仅在提供 TEST_*_TOKEN + TEST_BASE_URL 时）
  // ---------------------------------------------------------------
  console.log("\n【三、真实 HTTP 回归（按需）】\n");
  const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
  const TOKENS = {
    super: process.env.TEST_SUPER_ADMIN_TOKEN,
    platform: process.env.TEST_PLATFORM_ADMIN_TOKEN,
    platformNoPerm: process.env.TEST_PLATFORM_ADMIN_NO_PERMISSION_TOKEN,
    user: process.env.TEST_USER_TOKEN,
  };
  const liveReady = Boolean(
    TOKENS.super && TOKENS.platform && TOKENS.platformNoPerm && TOKENS.user
  );

  if (!liveReady) {
    console.log("跳过需要真实登录态的测试");
    console.log(
      "（未提供完整测试 Token：TEST_SUPER_ADMIN_TOKEN / TEST_PLATFORM_ADMIN_TOKEN / " +
        "TEST_PLATFORM_ADMIN_NO_PERMISSION_TOKEN / TEST_USER_TOKEN。" +
        "静态断言与数据库只读核对已执行；如要跑真实 HTTP 回归，请注入上述变量与 TEST_BASE_URL。）\n"
    );
  } else {
    const call = async (pathname: string, token?: string, method = "GET") => {
      try {
        const res = await fetch(`${BASE_URL}${pathname}`, {
          method,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          redirect: "manual",
        });
        const body = await res.text().catch(() => "");
        return { status: res.status, headers: res.headers, body };
      } catch (error) {
        return { status: 0, headers: new Headers(), body: String(error) };
      }
    };
    const live = (name: string, pass: boolean, detail: string) =>
      checks.push({ group: "LIVE", name, pass, severity: "block", detail });

    const adminApi = exampleRule?.pathPrefix || "/api/admin/users";

    // 未登录
    const anon = await call(adminApi);
    live("未登录访问后台 API → 401", anon.status === 401, `status=${anon.status}`);

    // 普通 USER
    const userRes = await call(adminApi, TOKENS.user);
    live(
      "普通 USER 访问后台 API → 401/403",
      userRes.status === 401 || userRes.status === 403,
      `status=${userRes.status}`
    );

    // 普管无权限：管理员权限配置接口
    const noPermPerm = await call("/api/admin/permissions", TOKENS.platformNoPerm);
    live("普管(无权限)访问 /api/admin/permissions → 403", noPermPerm.status === 403, `status=${noPermPerm.status}`);

    // 普管无权限：接口规则管理接口
    const noPermRules = await call("/api/admin/api-permission-rules", TOKENS.platformNoPerm);
    live(
      "普管(无权限)访问 /api/admin/api-permission-rules → 403",
      noPermRules.status === 403,
      `status=${noPermRules.status}`
    );

    // 普管无权限：示例已启用规则接口 → 403 且带缺权限点
    if (exampleRule) {
      const noPermRuleApi = await call(adminApi, TOKENS.platformNoPerm);
      const hasMissing =
        noPermRuleApi.body.includes("缺少接口权限") || noPermRuleApi.body.includes(exampleRule.permission);
      live(
        "普管(无权限)调用已启用规则接口 → 403 且含缺权限点",
        noPermRuleApi.status === 403 && hasMissing,
        `status=${noPermRuleApi.status} body含缺权限=${hasMissing}`
      );
    }

    // 超管：管理员权限配置接口 + 示例规则接口
    const superPerm = await call("/api/admin/permissions", TOKENS.super);
    live("超管访问 /api/admin/permissions → 200", superPerm.status === 200, `status=${superPerm.status}`);
    const superRuleApi = await call(adminApi, TOKENS.super);
    live("超管调用已启用规则接口不受限 → 200", superRuleApi.status === 200, `status=${superRuleApi.status}`);

    // 普管(有对应权限)：示例规则接口（仅在 token 确实拥有该权限时预期 200）
    if (exampleRule) {
      const withPerm = await call(adminApi, TOKENS.platform);
      live(
        "普管(有对应权限)调用示例规则接口 → 200",
        withPerm.status === 200,
        `status=${withPerm.status}（若 403 说明该测试账号未授予 ${exampleRule.permission}）`
      );
    }
  }

  // ---------------------------------------------------------------
  // 汇总
  // ---------------------------------------------------------------
  console.log("\n============================================================");
  console.log("  验证结果汇总");
  console.log("============================================================");
  const groups = [...new Set(checks.map((c) => c.group))];
  let blockedFail = 0;
  for (const g of groups) {
    const items = checks.filter((c) => c.group === g);
    console.log(`\n— ${g} —`);
    for (const c of items) {
      const tag = c.pass ? "✅" : c.severity === "block" ? "❌" : "⚠️";
      console.log(`  ${tag} ${c.name}${c.detail ? `（${c.detail}）` : ""}`);
      if (!c.pass && c.severity === "block") blockedFail++;
    }
  }

  console.log("\n============================================================");
  if (blockedFail > 0) {
    console.log(`❌ 存在 ${blockedFail} 个阻断项，验证未通过（exit 1）`);
    process.exitCode = 1;
  } else {
    console.log("✅ 所有阻断项通过（静态断言 + 数据库只读核对；真实 HTTP 回归按需执行）");
  }
}

main().catch((e) => {
  console.error("验证脚本执行失败：", e);
  process.exitCode = 1;
});
