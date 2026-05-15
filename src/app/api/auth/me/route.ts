import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function GET(request: NextRequest) {
  try {
    // 从 Cookie 中获取 token
    let token = request.cookies.get("auth_token")?.value;

    // 如果 Cookie 中没有，尝试从 Authorization header 获取
    if (!token) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 验证 token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    // 从数据库获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        status: true,
        deletionRequestedAt: true,
        membershipLevel: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 检查用户状态
    if (
      user.status === "deleted" ||
      user.status === "banned" ||
      user.status === "inactive"
    ) {
      return NextResponse.json({ error: "账号状态异常" }, { status: 403 });
    }

    // 计算冷静期剩余天数（统一7天）
    // deletionRequestedAt 是冷静期结束日期（申请时间 + 7天）
    let deletionDaysRemaining = null;
    if (user.status === "deleting" && user.deletionRequestedAt) {
      const deletionEndDate = new Date(user.deletionRequestedAt).getTime();
      const now = Date.now();
      const remainingMs = deletionEndDate - now;
      deletionDaysRemaining = Math.max(
        0,
        Math.ceil(remainingMs / (1000 * 60 * 60 * 24)),
      );
      console.log(
        `[Auth Me] 冷静期计算: 结束日期=${new Date(deletionEndDate)}, 剩余=${deletionDaysRemaining}天`,
      );
    }

    // 返回用户信息 - 简单可靠
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        membershipLevel: user.membershipLevel,
        deletionDaysRemaining,
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ error: "认证失败" }, { status: 401 });
  }
}
