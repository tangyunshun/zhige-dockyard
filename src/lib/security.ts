import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { validateUser } from "@/lib/auth";
import { jwtVerify } from "jose";
import { getClientIP } from "@/lib/ip-risk";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * API安全监控工具
 * 用于检测和防止恶意请求、暴力破解等攻击
 */

interface RequestLog {
  userId?: string;
  ip: string;
  endpoint: string;
  method: string;
  status: number;
  timestamp: number;
}

// 存储请求日志（实际应该用Redis）
const requestLogs: Map<string, RequestLog[]> = new Map();

// 存储封禁记录
const bannedIPs: Map<string, { until: number; reason: string }> = new Map();
const bannedUsers: Map<string, { until: number; reason: string }> = new Map();

/**
 * 检测IP是否被封禁
 */
export function isIPBanned(ip: string): { banned: boolean; reason?: string; until?: Date } {
  const ban = bannedIPs.get(ip);
  if (!ban) return { banned: false };

  if (ban.until < Date.now()) {
    bannedIPs.delete(ip);
    return { banned: false };
  }

  return { banned: true, reason: ban.reason, until: new Date(ban.until) };
}

/**
 * 检测用户是否被封禁
 */
export async function isUserBanned(userId: string): Promise<{ banned: boolean; reason?: string; until?: Date }> {
  // 先检查内存缓存
  const cacheBan = bannedUsers.get(userId);
  if (cacheBan) {
    if (cacheBan.until < Date.now()) {
      bannedUsers.delete(userId);
    } else {
      return { banned: true, reason: cacheBan.reason, until: new Date(cacheBan.until) };
    }
  }

  // 检查数据库
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, bannedUntil: true },
  });

  if (user && user.status === "banned") {
    // status 为 banned：临时封禁（bannedUntil 在未来）或永久封禁（bannedUntil 为 null）
    if (!user.bannedUntil || user.bannedUntil > new Date()) {
      return { banned: true, until: user.bannedUntil ?? undefined };
    }
  }

  return { banned: false };
}

/**
 * 封禁IP
 */
export function banIP(ip: string, minutes: number, reason: string) {
  const until = Date.now() + minutes * 60 * 1000;
  bannedIPs.set(ip, { until, reason });
  console.log(`[安全] IP ${ip} 被封禁 ${minutes} 分钟，原因: ${reason}`);
}

/**
 * 封禁用户
 */
export async function banUser(userId: string, minutes: number, reason: string) {
  const until = new Date(Date.now() + minutes * 60 * 1000);

  // 更新数据库
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: "banned",
      bannedUntil: until,
    },
  });

  // 更新缓存
  bannedUsers.set(userId, { until: until.getTime(), reason });

  console.log(`[安全] 用户 ${userId} 被封禁 ${minutes} 分钟，原因: ${reason}`);
}

/**
 * 记录API请求
 */
export function logRequest(ip: string, userId: string | undefined, endpoint: string, method: string, status: number) {
  const key = userId || ip;
  const logs = requestLogs.get(key) || [];

  logs.push({
    userId,
    ip,
    endpoint,
    method,
    status,
    timestamp: Date.now(),
  });

  // 只保留最近100条记录
  if (logs.length > 100) {
    logs.shift();
  }

  requestLogs.set(key, logs);
}

/**
 * 检测异常请求模式
 */
export function detectAnomalies(ip: string, userId: string | undefined): { anomaly: boolean; type?: string; severity?: "low" | "medium" | "high" } {
  const key = userId || ip;
  const logs = requestLogs.get(key) || [];

  // 清理超过5分钟的日志
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const recentLogs = logs.filter(l => l.timestamp > fiveMinutesAgo);

  if (recentLogs.length === 0) {
    return { anomaly: false };
  }

  // 检测1分钟内请求数超过100
  const oneMinuteAgo = Date.now() - 1 * 60 * 1000;
  const lastMinuteRequests = recentLogs.filter(l => l.timestamp > oneMinuteAgo).length;
  if (lastMinuteRequests > 100) {
    return { anomaly: true, type: "TOO_MANY_REQUESTS", severity: "high" };
  }

  // 检测5分钟内失败请求超过20次
  const failedRequests = recentLogs.filter(l => l.status === 401 || l.status === 403).length;
  if (failedRequests > 20) {
    return { anomaly: true, type: "TOO_MANY_FAILURES", severity: "high" };
  }

  // 检测是否在尝试访问无权限接口
  const forbiddenAttempts = recentLogs.filter(l => l.status === 403).length;
  if (forbiddenAttempts > 10) {
    return { anomaly: true, type: "FORBIDDEN_ACCESS", severity: "medium" };
  }

  return { anomaly: false };
}

/**
 * API安全检查中间件逻辑
 */
export async function securityCheck(
  ip: string,
  userId: string | undefined,
  endpoint: string,
  method: string
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  // 1. 检查IP是否被封禁
  const ipBan = isIPBanned(ip);
  if (ipBan.banned) {
    return {
      allowed: false,
      error: `IP已被封禁，原因: ${ipBan.reason}`,
      status: 403,
    };
  }

  // 2. 如果已登录，检查用户是否被封禁
  if (userId) {
    const userBan = await isUserBanned(userId);
    if (userBan.banned) {
      return {
        allowed: false,
        error: "账号已被封禁",
        status: 403,
      };
    }
  }

  // 3. 检测异常请求模式
  const anomaly = detectAnomalies(ip, userId);
  if (anomaly.anomaly) {
    console.log(`[安全] 检测到异常请求: ${anomaly.type} from ${userId || ip}`);

    // 根据严重程度采取不同措施
    if (anomaly.severity === "high") {
      // 高严重度：封禁IP 5分钟
      banIP(ip, 5, anomaly.type || "异常请求");
      return {
        allowed: false,
        error: "检测到异常请求，IP已被临时封禁",
        status: 429,
      };
    }
  }

  return { allowed: true };
}


// ==========================================
// ⚓ 三层角色、模块权限、空间鉴权与审计日志核心重构
// ==========================================

const PERMISSIONS_FILE = path.join(process.cwd(), "src/lib/admin-permissions.json");

/**
 * P2-3 优化：平台管理员权限包入库（systemconfig）+ 5min 内存缓存
 * 兼容策略：DB 为准，JSON 文件作为一次性迁移源与兜底
 */
const ADMIN_PERMISSIONS_CONFIG_KEY = "platform_admin_permissions";
const ADMIN_PERMISSIONS_CACHE_MS = 5 * 60 * 1000;

interface PermissionsCache {
  mapping: Record<string, string[]>;
  fetchedAt: number;
}

const globalForPerms = globalThis as unknown as {
  adminPermissionsCache: PermissionsCache | null;
};

async function loadPermissionsMapping(): Promise<Record<string, string[]>> {
  const now = Date.now();
  const cache = globalForPerms.adminPermissionsCache;
  if (cache && now - cache.fetchedAt < ADMIN_PERMISSIONS_CACHE_MS) {
    return cache.mapping;
  }

  let mapping: Record<string, string[]> = {};
  // 读取 DB / 文件失败时不允许向调用方（如 /api/auth/me）抛出异常，
  // 必须回退到 JSON 文件或内存缓存，保证普通认证接口不 500。
  try {
    const row = await prisma.systemconfig.findUnique({
      where: { key: ADMIN_PERMISSIONS_CONFIG_KEY },
    });
    if (row?.value) {
      try {
        mapping = JSON.parse(row.value);
      } catch (parseError) {
        // DB 值损坏（可能曾被截断写入）：记录 warning 并回退 JSON 文件
        console.warn("[权限] systemconfig 中权限映射 JSON 解析失败，回退 JSON 文件:", parseError);
        if (fs.existsSync(PERMISSIONS_FILE)) {
          const data = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
          mapping = JSON.parse(data);
        }
      }
    } else if (fs.existsSync(PERMISSIONS_FILE)) {
      // DB 无记录时，从 JSON 文件一次性迁移；写入失败（如 P2000 列容量超限）不得阻断读取，
      // 仅记录 warning，后续继续使用文件内容作为可靠回退。
      const data = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
      mapping = JSON.parse(data);
      try {
        await prisma.systemconfig.upsert({
          where: { key: ADMIN_PERMISSIONS_CONFIG_KEY },
          create: {
            key: ADMIN_PERMISSIONS_CONFIG_KEY,
            value: JSON.stringify(mapping),
          },
          update: {
            value: JSON.stringify(mapping),
          },
        });
        console.log("[权限] 已将 admin-permissions.json 迁移至 systemconfig 表");
      } catch (upsertError) {
        console.warn("[权限] 权限映射写入 systemconfig 失败（可能超过列容量），本次继续使用 JSON 文件回退:", upsertError);
      }
    }
  } catch (error) {
    console.error("读取管理员权限包失败，回退 JSON 文件:", error);
    try {
      if (fs.existsSync(PERMISSIONS_FILE)) {
        const data = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
        mapping = JSON.parse(data);
      }
    } catch {
      // 忽略
    }
  }

  globalForPerms.adminPermissionsCache = { mapping, fetchedAt: now };
  return mapping;
}

function invalidatePermissionsCache(): void {
  globalForPerms.adminPermissionsCache = null;
}

/**
 * 平台角色归一化转换
 * 兼容旧数据中各种拼写和大小写
 */
export function normalizePlatformRole(role: string | null | undefined): "USER" | "PLATFORM_ADMIN" | "SUPER_ADMIN" {
  if (!role) return "USER";
  const r = role.toUpperCase();
  if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE") return "SUPER_ADMIN";
  if (r === "ADMIN" || r === "PLATFORM_ADMIN" || r === "PLATFORMADMIN") return "PLATFORM_ADMIN";
  return "USER";
}

/**
 * 读取普通管理员的权限包列表（P2-3：入库 + 缓存）
 */
export async function getAdminPermissions(userId: string): Promise<string[]> {
  const mapping = await loadPermissionsMapping();
  return mapping[userId] || [];
}

/**
 * 保存/更新普通管理员的权限包列表（P2-3：写入 DB）
 */
export async function saveAdminPermissions(
  userId: string,
  permissions: string[]
): Promise<boolean> {
  let mapping: Record<string, string[]>;
  try {
    mapping = await loadPermissionsMapping();
  } catch (error) {
    console.error("加载管理员权限映射失败，无法保存:", error);
    return false;
  }

  mapping[userId] = permissions;
  const json = JSON.stringify(mapping);

  // 1. 优先写入 DB（systemconfig），写入失败（如 P2000 列容量超限）不阻断后续回退
  let dbOk = false;
  try {
    await prisma.systemconfig.upsert({
      where: { key: ADMIN_PERMISSIONS_CONFIG_KEY },
      create: {
        key: ADMIN_PERMISSIONS_CONFIG_KEY,
        value: json,
      },
      update: {
        value: json,
      },
    });
    dbOk = true;
  } catch (dbError) {
    console.warn("[权限] 权限映射写入 systemconfig 失败（可能超过列容量），回退 JSON 文件:", dbError);
  }

  // 2. 尽力持久化到 JSON 文件（与 loadPermissionsMapping 的可靠回退源保持一致）
  let fileOk = false;
  if (!dbOk) {
    try {
      fs.writeFileSync(PERMISSIONS_FILE, json, "utf-8");
      fileOk = true;
    } catch (fileError) {
      console.error("[权限] 权限映射写入 JSON 文件失败:", fileError);
    }
  }

  // 3. 无论如何更新内存缓存，保证进程内权限立即生效（认证接口始终能读到最新结果）
  globalForPerms.adminPermissionsCache = {
    mapping,
    fetchedAt: Date.now(),
  };

  return dbOk || fileOk;
}

/**
 * 服务端 API 统一平台角色与权限鉴权中继
 */
export async function requirePlatformAuth(
  request: Request,
  requiredPermission?: string
): Promise<{
  authorized: boolean;
  user?: { id: string; email: string; name: string; role: string; status: string };
  errorResponse?: Response;
}> {
  const authHeader = request.headers.get("authorization");
  // 统一走合法 JWT 校验（同时交叉校验 x-user-id，拒绝客户端伪造的明文身份）
  let authResult = await validateUser(request.headers.get("authorization"), request as any);

  // 双保险机制：如果 header 校验失败，尝试从 Request Cookie 中提取并解析 auth_token JWT
  if (!authResult.valid) {
    let token = "";
    if ("cookies" in request) {
      token = (request as any).cookies.get("auth_token")?.value || "";
    } else {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const userId = payload.userId as string;
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, role: true, status: true }
        });
        if (dbUser && dbUser.status === "active") {
          authResult = {
            valid: true,
            user: {
              id: dbUser.id,
              email: dbUser.email || "",
              name: dbUser.name || "",
              role: dbUser.role,
              status: dbUser.status
            }
          };
        }
      } catch (jwtError) {
        console.error("requirePlatformAuth JWT 兜底验证失败:", jwtError);
      }
    }
  }

  if (!authResult.valid || !authResult.user) {
    return {
      authorized: false,
      errorResponse: new Response(
        JSON.stringify({ error: authResult.error || "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const user = authResult.user;
  const platformRole = normalizePlatformRole(user.role);

  // 1. SUPER_ADMIN 直接放行全部模块
  if (platformRole === "SUPER_ADMIN") {
    return { authorized: true, user };
  }

  // 2. PLATFORM_ADMIN 检查 PlatformAdminPermission
  if (platformRole === "PLATFORM_ADMIN") {
    if (!requiredPermission) {
      return { authorized: true, user }; // 仅要求管理员权限
    }
    let permissions: string[] = [];
    try {
      permissions = await getAdminPermissions(user.id);
    } catch (permError) {
      // 权限包读取失败（如 systemconfig 列容量 P2000 等）不得阻断认证：
      // 仅记录 warning，本次按空权限包处理，绝不默认放开全部权限。
      console.warn("[权限] 读取平台管理员权限包失败，本次按空权限包处理:", permError);
    }
    if (permissions.includes(requiredPermission)) {
      return { authorized: true, user };
    }
  }

  // 3. 否则拒绝
  return {
    authorized: false,
    errorResponse: new Response(
      JSON.stringify({ error: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ),
  };
}

/**
 * 在应用层结合 workspacemember 物理角色与岗位计算出逻辑角色
 */
export async function getLogicalWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<"OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true }
  });
  if (!workspace) return null;
  if (workspace.ownerId === userId) return "OWNER";

  const member = await prisma.workspacemember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } }
  });
  if (!member) return null;

  // 查询岗位
  const posts = await prisma.postmember.findMany({
    where: { userId, workspaceId },
    include: { post: true }
  });

  const postNames = posts.map(p => p.post.name.toUpperCase());

  if (postNames.includes("COMPONENT_MANAGER") || postNames.includes("COMPONENT_ADMIN")) {
    return "COMPONENT_MANAGER";
  }
  if (postNames.includes("KNOWLEDGE_MANAGER") || postNames.includes("KNOWLEDGE_ADMIN")) {
    return "KNOWLEDGE_MANAGER";
  }
  if (postNames.includes("VIEWER") || postNames.includes("WORKSPACE_VIEWER")) {
    return "VIEWER";
  }

  // 查询扩展岗位变更日志
  const roleLog = await prisma.operationlog.findFirst({
    where: {
      workspaceId,
      action: "UPDATE_MEMBER_ROLE",
      resource: userId,
    },
    orderBy: { createdAt: "desc" }
  });

  if (roleLog && roleLog.details) {
    const extRole = (roleLog.details as any)?.newRole;
    if (extRole) {
      return extRole as any;
    }
  }

  const physicalRole = member.role.toUpperCase();
  if (physicalRole === "OWNER") return "OWNER";
  if (physicalRole === "ADMIN") return "ADMIN";
  return "MEMBER";
}

/**
 * P1-3 优化：批量计算用户在多个工作空间的逻辑角色
 * 替代在循环里逐个调用 getLogicalWorkspaceRole 造成的 N+1 查询
 *
 * @param userId 用户 ID
 * @param workspaceIds 工作空间 ID 列表
 * @returns Map<workspaceId, logicalRole>
 */
export async function getLogicalWorkspaceRolesBatch(
  userId: string,
  workspaceIds: string[]
): Promise<Map<string, "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | null>> {
  const result = new Map<string, "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | null>();
  if (workspaceIds.length === 0) return result;

  // 1. 一次性查询所有工作空间的 ownerId
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, ownerId: true },
  });
  const workspaceMap = new Map(workspaces.map(w => [w.id, w.ownerId]));

  // 2. 一次性查询用户在这些空间的成员记录
  const members = await prisma.workspacemember.findMany({
    where: { userId, workspaceId: { in: workspaceIds } },
  });
  const memberMap = new Map(members.map(m => [m.workspaceId, m]));

  // 3. 一次性查询用户在这些空间的岗位记录
  const posts = await prisma.postmember.findMany({
    where: { userId, workspaceId: { in: workspaceIds } },
    include: { post: true },
  });
  // 按 workspaceId 分组
  const postsByWorkspace = new Map<string, string[]>();
  for (const p of posts) {
    const arr = postsByWorkspace.get(p.workspaceId) || [];
    arr.push(p.post.name.toUpperCase());
    postsByWorkspace.set(p.workspaceId, arr);
  }

  // 4. 一次性批量查询最新的扩展岗位变更日志
  const roleLogs = await prisma.operationlog.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      action: "UPDATE_MEMBER_ROLE",
      resource: userId,
    },
    orderBy: { createdAt: "asc" }
  });

  const extRoleMap = new Map<string, string>();
  roleLogs.forEach(log => {
    const ext = (log.details as any)?.newRole;
    if (ext && log.workspaceId) {
      extRoleMap.set(log.workspaceId, ext);
    }
  });

  for (const wsId of workspaceIds) {
    const ownerId = workspaceMap.get(wsId);
    if (ownerId === userId) {
      result.set(wsId, "OWNER");
      continue;
    }

    const member = memberMap.get(wsId);
    if (!member) {
      result.set(wsId, null);
      continue;
    }

    const extRole = extRoleMap.get(wsId);
    if (extRole) {
      result.set(wsId, extRole as any);
      continue;
    }

    const postNames = postsByWorkspace.get(wsId) || [];
    if (postNames.includes("COMPONENT_MANAGER") || postNames.includes("COMPONENT_ADMIN")) {
      result.set(wsId, "COMPONENT_MANAGER");
      continue;
    }
    if (postNames.includes("KNOWLEDGE_MANAGER") || postNames.includes("KNOWLEDGE_ADMIN")) {
      result.set(wsId, "KNOWLEDGE_MANAGER");
      continue;
    }
    if (postNames.includes("VIEWER") || postNames.includes("WORKSPACE_VIEWER")) {
      result.set(wsId, "VIEWER");
      continue;
    }

    const physicalRole = member.role.toUpperCase();
    if (physicalRole === "OWNER") result.set(wsId, "OWNER");
    else if (physicalRole === "ADMIN") result.set(wsId, "ADMIN");
    else result.set(wsId, "MEMBER");
  }

  return result;
}

/**
 * 校验用户是否具备特定的空间和组件权限
 */
export async function requireWorkspacePermission(
  userId: string,
  workspaceId: string,
  permissionKey: string
): Promise<boolean> {
  const role = await getLogicalWorkspaceRole(userId, workspaceId);
  if (!role) return false;

  // 1. OWNER 拥有所有权限
  if (role === "OWNER") return true;

  // 2. ADMIN 拥有除 workspace:delete 之外的所有空间权限
  if (role === "ADMIN") {
    if (permissionKey === "workspace:delete") return false;
    return true;
  }

  // 3. COMPONENT_MANAGER 拥有组件相关的配置/执行与基础查看权限
  if (role === "COMPONENT_MANAGER") {
    const componentKeys = [
      "component:view",
      "component:install",
      "component:configure",
      "component:execute",
      "component:authorize",
      "component:remove",
      "task:view",
      "workspace:view"
    ];
    return componentKeys.includes(permissionKey);
  }

  // 4. KNOWLEDGE_MANAGER 拥有知识库管理、资料查看等权限
  if (role === "KNOWLEDGE_MANAGER") {
    const knowledgeKeys = [
      "knowledge:view",
      "knowledge:create",
      "knowledge:approve",
      "knowledge:delete",
      "result:view",
      "asset:view",
      "workspace:view"
    ];
    return knowledgeKeys.includes(permissionKey);
  }

  // 5. MEMBER 拥有被授权组件执行、任务创建查看、资料上传等权限
  if (role === "MEMBER") {
    const memberKeys = [
      "workspace:view",
      "component:view",
      "component:execute",
      "task:create",
      "task:view",
      "asset:upload",
      "result:view",
      "knowledge:create"
    ];
    return memberKeys.includes(permissionKey);
  }

  // 6. VIEWER 拥有基础只读权限
  if (role === "VIEWER") {
    const viewerKeys = [
      "workspace:view",
      "component:view",
      "task:view",
      "asset:view",
      "result:view",
      "knowledge:view"
    ];
    return viewerKeys.includes(permissionKey);
  }

  return false;
}

/**
 * 记录统一的高危审计日志并持久化至 operationlog
 */
export async function writeAuditLog(
  userId: string,
  action: string,
  details: any,
  workspaceId?: string | null,
  ipAddress?: string | null,
  request?: NextRequest
) {
  try {
    // 若调用方未显式传入 IP，则尝试从请求头自动提取，保证审计日志记录操作者真实 IP
    let finalIp = ipAddress || null;
    if (!finalIp && request) {
      finalIp = getClientIP(request);
    }

    const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await prisma.operationlog.create({
      data: {
        id: randomId,
        userId,
        workspaceId: workspaceId || null,
        action,
        resource: action.split(":")[0] || "system",
        details: details ? JSON.stringify(details) : undefined,
        ipAddress: finalIp || null,
      },
    });
  } catch (error) {
    console.error("持久化写入操作审计日志失败:", error);
  }
}

/**
 * 平台高级权限拦截哨兵 (与 API 鉴权分层契合)
 */
export async function requirePlatformPermission(
  request: Request,
  permissionKey: string
): Promise<{
  authorized: boolean;
  user?: { id: string; email: string; name: string; role: string; status: string };
  errorResponse?: Response;
}> {
  return requirePlatformAuth(request, permissionKey);
}

/**
 * 强校验用户是否为指定工作空间的有效成员或 Owner
 */
export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  // 1. 检查是否为空间 Owner
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true }
  });
  
  if (workspace && workspace.ownerId === userId) {
    return true;
  }
  
  // 2. 检查是否在 workspacemember 表中存在记录
  const member = await prisma.workspacemember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId
      }
    }
  });
  
  return !!member;
}