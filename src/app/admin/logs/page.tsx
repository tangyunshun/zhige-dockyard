"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuthToken } from "@/utils/auth";
import Pagination from "@/components/Pagination";
import {
  Search,
  FileText,
  Shield,
  Activity,
  Clock,
  MapPin,
  Monitor,
  AlertCircle,
  RefreshCw,
  Database,
  CheckCircle2,
  Calendar,
  Lock,
} from "lucide-react";

interface OperationLog {
  id: string;
  userId: string;
  workspaceId?: string | null;
  action: string;
  resource?: string | null;
  details?: any;
  ipAddress?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface LoginHistory {
  id: string;
  userId: string;
  loginAt: string;
  ipAddress?: string | null;
  location?: string | null;
  device?: string | null;
  userAgent?: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface LogData {
  logs?: OperationLog[];
  histories?: LoginHistory[];
  total: number;
  page: number;
  totalPages: number;
  stats?: {
    total: number;
    today: number;
    highRisk: number;
  };
}

// 单词字典：用于智能分词翻译未被完全枚举的英文组合
const WORD_DICT: Record<string, string> = {
  device: "终端设备",
  kicked: "强制",
  offline: "下线",
  session: "登录会话",
  conflict: "异地冲突",
  logout: "安全登出",
  login: "账号登录",
  auth: "认证授权",
  token: "算力令牌",
  recharge: "充值入账",
  plan: "空间套餐",
  upgrade: "升级变更",
  user: "用户账号",
  create: "新建创建",
  update: "配置更新",
  delete: "下架删除",
  ban: "账号封禁",
  unban: "账号解封",
  workspace: "工作空间",
  member: "空间成员",
  invite: "邀请加入",
  remove: "移除退出",
  component: "功能组件",
  task: "执行任务",
  execute: "调度执行",
  bind: "装配启用",
  unbind: "解除装配",
  asset: "知识资料",
  document: "知识文档",
  approve: "审核通过",
  reject: "审核驳回",
  restore: "恢复数据",
  system: "系统配置",
  permission: "角色权限",
  quota: "资源配额",
};

// 精确操作类型字典
const ACTION_ZH_EXACT: Record<string, { label: string; bg: string; text: string; border: string }> = {
  // 设备互踢与会话管理
  "DEVICE KICKED OFFLINE": { label: "设备强制下线", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "DEVICE_KICKED_OFFLINE": { label: "设备强制下线", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "SESSION CONFLICT LOGOUT": { label: "异地登录互踢", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "SESSION_CONFLICT_LOGOUT": { label: "异地登录互踢", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "USER_RESET_SESSION": { label: "重置会话下线", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "user:reset_session": { label: "重置会话下线", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },

  // 用户生命周期
  "user:create": { label: "创建用户账号", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "user:update": { label: "更新用户信息", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "user:delete": { label: "删除用户账号", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "user:ban": { label: "封禁违规用户", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "user:unban": { label: "解封用户账号", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },

  // 认证维度
  "auth:login": { label: "账号成功登录", bg: "bg-purple-50", text: "text-[#6b46c1]", border: "border-purple-200" },
  "auth:logout": { label: "用户主动登出", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
  "LOGIN": { label: "账号成功登录", bg: "bg-purple-50", text: "text-[#6b46c1]", border: "border-purple-200" },
  "LOGOUT": { label: "用户主动登出", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },

  // 工作空间
  "workspace:create": { label: "创建工作空间", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "workspace:update": { label: "修改空间配置", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "workspace:delete": { label: "解散工作空间", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "CREATE_WORKSPACE": { label: "创建个人空间", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "CREATE_ENTERPRISE_WORKSPACE": { label: "创建企业空间", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  "JOIN_WORKSPACE": { label: "加入协作空间", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "LEAVE_WORKSPACE": { label: "退出协作空间", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "INVITE_MEMBER": { label: "邀请空间成员", bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  "REMOVE_MEMBER": { label: "移除空间成员", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },

  // 组件装配与任务执行
  "component:create": { label: "新建功能组件", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "component:update": { label: "更新组件属性", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "component:delete": { label: "下架功能组件", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "component:execute": { label: "执行组件任务", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  "BIND_COMPONENT": { label: "装配工作流组件", bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  "UNBIND_COMPONENT": { label: "卸载空间组件", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },

  // 知识资料管理
  "asset:upload": { label: "上传知识资料", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "asset:remove": { label: "移除公开资料", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "asset:approve": { label: "审核通过资料", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "asset:reject": { label: "审核驳回资料", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  "asset:restore": { label: "恢复已删除资料", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },

  // 基础动作
  "CREATE": { label: "新建业务记录", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "UPDATE": { label: "更新业务配置", bg: "bg-blue-50", text: "text-[#2b6cb0]", border: "border-blue-200" },
  "DELETE": { label: "删除业务数据", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

// 资源精确映射字典
const RESOURCE_ZH_EXACT: Record<string, string> = {
  "auth/device": "认证鉴权 / 终端设备",
  "auth/session": "认证鉴权 / 登录会话",
  "auth/token": "认证鉴权 / 访问令牌",
  "auth/login": "认证鉴权 / 登录安全",
  "workspace/member": "工作空间 / 成员岗位",
  "workspace/quota": "工作空间 / 算力配额",
  "workspace/component": "工作空间 / 装配组件",
  "component/task": "功能组件 / 执行任务",
  "document/file": "知识资料 / 文档存储",
  "user": "用户账号",
  "workspace": "工作空间",
  "component": "功能组件",
  "componenttask": "自动化任务",
  "document": "知识资料",
  "asset": "知识资料",
  "billing": "计费与订单",
  "order": "支付订单",
  "system": "系统安全配置",
};

export default function AdminLogsPage() {
  const [logData, setLogData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"operation" | "login">("operation");
  const [refreshing, setRefreshing] = useState(false);

  // 100% 汉化操作类型
  const renderActionBadge = (action: string) => {
    if (!action) return <span className="text-slate-400 text-xs">未知操作</span>;
    
    // 1. 先查精确字典
    if (ACTION_ZH_EXACT[action]) {
      const meta = ACTION_ZH_EXACT[action];
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border shadow-xs whitespace-nowrap select-none ${meta.bg} ${meta.text} ${meta.border}`}>
          {meta.label}
        </span>
      );
    }

    // 2. 查带前缀或下划线的模糊匹配
    const norm = action.trim().toUpperCase();
    if (ACTION_ZH_EXACT[norm]) {
      const meta = ACTION_ZH_EXACT[norm];
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border shadow-xs whitespace-nowrap select-none ${meta.bg} ${meta.text} ${meta.border}`}>
          {meta.label}
        </span>
      );
    }

    // 3. 智能分词翻译（分割空格、下划线、冒号）
    const tokens = action.split(/[\s_:]+/);
    const translatedTokens = tokens.map(t => WORD_DICT[t.toLowerCase()] || t);
    const label = translatedTokens.join(" ");

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-700 shadow-xs whitespace-nowrap select-none">
        {label}
      </span>
    );
  };

  // 100% 汉化涉及业务资源
  const renderResourceName = (resource?: string | null) => {
    if (!resource || resource === "-") {
      return <span className="text-slate-400 font-medium text-xs whitespace-nowrap">系统默认资源</span>;
    }

    const cleanRes = resource.trim();

    // 1. 精确匹配（如 auth/device）
    if (RESOURCE_ZH_EXACT[cleanRes]) {
      return <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{RESOURCE_ZH_EXACT[cleanRes]}</span>;
    }

    // 2. 斜杠路径分解翻译（如 a/b）
    if (cleanRes.includes("/")) {
      const parts = cleanRes.split("/");
      const zhParts = parts.map(p => RESOURCE_ZH_EXACT[p.toLowerCase()] || WORD_DICT[p.toLowerCase()] || p);
      return <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{zhParts.join(" / ")}</span>;
    }

    // 3. 冒号前缀结构（如 workspace:ws-xxx）
    if (cleanRes.includes(":")) {
      const [type, id] = cleanRes.split(":");
      const typeZh = RESOURCE_ZH_EXACT[type.toLowerCase()] || WORD_DICT[type.toLowerCase()] || type;
      return (
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="font-bold text-slate-800">{typeZh}</span>
          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded" title={id}>
            {id.length > 18 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id}
          </span>
        </div>
      );
    }

    const zh = RESOURCE_ZH_EXACT[cleanRes.toLowerCase()] || WORD_DICT[cleanRes.toLowerCase()] || cleanRes;
    return <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{zh}</span>;
  };

  // 格式化 IP 地址（真实网络呈现，单行不换行）
  const renderIPAddress = (ip?: string | null) => {
    if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.includes("127.0.0.1")) {
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-mono text-xs font-semibold text-slate-700">127.0.0.1</span>
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">本地局域网</span>
        </div>
      );
    }
    const cleanIp = ip.replace(/^::ffff:/, "");
    return (
      <span className="font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
        {cleanIp}
      </span>
    );
  };

  // 格式化时间：具体到时分秒，年月日放上面，时分秒放下面，单行紧凑排版
  const renderDualLineTime = (timeStr?: string | null) => {
    if (!timeStr) return <span className="text-slate-400 font-mono text-xs whitespace-nowrap">-</span>;
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return <span className="text-slate-400 font-mono text-xs whitespace-nowrap">{timeStr}</span>;

    const pad = (n: number) => n.toString().padStart(2, "0");
    const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    return (
      <div className="flex flex-col items-start leading-none whitespace-nowrap py-0.5">
        <span className="font-mono text-xs font-bold text-slate-800 tracking-tight">{datePart}</span>
        <span className="font-mono text-[11px] font-semibold text-slate-400 mt-1">{timePart}</span>
      </div>
    );
  };

  // 加载操作日志（每页严格 10 条）
  const loadOperationLogs = useCallback(async (page: number, search: string = searchQuery, action: string = filterAction) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        ...(action !== "all" && { action }),
        ...(search.trim() && { user: search.trim() }),
      });

      const res = await fetch(`/api/admin/operation-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("加载操作日志失败");

      const result = await res.json();
      if (result.success && result.data) {
        setLogData(result.data);
      }
    } catch (error) {
      console.error("加载操作日志错误:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, filterAction]);

  // 加载登录历史（每页严格 10 条）
  const loadLoginHistories = useCallback(async (page: number, search: string = searchQuery) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        ...(search.trim() && { keyword: search.trim() }),
      });

      const res = await fetch(`/api/admin/login-histories?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("加载登录历史失败");

      const result = await res.json();
      if (result.success && result.data) {
        setLogData(result.data);
      }
    } catch (error) {
      console.error("加载登录历史错误:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === "operation") {
      loadOperationLogs(currentPage);
    } else {
      loadLoginHistories(currentPage);
    }
  }, [currentPage, filterAction, activeTab, loadOperationLogs, loadLoginHistories]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    if (activeTab === "operation") {
      loadOperationLogs(1, searchQuery, filterAction);
    } else {
      loadLoginHistories(1, searchQuery);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === "operation") {
      loadOperationLogs(currentPage);
    } else {
      loadLoginHistories(currentPage);
    }
  };

  const totalCount = logData?.total || 0;

  return (
    <div className="p-6 space-y-5 text-left bg-[#f8fafc] min-h-full">
      {/* 顶部标题区（契合平台后台标准规范） */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              系统日志
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#3182ce]/10 text-[#2b6cb0] border border-[#3182ce]/20">
              全域审计流水
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            操作审计流水全量追溯、登录安全核验与异地互踢追踪 · 严格遵照 3 年生命周期留存
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* 3 年合规留存标识 */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/80 border border-blue-200/60 rounded-full text-[11px] font-semibold text-[#2b6cb0]">
            <Lock className="w-3.5 h-3.5 text-[#2b6cb0]" />
            <span>日志合规保存 3 年，超期自动删除</span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 核心指标看板 (圆润 16px 大圆角与柔和微阴影) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-0.5">总流水记录</div>
            <div className="text-2xl font-black text-slate-800 font-mono tracking-tight">
              {totalCount.toLocaleString("zh-CN")}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2b6cb0]">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-0.5">今日活跃流水</div>
            <div className="text-2xl font-black text-slate-800 font-mono tracking-tight">
              {(logData?.stats?.today ?? 0).toLocaleString("zh-CN")}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-0.5">高危敏感变动</div>
            <div className="text-2xl font-black text-amber-600 font-mono tracking-tight">
              {(logData?.stats?.highRisk ?? 0).toLocaleString("zh-CN")}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 主表格卡片 (圆润 16px 大圆角与精致微阴影) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* 顶部 Tab 与搜索条 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-4 py-3 gap-3">
          {/* Tab 切换 (优雅圆角胶囊容器) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/50 rounded-xl">
            <button
              onClick={() => { setActiveTab("operation"); setCurrentPage(1); }}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                activeTab === "operation"
                  ? "bg-white text-[#2b6cb0] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-[#2b6cb0]" />
              <span>操作审计流水</span>
            </button>
            <button
              onClick={() => { setActiveTab("login"); setCurrentPage(1); }}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                activeTab === "login"
                  ? "bg-white text-[#2b6cb0] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-[#2b6cb0]" />
              <span>登录安全历史</span>
            </button>
          </div>

          {/* 筛选与搜索 (圆角胶囊风格) */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            {activeTab === "operation" && (
              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
                className="h-8.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 shadow-2xs cursor-pointer transition-all"
              >
                <option value="all">全部操作类型</option>
                <option value="DEVICE KICKED OFFLINE">设备强制下线</option>
                <option value="SESSION CONFLICT LOGOUT">异地登录互踢</option>
                <option value="user:create">创建用户</option>
                <option value="user:update">更新用户</option>
                <option value="user:delete">删除用户</option>
                <option value="workspace:create">创建空间</option>
                <option value="workspace:delete">删除空间</option>
                <option value="component:execute">执行组件任务</option>
                <option value="auth:login">账号登录</option>
                <option value="auth:logout">安全登出</option>
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索用户名或邮箱..."
                className="h-8.5 pl-8.5 pr-3 w-44 sm:w-56 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 shadow-2xs transition-all"
              />
            </div>

            <button
              type="submit"
              className="h-8.5 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
            >
              查询
            </button>
          </form>
        </div>

        {/* 表格内容区域（坚决单行不换行） */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-7 h-7 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-2.5"></div>
            <p className="text-xs font-semibold text-slate-500">正在实时加载审计数据...</p>
          </div>
        ) : activeTab === "operation" ? (
          /* 操作审计流水表格 */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-60 whitespace-nowrap">操作人员</th>
                  <th className="py-3 px-4 w-44 whitespace-nowrap">操作类型</th>
                  <th className="py-3 px-4 whitespace-nowrap">涉及业务资源</th>
                  <th className="py-3 px-4 w-44 whitespace-nowrap">客户端 IP 地址</th>
                  <th className="py-3 px-4 w-36 whitespace-nowrap">发生时间 (时分秒)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {!logData?.logs || logData.logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">暂无操作日志记录</p>
                    </td>
                  </tr>
                ) : (
                  logData.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* 操作人 */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {log.user?.avatar ? (
                            <img
                              src={log.user.avatar}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
                              {log.user?.name?.charAt(0) || log.user?.email?.charAt(0) || "U"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate max-w-[140px]">
                              {log.user?.name || "系统用户"}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                              {log.user?.email || "-"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 操作类型（100% 中文） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* 涉及业务资源（100% 中文） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderResourceName(log.resource)}
                      </td>

                      {/* 客户端 IP（告别 ::1，单行） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderIPAddress(log.ipAddress)}
                      </td>

                      {/* 发生时间（双行紧凑年月日时分秒） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderDualLineTime(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* 登录安全历史表格 */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-60 whitespace-nowrap">登录用户</th>
                  <th className="py-3 px-4 w-36 whitespace-nowrap">登录时间 (时分秒)</th>
                  <th className="py-3 px-4 w-44 whitespace-nowrap">真实登录 IP</th>
                  <th className="py-3 px-4 w-48 whitespace-nowrap">地理归属地</th>
                  <th className="py-3 px-4 whitespace-nowrap">客户端设备与系统</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {!logData?.histories || logData.histories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">暂无登录安全历史记录</p>
                    </td>
                  </tr>
                ) : (
                  logData.histories.map((history) => (
                    <tr key={history.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* 登录用户 */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {history.user?.avatar ? (
                            <img
                              src={history.user.avatar}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
                              {history.user?.name?.charAt(0) || history.user?.email?.charAt(0) || "U"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate max-w-[140px]">
                              {history.user?.name || "未知用户"}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                              {history.user?.email || "-"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 登录时间（双行紧凑年月日时分秒） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderDualLineTime(history.loginAt)}
                      </td>

                      {/* 真实登录 IP */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderIPAddress(history.ipAddress)}
                      </td>

                      {/* 地理归属地（从数据库中真实查询，坚决单行不换行） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold whitespace-nowrap">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{history.location || "本地局域专网"}</span>
                        </div>
                      </td>

                      {/* 客户端设备与系统（真实数据，坚决单行不换行） */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium whitespace-nowrap">
                          <Monitor className="w-3.5 h-3.5 text-[#2b6cb0] shrink-0" />
                          <span>{history.device || "Windows 终端 · Web 浏览器"}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 统一分页组件（每页严格固定 10 条数据） */}
        <div className="px-4 py-3 bg-white border-t border-slate-200">
          <Pagination
            currentPage={currentPage}
            totalItems={totalCount}
            pageSize={10}
            itemLabel="条记录"
            onPageChange={(page) => setCurrentPage(page)}
          />
        </div>
      </div>
    </div>
  );
}
