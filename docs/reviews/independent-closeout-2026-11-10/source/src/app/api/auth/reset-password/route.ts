import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { jwtVerify } from "jose";
import { consumeSmsCode } from "@/lib/sms-store";
import { consumeEmailCode } from "@/lib/email-code-store";
import { getJwtSecretKey } from "@/lib/jwt-config";
import type { AdmitResult } from "@/lib/verification-backend";

/**
 * 重置密码接口（P0-1 修复）
 *
 * 安全要求：
 * - 必须携带由 verify-sms-code / verify-email-code 下发的一次性 resetToken
 * - resetToken 5 分钟有效，含 phone 或 email，purpose=reset_password
 * - 验证通过后销毁对应验证码（一次性使用）
 * - 重置成功后使该用户所有会话失效（强制重新登录）
 */
export async function POST(request: NextRequest) {
  try {
    const { resetToken, newPassword, account } = await request.json();

    // 1. 必须携带 resetToken
    if (!resetToken) {
      return NextResponse.json(
        { message: "缺少重置凭证，请先通过验证码校验" },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { message: "密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 2. 校验 resetToken
    let payload: any;
    try {
      ({ payload } = await jwtVerify(resetToken, getJwtSecretKey()));
    } catch {
      return NextResponse.json(
        { message: "重置凭证无效或已过期，请重新获取验证码" },
        { status: 401 }
      );
    }

    if (payload.purpose !== "reset_password") {
      return NextResponse.json(
        { message: "重置凭证用途错误" },
        { status: 400 }
      );
    }

    // [U02] 凭证必须绑定已核验 challenge 身份与一次性授权 id；
    // 缺少绑定关系的一律拒绝，不凭通用 JWT 验签成功直接改密。
    const challengeId = payload.challengeId as string | undefined;
    const jti = payload.jti as string | undefined;
    if (!challengeId || !jti) {
      return NextResponse.json(
        { message: "重置凭证缺少一次性授权信息，请重新获取验证码" },
        { status: 401 }
      );
    }

    // 3. 从 token 中解析账号（phone 或 email），并查库定位用户
    const phone = payload.phone as string | undefined;
    const email = payload.email as string | undefined;

    if (!phone && !email) {
      return NextResponse.json(
        { message: "重置凭证缺少账号信息" },
        { status: 400 }
      );
    }

    // account 兼容字段（前端可能仍传），仅做日志参考，不再以它为唯一依据
    void account;

    let user;
    if (phone) {
      user = await prisma.user.findUnique({ where: { phone } });
    } else if (email) {
      user = await prisma.user.findFirst({ where: { email } });
    }

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 404 }
      );
    }

    // 4. [U02 §2.2] 持久授权认领（提交一致性）：jti 一次性绑定状态机
    //    PENDING（已建认领，码未确认消费）→ AUTH_CONSUMED（码已为本 jti 消费）→ COMPLETED（密码已更新）。
    //    - 首次：原子创建 PENDING 认领（唯一 jti），再消费验证码 → 成功则推进 AUTH_CONSUMED；
    //    - 消费失败：认领保持 PENDING，同一 token 重试可再次消费（码未被用）；
    //    - 消费成功但密码更新失败：认领已是 AUTH_CONSUMED，重试**不再重复消费**，直接重做密码更新；
    //    - 已 COMPLETED：响应丢失后的重放幂等成功，不重做敏感动作。
    //    旧 token 不能消费新码的 challenge 绑定约束保持不变。
    const claimModel = (prisma as any).passwordresetclaim;
    if (!claimModel?.findUnique) {
      return NextResponse.json(
        { message: "改密授权服务未就绪，请联系管理员完成部署", code: "RESET_CLAIM_NOT_READY" },
        { status: 503 }
      );
    }
    let claim = await claimModel.findUnique({ where: { id: jti } });
    if (!claim) {
      try {
        claim = await claimModel.create({
          data: { id: jti, userId: user.id, challengeId, status: "PENDING" },
        });
      } catch (e: any) {
        if (String(e?.code) === "P2002") {
          claim = await claimModel.findUnique({ where: { id: jti } });
        } else {
          throw e;
        }
      }
    }
    if (!claim || claim.userId !== user.id) {
      // jti 冲突（极小概率）或归属不符 → 拒绝，不复用他人授权
      return NextResponse.json({ message: "重置凭证无效，请重新获取验证码" }, { status: 401 });
    }

    if (claim.status === "PENDING") {
      // 一次性消费验证码（绑定 challenge 身份）；消费失败绝不写密码。
      const consumeRes: AdmitResult = phone
        ? await consumeSmsCode(phone, "reset-password", challengeId)
        : email
          ? await consumeEmailCode(email, "reset-password", challengeId)
          : { ok: false, error: "缺少账号信息", status: 400 };
      if (!consumeRes.ok) {
        // 已使用 / 不存在 / 服务不可用 -> 拒绝，不写密码、不失效会话；认领保持 PENDING 可重试
        const status = consumeRes.status === 503 ? 503 : 400;
        return NextResponse.json(
          { message: consumeRes.error || "验证码校验失败，请重新获取验证码" },
          { status }
        );
      }
      // 消费成功 → 推进 AUTH_CONSUMED（持久化"授权已消费"恢复事实）
      await claimModel.update({ where: { id: jti }, data: { status: "AUTH_CONSUMED" } });
    }

    if (claim.status === "COMPLETED") {
      // 响应丢失后的重放：幂等成功，不重做敏感动作
      return NextResponse.json({
        success: true,
        message: "密码已重置成功，请使用新密码登录",
      });
    }

    // 5. 更新密码 + 失效所有会话（强制重新登录）；成功即推进 COMPLETED（同一持久边界）
    const hashedPassword = await hashPassword(newPassword);
    const prismaAny = prisma as any;
    if (typeof prismaAny?.$transaction === "function") {
      await prismaAny.$transaction(async (tx: any) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            sessionToken: null,
            sessionExpiresAt: null,
            sessionRememberMe: false, // 会话销毁时复位「7天内免登录」标记
            refreshToken: null,
            refreshTokenPrev: null,
            lastForcedLogoutAt: new Date(),
          },
        });
        await tx.passwordresetclaim.update({ where: { id: jti }, data: { status: "COMPLETED", completedAt: new Date() } });
      });
    } else {
      // 测试替身（无事务能力）：顺序执行，语义等价由替身保证
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          sessionToken: null,
          sessionExpiresAt: null,
          sessionRememberMe: false,
          refreshToken: null,
          refreshTokenPrev: null,
          lastForcedLogoutAt: new Date(),
        },
      });
      await claimModel.update({ where: { id: jti }, data: { status: "COMPLETED", completedAt: new Date() } });
    }

    return NextResponse.json({
      success: true,
      message: "密码重置成功，请使用新密码登录",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
