/**
 * 新空间一次性体验额度发放。
 *
 * 与「注册福利」（grantNewUserGift，按月发放、当月清零）区分：
 *  - 本函数是**一次性**发放，仅在创建空间时调用；
 *  - 额度独立记账（sourceType = PLATFORM_TRIAL），优先于充值额度消耗；
 *  - 有效期由后台配置（platform.newSpaceGift.expireDays，0 = 永久）；
 *  - 开关与数值均来自后台配置，不再硬编码。
 */

import { prisma } from "@/lib/prisma";
import { grantPoints } from "@/lib/credit-service";

const GIFT_KEYS = {
  enabled: "platform.newSpaceGift.enabled",
  points: "platform.newSpaceGift.points",
  expireDays: "platform.newSpaceGift.expireDays",
} as const;

/** 读取新空间体验额度配置（含默认值） */
export async function loadNewSpaceTrialConfig(): Promise<{
  enabled: boolean;
  points: number;
  expireDays: number;
}> {
  const rows = await prisma.systemconfig.findMany({
    where: { key: { in: [GIFT_KEYS.enabled, GIFT_KEYS.points, GIFT_KEYS.expireDays] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const points = Number(map.get(GIFT_KEYS.points));
  const expireDays = Number(map.get(GIFT_KEYS.expireDays));
  const enabledRaw = map.get(GIFT_KEYS.enabled);

  return {
    // 未配置时默认关闭：避免在管理员未确认前自动赠送，造成成本失控
    enabled: enabledRaw === "true" || enabledRaw === "1",
    points: Number.isFinite(points) && points > 0 ? Math.floor(points) : 100,
    expireDays: Number.isFinite(expireDays) && expireDays > 0 ? Math.floor(expireDays) : 0,
  };
}

/**
 * 为新创建的空间发放一次性体验额度。
 * 幂等：idempotencyKey 与 workspaceId 绑定，重复调用不会重复入账。
 *
 * 配置优先级：overrides（企业套餐差异化）> 平台统一配置（platform.newSpaceGift.*）。
 * 传入 overrides 时按套餐赠送；不传则使用平台统一配置（个人空间场景）。
 */
export async function grantNewSpaceTrialQuota(params: {
  workspaceId: string;
  workspaceName?: string | null;
  operatorId?: string | null;
  /** 企业套餐差异化赠送覆盖：传入时按此配置赠送，不再回退平台统一配置 */
  overrides?: { enabled?: boolean; points?: number; expireDays?: number };
}): Promise<{ granted: number; source: "plan" | "platform" } | null> {
  // 套餐覆盖优先；未传 overrides 时回落平台统一配置（个人空间默认路径）
  const config: { enabled: boolean; points: number; expireDays: number } = params.overrides
    ? {
        enabled: params.overrides.enabled ?? false,
        points: params.overrides.points ?? 0,
        expireDays: params.overrides.expireDays ?? 0,
      }
    : await loadNewSpaceTrialConfig();

  if (!config.enabled || config.points <= 0) return null;

  const expiresAt =
    config.expireDays > 0
      ? new Date(Date.now() + config.expireDays * 24 * 60 * 60 * 1000)
      : null;

  await grantPoints({
    scope: "WORKSPACE",
    workspaceId: params.workspaceId,
    points: config.points,
    sourceType: "PLATFORM_TRIAL",
    type: "GIFT_REGISTER",
    operatorId: params.operatorId ?? null,
    title: `新空间体验额度 ${config.points} 算力点`,
    expiresAt,
    remark: `新空间一次性体验额度（${params.overrides ? "企业套餐赠送" : "平台统一赠送"}）${config.expireDays > 0 ? `，${config.expireDays} 天后过期作废` : "，永久有效"}；优先于充值额度消耗，用完需充值或申请提升`,
    idempotencyKey: `PLATFORM_TRIAL:${params.workspaceId}`,
  });

  return { granted: config.points, source: params.overrides ? "plan" : "platform" };
}
