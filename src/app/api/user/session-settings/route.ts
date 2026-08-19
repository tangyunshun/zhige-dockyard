import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 读取当前用户的会话策略（单设备开关 + 设备上限）
export async function GET(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json(
      { error: auth.error || "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { allowMultiDevice: true, deviceLimit: true },
  });
  return NextResponse.json({
    success: true,
    data: {
      allowMultiDevice: user?.allowMultiDevice ?? true,
      deviceLimit: user?.deviceLimit ?? 3,
    },
  });
}

// 更新单设备开关
export async function PUT(request: NextRequest) {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json(
      { error: auth.error || "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const allowMultiDevice = body.allowMultiDevice === true || body.allowMultiDevice === "true";

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { allowMultiDevice },
  });

  return NextResponse.json({ success: true, data: { allowMultiDevice } });
}
