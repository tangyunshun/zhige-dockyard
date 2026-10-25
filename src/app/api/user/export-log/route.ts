import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 用户端导出留痕：校验登录态（本人）后写入操作审计日志。
 * 仅记录「本人导出了什么」，接口本身按登录态过滤（无越权面）。
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const { valid, user } = await validateUser(authHeader, request);
    if (!valid || !user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { exportType, filters, rowCount, page, fileName } = body || {};
    if (!exportType || typeof rowCount !== "number") {
      return NextResponse.json({ error: "参数缺失" }, { status: 400 });
    }

    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: "DATA_EXPORT",
        resource: "export",
        details: {
          exportType,
          filters: filters || null,
          rowCount,
          page: page || null,
          fileName: fileName || null,
          self: true,
        } as any,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("导出留痕写入失败:", e);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
