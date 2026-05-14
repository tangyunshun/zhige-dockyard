import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { SignJWT } from "jose";
import { checkIPRisk, recordLoginIP, getClientIP } from "@/lib/ip-risk";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    const { account, password, rememberMe } = await request.json();

    // 查找用户（支持邮箱、手机号、账号名）
    // 使用 Prisma 的 raw 查询来实现真正的大小写敏感匹配
    const users = await prisma.$queryRaw`SELECT * FROM User WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}`;
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      return NextResponse.json(
        {
          message: "账号或密码错误",
          accountExists: false,
          remainingAttempts: 5,
        },
        { status: 401 },
      );
    }



    // 检查账号状态
    if (user.status === "banned") {
      // 检查是否为临时封禁
      let message = "账号已被永久封禁，无法登录";
      if (user.bannedUntil) {
        const remainingDays = Math.ceil(
          (new Date(user.bannedUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (remainingDays > 0) {
          message = `账号已被临时封禁，${remainingDays}天后恢复`;
        }
      }
      return NextResponse.json(
        {
          message: message,
          accountExists: true,
          status: user.status,
          bannedUntil: user.bannedUntil?.toISOString(),
        },
        { status: 403 },
      );
    } else if (user.status === "inactive") {
      return NextResponse.json(
        {
          message: "账号已被禁用，请联系管理员",
          accountExists: true,
          status: user.status,
        },
        { status: 403 },
      );
    } else if (user.status === "deleted") {
      return NextResponse.json(
        {
          message: "账号已被注销",
          accountExists: true,
          status: user.status,
        },
        { status: 403 },
      );
    } else if (user.status === "deleting") {
      // 允许冷静期内的用户重新登录，以便撤销注销
      const remainingDays = Math.ceil(
        (new Date(user.deletionRequestedAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      // 生成临时token，允许撤销注销
      const token = await new SignJWT({
        userId: user.id,
        email: user.email,
        role: user.role,
        deletionStatus: "cancelling",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h") // 1小时后过期
        .sign(JWT_SECRET);

      const response = NextResponse.json({
        success: true,
        message: `账号正在注销中，${remainingDays}天后正式生效，可撤销注销`,
        accountExists: true,
        status: user.status,
        deletionDaysRemaining: remainingDays,
        deletionRequestedAt: user.deletionRequestedAt?.toISOString(),
        canCancelDeletion: true, // 标记可以撤销
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });

      response.cookies.set("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1小时
        path: "/",
      });

      if (user.id) {
        response.cookies.set("userId", user.id, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60,
          path: "/",
        });
      }

      return response;
    }

    // 检查是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / 60000,
      );
      const msg = "账号已锁定，" + minutes + "分钟后再试";
      return NextResponse.json(
        {
          message: msg,
          accountExists: true,
          lockedUntil: new Date(user.lockedUntil).toISOString(),
          minutesRemaining: minutes,
        },
        { status: 423 },
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      // 增加失败次数
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= 5) {
        // 锁定 5 分钟
        const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil,
          },
        });

        return NextResponse.json(
          {
            message: "密码错误次数过多，账号已锁定 5 分钟",
            accountExists: true,
            lockedUntil: lockedUntil.toISOString(),
            remainingAttempts: 0,
          },
          { status: 423 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      const msg = "账号或密码错误（剩余" + (5 - newAttempts) + "次尝试机会）";
      return NextResponse.json(
        {
          message: msg,
          accountExists: true,
          remainingAttempts: 5 - newAttempts,
        },
        { status: 401 },
      );
    }

    // 登录成功，重置失败次数并记录登录历史
    const now = new Date();
    const clientIP = getClientIP(request);

    // 检查密码是否过期（90天）- 在这里检查更合理
    const PASSWORD_EXPIRY_DAYS = 90;
    let passwordExpired = false;
    if (user.passwordChangedAt) {
      const passwordChangeTime = new Date(user.passwordChangedAt).getTime();
      const daysSinceChange = (Date.now() - passwordChangeTime) / (1000 * 60 * 60 * 24);
      if (daysSinceChange > PASSWORD_EXPIRY_DAYS) {
        passwordExpired = true;
      }
    } else {
      // 如果没有修改过密码记录，检查账号创建时间
      const accountCreateTime = new Date(user.createdAt).getTime();
      const daysSinceCreate = (Date.now() - accountCreateTime) / (1000 * 60 * 60 * 24);
      if (daysSinceCreate > PASSWORD_EXPIRY_DAYS) {
        passwordExpired = true;
      }
    }

    // 场景20 & 场景21: IP风险检测 - 在创建会话之前先检测
    const ipRiskResult = await checkIPRisk(user.id, clientIP);
    if (ipRiskResult.isRisky) {
      console.log(`[IP风险] 用户 ${user.id} 登录IP ${clientIP} 触发风控: ${ipRiskResult.reason}`);

      // 重置失败次数（但不创建会话）
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
        },
      });

      // 生成临时验证token用于异地验证
      const verifyToken = await new SignJWT({
        userId: user.id,
        action: "cross_region_verify",
        ip: clientIP,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("5m")
        .sign(JWT_SECRET);

      return NextResponse.json({
        success: false,
        error: "IP_ABNORMAL",
        message: ipRiskResult.reason || "检测到异常登录，请完成身份验证",
        requiresVerification: true,
        verifyToken,
        riskLevel: ipRiskResult.riskLevel,
      }, { status: 403 });
    }

    // 记录登录IP用于后续风控比对
    await recordLoginIP(user.id, clientIP, request.headers.get("user-agent") || undefined);

    // 生成会话令牌（用于强制下线检查）
    const sessionToken = "sess_" + user.id + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 15);
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 天
      : new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 小时

    // 检查是否存在旧会话（挤线检测）
    const existingSessionToken = user.sessionToken;
    const hasExistingSession = existingSessionToken && existingSessionToken !== "";

    // 关键修复：确保 lastLoginAt 设置为当前时间，避免立即判定为超时
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,  // 必须设置为当前时间
        lastForcedLogoutAt: hasExistingSession ? now : null, // 如果有旧会话，标记为强制下线
        sessionToken,
        sessionExpiresAt,
      },
    });

    // 如果存在旧会话，记录挤线日志
    if (hasExistingSession) {
      console.log(`[挤线检测] 用户 ${user.id} 在新设备登录，旧会话已被挤掉`);
    }

    // 记录登录历史
    const loginHistoryId = "lh_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    await prisma.loginhistory.create({
      data: {
        id: loginHistoryId,
        userId: user.id,
        loginAt: now,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // 检查用户是否有个人空间，如果没有则创建
    let workspaceMembers = await prisma.workspacemember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            description: true,
            logo: true,
          },
        },
      },
    });

    // 查找是否有个人空间
    const personalWorkspace = workspaceMembers.find(
      (member) => member.workspace.type === "PERSONAL",
    );

    // 如果没有个人空间，调用 create-personal API 创建
    if (!personalWorkspace) {
      try {
        // 使用 fetch 调用内部的 create-personal API
        const createWorkspaceUrl = new URL('/api/workspace/create-personal', request.url).toString();
        const createResponse = await fetch(createWorkspaceUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.id}`,
          },
        });

        if (createResponse.ok) {
          // 重新查询 workspaceMembers
          workspaceMembers = await prisma.workspacemember.findMany({
            where: { userId: user.id },
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  ownerId: true,
                  description: true,
                  logo: true,
                },
              },
            },
          });
        } else {
          console.error('创建个人空间失败:', await createResponse.text());
        }
      } catch (error) {
        console.error('创建个人空间异常:', error);
        // 创建失败不影响登录，继续
      }
    }

    const workspaces = workspaceMembers.map((member) => ({
      id: member.id,
      userId: member.userId,
      workspaceId: member.workspaceId,
      role: member.role,
      workspace: member.workspace,
    }));

    // 获取用户的 lastWorkspaceId
    const lastWorkspaceId = user.lastWorkspaceId;

    // 计算建议的重定向 URL
    let redirectUrl = "/workspace-hub";
    if (
      lastWorkspaceId &&
      workspaceMembers.some((m) => m.workspaceId === lastWorkspaceId)
    ) {
      redirectUrl = "/dashboard?wid=" + lastWorkspaceId;
    } else if (workspaceMembers.length > 0) {
      redirectUrl = "/workspace-hub";
    }

    // 生成 JWT Token
    const expiresIn = rememberMe ? "7d" : "24h";
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);

    // 生成 Refresh Token（仅当记住我时）
    let refreshToken = null;
    if (rememberMe) {
      refreshToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(JWT_SECRET);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });
    }

    // 设置 Cookie
    // 设置 auth_token cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
    };

    // 创建 response
    const response = NextResponse.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        sessionToken,
        needsVerification: !user.phone && !user.email, // 如果既没有手机号也没有邮箱，需要验证
      },
      workspaces,
      lastWorkspaceId,
      redirectUrl: passwordExpired ? "/auth/change-password?expired=true" : redirectUrl,
      passwordExpired,
    });

    // 设备登录处理（场景37：设备数限制）
    try {
      const userAgent = request.headers.get("user-agent") || "unknown";

      // 解析设备信息
      let deviceType: "web" | "mobile" | "tablet" = "web";
      let browser = "unknown";
      let os = "unknown";

      if (userAgent.includes("Mobile")) {
        deviceType = "mobile";
      } else if (userAgent.includes("Tablet")) {
        deviceType = "tablet";
      }

      if (userAgent.includes("Chrome")) {
        browser = "Chrome";
      } else if (userAgent.includes("Safari")) {
        browser = "Safari";
      } else if (userAgent.includes("Firefox")) {
        browser = "Firefox";
      } else if (userAgent.includes("Edge")) {
        browser = "Edge";
      }

      if (userAgent.includes("Windows")) {
        os = "Windows";
      } else if (userAgent.includes("Mac")) {
        os = "Mac";
      } else if (userAgent.includes("Linux")) {
        os = "Linux";
      } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        os = "iOS";
      } else if (userAgent.includes("Android")) {
        os = "Android";
      }

      // 获取用户的设备限制
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deviceLimit: true },
      });

      // 获取当前用户的所有设备
      const devices = await prisma.userdevice.findMany({
        where: { userId: user.id },
        orderBy: { lastActiveAt: "asc" },
      });

      const maxDevices = currentUser?.deviceLimit || 3;

      // 如果已达设备数限制，踢掉最老的设备
      if (devices.length >= maxDevices) {
        const oldestDevice = devices[0];

        // 删除最老的设备记录
        await prisma.userdevice.delete({
          where: { id: oldestDevice.id },
        });

        console.log(`[设备超限] 用户 ${user.id} 设备数超过限制(${maxDevices}台)，已踢掉最老设备 ${oldestDevice.id}`);
      }

      // 创建新设备记录
      const deviceId = "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

      await prisma.userdevice.create({
        data: {
          id: deviceId,
          userId: user.id,
          deviceName: `${browser} on ${os}`,
          deviceType,
          browser,
          os,
          ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
          isCurrent: true,
        },
      });

      console.log(`[设备登录] 用户 ${user.id} 在新设备登录: ${browser} on ${os}`);
    } catch (deviceError) {
      // 设备登录处理失败不影响主流程，只记录日志
      console.error("[设备登录] 处理失败:", deviceError);
    }

    // 使用 response.cookies.set 设置 Cookie（Next.js App Router 正确方式）
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",  // 改回 lax，strict 可能导致跳转时 Cookie 丢失
      path: "/",
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
    });

    // 设置 session_token cookie 用于挤线检测
    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
    });

    if (refreshToken) {
      response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    console.log("✅ Cookie 已设置 (使用 response.cookies.set):", token.substring(0, 20) + "...");
    
    return response;
  } catch (error) {
    console.error("Login error:", error);
    
    let errorMessage = "服务器错误";
    let errorDetail = undefined;
    
    if (error instanceof Error) {
      errorDetail = error.message;
      
      if (error.message.includes("connect") || error.message.includes("ECONNREFUSED")) {
        errorMessage = "数据库连接失败，请联系管理员";
      }
      else if (error.message.includes("Prisma")) {
        errorMessage = "数据库操作失败";
      }
      else if (error.message.includes("password") || error.message.includes("hash")) {
        errorMessage = "密码验证失败";
      }
    }
    
    return NextResponse.json(
      { 
        message: errorMessage,
        detail: process.env.NODE_ENV === "development" ? errorDetail : undefined,
      }, 
      { status: 500 }
    );
  }
}
