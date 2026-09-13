import { prisma } from "@/lib/prisma";
import { getAdminPermissions, saveAdminPermissions } from "@/lib/security";

/** 数据库 SystemConfig 键名常量 */
export const PLATFORM_PERMISSION_CATALOG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
export const PLATFORM_PERMISSION_LEVELS_KEY = "PLATFORM_PERMISSION_LEVELS_V1";
export const PLATFORM_PERMISSION_RULES_KEY = "PLATFORM_PERMISSION_RULES_V1";
export const PLATFORM_MODULE_REGISTRY_KEY = "PLATFORM_MODULE_REGISTRY_V1";

/** 权限项结构 */
export interface PermissionKeyItem {
  key: string;
  label: string;
  desc: string;
  moduleName: string;
  level: string;
}

/** 权限分组（模块）结构 */
export interface PermissionGroupItem {
  group: string;
  moduleRoute: string;
  description: string;
  keys: PermissionKeyItem[];
}

/** 风险等级字典项 */
export interface PermissionLevelItem {
  value: string;
  label: string;
  desc: string;
}

/** 动作规则模板：定义每种标准动作如何自动派生出权限项、文案与风险等级（存储在数据库中） */
export interface ActionRuleTemplate {
  action: string;
  labelSuffix: string;
  descTemplate: string;
  defaultLevel: string;
}

/** 扩展性规则配置对象（存储在数据库中） */
export interface PlatformPermissionRulesConfig {
  version: string;
  autoGrantToSuperAdmin: boolean;
  autoGrantNewFeatureActionsToActiveAdmins: string[]; // 新功能上线时自动赋给普通管理员的标准动作（如 ["read"]）
  actionRules: ActionRuleTemplate[];
}

/** 系统功能模块注册元数据（存储在数据库中） */
export interface PlatformFeatureModuleItem {
  id: string;
  name: string;
  route: string;
  resourceKey: string;
  description: string;
  supportedActions: string[];
  isSystemCore?: boolean;
}

/** 数据库冷启动默认风险等级字典 */
export const DEFAULT_PERMISSION_LEVELS: PermissionLevelItem[] = [
  { value: "read", label: "只读", desc: "仅可查看数据，不产生任何写入或状态变更" },
  { value: "normal", label: "常规", desc: "日常业务操作，风险可控" },
  { value: "sensitive", label: "敏感", desc: "涉及用户资料或业务配置变更，需谨慎授予" },
  { value: "high", label: "高危", desc: "涉及资金、权限与全站配置，仅限核心管理员" },
];

/** 数据库冷启动默认动作规则模板 */
export const DEFAULT_PERMISSION_RULES: PlatformPermissionRulesConfig = {
  version: "1.0",
  autoGrantToSuperAdmin: true,
  autoGrantNewFeatureActionsToActiveAdmins: ["read"], // 默认新功能只读权限赋予活跃管理员，确保管理员可直接查看新功能
  actionRules: [
    {
      action: "read",
      labelSuffix: "查阅列表与详情",
      descTemplate: "查看{moduleName}相关信息、列表与基础详情（只读访问）",
      defaultLevel: "read",
    },
    {
      action: "create",
      labelSuffix: "新增与录入",
      descTemplate: "在系统中新建或录入{moduleName}相关的条目与资源",
      defaultLevel: "normal",
    },
    {
      action: "update",
      labelSuffix: "编辑与修改",
      descTemplate: "调整或更新{moduleName}的核心数据、状态及业务配置",
      defaultLevel: "sensitive",
    },
    {
      action: "delete",
      labelSuffix: "废弃与删除",
      descTemplate: "从系统中彻底移除或废弃{moduleName}相关数据条目（高危操作）",
      defaultLevel: "high",
    },
    {
      action: "status_update",
      labelSuffix: "启停与状态流转",
      descTemplate: "切换{moduleName}的启用/禁用状态或推进业务审核流转",
      defaultLevel: "sensitive",
    },
    {
      action: "export",
      labelSuffix: "导出数据报表",
      descTemplate: "将{moduleName}的业务数据与统计指标导出为离线表格",
      defaultLevel: "normal",
    },
    {
      action: "audit",
      labelSuffix: "审核与决策裁决",
      descTemplate: "审查{moduleName}相关的申报材料并执行通过或驳回",
      defaultLevel: "sensitive",
    },
    {
      action: "manage",
      labelSuffix: "高级综合管控",
      descTemplate: "执行{moduleName}全域核心参数与安全策略的深度管理",
      defaultLevel: "high",
    },
  ],
};

/** 平台核心内置模块注册种子（冷启动时写入数据库，之后完全由数据库驱动） */
export const DEFAULT_FEATURE_MODULES: PlatformFeatureModuleItem[] = [
  {
    id: "users",
    name: "用户管理模块",
    route: "/admin/users",
    resourceKey: "user",
    description: "全站注册用户基本信息、联系方式、封禁解封与会话下线管理",
    supportedActions: ["read", "update", "delete", "status_update"],
    isSystemCore: true,
  },
  {
    id: "account-appeals",
    name: "风控与审核模块",
    route: "/admin/account-appeals",
    resourceKey: "appeal",
    description: "账号解封申诉工单审核、违规处理仲裁与平台安全防刷设置",
    supportedActions: ["read", "audit", "manage"],
    isSystemCore: true,
  },
  {
    id: "workspaces",
    name: "工作空间管理模块",
    route: "/admin/workspaces",
    resourceKey: "workspace",
    description: "企业团队工作空间查阅、空间状态管控、成员规模与资源配额调整",
    supportedActions: ["read", "status_update", "manage"],
    isSystemCore: true,
  },
  {
    id: "workspace-plans",
    name: "空间套餐管理模块",
    route: "/admin/workspace/plans",
    resourceKey: "workspace_plan",
    description: "企业空间套餐价格策略制定、套餐权益配置与上架停售管理",
    supportedActions: ["read", "create", "update", "status_update"],
    isSystemCore: true,
  },
  {
    id: "posts",
    name: "岗位管理模块",
    route: "/admin/posts",
    resourceKey: "post",
    description: "平台官方标准岗位库维护、启用分发控制与企业空间一键导入",
    supportedActions: ["read", "create", "update", "delete", "status_update"],
    isSystemCore: true,
  },
  {
    id: "components",
    name: "组件管理模块",
    route: "/admin/components",
    resourceKey: "component",
    description: "全链路功能组件目录管理、参数配置、上架发布与调用审计",
    supportedActions: ["read", "create", "update", "delete", "status_update"],
    isSystemCore: true,
  },
  {
    id: "membership",
    name: "会员套餐管理模块",
    route: "/admin/membership",
    resourceKey: "membership",
    description: "个人会员等级特权配置、月度赠送算力与会员计费策略",
    supportedActions: ["read", "create", "update"],
    isSystemCore: true,
  },
  {
    id: "token-packs",
    name: "算力加油包管理模块",
    route: "/admin/membership/token-packs",
    resourceKey: "token_pack",
    description: "算力加油包面值与售价管理、促销折扣与前台上架控制",
    supportedActions: ["read", "manage", "status_update"],
    isSystemCore: true,
  },
  {
    id: "orders",
    name: "订单管理模块",
    route: "/admin/orders",
    resourceKey: "order",
    description: "全网支付流水核验、支付渠道凭证、退款申请与财务对账",
    supportedActions: ["read", "audit", "manage"],
    isSystemCore: true,
  },
  {
    id: "content",
    name: "内容管理模块",
    route: "/admin/content",
    resourceKey: "content",
    description: "研发全周期阶段大纲编制、步骤标准优化与前台发布指引",
    supportedActions: ["read", "create", "update"],
    isSystemCore: true,
  },
  {
    id: "documents",
    name: "文档管理模块",
    route: "/admin/documents",
    resourceKey: "document",
    description: "平台使用手册、帮助中心与开发者指南文章维护",
    supportedActions: ["read", "create", "update", "delete"],
    isSystemCore: true,
  },
  {
    id: "notifications",
    name: "通知公告模块",
    route: "/admin/notifications",
    resourceKey: "announcement",
    description: "全站系统广播发布、运维维护通知与分组定向下发",
    supportedActions: ["read", "create", "update", "delete"],
    isSystemCore: true,
  },
  {
    id: "operation-logs",
    name: "审计日志模块",
    route: "/admin/operation-logs",
    resourceKey: "audit_log",
    description: "全站管理员高危操作审计追踪与接口行为追溯",
    supportedActions: ["read", "export"],
    isSystemCore: true,
  },
  {
    id: "settings",
    name: "系统设置模块",
    route: "/admin/settings",
    resourceKey: "system",
    description: "全局系统参数配置、第三方接口密钥设置与停机维护模式控制",
    supportedActions: ["read", "update", "manage"],
    isSystemCore: true,
  },
  {
    id: "administrators",
    name: "管理员管理模块",
    route: "/admin/administrators",
    resourceKey: "admin",
    description: "平台运维管理员名单查看、委派新管理员与管理员账号管理",
    supportedActions: ["read", "create", "update", "delete"],
    isSystemCore: true,
  },
  {
    id: "permissions",
    name: "权限配置模块",
    route: "/admin/permissions",
    resourceKey: "permission",
    description: "管理员功能权限分配、新功能自适应扩展与动态规则同步",
    supportedActions: ["read", "manage"],
    isSystemCore: true,
  },
];

/** 从数据库读取规则配置 */
export async function getPermissionRulesFromDB(): Promise<PlatformPermissionRulesConfig> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: PLATFORM_PERMISSION_RULES_KEY },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (parsed && Array.isArray(parsed.actionRules)) {
        return parsed;
      }
    }
    // 冷启动写入数据库
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_PERMISSION_RULES_KEY },
      create: {
        key: PLATFORM_PERMISSION_RULES_KEY,
        value: JSON.stringify(DEFAULT_PERMISSION_RULES),
      },
      update: {
        value: JSON.stringify(DEFAULT_PERMISSION_RULES),
      },
    });
    return DEFAULT_PERMISSION_RULES;
  } catch (err) {
    console.error("从数据库读取权限规则失败:", err);
    return DEFAULT_PERMISSION_RULES;
  }
}

/** 保存规则配置到数据库 */
export async function savePermissionRulesToDB(
  rules: PlatformPermissionRulesConfig
): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_PERMISSION_RULES_KEY },
      create: {
        key: PLATFORM_PERMISSION_RULES_KEY,
        value: JSON.stringify(rules),
      },
      update: {
        value: JSON.stringify(rules),
      },
    });
    return true;
  } catch (err) {
    console.error("保存权限规则到数据库失败:", err);
    return false;
  }
}

/** 从数据库读取功能模块注册表 */
export async function getFeatureModulesFromDB(): Promise<PlatformFeatureModuleItem[]> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: PLATFORM_MODULE_REGISTRY_KEY },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    // 冷启动写入数据库
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_MODULE_REGISTRY_KEY },
      create: {
        key: PLATFORM_MODULE_REGISTRY_KEY,
        value: JSON.stringify(DEFAULT_FEATURE_MODULES),
      },
      update: {
        value: JSON.stringify(DEFAULT_FEATURE_MODULES),
      },
    });
    return DEFAULT_FEATURE_MODULES;
  } catch (err) {
    console.error("从数据库读取功能模块注册表失败:", err);
    return DEFAULT_FEATURE_MODULES;
  }
}

/** 保存功能模块注册表到数据库 */
export async function saveFeatureModulesToDB(
  modules: PlatformFeatureModuleItem[]
): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_MODULE_REGISTRY_KEY },
      create: {
        key: PLATFORM_MODULE_REGISTRY_KEY,
        value: JSON.stringify(modules),
      },
      update: {
        value: JSON.stringify(modules),
      },
    });
    return true;
  } catch (err) {
    console.error("保存功能模块注册表到数据库失败:", err);
    return false;
  }
}

/**
 * 纯数据库数据驱动：根据数据库规则模板，为一个模块派生生成对应的全部权限项
 */
export function derivePermissionsByModuleAndRules(
  moduleItem: PlatformFeatureModuleItem,
  rulesConfig: PlatformPermissionRulesConfig
): PermissionKeyItem[] {
  const ruleMap = new Map<string, ActionRuleTemplate>();
  rulesConfig.actionRules.forEach((r) => ruleMap.set(r.action, r));

  const cleanModuleName = moduleItem.name.replace(/模块|\(.*?\)|（.*?）/g, "").trim();

  return moduleItem.supportedActions.map((act) => {
    const rule = ruleMap.get(act);
    const key = `${moduleItem.resourceKey}:${act}`;
    const label = rule
      ? `${cleanModuleName} - ${rule.labelSuffix}`
      : `${cleanModuleName} - ${act}`;
    const desc = rule
      ? rule.descTemplate.replace(/{moduleName}/g, cleanModuleName)
      : `执行 ${cleanModuleName} 的 ${act} 操作`;
    const level = rule ? rule.defaultLevel : "normal";

    return {
      key,
      label,
      desc,
      moduleName: cleanModuleName,
      level,
    };
  });
}

/**
 * 纯数据库数据驱动：自动对比数据库模块注册表与当前权限目录，无损增量自愈补齐缺失的新功能权限项
 * 绝不覆盖管理员已有的自定义权限，也绝不删除任何现有配置。
 */
export async function autoHealPermissionsByDBRules(
  currentCatalog: PermissionGroupItem[]
): Promise<{
  healedCatalog: PermissionGroupItem[];
  addedModulesCount: number;
  addedKeysCount: number;
  newlyDiscoveredKeys: string[];
}> {
  const modules = await getFeatureModulesFromDB();
  const rules = await getPermissionRulesFromDB();

  const healedCatalog: PermissionGroupItem[] = [...currentCatalog];
  let addedModulesCount = 0;
  let addedKeysCount = 0;
  const newlyDiscoveredKeys: string[] = [];

  // 构建已存在的 Key 集合
  const existingKeySet = new Set<string>();
  currentCatalog.forEach((g) => {
    g.keys.forEach((k) => existingKeySet.add(k.key));
  });

  for (const mod of modules) {
    const derivedKeys = derivePermissionsByModuleAndRules(mod, rules);
    const targetGroupTitle = `${mod.name} (${mod.resourceKey.toUpperCase()})`;

    // 查找该模块是否在 catalog 中存在（通过 group 名或 moduleRoute 匹配）
    let targetGroup = healedCatalog.find(
      (g) => g.group === targetGroupTitle || g.moduleRoute === mod.route
    );

    if (!targetGroup) {
      // 模块完全是新发现的：新建分组并填入派生权限
      targetGroup = {
        group: targetGroupTitle,
        moduleRoute: mod.route,
        description: mod.description,
        keys: [],
      };
      healedCatalog.push(targetGroup);
      addedModulesCount += 1;
    }

    // 检查该模块下是否有新派生的权限点未被纳入
    for (const keyItem of derivedKeys) {
      if (!existingKeySet.has(keyItem.key)) {
        targetGroup.keys.push(keyItem);
        existingKeySet.add(keyItem.key);
        addedKeysCount += 1;
        newlyDiscoveredKeys.push(keyItem.key);
      }
    }
  }

  return {
    healedCatalog,
    addedModulesCount,
    addedKeysCount,
    newlyDiscoveredKeys,
  };
}

/**
 * 纯数据库数据驱动：新功能上线自动赋权规则执行
 * 根据数据库中 rules.autoGrantNewFeatureActionsToActiveAdmins 的策略，为所有活跃管理员增量补齐权限
 */
export async function autoGrantNewFeatureRulesToAdmins(
  newKeys: string[],
  rulesConfig: PlatformPermissionRulesConfig
): Promise<number> {
  if (newKeys.length === 0) return 0;

  const allowedActions = new Set(rulesConfig.autoGrantNewFeatureActionsToActiveAdmins || ["read"]);
  const keysToGrant = newKeys.filter((k) => {
    const action = k.split(":")[1];
    return action && allowedActions.has(action);
  });

  if (keysToGrant.length === 0) return 0;

  try {
    const activeAdmins = await prisma.user.findMany({
      where: {
        role: { in: ["admin", "PLATFORM_ADMIN"] },
      },
      select: { id: true },
    });

    let updatedCount = 0;
    for (const admin of activeAdmins) {
      const perms = await getAdminPermissions(admin.id);
      const toAdd = keysToGrant.filter((k) => !perms.includes(k));
      if (toAdd.length > 0) {
        await saveAdminPermissions(admin.id, [...perms, ...toAdd]);
        updatedCount += 1;
      }
    }
    return updatedCount;
  } catch (err) {
    console.error("执行新功能规则自动赋权失败:", err);
    return 0;
  }
}
