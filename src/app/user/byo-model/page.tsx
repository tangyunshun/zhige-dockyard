"use client";

/**
 * 工作台「我的模型」—— 个人模型管理（系统分配 + 自建 BYO 双区）
 *
 * 一处维护、多处引用：
 *  - 顶部「系统已分配模型」只读总览：管理员为各空间统一分配的模型（来自 /api/workspace/available-models），
 *    按空间分组展示，点击可前往对应空间模型页；
 *  - 「我的自建模型（BYO）」：集中登记自有模型端点与密钥（定义 user_byo_model_def），
 *    通过勾选把同一个定义绑定到多个你拥有的工作空间，materialize 为各空间生效 BYO 行。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MODEL_CAPABILITY_LABELS } from "@/lib/model-capability-labels";
import ModelPricingRules, { type PricingPeriodLike } from "@/components/ModelPricingRules";
import {
  KeyRound,
  Link2,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  Building2,
  TestTube,
  Loader2,
  XCircle,
  Check,
  Sparkles,
  Info,
  Plus,
  Users,
  User,
  ArrowRight,
  Server,
  ChevronDown,
  Search,
  RefreshCw,
  Cpu,
  Eye,
  EyeOff,
} from "lucide-react";

interface OwnedWorkspace {
  id: string;
  name: string;
  type?: string;
}

interface ByoAssignment {
  workspaceId: string;
  enabled: boolean;
  shareWithMembers: boolean;
}

/** 空间系统已分配模型（只读展示，来自 /api/workspace/available-models） */
interface SystemModel {
  id: string;
  displayName: string;
  providerName: string;
  isSpaceDefault?: boolean;
  capabilities?: string[];
  /** 有效用户售价（与模型定价页口径一致） */
  pricing?: {
    priceInputMicrosPerMillion: number | null;
    priceOutputMicrosPerMillion: number | null;
    priceCacheReadMicrosPerMillion?: number | null;
    priceCacheWriteMicrosPerMillion?: number | null;
  };
  /** 全部已启用计价时段（闲时/高峰/节假日），供 ModelPricingRules 统一呈现 */
  pricingPeriods?: PricingPeriodLike[];
}

interface ByoDefView {
  id: string;
  label: string;
  providerName: string;
  protocol: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  capabilities: string[];
  contextLimit: number;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceStatus: string;
  createdAt: string;
  updatedAt: string;
  assignments: ByoAssignment[];
}

// 与 src/lib/workspace-byo-model.ts / user-byo-model.ts 的 SUPPORTED_CAPABILITIES 保持一致
const BYO_CAPABILITIES = [
  "TEXT_GENERATION",
  "STRUCTURED_OUTPUT",
  "VISION",
  "LONG_CONTEXT",
  "FILE_ANALYSIS",
] as const;

// 能力展示名全站唯一真源（数据库 systemsetting.model_capability_labels 为准，此处为内置兜底）
const CAP_LABELS: Record<string, string> = MODEL_CAPABILITY_LABELS;

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

const inputCls =
  "w-full h-9.5 px-3 rounded border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all shadow-2xs disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";

export default function UserByoModelPage() {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [defs, setDefs] = useState<ByoDefView[]>([]);
  const [workspaces, setWorkspaces] = useState<OwnedWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null); // null=新增；否则编辑该 def
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    label: "",
    providerName: "",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "",
    apiKey: "",
    capabilities: [] as string[],
    contextLimit: 32000,
    priceInputYuan: 0,
    priceOutputYuan: 0,
  });

  // 分配空间面板
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedWs, setSelectedWs] = useState<Record<string, boolean>>({});
  const [assignEnabled, setAssignEnabled] = useState(true);
  const [assignShare, setAssignShare] = useState(true);
  const [savingAssign, setSavingAssign] = useState(false);

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

  // 「可绑定空间」下拉列表展开状态（空间多时不再平铺名称）
  const [wsListOpen, setWsListOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    onConfirm: () => void | Promise<void>;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  // 从模型页 ?workspaceId= 进入时，自动预选该空间到分配面板
  const [prefillWorkspaceId, setPrefillWorkspaceId] = useState<string | null>(null);
  const [prefillName, setPrefillName] = useState<string>("");
  // 各空间「系统已分配模型」只读视图（按 workspaceId 索引）
  const [systemModelsByWs, setSystemModelsByWs] = useState<Record<string, SystemModel[]>>({});

  // 视图筛选：全部 | 仅自建模型 | 仅系统模型
  const [activeTab, setActiveTab] = useState<"all" | "byo" | "system">("all");
  // 快速搜索关键字
  const [searchQuery, setSearchQuery] = useState("");
  // 表单明密文查看
  const [showApiKey, setShowApiKey] = useState(false);
  // 系统模型空间卡片折叠状态
  const [collapsedWs, setCollapsedWs] = useState<Record<string, boolean>>({});

  const toggleWsCollapse = (id: string) => {
    setCollapsedWs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/user/byo-models");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "加载模型库失败");
        return;
      }
      const wsList: OwnedWorkspace[] = data?.data?.workspaces || [];
      setDefs(data?.data?.defs || []);
      setWorkspaces(wsList);

      // 并行拉取每个自有空间的「系统已分配模型」（只读，便于绑定 BYO 时看清现有分配）
      await Promise.allSettled(
        wsList.map(async (w) => {
          try {
            const r = await authFetch(`/api/workspace/available-models?workspaceId=${encodeURIComponent(w.id)}`);
            const d = await r.json().catch(() => ({}));
            const list: SystemModel[] = Array.isArray(d?.data?.systemModels) ? d.data.systemModels : [];
            setSystemModelsByWs((prev) => ({ ...prev, [w.id]: list }));
          } catch {
            setSystemModelsByWs((prev) => ({ ...prev, [w.id]: [] }));
          }
        }),
      );
    } catch (e) {
      toast.error((e as Error)?.message || "加载模型库失败");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // 轻量刷新：仅重新拉取模型库定义与绑定关系（用于在空间页完成“设为默认/绑定”后，切回本页即时同步）
  const refreshDefs = useCallback(async () => {
    try {
      const res = await authFetch("/api/user/byo-models");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setDefs(data?.data?.defs || []);
        setWorkspaces(data?.data?.workspaces || []);
      }
    } catch {
      /* 忽略，下次加载会重试 */
    }
  }, []);

  // 切换标签页/窗口重新聚焦时自动刷新，保证与空间页的绑定状态同步
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshDefs();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshDefs]);

  // 进入时读取 ?workspaceId=（来自模型页「去配置 BYO 模型」入口）
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const w = params.get("workspaceId");
    if (w) setPrefillWorkspaceId(w);
  }, []);

  // 解析预选空间名称（用于提示横幅）
  useEffect(() => {
    if (!prefillWorkspaceId) {
      setPrefillName("");
      return;
    }
    const ws = workspaces.find((w) => w.id === prefillWorkspaceId);
    setPrefillName(ws ? ws.name : "");
  }, [workspaces, prefillWorkspaceId]);

  // 自动预选：空间在本人的可绑定列表中、且有定义时，打开首个定义的分配面板并预选该空间
  useEffect(() => {
    if (loading || !prefillWorkspaceId) return;
    const ws = workspaces.find((w) => w.id === prefillWorkspaceId);
    if (!ws) return; // 不是本人拥有的空间 → 不预选，由横幅提示
    if (assigningId) return;
    if (defs.length > 0) {
      openAssign(defs[0], [prefillWorkspaceId]);
      setPrefillWorkspaceId(null); // 消费后清除，避免重复触发
    }
  }, [loading, prefillWorkspaceId, workspaces, defs, assigningId]);

  const toggleCap = (cap: string) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter((c) => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

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

  const openCreate = () => {
    setEditingId(null);
    setForm({
      label: "",
      providerName: "",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "",
      apiKey: "",
      capabilities: [],
      contextLimit: 32000,
      priceInputYuan: 0,
      priceOutputYuan: 0,
    });
    setTestResult(null);
    setShowApiKey(false);
    setShowForm(true);

    // 自动平滑滚动定位到表单区域
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const openEdit = (def: ByoDefView) => {
    setEditingId(def.id);
    setForm({
      label: def.label,
      providerName: def.providerName || "",
      protocol: def.protocol,
      baseUrl: def.baseUrl,
      apiKey: "",
      capabilities: def.capabilities || [],
      contextLimit: def.contextLimit,
      priceInputYuan: def.priceInputMicrosPerMillion != null ? def.priceInputMicrosPerMillion / MICROS_PER_YUAN : 0,
      priceOutputYuan: def.priceOutputMicrosPerMillion != null ? def.priceOutputMicrosPerMillion / MICROS_PER_YUAN : 0,
    });
    setTestResult(null);
    setShowApiKey(false);
    setShowForm(true);

    // 自动平滑滚动定位到编辑区域，确保用户清晰感知正在编辑
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const saveDef = async () => {
    if (!form.label.trim()) return toast.error("请输入模型展示名称");
    if (!form.baseUrl.trim() || !/^https?:\/\/.+/i.test(form.baseUrl.trim())) return toast.error("请输入有效的 Base URL 端点地址");
    if (editingId === null && !form.apiKey.trim()) return toast.error("新增模型库定义请输入 API Key 密钥");
    if (form.capabilities.length === 0) return toast.error("请至少勾选一项支持的功能特性（如文本生成）");

    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        providerName: form.providerName.trim(),
        protocol: form.protocol,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey,
        capabilities: form.capabilities,
        contextLimit: Number(form.contextLimit) || 32000,
        priceInputMicrosPerMillion: Math.round((Number(form.priceInputYuan) || 0) * MICROS_PER_YUAN),
        priceOutputMicrosPerMillion: Math.round((Number(form.priceOutputYuan) || 0) * MICROS_PER_YUAN),
      };
      const res = editingId
        ? await authFetch(`/api/user/byo-models/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await authFetch(`/api/user/byo-models`, { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "保存失败");
      setDefs(data.data.defs || []);
      setShowForm(false);
      setForm((f) => ({ ...f, apiKey: "" }));
      toast.success(editingId ? "模型库定义已更新" : "已新增模型库定义");
    } catch (e) {
      toast.error((e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeDef = (def: ByoDefView) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除模型库定义",
      message: `确认删除「${def.label}」？其绑定的所有空间将自动解除该自带模型并回落到空间/平台默认模型。`,
      warnings: ["删除后该定义不可恢复；已绑定空间的生效行会一并清除。"],
      onConfirm: async () => {
        try {
          const res = await authFetch(`/api/user/byo-models/${def.id}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) throw new Error(data?.error || "删除失败");
          setDefs(data.data.defs || []);
          toast.success("已删除模型库定义");
        } catch (e) {
          toast.error((e as Error)?.message || "删除失败");
        }
      },
    });
  };

  const openAssign = (def: ByoDefView, preselectIds?: string[]) => {
    const sel: Record<string, boolean> = {};
    def.assignments.forEach((a) => (sel[a.workspaceId] = true));
    (preselectIds || []).forEach((id) => {
      if (workspaces.some((w) => w.id === id)) sel[id] = true;
    });
    setSelectedWs(sel);
    setAssignEnabled(def.assignments.length === 0 ? true : def.assignments.every((a) => a.enabled));
    setAssignShare(def.assignments.length === 0 ? true : def.assignments.every((a) => a.shareWithMembers));
    setAssigningId(def.id);

    // 平滑滚动准确定位到绑定空间面板
    setTimeout(() => {
      const panel = document.getElementById(`assign-panel-${def.id}`);
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  };

  const saveAssignments = async () => {
    if (!assigningId) return;
    const assignments = Object.keys(selectedWs)
      .filter((wsId) => selectedWs[wsId])
      .map((wsId) => ({ workspaceId: wsId, enabled: assignEnabled, shareWithMembers: assignShare }));
    setSavingAssign(true);
    try {
      const res = await authFetch(`/api/user/byo-models/${assigningId}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "保存绑定失败");
      setDefs(data.data.defs || []);
      setAssigningId(null);
      toast.success(assignments.length > 0 ? `已绑定到 ${assignments.length} 个空间` : "已解除全部绑定");
    } catch (e) {
      toast.error((e as Error)?.message || "保存绑定失败");
    } finally {
      setSavingAssign(false);
    }
  };

  const testConnection = async () => {
    if (!form.baseUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`/api/user/byo-models/test`, {
        method: "POST",
        body: JSON.stringify({
          label: form.label,
          protocol: form.protocol,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
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
      if (data.success && suggested.length > 0) {
        setForm((f) => ({ ...f, capabilities: Array.from(new Set([...f.capabilities, ...suggested])) }));
        toast.info(`已根据连通实测回填建议能力：${suggested.join("、")}（可手动调整）`);
      }
    } catch {
      // 静默：结果以横幅展示
    } finally {
      setTesting(false);
    }
  };

  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name || id;
  const testReady = form.baseUrl.trim() !== "" && (editingId !== null || form.apiKey.trim() !== "");
  /** 正在编辑的定义（用于展示脱敏密钥） */
  const editingDef = editingId ? defs.find((d) => d.id === editingId) : undefined;

  // 派生统计数据
  const totalActiveAssignments = defs.reduce(
    (acc, d) => acc + d.assignments.filter((a) => a.enabled).length,
    0,
  );
  // 系统已分配模型：按部署 id 去重统计独立模型总数（systemModels 来自平台部署，不含 BYO，id 跨空间唯一）
  const uniqueSystemModelIds = new Set<string>();
  Object.values(systemModelsByWs).forEach((list) => {
    (list || []).forEach((m) => {
      if (m.id) uniqueSystemModelIds.add(m.id);
    });
  });
  const totalSystemModelsCount = uniqueSystemModelIds.size;

  // 过滤后的自建模型列表
  const filteredDefs = defs.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.label.toLowerCase().includes(q) ||
      (d.providerName && d.providerName.toLowerCase().includes(q)) ||
      d.baseUrl.toLowerCase().includes(q) ||
      d.protocol.toLowerCase().includes(q)
    );
  });

  // 过滤后的空间列表（用于系统模型展示）
  const filteredWorkspaces = workspaces.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesWs = w.name.toLowerCase().includes(q);
    const matchesModels = (systemModelsByWs[w.id] || []).some(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q),
    );
    return matchesWs || matchesModels;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* 页面主标题与操作顶栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white border border-blue-100/80 shadow-2xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white border border-blue-200/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs shrink-0 ring-4 ring-blue-50/60">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                我的模型
              </h1>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-100/70 text-[#2b6cb0] border border-blue-200/60">
                自建模型 & 空间模型
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              管理自建私有模型与管理员分配的系统模型，配置端点和密钥后可绑定至名下工作空间使用。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="刷新模型与空间状态"
            className="h-9 px-3 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-bold border border-slate-200 transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
            <span className="hidden sm:inline">刷新</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="h-9 px-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#23568c] text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>配置新模型</span>
          </button>
        </div>
      </div>

      {/* 4联 Bento 核心数据统计看板 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => setActiveTab("byo")}
          className={`group p-4 rounded-xl border transition-all cursor-pointer select-none ${
            activeTab === "byo"
              ? "bg-blue-50/60 border-blue-300 ring-2 ring-blue-400/20 shadow-2xs"
              : "bg-white border-slate-200/80 hover:border-blue-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">自建私有模型</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center transition-transform group-hover:scale-105">
              <Cpu className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{defs.length}</span>
            <span className="text-[10px] text-slate-400">个已配置</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#2b6cb0]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>密钥单独保存</span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab("byo")}
          className="group p-4 rounded-xl border bg-white border-slate-200/80 hover:border-emerald-200 hover:shadow-2xs transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">模型生效空间</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center transition-transform group-hover:scale-105">
              <Link2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{totalActiveAssignments}</span>
            <span className="text-[10px] text-slate-400">个空间</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>已绑定并启用</span>
          </div>
        </div>

        <div
          onClick={() => setWsListOpen(true)}
          className="group p-4 rounded-xl border bg-white border-slate-200/80 hover:border-purple-200 hover:shadow-2xs transition-all cursor-pointer select-none"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">名下全部空间</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center transition-transform group-hover:scale-105">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{workspaces.length}</span>
            <span className="text-[10px] text-slate-400">个总空间</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-purple-700">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>可供绑定的空间池</span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab("system")}
          className={`group p-4 rounded-xl border transition-all cursor-pointer select-none ${
            activeTab === "system"
              ? "bg-amber-50/60 border-amber-300 ring-2 ring-amber-400/20 shadow-2xs"
              : "bg-white border-slate-200/80 hover:border-amber-200 hover:shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">系统已分配模型</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center transition-transform group-hover:scale-105">
              <Server className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{totalSystemModelsCount}</span>
            <span className="text-[10px] text-slate-400">个模型</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>系统分配</span>
          </div>
        </div>
      </div>

      {/* 来自空间模型页的预选提示 */}
      {prefillWorkspaceId && (
        prefillName ? (
          <div className="text-xs text-[#2b6cb0] bg-blue-50/80 rounded-xl p-3 border border-blue-200/80 flex items-start gap-2.5 shadow-2xs">
            <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">
                已根据上下文自动关联空间：「{prefillName}」
              </div>
              <div className="text-[11px] text-blue-700/80">
                {defs.length > 0
                  ? "已在自建模型分配抽屉中预选该空间，保存即可快速完成绑定并生效。"
                  : "当前自建模型库为空，登记你的首个模型后即可直接绑定到该空间。"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-800 bg-amber-50/80 rounded-xl p-3 border border-amber-200/80 flex items-start gap-2.5 shadow-2xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">空间权限提示：</span>
              你不是空间「{prefillWorkspaceId}」的所有者，无法将自建模型绑定到该空间（仅可绑定到本人拥有管理权限的空间）。
            </div>
          </div>
        )
      )}

      {/* 视图筛选、搜索与空间查看工具栏 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
        {/* Tab 胶囊切换 */}
        <div className="flex items-center p-1 bg-slate-100/80 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-white text-slate-800 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            全部展示 ({defs.length + totalSystemModelsCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("byo")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "byo"
                ? "bg-white text-[#2b6cb0] shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>我的自建模型</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-50 text-[#3182ce]">
              {defs.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "system"
                ? "bg-white text-amber-700 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>系统已分配</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-50 text-amber-700">
              {workspaces.length} 空间
            </span>
          </button>
        </div>

        {/* 搜索框与空间查看下拉 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索模型名称、厂商、端点..."
              className="w-full h-8.5 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white text-xs text-slate-800 outline-none focus:border-[#3182ce] focus:bg-white focus:ring-2 focus:ring-[#3182ce]/15 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                ×
              </button>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setWsListOpen((o) => !o)}
              className="h-8.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>空间清单 ({workspaces.length})</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${wsListOpen ? "rotate-180" : ""}`} />
            </button>
            {wsListOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setWsListOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-72 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl p-2 space-y-1">
                  <div className="text-[10px] font-black text-slate-400 px-2 py-1 tracking-wider uppercase">
                    你拥有的工作空间 ({workspaces.length})
                  </div>
                  {workspaces.length === 0 ? (
                    <div className="text-xs text-slate-400 px-2 py-3 text-center">暂无可绑定的空间</div>
                  ) : (
                    workspaces.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{w.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">{w.id}</div>
                        </div>
                        <span className="text-[10px] shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {w.type === "ENTERPRISE" ? "企业" : "个人"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 快捷模版选择条（仅在新增/编辑表单打开时展示） */}
      {showForm && (
        <div className="p-4 bg-gradient-to-r from-blue-50/60 via-indigo-50/30 to-purple-50/20 border border-blue-200/80 rounded-xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#3182ce]" />
              <span>快速套用官方推荐模版</span>
            </span>
            <span className="text-[11px] text-slate-500">点击自动填充推荐端点、上下文与单价参数</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_PRESETS.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => applyPreset(tpl)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 hover:text-[#3182ce] hover:border-blue-300 hover:shadow-2xs border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                <span>{tpl.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">({tpl.label})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 模型定义表单（新增/编辑） */}
      {showForm && (
        <div
          ref={formRef}
          id="byo-model-form"
          className="bg-white rounded-xl border border-blue-200/90 shadow-sm p-6 space-y-6 relative overflow-hidden transition-all duration-300 ring-2 ring-blue-400/20"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#3182ce] via-[#63b3ed] to-[#8b5cf6]" />

          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="text-sm font-black text-slate-800">
                {editingId ? "编辑模型库配置" : "新增模型配置"}
              </div>
              {editingId && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200">
                  正在编辑：{form.label || "当前模型"}
                </span>
              )}
              {editingId && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                  密钥留空 = 沿用现有密文
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
            >
              收起表单
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  模型展示名称 <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  className={inputCls}
                  placeholder="如：DeepSeek-V3、我的私有千问"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  接入接口协议 <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <select
                  className={inputCls + " font-medium cursor-pointer"}
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                >
                  {Object.entries(PROTOCOL_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700">供应商（厂商）</span>
                <input
                  className={inputCls}
                  placeholder="如 DeepSeek / OpenAI / Ollama（选填）"
                  value={form.providerName}
                  onChange={(e) => setForm({ ...form, providerName: e.target.value })}
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center">
                Base URL 端点地址（必须为 http/https） <span className="text-red-500 font-bold ml-0.5">*</span>
              </span>
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className={inputCls + " pl-9"}
                  placeholder="https://api.deepseek.com/v1 或 http://localhost:11434/v1"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  API Key 密钥
                  {editingId ? (
                    <span className="text-slate-400 font-normal ml-1">（留空则不修改现有密钥）</span>
                  ) : (
                    <span className="text-red-500 font-bold ml-0.5">*</span>
                  )}
                </span>
              </div>
              {editingId && (editingDef?.apiKeyMasked || editingDef?.hasApiKey) && (
                <div className="flex items-center gap-2">
                  <input
                    type={showApiKey ? "text" : "password"}
                    readOnly
                    value={showApiKey ? (editingDef?.apiKeyMasked || "••••••••") : "••••••••"}
                    className={inputCls + " bg-slate-50 text-slate-500 font-mono"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="shrink-0 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="显示/隐藏当前密钥（脱敏展示，仅前 6 + 后 4 位，完整明文不出服务端）"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">当前密钥（脱敏）</span>
                </div>
              )}
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showApiKey ? "text" : "password"}
                  autoComplete="new-password"
                  className={inputCls + " pl-9 pr-9 font-mono"}
                  placeholder={
                    editingId
                      ? "输入新密钥 = 覆盖现有密钥；留空 = 沿用现有密钥"
                      : "sk-... 明文录入后由服务端以 AES-256-GCM 密文存储，不入明文库"
                  }
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>
            </label>

            {/* 能力网格 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  支持的功能特性 (模型能力标签) <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {BYO_CAPABILITIES.map((cap) => {
                  const on = form.capabilities.includes(cap);
                  return (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => toggleCap(cap)}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer active:scale-95 ${
                        on
                          ? "bg-blue-50/90 text-[#2b6cb0] border-[#3182ce] shadow-2xs ring-2 ring-[#3182ce]/20"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  上下文窗口上限 (Token) <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  type="number"
                  className={inputCls}
                  value={form.contextLimit}
                  onChange={(e) => setForm({ ...form, contextLimit: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  官方单价 · 输入（元 / 百万 Token） <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  type="number"
                  step="0.0001"
                  className={inputCls}
                  value={form.priceInputYuan}
                  onChange={(e) => setForm({ ...form, priceInputYuan: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center">
                  官方单价 · 输出（元 / 百万 Token） <span className="text-red-500 font-bold ml-0.5">*</span>
                </span>
                <input
                  type="number"
                  step="0.0001"
                  className={inputCls}
                  value={form.priceOutputYuan}
                  onChange={(e) => setForm({ ...form, priceOutputYuan: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
              <div>
                <strong>计费与扣点原则：</strong>
                自带私有模型由你自行与上游供应商结算账单，平台不赚取 Token 差价，仅对跨网络算力中转收取基础服务费（默认 15%）；工作台扣点 = 官方参考价 × (1 + 基础服务费率)。
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>AES-256-GCM 硬件加密存储 · SSRF 严格沙箱校验 · 门禁安全防护</span>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !testReady}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#2b6cb0] border border-[#3182ce]/30 hover:border-[#3182ce] rounded-lg text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                  <span>{testing ? "网络探测中…" : "测试连通通道"}</span>
                </button>
                <button
                  type="button"
                  onClick={saveDef}
                  disabled={saving || testing}
                  className="px-5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#23568c] text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? "保存中…" : editingId ? "保存修改" : "确认保存模型"}</span>
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`rounded-xl border p-4 space-y-2.5 transition-all ${
                  testResult.ok ? "bg-emerald-50/80 border-emerald-200" : "bg-rose-50/80 border-rose-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className={"text-xs font-black " + (testResult.ok ? "text-emerald-700" : "text-rose-700")}>
                      {testResult.ok
                        ? `通道网络连通正常（实测延迟 ${testResult.latencyMs}ms）`
                        : `通道连通失败${testResult.label ? `（${testResult.label}）` : testResult.errorType ? `（${testResult.errorType}）` : ""}`}
                    </span>
                  </div>
                  {testResult.ok && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      PING OK
                    </span>
                  )}
                </div>

                {testResult.ok && testResult.sampleReply && (
                  <div className="text-[11px] text-slate-700 font-mono bg-white rounded-lg border border-emerald-100 p-2.5 break-words">
                    <span className="text-slate-400 select-none mr-2">回执示例:</span>
                    {testResult.sampleReply}
                  </div>
                )}

                {!testResult.ok && testResult.message && (
                  <div className="text-[11px] text-rose-600 font-medium break-words bg-white/60 p-2 rounded border border-rose-100">
                    <span className="font-bold">错误响应：</span>
                    {testResult.message}
                  </div>
                )}

                {!testResult.ok && testResult.troubleshooting?.length ? (
                  <div className="text-[11px] text-rose-700/90 pt-1">
                    <div className="font-black mb-1">建议排查方案：</div>
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
        </div>
      )}

      {/* 我的自建模型列表区 (BYO Section) */}
      {(activeTab === "all" || activeTab === "byo") && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-sm font-black text-slate-800">
                我的自建模型库
              </div>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-100">
                {defs.length} 个
              </span>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>配置新模型</span>
            </button>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 py-8 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
              <span>正在加载模型库…</span>
            </div>
          ) : filteredDefs.length === 0 ? (
            defs.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto shadow-2xs">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-700">尚未配置自带模型</div>
                  <div className="text-xs text-slate-400 max-w-md mx-auto">
                    你可以将自有端点（如 DeepSeek、OpenAI、本地 Ollama）集中配置在此处，随后一键绑定到多个工作空间。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-lg text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>立即配置第一个模型</span>
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">
                未搜索到符合条件的自建模型，请尝试更换关键词
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {filteredDefs.map((def) => {
                const activeCount = def.assignments.filter((a) => a.enabled).length;
                return (
                  <div
                    key={def.id}
                    className="rounded-xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-2xs transition-all p-4 space-y-3.5"
                  >
                    {/* 卡片头部：模型名、厂商、上下文容量与操作按钮 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-slate-900 truncate">
                            {def.label}
                          </span>
                          {def.providerName ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#3182ce] border border-blue-100 shrink-0">
                              {def.providerName}
                            </span>
                          ) : null}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            {def.protocol}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 font-mono text-[10px] font-bold">
                            上下文上限: {def.contextLimit.toLocaleString()} Tokens
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (assigningId === def.id) {
                              setAssigningId(null);
                            } else {
                              openAssign(def);
                            }
                          }}
                          className={`h-7.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            assigningId === def.id
                              ? "bg-[#3182ce] text-white shadow-2xs"
                              : "bg-blue-50 hover:bg-blue-100 text-[#3182ce] border border-blue-200/60"
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          <span>{assigningId === def.id ? "收起空间" : "分配空间"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(def)}
                          className="h-7.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDef(def)}
                          className="h-7.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {/* 端点 Base URL（无复制按钮） */}
                    <div className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/70">
                      <div className="text-[11px] font-mono text-slate-600 break-all select-all">
                        {def.baseUrl}
                      </div>
                    </div>

                    {/* 支持能力胶囊徽章 */}
                    <div className="flex flex-wrap gap-1.5">
                      {(def.capabilities || []).map((c) => (
                        <span
                          key={c}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 shadow-2xs"
                        >
                          {CAP_LABELS[c] || c}
                        </span>
                      ))}
                    </div>

                    {/* 资费概览与统一计价组件 */}
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 space-y-2">
                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                        <span>官方参考单价</span>
                        <span className="font-black text-slate-800">
                          {def.priceInputMicrosPerMillion != null
                            ? `¥${(def.priceInputMicrosPerMillion / 1_000_000).toFixed(2)} / ¥${(Number(def.priceOutputMicrosPerMillion || 0) / 1_000_000).toFixed(2)}`
                            : "未配置"}
                          <span className="text-[10px] text-slate-400 font-sans font-normal ml-0.5">
                            元 / 百万 Token
                          </span>
                        </span>
                      </div>
                      {/* 自带模型仅单一官方价、无分时段配置：不渲染闲时/高峰等时段标签（未配置分段价一律不显示） */}
                      <div className="text-[10px] text-slate-400 font-sans">
                        {def.priceInputMicrosPerMillion != null
                          ? "官方单一价（未分时段）：全天统一按上方单价折算计费"
                          : "官方单价未登记：登记后按官方单价折算并另收平台服务费"}
                      </div>
                    </div>

                    {/* 空间绑定状态栏 */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">
                          绑定空间 ({def.assignments.length})
                        </span>
                        {def.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {def.assignments.map((a) => (
                              <span
                                key={a.workspaceId}
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                                  a.enabled
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {wsName(a.workspaceId)}
                                {a.enabled ? "" : " (停用)"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600">未绑定任何空间（暂未生效）</span>
                        )}
                      </div>
                    </div>

                    {/* 分配空间面板抽屉 */}
                    {assigningId === def.id && (
                      <div
                        id={`assign-panel-${def.id}`}
                        className="rounded-xl border border-blue-200/90 bg-gradient-to-b from-blue-50/60 via-blue-50/25 to-white/95 p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200 scroll-mt-24"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-100/80 text-[#3182ce] flex items-center justify-center shrink-0">
                              <Users className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-slate-800">
                              绑定到你的工作空间
                              <span className="text-slate-400 font-normal ml-1">（可多选）</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAssigningId(null)}
                            className="text-[11px] text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5 rounded-md hover:bg-white/80 transition-all cursor-pointer"
                          >
                            收起
                          </button>
                        </div>

                        {workspaces.length === 0 ? (
                          <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                            你暂无可作为所有者的空间（个人空间或企业空间）。
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                            {workspaces.map((w) => {
                              const sysModels = systemModelsByWs[w.id];
                              const isChecked = !!selectedWs[w.id];
                              const isEnterprise = w.type === "ENTERPRISE";
                              return (
                                <label
                                  key={w.id}
                                  className={`relative flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer select-none group ${
                                    isChecked
                                      ? "bg-white border-[#3182ce] shadow-xs ring-2 ring-[#3182ce]/20"
                                      : "bg-white/90 border-slate-200 hover:border-blue-300 hover:bg-white hover:shadow-2xs"
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) =>
                                        setSelectedWs((s) => ({ ...s, [w.id]: e.target.checked }))
                                      }
                                      className="w-4 h-4 mt-0.5 rounded text-[#3182ce] focus:ring-[#3182ce] cursor-pointer shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span
                                          className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-[#3182ce] transition-colors"
                                          title={w.name}
                                        >
                                          {w.name}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                                            isEnterprise
                                              ? "bg-purple-50 text-purple-700 border-purple-200/80"
                                              : "bg-blue-50 text-[#2b6cb0] border-blue-200/80"
                                          }`}
                                        >
                                          {isEnterprise ? (
                                            <Building2 className="w-3 h-3 text-purple-600" />
                                          ) : (
                                            <User className="w-3 h-3 text-[#3182ce]" />
                                          )}
                                          <span>{isEnterprise ? "企业" : "个人"}</span>
                                        </span>
                                      </div>

                                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                                          <span className="font-medium text-slate-500 flex items-center gap-1 whitespace-nowrap shrink-0">
                                            <Cpu className="w-3 h-3 text-slate-400" />
                                            <span>空间已有系统模型</span>
                                          </span>
                                          {sysModels && sysModels.length > 0 && (
                                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                                              {sysModels.length} 个
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap gap-1 items-center min-h-[22px]">
                                          {sysModels === undefined ? (
                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                              <Loader2 className="w-3 h-3 animate-spin" /> 拉取中…
                                            </span>
                                          ) : sysModels.length === 0 ? (
                                            <span className="text-[10px] text-amber-600 bg-amber-50/80 px-1.5 py-0.5 rounded border border-amber-200/60 font-medium">
                                              未分配系统模型
                                            </span>
                                          ) : (
                                            sysModels.map((m) => (
                                              <span
                                                key={m.id}
                                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all ${
                                                  m.isSpaceDefault
                                                    ? "bg-blue-50 text-[#2b6cb0] border-blue-200 font-bold shadow-2xs"
                                                    : "bg-slate-50 text-slate-600 border-slate-200/80"
                                                }`}
                                              >
                                                <span className="max-w-[130px] truncate" title={m.displayName}>
                                                  {m.displayName}
                                                </span>
                                                {m.isSpaceDefault && (
                                                  <span className="text-[8px] font-sans font-bold px-1 py-0.1 rounded bg-[#3182ce] text-white shrink-0">
                                                    默认
                                                  </span>
                                                )}
                                              </span>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-blue-200/70">
                          <div className="flex items-center gap-4 flex-wrap">
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={assignEnabled}
                                onChange={(e) => setAssignEnabled(e.target.checked)}
                                className="w-4 h-4 rounded text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                              />
                              <span className="whitespace-nowrap">绑定后立即启用</span>
                            </label>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={assignShare}
                                onChange={(e) => setAssignShare(e.target.checked)}
                                className="w-4 h-4 rounded text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                              />
                              <span className="whitespace-nowrap">允许空间成员共享调用</span>
                            </label>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={saveAssignments}
                              disabled={savingAssign}
                              className="inline-flex items-center justify-center gap-1.5 h-9 px-5 bg-[#3182ce] hover:bg-[#2b6cb0] active:scale-98 text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer select-none"
                            >
                              {savingAssign ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              ) : (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span className="whitespace-nowrap shrink-0">
                                {savingAssign ? "保存中…" : "确认空间绑定"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 系统已分配模型区（只读总览，按空间） */}
      {(activeTab === "all" || activeTab === "system") && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Server className="w-4 h-4" />
              </div>
              <div className="text-sm font-black text-slate-800">
                系统已分配模型
              </div>
              <span className="text-[11px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                {workspaces.length} 个空间
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              各空间的系统官方模型由管理员统一分配，仅可在空间内部选用或设为默认，此处不可修改
            </p>
          </div>

          <div className="space-y-3.5">
            {filteredWorkspaces.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">
                {workspaces.length === 0 ? "你暂无关联的工作空间。" : "未找到匹配的空间系统模型。"}
              </div>
            ) : (
              filteredWorkspaces.map((w) => {
                const sys = systemModelsByWs[w.id];
                const isCollapsed = !!collapsedWs[w.id];
                return (
                  <div
                    key={w.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 space-y-3 transition-colors hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div
                        onClick={() => toggleWsCollapse(w.id)}
                        className="flex items-center gap-2 cursor-pointer select-none min-w-0"
                      >
                        <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-xs font-black text-slate-800 truncate">{w.name}</span>
                        {w.type === "ENTERPRISE" && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            企业空间
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({sys ? `${sys.length} 个模型` : "加载中"})
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            isCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/workspace/${encodeURIComponent(w.id)}?tab=models`)}
                        className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <span>前往空间模型页</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div>
                        {sys === undefined ? (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3182ce]" />
                            <span>正在拉取该空间模型分配…</span>
                          </div>
                        ) : sys.length === 0 ? (
                          <div className="text-xs text-slate-400 py-2">该空间暂无系统分配模型。</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start pt-1">
                            {sys.map((m) => (
                              <div
                                key={m.id}
                                className="rounded-lg border border-blue-100 bg-white p-3 space-y-2 shadow-2xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <CheckCircle2
                                      className={`w-4 h-4 shrink-0 ${
                                        m.isSpaceDefault ? "text-[#3182ce]" : "text-slate-300"
                                      }`}
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-slate-900 truncate">
                                          {m.displayName}
                                        </span>
                                        {m.isSpaceDefault && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-50 text-[#3182ce] border border-blue-100 font-bold shrink-0">
                                            空间默认
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono truncate">
                                        {m.providerName}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1 justify-end shrink-0">
                                    {(m.capabilities || []).slice(0, 3).map((c) => (
                                      <span
                                        key={c}
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600"
                                      >
                                        {CAP_LABELS[c] || c}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* 资费概览：与后台 / 自建模型区 / 模型定价页统一口径 */}
                                <div className="pt-2 border-t border-slate-100 space-y-1">
                                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 gap-2">
                                    <span className="shrink-0">输入 / 输出</span>
                                    <span className="font-black text-slate-800 truncate">
                                      {m.pricing?.priceInputMicrosPerMillion != null
                                        ? `¥${(m.pricing.priceInputMicrosPerMillion / 1_000_000).toFixed(2)} / ¥${(Number(m.pricing.priceOutputMicrosPerMillion || 0) / 1_000_000).toFixed(2)}`
                                        : "未配置"}
                                      <span className="text-[9px] text-slate-400 font-sans font-normal ml-0.5">
                                        元/百万
                                      </span>
                                    </span>
                                  </div>
                                  <ModelPricingRules periods={m.pricingPeriods} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 模型调度价格原则 */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-800">模型调度价格原则：</strong>
          自建模型由用户自行配置，可绑定至名下多个工作空间使用；调用自建模型产生的费用由用户与厂商结算，平台仅按实际调用收取基础服务费；每个空间同一时间仅启用一个主模型。
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        warnings={confirmDialog.warnings}
        confirmText="确认删除"
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
