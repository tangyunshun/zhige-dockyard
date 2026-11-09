﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { ADMIN_ROLE_VALUES } from "@/lib/role-utils";

/**
 * POST /api/demo-request
 * 处理演示请求：先落库，再发邮件通知（邮件发送失败不影响已保存的数据）。
 */
// KN-SEC：简易 IP 速率限制（自查清单安全红线：公开写接口防刷）
const _demoRateMap = new Map<string, { count: number; resetAt: number }>();
const DEMO_RATE_LIMIT = 5;
const DEMO_RATE_WINDOW = 60 * 60 * 1000; // 1 小时

function checkDemoRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _demoRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _demoRateMap.set(ip, { count: 1, resetAt: now + DEMO_RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= DEMO_RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  try {
    // KN-SEC：IP 速率限制（每 IP 每小时最多 5 次，防垃圾注册/邮件轰炸）
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkDemoRateLimit(ip)) {
      return NextResponse.json({ error: "提交过于频繁，请 1 小时后再试" }, { status: 429 });
    }
    const body = await request.json();
    const { name, email, company, phone, requirements } = body;

    // KN-SEC：trim 后非空校验（自查清单指令一：空白字符串不得通过）
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    const trimmedCompany = typeof company === "string" ? company.trim() : "";
    const trimmedRequirements = typeof requirements === "string" ? requirements.trim() : "";

    // 验证必填字段（trim 后）
    if (!trimmedName || !trimmedEmail || !trimmedCompany) {
      return NextResponse.json(
        {
          success: false,
          error: "请填写所有必填字段",
        },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "请输入有效的邮箱地址",
        },
        { status: 400 }
      );
    }

    // KN-SEC：长度上限校验（自查清单指令一/三）
    if (trimmedName.length > 50 || trimmedEmail.length > 100 || trimmedCompany.length > 100 || trimmedRequirements.length > 5000) {
      return NextResponse.json({ error: "字段内容超出长度限制" }, { status: 400 });
    }

    // 落库
    const created = await prisma.demorequest.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        company: trimmedCompany,
        phone: phone ? String(phone).trim() : null,
        requirements: trimmedRequirements || null,
      },
    });

    // 收件人：优先读系统配置 demoRequestNotifyEmail，其次 senderEmail，兜底固定地址
    let to = "sales@zhige.com";
    try {
      const rows = await prisma.systemconfig.findMany({
        where: { key: { in: ["demoRequestNotifyEmail", "senderEmail"] } },
        select: { key: true, value: true },
      });
      const cfg: Record<string, string> = {};
      rows.forEach((r) => {
        cfg[r.key] = (r.value || "").trim();
      });
      if (cfg.demoRequestNotifyEmail) to = cfg.demoRequestNotifyEmail;
      else if (cfg.senderEmail) to = cfg.senderEmail;
    } catch {
      // 配置读取失败则用兜底地址
    }

    // 构造通知邮件正文
    const text = [
      "【知阁舟坊】收到新的演示申请",
      "",
      `申请人：${created.name}`,
      `邮箱：${created.email}`,
      `公司：${created.company}`,
      `电话：${created.phone ?? "（未填写）"}`,
      `需求：${created.requirements ?? "（未填写）"}`,
      `提交时间：${created.createdAt.toLocaleString("zh-CN")}`,
      `记录ID：${created.id}`,
    ].join("\n");

    // 发邮件（失败不阻断主流程：数据已落库）
    const mailResult = await sendMail({
      to,
      subject: `新的演示申请 · ${created.company}（${created.name}）`,
      text,
    });
    if (!mailResult.ok) {
      console.warn("[演示申请] 邮件通知未送达:", mailResult.reason, "→", to);
    }

    // 站内系统通知：给所有平台管理员推一条未读消息，即使 SMTP 未配也能在后台看到红点提醒
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: [...ADMIN_ROLE_VALUES] }, status: "active" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            id: crypto.randomUUID(),
            userId: a.id,
            title: "📥 新的演示申请",
            content: `「${created.name}」来自「${created.company}」提交了演示申请，邮箱 ${created.email}${
              created.phone ? `，电话 ${created.phone}` : ""
            }。请前往后台「演示申请」尽快跟进。`,
            type: "system",
            link: "/admin/demo-requests",
            isRead: false,
          })),
        });
      }
    } catch (ntfErr) {
      console.warn("[演示申请] 站内通知推送失败（非致命）:", ntfErr);
    }

    // 返回成功响应
    return NextResponse.json({
      success: true,
      message: "演示请求已提交",
      data: {
        id: created.id,
        status: created.status,
        submittedAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("处理演示请求时发生错误:", error);
    return NextResponse.json(
      {
        success: false,
        error: "服务器内部错误，请稍后重试",
      },
      { status: 500 }
    );
  }
}
