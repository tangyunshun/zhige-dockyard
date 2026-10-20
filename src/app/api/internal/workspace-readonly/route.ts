import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 仅供全局中间件内部调用：返回某工作空间是否处于「只读」状态（归档 ARCHIVED / 停用 DISABLED）。
 * 故意只暴露布尔值，不返回任何敏感数据；已在 middleware.ts 的 PUBLIC_PREFIXES 中放行（无需鉴权），
 * 避免中间件自身的内部请求被鉴权拦截形成死循环。
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ readonly: false });
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id },
      select: { status: true },
    });
    const readonly = !!ws && (ws.status === "ARCHIVED" || ws.status === "DISABLED");
    return NextResponse.json({ readonly });
  } catch {
    // 查询失败：降级放行（不阻断正常请求），避免状态服务异常时误伤
    return NextResponse.json({ readonly: false });
  }
}
