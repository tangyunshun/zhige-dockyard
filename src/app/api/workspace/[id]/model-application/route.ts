import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadSpaceModelPolicy } from "@/lib/model-registry";
import { addNotification } from "@/lib/notifications-store";

export const dynamic = "force-dynamic";

/**
 * 模型使用申请接口（普通成员 → 空间所有者审批）
 *
 * POST：普通成员(MEMBER) 对「白名单内、非空间默认」的系统模型发起使用申请，需填写事由。
 *       空间所有者(OWNER)与空间管理员(ADMIN)无需此入口（可直接设定默认模型）。
 *       重复 PENDING / 已 APPROVED 的同一模型会被拦截。
 * GET ：所有者(含平台管理员)查看本空间全部申请；普通成员仅查看自己的申请。
 */

type Role = string;
const isPlatformAdmin = (role: Role) => role === "SUPER_ADMIN" || role === "ADMIN";

async function resolveContext(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!ws) return { ws: null };
  const member = await prisma.workspacemember.findFirst({
    where: { workspaceId, userId },
    select: { id: true, role: true },
  });
  return { ws, member };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "请先登录后再提交申请" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { deploymentId, reason } = (await request.json()) || {};
    if (!deploymentId || !reason || !String(reason).trim()) {
      return NextResponse.json({ success: false, error: "申请模型与申请事由不能为空" }, { status: 400 });
    }
    const trimmed = String(reason).trim();
    if (trimmed.length < 5) {
      return NextResponse.json({ success: false, error: "申请事由过短，请至少输入 5 个字" }, { status: 400 });
    }
    if (trimmed.length > 500) {
      return NextResponse.json({ success: false, error: "申请事由超出限制，最多 500 字" }, { status: 400 });
    }

    const { ws, member } = await resolveContext(workspaceId, userId);
    if (!ws) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });

    const isOwner = ws.ownerId === userId;
    const isAdmin = member?.role === "ADMIN";
    // 权限边界：空间所有者与空间管理员无需发起申请（可直接设默认）
    if (isOwner || isAdmin) {
      return NextResponse.json(
        { success: false, error: "您是空间所有者或管理员，可直接设定默认模型，无需发起申请" },
        { status: 403 },
      );
    }

    // 校验目标模型在白名单内且非空间默认
    const policy = await loadSpaceModelPolicy(workspaceId);
    if (!policy.configured || !(policy.allowedDeploymentIds || []).includes(deploymentId)) {
      return NextResponse.json({ success: false, error: "该模型不在本空间可用模型范围内" }, { status: 400 });
    }
    if (policy.defaultDeploymentId === deploymentId) {
      return NextResponse.json({ success: false, error: "该模型已是空间默认，无需申请" }, { status: 400 });
    }

    const dep = await prisma.modeldeployment.findUnique({
      where: { id: deploymentId },
      include: { provider: true },
    });
    if (!dep) return NextResponse.json({ success: false, error: "未找到目标模型" }, { status: 404 });

    // 去重：同一人同一模型不允许重复 PENDING
    const dupPending = await prisma.modelapplication.findFirst({
      where: { workspaceId, applicantId: userId, deploymentId, status: "PENDING" },
    });
    if (dupPending) {
      return NextResponse.json({ success: false, error: "您已对该模型提交过待审批申请" }, { status: 400 });
    }
    const approved = await prisma.modelapplication.findFirst({
      where: { workspaceId, applicantId: userId, deploymentId, status: "APPROVED" },
    });
    if (approved) {
      return NextResponse.json({ success: false, error: "该模型已是您的默认模型" }, { status: 400 });
    }

    const app = await prisma.modelapplication.create({
      data: {
        workspaceId,
        applicantId: userId,
        applicantName: auth.user.name || auth.user.email,
        deploymentId,
        modelLabel: dep.displayName || dep.modelId,
        providerName: dep.provider?.name || "",
        reason: trimmed,
        status: "PENDING",
      },
    });

    // 通知空间所有者待审批
    if (ws.ownerId !== userId) {
      await addNotification(
        ws.ownerId,
        "收到新的模型使用申请",
        `成员【${auth.user.name || auth.user.email}】申请使用模型【${dep.displayName || dep.modelId}】，请前往空间「模型」页审批。`,
        "system",
        `/workspace/${workspaceId}?tab=models`,
      );
    }

    return NextResponse.json({ success: true, data: app });
  } catch (error) {
    console.error("[model-application POST] 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "提交申请失败，请稍后重试" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ success: false, error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { ws, member } = await resolveContext(workspaceId, userId);
    if (!ws) return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 404 });
    const isOwner = ws.ownerId === userId;
    const privileged = isOwner || isPlatformAdmin(auth.user.role);
    // 普通空间管理员(ADMIN)无审批权，仅能查看自己的申请；所有者/平台管理员看全部
    if (!privileged && !member) {
      return NextResponse.json({ success: false, error: "无权访问该工作空间" }, { status: 403 });
    }

    const where = privileged ? { workspaceId } : { workspaceId, applicantId: userId };
    const list = await prisma.modelapplication.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error("[model-application GET] 失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "查询申请列表失败" }, { status: 500 });
  }
}
