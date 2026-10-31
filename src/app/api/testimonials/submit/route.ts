import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 1000;
const MIN_CONTENT_LENGTH = 10;

/**
 * POST /api/testimonials/submit
 * 用户自助提交使用评价（需登录）。
 * 提交后进入 `pending` 待审核状态，管理员审核通过并指定分组后才会在首页展示。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "请先登录后再提交使用评价" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));

    const category = body?.category === "enterprise" ? "enterprise" : "personal";
    const name = String(body?.name ?? "").trim();
    const role = String(body?.role ?? "").trim();
    const org = String(body?.org ?? "").trim();
    const content = String(body?.content ?? "").trim();
    const ratingRaw = Number(body?.rating ?? 5);
    const rating = Number.isFinite(ratingRaw) ? Math.min(5, Math.max(1, Math.trunc(ratingRaw))) : 5;
    const highlightLabel = String(body?.highlightLabel ?? "").trim();
    const highlightValue = String(body?.highlightValue ?? "").trim();
    const rawTags = Array.isArray(body?.tags) ? body.tags : [];
    const tags = rawTags
      .map((t: unknown) => String(t ?? "").trim())
      .filter((t: string) => t.length > 0 && t.length <= 20)
      .slice(0, 6);

    if (!name) {
      return NextResponse.json({ error: "请填写您的姓名或称呼" }, { status: 400 });
    }
    if (name.length > 30) {
      return NextResponse.json({ error: "姓名 / 称呼不能超过 30 个字符" }, { status: 400 });
    }
    if (role.length > 30) {
      return NextResponse.json({ error: "身份 / 岗位不能超过 30 个字符" }, { status: 400 });
    }
    if (org.length > 50) {
      return NextResponse.json({ error: "单位名称不能超过 50 个字符" }, { status: 400 });
    }
    if (highlightLabel.length > 24) {
      return NextResponse.json({ error: "量化成效指标名称不能超过 24 个字符" }, { status: 400 });
    }
    if (highlightValue.length > 20) {
      return NextResponse.json({ error: "量化成效指标数值不能超过 20 个字符" }, { status: 400 });
    }
    if ((highlightLabel && !highlightValue) || (!highlightLabel && highlightValue)) {
      return NextResponse.json(
        { error: "量化成效指标的「指标名称」与「指标数值」需同时填写或同时留空" },
        { status: 400 }
      );
    }
    if (content.length < MIN_CONTENT_LENGTH) {
      return NextResponse.json({ error: `评价内容至少需要 ${MIN_CONTENT_LENGTH} 个字符` }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: `评价内容不能超过 ${MAX_CONTENT_LENGTH} 个字符` }, { status: 400 });
    }

    // 防重复提交：同一用户存在待审核评价时不再接收新提交
    const pendingExists = await prisma.testimonial.findFirst({
      where: { submitterId: userId, status: "pending" },
      select: { id: true },
    });
    if (pendingExists) {
      return NextResponse.json(
        { error: "您已有一条评价正在等待审核，可先在下方历史记录中修改或撤回该待审评价" },
        { status: 429 }
      );
    }

    const created = await prisma.testimonial.create({
      data: {
        groupNo: 1, // 占位分组，审核通过时由管理员指定
        category,
        name,
        role: role || null,
        org: org || null,
        avatar: auth.user.avatar || null, // 优先关联当前登录用户的真实头像
        rating,
        content,
        tags: tags.length > 0 ? tags : undefined,
        highlightLabel: highlightLabel || null,
        highlightValue: highlightValue || null,
        sortOrder: 999,
        status: "pending",
        submitterId: userId,
        submittedAt: new Date(),
      },
    });

    await prisma.operationlog
      .create({
        data: {
          id: `log-rev-sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId,
          action: "testimonial:user_submit",
          resource: `testimonial:${created.id}`,
          details: {
            id: created.id,
            category,
            rating,
            name,
            tags,
          },
          ipAddress: "127.0.0.1 (本地局域网)",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      testimonial: created,
      message: "评价已提交，管理员审核通过后将在首页展示，感谢您的反馈！",
    });
  } catch (error) {
    console.error("Submit testimonial error:", error);
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
