"use client";

/**
 * 空间模型策略（后端早已支持，此前只能靠 curl 调用，现补上管理界面）
 *
 * 页面职责（授权制，方案 A）：**本页只做一件事 —— 配置该空间可用的模型清单（白名单）**。
 *   - 白名单 = 该空间被授予的可用模型；为空即「未授权任何模型」，空间内组件一律无法调度模型执行。
 *   - 空间默认模型由用户工作台（个人 / 企业空间）页面设置，本页不提供设置入口（保存时原样保留已存值）。
 * 裁决规则详见 src/lib/model-registry.ts（resolveModelExecutionPlan / assertModelAllowed）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { formatPeriodSchedule } from "@/lib/period-schedule-text";
import {
  Layers,
  Building2,
  Cpu,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Save,
  Undo2,
  Check,
  X,
  Search,
  Sliders,
  ShieldCheck,
  Filter,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Server,
  SlidersHorizontal,
} from "lucide-react";

interface WorkspaceItem {
  id: string;
  name: string;
  type?: string;
}

interface DeploymentItem {
  id: string;
  providerId: string;
  modelId: string;
  upstreamModel?: string;
  displayName?: string;
  contextLimit?: number;
  enabled: boolean;
  /** 所属供应商通道是否启用（false = 供应商已禁用，该模型同样不可执行，接口真实下发） */
  providerEnabled?: boolean;
  capabilities?: string[] | null;
  /** 连通性健康状态：healthy 健康 | error 异常 | unknown 未探测（接口真实下发） */
  health?: string;
  lastTestedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pricing?: {
    currency?: string;
    costInputMicrosPerMillion?: number | null;
    costOutputMicrosPerMillion?: number | null;
    costCacheReadMicrosPerMillion?: number | null;
    costCacheWriteMicrosPerMillion?: number | null;
    priceInputMicrosPerMillion?: number | null;
    priceOutputMicrosPerMillion?: number | null;
    priceCacheReadMicrosPerMillion?: number | null;
    priceCacheWriteMicrosPerMillion?: number | null;
    /** 平台加价率（基点）；非空且无直配售价时，生效价 = 成本 × (1 + 加价率/10000) */
    markupRateBps?: number | null;
    /** 价格状态：UNCONFIGURED 未配置 | FREE 明确免费 | OBSERVED_ONLY 仅观测 | VERIFIED 已确认 */
    priceStatus?: string;
    priceSource?: string;
  } | null;
  /** 时段覆盖价（在主流价之上叠加；接口按优先级降序下发） */
  periods?: {
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    priority: number;
    weekdays?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    costInputMicrosPerMillion?: number | null;
    costOutputMicrosPerMillion?: number | null;
    costCacheReadMicrosPerMillion?: number | null;
    costCacheWriteMicrosPerMillion?: number | null;
    priceInputMicrosPerMillion?: number | null;
    priceOutputMicrosPerMillion?: number | null;
    priceCacheReadMicrosPerMillion?: number | null;
    priceCacheWriteMicrosPerMillion?: number | null;
    markupRateBps?: number | null;
  }[];
}

// 模型能力抽象字典与标准化中文标签
const CAPABILITY_DICT: Record<string, { label: string; desc: string }> = {
  TEXT_GENERATION: { label: "文本生成", desc: "基础与复杂自然语言生成" },
  STRUCTURED_OUTPUT: { label: "结构化输出", desc: "精准按 JSON Schema 输出" },
  VISION: { label: "视觉多模态", desc: "图片理解与多模态分析" },
  LONG_CONTEXT: { label: "超长上下文", desc: "支持 100k+ 超长文档与上下文" },
  FILE_ANALYSIS: { label: "文档解析", desc: "支持 PDF/Office 文档深度分析" },
  FUNCTION_CALLING: { label: "工具调用", desc: "函数/插件自动装配与执行" },
  CODE_INTERPRETER: { label: "代码沙箱", desc: "代码生成与沙箱执行分析" },
  WEB_SEARCH: { label: "联网检索", desc: "动态网络检索与外部知识增强" },
};

function formatPrice(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return "--";
  const yuan = micros / 1_000_000;
  return `¥${yuan.toFixed(2)} / 百万Tokens`;
}

function formatContextTokens(tokens: number | null | undefined): string {
  if (!tokens) return "未指定";
  if (tokens >= 1024) {
    return `${(tokens / 1024).toFixed(0)}k Tokens (${tokens.toLocaleString()})`;
  }
  return `${tokens.toLocaleString()} Tokens`;
}

/** 时间显示：YYYY-MM-DD HH:mm；无值返回占位 */
function formatDateTime(value?: string | null): string {
  if (!value) return "暂无记录";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "暂无记录";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 价格状态中文化 */
const PRICE_STATUS_LABEL: Record<string, string> = {
  UNCONFIGURED: "未配置",
  FREE: "明确免费",
  OBSERVED_ONLY: "仅观测数据",
  VERIFIED: "供应商价目表已确认",
};

/** 时段类型中文化 */
const PERIOD_KIND_LABEL: Record<string, string> = {
  IDLE: "闲时",
  PEAK: "高峰",
  HOLIDAY: "节假日",
  CUSTOM: "自定义",
};

/**
 * 计算真实生效售价（与结算口径一致）：
 * 直配售价优先；未直配时按 成本 × (1 + 加价率/10000) 派生（模型级加价率优先，否则继承全局默认）。
 */
function resolveEffectivePrice(
  price: number | null | undefined,
  cost: number | null | undefined,
  markupBps: number | null | undefined,
): { micros: number | null; derived: boolean } {
  if (price != null) return { micros: price, derived: false };
  if (cost != null && markupBps != null) {
    return { micros: Math.round(cost * (1 + markupBps / 10_000)), derived: true };
  }
  return { micros: null, derived: false };
}

// 紧凑分页器：生成页码序列（首尾页 + 当前页附近窗口 + 省略号）
function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

export default function WorkspaceModelPolicyPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  // 全局默认加价率（基点）：模型未独立设置加价率时，生效售价 = 成本 × (1 + 全局加价率/10000)
  const [globalMarkupBps, setGlobalMarkupBps] = useState<number | null>(null);
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [searchWs, setSearchWs] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "ENTERPRISE" | "PERSONAL">("ALL");
  // 授权制（方案 A）：本页唯一职责 = 配置「该空间可用的模型」（白名单）。
  // 空间默认模型由工作台（个人/企业空间）页面设置，本页不再提供设置入口，但保存时原样保留已存值。
  const [defaultId, setDefaultId] = useState<string>("");
  const [allowed, setAllowed] = useState<string[]>([]);
  // 已保存的策略快照，用于「放弃修改」回滚（不涉及默认模型的变更）
  const [loadedDefaultId, setLoadedDefaultId] = useState<string>("");
  const [loadedAllowed, setLoadedAllowed] = useState<string[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 空间列表分页检索状态（后端分页，不再前端全量拉取，空间数量大时也不卡）
  const [wsPage, setWsPage] = useState(1);
  const [wsTotal, setWsTotal] = useState(0);
  const [wsTotalPages, setWsTotalPages] = useState(1);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsPageSize, setWsPageSize] = useState(20);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceItem | null>(null);
  // 历史脏数据标记：默认模型曾被移出白名单（默认 ∉ 白名单）。加载时自动并回白名单并提示，需保存生效。
  const [orphanDefault, setOrphanDefault] = useState(false);
  // 平台默认初始清单：用于在模型卡片上标注「平台默认初始」来源，让管理员一眼分清模型从何而来、能否移除
  const [freeDefaults, setFreeDefaults] = useState<string[]>([]);

  // 详情模态弹窗选中的模型部署
  const [detailDeployment, setDetailDeployment] = useState<DeploymentItem | null>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  const loadDeployments = useCallback(async () => {
    try {
      const depRes = await authFetch("/api/admin/model-deployments");
      setDeployments(depRes?.data || []);
      setGlobalMarkupBps(depRes?.globalMarkupBps ?? null);
    } catch (e) {
      toast.error((e as Error)?.message || "加载模型列表失败");
    }
  }, [authFetch]);

  // 空间列表走后端分页 + 关键字/类型检索（不再前端全量过滤），空间数量大时也不会卡
  const loadWorkspaces = useCallback(
    async (
      page: number,
      opts: { search: string; type: "ALL" | "ENTERPRISE" | "PERSONAL"; pageSize?: number },
      presetWs?: string,
    ) => {
      setWsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(opts.pageSize ?? wsPageSize));
        if (opts.search.trim()) params.set("search", opts.search.trim());
        if (opts.type !== "ALL") params.set("type", opts.type);
        const wsRes = await authFetch(`/api/admin/workspaces?${params.toString()}`);
        const list = Array.isArray(wsRes?.data?.workspaces) ? wsRes.data.workspaces : [];
        setWorkspaces(list.map((w: any) => ({ id: w.id, name: w.name, type: w.type })));
        setWsTotal(typeof wsRes?.data?.total === "number" ? wsRes.data.total : list.length);
        setWsTotalPages(typeof wsRes?.data?.totalPages === "number" ? wsRes.data.totalPages : 1);
        setWsPage(page);
        // 预选：若从「修改策略」等入口带 ?workspaceId= 进入，则优先选中该空间；否则默认选中当前页第一条
        const foundPreset = presetWs ? list.find((w: any) => w.id === presetWs) : undefined;
        setSelectedWs((prev) => presetWs || prev || (list[0]?.id ?? ""));
        setSelectedWorkspace((prev) => (presetWs && foundPreset ? foundPreset : prev || (list[0] ?? null)));
      } catch (e) {
        toast.error((e as Error)?.message || "加载空间列表失败");
      } finally {
        setWsLoading(false);
      }
    },
    [authFetch, wsPageSize],
  );

  const loadPolicy = useCallback(async () => {
    if (!selectedWs) return;
    try {
      const res = await authFetch(`/api/admin/workspaces/${selectedWs}/model-policy`);
      const row = res?.data;
      setConfigured(!!row);
      setFreeDefaults(Array.isArray(res?.freeDefaultDeploymentIds) ? res.freeDefaultDeploymentIds : []);
      const loadedDefault = row?.defaultDeploymentId || "";
      const loadedAllowed = Array.isArray(row?.allowedDeploymentIds) ? row.allowedDeploymentIds : [];
      setDefaultId(loadedDefault);
      setOrphanDefault(false);
      // 自愈历史脏数据：默认模型曾被移出白名单（默认 ∉ 白名单）时，立即并回白名单并落库，
      // 令 后台页 / 数据库 / 工作台 三方即刻一致（此前只在本地勾选未保存，导致三方对不上）。
      const orphan = !!loadedDefault && !loadedAllowed.includes(loadedDefault);
      if (orphan) {
        const healed = Array.from(new Set([...loadedAllowed, loadedDefault]));
        try {
          await authFetch(`/api/admin/workspaces/${selectedWs}/model-policy`, {
            method: "PUT",
            body: JSON.stringify({ defaultDeploymentId: loadedDefault, allowedDeploymentIds: healed }),
          });
          setAllowed(healed);
          setLoadedAllowed(healed);
          toast.success("已自动修复历史脏数据：默认模型已加入可用白名单");
          return;
        } catch {
          // 自愈失败（如默认模型已被平台禁用）：展示真实态并告警，交管理员人工处理
          setOrphanDefault(true);
          setAllowed(loadedAllowed);
          setLoadedAllowed(loadedAllowed);
          return;
        }
      }
      setAllowed(loadedAllowed);
      setLoadedAllowed(loadedAllowed);
    } catch (e) {
      toast.error((e as Error)?.message || "加载空间模型策略失败");
    }
  }, [authFetch, selectedWs, toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadDeployments(),
      loadWorkspaces(1, { search: "", type: "ALL" }),
    ]).finally(() => setLoading(false));
  }, [loadDeployments, loadWorkspaces]);

  // 支持从「修改策略」等入口带 ?workspaceId= 直达并预选指定空间（避免在空间中枢列表里重新找）
  useEffect(() => {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const preset = params.get("workspaceId");
    if (preset) {
      setSelectedWs(preset);
      setSelectedWorkspace({ id: preset, name: preset, type: undefined });
      void loadWorkspaces(1, { search: "", type: "ALL" }, preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedWs) void loadPolicy();
  }, [selectedWs, loadPolicy]);

  // 搜索 / 类型过滤变更后，后端检索第一页（300ms 防抖，避免每次按键打接口）
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadWorkspaces(1, { search: searchWs, type: typeFilter });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchWs, typeFilter, loadWorkspaces]);

  // 模型「可用」= 自身启用 且 所属供应商通道启用。
  // 供应商被禁用时其下模型同样不可执行（后端 available-models / 执行路径与本次策略保存校验同口径）。
  const isDeploymentUsable = (d: { enabled: boolean; providerEnabled?: boolean }) =>
    d.enabled && d.providerEnabled !== false;

  const enabledDeployments = useMemo(() => deployments.filter(isDeploymentUsable), [deployments]);

  // 白名单网格需要展示「已启用的部署」以及「虽被平台禁用、但本空间已勾选的部署」，
  // 否则用户会陷入「以为没配、实际勾了禁用项却看不见、也无法取消」的状态，
  // 与后端「默认/白名单中的部署一旦被禁用即拒绝执行（MODEL_NOT_ALLOWED）」直接矛盾。
  const whitelistDeployments = useMemo(() => {
    const base = deployments.filter(isDeploymentUsable);
    deployments
      .filter((d) => !isDeploymentUsable(d) && allowed.includes(d.id))
      .forEach((d) => {
        if (!base.find((m) => m.id === d.id)) base.push(d);
      });
    return base;
  }, [deployments, allowed]);

  // 过滤已在后端按 search/type 完成，前端直接展示当前页结果
  const filteredWorkspaces = workspaces;

  // 优先从当前页找，找不到（已翻页/搜索离开）则回退到上次选中的空间缓存，保证右侧配置不空白
  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWs) || selectedWorkspace || null,
    [workspaces, selectedWs, selectedWorkspace]
  );

  // 授权制（方案 A）：策略的实质内容 = 该空间可用的模型清单（白名单）。
  // 白名单为空 = 未授权任何模型 → 该空间内所有组件都无法调度模型执行。
  const hasRealPolicy = allowed.length > 0;

  const save = async () => {
    if (!selectedWs) return;
    setSaving(true);
    try {
      // 受控：模型注册表中已禁用的模型不得作为空间默认模型或保留在白名单。
      // 保存前主动剔除（与后端 enabled 校验双保险），避免禁用模型被持久化为可用模型。
      const disabledIds = new Set(deployments.filter((d) => !isDeploymentUsable(d)).map((d) => d.id));
      let nextDefaultId = defaultId;
      let nextAllowed = allowed;
      const stripped: string[] = [];
      if (nextDefaultId && disabledIds.has(nextDefaultId)) {
        nextDefaultId = "";
        stripped.push("默认模型");
      }
      const before = nextAllowed.length;
      nextAllowed = nextAllowed.filter((id) => !disabledIds.has(id));
      if (nextAllowed.length < before) stripped.push("白名单中的已禁用模型");

      // 不变量：默认模型必须在白名单内（后端亦会自愈，这里同步本地，避免保存后仍显示矛盾态）
      if (nextDefaultId && !nextAllowed.includes(nextDefaultId)) {
        nextAllowed = [...nextAllowed, nextDefaultId];
      }

      await authFetch(`/api/admin/workspaces/${selectedWs}/model-policy`, {
        method: "PUT",
        body: JSON.stringify({ defaultDeploymentId: nextDefaultId || null, allowedDeploymentIds: nextAllowed }),
      });
      if (stripped.length > 0) {
        setDefaultId(nextDefaultId);
        setAllowed(nextAllowed);
        toast.warning(`已自动排除${stripped.join("、")}（模型注册表中已禁用，不可作为空间可用模型）`);
      } else {
        toast.success("空间模型策略已保存");
      }
      await loadPolicy();
    } catch (e) {
      toast.error((e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleAllowed = (id: string) => {
    // 空间默认模型不可从白名单移除（否则空间将无法执行）；需先在工作台取消其默认
    if (id === defaultId) {
      toast.warning("该模型是用户空间配置默认模型，无法对其进行名单移除操作");
      return;
    }
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllDeployments = () => {
    setAllowed(enabledDeployments.map((d) => d.id));
  };

  const clearAllowedDeployments = () => {
    setAllowed([]);
  };


  return (
    <div className="space-y-5 pb-8">
      {/* 顶部标题栏（精炼大厂风格，去掉无关跳转与多余文字） */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-8.5 h-8.5 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
              <Layers className="w-4.5 h-4.5" />
            </span>
            <span>空间模型策略</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            配置该工作空间可用的模型清单（白名单）；默认模型请在用户工作台的个人 / 企业空间页面设置
          </p>
        </div>

        {/* 顶部快捷操作：已按要求移除「工作空间列表」按钮 */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/models"
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>模型注册表</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
          <button
            type="button"
            onClick={() => {
              void loadDeployments();
              void loadWorkspaces(wsPage, { search: searchWs, type: typeFilter });
              if (selectedWs) void loadPolicy();
            }}
            disabled={loading || wsLoading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
            title="刷新数据"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-9 h-9 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载空间与模型策略...</span>
        </div>
      ) : (
        /* 主体：现代化左右双栏工作台布局 (左 4 / 右 8 严格等高自适应) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* 左侧：工作空间列表与检索中枢 (4 列) */}
          <div className="lg:col-span-4 bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col h-full overflow-hidden">
            {/* 检索与筛选栏 */}
            <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>工作空间</span>
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  共 {wsTotal} 个
                </span>
              </div>

              {/* 搜索框 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchWs}
                  onChange={(e) => setSearchWs(e.target.value)}
                  placeholder="搜索名称或 ID..."
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 outline-none transition-all shadow-2xs"
                />
                {searchWs && (
                  <button
                    type="button"
                    onClick={() => setSearchWs("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 类型过滤标签 */}
              <div className="flex items-center gap-1.5 pt-0.5">
                {(
                  [
                    { key: "ALL", label: "全部" },
                    { key: "ENTERPRISE", label: "企业" },
                    { key: "PERSONAL", label: "个人" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTypeFilter(tab.key)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      typeFilter === tab.key
                        ? "bg-[#3182ce] text-white shadow-2xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 空间滚动选择列表 */}
            <div className="flex-1 min-h-[460px] max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-slate-100 relative">
              {wsLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                  <div className="w-6 h-6 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
                </div>
              )}
              {filteredWorkspaces.map((w) => {
                const isSelected = selectedWs === w.id;
                const isEnterprise = w.type === "ENTERPRISE";
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setSelectedWs(w.id);
                      setSelectedWorkspace(w);
                    }}
                    className={`w-full text-left p-3 transition-all flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/70 border-l-4 border-l-[#3182ce]"
                        : "hover:bg-slate-50 border-l-4 border-l-transparent"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`font-bold text-xs truncate ${
                            isSelected ? "text-[#2b6cb0]" : "text-slate-800"
                          }`}
                        >
                          {w.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                            isEnterprise
                              ? "bg-blue-100/70 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {isEnterprise ? "企业" : "个人"}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {w.id}
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredWorkspaces.length === 0 && !wsLoading && (
                <div className="py-12 text-center text-slate-400">
                  <Building2 className="w-7 h-7 mx-auto mb-1 text-slate-300" />
                  <span className="text-xs">未找到匹配的工作空间</span>
                </div>
              )}
            </div>

            {/* 空间分页控件（精致单行紧凑布局，彻底杜绝换行，严密契合右侧高度） */}
            <div className="px-3.5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70 mt-auto shrink-0 select-none">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                  共 <strong className="font-mono text-slate-800 font-bold">{wsTotal}</strong> 个
                </span>
                <select
                  value={wsPageSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setWsPageSize(size);
                    setWsPage(1);
                    void loadWorkspaces(1, { search: searchWs, type: typeFilter, pageSize: size });
                  }}
                  className="px-1.5 py-0.5 bg-white border border-slate-200/90 rounded text-[11px] font-bold text-slate-600 cursor-pointer outline-none hover:border-slate-300 focus:border-[#3182ce] shadow-2xs transition-all"
                  title="每页条数"
                >
                  <option value={20}>20/页</option>
                  <option value={50}>50/页</option>
                  <option value={100}>100/页</option>
                </select>
              </div>

              {/* 紧凑页码与翻页按钮组 */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={wsPage <= 1 || wsLoading}
                  onClick={() => loadWorkspaces(1, { search: searchWs, type: typeFilter })}
                  className="w-[26px] h-[26px] rounded bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all shadow-2xs active:scale-95"
                  title="首页"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={wsPage <= 1 || wsLoading}
                  onClick={() => loadWorkspaces(wsPage - 1, { search: searchWs, type: typeFilter })}
                  className="w-[26px] h-[26px] rounded bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all shadow-2xs active:scale-95"
                  title="上一页"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="px-2 py-0.5 bg-white border border-slate-200/80 rounded text-[11px] font-mono font-bold text-slate-700 shadow-2xs flex items-center">
                  <span className="text-[#3182ce]">{wsPage}</span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span>{wsTotalPages || 1}</span>
                </div>

                <button
                  type="button"
                  disabled={wsPage >= (wsTotalPages || 1) || wsLoading}
                  onClick={() => loadWorkspaces(wsPage + 1, { search: searchWs, type: typeFilter })}
                  className="w-[26px] h-[26px] rounded bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all shadow-2xs active:scale-95"
                  title="下一页"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={wsPage >= (wsTotalPages || 1) || wsLoading}
                  onClick={() => loadWorkspaces(wsTotalPages || 1, { search: searchWs, type: typeFilter })}
                  className="w-[26px] h-[26px] rounded bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all shadow-2xs active:scale-95"
                  title="末页"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：策略配置工作台 (8 列，自适应延伸到底部与左侧平齐) */}
          <div className="lg:col-span-8 bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col h-full overflow-hidden">
            {currentWorkspace ? (
              <div className="flex flex-col flex-1 divide-y divide-slate-100 justify-between h-full">
                {/* 1. 当前空间标识与顶部快捷操作栏 */}
                <div className="p-5 bg-gradient-to-r from-blue-50/60 via-slate-50/40 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black text-slate-800 tracking-tight">
                        {currentWorkspace.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          configured
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {hasRealPolicy ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>已单独配置专属策略</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3 text-slate-400" />
                            <span>沿用平台默认</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <span>ID: {currentWorkspace.id}</span>
                    </div>
                  </div>

                  {/* 顶部主操作按钮 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200/80 cursor-pointer active:scale-95 disabled:opacity-50"
                      onClick={() => {
                        setDefaultId(loadedDefaultId);
                        setAllowed(loadedAllowed);
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Undo2 className="w-3 h-3" />
                        <span>放弃修改</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void save()}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? "正在保存..." : "保存空间策略"}</span>
                    </button>
                  </div>
                </div>

                {/* 配置不一致告警：默认模型曾被移出白名单（历史脏数据），已自动并回，需保存生效 */}
                {orphanDefault && (
                  <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-amber-800 leading-relaxed">
                      <span className="font-bold">默认模型不在可用白名单：</span>
                      该空间的默认模型此前被移出了白名单，这会导致空间无法执行任务。自动修复未成功（可能该模型已被平台禁用），请手动处理——将其重新加入白名单，或通知空间所有者在工作台更换默认模型。
                    </div>
                  </div>
                )}

                {/* 2. 可用模型白名单配置（授权制：本页唯一职责） */}
                <div className="p-5 space-y-3 flex-1 flex flex-col min-h-[380px]">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" />
                        <span>可用模型白名单</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            allowed.length === 0
                              ? "bg-rose-50 text-[#e53e3e] border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {allowed.length === 0 ? "未授权任何模型" : `已授权 ${allowed.length} 款模型`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        勾选即授权该空间可用此模型；「平台默认初始」是新空间自动开通的，可随时取消以停止本空间使用。
                        空间默认模型由用户工作台设置，且默认模型不可在此取消勾选。
                      </p>
                    </div>

                    {/* 快捷批量选择操作 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={selectAllDeployments}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        全选已启用
                      </button>
                      <button
                        type="button"
                        onClick={clearAllowedDeployments}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-[#e53e3e] text-slate-600 border border-slate-200 rounded text-[11px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        清空（全部不可用）
                      </button>
                    </div>
                  </div>

                  {/* 模型网格 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                    {whitelistDeployments.map((d) => {
                      const isChecked = allowed.includes(d.id);
                      const isDefault = defaultId === d.id;
                      return (
                        <div
                          key={d.id}
                          onClick={() => toggleAllowed(d.id)}
                          className={`group relative flex items-start gap-2.5 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                            isChecked
                              ? "border-[#3182ce] bg-blue-50/40 shadow-xs"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className={`mt-0.5 w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] ${isDefault ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                            checked={isChecked}
                            disabled={isDefault}
                            onChange={() => toggleAllowed(d.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span
                                className="font-bold text-xs text-slate-800 font-mono truncate"
                                title={d.modelId}
                              >
                                {d.modelId}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  {d.providerId}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailDeployment(d);
                                  }}
                                  className="px-1.5 py-0.2 rounded text-[10px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-all flex items-center gap-0.5 cursor-pointer"
                                  title="查看模型参数与资费详情"
                                >
                                  <Info className="w-3 h-3" />
                                  <span>详情</span>
                                </button>
                              </div>
                            </div>

                            {d.displayName && (
                              <div className="text-[11px] text-slate-500 font-medium truncate mb-1">
                                {d.displayName}
                              </div>
                            )}

                            {/* 能力标签 */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {/* 来源标注：平台默认初始（新空间自动开通，可在此取消以停止本空间使用）/ 空间授权（管理员手动授权） */}
                              {freeDefaults.includes(d.id) ? (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                  title="平台默认初始模型：新空间自动开通；取消勾选即可停止本空间使用，不影响其他空间"
                                >
                                  平台默认初始
                                </span>
                              ) : allowed.includes(d.id) ? (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  title="由管理员为本空间授权"
                                >
                                  空间授权
                                </span>
                              ) : null}
                              {Array.isArray(d.capabilities) && d.capabilities.length > 0 ? (
                                d.capabilities.slice(0, 3).map((c) => (
                                  <span
                                    key={c}
                                    className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/70"
                                    title={CAPABILITY_DICT[c]?.desc || c}
                                  >
                                    {CAPABILITY_DICT[c]?.label || c}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[9px] text-amber-600 font-bold">未声明能力</span>
                              )}
                              {d.capabilities && d.capabilities.length > 3 && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  +{d.capabilities.length - 3}
                                </span>
                              )}
                              {isDefault && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-[#805ad5] border border-purple-200"
                                  title="该空间默认模型（在工作台设置），必须在白名单内，不可在此取消"
                                >
                                  空间默认
                                </span>
                              )}
                              {!d.enabled && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-[#e53e3e] border border-rose-200">
                                  受控·已禁用
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {whitelistDeployments.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                        <Cpu className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-600">暂无可用模型部署（请先在模型注册表启用模型）</p>
                        <Link
                          href="/admin/models"
                          className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          <Server className="w-3.5 h-3.5" />
                          <span>前往模型注册表</span>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. 底部保存操作条（置底固定，保证与左侧平齐延伸） */}
                <div className="p-4 bg-slate-50/60 flex items-center justify-between flex-wrap gap-3 mt-auto border-t border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    {hasRealPolicy ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        已为该空间授权 {allowed.length} 款可用模型，修改后请点击右侧保存
                      </span>
                    ) : (
                      <span className="text-rose-600 font-bold">
                        未授权任何模型：该空间内所有组件都无法调度模型执行，请至少勾选一款模型后保存
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-bold transition-all border border-slate-200/80 cursor-pointer active:scale-95"
                      onClick={() => {
                        setDefaultId(loadedDefaultId);
                        setAllowed(loadedAllowed);
                      }}
                    >
                      放弃修改
                    </button>
                    <button
                      type="button"
                      className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void save()}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? "正在保存..." : "保存空间策略"}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex-1 flex flex-col items-center justify-center p-16 text-center text-slate-400 min-h-[560px]">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">请在左侧选择一个工作空间</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  选择工作空间后，即可查看并配置其可用的模型白名单
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 模型部署详情模态弹窗 (Modal) */}
      {detailDeployment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto flex flex-col custom-scrollbar">
            {/* 弹窗头部 */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center justify-center shrink-0">
                  <Server className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-slate-800 tracking-tight break-all">
                      {detailDeployment.displayName || detailDeployment.modelId}
                    </h3>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                        detailDeployment.enabled
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {detailDeployment.enabled ? "平台启用" : "平台禁用"}
                    </span>
                    {/* 连通性健康状态（接口真实下发：healthy / error / unknown） */}
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                        detailDeployment.health === "healthy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : detailDeployment.health === "error"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {detailDeployment.health === "healthy"
                        ? "通道健康"
                        : detailDeployment.health === "error"
                        ? "通道异常"
                        : "未探测"}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5 break-all">
                    {detailDeployment.providerId} / {detailDeployment.modelId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailDeployment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗主体内容 */}
            <div className="p-5 space-y-5">
              {/* 核心参数网格：全部为接口真实下发的数据，完整展示不截断 */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">所属供应商</span>
                  <div className="font-bold text-slate-800 break-all">{detailDeployment.providerId}</div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">上下文容量上限</span>
                  <div className="font-bold text-slate-800">
                    {formatContextTokens(detailDeployment.contextLimit)}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">平台模型标识 (modelId)</span>
                  <div className="font-mono font-bold text-slate-800 break-all">
                    {detailDeployment.modelId}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">上游实际标识 (upstreamModel)</span>
                  <div className="font-mono font-bold text-slate-800 break-all">
                    {detailDeployment.upstreamModel || detailDeployment.modelId}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">最近连通性测试</span>
                  <div className="font-bold text-slate-800">
                    {formatDateTime(detailDeployment.lastTestedAt)}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">接入时间</span>
                  <div className="font-bold text-slate-800">
                    {formatDateTime(detailDeployment.createdAt)}
                  </div>
                </div>
              </div>

              {/* 能力声明 */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>支持能力声明</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.isArray(detailDeployment.capabilities) && detailDeployment.capabilities.length > 0 ? (
                    detailDeployment.capabilities.map((c) => {
                      const meta = CAPABILITY_DICT[c];
                      return (
                        <div
                          key={c}
                          className="p-2 bg-blue-50/40 rounded border border-blue-100 text-xs flex flex-col"
                        >
                          <span className="font-bold text-[#2b6cb0]">
                            {meta?.label || c}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            {meta?.desc || c}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      该模型部署未声明具体能力白名单
                    </div>
                  )}
                </div>
              </div>

              {/* 资费标准：真实生效价（直配售价优先，未直配按成本×加价率派生，与结算口径一致） */}
              {(() => {
                const pr = detailDeployment.pricing;
                const isFree = pr?.priceStatus === "FREE";
                const bps = pr?.markupRateBps ?? globalMarkupBps;
                const priceRows: { label: string; price?: number | null; cost?: number | null }[] = [
                  { label: "输入", price: pr?.priceInputMicrosPerMillion, cost: pr?.costInputMicrosPerMillion },
                  { label: "输出", price: pr?.priceOutputMicrosPerMillion, cost: pr?.costOutputMicrosPerMillion },
                  { label: "缓存读取", price: pr?.priceCacheReadMicrosPerMillion, cost: pr?.costCacheReadMicrosPerMillion },
                  { label: "缓存写入", price: pr?.priceCacheWriteMicrosPerMillion, cost: pr?.costCacheWriteMicrosPerMillion },
                ];
                const resolved = priceRows.map((r) => ({ ...r, eff: resolveEffectivePrice(r.price, r.cost, bps) }));
                const anyDerived = resolved.some((r) => r.eff.derived);
                const enabledPeriods = (detailDeployment.periods || []).filter((p) => p.enabled);
                return (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">参考计费标准（用户售价）</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {PRICE_STATUS_LABEL[pr?.priceStatus || ""] || "未配置"}
                      </span>
                    </div>
                    {isFree ? (
                      <div className="text-emerald-600 font-bold">该模型当前为免费模型（¥0 / 百万 Tokens）</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {resolved.map((r) => (
                          <div key={r.label}>
                            <span className="text-slate-400">{r.label}单价：</span>
                            <span className="font-bold text-slate-700 font-mono">
                              {r.eff.micros != null ? formatPrice(r.eff.micros) : "--"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 售价口径说明：让管理员看懂价格从哪来 */}
                    <div className="text-[10px] text-slate-400 leading-snug">
                      {anyDerived && bps != null
                        ? `标注价格由供应商成本 × 平台加价率 ${bps / 100}% 派生（模型未单独配置售价时自动套用）。`
                        : "价格为平台直配售价，单位：元 / 百万 Tokens。"}
                    </div>

                    {/* 分时价格：在主流价之上叠加的时段覆盖价，结算时按当前时间命中 */}
                    {enabledPeriods.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <span className="font-bold text-slate-700">
                          分时价格（命中时段时按时段价计费，未命中回落上方主流价）
                        </span>
                        {enabledPeriods.map((p) => {
                          const pBps = p.markupRateBps ?? globalMarkupBps;
                          return (
                            <div key={p.id} className="p-2 bg-white rounded-lg border border-slate-100 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-1 py-0.5 rounded text-[10px] font-bold border ${
                                    p.kind === "IDLE"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : p.kind === "PEAK"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : "bg-blue-50 text-[#2b6cb0] border-blue-200"
                                  }`}
                                >
                                  {PERIOD_KIND_LABEL[p.kind] || "自定义"}
                                </span>
                                <span className="font-bold text-slate-700">{p.name}</span>
                                <span className="text-[10px] text-slate-400">
                                  {formatPeriodSchedule(p)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                                <span>
                                  输入：
                                  <span className="font-mono font-bold text-slate-700">
                                    {resolveEffectivePrice(p.priceInputMicrosPerMillion, p.costInputMicrosPerMillion, pBps).micros != null
                                      ? formatPrice(resolveEffectivePrice(p.priceInputMicrosPerMillion, p.costInputMicrosPerMillion, pBps).micros)
                                      : "沿用主流价"}
                                  </span>
                                </span>
                                <span>
                                  输出：
                                  <span className="font-mono font-bold text-slate-700">
                                    {resolveEffectivePrice(p.priceOutputMicrosPerMillion, p.costOutputMicrosPerMillion, pBps).micros != null
                                      ? formatPrice(resolveEffectivePrice(p.priceOutputMicrosPerMillion, p.costOutputMicrosPerMillion, pBps).micros)
                                      : "沿用主流价"}
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 本空间策略适配态 */}
              <div className="p-3 bg-blue-50/50 rounded border border-blue-100 text-xs space-y-1">
                <div className="font-bold text-[#2b6cb0] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>当前空间策略状态</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div>
                    • 空间默认模型（由工作台设置，本页不可改）：
                    <span className="font-bold ml-1">
                      {defaultId === detailDeployment.id ? "本模型" : "未指向本模型"}
                    </span>
                  </div>
                  <div>
                    • 白名单状态：
                    <span className="font-bold ml-1">
                      {allowed.length === 0
                        ? "未授权任何模型（本模型也无法调度）"
                        : allowed.includes(detailDeployment.id)
                        ? "已在白名单内"
                        : "不在白名单（当前空间无法调度）"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 弹窗底部操作条：操作成功后自动关闭弹窗，策略变更需在主页面保存生效 */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2 rounded-b-2xl">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    toggleAllowed(detailDeployment.id);
                    toast.success(
                      allowed.includes(detailDeployment.id)
                        ? "已从空间白名单移出，点击右上角「保存空间策略」后生效"
                        : "已加入空间白名单，点击右上角「保存空间策略」后生效"
                    );
                    setDetailDeployment(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                    allowed.includes(detailDeployment.id)
                      ? "bg-rose-50 text-[#e53e3e] border-rose-200 hover:bg-rose-100"
                      : "bg-blue-50 text-[#2b6cb0] border-blue-200 hover:bg-blue-100"
                  }`}
                >
                  {allowed.includes(detailDeployment.id) ? "移出白名单" : "加入白名单"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDetailDeployment(null)}
                className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

