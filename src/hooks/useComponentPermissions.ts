"use client";

import { useState, useEffect, useCallback } from "react";
import { ComponentPermission } from "@/types/workspace-hub";

interface UseComponentPermissionsReturn {
  permissions: Record<string, ComponentPermission>;
  loading: boolean;
  hasPermission: (componentId: string, action: keyof ComponentPermission) => boolean;
  refreshPermissions: () => Promise<void>;
}

/**
 * 组件权限管理 Hook
 */
export function useComponentPermissions(
  workspaceId: string | null,
  postId: string | null
): UseComponentPermissionsReturn {
  const [permissions, setPermissions] = useState<Record<string, ComponentPermission>>({});
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!workspaceId || !postId) {
      setPermissions({});
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/user/workspace-hub/posts?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("获取权限数据失败");
      }

      const data = await response.json();
      if (data.success) {
        const postPermissions = data.data.permissions[postId] || {};
        setPermissions(postPermissions);
      }
    } catch (err) {
      console.error("获取权限数据失败", err);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  }, [workspaceId, postId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (componentId: string, action: keyof ComponentPermission): boolean => {
      const perm = permissions[componentId];
      if (!perm) return false;
      return perm[action] === true;
    },
    [permissions]
  );

  return {
    permissions,
    loading,
    hasPermission,
    refreshPermissions: fetchPermissions,
  };
}

/**
 * 检查组件访问权限
 */
export function checkComponentAccess(
  componentId: string,
  permissions: Record<string, ComponentPermission>,
  requiredAction: keyof ComponentPermission = "canView"
): boolean {
  const perm = permissions[componentId];
  if (!perm) return false;
  return perm[requiredAction] === true;
}

/**
 * 获取有权限访问的组件列表
 */
export function getAccessibleComponents(
  permissions: Record<string, ComponentPermission>,
  action?: keyof ComponentPermission
): string[] {
  return Object.entries(permissions)
    .filter(([_, perm]) => {
      if (action) {
        return perm[action] === true;
      }
      return perm.canView === true;
    })
    .map(([componentId]) => componentId);
}
