﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - 获取用户组件列表
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    // 获取用户组件列表
    const components = await prisma.component.findMany({
      where: {
        ownerId: userId,
      },
      include: {
        componentusagestat: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: components,
    });
  } catch (error) {
    console.warn("Get user components error:", error);
    return NextResponse.json(
      { error: "获取用户组件失败" },
      { status: 500 }
    );
  }
}

// PUT - 更新组件
export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");
    const componentId = req.nextUrl.searchParams.get("id");

    if (!userId || !componentId) {
      return NextResponse.json(
        { error: "参数错误" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, status } = body;

    // 验证组件归属
    const component = await prisma.component.findFirst({
      where: {
        id: componentId,
        ownerId: userId,
      },
    });

    if (!component) {
      return NextResponse.json(
        { error: "组件不存在或无权访问" },
        { status: 404 }
      );
    }

    // 更新组件
    const updatedComponent = await prisma.component.update({
      where: { id: componentId },
      data: {
        name: name || component.name,
        description: description !== undefined ? description : component.description,
        status: status || component.status,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedComponent,
    });
  } catch (error) {
    console.error("Update component error:", error);
    return NextResponse.json(
      { error: "更新组件失败" },
      { status: 500 }
    );
  }
}

// DELETE - 删除组件
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");
    const componentId = req.nextUrl.searchParams.get("id");

    if (!userId || !componentId) {
      return NextResponse.json(
        { error: "参数错误" },
        { status: 400 }
      );
    }

    // 验证组件归属
    const component = await prisma.component.findFirst({
      where: {
        id: componentId,
        ownerId: userId,
      },
    });

    if (!component) {
      return NextResponse.json(
        { error: "组件不存在或无权访问" },
        { status: 404 }
      );
    }

    // 删除组件
    await prisma.component.delete({
      where: { id: componentId },
    });

    return NextResponse.json({
      success: true,
      message: "组件删除成功",
    });
  } catch (error) {
    console.error("Delete component error:", error);
    return NextResponse.json(
      { error: "删除组件失败" },
      { status: 500 }
    );
  }
}
