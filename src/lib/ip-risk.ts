import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * IP风险检测工具函数
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

export function isPrivateIP(ip: string): boolean {
  if (ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return true;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const num = parseInt(parts[0]) * 256 + parseInt(parts[1]);
  return num === 10 || num === 172 || num === 192;
}

export interface IPRiskResult {
  isRisky: boolean;
  riskLevel: "normal" | "warning" | "blocked";
  reason?: string;
  requiresVerification?: boolean;
}

/**
 * 检测IP风险等级
 * 
 * 风险检测规则：
 * 1. 内网IP - 正常
 * 2. 同城市 - 正常
 * 3. 同省份不同城市 - 警告（需要验证）
 * 4. 不同省份 - 风险（需要验证）
 * 5. 不同国家 - 高度风险（阻止或强制验证）
 */
export async function checkIPRisk(
  userId: string,
  currentIP: string
): Promise<IPRiskResult> {
  // 如果是内网IP，直接通过
  if (isPrivateIP(currentIP)) {
    return { isRisky: false, riskLevel: "normal" };
  }

  // 获取用户的历史登录信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lastLoginIp: true,
      lastLoginDevice: true,
      createdAt: true,
    },
  });

  // 如果是首次登录（没有历史IP），记录IP并通过
  if (!user?.lastLoginIp) {
    return { isRisky: false, riskLevel: "normal" };
  }

  const lastIP = user.lastLoginIp;

  // 如果IP没变，通过
  if (lastIP === currentIP) {
    return { isRisky: false, riskLevel: "normal" };
  }

  // 如果都是内网IP，通过（可能是NAT网络）
  if (isPrivateIP(lastIP) && isPrivateIP(currentIP)) {
    return { isRisky: false, riskLevel: "normal" };
  }

  // 获取IP地理位置信息（这里简化处理，实际应该调用IP地理位置API）
  // 由于没有真实IP地理位置服务，我们基于简单的启发式判断
  // 在实际环境中，应该调用如 MaxMind、IP2Location 等服务

  // 简化判断：如果IP段前两个八位组不同，认为是跨省/跨国
  const lastIPParts = lastIP.split(".");
  const currentIPParts = currentIP.split(".");

  const lastSubnet = lastIPParts.slice(0, 2).join(".");
  const currentSubnet = currentIPParts.slice(0, 2).join(".");

  if (lastSubnet !== currentSubnet) {
    // IP段发生大幅变化，认为有风险
    return {
      isRisky: true,
      riskLevel: "warning",
      reason: "检测到登录IP发生显著变化",
      requiresVerification: true,
    };
  }

  // 同一IP段，可能是同一城市的不同IP，通过
  return { isRisky: false, riskLevel: "normal" };
}

/**
 * 记录登录IP
 */
export async function recordLoginIP(userId: string, ip: string, deviceInfo?: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginIp: ip,
      lastLoginDevice: deviceInfo || null,
    },
  });
}