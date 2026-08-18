import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 🚢 知阁·舟坊 - 编译兼容说明：
// 此文件原为旧中间件。由于 Next.js (Turbopack) 编译缓存可能会寻找该位置的模块导出，
// 我们在此导出一个空拦截中间件（matcher 为空数组 []），完全放行所有流量，
// 真正的中间件路由守卫逻辑由 [src/middleware.ts](file:///d:/Project%20Development/ZhiGe-Dockyard/zhige-dockyard-web/src/middleware.ts) 承载。

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
