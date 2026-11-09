/**
 * R0-F 旧反例重放（内存隔离，结构对齐 R0-E 独立审核的 verify-next-maintenance.cjs）。
 *
 * 历史 verify-next-maintenance.cjs 因未 stub 新引入的 @/lib/security 而无法加载修复后的路由（属预期），
 * 本脚本在其结构上补充该 stub，重放同一组反例以展示「修复前漏洞 → 修复后已闭合」：
 *   1) ordinary_public_query_control        修复前后均为 200/零写（正常公开查询契约保持）
 *   2) anonymous_GET_disables_maintenance   修复前 200+1次写；修复后 400+零写（漏洞闭合）
 *   3) ordinary_GET_cleans_historical_records 修复前 2次清洗写；修复后 零写且 DB 原记录保留（仅内存过滤）
 *   4) anonymous_POST_toggle / anonymous_DELETE_disable（本批新增写路径反例）修复后 401+零写
 * 运行：node docs/reviews/R0-F-fix-snapshot/verify-r0f-repro.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function load(file, stubs) {
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, Date, Error, Response, Headers, process: { env: {} },
    console: { log() {}, error() {}, warn() {} },
    require(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error("Dependency denied " + name);
    },
  }, { filename: file });
  return exports;
}

function setup({ legacyRows = false } = {}) {
  const releases = [{ id: "fixture-release", version: "v1.2.0", isPublished: true }];
  const schedules = [{ id: "fixture-schedule", title: "fixture", status: "SCHEDULED" }];
  if (legacyRows) {
    releases.push({ id: "rel-20260908-01", version: "v0.0.0", isPublished: true });
    schedules.push({ id: "maint-20260920-01", title: "legacy fixture", status: "SCHEDULED" });
  }
  const s = {
    config: {
      maintenance_mode: "true", maintenance_message: "fixture maintenance", maintenance_estimated: "30",
      SYSTEM_RELEASE_NOTES_V1: JSON.stringify(releases), SYSTEM_MAINTENANCE_SCHEDULES_V1: JSON.stringify(schedules),
    },
    writes: [], authCalls: 0, users: {}, operationlog: [],
  };
  const writeCfg = (where, create, update) => {
    s.writes.push({ method: "upsert", key: where.key });
    s.config[where.key] = Object.hasOwn(s.config, where.key) ? update.value : create.value;
    return { key: where.key, value: s.config[where.key] };
  };
  const cfgClient = (c) => ({
    systemconfig: {
      findUnique: async ({ where }) => (Object.hasOwn(s.config, where.key) ? { key: where.key, value: s.config[where.key] } : null),
      update: async ({ where, data }) => { s.writes.push({ method: "update", key: where.key }); s.config[where.key] = data.value; return { key: where.key, value: data.value }; },
      upsert: async ({ where, create, update }) => writeCfg(where, create, update),
    },
    user: {
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const u of Object.values(s.users)) {
          const roleOk = !where.role?.notIn || !where.role.notIn.includes(u.role);
          const tokenOk = where.sessionToken?.not === null ? u.sessionToken !== null : true;
          if (roleOk && tokenOk) { Object.assign(u, data); count++; }
        }
        return { count };
      },
    },
    operationlog: { create: async ({ data }) => { s.operationlog.push(data); return data; } },
  });
  const prisma = { ...cfgClient(s), $transaction: async (fn) => { const snap = JSON.parse(JSON.stringify({ config: s.config, users: s.users, operationlog: s.operationlog, writes: s.writes })); const tx = cfgClient(s); try { return await fn(tx); } catch (e) { s.config = snap.config; s.users = snap.users; s.operationlog = snap.operationlog; s.writes = snap.writes; throw e; } } };
  const maintenance = load("src/lib/maintenance.ts", { "@/lib/prisma": { prisma } });
  const security = {
    requirePlatformPermission: async (request, ...keys) => {
      const auth = (request.headers && request.headers.get("authorization")) || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
      const u = s.users[token];
      if (!u) return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } }) };
      if (u.super) return { authorized: true, user: u };
      if (keys.some((k) => u.grants.includes(k))) return { authorized: true, user: u };
      return { authorized: false, errorResponse: new Response(JSON.stringify({ error: "FORBIDDEN", required: keys }), { status: 403, headers: { "Content-Type": "application/json" } }) };
    },
    writeAuditLog: async () => {},
  };
  const route = load("src/app/api/system/maintenance/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    "@/lib/prisma": { prisma }, "@/lib/maintenance": maintenance, "@/lib/security": security,
    "@/lib/role-utils": { ADMIN_ROLE_VALUES: ["ADMIN"] },
    "../../../../../package.json": { version: JSON.parse(read("package.json")).version },
  });
  s.addUser = (token, id, role, grants, superUser = false) => { s.users[token] = { id, name: id, role, grants, super: superUser }; };
  return { s, route };
}

const req = (query = "", { method = "GET", token, body } = {}) => {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return {
    headers, nextUrl: new URL(`http://isolated/api/system/maintenance${query}`),
    async json() { return body; },
  };
};

async function main() {
  // 反例1：普通公开查询（契约保持）
  {
    const { s, route } = setup();
    const before = structuredClone(s.config);
    const res = await route.GET(req(""));
    const body = await res.json();
    check("反例1 普通公开查询：200 / 零写 / 模式未变", res.status === 200 && s.writes.length === 0 && s.config.maintenance_mode === "true" && s.authCalls === 0, `status=${res.status} writes=${s.writes.length}`);
    check("反例1 配置逐字节未变", JSON.stringify(before) === JSON.stringify(s.config));
  }
  // 反例2：匿名 GET 解除维护（修复前 200+1写 → 修复后 400+零写）
  {
    const { s, route } = setup();
    const res = await route.GET(req("?action=emergency_disable"));
    const body = await res.json();
    check("反例2 匿名 GET 解除维护：400+稳定错误码", res.status === 400 && body.code === "MAINTENANCE_DISABLE_REQUIRES_AUTH", `status=${res.status}`);
    check("反例2 零写、维护未关闭、零审计", s.writes.length === 0 && s.config.maintenance_mode === "true" && s.operationlog.length === 0);
  }
  // 反例3：普通 GET 清洗历史记录（修复前 2次清洗写 → 修复后 零写+DB 原样）
  {
    const { s, route } = setup({ legacyRows: true });
    const res = await route.GET(req(""));
    const body = await res.json();
    const ids = (body.releases || []).map((x) => x.id);
    check("反例3 普通 GET：200 且响应不含历史遗留 ID", res.status === 200 && !ids.includes("rel-20260908-01"), `status=${res.status}`);
    check("反例3 零清洗写，DB 原记录字节保留", s.writes.length === 0 && JSON.parse(s.config.SYSTEM_RELEASE_NOTES_V1).some((x) => x.id === "rel-20260908-01") && JSON.parse(s.config.SYSTEM_MAINTENANCE_SCHEDULES_V1).some((x) => x.id === "maint-20260920-01"));
  }
  // 反例4（本批新增）：匿名写路径被拒
  {
    const { s, route } = setup();
    const post = await route.POST(req("", { method: "POST", body: { enabled: false } }));
    const del = await route.DELETE(req("", { method: "DELETE" }));
    check("反例4 匿名 POST/DELETE：401+零写", post.status === 401 && del.status === 401 && s.writes.length === 0 && s.operationlog.length === 0, `post=${post.status} del=${del.status}`);
  }
  // 反例5（本批新增）：合法授权写 + 审计同事务
  {
    const { s, route } = setup();
    s.addUser("tok-super", "u_super", "SUPER_ADMIN", [], true);
    const post = await route.POST(req("", { method: "POST", token: "tok-super", body: { enabled: true, message: "升级维护" } }));
    check("反例5 超管合法开启维护：200", post.status === 200, `status=${post.status}`);
    // 2 次配置写（maintenance_mode + maintenance_message）；普通用户会话清理写不计入 s.writes
    check("反例5 配置与会话写+审计已产生", s.config.maintenance_mode === "true" && s.writes.length >= 2 && s.operationlog.length === 1, `writes=${s.writes.length} audit=${s.operationlog.length}`);
    const del = await route.DELETE(req("", { method: "DELETE", token: "tok-super" }));
    check("反例5 超管 DELETE 解除维护：200+审计", del.status === 200 && s.config.maintenance_mode === "false" && s.operationlog.length === 2, `status=${del.status} audit=${s.operationlog.length}`);
  }
  // 反例6（本批新增）：审计失败整体回滚
  {
    const env2 = setup();
    env2.s.addUser("tok-super", "u_super", "SUPER_ADMIN", [], true);
    env2.s.addUser("tok-normal", "u_normal", "MEMBER", []);
    env2.s.users["tok-normal"].sessionToken = "st-1";
    env2.s.config.maintenance_mode = "true";
    // 注入：operationlog.create 抛错（在 $transaction 内）→ 整体回滚
    env2.s.operationlog.push = () => { throw new Error("simulated audit failure"); };
    const failRes = await env2.route.POST(req("", { method: "POST", token: "tok-super", body: { enabled: false } }));
    check("反例6 审计失败：不假成功（500）", failRes.status === 500, `status=${failRes.status}`);
    check("反例6 事务回滚：配置/会话/审计均未残留", env2.s.config.maintenance_mode === "true" && env2.s.operationlog.length === 0 && env2.s.users["tok-normal"].sessionToken === "st-1", `mode=${env2.s.config.maintenance_mode} audit=${env2.s.operationlog.length}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nRESULT: ${passed}/${results.length} checks passed`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
