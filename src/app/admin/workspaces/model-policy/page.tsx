"use client";

/**
 * 空间模型策略（后端早已支持，此前只能靠 curl 调用，现补上管理界面）
 *
 * 裁决优先级（与 src/lib/model-registry.ts 的 resolveDefaultDeployment 完全一致）：
 *   1. 当前空间的「默认模型」优先；
 *   2. 空间未配置时，才回落到「平台默认模型」（/admin/models 页面设置）；
 *   3. 两者都没有 → 该空间的组件一律拒绝执行（MODEL_NOT_ALLOWED）。
 * 白名单语义：留空 = 不限制；一旦勾选任意模型，则该空间**只能**使用被勾选的模型。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
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
  Copy,
  CheckCheck,
  Filter,
  Info,
  ChevronDown,
  ChevronUp,
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
  capabilities?: string[] | null;
  pricing?: {
    priceInputMicrosPerMillion?: number | null;
    priceOutputMicrosPerMillion?: number | null;
  } | null;
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
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [searchWs, setSearchWs] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "ENTERPRISE" | "PERSONAL">("ALL");
  const [defaultId, setDefaultId] = useState<string>("");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  // 空间列表分页检索状态（后端分页，不再前端全量拉取，空间数量大时也不卡）
  const [wsPage, setWsPage] = useState(1);
  const [wsTotal, setWsTotal] = useState(0);
  const [wsTotalPages, setWsTotalPages] = useState(1);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsPageSize, setWsPageSize] = useState(20);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceItem | null>(null);

  // 详情模态弹窗选中的模型部署
  const [detailDeployment, setDetailDeployment] = useState<DeploymentItem | null>(null);

  // 自定义默认模型选择器状态与 Ref
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectSearch, setSelectSearch] = useState("");
  const selectRef = useRef<HTMLDivElement>(null);

  // 监听点击外部收起自定义下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    } catch (e) {
      toast.error((e as Error)?.message || "加载模型列表失败");
    }
  }, [authFetch]);

  // 空间列表走后端分页 + 关键字/类型检索（不再前端全量过滤），空间数量大时也不会卡
  const loadWorkspaces = useCallback(
    async (
      page: number,
      opts: { search: string; type: "ALL" | "ENTERPRISE" | "PERSONAL"; pageSize?: number },
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
        // 仅当尚未选中时，默认选中当前页第一条（函数式更新，避免依赖外部 state）
        setSelectedWs((prev) => prev || (list[0]?.id ?? ""));
        setSelectedWorkspace((prev) => prev || (list[0] ?? null));
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
      setDefaultId(row?.defaultDeploymentId || "");
      setAllowed(Array.isArray(row?.allowedDeploymentIds) ? row.allowedDeploymentIds : []);
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

  const enabledDeployments = useMemo(() => deployments.filter((d) => d.enabled), [deployments]);

  // 白名单网格需要展示「已启用的部署」以及「虽被平台禁用、但本空间已勾选的部署」，
  // 否则用户会陷入「以为没配、实际勾了禁用项却看不见、也无法取消」的状态，
  // 与后端「默认/白名单中的部署一旦被禁用即拒绝执行（MODEL_NOT_ALLOWED）」直接矛盾。
  const whitelistDeployments = useMemo(() => {
    const base = deployments.filter((d) => d.enabled);
    deployments
      .filter((d) => !d.enabled && allowed.includes(d.id))
      .forEach((d) => {
        if (!base.find((m) => m.id === d.id)) base.push(d);
      });
    return base;
  }, [deployments, allowed]);

  // 自定义下拉框搜索过滤出的部署列表
  const selectableDeployments = useMemo(() => {
    if (!selectSearch.trim()) return deployments;
    const q = selectSearch.trim().toLowerCase();
    return deployments.filter(
      (d) =>
        d.modelId.toLowerCase().includes(q) ||
        d.providerId.toLowerCase().includes(q) ||
        (d.displayName && d.displayName.toLowerCase().includes(q))
    );
  }, [deployments, selectSearch]);

  // 过滤已在后端按 search/type 完成，前端直接展示当前页结果
  const filteredWorkspaces = workspaces;

  // 优先从当前页找，找不到（已翻页/搜索离开）则回退到上次选中的空间缓存，保证右侧配置不空白
  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWs) || selectedWorkspace || null,
    [workspaces, selectedWs, selectedWorkspace]
  );

  const currentDefaultDeployment = useMemo(
    () => deployments.find((d) => d.id === defaultId),
    [deployments, defaultId]
  );

  // 真正的「是否有实质配置」：清空默认且清空白名单 == 沿用平台默认，不应再显示「已单独配置专属策略」
  // （后端 configured 仅表示记录存在，全空记录也会返回 true，需前端二次判断）
  const hasRealPolicy = Boolean(defaultId) || allowed.length > 0;

  const save = async () => {
    if (!selectedWs) return;
    setSaving(true);
    try {
      // 受控：模型注册表中已禁用的模型不得作为空间默认模型或保留在白名单。
      // 保存前主动剔除（与后端 enabled 校验双保险），避免禁用模型被持久化为可用模型。
      const disabledIds = new Set(deployments.filter((d) => !d.enabled).map((d) => d.id));
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
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllDeployments = () => {
    setAllowed(enabledDeployments.map((d) => d.id));
  };

  const clearAllowedDeployments = () => {
    setAllowed([]);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard
      .writeText(id)
      .then(() => {
        setCopiedId(true);
        toast.success("空间 ID 已复制到剪贴板");
        setTimeout(() => setCopiedId(false), 2000);
      })
      .catch(() => {});
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
            配置工作空间的专属默认模型与可用模型白名单（默认模型优先于平台兜底模型）
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
                      <button
                        type="button"
                        onClick={() => handleCopyId(currentWorkspace.id)}
                        className="p-1 hover:text-slate-600 transition-colors cursor-pointer"
                        title="复制空间 ID"
                      >
                        {copiedId ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 顶部主操作按钮 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200/80 cursor-pointer active:scale-95 disabled:opacity-50"
                      onClick={() => {
                        setDefaultId("");
                        setAllowed([]);
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Undo2 className="w-3 h-3" />
                        <span>恢复默认</span>
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

                {/* 2. 空间默认模型配置 */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
                        <span>空间默认模型</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        空间内任务未指定模型时优先调用，留空则自动沿用平台全局默认模型；若下方白名单已启用，默认模型也需包含在白名单内，否则空间任务将因无可用模型而无法执行。
                      </p>
                    </div>
                  </div>

                  {/* 自定义现代高级模型选择下拉框 */}
                  <div className="relative" ref={selectRef}>
                    <button
                      type="button"
                      onClick={() => setSelectOpen((prev) => !prev)}
                      className={`w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-lg text-xs font-bold text-slate-800 transition-all cursor-pointer flex items-center justify-between gap-2 shadow-xs ${
                        selectOpen ? "border-[#3182ce] ring-2 ring-[#3182ce]/15 bg-white" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Cpu className="w-4 h-4 text-[#3182ce] shrink-0" />
                        {currentDefaultDeployment ? (
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100/80 text-[#2b6cb0] shrink-0">
                              {currentDefaultDeployment.providerId}
                            </span>
                            <span className="font-mono text-slate-800 font-bold truncate">
                              {currentDefaultDeployment.modelId}
                            </span>
                            {currentDefaultDeployment.displayName && (
                              <span className="text-[11px] text-slate-500 font-medium truncate">
                                （{currentDefaultDeployment.displayName}）
                              </span>
                            )}
                            {!currentDefaultDeployment.enabled && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-[#e53e3e] border border-rose-200 shrink-0">
                                平台已禁用
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 font-medium">
                            （不单独设置，自动沿用平台全局默认模型）
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {defaultId && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultId("");
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                            title="清空并沿用平台默认"
                          >
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            selectOpen ? "rotate-180 text-[#3182ce]" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {/* 下拉面板 */}
                    {selectOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl z-40 max-h-80 overflow-hidden flex flex-col">
                        {/* 搜索过滤框 */}
                        <div className="p-2 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                          <input
                            type="text"
                            value={selectSearch}
                            onChange={(e) => setSelectSearch(e.target.value)}
                            placeholder="按模型名、供应商或描述即时检索..."
                            className="w-full bg-transparent text-xs font-medium text-slate-800 placeholder-slate-400 outline-none"
                            autoFocus
                          />
                          {selectSearch && (
                            <button
                              type="button"
                              onClick={() => setSelectSearch("")}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* 选项滚动区 */}
                        <div className="overflow-y-auto divide-y divide-slate-100 p-1">
                          {/* 沿用平台全局默认模型选项 */}
                          <div
                            role="button"
                            onClick={() => {
                              setDefaultId("");
                              setSelectOpen(false);
                            }}
                            className={`p-2.5 rounded text-xs transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              !defaultId
                                ? "bg-blue-50/80 text-[#2b6cb0] font-bold"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <RotateCcw className="w-3.5 h-3.5 text-[#3182ce]" />
                                <span>自动沿用平台全局默认模型</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-normal">
                                本空间不单独锁定默认模型，优先采用平台总控配置的兜底模型
                              </div>
                            </div>
                            {!defaultId && <Check className="w-4 h-4 text-[#3182ce] shrink-0" />}
                          </div>

                          {/* 模型选项列表 */}
                          {selectableDeployments.map((d) => {
                            const isSelected = defaultId === d.id;
                            const isAllowed = allowed.includes(d.id);
                            return (
                              <div
                                key={d.id}
                                role="button"
                                onClick={() => {
                                  if (!d.enabled) return;
                                  setDefaultId(d.id);
                                  setSelectOpen(false);
                                }}
                                className={`p-2.5 rounded text-xs transition-all flex items-center justify-between gap-2 ${
                                  !d.enabled
                                    ? "opacity-50 cursor-not-allowed bg-slate-50/50"
                                    : isSelected
                                    ? "bg-blue-50/80 text-[#2b6cb0] font-bold cursor-pointer"
                                    : "hover:bg-slate-50 text-slate-700 cursor-pointer"
                                }`}
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                      {d.providerId}
                                    </span>
                                    <span className="font-mono text-slate-800 font-bold truncate">
                                      {d.modelId}
                                    </span>
                                    {d.displayName && (
                                      <span className="text-[11px] text-slate-500 font-medium truncate">
                                        · {d.displayName}
                                      </span>
                                    )}
                                    {isAllowed && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                        已在白名单
                                      </span>
                                    )}
                                    {!d.enabled && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-[#e53e3e] border border-rose-200 shrink-0">
                                        平台已禁用
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                                    {d.contextLimit && (
                                      <span>上下文: {formatContextTokens(d.contextLimit)}</span>
                                    )}
                                    {Array.isArray(d.capabilities) && d.capabilities.length > 0 && (
                                      <span className="truncate">
                                        · 能力:{" "}
                                        {d.capabilities
                                          .map((c) => CAPABILITY_DICT[c]?.label || c)
                                          .join("、")}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {isSelected && (
                                  <Check className="w-4 h-4 text-[#3182ce] shrink-0" />
                                )}
                              </div>
                            );
                          })}

                          {selectableDeployments.length === 0 && (
                            <div className="py-6 text-center text-slate-400 text-xs">
                              未搜索到匹配的模型部署
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 选中的默认模型简要卡片 */}
                  {currentDefaultDeployment && (
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#2b6cb0] font-mono">
                          {currentDefaultDeployment.modelId}
                        </span>
                        <span className="px-1.5 py-0.2 bg-blue-100 text-[#2b6cb0] rounded text-[10px] font-bold">
                          {currentDefaultDeployment.providerId}
                        </span>
                        {currentDefaultDeployment.contextLimit && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {formatContextTokens(currentDefaultDeployment.contextLimit)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {currentDefaultDeployment.capabilities?.slice(0, 3).map((c) => (
                            <span
                              key={c}
                              className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-600 border border-slate-200"
                            >
                              {CAPABILITY_DICT[c]?.label || c}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailDeployment(currentDefaultDeployment)}
                          className="px-2 py-0.5 text-[10px] font-bold text-[#3182ce] bg-white hover:bg-blue-50 rounded border border-blue-200 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                          title="查看完整技术与资费参数"
                        >
                          <Info className="w-3 h-3" />
                          <span>参数详情</span>
                        </button>
                      </div>
                      {!currentDefaultDeployment.enabled && (
                        <span className="w-full text-[11px] font-bold text-amber-600">
                          ⚠ 该默认模型已被平台禁用，将导致空间任务无法正常调度执行，请重新选择空间默认模型。
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. 可用模型白名单配置（自适应充满剩余高度） */}
                <div className="p-5 space-y-3 flex-1 flex flex-col min-h-[380px]">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" />
                        <span>可用模型白名单</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {allowed.length === 0 ? "全部可用（未限制）" : `已限制 ${allowed.length} 款模型`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        留空表示不限制；勾选后，该空间仅允许调度已选中的模型
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
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded text-[11px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        清空（不限制）
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
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                            checked={isChecked}
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
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-[#805ad5] border border-purple-200">
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

                {/* 4. 底部保存操作条（置底固定，保证与左侧平齐延伸） */}
                <div className="p-4 bg-slate-50/60 flex items-center justify-between flex-wrap gap-3 mt-auto border-t border-slate-100">
                  <div className="text-xs text-slate-500 font-medium">
                    {hasRealPolicy ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        当前空间已有专属策略，修改后请点击右侧保存
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        当前空间未配置专属策略，自动沿用平台默认
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-bold transition-all border border-slate-200/80 cursor-pointer active:scale-95"
                      onClick={() => {
                        setDefaultId("");
                        setAllowed([]);
                      }}
                    >
                      恢复默认
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
                  选择工作空间后，即可查看并配置其专属默认模型与可用模型白名单
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 模型部署详情模态弹窗 (Modal) */}
      {detailDeployment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
            {/* 弹窗头部 */}
            <div className="p-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center justify-center font-bold">
                  <Server className="w-4 h-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">
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
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
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
            <div className="p-5 space-y-4">
              {/* 核心参数网格 */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">所属供应商</span>
                  <div className="font-bold text-slate-800">{detailDeployment.providerId}</div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">上下文容量上限</span>
                  <div className="font-bold text-slate-800">
                    {formatContextTokens(detailDeployment.contextLimit)}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">平台模型标识 (modelId)</span>
                  <div className="font-mono font-bold text-slate-800 truncate" title={detailDeployment.modelId}>
                    {detailDeployment.modelId}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400">上游实际标识 (upstreamModel)</span>
                  <div
                    className="font-mono font-bold text-slate-800 truncate"
                    title={detailDeployment.upstreamModel || detailDeployment.modelId}
                  >
                    {detailDeployment.upstreamModel || detailDeployment.modelId}
                  </div>
                </div>

                <div className="col-span-2 p-2.5 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">部署全局唯一 ID</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(detailDeployment.id);
                        toast.success("部署 ID 已复制");
                      }}
                      className="text-[10px] text-[#3182ce] hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Copy className="w-3 h-3" />
                      <span>复制</span>
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 truncate">
                    {detailDeployment.id}
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

              {/* 资费标准 */}
              <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1.5 text-xs">
                <span className="font-bold text-slate-700">参考计费标准</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">输入单价：</span>
                    <span className="font-bold text-slate-700 font-mono">
                      {formatPrice(detailDeployment.pricing?.priceInputMicrosPerMillion)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">输出单价：</span>
                    <span className="font-bold text-slate-700 font-mono">
                      {formatPrice(detailDeployment.pricing?.priceOutputMicrosPerMillion)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 本空间策略适配态 */}
              <div className="p-3 bg-blue-50/50 rounded border border-blue-100 text-xs space-y-1">
                <div className="font-bold text-[#2b6cb0] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>当前空间策略状态</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div>
                    • 空间默认模型：
                    <span className="font-bold ml-1">
                      {defaultId === detailDeployment.id ? "已设为当前默认" : "未设为默认"}
                    </span>
                  </div>
                  <div>
                    • 白名单状态：
                    <span className="font-bold ml-1">
                      {allowed.length === 0
                        ? "白名单未限制（全局可用）"
                        : allowed.includes(detailDeployment.id)
                        ? "已在白名单内"
                        : "不在白名单（当前空间无法调度）"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 弹窗底部操作条 */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (defaultId === detailDeployment.id) {
                      setDefaultId("");
                      toast.success("已取消该模型为默认模型");
                    } else {
                      if (!detailDeployment.enabled) {
                        toast.error("该模型已被平台禁用，无法设为默认");
                        return;
                      }
                      setDefaultId(detailDeployment.id);
                      toast.success("已设为当前空间默认模型");
                    }
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                    defaultId === detailDeployment.id
                      ? "bg-purple-50 text-[#805ad5] border-purple-200 hover:bg-purple-100"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {defaultId === detailDeployment.id ? "取消空间默认" : "设为空间默认"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleAllowed(detailDeployment.id);
                    toast.success(
                      allowed.includes(detailDeployment.id)
                        ? "已从空间白名单移出"
                        : "已加入空间白名单"
                    );
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
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
                className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-bold transition-all cursor-pointer"
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

