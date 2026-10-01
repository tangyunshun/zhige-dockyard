import { prisma } from "@/lib/prisma";

/**
 * 接口权限「规则层」
 * ==================================================================
 * 目标：后台通过 UI 注册新模块后，其接口鉴权**自动生效、无需改代码**。
 *
 * 机制：
 *  - 规则 = { 路径前缀 + HTTP 方法 → 所需权限点 }，存于 systemconfig；
 *  - 注册功能模块时自动生成「草稿规则」（默认 enabled=false，避免误拦），
 *    管理员在规则配置页确认路径与权限后启用；
 *  - 统一拦截层（middleware）只对 **已启用** 的规则做校验 → 灰度、可控；
 *  - 超级管理员无条件放行。
 *
 * 为什么默认不启用：自动推导的路径前缀不一定与真实接口路径一致（例如模块 route
 * `/admin/workspace/plans` 对应的接口是 `/api/admin/workspace-plans`）。默认草稿 +
 * 人工启用，既能"配置即生效"，又不会因为猜错路径把正常功能拦死。
 */

export const API_PERMISSION_RULES_KEY = "PLATFORM_API_PERMISSION_RULES_V1";

/**
 * 规则缓存时长：拦截层高频读取（拦截层自身另有 3s 缓存），这里给系统接口一个很短的写-读缓存。
 * 注意：**读取失败时不写缓存**，避免失败结果在 TTL 内持续伪装成"无规则"造成 fail-open。
 */
const CACHE_MS = 30 * 1000;

export interface ApiPermissionRule {
  id: string;
  /** 接口路径前缀，如 /api/admin/testimonials */
  pathPrefix: string;
  /** 适用的 HTTP 方法；为空数组表示全部方法 */
  methods: string[];
  /** 所需权限点，如 user_reviews:read */
  permission: string;
  /** 是否启用（只有启用后才会被拦截层校验） */
  enabled: boolean;
  note?: string;
  /** ui = 模块注册时自动生成的草稿；manual = 管理员手工新增 */
  source: "ui" | "manual";
  /** 关联的后台模块路由，便于溯源与批量清理 */
  moduleRoute?: string;
  updatedAt?: string;
}

interface RulesCache {
  rules: ApiPermissionRule[];
  fetchedAt: number;
}

const globalForRules = globalThis as unknown as { __apiPermRulesCache?: RulesCache };

/** 解析规则 JSON（结构非法时按"无规则"处理，但这不属于读取故障） */
function parseRules(value: string | null | undefined): ApiPermissionRule[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? (parsed as ApiPermissionRule[]) : [];
}

/**
 * 宽容读取（供后台管理页使用）：
 * 读取失败时记录告警并**不写缓存**，返回上一次缓存或空数组。
 *
 * ⚠️ 禁止用于「故障安全」判定：中间件与系统接口必须使用 getApiPermissionRulesStrict()，
 * 否则会把"读取失败"误当成"没有规则"，造成 fail-open 放行。
 */
export async function getApiPermissionRules(force = false): Promise<ApiPermissionRule[]> {
  const cached = globalForRules.__apiPermRulesCache;
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.rules;
  }

  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: API_PERMISSION_RULES_KEY } });
    const rules = parseRules(row?.value);
    globalForRules.__apiPermRulesCache = { rules, fetchedAt: Date.now() };
    return rules;
  } catch (error) {
    // 关键：读取失败绝不写入缓存（否则会在 CACHE_MS 内持续伪装成"无规则"）
    console.warn("[api-permission-rules] 读取规则失败（不缓存、不放行由调用方决定）：", error);
    return cached?.rules ?? [];
  }
}

/**
 * 严格读取（故障安全）：
 * 读取/解析失败一律**抛出异常**，由调用方返回 503，绝不伪装成"空规则成功"。
 * 只有读取确实成功（哪怕结果是空数组）才写入缓存并返回。
 */
export async function getApiPermissionRulesStrict(): Promise<ApiPermissionRule[]> {
  const row = await prisma.systemconfig.findUnique({ where: { key: API_PERMISSION_RULES_KEY } });
  const rules = parseRules(row?.value);
  globalForRules.__apiPermRulesCache = { rules, fetchedAt: Date.now() };
  return rules;
}

export async function saveApiPermissionRules(rules: ApiPermissionRule[]): Promise<boolean> {
  try {
    const value = JSON.stringify(rules);
    await prisma.systemconfig.upsert({
      where: { key: API_PERMISSION_RULES_KEY },
      update: { value },
      create: { key: API_PERMISSION_RULES_KEY, value },
    });
    globalForRules.__apiPermRulesCache = { rules, fetchedAt: Date.now() };
    return true;
  } catch (error) {
    console.error("[api-permission-rules] 保存规则失败：", error);
    return false;
  }
}

/**
 * 路径前缀匹配：按「路径段边界」匹配，而非裸字符串前缀。
 * 例：前缀 /api/admin/users/batch 不应命中 /api/admin/users/batch-logout。
 * 规则：pathname === prefix，或 pathname 以 prefix + "/" 开头。
 */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
  if (!prefix) return false;
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === normalized || pathname.startsWith(normalized + "/");
}

/** 路径 + 方法 → 命中的规则（最长前缀优先，便于特例覆盖通例） */
export function matchApiPermissionRule(
  rules: ApiPermissionRule[],
  pathname: string,
  method: string
): ApiPermissionRule | null {
  const upper = method.toUpperCase();
  const matched = rules
    .filter((r) => r.enabled && matchesPathPrefix(pathname, r.pathPrefix))
    .filter((r) => !r.methods?.length || r.methods.map((m) => m.toUpperCase()).includes(upper))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  return matched[0] ?? null;
}

/**
 * 为「新注册的功能模块」生成草稿规则。
 * 路径前缀取模块 route 的末段（/admin/testimonials -> /api/admin/testimonials），
 * 这是最常见约定；若与实际不符，管理员在规则配置页改正即可。
 */
export function buildDraftRulesForModule(module: {
  name: string;
  route: string;
  resourceKey: string;
  supportedActions?: string[];
}): ApiPermissionRule[] {
  const route = String(module.route ?? "").replace(/\/+$/, "");
  const segment = route.split("/").filter(Boolean).pop() ?? "";
  if (!segment || !module.resourceKey) return [];

  const pathPrefix = `/api/admin/${segment}`;
  const actions = module.supportedActions?.length
    ? module.supportedActions
    : ["read", "create", "update", "delete"];

  /** 动作 → HTTP 方法（与后台既有约定一致） */
  const METHOD_MAP: Record<string, string[]> = {
    read: ["GET"],
    create: ["POST"],
    update: ["PUT", "PATCH"],
    delete: ["DELETE"],
    audit: ["POST"],
    status_update: ["PUT", "PATCH"],
    manage: ["POST", "PUT", "PATCH", "DELETE"],
    publish: ["POST", "PUT"],
    export: ["GET"],
  };

  const now = new Date().toISOString();
  return actions
    .filter((a) => METHOD_MAP[a])
    .map((action) => ({
      id: `${module.resourceKey}:${action}`,
      pathPrefix,
      methods: METHOD_MAP[action],
      permission: `${module.resourceKey}:${action}`,
      enabled: false, // 草稿：默认不启用，避免猜错路径误拦
      note: `由模块「${module.name}」注册自动生成，请确认接口路径与所需权限后启用`,
      source: "ui" as const,
      moduleRoute: route,
      updatedAt: now,
    }));
}
