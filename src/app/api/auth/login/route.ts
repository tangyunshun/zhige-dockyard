import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { SignJWT } from "jose";
import { checkIPRisk, recordLoginIP, getClientIP } from "@/lib/ip-risk";
import { checkGatewayBlacklist } from "@/lib/gateway-blacklist";
import { assertCSRF } from "@/lib/csrf";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";
import {
  ABSOLUTE_TIMEOUT_REMEMBER_MS,
  ABSOLUTE_TIMEOUT_NO_REMEMBER_MS,
  MAX_LOGIN_ATTEMPTS,
  TEMP_BAN_DURATION_MS,
} from "@/lib/session-constants";
import {
  maybeFinalizeDeletionIfDue,
  getDeletionCooldownDays,
} from "@/lib/account-deletion";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

export async function POST(request: NextRequest) {
  try {
    // I-04 CSRF 防护（防 Login CSRF）
    const csrf = assertCSRF(request);
    if (!csrf.ok) {
      return NextResponse.json(
        { message: "请求来源校验失败", code: "CSRF_INVALID" },
        { status: 403 },
      );
    }

    const { account, password, rememberMe } = await request.json();

    // E-03 网关黑名单：IP 被拉黑时直接拒绝登录
    const clientIp = getClientIP(request);
    const blacklist = await checkGatewayBlacklist(clientIp);
    if (blacklist.blocked) {
      console.log(`[网关黑名单] IP ${clientIp} 被拉黑，拒绝登录，原因: ${blacklist.reason || "-"}`);
      return NextResponse.json(
        {
          message: "当前网络环境已被临时限制，请稍后再试",
          code: "IP_BLOCKED",
          accountExists: true,
        },
        { status: 403 },
      );
    }

    // 查找用户（支持邮箱、手机号、账号名）
    // 第一步：使用 raw 查询实现真正的大小写敏感匹配（BINARY name），仅取 id
    const matched = (await prisma.$queryRaw`
      SELECT id FROM User WHERE email = ${account} OR phone = ${account} OR BINARY name = ${account}
    `) as { id: string }[];
    const matchedId = matched.length > 0 ? matched[0].id : null;

    if (!matchedId) {
      // 账号不存在：不返回剩余次数（避免账号枚举/误导），也不参与失败计数
      return NextResponse.json(
        {
          message: "账号或密码错误",
          accountExists: false,
        },
        { status: 401 },
      );
    }

    // 第二步：通过 Prisma 客户端读取完整用户（返回 camelCase 字段）。
    // 修复：raw 查询返回的是数据库原始 snake_case 列名（如 deletion_requested_at），
    // 直接访问 user.deletionRequestedAt 会得到 undefined，导致冷静期剩余天数被计算为 NaN。
    const user = await prisma.user.findUnique({
      where: { id: matchedId },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: "账号或密码错误",
          accountExists: false,
        },
        { status: 401 },
      );
    }



    // 检查账号状态
    if (user.status === "banned") {
      if (user.bannedUntil && new Date(user.bannedUntil) <= new Date()) {
        // 临时封禁已过期，自动解封
        await prisma.user.update({
          where: { id: user.id },
          data: {
            status: "active",
            bannedUntil: null,
          },
        });
        user.status = "active";
        user.bannedUntil = null;
      } else {
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
      }
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

    // 锁定已到期但失败次数未清零：自动解除锁定并重置计数，避免"过期后错一次又锁"
    if (user.lockedUntil && new Date(user.lockedUntil) <= new Date() && (user.loginAttempts || 0) > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockedUntil: null },
      });
      user.loginAttempts = 0;
      user.lockedUntil = null;
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      // 增加失败次数
      const newAttempts = (user.loginAttempts || 0) + 1;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        // 达到阈值：锁定 5 分钟
        const lockedUntil = new Date(Date.now() + TEMP_BAN_DURATION_MS);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil,
          },
        });

        const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        return NextResponse.json(
          {
            message: "密码错误次数过多，账号已锁定 5 分钟",
            accountExists: true,
            lockedUntil: lockedUntil.toISOString(),
            minutesRemaining: minutes,
          },
          { status: 423 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      // message 不再内嵌剩余次数，统一由前端基于 remainingAttempts 字段拼接，避免重复文案
      const msg = "账号或密码错误";
      return NextResponse.json(
        {
          message: msg,
          accountExists: true,
          remainingAttempts: MAX_LOGIN_ATTEMPTS - newAttempts,
        },
        { status: 401 },
      );
    }

    // D-02：账号注销冷静期——密码验证通过后，允许冷静期内用户重新登录以便撤销注销。
    // 必须放在密码验证之后：注销中的账号同样需要凭密码才能进入撤销流程，
    // 防止任意人冒充账号名直接获取撤销令牌。
    if (user.status === "deleting") {
      // 先检查冷静期是否已结束——已结束则执行最终注销（惰性异步销毁），不再允许撤销
      const deletionFinalized = await maybeFinalizeDeletionIfDue(user.id);
      if (deletionFinalized) {
        console.log(`[登录] 用户 ${user.id} 注销冷静期已过，已执行最终注销`);
        return NextResponse.json(
          {
            message: "账号注销冷静期已过，账号已被永久注销",
            accountExists: true,
            status: "deleted",
          },
          { status: 403 },
        );
      }
      // 即使最终注销执行失败，冷静期已过也不再允许登录撤销
      if (
        user.deletionRequestedAt &&
        new Date(user.deletionRequestedAt).getTime() <= Date.now()
      ) {
        return NextResponse.json(
          {
            message: "账号注销冷静期已过，账号已被永久注销",
            accountExists: true,
            status: "deleted",
          },
          { status: 403 },
        );
      }

      const now = new Date();

      // 刷新活跃时间：撤销流程中的 /api/auth/me 会经过 validateUser 的空闲超时校验
      // （A-01：10 分钟无活动即失效），若不刷新，冷静期用户会被 IDLE_TIMEOUT 拦截，
      // 导致撤销页面直接跳回登录页（页面乱跳转）。
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, lastActivityAt: now },
      });

      const deletionEnd = user.deletionRequestedAt
        ? new Date(user.deletionRequestedAt).getTime()
        : Date.now();
      const remainingDays = Math.max(
        0,
        Math.ceil((deletionEnd - Date.now()) / (1000 * 60 * 60 * 24)),
      );
      const cooldownDays = await getDeletionCooldownDays();

      // 生成临时token，允许撤销注销（不携带 sessionToken，不授予业务会话）
      const token = await new SignJWT({
        userId: user.id,
        email: user.email,
        role: user.role,
        deletionStatus: "cancelling",
        issuedAt: now.toISOString(),
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
        deletionCooldownDays: cooldownDays,
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
    // PRD A-02/A-03：绝对硬超时——未勾选记住我 8 小时；勾选 7 天。不可滑动续期。
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + ABSOLUTE_TIMEOUT_REMEMBER_MS) // 7 天
      : new Date(now.getTime() + ABSOLUTE_TIMEOUT_NO_REMEMBER_MS); // 8 小时

    // 检查是否存在旧会话且未过期（挤线检测）
    const hasExistingSession = user.sessionToken && user.sessionExpiresAt && new Date(user.sessionExpiresAt) > now;

    // 记录审计日志
    if (hasExistingSession) {
      await prisma.operationlog.create({
        data: {
          id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
          userId: user.id,
          action: "SESSION_CONFLICT_LOGOUT",
          resource: "auth/session",
          ipAddress: clientIP,
          details: {
            message: "检测到账号异地登录，执行挤线强制下线",
            oldSessionToken: user.sessionToken,
            newSessionToken: sessionToken,
            ipAddress: clientIP,
          },
        },
      });
      console.log(`[挤线检测] 用户 ${user.id} 的旧会话已被挤掉`);
    }

    // 内存清除该用户的旧 session 并注册新 session
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === user.id) {
        sessionCache.delete(key);
      }
    }
    sessionCache.set(sessionToken, {
      userId: user.id,
      expiresAt: sessionExpiresAt,
    });

    const refreshToken = crypto.randomUUID();
    // RT 有效期随绝对超时策略（A-02/A-03/E-06）：与绝对硬超时一致
    const refreshTokenExpiresAt = rememberMe
      ? new Date(now.getTime() + ABSOLUTE_TIMEOUT_REMEMBER_MS) // 7 天
      : new Date(now.getTime() + ABSOLUTE_TIMEOUT_NO_REMEMBER_MS); // 8 小时

    // 关键修复：确保 lastLoginAt 设置为当前时间，避免立即判定为超时
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,  // 必须设置为当前时间
        lastActivityAt: now, // 初始化活跃时间，避免登录后立即被空闲超时判定
        lastForcedLogoutAt: hasExistingSession ? now : null, // 如果有旧会话，标记为强制下线
        sessionToken,
        sessionExpiresAt,
        refreshToken,
        refreshTokenExpiresAt,
      },
    });

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

    // 如果没有个人空间，直接在本地 Prisma 创建，免去 HTTP 环回网络请求和中间件鉴权拦截
    if (!personalWorkspace) {
      try {
        const workspaceName = `个人空间 - ${user.name || user.phone || user.email || '用户'}`;
        const workspaceId = `ws-personal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const nowTime = new Date();

        await prisma.workspace.create({
          data: {
            id: workspaceId,
            name: workspaceName,
            type: 'PERSONAL',
            ownerId: user.id,
            description: `${user.name || '用户'}的个人工作空间`,
            createdAt: nowTime,
            updatedAt: nowTime,
          },
        });

        await prisma.workspacemember.create({
          data: {
            id: `wsm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            userId: user.id,
            workspaceId,
            role: 'OWNER',
            joinedAt: nowTime,
          },
        });

        // 重新获取该用户的 workspaces，以便放入响应返回
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
        
        console.log(`[登录成功] 已成功为用户 ${user.id} 自动开通默认个人工作空间: ${workspaceId}`);
      } catch (error) {
        console.error('登录中开通默认工作空间异常:', error);
      }
    }

    const workspaces = workspaceMembers.map((member) => ({
      id: member.id,
      userId: member.userId,
      workspaceId: member.workspaceId,
      role: member.role,
      workspace: member.workspace,
    }));

    const lastWorkspaceId = user.lastWorkspaceId;

    // 计算建议的重定向 URL，登录成功后首屏必须是 /workspace-hub
    const redirectUrl = "/workspace-hub";

    // 生成 JWT Token
    const expiresIn = rememberMe ? "7d" : "24h";
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);



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

      // 获取用户的设备限制与单设备开关（B-04 并发设备数限制）
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deviceLimit: true, allowMultiDevice: true },
      });

      // 关闭"允许多设备"时，强制单设备（最多 1 台），新登录顶掉其余设备（B-02）
      const maxDevices = currentUser?.allowMultiDevice
        ? currentUser?.deviceLimit || 3
        : 1;

      // 先将该用户其他设备的 isCurrent 复位
      await prisma.userdevice.updateMany({
        where: { userId: user.id, isCurrent: true },
        data: { isCurrent: false },
      });

      // 查询现有设备，按最近访问时间（lastAccessTime）升序排列（B-04 剔除最老）
      const existingDevices = await prisma.userdevice.findMany({
        where: { userId: user.id },
        orderBy: { lastAccessTime: "asc" },
      });

      // 若已达设备数上限，剔除最老的设备（并懒失效其会话）
      while (existingDevices.length >= maxDevices) {
        const oldestDevice = existingDevices.shift();
        if (!oldestDevice) break;
        await prisma.userdevice.delete({ where: { id: oldestDevice.id } });
        // 被剔除设备推送"下线通知"（PRD B-04），以审计日志占位
        await prisma.operationlog.create({
          data: {
            id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
            userId: user.id,
            action: "DEVICE_KICKED_OFFLINE",
            resource: "auth/device",
            ipAddress: clientIP,
            details: {
              message: "设备数超限，最老设备被强制下线",
              deviceId: oldestDevice.id,
            },
          },
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
    // 记住我：勾选→持久化 Cookie（关浏览器仍有效）；不勾选→会话级 Cookie（关浏览器即失效）
    const persistentMaxAge = rememberMe ? 7 * 24 * 60 * 60 : undefined;

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(persistentMaxAge ? { maxAge: persistentMaxAge } : {}),
    });

    // 设置 session_token cookie 用于挤线检测
    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(persistentMaxAge ? { maxAge: persistentMaxAge } : {}),
    });

    if (refreshToken) {
      response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        ...(persistentMaxAge ? { maxAge: 30 * 24 * 60 * 60 } : {}),
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
