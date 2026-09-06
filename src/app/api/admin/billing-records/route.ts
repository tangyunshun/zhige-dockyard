export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/billing-records
 * 超级管理员拉取全平台交易账单与算力充值订单记录
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const roleUpper = (auth.user.role || "").toUpperCase();
    const isAdminUser =
      roleUpper === "ADMIN" ||
      roleUpper === "SUPER_ADMIN" ||
      roleUpper === "PLATFORM_ADMIN";
    if (!isAdminUser) {
      return NextResponse.json(
        { error: "越权警告：仅系统超级管理员可查看交易账单" },
        { status: 403 }
      );
    }

    const model = (prisma as any).billing_record || (prisma as any).billingrecord;
    let records: any[] = [];
    if (model && typeof model.findMany === "function") {
      records = await model
        .findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        })
        .catch((dbErr: any) => {
          console.warn("查询 billing_record 订单表异常，返回空数组:", dbErr);
          return [];
        });
    }

    let enrichedRecords = records;
    if (records.length > 0) {
      const userIds = Array.from(
        new Set(records.map((r: any) => r.userId).filter(Boolean))
      );
      const workspaceIds = Array.from(
        new Set(records.map((r: any) => r.workspaceId).filter(Boolean))
      );

      const [users, workspaces] = await Promise.all([
        userIds.length > 0
          ? prisma.user
              .findMany({
                where: { id: { in: userIds } },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  membershipLevel: true,
                  phone: true,
                  createdAt: true,
                },
              })
              .catch((err) => {
                console.warn("查询关联用户信息异常:", err);
                return [];
              })
          : Promise.resolve([]),
        workspaceIds.length > 0
          ? prisma.workspace
              .findMany({
                where: { id: { in: workspaceIds } },
                select: {
                  id: true,
                  name: true,
                  type: true,
                  logo: true,
                  plan: true,
                },
              })
              .catch((err) => {
                console.warn("查询关联空间信息异常:", err);
                return [];
              })
          : Promise.resolve([]),
      ]);

      const userMap = new Map((users as any[]).map((u) => [u.id, u]));
      const workspaceMap = new Map((workspaces as any[]).map((w) => [w.id, w]));

      enrichedRecords = records.map((r: any) => ({
        ...r,
        user: userMap.get(r.userId) || null,
        workspace: r.workspaceId
          ? workspaceMap.get(r.workspaceId) || null
          : null,
      }));
    }

    return NextResponse.json({ records: enrichedRecords || [] });
  } catch (error: any) {
    console.error("获取全平台交易订单失败:", error);
    return NextResponse.json(
      { error: error?.message || "服务器内部错误" },
      { status: 500 }
    );
  }
}
