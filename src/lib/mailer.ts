/**
 * 系统邮件通道（P4）
 *
 * 设计要点：
 * 1. SMTP 配置从 system_config 表读取（管理员在 /admin/settings 配置），不硬编码。
 * 2. 配置缺失或发送失败时一律降级为"仅记录告警"，绝不阻断调用方的主流程
 *    （例如资料移除已经完成，不能因为邮件发不出去而回滚）。
 * 3. transporter 进程内缓存，避免每封邮件都重新建连。
 */

import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  senderEmail: string;
  senderName: string;
}

const SMTP_KEYS = ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "senderEmail", "senderName"];

async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: SMTP_KEYS } },
      select: { key: true, value: true },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = (r.value || "").trim();
    });
    if (!map.smtpHost) return null;
    const port = Number(map.smtpPort || 587);
    return {
      host: map.smtpHost,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      user: map.smtpUser || undefined,
      pass: map.smtpPass || undefined,
      senderEmail: map.senderEmail || "noreply@zhige.com",
      senderName: map.senderName || "知阁舟坊",
    };
  } catch (e) {
    console.warn("[邮件] 读取 SMTP 配置失败:", (e as Error)?.message);
    return null;
  }
}

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
let transportResolved = false;

/** 测试专用：重置传输器缓存，避免跨用例污染（生产代码不调用） */
export function __resetMailerTransportForTest() {
  cachedTransport = null;
  transportResolved = false;
}

async function getTransport() {
  if (transportResolved) return cachedTransport;
  transportResolved = true;
  try {
    const cfg = await loadSmtpConfig();
    if (!cfg) return null;
    cachedTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    return cachedTransport;
  } catch (e) {
    console.warn("[邮件] 初始化 SMTP 传输器失败:", (e as Error)?.message);
    return null;
  }
}

/** SMTP 是否已配置可用（供 UI 提示"邮件通道未配置"） */
export async function isMailConfigured(): Promise<boolean> {
  return (await loadSmtpConfig()) !== null;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  /** 可选的 HTML 正文（大厂风格验证码邮件使用）；不传则仅发送纯文本 */
  html?: string;
}

/** 邮件发送结果三态：已确认接受 / 确定失败（明确拒绝或确定未发送）/ 未知（网络中断等） */
export type MailOutcome = "accepted" | "failed" | "unknown";

export interface SendMailResult {
  ok: boolean;
  outcome: MailOutcome;
  reason?: string;
}

/** 根据 SMTP 响应码判定是否为“确定失败”（明确拒绝/认证/策略类），其余（含网络层）归为未知 */
function classifySmtpOutcome(responseCode: unknown, message: string): MailOutcome {
  const code = Number(responseCode);
  const permanent = [
    401, 403, 450, 451, 455, 501, 502, 503, 504, 530, 535, 538, 550, 551, 552, 553, 554,
  ];
  if (permanent.includes(code)) return "failed";
  // 无响应码（连接超时/重置/ DNS/网络层）一律视为未知，不盲目重发
  if (responseCode == null) return "unknown";
  // 其余 4xx 临时错误按未知处理（可重试，但不得擅自当作确定失败退预算）
  void message;
  return "unknown";
}

/**
 * 发送邮件。结果分为三态：accepted / failed / unknown。
 * - accepted：传输层已确认接收，可视为已发送。
 * - failed：明确拒绝或确定未发送（认证/收件人/策略类），调用方可退还占用。
 * - unknown：连接中断/超时等不确定结果，保留占用、不盲目退预算后重发，由可诊断原因后续处理。
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  if (!opts?.to) return { ok: false, outcome: "failed", reason: "NO_RECIPIENT" };

  const transport = await getTransport();
  if (!transport) {
    // [U03] SMTP 未配置 = 确定未发起（区别于已发起结果未知）；调用方可安全退还占用
    console.warn("[邮件] SMTP 未配置，跳过发送 →", opts.to, "|", opts.subject);
    return { ok: false, outcome: "failed", reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const cfg = await loadSmtpConfig();
    const info: any = await transport.sendMail({
      from: cfg ? `"${cfg.senderName}" <${cfg.senderEmail}>` : undefined,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    // [U03] 核实目标接收事实：按当前传输契约提取规范化地址并**精确比较**——
    // 子串误判（malice@example.com 命中 alice@example.com）已删除。
    const normalize = (a: unknown): string => {
      const s = String(a ?? "").trim();
      const angled = /<([^>]+)>/.exec(s);
      return (angled ? angled[1] : s).trim().toLowerCase();
    };
    const target = normalize(opts.to);
    const accepted: string[] = Array.isArray(info?.accepted) ? info.accepted.map(normalize) : [];
    const rejected: string[] = Array.isArray(info?.rejected) ? info.rejected.map(normalize) : [];
    if (!Array.isArray(info?.accepted) && !Array.isArray(info?.rejected)) {
      // 传输未返回任何确认事实（如空对象）→ 无法确认目标被接受 → 未知，不宣称已发送
      return { ok: false, outcome: "unknown", reason: "NO_CONFIRMATION_FACT" };
    }
    if (target && rejected.includes(target)) {
      // 目标明确拒收 = 确定失败
      return { ok: false, outcome: "failed", reason: "RECIPIENT_REJECTED" };
    }
    if (!target || !accepted.includes(target)) {
      // 传输返回了结果但本收件人未被确认接收（空 accepted 或未被列出）→ 不得宣称已发送
      return { ok: false, outcome: "unknown", reason: "NO_ACCEPTED_CONFIRMATION" };
    }
    return { ok: true, outcome: "accepted" };
  } catch (e) {
    const outcome = classifySmtpOutcome((e as any)?.responseCode ?? (e as any)?.code, (e as Error)?.message);
    console.warn("[邮件] 发送结果未知/失败:", (e as Error)?.message, "→", opts.to, "| outcome=", outcome);
    return { ok: false, outcome, reason: "SEND_FAILED" };
  }
}

/**
 * 生成大厂风格验证码邮件 HTML 正文（品牌色容器 + 醒目验证码 + 安全提示）。
 * @param title 业务标题（如「注册验证码」「重置密码验证码」）
 * @param code 6 位验证码
 * @param scene 场景说明（如「注册知阁·舟坊账号」）
 */
export function buildVerificationEmailHtml(title: string, code: string, scene: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;background:#f4f6fb;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(43,108,176,0.12);">
        <div style="background:linear-gradient(135deg,#3182ce,#1a365d);padding:22px 28px;">
          <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:1px;">知阁 · 舟坊</div>
          <div style="color:#bfdbfe;font-size:12px;margin-top:4px;">全链路软件研发效能操作系统</div>
        </div>
        <div style="padding:28px;">
          <h2 style="margin:0 0 12px;font-size:16px;color:#1a202c;">${title}</h2>
          <p style="margin:0 0 18px;font-size:14px;color:#4a5568;line-height:1.6;">您正在${scene}。为保障账号安全，请使用以下验证码完成验证，验证码有效期为 <strong>5 分钟</strong>。</p>
          <div style="background:#f0f8ff;border:1px solid #bee3f8;border-radius:12px;padding:20px;text-align:center;">
            <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#2b6cb0;font-family:'Courier New',monospace;">${code}</div>
          </div>
          <p style="margin:18px 0 0;font-size:12px;color:#a0aec0;line-height:1.6;">· 请勿将验证码透露给他人或发送给任何人，包括知阁官方工作人员。<br/>· 若非本人操作，请忽略本邮件并确保账号安全。</p>
        </div>
        <div style="padding:14px 28px;background:#f7fafc;border-top:1px solid #edf2f7;">
          <p style="margin:0;font-size:11px;color:#cbd5e0;">本邮件由系统自动发送，请勿直接回复。</p>
        </div>
      </td></tr>
    </table>
  </body>
</html>`;
}
