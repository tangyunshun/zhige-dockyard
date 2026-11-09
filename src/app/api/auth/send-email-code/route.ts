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

    const purpose: VerifyPurpose = type === "register" ? "register" : "reset-password";

    // 1) 共享预算裁决 + 签发（预算/委托未就绪 -> 503，不发生任何发送）
    const code = generateEmailCode();
    const store = await storeEmailCode(email, code, purpose);
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
      // 仅“确定失败”退还本次预算；unknown（连接中断/超时）保留占用，不盲目退预算后重发
      await getVerificationBackend().onSendResult(
        { channel: "email", target: email, purpose },
        sendResult.outcome === "failed" ? "failed" : "unknown",
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
