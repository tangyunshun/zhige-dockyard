"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { describeApiError } from "@/lib/admin-error-presenter";
import {
  Building2,
  Users,
  FileText,
  Search,
  Activity,
  Cpu,
  Clock,
  ChevronRight,
  X,
  CheckCircle,
  Loader2,
  RefreshCw,
  Award,
  Layers,
  Shield,
  Filter,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Sparkles,
  Terminal,
  RotateCcw,
  BookOpen,
  Info,
  Database,
  Coins,
  Calendar,
} from "lucide-react";

interface MemberRow {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceStatus: string;
  userId: string;
  name: string | null;
  email: string;
  avatar: string | null;
  role: string;
  roleLabel: string;
  joinedAt: string;
  taskCount: number;
  topComponents: { componentId: string; name: string; count: number }[];
  recentLog: { action: string; createdAt: string } | null;
}

interface TenantStats {
  workspaceCount: number;
  memberCount: number;
  activeRate: number;
  totalExecutions: number;
}

interface TenantData {
  members: MemberRow[];
  total: number;
  page: number;
  totalPages: number;
  stats: TenantStats;
  spaces: { id: string; name: string; status?: string }[];
}

interface ComponentItem {
  componentId: string;
  name: string;
  category?: string;
  description?: string | null;
  icon?: string;
  count: number;
  detail?: any;
  isPublished?: boolean;
  usageCount?: number;
  estimatedModelTokens?: number;
  tags?: any;
  type?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface OperationItem {
  id: string;
  action: string;
  resource?: string | null;
  ipAddress?: string | null;
  userName: string | null;
  userAvatar?: string | null;
  createdAt: string;
  details: any;
}

interface MemberDetailData {
  profile: {
    workspaceId: string;
    workspaceName: string;
    userId: string;
    name: string | null;
    email: string;
    avatar: string | null;
    role: string;
    roleLabel: string;
    joinedAt: string;
  };
  taskOverview: {
    running: number;
    success: number;
    failed: number;
    total: number;
    successRate: number;
  };
  components: {
    items: ComponentItem[];
    total: number;
    page: number;
    totalPages: number;
    maxCount: number;
    totalCalls?: number;
  };
  operations: {
    items: OperationItem[];
    total: number;
    page: number;
    totalPages: number;
  };
}

const LOG_ACTION_META: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  "workspace:view_detail": {
    label: "查看空间",
    badgeCls: "bg-slate-100 text-slate-700 border-slate-200",
    dotCls: "bg-slate-400",
  },
  "workspace:update": {
    label: "修改空间",
    badgeCls: "bg-blue-50 text-[#2b6cb0] border-blue-200",
    dotCls: "bg-[#3182ce]",
  },
  "workspace:create": {
    label: "创建空间",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotCls: "bg-emerald-500",
  },
  "workspace:delete": {
    label: "删除空间",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
    dotCls: "bg-rose-500",
  },
  "workspace:status_update": {
    label: "管控空间",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
    dotCls: "bg-amber-500",
  },
  UPGRADE_PERSONAL_TO_ENTERPRISE: {
    label: "升级企业",
    badgeCls: "bg-purple-50 text-purple-700 border-purple-200",
    dotCls: "bg-purple-500",
  },
  TENANT_DISABLE: {
    label: "停用空间",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
    dotCls: "bg-rose-500",
  },
  TENANT_ENABLE: {
    label: "启用空间",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotCls: "bg-emerald-500",
  },
  COMPONENT_EXECUTE: {
    label: "执行组件",
    badgeCls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotCls: "bg-indigo-500",
  },
  COMPONENT_PUBLISH: {
    label: "发布组件",
    badgeCls: "bg-cyan-50 text-cyan-700 border-cyan-200",
    dotCls: "bg-cyan-500",
  },
  UPDATE_MEMBER_ROLE: {
    label: "权限变更",
    badgeCls: "bg-orange-50 text-orange-700 border-orange-200",
    dotCls: "bg-orange-500",
  },
};

const getLogMeta = (action: string) =>
  LOG_ACTION_META[action] || {
    label: action,
    badgeCls: "bg-slate-50 text-slate-600 border-slate-200",
    dotCls: "bg-slate-400",
  };

const COMPONENT_CATEGORY_LABEL: Record<string, { label: string; cls: string }> = {
  BID_PREP: { label: "标书智作", cls: "bg-blue-50 text-[#2b6cb0] border-blue-200" },
  SCHEME_GEN: { label: "方案生成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  KNOWLEDGE: { label: "知识检索", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  RULE_AUDIT: { label: "合规审查", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  GENERAL: { label: "通用组件", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
const getCompCat = (cat?: string) =>
  COMPONENT_CATEGORY_LABEL[cat || "GENERAL"] || COMPONENT_CATEGORY_LABEL.GENERAL;

const roleTagCls: Record<string, string> = {
  OWNER: "bg-amber-50 text-amber-700 border-amber-200",
  ADMIN: "bg-blue-50 text-[#2b6cb0] border-blue-200",
  MEMBER: "bg-slate-50 text-slate-600 border-slate-200",
};
const roleTag = (role: string) => roleTagCls[role] || roleTagCls.MEMBER;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatFull(d: string | Date) {
  const date = new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 2 小时内显示相对时间，超过显示具体时分秒
function formatSmart(d: string | Date) {
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 7200) {
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    return `${Math.floor(diff / 3600)} 小时前`;
  }
  return formatFull(date);
}

export default function AdminTenantsPage() {
  const toast = useToast();
  const [data, setData] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [spaceStatus, setSpaceStatus] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detail, setDetail] = useState<MemberRow | null>(null);
  const [detailData, setDetailData] = useState<MemberDetailData | null>(null);
  const [detailTab, setDetailTab] = useState<"task" | "components" | "operations">("task");
  const [detailPage, setDetailPage] = useState(1);
  const [detailSearch, setDetailSearch] = useState("");
  const [componentCategory, setComponentCategory] = useState("ALL");
  const [actionCategory, setActionCategory] = useState<"ALL" | "TASK" | "WORKSPACE" | "SECURITY">("ALL");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件详情模态窗（复用系统标准组件详情）
  const [activeComponentModal, setActiveComponentModal] = useState<ComponentItem | null>(null);

  const loadMembers = useCallback(
    async (
      page: number,
      opts?: {
        search?: string;
        spaceId?: string;
        spaceStatus?: string;
        role?: string;
        isManualRefresh?: boolean;
      },
    ) => {
      try {
        if (opts?.isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        const params = new URLSearchParams({ page: page.toString(), limit: "20" });
        const st = opts?.spaceId ?? spaceId;
        const ss = opts?.spaceStatus ?? spaceStatus;
        const rl = opts?.role ?? role;
        const q = (opts?.search ?? searchQuery).trim();

        if (st) params.set("spaceId", st);
        if (ss && ss !== "ALL") params.set("spaceStatus", ss);
        if (rl && rl !== "ALL") params.set("role", rl);
        if (q) params.set("search", q);

        let res = await fetch(`/api/admin/tenants?${params}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        // 遇到 503 权限校验瞬时波动，自愈延迟 1200ms 重试一次
        if (res.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          res = await fetch(`/api/admin/tenants?${params}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const friendly = describeApiError(errData, "加载企业空间成员失败");
          throw new Error(friendly.message);
        }
        const r = await res.json();
        setData(r.data);
        const now = new Date();
        setLastSyncTime(
          `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
        );
        if (opts?.isManualRefresh) {
          toast.success("成员活动数据已刷新");
        }
      } catch (e: any) {
        console.error("加载成员数据异常:", e);
        toast.error(e?.message || "加载企业空间成员失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [spaceId, spaceStatus, role, searchQuery, toast],
  );

  useEffect(() => {
    loadMembers(currentPage);
  }, [currentPage]);

  const loadDetail = useCallback(
    async (
      row: MemberRow,
      tab: "task" | "components" | "operations",
      page: number,
      q: string,
      actCat: string = "ALL",
      compCat: string = "ALL",
    ) => {
      try {
        setDetailLoading(true);
        const params = new URLSearchParams({
          workspaceId: row.workspaceId,
          userId: row.userId,
          tab,
          page: page.toString(),
          limit: "8",
        });
        if (q.trim()) params.set("search", q.trim());
        if (tab === "operations" && actCat !== "ALL") {
          params.set("actionCategory", actCat);
        }
        if (tab === "components" && compCat !== "ALL") {
          params.set("componentCategory", compCat);
        }
        let res = await fetch(`/api/admin/tenants/member?${params}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        // 遇到 503 权限校验服务瞬时不可用，自愈延迟 1200ms 自动重试一次
        if (res.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          res = await fetch(`/api/admin/tenants/member?${params}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
          });
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const friendly = describeApiError(errData, "加载成员明细失败");
          throw new Error(friendly.message);
        }
        const r = await res.json();
        setDetailData(r.data);
        setDetailTab(tab);
      } catch (e: any) {
        console.error("加载成员明细异常:", e);
        toast.error(e?.message || "加载成员明细失败");
      } finally {
        setDetailLoading(false);
      }
    },
    [toast],
  );

  const openDetail = (row: MemberRow) => {
    setDetail(row);
    setDetailPage(1);
    setDetailSearch("");
    setActionCategory("ALL");
    setComponentCategory("ALL");
    setDetailTab("task");
    setDetailData(null);
    loadDetail(row, "task", 1, "", "ALL", "ALL");
  };

  const switchTab = (tab: "task" | "components" | "operations") => {
    setDetailPage(1);
    setDetailSearch("");
    if (detail) loadDetail(detail, tab, 1, "", actionCategory, componentCategory);
  };

  const onDetailSearch = (v: string) => {
    setDetailSearch(v);
    if (detailSearchTimer.current) clearTimeout(detailSearchTimer.current);
    detailSearchTimer.current = setTimeout(() => {
      setDetailPage(1);
      if (detail)
        loadDetail(
          detail,
          detailTab === "task" ? "components" : detailTab,
          1,
          v,
          actionCategory,
          componentCategory,
        );
    }, 300);
  };

  const onDetailActionCategoryChange = (cat: "ALL" | "TASK" | "WORKSPACE" | "SECURITY") => {
    setActionCategory(cat);
    setDetailPage(1);
    if (detail) {
      loadDetail(detail, "operations", 1, detailSearch, cat, componentCategory);
    }
  };

  const onDetailComponentCategoryChange = (cat: string) => {
    setComponentCategory(cat);
    setDetailPage(1);
    if (detail) {
      loadDetail(detail, "components", 1, detailSearch, actionCategory, cat);
    }
  };

  const onDetailPage = (p: number) => {
    setDetailPage(p);
    if (detail)
      loadDetail(
        detail,
        detailTab === "task" ? "components" : detailTab,
        p,
        detailSearch,
        actionCategory,
        componentCategory,
      );
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSpaceId("");
    setSpaceStatus("ALL");
    setRole("ALL");
    setCurrentPage(1);
    loadMembers(1, { search: "", spaceId: "", spaceStatus: "ALL", role: "ALL" });
  };

  const stats = data?.stats;
  const avatarFallback = (name?: string | null, email?: string) =>
    (name || email || "?").charAt(0).toUpperCase();

  const isFiltered = !!(searchQuery || spaceId || spaceStatus !== "ALL" || role !== "ALL");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] pb-10 space-y-6">
      {/* 顶部 Header 卡片（确保刷新按钮右侧对齐且绝不换行） */}
      <div className="relative bg-white/85 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-6 overflow-hidden">
        <div className="absolute -right-8 -top-8 w-56 h-56 rounded-full bg-gradient-to-br from-[#3182ce]/10 via-[#2b6cb0]/5 to-transparent blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-nowrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md shadow-[#3182ce]/20 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight truncate">
                  企业空间 · 成员活动总表
                </h1>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#3182ce]/10 text-[#2b6cb0] border border-[#3182ce]/20 shrink-0">
                  企业空间成员
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 truncate">
                集中查看各个企业空间下的成员列表、执行任务数量及最近操作，点击可查看明细。
              </p>
            </div>
          </div>

          {/* 头部右侧操作区：刷新按钮（强制 shrink-0 不折行） */}
          <div className="flex items-center gap-2.5 shrink-0">
            {lastSyncTime && (
              <span className="text-xs text-slate-400 font-mono hidden md:inline-block">
                上次同步 {lastSyncTime}
              </span>
            )}
            <button
              onClick={() =>
                loadMembers(currentPage, { isManualRefresh: true })
              }
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-bold text-slate-700 hover:text-[#3182ce] hover:border-[#3182ce]/30 hover:bg-slate-50 shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              title="刷新最新数据"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#3182ce] ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              <span>{refreshing ? "刷新中..." : "刷新数据"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 联指标看板 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={<Building2 className="w-6 h-6 text-white" />}
          iconCls="from-[#3182ce] to-[#2b6cb0]"
          tint="text-[#3182ce]"
          label="覆盖企业空间"
          sub="当前管理的企业空间"
          value={stats?.workspaceCount ?? data?.spaces.length ?? 0}
          unit="个"
        />
        <StatCard
          icon={<Users className="w-6 h-6 text-white" />}
          iconCls="from-amber-500 to-amber-600"
          tint="text-amber-500"
          label="协同成员总数"
          sub="各空间活跃成员"
          value={stats?.memberCount ?? 0}
          unit="位"
        />
        <StatCard
          icon={<Activity className="w-6 h-6 text-white" />}
          iconCls="from-emerald-500 to-emerald-600"
          tint="text-emerald-500"
          label="成员活跃度"
          sub="近7天有操作记录"
          value={stats ? stats.activeRate : 0}
          unit="%"
        />
        <StatCard
          icon={<FileText className="w-6 h-6 text-white" />}
          iconCls="from-purple-500 to-purple-600"
          tint="text-purple-500"
          label="累计执行任务"
          sub="成员触发任务总量"
          value={stats?.totalExecutions ?? 0}
          unit="次"
        />
      </div>

      {/* 筛选与检索工具条（支持成千上万个空间搜索的可搜索空间选择器 + 空间状态筛选） */}
      <div className="relative z-30 bg-white/85 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-4 sm:p-5 overflow-visible">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. 成员搜索框 */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(
                    () => loadMembers(currentPage, { search: v }),
                    300,
                  );
                }}
                placeholder="搜索成员姓名、邮箱..."
                className="w-full pl-9 pr-8 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium bg-slate-50/50 hover:bg-white focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    loadMembers(currentPage, { search: "" });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 2. 可搜索的企业空间选择器（轻松支撑海量千百个空间） */}
            <SpaceCombobox
              spaces={data?.spaces || []}
              selectedId={spaceId}
              onSelect={(id) => {
                setSpaceId(id);
                loadMembers(currentPage, { spaceId: id });
              }}
            />

            {/* 3. 空间状态筛选 */}
            <select
              value={spaceStatus}
              onChange={(e) => {
                setSpaceStatus(e.target.value);
                loadMembers(currentPage, { spaceStatus: e.target.value });
              }}
              className="w-full px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium bg-slate-50/50 hover:bg-white focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">全部空间状态</option>
              <option value="active">正常启用</option>
              <option value="disabled">已被停用</option>
            </select>

            {/* 4. 成员角色筛选 */}
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                loadMembers(currentPage, { role: e.target.value });
              }}
              className="w-full px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium bg-slate-50/50 hover:bg-white focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">全部空间角色</option>
              <option value="OWNER">空间所有者</option>
              <option value="ADMIN">空间管理员</option>
              <option value="MEMBER">普通协作成员</option>
            </select>
          </div>

          {/* 重置筛选 */}
          {isFiltered && (
            <div className="flex items-center justify-end shrink-0">
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"
                title="清空筛选条件"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重置筛选</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 成员活动数据表（严格单行不换行、常用组件垂直摞起、最近时间去重、操作列锁定） */}
      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-9 h-9 text-[#3182ce] animate-spin" />
            <p className="text-xs text-slate-400 font-medium tracking-wide">正在加载成员数据...</p>
          </div>
        ) : data?.members.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center justify-center mx-auto mb-4 text-[#3182ce]">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-700">暂无符合条件的成员</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">请尝试调整筛选空间或搜索关键词</p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] shadow-sm transition-all"
              >
                清空当前筛选
              </button>
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full table-auto min-w-[960px] border-collapse text-left">
              <thead className="bg-gradient-to-r from-slate-50 via-slate-50/90 to-slate-100/50 border-b border-slate-200/80">
                <tr>
                  <Th>所属企业空间</Th>
                  <Th>协同成员身份</Th>
                  <Th>执行任务数量</Th>
                  <Th>常用组件</Th>
                  <Th>最近操作记录</Th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap sticky right-0 z-20 bg-slate-50/95 border-l border-slate-200/80 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.members.map((m) => {
                  const isSpaceDisabled = m.workspaceStatus === "disabled";
                  return (
                    <tr
                      key={m.id}
                      className="group hover:bg-blue-50/30 transition-colors"
                    >
                      {/* 1. 所属企业空间（包含空间名 + 启用/禁用状态） */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5 max-w-[240px]">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3182ce] shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-sm font-bold text-slate-800 truncate"
                                title={m.workspaceName}
                              >
                                {m.workspaceName}
                              </span>
                              {isSpaceDisabled ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  <span>已停用</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>启用中</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              ID: {m.workspaceId.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. 成员身份 */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3 max-w-[240px]">
                          {m.avatar ? (
                            <img
                              src={m.avatar}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover shadow-2xs border border-white shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold shadow-2xs shrink-0">
                              {avatarFallback(m.name, m.email)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-sm font-bold text-slate-800 truncate"
                                title={m.name || m.email}
                              >
                                {m.name || m.email}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${roleTag(
                                  m.role,
                                )} shrink-0`}
                              >
                                {m.roleLabel}
                              </span>
                            </div>
                            <div
                              className="text-xs text-slate-500 truncate font-mono"
                              title={m.email}
                            >
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. 执行任务数量（大白话，去黑话） */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-black text-slate-800 font-mono">
                            {m.taskCount}
                          </span>
                          <span className="text-xs text-slate-400">次</span>
                        </div>
                      </td>

                      {/* 4. 常用组件（三个依次垂直摞起来，绝不横排撑破） */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {m.topComponents.length === 0 ? (
                          <span className="text-xs text-slate-400">暂无调用</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {m.topComponents.map((c, idx) => (
                              <div
                                key={c.componentId}
                                className="inline-flex items-center gap-2"
                                title={`${c.name}（调用 ${c.count} 次）`}
                              >
                                <span
                                  className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white shrink-0 ${
                                    idx === 0
                                      ? "bg-amber-500"
                                      : idx === 1
                                      ? "bg-slate-400"
                                      : "bg-amber-700"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <span className="text-xs font-bold text-slate-700 max-w-[140px] truncate">
                                  {c.name}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-[#3182ce] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100 shrink-0">
                                  ×{c.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 5. 最近操作记录（时间去重，只保留一行清晰时间） */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!m.recentLog ? (
                          <span className="text-xs text-slate-400">暂无记录</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                getLogMeta(m.recentLog.action).badgeCls
                              }`}
                            >
                              {getLogMeta(m.recentLog.action).label}
                            </span>
                            <span
                              className="text-xs font-mono font-medium text-slate-600 cursor-help"
                              title={formatFull(m.recentLog.createdAt)}
                            >
                              {formatSmart(m.recentLog.createdAt)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 6. 右侧绝对固定操作列（按钮文案：查看明细） */}
                      <td className="px-6 py-4 text-right whitespace-nowrap sticky right-0 z-10 bg-white group-hover:bg-[#f6faff] border-l border-slate-200/80 shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.06)] transition-colors">
                        <button
                          onClick={() => openDetail(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-[#3182ce]/30 text-[#3182ce] bg-[#3182ce]/5 hover:bg-[#3182ce] hover:text-white rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
                        >
                          <span>查看明细</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页控制栏 */}
        {data && data.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/50">
            <div className="text-xs text-slate-500 font-medium">
              共 <span className="font-bold text-[#3182ce]">{data.total}</span> 位成员，第{" "}
              <span className="font-bold text-[#3182ce]">{data.page}</span> / {data.totalPages} 页（每页 20 条）
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3.5 h-9 text-xs font-bold border border-slate-200 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all cursor-pointer"
              >
                上一页
              </button>
              <div className="px-3 text-xs font-mono font-bold text-slate-700">
                {currentPage} / {data.totalPages}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={currentPage === data.totalPages}
                className="px-3.5 h-9 text-xs font-bold border border-slate-200 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all cursor-pointer"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 成员明细抽屉 (Drawer) */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setDetail(null)}
          />
          <div className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            {/* 顶栏：成员名片 */}
            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-blue-50/30">
              <div className="flex items-center gap-4 min-w-0">
                {detail.avatar ? (
                  <img
                    src={detail.avatar}
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover shadow-sm border-2 border-white shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-black text-xl shadow-md shadow-[#3182ce]/20 shrink-0">
                    {avatarFallback(detail.name, detail.email)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-lg font-black text-slate-800 truncate">
                      {detail.name || detail.email}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${roleTag(
                        detail.role,
                      )}`}
                    >
                      {detail.roleLabel}
                    </span>
                    <Link
                      href={`/admin/workspaces?search=${encodeURIComponent(
                        detail.workspaceName,
                      )}`}
                      className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-black hover:bg-purple-100 transition-colors flex items-center gap-1"
                      title="前往企业空间管理"
                    >
                      <Building2 className="w-3 h-3" />
                      <span>{detail.workspaceName}</span>
                    </Link>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-1">
                    {detail.email}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>加入企业时间：{formatFull(detail.joinedAt)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setDetail(null)}
                className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="关闭抽屉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 标签栏导航 (Tabs) */}
            <div className="flex border-b border-slate-100 px-6 gap-2 bg-slate-50/50">
              {(
                [
                  { k: "task", label: "任务执行概览", icon: Activity },
                  { k: "components", label: "使用组件清单", icon: Cpu },
                  { k: "operations", label: "空间操作记录", icon: Terminal },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = detailTab === t.k;
                return (
                  <button
                    key={t.k}
                    onClick={() => switchTab(t.k)}
                    className={`flex items-center gap-2 px-4 h-12 text-sm font-bold border-b-2 -mb-px transition-all cursor-pointer ${
                      active
                        ? "border-[#3182ce] text-[#3182ce] bg-white shadow-2xs"
                        : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 抽屉滚动内容区 */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              {detailLoading && !detailData ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin" />
                  <span className="text-xs text-slate-400 font-medium">加载明细数据中...</span>
                </div>
              ) : detailData ? (
                <>
                  {detailTab === "task" && (
                    <TaskOverview overview={detailData.taskOverview} />
                  )}
                  {detailTab === "components" && (
                    <ComponentList
                      section={detailData.components}
                      search={detailSearch}
                      onSearch={onDetailSearch}
                      category={componentCategory}
                      onCategoryChange={onDetailComponentCategoryChange}
                      onPage={onDetailPage}
                      onViewDetail={(c) => setActiveComponentModal(c)}
                      loading={detailLoading}
                    />
                  )}
                  {detailTab === "operations" && (
                    <OperationList
                      section={detailData.operations}
                      search={detailSearch}
                      onSearch={onDetailSearch}
                      category={actionCategory}
                      onCategoryChange={onDetailActionCategoryChange}
                      onPage={onDetailPage}
                      loading={detailLoading}
                    />
                  )}
                </>
              ) : (
                <div className="text-center py-20 text-slate-400 text-sm">暂无明细数据</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 复用系统标准组件详情模态窗 */}
      {activeComponentModal && (
        <ComponentDetailModal
          component={activeComponentModal}
          onClose={() => setActiveComponentModal(null)}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}

function StatCard({
  icon,
  iconCls,
  tint,
  label,
  sub,
  value,
  unit,
}: {
  icon: React.ReactNode;
  iconCls: string;
  tint: string;
  label: string;
  sub: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="relative bg-white/85 backdrop-blur-xl rounded-2xl border border-white/90 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
            {label}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-slate-800 tracking-tight font-mono">
              {value}
            </span>
            <span className="text-xs font-bold text-slate-400">{unit}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">{sub}</div>
        </div>
        <div
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconCls} flex items-center justify-center shadow-md shadow-slate-200 shrink-0`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 可搜索的企业空间选择器（轻松容纳千百个空间）
// ==========================================
function SpaceCombobox({
  spaces,
  selectedId,
  onSelect,
}: {
  spaces: { id: string; name: string; status?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSpace = spaces.find((s) => s.id === selectedId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = keyword.trim()
    ? spaces.filter((s) => s.name.toLowerCase().includes(keyword.toLowerCase().trim()))
    : spaces;

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`} ref={dropdownRef}>
      <div
        onClick={() => setOpen(!open)}
        className="w-full h-10 px-3 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-medium bg-slate-50/50 hover:bg-white cursor-pointer transition-all"
      >
        <span className={`truncate ${selectedSpace ? "font-bold text-slate-800" : "text-slate-500"}`}>
          {selectedSpace ? selectedSpace.name : "全部企业空间"}
        </span>
        <div className="flex items-center gap-1 text-slate-400 shrink-0">
          {selectedId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect("");
              }}
              className="p-0.5 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 bg-white rounded-xl border border-slate-200/90 shadow-2xl p-2.5 space-y-2 animate-in fade-in duration-150 min-w-[260px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="快速过滤空间名称..."
              className="w-full pl-8 pr-3 h-8 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#3182ce]"
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            <div
              onClick={() => {
                onSelect("");
                setOpen(false);
                setKeyword("");
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-between ${
                !selectedId ? "bg-blue-50 font-bold text-[#3182ce]" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span>全部企业空间</span>
              {!selectedId && <Check className="w-3.5 h-3.5 text-[#3182ce]" />}
            </div>
            {filtered.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">未找到匹配空间</div>
            ) : (
              filtered.map((s) => {
                const isSelected = selectedId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onSelect(s.id);
                      setOpen(false);
                      setKeyword("");
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-blue-50 font-bold text-[#3182ce]"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.status === "disabled" && (
                        <span className="text-[10px] text-rose-500 bg-rose-50 px-1 py-0.2 rounded">
                          已停用
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#3182ce]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 任务执行概览（通俗清晰，去掉“履约率”黑话）
// ==========================================
function TaskOverview({
  overview,
}: {
  overview: MemberDetailData["taskOverview"];
}) {
  const cards = [
    {
      k: "running",
      label: "进行中任务",
      count: overview.running,
      cls: "bg-blue-50/80 text-blue-700 border-blue-200",
      dot: "bg-blue-500 animate-pulse",
    },
    {
      k: "success",
      label: "已完成任务",
      count: overview.success,
      cls: "bg-emerald-50/80 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    {
      k: "failed",
      label: "失败任务",
      count: overview.failed,
      cls: "bg-rose-50/80 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.k}
            className={`rounded-2xl border p-5 text-center transition-all shadow-2xs ${c.cls}`}
          >
            <div className="text-3xl font-black font-mono tracking-tight">{c.count}</div>
            <div className="text-xs font-bold mt-2 flex items-center justify-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span>{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-bold text-slate-800">任务执行成功率</span>
          </div>
          <span className="text-xl font-black text-emerald-600 font-mono">
            {overview.successRate}%
          </span>
        </div>

        <div className="h-3 rounded-full bg-slate-100 overflow-hidden shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: `${overview.successRate}%` }}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span>
            累计触发任务总量：<b className="text-slate-800 font-mono">{overview.total}</b> 次
          </span>
          <span>
            失败任务数：<b className="text-rose-600 font-mono">{overview.failed}</b> 次
          </span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 使用组件清单（数据含义清晰明示、卡片支持查看组件详情、分类筛选与分页）
// ==========================================
function ComponentList({
  section,
  search,
  onSearch,
  category,
  onCategoryChange,
  onPage,
  onViewDetail,
  loading,
}: {
  section: MemberDetailData["components"];
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategoryChange: (cat: string) => void;
  onPage: (p: number) => void;
  onViewDetail: (c: ComponentItem) => void;
  loading: boolean;
}) {
  const totalCalls = section.totalCalls ?? section.items.reduce((acc, cur) => acc + cur.count, 0);

  const categories = [
    { k: "ALL", label: "全部类别" },
    { k: "BID_PREP", label: "标书智作" },
    { k: "SCHEME_GEN", label: "方案生成" },
    { k: "KNOWLEDGE", label: "知识检索" },
    { k: "RULE_AUDIT", label: "合规审查" },
    { k: "GENERAL", label: "通用组件" },
  ];

  return (
    <div className="space-y-4">
      {/* 顶部工具条：搜索 + 分类选择 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜索使用的组件名称..."
            className="w-full pl-10 pr-9 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium bg-white"
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full sm:w-36 h-10 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-[#3182ce] bg-white cursor-pointer"
        >
          {categories.map((c) => (
            <option key={c.k} value={c.k}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* 明示数据统计说明（去除“峰值调用”等让人费解的话） */}
      <div className="bg-white rounded-xl p-3 border border-slate-200/70 text-xs text-slate-600 flex items-center justify-between">
        <div>
          该成员在此空间累计调用 <span className="font-bold text-[#3182ce] font-mono">{totalCalls}</span> 次组件，
          共使用 <span className="font-bold text-slate-800">{section.total}</span> 款组件
        </div>
        {section.maxCount > 0 && (
          <div className="text-slate-400">
            单款最高调用：<span className="font-bold text-slate-700 font-mono">{section.maxCount}</span> 次
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-[#3182ce] animate-spin" />
        </div>
      ) : section.items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80">
          <Cpu className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">
            {search ? "未找到匹配名称的组件" : "该成员在此空间暂未调用过任何工具组件"}
          </p>
        </div>
      ) : (
        /* 大厂双列组件卡片 */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {section.items.map((c, idx) => {
            const overallIndex = (section.page - 1) * 8 + idx;
            // 真实百分比：占该成员总调用量的占比
            const pct = totalCalls > 0 ? Math.round((c.count / totalCalls) * 100) : 0;
            const catMeta = getCompCat(c.category);

            const isTop1 = overallIndex === 0;
            const isTop2 = overallIndex === 1;
            const isTop3 = overallIndex === 2;

            return (
              <div
                key={c.componentId}
                className="group relative bg-white rounded-2xl border border-slate-200/90 p-4 hover:border-[#3182ce]/50 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                {/* 顶部：序号/徽章 + 分类微标 */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {isTop1 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-white shadow-xs">
                        <Award className="w-3.5 h-3.5" />
                        <span>TOP 1</span>
                      </span>
                    ) : isTop2 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-xs">
                        <Award className="w-3.5 h-3.5" />
                        <span>TOP 2</span>
                      </span>
                    ) : isTop3 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-700 to-orange-600 text-white shadow-xs">
                        <Award className="w-3.5 h-3.5" />
                        <span>TOP 3</span>
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        #{overallIndex + 1}
                      </span>
                    )}

                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3182ce] shrink-0">
                      <Cpu className="w-4 h-4" />
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${catMeta.cls} shrink-0`}
                  >
                    {catMeta.label}
                  </span>
                </div>

                {/* 中部：组件全名与调用频次 */}
                <div className="space-y-1 mb-3">
                  <h4
                    className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                    title={c.name}
                  >
                    {c.name}
                  </h4>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-800 font-mono tracking-tight">
                        {c.count}
                      </span>
                      <span className="text-xs font-bold text-slate-400">次调用</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      占总调用 {pct}%
                    </span>
                  </div>
                </div>

                {/* 底部进度条 */}
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner mb-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#3182ce] to-[#63b3ed] transition-all duration-500"
                    style={{ width: `${Math.max(5, pct)}%` }}
                  />
                </div>

                {/* 右下角：查看组件详情按钮 */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    ID: {c.componentId.slice(0, 10)}...
                  </span>
                  <button
                    onClick={() => onViewDetail(c)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#3182ce] hover:underline cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>查看组件详情</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pager section={section} onPage={onPage} />
    </div>
  );
}

// ==========================================
// 空间操作记录（垂直时间轴 + 参数结构化折叠）
// ==========================================
function OperationList({
  section,
  search,
  onSearch,
  category,
  onCategoryChange,
  onPage,
  loading,
}: {
  section: MemberDetailData["operations"];
  search: string;
  onSearch: (v: string) => void;
  category: "ALL" | "TASK" | "WORKSPACE" | "SECURITY";
  onCategoryChange: (c: "ALL" | "TASK" | "WORKSPACE" | "SECURITY") => void;
  onPage: (p: number) => void;
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const copyDetails = (id: string, details: any) => {
    navigator.clipboard.writeText(
      typeof details === "string" ? details : JSON.stringify(details, null, 2),
    );
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categories = [
    { k: "ALL", label: "全部动作" },
    { k: "TASK", label: "执行与任务" },
    { k: "WORKSPACE", label: "空间配置" },
    { k: "SECURITY", label: "安全与管控" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* 顶部操作分类胶囊 + 过滤框 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((c) => (
            <button
              key={c.k}
              onClick={() => onCategoryChange(c.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                category === c.k
                  ? "bg-[#3182ce] text-white shadow-2xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="过滤动作或资源名称..."
            className="w-full pl-9 pr-7 h-9 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-xs bg-white"
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-[#3182ce] animate-spin" />
        </div>
      ) : section.items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80">
          <Terminal className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">该成员在此空间暂无符合条件的操作记录</p>
        </div>
      ) : (
        /* 高颜值垂直时间轴 */
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:border-l-2 before:border-dashed before:border-slate-200">
          {section.items.map((o) => {
            const meta = getLogMeta(o.action);
            const isExpanded = expandedId === o.id;
            const hasDetails = o.details && Object.keys(o.details).length > 0;

            return (
              <div key={o.id} className="relative group">
                <div
                  className={`absolute -left-[19px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow-2xs ${meta.dotCls} group-hover:scale-125 transition-transform`}
                />

                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-black border ${meta.badgeCls}`}
                      >
                        {meta.label}
                      </span>
                      {o.resource && (
                        <span className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {o.resource}
                        </span>
                      )}
                    </div>
                    {/* 只保留一行清晰时间，绝不重复 */}
                    <span
                      className="text-xs font-mono font-medium text-slate-500 cursor-help"
                      title={formatFull(o.createdAt)}
                    >
                      {formatSmart(o.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      {o.ipAddress ? (
                        <span className="flex items-center gap-1 font-mono text-slate-400">
                          <Globe className="w-3 h-3 text-slate-400" />
                          <span>来源IP：{o.ipAddress}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">系统内部调度</span>
                      )}
                    </div>

                    {hasDetails && (
                      <button
                        onClick={() => toggleExpand(o.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                      >
                        <span>{isExpanded ? "收起参数" : "查看参数"}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* 黑色专业终端参数面板 */}
                  {isExpanded && hasDetails && (
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono relative space-y-2 shadow-inner">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                          <span className="ml-1.5 font-bold text-slate-300">操作详细参数 (JSON)</span>
                        </div>
                        <button
                          onClick={() => copyDetails(o.id, o.details)}
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer text-xs"
                          title="复制参数内容"
                        >
                          {copiedId === o.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>复制参数</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="overflow-x-auto max-h-56 text-[11px] font-mono leading-relaxed text-emerald-400/90 bg-slate-950/90 p-3 rounded-lg border border-slate-800/80 selection:bg-sky-500/30">
                        {typeof o.details === "string"
                          ? o.details
                          : JSON.stringify(o.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pager section={section} onPage={onPage} />
    </div>
  );
}

// ==========================================
// 复用系统标准组件详情模态窗（与后台管理组件详情100%一致）
// ==========================================
function ComponentDetailModal({
  component,
  onClose,
}: {
  component: ComponentItem;
  onClose: () => void;
}) {
  const toast = useToast();
  const detail = component.detail;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3182ce]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>{component.name}</span>
                <span className="text-xs font-mono font-normal text-slate-400">
                  [{component.componentId}]
                </span>
              </h3>
              <p className="text-xs text-slate-500">知阁官方标准组件详情</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* 1. 功能职责说明 */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              组件功能职责说明
            </div>
            <div className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              {component.description || "暂无描述"}
            </div>
          </div>

          {/* 2. 深度功能解读 */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              深度功能解读
            </div>
            <div className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 whitespace-pre-wrap">
              {detail?.fullDescription || component.description || "暂未在数据库中配置长介绍"}
            </div>
          </div>

          {/* 3. 使用说明 */}
          {detail?.usage && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                使用操作说明
              </div>
              <div className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 whitespace-pre-wrap">
                {detail.usage}
              </div>
            </div>
          )}

          {/* 4. API文档 */}
          {detail?.apiDoc && (
            <div className="space-y-1">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  API 接口文档
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(detail.apiDoc);
                    toast.success("API 示例已复制到剪贴板！");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>复制示例</span>
                </button>
              </div>
              <div className="text-xs font-mono text-slate-700 leading-relaxed bg-slate-900 text-slate-200 p-3.5 rounded-xl overflow-x-auto whitespace-pre-wrap">
                {detail.apiDoc}
              </div>
            </div>
          )}

          {/* 5. 核心指标卡片矩阵 */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-blue-500 uppercase">领域分类</div>
              <div className="text-xs font-black text-slate-800">
                {getCompCat(component.category).label}
              </div>
            </div>
            <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-amber-600 uppercase">每次执行扣除算力点</div>
              <div className="text-xs font-black text-slate-800">
                {component.estimatedModelTokens || 0} 算力点
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-600 uppercase">发布状态</div>
              <div className="text-xs font-black text-emerald-700">
                {component.isPublished ? "已上架运行" : "未发布"}
              </div>
            </div>
            <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl space-y-0.5">
              <div className="text-[10px] font-bold text-purple-600 uppercase">全网总调用次数</div>
              <div className="text-xs font-black text-slate-800 font-mono">
                {component.usageCount || 0} 次
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] shadow-sm transition-all cursor-pointer"
          >
            关闭详情
          </button>
        </div>
      </div>
    </div>
  );
}

function Pager({
  section,
  onPage,
}: {
  section: { page: number; totalPages: number };
  onPage: (p: number) => void;
}) {
  if (section.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
      <span className="text-xs text-slate-500 font-medium">
        第 <span className="font-bold text-[#3182ce]">{section.page}</span> / {section.totalPages} 页
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(section.page - 1)}
          disabled={section.page === 1}
          className="px-3 h-8 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all cursor-pointer"
        >
          上一页
        </button>
        <button
          onClick={() => onPage(section.page + 1)}
          disabled={section.page === section.totalPages}
          className="px-3 h-8 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all cursor-pointer"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
