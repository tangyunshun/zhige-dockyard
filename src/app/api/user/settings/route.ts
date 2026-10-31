import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 个人中心 UI 偏好持久化（数据库版）：
// 历史实现曾把设置写到 src/app/api/user/settings/settings-store.json 源码目录文件——
// 多实例不一致、重新部署即丢、无并发控制、无字段白名单，已废弃并迁移到
// userpreference.uiSettings 单列 JSON 快照（与 security-settings 同库同表）。

const DEFAULT_SETTINGS = {
  language: "zh-CN",
  theme: "light",
  displayDensity: "comfortable",
  enableAnimations: true,
  // 默认工作空间与中枢偏好
  defaultWorkspaceId: "auto", // auto | workspaceId
  workspaceView: "grid", // grid | list
  sidebarDefaultExpanded: true,
  componentSort: "popularity", // popularity | updatedAt | name
  // 代码与开发偏好
  codeTheme: "light", // light | soft | dark
  codeFontSize: "13px", // 12px | 13px | 14px
  tabSize: 2, // 2 | 4
  showLineNumbers: true,
  // 日期时间与数据导出偏好
  dateFormat: "YYYY-MM-DD", // YYYY-MM-DD | YYYY/MM/DD | YYYY年MM月DD日
  timeFormat: "24h", // 24h | 12h
  exportFormat: "xlsx", // xlsx | json | csv
  // 声音与交互
  soundEffects: true,
  // 隐私安全
  requireDeleteConfirm: true,
};

// PUT 允许写入的字段白名单（枚举值/类型在后端钳制，防止任意 JSON 注入）
const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

// 枚举字段合法值（越界一律回落默认，防脏数据；defaultWorkspaceId 支持 auto 或真实空间 ID）
const ENUMS: Record<string, string[]> = {
  language: ["zh-CN", "en", "en-US"],
  theme: ["light", "dark", "auto", "system"],
  displayDensity: ["compact", "comfortable", "spacious"],
  workspaceView: ["grid", "list"],
  componentSort: ["popularity", "updatedAt", "name"],
  codeTheme: ["light", "soft", "dark"],
  codeFontSize: ["12px", "13px", "14px"],
  dateFormat: ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY年MM月DD日"],
  timeFormat: ["24h", "12h"],
  exportFormat: ["xlsx", "json", "csv"],
};

async function ensurePref(userId: string) {
  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO userpreference (id, userId, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())`,
    crypto.randomUUID(),
    userId,
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    const userId = auth.user.id;

    const rows = await prisma.$queryRawUnsafe<Array<{ uiSettings: string | null; updatedAt: Date | null }>>(
      `SELECT uiSettings, updatedAt FROM userpreference WHERE userId = ?`,
      userId,
    );
    let stored: Record<string, unknown> = {};
    const raw = rows[0]?.uiSettings;
    if (raw) {
      try {
        stored = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
      } catch {
        stored = {};
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...DEFAULT_SETTINGS, ...stored },
      updatedAt: rows[0]?.updatedAt || null,
    });
  } catch (error) {
    console.error("Get user settings error:", error);
    return NextResponse.json({ error: "获取用户设置失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "无效的设置数据" }, { status: 400 });
    }

    // 白名单过滤 + 枚举钳制 + 合并既有值（部分保存语义与前端全量快照兼容）
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      const def = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
      if (typeof def === "boolean") {
        sanitized[key] = Boolean(value);
      } else if (typeof def === "number") {
        const n = Number(value);
        sanitized[key] = Number.isFinite(n) ? n : def;
      } else {
        const s = String(value ?? "");
        const allowed = ENUMS[key];
        sanitized[key] = allowed && !allowed.includes(s) ? def : s.slice(0, 100);
      }
    }

    await ensurePref(userId);
    const current = await prisma.$queryRawUnsafe<Array<{ uiSettings: string | null }>>(
      `SELECT uiSettings FROM userpreference WHERE userId = ?`,
      userId,
    );
    let merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    const rawCurrent = current[0]?.uiSettings;
    if (rawCurrent) {
      try {
        const parsed = typeof rawCurrent === "string" ? JSON.parse(rawCurrent) : (rawCurrent as Record<string, unknown>);
        merged = { ...merged, ...parsed };
      } catch {
        /* 损坏历史值直接按默认重建 */
      }
    }
    merged = { ...merged, ...sanitized };

    await prisma.$executeRawUnsafe(
      `UPDATE userpreference SET uiSettings = ?, updatedAt = NOW() WHERE userId = ?`,
      JSON.stringify(merged),
      userId,
    );

    // 写操作留痕（非阻断式）
    const { writeAuditLog } = await import("@/lib/security");
    await writeAuditLog(userId, "user:settings_update", { keys: Object.keys(sanitized) }, null, null, req).catch(() => {});

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Update user settings error:", error);
    return NextResponse.json({ error: "更新用户设置失败" }, { status: 500 });
  }
}
