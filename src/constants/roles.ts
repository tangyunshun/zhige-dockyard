﻿﻿﻿﻿﻿/**
 * 角色权限定义 (RBAC 权限管理)
 * 定义平台级、企业级、项目级和个人级角色
 */

/**
 * 平台级角色 Platform Level
 */
export enum PlatformRole {
  /** 平台超级管理员拥有最高权限 */
  PLATFORM_SUPER_ADMIN = "PLATFORM_SUPER_ADMIN",
  /** 运维管理员负责系统维护 */
  OPS_ADMIN = "OPS_ADMIN",
  /** 财务管理员负责账单管理 */
  BILLING_ADMIN = "BILLING_ADMIN",
}

/**
 * 企业级角色 Enterprise Level
 */
export enum EnterpriseRole {
  /** 企业所有者拥有企业空间最高权限 */
  WORKSPACE_OWNER = "WORKSPACE_OWNER",
  /** 企业管理员协助管理企业空间 */
  WORKSPACE_ADMIN = "WORKSPACE_ADMIN",
  /** 企业成员普通用户 */
  MEMBER = "MEMBER",
  /** 财务角色负责企业账单管理 */
  FINANCIAL_ROLE = "FINANCIAL_ROLE",
}

/**
 * 项目级角色 Project Level
 * 项目级别的权限控制
 */
export enum ProjectRole {
  /** 项目经理 Project Lead */
  PROJECT_MANAGER = "PROJECT_MANAGER",
  /** 编辑者可以编辑内容 */
  EDITOR = "EDITOR",
  /** 查看者只能查看 */
  VIEWER = "VIEWER",
}

/**
 * 个人级角色 Personal Level
 * 个人空间的权限
 */
export enum PersonalRole {
  /** 个人空间所有者 */
  PERSONAL_OWNER = "PERSONAL_OWNER",
}

/**
 * 岗位类型 Post Type
 * 企业空间中的岗位角色
 */
export enum PostType {
  /** 销售专家 */
  SALES_EXPERT = "SALES_EXPERT",
  /** 质量管理 */
  QA_MANAGER = "QA_MANAGER",
  /** 技术主管 */
  TECH_LEAD = "TECH_LEAD",
  /** 产品经理 */
  PRODUCT_MANAGER = "PRODUCT_MANAGER",
  /** 运维工程师 */
  DEVOPS_ENGINEER = "DEVOPS_ENGINEER",
  /** 安全专家 */
  SECURITY_EXPERT = "SECURITY_EXPERT",
  /** 自定义 */
  CUSTOM = "CUSTOM",
}

/**
 * 工作空间类型
 */
export enum WorkspaceType {
  /** 个人空间 */
  PERSONAL = "PERSONAL",
  /** 企业空间 */
  ENTERPRISE = "ENTERPRISE",
}

/**
 * 会员等级
 */
export enum MembershipLevel {
  /** 免费版 */
  FREE = "FREE",
  /** 专业版 */
  PRO = "PRO",
  /** 企业版 */
  ENTERPRISE = "ENTERPRISE",
}

/**
 * 会员等级配额限制
 */
export const MEMBERSHIP_QUOTAS: Record<
  MembershipLevel,
  {
    enterpriseSlots: number;
    maxTeamSize: number;
    maxStorage: number; // bytes
    maxApiCalls: number;
    tokenBalance: number;
  }
> = {
  [MembershipLevel.FREE]: {
    enterpriseSlots: 1,
    maxTeamSize: 5,
    maxStorage: 1 * 1024 * 1024 * 1024, // 1GB
    maxApiCalls: 1000,
    tokenBalance: 10000,
  },
  [MembershipLevel.PRO]: {
    enterpriseSlots: 3,
    maxTeamSize: 20,
    maxStorage: 50 * 1024 * 1024 * 1024, // 50GB
    maxApiCalls: 50000,
    tokenBalance: 100000,
  },
  [MembershipLevel.ENTERPRISE]: {
    enterpriseSlots: 10,
    maxTeamSize: 100,
    maxStorage: 500 * 1024 * 1024 * 1024, // 500GB
    maxApiCalls: 500000,
    tokenBalance: 1000000,
  },
};

/**
 * 权限操作类型
 */
export enum PermissionAction {
  /** 查看 */
  VIEW = "view",
  /** 编辑 */
  EDIT = "edit",
  /** 删除 */
  DELETE = "delete",
  /** 执行 */
  EXECUTE = "execute",
  /** 授权 */
  GRANT = "grant",
}

/**
 * 资源类型
 */
export enum ResourceType {
  /** 组件 */
  COMPONENT = "component",
  /** 项目 */
  PROJECT = "project",
  /** 文档 */
  DOCUMENT = "document",
  /** 工作空间 */
  WORKSPACE = "workspace",
  /** 岗位 */
  POST = "post",
  /** 成员 */
  MEMBER = "member",
}

/**
 * 生成 Permission Token
 */
export function generatePermissionToken(
  resourceType: ResourceType,
  resourceId: string,
  action: PermissionAction,
): string {
  return `${resourceType}:${resourceId}:${action}`;
}

/**
 * 解析 Permission Token
 */
export function parsePermissionToken(token: string): {
  resourceType: ResourceType;
  resourceId: string;
  action: PermissionAction;
} | null {
  const parts = token.split(":");
  if (parts.length !== 3) return null;

  const [resourceType, resourceId, action] = parts;
  if (!Object.values(ResourceType).includes(resourceType as ResourceType))
    return null;
  if (!Object.values(PermissionAction).includes(action as PermissionAction))
    return null;

  return {
    resourceType: resourceType as ResourceType,
    resourceId,
    action: action as PermissionAction,
  };
}

/**
 * 获取角色默认权限
 */
export function getRoleDefaultPermissions(role: string): string[] {
  switch (role) {
    // 平台级角色
    case PlatformRole.PLATFORM_SUPER_ADMIN:
      return ["*"]; // 所有权限
    case PlatformRole.OPS_ADMIN:
      return ["component:*", "workspace:read", "user:read"];
    case PlatformRole.BILLING_ADMIN:
      return ["billing:*", "workspace:read", "user:read"];

    // 企业级角色
    case EnterpriseRole.WORKSPACE_OWNER:
      return ["workspace:*", "post:*", "member:*", "project:*"];
    case EnterpriseRole.WORKSPACE_ADMIN:
      return ["post:*", "member:read", "project:*"];
    case EnterpriseRole.MEMBER:
      return ["component:execute", "project:read"];
    case EnterpriseRole.FINANCIAL_ROLE:
      return ["billing:read"];

    // 项目级角色
    case ProjectRole.PROJECT_MANAGER:
      return ["project:*", "component:*"];
    case ProjectRole.EDITOR:
      return ["project:edit", "component:execute"];
    case ProjectRole.VIEWER:
      return ["project:read"];

    // 个人级角色
    case PersonalRole.PERSONAL_OWNER:
      return ["workspace:*", "component:*"];

    default:
      return [];
  }
}

/**
 * 检查是否有权限
 */
export function hasPermission(
  role: string,
  resourceType: ResourceType,
  action: PermissionAction,
  resourceId?: string,
): boolean {
  const permissions = getRoleDefaultPermissions(role);

  // 如果有通配符权限
  if (permissions.includes("*")) return true;
  if (permissions.includes(`${resourceType}:*`)) return true;

  // 如果有具体权限
  const token = generatePermissionToken(
    resourceType,
    resourceId || "*",
    action,
  );
  return (
    permissions.includes(token) ||
    permissions.includes(`${resourceType}:${action}`) ||
    permissions.includes(`${resourceType}:*`)
  );
}

/**
 * 岗位权限模板
 * 定义不同岗位可以使用的组件 ID
 */
export const POST_PERMISSION_TEMPLATES: Record<
  PostType,
  Record<string, boolean>
> = {
  [PostType.SALES_EXPERT]: {
    C01: true,
    C02: true,
    C03: true,
    C04: true,
    C05: true,
    C06: true,
  },
  [PostType.QA_MANAGER]: {
    C26: true,
    C27: true,
    C28: true,
    C29: true,
    C30: true,
  },
  [PostType.TECH_LEAD]: {
    C10: true,
    C11: true,
    C12: true,
    C13: true,
    C14: true,
    C15: true,
    C16: true,
  },
  [PostType.PRODUCT_MANAGER]: {
    C07: true,
    C08: true,
    C09: true,
    C41: true,
    C42: true,
    C43: true,
  },
  [PostType.DEVOPS_ENGINEER]: {
    C31: true,
    C32: true,
    C33: true,
    C34: true,
    C35: true,
  },
  [PostType.SECURITY_EXPERT]: {
    C36: true,
    C37: true,
    C38: true,
    C39: true,
    C40: true,
  },
  [PostType.CUSTOM]: {},
};

/**
 * 升级路径枚举
 */
export enum UpgradePath {
  /** 迁移模式保留原企业空间 */
  MIGRATE = "MIGRATE",
  /** 并行模式创建新的企业空间 */
  PARALLEL = "PARALLEL",
  /** 替换模式删除原企业空间 */
  REPLACE = "REPLACE",
}
