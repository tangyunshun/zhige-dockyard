"use client";

import { ReactNode } from "react";
import { useComponentPermissions } from "@/hooks/useComponentPermissions";
import { ComponentPermission } from "@/types/workspace-hub";

interface PermissionGuardProps {
  children: ReactNode;
  componentId: string;
  requiredAction?: keyof ComponentPermission;
  workspaceId?: string;
  postId?: string;
  fallback?: ReactNode;
}

/**
 * 权限守卫组件
 * 用于包装需要权限控制的功能模块
 */
export default function PermissionGuard({
  children,
  componentId,
  requiredAction = "canView",
  workspaceId,
  postId,
  fallback = null,
}: PermissionGuardProps) {
  const { hasPermission, loading } = useComponentPermissions(workspaceId || null, postId || null);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission(componentId, requiredAction)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * 权限守卫 Hook 版本
 * 用于在组件内部进行权限判断
 */
export function usePermissionGuard(
  componentId: string,
  requiredAction?: keyof ComponentPermission,
  workspaceId?: string | null,
  postId?: string | null
) {
  const { hasPermission, loading } = useComponentPermissions(workspaceId ?? null, postId ?? null);

  return {
    hasAccess: hasPermission(componentId, requiredAction ?? "canView"),
    loading,
  };
}
