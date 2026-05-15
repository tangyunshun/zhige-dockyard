import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getClientIP } from "./ip-risk";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

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
 * 封禁IP
 */
export function banIP(ip: string, minutes: number, reason: string) {
  const until = Date.now() + minutes * 60 * 1000;
  bannedIPs.set(ip, { until, reason });
  console.log(`[安全] IP ${ip} 被封禁 ${minutes} 分钟，原因: ${reason}`);
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

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const recentLogs = logs.filter(l => l.timestamp > fiveMinutesAgo);

  if (recentLogs.length === 0) {
    return { anomaly: false };
  }

  const oneMinuteAgo = Date.now() - 1 * 60 * 1000;
  const lastMinuteRequests = recentLogs.filter(l => l.timestamp > oneMinuteAgo).length;
  if (lastMinuteRequests > 100) {
    return { anomaly: true, type: "TOO_MANY_REQUESTS", severity: "high" };
  }

  const failedRequests = recentLogs.filter(l => l.status === 401 || l.status === 403).length;
  if (failedRequests > 20) {
    return { anomaly: true, type: "TOO_MANY_FAILURES", severity: "high" };
  }

  const forbiddenAttempts = recentLogs.filter(l => l.status === 403).length;
  if (forbiddenAttempts > 10) {
    return { anomaly: true, type: "FORBIDDEN_ACCESS", severity: "medium" };
  }

  return { anomaly: false };
}

/**
 * API安全检查中间件
 * 在每个需要安全检查的API路由中调用此函数
 *
 * 场景26：恶意请求封禁
 */
export async function withSecurityCheck(
  request: NextRequest
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  const ip = getClientIP(request);

  let userId: string | undefined;
  const token = request.cookies.get("auth_token")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      // token 无效，忽略
    }
  }

  const ipBan = isIPBanned(ip);
  if (ipBan.banned) {
    return {
      allowed: false,
      error: `IP已被封禁，原因: ${ipBan.reason}`,
      status: 403,
    };
  }

  const anomaly = detectAnomalies(ip, userId);
  if (anomaly.anomaly) {
    console.log(`[安全] 检测到异常请求: ${anomaly.type} from ${userId || ip}`);

    if (anomaly.severity === "high") {
      banIP(ip, 5, anomaly.type || "异常请求");
      return {
        allowed: false,
        error: "检测到异常请求，IP已被临时封禁",
        status: 429,
      };
    }
  }

  logRequest(ip, userId, request.nextUrl.pathname, request.method, 0);

  return { allowed: true };
}
