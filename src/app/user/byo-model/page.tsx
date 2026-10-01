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
} from "lucide-react";

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
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceStatus: string;
  priceReady: boolean;
}

// 与 src/lib/workspace-byo-model.ts 的 SUPPORTED_CAPABILITIES 保持一致（此处不引入服务端模块，避免进入客户端打包）
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
  VISION: "视觉/图像理解",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文件分析",
};

const PROTOCOL_LABELS: Record<string, string> = {
  OPENAI_COMPATIBLE: "OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / vLLM 等兼容网关）",
  ANTHROPIC: "ANTHROPIC（Claude）",
  GEMINI: "GEMINI（Google Gemini）",
};

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
  "w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all";

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

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    errorType?: string;
    message?: string;
    troubleshooting?: string[];
    sampleReply?: string;
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
      if (manageable.length > 0 && !selectedWs) setSelectedWs(manageable[0].id);
    } catch (e) {
      toast.error((e as Error)?.message || "加载空间列表失败");
    } finally {
      setLoadingList(false);
    }
  }, [toast, selectedWs]);

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

  const save = async () => {
    if (!selectedWs) return;
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
          enabled: form.enabled,
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
      toast.success("空间自带模型已保存");
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
      setTestResult({
        ok: data.success,
        latencyMs: data.latencyMs ?? 0,
        errorType: data.errorType,
        message: data.message || (data.success ? "连通正常" : "连通失败"),
        troubleshooting: data.troubleshooting,
        sampleReply: data.sampleReply,
      });
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

      {/* 空间选择 Bento 卡片 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#3182ce]" />
            <span>选择目标空间（仅展示你作为所有者的空间资产）</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            共 {workspaces.length} 个可管空间
          </span>
        </div>
        {loadingList ? (
          <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
            <span>正在加载你的工作空间列表…</span>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
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

      {!selectedWs && !loadingList && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-white border border-slate-200/80 rounded-2xl p-8 shadow-2xs">
          <Building2 className="w-4 h-4 text-[#3182ce]" />
          <span>请先在上方的空间下拉框中选择要配置的目标空间；自带模型按空间粒度精准生效与隔离。</span>
        </div>
      )}

      {selectedWs && loadingView && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载空间自带模型配置…</span>
        </div>
      )}

      {selectedWs && !loadingView && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 space-y-6">
          {/* 状态栏 Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2 flex-wrap">
                <span>{selectedName}</span>
                <span className="text-slate-300">·</span>
                {current ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">
                    已接入自带模型：{current.label}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    尚未配置自带模型
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                {current ? (
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    当前已生效为该空间的优先默认执行模型
                  </span>
                ) : (
                  <span>保存后将作为该空间组件优先调用的执行模型</span>
                )}
              </div>
            </div>
            {current && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-rose-200/80 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 self-start sm:self-auto"
                title="清除该空间的自带模型配置并恢复默认"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清除配置</span>
              </button>
            )}
          </div>

          {/* 表单分区 1：基础协议与网络端点 */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>基础协议与端点配置</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">模型展示名称 <span className="text-red-500 font-bold">*</span></span>
                <input
                  className={inputCls}
                  placeholder="如：我的专属 DeepSeek V3"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">接入协议 <span className="text-red-500 font-bold">*</span></span>
                <select
                  className={inputCls + " font-medium cursor-pointer"}
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                >
                  {Object.entries(PROTOCOL_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-600">Base URL 端点地址（必须为 https）<span className="text-red-500 font-bold">*</span></span>
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className={inputCls + " pl-9"}
                  placeholder="https://your-model-endpoint/v1"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>
              <span className="block text-[11px] text-slate-400">
                OpenAI 兼容格式填完整 base（含 /v1，平台会自动调度 /chat/completions）；Anthropic 填 https://api.anthropic.com；Gemini 填 https://generativelanguage.googleapis.com
              </span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-600">
                API Key 密钥 {current ? "（已密文加密存储，留空则保持沿用）" : <span className="text-red-500 font-bold">*</span>}
              </span>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputCls + " pl-9 font-mono"}
                  placeholder={current ? "留空 = 不修改现有密钥" : "sk-... 明文录入后由服务端以 AES-256-GCM 加密存储"}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>
              <span className="block text-[11px] text-slate-400">密钥绝不进明文库，每次执行时在内存中临时解密并注入签名头</span>
            </label>
          </div>

          {/* 表单分区 2：模型能力与计费规则 */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>声明能力与服务费规则</span>
            </h3>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">模型抽象能力（组件合同能力匹配依据）</span>
              <div className="flex flex-wrap gap-2">
                {BYO_CAPABILITIES.map((cap) => {
                  const on = form.capabilities.includes(cap);
                  return (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => toggleCap(cap)}
                      className={
                        "px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs active:scale-95 " +
                        (on
                          ? "bg-blue-50 border-[#3182ce] text-[#2b6cb0] ring-1 ring-[#3182ce]/20"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50")
                      }
                    >
                      {CAP_LABELS[cap] || cap}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">上下文上限 (Token)</span>
                <input
                  type="number"
                  className={inputCls}
                  value={form.contextLimit}
                  onChange={(e) => setForm({ ...form, contextLimit: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">
                  该模型的官方单价 · 输入（元 / 百万 Token）<span className="text-red-500">*</span>
                </span>
                <input
                  type="number"
                  step="0.0001"
                  className={inputCls}
                  value={form.priceInputYuan}
                  onChange={(e) => setForm({ ...form, priceInputYuan: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">
                  该模型的官方单价 · 输出（元 / 百万 Token）<span className="text-red-500">*</span>
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
            <span className="block text-[11px] text-slate-400">
              请填写该模型在厂商侧的<strong className="text-slate-600">官方单价</strong>（输入、输出分开填写，单位：元 / 百万 Token）。
              BYO 模式下平台不承担上游厂商成本，实际扣点 = 官方单价折算的算力点 ×（1 + 平台服务费费率，默认 15%）；
              未登记官方单价的自带模型无法通过算账中心估价（系统不会替你猜测价格）。
            </span>
            {byokPreview && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 space-y-0.5">
                {byokPreview.basis === "BLOCKED_PRICE_UNREGISTERED" ? (
                  <span className="text-amber-700 font-semibold">{byokPreview.blockedReason}</span>
                ) : (
                  <>
                    <div>
                      按新语义示例：输入 1 万 Token + 输出 1 万 Token，预计扣点{" "}
                      <strong className="font-mono text-slate-800">{byokPreview.points ?? "—"}</strong> 点
                      {byokPreview.yuan !== null ? (
                        <>
                          {" "}
                          ≈ <strong className="font-mono text-slate-800">¥{byokPreview.yuan}</strong>
                        </>
                      ) : null}
                    </div>
                    <span className="block text-[10px] text-slate-400">
                      已含平台服务费 {((byokPreview.byokServiceRateBps ?? 0) / 100).toFixed(2)}%（后台可调）；1 算力点 = 0.01 元。
                    </span>
                  </>
                )}
              </div>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700">启用自带模型（关闭后该空间将自动回落到空间/平台默认模型）</span>
            </label>
          </div>

          {/* Footer 按钮栏 */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>全链路 SSRF 安全阻断保护 + 合同能力门禁校验</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || saving || !testReady}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-[#2b6cb0] border border-[#3182ce]/30 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                <span>{testing ? "正在测试…" : "测试通道"}</span>
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-6 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "正在保存…" : "保存模型配置"}</span>
              </button>
            </div>
          </div>

          {/* 测试通道结果展示 */}
          {testResult && (
            <div
              className={
                "rounded-xl border p-4 space-y-2 " +
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
                    : `测试通道连通失败${testResult.errorType ? `（${testResult.errorType}）` : ""}`}
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
                <div className="text-[11px] text-rose-600 font-medium break-words">{testResult.message}</div>
              )}
              {!testResult.ok && testResult.troubleshooting?.length ? (
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-600/90">
                  {testResult.troubleshooting.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {!form.enabled && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>注意：当前自带模型已设为停用状态，该空间所有组件任务将回落至空间或平台默认模型执行。</span>
            </div>
          )}
        </div>
      )}

      {selectedWs && !loadingView && !current && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <Cpu className="w-4 h-4 text-[#3182ce]" />
          <span>未配置时，该空间组件默认使用平台模型；配置并保存后将优先调度你登记的自带模型。</span>
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
