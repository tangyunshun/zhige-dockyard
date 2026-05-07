﻿﻿﻿/**
 * PermissionToken 工具函数
 * 用于生成和解析组件权限相关的 Token
 */

import { ComponentPermission } from "@/types/workspace-hub";

/**
 * 生成组件权限 Token
 * 格式：Component:{componentId}:{action}
 */
export function generateComponentPermissionToken(
  componentId: string,
  action: "view" | "edit" | "delete" | "execute"
): string {
  return `component:${componentId}:${action}`;
}

/**
 * 解析组件权限 Token
 */
export function parseComponentPermissionToken(
  token: string
): {
  componentId: string;
  action: "view" | "edit" | "delete" | "execute";
} | null {
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "component") {
    return null;
  }

  const componentId = parts[1];
  const action = parts[2] as "view" | "edit" | "delete" | "execute";

  if (!["view", "edit", "delete", "execute"].includes(action)) {
    return null;
  }

  return { componentId, action };
}

/**
 * 从组件权限对象生成 PermissionToken 列表
 */
export function generatePermissionTokens(
  permissions: Record<string, ComponentPermission>
): string[] {
  const tokens: string[] = [];

  Object.entries(permissions).forEach(([componentId, perm]) => {
    if (perm.canView) {
      tokens.push(generateComponentPermissionToken(componentId, "view"));
    }
    if (perm.canEdit) {
      tokens.push(generateComponentPermissionToken(componentId, "edit"));
    }
    if (perm.canDelete) {
      tokens.push(generateComponentPermissionToken(componentId, "delete"));
    }
    if (perm.canExecute) {
      tokens.push(generateComponentPermissionToken(componentId, "execute"));
    }
  });

  return tokens;
}

/**
 * 检查是否拥有指定的 PermissionToken
 */
export function hasPermissionToken(
  tokens: string[],
  requiredToken: string
): boolean {
  // 检查是否有通配符权限
  if (tokens.includes("*")) {
    return true;
  }

  return tokens.includes(requiredToken);
}

/**
 * 映射权限类型到 Token action
 */
export function mapPermissionTypeToAction(
  permissionType: keyof ComponentPermission
): "view" | "edit" | "delete" | "execute" | null {
  const mapping: Record<keyof ComponentPermission, string> = {
    canView: "view",
    canEdit: "edit",
    canDelete: "delete",
    canExecute: "execute",
  };

  return mapping[permissionType] as "view" | "edit" | "delete" | "execute" || null;
}

/**
 * 检查权限映射
 */
export function checkPermissions(
  permissions: Record<string, ComponentPermission>,
  requiredPermissions: string[]
): boolean {
  const tokens = generatePermissionTokens(permissions);
  return requiredPermissions.every(token => hasPermissionToken(tokens, token));
}
