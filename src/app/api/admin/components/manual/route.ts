import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { DEFAULT_ADMIN_COMPONENT_MANUAL, MANUAL_CONFIG_KEY } from "@/lib/admin-component-manual";

export const dynamic = "force-dynamic";

/**
 * 【管理员专用】《以后新增组件的标准操作手册》读取接口
 *
 * 存储：systemconfig 表 key=admin_component_manual（MediumText JSON）。
 * 首次访问自动落库（内容以 src/lib/admin-component-manual.ts 为单一真源）；
 * 后续如需修改手册内容，更新 systemconfig 中该键即可（或更新默认内容常量后删除该键让其重建）。
 * 刻意不走文档中心（systemdocument）：文档中心面向全平台用户，本手册仅系统管理员可见。
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const row = await prisma.systemconfig.findUnique({
      where: { key: MANUAL_CONFIG_KEY },
      select: { value: true, updatedAt: true },
    });

    if (row?.value) {
      try {
        const manual = JSON.parse(row.value);
        return NextResponse.json({
          success: true,
          data: { manual, source: "systemconfig", updatedAt: row.updatedAt },
        });
      } catch {
        // 配置行损坏时回落默认内容并重建，避免管理员打开即报错
      }
    }

    // 首次访问：落库默认手册（幂等 upsert，多实例并发安全）
    const manual = DEFAULT_ADMIN_COMPONENT_MANUAL;
    await prisma.systemconfig.upsert({
      where: { key: MANUAL_CONFIG_KEY },
      create: { key: MANUAL_CONFIG_KEY, value: JSON.stringify(manual) },
      update: { value: JSON.stringify(manual) },
    });

    return NextResponse.json({
      success: true,
      data: { manual, source: "default_seed", updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error("[admin/components/manual] GET 失败:", (error as Error)?.message);
    return NextResponse.json(
      { success: false, error: "读取组件操作手册失败" },
      { status: 500 },
    );
  }
}
