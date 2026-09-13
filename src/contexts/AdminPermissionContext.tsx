"use client";

import React, { createContext, useContext, useMemo } from "react";
import { UserInfo } from "@/contexts/UserContext";

export interface AdminPermissionContextType {
  user: UserInfo | null;
  permissions: string[];
  isSuperAdmin: boolean;
  hasPermission: (permKey: string) => boolean;
  hasAnyPermission: (permKeys: string[]) => boolean;
  loading: boolean;
}

const AdminPermissionContext = createContext<AdminPermissionContextType>({
  user: null,
  permissions: [],
  isSuperAdmin: false,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  loading: true,
});

interface AdminPermissionProviderProps {
  children: React.ReactNode;
  user: UserInfo | null;
  permissions: string[];
  loading: boolean;
}

export function AdminPermissionProvider({
  children,
  user,
  permissions,
  loading,
}: AdminPermissionProviderProps) {
  const isSuperAdmin = useMemo(() => {
    if (!user?.role) return false;
    const r = user.role.toUpperCase().trim();
    return (
      r === "SUPER_ADMIN" ||
      r === "SUPERADMIN" ||
      r === "SUPER_ADMIN_ROLE" ||
      r === "SUPER"
    );
  }, [user?.role]);

  // 后台特权是否被超级管理员停用（前台不受影响，仅后台权限冻结）
  const isSuspended = useMemo(() => {
    return (user as any)?.adminStatus === "inactive";
  }, [user]);

  const hasPermission = useMemo(() => {
    return (permKey: string): boolean => {
      // 若后台特权已被暂停，即使保留了权限配置也暂不生效
      if (isSuspended) return false;
      // 超级管理员拥有全平台全部特权
      if (isSuperAdmin) return true;
      if (!permKey) return false;
      return permissions.includes(permKey);
    };
  }, [isSuperAdmin, isSuspended, permissions]);

  const hasAnyPermission = useMemo(() => {
    return (permKeys: string[]): boolean => {
      if (isSuspended) return false;
      if (isSuperAdmin) return true;
      if (!Array.isArray(permKeys) || permKeys.length === 0) return false;
      return permKeys.some((k) => permissions.includes(k));
    };
  }, [isSuperAdmin, isSuspended, permissions]);

  const value = useMemo(
    () => ({
      user,
      permissions,
      isSuperAdmin,
      hasPermission,
      hasAnyPermission,
      loading,
    }),
    [user, permissions, isSuperAdmin, hasPermission, hasAnyPermission, loading]
  );

  return (
    <AdminPermissionContext.Provider value={value}>
      {children}
    </AdminPermissionContext.Provider>
  );
}

export function useAdminPermission(): AdminPermissionContextType {
  return useContext(AdminPermissionContext);
}
