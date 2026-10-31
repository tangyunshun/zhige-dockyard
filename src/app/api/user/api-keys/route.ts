import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { normalizeIpAddress } from "@/lib/audit-dict";
import { checkOpenApiRateLimit } from "@/lib/open-api-rate-limit";
import { requireWorkspaceMembership } from "@/lib/security";
import { runStudioPost, buildProductionDeps } from "@/app/api/studio/handler";

// 鉴权：统一使用项目标准 JWT 校验（与 /api/user/* 其它接口一致）
async function requireUser(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) return null;
  return auth.user.id as string;
}

// 对外脱敏：绝不返回 keyHash
function toPublic(key: any) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

// 标准化 IP 地址为中文可读说明，彻底消除 ::1 与 unknown 裸露
function formatAuditIpAddress(rawIp?: string | null): string {
  const trimmed = (rawIp || "").trim();
  if (
    !trimmed ||
    trimmed === "::1" ||
    trimmed === "127.0.0.1" ||
    trimmed === "localhost" ||
    trimmed.toLowerCase() === "unknown" ||
    trimmed === "—"
  ) {
    return "127.0.0.1 (本地局域网)";
  }
  const normalized = normalizeIpAddress(trimmed);
  if (!normalized || normalized.toLowerCase() === "unknown" || normalized === "::1") {
    return "127.0.0.1 (本地局域网)";
  }
  return normalized;
}

// 将历史自动化演练或英文测试密钥名称转译为标准中文名称
const LEGACY_KEY_NAME_DICT: Record<string, string> = {
  "E6-recovery-drill": "容灾演练测试密钥",
  "E1-test-ratelimit": "接口限流联调密钥",
  "E1-test-super": "超级管理员联调密钥",
  "default": "默认服务密钥",
  "test": "联调测试密钥",
};

function localizeKeyName(rawName?: string | null, dbKeyName?: string | null): string {
  const candidate = (dbKeyName || rawName || "").trim();
  if (!candidate) return "开放接口访问密钥";
  if (LEGACY_KEY_NAME_DICT[candidate]) {
    return LEGACY_KEY_NAME_DICT[candidate];
  }
  // 若已包含中文字符，直接返回真实名称
  if (/[\u4e00-\u9fa5]/.test(candidate)) {
    return candidate;
  }
  const lower = candidate.toLowerCase();
  if (lower.includes("recovery") || lower.includes("drill")) return `容灾演练密钥 (${candidate})`;
  if (lower.includes("ratelimit") || lower.includes("limit")) return `限流联调密钥 (${candidate})`;
  if (lower.includes("super") || lower.includes("admin")) return `管理员联调密钥 (${candidate})`;
  if (lower.includes("test") || lower.includes("dev")) return `开发联调密钥 (${candidate})`;
  if (lower.includes("prod")) return `生产服务密钥 (${candidate})`;
  return `接口访问密钥 (${candidate})`;
}

export interface OpenEndpointCatalogItem {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  categoryLabel: string;
}

const DEFAULT_OPEN_ENDPOINTS: OpenEndpointCatalogItem[] = [
  {
    id: "me",
    method: "GET",
    path: "/api/open/v1/me",
    title: "获取账号概要与算力余额",
    desc: "校验访问密钥有效性，实时从数据库返回当前账号信息、会员等级与个人空间可用算力余额。",
    categoryLabel: "账户与配额",
  },
  {
    id: "workspaces",
    method: "GET",
    path: "/api/open/v1/workspaces",
    title: "查询可访问工作空间列表",
    desc: "实时从数据库返回当前账号拥有访问权限的个人空间与企业空间编号、空间类型及成员角色。",
    categoryLabel: "工作空间",
  },
  {
    id: "components",
    method: "GET",
    path: "/api/open/v1/components",
    title: "获取已上架组件目录",
    desc: "实时从数据库查询平台已发布上架的标准业务组件清单、所属中文领域分类与输入模式。",
    categoryLabel: "组件目录",
  },
  {
    id: "tasks",
    method: "GET",
    path: "/api/open/v1/tasks",
    title: "查询最近发起的组件任务",
    desc: "按指定条数从数据库分页查询当前账号最近发起的组件执行任务列表与状态。",
    categoryLabel: "任务查询",
  },
  {
    id: "taskDetail",
    method: "GET",
    path: "/api/open/v1/tasks/:id",
    title: "轮询单笔任务进度与产物",
    desc: "根据真实任务编号从数据库查询单笔任务的执行状态、所属工作空间与最终生成的业务成果物。",
    categoryLabel: "任务结果",
  },
  {
    id: "execute",
    method: "POST",
    path: "/api/open/v1/execute",
    title: "执行标准组件任务",
    desc: "在指定工作空间内真实调度执行已上架组件，按算账中心预冻结算力点并在完成后按实耗结算。",
    categoryLabel: "核心执行",
  },
];

const DEFAULT_STATUS_CODE_GUIDES = [
  {
    code: "200 请求成功",
    desc: "开放接口请求处理成功，返回数据库真实业务数据或组件执行结果",
    tone: "emerald",
  },
  {
    code: "401 鉴权未通过",
    desc: "访问密钥缺失、前缀格式错误或该密钥已被吊销删除",
    tone: "amber",
  },
  {
    code: "403 空间权限不足",
    desc: "密钥所属账号非目标工作空间成员，或无该组件执行权限",
    tone: "amber",
  },
  {
    code: "400 算力余额不足",
    desc: "目标工作空间或个人算力点余额不足（前置阻断，不产生扣费）",
    tone: "red",
  },
  {
    code: "400 参数契约不符",
    desc: "缺少必填工作空间/组件编号，或输入材料不满足组件契约要求",
    tone: "slate",
  },
  {
    code: "429 请求频次超限",
    desc: "超出单枚访问密钥每分钟最大并发请求频次阈值",
    tone: "red",
  },
];

function resolveEndpointTitle(
  rawPath: string,
  endpoints: OpenEndpointCatalogItem[],
): string {
  const clean = (rawPath || "").split("?")[0].trim();
  const exact = endpoints.find((e) => e.path === clean);
  if (exact) return exact.title;
  if (clean.startsWith("/api/open/v1/tasks/")) {
    return "轮询单笔任务进度与产物";
  }
  if (clean === "/api/open/v1/execute") return "执行标准组件任务";
  if (clean === "/api/open/v1/me") return "获取账号概要与算力余额";
  if (clean === "/api/open/v1/workspaces") return "查询可访问工作空间列表";
  if (clean === "/api/open/v1/components") return "获取已上架组件目录";
  if (clean === "/api/open/v1/tasks") return "查询最近发起的组件任务";
  return "调用开放平台接口";
}

async function loadOpenApiConfigFromDb() {
  let rateLimitPerMin = 30;
  let openEndpoints = DEFAULT_OPEN_ENDPOINTS;
  let statusCodeGuides = DEFAULT_STATUS_CODE_GUIDES;

  try {
    const rows = await prisma.systemconfig.findMany({
      where: {
        key: {
          in: [
            "OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN",
            "open_api_endpoints_catalog",
            "open_api_status_codes_dict",
          ],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const rawLimit = map.get("OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN");
    if (rawLimit) {
      const n = Number(rawLimit);
      if (Number.isFinite(n) && n > 0) rateLimitPerMin = Math.floor(n);
    }

    const rawEndpoints = map.get("open_api_endpoints_catalog");
    if (rawEndpoints) {
      const parsed = JSON.parse(rawEndpoints);
      if (Array.isArray(parsed) && parsed.length > 0) {
        openEndpoints = parsed;
      }
    } else {
      await prisma.systemconfig
        .upsert({
          where: { key: "open_api_endpoints_catalog" },
          update: {},
          create: {
            id: uuidv4(),
            key: "open_api_endpoints_catalog",
            value: JSON.stringify(DEFAULT_OPEN_ENDPOINTS),
            description: "开发者中心开放接口端点目录配置（数据库驱动）",
            updatedAt: new Date(),
          },
        })
        .catch(() => {});
    }

    const rawGuides = map.get("open_api_status_codes_dict");
    if (rawGuides) {
      const parsed = JSON.parse(rawGuides);
      if (Array.isArray(parsed) && parsed.length > 0) {
        statusCodeGuides = parsed;
      }
    } else {
      await prisma.systemconfig
        .upsert({
          where: { key: "open_api_status_codes_dict" },
          update: {},
          create: {
            id: uuidv4(),
            key: "open_api_status_codes_dict",
            value: JSON.stringify(DEFAULT_STATUS_CODE_GUIDES),
            description: "开发者中心开放接口状态码与结算字典配置（数据库驱动）",
            updatedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  } catch {
    // 数据库字典读取异常时回退标准默认项
  }

  return { rateLimitPerMin, openEndpoints, statusCodeGuides };
}

// 获取用户 API Keys 与开放接口调试/审计上下文数据
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const [
      apiKeys,
      usageLogs,
      openConfig,
      memberships,
      ownedWorkspaces,
      categories,
      publishedComponents,
      recentTaskRows,
    ] = await Promise.all([
      prisma.apikey.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.operationlog.findMany({
        where: { userId, action: "APIKey:Use" },
        select: { id: true, details: true, ipAddress: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      loadOpenApiConfigFromDb(),
      prisma.workspacemember.findMany({
        where: { userId },
        include: {
          workspace: {
            select: { id: true, name: true, type: true, ownerId: true, createdAt: true },
          },
        },
      }),
      prisma.workspace.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true, type: true, ownerId: true, createdAt: true },
      }),
      prisma.componentcategory.findMany({
        orderBy: { sortOrder: "asc" },
      }),
      prisma.componentcatalog.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          estimatedModelTokens: true,
          activeContractId: true,
        },
      }),
      prisma.componenttask.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          tenantId: true,
          createdAt: true,
        },
      }),
    ]);

    const keyById = new Map(apiKeys.map((k) => [k.id, k]));
    const catMap = new Map(categories.map((c) => [c.key, c.name]));
    const compNameMap = new Map(publishedComponents.map((c) => [c.id.toUpperCase(), c.name]));

    // 汇总当前用户可访问的真实工作空间及算力点余额
    const wsMap = new Map<string, { id: string; name: string; type: "PERSONAL" | "ENTERPRISE" }>();
    for (const w of ownedWorkspaces) {
      wsMap.set(w.id, {
        id: w.id,
        name: w.name,
        type: w.type === "ENTERPRISE" ? "ENTERPRISE" : "PERSONAL",
      });
    }
    for (const m of memberships) {
      if (! m.workspace) continue;
      if (m.workspace.type === "PERSONAL" && m.workspace.ownerId !== userId) continue;
      if (!wsMap.has(m.workspace.id)) {
        wsMap.set(m.workspace.id, {
          id: m.workspace.id,
          name: m.workspace.name,
          type: m.workspace.type === "ENTERPRISE" ? "ENTERPRISE" : "PERSONAL",
        });
      }
    }
    const wsList = Array.from(wsMap.values());
    const quotas =
      wsList.length > 0
        ? await prisma.workspacequota.findMany({
            where: { workspaceId: { in: wsList.map((w) => w.id) } },
            select: { workspaceId: true, tokenBalance: true },
          })
        : [];
    const quotaByWs = new Map(quotas.map((q) => [q.workspaceId, Number(q.tokenBalance) || 0]));

    const workspacesWithQuota = wsList.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      typeLabel: w.type === "ENTERPRISE" ? "企业空间" : "个人空间",
      tokenBalance: quotaByWs.get(w.id) ?? 0,
    }));

    const personalWs = workspacesWithQuota.find((w) => w.type === "PERSONAL");
    const personalTokenBalance = personalWs ? personalWs.tokenBalance : (workspacesWithQuota[0]?.tokenBalance ?? 0);

    const usageMap: Record<string, number> = {};
    const lastPathMap: Record<string, string> = {};
    const recentLogs: Array<{
      id: string;
      keyId: string;
      keyName: string;
      keyPrefix: string | null;
      path: string;
      endpointTitle: string;
      ipAddress: string;
      createdAt: Date;
    }> = [];

    const logsToHeal: Array<{ id: string; ipAddress: string; details: any }> = [];

    for (const log of usageLogs) {
      let details: any = log.details;
      if (typeof details === "string") {
        try {
          details = JSON.parse(details);
        } catch {
          details = {};
        }
      }
      const keyId = String(details?.keyId || "");
      const dbKey = keyId ? keyById.get(keyId) : undefined;
      if (keyId) {
        usageMap[keyId] = (usageMap[keyId] || 0) + 1;
        if (!lastPathMap[keyId] && details?.path) {
          lastPathMap[keyId] = String(details.path);
        }
      }

      const rawKeyName = String(details?.keyName || "");
      const localizedName = localizeKeyName(rawKeyName, dbKey?.name);
      const rawPath = String(details?.path || "/api/open/v1/me");
      const endpointTitle = resolveEndpointTitle(rawPath, openConfig.openEndpoints);
      const cleanIp = formatAuditIpAddress(log.ipAddress);

      // 如果历史记录中存在 ::1 / unknown 或纯英文演练 keyName，自动修复数据库存储
      if (
        log.ipAddress !== cleanIp ||
        (rawKeyName && rawKeyName !== localizedName && LEGACY_KEY_NAME_DICT[rawKeyName])
      ) {
        logsToHeal.push({
          id: log.id,
          ipAddress: cleanIp,
          details: {
            ...(typeof details === "object" && details ? details : {}),
            keyName: localizedName,
            endpointTitle,
          },
        });
      }

      if (recentLogs.length < 200) {
        recentLogs.push({
          id: log.id,
          keyId,
          keyName: localizedName,
          keyPrefix: dbKey?.keyPrefix || null,
          path: rawPath,
          endpointTitle,
          ipAddress: cleanIp,
          createdAt: log.createdAt,
        });
      }
    }

    if (logsToHeal.length > 0) {
      Promise.all(
        logsToHeal.slice(0, 100).map((item) =>
          prisma.operationlog
            .update({
              where: { id: item.id },
              data: {
                ipAddress: item.ipAddress,
                details: item.details,
              },
            })
            .catch(() => {}),
        ),
      ).catch(() => {});
    }

    const enrichedKeys = apiKeys.map((k) => {
      const lastPath = lastPathMap[k.id] || null;
      return {
        ...toPublic(k),
        name: localizeKeyName(k.name, k.name),
        usageCount: usageMap[k.id] || 0,
        lastPath,
        lastEndpointTitle: lastPath
          ? resolveEndpointTitle(lastPath, openConfig.openEndpoints)
          : null,
      };
    });

    const totalCalls = usageLogs.length;
    const activeKeys = enrichedKeys.filter((k) => k.usageCount > 0 || k.lastUsedAt).length;

    const STATUS_LABELS: Record<string, string> = {
      SUCCESS: "执行成功",
      RUNNING: "正在执行",
      PENDING: "排队等待",
      FAILED: "执行失败",
      SETTLEMENT_PENDING: "待结算确认",
    };

    return NextResponse.json({
      apiKeys: enrichedKeys,
      recentLogs,
      summary: {
        totalKeys: enrichedKeys.length,
        activeKeys,
        unusedKeys: enrichedKeys.length - activeKeys,
        totalCalls,
        lastCallAt: usageLogs[0]?.createdAt || null,
      },
      tokenBalance: personalTokenBalance,
      workspaces: workspacesWithQuota,
      components: publishedComponents.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description || "",
        categoryKey: c.category,
        categoryName: catMap.get(c.category) || "业务研发组件",
        estimatedModelTokens: c.estimatedModelTokens || 1000,
      })),
      recentTasks: recentTaskRows.map((t) => {
        const compId = (t.type || "").trim().toUpperCase();
        const wsObj = wsMap.get(t.tenantId || "");
        return {
          id: t.id,
          name: t.name || compNameMap.get(compId) || "组件执行任务",
          componentId: compId,
          componentName: compNameMap.get(compId) || compId || "标准组件",
          status: t.status,
          statusLabel: STATUS_LABELS[t.status] || "已完成",
          workspaceId: t.tenantId,
          workspaceName: wsObj?.name || "个人空间",
          createdAt: t.createdAt,
        };
      }),
      openEndpoints: openConfig.openEndpoints,
      statusCodeGuides: openConfig.statusCodeGuides,
      rateLimitPerMin: openConfig.rateLimitPerMin,
    });
  } catch (error) {
    console.error("获取 API Keys 错误:", error);
    return NextResponse.json({ error: "获取 API Keys 失败" }, { status: 500 });
  }
}

// 在线连通性调试台真实执行处理器（支持全 6 个开放接口端点真实数据库查询与组件调用）
async function handleDebugOpenApiRequest(
  req: NextRequest,
  userId: string,
  body: Record<string, any>,
) {
  const {
    keyId,
    plainKey,
    endpointId,
    workspaceId,
    componentId,
    taskId,
    limit: rawLimit,
    taskName,
    inputMaterial,
  } = body;

  // 1. 校验访问密钥（支持直接选择本人已签发的数据库密钥，或粘贴完整 sk-... 明文密钥）
  let matchedKey: { id: string; name: string; userId: string } | null = null;
  const trimmedPlain = typeof plainKey === "string" ? plainKey.trim() : "";

  if (trimmedPlain) {
    const prefixes = Array.from(
      new Set([trimmedPlain.slice(0, 11), trimmedPlain.slice(0, 3)].filter(Boolean)),
    );
    const candidates = await prisma.apikey.findMany({
      where: { userId, keyPrefix: { in: prefixes } },
    });
    for (const c of candidates) {
      const ok = await bcrypt.compare(trimmedPlain, c.keyHash).catch(() => false);
      if (ok) {
        matchedKey = { id: c.id, name: c.name, userId: c.userId };
        break;
      }
    }
    if (!matchedKey) {
      return NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "粘贴的访问密钥无效、不属于当前账号或已被吊销",
        },
        { status: 401 },
      );
    }
  } else if (typeof keyId === "string" && keyId.trim()) {
    const found = await prisma.apikey.findFirst({
      where: { id: keyId.trim(), userId },
      select: { id: true, name: true, userId: true },
    });
    if (!found) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "所选访问密钥不存在或已被吊销" },
        { status: 401 },
      );
    }
    matchedKey = found;
  } else {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "请先选择一枚已签发密钥或粘贴完整访问密钥" },
      { status: 401 },
    );
  }

  // 2. 限流校验（与 /api/open/v1/* 完全一致）
  const rate = await checkOpenApiRateLimit(matchedKey.id);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: `当前访问密钥每分钟请求上限为 ${rate.limit} 次，请 ${rate.retryAfterSec} 秒后重试`,
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429 },
    );
  }

  // 3. 解析请求端点路径并记录真实调用痕迹（更新 lastUsedAt + 写入 APIKey:Use 审计流水）
  const pathMap: Record<string, string> = {
    me: "/api/open/v1/me",
    workspaces: "/api/open/v1/workspaces",
    components: "/api/open/v1/components",
    tasks: "/api/open/v1/tasks",
    taskDetail: `/api/open/v1/tasks/${typeof taskId === "string" && taskId.trim() ? taskId.trim() : ""}`,
    execute: "/api/open/v1/execute",
  };
  const targetPath = pathMap[endpointId] || "/api/open/v1/me";
  const rawIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  const cleanIp = formatAuditIpAddress(rawIp);
  const cleanKeyName = localizeKeyName(matchedKey.name, matchedKey.name);

  await prisma.apikey
    .update({ where: { id: matchedKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  await prisma.operationlog
    .create({
      data: {
        id: uuidv4(),
        userId,
        action: "APIKey:Use",
        resource: "APIKey",
        details: {
          keyId: matchedKey.id,
          keyName: cleanKeyName,
          path: targetPath,
          endpointTitle: resolveEndpointTitle(targetPath, DEFAULT_OPEN_ENDPOINTS),
        },
        ipAddress: cleanIp,
        createdAt: new Date(),
      },
    })
    .catch(() => {});

  const authMeta = { keyId: matchedKey.id, keyName: cleanKeyName };

  // 4. 按不同端点执行真实数据库查询或组件调度
  if (endpointId === "me") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        membershipLevel: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND", message: "用户不存在" }, { status: 404 });
    }
    let tokenBalance = 0;
    const personalWs = await prisma.workspace.findFirst({
      where: { ownerId: user.id, type: "PERSONAL" },
      select: { id: true },
    });
    if (personalWs) {
      const pq = await prisma.workspacequota.findUnique({
        where: { workspaceId: personalWs.id },
      });
      if (pq) tokenBalance = Number(pq.tokenBalance);
    }
    return NextResponse.json({
      success: true,
      data: {
        ...user,
        tokenBalance,
      },
      auth: authMeta,
    });
  }

  if (endpointId === "workspaces") {
    const [memberships, owned] = await Promise.all([
      prisma.workspacemember.findMany({
        where: { userId },
        include: {
          workspace: {
            select: { id: true, name: true, type: true, description: true, createdAt: true },
          },
        },
        orderBy: { joinedAt: "desc" },
      }),
      prisma.workspace.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true, type: true, description: true, createdAt: true },
      }),
    ]);
    const map = new Map<string, any>();
    for (const m of memberships) {
      if (!m.workspace) continue;
      map.set(m.workspace.id, {
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        typeLabel: m.workspace.type === "ENTERPRISE" ? "企业空间" : "个人空间",
        description: m.workspace.description,
        role: m.role,
        createdAt: m.workspace.createdAt,
      });
    }
    for (const w of owned) {
      const existing = map.get(w.id);
      map.set(w.id, {
        id: w.id,
        name: w.name,
        type: w.type,
        typeLabel: w.type === "ENTERPRISE" ? "企业空间" : "个人空间",
        description: w.description,
        role: existing?.role || "OWNER",
        createdAt: w.createdAt,
      });
    }
    const workspaces = Array.from(map.values());
    return NextResponse.json({
      success: true,
      total: workspaces.length,
      data: workspaces,
      auth: authMeta,
    });
  }

  if (endpointId === "components") {
    const [rows, cats] = await Promise.all([
      prisma.componentcatalog.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          tags: true,
          icon: true,
          inputMode: true,
        },
      }),
      prisma.componentcategory.findMany(),
    ]);
    const catMap = new Map(cats.map((c) => [c.key, c.name]));
    return NextResponse.json({
      success: true,
      total: rows.length,
      data: rows.map((r) => ({
        ...r,
        categoryName: catMap.get(r.category) || r.category,
      })),
      auth: authMeta,
    });
  }

  if (endpointId === "tasks") {
    const parsedLimit = Number(rawLimit || 20);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
    const rows = await prisma.componenttask.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        tenantId: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return NextResponse.json({
      success: true,
      total: rows.length,
      data: rows,
      auth: authMeta,
    });
  }

  if (endpointId === "taskDetail") {
    const tid = typeof taskId === "string" ? taskId.trim() : "";
    if (!tid) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "请先选择或输入要查询的任务编号 (taskId)" },
        { status: 400 },
      );
    }
    const task = await prisma.componenttask.findFirst({
      where: { id: tid, userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        config: true,
        result: true,
        tenantId: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!task) {
      return NextResponse.json(
        { error: "TASK_NOT_FOUND", message: "未找到该任务编号，或该任务不属于当前账号" },
        { status: 404 },
      );
    }
    const config = (typeof task.config === "object" && task.config ? task.config : {}) as Record<
      string,
      any
    >;
    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        name: task.name,
        type: task.type,
        status: task.status,
        workspaceId: task.tenantId,
        channel: config.channel ?? null,
        contractVersion: config.contractVersion ?? null,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        result: task.result,
      },
      auth: authMeta,
    });
  }

  if (endpointId === "execute") {
    const wsId = typeof workspaceId === "string" ? workspaceId.trim() : "";
    const compId = typeof componentId === "string" ? componentId.trim() : "";
    if (!wsId || !compId) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "缺少必填参数：工作空间 (workspaceId) 或 组件 (componentId)" },
        { status: 400 },
      );
    }
    const isMember = await requireWorkspaceMembership(userId, wsId);
    if (!isMember) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "当前账号不属于目标工作空间，无组件执行权限" },
        { status: 403 },
      );
    }
    const simBody = {
      action: "simulate",
      workspaceId: wsId,
      componentId: compId,
      taskName: typeof taskName === "string" && taskName.trim() ? taskName.trim() : "开放接口在线调试任务",
      inputMaterial:
        typeof inputMaterial === "string" && inputMaterial.trim()
          ? inputMaterial.trim()
          : "请围绕当前组件契约生成标准结构化交付方案与技术分析报告。",
      inputSource: { sourceType: "text" },
      formData: null,
    };
    const deps = {
      ...buildProductionDeps(),
      getUserId: async () => userId,
    };
    const simReq = new NextRequest(new URL(req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(simBody),
    });
    const resp = await runStudioPost(simReq, deps);
    const data = (await resp.json().catch(() => ({}))) as Record<string, any>;
    const task = (data.task || {}) as Record<string, any>;
    const createdTaskId: string | undefined =
      task.id || (typeof data.taskId === "string" ? data.taskId : undefined);

    if (createdTaskId) {
      const cur = await prisma.componenttask
        .findUnique({ where: { id: createdTaskId }, select: { config: true } })
        .catch(() => null);
      const merged = {
        ...(typeof cur?.config === "object" && cur?.config ? (cur.config as object) : {}),
        channel: "OPEN_API",
      };
      await prisma.componenttask
        .update({ where: { id: createdTaskId }, data: { config: merged as any } })
        .catch(() => {});
    }

    if (resp.status === 202 || data.success === true) {
      return NextResponse.json(
        {
          success: true,
          taskId: createdTaskId,
          status: task.status || (resp.status === 202 ? "SETTLEMENT_PENDING" : "SUCCESS"),
          estimatedPoints: data.estimatedPoints ?? null,
          depositPoints: data.depositPoints ?? null,
          actualPoints: data.actualPoints ?? null,
          executionMode: data.executionMode ?? null,
          contractVersion: data.contractVersion ?? null,
          artifacts: data.artifacts ?? null,
          auth: authMeta,
        },
        { status: resp.status === 202 ? 202 : 200 },
      );
    }

    return NextResponse.json(
      {
        error: typeof data.code === "string" ? data.code : "EXECUTION_FAILED",
        message: data.error || data.message || "组件执行未通过前置检查",
      },
      { status: resp.status },
    );
  }

  return NextResponse.json({ error: "BAD_REQUEST", message: "未知的开放接口端点" }, { status: 400 });
}

// 创建新的 API Key 或执行在线接口调试
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    if (body?.action === "debug-request") {
      return await handleDebugOpenApiRequest(req, userId, body);
    }

    const { name, description } = body;
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName) {
      return NextResponse.json({ error: "缺少 API Key 名称" }, { status: 400 });
    }

    const dup = await prisma.apikey.findFirst({
      where: { userId, name: trimmedName },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "已存在同名 API Key，请使用其他名称以便区分" },
        { status: 400 },
      );
    }

    // 生成 API Key：前缀为可识别且唯一的 "sk-" + 8 位随机字符，
    // 修复此前所有 Key 前缀恒为 "sk-"、列表中无法区分与检索的业务逻辑缺陷
    const keyBody = uuidv4().replace(/-/g, "");
    const apiKey = "sk-" + keyBody;
    const keyPrefix = apiKey.slice(0, 11);

    // 哈希处理
    const hashedKey = await bcrypt.hash(apiKey, 10);

    const newApiKey = await prisma.apikey.create({
      data: {
        id: uuidv4(),
        userId,
        name: trimmedName,
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        keyHash: hashedKey,
        keyPrefix,
        lastUsedAt: null,
        updatedAt: new Date(),
      },
    });

    // 写入审计日志
    await prisma.operationlog
      .create({
        data: {
          id: uuidv4(),
          userId,
          action: "APIKey:Create",
          resource: "APIKey",
          details: JSON.stringify({ id: newApiKey.id, name: newApiKey.name }),
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    // 只返回一次完整的 key
    return NextResponse.json({
      success: true,
      apiKey: {
        id: newApiKey.id,
        name: newApiKey.name,
        key: apiKey,
        createdAt: newApiKey.createdAt,
      },
      message: "请妥善保管您的 API Key，这是唯一一次显示",
    });
  } catch (error) {
    console.error("创建 API Key 错误:", error);
    return NextResponse.json({ error: "创建 API Key 失败" }, { status: 500 });
  }
}

// 删除 API Key 或 删除/批量删除开放接口调用审计明细（与管理员后台 /api/admin/operation-logs 保持一致）
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, target, logId, logIds } = body;

    // 分支 A：删除开放接口调用审计明细（支持单条删除与批量删除）
    if (target === "logs" || logId || Array.isArray(logIds)) {
      const idsToDelete: string[] = Array.isArray(logIds)
        ? logIds.filter((x: unknown) => typeof x === "string" && x.trim())
        : typeof logId === "string" && logId.trim()
          ? [logId.trim()]
          : typeof id === "string" && id.trim()
            ? [id.trim()]
            : [];

      if (idsToDelete.length === 0) {
        return NextResponse.json(
          { error: "缺少待删除的调用审计日志记录编号" },
          { status: 400 },
        );
      }

      const result = await prisma.operationlog.deleteMany({
        where: {
          id: { in: idsToDelete },
          userId,
          action: "APIKey:Use",
        },
      });

      await prisma.operationlog
        .create({
          data: {
            id: uuidv4(),
            userId,
            action: "audit_log:delete",
            resource: "APIKey",
            details: JSON.stringify({
              mode: idsToDelete.length > 1 ? "batch" : "single",
              count: result.count,
              ids: idsToDelete,
            }),
            ipAddress: formatAuditIpAddress(
              req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                req.headers.get("x-real-ip"),
            ),
            createdAt: new Date(),
          },
        })
        .catch(() => {});

      return NextResponse.json({
        success: true,
        count: result.count,
        message:
          idsToDelete.length > 1
            ? `已成功批量删除选中的 ${result.count} 条调用审计记录`
            : "调用审计记录已成功删除",
      });
    }

    // 分支 B：删除 API Key
    if (!id) {
      return NextResponse.json({ error: "缺少 API Key ID" }, { status: 400 });
    }

    const apiKey = await prisma.apikey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      return NextResponse.json({ error: "API Key 不存在" }, { status: 404 });
    }

    await prisma.apikey.delete({
      where: { id },
    });

    // 写入审计日志
    await prisma.operationlog
      .create({
        data: {
          id: uuidv4(),
          userId,
          action: "APIKey:Delete",
          resource: "APIKey",
          details: JSON.stringify({ id, name: apiKey.name }),
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, message: "API Key 删除成功" });
  } catch (error) {
    console.error("删除 API Key 错误:", error);
    return NextResponse.json({ error: "删除 API Key 失败" }, { status: 500 });
  }
}

// 更新 API Key 名称与备注描述（保持原密钥 Hash 不变，避免中断线上服务）
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { id, name, description } = await req.json();
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "缺少 API Key ID" }, { status: 400 });
    }
    if (!trimmedName) {
      return NextResponse.json({ error: "请填写 API Key 名称" }, { status: 400 });
    }

    const existing = await prisma.apikey.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "API Key 不存在" }, { status: 404 });
    }

    const dup = await prisma.apikey.findFirst({
      where: { userId, name: trimmedName, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "已存在同名 API Key，请使用其他名称以便区分" },
        { status: 400 },
      );
    }

    const updated = await prisma.apikey.update({
      where: { id },
      data: {
        name: trimmedName,
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        updatedAt: new Date(),
      },
    });

    await prisma.operationlog
      .create({
        data: {
          id: uuidv4(),
          userId,
          action: "APIKey:Update",
          resource: "APIKey",
          details: JSON.stringify({
            id: updated.id,
            name: updated.name,
            description: updated.description,
          }),
          createdAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      apiKey: toPublic(updated),
      message: "API Key 信息已更新",
    });
  } catch (error) {
    console.error("更新 API Key 错误:", error);
    return NextResponse.json({ error: "更新 API Key 失败" }, { status: 500 });
  }
}
