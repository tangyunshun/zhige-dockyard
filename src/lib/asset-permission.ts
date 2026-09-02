/**
 * 资料级操作权限查询
 *
 * 判定优先级：用户级授权 > 岗位级授权 > 角色级授权 > 空间默认（仅查看 + 评论）
 * 供 /api/studio 的 get_asset_permissions 查询使用（资料页按钮显隐与治理鉴权）。
 */

import { prisma } from "@/lib/prisma";
import { getLogicalWorkspaceRole } from "@/lib/security";

export interface AssetPermissions {
  canView: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canComment: boolean;
  canManageVersion: boolean;
}

/** 空间默认权限：仅查看与评论 */
export const DEFAULT_ASSET_PERMS: AssetPermissions = {
  canView: true,
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canShare: false,
  canComment: true,
  canManageVersion: false,
};

/** 空间管理员 / 所有者：全权限 */
export const FULL_ASSET_PERMS: AssetPermissions = {
  canView: true,
  canUpload: true,
  canEdit: true,
  canDelete: true,
  canShare: true,
  canComment: true,
  canManageVersion: true,
};

function toPerms(rule: {
  canView: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canComment: boolean;
  canManageVersion: boolean;
}): AssetPermissions {
  return {
    canView: rule.canView,
    canUpload: rule.canUpload,
    canEdit: rule.canEdit,
    canDelete: rule.canDelete,
    canShare: rule.canShare,
    canComment: rule.canComment,
    canManageVersion: rule.canManageVersion,
  };
}

/**
 * 计算某成员在某空间的资料操作权限。
 */
export async function getAssetPermissions(userId: string, workspaceId: string): Promise<AssetPermissions> {
  if (!userId || !workspaceId) return { ...DEFAULT_ASSET_PERMS };

  const role = await getLogicalWorkspaceRole(userId, workspaceId);
  // 空间所有者与管理员拥有全部资料权限
  if (role === "OWNER" || role === "ADMIN") return { ...FULL_ASSET_PERMS };

  // 成员所在岗位名称集合（岗位以 workspacepost.name 为标识）
  const posts = await prisma.postmember.findMany({
    where: { userId, workspaceId },
    include: { post: { select: { name: true } } },
  });
  const postNames = new Set(posts.map((p) => p.post?.name).filter(Boolean) as string[]);

  const rules = await prisma.assetpermission.findMany({ where: { workspaceId } });

  // 1) 用户级授权优先
  const userRule = rules.find((r) => r.userId && r.userId === userId);
  if (userRule) return toPerms(userRule);

  // 2) 岗位级授权
  if (postNames.size > 0) {
    const postRule = rules.find((r) => r.positionCode && postNames.has(r.positionCode));
    if (postRule) return toPerms(postRule);
  }

  // 3) 角色级授权
  if (role) {
    const upper = role.toUpperCase();
    const roleRule = rules.find((r) => !r.userId && !r.positionCode && r.roleScope && r.roleScope.toUpperCase() === upper);
    if (roleRule) return toPerms(roleRule);
  }

  return { ...DEFAULT_ASSET_PERMS };
}
