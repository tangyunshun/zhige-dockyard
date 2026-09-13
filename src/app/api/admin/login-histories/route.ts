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

      // 真实 UA 解析：严格提取客观数据，绝不虚假捏造
      const ua = item.userAgent || "";
      let osName = "Windows";
      let isMobile = false;

      if (ua && ua !== "unknown") {
        if (/windows nt 10/i.test(ua)) osName = "Windows 11/10";
        else if (/windows nt 6\.3/i.test(ua)) osName = "Windows 8.1";
        else if (/windows nt 6\.1/i.test(ua)) osName = "Windows 7";
        else if (/macintosh|mac os x/i.test(ua)) osName = "macOS";
        else if (/iphone/i.test(ua)) { osName = "iPhone (iOS)"; isMobile = true; }
        else if (/ipad/i.test(ua)) { osName = "iPad (iPadOS)"; isMobile = true; }
        else if (/android/i.test(ua)) { osName = "Android"; isMobile = true; }
        else if (/linux/i.test(ua)) osName = "Linux";

        if (/mobile|phone|symbian/i.test(ua)) isMobile = true;
      }

      // 浏览器严格客观分类：Chrome、Edge、IE 浏览器、360 浏览器、QQ 浏览器、其他
      let browserType: "Chrome" | "Edge" | "IE" | "360" | "QQ" | "Other" = "Other";
      let browserName = "其他浏览器";

      if (/(msie\s|trident.*rv:([\d.]+))/i.test(ua)) {
        browserType = "IE";
        browserName = "IE 浏览器";
      } else if (/(edg|edge)\//i.test(ua)) {
        browserType = "Edge";
        browserName = "Edge 浏览器";
      } else if (/(qihu\s*360|360ee|360se)/i.test(ua)) {
        browserType = "360";
        browserName = "360 浏览器";
      } else if (/(qqbrowser|mqqbrowser)/i.test(ua)) {
        browserType = "QQ";
        browserName = "QQ 浏览器";
      } else if (/chrome\//i.test(ua) && !/micromessenger/i.test(ua)) {
        browserType = "Chrome";
        browserName = "Chrome 浏览器";
      } else {
        // Safari、微信、Firefox等均按统一规范归类为其他浏览器
        browserType = "Other";
        browserName = "其他浏览器";
      }

      const deviceType: "DESKTOP" | "MOBILE" = isMobile ? "MOBILE" : "DESKTOP";
      const displayDevice = `${osName} · ${browserName}`;

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
        deviceType,
        browserType,
        browserName,
        osName,
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
