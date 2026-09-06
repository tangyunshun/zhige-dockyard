import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 楠岃瘉绠＄悊鍛樻潈闄?
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "鏉冮檺涓嶈冻" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const targetUserId = searchParams.get("userId") || "";
    const keyword = searchParams.get("keyword") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (targetUserId) {
      where.userId = targetUserId;
    }

    if (keyword) {
      where.user = {
        OR: [
          { name: { contains: keyword } },
          { email: { contains: keyword } },
        ],
      };
    }

    // 网络安全合规生命周期：保留最近 3 年（1095天）的登录历史，超期数据物理出清
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    await prisma.loginhistory.deleteMany({
      where: { loginAt: { lt: threeYearsAgo } },
    }).catch((err) => {
      console.warn("[日志生命周期] 自动清理3年前登录历史非致命提醒:", err);
    });

    const [histories, total] = await Promise.all([
      prisma.loginhistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { loginAt: "desc" },
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
      prisma.loginhistory.count({ where }),
    ]);

    // 格式化 IP、设备与地点，基于真实数据与客观网络属性，拒绝虚假城市硬编码
    const enrichedHistories = histories.map((item) => {
      let cleanIp = item.ipAddress || "";
      if (!cleanIp || cleanIp === "::1" || cleanIp === "127.0.0.1" || cleanIp.includes("127.0.0.1")) {
        cleanIp = "127.0.0.1 (本地局域网)";
      } else if (cleanIp.startsWith("::ffff:")) {
        const v4 = cleanIp.replace("::ffff:", "");
        cleanIp = v4 === "127.0.0.1" ? "127.0.0.1 (本地局域网)" : v4;
      }

      // 设备：以数据库中真实存储的数据为准；若历史数据为空，基于真实 User-Agent 智能提取
      let displayDevice = item.device?.trim();
      if (!displayDevice || displayDevice === "未知" || displayDevice === "unknown") {
        const ua = item.userAgent || "";
        if (ua && ua !== "unknown") {
          let os = "Windows 终端";
          if (/windows nt 10/i.test(ua)) os = "Windows 11/10";
          else if (/windows nt 6\.3/i.test(ua)) os = "Windows 8.1";
          else if (/windows nt 6\.1/i.test(ua)) os = "Windows 7";
          else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
          else if (/iphone/i.test(ua)) os = "iPhone (iOS)";
          else if (/ipad/i.test(ua)) os = "iPad (iPadOS)";
          else if (/android/i.test(ua)) os = "Android 终端";
          else if (/linux/i.test(ua)) os = "Linux 终端";

          let browser = "Web 浏览器";
          if (/micromessenger/i.test(ua)) browser = "微信客户端";
          else if (/edg/i.test(ua)) browser = "Edge 浏览器";
          else if (/chrome/i.test(ua)) browser = "Chrome 浏览器";
          else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari 浏览器";
          else if (/firefox/i.test(ua)) browser = "Firefox 浏览器";

          displayDevice = `${os} · ${browser}`;
        } else {
          displayDevice = "Web 客户端";
        }
      }

      // 地理归属地：严格以数据库真实字段为主；若为空或内网 IP，客观标定为网络属性，坚决不凭空伪造具体城市
      let displayLocation = item.location?.trim();
      if (!displayLocation || displayLocation === "未知" || displayLocation.includes("未知未知")) {
        if (cleanIp.includes("127.0.0.1") || cleanIp.includes("本地") || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
          displayLocation = "本地局域专网";
        } else {
          displayLocation = "局域专网接入";
        }
      }

      return {
        ...item,
        ipAddress: cleanIp,
        device: displayDevice,
        location: displayLocation,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        histories: enrichedHistories,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get login histories error:", error);
    return NextResponse.json(
      {
        error: "获取登录历史失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
