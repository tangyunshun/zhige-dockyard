import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { validateAdmin } from "@/lib/auth-admin";
import { getFeatureModulesFromDB } from "@/lib/permission-rules-engine";
import { getAdminPermissions } from "@/lib/security";

export const dynamic = "force-dynamic";

const SUPER_ROLES = ["SUPER_ADMIN", "SUPERADMIN", "SUPER_ADMIN_ROLE", "SUPER"];

/**
 * 后台「动态菜单」：把后台注册的功能模块（PLATFORM_MODULE_REGISTRY_V1）自动变成侧边栏菜单项。
 *
 * 设计要点（保证「前端注册模块即出现在菜单里，无需改代码」）：
 *  1. href 直接取模块注册的 route；
 *  2. 通过 requiredPermission = `${resourceKey}:read` 与当前管理员的权限包比对，自动显隐；
 *  3. 校验对应页面文件是否真实存在 —— 不存在则不返回，避免点进去 404；
 *  4. 与硬编码菜单重复的 href 由前端负责去重（硬编码项保留更精细的图标与排序）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateAdmin(request);
    if (!auth.valid || !auth.user || !auth.isAdmin) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const role = String(auth.user.role || "").toUpperCase().trim();
    const isSuper = SUPER_ROLES.includes(role);
    const permissions = isSuper ? [] : await getAdminPermissions(auth.user.id);

    const modules = await getFeatureModulesFromDB();
    const items: {
      id: string;
      label: string;
      href: string;
      description: string;
      requiredPermission: string;
    }[] = [];

    for (const m of modules ?? []) {
      const href = String(m?.route ?? "").trim();
      if (!href.startsWith("/admin")) continue;
      if (!isBackendPageExists(href)) continue;

      const requiredPermission = `${m?.resourceKey ?? ""}:read`;
      if (!requiredPermission.startsWith(":")) {
        if (!isSuper && !permissions.includes(requiredPermission)) continue;
      }

      items.push({
        id: String(m?.id ?? href),
        label: String(m?.name ?? href),
        href,
        description: String(m?.description ?? ""),
        requiredPermission,
      });
    }

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("Get admin nav modules error:", error);
    // 菜单获取失败不应阻断后台渲染：返回空列表由前端降级为「仅硬编码菜单」
    return NextResponse.json({ success: true, items: [] });
  }
}

/** 校验后台路由对应的页面文件是否存在（/admin/xxx -> src/app/admin/xxx/page.tsx） */
function isBackendPageExists(route: string): boolean {
  const clean = route.split("?")[0].replace(/^\/+|\/+$/g, "");
  if (!clean.startsWith("admin")) return false;
  const file = path.join(process.cwd(), "src", "app", clean, "page.tsx");
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}
