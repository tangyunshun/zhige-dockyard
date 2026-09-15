import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 审计字典种子数据：动作 / 资源 → 中文标签。
// 与 src/lib/audit-dict.ts 中的 DEFAULT_ACTION_DICT / DEFAULT_RESOURCE_DICT 保持一致，
// 确保「代码默认值 + 数据库字典」双源统一。运行时若 system_config 为空，
// getAuditDictionariesFromDb 也会懒种子写入下面内容，本脚本用于显式初始化与可重复迁移。
const ACTION_DICT: Record<string, string> = {
  USER_REGISTER: "新用户自主注册",
  OAUTH_REGISTER: "第三方账号联合注册",
  OAUTH_LOGIN: "第三方账号联合登录",
  "auth:login": "账号登录",
  "auth:logout": "用户主动退出登录",
  "auth:verify": "身份验证",
  SESSION_CONFLICT_LOGOUT: "异地登录挤线强制下线",
  SESSION_TIMEOUT_LOGOUT: "登录超时自动退出",
  DEVICE_KICKED_OFFLINE: "设备登录数达上限自动踢出",
  PasswordChange: "修改登录密码",
  "Password:Change": "修改登录密码",
  SecuritySettingUpdate: "更新账号安全设置",
  "SecuritySetting:Update": "更新账号安全设置",
  ACCOUNT_DELETION_REQUESTED: "提交账号注销申请",
  ACCOUNT_DELETED: "账号注销删除",
  "user:ban": "封禁用户",
  "user:unban": "解封用户",
  "user:reset_session": "强制用户下线",
  "user:delete": "删除用户",
  "user:create": "创建用户",
  "user:update": "更新用户资料",
  CREATE_ENTERPRISE_WORKSPACE: "创建企业工作空间",
  UPGRADE_WORKSPACE: "工作空间类型升级",
  UPGRADE_WORKSPACE_PLAN: "工作空间套餐升级",
  JOIN_WORKSPACE: "加入工作空间",
  UPDATE_MEMBER_ROLE: "修改成员角色",
  WORKSPACE_KICK: "移出工作空间成员",
  CONFIGURE_SOLUTION: "配置解决方案",
  "workspace:create": "创建工作空间",
  "workspace:update": "更新工作空间",
  "workspace:delete": "删除工作空间",
  "workspace:leave": "退出工作空间",
  "workspace:quota_update": "调整工作空间配额",
  BIND_COMPONENT: "绑定微前端组件",
  UNBIND_COMPONENT: "解绑微前端组件",
  ENABLE_COMPONENT: "启用微前端组件",
  DISABLE_COMPONENT: "停用微前端组件",
  SET_RESTRICTED_COMPONENTS: "设置受限组件清单",
  SAVE_CUSTOM_POSITIONS: "保存组件自定义布局",
  "component:create": "创建组件",
  "component:update": "更新组件",
  "component:delete": "删除组件",
  "component:ban": "封禁组件",
  KNOWLEDGE_PUBLISH: "知识内容上架发布",
  KNOWLEDGE_SUBMIT: "知识内容提交审核",
  KNOWLEDGE_APPROVE: "知识内容审核通过",
  KNOWLEDGE_REJECT: "知识内容审核驳回",
  "asset:upload": "上传知识资料",
  "asset:delete": "删除知识资料",
  ARCHIVE_TASK: "归档生成任务",
  DELETE_TASK: "删除生成任务",
  SECURITY_DIAGNOSIS: "平台安全体检诊断",
  "security:setting_update": "更新平台安全策略",
  "admin:login": "管理员登录",
  "system:test_sms": "测试短信网关",
  "system:test_email": "测试邮件通道",
  "system:create_db_backup": "创建数据库备份快照",
  "system:update_oauth_channels": "更新第三方登录渠道",
  "system:update_settings": "更新系统全局配置",
};

const RESOURCE_DICT: Record<string, string> = {
  user: "用户账号",
  "user/account": "用户账号",
  Password: "登录密码",
  Security: "平台安全",
  KNOWLEDGE: "知识资产",
  TASK: "生成任务",
  Workspace: "工作空间",
  SECURITY_MATRIX: "安全矩阵",
  POSITIONS_CONFIG: "组件布局配置",
  "auth/session": "安全认证会话",
  "auth/device": "登录设备",
  sms_gateway: "短信网关通道",
  smtp_settings: "邮件SMTP配置",
  oauth_channels: "第三方登录渠道",
  system_config: "系统全局配置",
  database_snapshot: "数据库备份快照",
  "workspace/member": "工作空间成员",
  solution: "解决方案",
  component: "微前端组件",
  asset: "知识资料",
};

async function main() {
  await prisma.systemconfig.upsert({
    where: { key: "audit_action_dict" },
    create: { key: "audit_action_dict", value: JSON.stringify(ACTION_DICT) },
    update: { value: JSON.stringify(ACTION_DICT) },
  });
  await prisma.systemconfig.upsert({
    where: { key: "audit_resource_dict" },
    create: { key: "audit_resource_dict", value: JSON.stringify(RESOURCE_DICT) },
    update: { value: JSON.stringify(RESOURCE_DICT) },
  });
  console.log(
    `[seed-audit-dict] 审计字典种子化完成：action ${Object.keys(ACTION_DICT).length} 项，resource ${Object.keys(RESOURCE_DICT).length} 项`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[seed-audit-dict] 种子化失败:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
