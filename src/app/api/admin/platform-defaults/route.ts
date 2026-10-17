import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { withModelRegistryLock } from "@/lib/model-registry-lock";

/**
 * 平台级默认配置（默认模型池 + 新空间赠送额度）。
 *
 * GET  ：读取默认模型池与赠送配置（供后台配置页回显）
 * PUT  ：保存默认模型池（FREE / PAID）与赠送配置；可选同步到所有空间
 *
 * 存储策略：
 *  - 默认模型池 → platformdefaultmodel 表（结构化，支持 FREE/PAID 与排序）
 *  - 赠送配置   → systemconfig 键值对（标量配置，避免为此新建单列表）
 */

const GIFT_KEYS = {
  enabled: "platform.newSpaceGift.enabled",
  points: "platform.newSpaceGift.points",
  expireDays: "platform.newSpaceGift.expireDays",
} as const;

/** 读取赠送配置（含默认值：沿用现有注册福利口径 100 点 / 不启用新空间一次性赠送 / 永久有效） */
export async function loadNewSpaceGiftConfig(): Promise<{
  enabled: boolean;
  points: number;
  expireDays: number;
}> {
  const rows = await prisma.systemconfig.findMany({
    where: { key: { in: [GIFT_KEYS.enabled, GIFT_KEYS.points, GIFT_KEYS.expireDays] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const enabledRaw = map.get(GIFT_KEYS.enabled);
  const pointsRaw = map.get(GIFT_KEYS.points);
  const expireRaw = map.get(GIFT_KEYS.expireDays);

  const points = Number(pointsRaw);
  const expireDays = Number(expireRaw);

  return {
    enabled: enabledRaw == null ? false : enabledRaw === "true" || enabledRaw === "1",
    points: Number.isFinite(points) && points > 0 ? Math.floor(points) : 100,
    expireDays: Number.isFinite(expireDays) && expireDays > 0 ? Math.floor(expireDays) : 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:read", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const [poolRows, deployments, gift] = await Promise.all([
      prisma.platformdefaultmodel.findMany({
        orderBy: [{ kind: "asc" }, { sortOrder: "desc" }, { createdAt: "asc" }],
      }),
      prisma.modeldeployment.findMany({
        orderBy: [{ providerId: "asc" }, { modelId: "asc" }],
        select: {
          id: true,
          providerId: true,
          modelId: true,
          displayName: true,
          enabled: true,
          contextLimit: true,
          pricing: {
            select: {
              priceInputMicrosPerMillion: true,
              priceOutputMicrosPerMillion: true,
              costInputMicrosPerMillion: true,
              costOutputMicrosPerMillion: true,
              priceStatus: true,
              markupRateBps: true,
            },
          },
        },
      }),
      loadNewSpaceGiftConfig(),
    ]);

    const poolMap = new Map(poolRows.map((r) => [`${r.kind}:${r.deploymentId}`, r]));

    const models = deployments.map((d) => {
      const free = poolMap.get(`FREE:${d.id}`);
      const paid = poolMap.get(`PAID:${d.id}`);
      return {
        deploymentId: d.id,
        providerId: d.providerId,
        modelId: d.modelId,
        displayName: d.displayName || d.modelId,
        enabled: d.enabled,
        contextLimit: d.contextLimit,
        pricing: d.pricing ?? null,
        defaultFree: !!free,
        defaultPaid: !!paid,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        freeIds: poolRows.filter((r) => r.kind === "FREE" && r.enabled).map((r) => r.deploymentId),
        paidIds: poolRows.filter((r) => r.kind === "PAID" && r.enabled).map((r) => r.deploymentId),
        gift,
        models,
      },
    });
  } catch (error) {
    console.error("[platform-defaults] 读取失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "读取平台默认配置失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const freeIds = Array.isArray(body.freeIds) ? (body.freeIds as unknown[]).filter((v): v is string => typeof v === "string") : [];
    const paidIds = Array.isArray(body.paidIds) ? (body.paidIds as unknown[]).filter((v): v is string => typeof v === "string") : [];
    const syncToAll = body.syncToAll === true;

    const giftEnabled = body.giftEnabled === true;
    const giftPoints = Number(body.giftPoints);
    const giftExpireDays = Number(body.giftExpireDays);

    // 免费与付费不得重复配置同一模型（语义互斥）
    const overlap = freeIds.filter((id) => paidIds.includes(id));
    if (overlap.length > 0) {
      return NextResponse.json(
        { success: false, error: "同一模型不能同时是默认免费与默认付费，请检查后重试。" },
        { status: 400 },
      );
    }

    // 校验所有引用部署真实存在
    const allIds = Array.from(new Set([...freeIds, ...paidIds]));
    if (allIds.length > 0) {
      const found = await prisma.modeldeployment.findMany({
        where: { id: { in: allIds } },
        select: { id: true },
      });
      if (found.length !== allIds.length) {
        return NextResponse.json(
          { success: false, error: "包含不存在的模型部署 ID，请刷新后重试。" },
          { status: 400 },
        );
      }
    }

    await withModelRegistryLock(async (tx) => {
      // 整表重建默认池（配置项少，全量覆写最简单且不易产生孤儿）
      await tx.platformdefaultmodel.deleteMany({});
      const rows: Array<{ deploymentId: string; kind: string; sortOrder: number }> = [
        ...freeIds.map((id, i) => ({ deploymentId: id, kind: "FREE", sortOrder: freeIds.length - i })),
        ...paidIds.map((id, i) => ({ deploymentId: id, kind: "PAID", sortOrder: paidIds.length - i })),
      ];
      if (rows.length > 0) {
        await tx.platformdefaultmodel.createMany({ data: rows });
      }

      // 赠送配置写入 systemconfig
      const now = new Date();
      const configs: Array<{ key: string; value: string }> = [
        { key: GIFT_KEYS.enabled, value: giftEnabled ? "true" : "false" },
        {
          key: GIFT_KEYS.points,
          value: Number.isFinite(giftPoints) && giftPoints > 0 ? String(Math.floor(giftPoints)) : "100",
        },
        {
          key: GIFT_KEYS.expireDays,
          value: Number.isFinite(giftExpireDays) && giftExpireDays > 0 ? String(Math.floor(giftExpireDays)) : "0",
        },
      ];
      for (const c of configs) {
        await tx.systemconfig.upsert({
          where: { key: c.key },
          create: { key: c.key, value: c.value, updatedAt: now },
          update: { value: c.value, updatedAt: now },
        });
      }
    });

    // 可选：同步默认免费模型到所有已存在空间
    let syncResult: { synced: number; skipped: number } | null = null;
    if (syncToAll) {
      const { syncFreeDefaultsToAllWorkspaces } = await import("@/lib/platform-default-models");
      syncResult = await syncFreeDefaultsToAllWorkspaces();
    }

    return NextResponse.json({
      success: true,
      data: { sync: syncResult },
      message: syncResult
        ? `已保存，并同步到 ${syncResult.synced} 个空间（${syncResult.skipped} 个无需更新）`
        : "已保存，仅对新创建的空间生效",
    });
  } catch (error) {
    console.error("[platform-defaults] 保存失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "保存平台默认配置失败" }, { status: 500 });
  }
}
