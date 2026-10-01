import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const skip = (page - 1) * limit;

    const [preferences, total, zhigeEngineCount, openaiEngineCount] =
      await Promise.all([
        prisma.userpreference.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
          },
        }),
        prisma.userpreference.count(),
        // 【已弃用字段】aiEngine 历史值分布：仅作历史数据统计展示，
        // 不参与任何模型选择或计费；真实执行模型由组件执行合同 + 模型注册表 + 空间模型策略决定。
        prisma.userpreference.count({ where: { aiEngine: "zhige" } }),
        prisma.userpreference.count({ where: { aiEngine: "openai" } }),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        preferences,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        /** 历史字段分布（已弃用），仅用于运营侧历史数据查看 */
        stats: { zhigeEngineCount, openaiEngineCount },
        /** 明确标记：aiEngine / defaultModel 已弃用，不再代表用户可选的模型 */
        engineFieldDeprecated: true,
      },
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    return NextResponse.json(
      {
        error: "获取偏好设置失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
