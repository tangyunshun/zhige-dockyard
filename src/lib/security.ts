import { prisma } from "@/lib/prisma";

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

  if (user && user.status === "banned" && user.bannedUntil) {
    if (user.bannedUntil > new Date()) {
      return { banned: true, until: user.bannedUntil };
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