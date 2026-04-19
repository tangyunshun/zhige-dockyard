/**
 * 工作空间相关类型定义
 */

/**
 * 工作空间类型枚举
 */
export enum WorkspaceType {
  /** 个人空间 */
  PERSONAL = 'PERSONAL',
  /** 企业空间 */
  ENTERPRISE = 'ENTERPRISE',
}

/**
 * 工作空间角色枚举
 */
export enum WorkspaceRole {
  /** 所有者 */
  OWNER = 'OWNER',
  /** 管理员 */
  ADMIN = 'ADMIN',
  /** 普通成员 */
  MEMBER = 'MEMBER',
}

/**
 * 工作空间接口
 */
export interface Workspace {
  /** 空间 ID */
  id: string;
  /** 空间名称 */
  name: string;
  /** 空间类型 */
  type: WorkspaceType;
  /** 所有者 ID */
  ownerId: string;
  /** 空间描述（可选） */
  description?: string | null;
  /** 空间 Logo（可选） */
  logo?: string | null;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 工作空间成员接口
 */
export interface WorkspaceMember {
  /** 成员记录 ID */
  id: string;
  /** 用户 ID */
  userId: string;
  /** 空间 ID */
  workspaceId: string;
  /** 成员角色 */
  role: WorkspaceRole;
  /** 加入时间 */
  joinedAt: Date;
  /** 关联的工作空间 */
  workspace: Workspace;
}

/**
 * 创建工作空间请求参数
 */
export interface CreateWorkspaceRequest {
  /** 空间名称 */
  name: string;
  /** 空间类型 */
  type: WorkspaceType;
  /** 空间描述（可选） */
  description?: string;
}

/**
 * 切换工作空间请求参数
 */
export interface SwitchWorkspaceRequest {
  /** 目标空间 ID */
  workspaceId: string;
}

/**
 * 工作空间列表响应
 */
export interface WorkspaceListResponse {
  /** 工作空间列表 */
  workspaces: WorkspaceMember[];
}

/**
 * 创建工作空间响应
 */
export interface CreateWorkspaceResponse {
  /** 是否成功 */
  success: boolean;
  /** 创建的工作空间 */
  workspace: Workspace;
}
