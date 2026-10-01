import { NextRequest, NextResponse } from "next/server";
import { requireSystemSettingsAdmin, writeAuditLog } from "@/lib/security";
import { prisma } from "@/lib/prisma";

/** 权限目录配置键（与权限配置页同一数据源） */
const CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";

/**
 * 读取权限目录，展开为「可选项」列表：供前端做「从权限目录选择」下拉，避免让用户手写权限代号。
 * 返回 null 表示**读取失败**（与"目录为空"严格区分）；保存规则时遇到 null 必须返回 503，
 * 不允许写入一个"无法确认权限来源"的规则。
 */
async function loadCatalogOptions(): Promise<
  { key: string; label: string; desc: string; group: string }[] | null
> {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
    if (!row?.value) return [];
    const groups = JSON.parse(row.value);
    if (!Array.isArray(groups)) return [];
    const out: { key: string; label: string; desc: string; group: string }[] = [];
    for (const g of groups) {
      for (const k of g?.keys ?? []) {
        if (k?.key) {
          out.push({
            key: String(k.key),
            label: String(k.label ?? k.key),
            desc: String(k.desc ?? ""),
            group: String(g?.group ?? ""),
          });
        }
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  } catch (error) {
    console.error("[api-permission-rules] 读取权限目录失败（不得据此写入规则）:", error);
    return null;
  }
}
import {
  getApiPermissionRules,
  getApiPermissionRulesStrict,
  saveApiPermissionRules,
  type ApiPermissionRule,
} from "@/lib/api-permission-rules";

export const dynamic = "force-dynamic";

/**
 * 高危安全配置守卫：接口权限规则决定「哪个后台接口需要哪个权限」，
 * 一旦被非超级管理员改写，即可整体削弱后台防护（例如把已启用的拦截关掉）。
 * 因此**读取与写入一律收敛为超级管理员专属**。
 *
 * 明确不允许：
 *   - 用 permission:manage / admin:permission_grant 作为修改接口规则的放行条件
 *     （这两个键只服务于「权限配置」页的受控委派，不得用于改接口规则）；
 *   - 只靠前端菜单隐藏（接口侧必须强制校验，见本文件 GET/POST/PUT/DELETE）。
 * 所有写操作仍会写入 writeAuditLog 审计日志。
 */
async function guard(request: NextRequest): Promise<{
  authorized: boolean;
  user?: { id: string; email: string; name: string; role: string; status: string };
  errorResponse?: NextResponse;
}> {
  const auth = await requireSystemSettingsAdmin(request);
  if (!auth.authorized || !auth.user) {
    return {
      authorized: false,
      user: auth.user,
      errorResponse: NextResponse.json(
        {
          error: "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG",
          message: "接口权限规则属于高危安全配置，仅超级管理员可查看或修改。",
        },
        { status: 403 }
      ),
    };
  }
  return { authorized: true, user: auth.user };
}

/** GET：规则列表 */
export async function GET(request: NextRequest) {
  const auth = await guard(request);
  if (!auth.authorized) {
    return (
      auth.errorResponse ??
      NextResponse.json({ error: "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG" }, { status: 403 })
    );
  }

  // 管理页读取规则：失败必须返回结构化 503，而不是抛出未处理异常
  let rules: ApiPermissionRule[];
  try {
    rules = await getApiPermissionRulesStrict();
  } catch (error) {
    console.error("[api-permission-rules] 管理页读取规则失败，返回 503:", error);
    return NextResponse.json(
      {
        success: false,
        error: "PERMISSION_RULES_UNAVAILABLE",
        message: "权限规则暂时无法读取，请稍后重试",
      },
      { status: 503 }
    );
  }

  // 同时下发权限目录可选项：让前端能「按中文名称选择权限」，而不是让用户手写权限代号
  // （目录读取失败仅降级为不可选，不影响规则列表展示）
  const catalog = await loadCatalogOptions();
  return NextResponse.json({ success: true, rules, catalog: catalog ?? [] });
}

interface RulePayload {
  id?: string;
  pathPrefix?: string;
  methods?: string[];
  permission?: string;
  enabled?: boolean;
  note?: string;
}

/** 允许的 HTTP 方法白名单（空数组 = 全部方法，见 methods 语义说明） */
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/** 明确禁止纳入规则层的系统路径（避免把鉴权依赖链自身纳入拦截造成递归/失效） */
const FORBIDDEN_PREFIXES = ["/api/system", "/api/auth", "/api/open"];

function normalize(payload: RulePayload, existing?: ApiPermissionRule): ApiPermissionRule | { error: string } {
  const pathPrefix = String(payload.pathPrefix ?? "").trim();
  const permission = String(payload.permission ?? "").trim();

  // ① 只允许后台管理接口：必须以 /api/admin/ 开头（前缀匹配会覆盖其子路径，故也须拒绝 /api/admin 本身）
  if (!pathPrefix.startsWith("/api/admin/")) {
    return { error: "接口路径前缀必须以 /api/admin/ 开头（本规则层只覆盖后台管理接口）" };
  }
  // ② 显式拒绝系统路径（正常已被 ① 拦住，这里做双保险，避免未来放宽 ① 时误开）
  if (FORBIDDEN_PREFIXES.some((p) => pathPrefix.startsWith(p))) {
    return { error: `不允许将系统路径纳入规则层：${pathPrefix}` };
  }
  // ③ 权限点必填
  if (!permission) return { error: "请填写所需权限点" };

  // ④ 方法白名单（留空数组 = 全部方法）
  const methods = (payload.methods ?? existing?.methods ?? [])
    .map((m) => String(m).trim().toUpperCase())
    .filter(Boolean);
  const invalidMethods = methods.filter((m) => !ALLOWED_METHODS.includes(m));
  if (invalidMethods.length > 0) {
    return {
      error: `不支持的请求方法：${invalidMethods.join("、")}（仅支持 ${ALLOWED_METHODS.join("/")}；留空表示全部方法）`,
    };
  }

  return {
    id: existing?.id ?? payload.id ?? `manual:${pathPrefix}`,
    pathPrefix,
    methods,
    permission,
    enabled: Boolean(payload.enabled),
    note: String(payload.note ?? existing?.note ?? "").trim(),
    source: existing?.source ?? "manual",
    moduleRoute: existing?.moduleRoute,
    updatedAt: new Date().toISOString(),
  };
}

/** 方法归一：空数组按"全部方法"展开，用于冲突判定 */
function expandMethods(methods: string[] | undefined): string[] {
  const list = (methods ?? []).map((m) => m.toUpperCase()).filter(Boolean);
  return list.length > 0 ? list : ALLOWED_METHODS;
}

/**
 * 冲突校验：同一 pathPrefix + 同一 HTTP 方法 不允许存在多条**已启用**规则。
 * 返回冲突详情（便于前端明确提示），无冲突返回 null。
 */
function findConflict(
  rules: ApiPermissionRule[],
  candidate: ApiPermissionRule,
  selfId?: string
): { rule: ApiPermissionRule; methods: string[] } | null {
  if (!candidate.enabled) return null; // 草稿不参与拦截，不构成冲突
  const candidateMethods = expandMethods(candidate.methods);
  for (const r of rules) {
    if (!r.enabled) continue;
    if (selfId && r.id === selfId) continue;
    if (r.pathPrefix !== candidate.pathPrefix) continue;
    const overlap = candidateMethods.filter((m) => expandMethods(r.methods).includes(m));
    if (overlap.length > 0) return { rule: r, methods: overlap };
  }
  return null;
}

/**
 * 规则持久化：写入失败一律返回结构化 503，**绝不向前端返回成功**。
 * 背景：saveApiPermissionRules 返回 boolean，早期实现漏判返回值 →
 *      数据库写入失败时接口仍返回 { success: true }，前端会误以为已生效。
 */
async function persistRulesOr503(nextRules: ApiPermissionRule[]): Promise<NextResponse | null> {
  const saved = await saveApiPermissionRules(nextRules);
  if (saved) return null;
  return NextResponse.json(
    {
      success: false,
      error: "PERMISSION_RULES_SAVE_UNAVAILABLE",
      message: "权限规则暂时无法保存，请稍后重试",
    },
    { status: 503 }
  );
}

/**
 * 审计日志：规则保存**成功之后**的后置动作。
 * 审计写入失败不得回滚已成功的规则保存，但必须记录服务端错误（不允许静默丢失审计）。
 */
async function writeAuditSafely(
  operatorId: string,
  action: string,
  payload: Record<string, unknown>,
  request: NextRequest
): Promise<void> {
  try {
    await writeAuditLog(operatorId, "system:settings", { action, ...payload }, null, null, request);
  } catch (error) {
    console.error(
      `[api-permission-rules] 审计日志写入失败（规则已保存成功，不回滚）action=${action}:`,
      error
    );
  }
}

/** POST：新增规则 */
export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if (!auth.authorized) {
    return (
      auth.errorResponse ??
      NextResponse.json({ error: "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG" }, { status: 403 })
    );
  }

  const body = (await request.json().catch(() => ({}))) as RulePayload;
  const built = normalize(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  // 权限目录读取失败 → 503：绝不允许写入"无法确认权限来源"的规则
  const catalog = await loadCatalogOptions();
  if (catalog === null) {
    return NextResponse.json(
      {
        success: false,
        error: "PERMISSION_CATALOG_UNAVAILABLE",
        message: "权限目录暂时不可用，无法校验权限点，请稍后重试。",
      },
      { status: 503 }
    );
  }
  if (!catalog.some((c) => c.key === built.permission)) {
    return NextResponse.json(
      { error: `权限点 ${built.permission} 不在当前权限目录中，请先在「权限配置」注册该权限点后再配置规则` },
      { status: 400 }
    );
  }

  const rules = await getApiPermissionRules(true);
  if (rules.some((r) => r.id === built.id)) {
    return NextResponse.json({ error: "同名规则已存在" }, { status: 409 });
  }
  // 启用规则冲突：同一 pathPrefix + 同一 HTTP 方法仅允许一条启用规则 → 400 并说明冲突规则
  const conflict = findConflict(rules, built);
  if (conflict) {
    return NextResponse.json(
      {
        error: `规则冲突：${built.pathPrefix} 的 ${conflict.methods.join("、")} 方法已存在启用规则（权限点 ${conflict.rule.permission}，规则 ID ${conflict.rule.id}）。请先停用或删除该规则。`,
        conflictRule: {
          id: conflict.rule.id,
          pathPrefix: conflict.rule.pathPrefix,
          methods: conflict.rule.methods,
          permission: conflict.rule.permission,
        },
      },
      { status: 400 }
    );
  }

  // 先落库：失败直接 503，绝不返回成功
  const saveFailed = await persistRulesOr503([...rules, built]);
  if (saveFailed) return saveFailed;

  // 落库成功后才写审计日志（审计失败不回滚规则保存，但会记录服务端错误）
  await writeAuditSafely(auth.user!.id, "CREATE_API_PERMISSION_RULE", { rule: built }, request);

  return NextResponse.json({ success: true, rule: built, message: "规则已新增" });
}

/** PUT：更新规则 */
export async function PUT(request: NextRequest) {
  const auth = await guard(request);
  if (!auth.authorized) {
    return (
      auth.errorResponse ??
      NextResponse.json({ error: "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG" }, { status: 403 })
    );
  }

  const body = (await request.json().catch(() => ({}))) as RulePayload;
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "缺少规则 ID" }, { status: 400 });

  const rules = await getApiPermissionRules(true);
  const existing = rules.find((r) => r.id === id);
  if (!existing) return NextResponse.json({ error: "规则不存在" }, { status: 404 });

  const built = normalize(body, existing);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  // 权限目录读取失败 → 503（同新增）；权限点必须存在于目录
  const catalog = await loadCatalogOptions();
  if (catalog === null) {
    return NextResponse.json(
      {
        success: false,
        error: "PERMISSION_CATALOG_UNAVAILABLE",
        message: "权限目录暂时不可用，无法校验权限点，请稍后重试。",
      },
      { status: 503 }
    );
  }
  if (!catalog.some((c) => c.key === built.permission)) {
    return NextResponse.json(
      { error: `权限点 ${built.permission} 不在当前权限目录中，请先在「权限配置」注册该权限点后再配置规则` },
      { status: 400 }
    );
  }

  // 冲突校验（排除自身）——含"从草稿改为启用"的场景
  const conflict = findConflict(rules, built, id);
  if (conflict) {
    return NextResponse.json(
      {
        error: `规则冲突：${built.pathPrefix} 的 ${conflict.methods.join("、")} 方法已存在启用规则（权限点 ${conflict.rule.permission}，规则 ID ${conflict.rule.id}）。请先停用或删除该规则。`,
        conflictRule: {
          id: conflict.rule.id,
          pathPrefix: conflict.rule.pathPrefix,
          methods: conflict.rule.methods,
          permission: conflict.rule.permission,
        },
      },
      { status: 400 }
    );
  }

  const saveFailed = await persistRulesOr503(rules.map((r) => (r.id === id ? built : r)));
  if (saveFailed) return saveFailed;

  await writeAuditSafely(
    auth.user!.id,
    "UPDATE_API_PERMISSION_RULE",
    {
      ruleId: id,
      enabled: built.enabled,
      pathPrefix: built.pathPrefix,
      permission: built.permission,
    },
    request
  );

  return NextResponse.json({ success: true, rule: built, message: "规则已更新" });
}

/** DELETE：删除规则 */
export async function DELETE(request: NextRequest) {
  const auth = await guard(request);
  if (!auth.authorized) {
    return (
      auth.errorResponse ??
      NextResponse.json({ error: "FORBIDDEN_HIGH_RISK_SECURITY_CONFIG" }, { status: 403 })
    );
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "缺少规则 ID" }, { status: 400 });

  const rules = await getApiPermissionRules(true);
  if (!rules.some((r) => r.id === id)) {
    return NextResponse.json({ error: "规则不存在" }, { status: 404 });
  }

  // 删除（含关闭/清理规则）：先落库，失败直接 503
  const saveFailed = await persistRulesOr503(rules.filter((r) => r.id !== id));
  if (saveFailed) return saveFailed;

  // 删除与停用都必须留审计（停用走 PUT，同样在成功后写审计）
  await writeAuditSafely(auth.user!.id, "DELETE_API_PERMISSION_RULE", { ruleId: id }, request);

  return NextResponse.json({ success: true, message: "规则已删除" });
}
