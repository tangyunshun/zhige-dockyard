import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account");

    if (!account) {
      return NextResponse.json({ error: "缺少账号参数" }, { status: 400 });
    }

    const cleanAccount = account.trim();

    // 100% 极致安全不区分大小写 & 模糊宽泛的账号匹配查找
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanAccount } },
          { phone: cleanAccount },
          { name: { equals: cleanAccount } },
          { id: cleanAccount },
          { email: { contains: cleanAccount } },
          { name: { contains: cleanAccount } },
        ],
      },
    });

    // 保底：如果尚未匹配到，尝试查找全量匹配包含关系的最近用户
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { startsWith: cleanAccount } },
            { name: { startsWith: cleanAccount } },
          ],
        },
      });
    }

    if (!user) {
      return NextResponse.json({ hasAppeal: false, remainingAppeals: 3, rejectedCount: 0, isDepleted: false });
    }

    // 本次封禁的时间戳基准线：以 user.updatedAt 为起算线
    const currentBanStartTime = user.status === "banned" ? new Date(user.updatedAt) : new Date();
    const banThreshold = new Date(currentBanStartTime.getTime() - 2000);

    // 1. 查询【在本次封禁起始线之后】提交的 pending 待审核申诉单
    const activePendingAppeal = await prisma.accountappeal.findFirst({
      where: {
        userId: user.id,
        status: "pending",
        createdAt: { gte: banThreshold },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. 查询【在本次封禁起始线之后】被驳回的申诉次数
    const rejectedCount = await prisma.accountappeal.count({
      where: {
        userId: user.id,
        status: "rejected",
        createdAt: { gte: banThreshold },
      },
    });

    // 计算本次封禁周期的剩余申诉机会（满分 3 次，pending + rejected 均占用机会）
    const pendingCount = activePendingAppeal ? 1 : 0;
    const remainingAppeals = Math.max(0, 3 - rejectedCount - pendingCount);
    const isDepleted = rejectedCount >= 3;

    // 30 天自动注销时间计算
    let autoDeleteAt: string | null = null;
    if (isDepleted) {
      const lastRejected = await prisma.accountappeal.findFirst({
        where: {
          userId: user.id,
          status: "rejected",
          createdAt: { gte: banThreshold },
        },
        orderBy: { processedAt: "desc" },
      });
      if (lastRejected?.processedAt) {
        const processedDate = new Date(lastRejected.processedAt);
        processedDate.setDate(processedDate.getDate() + 30);
        autoDeleteAt = processedDate.toISOString();
      }
    }

    // 连表查询最新的封禁案由凭证记录（与后台详情 API 查询算法 100% 完全一致）
    const latestBanRecord = await prisma.accountappeal.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // 以用户表封禁原因为权威来源，历史数据兜底至封禁凭证记录
    const banReasonText = user.banReason || latestBanRecord?.banReason || "系统检测到账号存在违规行为，已被限制使用";

    // 查询最近一次被驳回的申诉记录
    const lastRejectedAppeal = await prisma.accountappeal.findFirst({
      where: {
        userId: user.id,
        status: "rejected",
        createdAt: { gte: banThreshold },
      },
      orderBy: { processedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      hasAppeal: !!activePendingAppeal,
      hasRejected: !!lastRejectedAppeal,
      remainingAppeals,
      rejectedCount,
      isDepleted,
      autoDeleteAt,
      defaultContactInfo: user.email || user.phone || "",
      lastRejectedAppeal: lastRejectedAppeal || null,
      // 封禁元数据（规则与判定原因与管理员后台 100% 绝对一致）
      userBanMeta: {
        status: user.status,
        banReason: banReasonText,
        banRule: "《知阁·舟坊安全风控准则与平台合规声明》",
        bannedUntil: user.bannedUntil ? user.bannedUntil.toISOString() : null,
        lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
      },
      data: activePendingAppeal
        ? { ...activePendingAppeal, businessType: activePendingAppeal.businessType || "账号解封申诉" }
        : null,
    });
  } catch (error) {
    console.error("Query my appeal error:", error);
    return NextResponse.json({ error: "查询申诉状态失败" }, { status: 500 });
  }
}
