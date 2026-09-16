import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import {
  TESTIMONIAL_GROUP_COUNT,
  getGroupSummaries,
  getRotationState,
} from "@/lib/testimonial-service";

export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 2000;

function clampGroupNo(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(TESTIMONIAL_GROUP_COUNT, Math.max(1, Math.trunc(n)));
}

interface TestimonialInput {
  groupNo: number;
  category: string;
  name: string;
  role: string | null;
  org: string | null;
  avatar: string | null;
  rating: number;
  content: string;
  tags: string[] | undefined;
  highlightLabel: string | null;
  highlightValue: string | null;
  sortOrder: number;
  status: string;
}

/** 校验并归一化提交的评价数据 */
function parsePayload(body: Record<string, unknown>): { error: string } | { data: TestimonialInput } {
  const name = String(body?.name ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!name) return { error: "请填写评价者姓名" };
  if (name.length > 30) return { error: "评价者姓名不能超过 30 个字符" };
  if (!content) return { error: "请填写评价内容" };
  if (content.length > MAX_CONTENT_LENGTH) return { error: `评价内容不能超过 ${MAX_CONTENT_LENGTH} 个字符` };

  const ratingRaw = Number(body?.rating ?? 5);
  const rating = Number.isFinite(ratingRaw) ? Math.min(5, Math.max(1, Math.trunc(ratingRaw))) : 5;

  const tags = Array.isArray(body?.tags)
    ? (body.tags as unknown[])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const sortOrderRaw = Number(body?.sortOrder ?? 0);

  return {
    data: {
      groupNo: clampGroupNo(body?.groupNo),
      category: body?.category === "enterprise" ? "enterprise" : "personal",
      name,
      role: String(body?.role ?? "").trim() || null,
      org: String(body?.org ?? "").trim() || null,
      avatar: String(body?.avatar ?? "").trim() || null,
      rating,
      content,
      tags: tags.length ? tags : undefined,
      highlightLabel: String(body?.highlightLabel ?? "").trim() || null,
      highlightValue: String(body?.highlightValue ?? "").trim() || null,
      sortOrder: Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0,
      status: body?.status === "hidden" ? "hidden" : "active",
    },
  };
}

/** GET /api/admin/testimonials?groupNo=1 —— 轮换状态 + 各组统计 + 指定组明细（含隐藏项） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:read");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json({ error: status === 401 ? "未授权，请重新登录" : "无权限查看用户评价" }, { status });
    }

    const groupNo = clampGroupNo(request.nextUrl.searchParams.get("groupNo"));

    const [state, summaries, rows] = await Promise.all([
      getRotationState(),
      getGroupSummaries(),
      prisma.testimonial.findMany({
        where: { groupNo },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      groupCount: TESTIMONIAL_GROUP_COUNT,
      state,
      summaries,
      groupNo,
      testimonials: rows,
    });
  } catch (error) {
    console.error("Get admin testimonials error:", error);
    return NextResponse.json({ error: "读取用户评价失败" }, { status: 500 });
  }
}

/** POST /api/admin/testimonials —— 新增一条评价 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json({ error: status === 401 ? "未授权，请重新登录" : "无权限修改用户评价" }, { status });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parsePayload(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const created = await prisma.testimonial.create({
      data: parsed.data,
    });

    await writeAuditLog(
      auth.user!.id,
      "testimonial:create",
      { id: created.id, groupNo: created.groupNo, name: created.name },
      null,
      null,
      request
    );

    return NextResponse.json({ success: true, testimonial: created, message: "评价已创建" });
  } catch (error) {
    console.error("Create testimonial error:", error);
    return NextResponse.json({ error: "创建评价失败" }, { status: 500 });
  }
}

/** PUT /api/admin/testimonials —— 按 id 更新 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json({ error: status === 401 ? "未授权，请重新登录" : "无权限修改用户评价" }, { status });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "缺少评价 ID" }, { status: 400 });

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "评价不存在或已被删除" }, { status: 404 });

    const parsed = parsePayload(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updated = await prisma.testimonial.update({
      where: { id },
      data: parsed.data,
    });

    await writeAuditLog(
      auth.user!.id,
      "testimonial:update",
      { id, groupNo: updated.groupNo, name: updated.name },
      null,
      null,
      request
    );

    return NextResponse.json({ success: true, testimonial: updated, message: "评价已更新" });
  } catch (error) {
    console.error("Update testimonial error:", error);
    return NextResponse.json({ error: "更新评价失败" }, { status: 500 });
  }
}

/** DELETE /api/admin/testimonials?id=xxx —— 删除一条评价 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json({ error: status === 401 ? "未授权，请重新登录" : "无权限修改用户评价" }, { status });
    }

    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "缺少评价 ID" }, { status: 400 });

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "评价不存在或已被删除" }, { status: 404 });

    await prisma.testimonial.delete({ where: { id } });

    await writeAuditLog(
      auth.user!.id,
      "testimonial:delete",
      { id, groupNo: existing.groupNo, name: existing.name },
      null,
      null,
      request
    );

    return NextResponse.json({ success: true, message: "评价已删除" });
  } catch (error) {
    console.error("Delete testimonial error:", error);
    return NextResponse.json({ error: "删除评价失败" }, { status: 500 });
  }
}
