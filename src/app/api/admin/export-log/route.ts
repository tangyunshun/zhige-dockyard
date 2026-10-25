import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminRole, isAdminRole } from "@/lib/role-utils";

/**
 * 管理员端导出留痕：校验登录态（仅管理员/超管）后写入操作审计日志。
 * 仅记录「谁导出了什么」，不做导出权限二次校验（权限门控在前端按钮与数据接口）。
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const { valid, user } = await validateUser(authHeader, request);
    if (!valid || !user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!isSuperAdminRole(user.role) && !isAdminRole(user.role)) {
      return NextResponse.json({ error: "仅管理员可记录导出审计" }, { status: 403 });
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
        } as any,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("导出留痕写入失败:", e);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
