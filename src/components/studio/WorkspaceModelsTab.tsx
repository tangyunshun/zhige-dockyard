"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import {
  Cpu,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Layers,
  KeyRound,
  Coins,
  ArrowRight,
  SlidersHorizontal,
  Search,
  Tag,
  Eye,
  Info,
  Clock3,
} from "lucide-react";

interface ModelPricing {
  inputPricePerK?: number;
  outputPricePerK?: number;
  pricePerCall?: number;
  unitType?: string;
  discountRate?: number | null;
  isDiscountActive?: boolean;
  currency?: string;
  priceInputMicrosPerMillion?: number | null;
  priceOutputMicrosPerMillion?: number | null;
  priceCacheReadMicrosPerMillion?: number | null;
  priceCacheWriteMicrosPerMillion?: number | null;
  priceSource?: string;
  priceStatus?: string;
  markupRateBps?: number | null;
  activePeriodId?: string | null;
  activePeriodName?: string | null;
  activePeriodKind?: string | null;
}

interface AvailableModelItem {
  id: string;
  modelCode?: string;
  name?: string;
  displayName?: string;
  modelId?: string;
  upstreamModel?: string;
  providerCode?: string;
  providerName?: string;
  providerId?: string;
  capabilities: string[];
  pricing?: ModelPricing | null;
  isDefault?: boolean;
  isSpaceDefault?: boolean;
}

interface ByoSummary {
  id: string;
  sourceWorkspaceId?: string;
  scope?: "SPACE" | "PERSONAL_MEMBER";
  label?: string;
  protocol?: string;
  baseUrl?: string;
  endpointHost?: string;
  enabled?: boolean;
  capabilities?: string[];
  shareWithMembers?: boolean;
  canUse?: boolean;
  reason?: string | null;
  pricing?: {
    priceInputMicrosPerMillion?: number | null;
    priceOutputMicrosPerMillion?: number | null;
    priceCacheReadMicrosPerMillion?: number | null;
    priceCacheWriteMicrosPerMillion?: number | null;
    byokServiceRateBps?: number;
  } | null;
}

interface AvailableModelsData {
  workspaceId: string;
  defaultDeploymentId?: string | null;
  defaultTarget?: {
    source?: string;
    targetDeploymentId?: string;
    label?: string;
  } | null;
  models?: AvailableModelItem[];
  systemModels?: AvailableModelItem[];
  byo?: ByoSummary | null;
  byoModel?: ByoSummary | null;
  byoModels?: ByoSummary[];
}

interface WorkspaceModelsTabProps {
  workspaceId: string;
  workspaceName?: string;
  userRole?: string;
  onNavigateToStudio?: () => void;
  onNavigateToByo?: () => void;
}

const CAP_BADGE_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  CHAT: { label: "文本对话", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  CODE: { label: "代码开发", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  EMBEDDING: { label: "向量检索", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  VISION: { label: "视觉多模态", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  FUNCTION_CALL: { label: "函数调用", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  TEXT_GENERATION: { label: "文本生成", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  STRUCTURED_OUTPUT: { label: "结构化输出", bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  LONG_CONTEXT: { label: "长上下文", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  FILE_ANALYSIS: { label: "文件分析", bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
};

export default function WorkspaceModelsTab({
  workspaceId,
  workspaceName,
  userRole,
  onNavigateToStudio,
  onNavigateToByo,
}: WorkspaceModelsTabProps) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AvailableModelsData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCapFilter, setSelectedCapFilter] = useState<string>("ALL");

  const isPrivileged =
    userRole === "Owner" ||
    userRole === "Admin" ||
    userRole === "OWNER" ||
    userRole === "ADMIN";

  const fetchModels = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/available-models?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "获取工作空间可用模型失败");
      }
      setData(json.data);
    } catch (err) {
      toast.error((err as Error)?.message || "加载模型池失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // 兼容派生可用系统模型列表（兼容后端 systemModels 或 models 字段）
  const modelsList: AvailableModelItem[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.systemModels)) return data.systemModels;
    if (Array.isArray(data.models)) return data.models;
    return [];
  }, [data]);

  // 兼容派生默认模型 ID
  const defaultDepId = useMemo(() => {
    return data?.defaultTarget?.targetDeploymentId || data?.defaultDeploymentId || null;
  }, [data]);

  // 兼容派生自带私有模型（支持 Req8 多 BYO 跨空间聚合）
  const byoModels: ByoSummary[] = useMemo(() => {
    if (Array.isArray(data?.byoModels)) return data.byoModels as ByoSummary[];
    if (data?.byoModel) return [data.byoModel as ByoSummary];
    if (data?.byo) return [data.byo as ByoSummary];
    return [];
  }, [data]);

  // 所有涉及的能力标签去重集
  const allAvailableCapabilities = useMemo(() => {
    const caps = new Set<string>();
    modelsList.forEach((m) => {
      (m.capabilities || []).forEach((c) => caps.add(c));
    });
    return Array.from(caps);
  }, [modelsList]);

  // 过滤后的模型列表
  const filteredModels = useMemo(() => {
    return modelsList.filter((m) => {
      const name = m.displayName || m.name || m.modelId || "";
      const code = m.upstreamModel || m.modelCode || m.modelId || "";
      const provider = m.providerName || m.providerCode || m.providerId || "";
      const matchesQuery =
        !searchQuery.trim() ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.toLowerCase().includes(searchQuery.toLowerCase());
      const caps = m.capabilities || [];
      const matchesCap = selectedCapFilter === "ALL" || caps.includes(selectedCapFilter);
      return matchesQuery && matchesCap;
    });
  }, [modelsList, searchQuery, selectedCapFilter]);

  // 网格展示空间白名单内的全部模型（与后台「配几个显几个」一致）；默认模型保留在网格并以「空间默认」徽标高亮，不再移除以免计数缺失
  const gridModels: AvailableModelItem[] = useMemo(() => {
    return filteredModels;
  }, [filteredModels]);

  // 找到默认模型（彻底杜绝 undefined.find 运行时错误）
  const defaultModel = useMemo(() => {
    if (!modelsList || modelsList.length === 0) return null;
    return modelsList.find((m) => m.id === defaultDepId) || null;
  }, [modelsList, defaultDepId]);

  // 当前空间默认指向的 BYO（id = byo:workspaceId）
  const defaultByo = useMemo(() => {
    return byoModels.find((b) => b.id === `byo:${workspaceId}`) || null;
  }, [byoModels, workspaceId]);

  return (
    <div className="space-y-6 font-sans">
      {/* 顶部三联 Bento 仪表盘 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 卡片 1: 平台管理员授权模型池（按用户要求置于首位） */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                平台管理员授权模型池
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                {modelsList.length} 款可用
              </span>
            </div>
            <div className="pt-1">
              <div className="text-2xl font-black text-slate-900 font-mono">
                {modelsList.length}
                <span className="text-xs font-normal text-slate-500 ml-1.5">个已授权部署</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                本空间成员在组件工坊执行任务时，可从这些已授权模型中自由选择
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">白名单外模型不可见且不可调用</span>
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 已隔离受控
            </span>
          </div>
        </div>

        {/* 卡片 2: 当前空间默认执行模型（供应商在前，模型名称在后） */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                当前空间默认执行模型
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100">
                智能调度指向
              </span>
            </div>
            <div className="pt-1">
              <div className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                {defaultModel ? (
                  <span className="text-base font-black text-slate-900">
                    {defaultModel.displayName || defaultModel.name || defaultModel.modelId}
                  </span>
                ) : defaultByo?.enabled ? (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0 font-sans">
                      自有私有
                    </span>
                    <span className="text-base font-black text-slate-900">
                      {defaultByo.label || "自带私有模型"}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400">平台全局基准模型</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {defaultModel
                  ? `供应商: ${defaultModel.providerName || defaultModel.providerCode} · 上游模型: ${defaultModel.upstreamModel || defaultModel.modelCode || defaultModel.modelId}`
                  : "管理员未指定时自动回落全站基准"}
              </p>
              <div className="bg-slate-50/80 rounded border border-slate-200/60 p-2.5 space-y-1.5 text-xs mt-2">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-600">
                  <span>输入 / 输出单价:</span>
                  <span className="font-bold text-slate-900">
                    {defaultModel?.pricing?.priceInputMicrosPerMillion != null
                      ? `¥${(defaultModel.pricing.priceInputMicrosPerMillion / 1000000).toFixed(2)} / ¥${(Number(defaultModel.pricing.priceOutputMicrosPerMillion || 0) / 1000000).toFixed(2)}`
                      : "--"}{" "}
                    <span className="text-[10px] text-slate-400 font-sans font-normal">元/百万</span>
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-500">
                  <span>命中缓存读取:</span>
                  <span className="font-bold text-slate-800">
                    {defaultModel?.pricing?.priceCacheReadMicrosPerMillion != null
                      ? `¥${(defaultModel.pricing.priceCacheReadMicrosPerMillion / 1000000).toFixed(2)}`
                      : "—"}{" "}
                    <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-500">
                  <span>缓存写入存储:</span>
                  <span className="font-bold text-slate-800">
                    {defaultModel?.pricing?.priceCacheWriteMicrosPerMillion != null
                      ? `¥${(defaultModel.pricing.priceCacheWriteMicrosPerMillion / 1000000).toFixed(2)}`
                      : "—"}{" "}
                    <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                  </span>
                </div>
                {!defaultModel?.pricing && (
                  <div className="text-[10px] text-amber-500">该默认模型尚未配置定价信息（请到模型注册表设置资费）</div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">任务缺省或自动模式均以此运行</span>
            {isPrivileged && (
              <button
                type="button"
                onClick={() => router.push(`/user/byo-model?workspaceId=${encodeURIComponent(workspaceId)}`)}
                className="text-[#3182ce] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>修改策略</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 卡片 3: 自带私有模型 (BYO) —— Req1/2/8：仅展示实际配置的 BYO，多模型列表，成员级可见 */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                空间自有私有模型 (BYO)
              </span>
              {byoModels.length > 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {byoModels.length} 个已接入
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                  未配置
                </span>
              )}
            </div>

            {byoModels.length === 0 ? (
              <div className="pt-1">
                <div className="text-base font-black text-slate-900 tracking-tight truncate">
                  暂未接入自带私有模型
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate font-mono">
                  支持接入自备 OpenAI / Ollama 等私有端点
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {byoModels.map((b) => (
                  <div key={b.id} className="rounded-lg border border-amber-100 bg-amber-50/30 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-slate-900 truncate">{b.label || "自带私有模型"}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {b.scope === "PERSONAL_MEMBER" ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">仅本人可见</span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100">空间共享</span>
                        )}
                        {b.enabled ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">已启用</span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">停用维护</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate">
                      端点: {b.baseUrl || b.endpointHost || "未填写"}
                    </div>
                    {/* Req1/5：与定价页一致的四价（缓存读/写 BYO 暂无，显 —） */}
                    <div className="bg-slate-50/80 rounded border border-slate-200/60 p-2 space-y-1 text-[11px] font-mono">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>输入 / 输出:</span>
                        <span className="font-bold text-slate-900">
                          {b.pricing?.priceInputMicrosPerMillion != null
                            ? `¥${(b.pricing.priceInputMicrosPerMillion / 1000000).toFixed(2)} / ¥${(Number(b.pricing.priceOutputMicrosPerMillion || 0) / 1000000).toFixed(2)}`
                            : "--"}{" "}
                          <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>命中缓存读 / 写:</span>
                        <span className="font-bold text-slate-800">
                          {b.pricing?.priceCacheReadMicrosPerMillion != null
                            ? `¥${(b.pricing.priceCacheReadMicrosPerMillion / 1000000).toFixed(2)} / ¥${(b.pricing.priceCacheWriteMicrosPerMillion != null ? (b.pricing.priceCacheWriteMicrosPerMillion / 1000000).toFixed(2) : "0.00")}`
                            : "— / —"}{" "}
                          <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>平台服务费:</span>
                        <span className="font-bold text-slate-800">
                          {b.pricing?.byokServiceRateBps != null ? `${(b.pricing.byokServiceRateBps / 10000).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                    </div>
                    {b.pricing?.priceInputMicrosPerMillion == null && b.pricing?.priceOutputMicrosPerMillion == null && (
                      <div className="text-[10px] text-amber-500">该自带模型尚未登记官方单价（请到「自有模型」设置输入/输出单价）</div>
                    )}
                    {b.canUse === false && (
                      <div className="text-[10px] text-amber-600">{b.reason || "当前不可调用"}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">密钥 AES-256 加密落库</span>
            <button
              type="button"
              onClick={onNavigateToByo}
              className="text-[#3182ce] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>{byoModels.length > 0 ? "管理自有配置" : "去登记接入"}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 控制与过滤操作栏 */}
      <div className="bg-white rounded-lg border border-slate-200/80 p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          {/* 搜索 */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索模型名称 / 编码 / 供应商..."
              className="w-full h-8.5 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-[#3182ce] focus:outline-none transition-all"
            />
          </div>

          {/* 能力筛选 */}
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setSelectedCapFilter("ALL")}
              className={`px-2.5 py-1 text-xs rounded font-bold cursor-pointer transition-all border ${
                selectedCapFilter === "ALL"
                  ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              全部能力
            </button>
            {allAvailableCapabilities.map((cap) => {
              const meta = CAP_BADGE_STYLE[cap] || { label: cap };
              const isSelected = selectedCapFilter === cap;
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setSelectedCapFilter(cap)}
                  className={`px-2.5 py-1 text-xs rounded font-bold cursor-pointer transition-all border whitespace-nowrap ${
                    isSelected
                      ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧动作按钮 */}
        <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={fetchModels}
            disabled={loading}
            className="h-8.5 px-3 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToStudio}
            className="h-8.5 px-3.5 rounded bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:brightness-105 text-white text-xs font-black cursor-pointer flex items-center gap-1.5 shadow-2xs transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>进入组件工坊运行</span>
          </button>
        </div>
      </div>

      {/* 模型列表 */}
      {loading ? (
        <div className="bg-white rounded-lg border border-slate-200/80 p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载空间可用模型矩阵…</span>
        </div>
      ) : gridModels.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200/80 p-12 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
            <Cpu className="w-6 h-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-slate-800">
              {modelsList.length === 0 ? "本空间尚未分配任何可用模型" : "未找到匹配的模型"}
            </h4>
            <p className="text-xs text-slate-500">
              {modelsList.length === 0
                ? "系统管理员尚未为本工作空间授权任何模型部署（0 款可用）。未在白名单中的模型已被受控隔离，无法在此展示与调用。"
                : searchQuery || selectedCapFilter !== "ALL"
                ? "没有符合当前筛选条件的模型，请尝试重置搜索条件。"
                : "管理员暂未向该空间开放任何模型部署，请联系系统管理员在后台分配。"}
            </p>
          </div>
          {isPrivileged && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => router.push(`/user/byo-model?workspaceId=${encodeURIComponent(workspaceId)}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-50 text-[#3182ce] text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all cursor-pointer"
              >
                <span>前往「工作空间模型策略管理」分配模型</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gridModels.map((m) => {
            const isDef = m.id === defaultDepId || m.isSpaceDefault;
            const modelName = m.displayName || m.name || m.modelId || "未命名模型";
            const modelCode = m.upstreamModel || m.modelCode || m.modelId || m.id;
            const providerName = m.providerName || m.providerCode || m.providerId || "系统供应商";
            return (
              <div
                key={m.id}
                className={`bg-white rounded-lg border p-5 transition-all shadow-2xs flex flex-col justify-between hover:shadow-sm ${
                  isDef ? "border-[#3182ce] ring-1 ring-[#3182ce]/20 bg-blue-50/10" : "border-slate-200/80"
                }`}
              >
                <div className="space-y-3">
                  {/* 卡片头部：供应商前置，突出模型名称 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-sans">
                          {providerName}
                        </span>
                        <span className="text-sm font-black text-slate-900 truncate">{modelName}</span>
                        {isDef && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#3182ce] border border-blue-100 shrink-0">
                            空间默认
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">
                        上游标识: {modelCode}
                      </div>
                    </div>
                  </div>

                  {/* 能力标签 */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">支持能力</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(m.capabilities || []).map((c) => {
                        const style = CAP_BADGE_STYLE[c] || {
                          label: c,
                          bg: "bg-slate-50",
                          text: "text-slate-600",
                          border: "border-slate-200",
                        };
                        return (
                          <span
                            key={c}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}
                          >
                            {style.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* 计费详情：真实呈现系统定价（输入/输出/缓存读取/时段） */}
                  <div className="bg-slate-50/80 rounded border border-slate-200/60 p-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-600">
                      <span>输入 / 输出单价:</span>
                      <span className="font-bold text-slate-900">
                        {m.pricing?.priceInputMicrosPerMillion != null
                          ? `¥${(m.pricing.priceInputMicrosPerMillion / 1000000).toFixed(2)} / ¥${(Number(m.pricing.priceOutputMicrosPerMillion || 0) / 1000000).toFixed(2)}`
                          : m.pricing?.inputPricePerK != null
                          ? `${m.pricing.inputPricePerK} / ${m.pricing.outputPricePerK} 点`
                          : "--"}{" "}
                        <span className="text-[10px] text-slate-400 font-sans font-normal">元/百万</span>
                      </span>
                    </div>

                    {m.pricing?.priceCacheReadMicrosPerMillion != null && (
                      <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-500">
                        <span>命中缓存读取:</span>
                        <span className="font-bold text-slate-800">
                          ¥{(m.pricing.priceCacheReadMicrosPerMillion / 1000000).toFixed(2)}{" "}
                          <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                        </span>
                      </div>
                    )}

                    {m.pricing?.priceCacheWriteMicrosPerMillion != null && (
                      <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-500">
                        <span>缓存写入存储:</span>
                        <span className="font-bold text-slate-800">
                          ¥{(m.pricing.priceCacheWriteMicrosPerMillion / 1000000).toFixed(2)}{" "}
                          <span className="text-[9px] text-slate-400 font-sans font-normal">元/百万</span>
                        </span>
                      </div>
                    )}

                    <div className="pt-1 border-t border-slate-200/50 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">生效时段:</span>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded ${
                          m.pricing?.isDiscountActive
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-blue-50 text-[#3182ce] border border-blue-100"
                        }`}
                      >
                        {m.pricing?.activePeriodName || "日常主流定价"}
                        {m.pricing?.discountRate ? ` (${(m.pricing.discountRate * 100).toFixed(0)}% 优惠)` : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 底部按钮 */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onNavigateToStudio}
                    className="px-2.5 py-1 rounded bg-white hover:bg-blue-50 text-[#3182ce] border border-blue-200 text-xs font-bold cursor-pointer flex items-center gap-1 transition-all shrink-0"
                  >
                    <span>在工坊中运行</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 补充说明卡片 */}
      <div className="bg-blue-50/50 rounded-lg border border-blue-100 p-4 text-xs text-slate-600 space-y-1.5">
        <div className="font-bold text-[#2b6cb0] flex items-center gap-1.5">
          <Info className="w-4 h-4 text-[#3182ce]" />
          <span>关于工作空间模型策略与选择器运行机制：</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
          <li>
            <strong>智能调度（默认模式）：</strong>未指定模型时，系统优先使用上述高亮的空间默认模型；若组件有特殊能力要求，将自动调度满足合同能力的最佳可用部署。
          </li>
          <li>
            <strong>组件工坊手动切换：</strong>在任意组件执行抽屉中，可通过「运行模型选择」下拉框自由切换为上述任一已授权模型，并实时重新计算算力点预估。
          </li>
          <li>
            <strong>自带模型优先权：</strong>若本空间配置了自带模型且处于启用状态，可在选择器中指定为「空间私有自有模型」，享受自有网关专属算力。
          </li>
        </ul>
      </div>
    </div>
  );
}
