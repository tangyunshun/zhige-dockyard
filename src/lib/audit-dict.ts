import { prisma } from "@/lib/prisma";

// 标准化 IP 地址格式，彻底避免 IPv6 回环 ::1 裸露
export function normalizeIpAddress(ip?: string | null): string {
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.includes("127.0.0.1") || ip === "localhost") {
    return "127.0.0.1 (本地局域网)";
  }
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.replace("::ffff:", "");
    return v4 === "127.0.0.1" ? "127.0.0.1 (本地局域网)" : v4;
  }
  return ip;
}

// 审计字典「权威默认映射」——作为数据库字典的下位兜底与一键种子来源。
// 设计原则：运行时以 system_config 中的 audit_action_dict / audit_resource_dict 为准（可由管理员在库内覆盖），
// 库内无数据时自动用以下默认值落库（懒种子），保证后台标签 100% 中文、不裸英文。
// 注意：这里集中维护「标准动作/资源 → 中文名」的唯一真相源，新增业务动作请同步补充此处。
export const DEFAULT_ACTION_DICT: Record<string, string> = {
  // 账号与认证
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
  // 账号注销生命周期
  ACCOUNT_DELETION_REQUESTED: "提交账号注销申请",
  ACCOUNT_DELETED: "账号注销删除",
  // 用户管理（管理员侧，writeAuditLog 传入 module:verb 形态）
  "user:ban": "封禁用户",
  "user:unban": "解封用户",
  "user:reset_session": "强制用户下线",
  "user:delete": "删除用户",
  "user:create": "创建用户",
  "user:update": "更新用户资料",
  // 工作空间
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
  // 组件 / 微前端
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
  // 知识资产
  KNOWLEDGE_PUBLISH: "知识内容上架发布",
  KNOWLEDGE_SUBMIT: "知识内容提交审核",
  KNOWLEDGE_APPROVE: "知识内容审核通过",
  KNOWLEDGE_REJECT: "知识内容审核驳回",
  "asset:upload": "上传知识资料",
  "asset:delete": "删除知识资料",
  // 生成任务
  ARCHIVE_TASK: "归档生成任务",
  DELETE_TASK: "删除生成任务",
  // 平台安全与系统
  SECURITY_DIAGNOSIS: "平台安全体检诊断",
  "security:setting_update": "更新平台安全策略",
  "admin:login": "管理员登录",
  "system:test_sms": "测试短信网关",
  "system:test_email": "测试邮件通道",
  "system:create_db_backup": "创建数据库备份快照",
  "system:update_oauth_channels": "更新第三方登录渠道",
  "system:update_settings": "更新系统全局配置",
};

export const DEFAULT_RESOURCE_DICT: Record<string, string> = {
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

// 懒种子：当 system_config 中尚未录入审计字典时，将权威默认映射落库（幂等 upsert），
// 之后后台即可在数据库内直接覆盖/扩展标签，无需改代码。
async function ensureAuditDictionariesSeeded() {
  try {
    await prisma.systemconfig.upsert({
      where: { key: "audit_action_dict" },
      create: { key: "audit_action_dict", value: JSON.stringify(DEFAULT_ACTION_DICT) },
      update: { value: JSON.stringify(DEFAULT_ACTION_DICT) },
    });
    await prisma.systemconfig.upsert({
      where: { key: "audit_resource_dict" },
      create: { key: "audit_resource_dict", value: JSON.stringify(DEFAULT_RESOURCE_DICT) },
      update: { value: JSON.stringify(DEFAULT_RESOURCE_DICT) },
    });
  } catch (e) {
    console.warn("[审计字典] 懒种子写入 system_config 失败（不影响兜底翻译）:", e);
  }
}

// 从数据库 system_config 表动态获取操作与资源映射字典（数据库值为准，代码默认值为兜底与种子来源）
export async function getAuditDictionariesFromDb() {
  // 以代码权威默认映射打底，确保字段翻译与下拉筛选项 100% 中文、不裸英文
  let actionDict: Record<string, string> = { ...DEFAULT_ACTION_DICT };
  let resourceDict: Record<string, string> = { ...DEFAULT_RESOURCE_DICT };
  let dbHasDict = false;

  try {
    const records = await prisma.systemconfig.findMany({
      where: {
        key: { in: ["audit_action_dict", "audit_resource_dict"] },
      },
    });

    const actionRec = records.find((r) => r.key === "audit_action_dict");
    if (actionRec?.value) {
      try {
        // 数据库值优先（允许管理员在库内覆盖/扩展标签），覆盖默认值
        actionDict = { ...DEFAULT_ACTION_DICT, ...JSON.parse(actionRec.value) };
        dbHasDict = true;
      } catch (e) {
        console.error("解析数据库 audit_action_dict 失败:", e);
      }
    }

    const resourceRec = records.find((r) => r.key === "audit_resource_dict");
    if (resourceRec?.value) {
      try {
        resourceDict = { ...DEFAULT_RESOURCE_DICT, ...JSON.parse(resourceRec.value) };
        dbHasDict = true;
      } catch (e) {
        console.error("解析数据库 audit_resource_dict 失败:", e);
      }
    }

    // 数据库尚未录入字典：一键落库权威默认值（懒种子），之后可在库内直接维护
    if (!dbHasDict) {
      await ensureAuditDictionariesSeeded();
    }

    // 组装用于下拉筛选的标准化选项列表（根据合并后的字典动态生成，去重）
    const actionOptionsMap = new Map<string, string>();
    for (const [value, label] of Object.entries(actionDict)) {
      const normLabel = label.trim();
      if (!actionOptionsMap.has(normLabel)) {
        actionOptionsMap.set(normLabel, value);
      }
    }

    const actionOptions = Array.from(actionOptionsMap.entries()).map(([label, value]) => ({
      value,
      label,
    }));

    return { actionDict, resourceDict, actionOptions };
  } catch (e) {
    console.error("读取数据库审计字典失败:", e);
    // 异常时仍回退到代码默认值，保证后台可用、标签中文
    return {
      actionDict: { ...DEFAULT_ACTION_DICT },
      resourceDict: { ...DEFAULT_RESOURCE_DICT },
      actionOptions: Object.entries(DEFAULT_ACTION_DICT).map(([value, label]) => ({ value, label })),
    };
  }
}

// 智能模糊键值查找：不区分大小写、空格与下划线互转
function lookupDict(key: string, dict: Record<string, string>): string | null {
  if (!key) return null;
  const raw = key.trim();
  if (dict[raw]) return dict[raw];

  // 大小写不敏感
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(dict)) {
    if (k.toLowerCase() === lower) return v;
  }

  // 下划线与空格互转对比
  const withUnder = lower.replace(/\s+/g, "_");
  const withSpace = lower.replace(/_+/g, " ");
  for (const [k, v] of Object.entries(dict)) {
    const kLower = k.toLowerCase();
    if (kLower === withUnder || kLower === withSpace) return v;
  }

  return null;
}

// 智能动作语义转译引擎（防生僻英文泄漏兜底）
function fallbackTranslateAction(action: string): string {
  const clean = action.trim();
  const lower = clean.toLowerCase();

  // 模块前缀识别
  let prefix = "";
  let actBody = lower;
  if (lower.includes(":")) {
    const [mod, ...rest] = lower.split(":");
    actBody = rest.join(":");
    if (mod === "user") prefix = "用户账号";
    else if (mod === "workspace") prefix = "工作空间";
    else if (mod === "component") prefix = "微前端组件";
    else if (mod === "system") prefix = "系统核心";
    else if (mod === "auth") prefix = "安全认证";
    else if (mod === "asset") prefix = "知识资料";
    else if (mod === "security") prefix = "平台安全";
    else if (mod === "knowledge") prefix = "知识资产";
  }

  // 动作动词识别
  const words = actBody.replace(/[:_\s-]+/g, " ").trim().split(" ");
  const translatedWords = words.map((w) => {
    switch (w) {
      case "test": return "测试";
      case "sms": return "短信网关";
      case "email": return "邮件通道";
      case "settings": return "全局配置";
      case "config": return "配置属性";
      case "publish": return "上架发布";
      case "unpublish": return "下架停用";
      case "batch": return "批量";
      case "ban": return "封禁";
      case "unban": return "解封";
      case "kick": return "强制下线";
      case "reset": return "重置";
      case "password": return "登录密码";
      case "session": return "在线会话";
      case "create": return "创建";
      case "update": return "更新";
      case "delete": return "删除";
      case "upgrade": return "升级";
      case "login": return "登录";
      case "logout": return "登出";
      case "register": return "自主注册";
      case "signup": return "自主注册";
      case "membership": return "会员权益";
      case "backup": return "备份";
      case "knowledge": return "知识资产";
      case "task": return "生成任务";
      case "component": return "组件";
      case "bind": return "绑定";
      case "unbind": return "解绑";
      case "archive": return "归档";
      case "oauth": return "第三方登录";
      case "enable": return "启用";
      case "disable": return "停用";
      case "configure": return "配置";
      case "solution": return "解决方案";
      case "enterprise": return "企业版";
      case "join": return "加入";
      case "diagnose": return "诊断";
      case "restricted": return "受限";
      case "positions": return "布局";
      case "plan": return "套餐";
      case "matrix": return "矩阵";
      case "device": return "登录设备";
      case "timeout": return "超时";
      case "conflict": return "冲突";
      case "set": return "设置";
      case "submit": return "提交";
      case "reject": return "驳回";
      case "asset": return "知识资料";
      case "upload": return "上传";
      case "download": return "下载";
      case "limited": return "受限";
      case "replaced": return "替换";
      case "save": return "保存";
      case "custom": return "自定义";
      case "restrictedcomponents": return "受限组件";
      case "custompositions": return "自定义布局";
      case "restricted_components": return "受限组件";
      case "custom_positions": return "自定义布局";
      default: return w;
    }
  });

  const combined = translatedWords.join("");
  return prefix ? `${prefix}: ${combined}` : combined;
}

// 翻译操作动作并生成对应徽章样式（完全基于数据库驱动 + 智能语义防护）
export function translateAction(action: string, actionDict: Record<string, string>) {
  const norm = (action || "").trim();
  const matchedLabel = lookupDict(norm, actionDict);
  const label = matchedLabel || (norm.toUpperCase() === "USER_REGISTER" ? "新用户自主注册" : fallbackTranslateAction(norm));

  const act = norm.toLowerCase();
  let bg = "bg-slate-50";
  let text = "text-slate-700";
  let border = "border-slate-200";

  if (act.includes("role") || act.includes("permission") || act.includes("admin")) {
    bg = "bg-amber-50";
    text = "text-amber-700";
    border = "border-amber-200";
  } else if (act.includes("ban") || act.includes("lock") || act.includes("delete") || act.includes("kick") || act.includes("conflict")) {
    bg = "bg-red-50";
    text = "text-red-700";
    border = "border-red-200";
  } else if (act.includes("register") || act.includes("signup") || act.includes("upgrade") || act.includes("order") || act.includes("plan") || act.includes("recharge") || act.includes("approve") || act.includes("publish")) {
    bg = "bg-emerald-50";
    text = "text-emerald-700";
    border = "border-emerald-200";
  } else if (act.includes("login") || act.includes("auth") || act.includes("session")) {
    bg = "bg-blue-50";
    text = "text-[#2b6cb0]";
    border = "border-blue-200";
  } else if (act.includes("create") || act.includes("add") || act.includes("new")) {
    bg = "bg-purple-50";
    text = "text-purple-700";
    border = "border-purple-200";
  } else if (act.includes("test") || act.includes("sms") || act.includes("email")) {
    bg = "bg-cyan-50";
    text = "text-cyan-700";
    border = "border-cyan-200";
  }

  return { label, bg, text, border };
}

// 翻译涉及业务资源（完全基于数据库驱动 + 智能语义防护）
export function translateResource(resource: string | null | undefined, resourceDict: Record<string, string>): string {
  if (!resource || resource === "-" || resource === "null") return "系统基础环境";
  const clean = resource.trim();

  // 0. 裸业务对象 ID 兜底（如 clxxx / comp_xxx 等无命名空间标识），避免直接回显无意义串
  if (!clean.includes("/") && !clean.includes(":") && !clean.includes(" ")) {
    if (/^[a-z0-9]+$/i.test(clean) && clean.length > 10) {
      const shortId = clean.length > 18 ? `${clean.slice(0, 8)}...${clean.slice(-6)}` : clean;
      return `指定业务对象 (${shortId})`;
    }
  }

  // 1. 字典精准与规范化匹配
  const matched = lookupDict(clean, resourceDict);
  if (matched) return matched;

  // 2. 路径层级资源解析（如 auth/session）
  if (clean.includes("/")) {
    const parts = clean.split("/");
    return parts.map((p) => lookupDict(p, resourceDict) || p).join(" / ");
  }

  // 3. 命名空间与实体 ID 解析（如 user:clxxxxxx）
  if (clean.includes(":")) {
    const [type, id] = clean.split(":");
    const typeZh = lookupDict(type, resourceDict) || type;
    const shortId = id.length > 18 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
    return `${typeZh} (${shortId})`;
  }

  // 4. 常见复合英文词根兜底转译
  if (clean.includes("_") || clean.includes(" ")) {
    const words = clean.toLowerCase().replace(/_+/g, " ").split(" ");
    const translated = words.map((w) => {
      switch (w) {
        case "sms": return "短信";
        case "gateway": return "网关通道";
        case "email": return "邮件";
        case "database": return "数据库";
        case "snapshot": return "快照";
        case "oauth": return "第三方认证";
        case "channels": return "登录渠道";
        case "config": return "配置";
        case "system": return "系统";
        case "settings": return "设置";
        case "user": return "用户";
        case "workspace": return "工作空间";
        case "member": return "成员";
        case "component": return "组件";
        case "password": return "登录密码";
        case "security": return "平台安全";
        case "knowledge": return "知识资产";
        case "task": return "生成任务";
        case "smtp": return "邮件SMTP";
        case "auth": return "安全认证";
        case "device": return "登录设备";
        case "session": return "在线会话";
        case "matrix": return "矩阵";
        case "positions": return "布局";
        case "asset": return "知识资料";
        default: return w;
      }
    }).join("");
    return translated;
  }

  return clean;
}
