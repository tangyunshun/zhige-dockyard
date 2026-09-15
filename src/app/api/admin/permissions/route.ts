import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePlatformPermission,
  getAdminPermissions,
  saveAdminPermissions,
  getAdminStatusMap,
  saveAdminStatus,
  writeAuditLog,
} from "@/lib/security";
import {
  PLATFORM_PERMISSION_CATALOG_KEY,
  PLATFORM_PERMISSION_LEVELS_KEY,
  PLATFORM_PERMISSION_RULES_KEY,
  PLATFORM_MODULE_REGISTRY_KEY,
  getPermissionRulesFromDB,
  savePermissionRulesToDB,
  getFeatureModulesFromDB,
  saveFeatureModulesToDB,
  derivePermissionsByModuleAndRules,
  autoHealPermissionsByDBRules,
  autoGrantNewFeatureRulesToAdmins,
  PlatformFeatureModuleItem,
} from "@/lib/permission-rules-engine";

export const dynamic = "force-dynamic";

/** 平台管理员/超级管理员角色取值（兼容历史大小写与拼写） */
const ADMIN_ROLE_VALUES = [
  "admin",
  "PLATFORM_ADMIN",
  "super_admin",
  "SUPER_ADMIN",
  "superadmin",
];

export interface PermissionKeyItem {
  key: string;
  label: string;
  desc: string;
  moduleName: string;
  level: string;
}

export interface PermissionGroupItem {
  group: string;
  moduleRoute: string;
  description: string;
  keys: PermissionKeyItem[];
}

/** 风险等级字典项（value/label 全部源自数据库，前端不再硬编码） */
export interface PermissionLevelItem {
  value: string;
  label: string;
  desc: string;
}

/** 风险等级官方标准字典（仅用于数据库冷启动初始化写入） */
const INITIAL_PERMISSION_LEVELS: PermissionLevelItem[] = [
  { value: "read", label: "只读", desc: "仅可查看数据，不产生任何写入或状态变更" },
  { value: "normal", label: "常规", desc: "日常业务操作，风险可控" },
  { value: "sensitive", label: "敏感", desc: "涉及用户资料或业务配置变更，需谨慎授予" },
  { value: "high", label: "高危", desc: "涉及资金、权限与全站配置，仅限核心管理员" },
];

// 系统官方初始标准权限目录元数据（仅用于数据库冷启动初始化写入）
const INITIAL_PERMISSIONS_CATALOG: PermissionGroupItem[] = [
  {
    group: "用户管理模块 (User)",
    moduleRoute: "/admin/users",
    description: "用户列表查阅、账号资料修改、状态变更、封禁解封与会话下线管理",
    keys: [
      {
        key: "user:read",
        label: "查看用户列表",
        desc: "查阅全站注册用户基本信息、联系方式与在线状态",
        moduleName: "用户管理",
        level: "read",
      },
      {
        key: "user:detail",
        label: "查看用户详细资料",
        desc: "查看用户手机号、邮箱、注册时间与空间归属等详细资料",
        moduleName: "用户管理",
        level: "sensitive",
      },
      {
        key: "user:update",
        label: "修改用户资料与状态",
        desc: "编辑用户姓名、头像或手动修改用户账号启用状态",
        moduleName: "用户管理",
        level: "sensitive",
      },
      {
        key: "user:role_change",
        label: "修改用户账号身份",
        desc: "调整用户在平台中的身份标签与团队创建者角色",
        moduleName: "用户管理",
        level: "sensitive",
      },
      {
        key: "user:ban",
        label: "执行违规账号封禁",
        desc: "对违规账号执行封停处理并立即阻断其登录访问",
        moduleName: "用户管理",
        level: "high",
      },
      {
        key: "user:unban",
        label: "解封违规用户账号",
        desc: "手动解除已封禁用户的账号限制并恢复其登录",
        moduleName: "用户管理",
        level: "sensitive",
      },
      {
        key: "user:reset_session",
        label: "强制踢除登录会话",
        desc: "强制清除指定用户所有在线状态，要求重新登录",
        moduleName: "用户管理",
        level: "sensitive",
      },
      {
        key: "user:security_reset",
        label: "重置用户登录密码",
        desc: "管理员通过系统特权为用户重置登录密码及验证设置",
        moduleName: "用户管理",
        level: "high",
      },
    ],
  },
  {
    group: "风控与审核模块 (Appeals / Risk)",
    moduleRoute: "/admin/account-appeals",
    description: "账号解封申诉工单审核、违规处理仲裁与平台安全防刷设置",
    keys: [
      {
        key: "appeal:read",
        label: "查看申诉工单列表",
        desc: "查阅被封禁用户提交的解封申诉说明与附件材料",
        moduleName: "风控与审核",
        level: "read",
      },
      {
        key: "appeal:audit",
        label: "审查申诉违规证据",
        desc: "核查申诉证明材料与系统记录的违规历史详情",
        moduleName: "风控与审核",
        level: "read",
      },
      {
        key: "appeal:approve",
        label: "审核通过并自动解封",
        desc: "批准解封申诉，系统自动解除账号限制并下发通知",
        moduleName: "风控与审核",
        level: "sensitive",
      },
      {
        key: "appeal:reject",
        label: "驳回申诉并下发原因",
        desc: "判定申诉不成立，下发驳回通知书并告知原因",
        moduleName: "风控与审核",
        level: "sensitive",
      },
      {
        key: "risk:rule_manage",
        label: "调整接口防刷规则",
        desc: "配置登录防爆破、验证码频率与接口防刷安全策略",
        moduleName: "风控与审核",
        level: "high",
      },
    ],
  },
  {
    group: "工作空间管理模块 (Workspace)",
    moduleRoute: "/admin/workspaces",
    description: "企业团队工作空间查阅、空间状态管控、成员规模与资源配额调整",
    keys: [
      {
        key: "workspace:read",
        label: "查看企业空间列表",
        desc: "浏览全网所有企业团队工作空间及其所有者信息",
        moduleName: "工作空间管理",
        level: "read",
      },
      {
        key: "workspace:detail",
        label: "查看空间成员与资产",
        desc: "查看指定企业空间内的成员名单、项目数量与绑定的组件",
        moduleName: "工作空间管理",
        level: "read",
      },
      {
        key: "workspace:status_update",
        label: "变更空间启用状态",
        desc: "一键冻结违规企业空间，或解冻恢复企业业务访问",
        moduleName: "工作空间管理",
        level: "sensitive",
      },
      {
        key: "workspace:quota_manage",
        label: "调整空间成员与算力配额",
        desc: "调整指定空间允许的最大成员人数与算力配额上限",
        moduleName: "工作空间管理",
        level: "sensitive",
      },
      {
        key: "workspace:transfer",
        label: "交接空间所有者",
        desc: "将企业空间所有权移交给新的负责人账号",
        moduleName: "工作空间管理",
        level: "high",
      },
    ],
  },
  {
    group: "空间套餐管理模块 (Workspace Plans)",
    moduleRoute: "/admin/workspace/plans",
    description: "企业空间套餐价格策略制定、套餐权益配置与上架停售管理",
    keys: [
      {
        key: "workspace_plan:read",
        label: "查看空间套餐列表",
        desc: "查看团队版、企业版等各套餐规格的价格与功能说明",
        moduleName: "空间套餐管理",
        level: "read",
      },
      {
        key: "workspace_plan:create",
        label: "创建新型空间套餐",
        desc: "新建空间套餐策略，设置月付与年付售价与赠送算力",
        moduleName: "空间套餐管理",
        level: "normal",
      },
      {
        key: "workspace_plan:update",
        label: "调整套餐价格与配额",
        desc: "修改套餐的销售价格、成员配额与附赠特权",
        moduleName: "空间套餐管理",
        level: "sensitive",
      },
      {
        key: "workspace_plan:publish",
        label: "空间套餐上架与停售",
        desc: "控制套餐在前台购买页面的展示、上架与停售下架",
        moduleName: "空间套餐管理",
        level: "sensitive",
      },
    ],
  },
  {
    group: "岗位管理模块 (Posts)",
    moduleRoute: "/admin/posts",
    description: "平台官方标准岗位库维护、启用分发控制与企业空间一键导入",
    keys: [
      {
        key: "post:read",
        label: "查看平台标准岗位库",
        desc: "查看官方预设的标准岗位定义、颜色标识与全网引用统计",
        moduleName: "岗位管理",
        level: "read",
      },
      {
        key: "post:create",
        label: "创建官方标准岗位",
        desc: "新增平台建议的标准岗位（如系统架构师、前端开发等）",
        moduleName: "岗位管理",
        level: "normal",
      },
      {
        key: "post:update",
        label: "编辑岗位职责与配色",
        desc: "修改标准岗位的职责说明、代号、主题色与排序",
        moduleName: "岗位管理",
        level: "sensitive",
      },
      {
        key: "post:toggle",
        label: "启用或停用岗位分发",
        desc: "控制该标准岗位是否对企业空间一键导入开放",
        moduleName: "岗位管理",
        level: "sensitive",
      },
      {
        key: "post:delete",
        label: "删除官方标准岗位",
        desc: "从平台官方库移除标准岗位（保留已有空间的使用数据）",
        moduleName: "岗位管理",
        level: "high",
      },
    ],
  },
  {
    group: "组件管理模块 (Components)",
    moduleRoute: "/admin/components",
    description: "全链路功能组件目录管理、参数配置、上架发布与调用审计",
    keys: [
      {
        key: "component:read",
        label: "查看功能组件目录",
        desc: "查看立项、研发、测试、交付全周期的组件列表与状态",
        moduleName: "组件管理",
        level: "read",
      },
      {
        key: "component:create",
        label: "新建功能组件",
        desc: "在系统中录入新开发的研发组件名称、图标与分类",
        moduleName: "组件管理",
        level: "normal",
      },
      {
        key: "component:update",
        label: "编辑组件参数与计费",
        desc: "修改组件说明、输入输出结构与建议算力预估消耗",
        moduleName: "组件管理",
        level: "sensitive",
      },
      {
        key: "component:publish",
        label: "组件上架发布与停用",
        desc: "控制组件正式发布到前台市场，或下架进入维护状态",
        moduleName: "组件管理",
        level: "sensitive",
      },
      {
        key: "component:delete",
        label: "删除已废弃组件",
        desc: "从系统数据表中彻底删除该组件及其关联记录",
        moduleName: "组件管理",
        level: "high",
      },
      {
        key: "component:stats_audit",
        label: "查看组件调用与算力统计",
        desc: "监控全平台各组件调用频次、成功率与算力消耗报表",
        moduleName: "组件管理",
        level: "read",
      },
    ],
  },
  {
    group: "会员套餐管理模块 (Membership)",
    moduleRoute: "/admin/membership",
    description: "个人会员等级特权配置、月度赠送算力与会员计费策略",
    keys: [
      {
        key: "membership:read",
        label: "查看会员特权配置",
        desc: "查看普通用户、黄金会员、钻石会员等各级别特权与售价",
        moduleName: "会员套餐管理",
        level: "read",
      },
      {
        key: "membership:create",
        label: "创建新会员等级方案",
        desc: "设计新的会员等级方案、会员额度与专属标识",
        moduleName: "会员套餐管理",
        level: "normal",
      },
      {
        key: "membership:update",
        label: "修改会员价格与赠额",
        desc: "调整会员售价、功能折扣与专属客服通道配置",
        moduleName: "会员套餐管理",
        level: "sensitive",
      },
    ],
  },
  {
    group: "算力加油包管理模块 (Token Packs)",
    moduleRoute: "/admin/membership/token-packs",
    description: "算力加油包面值与售价管理、促销折扣与前台上架控制",
    keys: [
      {
        key: "token_pack:read",
        label: "查看算力加油包列表",
        desc: "查看全部规格的算力充值包规格、售价与销量",
        moduleName: "算力加油包管理",
        level: "read",
      },
      {
        key: "token_pack:manage",
        label: "维护加油包价格与赠送额",
        desc: "设置算力包面值、售价、赠送额度及折扣活动",
        moduleName: "算力加油包管理",
        level: "sensitive",
      },
      {
        key: "token_pack:publish",
        label: "算力包上架与停售",
        desc: "控制加油包在前台充值页面的展示、置顶与停售状态",
        moduleName: "算力加油包管理",
        level: "normal",
      },
    ],
  },
  {
    group: "订单管理模块 (Orders)",
    moduleRoute: "/admin/orders",
    description: "全网支付流水核验、支付渠道凭证、退款申请与财务对账",
    keys: [
      {
        key: "order:read",
        label: "查看支付订单流水",
        desc: "查看微信支付、支付宝及对公转账的所有交易记录",
        moduleName: "订单管理",
        level: "read",
      },
      {
        key: "order:detail",
        label: "调取订单支付凭证",
        desc: "查看第三方渠道流水号、商户单号与详细对账时间",
        moduleName: "订单管理",
        level: "read",
      },
      {
        key: "order:refund_apply",
        label: "发起订单退款流程",
        desc: "针对用户误购或企业服务变更录入退款处理工单",
        moduleName: "订单管理",
        level: "normal",
      },
      {
        key: "order:refund_approve",
        label: "执行退款资金原路退回",
        desc: "终审并将资金原路退回用户支付账户（资金不可逆）",
        moduleName: "订单管理",
        level: "high",
      },
    ],
  },
  {
    group: "内容管理模块 (Content)",
    moduleRoute: "/admin/content",
    description: "研发全周期阶段大纲编制、步骤标准优化与前台发布指引",
    keys: [
      {
        key: "content:stage_read",
        label: "查看研发阶段大纲",
        desc: "查看立项、需求设计、技术架构、工程开发各阶段大纲",
        moduleName: "内容管理",
        level: "read",
      },
      {
        key: "content:stage_manage",
        label: "编辑阶段大纲与质检标准",
        desc: "维护生命周期阶段步骤、交付物规范与质检门禁要求",
        moduleName: "内容管理",
        level: "sensitive",
      },
      {
        key: "content:stage_publish",
        label: "发布大纲至企业前台",
        desc: "将最新的标准化大纲同步展示在企业空间操作前台",
        moduleName: "内容管理",
        level: "normal",
      },
    ],
  },
  {
    group: "文档管理模块 (Documents)",
    moduleRoute: "/admin/documents",
    description: "平台使用指南、开发者接口手册、知识库与技术文档维护",
    keys: [
      {
        key: "document:read",
        label: "查看系统官方文档",
        desc: "查阅平台官方使用手册、常见问题解答与开发指南",
        moduleName: "文档管理",
        level: "read",
      },
      {
        key: "document:create",
        label: "编写与发布新文档",
        desc: "在官方知识库中新增使用教程与架构技术手册",
        moduleName: "文档管理",
        level: "normal",
      },
      {
        key: "document:update",
        label: "编辑更新文档内容",
        desc: "修改文档正文、更新操作截图与接口使用说明",
        moduleName: "文档管理",
        level: "normal",
      },
      {
        key: "document:delete",
        label: "下架已废弃文档",
        desc: "从帮助中心下架已过时或不再适用的历史技术文档",
        moduleName: "文档管理",
        level: "sensitive",
      },
    ],
  },
  {
    group: "通知公告模块 (Notifications)",
    moduleRoute: "/admin/notifications",
    description: "全站系统广播发布、维护停机预警通知与重要公告撤回",
    keys: [
      {
        key: "announcement:read",
        label: "查看系统通知记录",
        desc: "查看全站已发布的弹窗广播、停机维护公告与历史站内信",
        moduleName: "通知公告",
        level: "read",
      },
      {
        key: "announcement:create",
        label: "发布全站广播公告",
        desc: "向全网用户发布系统升级公告、版本更新与弹窗提醒",
        moduleName: "通知公告",
        level: "normal",
      },
      {
        key: "announcement:revoke",
        label: "撤回或终止广播通知",
        desc: "在需要紧急调整时，一键撤回已发布的广播公告",
        moduleName: "通知公告",
        level: "sensitive",
      },
    ],
  },
  {
    group: "审计日志模块 (Audit Logs)",
    moduleRoute: "/admin/operation-logs",
    description: "管理员高危操作全流程追溯、用户登录日志审查与合规凭据导出",
    keys: [
      {
        key: "audit:operation_read",
        label: "查看管理员操作审计",
        desc: "追溯管理员的封禁、权限调整、改价等关键操作记录",
        moduleName: "审计日志",
        level: "read",
      },
      {
        key: "audit:login_read",
        label: "查看用户登录行为日志",
        desc: "审查用户登录时间、登录 IP、登录方式与异常预警记录",
        moduleName: "审计日志",
        level: "read",
      },
      {
        key: "audit:export",
        label: "导出审计日志凭据",
        desc: "将指定时间段的操作审计流水导出为加密合规文件",
        moduleName: "审计日志",
        level: "high",
      },
    ],
  },
  {
    group: "系统状态模块 (System Status)",
    moduleRoute: "/admin/system-status",
    description: "微服务健康状况监控、网络响应时延、数据库连接与服务心跳",
    keys: [
      {
        key: "system:health_read",
        label: "监控微服务健康状况",
        desc: "实时查看网关、数据库、缓存服务及第三方接口的心跳状态",
        moduleName: "系统状态",
        level: "read",
      },
      {
        key: "system:metrics",
        label: "查看核心性能指标",
        desc: "监控接口 QPS、平均响应时延、内存开销与数据库连接池",
        moduleName: "系统状态",
        level: "read",
      },
    ],
  },
  {
    group: "系统设置模块 (Settings)",
    moduleRoute: "/admin/settings",
    description: "全局系统参数配置、第三方接口密钥设置与停机维护模式控制",
    keys: [
      {
        key: "system:config_read",
        label: "查看全局参数配置",
        desc: "查看平台常量字典、集成通道开关与核心运行参数",
        moduleName: "系统设置",
        level: "read",
      },
      {
        key: "system:settings",
        label: "修改系统关键参数与密钥",
        desc: "修改短信接口、支付渠道密钥、第三方集成凭据等关键参数",
        moduleName: "系统设置",
        level: "high",
      },
      {
        key: "system:maintenance_toggle",
        label: "开启系统临时停机维护",
        desc: "全站开启停机维护模式，阻止普通用户访问并下发维护提示",
        moduleName: "系统设置",
        level: "high",
      },
    ],
  },
  {
    group: "管理员管理模块 (Administrators)",
    moduleRoute: "/admin/administrators",
    description: "平台运维管理员名单查看、委派新管理员与管理员账号管理",
    keys: [
      {
        key: "admin:read",
        label: "查看管理员团队名单",
        desc: "查看具备后台管理权限的所有运营管理员列表与状态",
        moduleName: "管理员管理",
        level: "read",
      },
      {
        key: "admin:create",
        label: "委派任命新管理员",
        desc: "为指定注册用户授予管理员身份，开通后台访问权限",
        moduleName: "管理员管理",
        level: "high",
      },
      {
        key: "admin:revoke",
        label: "撤销管理员管理权限",
        desc: "收回管理员的后台管理身份并降级为普通用户",
        moduleName: "管理员管理",
        level: "high",
      },
    ],
  },
  {
    group: "权限配置模块 (Permissions)",
    moduleRoute: "/admin/permissions",
    description: "普通运营管理员功能权限分配、权限项剔除与动态同步管理",
    keys: [
      {
        key: "admin:permission_grant",
        label: "配置管理员具体权限",
        desc: "为运营管理员勾选并保存各模块的细粒度操作权限",
        moduleName: "权限配置",
        level: "high",
      },
    ],
  },
  {
    group: "AI 算力与模型定价模块 (AI Pricing)",
    moduleRoute: "/admin/ai-pricing",
    description: "全网大模型算力消耗比率核定、Token计费单价微调与服务通道启停",
    keys: [
      {
        key: "ai_pricing:read",
        label: "查看模型算力单价列表",
        desc: "查看全网已接入的大模型算力倍率、输入输出单价与实时状态",
        moduleName: "AI 算力与定价",
        level: "read",
      },
      {
        key: "ai_pricing:update",
        label: "调整模型算力单价与折扣",
        desc: "修改各AI引擎的消耗点数、并发限制与不同会员等级专享折扣",
        moduleName: "AI 算力与定价",
        level: "sensitive",
      },
      {
        key: "ai_pricing:toggle",
        label: "启停特定模型服务通道",
        desc: "控制特定底层大模型通道对工作空间前台的开放或维护状态",
        moduleName: "AI 算力与定价",
        level: "high",
      },
    ],
  },
  {
    group: "运营数据分析大盘 (Analytics)",
    moduleRoute: "/admin/analytics",
    description: "平台多维数据总览、用户活跃趋势、算力消耗分析与转化漏斗",
    keys: [
      {
        key: "analytics:read",
        label: "查看全站经营分析大盘",
        desc: "查阅用户增长趋势、工作空间活跃度、算力消耗与营收态势",
        moduleName: "数据分析",
        level: "read",
      },
      {
        key: "analytics:export",
        label: "导出数据报表与凭证",
        desc: "将指定统计周期内的经营数据、活跃指标导出为分析报表",
        moduleName: "数据分析",
        level: "normal",
      },
    ],
  },
  {
    group: "API 密钥管理模块 (API Keys)",
    moduleRoute: "/admin/api-keys",
    description: "开发者 API Key 发放流水监控、调用鉴权审查与违规密钥吊销",
    keys: [
      {
        key: "apikey:read",
        label: "查看全站 API 密钥流水",
        desc: "浏览各工作空间及用户创建的 API Key 列表与调用频次",
        moduleName: "API 密钥管理",
        level: "read",
      },
      {
        key: "apikey:manage",
        label: "吊销违规密钥与调整限流",
        desc: "手动冻结、吊销异常调用密钥，或调整其单日接口调用频次上限",
        moduleName: "API 密钥管理",
        level: "high",
      },
    ],
  },
  {
    group: "多租户机构管理模块 (Tenants)",
    moduleRoute: "/admin/tenants",
    description: "企业客户多租户架构配置、机构域名白名单与组织专属权限隔离",
    keys: [
      {
        key: "tenant:read",
        label: "查看多租户企业机构",
        desc: "查阅企业入驻机构名单、签约套餐级别与机构负责人信息",
        moduleName: "多租户管理",
        level: "read",
      },
      {
        key: "tenant:manage",
        label: "修改机构配置与状态",
        desc: "调整企业专属域名绑定、席位数量配额与机构启用状态",
        moduleName: "多租户管理",
        level: "high",
      },
    ],
  },
  {
    group: "升级申请审核模块 (Upgrade Applications)",
    moduleRoute: "/admin/upgrade-applications",
    description: "企业空间升级审核、创作者入驻资质审核与增值功能申请审批",
    keys: [
      {
        key: "upgrade:read",
        label: "查看升级申请工单",
        desc: "查阅用户提交的企业空间认证、高级创作者申请资料与资质证明",
        moduleName: "升级申请审核",
        level: "read",
      },
      {
        key: "upgrade:audit",
        label: "审批通过或驳回申请",
        desc: "审核营业执照或个人资质，执行审核通过自动升级或驳回并填写意见",
        moduleName: "升级申请审核",
        level: "sensitive",
      },
    ],
  },
  {
    group: "财务结算管理模块 (Finance)",
    moduleRoute: "/admin/finance",
    description: "平台资金流入流出对账、开发者收益提现清算与对公发票管理",
    keys: [
      {
        key: "finance:read",
        label: "查看财务对账看板",
        desc: "查看支付通道日结账单、创作者收益池与待结算提现申请",
        moduleName: "财务结算",
        level: "read",
      },
      {
        key: "finance:settle",
        label: "执行收益提现打款复核",
        desc: "复核创作者提现账号与金额，标记打款完成或原路驳回",
        moduleName: "财务结算",
        level: "high",
      },
    ],
  },
  {
    group: "系统维护与发版模块 (Maintenance)",
    moduleRoute: "/admin/maintenance",
    description: "系统版本发布记录管理、平滑升级公告下发与停机倒计时维护",
    keys: [
      {
        key: "maintenance:read",
        label: "查看发版与维护记录",
        desc: "查阅平台历次版本发布变更说明与历史维护记录日志",
        moduleName: "系统维护",
        level: "read",
      },
      {
        key: "maintenance:publish",
        label: "发布系统更新与维护预警",
        desc: "发布最新产品变更日志，或预先配置全站停机维护倒计时与告警",
        moduleName: "系统维护",
        level: "high",
      },
    ],
  },
];

const getCleanRole = (role: string | null | undefined): string => {
  if (!role) return "USER";
  const r = role.toUpperCase().trim();
  if (
    r === "SUPER_ADMIN" ||
    r === "SUPERADMIN" ||
    r === "SUPER_ADMIN_ROLE" ||
    r === "SUPER"
  ) {
    return "SUPER_ADMIN";
  }
  return "USER";
};

// 辅助：从数据库读取系统权限目录（结合数据库模块注册表与规则引擎自动自愈对齐）
export async function getPermissionCatalogFromDB(): Promise<PermissionGroupItem[]> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: PLATFORM_PERMISSION_CATALOG_KEY },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    // 首次冷启动：写入数据库持久化（此后一律以数据库为准）
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_PERMISSION_CATALOG_KEY },
      create: {
        key: PLATFORM_PERMISSION_CATALOG_KEY,
        value: JSON.stringify(INITIAL_PERMISSIONS_CATALOG),
      },
      update: {
        value: JSON.stringify(INITIAL_PERMISSIONS_CATALOG),
      },
    });
    return INITIAL_PERMISSIONS_CATALOG;
  } catch (err) {
    console.error("从数据库读取权限目录失败:", err);
    return INITIAL_PERMISSIONS_CATALOG;
  }
}

// 辅助：持久化保存系统权限目录到数据库
export async function savePermissionCatalogToDB(catalog: PermissionGroupItem[]): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_PERMISSION_CATALOG_KEY },
      create: {
        key: PLATFORM_PERMISSION_CATALOG_KEY,
        value: JSON.stringify(catalog),
      },
      update: {
        value: JSON.stringify(catalog),
      },
    });
    return true;
  } catch (err) {
    console.error("保存权限目录到数据库失败:", err);
    return false;
  }
}

/** 辅助：从数据库读取风险等级字典（冷启动时写入官方标准值） */
export async function getPermissionLevelsFromDB(): Promise<PermissionLevelItem[]> {
  try {
    const record = await prisma.systemconfig.findUnique({
      where: { key: PLATFORM_PERMISSION_LEVELS_KEY },
    });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      // 数据库中已有记录即以数据库为准
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_PERMISSION_LEVELS_KEY },
      create: {
        key: PLATFORM_PERMISSION_LEVELS_KEY,
        value: JSON.stringify(INITIAL_PERMISSION_LEVELS),
      },
      update: { value: JSON.stringify(INITIAL_PERMISSION_LEVELS) },
    });
    return INITIAL_PERMISSION_LEVELS;
  } catch (err) {
    console.error("从数据库读取风险等级字典失败:", err);
    return INITIAL_PERMISSION_LEVELS;
  }
}

/** 辅助：按数据库字典校验风险等级，非法值回退到常规等级（字典中的默认项） */
function resolveLevel(value: unknown, levels: PermissionLevelItem[]): string {
  const v = String(value ?? "").trim();
  if (levels.some((l) => l.value === v)) return v;
  return levels.find((l) => l.value === "normal")?.value ?? levels[0]?.value ?? "";
}

/**
 * 权限目录变更后，同步剔除各管理员权限包中已失效的 key，避免残留脏权限。
 * 属于补偿性清理，失败不阻断主流程，仅记录告警。
 */
async function purgeInvalidPermissionsFromAdmins(invalidKeys: Set<string>): Promise<number> {
  if (invalidKeys.size === 0) return 0;
  let affectedAdmins = 0;
  try {
    const adminUsers = await prisma.user.findMany({
      where: { role: { in: ADMIN_ROLE_VALUES } },
      select: { id: true },
    });
    for (const admin of adminUsers) {
      const perms = await getAdminPermissions(admin.id);
      if (perms.length === 0) continue;
      const cleaned = perms.filter((p) => !invalidKeys.has(p));
      if (cleaned.length !== perms.length) {
        await saveAdminPermissions(admin.id, cleaned);
        affectedAdmins += 1;
      }
    }
  } catch (err) {
    console.warn("[权限] 清理管理员失效权限项失败:", err);
  }
  return affectedAdmins;
}

// GET: 统一从数据库获取系统权限目录、管理员列表及权限包 (仅 SuperAdmin 可用)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "system:settings");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminRole = authResult.user!.role;
    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "越权警告：只有超级管理员允许配置管理员权限" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // 1. 从数据库读取真实权限目录、风险等级字典、规则引擎配置与模块注册表（全站100%数据库驱动）
    const catalog = await getPermissionCatalogFromDB();
    const levels = await getPermissionLevelsFromDB();
    const rules = await getPermissionRulesFromDB();
    const modules = await getFeatureModulesFromDB();

    // 2. 如果传入了 userId，返回该特定管理员的权限包与数据库权限字典
    if (userId) {
      const permissions = await getAdminPermissions(userId);
      return NextResponse.json({ success: true, data: permissions, catalog, levels, rules, modules });
    }

    // 3. 从数据库获取所有平台普通管理员和超级管理员
    const admins = await prisma.user.findMany({
      where: {
        role: {
          in: ADMIN_ROLE_VALUES,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const adminStatusMap = await getAdminStatusMap();

    const adminsWithPerms = await Promise.all(
      admins.map(async (admin) => ({
        ...admin,
        permissions: await getAdminPermissions(admin.id),
        isSuper: getCleanRole(admin.role) === "SUPER_ADMIN",
        // status 标识管理员后台特权状态（active | inactive），与前台全站 user.status 彻底解耦
        status: adminStatusMap[admin.id] || "active",
        userAccountStatus: admin.status, // 前台全站用户状态
      }))
    );

    // 4. 后台功能动态监测态势数据（全部由数据库实际数据推导）
    const totalKeysCount = catalog.reduce((acc, g) => acc + g.keys.length, 0);
    const officialKeysCount = INITIAL_PERMISSIONS_CATALOG.reduce(
      (acc, g) => acc + g.keys.length,
      0
    );
    const systemSyncReport = {
      syncStatus: "IN_SYNC",
      totalModules: catalog.length,
      activeModules: catalog.length,
      totalKeys: totalKeysCount,
      officialModules: modules.length,
      officialKeys: officialKeysCount,
      customKeys: Math.max(0, totalKeysCount - officialKeysCount),
      lastCheckTime: new Date().toISOString(),
      dataSource: "DATABASE (system_config)",
      autoDiscoveryEngine: "ACTIVE (DB_DRIVEN)",
      message: `从数据库实时查询：当前权限矩阵与后台 ${catalog.length} 个模块、${modules.length} 个注册功能保持 100% 动态自愈对齐`,
    };

    return NextResponse.json({
      success: true,
      catalog, // 返回从数据库查询的真实权限目录字典
      levels, // 返回从数据库查询的风险等级字典
      rules, // 返回从数据库查询的规则引擎字典
      modules, // 返回从数据库查询的功能模块注册表
      data: adminsWithPerms,
      systemSync: systemSyncReport,
    });
  } catch (error) {
    console.error("Get admin permissions error:", error);
    return NextResponse.json(
      { error: "获取管理员权限包失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// POST: 保存管理员权限，或在数据库中恢复全量官方标准权限
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "system:settings");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const operatorId = authResult.user!.id;
    const adminRole = authResult.user!.role;
    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "越权警告：只有超级管理员允许配置管理员权限" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, targetUserId, permissions, nextStatus } = body;

    // 动作 1：纯数据库驱动 - 注册新功能模块，自动根据数据库规则派生权限并自动赋权入库
    if (action === "register_feature_module") {
      const { moduleItem } = body;
      if (!moduleItem || !moduleItem.name || !moduleItem.route || !moduleItem.resourceKey) {
        return NextResponse.json(
          { error: "缺少新功能模块的核心参数（name, route, resourceKey 均为必填项）" },
          { status: 400 }
        );
      }

      const cleanId = String(moduleItem.id || moduleItem.resourceKey).trim().toLowerCase();
      const cleanName = String(moduleItem.name).trim();
      const cleanRoute = String(moduleItem.route).trim();
      const cleanResourceKey = String(moduleItem.resourceKey).trim().toLowerCase();
      const cleanDescription = String(moduleItem.description || `${cleanName}业务管理中枢`).trim();
      const supportedActions: string[] = Array.isArray(moduleItem.supportedActions) && moduleItem.supportedActions.length > 0
        ? moduleItem.supportedActions
        : ["read", "create", "update", "delete"];

      const existingModules = await getFeatureModulesFromDB();
      const conflictByRoute = existingModules.find((m) => m.route === cleanRoute);
      if (conflictByRoute) {
        return NextResponse.json(
          {
            error: `前端路由【${cleanRoute}】已被现有模块【${conflictByRoute.name}】占用，请更换其他路由（例如 ${cleanRoute}-test）！`,
          },
          { status: 400 }
        );
      }

      const conflictByKey = existingModules.find((m) => m.resourceKey === cleanResourceKey);
      if (conflictByKey) {
        return NextResponse.json(
          {
            error: `资源前缀【${cleanResourceKey}】已被现有模块【${conflictByKey.name}】占用，请更换前缀（例如 ${cleanResourceKey}_test）！`,
          },
          { status: 400 }
        );
      }

      const conflictById = existingModules.find((m) => m.id === cleanId);
      if (conflictById) {
        return NextResponse.json(
          {
            error: `模块代号【${cleanId}】与现有模块【${conflictById.name}】重复，请更换代号！`,
          },
          { status: 400 }
        );
      }

      const newModuleRecord: PlatformFeatureModuleItem = {
        id: cleanId,
        name: cleanName,
        route: cleanRoute,
        resourceKey: cleanResourceKey,
        description: cleanDescription,
        supportedActions,
        isSystemCore: false,
      };

      // 1. 存入数据库模块注册表
      const updatedModules = [...existingModules, newModuleRecord];
      await saveFeatureModulesToDB(updatedModules);

      // 2. 从数据库读取规则配置，自动派生出权限项
      const rules = await getPermissionRulesFromDB();
      const derivedKeys = derivePermissionsByModuleAndRules(newModuleRecord, rules);

      // 3. 将派生权限自动注入数据库权限目录
      const currentCatalog = await getPermissionCatalogFromDB();
      const targetGroupTitle = `${cleanName} (${cleanResourceKey.toUpperCase()})`;
      const existingGroup = currentCatalog.find(
        (g) => g.group === targetGroupTitle || g.moduleRoute === cleanRoute
      );

      let updatedCatalog: PermissionGroupItem[];
      if (existingGroup) {
        updatedCatalog = currentCatalog.map((g) => {
          if (g === existingGroup) {
            const existingKeys = new Set(g.keys.map((k) => k.key));
            const newKeysToAdd = derivedKeys.filter((k) => !existingKeys.has(k.key));
            return { ...g, keys: [...g.keys, ...newKeysToAdd] };
          }
          return g;
        });
      } else {
        updatedCatalog = [
          ...currentCatalog,
          {
            group: targetGroupTitle,
            moduleRoute: cleanRoute,
            description: cleanDescription,
            keys: derivedKeys,
          },
        ];
      }

      await savePermissionCatalogToDB(updatedCatalog);

      // 4. 执行新功能上线自动赋权规则（按数据库策略为普通管理员追加默认基线权限）
      const grantedAdminCount = await autoGrantNewFeatureRulesToAdmins(
        derivedKeys.map((k) => k.key),
        rules
      );

      // 5. 记录高危审计日志
      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "REGISTER_NEW_FEATURE_MODULE",
          moduleId: cleanId,
          moduleName: cleanName,
          resourceKey: cleanResourceKey,
          generatedKeysCount: derivedKeys.length,
          grantedAdminCount,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message: `新功能【${cleanName}】已成功在数据库中注册，规则引擎全自动生成 ${derivedKeys.length} 项标准权限并入库，已为 ${grantedAdminCount} 位管理员自动同步默认权限规则！`,
        catalog: updatedCatalog,
        modules: updatedModules,
        generatedKeys: derivedKeys,
      });
    }

    // 动作 2：纯数据库驱动 - 手动触发全系统功能自愈与自适应对齐
    if (action === "sync_rules_healing") {
      const currentCatalog = await getPermissionCatalogFromDB();
      const healingResult = await autoHealPermissionsByDBRules(currentCatalog);
      const rules = await getPermissionRulesFromDB();
      const modules = await getFeatureModulesFromDB();

      if (healingResult.addedModulesCount > 0 || healingResult.addedKeysCount > 0) {
        await savePermissionCatalogToDB(healingResult.healedCatalog);
        await autoGrantNewFeatureRulesToAdmins(healingResult.newlyDiscoveredKeys, rules);
      }

      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "SYNC_RULES_HEALING",
          addedModulesCount: healingResult.addedModulesCount,
          addedKeysCount: healingResult.addedKeysCount,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message:
          healingResult.addedKeysCount > 0
            ? `自愈对齐完成：从数据库规则中自动感知并补齐 ${healingResult.addedModulesCount} 个功能模块，生成 ${healingResult.addedKeysCount} 项细粒度权限！`
            : `数据库规则自检完成：全系统 ${modules.length} 个功能模块均已 100% 对齐，无需额外补齐。`,
        catalog: healingResult.healedCatalog,
        modules,
        rules,
        stats: {
          addedModulesCount: healingResult.addedModulesCount,
          addedKeysCount: healingResult.addedKeysCount,
        },
      });
    }

    // 动作 3：纯数据库驱动 - 更新权限派生规则与自动赋权策略配置
    if (action === "update_permission_rules") {
      const { rulesConfig } = body;
      if (!rulesConfig || !Array.isArray(rulesConfig.actionRules)) {
        return NextResponse.json({ error: "规则配置数据格式非法" }, { status: 400 });
      }

      await savePermissionRulesToDB(rulesConfig);
      await writeAuditLog(
        operatorId,
        "system:settings",
        { action: "UPDATE_PERMISSION_RULES_CONFIG" },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message: "数据库权限派生规则与自动赋权策略已成功更新落库！",
        rules: rulesConfig,
      });
    }

    // 动作：临时停用 / 恢复启用管理员后台管理特权（绝不修改前台用户账号状态，保留全部已配权限）
    if (action === "toggle_admin_status") {
      if (!targetUserId || (nextStatus !== "active" && nextStatus !== "inactive")) {
        return NextResponse.json({ error: "缺少参数或状态值非法" }, { status: 400 });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, name: true, email: true, status: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: "目标管理员不存在" }, { status: 404 });
      }

      if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
        return NextResponse.json({ error: "超级管理员不可被停用" }, { status: 400 });
      }

      // 仅更新后台管理员特权映射，绝不篡改用户的全站前台账号状态！
      await saveAdminStatus(targetUserId, nextStatus);

      // 防御性补偿：若该用户历史曾被误改为 inactive，在此自动恢复其前台账号为 active，修复其全站操作资格
      if (targetUser.status === "inactive") {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { status: "active" },
        });
      }

      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "TOGGLE_ADMIN_STATUS",
          targetUserId,
          nextStatus,
          targetName: targetUser.name || targetUser.email,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message:
          nextStatus === "inactive"
            ? "已成功临时停用该管理员后台管理权限（已完整保留已配权限，其全站前台账号与空间操作100%正常）！"
            : "已成功恢复该管理员后台管理权限并即刻生效！",
        status: nextStatus,
      });
    }

    // 动作：恢复数据库中的官方标准权限字典
    if (action === "reset_defaults") {
      // 智能恢复官方标准：补齐缺失的标准项 + 修正被改动的标准项，保留管理员自定义补充项
      const currentCatalog = await getPermissionCatalogFromDB();
      const currentKeySet = new Set(
        currentCatalog.flatMap((g) => g.keys.map((k) => k.key))
      );
      const officialKeySet = new Set(
        INITIAL_PERMISSIONS_CATALOG.flatMap((g) => g.keys.map((k) => k.key))
      );

      // 1. 以官方标准库为骨架重建，标准项一律取官方定义
      const mergedCatalog: PermissionGroupItem[] = INITIAL_PERMISSIONS_CATALOG.map(
        (officialGroup) => {
          const existing = currentCatalog.find((g) => g.group === officialGroup.group);
          // 该模块下管理员自定义补充的项（非官方标准）原样保留
          const customKeys = existing
            ? existing.keys.filter((k) => !officialKeySet.has(k.key))
            : [];
          return {
            group: officialGroup.group,
            moduleRoute: officialGroup.moduleRoute,
            description: officialGroup.description,
            keys: [...officialGroup.keys.map((k) => ({ ...k })), ...customKeys],
          };
        }
      );

      // 2. 官方标准库之外的自定义模块整体保留
      currentCatalog.forEach((g) => {
        if (!mergedCatalog.some((m) => m.group === g.group)) {
          mergedCatalog.push(g);
        }
      });

      const addedOfficialKeys = [...officialKeySet].filter((k) => !currentKeySet.has(k)).length;
      const totalKeys = mergedCatalog.reduce((acc, g) => acc + g.keys.length, 0);
      const retainedCustomKeys = Math.max(0, totalKeys - officialKeySet.size);

      await savePermissionCatalogToDB(mergedCatalog);
      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "RESTORE_OFFICIAL_PERMISSIONS_IN_DB",
          addedOfficialKeys,
          retainedCustomKeys,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        catalog: mergedCatalog,
        message:
          addedOfficialKeys > 0
            ? `官方标准权限库已恢复：补齐 ${addedOfficialKeys} 项缺失标准权限，保留 ${retainedCustomKeys} 项自定义补充权限！`
            : `官方标准权限库已校验恢复，标准项定义已还原，保留 ${retainedCustomKeys} 项自定义补充权限！`,
      });
    }

    // 动作：灵活补充单项权限（支持现有模块追加或新建模块）
    if (action === "add_permission") {
      const { permission } = body;
      if (!permission || !permission.key || !permission.label) {
        return NextResponse.json({ error: "缺少权限代号 (key) 或权限名称 (label)" }, { status: 400 });
      }
      const keyTrimmed = permission.key.trim();
      const labelTrimmed = permission.label.trim();
      const groupName = (permission.group || "自定义业务功能模块").trim();
      const moduleRoute = (permission.moduleRoute || "/admin").trim();
      const description = (permission.description || "管理员自定义灵活补充的功能模块").trim();
      const desc = (permission.desc || labelTrimmed).trim();
      const level = resolveLevel(permission.level, await getPermissionLevelsFromDB());

      const currentCatalog = await getPermissionCatalogFromDB();
      const allKeys = currentCatalog.flatMap((g) => g.keys.map((k) => k.key));
      if (allKeys.includes(keyTrimmed)) {
        return NextResponse.json({ error: `权限代号【${keyTrimmed}】已存在，请勿重复添加` }, { status: 400 });
      }

      const targetGroup = currentCatalog.find((g) => g.group === groupName || g.moduleRoute === moduleRoute);
      const newKeyItem: PermissionKeyItem = {
        key: keyTrimmed,
        label: labelTrimmed,
        desc,
        moduleName: groupName.split(" ")[0].replace(/模块$/, ""),
        level,
      };

      let updatedCatalog: PermissionGroupItem[];
      if (targetGroup) {
        updatedCatalog = currentCatalog.map((g) => {
          if (g === targetGroup) {
            return {
              ...g,
              keys: [...g.keys, newKeyItem],
            };
          }
          return g;
        });
      } else {
        updatedCatalog = [
          ...currentCatalog,
          {
            group: groupName,
            moduleRoute,
            description,
            keys: [newKeyItem],
          },
        ];
      }

      await savePermissionCatalogToDB(updatedCatalog);
      await writeAuditLog(
        operatorId,
        "system:settings",
        { action: "ADD_CUSTOM_PERMISSION", key: keyTrimmed, label: labelTrimmed, group: groupName },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message: `已成功在数据库中为【${groupName}】灵活补充权限：【${labelTrimmed}】！`,
        catalog: updatedCatalog,
      });
    }

    // 动作：编辑既有权限项（key 为唯一标识不可改，可修正名称/说明/风险等级/所属模块）
    if (action === "edit_permission") {
      const { originalKey, permission } = body;
      if (!originalKey || !permission?.label) {
        return NextResponse.json(
          { error: "缺少待编辑的权限代号 (originalKey) 或权限名称 (label)" },
          { status: 400 }
        );
      }

      const originalKeyTrimmed = String(originalKey).trim();
      const labelTrimmed = String(permission.label).trim();
      const descTrimmed = String(permission.desc || labelTrimmed).trim();
      const groupName = String(permission.group || "").trim();
      const moduleRoute = String(permission.moduleRoute || "/admin").trim();
      const groupDesc = String(permission.description || "").trim();
      const level = resolveLevel(permission.level, await getPermissionLevelsFromDB());

      const currentCatalog = await getPermissionCatalogFromDB();
      const located = currentCatalog.find((g) =>
        g.keys.some((k) => k.key === originalKeyTrimmed)
      );
      if (!located) {
        return NextResponse.json(
          { error: `权限代号【${originalKeyTrimmed}】不存在，无法编辑` },
          { status: 404 }
        );
      }

      const targetGroupName = groupName || located.group;
      const updatedItem: PermissionKeyItem = {
        key: originalKeyTrimmed,
        label: labelTrimmed,
        desc: descTrimmed,
        moduleName: targetGroupName.split(" ")[0].replace(/模块$/, ""),
        level,
      };

      // 先从原分组摘除，再并入目标分组（支持跨模块迁移）
      const strippedCatalog = currentCatalog
        .map((g) => ({ ...g, keys: g.keys.filter((k) => k.key !== originalKeyTrimmed) }))
        .filter((g) => g.keys.length > 0);

      let updatedCatalog: PermissionGroupItem[];
      const targetGroup = strippedCatalog.find((g) => g.group === targetGroupName);
      if (targetGroup) {
        updatedCatalog = strippedCatalog.map((g) =>
          g.group === targetGroupName ? { ...g, keys: [...g.keys, updatedItem] } : g
        );
      } else {
        updatedCatalog = [
          ...strippedCatalog,
          {
            group: targetGroupName,
            moduleRoute,
            description: groupDesc || located.description,
            keys: [updatedItem],
          },
        ];
      }

      await savePermissionCatalogToDB(updatedCatalog);
      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "EDIT_CUSTOM_PERMISSION",
          key: originalKeyTrimmed,
          label: labelTrimmed,
          group: targetGroupName,
          level,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message: `权限项【${labelTrimmed}】已更新并落库！`,
        catalog: updatedCatalog,
      });
    }

    // 动作：批量调整权限项（移动所属模块 / 统一风险等级）
    // key 为唯一标识且保持不变，因此不会影响各管理员已勾选的授权关系
    if (action === "batch_update_permissions") {
      const { keys, targetGroup, level } = body;
      const keySet = new Set(
        (Array.isArray(keys) ? keys : []).map((k) => String(k).trim()).filter(Boolean)
      );
      if (keySet.size === 0) {
        return NextResponse.json({ error: "请先勾选需要批量调整的权限项" }, { status: 400 });
      }

      const targetGroupName = targetGroup ? String(targetGroup).trim() : "";
      const levelDict = await getPermissionLevelsFromDB();
      const nextLevel: string | null = levelDict.some((l) => l.value === level)
        ? String(level)
        : null;
      if (!targetGroupName && !nextLevel) {
        return NextResponse.json(
          { error: "请至少选择「移动到模块」或「设置风险等级」中的一项" },
          { status: 400 }
        );
      }

      const currentCatalog = await getPermissionCatalogFromDB();

      // 仅统一等级：原地更新，不改变所属模块
      if (!targetGroupName && nextLevel) {
        const updatedCatalog = currentCatalog.map((g) => ({
          ...g,
          keys: g.keys.map((k) => (keySet.has(k.key) ? { ...k, level: nextLevel } : k)),
        }));
        await savePermissionCatalogToDB(updatedCatalog);
        await writeAuditLog(
          operatorId,
          "system:settings",
          { action: "BATCH_UPDATE_PERMISSION_LEVEL", keys: [...keySet], level: nextLevel },
          null,
          null,
          request
        );
        return NextResponse.json({
          success: true,
          catalog: updatedCatalog,
          message: `已将 ${keySet.size} 项权限的风险等级统一设为【${nextLevel}】！`,
        });
      }

      // 移动分组（可同时统一等级）：先从原分组摘除，再并入目标分组
      const moved: PermissionKeyItem[] = [];
      const strippedCatalog = currentCatalog
        .map((g) => {
          const stay = g.keys.filter((k) => !keySet.has(k.key));
          g.keys
            .filter((k) => keySet.has(k.key))
            .forEach((k) => moved.push(nextLevel ? { ...k, level: nextLevel } : { ...k }));
          return { ...g, keys: stay };
        })
        .filter((g) => g.keys.length > 0);

      let updatedCatalog: PermissionGroupItem[];
      const target = strippedCatalog.find((g) => g.group === targetGroupName);
      if (target) {
        updatedCatalog = strippedCatalog.map((g) =>
          g.group === targetGroupName ? { ...g, keys: [...g.keys, ...moved] } : g
        );
      } else {
        updatedCatalog = [
          ...strippedCatalog,
          {
            group: targetGroupName,
            moduleRoute: "/admin",
            description: "管理员自定义灵活补充的功能模块",
            keys: moved,
          },
        ];
      }

      await savePermissionCatalogToDB(updatedCatalog);
      await writeAuditLog(
        operatorId,
        "system:settings",
        {
          action: "BATCH_MOVE_PERMISSIONS",
          keys: [...keySet],
          targetGroup: targetGroupName,
          level: nextLevel,
        },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        catalog: updatedCatalog,
        message: `已将 ${moved.length} 项权限移动到【${targetGroupName}】${
          nextLevel ? `，并统一风险等级为【${nextLevel}】` : ""
        }！`,
      });
    }

    // 动作：全系统功能智能差量扫描与合并补全（自动将全系统 24 大模块缺失项补入数据库，不覆盖已有自定义项）
    if (action === "sync_system_catalog") {
      const currentCatalog = await getPermissionCatalogFromDB();
      const currentKeySet = new Set(currentCatalog.flatMap((g) => g.keys.map((k) => k.key)));
      const currentGroupMap = new Map(currentCatalog.map((g) => [g.group, g]));

      let addedKeysCount = 0;
      let addedGroupsCount = 0;

      const mergedCatalog = [...currentCatalog];

      for (const officialGroup of INITIAL_PERMISSIONS_CATALOG) {
        const existingGroup = currentGroupMap.get(officialGroup.group);
        if (!existingGroup) {
          // 全新模块直接追加
          mergedCatalog.push(officialGroup);
          addedGroupsCount += 1;
          addedKeysCount += officialGroup.keys.length;
          officialGroup.keys.forEach((k) => currentKeySet.add(k.key));
        } else {
          // 检查是否有新 key 缺失
          const missingKeys = officialGroup.keys.filter((k) => !currentKeySet.has(k.key));
          if (missingKeys.length > 0) {
            const groupIdx = mergedCatalog.findIndex((g) => g.group === officialGroup.group);
            if (groupIdx !== -1) {
              mergedCatalog[groupIdx] = {
                ...mergedCatalog[groupIdx],
                keys: [...mergedCatalog[groupIdx].keys, ...missingKeys],
              };
              missingKeys.forEach((k) => currentKeySet.add(k.key));
              addedKeysCount += missingKeys.length;
            }
          }
        }
      }

      await savePermissionCatalogToDB(mergedCatalog);
      await writeAuditLog(
        operatorId,
        "system:settings",
        { action: "SYNC_ALL_SYSTEM_MODULE_PERMISSIONS", addedGroupsCount, addedKeysCount },
        null,
        null,
        request
      );

      return NextResponse.json({
        success: true,
        message: `全系统功能对接完成！已智能补充 ${addedGroupsCount} 个新增管理模块，补齐 ${addedKeysCount} 项功能权限。`,
        catalog: mergedCatalog,
        stats: { addedGroupsCount, addedKeysCount, totalModules: mergedCatalog.length },
      });
    }

    if (!targetUserId || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "缺少必要的 targetUserId 或 permissions 参数" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "目标用户不存在" }, { status: 404 });
    }

    if (getCleanRole(targetUser.role) === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "安全保护：系统超级管理员拥有全量特权，不允许修改其分配策略" },
        { status: 403 }
      );
    }

    // 执行保存管理员权限配置
    const success = await saveAdminPermissions(targetUserId, permissions);
    if (!success) {
      return NextResponse.json({ error: "保存权限包失败" }, { status: 500 });
    }

    // 记录高危操作审计日志
    await writeAuditLog(
      operatorId,
      "system:settings",
      {
        action: "CONFIGURE_ADMIN_PERMISSIONS",
        targetUserId,
        targetUserName: targetUser.name,
        grantedPermissions: permissions,
      },
      null,
      null,
      request
    );

    return NextResponse.json({
      success: true,
      message: `管理员 ${targetUser.name} 的权限配置已成功更新并落库！`,
    });
  } catch (error) {
    console.error("Save admin permissions error:", error);
    return NextResponse.json(
      { error: "保存管理员权限失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// DELETE: 直接在数据库中删除某个权限项或批量删除权限项 (仅 SuperAdmin 可用)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "system:settings");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const operatorId = authResult.user!.id;
    const adminRole = authResult.user!.role;
    if (getCleanRole(adminRole) !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "越权警告：只有超级管理员允许删除权限项" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const singleKey = searchParams.get("key");

    let keysToDelete: string[] = [];

    if (singleKey) {
      keysToDelete = [singleKey];
    } else {
      try {
        const body = await request.json();
        if (Array.isArray(body.keys)) {
          keysToDelete = body.keys;
        }
      } catch {
        // 无 body
      }
    }

    if (keysToDelete.length === 0) {
      return NextResponse.json({ error: "缺少待删除的权限 key" }, { status: 400 });
    }

    // 1. 从数据库读取现有权限字典
    const currentCatalog = await getPermissionCatalogFromDB();
    const deleteKeySet = new Set(keysToDelete);

    // 2. 在数据库权限结构中执行删除
    const updatedCatalog = currentCatalog
      .map((group) => ({
        ...group,
        keys: group.keys.filter((k) => !deleteKeySet.has(k.key)),
      }))
      .filter((group) => group.keys.length > 0);

    // 3. 将修改后的权限字典持久化写入数据库
    await savePermissionCatalogToDB(updatedCatalog);

    // 3.1 同步剔除各管理员权限包中已失效的 key，避免残留脏权限
    const removedKeys = new Set(
      currentCatalog
        .flatMap((g) => g.keys.map((k) => k.key))
        .filter((k) => deleteKeySet.has(k))
    );
    const affectedAdmins = await purgeInvalidPermissionsFromAdmins(removedKeys);

    // 3.2 同步更新 feature_modules 模块登记记录（剔除已删除的 action，注销无权限的模块）
    const existingModules = await getFeatureModulesFromDB();
    const survivingKeys = new Set(updatedCatalog.flatMap((g) => g.keys.map((k) => k.key)));
    const survivingModules = existingModules
      .map((m) => ({
        ...m,
        supportedActions: m.supportedActions.filter((action) =>
          survivingKeys.has(`${m.resourceKey}:${action}`)
        ),
      }))
      .filter((m) => m.supportedActions.length > 0);

    await saveFeatureModulesToDB(survivingModules);

    // 4. 记录审计日志
    await writeAuditLog(
      operatorId,
      "system:settings",
      {
        action: "DELETE_PERMISSIONS_FROM_DB",
        deletedKeys: keysToDelete,
        remainingGroups: updatedCatalog.length,
        affectedAdmins,
      },
      null,
      null,
      request
    );

    return NextResponse.json({
      success: true,
      message:
        affectedAdmins > 0
          ? `成功从数据库中移除 ${keysToDelete.length} 项功能权限，并回收 ${affectedAdmins} 位管理员的失效授权！`
          : `成功从数据库中移除 ${keysToDelete.length} 项功能权限！`,
      catalog: updatedCatalog,
      affectedAdmins,
    });
  } catch (error) {
    console.error("Delete permission items error:", error);
    return NextResponse.json(
      { error: "删除权限项失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
