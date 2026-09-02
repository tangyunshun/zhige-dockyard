import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || (workspace.ownerId !== userId && workspace.type !== "ENTERPRISE")) {
      return NextResponse.json({ error: "无权访问此空间" }, { status: 403 });
    }

    const ownerUser = workspace.ownerId
      ? await prisma.user.findUnique({ where: { id: workspace.ownerId } })
      : null;

    // 历史数据自动自愈同步逻辑：只要 contactPhone 或 contactEmail 为空，自动从 owner/user 表抓取并物理回写落库
    let realContactPhone = workspace.contactPhone;
    let realContactEmail = workspace.contactEmail;
    let needSync = false;

    const authUser = authResult.user as any;
    const ownerPhone = ownerUser?.phone || authUser?.phone || "";
    const ownerEmail = ownerUser?.email || authUser?.email || "";

    if (!realContactPhone && ownerPhone) {
      realContactPhone = ownerPhone;
      needSync = true;
    }
    if (!realContactEmail && ownerEmail) {
      realContactEmail = ownerEmail;
      needSync = true;
    }

    // 在后台隐式对历史空间做物理同步回写
    if (needSync) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          contactPhone: realContactPhone,
          contactEmail: realContactEmail,
        },
      }).catch((e) => console.warn("[自愈同步] 历史空间联系信息回写失败:", e));

      // 若 owner 自身的 phone/email 为空，反向回写到 user 表中完成全链路同步
      if (workspace.ownerId) {
        await prisma.user.update({
          where: { id: workspace.ownerId },
          data: {
            phone: ownerPhone || realContactPhone || undefined,
            email: ownerEmail || realContactEmail || undefined,
          },
        }).catch((e) => console.warn("[自愈同步] 历史用户表联系信息回写失败:", e));
      }
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        description: workspace.description,
        teamSize: workspace.teamSize,
        industry: workspace.industry,
        contactEmail: realContactEmail || ownerEmail || "",
        contactPhone: realContactPhone || ownerPhone || "",
        ownerName: ownerUser?.name || authUser?.name || "空间所有者",
        ownerPhone: ownerPhone || realContactPhone || "",
        ownerEmail: ownerEmail || realContactEmail || "",
        logo: workspace.logo,
        createdAt: workspace.createdAt,
      },
    });
  } catch (error) {
    console.error("Get workspace info error:", error);
    return NextResponse.json(
      { error: "获取信息失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader, request);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权访问此空间" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      name, 
      description,
      teamSize,
      industry,
      contactEmail,
      contactPhone,
      logo,
    } = body;

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name?.trim(),
        description: description?.trim() || null,
        teamSize: teamSize || null,
        industry: industry || null,
        contactEmail: contactEmail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        logo: logo || null,
      },
    });

    // 记录空间配置变更审计日志（非阻断式）
    await writeAuditLog(userId, "workspace:update", {
      workspaceId,
      name: updatedWorkspace.name,
      changed: Object.keys(body),
    }, workspaceId, null, request).catch((e) => console.warn("[审计] 空间配置变更日志写入失败:", e));

    return NextResponse.json({
      success: true,
      workspace: updatedWorkspace,
    });
  } catch (error) {
    console.error("Update workspace error:", error);
    return NextResponse.json(
      { error: "更新失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
