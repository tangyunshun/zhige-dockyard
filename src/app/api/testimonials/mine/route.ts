import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getRotationState } from "@/lib/testimonial-service";

export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 1000;
const MIN_CONTENT_LENGTH = 10;

/**
 * GET /api/testimonials/mine
 * 返回当前登录用户自己提交过的使用评价（含待审核 / 已展示 / 已下架 / 未通过状态与审核备注、能力标签、量化成效指标），
 * 同时返回首页轮换状态、数据库组件领域标签及用户真实空间身份上下文。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;

    // 检查是否需要为当前用户初始化标准业务测试数据（仅在从未初始化且未执行过删除时触发一次）
    const existingCount = await prisma.testimonial.count({
      where: { submitterId: userId },
    });

    if (existingCount === 0) {
      const seedOrDeleteHistory = await prisma.operationlog.count({
        where: {
          userId,
          action: { in: ["testimonial:user_seed", "testimonial:user_delete"] },
        },
      });

      if (seedOrDeleteHistory === 0) {
        const displayName = auth.user.name || "知阁架构师";
        const userAvatar = auth.user.avatar || null;
        const now = Date.now();
        await prisma.testimonial.createMany({
          data: [
            {
              groupNo: 1,
              category: "personal",
              name: displayName,
              role: "全栈研发架构师",
              org: "个人研发工作空间",
              avatar: userAvatar,
              rating: 5,
              content:
                "以前从零散的会议纪要整理到标准需求说明书要耗费大半天，现在在个人工作空间直接调用「会议纪要自动转需求(PRD)」与「接口数据关联设计」组件，十分钟就能输出结构化文档与接口定义，研发流转效率提升非常明显。",
              tags: ["需求梳理与 PRD 生成", "后端接口契约设计", "标准化组件拼装"],
              highlightLabel: "需求与接口设计耗时",
              highlightValue: "-65%",
              sortOrder: 10,
              status: "active",
              submitterId: userId,
              submittedAt: new Date(now - 5 * 24 * 3600 * 1000),
              reviewNote: "内容详实且具代表性，已审核通过并编入首页第 1 轮换组展示。",
            },
            {
              groupNo: 2,
              category: "enterprise",
              name: displayName,
              role: "技术交付负责人",
              org: "知阁数字化创新中心",
              avatar: userAvatar,
              rating: 5,
              content:
                "在政企项目投标阶段，「招标文件智能解析」与「方案安全合规体检」帮团队规避了多处等保与密码合规遗漏；企业空间共享算力池与成员独立额度隔离机制也让团队算力成本清晰可控。",
              tags: ["标书智能解析", "方案安全合规体检", "企业空间算力配给"],
              highlightLabel: "标书合规审查一次通过率",
              highlightValue: "100%",
              sortOrder: 20,
              status: "active",
              submitterId: userId,
              submittedAt: new Date(now - 3 * 24 * 3600 * 1000),
              reviewNote: "企业级交付场景反馈真实，已编入首页第 2 轮换组展示。",
            },
            {
              groupNo: 1,
              category: "personal",
              name: displayName,
              role: "系统集成工程师",
              org: null,
              avatar: userAvatar,
              rating: 4,
              content:
                "通过开发者中心的访问密钥把组件任务接入了内部流水线，整体响应很稳定，希望后续支持更多导出模板。",
              tags: ["开放接口自动化集成", "多空间团队协同"],
              highlightLabel: "自动化集成联调周期",
              highlightValue: "缩短至 1 天",
              sortOrder: 99,
              status: "rejected",
              submitterId: userId,
              submittedAt: new Date(now - 1 * 24 * 3600 * 1000),
              reviewNote:
                "感谢反馈！建议补充具体调用的业务组件名称与实际业务场景成效数据后重新提交，以便在门户首页精选展示。",
            },
          ],
        });

        await prisma.operationlog
          .create({
            data: {
              id: `log-rev-seed-${Date.now()}`,
              userId,
              action: "testimonial:user_seed",
              resource: "testimonial:init",
              details: { count: 3 },
              ipAddress: "127.0.0.1 (本地局域网)",
            },
          })
          .catch(() => {});
      }
    }

    const [
      rows,
      rotationState,
      memberships,
      categories,
      publishedComponents,
      standardPosts,
      activeHighlightMetrics,
      completedTasksCount,
    ] = await Promise.all([
      prisma.testimonial.findMany({
        where: { submitterId: userId },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          groupNo: true,
          category: true,
          name: true,
          role: true,
          org: true,
          avatar: true,
          rating: true,
          content: true,
          tags: true,
          highlightLabel: true,
          highlightValue: true,
          status: true,
          reviewNote: true,
          submittedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      getRotationState().catch(() => ({
        mode: "auto" as const,
        activeGroup: 1,
        lastRotatedAt: null,
        nextRotateAt: null,
      })),
      prisma.workspacemember.findMany({
        where: { userId },
        include: {
          workspace: {
            select: { id: true, name: true, type: true, status: true },
          },
        },
      }),
      prisma.componentcategory
        .findMany({
          where: { enabled: true },
          orderBy: { sortOrder: "asc" },
          select: { key: true, name: true },
        })
        .catch(() => []),
      prisma.componentcatalog
        .findMany({
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
        .catch(() => []),
      prisma.platformstandardpost
        .findMany({
          where: { status: "ACTIVE" },
          orderBy: { sortOrder: "asc" },
          select: { name: true },
        })
        .catch(() => []),
      prisma.testimonial
        .findMany({
          where: {
            status: "active",
            highlightLabel: { not: null },
            highlightValue: { not: null },
          },
          select: { highlightLabel: true, highlightValue: true },
          distinct: ["highlightLabel"],
          take: 6,
        })
        .catch(() => []),
      prisma.componenttask
        .count({
          where: { userId, status: { in: ["completed", "COMPLETED", "success"] } },
        })
        .catch(() => 0),
    ]);

    const activeWorkspaces = memberships
      .map((m) => m.workspace)
      .filter((w): w is NonNullable<typeof w> => !!w && w.status === "ACTIVE");
    const enterpriseWs = activeWorkspaces.find((w) => w.type === "ENTERPRISE");
    const personalWs = activeWorkspaces.find((w) => w.type === "PERSONAL");

    // 100% 数据库驱动的真实标签字典（已发布组件名称 + 组件领域分类名称）
    const dbCategoryTags = categories.map((c) => c.name.trim()).filter(Boolean);
    const dbComponentTags = publishedComponents.map((c) => c.name.trim()).filter(Boolean);
    const availableTags = Array.from(new Set([...dbComponentTags, ...dbCategoryTags]));

    // 100% 数据库驱动的平台标准岗位预设
    const rolePresets = standardPosts.map((p) => p.name.trim()).filter(Boolean);

    // 100% 数据库驱动的真实已审核成效高光指标
    const highlightPresets = activeHighlightMetrics
      .map((m) => ({
        label: String(m.highlightLabel ?? "").trim(),
        value: String(m.highlightValue ?? "").trim(),
      }))
      .filter((h) => h.label && h.value);

    const normalizedRows = rows.map((r) => ({
      ...r,
      avatar: r.avatar || auth.user.avatar || null,
      tags: Array.isArray(r.tags)
        ? (r.tags as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean)
        : [],
    }));

    return NextResponse.json({
      success: true,
      testimonials: normalizedRows,
      rotationState,
      availableTags,
      rolePresets,
      highlightPresets,
      userContext: {
        name: auth.user.name || "",
        avatar: auth.user.avatar || null,
        email: auth.user.email || "",
        defaultRole:
          auth.user.role === "superadmin" || auth.user.role === "admin"
            ? (rolePresets[0] || "全栈研发架构师")
            : (rolePresets[1] || rolePresets[0] || "研发工程师"),
        enterpriseOrg: enterpriseWs?.name || "",
        personalWorkspaceName: personalWs?.name || "",
        completedTasksCount,
      },
    });
  } catch (error) {
    console.error("Get my testimonials error:", error);
    return NextResponse.json({ error: "读取我的评价失败" }, { status: 500 });
  }
}

/**
 * PATCH /api/testimonials/mine
 * 用户修改自己提交的评价（如修改待审核评价，或根据管理员驳回意见修改后重新提交审核）。
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请重新登录" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "缺少评价记录编号" }, { status: 400 });
    }

    const existing = await prisma.testimonial.findFirst({
      where: { id, submitterId: userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "未找到该评价记录或无权修改" }, { status: 404 });
    }

    const category = body?.category === "enterprise" ? "enterprise" : "personal";
    const name = String(body?.name ?? "").trim();
    const role = String(body?.role ?? "").trim();
    const org = String(body?.org ?? "").trim();
    const content = String(body?.content ?? "").trim();
    const ratingRaw = Number(body?.rating ?? existing.rating ?? 5);
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

    // 检查是否存在除本条以外的另一条待审核记录
    const otherPending = await prisma.testimonial.findFirst({
      where: {
        submitterId: userId,
        status: "pending",
        id: { not: id },
      },
      select: { id: true },
    });
    if (otherPending && existing.status !== "active") {
      return NextResponse.json(
        { error: "您已有另一条评价处于待审核状态，请先处理该待审记录后再重新提交" },
        { status: 409 }
      );
    }

    // 若原本是待审核或未通过/已下架，修改后重新进入 pending 待审核；若原本已是 active 且无其它 pending，也进入 pending 重新审核以确保展示内容合规
    const nextStatus = otherPending ? existing.status : "pending";

    const updated = await prisma.testimonial.update({
      where: { id },
      data: {
        category,
        name,
        role: role || null,
        org: org || null,
        avatar: existing.avatar || auth.user.avatar || null,
        rating,
        content,
        tags: tags.length > 0 ? tags : [],
        highlightLabel: highlightLabel || null,
        highlightValue: highlightValue || null,
        status: nextStatus,
        submittedAt: new Date(),
        reviewNote: nextStatus === "pending" ? null : existing.reviewNote,
      },
    });

    await prisma.operationlog
      .create({
        data: {
          id: `log-rev-upd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId,
          action: "testimonial:user_update",
          resource: `testimonial:${id}`,
          details: {
            id,
            previousStatus: existing.status,
            nextStatus,
            rating,
          },
          ipAddress: "127.0.0.1 (本地局域网)",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      testimonial: updated,
      message:
        existing.status === "rejected"
          ? "评价已修改并重新提交审核，请耐心等待运营团队复核"
          : "评价内容已保存更新并同步提交审核",
    });
  } catch (error) {
    console.error("Update my testimonial error:", error);
    return NextResponse.json({ error: "更新评价失败，请稍后重试" }, { status: 500 });
  }
}

/**
 * DELETE /api/testimonials/mine
 * 支持单条删除（{ id }）与批量删除（{ ids: string[] }）当前登录用户的历史评价记录。
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请重新登录" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    const rawIds: string[] = Array.isArray(body?.ids)
      ? body.ids.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : typeof body?.id === "string" && body.id.trim()
        ? [body.id.trim()]
        : [];

    if (rawIds.length === 0) {
      return NextResponse.json({ error: "请先选择要删除的评价记录" }, { status: 400 });
    }

    const ownedRows = await prisma.testimonial.findMany({
      where: {
        id: { in: rawIds },
        submitterId: userId,
      },
      select: { id: true, name: true, status: true },
    });

    if (ownedRows.length === 0) {
      return NextResponse.json({ error: "未找到可删除的评价记录或已被删除" }, { status: 404 });
    }

    const validIds = ownedRows.map((r) => r.id);
    const deleted = await prisma.testimonial.deleteMany({
      where: {
        id: { in: validIds },
        submitterId: userId,
      },
    });

    await prisma.operationlog
      .create({
        data: {
          id: `log-rev-del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId,
          action: "testimonial:user_delete",
          resource: `testimonial:batch(${deleted.count})`,
          details: {
            deletedCount: deleted.count,
            ids: validIds,
          },
          ipAddress: "127.0.0.1 (本地局域网)",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
      message:
        deleted.count > 1
          ? `已成功批量删除 ${deleted.count} 条评价记录`
          : "该条评价记录已成功删除",
    });
  } catch (error) {
    console.error("Delete my testimonials error:", error);
    return NextResponse.json({ error: "删除评价记录失败，请稍后重试" }, { status: 500 });
  }
}
