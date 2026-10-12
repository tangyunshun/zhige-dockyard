"use client";

/**
 * 空间自带模型（BYO：Bring Your Own Model）—— 个人工作台视角
 *
 * 放在「个人工作台」而非空间内部：用户在此选择自己拥有/管理的空间，
 * 为其登记自有模型端点与密钥，作为该空间的默认执行模型。
 * 平台仍按用户设定的服务费向该空间成员收费；密钥以 AES-256-GCM 密文落库。
 */
import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  KeyRound,
  Link2,
  ShieldCheck,
  Cpu,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Search,
  TestTube,
  Loader2,
  XCircle,
  Check,
  RotateCcw,
  Sparkles,
  Lock,
  Power,
  ChevronRight,
  Info,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SystemAvailableModel {
  id: string;
  modelCode: string;
  name: string;
  providerCode: string;
  capabilities: string[];
  pricing: {
    inputPricePerK: number;
    outputPricePerK: number;
    pricePerCall: number;
    unitType: string;
    markupRate: number;
    isPeriodActive: boolean;
  };
  isDefault: boolean;
}

interface OwnedWorkspace {
  id: string;
  name: string;
  type?: string;
  isOwner?: boolean;
}

interface ByoView {
  id: string;
  workspaceId: string;
  label: string;
  protocol: string;
  baseUrl: string;
  hasApiKey: boolean;
  capabilities: string[];
  contextLimit: number;
  enabled: boolean;
  shareWithMembers?: boolean;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceStatus: string;
  priceReady: boolean;
}

// 与 src/lib/workspace-byo-model.ts 的 SUPPORTED_CAPABILITIES 保持一致
const BYO_CAPABILITIES = [
  "TEXT_GENERATION",
  "STRUCTURED_OUTPUT",
  "VISION",
  "LONG_CONTEXT",
  "FILE_ANALYSIS",
] as const;

const CAP_LABELS: Record<string, string> = {
  TEXT_GENERATION: "文本生成",
  STRUCTURED_OUTPUT: "结构化输出",
  VISION: "视觉理解",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文件分析",
};

const CAP_DESCRIPTIONS: Record<string, string> = {
  TEXT_GENERATION: "基础文本对话与问答创作",
  STRUCTURED_OUTPUT: "JSON 与精准结构化数据输出",
  VISION: "支持传入图片或截图进行多模态分析",
  LONG_CONTEXT: "支持超长论文与海量代码上下文",
  FILE_ANALYSIS: "支持解析 PDF、Word 等文档内容",
};

const PROTOCOL_LABELS: Record<string, string> = {
  OPENAI_COMPATIBLE: "OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / 通义千问等兼容网关）",
  ANTHROPIC: "ANTHROPIC（Anthropic Claude 官方协议）",
  GEMINI: "GEMINI（Google Gemini 官方协议）",
};

interface TemplatePreset {
  name: string;
  label: string;
  protocol: string;
  baseUrl: string;
  contextLimit: number;
  capabilities: string[];
  priceInputYuan: number;
  priceOutputYuan: number;
}

// 常见自带模型快捷模版：大厂一键预设填入，支持任意自定义扩展，绝不把规则写死
const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    name: "DeepSeek",
    label: "DeepSeek-V3",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.deepseek.com/v1",
    contextLimit: 64000,
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT"],
    priceInputYuan: 2.0,
    priceOutputYuan: 8.0,
  },
  {
    name: "通义千问",
    label: "Qwen-Plus",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    contextLimit: 131072,
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT"],
    priceInputYuan: 0.8,
    priceOutputYuan: 2.0,
  },
  {
    name: "Claude",
    label: "Claude-3-5-Sonnet",
    protocol: "ANTHROPIC",
    baseUrl: "https://api.anthropic.com",
    contextLimit: 200000,
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT"],
    priceInputYuan: 21.0,
    priceOutputYuan: 105.0,
  },
  {
    name: "OpenAI",
    label: "GPT-4o",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.openai.com/v1",
    contextLimit: 128000,
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT"],
    priceInputYuan: 18.0,
    priceOutputYuan: 72.0,
  },
  {
    name: "本地私有 (Ollama)",
    label: "本地私有模型 (Ollama)",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "http://localhost:11434/v1",
    contextLimit: 32000,
    capabilities: ["TEXT_GENERATION"],
    priceInputYuan: 0,
    priceOutputYuan: 0,
  },
];

const MICROS_PER_YUAN = 1_000_000;

function authFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
      ...(init?.headers || {}),
    },
  });
}

// 遵循知阁·舟坊设计系统输入框规范（卡片 8px、按钮/输入框 4px，柔和阴影）
const inputCls =
  "w-full h-9.5 px-3 rounded border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all shadow-2xs disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

export default function UserByoModelPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<OwnedWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [loadingList, setLoadingList] = useState(true);

  const [loadingView, setLoadingView] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<ByoView | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [form, setForm] = useState({
    label: "",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "",
    apiKey: "",
    capabilities: [] as string[],
    contextLimit: 32000,
    enabled: true,
    shareWithMembers: true,
    priceInputYuan: 0,
    priceOutputYuan: 0,
  });

  /**
   * BYOK 新语义（官方单价 + 平台服务费）的示例扣点预览：
   * 由服务端算账中心计算后下发，前端不做任何价格/点数计算。
   */
  const [byokPreview, setByokPreview] = useState<{
    points: number | null;
    yuan: number | null;
    basis: string;
    blockedReason: string | null;
    byokServiceRateBps: number | null;
  } | null>(null);

  useEffect(() => {
    if (!selectedWs) {
      setByokPreview(null);
      return;
    }
    let cancelled = false;
    authFetch(`/api/billing/byok-preview?workspaceId=${encodeURIComponent(selectedWs)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success) setByokPreview(json.data);
      })
      .catch(() => {
        if (!cancelled) setByokPreview(null);
      });
    return () => {
      cancelled = true;
    };
    // current 在加载与保存后更新，据此刷新示例扣点（提交后即可回显新语义结果）
  }, [selectedWs, current]);

  // 管理员为该空间已授权的系统模型池透视
  const [availableSysModels, setAvailableSysModels] = useState<SystemAvailableModel[]>([]);
  const [sysDefaultDeploymentId, setSysDefaultDeploymentId] = useState<string | null>(null);
  const [loadingSysModels, setLoadingSysModels] = useState(false);
  const [showSysModelsPanel, setShowSysModelsPanel] = useState(true);

  useEffect(() => {
    if (!selectedWs) {
      setAvailableSysModels([]);
      setSysDefaultDeploymentId(null);
      return;
    }
    let cancelled = false;
    setLoadingSysModels(true);
    authFetch(`/api/workspace/available-models?workspaceId=${encodeURIComponent(selectedWs)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success && json?.data) {
          setAvailableSysModels(json.data.models || []);
          setSysDefaultDeploymentId(json.data.defaultDeploymentId || null);
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSysModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSysModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWs]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    errorType?: string;
    label?: string;
    message?: string;
    troubleshooting?: string[];
    sampleReply?: string;
    suggestedCapabilities?: string[];
  } | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await authFetch("/api/user/workspaces");
      const data = await res.json().catch(() => ({}));
      const list: OwnedWorkspace[] = Array.isArray(data?.data) ? data.data : [];
      // 仅空间所有者/管理员可配置 BYO（接口同样会校验）
      const manageable = list.filter((w) => w.isOwner);
      setWorkspaces(manageable);
      // 支持「修改策略」等入口带 ?workspaceId= 直达并预选指定空间（避免在前台下拉框里重新找）
      const preset =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("workspaceId")
          : null;
      const target =
        preset && manageable.some((w) => w.id === preset)
          ? preset
          : manageable.length > 0
            ? manageable[0].id
            : "";
      // 仅在没有选中任何空间时设置初始值；已手动选择时绝不覆盖（函数式更新读取最新 prev）
      setSelectedWs((prev) => prev || target);
    } catch (e) {
      toast.error((e as Error)?.message || "加载空间列表失败");
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const loadView = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setLoadingView(true);
    setCurrent(null);
    setForm({
      label: "",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "",
      apiKey: "",
      capabilities: [],
      contextLimit: 32000,
      enabled: true,
      shareWithMembers: true,
      priceInputYuan: 0,
      priceOutputYuan: 0,
    });
    try {
      const res = await authFetch(`/api/workspace/byo-model?workspaceId=${encodeURIComponent(wsId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) toast.error("你不是该空间的所有者或管理员，无权配置自带模型");
        else toast.error(data?.error || "加载配置失败");
        return;
      }
      const view: ByoView | null = data?.data ?? null;
      setCurrent(view);
      if (view) {
        setForm({
          label: view.label,
          protocol: view.protocol,
          baseUrl: view.baseUrl,
          apiKey: "",
          capabilities: view.capabilities || [],
          contextLimit: view.contextLimit,
          enabled: view.enabled,
          shareWithMembers: (view as any).shareWithMembers !== false,
          priceInputYuan: view.priceInputMicrosPerMillion != null ? view.priceInputMicrosPerMillion / MICROS_PER_YUAN : 0,
          priceOutputYuan: view.priceOutputMicrosPerMillion != null ? view.priceOutputMicrosPerMillion / MICROS_PER_YUAN : 0,
        });
      }
    } catch (e) {
      toast.error((e as Error)?.message || "加载配置失败");
    } finally {
      setLoadingView(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedWs) loadView(selectedWs);
  }, [selectedWs, loadView]);

  const toggleCap = (cap: string) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter((c) => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

  // 一键应用模版预设（大厂开放式模版，填入后允许自由修改，绝不把规则写死）
  const applyPreset = (tpl: TemplatePreset) => {
    setForm((f) => ({
      ...f,
      label: tpl.label,
      protocol: tpl.protocol,
      baseUrl: tpl.baseUrl,
      contextLimit: tpl.contextLimit,
      capabilities: [...tpl.capabilities],
      priceInputYuan: tpl.priceInputYuan,
      priceOutputYuan: tpl.priceOutputYuan,
    }));
    toast.info(`已填入 ${tpl.name} 推荐参数，支持任意修改扩展`);
  };

  // 严格状态互锁：已启用态仅允许查看与测试，点击【禁用模型】进入维护态后方可修改参数或彻底清除
  const toggleEnabled = async () => {
    if (!selectedWs || !current) return;
    const nextEnabled = !current.enabled;
    setSaving(true);
    try {
      const res = await authFetch(`/api/workspace/byo-model?workspaceId=${encodeURIComponent(selectedWs)}`, {
        method: "PUT",
        body: JSON.stringify({
          label: form.label,
          protocol: form.protocol,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          capabilities: form.capabilities,
          contextLimit: Number(form.contextLimit) || 32000,
          enabled: nextEnabled,
          shareWithMembers: form.shareWithMembers,
          priceInputMicrosPerMillion: Math.round((Number(form.priceInputYuan) || 0) * MICROS_PER_YUAN),
          priceOutputMicrosPerMillion: Math.round((Number(form.priceOutputYuan) || 0) * MICROS_PER_YUAN),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "状态切换失败");
      }
      setCurrent(data.data);
      setForm((f) => ({ ...f, enabled: nextEnabled, apiKey: "" }));
      toast.success(nextEnabled ? "自带模型已成功启用，恢复为该空间优先执行模型" : "自带模型已禁用，已进入维护状态（空间任务自动回落平台默认）");
    } catch (e) {
      toast.error((e as Error)?.message || "状态切换失败");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!selectedWs) return;
    if (!form.label.trim()) {
      toast.error("请输入模型展示名称");
      return;
    }
    if (!form.baseUrl.trim() || !/^https?:\/\/.+/i.test(form.baseUrl.trim())) {
      toast.error("请输入有效的 Base URL 端点地址");
      return;
    }
    if (!current && !form.apiKey.trim()) {
      toast.error("首次配置自带模型请输入 API Key 密钥");
      return;
    }
    if (form.capabilities.length === 0) {
      toast.error("请至少勾选一项支持的功能特性（如文本生成）");
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/workspace/byo-model?workspaceId=${encodeURIComponent(selectedWs)}`, {
        method: "PUT",
        body: JSON.stringify({
          label: form.label.trim(),
          protocol: form.protocol,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey,
          capabilities: form.capabilities,
          contextLimit: Number(form.contextLimit) || 32000,
          enabled: current ? current.enabled : true,
          shareWithMembers: form.shareWithMembers,
          priceInputMicrosPerMillion: Math.round((Number(form.priceInputYuan) || 0) * MICROS_PER_YUAN),
          priceOutputMicrosPerMillion: Math.round((Number(form.priceOutputYuan) || 0) * MICROS_PER_YUAN),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "保存失败");
      }
      setCurrent(data.data);
      setForm((f) => ({ ...f, apiKey: "" }));
      toast.success("空间自带模型配置已成功保存");
    } catch (e) {
      toast.error((e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  /** 测试通道：用当前表单填写的临时参数真实发一次最小调用，不强制先保存（结果以横幅展示，不弹 toast） */
  const testConnection = async () => {
    if (!selectedWs || !form.baseUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`/api/workspace/byo-model/test?workspaceId=${encodeURIComponent(selectedWs)}`, {
        method: "POST",
        body: JSON.stringify({
          label: form.label,
          protocol: form.protocol,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          capabilities: form.capabilities,
          contextLimit: Number(form.contextLimit) || 32000,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const suggested: string[] = Array.isArray(data.suggestedCapabilities) ? data.suggestedCapabilities : [];
      setTestResult({
        ok: data.success,
        latencyMs: data.latencyMs ?? 0,
        errorType: data.errorType,
        message: data.message || (data.success ? "连通正常" : "连通失败"),
        troubleshooting: data.troubleshooting,
        sampleReply: data.sampleReply,
        suggestedCapabilities: suggested,
      });
      // 测试成功后：把「建议登记的能力」回填到登记表单（与用户已勾选项取并集，用户仍可手动增删）
      if (data.success && suggested.length > 0) {
        setForm((f) => ({ ...f, capabilities: Array.from(new Set([...f.capabilities, ...suggested])) }));
        toast.info(`已根据连通实测回填建议能力：${suggested.join("、")}（可手动调整）`);
      }
    } catch {
      // 静默：结果以横幅展示，不弹 toast
    } finally {
      setTesting(false);
    }
  };

  const remove = () => {
    if (!selectedWs) return;
    setConfirmDialog({
      isOpen: true,
      title: "清除空间自带模型",
      message: `确认清除「${selectedName || "当前空间"}」的自带模型配置？`,
      warnings: ["清除后，该空间内的组件执行将自动回落到空间专属或全站平台默认模型。"],
      onConfirm: async () => {
        setSaving(true);
        try {
          const res = await authFetch(`/api/workspace/byo-model?workspaceId=${encodeURIComponent(selectedWs)}`, {
            method: "DELETE",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) throw new Error(data?.error || "清除失败");
          setCurrent(null);
          toast.success("已清除空间自带模型");
        } catch (e) {
          toast.error((e as Error)?.message || "清除失败");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const selectedName = workspaces.find((w) => w.id === selectedWs)?.name || "";

  // 测试通道按钮置灰判定：端点地址未填，或首次配置且密钥未填时不可点
  const testReady = form.baseUrl.trim() !== "" && (current !== null || form.apiKey.trim() !== "");

  return (
    <div className="space-y-6 font-sans">
      {/* 页面标题及导航引导（与全站用户工作台页面规格严格一致） */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1 flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
              <KeyRound className="w-5 h-5" />
            </span>
            <span>空间自带模型（BYO）</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            为你拥有的空间登记自有模型端点与专属密钥，作为该空间默认执行模型；平台按你设定的服务费向空间成员计费
          </p>
        </div>
      </div>

      {/* 空间选择卡片（遵循设计系统 8px 圆角与大厂 Bento 风格） */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#3182ce]" />
            <span>选择目标空间（仅展示你作为所有者的空间资产）</span>
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            共 {workspaces.length} 个可管空间
          </span>
        </div>
        {loadingList ? (
          <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
            <span>正在加载你的工作空间列表…</span>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>你暂无可配置的空间（需为空间所有者/创建者，空间开通请前往工作空间页面）</span>
          </div>
        ) : (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              className={inputCls + " pl-9 font-medium cursor-pointer"}
              value={selectedWs}
              onChange={(e) => setSelectedWs(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}（{w.type === "ENTERPRISE" ? "企业空间" : "个人空间"} · {w.id}）
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 管理员已授权平台可用模型透视面板（解惑：让用户清楚看清当前空间有什么官方模型可用） */}
      {selectedWs && (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-bold">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                  <span>当前空间管理员授权模型池</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {loadingSysModels ? "加载中..." : `${availableSysModels.length} 款官方部署可用`}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  由系统管理员在后台分配给「{selectedName || "本空间"}」的官方大模型白名单
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 无可用系统模型时不显示「进入组件工坊运行」入口 */}
              {!loadingSysModels && availableSysModels.length > 0 && (
                <a
                  href={`/studio?workspaceId=${encodeURIComponent(selectedWs)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-7 px-2.5 rounded bg-blue-50 hover:bg-blue-100 text-[#3182ce] text-[11px] font-bold flex items-center gap-1 border border-blue-100 transition-all cursor-pointer"
                >
                  <Zap className="w-3 h-3" />
                  <span>进入组件工坊运行</span>
                  <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowSysModelsPanel((prev) => !prev)}
                className="h-7 px-2 rounded border border-slate-200 text-slate-500 hover:text-slate-800 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                <span>{showSysModelsPanel ? "收起" : "展开"}</span>
                {showSysModelsPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {showSysModelsPanel && (
            <div className="space-y-3">
              {loadingSysModels ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <div className="w-4 h-4 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
                  <span>正在查询该空间的系统模型授权清单…</span>
                </div>
              ) : availableSysModels.length === 0 ? (
                <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200/60 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>管理员暂未为该工作空间分配可用模型（0 款官方部署可用）。</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableSysModels.map((m) => {
                    const isDef = m.id === sysDefaultDeploymentId;
                    const modelName = (m as any).displayName || m.name || (m as any).modelId || "未命名模型";
                    const modelCode = (m as any).upstreamModel || m.modelCode || (m as any).modelId || "";
                    const providerName = (m as any).providerName || m.providerCode || "官方供应商";
                    const pricingAny = m.pricing as any;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border p-3.5 transition-all text-xs space-y-2.5 shadow-2xs ${
                          isDef ? "bg-blue-50/20 border-[#3182ce] ring-1 ring-[#3182ce]/15" : "bg-slate-50/50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 truncate">{modelName}</span>
                              {isDef && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-[#2b6cb0] border border-blue-200 shrink-0">
                                  空间默认
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{modelCode}</div>
                          </div>
                          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shrink-0">
                            {providerName}
                          </span>
                        </div>

                        {/* 能力标签 */}
                        <div className="flex flex-wrap gap-1">
                          {(m.capabilities || []).map((c) => (
                            <span
                              key={c}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                            >
                              {CAP_LABELS[c] || c}
                            </span>
                          ))}
                        </div>

                        {/* 计费标准：微元折算元/百万 Token，绝无 undefined */}
                        <div className="pt-2 border-t border-slate-200/60 space-y-1 text-[11px] font-mono">
                          <div className="flex items-center justify-between text-slate-500">
                            <span>输入/输出:</span>
                            <span className="font-bold text-slate-800">
                              {pricingAny?.priceInputMicrosPerMillion != null
                                ? `¥${(pricingAny.priceInputMicrosPerMillion / 1000000).toFixed(2)} / ¥${(Number(pricingAny.priceOutputMicrosPerMillion || 0) / 1000000).toFixed(2)}`
                                : m.pricing?.inputPricePerK != null
                                ? `${m.pricing.inputPricePerK} / ${m.pricing.outputPricePerK} 点`
                                : "--"}
                            </span>
                          </div>
                          {pricingAny?.priceCacheReadMicrosPerMillion != null && (
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>缓存读取:</span>
                              <span className="font-bold text-slate-700">
                                ¥{(pricingAny.priceCacheReadMicrosPerMillion / 1000000).toFixed(2)} /百万
                              </span>
                            </div>
                          )}
                          {pricingAny?.priceCacheWriteMicrosPerMillion != null && (
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>缓存写入:</span>
                              <span className="font-bold text-slate-700">
                                ¥{(pricingAny.priceCacheWriteMicrosPerMillion / 1000000).toFixed(2)} /百万
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-sans pt-0.5">
                            <span>生效时段:</span>
                            <span className={`font-bold ${pricingAny?.isPeriodActive ? "text-amber-600" : "text-emerald-600"}`}>
                              {pricingAny?.activePeriodName || "日常主流定价"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 联动规则提示 */}
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-2.5 border border-slate-200/60 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                <span>
                  <strong>模型调度机制说明：</strong>未启用自带模型时，空间内所有自动化任务默认由上方标有「空间默认」的系统模型执行；若在此配置并启用了自带模型，在组件工坊执行任务时，可自由在「自带私有模型」与「上述管理员授权系统模型」间按需切换选择！
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedWs && !loadingList && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-white border border-slate-200/80 rounded-lg p-8 shadow-2xs">
          <Building2 className="w-4 h-4 text-[#3182ce]" />
          <span>请先在上方的空间下拉框中选择要配置的目标空间；自带模型按空间粒度精准生效与隔离。</span>
        </div>
      )}

      {selectedWs && loadingView && (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载空间自带模型配置…</span>
        </div>
      )}

      {selectedWs && !loadingView && (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-6 space-y-6">
          {/* 状态栏 Header 与严格生命周期标识 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2 flex-wrap">
                <span>{selectedName}</span>
                <span className="text-slate-300">·</span>
                {current ? (
                  current.enabled ? (
                    <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>已启用 · 优先服务中</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>已禁用 · 停用维护中</span>
                    </span>
                  )
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    尚未配置自带模型
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                {current ? (
                  current.enabled ? (
                    <span className="text-emerald-600 font-medium">
                      当前已作为「{selectedName}」空间内各组件优先调用的执行模型
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium">
                      当前处于停用维护状态，该空间任务已自动回落至平台默认模型
                    </span>
                  )
                ) : (
                  <span>保存后将作为该空间组件优先调用的执行模型</span>
                )}
              </div>
            </div>

            {/* 顶栏快速操作（禁用状态下允许删除，启用状态下保护禁止删除） */}
            {current && !current.enabled && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-xs font-bold transition-all flex items-center gap-1.5 border border-rose-200/80 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 self-start sm:self-auto"
                title="清除该空间的自带模型配置并恢复默认"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清除配置</span>
              </button>
            )}
          </div>

          {/* 状态互锁安全横幅提示 */}
          {current?.enabled ? (
            <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-blue-900 leading-relaxed">
              <Lock className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-black">运行安全互锁保护：</span>
                <p className="text-slate-600">
                  当前自带模型正在对外服务中。为保障空间成员调用任务与计费对账的稳定性，运行期间已锁定参数修改。如需修改端点地址、更换 API 密钥或调整单价，请点击下方<b>【禁用模型】</b>进入维护状态后再进行修改。
                </p>
              </div>
            </div>
          ) : current && !current.enabled ? (
            <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-black">维护状态提示：</span>
                <p className="text-amber-800">
                  当前自带模型已停用，空间任务已自动回落至平台默认模型。您可以自由调整下方配置并测试通道连通性，确认无误后点击下方<b>【启用模型】</b>即可重新恢复对外服务。
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
              <Sparkles className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-black">快捷接入指引：</span>
                <p className="text-slate-500">
                  尚未为「{selectedName}」配置自带模型。平台采用开放架构，支持国内外任何主流或自托管私有大模型，您可以点击下方推荐模版一键填入，或手动录入私有端点。
                </p>
              </div>
            </div>
          )}

          {/* 快捷推荐模版条：仅在未配置或处于禁用维护态时开放快速填入 */}
          {(!current || !current.enabled) && (
            <div className="p-3 bg-gradient-to-r from-blue-50/40 via-purple-50/20 to-transparent border border-blue-100 rounded-lg space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>快捷填入模版：</span>
                </span>
                {TEMPLATE_PRESETS.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => applyPreset(tpl)}
                    className="px-2.5 py-1 rounded text-xs font-bold bg-white text-slate-700 hover:text-[#3182ce] hover:bg-blue-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer active:scale-95"
                    title={`点击填入 ${tpl.name} 推荐参数`}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
              <span className="block text-[11px] text-slate-400">
                点击模版可一键填充官方端点、协议、上下文上限与单价参考；填入后可自由修改任何字段。
              </span>
            </div>
          )}

          {/* 表单分区 1：基础协议与网络端点 */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>基础协议与端点配置</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">模型展示名称 <span className="text-red-500 font-bold ml-0.5">*</span></span>
                <input
                  disabled={current?.enabled}
                  className={inputCls}
                  placeholder="如：DeepSeek-V3、我的专属通义千问"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
                <span className="block text-[11px] text-slate-400">在工作台模型选择器中展示给空间成员的直观名称</span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">接入接口协议 <span className="text-red-500 font-bold ml-0.5">*</span></span>
                <select
                  disabled={current?.enabled}
                  className={inputCls + " font-medium cursor-pointer"}
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                >
                  {Object.entries(PROTOCOL_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                <span className="block text-[11px] text-slate-400">绝大多数国内大模型及本地 Ollama/vLLM 均选择 OpenAI 兼容协议</span>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Base URL 端点地址（必须为 http/https 地址）<span className="text-red-500 font-bold ml-0.5">*</span></span>
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  disabled={current?.enabled}
                  className={inputCls + " pl-9"}
                  placeholder="https://api.deepseek.com/v1 或 http://localhost:11434/v1"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>
              <span className="block text-[11px] text-slate-400">
                平台会自动在请求中拼接 <code>/chat/completions</code>；支持私有云、自托管或公网代理网关
              </span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">
                API Key 密钥 {current ? "（已在服务端加密保存，留空则保持沿用现有密钥）" : <span className="text-red-500 font-bold ml-0.5">*</span>}
              </span>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  disabled={current?.enabled}
                  type="password"
                  autoComplete="new-password"
                  className={inputCls + " pl-9 font-mono"}
                  placeholder={current ? "留空 = 不修改现有密钥" : "sk-... 明文录入后由服务端以 AES-256-GCM 密文存储，不入明文库"}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>
              <span className="block text-[11px] text-slate-400">
                安全保障：明文密钥绝不下发浏览器；仅在任务执行时在服务端内存中安全解密并注入请求头
              </span>
            </label>
          </div>

          {/* 表单分区 2：模型能力与计费规则 */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>功能特性与官方单价登记</span>
            </h3>

            {/* 模型能力选择网格：卡片式大白话设计 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  支持的功能特性 (模型能力标签) <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                {!current?.enabled && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, capabilities: [...BYO_CAPABILITIES] }))}
                      className="text-[11px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                    >
                      全选
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, capabilities: [] }))}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                    >
                      清空
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {BYO_CAPABILITIES.map((cap) => {
                  const on = form.capabilities.includes(cap);
                  return (
                    <button
                      key={cap}
                      disabled={current?.enabled}
                      type="button"
                      onClick={() => toggleCap(cap)}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                        current?.enabled ? "cursor-not-allowed opacity-90" : "cursor-pointer active:scale-95"
                      } ${
                        on
                          ? "bg-blue-50/80 text-[#2b6cb0] border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]/20"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 mt-0.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                          on ? "bg-[#3182ce] border-[#3182ce] text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {on && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-black leading-tight">{CAP_LABELS[cap]}</div>
                        <div className="text-[11px] text-slate-500 font-normal leading-normal">
                          {CAP_DESCRIPTIONS[cap]}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 上下文上限与官方单价 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">上下文窗口上限 (Token) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                <input
                  disabled={current?.enabled}
                  type="number"
                  className={inputCls}
                  value={form.contextLimit}
                  onChange={(e) => setForm({ ...form, contextLimit: Number(e.target.value) })}
                />
                {/* 常用规格快捷胶囊 */}
                {!current?.enabled && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-400">常用规格：</span>
                    {[
                      { label: "32K", val: 32000 },
                      { label: "64K", val: 64000 },
                      { label: "128K", val: 128000 },
                      { label: "200K", val: 200000 },
                      { label: "1M", val: 1000000 },
                    ].map((spec) => (
                      <button
                        key={spec.label}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, contextLimit: spec.val }))}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                          form.contextLimit === spec.val
                            ? "bg-[#3182ce] text-white border-[#3182ce]"
                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-[#3182ce]"
                        }`}
                      >
                        {spec.label}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">
                  官方单价 · 输入（元 / 百万 Token）<span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  disabled={current?.enabled}
                  type="number"
                  step="0.0001"
                  className={inputCls}
                  value={form.priceInputYuan}
                  onChange={(e) => setForm({ ...form, priceInputYuan: Number(e.target.value) })}
                />
                <span className="block text-[11px] text-slate-400">按厂商公开输入单价填写</span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-700">
                  官方单价 · 输出（元 / 百万 Token）<span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  disabled={current?.enabled}
                  type="number"
                  step="0.0001"
                  className={inputCls}
                  value={form.priceOutputYuan}
                  onChange={(e) => setForm({ ...form, priceOutputYuan: Number(e.target.value) })}
                />
                <span className="block text-[11px] text-slate-400">按厂商公开输出单价填写</span>
              </label>
            </div>

            <span className="block text-[11px] text-slate-500 leading-relaxed">
              💡 <b>计费说明</b>：自带模型由用户自行承担上游厂商账单，平台不赚取差价，仅收取基础算力服务费；实际扣点 = 官方单价换算的算力点 ×（1 + 平台服务费率，默认 15%）。请按厂商真实单价登记以确保空间成员账单精准可追溯。
            </span>

            {byokPreview && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-[11px] text-slate-600 space-y-1">
                {byokPreview.basis === "BLOCKED_PRICE_UNREGISTERED" ? (
                  <span className="text-amber-700 font-semibold">{byokPreview.blockedReason}</span>
                ) : (
                  <>
                    <div className="font-medium">
                      标准调用测算示例（输入 1 万 Token + 输出 1 万 Token）：预计划扣{" "}
                      <strong className="font-mono text-slate-900 font-black">{byokPreview.points ?? "—"}</strong> 算力点
                      {byokPreview.yuan !== null ? (
                        <>
                          {" "}（折合约 <strong className="font-mono text-slate-900 font-bold">¥{byokPreview.yuan}</strong>）
                        </>
                      ) : null}
                    </div>
                    <span className="block text-[10px] text-slate-400">
                      含平台服务费 {((byokPreview.byokServiceRateBps ?? 0) / 100).toFixed(2)}%；1 算力点 = 0.01 元。
                    </span>
                  </>
                )}
              </div>
            )}

            {/* 成员共享权限开关（MODEL-SELECT-E1） */}
            <div className="pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  disabled={current?.enabled}
                  checked={form.shareWithMembers}
                  onChange={(e) => setForm({ ...form, shareWithMembers: e.target.checked })}
                  className="w-4 h-4 mt-0.5 rounded text-[#3182ce] focus:ring-[#3182ce] cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>允许空间所有成员共享调用此自带模型</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-[#3182ce] border border-blue-200 font-bold">默认开启</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    开启时，该空间内所有成员在组件工坊或工作台均可选择该模型执行任务；关闭后仅空间所有者本人可见与可用（其他成员执行任务时自动回落到空间/平台默认系统模型）。
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 底部操作按钮栏：严格状态互锁与权限隔离 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>端点网络安全隔离校验 + 执行能力门禁保护</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* 1. 测试通道（无论启停均可进行健康探针测试） */}
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || saving || !testReady}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#2b6cb0] border border-[#3182ce]/30 rounded text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title="用当前端点与密钥真实发起一次最小请求，测试连通性"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                <span>{testing ? "测试中…" : "测试通道"}</span>
              </button>

              {/* 2. 状态切换按钮（启用 / 禁用） */}
              {current && (
                <button
                  type="button"
                  onClick={toggleEnabled}
                  disabled={saving || testing}
                  className={`px-3.5 py-2 rounded text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    current.enabled
                      ? "bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-700 border border-amber-200"
                      : "bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 border border-emerald-200"
                  }`}
                  title={current.enabled ? "停用该自带模型，进入维护模式" : "启用该自带模型，恢复优先调度"}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{current.enabled ? "禁用模型" : "启用模型"}</span>
                </button>
              )}

              {/* 3. 保存配置按钮（仅在【未配置】或【已禁用维护态】下开放保存，启用在线服务时严禁篡改） */}
              {(!current || !current.enabled) && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || testing}
                  className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? "保存中…" : current ? "保存修改" : "保存模型配置"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 测试通道结果展示 */}
          {testResult && (
            <div
              className={
                "rounded-lg border p-4 space-y-2 " +
                (testResult.ok
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-rose-50 border-rose-200")
              }
            >
              <div className="flex items-center gap-2">
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className={"text-xs font-black " + (testResult.ok ? "text-emerald-700" : "text-rose-700")}>
                  {testResult.ok
                    ? `测试通道连通成功（耗时 ${testResult.latencyMs}ms）`
                    : `测试通道连通失败${testResult.label ? `（${testResult.label}）` : testResult.errorType ? `（${testResult.errorType}）` : ""}`}
                </span>
                {!testResult.ok && testResult.latencyMs != null && (
                  <span className="text-[11px] text-rose-400 font-mono">耗时 {testResult.latencyMs}ms</span>
                )}
              </div>
              {testResult.ok && testResult.sampleReply && (
                <div className="text-[11px] text-slate-500 font-mono bg-white/70 rounded border border-emerald-100 px-2 py-1.5 break-words">
                  模型回执：{testResult.sampleReply}
                </div>
              )}
              {!testResult.ok && testResult.message && (
                <div className="text-[11px] text-rose-600 font-medium break-words">
                  <span className="font-black">错误详情：</span>
                  {testResult.message}
                </div>
              )}
              {!testResult.ok && testResult.troubleshooting?.length ? (
                <div className="text-[11px] text-rose-600/90">
                  <div className="font-black mb-1">如何修复：</div>
                  <ul className="list-disc pl-4 space-y-1">
                    {testResult.troubleshooting.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {selectedWs && !loadingView && !current && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-white border border-slate-200/80 rounded-lg p-4 shadow-2xs">
          <Cpu className="w-4 h-4 text-[#3182ce]" />
          <span>未配置自带模型时，该空间组件默认调度平台预置模型；配置保存并启用后将优先调度你的专属模型。</span>
        </div>
      )}

      {/* 彻底替换原生 confirm 的系统统一 ConfirmDialog 模态弹窗 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        warnings={confirmDialog.warnings}
        confirmText="确认清除"
        type="danger"
        onConfirm={async () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          await confirmDialog.onConfirm();
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
