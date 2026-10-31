"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Search,
  Calendar,
  Clock,
  User,
  FolderOpen,
  Box,
  CreditCard,
  Shield,
  X,
  Eye,
  Info,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Layers,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  BookOpen,
  Cpu,
  Sliders,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import Pagination from "@/components/Pagination";

interface UserActivity {
  id: string;
  action: string;
  actionLabel: string;
  actionBadgeColor: string;
  description: string;
  resourceType: string;
  resourceCategoryLabel: string;
  resourceLabel?: string | null;
  resourceId?: string | null;
  workspaceId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  metadata?: any;
}

interface ActivityStatistics {
  total: number;
  workspace: number;
  component: number;
  security: number;
  membership: number;
  today: number;
}

// 安全敏感动作判定：与后端 /api/user/activities DELETE 的保护名单同口径，
// 登录/支付/改密/转让/注销等合规溯源记录不允许当事人删除（按钮隐藏 + 批量剔除）
const PROTECTED_ACTION_PATTERN =
  /password|login|logout|pay|recharge|refund|transfer|deletion|delete[-_ ]?account|kick|stepup|verify/i;
const isProtectedActivity = (a?: { action?: string } | null) =>
  !!a && PROTECTED_ACTION_PATTERN.test(a.action || "");

// 常见业务字段转中文对照表，收录全站数据库核心属性，彻底杜绝 price, points, isActive 等英文原样暴露
const FIELD_TRANSLATIONS: Record<string, string> = {
  // 算力与充值包、资金相关
  price: "套餐单价 (元)",
  points: "包含算力点数",
  isActive: "启用状态",
  isPopular: "热门推荐标记",
  sortOrder: "显示排序权重",
  balance: "算力点余额",
  tokenBalance: "Token/算力余额",
  grantPoints: "发放/赠送点数",
  totalPoints: "累计获得点数",
  remainPoints: "剩余有效点数",
  expireDays: "有效天数",
  expiresAt: "有效截止时间",
  tradeNo: "支付交易流水号",
  orderNo: "订单编号",
  orderId: "订单编号",
  amount: "交易金额 (元)",
  currency: "结算货币",
  channel: "支付渠道",
  paymentMethod: "支付方式",
  refundAmount: "退款金额 (元)",
  refundReason: "退款原因",
  discount: "折扣率",

  // 基础操作与消息
  message: "操作说明",
  description: "详细描述",
  deleted: "删除处理",
  delete: "删除状态",
  status: "执行结果",
  success: "是否成功",
  action: "操作动作",
  timestamp: "操作时间",
  reason: "变更原因",
  type: "业务分类",
  count: "涉及数量",
  scope: "作用范围",
  config: "配置详情",
  version: "版本号",

  // 用户与权限
  userId: "用户编号",
  userName: "用户姓名",
  email: "电子邮箱",
  phone: "手机号码",
  avatar: "用户头像",
  targetUserId: "涉及用户编号",
  targetUserName: "涉及用户姓名",
  targetEmail: "涉及用户邮箱",
  operator: "操作人员",
  role: "协作角色",
  oldRole: "原分配角色",
  newRole: "调整后角色",
  loginAttempts: "登录失败尝试次数",
  lockedUntil: "账号锁定截止",
  deviceLimit: "同时在线设备上限",
  allowMultiDevice: "允许多端同时在线",
  userAgent: "操作终端环境",
  ip: "操作IP",
  ipAddress: "网络地址",
  lastLoginAt: "最后登录时间",
  lastLoginIp: "最后登录IP",
  lastLoginRegion: "最后登录地域",
  passwordExpireDate: "密码强制轮换日期",
  bio: "个人签名/简介",

  // 工作空间与组件
  workspaceId: "工作空间编号",
  workspaceName: "工作空间名称",
  componentId: "组件编号",
  componentName: "组件名称",
  plan: "套餐方案",
  seats: "席位配额",
  extraSeats: "扩容席位数",
  storageLimit: "存储空间配额",
  storageUsed: "已用存储容量",
  apiCallsLimit: "API调用总额度",
  apiCallsUsed: "已消耗调用量",
  industry: "所属行业",
  teamSize: "团队规模",

  // 模型相关
  baseUrl: "端点接入地址",
  apiKey: "API访问密钥",
  protocol: "接口通信协议",
  providerName: "供应商名称",
  provider: "供应商",
  capabilities: "支持的功能特性",
  contextLimit: "上下文窗口上限",
  priceInputYuan: "官方输入单价 (元/百万)",
  priceOutputYuan: "官方输出单价 (元/百万)",
  modelName: "模型标识",
  displayName: "模型展示名称",
  enabled: "是否启用",
  shareWithMembers: "允许空间成员共享",
  isSpaceDefault: "设为空间默认模型",
  isGlobalDefault: "设为平台默认模型",

  // 岗位职责与权限矩阵相关字段
  positions: "岗位权限列表",
  POSITIONS_CONFIG: "空间岗位配置",
  allowedComponentIds: "授权调度的研发组件",
  isPreset: "是否系统预设岗位",
  colorCls: "视觉徽章颜色",
  badge: "岗位级别标识",
  code: "岗位英文编码",
  icon: "视觉图标",
  color: "主题色值",
  title: "标题名称",
  content: "文本内容",
  remark: "备注说明",
  memo: "备忘信息",
};

// 岗位与常见英文代码转中文映射表
const CODE_TRANSLATIONS: Record<string, string> = {
  OWNER: "空间所有者 (最高管控)",
  ADMIN: "空间管理员 (团队管理)",
  PROJECT_MANAGER: "项目经理 (业务调度)",
  BID_SPECIALIST: "投标专家 (商务打单)",
  PRODUCT_MANAGER: "产品经理 (需求设计)",
  UI_DESIGNER: "UI/UX 视觉设计师 (界面视觉)",
  BACKEND_ENGINEER: "后端开发工程师 (核心研发)",
  DBA_ARCHITECT: "数据架构师 (数据工程)",
  QA_ENGINEER: "QA工程师 (质量保证)",
  DEVOPS_ENGINEER: "运维工程师 (运维安全)",
  VIEWER: "空间审计员 (只读查看)",
  DELIVERY_OWNER: "交付负责人 (交付统筹)",
  BUSINESS_SOLUTION: "商务方案师 (商务方案)",
  DATABASE_ADMIN: "数据库管理员 (数据库运维)",
  REQUIREMENT_ANALYST: "需求分析师 (需求分析)",
  TEST_ENGINEER: "测试工程师 (功能测试)",
  POSITIONS_CONFIG: "空间岗位权限配置",
  ACTIVE: "正常启用",
  INACTIVE: "已停用",
};

// 将字段英文名格式化为通俗、亲切的中文名称，全面杜绝英文代码裸露
const formatMetadataKey = (key: string): string => {
  if (FIELD_TRANSLATIONS[key]) return FIELD_TRANSLATIONS[key];
  const lower = key.toLowerCase();
  if (FIELD_TRANSLATIONS[lower]) return FIELD_TRANSLATIONS[lower];

  // 算力与充值包
  if (lower.includes("price")) return "价格 (元)";
  if (lower.includes("point")) return "算力点数";
  if (lower.includes("token")) return "Token数/算力";
  if (lower.includes("balance")) return "账户余额";
  if (lower.includes("active") || lower.includes("enable")) return "启用状态";
  if (lower.includes("popular") || lower.includes("recommend")) return "推荐标识";
  if (lower.includes("sort") || lower.includes("order")) return "排序权重";
  if (lower.includes("color")) return "主题色彩";
  if (lower.includes("icon")) return "视觉图标";
  if (lower.includes("expire") || lower.includes("due")) return "到期时限";
  if (lower.includes("limit") || lower.includes("quota")) return "配额上限";
  if (lower.includes("channel") || lower.includes("pay")) return "支付方式/渠道";

  // 工作空间与岗位
  if (lower.includes("position")) return "岗位相关配置";
  if (lower.includes("workspace")) return "工作空间相关";
  if (lower.includes("component")) return "组件相关";
  if (lower.includes("model")) return "模型配置";

  // 通用推导
  if (lower.includes("name")) return "相关名称";
  if (lower.includes("id")) return "相关编号";
  if (lower.includes("time") || lower.includes("date")) return "记录时间";
  if (lower.includes("user")) return "涉及用户";
  if (lower.includes("role")) return "涉及角色";
  if (lower.includes("status") || lower.includes("state")) return "执行状态";
  if (lower.includes("desc") || lower.includes("msg")) return "内容说明";
  if (lower.includes("count") || lower.includes("num") || lower.includes("qty")) return "数量统计";

  return key;
};

// 将字段值英文转为中文显示（如 true/false/ADMIN/UI_DESIGNER 等，带单位智能格式化）
const formatMetadataValue = (key: string, val: any): string => {
  const lower = key.toLowerCase();
  if (val === true) {
    if (lower.includes("delete")) return "已确认删除";
    if (lower.includes("popular")) return "是 / 热门推荐";
    return "是 / 正常启用";
  }
  if (val === false) {
    if (lower.includes("delete")) return "未删除";
    if (lower.includes("popular")) return "否 / 普通展示";
    return "否 / 停用关闭";
  }
  if (val === null || val === undefined || val === "") return "无";

  // 针对 price 字段若是数值，加上货币符号与“元”
  if (lower === "price" && typeof val === "number") {
    return `¥${val.toFixed(2).replace(/\.00$/, "")} 元`;
  }
  // 针对 points 字段若是数值，格式化千分符并带上“点”
  if (lower === "points" && (typeof val === "number" || typeof val === "string")) {
    const num = Number(val);
    if (!isNaN(num)) return `${num.toLocaleString()} 点`;
  }

  // 如果是数组，逐项解析显示
  if (Array.isArray(val)) {
    if (val.length === 0) return "无限制 / 未分配任何项目";
    // 如果是组件ID列表，或者岗位列表
    if (val.every((item) => typeof item === "string")) {
      return val.map((item) => CODE_TRANSLATIONS[item] || item).join("、");
    }
    return `共 ${val.length} 项详细配置（可在原始数据中查看）`;
  }

  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  const s = String(val);
  if (CODE_TRANSLATIONS[s]) return CODE_TRANSLATIONS[s];
  if (s === "success") return "成功";
  if (s === "failed" || s === "error") return "失败";
  if (s === "pending") return "处理中";
  if (s === "admin") return "空间管理员";
  if (s === "owner") return "空间所有者";
  if (s === "member") return "普通协作成人员";
  return s;
};

// 格式化关联资源目标描述（避免 POSITIONS_CONFIG 等英文直接裸露）
const formatResourceLabel = (resourceId?: string | null): string => {
  if (!resourceId) return "系统全局操作";
  if (CODE_TRANSLATIONS[resourceId]) return CODE_TRANSLATIONS[resourceId];
  if (resourceId === "POSITIONS_CONFIG") return "空间岗位与权限矩阵配置";
  if (resourceId.startsWith("cm")) return `目标工作空间 (ID: ${resourceId})`;
  return resourceId;
};

export default function UserActivitiesPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [statistics, setStatistics] = useState<ActivityStatistics>({
    total: 0,
    workspace: 0,
    component: 0,
    security: 0,
    membership: 0,
    today: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10, // 固定每页 10 条
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 筛选与搜索状态
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7days" | "30days">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 多选与批量操作状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 详情弹窗状态
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<UserActivity | null>(null);
  const [copiedMetadata, setCopiedMetadata] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // 删除确认对话框状态
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    type: "single" | "batch";
    id?: string;
    count?: number;
  }>({
    open: false,
    type: "single",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // 加载操作日志列表与统计数据
  const loadActivities = useCallback(
    async (pageToLoad = 1, isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const authToken = getAuthToken();
        const queryParams = new URLSearchParams({
          page: String(pageToLoad),
          limit: "10",
          category: filterType,
        });

        if (startDate || endDate) {
          if (startDate) queryParams.set("startDate", startDate);
          if (endDate) queryParams.set("endDate", endDate);
        } else if (timeRange !== "all") {
          queryParams.set("timeRange", timeRange);
        }

        if (searchTerm.trim()) {
          queryParams.set("keyword", searchTerm.trim());
        }

        const res = await fetch(`/api/user/activities?${queryParams.toString()}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setActivities(data.data || []);
            if (data.pagination) {
              setPagination(data.pagination);
            }
            if (data.statistics) {
              setStatistics(data.statistics);
            }
            setSelectedIds((prev) => prev.filter((id) => (data.data || []).some((l: UserActivity) => l.id === id)));
            setSelectAll(false);

            if (isManual) {
              toast.success("操作记录已刷新至最新状态");
            }
          }
        } else {
          if (isManual) toast.error("拉取日志失败，请检查登录会话状态");
        }
      } catch (error) {
        console.error("Load activities error:", error);
        if (isManual) toast.error("网络连接异常，无法连接操作记录服务");
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [filterType, timeRange, startDate, endDate, searchTerm, toast]
  );

  // 初始化与筛选联动
  useEffect(() => {
    loadActivities(1, false);
  }, [filterType, timeRange, startDate, endDate]);

  // 搜索提交
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadActivities(1, false);
  };

  // 快捷时间窗口点击：自动给起始和结束日期赋值
  const handleSetQuickDate = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) {
      start.setDate(end.getDate() - days);
    }
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];
    setStartDate(startStr);
    setEndDate(endStr);
    setTimeRange("all");
  };

  // 清空所有筛选条件
  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterType("ALL");
    setTimeRange("all");
    setStartDate("");
    setEndDate("");
    setSelectedIds([]);
    setSelectAll(false);
    toast.info("已重置为全部操作记录");
  };

  // 单选
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      setSelectAll(next.length === activities.length && activities.length > 0);
      return next;
    });
  };

  // 全选当前页
  const handleToggleSelectAll = () => {
    if (selectAll || (selectedIds.length === activities.length && activities.length > 0)) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      setSelectedIds(activities.map((a) => a.id));
      setSelectAll(true);
    }
  };

  // 触发单项删除
  const handleTriggerSingleDelete = (id: string) => {
    setConfirmDelete({
      open: true,
      type: "single",
      id,
      count: 1,
    });
  };

  // 触发批量删除（自动剔除受合规保护的安全敏感日志）
  const handleTriggerBatchDelete = () => {
    const deletable = selectedIds.filter(
      (id) => !isProtectedActivity(activities.find((a) => a.id === id)),
    );
    if (deletable.length === 0) {
      toast.error("所选日志均为安全敏感记录（登录/支付/改密/转让等），受合规保护不可删除");
      return;
    }
    setConfirmDelete({
      open: true,
      type: "batch",
      count: deletable.length,
    });
  };

  // 执行删除（单项或批量）
  const handleExecuteDelete = async () => {
    setDeleting(true);
    try {
      const authToken = getAuthToken();
      const deletableSelected = selectedIds.filter(
        (id) => !isProtectedActivity(activities.find((a) => a.id === id)),
      );
      const payload =
        confirmDelete.type === "batch"
          ? { ids: deletableSelected }
          : { id: confirmDelete.id };

      const res = await fetch("/api/user/activities", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "删除成功");
        setConfirmDelete({ open: false, type: "single" });
        setSelectedIds([]);
        setSelectAll(false);
        const newPage =
          activities.length === (confirmDelete.type === "batch" ? selectedIds.length : 1) && pagination.page > 1
            ? pagination.page - 1
            : pagination.page;
        loadActivities(newPage, false);
      } else {
        toast.error(data.error || "删除失败，请稍后重试");
      }
    } catch (error) {
      console.error("Delete activity error:", error);
      toast.error("网络连接异常，删除请求未完成");
    } finally {
      setDeleting(false);
    }
  };

  // 复制业务元数据
  const copyMetadata = (data: any) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedMetadata(true);
      toast.success("操作附带信息已复制到剪贴板");
      setTimeout(() => setCopiedMetadata(false), 2000);
    } catch {
      toast.error("复制失败，请手动选取复制");
    }
  };

  // 打开详情弹窗
  const handleViewDetail = (activity: UserActivity) => {
    setSelectedActivity(activity);
    setShowRawJson(false);
    setShowDetailModal(true);
  };

  // 相对时间友好展示
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  // 分类图标映射
  const getActivityIcon = (resourceType: string | null | undefined) => {
    switch (resourceType) {
      case "workspace":
        return FolderOpen;
      case "component":
        return Box;
      case "security":
        return Shield;
      case "profile":
        return User;
      case "membership":
        return CreditCard;
      case "knowledge":
        return BookOpen;
      case "task":
        return CheckSquare;
      case "asset":
        return Layers;
      case "quota":
        return Cpu;
      case "system":
        return Sliders;
      default:
        return Activity;
    }
  };

  // 分类专属颜色样式
  const getActivityColor = (resourceType: string | null | undefined) => {
    switch (resourceType) {
      case "workspace":
        return {
          badge: "bg-blue-50 text-[#3182ce] border-blue-200",
          iconBg: "bg-blue-50 text-[#3182ce]",
          name: "工作空间协同",
        };
      case "component":
        return {
          badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
          iconBg: "bg-emerald-50 text-emerald-600",
          name: "工程研发组件",
        };
      case "security":
        return {
          badge: "bg-amber-50 text-amber-700 border-amber-200",
          iconBg: "bg-amber-50 text-amber-600",
          name: "安全与账号",
        };
      case "profile":
        return {
          badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
          iconBg: "bg-indigo-50 text-indigo-600",
          name: "用户个人资料",
        };
      case "membership":
        return {
          badge: "bg-purple-50 text-purple-700 border-purple-200",
          iconBg: "bg-purple-50 text-purple-600",
          name: "会员充值订单",
        };
      case "knowledge":
        return {
          badge: "bg-teal-50 text-teal-700 border-teal-200",
          iconBg: "bg-teal-50 text-teal-600",
          name: "资料与知识库",
        };
      case "task":
        return {
          badge: "bg-sky-50 text-sky-700 border-sky-200",
          iconBg: "bg-sky-50 text-sky-600",
          name: "协同任务",
        };
      case "asset":
        return {
          badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
          iconBg: "bg-cyan-50 text-cyan-600",
          name: "资料资产",
        };
      case "quota":
        return {
          badge: "bg-orange-50 text-orange-700 border-orange-200",
          iconBg: "bg-orange-50 text-orange-600",
          name: "算力配额",
        };
      case "system":
        return {
          badge: "bg-slate-100 text-slate-700 border-slate-300",
          iconBg: "bg-slate-100 text-slate-600",
          name: "系统偏好设置",
        };
      default:
        return {
          badge: "bg-slate-50 text-slate-700 border-slate-200",
          iconBg: "bg-slate-100 text-slate-600",
          name: "常规操作",
        };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 页面顶部标题卡片（无跨模块跳转，通俗自然中文，保留刷新按钮） */}
      <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-inner flex-shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">操作日志与安全记录</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200 whitespace-nowrap flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  真实记录 · 历史可查
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  系统保留1年 · 超期自动清理
                </span>
                {pagination.total > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                    共 {pagination.total.toLocaleString()} 条有效记录
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                清晰记录您在平台进行的工作空间管理、工程组件维护、资料发布、密码变更与登录登出操作。系统自动保存最近 1 年（365天）的操作记录，超过 1 年的数据系统将自动清理。
              </p>
            </div>
          </div>

          {/* 顶部操作：刷新日志 */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              onClick={() => loadActivities(pagination.page, true)}
              disabled={refreshing}
              className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-50 active:scale-95"
              title="刷新最新操作记录"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>{refreshing ? "正在刷新..." : "刷新记录"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 大核心维度 Bento 指标统计网格卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* 卡片 1: 累计操作总数 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4.5 border border-white/90 shadow-2xs overflow-hidden group hover:border-[#3182ce]/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-[#3182ce]/10 blur-xl group-hover:scale-125 transition-transform"></div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-500">累计操作记录</span>
            <div className="w-8 h-8 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {statistics.total.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            近1年有效记录
          </div>
        </div>

        {/* 卡片 2: 空间协同操作 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4.5 border border-white/90 shadow-2xs overflow-hidden group hover:border-blue-400/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-blue-500/10 blur-xl group-hover:scale-125 transition-transform"></div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-500">工作空间协同</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {statistics.workspace.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            空间与成员管理
          </div>
        </div>

        {/* 卡片 3: 研发工程组件 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4.5 border border-white/90 shadow-2xs overflow-hidden group hover:border-emerald-400/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-emerald-500/10 blur-xl group-hover:scale-125 transition-transform"></div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-500">工程研发组件</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {statistics.component.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            组件构建与发布
          </div>
        </div>

        {/* 卡片 4: 安全与认证 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4.5 border border-white/90 shadow-2xs overflow-hidden group hover:border-amber-400/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-amber-500/10 blur-xl group-hover:scale-125 transition-transform"></div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-500">安全与登录</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight">
            {statistics.security.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            登录/登出/密码与密钥
          </div>
        </div>

        {/* 卡片 5: 今日操作 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4.5 border border-white/90 shadow-2xs overflow-hidden group hover:border-purple-400/40 transition-all">
          <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-purple-500/10 blur-xl group-hover:scale-125 transition-transform"></div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-500">今日产生操作</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center relative">
              <Clock className="w-4 h-4" />
              {statistics.today > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse"></span>
              )}
            </div>
          </div>
          <div className="text-2xl font-black text-purple-700 tracking-tight flex items-baseline gap-1.5">
            <span>{statistics.today.toLocaleString()}</span>
            <span className="text-xs font-bold text-purple-400">条</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            今日最新动态
          </div>
        </div>
      </div>

      {/* 复合筛选工作台（第一行搜索+分类，第二行将自定义时间紧跟在近30天后面） */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-4.5 shadow-2xs space-y-3.5">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索操作说明、相关名称编号或 IP 地址..."
              className="w-full pl-9 pr-16 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              搜索
            </button>
          </div>

          {/* 全量模块分类下拉 */}
          <div className="w-full md:w-64 shrink-0 relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full h-10 pl-3 pr-8 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all cursor-pointer appearance-none"
            >
              <option value="ALL">全量模块分类 (全部)</option>
              <option value="workspace">📁 工作空间协同 (Workspace)</option>
              <option value="component">⚙️ 工程研发组件 (Component)</option>
              <option value="security">🛡️ 安全与身份认证 (Security)</option>
              <option value="profile">👤 用户与个人资料 (Profile)</option>
              <option value="membership">💳 会员与充值订单 (Membership)</option>
              <option value="knowledge">📚 资料与知识库 (Knowledge)</option>
              <option value="task">📋 研发协同任务 (Task)</option>
              <option value="asset">📦 资料与制品资产 (Asset)</option>
              <option value="quota">⚡ 算力配额治理 (Quota)</option>
              <option value="system">⚙️ 系统设置偏好 (System)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </form>

        {/* 时间筛选整行：快捷按钮 + 紧跟在近30天后面的自定义时间选择框 */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>时间窗口:</span>
            </span>
            <div className="flex items-center gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSetQuickDate(0)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#3182ce] hover:bg-blue-50 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                今日
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => handleSetQuickDate(7)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#3182ce] hover:bg-blue-50 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                近 7 天
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => handleSetQuickDate(30)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#3182ce] hover:bg-blue-50 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
              >
                近 30 天
              </button>
            </div>

            {/* 紧跟在近 30 天后面的自定义时间输入框（完全符合用户要求） */}
            <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setTimeRange("all");
                }}
                className="border border-slate-200 rounded-xl px-2.5 h-8 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none transition-all"
                title="起始日期"
              />
              <span className="text-xs text-slate-400 font-bold">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setTimeRange("all");
                }}
                className="border border-slate-200 rounded-xl px-2.5 h-8 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none transition-all"
                title="截止日期"
              />
            </div>
          </div>

          {(searchTerm || filterType !== "ALL" || startDate || endDate || timeRange !== "all") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>清空所有筛选</span>
            </button>
          )}
        </div>
      </div>

      {/* 批量操作浮动栏 */}
      {selectedIds.length > 0 && (
        <div className="bg-[#3182ce]/5 border border-[#3182ce]/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
            已勾选 <span className="text-[#3182ce] font-black text-sm">{selectedIds.length}</span> 条操作记录
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerBatchDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>批量删除</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setSelectAll(false);
              }}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 操作记录明细展示列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden text-left">
        {/* 表头摘要与批量全选 */}
        <div className="flex items-center justify-between p-4 sm:px-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            {/* 全选复选框 */}
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer flex items-center"
              title={selectAll ? "取消全选" : "全选当前页"}
            >
              {selectAll || (selectedIds.length === activities.length && activities.length > 0) ? (
                <CheckSquare className="w-4 h-4 text-[#3182ce]" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>

            <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <div className="w-1.5 h-4 bg-[#3182ce] rounded-full"></div>
              <span>操作记录明细</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              (第 {pagination.page} / {pagination.totalPages} 页 · 每页 10 条)
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            当前展示 {activities.length} 条记录
          </span>
        </div>

        {/* 列表内容：采用对齐管理员后台的现代化标准数据表格 */}
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-500">正在从数据库加载操作记录...</p>
          </div>
        ) : activities.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[960px] border-collapse">
              <thead className="bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-[11px] text-slate-500 font-bold sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 w-12 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer inline-flex items-center"
                      title={selectAll ? "取消全选" : "全选当前页"}
                    >
                      {selectAll || (selectedIds.length === activities.length && activities.length > 0) ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 whitespace-nowrap min-w-[130px]">操作类型</th>
                  <th className="py-3 px-4 whitespace-nowrap min-w-[120px]">业务分类</th>
                  <th className="py-3 px-4 whitespace-nowrap">操作描述与详细说明</th>
                  <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">来源 IP 地址</th>
                  <th className="py-3 px-4 whitespace-nowrap min-w-[160px]">记录生成时间</th>
                  <th className="sticky right-0 z-10 py-3 px-4 text-right whitespace-nowrap min-w-[140px] bg-slate-50/95 border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                {activities.map((activity) => {
                  const isChecked = selectedIds.includes(activity.id);
                  const colorConfig = getActivityColor(activity.resourceType);
                  const isProtected = isProtectedActivity(activity);

                  return (
                    <tr
                      key={activity.id}
                      className={`hover:bg-blue-50/25 transition-colors group ${
                        isChecked ? "bg-blue-50/35" : ""
                      }`}
                    >
                      {/* 复选框 */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(activity.id)}
                          className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer inline-flex items-center"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* 操作类型 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border shadow-2xs inline-block ${activity.actionBadgeColor}`}
                        >
                          {activity.actionLabel}
                        </span>
                      </td>

                      {/* 业务分类 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${colorConfig.badge}`}
                        >
                          {activity.resourceCategoryLabel}
                        </span>
                      </td>

                      {/* 操作描述 */}
                      <td className="py-3 px-4 max-w-[340px]">
                        <div
                          className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                          title={activity.description}
                        >
                          {activity.description}
                        </div>
                        {activity.resourceId && (
                          <div
                            className="text-[10px] font-mono text-slate-400 truncate mt-0.5"
                            title={activity.resourceId}
                          >
                            标的：{activity.resourceLabel || formatResourceLabel(activity.resourceId)}
                          </div>
                        )}
                      </td>

                      {/* 来源 IP */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {activity.ipAddress ? (
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 inline-flex items-center gap-1">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span>{activity.ipAddress === "::1" ? "127.0.0.1 (本地局域网)" : activity.ipAddress}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 时间（仅保留标准时间，彻底去除相对时间提示） */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{new Date(activity.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                        </div>
                      </td>

                      {/* 固定操作列 */}
                      <td className="sticky right-0 z-10 py-3 px-4 text-right whitespace-nowrap bg-white group-hover:bg-[#f6f9fe] border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewDetail(activity)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 rounded border border-slate-200/80 hover:border-blue-200 transition-colors cursor-pointer shadow-2xs"
                            title="查看详情"
                          >
                            <Eye className="w-3 h-3" />
                            <span>详情</span>
                          </button>
                          {!isProtected ? (
                            <button
                              type="button"
                              onClick={() => handleTriggerSingleDelete(activity.id)}
                              className="inline-flex items-center gap-1 h-7 px-2 text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 rounded border border-rose-200/80 hover:border-rose-600 transition-all cursor-pointer shadow-2xs active:scale-95"
                              title="删除此记录"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>删除</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 select-none" title="安全审计关键日志依法留存，不可擅自删除">
                              合规保护
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* 空状态 */
          <div className="py-20 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto shadow-inner">
              <Activity className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-700">暂无符合条件的操作记录</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                未检索到当前筛选范围内的操作记录，您在平台进行空间管理、组件开发或密码维护后将实时记录于此。
              </p>
            </div>
            {(searchTerm || filterType !== "ALL" || startDate || endDate || timeRange !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 px-3.5 py-1.5 text-xs font-bold text-[#3182ce] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>清空筛选条件重新拉取</span>
              </button>
            )}
          </div>
        )}

        {/* 底部标准分页条（固定每页 10 条） */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/40 flex justify-center">
            <Pagination
              currentPage={pagination.page}
              totalItems={pagination.total}
              pageSize={pagination.limit}
              onPageChange={(p) => loadActivities(p, false)}
              itemLabel="条操作记录"
            />
          </div>
        )}
      </div>

      {/* 详情弹窗：彻底消除所有英文键值，100% 优雅中文呈现 */}
      {mounted &&
        typeof document !== "undefined" &&
        showDetailModal &&
        selectedActivity &&
        createPortal(
          <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
              {/* 弹窗头部 */}
              <div className="p-5 pb-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${getActivityColor(selectedActivity.resourceType).iconBg} flex items-center justify-center shrink-0 shadow-2xs`}
                  >
                    {React.createElement(getActivityIcon(selectedActivity.resourceType), {
                      className: "w-5 h-5",
                    })}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-800">操作记录详情</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${selectedActivity.actionBadgeColor}`}
                      >
                        {selectedActivity.actionLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      记录唯一编号: <span className="font-mono text-slate-600">{selectedActivity.id}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 弹窗主体内容 */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1 text-left">
                {/* 1. 操作说明 */}
                <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1">
                  <div className="text-[11px] font-bold text-[#2b6cb0] flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>操作中文说明</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 leading-relaxed">
                    {selectedActivity.description}
                  </p>
                </div>

                {/* 2. 基础属性网格 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold block">所属功能分类</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                          getActivityColor(selectedActivity.resourceType).badge
                        }`}
                      >
                        {selectedActivity.resourceCategoryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold block">操作执行时间</span>
                    <span className="text-xs font-mono font-bold text-slate-700 block">
                      {new Date(selectedActivity.createdAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold block">相关目标</span>
                    <span className="text-xs font-mono font-bold text-slate-700 truncate block">
                      {selectedActivity.resourceLabel || formatResourceLabel(selectedActivity.resourceId)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold block">所属工作空间</span>
                    <span className="text-xs font-mono text-slate-700 truncate block">
                      {selectedActivity.workspaceId || "个人中心主空间"}
                    </span>
                  </div>
                </div>

                {/* 3. 网络与访问环境 */}
                <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>请求网络 IP 与保存状态</span>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {!selectedActivity.ipAddress || selectedActivity.ipAddress === "::1"
                        ? "127.0.0.1 (本地局域网)"
                        : selectedActivity.ipAddress}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      记录有效 · 系统保存1年
                    </span>
                  </div>
                </div>

                {/* 4. 操作附带详细信息（彻底转译为中文，无 message、deleted 等英文裸露） */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>操作附带信息</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="text-[11px] font-bold text-slate-500 hover:text-[#3182ce] transition-colors cursor-pointer"
                      >
                        {showRawJson ? "切换为中文卡片" : "查看原始 JSON"}
                      </button>
                      {selectedActivity.metadata && Object.keys(selectedActivity.metadata).length > 0 && (
                        <button
                          type="button"
                          onClick={() => copyMetadata(selectedActivity.metadata)}
                          className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedMetadata ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>复制信息</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {showRawJson ? (
                    <div className="relative rounded-xl border border-slate-200 bg-slate-900 p-3 text-slate-100 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto">
                      {selectedActivity.metadata && Object.keys(selectedActivity.metadata).length > 0 ? (
                        <pre className="whitespace-pre-wrap break-all text-emerald-400">
                          {JSON.stringify(selectedActivity.metadata, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-slate-400 italic">
                          本次操作无额外附带参数
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-xl">
                      {selectedActivity.metadata &&
                      typeof selectedActivity.metadata === "object" &&
                      Object.keys(selectedActivity.metadata).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(selectedActivity.metadata).map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-start justify-between gap-3 py-1 border-b border-slate-200/60 last:border-0"
                            >
                              <span className="font-bold text-slate-500 text-xs shrink-0">
                                {formatMetadataKey(k)}:
                              </span>
                              <span className="font-medium text-slate-800 text-xs text-right break-all max-w-[70%]">
                                {formatMetadataValue(k, v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          本次操作为标准指令，无额外业务参数。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 弹窗底部操作栏 */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailModal(false);
                    handleTriggerSingleDelete(selectedActivity.id);
                  }}
                  className="h-9 px-3.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除此条记录</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDetailModal(false)}
                    className="h-9 px-5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 删除二次确认对话框 */}
      {mounted &&
        typeof document !== "undefined" &&
        confirmDelete.open &&
        createPortal(
          <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left p-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-base font-black text-slate-800">
                    {confirmDelete.type === "batch" ? "批量删除操作记录" : "删除单条操作记录"}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {confirmDelete.type === "batch"
                      ? `即将彻底删除选中的 ${confirmDelete.count} 条操作记录。删除后不可恢复，请确认是否继续？`
                      : "即将彻底删除该条操作记录。删除后不可恢复，请确认是否继续？"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ open: false, type: "single" })}
                  disabled={deleting}
                  className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={deleting}
                  className="h-9 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
                >
                  {deleting && <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
                  <span>{deleting ? "正在清理..." : "确认永久删除"}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
