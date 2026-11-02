/**
 * 算力相关用户通知（叶子模块）：
 *  - 福利到账（注册福利按月发放成功后）；
 *  - 到期清零（分桶清算后按人聚合，一笔流水一条账、一条通知）；
 *  - 即将到期预告（每日扫描 7 天内到期分桶，带防重）。
 *
 * 依赖约束：本模块不得 import credit-service（credit-service 会反向引用本模块，
 * 引入即循环依赖）；只依赖 notifications-store / prisma / register-gift-config。
 */
import { prisma } from "@/lib/prisma";
import { addNotification } from "@/lib/notifications-store";

/** 一笔被清零的赠送分桶摘要（由 credit-service 事务内收集、事务提交后发送） */
export interface ExpiredGrantNotice {
  userId: string | null;
  scope: string;
  workspaceId: string | null;
  points: number;
  expiresAt: Date | null;
}

/**
 * 注册福利到账通知（发放成功后调用；失败仅告警，不影响发放事务）
 */
export async function notifyRegisterGiftGranted(params: {
  userId: string;
  points: number;
  monthIndex: number;
  months: number;
  clearOnMonthEnd: boolean;
}): Promise<void> {
  const monthLabel = `${Math.max(params.monthIndex + 1, 1)}/${params.months}`;
  await addNotification(
    params.userId,
    "🎁 本月注册福利已到账",
    `您的注册福利 ${params.points} 算力点已发放（第 ${monthLabel} 个月，${
      params.clearOnMonthEnd ? "当月有效、月底未用完自动清零" : "长期有效不清零"
    }，仅限个人空间使用）。赠送期结束后如需更多算力，请前往充值中心自助充值。`,
    "points",
  );
}

/**
 * 到期清零通知：按人聚合（同一人同批多个分桶合并为一条），只通知能定位到人的分桶。
 * 每个分桶只会被清算一次（状态置 EXPIRED），因此不会重复骚扰。
 */
export async function notifyGrantsExpired(items: ExpiredGrantNotice[]): Promise<void> {
  const byUser = new Map<string, { total: number; earliest: Date | null }>();
  for (const it of items) {
    if (!it.userId || it.points <= 0) continue;
    const cur = byUser.get(it.userId) ?? { total: 0, earliest: null };
    cur.total += it.points;
    if (it.expiresAt && (!cur.earliest || it.expiresAt < cur.earliest)) {
      cur.earliest = it.expiresAt;
    }
    byUser.set(it.userId, cur);
  }

  for (const [userId, agg] of byUser) {
    const whenText = agg.earliest
      ? `（该笔额度有效期至 ${agg.earliest.toLocaleDateString("zh-CN")}）`
      : "";
    await addNotification(
      userId,
      "⏰ 算力点已到期清零",
      `您的 ${agg.total} 算力点已到期，未使用部分自动清零${whenText}。明细可在「算力点流水」中查看；如需继续使用，请前往充值中心充值。`,
      "points",
    );
  }
}

/** 即将到期提醒的标题（防重判断依据） */
const EXPIRE_REMIND_TITLE = "🔔 算力点即将到期提醒";
/** 同一用户两条提醒的最小间隔（6 天）：7 天窗口内大约提醒两次（到期前 7 天与 1 天） */
const EXPIRE_REMIND_MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;
/** 到期预告窗口（天），与 credit-service.EXPIRE_REMIND_DAYS 口径一致 */
const EXPIRE_REMIND_DAYS = 7;

/**
 * 到期前预告：扫描 7 天内将到期、仍有剩余的分桶，按人聚合发送一条提醒。
 * 带 6 天防重：同一用户 6 天内最多收到一条，避免每日扫描反复打扰。
 * 返回本次实际发送提醒的用户数。
 */
export async function remindExpiringGrants(withinDays: number = EXPIRE_REMIND_DAYS): Promise<number> {
  const now = new Date();
  const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const grants = await prisma.pointgrant.findMany({
    where: {
      status: "ACTIVE",
      remaining: { gt: 0 },
      expiresAt: { gt: now, lte: deadline },
      userId: { not: null },
    },
    select: { userId: true, remaining: true, expiresAt: true },
  });
  if (grants.length === 0) return 0;

  const byUser = new Map<string, { total: number; earliest: Date }>();
  for (const g of grants) {
    if (!g.userId) continue;
    const cur = byUser.get(g.userId);
    const points = Number(g.remaining);
    if (!cur) {
      byUser.set(g.userId, { total: points, earliest: g.expiresAt as Date });
    } else {
      cur.total += points;
      if (g.expiresAt && g.expiresAt < cur.earliest) cur.earliest = g.expiresAt;
    }
  }
  if (byUser.size === 0) return 0;

  const gapStart = new Date(now.getTime() - EXPIRE_REMIND_MIN_GAP_MS);
  let notified = 0;
  for (const [userId, agg] of byUser) {
    // 防重：6 天内已提醒过则跳过
    const recent = await prisma.notification.findFirst({
      where: { userId, title: EXPIRE_REMIND_TITLE, createdAt: { gte: gapStart } },
      select: { id: true },
    });
    if (recent) continue;

    await addNotification(
      userId,
      EXPIRE_REMIND_TITLE,
      `您有 ${agg.total} 算力点将于 ${agg.earliest.toLocaleDateString("zh-CN")} 前后到期，到期未使用将自动清零。请合理安排使用；如需长期额度，可前往充值中心充值（充值额度无到期时间）。`,
      "points",
    );
    notified++;
  }
  return notified;
}
