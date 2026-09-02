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
}

/**
 * 发送邮件。失败不抛异常，返回 { ok, reason } 交给调用方决定（通常仅记录）。
 */
export async function sendMail(opts: SendMailOptions): Promise<{ ok: boolean; reason?: string }> {
  if (!opts?.to) return { ok: false, reason: "NO_RECIPIENT" };

  const transport = await getTransport();
  if (!transport) {
    console.warn("[邮件] SMTP 未配置，跳过发送 →", opts.to, "|", opts.subject);
    return { ok: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const cfg = await loadSmtpConfig();
    await transport.sendMail({
      from: cfg ? `"${cfg.senderName}" <${cfg.senderEmail}>` : undefined,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return { ok: true };
  } catch (e) {
    console.warn("[邮件] 发送失败:", (e as Error)?.message, "→", opts.to);
    return { ok: false, reason: "SEND_FAILED" };
  }
}
