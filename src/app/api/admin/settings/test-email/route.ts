import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemSettingsAdmin } from "@/lib/security";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/settings/test-email
 * 发送 SMTP 连通性测试邮件（仅平台超级管理员）
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const result = await requireSystemSettingsAdmin(request);
    if (!result.authorized) {
      const status = result.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "越权警告：仅允许平台超级管理员操作" },
        { status }
      );
    }
    const operator = result.user!;

    const body = await request.json().catch(() => ({}));
    const toEmail = (body.toEmail || "").trim();

    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return NextResponse.json({ error: "请输入有效的测试收件邮箱地址" }, { status: 400 });
    }

    // 从数据库获取最新配置，优先使用当前前端传递的临时参数（方便管理员在未保存时先行测试）
    const rows = await prisma.systemconfig.findMany({
      where: {
        key: {
          in: ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "senderEmail", "senderName"],
        },
      },
    });

    const configMap: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.value) configMap[r.key] = r.value.trim();
    });

    const smtpHost = (body.smtpHost || configMap.smtpHost || "").trim();
    const smtpPort = Number(body.smtpPort || configMap.smtpPort || 587);
    const smtpUser = (body.smtpUser || configMap.smtpUser || "").trim();
    const smtpPass = (body.smtpPass || configMap.smtpPass || "").trim();
    const senderEmail = (body.senderEmail || configMap.senderEmail || "noreply@zhige.com").trim();
    const senderName = (body.senderName || configMap.senderName || "知阁舟坊运维中枢").trim();

    if (!smtpHost) {
      return NextResponse.json({ error: "SMTP 主机地址未配置，请先填写主机地址" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });

    // 验证 SMTP 连通性
    await transporter.verify();

    // 真实发送测试邮件
    const sendTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toEmail,
      subject: `【知阁·舟坊】SMTP 邮件服务连通性测试报告`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="display: flex; align-items: center; border-bottom: 2px solid #3182ce; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #2b6cb0; margin: 0; font-size: 18px;">知阁·舟坊 · SMTP 邮件服务配置验证</h2>
          </div>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">
            尊敬的系统管理员 <strong>${operator.name || "管理员"}</strong>：
          </p>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">
            收到此邮件，表明您在知阁平台<strong>【系统设置 - SMTP 邮件服务】</strong>中配置的主机参数与身份认证凭据已成功连通并验证生效！
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #475569;">
            <div style="margin-bottom: 6px;"><strong>• SMTP 主机：</strong> ${smtpHost} : ${smtpPort}</div>
            <div style="margin-bottom: 6px;"><strong>• 发信账号：</strong> ${smtpUser || "匿名发信"}</div>
            <div style="margin-bottom: 6px;"><strong>• 展示发信人：</strong> "${senderName}" &lt;${senderEmail}&gt;</div>
            <div><strong>• 发送时间：</strong> ${sendTime}</div>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 12px;">
            此邮件由知阁系统设置中枢即时自动化发出，无需回复。
          </p>
        </div>
      `,
    });

    const latencyMs = Date.now() - startedAt;

    // 记录审计日志
    try {
      await prisma.operationlog.create({
        data: {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: operator.id,
          action: "system:test_email",
          resource: "smtp_settings",
          details: JSON.stringify({
            toEmail,
            smtpHost,
            smtpPort,
            latencyMs,
            messageId: info.messageId,
          }),
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `测试邮件已成功发送至 ${toEmail}，服务响应正常！`,
      latencyMs,
      details: {
        to: toEmail,
        host: smtpHost,
        port: smtpPort,
        messageId: info.messageId,
      },
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startedAt;
    console.error("发送测试邮件异常:", error);
    let errMsg = "SMTP 连接测试失败";
    let errorType: "timeout" | "auth" | "dns" | "port" | "unknown" = "unknown";
    let troubleshooting: string[] = [];

    const errStr = `${error?.code || ""} ${error?.message || ""} ${error?.command || ""}`.toLowerCase();

    if (error?.code === "ESOCKET" || error?.code === "ETIMEDOUT" || errStr.includes("timeout") || errStr.includes("timed out")) {
      errorType = "timeout";
      errMsg = "连接 SMTP 主机超时，请检查主机域名与端口是否正确且网络通畅";
      troubleshooting = [
        "确认 SMTP 主机地址拼写无误（如 smtp.qq.com 或 smtp.exmail.qq.com），不要包含协议前缀（无需填写 smtp://）或空格。",
        "核对端口与加密协议：465 端口请确保开启 SSL/TLS；587 端口通常使用 STARTTLS；切勿使用 25 端口（主流云服务器默认全网封禁 25 端口出站）。",
        "检查运行此服务器的主机安全组防火墙：确保出站规则（Outbound）已开放对应 465 或 587 端口的 TCP 流量访问权限。",
        "若为主机自建私有邮件服务，请排查内外网路由策略及安全网关是否允许向外发信投递。"
      ];
    } else if (error?.code === "EAUTH" || error?.responseCode === 535 || errStr.includes("auth") || errStr.includes("credential")) {
      errorType = "auth";
      errMsg = "SMTP 身份认证失败，请检查账号和密码/授权码是否正确";
      troubleshooting = [
        "主流邮箱（QQ 邮箱、163 邮箱、企业微信邮箱、Gmail 等）必须使用【专用的 SMTP 独立授权码/客户端密码】，严禁使用网页登录密码。",
        "确认【发件人邮箱】与【发信账号】保持一致：多数邮件服务商（如腾讯、网易）强制要求两者必须完全一致，否则拒绝认证通过。",
        "登录发件邮箱的网页端设置，确认 POP3/SMTP 或 IMAP/SMTP 发信服务处于【开启】状态。",
        "若近期修改过邮箱主密码，此前生成的授权码会即刻作废失效，需重新生成新的授权码填入。"
      ];
    } else if (error?.code === "ENOTFOUND" || error?.code === "EAI_AGAIN" || errStr.includes("getaddrinfo")) {
      errorType = "dns";
      errMsg = "SMTP 主机域名解析失败，未找到该主机网络地址";
      troubleshooting = [
        "检查 SMTP 主机域名拼写是否正确，避免误输入多余空格或非法的顶级域名。",
        "检查当前服务器 DNS 配置（如 resolv.conf 或本地网络 DNS 解析），确保服务器具备公网域名解析能力。"
      ];
    } else if (error?.code === "ECONNREFUSED" || errStr.includes("connection refused")) {
      errorType = "port";
      errMsg = "SMTP 主机拒绝连接，目标端口未开放或不可达";
      troubleshooting = [
        "目标主机未在该端口监听 SMTP 服务，请核对端口（如 465 或 587）是否填写错误。",
        "确认对方邮件运营商是否对当前服务器 IP 实施了访问频率风控拦截或黑名单限制。"
      ];
    } else {
      errMsg = `发送失败: ${error?.message || "未知连接异常"}`;
      troubleshooting = [
        "核对 SMTP 主机、端口、发件人邮箱与授权密码是否完整且准确填写。",
        "QQ 邮箱标准配置：主机 smtp.qq.com，端口 465（开启 SSL），密码为 16 位邮箱独立授权码。",
        "163 邮箱标准配置：主机 smtp.163.com，端口 465（开启 SSL），密码为客户端授权密码。",
        "企业微信邮标准配置：主机 smtp.exmail.qq.com，端口 465（开启 SSL）。"
      ];
    }

    return NextResponse.json(
      {
        success: false,
        error: errMsg,
        errorType,
        troubleshooting,
        latencyMs,
        rawCode: error?.code || "UNKNOWN",
      },
      { status: 400 }
    );
  }
}
