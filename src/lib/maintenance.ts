/**
 * 系统维护模式（PRD G-02）
 *
 * 持久化到 DB（system_config 表）+ 内存缓存（60s TTL），
 * 确保多实例/重启后维护状态仍然生效，避免 PRD 原内存变量在重启后丢失的问题。
 */
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 60 * 1000;
let cache: { value: boolean; fetchedAt: number } | null = null;

export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: "maintenance_mode" } });
    const value = row?.value === "true";
    cache = { value, fetchedAt: now };
    return value;
  } catch {
    return cache?.value ?? false;
  }
}

/** 同步读取（用于 validateUser 等高频路径，依赖最近一次缓存） */
export function isMaintenanceModeSync(): boolean {
  return cache?.value ?? false;
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await prisma.systemconfig.upsert({
    where: { key: "maintenance_mode" },
    create: { key: "maintenance_mode", value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
  cache = { value: enabled, fetchedAt: Date.now() };
}

export async function getMaintenanceMessage(): Promise<string> {
  const row = await prisma.systemconfig.findUnique({ where: { key: "maintenance_message" } });
  return row?.value || "系统正在维护中，请稍后再试";
}
