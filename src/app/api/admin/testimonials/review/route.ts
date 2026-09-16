import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { addNotification } from "@/lib/notifications-store";
import { TESTIMONIAL_GROUP_COUNT } from "@/lib/testimonial-service";

export const dynamic = "force-dynamic";

function clampGroupNo(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(TESTIMONIAL_GROUP_COUNT, Math.max(1, Math.trunc(n)));
}

/**
 * GET /api/admin/testimonials/review
 * 待审核（pending）与已驳回（rejected）的用户自助提交列表，附带提交人信息。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "无权限审核用户评价" },
        { status }
      );
    }

    const rows = await prisma.testimonial.findMany({
      where: { status: { in: ["pending", "rejected"] } },
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }, { createdAt: "desc" }],
    });

    // 汇总提交人信息（submitterId 为普通标量字段，此处按需补齐）
    const submitterIds = Array.from(
      new Set(rows.map((r) => r.submitterId).filter((id): id is string => !!id))
    );
    const submitters = submitterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: submitterIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const submitterMap: Record<string, { name: string | null; email: string }> = {};
    for (const u of submitters) {
      submitterMap[u.id] = { name: u.name, email: u.email };
    }

    return NextResponse.json({
      success: true,
      pending: rows.filter((r) => r.status === "pending"),
      rejected: rows.filter((r) => r.status === "rejected"),
      submitterMap,
    });
  } catch (error) {
    console.error("Get testimonial submissions error:", error);
    return NextResponse.json({ error: "读取待审核评价失败" }, { status: 500 });
  }
}

/**
 * POST /api/admin/testimonials/review
 * 审核动作：
 *   - { id, action: "approve", groupNo, reviewNote? }  通过并上架到指定分组
 *   - { id, action: "reject",  reviewNote? }           驳回（保留记录，可再次通过）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformPermission(request, "content:publish");
    if (!auth.authorized) {
      const status = auth.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "无权限审核用户评价" },
        { status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const reviewNote = String(body?.reviewNote ?? "").trim() || null;

    if (!id) return NextResponse.json({ error: "缺少评价 ID" }, { status: 400 });
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "不支持的审核动作" }, { status: 400 });
    }

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "评价不存在或已被删除" }, { status: 404 });

    if (action === "approve") {
      const groupNo = clampGroupNo(body?.groupNo ?? existing.groupNo ?? 1);
      const updated = await prisma.testimonial.update({
        where: { id },
        data: { status: "active", groupNo, reviewNote },
      });
      await writeAuditLog(
        auth.user!.id,
        "testimonial:approve",
        { id, groupNo, name: updated.name },
        null,
        null,
        request
      );

      // 通知提交人（仅用户自助提交；状态确有变化时才发，避免重复提醒）
      if (updated.submitterId && existing.status !== "active") {
        try {
          await addNotification(
            updated.submitterId,
            "您的使用评价已通过审核",
            "您提交的使用评价已通过审核，现已展示在首页「用户评价」区域，感谢您的分享！",
            "system",
            "/"
          );
        } catch (notifyError) {
          console.warn("[testimonial] 审核通过通知发送失败:", notifyError);
        }
      }

      return NextResponse.json({
        success: true,
        testimonial: updated,
        message: `已通过并上架到第 ${groupNo} 组`,
      });
    }

    const updated = await prisma.testimonial.update({
      where: { id },
      data: { status: "rejected", reviewNote },
    });
    await writeAuditLog(
      auth.user!.id,
      "testimonial:reject",
      { id, name: updated.name, reviewNote },
      null,
      null,
      request
    );

    // 通知提交人（仅用户自助提交；状态确有变化时才发）
    if (updated.submitterId && existing.status !== "rejected") {
      try {
        await addNotification(
          updated.submitterId,
          "您的使用评价未通过审核",
          reviewNote
            ? `您提交的使用评价未通过审核。审核备注：${reviewNote}`
            : "您提交的使用评价未通过审核，如有疑问可联系平台客服。",
          "system",
          "/"
        );
      } catch (notifyError) {
        console.warn("[testimonial] 审核驳回通知发送失败:", notifyError);
      }
    }

    return NextResponse.json({ success: true, testimonial: updated, message: "已驳回该评价" });
  } catch (error) {
    console.error("Review testimonial error:", error);
    return NextResponse.json({ error: "审核操作失败" }, { status: 500 });
  }
}
