import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 子账号空间授权（补齐"统管"的最后一环）
 *
 * 此前子账号创建后与普通用户无异——没有任何把子账号加入企业空间的步骤，"统管"只做了一半。
 * 本接口让主账号把名下子账号授权进自己的企业空间（复用 workspacemember 真实成员关系，
 * 子账号登录后经由既有空间列表/成员链路正常看到并进入被授权的空间）：
 * - GET    ?subUserId=  列出某子账号被授权的空间
 * - POST   授权/调整角色（MEMBER / ADMIN，绝不允许 OWNER）
 * - DELETE 取消授权
 * 全程校验：请求者必须是空间所有者且空间类型为企业空间，子账号必须归属请求者租户。
 */

async function requireOwnerWithTenant(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  return user?.tenantId || null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const subUserId = request.nextUrl.searchParams.get("subUserId");
    if (!subUserId) return NextResponse.json({ error: "缺少子账号 ID" }, { status: 400 });

    const tenantId = await requireOwnerWithTenant(auth.user.id);
    if (!tenantId) return NextResponse.json({ error: "仅企业空间所有者可管理授权" }, { status: 403 });

    // 子账号必须归属本租户
    const sub = await prisma.user.findFirst({
      where: { id: subUserId, tenantId, role: "SUBACCOUNT" },
      select: { id: true },
    });
    if (!sub) return NextResponse.json({ error: "子账号不存在或不属于当前主账号" }, { status: 404 });

    const memberships = await prisma.workspacemember.findMany({
      where: { userId: subUserId, workspace: { type: "ENTERPRISE" } },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        workspace: { select: { id: true, name: true, plan: true } },
      },
      orderBy: { joinedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      authorizations: memberships.map((m) => ({
        id: m.id,
        workspaceId: m.workspace.id,
        workspaceName: m.workspace.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error("[sub-accounts/authorize] 查询授权失败:", error);
    return NextResponse.json({ error: "查询授权失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const ownerId = auth.user.id;

    const { subUserId, workspaceId, role } = await request.json();
    if (!subUserId || !workspaceId) {
      return NextResponse.json({ error: "缺少子账号 ID 或空间 ID" }, { status: 400 });
    }
    if (role !== "MEMBER" && role !== "ADMIN") {
      return NextResponse.json({ error: "子账号角色仅支持 MEMBER / ADMIN" }, { status: 400 });
    }

    // 空间必须是请求者所有的企业空间
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true, type: true, name: true } });
    if (!ws) return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    if (ws.type !== "ENTERPRISE") return NextResponse.json({ error: "仅企业空间支持子账号授权" }, { status: 400 });
    if (ws.ownerId !== ownerId) return NextResponse.json({ error: "仅空间所有者可授权子账号" }, { status: 403 });

    // 子账号必须归属请求者租户且在启用状态
    const tenantId = await requireOwnerWithTenant(ownerId);
    const sub = await prisma.user.findFirst({
      where: { id: subUserId, tenantId, role: "SUBACCOUNT" },
      select: { id: true, name: true, status: true },
    });
    if (!sub) return NextResponse.json({ error: "子账号不存在或不属于当前主账号" }, { status: 404 });
    if (sub.status !== "active") return NextResponse.json({ error: "子账号已停用，请先启用后再授权" }, { status: 400 });

    // upsert 成员关系（已授权则调整角色）
    const existing = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: subUserId },
    });
    if (existing) {
      if (existing.role === "OWNER") {
        return NextResponse.json({ error: "该成员是空间所有者，不能通过子账号授权调整" }, { status: 400 });
      }
      await prisma.workspacemember.update({ where: { id: existing.id }, data: { role } });
    } else {
      await prisma.workspacemember.create({
        data: { id: crypto.randomUUID(), userId: subUserId, workspaceId, role },
      });
    }

    await prisma.operationlog
      .create({
        data: {
          id: crypto.randomUUID(),
          userId: ownerId,
          workspaceId,
          action: "SUBACCOUNT_AUTHORIZE",
          resource: "Workspace",
          details: {
            subUserId,
            subName: sub.name || "",
            workspaceName: ws.name,
            role,
            action: existing ? "ROLE_UPDATE" : "GRANT",
          },
        },
      })
      .catch(() => {});

    const { clearServerCache } = await import("@/lib/serverCache");
    clearServerCache();

    return NextResponse.json({
      success: true,
      message: existing ? `已将子账号在「${ws.name}」中的角色调整为${role === "ADMIN" ? "管理员" : "成员"}` : `子账号已授权加入「${ws.name}」`,
    });
  } catch (error) {
    console.error("[sub-accounts/authorize] 授权失败:", error);
    return NextResponse.json({ error: "授权操作失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const ownerId = auth.user.id;

    const { subUserId, workspaceId } = await request.json();
    if (!subUserId || !workspaceId) {
      return NextResponse.json({ error: "缺少子账号 ID 或空间 ID" }, { status: 400 });
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true, type: true, name: true } });
    if (!ws || ws.ownerId !== ownerId) {
      return NextResponse.json({ error: "仅空间所有者可取消授权" }, { status: 403 });
    }

    const tenantId = await requireOwnerWithTenant(ownerId);
    const sub = await prisma.user.findFirst({
      where: { id: subUserId, tenantId, role: "SUBACCOUNT" },
      select: { id: true, name: true },
    });
    if (!sub) return NextResponse.json({ error: "子账号不存在或不属于当前主账号" }, { status: 404 });

    const membership = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId: subUserId },
    });
    if (!membership) {
      return NextResponse.json({ error: "该子账号未被授权此空间" }, { status: 404 });
    }
    if (membership.role === "OWNER") {
      return NextResponse.json({ error: "该成员是空间所有者，不能移除" }, { status: 400 });
    }

    await prisma.workspacemember.delete({ where: { id: membership.id } });

    await prisma.operationlog
      .create({
        data: {
          id: crypto.randomUUID(),
          userId: ownerId,
          workspaceId,
          action: "SUBACCOUNT_AUTHORIZE",
          resource: "Workspace",
          details: { subUserId, subName: sub.name || "", workspaceName: ws.name, action: "REVOKE" },
        },
      })
      .catch(() => {});

    const { clearServerCache } = await import("@/lib/serverCache");
    clearServerCache();

    return NextResponse.json({ success: true, message: `已取消子账号对「${ws.name}」的授权` });
  } catch (error) {
    console.error("[sub-accounts/authorize] 取消授权失败:", error);
    return NextResponse.json({ error: "取消授权失败" }, { status: 500 });
  }
}
