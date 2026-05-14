﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 楠岃瘉绠＄悊鍛樻潈闄?
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "鏉冮檺涓嶈冻" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const actionType = searchParams.get("action") || "";
    const targetUserId = searchParams.get("userId") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (actionType) {
      where.action = { contains: actionType };
    }

    if (targetUserId) {
      where.userId = targetUserId;
    }

    const [logs, total] = await Promise.all([
      prisma.operationlog.findMany({
        where,
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
      prisma.operationlog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get operation logs error:", error);
    return NextResponse.json(
      {
        error: "鑾峰彇鎿嶄綔鏃ュ織澶辫触",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
