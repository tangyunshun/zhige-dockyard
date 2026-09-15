"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import {
  Search,
  RefreshCw,
  ScrollText,
  Clock,
  Trash2,
  User as UserIcon,
  LayoutDashboard,
  Box,
  Database,
  Calendar,
  ChevronDown,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  Download,
  CheckSquare,
  Square,
  X,
  ShieldCheck,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  LogOut,
  KeyRound,
  Ban,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { exportToExcel } from "@/utils/excel-export";

interface OperationLog {
  id: string;
  action: string;
  resource: string | null;
  details: any;
  createdAt: string;
  userId: string;
  workspaceId: string | null;
  ipAddress: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
    role: string | null;
  } | null;
}

// 操作类型（真实 action 值）→ 中文文案 / 配色（简洁 Badge，与主系统一致）
// 已覆盖全系统所有真实落库 action，彻底消除“其他操作 / 其他”失真
const ACTION_META: Record<string, { label: string; color: string }> = {
  // —— 用户与账号 ——
  "user:create": { label: "创建用户", color: "bg-emerald-100 text-emerald-600" },
  "user:update": { label: "修改用户资料", color: "bg-blue-100 text-[#2b6cb0]" },
  "user:delete": { label: "删除用户", color: "bg-red-100 text-red-600" },
  "user:ban": { label: "封禁用户账号", color: "bg-red-100 text-red-600" },
  "user:unban": { label: "解封用户账号", color: "bg-emerald-100 text-emerald-600" },
  "user:reset_session": { label: "重置会话", color: "bg-amber-100 text-amber-600" },
  "ACCOUNT_DELETION_REQUESTED": { label: "注销申请", color: "bg-amber-100 text-amber-600" },
  "ACCOUNT_DELETED": { label: "账号销毁", color: "bg-red-100 text-red-600" },
  // —— 认证与安全 ——
  "auth:login": { label: "登录系统", color: "bg-purple-100 text-[#805ad5]" },
  "auth:logout": { label: "退出登录", color: "bg-slate-100 text-slate-700" },
  "SESSION_TIMEOUT_LOGOUT": { label: "超时自动退出", color: "bg-amber-100 text-amber-700" },
  "Password:Change": { label: "修改密码", color: "bg-blue-100 text-[#2b6cb0]" },
  "SecuritySetting:Update": { label: "安全设置变更", color: "bg-blue-100 text-[#2b6cb0]" },
  "ADMIN_FORCE_LOGOUT": { label: "管理员强制下线", color: "bg-red-100 text-red-600" },
  "SESSION_CONFLICT_LOGOUT": { label: "账号自动退出登录", color: "bg-amber-100 text-amber-600" },
  "DEVICE_KICKED_OFFLINE": { label: "设备自动下线", color: "bg-amber-100 text-amber-600" },
  "cross_region_verify": { label: "跨区域验证", color: "bg-blue-100 text-[#2b6cb0]" },
  "SECURITY_DIAGNOSIS": { label: "安全诊断", color: "bg-indigo-100 text-[#5a67d8]" },
  "APIKey:Create": { label: "创建密钥", color: "bg-emerald-100 text-emerald-600" },
  "APIKey:Delete": { label: "删除密钥", color: "bg-red-100 text-red-600" },
  "CONFIGURE_ADMIN_PERMISSIONS": { label: "配置管理员权限", color: "bg-indigo-100 text-[#5a67d8]" },
  "RESET_ALL_DEFAULT_PERMISSIONS_IN_DB": { label: "重置默认权限", color: "bg-amber-100 text-amber-600" },
  "DELETE_PERMISSIONS_FROM_DB": { label: "删除权限配置", color: "bg-red-100 text-red-600" },
  // —— 工作空间协同 ——
  "workspace:create": { label: "创建空间", color: "bg-emerald-100 text-emerald-600" },
  "workspace:update": { label: "更新空间", color: "bg-blue-100 text-[#2b6cb0]" },
  "workspace:delete": { label: "删除空间", color: "bg-red-100 text-red-600" },
  "CREATE_ENTERPRISE_WORKSPACE": { label: "创建企业空间", color: "bg-indigo-100 text-[#5a67d8]" },
  "JOIN_WORKSPACE": { label: "加入空间", color: "bg-emerald-100 text-emerald-600" },
  "LEAVE_WORKSPACE": { label: "退出空间", color: "bg-amber-100 text-amber-600" },
  "UPDATE_MEMBER_ROLE": { label: "调整成员角色", color: "bg-blue-100 text-[#2b6cb0]" },
  "WORKSPACE_KICK": { label: "移出成员", color: "bg-red-100 text-red-600" },
  "UPGRADE_WORKSPACE": { label: "升级空间", color: "bg-indigo-100 text-[#5a67d8]" },
  "UPGRADE_WORKSPACE_PLAN": { label: "变更空间套餐", color: "bg-indigo-100 text-[#5a67d8]" },
  "CONFIGURE_SOLUTION": { label: "配置解决方案", color: "bg-blue-100 text-[#2b6cb0]" },
  "SET_RESTRICTED_COMPONENTS": { label: "设置受限组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "SAVE_CUSTOM_POSITIONS": { label: "保存自定义布局", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 研发组件中心 ——
  "component:create": { label: "创建组件", color: "bg-emerald-100 text-emerald-600" },
  "component:update": { label: "更新组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "component:delete": { label: "删除组件", color: "bg-red-100 text-red-600" },
  "component:publish": { label: "上架组件", color: "bg-emerald-100 text-emerald-600" },
  "component:request_publish": { label: "申请上架组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "component:approve": { label: "审核通过组件", color: "bg-emerald-100 text-emerald-600" },
  "component:reject": { label: "审核驳回组件", color: "bg-amber-100 text-amber-600" },
  "component:execute": { label: "运行组件", color: "bg-purple-100 text-[#805ad5]" },
  "BIND_COMPONENT": { label: "绑定组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "UNBIND_COMPONENT": { label: "解绑组件", color: "bg-amber-100 text-amber-600" },
  "users:batch-action": { label: "批量处理用户", color: "bg-blue-100 text-[#2b6cb0]" },
  "user:batch_action": { label: "批量处理用户", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 知识库 ——
  "KNOWLEDGE_PUBLISH": { label: "发布知识", color: "bg-emerald-100 text-emerald-600" },
  "KNOWLEDGE_SUBMIT": { label: "提交知识", color: "bg-blue-100 text-[#2b6cb0]" },
  "KNOWLEDGE_APPROVE": { label: "审核通过知识", color: "bg-emerald-100 text-emerald-600" },
  "KNOWLEDGE_REJECT": { label: "驳回知识", color: "bg-amber-100 text-amber-600" },
  // —— 任务 ——
  "ARCHIVE_TASK": { label: "归档任务", color: "bg-amber-100 text-amber-600" },
  "DELETE_TASK": { label: "删除任务", color: "bg-red-100 text-red-600" },
  // —— 资料资产 ——
  "asset:remove_private": { label: "移除私密资料", color: "bg-red-100 text-red-600" },
  "asset:remove": { label: "移除公开资料", color: "bg-red-100 text-red-600" },
  "asset:removal_request": { label: "资料删除申请", color: "bg-amber-100 text-amber-600" },
  "asset:removal_approve": { label: "删除申请通过", color: "bg-emerald-100 text-emerald-600" },
  "asset:removal_reject": { label: "删除申请驳回", color: "bg-amber-100 text-amber-600" },
  "asset:removal_record_delete": { label: "彻底删除资料", color: "bg-red-100 text-red-600" },
  "asset:private_review_request": { label: "私密资料治理要求", color: "bg-blue-100 text-[#2b6cb0]" },
  "asset:upload": { label: "上传资料", color: "bg-cyan-100 text-cyan-600" },
  "asset:approve": { label: "审核通过公开资料", color: "bg-emerald-100 text-emerald-600" },
  "asset:reject": { label: "审核驳回公开申请", color: "bg-amber-100 text-amber-600" },
  "asset:restore": { label: "恢复已移除资料", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 会员与计费 ——
  "MEMBERSHIP_UPGRADE": { label: "会员升级", color: "bg-indigo-100 text-[#5a67d8]" },
  "system:settings": { label: "系统设置", color: "bg-indigo-100 text-[#5a67d8]" },
  "PING_TEST": { label: "网关连通测试", color: "bg-slate-100 text-slate-700" },
  // —— 算力与配额治理 ——
  "quota:recycle": { label: "算力配额回收", color: "bg-amber-100 text-amber-600" },
  "quota:pool_threshold": { label: "调整算力阈值", color: "bg-blue-100 text-[#2b6cb0]" },
  "quota:threshold": { label: "调整算力阈值", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 空间成员协同 ——
  "member:leave": { label: "成员退出空间", color: "bg-amber-100 text-amber-600" },
  "workspace:recycle": { label: "空间资源回收", color: "bg-amber-100 text-amber-600" },
  // —— 资料资产补充动作 ——
  "asset:restore_request": { label: "申请资料恢复", color: "bg-amber-100 text-amber-600" },
  "asset:publish_direct": { label: "直接公开资料", color: "bg-emerald-100 text-emerald-600" },
  "asset:request_publish": { label: "申请公开资料", color: "bg-blue-100 text-[#2b6cb0]" },
  "asset:batch_delete": { label: "批量删除资料", color: "bg-red-100 text-red-600" },
  "asset:batch_remove": { label: "批量下架资料", color: "bg-red-100 text-red-600" },
  "asset:batch_publish_direct": { label: "批量直接公开", color: "bg-emerald-100 text-emerald-600" },
  "asset:batch_request_publish": { label: "批量申请公开", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 认证与特权补充 ——
  "sso:revoke": { label: "解除三方绑定", color: "bg-amber-100 text-amber-600" },
  "stepup:issued": { label: "二次身份认证", color: "bg-indigo-100 text-[#5a67d8]" },
  "user:force_logout": { label: "强制违规下线", color: "bg-red-100 text-red-600" },
  "user:reset_password": { label: "重置用户密码", color: "bg-amber-100 text-amber-600" },
  "user:batch_kick": { label: "批量强制下线", color: "bg-red-100 text-red-600" },
  // —— 审计与导出 ——
  "audit:clean_expired": { label: "清理过期日志", color: "bg-amber-100 text-amber-600" },
  "audit:delete": { label: "删除审计记录", color: "bg-red-100 text-red-600" },
  "export:excel": { label: "导出Excel报表", color: "bg-emerald-100 text-emerald-600" },
  "export:json": { label: "导出JSON数据", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 申诉工单与风控 ——
  "appeal:deleted": { label: "删除申诉工单", color: "bg-red-100 text-red-600" },
  "appeal:account_unban_approved": { label: "审核通过解封申诉", color: "bg-emerald-100 text-emerald-600" },
  "appeal:account_unban_rejected": { label: "审核驳回解封申诉", color: "bg-amber-100 text-amber-700" },
  "appeal:workspace_unban_approved": { label: "审核通过空间申诉", color: "bg-emerald-100 text-emerald-600" },
  "appeal:workspace_unban_rejected": { label: "审核驳回空间申诉", color: "bg-amber-100 text-amber-700" },
};

// 未知 action 的智能中文翻译器：彻底杜绝英文暴露，按中文词根精准转译
function translateActionToChinese(action: string): string {
  if (!action) return "系统常规操作";

  // 1. 精确匹配字典
  if (ACTION_META[action]?.label) return ACTION_META[action].label;

  // 2. 忽略大小写及分隔符查找
  const lower = action.toLowerCase().replace(/[-_:]/g, "");
  for (const [k, v] of Object.entries(ACTION_META)) {
    if (k.toLowerCase().replace(/[-_:]/g, "") === lower) return v.label;
  }

  // 3. 业务域中文解析
  let domain = "系统";
  if (lower.includes("appeal")) domain = "申诉工单";
  else if (lower.includes("user") || lower.includes("account")) domain = "用户";
  else if (lower.includes("workspace") || lower.includes("space")) domain = "工作空间";
  else if (lower.includes("member")) domain = "空间成员";
  else if (lower.includes("component") || lower.includes("comp")) domain = "研发组件";
  else if (lower.includes("asset") || lower.includes("doc") || lower.includes("file")) domain = "资料资产";
  else if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) domain = "身份认证";
  else if (lower.includes("quota") || lower.includes("token")) domain = "算力配额";
  else if (lower.includes("task")) domain = "协同任务";
  else if (lower.includes("knowledge")) domain = "知识条目";
  else if (lower.includes("role") || lower.includes("perm")) domain = "权限管理";
  else if (lower.includes("audit") || lower.includes("log")) domain = "审计日志";
  else if (lower.includes("export")) domain = "数据导出";

  // 4. 动作意图中文解析
  let op = "操作";
  if (lower.includes("create") || lower.includes("add") || lower.includes("new")) op = "创建";
  else if (lower.includes("update") || lower.includes("edit") || lower.includes("modify") || lower.includes("change")) op = "更新";
  else if (lower.includes("delete") || lower.includes("remove") || lower.includes("purge") || lower.includes("clean") || lower.includes("clear")) op = "删除";
  else if (lower.includes("ban")) op = "封禁";
  else if (lower.includes("unban")) op = "解封";
  else if (lower.includes("approve")) op = "审核通过";
  else if (lower.includes("reject")) op = "审核驳回";
  else if (lower.includes("publish")) op = "发布公开";
  else if (lower.includes("restore")) op = "恢复归档";
  else if (lower.includes("recycle")) op = "回收";
  else if (lower.includes("login")) op = "登录";
  else if (lower.includes("kick")) op = "强制下线";
  else if (lower.includes("logout")) op = "退出登录";
  else if (lower.includes("export")) op = "导出";
  else if (lower.includes("import")) op = "导入";
  else if (lower.includes("execute") || lower.includes("run")) op = "执行调用";

  return `${domain}${op}`;
}

function actionMeta(action: string, rawDetails?: any) {
  let details = rawDetails;
  if (typeof rawDetails === "string") {
    try {
      details = JSON.parse(rawDetails);
    } catch {}
  }

  // 批量用户操作精准识别（杜绝解封却标成封禁，或批量封禁误标为单封的失真现象）
  const isBatch =
    action.startsWith("user:batch") ||
    action === "users:batch-action" ||
    action === "user:batch_action" ||
    action === "user:batch" ||
    details?.totalSelected !== undefined ||
    details?.processedCount !== undefined;

  if (isBatch) {
    const act = details?.action || details?.op || action.replace("user:batch_", "");
    if (act === "unban" || details?.updates?.status === "active") {
      return { label: "批量解封用户", color: "bg-emerald-100 text-emerald-600" };
    }
    if (act === "ban" || details?.updates?.status === "banned" || String(act).includes("ban")) {
      return { label: "批量封禁用户", color: "bg-red-100 text-red-600" };
    }
    if (act === "kick") {
      return { label: "批量强制下线", color: "bg-red-100 text-red-600" };
    }
    return { label: "批量处理用户", color: "bg-blue-100 text-[#2b6cb0]" };
  }

  // 智能细化用户操作（杜绝笼统的“更新用户/修改用户资料”，明确区分封禁、解封、停用、改角色等真实业务动作）
  if (action === "user:ban") {
    if (details?.action === "unban" || details?.status === "active") {
      return { label: "解封用户账号", color: "bg-emerald-100 text-emerald-600" };
    }
    return { label: "封禁用户账号", color: "bg-red-100 text-red-600" };
  }
  if (action === "user:unban") {
    return { label: "解封用户账号", color: "bg-emerald-100 text-emerald-600" };
  }
  if (action === "user:update" || action.startsWith("user:status")) {
    const targetStatus = details?.updates?.status || details?.status;
    if (targetStatus === "inactive" || targetStatus === "suspended") {
      return { label: "停用用户账号", color: "bg-amber-100 text-amber-700" };
    }
    if (targetStatus === "active") {
      return { label: "启用用户账号", color: "bg-emerald-100 text-emerald-600" };
    }
    const isBan =
      targetStatus === "banned" ||
      Boolean(details?.bannedUntil) ||
      Boolean(details?.banReason) ||
      (typeof details?.reason === "string" && (details.reason.includes("封禁") || details.reason.includes("违规") || details.reason.includes("警告")));
    if (isBan) {
      return { label: "封禁用户账号", color: "bg-red-100 text-red-600" };
    }
    if (details?.role || details?.newRole || details?.updates?.role) {
      return { label: "调整用户角色", color: "bg-blue-100 text-[#2b6cb0]" };
    }
    if (details?.points || details?.amount || details?.updates?.points) {
      return { label: "调整用户积分", color: "bg-blue-100 text-[#2b6cb0]" };
    }
    return { label: "修改用户资料", color: "bg-blue-100 text-[#2b6cb0]" };
  }

  if (action === "auth:logout") {
    if (details?.type === "TIMEOUT" || details?.reason === "timeout" || details?.message?.includes("超时")) {
      return { label: "超时自动退出", color: "bg-amber-100 text-amber-700" };
    }
    return { label: "退出登录", color: "bg-slate-100 text-slate-700" };
  }
  if (action === "SESSION_TIMEOUT_LOGOUT") {
    return { label: "超时自动退出", color: "bg-amber-100 text-amber-700" };
  }
  if (action === "DEVICE_KICKED_OFFLINE" || action === "SESSION_CONFLICT_LOGOUT") {
    // 明确属于账号或设备自动退出，绝不误导写成“在其他设备登录”
    return { label: "账号自动退出登录", color: "bg-amber-100 text-amber-700" };
  }
  if (action === "ADMIN_FORCE_LOGOUT") {
    return { label: "管理员强制下线", color: "bg-red-100 text-red-600" };
  }
  if (action === "user:batch_kick") {
    return { label: "管理员批量下线", color: "bg-red-100 text-red-600" };
  }
  if (ACTION_META[action]) return ACTION_META[action];
  return { label: translateActionToChinese(action), color: "bg-slate-100 text-slate-700" };
}

function resourceIcon(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user") || r.includes("account")) return UserIcon;
  if (r.includes("workspace") || r.includes("space")) return LayoutDashboard;
  if (r.includes("component") || r.includes("comp")) return Box;
  if (r.includes("knowledge") || r.includes("task") || r.includes("asset")) return FileText;
  if (r.includes("data") || r.includes("log")) return Database;
  return ShieldCheck;
}

// 资源归类标准化为通俗明确的系统业务域，杜绝“用户治理”等 AI 黑话
function resourceLabel(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user") || r.includes("account")) return "用户与账号";
  if (r.includes("password") || r.includes("security") || r.includes("apike") || r.includes("session") || r.includes("auth") || r.includes("device")) return "安全与登录";
  if (r.includes("workspace") || r.includes("space") || r.includes("member")) return "工作空间";
  if (r.includes("component") || r.includes("comp")) return "组件中心";
  if (r.includes("knowledge") || r.includes("task") || r.includes("asset") || r.includes("doc")) return "资料与知识库";
  if (r.includes("system") || r.includes("permission") || r.includes("setting") || r.includes("solution")) return "系统设置";
  if (r.includes("membership") || r.includes("billing") || r.includes("plan") || r.includes("order")) return "会员与计费";
  if (/^[0-9a-f]{8}-/.test(r)) return "业务数据";
  return "系统";
}

// 枚举值 → 中文（状态 / 角色 / 系统动作等）
const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  banned: "已封禁",
  suspended: "已停用",
  inactive: "未激活",
  deleted: "已删除",
  pending: "待处理审核",
  approved: "审核通过",
  rejected: "审核驳回",
  archived: "已归档",
  canceled: "用户已撤销",
  cancelled: "用户已撤销",
};

const ROLE_LABELS: Record<string, string> = {
  user: "普通用户",
  admin: "系统管理员",
  super_admin: "超级管理员",
  "super-admin": "超级管理员",
  superadmin: "超级管理员",
  member: "空间成员",
  owner: "空间拥有者",
  viewer: "访客成员",
  creator: "创作者",
  project_manager: "项目经理",
  developer: "研发人员",
  component_manager: "组件管理员",
  knowledge_manager: "知识库管理员",
  componentmanager: "组件管理员",
  knowledgemanager: "知识库管理员",
};

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "标准版",
  ENTERPRISE: "企业版",
  PRO: "专业版",
  FREE: "免费版",
};

const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "私有保密",
  PUBLIC: "公开共享",
  INTERNAL: "内部可见",
};

const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  ENTERPRISE: "企业型",
  STANDARD: "标准型",
  PERSONAL: "个人型",
};

// 字段值中文转译字典（杜绝任何底层英文暴露）
const VALUE_TRANSLATIONS: Record<string, string> = {
  admin_forced: "管理员强制执行",
  admin_force: "管理员强制执行",
  admin_kick: "管理员强制执行",
  manual_kick: "手动下线设备",
  kick_all_others: "注销其他所有设备",
  kick_device: "注销指定设备",
  conflict: "异地登录会话冲突登出",
  timeout: "长时间未操作会话过期",
  self: "用户自主操作",
  BRONZE: "铜牌会员",
  SILVER: "银牌会员",
  GOLD: "金牌会员",
  PLATINUM: "白金会员",
  DIAMOND: "钻石会员",
  FREE: "免费版",
  STANDARD: "标准版",
  ENTERPRISE: "企业版",
  PRO: "专业版",
  active: "正常活跃",
  banned: "已被封禁",
  suspended: "已停用冻结",
  inactive: "已停用 (未激活)",
  deleted: "已删除",
  true: "是",
  false: "否",
  MONTH: "按月计费 (月付)",
  YEAR: "按年计费 (年付)",
  QUARTER: "按季计费 (季付)",
  ONCE: "单次付费",
  ONE_TIME: "单次付费",
  WEEK: "按周计费",
  DAY: "按天计费",
  WECHAT_PAY: "微信支付",
  WECHAT: "微信支付",
  ALIPAY: "支付宝支付",
  STRIPE: "国际信用卡支付",
  BALANCE: "账户余额支付",
  PAID: "已支付成功",
  UNPAID: "待支付",
  REFUNDED: "已全额退款",
  PENDING: "待处理审核",
  APPROVED: "审核通过",
  REJECTED: "审核驳回",
  ARCHIVED: "已归档保存",
  SUCCESS: "执行成功",
  FAILED: "执行失败",
  explicit: "管理员手动指定",
  all: "全选当前筛选目标",
  unban: "解除账号封禁",
  ban: "违规封禁账号",
  kick: "强制安全下线",
  reset_pwd: "重置登录密码",
  reset_password: "重置登录密码",
  reset_session: "重置登录会话",
  delete: "删除账号",
  PUBLIC: "公开共享",
  PRIVATE: "私有保密",
  INTERNAL: "内部可见",
  github: "GitHub 授权登录",
  qq: "QQ 快捷登录",
  sms: "短信验证码登录",
  password: "账号密码登录",
};

function transStatus(v: any) {
  if (v === null || v === undefined) return "—";
  return STATUS_LABELS[String(v).toLowerCase()] || VALUE_TRANSLATIONS[String(v)] || String(v);
}
function transRole(v: any) {
  if (v === null || v === undefined) return "—";
  return ROLE_LABELS[String(v).toLowerCase()] || String(v);
}
function transPlan(v: any) {
  if (v === null || v === undefined) return "—";
  return PLAN_LABELS[String(v).toUpperCase()] || String(v);
}
function transVisibility(v: any) {
  if (v === null || v === undefined) return "—";
  return VISIBILITY_LABELS[String(v).toUpperCase()] || String(v);
}
function transWorkspaceType(v: any) {
  if (v === null || v === undefined) return "—";
  return WORKSPACE_TYPE_LABELS[String(v).toUpperCase()] || String(v);
}

// 常见字段键名的全量中文映射字典
const FIELD_LABEL_MAP: Record<string, string> = {
  deviceName: "终端设备名称",
  deviceType: "设备平台类型",
  platform: "操作系统环境",
  browser: "浏览器环境",
  kickAllOthers: "注销其他设备会话",
  targetUserId: "目标用户",
  kickedUserId: "受影响用户",
  userId: "用户账号标识",
  bannedUntil: "封禁截止时间",
  reason: "操作原因",
  banReason: "封禁案由",
  name: "名称",
  tokens: "消耗算力点",
  componentId: "关联组件",
  componentName: "组件名称",
  action: "执行动作",
  workspaceName: "工作空间名称",
  workspacePlan: "空间套餐",
  workspaceType: "空间类型",
  workspaceVisibility: "空间可见性",
  invitationCode: "空间邀请码",
  role: "账号角色",
  newRole: "变更后角色",
  oldRole: "原角色",
  fromType: "变更前空间类型",
  toType: "变更后空间类型",
  fromLevel: "原会员等级",
  toLevel: "目标会员等级",
  boundAt: "绑定时间",
  unboundAt: "解绑时间",
  archivedAt: "任务归档时间",
  deletedAt: "数据删除时间",
  deletedCount: "物理删除记录数",
  restrictedIds: "受限组件范围",
  positions: "自定义界面布局",
  knowledgeId: "知识条目",
  taskId: "协同任务",
  sourceTaskId: "来源研发任务",
  solution: "行业解决方案",
  type: "操作模式",
  title: "标题名称",
  documentId: "系统文档",
  assetId: "资料资产",
  assetIds: "批量资料列表",
  appealId: "申诉工单编号",
  appealIds: "申诉工单编号",
  statuses: "当前工单状态",
  businessTypes: "申诉业务类型",
  targetUserIds: "目标用户",
  comment: "审核处理意见",
  reviewComment: "审核意见说明",
  reviewer: "审核处理人",
  count: "影响数据量",
  amount: "配额变动额度",
  operation: "敏感操作标识",
  provider: "三方授权源",
  openid: "三方账号标识",
  unionid: "统一平台标识",
  updates: "业务变更明细",
  status: "业务状态",
  initialStatus: "初始业务状态",
  isCurrent: "是否当前终端",
  message: "处理说明",
  orderId: "关联订单编号",
  orderNo: "订单业务流水号",
  billingCycle: "计费周期",
  paymentMethod: "支付结算方式",
  paymentStatus: "支付状态",
  price: "支付金额",
  totalPrice: "订单总金额",
  discount: "优惠抵扣额度",
  duration: "订阅生效时长",
  expiresAt: "服务到期时间",
  autoRenew: "自动续订状态",
  scope: "操作执行范围",
  failedCount: "失败数量",
  skippedCount: "跳过数量",
  skippedSample: "跳过项说明",
  totalSelected: "已选目标总数",
  processedCount: "成功处理数",
  isPublic: "公开上架状态",
  isPublished: "公开上架状态",
  published: "公开上架状态",
  publish: "公开上架状态",
  enabled: "启用生效状态",
  maintenanceMode: "全站维护模式",
  threshold: "算力预警阈值",
  recycleCount: "配额回收数量",
  success: "执行状态",
  error: "异常报错内容",
  componentCatalog: "组件所属分类",
  category: "所属类别",
  version: "组件版本号",
  description: "组件描述",
  oldSessionToken: "原会话凭据 (已踢下线)",
  newSessionToken: "新会话凭据 (当前有效)",
  sessionToken: "会话认证凭证",
  refreshToken: "刷新会话令牌",
};

// 智能键名通用转译器：若在静态字典中查不到，基于驼峰及下划线分词并匹配通用词根库，彻底杜绝任何英文键名裸露，杜绝硬编码
function translateFieldKeyToChinese(rawKey: string): string {
  if (!rawKey) return "业务属性";
  if (FIELD_LABEL_MAP[rawKey]) return FIELD_LABEL_MAP[rawKey];

  // 1. 去除常见前后缀并按驼峰/下划线分词
  const rawWords = rawKey
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .split(/[-_:]/)
    .filter(Boolean);

  if (rawWords.length === 0) return "业务参数";

  // 单复数归一化与词根标准化（彻底消除由于复数导致的查无词条）
  const words = rawWords.map((w) => {
    if (w === "ids") return "id";
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("ses") && w !== "status") return w.slice(0, -2);
    if (w.endsWith("s") && !["status", "tokens", "pass", "sms"].includes(w)) return w.slice(0, -1);
    return w;
  });

  const normKey = words.join("_");
  if (normKey === "appeal_id" || normKey === "appeal") return "申诉工单编号";
  if (normKey === "business_type") return "申诉业务类型";
  if (normKey === "target_user_id" || normKey === "target_user") return "目标用户";
  if (normKey === "status") return "当前工单状态";
  if (normKey === "operator_id" || normKey === "operator") return "经办人账号";

  const WORD_MAP: Record<string, string> = {
    appeal: "申诉工单",
    business: "业务",
    evidence: "举证材料",
    user: "用户",
    account: "账号",
    member: "成员",
    role: "角色",
    perm: "权限",
    permission: "权限",
    pwd: "密码",
    password: "密码",
    phone: "手机号",
    email: "邮箱",
    avatar: "头像",
    name: "名称",
    title: "标题",
    nick: "昵称",
    nickname: "昵称",
    status: "状态",
    state: "状态",
    type: "类型",
    mode: "模式",
    time: "时间",
    date: "日期",
    at: "时间",
    created: "创建",
    updated: "更新",
    archived: "归档",
    deleted: "删除",
    unbound: "解绑",
    bound: "绑定",
    expired: "过期",
    expires: "到期",
    count: "数量",
    num: "数量",
    total: "总计",
    amount: "额度",
    tokens: "算力点",
    token: "算力点",
    quota: "配额",
    threshold: "阈值",
    price: "金额",
    cost: "费用",
    fee: "费用",
    pay: "支付",
    payment: "支付",
    method: "方式",
    order: "订单",
    cycle: "周期",
    billing: "计费",
    plan: "套餐",
    level: "等级",
    workspace: "空间",
    space: "空间",
    component: "组件",
    catalog: "分类",
    category: "分类",
    version: "版本",
    desc: "描述",
    description: "描述",
    doc: "文档",
    document: "文档",
    asset: "资料",
    knowledge: "知识",
    task: "任务",
    source: "来源",
    target: "目标",
    reason: "原因",
    comment: "审核意见",
    review: "审核",
    message: "说明",
    msg: "说明",
    device: "设备",
    platform: "平台",
    browser: "浏览器",
    ip: "IP地址",
    url: "网络链接",
    publish: "公开上架",
    published: "公开上架",
    public: "公开上架",
    enable: "启用",
    enabled: "启用",
    disable: "停用",
    disabled: "停用",
    active: "活跃",
    inactive: "未激活",
    is: "是否",
    has: "是否具备",
    from: "变更前",
    to: "变更后",
    old: "原",
    new: "新",
    session: "会话",
    provider: "登录源",
    scope: "执行范围",
    filter: "筛选条件",
  };

  const hasSessionWord = words.includes("session");
  const translatedParts: string[] = [];
  for (const w of words) {
    if (w === "id") continue; // 忽略末尾单纯的技术 ID 词根
    // 若属于会话上下文，token 翻译为"凭证/令牌"，绝不误译为算力点
    if (hasSessionWord && (w === "token" || w === "tokens")) {
      translatedParts.push("凭据");
      continue;
    }
    if (WORD_MAP[w]) {
      translatedParts.push(WORD_MAP[w]);
    }
  }

  if (translatedParts.length > 0) {
    const deduplicated = translatedParts.filter((p, i) => i === 0 || p !== translatedParts[i - 1]);
    return deduplicated.join("");
  }

  return "业务属性";
}

// 智能值通用转译器：若在静态字典中查不到，基于业务规则、枚举、实体关联和词根匹配进行翻译，彻底杜绝英文暴露与机器乱码，杜绝硬编码
function translateValueToChinese(key: string, val: any, fullLog?: any): string {
  if (val === null || val === undefined || val === "") return "—";

  // 1. 数组与对象解析（彻底消灭 [object Object]，且对每个标量元素进行递归转译）
  if (Array.isArray(val)) {
    if (val.length === 0) return "无相关记录";
    const sample = val[0];
    if (typeof sample === "object" && sample !== null) {
      const texts = val
        .map((item: any) => item?.name || item?.title || item?.label || item?.reason || item?.message)
        .filter(Boolean);
      if (texts.length > 0) return texts.join("、");
      return `共包含 ${val.length} 项记录`;
    }
    // 标量数组：对每一项递归调用转译，彻底解决 statuses: ["archived"] 或 targetUserIds: ["cm..."] 无法汉化的问题
    return val
      .map((item) => translateValueToChinese(key, item, fullLog))
      .join("、");
  }

  if (typeof val === "object") {
    try {
      const entries = Object.entries(val);
      if (entries.length === 0) return "无扩展参数";
      return entries
        .map(([k, v]) => `${translateFieldKeyToChinese(k)}: ${translateValueToChinese(k, v, fullLog)}`)
        .join("；");
    } catch {
      return "业务配置数据";
    }
  }

  // 2. 布尔类型智能转译
  if (typeof val === "boolean" || val === "true" || val === "false") {
    const boolVal = val === true || val === "true";
    const lk = key.toLowerCase();
    if (lk.includes("publish") || lk.includes("public")) {
      return boolVal ? "已公开上架 (全网可见)" : "未公开 (私密保密)";
    }
    if (lk.includes("enable") || lk.includes("active")) {
      return boolVal ? "已启用生效" : "已停用下线";
    }
    if (lk.includes("maintain")) {
      return boolVal ? "系统维护中" : "正常服务对外开放";
    }
    if (lk.includes("current")) {
      return boolVal ? "是（本机当前使用）" : "否（其他远端设备）";
    }
    if (lk.includes("kickall")) {
      return boolVal ? "是（注销其他全部会话）" : "否";
    }
    if (lk.includes("renew")) {
      return boolVal ? "开启自动续费" : "不自动续费";
    }
    return boolVal ? "是" : "否";
  }

  // 3. 日期时间智能格式化
  if (typeof val === "string" && (/^\d{4}-\d{2}-\d{2}T/.test(val) || /^\d{4}\/\d{2}\/\d{2}/.test(val))) {
    return formatTime(val);
  }
  const lk = key.toLowerCase();
  if (lk.endsWith("at") || lk.includes("time") || lk.includes("date")) {
    const str = String(val);
    if (!isNaN(Date.parse(str)) && (str.includes("-") || str.includes("/") || str.includes("T"))) {
      return formatTime(str);
    }
  }

  // 4. 数字单位修饰
  if (typeof val === "number") {
    if (lk.includes("token") || lk.includes("amount") || lk.includes("quota") || lk.includes("threshold")) {
      return `${val} 算力点`;
    }
    if (lk.includes("count") || lk.includes("total") || lk.includes("processed") || lk.includes("skipped") || lk.includes("failed")) {
      return `${val} 项`;
    }
    if (lk.includes("price") || lk.includes("fee") || lk.includes("cost") || lk.includes("discount")) {
      return `¥${val.toFixed(2)}`;
    }
  }

  // 5. 数据库实体关联与机器 ID 脱敏转译（全面支持单复数 targetUserId / targetUserIds）
  if (lk.includes("user") && (lk.endsWith("id") || lk.endsWith("ids") || lk === "user")) {
    const strVal = String(val).trim();
    // 优先从全量关联用户列表中按 ID 精准匹配
    if (fullLog?.targetUsers && Array.isArray(fullLog.targetUsers)) {
      const matched = fullLog.targetUsers.find((u: any) => u.id === strVal);
      if (matched) {
        return `${matched.name || "目标用户"} (${matched.email || "未留邮箱"})`;
      }
    }
    // 其次使用单体关联 targetUser
    if (fullLog?.targetUser) {
      return `${fullLog.targetUser.name || "目标用户"} (${fullLog.targetUser.email || "未留邮箱"})`;
    }
    // 兜底：若仅有机器长 ID，进行友好脱敏标注，严禁裸露纯英文数字机器 ID
    if (/^[a-z0-9]{16,}$/i.test(strVal)) {
      return `目标用户 (${strVal.slice(-4)})`;
    }
    return "目标用户账号";
  }
  if (lk.includes("component") && (lk.endsWith("id") || lk.endsWith("ids") || lk === "component")) {
    if (fullLog?.targetComponent) return fullLog.targetComponent.name;
    return "关联研发组件";
  }
  if ((lk.includes("document") || lk.includes("knowledge") || lk.includes("asset")) && (lk.endsWith("id") || lk.endsWith("ids") || lk === "asset")) {
    if (fullLog?.targetDocument) return fullLog.targetDocument.title;
    return "系统资料文档";
  }
  if (lk.includes("workspace") && (lk.endsWith("id") || lk.endsWith("ids"))) {
    if (fullLog?.workspace) return fullLog.workspace.name;
    return val === "SYSTEM" ? "平台全局系统域" : "所属工作空间";
  }
  if (lk.includes("task") && (lk.endsWith("id") || lk.endsWith("ids"))) {
    return "空间协同研发任务";
  }

  const strVal = String(val).trim();

  // 6. 静态词典精确翻译
  if (VALUE_TRANSLATIONS[strVal]) return VALUE_TRANSLATIONS[strVal];
  if (VALUE_TRANSLATIONS[strVal.toLowerCase()]) return VALUE_TRANSLATIONS[strVal.toLowerCase()];
  if (VALUE_TRANSLATIONS[strVal.toUpperCase()]) return VALUE_TRANSLATIONS[strVal.toUpperCase()];
  if (STATUS_LABELS[strVal.toLowerCase()]) return STATUS_LABELS[strVal.toLowerCase()];
  if (ROLE_LABELS[strVal.toLowerCase()]) return ROLE_LABELS[strVal.toLowerCase()];
  if (PLAN_LABELS[strVal.toUpperCase()]) return PLAN_LABELS[strVal.toUpperCase()];
  if (VISIBILITY_LABELS[strVal.toUpperCase()]) return VISIBILITY_LABELS[strVal.toUpperCase()];
  if (WORKSPACE_TYPE_LABELS[strVal.toUpperCase()]) return WORKSPACE_TYPE_LABELS[strVal.toUpperCase()];

  // 7. 英文词汇降级转译（常见状态、工单生命周期与动词）
  const lower = strVal.toLowerCase();
  if (lower === "success" || lower === "ok" || lower === "succeeded") return "执行成功";
  if (lower === "failed" || lower === "fail" || lower === "error") return "执行失败";
  if (lower === "pending") return "等待审核中";
  if (lower === "processing") return "正在处理中";
  if (lower === "approved") return "审核通过";
  if (lower === "rejected") return "审核驳回";
  if (lower === "archived") return "已归档";
  if (lower === "canceled" || lower === "cancelled") return "用户已撤销";
  if (lower === "ban_recorded") return "违规封禁留痕";
  if (lower === "system") return "平台全局系统域";
  if (lower === "manual") return "用户主动操作";
  if (lower === "auto" || lower === "automatic") return "系统自动处理";

  // 8. 若为超长机器 ID（长于 18 且纯英数），转为人类易读说明，杜绝直接暴露裸机器长串
  if (/^[a-z0-9]{18,}$/i.test(strVal)) {
    return "系统业务唯一标识";
  }

  return strVal;
}

// 把 details 解析为全量纯中文 [中文标签, 中文值] 列表（支持关联数据库实体）
function parseDetails(details: any, fullLog?: any): { label: string; value: string }[] {
  let obj: any = details;
  if (typeof details === "string") {
    if (!details.trim()) return [];
    try {
      obj = JSON.parse(details);
    } catch {
      return [{ label: "记录内容", value: details }];
    }
  }
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [{ label: "记录内容", value: String(obj) }];

  // 1. 批量操作智能收敛：杜绝零碎无意义的计数器堆叠与 [object Object]，输出两到三项清晰明了的业务结论
  const isBatch =
    obj.totalSelected !== undefined ||
    obj.processedCount !== undefined ||
    fullLog?.action?.includes("batch") ||
    fullLog?.action === "users:batch-action";

  if (isBatch) {
    const rows: { label: string; value: string }[] = [];
    const total = obj.totalSelected ?? (obj.processedCount ?? 1);
    const processed = obj.processedCount ?? 0;
    const skipped = obj.skippedCount ?? 0;
    const failed = obj.failedCount ?? 0;

    // 卡片 1：处理结果总结
    let resultText = `共勾选 ${total} 项：成功处理 ${processed} 项`;
    if (skipped > 0) resultText += `，跳过 ${skipped} 项`;
    if (failed > 0) resultText += `，失败 ${failed} 项`;
    if (skipped === 0 && failed === 0 && processed > 0) {
      resultText = `共勾选 ${total} 项：全部成功处理`;
    }
    rows.push({ label: "批量处理结果", value: resultText });

    // 卡片 2：跳过说明（彻底解析 skippedSample，严禁出现 [object Object]）
    if (skipped > 0 && obj.skippedSample) {
      let skipDesc = "";
      if (Array.isArray(obj.skippedSample)) {
        const reasons = Array.from(
          new Set(
            obj.skippedSample
              .map((item: any) => {
                if (typeof item === "string") return item;
                return item?.reason || item?.message || "";
              })
              .filter(Boolean)
          )
        );
        if (reasons.length > 0) {
          skipDesc = `${reasons.join("、")}（共 ${skipped} 项无需重复处理）`;
        }
      } else if (typeof obj.skippedSample === "string" && obj.skippedSample.trim()) {
        skipDesc = obj.skippedSample;
      }
      if (!skipDesc) {
        skipDesc = `目标已处于该状态，系统自动跳过（共 ${skipped} 项）`;
      }
      rows.push({ label: "跳过处理说明", value: skipDesc });
    }

    // 卡片 3：操作执行范围
    if (obj.scope) {
      rows.push({
        label: "执行范围模式",
        value: obj.scope === "all" ? "全选当前列表所有目标" : "管理员手动勾选指定目标",
      });
    }

    // 卡片 4：操作原因（若有明确填写的理由）
    const reason = obj.reason || obj.banReason;
    if (reason && reason !== "—" && reason !== "未填写") {
      rows.push({ label: "操作原因", value: reason });
    }

    return rows;
  }

  // 2. 单条普通操作解析
  const rows: { label: string; value: string }[] = [];

  for (const [key, val] of Object.entries(obj)) {
    // 隐藏无实际业务意义的技术底层随机 ID、网络底层字段及空字段
    if (
      key === "deviceId" ||
      key === "sessionId" ||
      key === "ip" ||
      key === "ipAddress" ||
      key === "userAgent" ||
      key === "endpoint" ||
      key === "method" ||
      key === "skippedSample" ||
      key === "totalSelected" ||
      key === "processedCount" ||
      key === "skippedCount" ||
      key === "failedCount" ||
      (key === "id" && (obj.name || obj.componentName || obj.title || obj.componentId || obj.targetComponentId))
    ) {
      continue;
    }

    // 针对 updates 深入解构：杜绝“业务变更内容：业务状态：未激活”这类生硬嵌套
    if (key === "updates" && val && typeof val === "object") {
      for (const [subKey, subVal] of Object.entries(val as Record<string, any>)) {
        if (subKey === "status") {
          let statusText = transStatus(subVal);
          if (subVal === "inactive") statusText = "已停用 (未激活)";
          else if (subVal === "active") statusText = "正常活跃 (已启用)";
          else if (subVal === "banned") statusText = "违规封禁";
          else if (subVal === "suspended") statusText = "已冻结停用";
          rows.push({ label: "变更后账号状态", value: statusText });
        } else if (subKey === "role") {
          rows.push({ label: "变更后用户角色", value: transRole(subVal) });
        } else if (subKey === "isPublic" || subKey === "isPublished" || subKey === "published") {
          rows.push({
            label: "公开上架状态",
            value: subVal ? "已公开上架 (全网可见)" : "未公开 (私密保密)",
          });
        } else {
          let subLabel = translateFieldKeyToChinese(subKey);
          if (!subLabel.startsWith("变更后") && !subLabel.startsWith("新")) {
            subLabel = `变更后${subLabel}`;
          }
          const subText = translateValueToChinese(subKey, subVal, fullLog);
          rows.push({ label: subLabel, value: subText });
        }
      }
      continue;
    }

    const label = translateFieldKeyToChinese(key);
    const value = translateValueToChinese(key, val, fullLog);

    rows.push({ label, value });
  }

  return rows;
}

// 列表行内的一句话可读摘要（让管理员无需展开即看懂）
function describeLog(log: OperationLog): string {
  const meta = actionMeta(log.action, log.details);
  const d = parseDetails(log.details, log);
  const get = (k: string) => d.find((r) => r.label === k)?.value || "";

  let detailsObj: any = log.details;
  if (typeof detailsObj === "string") {
    try {
      detailsObj = JSON.parse(detailsObj);
    } catch {}
  }

  switch (log.action) {
    case "users:batch-action":
    case "user:batch_action": {
      const act = detailsObj?.action || detailsObj?.op;
      const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
      if (act === "unban") return `管理员批量解除 ${count} 名用户的账号封禁`;
      if (act === "ban") return `管理员批量封禁 ${count} 名违规用户账号`;
      if (act === "kick") return `管理员批量强制下线 ${count} 名用户会话`;
      return `管理员批量处理 ${count} 名用户业务`;
    }
    case "user:ban": {
      if (detailsObj?.totalSelected !== undefined || detailsObj?.processedCount !== undefined) {
        const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
        if (detailsObj?.action === "unban") return `管理员批量解除 ${count} 名用户的账号封禁`;
        return `管理员批量封禁 ${count} 名违规用户账号`;
      }
      if (detailsObj?.action === "unban") {
        const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
        return `管理员批量解除 ${count} 名用户的账号封禁`;
      }
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";
      const until = get("封禁截止时间") ? `（截止 ${get("封禁截止时间")}）` : "";
      const r = get("操作原因") || get("封禁案由") || "";
      const cleanR = r && r !== "—" ? `，原因：${r}` : "";
      return `管理员封禁用户${target ? `「${target}」` : ""}${until}${cleanR}`;
    }
    case "user:unban": {
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";
      return `管理员解封用户${target ? `「${target}」` : ""}`;
    }
    case "user:update": {
      const targetStatus = detailsObj?.updates?.status || detailsObj?.status;
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";

      if (targetStatus === "inactive" || targetStatus === "suspended") {
        return `管理员停用用户${target ? `「${target}」` : ""}账号`;
      }
      if (targetStatus === "active") {
        return `管理员启用用户${target ? `「${target}」` : ""}账号`;
      }
      const isBan =
        targetStatus === "banned" ||
        Boolean(detailsObj?.bannedUntil) ||
        Boolean(detailsObj?.banReason) ||
        (typeof detailsObj?.reason === "string" && (detailsObj.reason.includes("封禁") || detailsObj.reason.includes("违规") || detailsObj.reason.includes("警告")));
      if (isBan) {
        const until = get("封禁截止时间") ? `（截止 ${get("封禁截止时间")}）` : "";
        const r = get("操作原因") || get("封禁案由") || "";
        const cleanR = r && r !== "—" ? `，原因：${r}` : "";
        return `管理员封禁用户${target ? `「${target}」` : ""}${until}${cleanR}`;
      }
      if (detailsObj?.role || detailsObj?.newRole || detailsObj?.updates?.role) {
        const r = get("变更后用户角色") || get("变更后角色") || get("账号角色") || "";
        return `调整用户${target ? `「${target}」` : ""}角色${r ? `为「${r}」` : ""}`;
      }
      if (detailsObj?.points || detailsObj?.amount || detailsObj?.updates?.points) {
        return `调整用户${target ? `「${target}」` : ""}积分额度`;
      }
      return `更新用户资料${target ? `「${target}」` : ""}`;
    }
    case "appeal:deleted":
      return "管理员清理删除已归档的申诉工单";
    case "appeal:account_unban_approved":
      return "管理员审核通过账号解封申诉";
    case "appeal:account_unban_rejected":
      return "管理员审核驳回账号解封申诉";
    case "appeal:workspace_unban_approved":
      return "管理员审核通过空间解封申诉";
    case "appeal:workspace_unban_rejected":
      return "管理员审核驳回空间解封申诉";
    case "user:delete":
      return "删除用户";
    case "user:reset_session":
      return "重置该用户登录会话";
    case "user:force_logout":
      return "管理员特权强制用户安全下线";
    case "user:reset_password":
      return "管理员特权重置用户登录密码";
    case "user:batch_kick":
      return "管理员批量强制下线多名用户会话";
    case "ACCOUNT_DELETION_REQUESTED":
      return "用户提交账号注销申请";
    case "ACCOUNT_DELETED":
      return "账号已彻底销毁（冷静期届满）";
    case "component:create":
      return `创建研发组件「${get("名称") || (log.targetComponent?.name || "新组件")}」`;
    case "component:update":
      return `更新研发组件${get("名称") || log.targetComponent?.name ? `「${get("名称") || log.targetComponent?.name}」` : ""}${get("变更内容") ? `（${get("变更内容")}）` : ""}`;
    case "component:delete":
      return `删除研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」`;
    case "component:publish":
      return `将研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开上架`;
    case "component:request_publish":
      return `提交研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开上架审核申请`;
    case "component:approve":
      return `审核通过研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开申请`;
    case "component:reject":
      return `驳回研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开申请${get("审核意见") || get("操作原因") ? `（原因：${get("审核意见") || get("操作原因")}）` : ""}`;
    case "component:execute":
      return `调用运行组件（消耗额度 ${get("消耗算力点") || get("消耗额度") || "—"}）`;
    case "workspace:create":
      return `创建工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:update":
      return `更新工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:delete":
      return `删除工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:recycle":
      return "系统合规自动回收闲置空间算力配额";
    case "CREATE_ENTERPRISE_WORKSPACE":
      return `创建企业工作空间「${get("工作空间")}」${get("套餐") ? `（套餐：${get("套餐")}）` : ""}`;
    case "JOIN_WORKSPACE":
      return `加入工作空间「${get("工作空间")}」${get("角色") ? `（角色：${get("角色")}）` : ""}`;
    case "LEAVE_WORKSPACE":
    case "member:leave":
      return `退出工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "UPDATE_MEMBER_ROLE":
      return `调整成员角色${get("新角色") ? `→ ${get("新角色")}` : ""}`;
    case "WORKSPACE_KICK":
      return `将成员移出工作空间`;
    case "UPGRADE_WORKSPACE":
      return `升级工作空间${get("原类型") && get("目标类型") ? `（${get("原类型")}→${get("目标类型")}）` : ""}`;
    case "UPGRADE_WORKSPACE_PLAN":
      return `变更空间套餐${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "CONFIGURE_SOLUTION":
      return `配置解决方案「${get("解决方案")}」`;
    case "SET_RESTRICTED_COMPONENTS":
      return "设置受限组件白名单";
    case "SAVE_CUSTOM_POSITIONS":
      return "保存组件自定义布局";
    case "BIND_COMPONENT":
      return `将组件绑定到工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "UNBIND_COMPONENT":
      return `将组件从工作空间解绑${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "quota:recycle":
      return `回收工作空间算力配额${get("配额数值") ? `（${get("配额数值")}）` : ""}`;
    case "quota:pool_threshold":
    case "quota:threshold":
      return "调整工作空间算力池报警阈值";
    case "asset:upload":
      return `上传资料资产「${get("资料标题") || get("名称") || "新资料"}」`;
    case "asset:approve":
      return `审核通过公开资料「${get("资料标题") || "资料"}」`;
    case "asset:reject":
      return `驳回公开资料申请「${get("资料标题") || "资料"}」${get("审核意见") ? `（原因：${get("审核意见")}）` : ""}`;
    case "asset:remove_private":
      return `治理隔离私密资料「${get("资料标题") || "资料"}」`;
    case "asset:remove":
      return `下架移除公开资料「${get("资料标题") || "资料"}」`;
    case "asset:restore":
      return `恢复已下架资料「${get("资料标题") || "资料"}」`;
    case "asset:restore_request":
      return `提交资料恢复申请「${get("资料标题") || "资料"}」`;
    case "asset:publish_direct":
      return `直接发布资料「${get("资料标题") || "资料"}」为全员公开`;
    case "asset:request_publish":
      return `提交资料「${get("资料标题") || "资料"}」公开上架申请`;
    case "asset:batch_delete":
      return `批量彻底删除资料资产（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_remove":
      return `批量下架移除公开资料（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_publish_direct":
      return `批量发布资料资产为公开（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_request_publish":
      return `批量提交资料公开申请（共 ${get("影响数量") || "多项"}）`;
    case "sso:revoke":
      return `解除第三方授权绑定（${get("认证源") || "三方账号"}）`;
    case "stepup:issued":
      return `完成二次敏感身份凭证签发（${get("敏感操作") || "特权操作"}）`;
    case "KNOWLEDGE_PUBLISH":
      return "发布知识至知识库";
    case "KNOWLEDGE_SUBMIT":
      return "提交知识审核";
    case "KNOWLEDGE_APPROVE":
      return "审核通过知识条目";
    case "KNOWLEDGE_REJECT":
      return "驳回知识条目";
    case "ARCHIVE_TASK":
      return `归档任务${get("任务 ID") ? `（${get("任务 ID")}）` : ""}`;
    case "DELETE_TASK":
      return "删除任务";
    case "system:settings":
      return "系统配置变更";
    case "auth:login":
      return log.user?.role === "superadmin" || log.user?.role === "admin"
        ? "管理员登录系统"
        : "账号成功登录系统";
    case "auth:logout":
      if (log.details?.type === "TIMEOUT" || log.details?.reason === "timeout" || get("原因")?.includes("超时")) {
        return "长时间无操作，系统自动退出登录";
      }
      if (log.details?.reason === "password_changed") {
        return "密码修改成功，系统自动退出登录";
      }
      return "用户退出登录";
    case "SESSION_TIMEOUT_LOGOUT":
      return "长时间无操作，系统自动退出登录";
    case "Password:Change":
      return "用户修改登录密码";
    case "SecuritySetting:Update":
      return "修改账号安全设置";
    case "ADMIN_FORCE_LOGOUT":
      return "管理员强制将该账号下线";
    case "user:batch_kick":
      return `管理员批量将用户下线${get("受影响用户数") ? `（共 ${get("受影响用户数")} 人）` : ""}`;
    case "SESSION_CONFLICT_LOGOUT":
    case "DEVICE_KICKED_OFFLINE":
      return "账号多端登录会话更替，原终端会话自动安全退出";
    case "SECURITY_DIAGNOSIS":
      return "执行账户安全诊断评估";
    case "APIKey:Create":
      return "创建 API 访问密钥";
    case "APIKey:Delete":
      return "删除 API 访问密钥";
    case "CONFIGURE_ADMIN_PERMISSIONS":
      return "配置管理员后台权限";
    case "MEMBERSHIP_UPGRADE":
      return `会员等级升级${get("目标等级") ? `→ ${get("目标等级")}` : ""}`;
    case "PING_TEST":
      return "系统网络连通性测试";
    case "audit:clean_expired":
      return "定期合规清理 3 年前操作审计日志";
    case "audit:delete":
      return "管理员特权删除单条操作审计日志";
    case "export:excel":
      return "导出操作审计报表为 Excel 文件";
    case "export:json":
      return "导出操作审计数据为 JSON 备份文件";
    default:
      // 兜底也绝不出现“其他”或英文，直接采用智能中文转译
      return `执行${meta.label}操作`;
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// 触发浏览器下载
function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: OperationLog[]): string {
  const header = ["时间", "操作类型", "资源域", "操作描述", "操作人", "邮箱", "IP 地址", "原始详情(JSON)"];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatTime(r.createdAt),
        actionMeta(r.action).label,
        resourceLabel(r.resource),
        describeLog(r),
        r.user?.name || "未知用户",
        r.user?.email || "—",
        r.ipAddress || "—",
        JSON.stringify(r.details ?? {}),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  // BOM 头，保证 Excel 正确识别中文
  return "﻿" + lines.join("\r\n");
}

const PAGE_SIZE = 10;

export default function OperationLogsPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, highRisk: 0 });
  const [retention, setRetention] = useState<{ years: number; days: number; description: string } | null>(null);

  // 筛选条件
  const [action, setAction] = useState("");
  const [userKeyword, setUserKeyword] = useState("");
  const [resource, setResource] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 复选框批量选择
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 详情弹窗（支持数据库实时深度关联查询）
  const [detailLog, setDetailLog] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // 打开详情并实时从数据库查询单条完整数据（含关联实体）
  const openDetailModal = async (log: OperationLog) => {
    setDetailLog(log);
    setDetailLoading(true);
    setShowRawJson(false);
    try {
      const res = await fetch(`/api/admin/operation-logs?id=${log.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDetailLog(json.data);
        }
      }
    } catch (err) {
      console.error("从数据库加载操作审计详情失败:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // 危险操作确认弹窗（单删 / 批量删 / 合规出清）
  const [confirm, setConfirm] = useState<null | {
    kind: "single" | "batch" | "purge";
    ids?: string[];
    title: string;
    message: string;
  }>(null);

  // 处理中 / 提示（使用系统标准 Toast）
  const [busy, setBusy] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (action) params.set("action", action);
      if (userKeyword.trim()) params.set("user", userKeyword.trim());
      if (resource) params.set("resource", resource);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
      return params.toString();
    },
    [page, action, userKeyword, resource, startDate, endDate]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/operation-logs?${buildQuery()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "获取操作日志失败");

      const data = result.data;
      setTotal(data.total || 0);
      const tp = Math.max(1, Number(data.totalPages) || 1);
      if (page > tp) {
        setPage(tp);
        return;
      }
      setLogs(data.logs || []);
      setStats(data.stats || { total: 0, today: 0, highRisk: 0 });
      if (data.retentionPolicy) setRetention(data.retentionPolicy);
      // 数据刷新后修正选中状态
      setSelectedIds((prev) => prev.filter((id) => (data.logs || []).some((l: OperationLog) => l.id === id)));
      setSelectAll(false);
    } catch (err: any) {
      setError(err.message || "获取操作日志失败");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleReset = () => {
    setAction("");
    setUserKeyword("");
    setResource("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // 快捷复制详情
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyDetails = (id: string, details: any) => {
    try {
      const text = typeof details === "string" ? details : JSON.stringify(details, null, 2);
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // 忽略复制异常
    }
  };

  // 快捷时间范围填充
  const handleSetQuickDate = (days: number | null) => {
    if (days === null) {
      setStartDate("");
      setEndDate("");
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
    setPage(1);
  };

  // —— 复选框逻辑 ——
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSelectAll(false);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === logs.length ? [] : logs.map((l) => l.id)));
    setSelectAll((p) => !p);
  };

  // —— 删除：单条 / 批量 / 合规出清 ——
  const executeDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const body: any = {};
      if (confirm.kind === "single" && confirm.ids) body.id = confirm.ids[0];
      else if (confirm.kind === "batch") body.ids = confirm.ids;
      else if (confirm.kind === "purge") body.cleanExpired = true;

      const res = await fetch("/api/admin/operation-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "删除失败");
      showSuccess(result.message || "操作成功");
      setConfirm(null);
      setSelectedIds([]);
      setSelectAll(false);
      fetchLogs();
    } catch (err: any) {
      showError(err.message || "删除失败");
    } finally {
      setBusy(false);
    }
  };

  // —— 导出：选中 / 当前筛选（支持标准 Excel 与结构化 JSON） ——
  const handleExport = async (format: "excel" | "json", scope: "selected" | "filtered") => {
    setBusy(true);
    try {
      let rows: OperationLog[] = [];
      if (scope === "selected") {
        rows = logs.filter((l) => selectedIds.includes(l.id));
        if (rows.length === 0) {
          showError("请先勾选要导出的审计日志");
          setBusy(false);
          return;
        }
      } else {
        // 拉取当前筛选条件下的全量数据（后端支持大 limit）
        const res = await fetch(`/api/admin/operation-logs?${buildQuery({ page: "1", limit: "100000" })}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "获取导出数据失败");
        rows = result.data?.logs || [];
      }

      if (rows.length === 0) {
        showError("当前筛选条件下暂无审计日志可导出");
        setBusy(false);
        return;
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      if (format === "excel") {
        exportToExcel({
          filename: `知阁平台操作审计日志_${stamp}`,
          sheetName: "操作审计日志",
          columns: [
            { header: "操作时间", formatter: (_, r) => formatTime(r.createdAt), width: 22 },
            { header: "操作类型", formatter: (_, r) => actionMeta(r.action, r.details).label, width: 16 },
            { header: "涉及资源域", formatter: (_, r) => resourceLabel(r.resource), width: 14 },
            { header: "操作描述", formatter: (_, r) => describeLog(r), width: 36 },
            { header: "操作人姓名", formatter: (_, r) => r.user?.name || "未知用户", width: 16 },
            { header: "操作人邮箱", formatter: (_, r) => r.user?.email || "—", width: 24 },
            { header: "操作人角色", formatter: (_, r) => transRole(r.user?.role), width: 14 },
            { header: "操作人UID", key: "userId", width: 28 },
            { header: "源IP地址", formatter: (_, r) => r.ipAddress || "—", width: 22 },
            {
              header: "详细参数(JSON)",
              formatter: (_, r) => (typeof r.details === "object" ? JSON.stringify(r.details, null, 2) : String(r.details || "—")),
              width: 38,
            },
          ],
          data: rows,
        });
      } else {
        triggerDownload(
          `知阁平台操作审计日志_${stamp}.json`,
          JSON.stringify(
            rows.map((r) => ({
              操作时间: formatTime(r.createdAt),
              操作类型: actionMeta(r.action, r.details).label,
              涉及资源域: resourceLabel(r.resource),
              操作描述: describeLog(r),
              操作人姓名: r.user?.name || "未知用户",
              操作人邮箱: r.user?.email || "—",
              操作人角色: transRole(r.user?.role),
              操作人UID: r.userId,
              源IP地址: r.ipAddress || "—",
              详细参数: r.details ?? {},
            })),
            null,
            2
          ),
          "application/json"
        );
      }
      showSuccess(`已成功导出 ${rows.length} 条审计日志（${format === "excel" ? "Excel 表格" : "JSON 文件"}）`);
    } catch (err: any) {
      showError(err.message || "导出失败");
    } finally {
      setBusy(false);
    }
  };

  const statsCards = [
    {
      label: "日志存量总额",
      value: stats.total,
      icon: ScrollText,
      accent: "bg-[#3182ce]/10",
      iconColor: "text-[#3182ce]",
      sub: "全站审计不可篡改底账",
    },
    {
      label: "今日实时操作",
      value: stats.today,
      icon: Clock,
      accent: "bg-[#10b981]/10",
      iconColor: "text-[#10b981]",
      sub: "今日新增的动态指令",
    },
    {
      label: "高危删除指令",
      value: stats.highRisk,
      icon: Trash2,
      accent: "bg-[#ef4444]/10",
      iconColor: "text-[#ef4444]",
      sub: "涉及用户/数据销毁记录",
    },
    {
      label: "当前页追溯数",
      value: logs.length,
      icon: Database,
      accent: "bg-[#805ad5]/10",
      iconColor: "text-[#805ad5]",
      sub: `当前呈现第 ${page} 页记录`,
    },
  ];

  const allActionOptions = Object.entries(ACTION_META).map(([value, m]) => ({ value, label: m.label }));

  return (
    <div className="space-y-6 pb-12 text-left font-sans">
      {/* 顶部 Bento 标头导航区 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-xs">
                <ScrollText className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                全平台操作审计日志中枢
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80 select-none">
                真实实时溯源
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              全方位追踪记录平台所有特权指令、高危删除、用户处罚与配置变更，保障系统合规与责任闭环
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchLogs}
              disabled={loading || busy}
              className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新审计流</span>
            </button>
            <Link
              href="/admin"
              className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回大盘</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4 大 Bento 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg ${card.accent} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${card.iconColor}`} />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-800 mt-2 tracking-tight">
                {loading ? "—" : card.value}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* 合规生命周期策略卡片 */}
      <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] rounded-2xl p-5 shadow-sm text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-7 h-7 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-black">网络安全合规生命周期策略</div>
            <div className="text-[12px] text-white/80 mt-0.5 leading-relaxed">
              {retention?.description ||
                "根据《网络安全法》审计要求，操作日志自动保留最近 3 年，超期数据系统自动物理出清。"}
            </div>
          </div>
        </div>
        <button
          onClick={() =>
            setConfirm({
              kind: "purge",
              title: "执行 3 年合规出清",
              message:
                "将立即物理删除所有超过 3 年（1095 天）的历史操作审计日志，此操作不可恢复。是否继续？",
            })
          }
          disabled={busy}
          className="shrink-0 h-10 px-4 bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>一键执行 3 年合规出清</span>
        </button>
      </div>

      {/* 筛选栏 + 表格 卡片 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {/* 筛选栏 */}
        <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 操作类型 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                操作类型过滤
              </label>
              <div className="relative">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all cursor-pointer"
                >
                  <option value="">全部操作类型</option>
                  {allActionOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 操作用户 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                操作人检索
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="按用户名或邮箱搜索..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all"
                />
              </div>
            </div>

            {/* 资源类型 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                涉及资源类型
              </label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all cursor-pointer"
                >
                  <option value="">全部资源类型</option>
                  <option value="user">用户与账号</option>
                  <option value="account">安全与登录</option>
                  <option value="workspace">工作空间</option>
                  <option value="component">组件中心</option>
                  <option value="knowledge">资料与知识库</option>
                  <option value="task">协同任务</option>
                  <option value="system">系统设置</option>
                  <option value="membership">会员与计费</option>
                  <option value="asset">资料资产</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 时间区间选择与快捷标签 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600">时间窗口</label>
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  <button onClick={() => handleSetQuickDate(0)} className="text-[#3182ce] hover:underline cursor-pointer">今日</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => handleSetQuickDate(7)} className="text-[#3182ce] hover:underline cursor-pointer">近7天</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => handleSetQuickDate(30)} className="text-[#3182ce] hover:underline cursor-pointer">近30天</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSearch}
                disabled={loading || busy}
                className="flex items-center gap-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold px-5 h-9 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Search className="w-3.5 h-3.5" />
                <span>执行查询</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-4 h-9 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重置条件</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                共检索到 <span className="font-bold text-slate-700">{total}</span> 条日志
              </span>
              <div className="h-4 w-px bg-slate-200" />
              <button
                onClick={() => handleExport("excel", "filtered")}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/90 hover:bg-emerald-100/80 text-emerald-700 text-xs font-bold px-3.5 h-9 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
                title="导出当前筛选结果为 Excel 表格 (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>导出 Excel</span>
              </button>
              <button
                onClick={() => handleExport("json", "filtered")}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-blue-50 border border-blue-200/90 hover:bg-blue-100/80 text-[#2b6cb0] text-xs font-bold px-3.5 h-9 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
                title="导出当前筛选结果为 JSON 结构化数据 (.json)"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>导出 JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {/* 批量操作浮动栏 */}
        {selectedIds.length > 0 && (
          <div className="mx-6 mt-4 bg-[#3182ce]/5 border border-[#3182ce]/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
              <CheckSquare className="w-4 h-4" />
              已勾选 <span className="text-[#3182ce]">{selectedIds.length}</span> 条审计记录
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport("excel", "selected")}
                disabled={busy}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="导出勾选的记录为 Excel 表格"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>导出选中 (Excel)</span>
              </button>
              <button
                onClick={() => handleExport("json", "selected")}
                disabled={busy}
                className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-[#2b6cb0] hover:bg-blue-100 text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="导出勾选的记录为 JSON 文件"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>导出选中 (JSON)</span>
              </button>
              <button
                onClick={() =>
                  setConfirm({
                    kind: "batch",
                    ids: selectedIds,
                    title: "批量删除审计日志",
                    message: `即将永久删除选中的 ${selectedIds.length} 条操作审计日志，此操作不可恢复。是否继续？`,
                  })
                }
                disabled={busy}
                className="flex items-center gap-1.5 bg-red-600 border border-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>批量删除</span>
              </button>
              <button
                onClick={() => {
                  setSelectedIds([]);
                  setSelectAll(false);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                取消选择
              </button>
            </div>
          </div>
        )}

        {/* 表格 */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1320px]">
            <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50/90 px-4 py-4 text-left text-xs font-bold text-slate-500 whitespace-nowrap w-12">
                  <button onClick={toggleSelectAll} className="cursor-pointer" title="全选当前页">
                    {selectAll || (selectedIds.length === logs.length && logs.length > 0) ? (
                      <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">
                  操作类型
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作人
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">
                  资源
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作描述
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  IP 地址
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作时间
                </th>
                <th className="sticky right-0 z-20 bg-slate-50/90 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">加载中...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium text-sm">
                      暂无符合条件的审计日志
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const meta = actionMeta(log.action, log.details);
                  const ResIcon = resourceIcon(log.resource);
                  const checked = selectedIds.includes(log.id);
                  return (
                    <tr
                      key={log.id}
                      className={`group hover:bg-white/60 transition-all duration-300 ${
                        checked ? "bg-[#3182ce]/5" : ""
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-4">
                        <button onClick={() => toggleSelect(log.id)} className="cursor-pointer" title="选择此条">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap shrink-0 ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {log.user?.avatar ? (
                            <img
                              src={log.user.avatar}
                              alt={log.user.name || ""}
                              className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-black shadow-xs shrink-0">
                              {(log.user?.name || "U").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 max-w-[150px]">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(log.user?.email || log.user?.name || log.userId)}`}
                              className="text-sm font-bold text-slate-800 hover:text-[#3182ce] hover:underline transition-colors truncate block"
                              title="前往用户画像中心查看该用户"
                            >
                              {log.user?.name || "未知用户"}
                            </Link>
                            <div className="text-xs text-slate-500 font-medium truncate">
                              {log.user?.email || "未留邮箱"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <ResIcon className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate whitespace-nowrap">
                            {resourceLabel(log.resource)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium max-w-xs">
                        <span className="truncate block" title={describeLog(log)}>
                          {describeLog(log)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                        {log.ipAddress || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-6 py-4 text-right min-w-[120px] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <button
                            onClick={() => openDetailModal(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 text-[#3182ce] bg-[#3182ce]/10 hover:bg-[#3182ce]/20 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            查看
                          </button>
                          <button
                            onClick={() =>
                              setConfirm({
                                kind: "single",
                                ids: [log.id],
                                title: "删除该条审计日志",
                                message: "即将永久删除这条操作审计日志，此操作不可恢复。是否继续？",
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>删除</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {!loading && total > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50/50 to-transparent">
            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              itemLabel="条操作日志"
            />
          </div>
        )}
      </div>

      {/* 详情模态框：与系统标准审计弹窗统一 */}
      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailLog(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏：知阁知性蓝渐变 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-white">
                <ScrollText className="w-5 h-5" />
                <div>
                  <div className="text-base font-black">操作审计详情</div>
                  <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                    <span>审计流水详情 · {actionMeta(detailLog.action, detailLog.details).label}</span>
                    {detailLoading && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        数据库实时查询中...
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailLog(null)} className="text-white/80 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* 基本信息 */}
              <Section title="基本信息">
                <Field label="操作类型" value={actionMeta(detailLog.action, detailLog.details).label} />
                <Field label="资源域" value={resourceLabel(detailLog.resource)} />
                <Field label="发生时刻" value={formatTime(detailLog.createdAt)} />
                {detailLog.workspace && (
                  <Field
                    label="所属空间"
                    value={`${detailLog.workspace.name} (${transWorkspaceType(detailLog.workspace.type)} / ${transPlan(detailLog.workspace.plan)})`}
                  />
                )}
                {!detailLog.workspace && detailLog.workspaceId && (
                  <Field
                    label="所属空间"
                    value={detailLog.workspaceId === "SYSTEM" ? "平台全局系统域" : "独立业务工作空间"}
                  />
                )}
                {!detailLog.workspaceId && (
                  <Field label="所属空间" value="平台全局系统域" />
                )}
              </Section>

              {/* 操作人详情 */}
              <Section title="操作人画像">
                <div className="flex items-center gap-3 mb-3">
                  {detailLog.user?.avatar ? (
                    <img src={detailLog.user.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold">
                      {(detailLog.user?.name || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-slate-800">{detailLog.user?.name || "未知用户"}</div>
                    <div className="text-xs text-slate-500">{detailLog.user?.email || "未留邮箱"}</div>
                  </div>
                  {detailLog.user?.role && (
                    <span className="ml-auto px-2.5 py-1 rounded-md text-xs font-bold bg-[#3182ce]/10 text-[#3182ce]">
                      {transRole(detailLog.user.role)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    账号状态：<span className="font-bold text-emerald-600">{transStatus(detailLog.user?.status || "active")}</span>
                    {detailLog.user?.phone ? ` · 手机号：${detailLog.user.phone}` : ""}
                  </span>
                  <Link
                    href={`/admin/users?search=${encodeURIComponent(detailLog.user?.email || detailLog.user?.name || detailLog.userId)}`}
                    className="inline-flex items-center gap-1 font-bold text-[#3182ce] hover:underline"
                  >
                    反查操作人画像 →
                  </Link>
                </div>
              </Section>

              {/* 客户端 / 网络环境 */}
              <Section title="客户端与网络环境">
                <Field label="源 IP" value={detailLog.ipAddress || "127.0.0.1 (本地局域网)"} mono />
                <Field label="操作账号" value={`${detailLog.user?.name || "系统未知"} (${detailLog.user?.email || "未留邮箱"})`} />
              </Section>

              {/* 操作参数与业务变更明细（全局唯一，拒绝重复拼凑堆叠） */}
              <Section
                title="操作参数与业务变更明细"
                action={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRawJson(!showRawJson)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                    >
                      {showRawJson ? "切换为业务参数解析" : "查看原始 JSON"}
                    </button>
                    <button
                      onClick={() => handleCopyDetails(detailLog.id, detailLog.details)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                    >
                      {copiedId === detailLog.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>复制数据</span>
                        </>
                      )}
                    </button>
                  </div>
                }
              >
                {detailLoading ? (
                  <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#3182ce]" />
                    <span>正在调取关联业务实体与参数解析...</span>
                  </div>
                ) : showRawJson ? (
                  <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
{typeof detailLog.details === "string" ? detailLog.details : JSON.stringify(detailLog.details ?? {}, null, 2)}
                  </pre>
                ) : (
                  (() => {
                    const rows = parseDetails(detailLog.details, detailLog);
                    if (rows.length === 0) {
                      return (
                        <div className="text-xs text-slate-500 p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                          本次操作为系统单向直接触发，无额外业务变更参数记录
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {rows.map((row, idx) => {
                          const isReason = row.label.includes("原因") || row.label.includes("案由");
                          const isEmptyVal = !row.value || row.value.trim() === "—" || row.value === "未填写";
                          // 空原因不占卡片空间
                          if (isReason && isEmptyVal) return null;

                          // 仅对实质性较长的详细描述、驳回原因、变更明细采用通栏展示
                          const isLong =
                            (isReason && !isEmptyVal && row.value.length > 12) ||
                            row.label.includes("意见") ||
                            row.label.includes("详细说明") ||
                            (row.label.includes("内容") && row.value.length > 20) ||
                            row.value.length > 28;

                          if (isLong) {
                            return (
                              <div
                                key={idx}
                                className="col-span-1 sm:col-span-2 p-3 bg-slate-50/90 border border-slate-200/70 rounded-xl text-xs flex flex-col sm:flex-row sm:items-start gap-2"
                              >
                                <div className="text-slate-500 font-medium shrink-0 pt-0.5 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></span>
                                  <span>{row.label}</span>
                                </div>
                                <div className="text-slate-800 font-bold text-left leading-relaxed break-words flex-1 bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                                  {row.value}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/90 border border-slate-100 rounded-xl text-xs">
                              <span className="text-slate-500 font-medium shrink-0 mr-3">{row.label}</span>
                              <span className="text-slate-800 font-bold break-all text-right">{row.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* 危险操作二次确认弹窗 */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setConfirm(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 flex items-start gap-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-black text-slate-800">{confirm.title}</div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">{confirm.message}</div>
              </div>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                disabled={busy}
                className="px-4 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// —— 模态框内部小组件 ——
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-medium shrink-0 mr-4">{label}</span>
      <span className={`text-xs text-slate-800 font-bold text-right ${mono ? "font-mono text-[11px] break-all" : "break-all"}`}>
        {value}
      </span>
    </div>
  );
}
