import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
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

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        teamSize: workspace.teamSize,
        industry: workspace.industry,
        contactEmail: workspace.contactEmail,
        contactPhone: workspace.contactPhone,
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
    const authResult = await validateUser(authHeader);
    
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
      },
    });

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
