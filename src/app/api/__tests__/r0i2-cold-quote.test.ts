/**
 * R0-I2 冷启动隔离验收：GET /api/billing/estimate 默认报价链路严格只读。
 *
 * 每条路径在独立模块上下文中冷启动（vi.resetModules + 动态 import，避免
 * workspace-byo-model 的 _byoShareColumnChecked 被其他用例预热掩盖）：
 *  - 显式 BYOK；
 *  - 省略 deploymentId，空间默认 BYOK；
 *  - deploymentId=auto，空间默认 BYOK；
 *  - 个人默认 BYOK（含历史 "byo" 偏好值），空间默认为平台模型；
 *  - 各路径缺 shareWithMembers 列 → 503 BYO_SHARE_COLUMN_NOT_READY。
 *
 * 使用真实 GET + 真实 resolveDefaultDeployment/resolveDeploymentForWorkspace +
 * 真实 tryResolveWorkspaceByoDefault + 真实 ensureByoShareWithMembersColumn（只读探针），
 * 仅替换 Prisma/解密等 IO；记录全部 raw SQL 与 ORM 写，断言 DDL/DML 尝试为 0。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const writes: string[] = [];
  const rawSql: string[] = []; // 原始 SQL 执行记录（含 EXEC/QUERY 前缀 + SQL 正文）
  const rawFault = { failProbe: false }; // SELECT 探针失败 = shareWithMembers 列缺失
  return { tables, writes, rawSql, rawFault };
});

function getTable(name: string): Map<string, any> {
  if (!h.tables[name]) h.tables[name] = new Map();
  return h.tables[name];
}

function matchRow(row: any, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (k.includes("_") && v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (row[k2] !== v2) return false;
      }
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      for (const [op, ov] of Object.entries(v)) {
        const rv = row[k];
        if (op === "not") {
          if (rv === ov) return false;
        } else if (op === "gt") {
          if (!(rv > ov)) return false;
        } else if (op === "lt") {
          if (!(rv < ov)) return false;
        } else if (op === "in") {
          if (!Array.isArray(ov) || !ov.includes(rv)) return false;
        } else {
          return false;
        }
        continue;
      }
      continue;
    }
    const rv = row[k];
    if (v instanceof Date || rv instanceof Date) {
      const a = rv instanceof Date ? rv.getTime() : rv;
      const b = v instanceof Date ? v.getTime() : v;
      if (a !== b) return false;
    } else if (rv !== v) return false;
  }
  return true;
}

function selectFields(row: any, select: any) {
  if (!row) return null;
  if (!select) return { ...row };
  const out: any = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
}

function makePrisma() {
  const model = (name: string) => {
    const rows = () => [...getTable(name).values()];
    const findRow = (where: any) => rows().find((r) => matchRow(r, where)) ?? null;
    return {
      findUnique: async ({ where, select }: any) => selectFields(findRow(where) ?? (null as any), select),
      findFirst: async ({ where, select }: any) => selectFields(findRow(where) ?? (null as any), select),
      findMany: async ({ where, select }: any) =>
        rows()
          .filter((r) => matchRow(r, where))
          .map((r) => selectFields(r, select)),
      count: async ({ where }: any) => rows().filter((r) => matchRow(r, where)).length,
      upsert: async ({ where, create, update }: any) => {
        h.writes.push(`${name}.upsert`);
        const row = findRow(where);
        if (row) {
          const next = { ...row, ...update };
          getTable(name).set(row.id, next);
          return { ...next };
        }
        const created = { ...create };
        if (!created.id) created.id = `auto_${Math.random().toString(36).slice(2)}`;
        getTable(name).set(created.id, created);
        return { ...created };
      },
    };
  };
  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$queryRawUnsafe" || prop === "$queryRaw") {
          return async (sql: string) => {
            h.rawSql.push(`QUERY ${String(sql)}`);
            if (h.rawFault.failProbe) throw new Error("Unknown column 'shareWithMembers'");
            return [];
          };
        }
        if (prop === "$executeRawUnsafe" || prop === "$executeRaw") {
          return async (sql: string) => {
            h.rawSql.push(`EXEC ${String(sql)}`);
            return 0; // 若真有 DDL/DML 请求，记录后按无副作用返回（断言负责判定为失败）
          };
        }
        return model(prop);
      },
    },
  );
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));
vi.mock("@/lib/auth", () => ({
  validateUser: async () => ({ valid: true, user: { id: "u1" } }),
}));
// 解密 IO 以固定合成值替换（真实解析器读取密钥密文）
vi.mock("@/lib/crypto-secrets", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (c: string) => c.replace(/^enc:/, ""),
}));

// ════════ SQL 写尝试分类（K03：按实际记录格式解析，附自检） ════════

/** 判断一条 raw 记录是否为写尝试（DDL/DML）。记录格式：`EXEC <sql>` / `QUERY <sql>` */
function isRawWriteAttempt(record: string): boolean {
  const m = /^(EXEC|QUERY)\s+([\s\S]*)$/.exec(record);
  if (!m) return false; // 非法记录不算写
  const kind = m[1];
  const sql = m[2].trim().toUpperCase();
  if (kind === "EXEC") {
    // EXEC 通道即写通道（$executeRawUnsafe），无论 SQL 内容
    return true;
  }
  // QUERY 通道只读，除非 SQL 本身是写语句
  return /^(ALTER|INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE|RENAME|REPLACE)\b/.test(sql);
}

// K03 自检：分类逻辑必须识别带前缀的写记录
assert.ok(isRawWriteAttempt("EXEC ALTER TABLE `workspace_byo_model` ADD COLUMN `shareWithMembers`"), "自检：EXEC ALTER 识别为写");
assert.ok(isRawWriteAttempt("EXEC INSERT INTO x VALUES (1)"), "自检：EXEC INSERT 识别为写");
assert.ok(!isRawWriteAttempt("QUERY SELECT `shareWithMembers` FROM `workspace_byo_model` LIMIT 1"), "自检：QUERY SELECT 非写");
assert.ok(!isRawWriteAttempt("garbage"), "自检：非法记录非写");

// ════════ 夹具 ════════

function seedBase(opts: { spaceDefault?: string | null; personalPref?: string | null } = {}) {
  h.tables.workspace = new Map([["w1", { id: "w1", type: "PERSONAL", ownerId: "u1", name: "个人空间", plan: "STANDARD" }]]);
  h.tables.workspacemember = new Map([["wm1", { id: "wm1", userId: "u1", workspaceId: "w1" }]]);
  h.tables.componentcatalog = new Map([
    ["comp-1", { id: "comp-1", name: "测试组件", estimatedModelTokens: 100, activeContractId: "ct-1" }],
  ]);
  h.tables.componentcontract = new Map([
    ["ct-1", {
      id: "ct-1",
      contract: {
        componentId: "comp-1",
        contractVersion: "v1",
        requiredCapabilities: ["TEXT_GENERATION"],
        executionPlan: { steps: [{ promptTemplate: "模板", requiredCapabilities: ["TEXT_GENERATION"] }] },
      },
    }],
  ]);
  // 空间模型策略：默认模型与授权列表（空间默认 BYOK 或平台）
  h.tables.workspace_model_policy = new Map([
    ["pol-1", {
      id: "pol-1",
      workspaceId: "w1",
      defaultDeploymentId: opts.spaceDefault ?? null,
      allowedDeploymentIds: opts.spaceDefault ? [opts.spaceDefault, "dep-1"] : ["dep-1"],
      disabledDeploymentIds: [],
    }],
  ]);
  // 个人成员偏好（历史 "byo" 值或 byo:w1）
  if (opts.personalPref !== undefined) {
    h.tables.workspace_member_model_preference = new Map([
      ["pref-1", { id: "pref-1", workspaceId: "w1", userId: "u1", isAuto: false, deploymentId: opts.personalPref }],
    ]);
  } else {
    h.tables.workspace_member_model_preference = new Map();
  }
  // 平台部署/供应商（默认平台模型 dep-1 的真实解析所需）
  h.tables.modeldeployment = new Map([
    ["dep-1", {
      id: "dep-1", providerId: "prov-1", modelId: "model-1", upstreamModel: "model-1",
      displayName: "平台模型", contextLimit: 128000,
      capabilities: ["TEXT_GENERATION"], enabled: true, health: "healthy",
    }],
  ]);
  h.tables.modelprovider = new Map([
    ["prov-1", { id: "prov-1", name: "prov-1", protocol: "OPENAI_COMPATIBLE", baseUrl: "http://fixture.invalid", apiKeyEnv: "MODEL_API_KEY", apiKeyCipher: "enc:fixture-key", enabled: true }],
  ]);
  h.tables.workspace_byo_model = h.tables.workspace_byo_model || new Map();
  // 空间 BYO 模型（enabled）
  h.tables.workspace_byo_model = new Map([
    ["byo-row", {
      id: "byo-row", workspaceId: "w1", label: "自带模型", protocol: "openai",
      baseUrl: "http://fixture.invalid", apiKeyCipher: "enc:fixture-key", enabled: true,
      capabilities: ["TEXT_GENERATION"],
      priceInputMicrosPerMillion: null, priceOutputMicrosPerMillion: null,
      shareWithMembers: true,
    }],
  ]);
  h.tables.user_byo_model_assignment = new Map(); // 无私有归属限制
  h.tables.systemconfig = new Map();
  h.writes.length = 0;
  h.rawSql.length = 0;
  h.rawFault.failProbe = false;
}

const getReq = (url: string) =>
  new NextRequest(`http://localhost${url}`, {
    method: "GET",
    headers: { authorization: "Bearer test-token" },
  });

/** 独立冷启动：重置模块注册表后动态 import 真实 GET（模块缓存全新） */
async function coldEstimateGET(url: string) {
  vi.resetModules();
  const { GET } = await import("@/app/api/billing/estimate/route");
  const res = await GET(getReq(url));
  return { status: res.status, body: await (res as any).json() };
}

beforeEach(() => {
  h.tables = {};
  h.writes.length = 0;
  h.rawSql.length = 0;
  h.rawFault.failProbe = false;
});

// ════════ K01：各路径冷启动只读 + 暂停报价 ════════

describe("R0-I2 K01：默认报价冷启动只读（显式/省略/auto/个人默认）", () => {
  it("路径1 显式 BYOK（deploymentId=byo:w1）：暂停报价、raw 仅 SELECT 探针、零写尝试", async () => {
    seedBase({ spaceDefault: "byo:w1" });
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=byo%3Aw1");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBe(true);
    expect(r.body.data.canExecute).toBe(false);
    expect(r.body.data.points).toBeNull();
    expect(r.body.data.yuan).toBeNull();
    expect(r.body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(h.rawSql.length).toBeGreaterThan(0);
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.rawSql.some((s) => s.includes("shareWithMembers"))).toBe(true);
    expect(h.writes.length).toBe(0);
  });

  it("路径2 省略 deploymentId（空间默认 BYOK）：暂停报价、零写尝试", async () => {
    seedBase({ spaceDefault: "byo:w1" });
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBe(true);
    expect(r.body.data.canExecute).toBe(false);
    expect(r.body.data.points).toBeNull();
    expect(r.body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.rawSql.some((s) => s.includes("shareWithMembers"))).toBe(true);
    expect(h.writes.length).toBe(0);
  });

  it("路径3 deploymentId=auto（空间默认 BYOK）：暂停报价、零写尝试", async () => {
    seedBase({ spaceDefault: "byo:w1" });
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1&deploymentId=auto");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBe(true);
    expect(r.body.data.points).toBeNull();
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.writes.length).toBe(0);
  });

  it("路径4 个人默认 BYOK（历史 byo 偏好值，空间默认平台模型）：暂停报价、零写尝试", async () => {
    seedBase({ spaceDefault: "dep-1", personalPref: "byo" }); // 历史 "byo" 偏好
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBe(true);
    expect(r.body.data.canExecute).toBe(false);
    expect(r.body.data.points).toBeNull();
    expect(r.body.data.code).toBe("BYOK_BILLING_POLICY_UNCONFIRMED");
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.writes.length).toBe(0);
  });

  it("路径4b 个人默认 BYOK（byo:w1 偏好值）：暂停报价、零写尝试", async () => {
    seedBase({ spaceDefault: "dep-1", personalPref: "byo:w1" });
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBe(true);
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
  });
});

// ════════ K02：缺列诚实拒绝（503 / BYO_SHARE_COLUMN_NOT_READY） ════════

describe("R0-I2 K02：缺列诚实拒绝（显式与默认路径，冷启动）", () => {
  it.each([
    ["显式", "&deploymentId=byo%3Aw1"],
    ["省略 deploymentId", ""],
    ["auto", "&deploymentId=auto"],
    ["个人默认 BYOK", "&pref=byo"],
  ])("%s 路径缺列 → 503 BYO_SHARE_COLUMN_NOT_READY，零 DDL/DML", async (_label, extra) => {
    seedBase({ spaceDefault: "byo:w1", personalPref: extra.includes("pref=byo") ? "byo" : undefined });
    h.rawFault.failProbe = true; // 模拟 shareWithMembers 列缺失
    const r = await coldEstimateGET(`/api/billing/estimate?componentId=comp-1&workspaceId=w1${extra}`);
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("BYO_SHARE_COLUMN_NOT_READY");
    // 零 DDL/DML：探针失败前不可能有写尝试；探针本身是 QUERY
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
    expect(h.writes.length).toBe(0);
  });

  it("正常平台模型报价保持（不把默认平台模型也一律拒绝）", async () => {
    seedBase({ spaceDefault: "dep-1" }); // 空间默认平台模型，无个人偏好
    const r = await coldEstimateGET("/api/billing/estimate?componentId=comp-1&workspaceId=w1");
    expect(r.status).toBe(200);
    expect(r.body.data.blocked).toBeUndefined();
    expect(r.body.data.points).toBe(100);
    expect(r.body.data.basis).toBe("FIXED_POINTS");
    expect(h.rawSql.some((s) => isRawWriteAttempt(s))).toBe(false);
  });
});

// ════════ K03：写尝试断言自检（注入写记录必须使断言失败） ════════

describe("R0-I2 K03：写尝试断言自检", () => {
  it("注入 EXEC ALTER 夹具记录 → isRawWriteAttempt 识别为写（受控失败演示）", () => {
    expect(isRawWriteAttempt("EXEC ALTER TABLE `workspace_byo_model` ADD COLUMN `shareWithMembers` BOOLEAN NOT NULL DEFAULT true")).toBe(true);
    expect(isRawWriteAttempt("EXEC UPDATE x SET y=1")).toBe(true);
    expect(isRawWriteAttempt("QUERY SELECT 1")).toBe(false);
  });
});
