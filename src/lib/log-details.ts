// 操作日志细节字段（details）前端中文翻译与格式化工具。
// 纯函数、无 prisma 依赖，可在客户端组件安全引用。
// 仅负责把结构化 details 的「键」译为可读中文、把常见值（如状态枚举）本地化；
// 真实数据仍来自各写入点，不在此处伪造任何内容。

export const DETAIL_KEY_LABELS: Record<string, string> = {
  message: "操作摘要",
  type: "类型",
  reason: "原因",
  status: "结果状态",
  detail: "详情说明",
  workspaceName: "工作空间名称",
  workspaceType: "工作空间类型",
  workspacePlan: "目标套餐",
  workspaceVisibility: "可见性",
  fromPlan: "原套餐",
  toPlan: "新套餐",
  planName: "套餐名称",
  fromType: "原类型",
  toType: "新类型",
  targetUserId: "目标用户ID",
  kickedUserId: "被移出用户ID",
  newRole: "新角色",
  roles: "角色列表",
  role: "角色",
  invitationCode: "邀请码",
  solution: "解决方案",
  configuredAt: "配置时间",
  phone: "手机号",
  provider: "短信服务商",
  signName: "短信签名",
  templateCode: "模板编号",
  latencyMs: "耗时(毫秒)",
  toEmail: "收件邮箱",
  smtpHost: "SMTP主机",
  smtpPort: "SMTP端口",
  messageId: "邮件消息ID",
  backupTime: "备份时间",
  summary: "备份摘要",
  updatedKeys: "变更配置项",
  passwordUpdated: "密码已更新",
  email: "邮箱",
  twoFactorEnabled: "两步验证",
  restrictedIds: "受限组件ID",
  positions: "布局位置",
  sourceTaskId: "来源任务ID",
  reviewer: "审核人ID",
  comment: "审核意见",
  knowledgeId: "知识ID",
  componentId: "组件ID",
  taskId: "任务ID",
  deletedCount: "删除数量",
  deviceId: "设备ID",
  operatorName: "操作人",
  openid: "第三方OpenID",
  oldSessionToken: "旧会话令牌",
  newSessionToken: "新会话令牌",
  ipAddress: "客户端IP",
  userAgent: "客户端环境",
  deletionDeadline: "注销截止时间",
  cooldownDays: "冷静期天数",
  accountType: "注册方式",
  userName: "用户名",
  deletionRequestedAt: "注销申请时间",
  archivedAt: "归档时间",
  deletedAt: "删除时间",
  updatedAt: "更新时间",
  boundAt: "绑定时间",
  unboundAt: "解绑时间",
  enabled: "是否启用",
  option: "选项",
  visibility: "可见性",
  documentId: "文档ID",
  targetComponentId: "目标组件ID",
  safetyScore: "安全评分",
  environmentScale: "部署规模",
  isolationLevel: "隔离级别",
  complianceType: "合规类型",
  score: "评分",
};

export function translateDetailKey(key: string): string {
  if (DETAIL_KEY_LABELS[key]) return DETAIL_KEY_LABELS[key];
  // 兜底：驼峰 / 下划线转可读中文友好串
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_]+/g, " ")
    .trim();
}

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "成功",
  FAIL: "失败",
  FAILED: "失败",
  OK: "成功",
  PENDING: "处理中",
  MANUAL: "手动",
  TIMEOUT: "超时",
  ACTIVE: "生效",
  INACTIVE: "停用",
  BANNED: "已封禁",
  ENABLED: "已启用",
  DISABLED: "已停用",
  REJECTED: "已驳回",
  APPROVED: "已通过",
};

export function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  const up = s.toUpperCase();
  if (STATUS_LABELS[up]) return STATUS_LABELS[up];
  return s;
}

// 把 details（对象或 JSON 字符串）安全解析为对象；无法解析时返回 null
export function parseLogDetails(details: unknown): Record<string, unknown> | string | null {
  if (details === null || details === undefined) return null;
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : details;
    } catch {
      return details; // 纯文本细节，原样返回
    }
  }
  if (typeof details === "object") return details as Record<string, unknown>;
  return String(details);
}
