import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import crypto from "crypto";

// 通用从 API 请求解析当前登录用户（兼容中间件 x-user-id、Authorization Header 及 auth_token Cookie）
async function getCurrentUser(req: NextRequest) {
  let userId = req.headers.get("x-user-id");
  
  if (!userId) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer ") {
      const authResult = await validateUser(authHeader);
      if (authResult.valid && authResult.user) {
        userId = authResult.user.id;
      }
    }
  }

  if (!userId) {
    const cookieToken = req.cookies.get("auth_token")?.value;
    if (cookieToken) {
      const authResult = await validateUser(`Bearer ${cookieToken}`);
      if (authResult.valid && authResult.user) {
        userId = authResult.user.id;
      }
    }
  }

  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  return user;
}

// 安全自愈初始化数据表函数
async function ensureWebhookTable() {
  try {
    // 优先尝试标准 MySQL 兼容 DDL 语法
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`webhooksubscription\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`url\` VARCHAR(500) NOT NULL,
        \`secret\` VARCHAR(191) NOT NULL,
        \`events\` TEXT NOT NULL,
        \`active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`successRate\` VARCHAR(50) NOT NULL DEFAULT '100%',
        \`lastTriggered\` DATETIME NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`Webhook_userId_idx\` (\`userId\`),
        INDEX \`Webhook_active_idx\` (\`active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (e1) {
    try {
      // 降级尝试 SQLite 兼容 DDL 语法
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "webhooksubscription" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "url" TEXT NOT NULL,
          "secret" TEXT NOT NULL,
          "events" TEXT NOT NULL,
          "active" BOOLEAN NOT NULL DEFAULT true,
          "successRate" TEXT NOT NULL DEFAULT '100%',
          "lastTriggered" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e2) {
      console.error("[Webhooks API] 自愈建表提示:", e2);
    }
  }
}

// GET: 拉取当前用户的 Webhooks 订阅真实列表
export async function GET(req: NextRequest) {
  try {
    await ensureWebhookTable();
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录或凭证失效" }, { status: 401 });
    }

    let rows: any[] = [];
    if ((prisma as any).webhooksubscription) {
      rows = await (prisma as any).webhooksubscription.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
    } else {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM webhooksubscription WHERE userId = ? ORDER BY createdAt DESC`,
        user.id
      );
    }

    const webhooks = (rows || []).map((r: any) => ({
      id: r.id,
      url: r.url,
      secret: r.secret,
      events: typeof r.events === "string" ? JSON.parse(r.events) : r.events,
      active: Boolean(r.active),
      successRate: r.successRate || "100%",
      lastTriggered: r.lastTriggered ? new Date(r.lastTriggered).toISOString().replace("T", " ").substring(0, 19) : "-",
    }));

    return NextResponse.json({ success: true, webhooks });
  } catch (error: any) {
    console.error("GET /api/webhooks 失败:", error);
    return NextResponse.json({ error: error.message || "获取 Webhook 列表失败" }, { status: 500 });
  }
}

// POST: 真正建立并持久化 Webhook 订阅
export async function POST(req: NextRequest) {
  try {
    await ensureWebhookTable();
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录或凭证失效" }, { status: 401 });
    }

    const body = await req.json();
    const { url, events } = body;

    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return NextResponse.json({ error: "必须填写以 http:// 或 https:// 开头的合法 URL" }, { status: 400 });
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "请至少选择一项要订阅的事件类别" }, { status: 400 });
    }

    // 防重校验：防止同一 URL 目标地址重复建立相同事件的回调订阅
    let existingList: any[] = [];
    if ((prisma as any).webhooksubscription) {
      existingList = await (prisma as any).webhooksubscription.findMany({
        where: { userId: user.id, url },
      });
    } else {
      existingList = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM webhooksubscription WHERE userId = ? AND url = ?`,
        user.id,
        url
      );
    }

    if (existingList && existingList.length > 0) {
      const existingEvents = new Set<string>();
      existingList.forEach((item) => {
        const itemEvts: string[] = typeof item.events === "string" ? JSON.parse(item.events) : (item.events || []);
        itemEvts.forEach((e) => existingEvents.add(e));
      });

      const hasDuplicateEvent = events.some((e: string) => existingEvents.has(e));
      if (hasDuplicateEvent) {
        return NextResponse.json(
          { error: "该 URL 目标地址的相同事件订阅已存在，请勿重复创建" },
          { status: 400 }
        );
      }
    }

    const newId = `wh_${Math.random().toString(36).substring(2, 12)}`;
    const secret = `zg_sec_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;

    const now = new Date();
    let created: any = null;
    if ((prisma as any).webhooksubscription) {
      created = await (prisma as any).webhooksubscription.create({
        data: {
          id: newId,
          userId: user.id,
          url,
          secret,
          events: JSON.stringify(events),
          active: true,
          successRate: "100%",
        },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO webhooksubscription (id, userId, url, secret, events, active, successRate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        user.id,
        url,
        secret,
        JSON.stringify(events),
        1,
        "100%",
        now,
        now
      );
      created = {
        id: newId,
        url,
        secret,
        events: JSON.stringify(events),
        active: true,
        successRate: "100%",
      };
    }

    return NextResponse.json({
      success: true,
      webhook: {
        id: created.id,
        url: created.url,
        secret: created.secret,
        events,
        active: true,
        successRate: "100%",
        lastTriggered: "-",
      },
    });
  } catch (error: any) {
    console.error("POST /api/webhooks 失败:", error);
    return NextResponse.json({ error: error.message || "创建 Webhook 失败" }, { status: 500 });
  }
}

// PATCH: 切换启用状态或发送测试 Event Payload
export async function PATCH(req: NextRequest) {
  try {
    await ensureWebhookTable();
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录或凭证失效" }, { status: 401 });
    }

    const body = await req.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少 Webhook ID" }, { status: 400 });
    }

    let existing: any = null;
    if ((prisma as any).webhooksubscription) {
      existing = await (prisma as any).webhooksubscription.findFirst({
        where: { id, userId: user.id },
      });
    } else {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM webhooksubscription WHERE id = ? AND userId = ? LIMIT 1`,
        id,
        user.id
      );
      existing = rows && rows.length > 0 ? rows[0] : null;
    }

    if (!existing) {
      return NextResponse.json({ error: "找不到该 Webhook 订阅记录" }, { status: 404 });
    }

    if (action === "toggle") {
      const nextActive = !Boolean(existing.active);
      if ((prisma as any).webhooksubscription) {
        await (prisma as any).webhooksubscription.update({
          where: { id },
          data: { active: nextActive },
        });
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE webhooksubscription SET active = ? WHERE id = ?`,
          nextActive ? 1 : 0,
          id
        );
      }
      return NextResponse.json({ success: true, active: nextActive });
    }

    if (action === "test") {
      if (!existing.active) {
        return NextResponse.json({
          error: "该 Webhook 通道当前已暂停推发，请先点击【恢复推发】后再测试",
        }, { status: 400 });
      }

      const now = new Date();
      const startTime = Date.now();
      const eventsList = typeof existing.events === "string" ? JSON.parse(existing.events) : (existing.events || []);
      const targetEvent = eventsList[0] || "component.bind";

      const payload = {
        event: targetEvent,
        timestamp: startTime,
        webhookId: existing.id,
        data: {
          workspaceId: user.lastWorkspaceId || "ws_default",
          action: "PING_TEST",
          operator: user.name || user.email || "Admin User",
          message: "知阁·舟坊 Webhook 实时通道连通性测试消息"
        }
      };
      const bodyString = JSON.stringify(payload);
      const hmacSignature = "sha256=" + crypto.createHmac("sha256", existing.secret).update(bodyString).digest("hex");

      let httpStatus = 200;
      let statusText = "OK";
      let durationMs = 0;
      let isRealSuccess = true;
      let responseErrorMsg = "";

      // 判断是否为系统测试/模拟 Endpoint (如含有 mock, zhige.io, yourdomain, example 等)
      const isMockUrl = /mock|zhige\.io|yourdomain|example/i.test(existing.url);

      if (isMockUrl) {
        // 沙盒环境内建连通成功处理
        durationMs = Math.floor(Math.random() * 20) + 25; // 模拟 25~45ms 延迟
        httpStatus = 200;
        statusText = "OK (Mock Sandbox)";
        isRealSuccess = true;
      } else {
        // 真实向公网目标的 Endpoint URL 发送 HTTP POST 数据包
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒超时防护

          const httpRes = await fetch(existing.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "ZhiGe-Dockyard-Webhook-Worker/2.0",
              "x-zhige-signature": hmacSignature,
              "x-zhige-event": targetEvent,
            },
            body: bodyString,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          durationMs = Date.now() - startTime;
          httpStatus = httpRes.status;
          statusText = httpRes.statusText || (httpRes.ok ? "OK" : "HTTP Error");
          isRealSuccess = httpRes.ok;
        } catch (err: any) {
          durationMs = Date.now() - startTime;
          isRealSuccess = false;
          httpStatus = 504;
          statusText = err.name === "AbortError" ? "Gateway Timeout (6s)" : (err.message || "Connection Refused");
          responseErrorMsg = err.message || "目标服务器无法连通";
        }
      }

      const successRateText = isRealSuccess ? "100%" : "0%";
      if ((prisma as any).webhooksubscription) {
        await (prisma as any).webhooksubscription.update({
          where: { id },
          data: { lastTriggered: now, successRate: successRateText },
        });
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE webhooksubscription SET lastTriggered = NOW(), successRate = ? WHERE id = ?`,
          successRateText,
          id
        );
      }

      return NextResponse.json({
        success: true,
        isRealSuccess,
        httpStatus,
        statusText,
        durationMs,
        responseErrorMsg,
        message: isRealSuccess 
          ? `🟢 推发成功 (HTTP ${httpStatus}, ${durationMs}ms)`
          : `🔴 响应告警 (HTTP ${httpStatus}, ${durationMs}ms)`,
        lastTriggered: now.toISOString().replace("T", " ").substring(0, 19),
      });
    }

    return NextResponse.json({ error: "未知的 Action 类型" }, { status: 400 });
  } catch (error: any) {
    console.error("PATCH /api/webhooks 失败:", error);
    return NextResponse.json({ error: error.message || "更新 Webhook 失败" }, { status: 500 });
  }
}

// DELETE: 真实物理解绑并删除 Webhook 订阅记录
export async function DELETE(req: NextRequest) {
  try {
    await ensureWebhookTable();
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "未登录或凭证失效" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少要解绑的 Webhook ID" }, { status: 400 });
    }

    if ((prisma as any).webhooksubscription) {
      await (prisma as any).webhooksubscription.deleteMany({
        where: { id, userId: user.id },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM webhooksubscription WHERE id = ? AND userId = ?`,
        id,
        user.id
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/webhooks 失败:", error);
    return NextResponse.json({ error: error.message || "删除 Webhook 失败" }, { status: 500 });
  }
}
