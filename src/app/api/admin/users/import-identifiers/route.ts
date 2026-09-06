import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

/**
 * 海量用户标识批量解析接口（替代逐个粘贴）
 * - 支持 application/json：{ identifiers: string[] }
 * - 支持 multipart/form-data：上传 file（CSV/TXT）或粘贴 text
 * - 解析分隔符：换行 / 逗号 / 分号 / 制表符 / 空白
 * - 自动识别 email（按 email 字段查）与 id（按 id 字段查）
 * - 单次上限 MAX_IDENTIFIERS，超出拒绝
 */

const MAX_IDENTIFIERS = 100000;

async function requireAdmin(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !isAdminRole(user.role)) {
    return { error: NextResponse.json({ error: "权限不足" }, { status: 403 }) };
  }
  return { admin: user };
}

function splitIdentifiers(raw: string): string[] {
  return raw.split(/[\n,;，；\s\t]+/).map((s) => s.trim()).filter(Boolean);
}

async function resolveIdentifiers(idOrEmails: string[]): Promise<{
  matched: Array<{ id: string; name: string | null; email: string | null; role: string }>;
  unmatched: string[];
  totalInput: number;
}> {
  const tokens = Array.from(new Set(idOrEmails));
  const emailLike = tokens.filter((t) => t.includes("@"));
  const idLike = tokens.filter((t) => !t.includes("@"));

  const matched: Array<{ id: string; name: string | null; email: string | null; role: string }> = [];

  if (idLike.length > 0) {
    const byId = await prisma.user.findMany({
      where: { id: { in: idLike } },
      select: { id: true, name: true, email: true, role: true },
    });
    matched.push(...byId);
  }
  if (emailLike.length > 0) {
    const byEmail = await prisma.user.findMany({
      where: { email: { in: emailLike } },
      select: { id: true, name: true, email: true, role: true },
    });
    matched.push(...byEmail);
  }

  // 按 id 去重
  const map = new Map<string, (typeof matched)[number]>();
  for (const u of matched) map.set(u.id, u);
  const deduped = Array.from(map.values());

  const matchedIdSet = new Set(deduped.map((u) => u.id));
  const matchedEmailSet = new Set(deduped.map((u) => u.email).filter(Boolean) as string[]);
  const unmatched = tokens.filter((t) => !matchedIdSet.has(t) && !matchedEmailSet.has(t));

  return { matched: deduped, unmatched, totalInput: tokens.length };
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const contentType = request.headers.get("content-type") || "";
    let identifiers: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const text = formData.get("text");
      if (file && typeof file !== "string") {
        const buf = await file.text();
        identifiers.push(...splitIdentifiers(buf));
      }
      if (text && typeof text === "string" && text.trim()) {
        identifiers.push(...splitIdentifiers(text));
      }
    } else {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.identifiers)) {
        identifiers = body.identifiers;
      }
    }

    if (identifiers.length === 0) {
      return NextResponse.json(
        { error: "未提供任何用户标识（请上传文件或在文本框粘贴邮箱/用户ID）" },
        { status: 400 }
      );
    }

    if (identifiers.length > MAX_IDENTIFIERS) {
      return NextResponse.json(
        {
          error: `单次最多支持 ${MAX_IDENTIFIERS.toLocaleString()} 个标识，当前 ${identifiers.length.toLocaleString()} 个，请分批导入`,
        },
        { status: 400 }
      );
    }

    const result = await resolveIdentifiers(identifiers);

    return NextResponse.json({
      success: true,
      matchedCount: result.matched.length,
      unmatchedCount: result.unmatched.length,
      totalInput: result.totalInput,
      matched: result.matched,
      // 仅返回前若干条未匹配样本，避免响应体过大
      unmatchedSamples: result.unmatched.slice(0, 20),
    });
  } catch (error) {
    console.error("Import identifiers error:", error);
    return NextResponse.json(
      {
        error: "导入用户标识失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}