/**
 * Workspace Hub 相关类型定义
 */

import { ComponentDefinition } from '@/constants/components';
import { WorkspaceType, EnterpriseRole } from '@/constants/roles';

/**
 * 工作空间配额统计
 */
export interface WorkspaceQuota {
  id: string;
  workspaceId: string;
  membershipLevelId: string;
  enterpriseSlots: number;
  usedSlots: number;
  availableSlots: number;
  tokenBalance: number;
  storageUsed: number;
  storageLimit: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
  resetAt?: Date;
}

/**
 * 企业岗位
 */
export interface WorkspacePost {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isSystem: boolean;
  createdBy: string;
  members?: PostMember[];
  permissions?: ComponentPermission[];
}

/**
 * 企业岗位成员
 */
export interface PostMember {
  id: string;
  userId: string;
  postId: string;
  workspaceId: string;
  assignedAt: Date;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
}

/**
 * 组件权限
 */
export interface ComponentPermission {
  id: string;
  postId: string;
  componentId: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExecute: boolean;
}

/**
 * 工作空间统计数据
 */
export interface WorkspaceStats {
  totalProjects: number;
  totalDocuments: number;
  totalDiagrams: number;
  tokenBalance: number;
  storageUsed: number;
  storageLimit: number;
  storagePercentage: number;
}

/**
 * 用户跨空间统计数据
 */
export interface UserAggregatedStats {
  totalProjects: number;
  totalDocuments: number;
  totalDiagrams: number;
  totalTokenBalance: number;
  totalStorageUsed: number;
  totalStorageLimit: number;
}

/**
 * 升级路径枚举
 */
export type UpgradePath = 'MIGRATE' | 'PARALLEL' | 'REPLACE';

/**
 * 升级决策请求
 */
export interface UpgradeDecisionRequest {
  personalWorkspaceId: string;
  upgradePath: UpgradePath;
  newEnterpriseName?: string;
}

/**
 * 工作空间卡片配置
 */
export interface WorkspaceCardConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  action: () => void;
  disabled?: boolean;
  badge?: string;
}

/**
 * 组件显示
 */
export interface ComponentDisplay {
  component: ComponentDefinition;
  isAccessible: boolean;
  permissionToken?: string;
}

/**
 * 岗位权限矩阵
 */
export interface PermissionMatrixData {
  posts: WorkspacePost[];
  components: ComponentDefinition[];
  permissions: Record<string, Record<string, ComponentPermission>>; // postId -> componentId -> permission
}

/**
 * 创建工作空间请求
 */
export interface CreateWorkspaceRequest {
  name: string;
  type: WorkspaceType;
  description?: string;
  industry?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * 创建岗位请求
 */
export interface CreatePostRequest {
  workspaceId: string;
  name: string;
  description?: string;
  color?: string;
  templatePermissions?: Record<string, boolean>;
}

/**
 * 更新岗位权限请求
 */
export interface UpdatePostPermissionsRequest {
  postId: string;
  permissions: Array<{
    componentId: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canExecute: boolean;
  }>;
}

/**
 * 邀请成员请求
 */
export interface InviteMemberRequest {
  workspaceId: string;
  email: string;
  role: EnterpriseRole;
  postId?: string;
}

/**
 * 加入工作空间请求
 */
export interface JoinWorkspaceRequest {
  inviteCode: string;
}
