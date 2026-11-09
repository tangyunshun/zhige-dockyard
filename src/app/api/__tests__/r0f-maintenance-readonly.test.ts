/**
 * R0-F 修复验证：原方案 F09 公开维护查询只读、维护变更授权与审计。
 *
 * 隔离策略（仅替换持久化 / 身份权限 / 审计持久化 IO，执行真实 route + 真实 maintenance.ts 帮助函数）：
 * - @/lib/prisma 换成内存模型，支持 $transaction（含快照回滚）与故障注入；
 * - @/lib/security 的 requirePlatformPermission 换成内存权限模型，严格复刻「多键 OR、超管放行」语义；
 *   双权限 AND 由路由分别两次调用实现（不交给 helper 当 AND）。
 * 不 mock resolvePaymentMode 式绕过：本批直接验证真实裁决与真实路由。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import * as route from "@/app/api/system/maintenance/route";
import { setMaintenanceCache, isMaintenanceModeSync } from "@/lib/maintenance";

const h = vi.hoisted(() => {
  const store = {
    systemconfig: new Map<string, { key: string; value: string }>(),
    user: new Map<string, any>(),
    operationlog: [] as any[],
  };
  const fault = { audit: false, config: false, commit: false };
  const permState = {
    users: new Map<string, { id: string; name: string; role: string }>(),
    grants: new Map<string, Set<string>>(),
    superadmins: new Set<string>(),
  };
  return { store, fault, permState };
});

function makePrisma(s: typeof h.store, f: typeof h.fault) {
  let txDepth = 0; // [R0-F1] 事务进行中根客户端写直接失败（封闭 stub 检测 ROOT 写逃逸）
  const guardRootWrite = () => {
    if (txDepth > 0) throw new Error("ROOT_WRITE_DURING_TX");
  };
  const clone = () => ({
    systemconfig: new Map([...s.systemconfig].map(([k, v]) => [k, { ...v }])),
    user: new Map([...s.user].map(([k, v]) => [k, { ...v }])),
    operationlog: [...s.operationlog],
  });
  const applyWhere = (where: any) => {
    const row = s.systemconfig.get(where.key);
    return row ? { ...row } : null;
  };
  const writeCfg = (where: any, create: any, update: any) => {
    if (f.config) throw new Error("simulated config write failure");
    const value = (update ?? create).value;
    const row = { key: where.key, value };
    s.systemconfig.set(where.key, row);
    return row;
  };
  const withAuditDefaults = (data: any) => ({
    ...data,
    // 模拟 operationlog.createdAt 的数据库默认值（真实 Prisma @default(now())）
    createdAt: data.createdAt ?? new Date().toISOString(),
  });
  const matchUser = (u: any, where: any) => {
    const roleOk = !where.role?.notIn || !where.role.notIn.includes(u.role);
    const tokenOk = where.sessionToken?.not === null ? u.sessionToken !== null : true;
    return roleOk && tokenOk;
  };
  const base = {
    systemconfig: {
      findUnique: async ({ where }: any) => applyWhere(where),
      upsert: async ({ where, create, update }: any) => {
        guardRootWrite();
        return writeCfg(where, create, update);
      },
      update: async ({ where, data }: any) => {
        guardRootWrite();
        const row = s.systemconfig.get(where.key);
        if (row) row.value = data.value;
        return row;
      },
    },
    user: {
      findUnique: async ({ where }: any) => (s.user.get(where.id) ? { ...s.user.get(where.id) } : null),
      updateMany: async ({ where, data }: any) => {
        guardRootWrite();
        let count = 0;
        for (const u of s.user.values()) {
          if (matchUser(u, where)) {
            Object.assign(u, data);
            count++;
          }
        }
        return { count };
      },
    },
    operationlog: {
      create: async ({ data }: any) => {
        guardRootWrite();
        if (f.audit) throw new Error("simulated audit failure");
        s.operationlog.push(withAuditDefaults(data));
        return data;
      },
    },
  };
  return {
    ...base,
    $transaction: async (fn: any) => {
      txDepth++;
      const snap = clone();
      const tx = {
        systemconfig: {
          findUnique: async ({ where }: any) => applyWhere(where),
          upsert: async ({ where, create, update }: any) => writeCfg(where, create, update),
          update: async ({ where, data }: any) => {
            const row = s.systemconfig.get(where.key);
            if (row) row.value = data.value;
            return row;
          },
        },
        user: {
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            for (const u of s.user.values()) {
              if (matchUser(u, where)) {
                Object.assign(u, data);
                count++;
              }
            }
            return { count };
          },
        },
        operationlog: {
          create: async ({ data }: any) => {
            if (f.audit) throw new Error("simulated audit failure");
            s.operationlog.push(withAuditDefaults(data));
            return data;
          },
        },
      };
      try {
        const result = await fn(tx);
        // [R0-F1 G04] 提交阶段故障：回调已执行完成之后失败（写入随后被回滚）
        if (f.commit) {
          f.commit = false;
          throw new Error("simulated commit failure");
        }
        return result;
      } catch (e) {
        // 事务回滚：恢复快照，绝不保留未提交的配置/会话/审计
        s.systemconfig = snap.systemconfig;
        s.user = snap.user;
        s.operationlog = snap.operationlog;
        throw e;
      } finally {
        txDepth--;
      }
    },
  };
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma(h.store, h.fault) }));

vi.mock("@/lib/security", () => ({
  requirePlatformPermission: async (request: any, ...keys: string[]) => {
    const authHeader = request?.headers?.get?.("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const u = h.permState.users.get(token);
    if (!u) {
      return {
        authorized: false,
        errorResponse: new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    if (h.permState.superadmins.has(u.id)) return { authorized: true, user: u };
    const granted = h.permState.grants.get(u.id) || new Set<string>();
    // 多键 OR 语义（复刻 requirePlatformPermission 真实行为）
    if (keys.some((k) => granted.has(k))) return { authorized: true, user: u };
    return {
      authorized: false,
      errorResponse: new Response(JSON.stringify({ error: "FORBIDDEN", required: keys }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  },
  writeAuditLog: async () => {},
}));

// ---- 种子数据 ----
function seed() {
  h.store.systemconfig.clear();
  h.store.user.clear();
  h.store.operationlog.length = 0;
  h.fault.audit = false;
  h.fault.config = false;
  h.fault.commit = false;
  h.permState.users.clear();
  h.permState.grants.clear();
  h.permState.superadmins.clear();

  h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "true" });
  h.store.systemconfig.set("maintenance_message", { key: "maintenance_message", value: "维护中" });
  h.store.systemconfig.set("maintenance_estimated", { key: "maintenance_estimated", value: "30" });
  h.store.systemconfig.set("system_version", { key: "system_version", value: "v1.0.0" });
  h.store.systemconfig.set("SYSTEM_RELEASE_NOTES_V1", {
    key: "SYSTEM_RELEASE_NOTES_V1",
    value: JSON.stringify([
      { id: "fixture-release", version: "v1.2.0", title: "正式发布", isPublished: true },
      { id: "rel-20260908-01", version: "v0.0.0", title: "历史遗留假数据", isPublished: true },
    ]),
  });
  h.store.systemconfig.set("SYSTEM_MAINTENANCE_SCHEDULES_V1", {
    key: "SYSTEM_MAINTENANCE_SCHEDULES_V1",
    value: JSON.stringify([
      { id: "fixture-schedule", title: "排期", status: "SCHEDULED" },
      { id: "maint-20260920-01", title: "历史遗留假数据", status: "SCHEDULED" },
    ]),
  });
  h.store.systemconfig.set("SYSTEM_UPDATE_SETTINGS_V1", {
    key: "SYSTEM_UPDATE_SETTINGS_V1",
    value: JSON.stringify({ popupTitle: "公告" }),
  });

  // 用户：1 普通用户（有会话）、若干管理员权限组合
  h.store.user.set("u_normal", {
    id: "u_normal",
    name: "普通用户",
    role: "MEMBER",
    sessionToken: "tok-normal",
    sessionExpiresAt: new Date().toISOString(),
    refreshToken: "r-normal",
  });

  const mkUser = (id: string, name: string, role: string, grants: string[]) => {
    h.permState.users.set(id, { id, name, role });
    h.permState.grants.set(id, new Set(grants));
  };
  mkUser("u_toggle", "开关管理员", "PLATFORM_ADMIN", ["system:maintenance_toggle"]);
  mkUser("u_publish", "发布管理员", "PLATFORM_ADMIN", ["maintenance:publish"]);
  mkUser("u_both", "双权限管理员", "PLATFORM_ADMIN", ["system:maintenance_toggle", "maintenance:publish"]);
  mkUser("u_read", "只读管理员", "PLATFORM_ADMIN", ["maintenance:read"]);
  // 普通登录用户也属于权限模型中的已认证用户，但无任何维护权限
  mkUser("u_normal", "普通用户", "MEMBER", []);
  mkUser("u_super", "超级管理员", "SUPER_ADMIN", []);
  // 超管按现有权威 helper 规则放行，不走 grant 匹配
  h.permState.superadmins.add("u_super");

  setMaintenanceCache(true);
}

function makeReq(method: string, opts: { query?: string; token?: string; body?: any } = {}) {
  const url = `http://localhost/api/system/maintenance${opts.query ?? ""}`;
  const headers: any = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (method === "POST" || method === "DELETE") headers["Content-Type"] = "application/json";
  const init: any = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new NextRequest(url, init);
}

const callGET = async (query = "", token?: string) => {
  const res = (await route.GET(makeReq("GET", { query, token }))) as Response;
  return { status: res.status, body: await res.json() };
};
const callPOST = async (body: any, token?: string) => {
  const res = (await route.POST(makeReq("POST", { token, body }))) as Response;
  return { status: res.status, body: await res.json() };
};
const callDELETE = async (token?: string) => {
  const res = (await route.DELETE(makeReq("DELETE", { token }))) as Response;
  return { status: res.status, body: await res.json() };
};

const cfg = (key: string) => h.store.systemconfig.get(key)?.value;
const auditCount = () => h.store.operationlog.length;

beforeEach(seed);

describe("F01 公开 GET 全程只读（含 emergency_disable / 重复参数）", () => {
  it("匿名带 emergency_disable → 400，不关闭维护、零写、不清会话", async () => {
    const before = cfg("maintenance_mode");
    const r = await callGET("?action=emergency_disable");
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("MAINTENANCE_DISABLE_REQUIRES_AUTH");
    expect(cfg("maintenance_mode")).toBe(before); // 未改变
    expect(auditCount()).toBe(0);
    expect(h.store.user.get("u_normal")!.sessionToken).toBe("tok-normal");
  });

  it("普通匿名 GET 正常 → 200，零写", async () => {
    const r = await callGET("");
    expect(r.status).toBe(200);
    expect(auditCount()).toBe(0);
    expect(cfg("maintenance_mode")).toBe("true");
  });

  it("重复 / t 参数 GET → 200，零写", async () => {
    const r = await callGET("?t=1&t=2&cache=123");
    expect(r.status).toBe(200);
    expect(auditCount()).toBe(0);
  });

  it("已登录管理员 GET → 200，零写", async () => {
    const r = await callGET("", "u_toggle");
    expect(r.status).toBe(200);
    expect(auditCount()).toBe(0);
  });
});

describe("F02 旧 ID 命中 / 空配置 / 读取失败路径零清洗写", () => {
  it("旧 ID 记录仅在内存过滤，DB 原记录字节不变", async () => {
    const r = await callGET("");
    expect(r.status).toBe(200);
    // 响应不含历史遗留假数据
    const ids = (r.body.releases || []).map((x: any) => x.id);
    expect(ids).toContain("fixture-release");
    expect(ids).not.toContain("rel-20260908-01");
    const schedIds = (r.body.schedules || []).map((x: any) => x.id);
    expect(schedIds).not.toContain("maint-20260920-01");
    // DB 原始值仍含假数据（未回写清洗）
    const rawReleases = JSON.parse(cfg("SYSTEM_RELEASE_NOTES_V1")!);
    expect(rawReleases.some((x: any) => x.id === "rel-20260908-01")).toBe(true);
    expect(auditCount()).toBe(0);
  });
});

describe("F03 未登录 / 普通 / 只读管理员写操作被拒，零写", () => {
  it("未登录 POST/DELETE → 401，零写", async () => {
    expect((await callPOST({ enabled: false })).status).toBe(401);
    expect((await callDELETE()).status).toBe(401);
    expect(auditCount()).toBe(0);
    expect(cfg("maintenance_mode")).toBe("true");
  });

  it("普通登录用户 POST/DELETE → 403，零写", async () => {
    expect((await callPOST({ enabled: false }, "u_normal")).status).toBe(403);
    expect((await callDELETE("u_normal")).status).toBe(403);
    expect(auditCount()).toBe(0);
  });

  it("只读管理员（maintenance:read）POST → 403，零写", async () => {
    expect((await callPOST({ enabled: false }, "u_read")).status).toBe(403);
    expect(auditCount()).toBe(0);
    expect(cfg("maintenance_mode")).toBe("true");
  });
});

describe("F04 动作权限精确 / 双权限 AND / 未知 action", () => {
  it("仅 toggle 权限：可开关、不可发布", async () => {
    expect((await callPOST({ enabled: false }, "u_toggle")).status).toBe(200);
    expect(cfg("maintenance_mode")).toBe("false");
    expect(auditCount()).toBe(1);
    // 重新开启以便后续断言
    await callPOST({ enabled: true }, "u_toggle");
    expect((await callPOST({ action: "create_schedule", schedule: { title: "X", startTime: "2026-01-01 10:00" } }, "u_toggle")).status).toBe(403);
  });

  it("仅 publish 权限：可发布、不可基础开关、不可 sync 越权", async () => {
    expect((await callPOST({ action: "create_release", release: { version: "v2.0.0", title: "T" } }, "u_publish")).status).toBe(200);
    expect((await callPOST({ enabled: true }, "u_publish")).status).toBe(403);
    // 计划同步模式需双权限，单 publish 应被拒（OR 不能当 AND）
    const sync = await callPOST(
      { action: "update_schedule", schedule: { id: "fixture-schedule", status: "IN_PROGRESS" }, syncMaintenanceMode: true },
      "u_publish",
    );
    expect(sync.status).toBe(403);
    expect(cfg("maintenance_mode")).toBe("true");
  });

  it("双权限管理员：计划同步模式可改维护状态", async () => {
    const r = await callPOST(
      {
        action: "update_schedule",
        schedule: { id: "fixture-schedule", title: "排期", startTime: "2026-02-01 02:00", status: "IN_PROGRESS" },
        syncMaintenanceMode: true,
      },
      "u_both",
    );
    expect(r.status).toBe(200);
    expect(cfg("maintenance_mode")).toBe("true");
    expect(auditCount()).toBe(1);
  });

  it("未知 action → 400，零写", async () => {
    const r = await callPOST({ action: "hacked_payload" }, "u_super");
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("UNKNOWN_ACTION");
    expect(auditCount()).toBe(0);
  });
});

describe("F05 合法管理流程保持 + GET 仍可读", () => {
  it("超管开启维护（含 message/分钟 + 清会话）→ 200，配置/审计/缓存一致", async () => {
    const r = await callPOST({ enabled: true, message: "系统升级中", estimatedMinutes: "45" }, "u_super");
    expect(r.status).toBe(200);
    expect(r.body.maintenanceMode).toBe(true);
    expect(r.body.maintenanceMessage).toBe("系统升级中");
    expect(r.body.estimatedMinutes).toBe("45");
    expect(cfg("maintenance_mode")).toBe("true");
    expect(cfg("maintenance_message")).toBe("系统升级中");
    expect(cfg("maintenance_estimated")).toBe("45");
    expect(auditCount()).toBe(1);
    // 普通用户会话被清
    expect(h.store.user.get("u_normal")!.sessionToken).toBeNull();
  });

  it("开启后 GET 仍可读且反映新状态", async () => {
    await callPOST({ enabled: true, message: "系统升级中" }, "u_super");
    const r = await callGET("");
    expect(r.status).toBe(200);
    expect(r.body.maintenanceMode).toBe(true);
    expect(r.body.maintenanceMessage).toBe("系统升级中");
  });

  it("超管发布公告/计划/设置 → 200 且持久化", async () => {
    const rel = await callPOST({ action: "create_release", release: { version: "v3.0.0", title: "新功能" } }, "u_super");
    expect(rel.status).toBe(200);
    expect((rel.body.releases || []).some((x: any) => x.version === "v3.0.0")).toBe(true);
    const sched = await callPOST(
      { action: "create_schedule", schedule: { title: "例行维护", startTime: "2026-02-01 02:00" } },
      "u_super",
    );
    expect(sched.status).toBe(200);
    expect((sched.body.schedules || []).some((x: any) => x.title === "例行维护")).toBe(true);
    const set = await callPOST({ action: "save_update_settings", settings: { popupTitle: "新版公告" } }, "u_super");
    expect(set.status).toBe(200);
  });

  it("超管 DELETE 解除维护 → 200，maintenance_mode=false", async () => {
    const r = await callDELETE("u_super");
    expect(r.status).toBe(200);
    expect(cfg("maintenance_mode")).toBe("false");
    expect(auditCount()).toBeGreaterThan(0);
  });
});

describe("F06 配置/审计/提交故障注入 → 不假成功、事务回滚", () => {
  it("审计写失败：配置变更整体回滚，maintenance_mode 不变、无审计、会话不残留", async () => {
    h.fault.audit = true;
    const r = await callPOST({ enabled: false }, "u_super");
    expect(r.status).toBe(500);
    // 回滚：配置未变、审计未落、普通用户会话未清
    expect(cfg("maintenance_mode")).toBe("true");
    expect(auditCount()).toBe(0);
    expect(h.store.user.get("u_normal")!.sessionToken).toBe("tok-normal");
    h.fault.audit = false;
  });

  it("配置写失败：事务回滚，审计未落", async () => {
    h.fault.config = true;
    const r = await callPOST({ enabled: false }, "u_super");
    expect(r.status).toBe(500);
    expect(cfg("maintenance_mode")).toBe("true");
    expect(auditCount()).toBe(0);
    h.fault.config = false;
  });
});

describe("F07 路由级契约（页面交互由 verify-r0f-pages.cjs 覆盖）", () => {
  it("权限拒绝返回结构体含 error，而非 success", async () => {
    const r = await callPOST({ enabled: false }, "u_normal");
    expect(r.status).toBe(403);
    expect(r.body.success).toBeUndefined();
    expect(typeof r.body.error).toBe("string");
  });
});

// ══════════════════════════════════════════════════════
// R0-F1：审计事实补齐（G01—G04）
// 测试比对实际旧状态、实际新状态与日志内容（含生成 ID），不仅断言日志数量。
// ══════════════════════════════════════════════════════

describe("R0-F1 G01 设置/版本审计事实", () => {
  it("只改 popupTitle（不传 systemVersion）：日志有实际目标键与真实前后值，不虚构版本变更", async () => {
    const r = await callPOST({ action: "save_update_settings", settings: { popupTitle: "新公告标题" } }, "u_publish");
    expect(r.status).toBe(200);
    expect(auditCount()).toBe(1);
    const log = h.store.operationlog[0];
    expect(log.action).toBe("maintenance:update_settings");
    expect(log.userId).toBe("u_publish");
    expect(log.details.target).toBe("SYSTEM_UPDATE_SETTINGS_V1"); // 单目标：不含未提交的 system_version
    expect(log.details.before.popupTitle).toBe("公告"); // 事务内真实旧值
    expect(log.details.after.popupTitle).toBe("新公告标题");
    expect(log.details.changed).toBe(true);
    expect(log.details.before.systemVersion).toBeUndefined();
    // 日志与实际数据库一致
    expect(JSON.parse(cfg("SYSTEM_UPDATE_SETTINGS_V1")!).popupTitle).toBe("新公告标题");
  });

  it("版本单改：目标含 system_version，前后版本真实一致", async () => {
    await callPOST({ action: "save_update_settings", settings: { systemVersion: "v2.0.0" } }, "u_publish");
    const log = h.store.operationlog[0];
    expect(log.details.target).toEqual(["SYSTEM_UPDATE_SETTINGS_V1", "system_version"]);
    expect(log.details.before.systemVersion).toBe("v1.0.0");
    expect(log.details.after.systemVersion).toBe("v2.0.0");
    expect(cfg("system_version")).toBe("v2.0.0");
  });

  it("混改（设置 + 版本）：两组前后事实均真实", async () => {
    await callPOST(
      { action: "save_update_settings", settings: { popupTitle: "混改标题", forceUpdate: true, systemVersion: "v3.0.0" } },
      "u_publish",
    );
    const log = h.store.operationlog[0];
    expect(log.details.before.popupTitle).toBe("公告");
    expect(log.details.after.popupTitle).toBe("混改标题");
    expect(log.details.before.forceUpdate).toBe(false);
    expect(log.details.after.forceUpdate).toBe(true);
    expect(log.details.before.systemVersion).toBe("v1.0.0");
    expect(log.details.after.systemVersion).toBe("v3.0.0");
    const db = JSON.parse(cfg("SYSTEM_UPDATE_SETTINGS_V1")!);
    expect(db.forceUpdate).toBe(true);
  });

  it("重复提交相同值：changed=false，不虚构修改", async () => {
    await callPOST({ action: "save_update_settings", settings: { popupTitle: "公告" } }, "u_publish");
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(false);
    expect(log.details.before.popupTitle).toBeUndefined(); // 无变化 → 空 diff，不虚构
    expect(log.details.after.popupTitle).toBeUndefined();
  });
});

describe("R0-F1 G02 计划/公告审计事实", () => {
  it("create_schedule：日志含实际生成的记录 ID 与创建事实，与数据库一致", async () => {
    const r = await callPOST(
      { action: "create_schedule", schedule: { title: "新维护任务", startTime: "2026-12-01 02:00", status: "SCHEDULED", type: "UPGRADE" } },
      "u_publish",
    );
    expect(r.status).toBe(200);
    const createdId = r.body.schedules[0].id;
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe(createdId); // 实际生成 ID，不是请求中的 undefined
    expect(log.details.before).toBeNull();
    expect(log.details.after.title).toBe("新维护任务");
    expect(log.details.after.status).toBe("SCHEDULED");
    const db = JSON.parse(cfg("SYSTEM_MAINTENANCE_SCHEDULES_V1")!);
    expect(db.some((s: any) => s.id === createdId)).toBe(true);
  });

  it("计划同步维护开关（syncMaintenanceMode）：可看到两个实际目标 + 模式前后 + 实际写入说明", async () => {
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    const r = await callPOST(
      { action: "create_schedule", schedule: { title: "即时维护", startTime: "2026-12-01 02:00", status: "IN_PROGRESS" }, syncMaintenanceMode: true },
      "u_both", // 需要 publish + toggle 双权限
    );
    expect(r.status).toBe(200);
    const createdId = r.body.schedules[0].id;
    const log = h.store.operationlog[0];
    expect(log.details.target).toEqual([createdId, "maintenance_mode"]);
    expect(log.details.syncMaintenanceMode).toBe(true);
    expect(log.details.maintenanceModeBefore).toBe(false); // 事务内真实旧状态
    expect(log.details.maintenanceModeAfter).toBe(true);
    expect(log.details.maintenanceMessageWritten).toContain("即时维护");
    expect(cfg("maintenance_mode")).toBe("true");
    expect(cfg("maintenance_message")).toContain("即时维护");
  });

  it("update_schedule：diff 只含实际变化字段，目标匹配", async () => {
    await callPOST(
      { action: "update_schedule", schedule: { id: "fixture-schedule", title: "排期", startTime: "2026-01-01 00:00", status: "COMPLETED" } },
      "u_publish",
    );
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe("fixture-schedule");
    expect(log.details.before.status).toBe("SCHEDULED");
    expect(log.details.after.status).toBe("COMPLETED");
    expect(log.details.before.title).toBeUndefined(); // title 未变化，不进入 diff
    expect(log.details.changed).toBe(true);
  });

  it("delete_schedule：被删目标必要事实 + 删除后事实；目标不存在时如实标记 matched=false", async () => {
    await callPOST({ action: "delete_schedule", scheduleId: "fixture-schedule" }, "u_publish");
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe("fixture-schedule");
    expect(log.details.before.title).toBe("排期");
    expect(log.details.after.deleted).toBe(true);
    expect(JSON.parse(cfg("SYSTEM_MAINTENANCE_SCHEDULES_V1")!).some((s: any) => s.id === "fixture-schedule")).toBe(false);

    await callPOST({ action: "delete_schedule", scheduleId: "not-exist" }, "u_publish");
    const log2 = h.store.operationlog[1];
    expect(log2.details.changed).toBe(false);
    expect(log2.details.matched).toBe(false);
  });

  it("create_release：实际新 ID + 创建事实；toggle_release_publish：公示真实前后", async () => {
    const r = await callPOST({ action: "create_release", release: { version: "v9.9.9", title: "新版本发布" } }, "u_publish");
    expect(r.status).toBe(200);
    const newId = r.body.releases[0].id;
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe(newId);
    expect(log.details.before).toBeNull();
    expect(log.details.after.version).toBe("v9.9.9");
    expect(log.details.after.isPublished).toBe(true);

    await callPOST({ action: "toggle_release_publish", releaseId: newId, isPublished: false }, "u_publish");
    const log2 = h.store.operationlog[1];
    expect(log2.details.target).toBe(newId);
    expect(log2.details.before.isPublished).toBe(true); // 事务内读取的真实旧公示状态
    expect(log2.details.after.isPublished).toBe(false);
    expect(JSON.parse(cfg("SYSTEM_RELEASE_NOTES_V1")!).find((x: any) => x.id === newId).isPublished).toBe(false);
  });

  it("delete_release：原目标必要事实与删除后事实", async () => {
    await callPOST({ action: "delete_release", releaseId: "fixture-release" }, "u_publish");
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe("fixture-release");
    expect(log.details.before.version).toBe("v1.2.0");
    expect(log.details.after.deleted).toBe(true);
    expect(JSON.parse(cfg("SYSTEM_RELEASE_NOTES_V1")!).some((r: any) => r.id === "fixture-release")).toBe(false);
  });
});

describe("R0-F1 G03 维护开关审计事实", () => {
  it("false→true 开启（含说明与时长）：真实前后 + 清理会话数；保留操作者/动作/时间；不含会话原值或密钥", async () => {
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    const r = await callPOST({ enabled: true, message: "计划内维护", estimatedMinutes: 45 }, "u_toggle");
    expect(r.status).toBe(200);
    const log = h.store.operationlog[0];
    expect(log.details.target).toEqual(["maintenance_mode", "maintenance_message", "maintenance_estimated"]);
    expect(log.details.before.maintenanceMode).toBe(false);
    expect(log.details.after.maintenanceMode).toBe(true);
    expect(log.details.before.maintenanceMessage).toBe("维护中"); // 事务内真实旧值
    expect(log.details.after.maintenanceMessage).toBe("计划内维护");
    expect(log.details.before.estimatedMinutes).toBe("30");
    expect(log.details.after.estimatedMinutes).toBe("45");
    expect(log.details.sessionsCleared).toBe(1);
    // 操作者/动作/时间保留
    expect(log.userId).toBe("u_toggle");
    expect(log.action).toBe("system:maintenance_toggle");
    expect(typeof log.createdAt).toBe("string");
    // 不含会话原值/密钥
    const raw = JSON.stringify(log.details);
    expect(raw).not.toContain("tok-normal");
    expect(raw).not.toContain("r-normal");
  });

  it("true→false 关闭（不传 message/时长）：只记模式目标，清会话数为 0", async () => {
    const r = await callPOST({ enabled: false }, "u_toggle"); // seed 模式为 true
    expect(r.status).toBe(200);
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe("maintenance_mode");
    expect(log.details.before.maintenanceMode).toBe(true);
    expect(log.details.after.maintenanceMode).toBe(false);
    expect(log.details.sessionsCleared).toBe(0);
  });

  it("DELETE 解除维护：before true → after false，来源标记 DELETE", async () => {
    await callDELETE("u_toggle"); // seed 模式为 true
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe("maintenance_mode");
    expect(log.details.before.maintenanceMode).toBe(true);
    expect(log.details.after.maintenanceMode).toBe(false);
    expect(log.details.changed).toBe(true);
    expect(log.details.via).toBe("DELETE");
  });

  it("仅改说明（模式不变）：说明前后真实，模式前后相同也如实记录", async () => {
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    await callPOST({ enabled: false, message: "新说明" }, "u_toggle");
    const log = h.store.operationlog[0];
    expect(log.details.before.maintenanceMode).toBe(false);
    expect(log.details.after.maintenanceMode).toBe(false);
    expect(log.details.before.maintenanceMessage).toBe("维护中");
    expect(log.details.after.maintenanceMessage).toBe("新说明");
    expect(log.details.changed).toBe(true);
  });
});

describe("R0-F1 G04 故障注入：完整回滚、缓存原状态、无 ROOT 写逃逸", () => {
  it("配置中途失败 → 500、零审计、配置保持原状", async () => {
    h.fault.config = true;
    const r = await callPOST({ action: "save_update_settings", settings: { popupTitle: "X" } }, "u_publish");
    expect(r.status).toBe(500);
    expect(auditCount()).toBe(0);
    expect(JSON.parse(cfg("SYSTEM_UPDATE_SETTINGS_V1")!).popupTitle).toBe("公告");
  });

  it("开启维护：会话清理已执行后审计失败 → 会话完整回滚、缓存保持 false（false→true 方向）", async () => {
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    h.fault.audit = true; // 审计失败发生在清会话 updateMany（回调最后一步）之后
    const r = await callPOST({ enabled: true }, "u_toggle");
    expect(r.status).toBe(500);
    expect(h.store.user.get("u_normal")!.sessionToken).toBe("tok-normal"); // 会话未被真正清理
    expect(h.store.user.get("u_normal")!.refreshToken).toBe("r-normal");
    expect(auditCount()).toBe(0);
    expect(isMaintenanceModeSync()).toBe(false); // 缓存保持原状态，未提前发布 true
    expect(cfg("maintenance_mode")).toBe("false");
  });

  it("回调执行完成后提交失败 → 配置/审计完整回滚，缓存保持 true（true→false 方向）", async () => {
    h.fault.commit = true;
    const r = await callDELETE("u_toggle");
    expect(r.status).toBe(500);
    expect(cfg("maintenance_mode")).toBe("true");
    expect(auditCount()).toBe(0);
    expect(isMaintenanceModeSync()).toBe(true); // 缓存保持原状态
  });

  it("无 ROOT 写逃逸：事务期间任何根客户端写直接失败（封闭 stub），正常开启维护流程全部经 TX", async () => {
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    const r = await callPOST({ enabled: true, message: "逃逸检测" }, "u_toggle");
    expect(r.status).toBe(200);
    expect(auditCount()).toBe(1);
    expect(cfg("maintenance_mode")).toBe("true");
    // 若存在事务期间根客户端写，harness 会抛 ROOT_WRITE_DURING_TX 使本用例失败
  });
});

// ══════════════════════════════════════════════════════
// R0-F2：审计变更事实准确性（H01—H04）
// 期望值独立取自下方种子常量与事务后实际存储，不调用被测事实提取函数生成期望。
// ══════════════════════════════════════════════════════

// 全字段种子（独立常量，期望值的唯一来源）
const FULL_SCHEDULE = {
  id: "full-schedule",
  title: "全字段计划",
  type: "UPGRADE",
  status: "SCHEDULED",
  isDowntime: true,
  startTime: "2026-12-01 02:00",
  endTime: "2026-12-01 04:00",
  manager: "运维甲",
  scope: "全站服务",
  description: "原始说明",
  actualResult: "",
};
const FULL_RELEASE = {
  id: "full-release",
  version: "v5.0.0",
  title: "全字段公告",
  type: "FEATURE",
  publishDate: "2026-12-01",
  isPublished: true,
  author: "研发甲",
  items: ["功能一", "功能二"],
};
// 独立推导的同步说明（与 route 的拼接规则一致，作为期望值来源）
const FULL_SCHEDULE_MSG = `系统正在进行【${FULL_SCHEDULE.title}】\n影响范围：${FULL_SCHEDULE.scope}\n详细说明：${FULL_SCHEDULE.description}`;

function seedFullSchedules() {
  h.store.systemconfig.set("SYSTEM_MAINTENANCE_SCHEDULES_V1", {
    key: "SYSTEM_MAINTENANCE_SCHEDULES_V1",
    value: JSON.stringify([FULL_SCHEDULE]),
  });
}
function seedFullReleases() {
  h.store.systemconfig.set("SYSTEM_RELEASE_NOTES_V1", {
    key: "SYSTEM_RELEASE_NOTES_V1",
    value: JSON.stringify([FULL_RELEASE]),
  });
}

describe("R0-F2 H02 计划逐字段审计事实（10 个既有业务字段）", () => {
  const cases: [string, any, unknown][] = [
    ["title", { title: "新标题" }, "新标题"],
    ["type", { type: "DATABASE" }, "DATABASE"],
    ["status", { status: "COMPLETED" }, "COMPLETED"],
    ["isDowntime", { isDowntime: false }, false],
    ["startTime", { startTime: "2026-12-02 03:00" }, "2026-12-02 03:00"],
    ["endTime", { endTime: "2026-12-01 05:00" }, "2026-12-01 05:00"],
    ["manager", { manager: "运维乙" }, "运维乙"],
    ["scope", { scope: "数据库服务" }, "数据库服务"],
    ["description", { description: "更新后的说明" }, "更新后的说明"],
    ["actualResult", { actualResult: "顺利完成" }, "顺利完成"],
  ];
  for (const [field, patch, newVal] of cases) {
    it(`单改 ${field}：日志记录真实 before/after，changed=true，diff 不含其他字段`, async () => {
      seedFullSchedules();
      const r = await callPOST(
        {
          action: "update_schedule",
          schedule: { id: FULL_SCHEDULE.id, title: FULL_SCHEDULE.title, startTime: FULL_SCHEDULE.startTime, ...patch },
        },
        "u_publish",
      );
      expect(r.status).toBe(200);
      const log = h.store.operationlog[0];
      expect(log.details.target).toBe(FULL_SCHEDULE.id); // 实际目标 ID 保持
      expect(log.details.changed).toBe(true);
      expect(log.details.before[field]).toEqual(FULL_SCHEDULE[field as keyof typeof FULL_SCHEDULE]);
      expect(log.details.after[field]).toEqual(newVal);
      expect(Object.keys(log.details.before)).toEqual([field]); // 不靠同时改标题掩盖遗漏
      // 实际存储与日志一致
      const db = JSON.parse(cfg("SYSTEM_MAINTENANCE_SCHEDULES_V1")!).find(
        (s: any) => s.id === FULL_SCHEDULE.id,
      );
      expect(db[field]).toEqual(newVal);
    });
  }
});

describe("R0-F2 H01 公告逐字段审计事实（7 个既有业务字段）", () => {
  const cases: [string, any, unknown][] = [
    ["version", { version: "v6.0.0" }, "v6.0.0"],
    ["title", { title: "新公告标题" }, "新公告标题"],
    ["type", { type: "FIX" }, "FIX"],
    ["publishDate", { publishDate: "2026-12-15" }, "2026-12-15"],
    ["isPublished", { isPublished: false }, false],
    ["author", { author: "研发乙" }, "研发乙"],
    ["items", { items: ["功能一改", "新增功能"] }, ["功能一改", "新增功能"]],
  ];
  for (const [field, patch, newVal] of cases) {
    it(`单改 ${field}：日志记录真实 before/after，changed=true，与实际存储一致`, async () => {
      seedFullReleases();
      const r = await callPOST(
        {
          action: "update_release",
          release: { id: FULL_RELEASE.id, version: FULL_RELEASE.version, title: FULL_RELEASE.title, ...patch },
        },
        "u_publish",
      );
      expect(r.status).toBe(200);
      const log = h.store.operationlog[0];
      expect(log.details.target).toBe(FULL_RELEASE.id);
      expect(log.details.changed).toBe(true);
      expect(log.details.before[field]).toEqual(FULL_RELEASE[field as keyof typeof FULL_RELEASE]);
      expect(log.details.after[field]).toEqual(newVal);
      expect(Object.keys(log.details.before)).toEqual([field]);
      const db = JSON.parse(cfg("SYSTEM_RELEASE_NOTES_V1")!).find(
        (x: any) => x.id === FULL_RELEASE.id,
      );
      expect(db[field]).toEqual(newVal);
    });
  }

  it("create/delete 目标事实不退化：实际生成 ID 与原目标事实保持", async () => {
    const r = await callPOST(
      { action: "create_release", release: { version: "v7.0.0", title: "新增公告", author: "某作者", items: ["条目"] } },
      "u_publish",
    );
    const newId = r.body.releases[0].id;
    const log = h.store.operationlog[0];
    expect(log.details.target).toBe(newId);
    expect(log.details.after.author).toBe("某作者");
    expect(log.details.after.items).toEqual(["条目"]);
    await callPOST({ action: "delete_release", releaseId: newId }, "u_publish");
    const log2 = h.store.operationlog[1];
    expect(log2.details.target).toBe(newId);
    expect(log2.details.before.items).toEqual(["条目"]);
  });
});

describe("R0-F2 H03 无变化不虚构", () => {
  it("同内容新数组 items：视为未变，changed=false、空 diff（引用不同不算变化）", async () => {
    seedFullReleases();
    await callPOST(
      {
        action: "update_release",
        release: { id: FULL_RELEASE.id, version: FULL_RELEASE.version, title: FULL_RELEASE.title, items: [...FULL_RELEASE.items] },
      },
      "u_publish",
    );
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(false);
    expect(log.details.before.items).toBeUndefined();
    expect(log.details.after.items).toBeUndefined();
  });

  it("相同计划重复提交（10 字段全同）：changed=false、空 diff", async () => {
    seedFullSchedules();
    await callPOST(
      {
        action: "update_schedule",
        schedule: {
          id: FULL_SCHEDULE.id,
          title: FULL_SCHEDULE.title,
          type: FULL_SCHEDULE.type,
          status: FULL_SCHEDULE.status,
          isDowntime: FULL_SCHEDULE.isDowntime,
          startTime: FULL_SCHEDULE.startTime,
          endTime: FULL_SCHEDULE.endTime,
          manager: FULL_SCHEDULE.manager,
          scope: FULL_SCHEDULE.scope,
          description: FULL_SCHEDULE.description,
          actualResult: FULL_SCHEDULE.actualResult,
        },
      },
      "u_publish",
    );
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(false);
    expect(Object.keys(log.details.before)).toEqual([]);
    expect(Object.keys(log.details.after)).toEqual([]);
  });

  it("计划/维护模式/说明全部相同的重复同步（sync=true）：changed=false，不固定赋值 true", async () => {
    seedFullSchedules();
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "true" });
    h.store.systemconfig.set("maintenance_message", {
      key: "maintenance_message",
      value: FULL_SCHEDULE_MSG, // 与将要写入的说明完全相同
    });
    setMaintenanceCache(true);
    const syncBody = {
      action: "update_schedule",
      schedule: {
        id: FULL_SCHEDULE.id,
        title: FULL_SCHEDULE.title,
        type: FULL_SCHEDULE.type,
        status: "IN_PROGRESS",
        isDowntime: FULL_SCHEDULE.isDowntime,
        startTime: FULL_SCHEDULE.startTime,
        endTime: FULL_SCHEDULE.endTime,
        manager: FULL_SCHEDULE.manager,
        scope: FULL_SCHEDULE.scope,
        description: FULL_SCHEDULE.description,
      },
      syncMaintenanceMode: true,
    };
    // 第一次同步：计划 SCHEDULED→IN_PROGRESS 是真实变化（changed=true），此后配置进入目标态
    const r1 = await callPOST(syncBody, "u_both");
    expect(r1.status).toBe(200);
    expect(h.store.operationlog[0].details.changed).toBe(true);
    // 第二次完全相同的同步：计划/模式/说明全部相同 → 不虚构变化
    const r2 = await callPOST(syncBody, "u_both");
    expect(r2.status).toBe(200);
    const log = h.store.operationlog[1];
    expect(log.details.changed).toBe(false); // 全部相同 → 不虚构变化
    expect(log.details.syncMaintenanceMode).toBe(true);
    expect(log.details.maintenanceModeBefore).toBe(true);
    expect(log.details.maintenanceModeAfter).toBe(true);
    expect(log.details.maintenanceMessageBefore).toBe(FULL_SCHEDULE_MSG);
    expect(log.details.maintenanceMessageAfter).toBe(FULL_SCHEDULE_MSG);
    // 配置确实全部原样
    expect(cfg("maintenance_mode")).toBe("true");
    expect(cfg("maintenance_message")).toBe(FULL_SCHEDULE_MSG);
  });

  it("相同设置重复提交不虚构变化（回归确认）", async () => {
    await callPOST({ action: "save_update_settings", settings: { popupTitle: "公告" } }, "u_publish");
    expect(h.store.operationlog[0].details.changed).toBe(false);
  });
});

describe("R0-F2 H04 同步实际变化组合", () => {
  it("仅模式改变（计划与说明全同）：changed=true，模式前后 false→true，计划 diff 为空", async () => {
    // 计划已是 IN_PROGRESS 目标态（避免计划本身变化），仅维护模式 false→true
    seedFullSchedules();
    const inProgress = { ...FULL_SCHEDULE, status: "IN_PROGRESS" };
    h.store.systemconfig.set("SYSTEM_MAINTENANCE_SCHEDULES_V1", {
      key: "SYSTEM_MAINTENANCE_SCHEDULES_V1",
      value: JSON.stringify([inProgress]),
    });
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    h.store.systemconfig.set("maintenance_message", {
      key: "maintenance_message",
      value: FULL_SCHEDULE_MSG, // 说明与将写入内容相同 → 仅模式变化
    });
    setMaintenanceCache(false);
    const r = await callPOST(
      {
        action: "update_schedule",
        schedule: {
          id: FULL_SCHEDULE.id,
          title: FULL_SCHEDULE.title,
          type: FULL_SCHEDULE.type,
          status: "IN_PROGRESS",
          isDowntime: FULL_SCHEDULE.isDowntime,
          startTime: FULL_SCHEDULE.startTime,
          endTime: FULL_SCHEDULE.endTime,
          manager: FULL_SCHEDULE.manager,
          scope: FULL_SCHEDULE.scope,
          description: FULL_SCHEDULE.description,
        },
        syncMaintenanceMode: true,
      },
      "u_both",
    );
    expect(r.status).toBe(200);
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(true);
    expect(Object.keys(log.details.before)).toEqual([]); // 计划本身无变化
    expect(log.details.maintenanceModeBefore).toBe(false);
    expect(log.details.maintenanceModeAfter).toBe(true);
    expect(cfg("maintenance_mode")).toBe("true");
  });

  it("仅实际说明改变（计划与模式全同）：changed=true，说明前后真实", async () => {
    // 计划已是 IN_PROGRESS 目标态，模式已 true；仅维护说明与将写入内容不同
    seedFullSchedules();
    const inProgress = { ...FULL_SCHEDULE, status: "IN_PROGRESS" };
    h.store.systemconfig.set("SYSTEM_MAINTENANCE_SCHEDULES_V1", {
      key: "SYSTEM_MAINTENANCE_SCHEDULES_V1",
      value: JSON.stringify([inProgress]),
    });
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "true" });
    h.store.systemconfig.set("maintenance_message", {
      key: "maintenance_message",
      value: "管理员自定义的旧说明",
    });
    setMaintenanceCache(true);
    await callPOST(
      {
        action: "update_schedule",
        schedule: {
          id: FULL_SCHEDULE.id,
          title: FULL_SCHEDULE.title,
          type: FULL_SCHEDULE.type,
          status: "IN_PROGRESS",
          isDowntime: FULL_SCHEDULE.isDowntime,
          startTime: FULL_SCHEDULE.startTime,
          endTime: FULL_SCHEDULE.endTime,
          manager: FULL_SCHEDULE.manager,
          scope: FULL_SCHEDULE.scope,
          description: FULL_SCHEDULE.description,
        },
        syncMaintenanceMode: true,
      },
      "u_both",
    );
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(true);
    expect(Object.keys(log.details.before)).toEqual([]); // 计划无变化
    expect(log.details.maintenanceModeBefore).toBe(true);
    expect(log.details.maintenanceModeAfter).toBe(true);
    expect(log.details.maintenanceMessageBefore).toBe("管理员自定义的旧说明"); // 事务内真实旧值
    expect(log.details.maintenanceMessageAfter).toBe(FULL_SCHEDULE_MSG);
    expect(cfg("maintenance_message")).toBe(FULL_SCHEDULE_MSG);
  });

  it("计划与模式同时改变：计划 diff 与模式前后均准确", async () => {
    seedFullSchedules();
    h.store.systemconfig.set("maintenance_mode", { key: "maintenance_mode", value: "false" });
    setMaintenanceCache(false);
    await callPOST(
      {
        action: "update_schedule",
        schedule: {
          id: FULL_SCHEDULE.id,
          title: FULL_SCHEDULE.title,
          type: FULL_SCHEDULE.type,
          status: "IN_PROGRESS",
          isDowntime: FULL_SCHEDULE.isDowntime,
          startTime: FULL_SCHEDULE.startTime,
          endTime: FULL_SCHEDULE.endTime,
          manager: FULL_SCHEDULE.manager,
          scope: FULL_SCHEDULE.scope,
          description: "内容已更新的说明",
        },
        syncMaintenanceMode: true,
      },
      "u_both",
    );
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(true);
    expect(log.details.before.description).toBe("原始说明");
    expect(log.details.after.description).toBe("内容已更新的说明");
    expect(log.details.maintenanceModeBefore).toBe(false);
    expect(log.details.maintenanceModeAfter).toBe(true);
  });

  it("仅说明变化（同步关闭方向）：status COMPLETED + 模式 true → 模式变化准确记录", async () => {
    seedFullSchedules();
    // seed 模式 true；计划保持原样、status 改为 COMPLETED 且 sync → 模式 true→false
    await callPOST(
      {
        action: "update_schedule",
        schedule: {
          id: FULL_SCHEDULE.id,
          title: FULL_SCHEDULE.title,
          type: FULL_SCHEDULE.type,
          status: "COMPLETED",
          isDowntime: FULL_SCHEDULE.isDowntime,
          startTime: FULL_SCHEDULE.startTime,
          endTime: FULL_SCHEDULE.endTime,
          manager: FULL_SCHEDULE.manager,
          scope: FULL_SCHEDULE.scope,
          description: FULL_SCHEDULE.description,
        },
        syncMaintenanceMode: true,
      },
      "u_both",
    );
    const log = h.store.operationlog[0];
    expect(log.details.changed).toBe(true);
    expect(log.details.before.status).toBe("SCHEDULED");
    expect(log.details.after.status).toBe("COMPLETED");
    expect(log.details.maintenanceModeBefore).toBe(true);
    expect(log.details.maintenanceModeAfter).toBe(false);
    expect(cfg("maintenance_mode")).toBe("false");
  });
});
