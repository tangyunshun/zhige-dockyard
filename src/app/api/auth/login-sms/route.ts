import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { verifySmsCode, deleteSmsCode } from "@/lib/sms-store";
import crypto from "crypto";
import { sessionCache } from "@/lib/session-cache";
import { maybeFinalizeDeletionIfDue } from "@/lib/account-deletion";
import { getJwtSecretKey } from "@/lib/jwt-config";

export async function POST(request: NextRequest) {
  try {
    const { phone, smsCode, rememberMe } = await request.json();

    if (!phone || !smsCode) {
      return NextResponse.json(
        { error: "请输入手机号和验证码" },
        { status: 400 },
      );
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "请输入正确的手机号" },
        { status: 400 },
      );
    }

    // 验证验证码格式
    if (!smsCode || smsCode.length !== 6 || !/^\d{6}$/.test(smsCode)) {
      return NextResponse.json(
        { error: "请输入正确的验证码" },
        { status: 400 },
      );
    }

    // 验证验证码
    const smsVerification = verifySmsCode(phone, smsCode);
    if (!smsVerification.valid) {
      return NextResponse.json(
        { error: smsVerification.error || "验证码错误" },
        { status: 400 },
      );
    }

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        phone: phone,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "该手机号未注册" },
        { status: 404 },
      );
    }

    // 如果用户状态是 inactive，激活用户
    if (user.status === "inactive") {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "active" },
      });
      user.status = "active";
    }

    // D-02：账号注销冷静期——允许重新登录以便撤销注销（与密码登录行为一致）
    if (user.status === "deleting") {
      // 冷静期已过则执行最终注销，不再允许撤销
      const deletionFinalized = await maybeFinalizeDeletionIfDue(user.id);
      if (deletionFinalized) {
        return NextResponse.json(
          { error: "账号注销冷静期已过，账号已被永久注销", status: "deleted" },
          { status: 403 },
        );
      }

      const now = new Date();
      // 刷新活跃时间，避免撤销流程中的 /api/auth/me 被空闲超时拦截
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, lastActivityAt: now },
      });

      // 消耗验证码，防止重复使用
      deleteSmsCode(phone);

      const deletionEnd = user.deletionRequestedAt
        ? new Date(user.deletionRequestedAt).getTime()
        : Date.now();
      const remainingDays = Math.max(
        0,
        Math.ceil((deletionEnd - Date.now()) / (1000 * 60 * 60 * 24)),
      );

      // 生成临时 token，仅允许撤销注销（不授予业务会话）
      const token = await new SignJWT({
        userId: user.id,
        email: user.email,
        role: user.role,
        deletionStatus: "cancelling",
        issuedAt: now.toISOString(),
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(getJwtSecretKey());

      const response = NextResponse.json({
        success: true,
        message: `账号正在注销中，${remainingDays}天后正式生效，可撤销注销`,
        status: user.status,
        deletionDaysRemaining: remainingDays,
        canCancelDeletion: true,
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
        maxAge: 60 * 60,
        path: "/",
      });
      response.cookies.set("userId", user.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60,
        path: "/",
      });

      return response;
    }

    // 检查用户状态
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "账号已被禁用", status: "disabled" },
        { status: 403 },
      );
    }

    // 检查用户是否被锁定
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      return NextResponse.json(
        {
          error: `账号已被锁定，请${minutes}分钟后再试`,
          status: "locked",
          minutesRemaining: minutes,
        },
        { status: 423 },
      );
    }

    // 生成 session 与 刷新令牌
    const now = new Date();
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = rememberMe
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30天
      : new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2小时

    const refreshToken = crypto.randomUUID();
    const refreshTokenExpiresAt = rememberMe
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 解析登录设备信息（供挤线冲突判定，严禁写入会话令牌）
    const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    let deviceType: "web" | "mobile" | "tablet" = "web";
    let browser = "unknown";
    let os = "unknown";
    if (userAgent.includes("Mobile")) deviceType = "mobile";
    else if (userAgent.includes("Tablet")) deviceType = "tablet";
    if (userAgent.includes("Chrome")) browser = "Chrome";
    else if (userAgent.includes("Safari")) browser = "Safari";
    else if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Edge")) browser = "Edge";
    if (userAgent.includes("Windows")) os = "Windows";
    else if (userAgent.includes("Mac")) os = "Mac";
    else if (userAgent.includes("Linux")) os = "Linux";
    else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
    else if (userAgent.includes("Android")) os = "Android";
    const deviceName = `${browser} on ${os}`;

    // 检查是否存在活跃的旧会话（挤线检测前提）
    const hasExistingSession = Boolean(
      user.lastLoginAt &&
      user.sessionToken &&
      user.sessionExpiresAt &&
      new Date(user.sessionExpiresAt) > now
    );

    // 真实跨端/跨网冲突判定（基于当前活跃设备 isCurrent=true，杜绝“设备列表同型号”误判）：
    // 同一活跃设备（类型/浏览器/设备名一致，且 IP 同为本地或完全一致）重复登录不算冲突；
    // 无法确认旧会话所属设备时，一律不写冲突日志，杜绝误导性的“异地登录”。
    const isLocalIp = (ip?: string | null) => {
      if (!ip) return true;
      const s = String(ip).trim().replace(/^::ffff:/, "");
      if (!s || s === "127.0.0.1" || s === "::1" || s === "localhost" || s.startsWith("127.")) return true;
      if (s.startsWith("192.168.") || s.startsWith("10.")) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
      return false;
    };
    const sameDeviceIdentity = (d: { deviceName?: string | null; deviceType?: string | null; browser?: string | null }) =>
      d.deviceType === deviceType && d.browser === browser && d.deviceName === deviceName;
    const sameNetwork = (d: { ipAddress?: string | null }) =>
      isLocalIp(d.ipAddress) || isLocalIp(clientIP) || d.ipAddress === clientIP;

    // 设备策略与全量设备（必须在后续重置 isCurrent 之前读取）
    const devicePolicy = await prisma.user.findUnique({
      where: { id: user.id },
      select: { deviceLimit: true, allowMultiDevice: true },
    });
    const maxDevices = devicePolicy?.allowMultiDevice ? devicePolicy?.deviceLimit || 3 : 1;
    const allDevices = await prisma.userdevice.findMany({
      where: { userId: user.id },
      orderBy: { lastAccessTime: "asc" },
    });
    const activeDevice = allDevices.find((d) => d.isCurrent) || null;
    // 是否会发生设备上限替换：排除同一设备后仍达到上限（与密码登录口径一致）
    const otherDevices = allDevices.filter((d) => !sameDeviceIdentity(d));
    const deviceLimitWillKick = otherDevices.length >= maxDevices;

    let isRealConflict = false;
    let conflictReason = "";
    // 若本次登录会触发设备上限替换，则交由 DEVICE_KICKED_OFFLINE 单独记录，避免同一替换落两条日志
    if (hasExistingSession && activeDevice && !deviceLimitWillKick) {
      if (!sameDeviceIdentity(activeDevice)) {
        isRealConflict = true;
        conflictReason = "在另一台设备";
      } else if (!sameNetwork(activeDevice)) {
        isRealConflict = true;
        conflictReason = "网络环境已变化";
      }
    }
    // 无活跃设备记录 / 设备上限将替换 → 不写 SESSION_CONFLICT_LOGOUT

    // 会话冲突审计（仅真实冲突，严禁写入会话令牌）
    if (isRealConflict) {
      await prisma.operationlog.create({
        data: {
          id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
          userId: user.id,
          action: "SESSION_CONFLICT_LOGOUT",
          resource: "auth/session",
          ipAddress: clientIP,
          details: {
            message: `检测到账号${conflictReason}登录，原会话已被新登录顶替下线`,
            reason: conflictReason,
            deviceName,
            deviceType,
            browser,
            os,
            ipAddress: clientIP,
          },
        },
      });
      console.log(`[挤线检测] 短信登录：用户 ${user.id} 因${conflictReason}触发旧会话挤下线`);
    }

    // 登录成功审计（统一 action=auth:login，按登录来源区分 loginMethod，严禁写入会话令牌）
    await prisma.operationlog.create({
      data: {
        id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
        userId: user.id,
        action: "auth:login",
        resource: "auth/session",
        ipAddress: clientIP,
        details: {
          message: "短信验证码登录成功",
          loginMethod: "sms",
          ipAddress: clientIP,
          deviceName,
          deviceType,
          browser,
          os,
        },
      },
    }).catch((e) => console.warn("[登录审计] 短信登录写入 auth:login 失败（非致命）:", e));

    // 记录登录历史（与密码登录同一数据源，供后台“登录安全历史”统一展示）
    await prisma.loginhistory.create({
      data: {
        id: "lh_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        loginAt: now,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || "unknown",
        device: deviceName,
      },
    }).catch((e) => console.warn("[登录历史] 短信登录写入失败（非致命）:", e));

    // 设备登录处理（与密码登录一致：同一设备替换旧记录，新设备写入并置为当前）
    try {
      // 复位该用户其他设备的 isCurrent
      await prisma.userdevice.updateMany({
        where: { userId: user.id, isCurrent: true },
        data: { isCurrent: false },
      });

      // 查询现有设备（按最近访问时间升序）
      const existingDevices = await prisma.userdevice.findMany({
        where: { userId: user.id },
        orderBy: { lastAccessTime: "asc" },
      });

      // 同一设备重复/重新登录：直接移除旧记录，绝不误报“设备被踢下线”
      const sameDeviceIndex = existingDevices.findIndex(
        (d) => d.browser === browser && d.deviceType === deviceType && d.deviceName === deviceName
      );
      if (sameDeviceIndex !== -1) {
        const matched = existingDevices.splice(sameDeviceIndex, 1)[0];
        await prisma.userdevice.delete({ where: { id: matched.id } });
      }

      // 达到设备上限时替换最旧设备（仅记录 DEVICE_KICKED_OFFLINE，不与冲突日志重复）
      while (existingDevices.length >= maxDevices) {
        const oldestDevice = existingDevices.shift();
        if (!oldestDevice) break;
        await prisma.userdevice.delete({ where: { id: oldestDevice.id } });
        await prisma.operationlog.create({
          data: {
            id: "op_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
            userId: user.id,
            action: "DEVICE_KICKED_OFFLINE",
            resource: "auth/device",
            ipAddress: clientIP,
            details: {
              type: "DEVICE_LIMIT_REPLACED",
              message: `设备达到登录上限，旧设备(${oldestDevice.deviceName || "旧设备"})已自动退出登录`,
              deviceId: oldestDevice.id,
            },
          },
        });
      }

      // 写入新设备记录并置为当前设备
      await prisma.userdevice.create({
        data: {
          id: "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          deviceName,
          deviceType,
          browser,
          os,
          ipAddress: clientIP || "127.0.0.1",
          isCurrent: true,
        },
      });
    } catch (deviceError) {
      console.error("[设备登录] 短信登录设备处理失败:", deviceError);
    }

    // 内存踢除并注册新 session
    for (const [key, value] of sessionCache.entries()) {
      if (value.userId === user.id) {
        sessionCache.delete(key);
      }
    }
    sessionCache.set(sessionToken, {
      userId: user.id,
      expiresAt: sessionExpiresAt,
    });

    // 删除验证码
    deleteSmsCode(phone);

    // 更新用户信息
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now,
        loginAttempts: 0,
        lockedUntil: null,
        lastForcedLogoutAt: isRealConflict ? now : null,
        sessionToken,
        sessionExpiresAt,
        sessionRememberMe: rememberMe === true, // 「7天内免登录」显式标记：validateUser 据此豁免空闲超时
        refreshToken,
        refreshTokenExpiresAt,
      },
    });

    // 生成 JWT Token，写入 sessionToken 和 issuedAt 签发时刻以对齐网关
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionToken,
      issuedAt: now.toISOString(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(rememberMe ? '7d' : '24h')
      .sign(getJwtSecretKey());

    // 准备用户数据
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      sessionToken,
    };

    const response = NextResponse.json({
      success: true,
      message: "登录成功",
      user: userData,
    });

    // 设置 Cookie
    // auth_token
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
      path: '/',
    });

    // session_token
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
      path: '/',
    });

    // refresh_token
    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error("SMS login error:", error);
    return NextResponse.json(
      { error: "登录失败" },
      { status: 500 }
    );
  }
}
