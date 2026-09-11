import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth } from "@/lib/security";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 某时间窗口内的活跃用户 id 集合（以真实登录记录 loginhistory 为准） */
async function activeUserIds(from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.loginhistory.groupBy({
    by: ["userId"],
    where: { loginAt: { gte: from, lt: to } },
  });
  return new Set(rows.map((r) => r.userId));
}

/** 环比变化：无上期基数时给出「新增」而非伪造百分比 */
function computeChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0
      ? { change: "0%", trend: "flat" as const }
      : { change: "新增", trend: "up" as const };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1);
  return {
    change: `${pct >= 0 ? "+" : ""}${rounded}%`,
    trend: pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("flat" as const),
  };
}

function localDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 管理员后台「数据分析」真实指标
 * 全部来自数据库聚合：
 * - 活跃用户：loginhistory 去重 userId
 * - 组件使用：componenttask 任务记录数
 * - 用户总量：user 表计数
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformAuth(request);
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const window = (daysAgoStart: number, daysAgoEnd: number) =>
      [new Date(nowMs - daysAgoStart * DAY_MS), new Date(nowMs - daysAgoEnd * DAY_MS)] as const;

    // 本期与上期的活跃用户集合（登录记录去重）
    const [dau, prevDau] = await Promise.all([
      activeUserIds(...window(1, 0)),
      activeUserIds(...window(2, 1)),
    ]);
    const [thisWeekUsers, lastWeekUsers] = await Promise.all([
      activeUserIds(...window(7, 0)),
      activeUserIds(...window(14, 7)),
    ]);
    const [mauUsers, prevMauUsers] = await Promise.all([
      activeUserIds(...window(30, 0)),
      activeUserIds(...window(60, 30)),
    ]);

    // 组件使用次数（任务记录数）：近 30 天 vs 前 30 天
    const [usage30, prevUsage30, totalUsers] = await Promise.all([
      prisma.componenttask.count({
        where: { createdAt: { gte: new Date(nowMs - 30 * DAY_MS) } },
      }),
      prisma.componenttask.count({
        where: {
          createdAt: {
            gte: new Date(nowMs - 60 * DAY_MS),
            lt: new Date(nowMs - 30 * DAY_MS),
          },
        },
      }),
      prisma.user.count(),
    ]);

    // 最近 7 天逐日趋势（自然日，本地时区）
    const daily: { day: string; date: string; users: number; components: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = localDayStart(new Date(nowMs - i * DAY_MS));
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const [dayUsers, dayComponents] = await Promise.all([
        activeUserIds(dayStart, dayEnd),
        prisma.componenttask.count({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);
      daily.push({
        day: WEEK_LABELS[dayStart.getDay()],
        date: `${pad2(dayStart.getMonth() + 1)}-${pad2(dayStart.getDate())}`,
        users: dayUsers.size,
        components: dayComponents,
      });
    }

    // 周留存：本周活跃 ∩ 上周活跃 / 上周活跃
    let retained = 0;
    for (const id of thisWeekUsers) {
      if (lastWeekUsers.has(id)) retained += 1;
    }
    const weeklyRetention = lastWeekUsers.size > 0
      ? (retained / lastWeekUsers.size) * 100
      : 0;
    const activeRate = totalUsers > 0 ? (mauUsers.size / totalUsers) * 100 : 0;
    const avgComponentUsage =
      mauUsers.size > 0 ? usage30 / mauUsers.size : 0;

    const dauChange = computeChange(dau.size, prevDau.size);
    const wauChange = computeChange(thisWeekUsers.size, lastWeekUsers.size);
    const mauChange = computeChange(mauUsers.size, prevMauUsers.size);
    const usageChange = computeChange(usage30, prevUsage30);

    return NextResponse.json({
      success: true,
      data: {
        kpis: [
          {
            key: "dau",
            label: "日活跃用户",
            value: dau.size,
            sub: "近 24 小时有登录行为",
            ...dauChange,
          },
          {
            key: "wau",
            label: "周活跃用户",
            value: thisWeekUsers.size,
            sub: "近 7 天有登录行为",
            ...wauChange,
          },
          {
            key: "mau",
            label: "月活跃用户",
            value: mauUsers.size,
            sub: "近 30 天有登录行为",
            ...mauChange,
          },
          {
            key: "usage",
            label: "组件使用次数",
            value: usage30,
            sub: "近 30 天任务执行记录",
            ...usageChange,
          },
        ],
        daily,
        behavior: {
          activeRate: {
            value: `${activeRate.toFixed(1)}%`,
            sub: "月活用户 / 平台总用户",
          },
          avgComponentUsage: {
            value: avgComponentUsage.toFixed(1),
            sub: "次/活跃用户（近 30 天）",
          },
          weeklyRetention: {
            value: `${weeklyRetention.toFixed(1)}%`,
            sub: "本周活跃 ∩ 上周活跃 / 上周活跃",
          },
        },
        totals: {
          users: totalUsers,
          componentsUsed30d: usage30,
        },
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get admin analytics error:", error);
    return NextResponse.json(
      { error: "获取数据分析指标失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
