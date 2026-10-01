/**
 * 后台权限「接线」自检脚本
 * ==================================================================
 * 背景：后台模块的权限点存在数据库目录（systemconfig.PLATFORM_PERMISSION_CATALOG_V1），
 *      但菜单显隐与接口鉴权用的是**代码里手写的权限 key**。两者一旦脱节就会出现：
 *        ① 新模块权限点在后台注册了，但代码仍用旧 key（如复用 content:read）→ 权限形同虚设；
 *        ② 代码用了一个目录里不存在的 key → 非超管永远 403（fail-closed）。
 *      本脚本用于在新增模块后自动发现这两类问题。
 *
 * 运行：npm run check:permissions            （等价 npx tsx scripts/check-permission-wiring.ts，默认阻断）
 *      npm run check:permissions -- --report-only  （仅报告，不阻断，用于人工排查）
 * 退出码：默认（非 --report-only）下，出现以下任一阻断项即返回 1，可用于 CI / 提交前钩子：
 *       ① 后台接口既无代码级细粒度守卫、也无「已启用」规则覆盖（高风险裸露）；
 *       ② 启用规则的 pathPrefix 非法 / permission 不在权限目录 / 同路径+同方法冲突；
 *       ③ 权限目录或规则层来源不可用（无法确认系统完整性，严禁把读取失败当作"无规则"）。
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const CATALOG_CONFIG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
/** 权限目录的定义文件本身不计入「代码引用」 */
const CATALOG_DEF_FILE = path.join("src", "app", "api", "admin", "permissions", "route.ts");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "public"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

/**
 * 1) 读取权限目录（优先级：数据库 → 仓库快照 → 代码种子）
 * blocking 表示该来源是否完整可信（不完整时只告警、不阻断提交/CI，避免误挡）。
 */
async function loadCatalog(
  snapshotOnly = false
): Promise<{ map: Map<string, string>; source: string; blocking: boolean }> {
  const map = new Map<string, string>();

  const collect = (groups: any) => {
    if (!Array.isArray(groups)) return;
    for (const g of groups) {
      const groupName = g?.group ?? "(未命名模块)";
      for (const k of g?.keys ?? []) {
        if (k?.key) map.set(String(k.key), groupName);
      }
    }
  };

  // ① 数据库（权威）
  if (!snapshotOnly) {
    const prisma = new PrismaClient();
    try {
      const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_CONFIG_KEY } });
      if (row?.value) {
        collect(JSON.parse(row.value));
        if (map.size > 0) return { map, source: "数据库目录（权威）", blocking: true };
      }
    } catch {
      console.log("（数据库不可用，尝试使用仓库快照）");
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  }

  // ② 仓库快照（随代码版本化，CI 使用）
  const snapshotFile = path.join(ROOT, "scripts", "data", "permission-catalog.snapshot.json");
  if (fs.existsSync(snapshotFile)) {
    try {
      collect(JSON.parse(fs.readFileSync(snapshotFile, "utf8")));
      if (map.size > 0) {
        return {
          map,
          source: "仓库快照 scripts/data/permission-catalog.snapshot.json",
          blocking: true,
        };
      }
    } catch {
      console.log("（快照文件解析失败，回退到代码种子）");
    }
  }

  // ③ 代码种子（可能不完整，仅告警）
  const seedFile = path.join(ROOT, "src", "app", "api", "admin", "permissions", "route.ts");
  if (fs.existsSync(seedFile)) {
    const text = fs.readFileSync(seedFile, "utf8");
    for (const m of text.matchAll(/key:\s*"([a-z0-9_]+:[a-z0-9_]+)"/g)) {
      map.set(m[1], "(代码种子)");
    }
  }
  return { map, source: "代码种子（可能不完整）", blocking: false };
}

/**
 * 剔除「权限目录冷启动种子」字面量段落（INITIAL_PERMISSIONS_CATALOG ... ];
 * 目的：目录定义文件里既有冷启动种子、也可能有真实的接口鉴权/策略调用；
 *      整份排除会漏判（曾导致 8 个已接线的 admin:* / permission:* 键被误报为"未接线"），
 *      因此改为只剔除种子段落，其余代码照常参与扫描。
 */
function stripCatalogLiteral(text: string): string {
  const marker = "INITIAL_PERMISSIONS_CATALOG";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  const end = text.indexOf("\n];", idx);
  if (end === -1) return text;
  return text.slice(0, idx) + text.slice(end + 3);
}

async function main() {
  const snapshotOnly = process.argv.includes("--seed-only") || process.argv.includes("--snapshot");
  /** 仅报告模式：用于人工排查；默认（CI/钩子）必须阻断问题 */
  const reportOnly = process.argv.includes("--report-only");
  const { map: catalog, source, blocking } = await loadCatalog(snapshotOnly);
  if (catalog.size === 0) {
    console.error("!! 权限目录为空（数据库与代码种子均未取到），无法自检");
    process.exitCode = 1;
    return;
  }

  const allFiles = walk(path.join(ROOT, "src"));
  const codeFiles = allFiles.filter((f) => rel(f) !== CATALOG_DEF_FILE.replace(/\\/g, "/"));

  // 2) 采集「代码里显式声明的权限点」（菜单 requiredPermission + 接口鉴权字面量）
  const declared = new Map<string, string[]>();
  const record = (key: string, where: string) => {
    const arr = declared.get(key) ?? [];
    if (!arr.includes(where)) arr.push(where);
    declared.set(key, arr);
  };

  const layoutFile = path.join(ROOT, "src", "app", "admin", "layout.tsx");
  if (fs.existsSync(layoutFile)) {
    const text = fs.readFileSync(layoutFile, "utf8");
    for (const m of text.matchAll(/requiredPermission:\s*"([^"]+)"/g)) {
      record(m[1], "src/app/admin/layout.tsx（侧边栏菜单）");
    }
  }

  for (const file of codeFiles) {
    const text = fs.readFileSync(file, "utf8");
    const where = rel(file);
    // requirePlatformPermission(request, "xxx" [, "yyy", ...])  —— 支持「细粒度 ∨ 原键」的多点 OR 写法
    for (const m of text.matchAll(/requirePlatformPermission\(([^)]*)\)/g)) {
      for (const s of m[1].matchAll(/"([^"]+)"/g)) record(s[1], where);
    }
    // requirePermissionGrantAuthority(request, ...) —— 权限授予策略声明的细粒度键
    for (const m of text.matchAll(/requirePermissionGrantAuthority\(([\s\S]*?)\)/g)) {
      for (const s of m[1].matchAll(/"([^"]+)"/g)) record(s[1], where);
    }
    // requireAdmin(request, "xxx")
    for (const m of text.matchAll(/requireAdmin\(\s*[^,()]+,\s*"([^"]+)"\s*\)/g)) {
      record(m[1], where);
    }
    // requireAnyPlatformPermission(request, [ "a", "b" ])  —— 仅能识别字面量写法
    for (const m of text.matchAll(/requireAnyPlatformPermission\(\s*[^,()]+,\s*\[([\s\S]*?)\]/g)) {
      for (const s of m[1].matchAll(/"([^"]+)"/g)) record(s[1], where);
    }
    // 客户端权限判断：hasPermission("xxx")
    for (const m of text.matchAll(/hasPermission\(\s*"([^"]+)"/g)) {
      record(m[1], where);
    }
    // requireSystemSettingsAdmin 隐含 system:settings
    if (/requireSystemSettingsAdmin\(/.test(text)) record("system:settings", where);
  }

  // 2.5) 「接口权限规则层」声明的权限点同样视为已接线
  //      （新模块可通过后台「接口权限规则」直接生效，无需改动接口代码）
  const ruleKeys = new Set<string>();
  const ruleSources: string[] = [];
  /** 规则层原始规则（用于判断某个后台接口是否被「已启用规则」覆盖，以及规则完整性校验） */
  const allRules: {
    id?: string;
    pathPrefix: string;
    enabled: boolean;
    permission?: string;
    methods?: string[];
  }[] = [];
  const collectRuleKeys = (rules: unknown) => {
    if (!Array.isArray(rules)) return;
    for (const r of rules as {
      id?: string;
      permission?: string;
      pathPrefix?: string;
      enabled?: boolean;
      methods?: string[];
    }[]) {
      if (r?.permission) {
        ruleKeys.add(String(r.permission));
        record(String(r.permission), "接口权限规则层（/admin/permissions/api-rules）");
      }
      if (r?.pathPrefix) {
        allRules.push({
          id: r.id ? String(r.id) : undefined,
          pathPrefix: String(r.pathPrefix),
          enabled: Boolean(r.enabled),
          permission: r.permission ? String(r.permission) : undefined,
          methods: Array.isArray(r.methods) ? (r.methods as string[]).map(String) : [],
        });
      }
    }
  };
  if (!snapshotOnly) {
    try {
      const prisma = new PrismaClient();
      try {
        const row = await prisma.systemconfig.findUnique({
          where: { key: "PLATFORM_API_PERMISSION_RULES_V1" },
        });
        if (row?.value) {
          collectRuleKeys(JSON.parse(row.value));
          ruleSources.push("数据库");
        }
      } finally {
        await prisma.$disconnect().catch(() => undefined);
      }
    } catch {
      /* 规则层不可读时忽略，不影响主流程 */
    }
  }
  if (ruleKeys.size === 0) {
    const rulesSnapshot = path.join(ROOT, "scripts", "data", "api-permission-rules.snapshot.json");
    if (fs.existsSync(rulesSnapshot)) {
      try {
        collectRuleKeys(JSON.parse(fs.readFileSync(rulesSnapshot, "utf8")));
        ruleSources.push("仓库快照");
      } catch {
        /* ignore */
      }
    }
  }

  // 3) 逐条比对
  const unknown: [string, string[]][] = [];
  for (const [key, where] of declared) {
    if (!catalog.has(key)) unknown.push([key, where]);
  }

  // 预拼接「全部代码全文」（仅剔除冷启动种子段落），一次性判断某权限点是否真被引用。
  // 注意：这里用 allFiles 而非 codeFiles —— 目录定义文件里的策略/鉴权调用同样属于真实接线。
  const wiredText = allFiles
    .map((f) => stripCatalogLiteral(fs.readFileSync(f, "utf8")))
    .join("\n");

  const unused: [string, string][] = [];
  for (const [key, group] of catalog) {
    if (ruleKeys.has(key)) continue; // 已由「接口权限规则层」接线，视为已引用
    if (wiredText.includes(`"${key}"`)) continue;
    unused.push([key, group]);
  }

  // 4) 输出
  console.log("================ 权限接线自检 ================");
  console.log(`权限目录来源：${source}`);
  console.log(`权限目录：${catalog.size} 个权限点`);
  console.log(`显式接线：${declared.size} 个权限点`);
  console.log(
    `规则层（接口权限规则）：${ruleKeys.size} 个权限点${
      ruleSources.length ? `　来源：${ruleSources.join(" / ")}` : "（未取到，已跳过）"
    }\n`
  );

  if (unknown.length > 0) {
    console.log(
      `${blocking ? "❌" : "⚠️ "} 代码引用了「权限目录中不存在」的权限点（无法在权限配置页勾选；若管理员权限包里也没有该 key，非超管会被拒绝 403）：${unknown.length} 个`
    );
    for (const [key, where] of unknown) {
      console.log(`   - ${key}`);
      for (const w of where) console.log(`       ↳ ${w}`);
    }
    console.log("");
  }

  if (unused.length > 0) {
    const byGroup = new Map<string, string[]>();
    for (const [key, group] of unused) {
      const arr = byGroup.get(group) ?? [];
      arr.push(key);
      byGroup.set(group, arr);
    }
    console.log(`⚠️  目录中已注册、但代码里从未引用的权限点（新模块最容易漏接）：${unused.length} 个`);
    for (const [group, keys] of byGroup) {
      console.log(`   - ${group}`);
      console.log(`       keys: ${keys.join(", ")}`);
      console.log(`       ↳ 请确认菜单 requiredPermission 与接口鉴权是否已改用这些 key`);
    }
    console.log("");
  }

  if (unknown.length === 0 && unused.length === 0) {
    console.log("✅ 全部权限点已正确接线");
  }

  if (unknown.length > 0 && !blocking) {
    console.log("提示：当前权限目录来源为代码种子（可能不完整），以上差异不阻断提交；");
    console.log("      请执行 npm run catalog:snapshot 生成/更新仓库快照后重跑，以获得准确判定。");
  }

  // ============ 后台接口细粒度权限覆盖扫描（高风险 = 阻断项） ============
  /** 阻断项收集：非空且未使用 --report-only 时，脚本退出码为 1 */
  const blockingIssues: string[] = [];

  /** 针对某个未受控接口给出「建议补充哪个权限点 / 哪条规则」 */
  const suggestFor = (routePath: string) => {
    const seg = routePath.replace(/^\/api\/admin\/?/, "").split("/")[0];
    const candidates = [...catalog.keys()].filter((k) => k.startsWith(`${seg}:`)).sort();
    if (candidates.length > 0) {
      return `接入代码级守卫 requirePlatformPermission(request, "${candidates[0]}")（该模块已注册权限点：${candidates.join("、")}）；或在「接口权限设置」页新增规则 pathPrefix=${routePath} 并启用`;
    }
    return `权限目录中暂无与「${seg}」匹配的权限点：请先在「权限配置」注册该模块生成权限点，再接入 requirePlatformPermission(...) 或配置接口规则`;
  };

  const CODE_LEVEL_GUARD = /requirePlatformPermission\(|requirePermissionGrantAuthority\(|requireSystemSettingsAdmin\(/;
  const ROLE_ONLY_GUARD = /isAdminRole\(|isPlatformAdmin\(|isAdmin\(|roleUpper|validateAdmin\(/;

  const isGuardedByEnabledRule = (routePath: string) =>
    allRules.some(
      (r) => r.enabled && (routePath === r.pathPrefix || routePath.startsWith(r.pathPrefix + "/"))
    );

  const adminRouteFiles = walk(path.join(ROOT, "src", "app", "api", "admin")).filter((f) =>
    /route\.ts$/.test(f)
  );

  const codeGuarded: string[] = [];
  const ruleCovered: { p: string; roleOnly: boolean }[] = [];
  const highRisk: { p: string; roleOnly: boolean }[] = [];

  for (const file of adminRouteFiles) {
    const text = fs.readFileSync(file, "utf8");
    // src/app/api/admin/xxx/route.ts -> /api/admin/xxx
    const routePath = rel(file).replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
    if (CODE_LEVEL_GUARD.test(text)) {
      codeGuarded.push(routePath);
    } else if (isGuardedByEnabledRule(routePath)) {
      ruleCovered.push({ p: routePath, roleOnly: ROLE_ONLY_GUARD.test(text) });
    } else {
      highRisk.push({ p: routePath, roleOnly: ROLE_ONLY_GUARD.test(text) });
    }
  }

  console.log("\n============ 后台接口权限覆盖扫描（高风险 = 阻断项） ============");
  console.log(`后台接口文件总数：${adminRouteFiles.length}`);
  console.log(`✅ 代码级细粒度权限（requirePlatformPermission / requirePermissionGrantAuthority / requireSystemSettingsAdmin）：${codeGuarded.length}`);
  console.log(`🟡 仅「接口权限规则层」覆盖（规则已启用，中间件强制校验）：${ruleCovered.length}`);
  for (const item of ruleCovered) {
    console.log(`     · ${item.p}${item.roleOnly ? "　（代码内仅 isAdminRole/validateUser 角色校验）" : ""}`);
  }
  console.log(`🚨 高风险（既无代码级细粒度权限，也无已启用规则覆盖）：${highRisk.length}`);
  for (const item of highRisk) {
    console.log(`     · ${item.p}`);
    console.log(
      `         缺失：${
        item.roleOnly
          ? "仅有 isAdminRole / validateUser 角色校验（无细粒度权限点）"
          : "无任何细粒度权限校验"
      }，且无**已启用**接口规则覆盖`
    );
    console.log(`         建议：${suggestFor(item.p)}`);
    blockingIssues.push(`后台接口未受控：${item.p}（缺代码级细粒度守卫，且无已启用规则覆盖）`);
  }
  if (highRisk.length === 0) {
    console.log("     全后台接口均已有代码级守卫或已启用规则覆盖 ✅");
  }

  // ============ 接口权限规则层完整性校验（阻断项） ============
  console.log("\n============ 接口权限规则层完整性 ============");
  if (ruleSources.length === 0) {
    // 关键：规则读取失败绝不能被当作"没有规则"，否则等于误判为安全
    console.log("🚨 规则层来源不可用：既未读到数据库规则，也未读到仓库快照。");
    console.log("   ⚠️ 严禁把「规则读取失败」当成「无规则」——线上遇到该情况会被故障安全策略以 503 阻断，");
    console.log("      请先执行 npm run catalog:snapshot 生成本地快照，或确认数据库可连接。");
    blockingIssues.push(
      "规则层来源不可用（数据库与仓库快照均未取到）：无法确认当前规则完整性，禁止按「无规则」判定"
    );
  } else {
    const enabledRules = allRules.filter((r) => r.enabled);
    console.log(
      `规则层来源：${ruleSources.join(" / ")}　规则总数 ${allRules.length}，其中已启用 ${enabledRules.length}`
    );

    const expand = (ms?: string[]) =>
      ms && ms.length > 0 ? ms.map((m) => m.toUpperCase()) : ["GET", "POST", "PUT", "PATCH", "DELETE"];

    const badPrefix = enabledRules.filter((r) => !r.pathPrefix.startsWith("/api/admin/"));
    const unknownPerm = enabledRules.filter((r) => r.permission && !catalog.has(r.permission));

    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const r of enabledRules) {
      for (const m of expand(r.methods)) {
        const key = `${r.pathPrefix}#${m}`;
        const prev = seen.get(key);
        if (prev) conflicts.push(`${r.pathPrefix} [${m}]：规则 ${prev} 与 ${r.id ?? "(未命名)"}`);
        else seen.set(key, r.id ?? "(未命名)");
      }
    }

    if (badPrefix.length === 0 && unknownPerm.length === 0 && conflicts.length === 0) {
      console.log("✅ 启用规则的前缀范围、权限点存在性、同路径+同方法冲突校验均通过");
    } else {
      if (badPrefix.length > 0) {
        console.log(`❌ 有 ${badPrefix.length} 条启用规则的 pathPrefix 不以 /api/admin/ 开头（规则层不应覆盖非后台接口）：`);
        badPrefix.forEach((r) => {
          console.log(`     · ${r.pathPrefix}（规则 ID ${r.id ?? "(未命名)"}）`);
          console.log(`       建议：将其 pathPrefix 改为以 /api/admin/ 开头，或停用该规则`);
        });
        blockingIssues.push(`启用规则存在非法 pathPrefix（非 /api/admin/ 前缀）：${badPrefix.length} 条`);
      }
      if (unknownPerm.length > 0) {
        console.log(`❌ 有 ${unknownPerm.length} 条启用规则的 permission 不在权限目录中（无法被管理员勾选，将永久 403）：`);
        unknownPerm.forEach((r) => {
          console.log(`     · ${r.pathPrefix} -> ${r.permission}（规则 ID ${r.id ?? "(未命名)"}）`);
          console.log(`       建议：先在「权限配置」注册权限点 ${r.permission}，或改绑到目录中已有的权限点`);
        });
        blockingIssues.push(`启用规则引用了不存在的权限点：${unknownPerm.length} 条`);
      }
      if (conflicts.length > 0) {
        console.log(`❌ 存在 ${conflicts.length} 组「同路径 + 同方法」的冲突启用规则（配置页已阻止新增，历史数据请清理）：`);
        conflicts.forEach((c) => {
          console.log(`     · ${c}`);
          console.log(`       建议：保留语义正确的那条，停用或删除其余冲突规则`);
        });
        blockingIssues.push(`存在同路径 + 同方法的冲突启用规则：${conflicts.length} 组`);
      }
    }
  }

  // 「代码引用了目录中不存在的权限点」同样属于阻断项（仅在目录来源完整可信时判定，避免误挡）
  if (unknown.length > 0 && blocking) {
    blockingIssues.push(`代码引用了权限目录中不存在的权限点：${unknown.length} 个`);
  }

  // ============ 阻断判定 ============
  if (blockingIssues.length > 0) {
    console.log("\n============ 阻断项汇总 ============");
    blockingIssues.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    if (reportOnly) {
      console.log("\n（--report-only：仅报告，不阻断。请修复后再合入，否则线上仍会被拦截层阻断。）");
    } else {
      console.log(
        "\n❌ 存在上述阻断项，权限接线检查未通过（exit 1）。需人工排查时可执行：npm run check:permissions -- --report-only"
      );
      process.exitCode = 1;
    }
  } else {
    console.log("\n✅ 未发现阻断项：权限目录、代码接线、规则层与后台接口覆盖均通过。");
  }
}

main().catch((e) => {
  console.error("自检脚本执行失败：", e);
  process.exitCode = 1;
});
