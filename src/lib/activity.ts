import {
  Activity,
  LogIn,
  LogOut,
  Shield,
  Lock,
  Key,
  Users,
  FolderOpen,
  CreditCard,
  Trash2,
  Settings,
  AlertTriangle,
  Server,
  type LucideIcon,
} from "lucide-react";

/**
 * 将 operationlog.action 代码转换为面向用户的中文动作名。
 * 未收录的动作会保留原始代码，避免完全丢失信息。
 */
export function getActionLabel(action: string | null | undefined): string {
  if (!action) return "系统操作";

  const map: Record<string, string> = {
    AUDIT: "安全审计",
    LOGIN: "账号登录",
    "auth:logout": "安全退出",
    SESSION_TIMEOUT_LOGOUT: "会话超时退出",
    SESSION_CONFLICT_LOGOUT: "会话冲突退出",
    DEVICE_KICKED_OFFLINE: "设备被踢下线",
    OAUTH_LOGIN: "第三方登录",
    OAUTH_REGISTER: "第三方注册",
    cross_region_verify: "异地登录验证",
    "Password:Change": "修改登录密码",
    "SecuritySetting:Update": "更新安全设置",
    SECURITY_DIAGNOSIS: "安全诊断",
    ACCOUNT_DELETION_REQUESTED: "申请注销账号",
    CANCEL_ACCOUNT_DELETION: "撤销注销申请",
    "APIKey:Create": "创建 API Key",
    "APIKey:Delete": "删除 API Key",
    "APIKey:Use": "调用开放接口",
    SUBACCOUNT_CREATE: "创建子账号",
    SUBACCOUNT_RESET_PASSWORD: "重置子账号密码",
    SUBACCOUNT_DISABLE: "停用子账号",
    SUBACCOUNT_ENABLE: "启用子账号",
    JOIN_WORKSPACE: "加入工作空间",
    CREATE_ENTERPRISE_WORKSPACE: "创建企业空间",
    UPDATE_MEMBER_ROLE: "更新成员角色",
    WORKSPACE_KICK: "移出空间成员",
    CONFIGURE_SOLUTION: "配置解决方案",
    UPGRADE_WORKSPACE_PLAN: "升级空间套餐",
    UPGRADE_WORKSPACE: "升级工作空间",
    MEMBERSHIP_UPGRADE: "升级会员套餐",
    PING_TEST: "连通性测试",
    "user:delete": "删除用户",
    "component:delete": "删除组件",
    "workspace:delete": "删除工作空间",
    "user:ban": "封禁用户",
    KNOWLEDGE_PUBLISH: "发布知识",
    KNOWLEDGE_SUBMIT: "提交知识",
    KNOWLEDGE_APPROVE: "审核通过",
    KNOWLEDGE_REJECT: "审核驳回",
    BIND_COMPONENT: "绑定组件",
    UNBIND_COMPONENT: "解绑组件",
    ARCHIVE_TASK: "归档任务",
    DELETE_TASK: "删除任务",
    ENABLE_COMPONENT: "启用组件",
    DISABLE_COMPONENT: "停用组件",
    SAVE_CUSTOM_POSITIONS: "保存自定义布局",
    SET_RESTRICTED_COMPONENTS: "设置受限组件",
    REGISTER_NEW_FEATURE_MODULE: "注册功能模块",
    SYNC_RULES_HEALING: "同步规则自愈",
    UPDATE_PERMISSION_RULES_CONFIG: "更新权限规则",
    TOGGLE_ADMIN_STATUS: "切换管理员状态",
    RESTORE_OFFICIAL_PERMISSIONS_IN_DB: "恢复默认权限",
    ADD_CUSTOM_PERMISSION: "新增自定义权限",
    EDIT_CUSTOM_PERMISSION: "编辑自定义权限",
    BATCH_UPDATE_PERMISSION_LEVEL: "批量更新权限等级",
    BATCH_MOVE_PERMISSIONS: "批量移动权限",
    SYNC_ALL_SYSTEM_MODULE_PERMISSIONS: "同步系统模块权限",
    CONFIGURE_ADMIN_PERMISSIONS: "配置管理员权限",
    DELETE_PERMISSIONS_FROM_DB: "删除权限",
  };

  return map[action] || action;
}

/**
 * 为不同动作分配语义化颜色（用于小标签/徽章）。
 */
export function getActionColor(action: string | null | undefined): string {
  if (!action) return "bg-slate-100 text-slate-600 border-slate-200";

  if (action.startsWith("auth:") || action.includes("LOGIN") || action === "OAUTH_LOGIN" || action === "OAUTH_REGISTER" || action === "cross_region_verify") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (action.includes("LOGOUT") || action.includes("KICKED") || action.includes("DELETE") || action.includes("REJECT") || action.includes("DELETE_") || action === "user:ban") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (action.includes("Password") || action.includes("Security") || action.includes("SECURITY") || action === "ACCOUNT_DELETION_REQUESTED" || action === "CANCEL_ACCOUNT_DELETION") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (action.includes("APIKey") || action.includes("SUBACCOUNT")) {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  if (action.includes("WORKSPACE") || action.includes("MEMBER") || action.includes("JOIN_WORKSPACE") || action.includes("CREATE_ENTERPRISE")) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (action.includes("MEMBERSHIP") || action.includes("UPGRADE") || action.includes("billing")) {
    return "bg-orange-50 text-orange-700 border-orange-200";
  }
  if (action.includes("CONFIGURE") || action.includes("SYNC") || action.includes("UPDATE") || action.includes("REGISTER") || action.includes("RESTORE") || action.includes("BATCH") || action.includes("SET_") || action.includes("SAVE_")) {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  if (action === "AUDIT") {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }

  return "bg-slate-100 text-slate-600 border-slate-200";
}

/**
 * 为动作分配一个合适的 Lucide 图标。
 */
export function getActionIcon(action: string | null | undefined): LucideIcon {
  if (!action) return Activity;

  if (action === "LOGIN" || action === "OAUTH_LOGIN" || action === "OAUTH_REGISTER" || action === "cross_region_verify") return LogIn;
  if (action.startsWith("auth:logout") || action.includes("LOGOUT")) return LogOut;
  if (action.includes("KICKED")) return AlertTriangle;
  if (action.includes("Password") || action.includes("Security") || action.includes("SECURITY")) return Shield;
  if (action.includes("APIKey")) return Key;
  if (action.includes("SUBACCOUNT")) return Users;
  if (action.includes("WORKSPACE") || action.includes("JOIN_WORKSPACE") || action.includes("CREATE_ENTERPRISE")) return FolderOpen;
  if (action.includes("MEMBERSHIP") || action.includes("UPGRADE")) return CreditCard;
  if (action === "ACCOUNT_DELETION_REQUESTED" || action.includes("DELETE") || action.includes("REJECT")) return Trash2;
  if (action.includes("CONFIGURE") || action.includes("SYNC") || action.includes("UPDATE") || action.includes("REGISTER") || action.includes("RESTORE") || action.includes("BATCH") || action.includes("SET_") || action.includes("SAVE_")) return Settings;
  if (action === "PING_TEST" || action.includes("SERVER")) return Server;

  return Activity;
}
