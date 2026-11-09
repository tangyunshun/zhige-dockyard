import { NextRequest, NextResponse } from "next/server";
import { generateEmailCode, storeEmailCode } from "@/lib/email-code-store";
import { sendMail, buildVerificationEmailHtml } from "@/lib/mailer";
import { getVerificationBackend } from "@/lib/verification-backend";
import type { VerifyPurpose } from "@/lib/verification-backend";

/**
 * 发送邮箱验证码（注册 / 找回密码等场景复用）。
 *
 * F15 / L01 + L02：
 * - 发送前先经共享后端裁决预算（admitSend）；未就绪（真实委托不可用）直接 503，绝不发生发送。
 * - 验证码只以哈希存储，明文仅进入邮件正文（合法投递），绝不出现在日志/响应/调试码。
 * - 不再返回任何 debugCode；SMTP 未配置或发送失败返回真实原因的稳定码（503/502）。
 */
export async function POST(request: NextRequest) {
  try {
    const { email, type } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: "请输入正确的邮箱地址" },
        { status: 400 },
      );
    }

    // [U02 §2.1.5] 可信来源身份：IP 仅取自反向代理追加的转发头（取最后一跳，
    // 为我们信任的代理所追加），绝不信任 body/客户端可任意伪造的字段；
    // 已认证 actor（如有会话）从服务端会话解析，不信任请求体。
    const trustedIp = extractTrustedClientIp(request);
    let actorId: string | null = null;
    try {
      const { validateUser } = await import("@/lib/auth");
      const session = await validateUser(request.headers.get("authorization"), request);
      if (session.valid && session.user) actorId = session.user.id;
    } catch { /* 匿名场景按原流程 */ }

    const purpose: VerifyPurpose = type === "register" ? "register" : "reset-password";

    // 1) 共享预算裁决 + 签发（预算/委托未就绪 -> 503，不发生任何发送）
    const code = generateEmailCode();
    const store = await storeEmailCode(email, code, purpose, { ip: trustedIp, actorId });
    if (!store.ok) {
      return NextResponse.json(
        { message: store.error || "发送失败" },
        { status: store.status ?? 429 },
      );
    }

    // 2) 真实发送（明文仅进入邮件正文，不外泄）
    const isRegister = purpose === "register";
    const title = isRegister ? "注册验证码" : "重置密码验证码";
    const scene = isRegister ? "注册知阁·舟坊账号" : "重置您的账号密码";
    const subject = `【知阁·舟坊】${title}`;
    const text = `您正在${scene}，验证码为 ${code}，5 分钟内有效，请勿泄露给他人。`;
    const html = buildVerificationEmailHtml(title, code, scene);

    const sendResult = await sendMail({ to: email, subject, text, html });

    if (!sendResult.ok) {
      // 仅“确定失败”按预约身份幂等退还本次预算（重复回填零效果）；unknown 保留占用
      await getVerificationBackend().onSendResult(
        { channel: "email", target: email, purpose },
        sendResult.outcome === "failed" ? "failed" : "unknown",
        store.sendId,
      );
      if (sendResult.reason === "SMTP_NOT_CONFIGURED") {
        return NextResponse.json(
          {
            message: "邮件服务尚未配置，请联系平台管理员开启 SMTP 后重试",
            code: "CHANNEL_NOT_READY",
          },
          { status: 503 },
        );
      }
      if (sendResult.outcome === "failed") {
        return NextResponse.json(
          { message: "验证码邮件发送失败，请稍后重试", code: "SEND_FAILED" },
          { status: 502 },
        );
      }
      // unknown：保留占用与可诊断原因，不立即重发
      return NextResponse.json(
        { message: "邮件发送结果未知，请稍后重试或检查收件箱", code: "SEND_UNKNOWN" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "验证码已发送，请查收邮件（若收件箱无邮件，请检查垃圾邮件）",
    });
  } catch (error) {
    console.error("Send email code error:", error);
    return NextResponse.json({ message: "发送失败" }, { status: 500 });
  }
}

/**
 * [U02 §2.1.5] 从可信代理头提取客户端 IP：只认 x-forwarded-for 的最后一跳
 * （由我们信任的反向代理追加），其次 x-real-ip；都不存在视为匿名。
 * 绝不信任 body/客户端可任意伪造的字段。
 */
function extractTrustedClientIp(request: NextRequest): string | undefined {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip")?.trim() || undefined;
}
