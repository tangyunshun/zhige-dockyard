"use client";

/**
 * 模型注册表管理（Phase 1）
 * 所有列表均来自后端 API，前端不硬编码任何供应商 / 模型清单。
 * 密钥不在此处展示，仅展示环境变量名。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Cpu,
  Server,
  Plus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Coins,
  SlidersHorizontal,
  Layers,
  Settings,
  X,
  ExternalLink,
  Shield,
  Activity,
  Check,
  Loader2,
  Sliders,
  DollarSign,
  Zap,
  Trash2,
  TestTube,
  MoreHorizontal,
  Info,
} from "lucide-react";

interface ModelProvider {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string;
  apiKeyEnv: string;
  enabled: boolean;
  sortOrder: number;
  /** 运行时密钥配置状态：apiKeyEnv 为空时恒为 true（无需密钥）；非空时取决于 process.env 是否设置 */
  apiKeyConfigured?: boolean;
}

interface ModelDeployment {
  id: string;
  providerId: string;
  modelId: string;
  upstreamModel: string;
  displayName: string;
  contextLimit: number;
  /** 数据库声明的抽象能力（唯一真源为数据库，前端不维护任何固定能力表） */
  capabilities?: string[] | null;
  /** 价格唯一真源为 modelpricing（由部署列表接口一并返回） */
  pricing?: {
    currency: string;
    priceStatus: string;
    priceSource: string;
    priceVersion: number;
    costInputMicrosPerMillion: number | null;
    costOutputMicrosPerMillion: number | null;
    priceInputMicrosPerMillion: number | null;
    priceOutputMicrosPerMillion: number | null;
  } | null;
  enabled: boolean;
}

/**
 * 判断某部署能否执行「通道测试」，并返回不可测的原因（null 表示可测）。
 * 规则与执行路径一致：供应商或模型任一被禁用，均不得发起测试性调用。
 */
function testBlockReason(d: ModelDeployment, providers: ModelProvider[]): string | null {
  const p = providers.find((pr) => pr.name === d.providerId);
  if (!p) return "所属供应商不存在，无法测试";
  if (!p.enabled) return `供应商通道「${p.name}」已禁用，无法执行通道测试（请先在供应商列表启用该通道）`;
  if (!d.enabled) return `模型部署「${d.providerId}/${d.modelId}」已禁用，无法执行通道测试（请先启用该模型）`;
  if (!p.baseUrl || !d.upstreamModel) return "缺少 Base URL 或上游模型名，无法测试";
  if (p.apiKeyEnv && !p.apiKeyConfigured) return "供应商 API Key 未配置，无法测试";
  return null;
}
function canTestDeployment(d: ModelDeployment, providers: ModelProvider[]): boolean {
  return testBlockReason(d, providers) === null;
}

/** 价格状态 → 中文标签（界面不暴露英文状态码） */
function priceStatusLabel(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "已生效";
    case "CONFIRMED":
      return "已确认生效";
    case "OBSERVED_ONLY":
      return "仅观测";
    case "UNCONFIGURED":
      return "未配置";
    case "FREE":
      return "免费";
    default:
      return status || "未配置";
  }
}

const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-200/90 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all shadow-2xs";
const getInputCls = (hasError?: boolean, extra?: string) =>
  `w-full px-3 py-2 rounded text-xs font-medium text-slate-800 outline-none transition-all shadow-2xs ${
    hasError
      ? "bg-white border border-rose-300 placeholder:text-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
      : "bg-white border border-slate-200/90 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
  } ${extra || ""}`;
const btnCls =
  "px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

export default function AdminModelsPage() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [deployments, setDeployments] = useState<ModelDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // 部署行「⋯」更多操作菜单：fixed 定位锚定触发按钮视口坐标，避免被表格 overflow 裁剪
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    latencyMs: number;
    errorType?: string;
    message?: string;
    troubleshooting?: string[];
    sampleReply?: string;
  } | null>(null);
  const toast = useToast();

  const testDeployment = async (d: ModelDeployment) => {
    setTestingId(d.id);
    setTestResult(null);
    try {
      const data = await authFetch(`/api/admin/model-deployments/${d.id}/test`, { method: "POST" });
      setTestResult({
        id: d.id,
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
      setTestingId(null);
    }
  };
  // 平台默认模型（唯一裁决入口读取的配置；来自数据库，不在前端硬编码任何供应商/模型）
  const [platformDefault, setPlatformDefault] = useState<{
    deploymentId: string | null;
    deployment: { id: string; providerId: string; modelId: string } | null;
  } | null>(null);
  const [selectedDefault, setSelectedDefault] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);

  // 供应商与部署列表分页状态（每页固定展示 5 条数据）
  const PAGE_SIZE = 5;
  const [providerPage, setProviderPage] = useState(1);
  const [deploymentPage, setDeploymentPage] = useState(1);

  const pagedProviders = useMemo(() => {
    const start = (providerPage - 1) * PAGE_SIZE;
    return providers.slice(start, start + PAGE_SIZE);
  }, [providers, providerPage]);

  const pagedDeployments = useMemo(() => {
    const start = (deploymentPage - 1) * PAGE_SIZE;
    return deployments.slice(start, start + PAGE_SIZE);
  }, [deployments, deploymentPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(providers.length / PAGE_SIZE));
    if (providerPage > maxPage) setProviderPage(maxPage);
  }, [providers.length, providerPage]);

  // 「⋯」菜单打开期间：任意滚动（含表格容器内滚动）/窗口缩放时关闭，避免 fixed 锚点错位
  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [actionMenu]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(deployments.length / PAGE_SIZE));
    if (deploymentPage > maxPage) setDeploymentPage(maxPage);
  }, [deployments.length, deploymentPage]);

  // 全局二次确认弹窗状态（对齐全站其它管理页面规范，彻底替换原生 alert/confirm）
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    onConfirm: () => void | Promise<void>;
    type?: "danger" | "warning" | "info";
    confirmText?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "danger",
    confirmText: "确认删除",
  });

  const [pForm, setPForm] = useState({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "MODEL_API_KEY", apiKey: "" });
  const [pErrors, setPErrors] = useState<{ name?: string; baseUrl?: string; apiKeyEnv?: string }>({});

  const [dForm, setDForm] = useState({
    providerId: "",
    modelId: "",
    upstreamModel: "",
    displayName: "",
    contextLimit: "32000",
    capabilities: [] as string[],
  });
  const [dErrors, setDErrors] = useState<{ providerId?: string; modelId?: string; contextLimit?: string; capabilities?: string }>({});

  // 供应商编辑（name 为稳定标识，后端禁止改名；仅可改协议 / Base URL / 密钥环境变量）
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderName, setEditProviderName] = useState("");
  const [pEditForm, setPEditForm] = useState({ protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "", apiKey: "" });
  const [pEditErrors, setPEditErrors] = useState<{ baseUrl?: string; apiKeyEnv?: string }>({});

  // 部署编辑（providerId / modelId 为稳定标识，后端禁止改名；仅可改上游名 / 展示名 / 上下文）
  const [editDeploymentId, setEditDeploymentId] = useState<string | null>(null);
  const [editDeploymentMeta, setEditDeploymentMeta] = useState({ providerId: "", modelId: "" });
  const [dEditForm, setDEditForm] = useState({ upstreamModel: "", displayName: "", contextLimit: "32000" });
  const [dEditErrors, setDEditErrors] = useState<{ contextLimit?: string }>({});

  // 模型能力编辑：可选项全部由后端下发（唯一真源为后端能力白名单），前端不维护任何固定能力表。
  // 能力决定组件能否执行：部署声明的能力必须覆盖组件合同要求的全部能力，否则按钮显示「能力不满足（不可执行）」。
  const [capabilityOptions, setCapabilityOptions] = useState<
    { value: string; label: string; description: string }[]
  >([]);
  const [capabilityPanelId, setCapabilityPanelId] = useState<string | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<string[]>([]);
  const [capError, setCapError] = useState<string | null>(null);

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

  const applyPlatformDefault = useCallback((def: { deploymentId?: string | null; deployment?: unknown }) => {
    setPlatformDefault({
      deploymentId: def?.deploymentId ?? null,
      deployment: (def?.deployment as { id: string; providerId: string; modelId: string } | null) ?? null,
    });
    setSelectedDefault(def?.deploymentId ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 能力清单拉取失败（如无该权限）不得阻断整页加载，降级为空列表即可
      const [p, d, def, caps] = await Promise.all([
        authFetch("/api/admin/model-providers"),
        authFetch("/api/admin/model-deployments"),
        authFetch("/api/admin/model-deployments/default"),
        authFetch("/api/admin/model-capabilities").catch(() => ({ data: [] })),
      ]);
      setProviders(p.data || []);
      setDeployments(d.data || []);
      applyPlatformDefault(def);
      setCapabilityOptions(caps.data || []);
    } catch (e) {
      toast.error((e as Error)?.message || "加载模型注册表失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, applyPlatformDefault]);

  /** 保存成功后：只刷新「模型部署列表 + 平台默认模型状态」，不重复拉取供应商列表 */
  const refreshDeploymentsAndDefault = useCallback(async () => {
    const [d, def] = await Promise.all([
      authFetch("/api/admin/model-deployments"),
      authFetch("/api/admin/model-deployments/default"),
    ]);
    setDeployments(d.data || []);
    applyPlatformDefault(def);
  }, [authFetch, applyPlatformDefault]);

  /** 保存 / 清除平台默认模型；后端 403/409/400 的具体错误由 authFetch 原样抛出并展示 */
  const savePlatformDefault = async (deploymentId: string | null) => {
    setSavingDefault(true);
    try {
      await authFetch("/api/admin/model-deployments/default", {
        method: "PUT",
        body: JSON.stringify({ deploymentId }),
      });
      toast.success(deploymentId ? "平台默认模型已更新" : "平台默认模型已清除");
      await refreshDeploymentsAndDefault();
    } catch (e) {
      toast.error((e as Error)?.message || "保存平台默认模型失败");
    } finally {
      setSavingDefault(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const toggleProvider = (row: ModelProvider) => {
    if (row.enabled) {
      const activeCount = deployments.filter((d) => d.providerId === row.name && d.enabled).length;
      setConfirmDialog({
        isOpen: true,
        title: "禁用供应商通道",
        message: `确认禁用供应商通道「${row.name}」？`,
        warnings: [
          `禁用后，该通道下关联的 ${activeCount} 个已启用模型部署将立即全部失效，全站组件无法调度调用。`,
          "已配置该供应商模型为默认策略的工作空间，任务执行将直接报错中断。",
        ],
        type: "warning",
        confirmText: "确认禁用",
        onConfirm: async () => {
          setBusy(`p:${row.id}`);
          try {
            await authFetch(`/api/admin/model-providers/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ enabled: false }),
            });
            // 局部无感更新，避免整页菊花白屏
            setProviders((prev) =>
              prev.map((p) => (p.id === row.id ? { ...p, enabled: false } : p))
            );
          } catch (e) {
            toast.error((e as Error)?.message || "操作失败");
          } finally {
            setBusy(null);
          }
        },
      });
    } else {
      void (async () => {
        setBusy(`p:${row.id}`);
        try {
          await authFetch(`/api/admin/model-providers/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: true }),
          });
          // 局部无感更新
          setProviders((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, enabled: true } : p))
          );
        } catch (e) {
          toast.error((e as Error)?.message || "操作失败");
        } finally {
          setBusy(null);
        }
      })();
    }
  };

  const toggleDeployment = (row: ModelDeployment) => {
    if (row.enabled) {
      setConfirmDialog({
        isOpen: true,
        title: "禁用模型部署",
        message: `确认禁用模型部署「${row.providerId}/${row.modelId}」？`,
        warnings: [
          "禁用后，全站所有依赖该模型的组件将立即拒绝执行，且系统不会自动回落环境变量。",
          platformDefault?.deploymentId === row.id
            ? "⚠️ 特别提醒：该模型当前被设为【平台默认模型】，禁用后未配置空间专属默认的工作空间将无法调度执行！"
            : "若有工作空间模型策略将此模型设为默认，相关空间的执行任务也将受到影响。",
        ],
        type: "warning",
        confirmText: "确认禁用",
        onConfirm: async () => {
          setBusy(`d:${row.id}`);
          try {
            await authFetch(`/api/admin/model-deployments/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ enabled: false }),
            });
            // 局部无感更新，杜绝全屏菊花遮罩闪烁
            setDeployments((prev) =>
              prev.map((d) => (d.id === row.id ? { ...d, enabled: false } : d))
            );
          } catch (e) {
            toast.error((e as Error)?.message || "操作失败");
          } finally {
            setBusy(null);
          }
        },
      });
    } else {
      void (async () => {
        setBusy(`d:${row.id}`);
        try {
          await authFetch(`/api/admin/model-deployments/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: true }),
          });
          // 局部无感更新
          setDeployments((prev) =>
            prev.map((d) => (d.id === row.id ? { ...d, enabled: true } : d))
          );
        } catch (e) {
          toast.error((e as Error)?.message || "操作失败");
        } finally {
          setBusy(null);
        }
      })();
    }
  };

  // ---------- 供应商编辑 / 删除（接已有的 PATCH / DELETE 接口） ----------
  const openProviderEdit = (p: ModelProvider) => {
    setEditProviderId(p.id);
    setEditProviderName(p.name);
    setPEditForm({ protocol: p.protocol, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv, apiKey: "" });
    setPEditErrors({});
  };
  const saveProviderEdit = async () => {
    if (!editProviderId) return;
    const errors: { baseUrl?: string; apiKeyEnv?: string } = {};
    if (!pEditForm.baseUrl.trim()) {
      errors.baseUrl = "请输入 Base URL";
    } else if (!/^https?:\/\/.+/i.test(pEditForm.baseUrl.trim())) {
      errors.baseUrl = "Base URL 必须以 http:// 或 https:// 开头";
    }
    if (pEditForm.apiKeyEnv.trim() && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pEditForm.apiKeyEnv.trim())) {
      errors.apiKeyEnv = "环境变量名格式不正确（如 MODEL_API_KEY）";
    }
    if (Object.keys(errors).length > 0) {
      setPEditErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["baseUrl", "apiKeyEnv"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`edit-provider-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy(`p:edit:${editProviderId}`);
    try {
      await authFetch(`/api/admin/model-providers/${editProviderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          protocol: pEditForm.protocol.trim().toUpperCase(),
          baseUrl: pEditForm.baseUrl.trim(),
          apiKeyEnv: pEditForm.apiKeyEnv.trim(),
          apiKey: pEditForm.apiKey,
        }),
      });
      toast.success("供应商已更新");
      setEditProviderId(null);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "更新供应商失败");
    } finally {
      setBusy(null);
    }
  };
  const deleteProvider = (p: ModelProvider) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除模型供应商",
      message: `确认删除供应商「${p.name}」？此操作不可恢复。`,
      warnings: ["注意：若其下仍有关联的模型部署，或正被设为平台默认模型，后端将拒绝删除。"],
      type: "danger",
      confirmText: "确认删除",
      onConfirm: async () => {
        setBusy(`p:del:${p.id}`);
        try {
          await authFetch(`/api/admin/model-providers/${p.id}`, { method: "DELETE" });
          toast.success(`供应商「${p.name}」已成功删除`);
          await load();
        } catch (e) {
          toast.error((e as Error)?.message || "删除供应商失败");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  // ---------- 部署编辑 / 删除（接已有的 PATCH / DELETE 接口） ----------
  const openDeploymentEdit = (d: ModelDeployment) => {
    setEditDeploymentId(d.id);
    setEditDeploymentMeta({ providerId: d.providerId, modelId: d.modelId });
    setDEditForm({
      upstreamModel: d.upstreamModel || "",
      displayName: d.displayName || "",
      contextLimit: String(d.contextLimit || 32000),
    });
    setDEditErrors({});
  };
  const saveDeploymentEdit = async () => {
    if (!editDeploymentId) return;
    const errors: { contextLimit?: string } = {};
    const limitNum = Number(dEditForm.contextLimit);
    if (!dEditForm.contextLimit.trim()) {
      errors.contextLimit = "请输入上下文窗口上限";
    } else if (isNaN(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) {
      errors.contextLimit = "上下文窗口上限必须为大于 0 的有效正整数";
    }
    if (Object.keys(errors).length > 0) {
      setDEditErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      setTimeout(() => {
        const el = document.getElementById("edit-deployment-input-contextLimit");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 50);
      return;
    }

    setBusy(`d:edit:${editDeploymentId}`);
    try {
      await authFetch(`/api/admin/model-deployments/${editDeploymentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          upstreamModel: dEditForm.upstreamModel.trim(),
          displayName: dEditForm.displayName.trim(),
          contextLimit: Number(dEditForm.contextLimit) || 32000,
        }),
      });
      toast.success("模型部署已更新");
      setEditDeploymentId(null);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "更新模型部署失败");
    } finally {
      setBusy(null);
    }
  };
  const deleteDeployment = (d: ModelDeployment) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除模型部署",
      message: `确认删除模型部署「${d.providerId}/${d.modelId}」？此操作不可恢复。`,
      warnings: ["注意：若该模型正被设为平台默认模型或被空间模型策略引用，后端将拒绝删除。"],
      type: "danger",
      confirmText: "确认删除",
      onConfirm: async () => {
        setBusy(`d:del:${d.id}`);
        try {
          await authFetch(`/api/admin/model-deployments/${d.id}`, { method: "DELETE" });
          toast.success(`模型部署「${d.modelId}」已成功删除`);
          await load();
        } catch (e) {
          toast.error((e as Error)?.message || "删除模型部署失败");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  /** 打开能力编辑面板：勾选项来自后端下发清单，草稿初始化为该部署当前已声明的能力 */
  const openCapabilityPanel = (row: ModelDeployment) => {
    setCapabilityPanelId(row.id);
    setCapabilityDraft(Array.isArray(row.capabilities) ? [...row.capabilities] : []);
    setCapError(null);
  };

  /** 保存模型能力：写回部署后，组件「能力是否满足」判定立即按新能力生效 */
  const saveCapabilities = async (row: ModelDeployment) => {
    if (capabilityDraft.length === 0) {
      setCapError("模型必须至少声明一项基础能力（如文本生成），否则全站组件将无法调度该模型");
      setTimeout(() => {
        const el = document.getElementById("capability-options-grid");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setBusy(`cap:${row.id}`);
    try {
      await authFetch(`/api/admin/model-deployments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capabilities: capabilityDraft }),
      });
      toast.success(`${row.providerId}/${row.modelId} 的模型能力已保存`);
      setCapabilityPanelId(null);
      await refreshDeploymentsAndDefault();
    } catch (e) {
      toast.error((e as Error)?.message || "保存模型能力失败");
    } finally {
      setBusy(null);
    }
  };

  const createProvider = async () => {
    const errors: { name?: string; baseUrl?: string; apiKeyEnv?: string } = {};
    if (!pForm.name.trim()) {
      errors.name = "请输入供应商标识";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(pForm.name.trim())) {
      errors.name = "供应商标识仅支持英文字母、数字、下划线及中划线";
    }
    if (!pForm.baseUrl.trim()) {
      errors.baseUrl = "请输入 Base URL";
    } else if (!/^https?:\/\/.+/i.test(pForm.baseUrl.trim())) {
      errors.baseUrl = "Base URL 必须以 http:// 或 https:// 开头";
    }
    if (pForm.apiKeyEnv.trim() && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pForm.apiKeyEnv.trim())) {
      errors.apiKeyEnv = "环境变量名格式不正确（如 MODEL_API_KEY）";
    }

    if (Object.keys(errors).length > 0) {
      setPErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["name", "baseUrl", "apiKeyEnv"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`provider-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy("p:create");
    try {
      await authFetch("/api/admin/model-providers", { method: "POST", body: JSON.stringify(pForm) });
      toast.success("供应商已创建");
      setPForm({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "MODEL_API_KEY", apiKey: "" });
      setPErrors({});
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "创建失败");
    } finally {
      setBusy(null);
    }
  };

  const createDeployment = async () => {
    const errors: { providerId?: string; modelId?: string; contextLimit?: string; capabilities?: string } = {};
    if (!dForm.providerId) {
      errors.providerId = "请选择所属供应商通道";
    }
    if (!dForm.modelId.trim()) {
      errors.modelId = "请输入模型代号标识";
    }
    const limitNum = Number(dForm.contextLimit);
    if (!dForm.contextLimit.trim()) {
      errors.contextLimit = "请输入上下文窗口上限";
    } else if (isNaN(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) {
      errors.contextLimit = "上下文窗口上限必须为大于 0 的有效正整数";
    }
    if ((dForm.capabilities as string[]).length === 0) {
      errors.capabilities = "请至少勾选一项抽象能力（如「文本生成」），否则组件无法调度该模型";
    }

    if (Object.keys(errors).length > 0) {
      setDErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["providerId", "modelId", "contextLimit", "capabilities"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`deployment-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy("d:create");
    try {
      await authFetch("/api/admin/model-deployments", {
        method: "POST",
        body: JSON.stringify({
          ...dForm,
          upstreamModel: dForm.upstreamModel.trim() || dForm.modelId.trim(),
          contextLimit: Number(dForm.contextLimit) || 32000,
        }),
      });
      toast.success("模型部署已创建");
      setDForm({
        providerId: dForm.providerId,
        modelId: "",
        upstreamModel: "",
        displayName: "",
        contextLimit: "32000",
        capabilities: [],
      });
      setDErrors({});
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "创建失败");
    } finally {
      setBusy(null);
    }
  };

  // ---------- 价格编辑（供应商成本与用户售价分离；单位：元/100万 Token，后台按微元保存） ----------
  const [pricePanelId, setPricePanelId] = useState<string | null>(null);
  const [priceInfo, setPriceInfo] = useState<{ priceVersion: number; priceStatus: string; priceSource: string } | null>(null);
  const [priceErrors, setPriceErrors] = useState<Record<string, string | undefined>>({});
  const [priceForm, setPriceForm] = useState({
    currency: "CNY",
    priceSource: "UNVERIFIED",
    markupRateBps: "",
    effectiveFrom: "",
    costInput: "",
    costOutput: "",
    costCacheRead: "",
    costCacheWrite: "",
    priceInput: "",
    priceOutput: "",
    priceCacheRead: "",
    priceCacheWrite: "",
  });

  const yuanToMicros = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1_000_000);
  };
  const microsToYuan = (v: number | null): string => (v === null || v === undefined ? "" : String(v / 1_000_000));

  // —— 时段价格（覆盖主流价）——
  type PricePeriodRow = {
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    priority: number;
    weekdays: string | null;
    startTime: string | null;
    endTime: string | null;
    startDate: string | null;
    endDate: string | null;
    costInputMicrosPerMillion: number | null;
    costOutputMicrosPerMillion: number | null;
    costCacheReadMicrosPerMillion: number | null;
    costCacheWriteMicrosPerMillion: number | null;
    priceInputMicrosPerMillion: number | null;
    priceOutputMicrosPerMillion: number | null;
    priceCacheReadMicrosPerMillion: number | null;
    priceCacheWriteMicrosPerMillion: number | null;
    priceSource: string;
    priceStatus: string;
    markupRateBps: number | null;
  };
  const [pricePeriods, setPricePeriods] = useState<PricePeriodRow[]>([]);
  const [periodPanel, setPeriodPanel] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [periodForm, setPeriodForm] = useState({
    name: "",
    kind: "CUSTOM",
    enabled: true,
    priority: "0",
    weekdays: "",
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
    costInput: "",
    costOutput: "",
    costCacheRead: "",
    costCacheWrite: "",
    priceInput: "",
    priceOutput: "",
    priceCacheRead: "",
    priceCacheWrite: "",
    priceSource: "UNVERIFIED",
    markupRateBps: "",
  });
  const [periodErrors, setPeriodErrors] = useState<Record<string, string | undefined>>({});

  const loadPricePeriods = async (deploymentId: string) => {
    try {
      const res = await authFetch(`/api/admin/model-pricing/${deploymentId}/periods`);
      setPricePeriods((res?.data as PricePeriodRow[]) ?? []);
    } catch {
      setPricePeriods([]);
    }
  };

  const periodScheduleText = (p: PricePeriodRow): string => {
    const parts: string[] = [];
    const wdNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    if (p.weekdays && p.startTime && p.endTime) {
      const wd = p.weekdays
        .split(",")
        .map((s) => wdNames[Number(s)] ?? s)
        .filter(Boolean)
        .join("、");
      parts.push(`${wd} ${p.startTime}-${p.endTime}`);
    } else if (p.startTime && p.endTime) {
      parts.push(`每日 ${p.startTime}-${p.endTime}`);
    }
    if (p.startDate && p.endDate) parts.push(`${String(p.startDate).slice(0, 10)} ~ ${String(p.endDate).slice(0, 10)}`);
    else if (p.startDate) parts.push(`自 ${String(p.startDate).slice(0, 10)} 起`);
    else if (p.endDate) parts.push(`至 ${String(p.endDate).slice(0, 10)}`);
    return parts.length ? parts.join("；") : "长期生效";
  };

  const openPeriodEditor = (p?: PricePeriodRow) => {
    if (p) {
      setPeriodForm({
        name: p.name,
        kind: p.kind,
        enabled: p.enabled,
        priority: String(p.priority ?? 0),
        weekdays: p.weekdays ?? "",
        startTime: p.startTime ?? "",
        endTime: p.endTime ?? "",
        startDate: p.startDate ? String(p.startDate).slice(0, 10) : "",
        endDate: p.endDate ? String(p.endDate).slice(0, 10) : "",
        costInput: microsToYuan(p.costInputMicrosPerMillion),
        costOutput: microsToYuan(p.costOutputMicrosPerMillion),
        costCacheRead: microsToYuan(p.costCacheReadMicrosPerMillion),
        costCacheWrite: microsToYuan(p.costCacheWriteMicrosPerMillion),
        priceInput: microsToYuan(p.priceInputMicrosPerMillion),
        priceOutput: microsToYuan(p.priceOutputMicrosPerMillion),
        priceCacheRead: microsToYuan(p.priceCacheReadMicrosPerMillion),
        priceCacheWrite: microsToYuan(p.priceCacheWriteMicrosPerMillion),
        priceSource: p.priceSource,
        markupRateBps: p.markupRateBps === null || p.markupRateBps === undefined ? "" : String(p.markupRateBps),
      });
      setPeriodPanel({ open: true, editingId: p.id });
    } else {
      setPeriodForm({
        name: "",
        kind: "CUSTOM",
        enabled: true,
        priority: "0",
        weekdays: "",
        startTime: "",
        endTime: "",
        startDate: "",
        endDate: "",
        costInput: "",
        costOutput: "",
        costCacheRead: "",
        costCacheWrite: "",
        priceInput: "",
        priceOutput: "",
        priceCacheRead: "",
        priceCacheWrite: "",
        priceSource: "UNVERIFIED",
        markupRateBps: "",
      });
      setPeriodPanel({ open: true, editingId: null });
    }
    setPeriodErrors({});
  };

  const savePeriod = async () => {
    if (!pricePanelId) return;
    const errs: Record<string, string> = {};
    if (!periodForm.name.trim()) errs.name = "时段名称不能为空";
    setPeriodErrors(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, unknown> = {
      name: periodForm.name.trim(),
      kind: periodForm.kind,
      enabled: periodForm.enabled,
      priority: Number(periodForm.priority) || 0,
      weekdays: periodForm.weekdays.trim(),
      startTime: periodForm.startTime.trim(),
      endTime: periodForm.endTime.trim(),
      startDate: periodForm.startDate.trim(),
      endDate: periodForm.endDate.trim(),
      costInput: periodForm.costInput,
      costOutput: periodForm.costOutput,
      costCacheRead: periodForm.costCacheRead,
      costCacheWrite: periodForm.costCacheWrite,
      priceInput: periodForm.priceInput,
      priceOutput: periodForm.priceOutput,
      priceCacheRead: periodForm.priceCacheRead,
      priceCacheWrite: periodForm.priceCacheWrite,
      priceSource: periodForm.priceSource,
      markupRateBps: periodForm.markupRateBps.trim(),
    };
    setBusy(`period:${pricePanelId}`);
    try {
      const url = periodPanel.editingId
        ? `/api/admin/model-pricing/${pricePanelId}/periods/${periodPanel.editingId}`
        : `/api/admin/model-pricing/${pricePanelId}/periods`;
      const res = await authFetch(url, { method: periodPanel.editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (res?.success) {
        toast.success(periodPanel.editingId ? "时段价格已更新" : "时段价格已新增");
        setPeriodPanel({ open: false, editingId: null });
        await loadPricePeriods(pricePanelId);
      } else {
        toast.error((res as { error?: string })?.error || "保存时段价格失败");
      }
    } catch (e) {
      toast.error((e as Error)?.message || "保存时段价格失败");
    } finally {
      setBusy(null);
    }
  };

  const deletePeriod = async (id: string) => {
    if (!pricePanelId) return;
    if (!window.confirm("确认删除该时段价格？删除后该时段将回退为使用主流价。")) return;
    setBusy(`period-del:${id}`);
    try {
      const res = await authFetch(`/api/admin/model-pricing/${pricePanelId}/periods/${id}`, { method: "DELETE" });
      if (res?.success) {
        toast.success("时段价格已删除");
        await loadPricePeriods(pricePanelId);
      } else {
        toast.error((res as { error?: string })?.error || "删除失败");
      }
    } catch (e) {
      toast.error((e as Error)?.message || "删除失败");
    } finally {
      setBusy(null);
    }
  };

  const togglePeriod = async (p: PricePeriodRow) => {
    if (!pricePanelId) return;
    setBusy(`period-toggle:${p.id}`);
    try {
      const res = await authFetch(`/api/admin/model-pricing/${pricePanelId}/periods/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (res?.success) await loadPricePeriods(pricePanelId);
      else toast.error((res as { error?: string })?.error || "操作失败");
    } catch (e) {
      toast.error((e as Error)?.message || "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const openPrice = async (d: ModelDeployment) => {
    setBusy(`price:${d.id}`);
    setPriceErrors({});
    try {
      const res = await authFetch(`/api/admin/model-pricing/${d.id}`);
      const p = res.data?.pricing;
      setPricePanelId(d.id);
      setPriceInfo(p ? { priceVersion: p.priceVersion, priceStatus: p.priceStatus, priceSource: p.priceSource } : null);
      setPriceForm({
        currency: p?.currency ?? "CNY",
        priceSource: p?.priceSource ?? "UNVERIFIED",
        markupRateBps: p?.markupRateBps === null || p?.markupRateBps === undefined ? "" : String(p.markupRateBps),
        effectiveFrom: p?.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : "",
        costInput: microsToYuan(p?.supplierCost?.costInputMicrosPerMillion ?? null),
        costOutput: microsToYuan(p?.supplierCost?.costOutputMicrosPerMillion ?? null),
        costCacheRead: microsToYuan(p?.supplierCost?.costCacheReadMicrosPerMillion ?? null),
        costCacheWrite: microsToYuan(p?.supplierCost?.costCacheWriteMicrosPerMillion ?? null),
        priceInput: microsToYuan(p?.userPrice?.priceInputMicrosPerMillion ?? null),
        priceOutput: microsToYuan(p?.userPrice?.priceOutputMicrosPerMillion ?? null),
        priceCacheRead: microsToYuan(p?.userPrice?.priceCacheReadMicrosPerMillion ?? null),
        priceCacheWrite: microsToYuan(p?.userPrice?.priceCacheWriteMicrosPerMillion ?? null),
      });
      setPricePeriods([]);
      setPeriodPanel({ open: false, editingId: null });
      await loadPricePeriods(d.id);
    } catch (e) {
      toast.error((e as Error)?.message || "读取价格失败");
    } finally {
      setBusy(null);
    }
  };

  const savePrice = async (d: ModelDeployment) => {
    const errors: Record<string, string> = {};
    if (!priceForm.currency.trim()) {
      errors.currency = "请输入结算币种（如 CNY）";
    }

    const priceKeys = [
      "costInput",
      "costOutput",
      "costCacheRead",
      "costCacheWrite",
      "priceInput",
      "priceOutput",
      "priceCacheRead",
      "priceCacheWrite",
    ] as const;

    for (const key of priceKeys) {
      const val = (priceForm as Record<string, string>)[key].trim();
      if (val !== "") {
        const n = Number(val);
        if (isNaN(n) || n < 0) {
          errors[key] = "金额必须为大于或等于 0 的有效数字";
        }
      }
    }

    if (priceForm.markupRateBps.trim() !== "") {
      const bp = Number(priceForm.markupRateBps.trim());
      if (isNaN(bp) || !Number.isInteger(bp) || bp < 0) {
        errors.markupRateBps = "加价率必须为大于或等于 0 的有效整数基点";
      }
    }

    if (Object.keys(errors).length > 0) {
      setPriceErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const order = ["currency", ...priceKeys, "markupRateBps"];
      const firstKey = order.find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`price-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }
    setBusy(`price:${d.id}`);
    try {
      const body = {
        currency: priceForm.currency,
        priceSource: priceForm.priceSource,
        markupRateBps: priceForm.markupRateBps === "" ? null : Number(priceForm.markupRateBps),
        effectiveFrom: priceForm.effectiveFrom ? `${priceForm.effectiveFrom}T00:00:00.000Z` : null,
        costInputMicrosPerMillion: yuanToMicros(priceForm.costInput),
        costOutputMicrosPerMillion: yuanToMicros(priceForm.costOutput),
        costCacheReadMicrosPerMillion: yuanToMicros(priceForm.costCacheRead),
        costCacheWriteMicrosPerMillion: yuanToMicros(priceForm.costCacheWrite),
        priceInputMicrosPerMillion: yuanToMicros(priceForm.priceInput),
        priceOutputMicrosPerMillion: yuanToMicros(priceForm.priceOutput),
        priceCacheReadMicrosPerMillion: yuanToMicros(priceForm.priceCacheRead),
        priceCacheWriteMicrosPerMillion: yuanToMicros(priceForm.priceCacheWrite),
      };
      await authFetch(`/api/admin/model-pricing/${d.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success("价格已保存（历史任务快照不变）");
      await openPrice(d);
    } catch (e) {
      toast.error((e as Error)?.message || "保存价格失败");
    } finally {
      setBusy(null);
    }
  };

  // 弹窗标题用可读的 providerId/modelId（避免裸 UUID 撑破 header 导致溢出错乱）
  const priceDep = pricePanelId ? deployments.find((x) => x.id === pricePanelId) ?? null : null;
  const capDep = capabilityPanelId ? deployments.find((x) => x.id === capabilityPanelId) ?? null : null;

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题（与后台其他管理页规格严格一致） */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
              <Cpu className="w-5 h-5" />
            </span>
            <span>模型注册表</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            管理模型供应商与模型部署：配置接口地址、模型能力、价格与平台默认模型。禁用后组件立即拒绝执行，且不会回落环境变量；密钥不入库，仅保存环境变量名。
          </p>
        </div>

        {/* 顶部快捷跳转与刷新按钮 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href="/admin/workspaces/model-policy"
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="前往按空间配置默认模型与可用白名单"
          >
            <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>空间模型策略</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
            title="刷新模型注册表数据"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 统计指标卡片（与全站管理后台标准指标卡片规格保持 100% 一致） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 卡片 1：供应商总数 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">供应商总数</div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-800">{providers.length}</div>
          </div>
          <div className="w-10 h-10 rounded bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Server className="w-5 h-5" />
          </div>
        </div>

        {/* 卡片 2：模型部署总数 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">模型部署总数</div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-800">{deployments.length}</div>
          </div>
          <div className="w-10 h-10 rounded bg-purple-50 border border-purple-100/80 text-[#805ad5] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* 卡片 3：已启用部署 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">已启用部署</div>
            <div className="text-2xl font-black font-mono tracking-tight text-emerald-600">
              {deployments.filter((d) => d.enabled).length}
            </div>
          </div>
          <div className="w-10 h-10 rounded bg-emerald-50 border border-emerald-100/80 text-emerald-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载模型注册表数据...</span>
        </div>
      ) : (
        <>
          {/* 平台默认模型：来自数据库配置，为「未配置空间默认」的空间兜底裁决 */}
          <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border-b border-blue-100/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[#3182ce] text-white flex items-center justify-center shadow-xs">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>平台默认模型</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">
                      兜底裁决
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    未配置空间专属默认模型时，组件任务将自动采用此处的平台默认模型
                  </p>
                </div>
              </div>

              {/* 当前默认模型状态展示 */}
              <div>
                {platformDefault?.deployment ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>
                      当前默认：{platformDefault.deployment.providerId} / {platformDefault.deployment.modelId}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>尚未配置平台默认模型</span>
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  未配置空间专属默认模型时，组件执行将选用此处设定的全站默认部署；若两者皆未配置，系统将无法调度模型执行任务。备选项实时来自数据库部署列表。
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <select
                  className={`${inputCls} sm:max-w-md py-2.5 font-bold cursor-pointer`}
                  value={selectedDefault}
                  onChange={(e) => setSelectedDefault(e.target.value)}
                >
                  <option value="">（不设置 / 清除平台默认）</option>
                  {deployments.map((d) => (
                    <option key={d.id} value={d.id} disabled={!d.enabled}>
                      {d.providerId} / {d.modelId} · {d.displayName || d.modelId}
                      {d.enabled ? "" : "（已禁用，不可作为默认模型）"}
                      {platformDefault?.deploymentId === d.id ? " [当前默认]" : ""}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`${btnCls} flex items-center gap-1.5`}
                    disabled={savingDefault || deployments.find((d) => d.id === selectedDefault)?.enabled !== true}
                    onClick={() => savePlatformDefault(selectedDefault || null)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingDefault ? "保存中..." : "保存平台默认"}</span>
                  </button>

                  <button
                    type="button"
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-95"
                    disabled={savingDefault || !platformDefault?.deploymentId}
                    onClick={() => savePlatformDefault(null)}
                  >
                    清除默认
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 模型供应商列表与新增 */}
          <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800 tracking-tight">模型供应商 (Providers)</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    管理对接的厂商通道、接口协议与密钥环境变量索引
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                {providers.length} 个供应商
              </span>
            </div>

            {/* 新增供应商 Bento 表单 */}
            <div className="m-6 p-5 rounded-lg border border-slate-200/80 bg-white shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Plus className="w-4 h-4 text-[#3182ce]" />
                <span>新增供应商通道</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">供应商标识 (providerId) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="provider-input-name"
                    className={getInputCls(!!pErrors.name)}
                    placeholder="如 deepseek、openai（创建后不可修改）"
                    value={pForm.name}
                    onChange={(e) => {
                      setPForm({ ...pForm, name: e.target.value });
                      if (pErrors.name) setPErrors({ ...pErrors, name: undefined });
                    }}
                  />
                  {pErrors.name && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.name}</span>
                    </p>
                  )}
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">接口协议</span>
                  <select
                    className={inputCls}
                    value={pForm.protocol}
                    onChange={(e) => setPForm({ ...pForm, protocol: e.target.value })}
                  >
                    <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / vLLM 等兼容网关）</option>
                    <option value="ANTHROPIC">ANTHROPIC（Claude）</option>
                    <option value="GEMINI">GEMINI（Google Gemini）</option>
                  </select>
                  <span className="block text-[11px] text-slate-400">选择与模型服务匹配的协议，适配器按此分发请求格式</span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">Base URL（必须为 https 地址） <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="provider-input-baseUrl"
                    className={getInputCls(!!pErrors.baseUrl)}
                    placeholder="https://api.deepseek.com/v1"
                    value={pForm.baseUrl}
                    onChange={(e) => {
                      setPForm({ ...pForm, baseUrl: e.target.value });
                      if (pErrors.baseUrl) setPErrors({ ...pErrors, baseUrl: undefined });
                    }}
                  />
                  {pErrors.baseUrl && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.baseUrl}</span>
                    </p>
                  )}
                  <span className="block text-[11px] text-slate-400">
                    平台会自动拼接 <code>/chat/completions</code>；明文 http 地址仅在本地调试且开启 <code>MODEL_ALLOW_INSECURE_LOCAL</code> 时可用
                  </span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">密钥环境变量名 <span className="text-slate-400 font-normal">（可选，本地/自托管模型可留空）</span></span>
                  <input
                    id="provider-input-apiKeyEnv"
                    className={getInputCls(!!pErrors.apiKeyEnv)}
                    placeholder="MODEL_API_KEY 或 DEEPSEEK_API_KEY"
                    value={pForm.apiKeyEnv}
                    onChange={(e) => {
                      setPForm({ ...pForm, apiKeyEnv: e.target.value });
                      if (pErrors.apiKeyEnv) setPErrors({ ...pErrors, apiKeyEnv: undefined });
                    }}
                  />
                  {pErrors.apiKeyEnv && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.apiKeyEnv}</span>
                    </p>
                  )}
                  <span className="block text-[11px] text-slate-400">
                    安全红线：密钥严禁直接入库。此处仅保存服务器环境变量键名，实际执行时由服务端进程读取；留空表示模型无需密钥（如 Ollama、vLLM 等本地/自托管模型）
                  </span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">API Key 直接录入 <span className="text-slate-400 font-normal">（可选，留空则改用上方环境变量名）</span></span>
                  <input
                    id="provider-input-apiKey"
                    type="password"
                    autoComplete="new-password"
                    className={getInputCls(false)}
                    placeholder="sk-... 明文录入后由服务端加密存储，不进数据库明文"
                    value={pForm.apiKey}
                    onChange={(e) => setPForm({ ...pForm, apiKey: e.target.value })}
                  />
                  <span className="block text-[11px] text-slate-400">
                    录入后密钥以 AES-256-GCM 密文落库；与「密钥环境变量名」二选一，密文优先。无需密钥的本地模型两项均可留空
                  </span>
                </label>
              </div>

              <div className="pt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  disabled={busy === "p:create"}
                  onClick={() => {
                    setPForm({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "", apiKey: "" });
                    setPErrors({});
                  }}
                  title="清空当前输入的所有供应商通道信息"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>清除</span>
                </button>
                <button
                  type="button"
                  className={`${btnCls} flex items-center gap-1.5`}
                  disabled={busy === "p:create"}
                  onClick={createProvider}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{busy === "p:create" ? "正在创建..." : "确认新增供应商"}</span>
                </button>
              </div>
            </div>

            {/* 供应商列表表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px] table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-y border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">名称标识</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">协议格式</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Base URL</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">环境变量名</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">状态</th>
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedProviders.map((p) => (
                    <tr key={p.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">{p.name}</td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs whitespace-nowrap">{p.protocol}</td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs font-mono whitespace-nowrap">{p.baseUrl}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-500 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                            {p.apiKeyEnv || "（无需密钥）"}
                          </span>
                          {!p.apiKeyEnv ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                              免鉴权
                            </span>
                          ) : p.apiKeyConfigured ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              密钥就绪
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap"
                              title="服务端运行时未找到该环境变量，组件执行将报 MODEL_NOT_CONFIGURED"
                            >
                              密钥未配置
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                            p.enabled
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {p.enabled ? "已启用" : "已禁用"}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-white group-hover:bg-blue-50/50 backdrop-blur-xs z-10 px-6 py-3.5 text-right whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold transition-all duration-200 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 ${
                              p.enabled
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                            }`}
                            disabled={busy === `p:${p.id}`}
                            onClick={() => toggleProvider(p)}
                            title={p.enabled ? "停用该供应商通道" : "启用该供应商通道"}
                          >
                            {p.enabled ? (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                <span>禁用通道</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>启用通道</span>
                              </>
                            )}
                          </button>

                          {!p.enabled && (
                            <>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                                onClick={() => openProviderEdit(p)}
                                title="编辑供应商通道（标识不可修改）"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span>编辑</span>
                              </button>

                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                disabled={busy === `p:del:${p.id}`}
                                onClick={() => deleteProvider(p)}
                                title="删除供应商通道（其下需无模型部署且非平台默认）"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{busy === `p:del:${p.id}` ? "删除中..." : "删除"}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {providers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <Server className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <span className="text-xs font-bold text-slate-500">暂无供应商通道</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 供应商列表分页 */}
            {providers.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={providerPage}
                  totalItems={providers.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setProviderPage(p)}
                  itemLabel="个供应商"
                />
              </div>
            )}
          </section>

          {/* 模型部署列表与新增 */}
          <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-purple-50 border border-purple-100 text-[#805ad5] flex items-center justify-center font-bold shadow-2xs">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800 tracking-tight">模型部署 (Deployments)</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    管理具体模型代号、上下文上限、组件能力声明及 Token 计费单价
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                {deployments.length} 款模型
              </span>
            </div>

            {/* 新增模型部署 Bento 表单 */}
            <div className="m-6 p-5 rounded-lg border border-slate-200/80 bg-white shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Plus className="w-4 h-4 text-[#3182ce]" />
                <span>新增模型部署</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">所属供应商 <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <select
                    id="deployment-input-providerId"
                    className={getInputCls(!!dErrors.providerId, "font-bold cursor-pointer")}
                    value={dForm.providerId}
                    onChange={(e) => {
                      setDForm({ ...dForm, providerId: e.target.value });
                      if (dErrors.providerId) setDErrors({ ...dErrors, providerId: undefined });
                    }}
                  >
                    <option value="">请选择供应商通道</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {dErrors.providerId && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{dErrors.providerId}</span>
                    </p>
                  )}
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">模型代号标识 <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="deployment-input-modelId"
                    className={getInputCls(!!dErrors.modelId)}
                    placeholder="平台内部代号，如 deepseek-chat"
                    value={dForm.modelId}
                    onChange={(e) => {
                      setDForm({ ...dForm, modelId: e.target.value });
                      if (dErrors.modelId) setDErrors({ ...dErrors, modelId: undefined });
                    }}
                  />
                  {dErrors.modelId && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{dErrors.modelId}</span>
                    </p>
                  )}
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">上游模型真实名称</span>
                  <input
                    className={inputCls}
                    placeholder="真正下发厂商的 model（如 deepseek-chat）"
                    value={dForm.upstreamModel}
                    onChange={(e) => setDForm({ ...dForm, upstreamModel: e.target.value })}
                  />
                  <span className="block text-[11px] text-slate-400">留空则直接以下方代号下发</span>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">用户端展示名称</span>
                  <input
                    className={inputCls}
                    placeholder="如 DeepSeek V3 极速版"
                    value={dForm.displayName}
                    onChange={(e) => setDForm({ ...dForm, displayName: e.target.value })}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">上下文窗口上限 (Token) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="deployment-input-contextLimit"
                    className={getInputCls(!!dErrors.contextLimit)}
                    placeholder="如 32000、64000、128000"
                    value={dForm.contextLimit}
                    onChange={(e) => {
                      setDForm({ ...dForm, contextLimit: e.target.value });
                      if (dErrors.contextLimit) setDErrors({ ...dErrors, contextLimit: undefined });
                    }}
                  />
                  {dErrors.contextLimit && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{dErrors.contextLimit}</span>
                    </p>
                  )}
                </label>

                <label className="block space-y-1 sm:col-span-3">
                  <span className="text-xs font-bold text-slate-600">
                    抽象能力声明 <span className="text-red-500 font-bold ml-0.5">*</span>
                  </span>
                  <div id="create-capability-grid" className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {capabilityOptions.map((opt) => {
                      const checked = (dForm.capabilities as string[]).includes(opt.value);
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() =>
                            setDForm({
                              ...dForm,
                              capabilities: checked
                                ? (dForm.capabilities as string[]).filter((v) => v !== opt.value)
                                : [...(dForm.capabilities as string[]), opt.value],
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-bold transition-all cursor-pointer ${
                            checked
                              ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                              checked ? "bg-white/20 border-white" : "border-slate-300"
                            }`}
                          >
                            {checked && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {dErrors.capabilities && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{dErrors.capabilities}</span>
                    </p>
                  )}
                </label>
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed">
                创建时已在上方声明抽象能力；创建后还需：① 点击「价格」配置 Token 单价；② 在上方「平台默认模型」或「空间模型策略」中指定该模型生效，组件即可立即调度。
              </div>

              <div className="pt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  disabled={busy === "d:create"}
                  onClick={() => {
                    setDForm({
                      providerId: "",
                      modelId: "",
                      upstreamModel: "",
                      displayName: "",
                      contextLimit: "32000",
                      capabilities: [],
                    });
                    setDErrors({});
                  }}
                  title="清空当前输入的所有模型部署信息与勾选能力"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>清除</span>
                </button>
                <button
                  type="button"
                  className={`${btnCls} flex items-center gap-1.5`}
                  disabled={busy === "d:create"}
                  onClick={createDeployment}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{busy === "d:create" ? "正在创建..." : "确认新增模型部署"}</span>
                </button>
              </div>
            </div>

            {/* 测试通道结果反馈 */}
            {testResult && (
              <div
                className={
                  "mt-4 rounded border p-4 space-y-2 " +
                  (testResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")
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

            {/* 模型部署列表表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px] table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-y border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">供应商</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">模型标识</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">展示名 / 上游名称</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">上下文</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">声明能力</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">计费单价(百万TOKEN)</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">状态</th>
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedDeployments.map((d) => (
                    <tr key={d.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-700 font-bold whitespace-nowrap">{d.providerId}</td>
                      <td className="px-6 py-3.5 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
                        <span className="text-[#3182ce]">{d.modelId}</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="font-bold text-slate-800">{d.displayName || d.modelId}</span>
                          {d.upstreamModel && d.upstreamModel !== (d.displayName || d.modelId) && (
                            <span className="text-[11px] font-mono text-slate-400">({d.upstreamModel})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {d.contextLimit ? `${(d.contextLimit / 1000).toFixed(0)}K` : "32K"}
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
                          {Array.isArray(d.capabilities) && d.capabilities.length > 0 ? (
                            d.capabilities.map((c) => (
                              <span
                                key={c}
                                className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/80 whitespace-nowrap"
                              >
                                {capabilityOptions.find((o) => o.value === c)?.label ?? c}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                              未声明能力
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {d.pricing ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-mono text-xs text-slate-800 font-bold whitespace-nowrap">
                              入: {d.pricing.priceInputMicrosPerMillion === null ? "—" : `¥${(d.pricing.priceInputMicrosPerMillion / 1_000_000).toFixed(2)}`} / 出: {d.pricing.priceOutputMicrosPerMillion === null ? "—" : `¥${(d.pricing.priceOutputMicrosPerMillion / 1_000_000).toFixed(2)}`}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                              v{d.pricing.priceVersion} · {priceStatusLabel(d.pricing.priceStatus)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs whitespace-nowrap">未配置价格</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                              !d.enabled
                                ? "bg-slate-100 text-slate-500 border-slate-200"
                                : providers.find((p) => p.name === d.providerId)?.enabled === false
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {!d.enabled
                              ? "已禁用"
                              : providers.find((p) => p.name === d.providerId)?.enabled === false
                                ? "通道已禁用"
                                : "已启用"}
                          </span>
                          {platformDefault?.deploymentId === d.id && (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200 text-[10px] font-black">
                              平台默认
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="sticky right-0 bg-white group-hover:bg-blue-50/50 backdrop-blur-xs z-10 px-6 py-3 text-right whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white border border-cyan-200/80 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                            disabled={testingId === d.id || !canTestDeployment(d, providers)}
                            onClick={() => testDeployment(d)}
                            title={
                              !canTestDeployment(d, providers)
                                ? testBlockReason(d, providers) ?? "无法执行通道测试"
                                : "用该部署所属供应商端点与密钥真实发一次最小调用，验证模型连通性"
                            }
                          >
                            {testingId === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <TestTube className="w-3.5 h-3.5" />
                            )}
                            <span>测试通道</span>
                          </button>

                          {providers.find((p) => p.name === d.providerId)?.enabled === false ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded font-bold text-xs cursor-not-allowed"
                              title="该部署所属供应商通道已禁用，此模型当前无法被组件执行；请先在上方供应商列表启用该通道"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>通道已停用</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 ${
                                d.enabled
                                  ? "bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white border border-amber-200/80"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200/80"
                              }`}
                              disabled={busy === `d:${d.id}`}
                              onClick={() => toggleDeployment(d)}
                              title={d.enabled ? "禁用该模型部署" : "启用该模型部署"}
                            >
                              {d.enabled ? (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>禁用</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>启用</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* 次要操作统一收进「⋯」菜单：价格 / 能力 / 编辑（仅禁用时）/ 删除（仅禁用时） */}
                          <button
                            type="button"
                            className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 border ${
                              actionMenu?.id === d.id
                                ? "bg-[#3182ce] text-white border-[#3182ce]"
                                : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 border-slate-200"
                            }`}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActionMenu((prev) =>
                                prev?.id === d.id
                                  ? null
                                  : { id: d.id, top: rect.bottom + 6, right: window.innerWidth - rect.right }
                              );
                            }}
                            title="更多操作"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {deployments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        <Cpu className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <span className="text-xs font-bold text-slate-500">暂无模型部署</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 模型部署列表分页 */}
            {deployments.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={deploymentPage}
                  totalItems={deployments.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setDeploymentPage(p)}
                  itemLabel="个模型部署"
                />
              </div>
            )}
          </section>

          {/* 部署行「⋯」更多操作下拉菜单：fixed 定位避免被表格 overflow-x-auto 裁剪，遮罩点击关闭 */}
          {actionMenu &&
            (() => {
              const menuDep = deployments.find((x) => x.id === actionMenu.id);
              if (!menuDep) return null;
              const menuItems: { label: string; icon: ReactNode; cls: string; action: () => void }[] = [
                {
                  label: "价格",
                  icon: <Coins className="w-3.5 h-3.5" />,
                  cls: "text-[#3182ce] hover:bg-blue-50",
                  action: () => openPrice(menuDep),
                },
                {
                  label: "能力",
                  icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
                  cls: "text-[#805ad5] hover:bg-purple-50",
                  action: () => openCapabilityPanel(menuDep),
                },
              ];
              if (!menuDep.enabled) {
                menuItems.push(
                  {
                    label: "编辑",
                    icon: <Settings className="w-3.5 h-3.5" />,
                    cls: "text-slate-600 hover:bg-slate-100",
                    action: () => openDeploymentEdit(menuDep),
                  },
                  {
                    label: "删除",
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                    cls: "text-rose-600 hover:bg-rose-50",
                    action: () => deleteDeployment(menuDep),
                  },
                );
              }
              return (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setActionMenu(null)} />
                  <div
                    className="fixed z-[60] w-36 bg-white rounded-lg border border-slate-200 shadow-xl py-1 animate-in fade-in-50 zoom-in-95 duration-150"
                    style={{ top: actionMenu.top, right: actionMenu.right }}
                  >
                    {menuItems.map((it) => (
                      <button
                        key={it.label}
                        type="button"
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${it.cls}`}
                        onClick={() => {
                          setActionMenu(null);
                          it.action();
                        }}
                      >
                        {it.icon}
                        <span>{it.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

          {/* 价格配置模态弹窗 (遵循知阁·舟坊设计系统与系统级 Modal 规范) */}
          {pricePanelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                {/* 弹窗头部 Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Coins className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-slate-800 tracking-tight">
                          价格配置 · {priceDep ? `${priceDep.providerId}/${priceDep.modelId}` : pricePanelId}
                        </h3>
                        {priceInfo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
                            v{priceInfo.priceVersion} · {priceStatusLabel(priceInfo.priceStatus)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        配置该模型的供应商成本底价与平台用户端划扣单价，单位：元 / 100万 Token
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPricePanelId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 弹窗主体 Body */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
                  {/* 说明提示条 */}
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                    <div>
                      平台采用<b>微元</b>（1 元 = 1,000,000 微元）进行纳秒级精确算力核算。修改价格保存后仅对新任务生效，历史已生成账单快照严格锁定不变。
                    </div>
                  </div>

                  {/* 板块 1：结算规则与状态 */}
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-[#3182ce] before:rounded-full">
                      结算规则与生效期
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold flex items-center gap-0.5">
                          币种 <span className="text-red-500 font-bold">*</span>
                        </span>
                        <input
                          id="price-input-currency"
                          className={getInputCls(!!priceErrors.currency)}
                          placeholder="如 CNY / USD"
                          value={priceForm.currency}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, currency: e.target.value });
                            if (priceErrors.currency) setPriceErrors({ ...priceErrors, currency: undefined });
                          }}
                        />
                        {priceErrors.currency && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.currency}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">价格来源状态</span>
                        <select
                          className={inputCls}
                          value={priceForm.priceSource}
                          onChange={(e) => setPriceForm({ ...priceForm, priceSource: e.target.value })}
                        >
                          <option value="UNVERIFIED">未验证</option>
                          <option value="OBSERVED_ONLY">仅观测</option>
                          <option value="VERIFIED">已验证</option>
                        </select>
                        <p
                          className={
                            "text-[11px] leading-relaxed mt-1 " +
                            (priceForm.priceSource === "VERIFIED"
                              ? "text-emerald-600"
                              : priceForm.priceSource === "OBSERVED_ONLY"
                                ? "text-amber-600"
                                : "text-slate-400")
                          }
                        >
                          {priceForm.priceSource === "VERIFIED"
                            ? "已验证：抄自供应商官网/合同的真实价格。提交后系统自动判定为「已生效」，计费会正式采信这组价格。"
                            : priceForm.priceSource === "OBSERVED_ONLY"
                              ? "仅观测：只记录真实调用观测到的成本，不能当成确认售价，结算不予采信（不可用于扣费）。"
                              : "未验证：仅作占位/草稿。哪怕填了数字，系统也按「未配置」处理，计费不采信（不会真扣）。"}
                        </p>
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">平台加价率 (基点 bp)</span>
                        <input
                          id="price-input-markupRateBps"
                          className={getInputCls(!!priceErrors.markupRateBps)}
                          placeholder="如 2000 = 20%"
                          value={priceForm.markupRateBps}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, markupRateBps: e.target.value });
                            if (priceErrors.markupRateBps) setPriceErrors({ ...priceErrors, markupRateBps: undefined });
                          }}
                        />
                        {priceErrors.markupRateBps && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.markupRateBps}</span>
                          </p>
                        )}
                        {/* 两种定价模式互斥：实时提示，避免保存时才被接口拒绝 */}
                        {(() => {
                          const markupFilled = priceForm.markupRateBps.trim() !== "";
                          const priceFilled = [priceForm.priceInput, priceForm.priceOutput, priceForm.priceCacheRead, priceForm.priceCacheWrite].some(
                            (v) => v.trim() !== "",
                          );
                          if (markupFilled && priceFilled) {
                            return (
                              <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1 leading-relaxed">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>「用户端售价」与「加价率」同时填会冲突：两套定价模式互斥，请清空其中一组再保存。</span>
                              </p>
                            );
                          }
                          return (
                            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                              定价模式二选一（系统按填写自动判定）：① 本项留空 + 填「用户端售价」= 直接定价，用户被扣多少就按你填的售价；
                              ② 本项填值 + 「用户端售价」全留空 + 填「供应商成本」= 成本加成，售价由系统自动算：售价 = 成本 × (1 + bp/10000)。
                            </p>
                          );
                        })()}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">生效时间</span>
                        <input
                          type="date"
                          className={inputCls}
                          value={priceForm.effectiveFrom}
                          onChange={(e) => setPriceForm({ ...priceForm, effectiveFrom: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 板块 2：供应商成本底价（元 / 100万 Token） */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-slate-500 before:rounded-full">
                        供应商上游成本底价
                      </h4>
                      <span className="text-[11px] text-slate-400 font-mono">单位: 元 / 100万 Token</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输入 Token 成本</span>
                        <input
                          id="price-input-costInput"
                          className={getInputCls(!!priceErrors.costInput)}
                          placeholder="如 2.50"
                          value={priceForm.costInput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costInput: e.target.value });
                            if (priceErrors.costInput) setPriceErrors({ ...priceErrors, costInput: undefined });
                          }}
                        />
                        {priceErrors.costInput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costInput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输出 Token 成本</span>
                        <input
                          id="price-input-costOutput"
                          className={getInputCls(!!priceErrors.costOutput)}
                          placeholder="如 10.00"
                          value={priceForm.costOutput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costOutput: e.target.value });
                            if (priceErrors.costOutput) setPriceErrors({ ...priceErrors, costOutput: undefined });
                          }}
                        />
                        {priceErrors.costOutput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costOutput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存命中读取成本</span>
                        <input
                          id="price-input-costCacheRead"
                          className={getInputCls(!!priceErrors.costCacheRead)}
                          placeholder="如 0.50"
                          value={priceForm.costCacheRead}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costCacheRead: e.target.value });
                            if (priceErrors.costCacheRead) setPriceErrors({ ...priceErrors, costCacheRead: undefined });
                          }}
                        />
                        {priceErrors.costCacheRead && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costCacheRead}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存写入成本</span>
                        <input
                          id="price-input-costCacheWrite"
                          className={getInputCls(!!priceErrors.costCacheWrite)}
                          placeholder="如 2.50"
                          value={priceForm.costCacheWrite}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costCacheWrite: e.target.value });
                            if (priceErrors.costCacheWrite) setPriceErrors({ ...priceErrors, costCacheWrite: undefined });
                          }}
                        />
                        {priceErrors.costCacheWrite && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costCacheWrite}</span>
                          </p>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 板块 3：用户端售价定价（元 / 100万 Token） */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-[#3182ce] before:rounded-full">
                        用户端划扣售价
                      </h4>
                      <span className="text-[11px] text-[#3182ce] font-bold">实际扣费依据 · 单位: 元 / 100万 Token</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输入 Token 售价</span>
                        <input
                          id="price-input-priceInput"
                          className={getInputCls(!!priceErrors.priceInput)}
                          placeholder="如 3.00"
                          value={priceForm.priceInput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceInput: e.target.value });
                            if (priceErrors.priceInput) setPriceErrors({ ...priceErrors, priceInput: undefined });
                          }}
                        />
                        {priceErrors.priceInput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceInput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输出 Token 售价</span>
                        <input
                          id="price-input-priceOutput"
                          className={getInputCls(!!priceErrors.priceOutput)}
                          placeholder="如 12.00"
                          value={priceForm.priceOutput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceOutput: e.target.value });
                            if (priceErrors.priceOutput) setPriceErrors({ ...priceErrors, priceOutput: undefined });
                          }}
                        />
                        {priceErrors.priceOutput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceOutput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存命中读取售价</span>
                        <input
                          id="price-input-priceCacheRead"
                          className={getInputCls(!!priceErrors.priceCacheRead)}
                          placeholder="如 0.60"
                          value={priceForm.priceCacheRead}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceCacheRead: e.target.value });
                            if (priceErrors.priceCacheRead) setPriceErrors({ ...priceErrors, priceCacheRead: undefined });
                          }}
                        />
                        {priceErrors.priceCacheRead && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceCacheRead}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存写入售价</span>
                        <input
                          id="price-input-priceCacheWrite"
                          className={getInputCls(!!priceErrors.priceCacheWrite)}
                          placeholder="如 3.00"
                          value={priceForm.priceCacheWrite}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceCacheWrite: e.target.value });
                            if (priceErrors.priceCacheWrite) setPriceErrors({ ...priceErrors, priceCacheWrite: undefined });
                          }}
                        />
                        {priceErrors.priceCacheWrite && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceCacheWrite}</span>
                          </p>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 板块 4：时段价格（覆盖主流价） */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-purple-500 before:rounded-full">
                        时段价格（覆盖主流价）
                      </h4>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-bold hover:bg-purple-100 transition-colors cursor-pointer"
                        onClick={() => openPeriodEditor()}
                      >
                        + 新增时段
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      为闲时 / 高峰 / 节日等自定义时段设置不同单价；结算时按当前时钟+日期自动选用命中的时段价，无命中则回退上面的主流价。每条可启用 / 禁用 / 编辑 / 删除。
                    </p>
                    {pricePeriods.length === 0 ? (
                      <div className="text-[11px] text-slate-400 bg-slate-50/60 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                        暂无时段价格，当前仅使用主流价。
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pricePeriods.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 bg-slate-50/60 border border-slate-200/80 rounded-lg p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-800">{p.name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                                  {p.kind === "IDLE" ? "闲时" : p.kind === "PEAK" ? "高峰" : p.kind === "HOLIDAY" ? "节日" : "自定义"}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    p.enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                                  }`}
                                >
                                  {p.enabled ? "已启用" : "已禁用"}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 truncate">{periodScheduleText(p)}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                              <input type="checkbox" className="sr-only peer" checked={p.enabled} onChange={() => togglePeriod(p)} />
                              <div className="w-9 h-5 bg-slate-200 peer-checked:bg-[#3182ce] rounded-full transition-colors" />
                              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                            </label>
                            <button
                              type="button"
                              className="text-[11px] text-slate-500 hover:text-[#3182ce] font-bold cursor-pointer shrink-0"
                              onClick={() => openPeriodEditor(p)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer shrink-0"
                              onClick={() => deletePeriod(p.id)}
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 时段价格编辑子面板 */}
                  {periodPanel.open && (
                    <div className="space-y-3 border border-purple-200/70 rounded-xl p-3.5 bg-purple-50/30">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-purple-700">{periodPanel.editingId ? "编辑时段价格" : "新增时段价格"}</h5>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                          onClick={() => setPeriodPanel({ open: false, editingId: null })}
                        >
                          收起
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">
                            时段名称 <span className="text-red-500">*</span>
                          </span>
                          <input
                            className={getInputCls(!!periodErrors.name)}
                            placeholder="如 闲时"
                            value={periodForm.name}
                            onChange={(e) => {
                              setPeriodForm({ ...periodForm, name: e.target.value });
                              if (periodErrors.name) setPeriodErrors({ ...periodErrors, name: undefined });
                            }}
                          />
                          {periodErrors.name && <p className="text-[11px] text-red-500">{periodErrors.name}</p>}
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">类型</span>
                          <select className={inputCls} value={periodForm.kind} onChange={(e) => setPeriodForm({ ...periodForm, kind: e.target.value })}>
                            <option value="IDLE">闲时</option>
                            <option value="PEAK">高峰</option>
                            <option value="HOLIDAY">节日</option>
                            <option value="CUSTOM">自定义</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">优先级</span>
                          <input className={inputCls} placeholder="0" value={periodForm.priority} onChange={(e) => setPeriodForm({ ...periodForm, priority: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 flex items-center gap-2">
                          <input type="checkbox" checked={periodForm.enabled} onChange={(e) => setPeriodForm({ ...periodForm, enabled: e.target.checked })} />
                          <span className="font-bold">启用该时段</span>
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block sm:col-span-2">
                          <span className="font-bold">星期几（1-7 逗号，如 1,2,3,4,5；留空=每天）</span>
                          <input className={inputCls} placeholder="留空=每天" value={periodForm.weekdays} onChange={(e) => setPeriodForm({ ...periodForm, weekdays: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">开始时间</span>
                          <input type="time" className={inputCls} value={periodForm.startTime} onChange={(e) => setPeriodForm({ ...periodForm, startTime: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">结束时间</span>
                          <input type="time" className={inputCls} value={periodForm.endTime} onChange={(e) => setPeriodForm({ ...periodForm, endTime: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">起始日期</span>
                          <input type="date" className={inputCls} value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">结束日期</span>
                          <input type="date" className={inputCls} value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">价格来源状态</span>
                          <select className={inputCls} value={periodForm.priceSource} onChange={(e) => setPeriodForm({ ...periodForm, priceSource: e.target.value })}>
                            <option value="UNVERIFIED">未验证</option>
                            <option value="OBSERVED_ONLY">仅观测</option>
                            <option value="VERIFIED">已验证</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">平台加价率 (bp)</span>
                          <input className={inputCls} placeholder="如 2000=20%，留空走直接定价" value={periodForm.markupRateBps} onChange={(e) => setPeriodForm({ ...periodForm, markupRateBps: e.target.value })} />
                        </label>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-600 mb-1">供应商成本（元 / 100万 Token）</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            ["costInput", "输入"],
                            ["costOutput", "输出"],
                            ["costCacheRead", "缓存命中读取"],
                            ["costCacheWrite", "缓存写入"],
                          ].map(([k, label]) => (
                            <label key={k} className="text-xs text-slate-700 space-y-1 block">
                              <span className="font-bold">{label}</span>
                              <input
                                className={inputCls}
                                placeholder="0"
                                value={(periodForm as unknown as Record<string, string>)[k]}
                                onChange={(e) => setPeriodForm({ ...periodForm, [k]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-600 mb-1">用户端售价（元 / 100万 Token）</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            ["priceInput", "输入"],
                            ["priceOutput", "输出"],
                            ["priceCacheRead", "缓存命中读取"],
                            ["priceCacheWrite", "缓存写入"],
                          ].map(([k, label]) => (
                            <label key={k} className="text-xs text-slate-700 space-y-1 block">
                              <span className="font-bold">{label}</span>
                              <input
                                className={inputCls}
                                placeholder="0"
                                value={(periodForm as unknown as Record<string, string>)[k]}
                                onChange={(e) => setPeriodForm({ ...periodForm, [k]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded text-[11px] font-bold hover:bg-slate-50 cursor-pointer"
                          onClick={() => setPeriodPanel({ open: false, editingId: null })}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-[#3182ce] text-white rounded text-[11px] font-bold hover:bg-[#2b6cb0] cursor-pointer disabled:opacity-50"
                          disabled={busy === `period:${pricePanelId}`}
                          onClick={savePeriod}
                        >
                          {periodPanel.editingId ? "更新时段" : "新增时段"}
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                {/* 弹窗底部 Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setPricePanelId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `price:${pricePanelId}`}
                    onClick={() => {
                      const dep = deployments.find((x) => x.id === pricePanelId);
                      if (dep) void savePrice(dep);
                    }}
                  >
                    {busy === `price:${pricePanelId}` ? "正在保存..." : "确认保存价格"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 能力配置模态弹窗 (遵循知阁·舟坊设计系统与系统级 Modal 规范) */}
          {capabilityPanelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <SlidersHorizontal className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight min-w-0 truncate flex items-center gap-1.5">
                        <span>模型能力声明 · {capDep ? `${capDep.providerId}/${capDep.modelId}` : capabilityPanelId}</span>
                        <span className="text-red-500 font-bold ml-0.5">*</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        声明该模型具备的抽象能力（必填项，至少勾选一项），决定组件能否成功调度运行
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCapabilityPanelId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body 内容 */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                    <div>
                      组件的「执行合同」会声明其依赖的能力。只有当模型勾选的能力<b>完全覆盖</b>该组件所需的能力时，用户点击运行才不会报错「能力不满足」。例如带文档/附件的组件依赖「文本生成」与「长上下文」，视觉组件依赖「图片理解」。
                    </div>
                  </div>

                  {capError && (
                    <div className="p-3 bg-red-50/90 border border-red-300 text-xs text-red-600 font-bold rounded flex items-center gap-2 animate-in fade-in-50 duration-200">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{capError}</span>
                    </div>
                  )}

                  {capabilityOptions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-amber-700 font-bold bg-amber-50 rounded border border-amber-200">
                      未能加载可选能力清单（可能为权限不足），请刷新重试或联系超级管理员。
                    </div>
                  ) : (
                    <div id="capability-options-grid" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {capabilityOptions.map((opt) => {
                        const isChecked = capabilityDraft.includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-start gap-3 border rounded-xl p-3.5 cursor-pointer transition-all ${
                              isChecked
                                ? "border-[#3182ce] bg-blue-50/60 shadow-xs ring-1 ring-[#3182ce]/20"
                                : "border-slate-200/90 bg-white hover:border-blue-200 hover:bg-slate-50/60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer accent-[#3182ce]"
                              checked={isChecked}
                              onChange={(e) => {
                                setCapabilityDraft(
                                  e.target.checked
                                    ? [...capabilityDraft, opt.value]
                                    : capabilityDraft.filter((v) => v !== opt.value)
                                );
                                if (capError) setCapError(null);
                              }}
                            />
                            <div className="text-xs min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-black ${isChecked ? "text-[#2b6cb0]" : "text-slate-800"}`}>
                                  {opt.label}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                  {opt.value}
                                </span>
                              </div>
                              <span className="block text-slate-500 text-[11px] leading-relaxed">
                                {opt.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {capabilityOptions.length > 0 && capabilityDraft.length === 0 && !capError && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 text-xs text-amber-700 font-bold rounded flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>提示：当前未勾选任何能力，所有声明了能力要求的组件都将被系统判定不可执行。</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setCapabilityPanelId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `cap:${capabilityPanelId}` || capabilityOptions.length === 0}
                    onClick={() => {
                      const dep = deployments.find((x) => x.id === capabilityPanelId);
                      if (dep) void saveCapabilities(dep);
                    }}
                  >
                    {busy === `cap:${capabilityPanelId}` ? "正在保存..." : "确认保存模型能力"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 供应商编辑模态弹窗（name 为稳定标识不可改，仅改协议 / Base URL / 密钥环境变量） */}
          {editProviderId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-2xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Settings className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight">编辑供应商通道</h3>
                      <p className="text-xs text-slate-500 font-medium font-mono truncate mt-0.5">
                        {editProviderName}（系统稳定标识不可修改）
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditProviderId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">接口协议</span>
                    <select
                      className={inputCls}
                      value={pEditForm.protocol}
                      onChange={(e) => setPEditForm({ ...pEditForm, protocol: e.target.value })}
                    >
                      <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / vLLM 等兼容网关）</option>
                      <option value="ANTHROPIC">ANTHROPIC（Claude）</option>
                      <option value="GEMINI">GEMINI（Google Gemini）</option>
                    </select>
                    <span className="block text-[11px] text-slate-400">目前平台统一按 OpenAI 兼容格式分发</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">
                      Base URL（必须为 https 地址） <span className="text-red-500 font-bold ml-0.5">*</span>
                    </span>
                    <input
                      id="edit-provider-input-baseUrl"
                      className={getInputCls(!!pEditErrors.baseUrl)}
                      value={pEditForm.baseUrl}
                      onChange={(e) => {
                        setPEditForm({ ...pEditForm, baseUrl: e.target.value });
                        if (pEditErrors.baseUrl) setPEditErrors({ ...pEditErrors, baseUrl: undefined });
                      }}
                    />
                    {pEditErrors.baseUrl && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{pEditErrors.baseUrl}</span>
                      </p>
                    )}
                    <span className="block text-[11px] text-slate-400">平台会自动拼接 /chat/completions</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">
                      密钥环境变量名 <span className="text-slate-400 font-normal">（可选，本地/自托管模型可留空）</span>
                    </span>
                    <input
                      id="edit-provider-input-apiKeyEnv"
                      className={getInputCls(!!pEditErrors.apiKeyEnv)}
                      value={pEditForm.apiKeyEnv}
                      onChange={(e) => {
                        setPEditForm({ ...pEditForm, apiKeyEnv: e.target.value });
                        if (pEditErrors.apiKeyEnv) setPEditErrors({ ...pEditErrors, apiKeyEnv: undefined });
                      }}
                    />
                    {pEditErrors.apiKeyEnv && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{pEditErrors.apiKeyEnv}</span>
                      </p>
                    )}
                    <span className="block text-[11px] text-slate-400">仅保存环境变量键名，密钥不入库；留空表示模型无需密钥（本地/自托管模型）</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">
                      API Key 直接录入 <span className="text-slate-400 font-normal">（可选，留空则不修改现有密钥）</span>
                    </span>
                    <input
                      id="edit-provider-input-apiKey"
                      type="password"
                      autoComplete="new-password"
                      className={getInputCls(false)}
                      placeholder="sk-... 录入后由服务端加密存储；留空表示沿用现有密钥"
                      value={pEditForm.apiKey}
                      onChange={(e) => setPEditForm({ ...pEditForm, apiKey: e.target.value })}
                    />
                    <span className="block text-[11px] text-slate-400">与「密钥环境变量名」二选一，密文优先；明文不在数据库落地</span>
                  </label>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setEditProviderId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `p:edit:${editProviderId}`}
                    onClick={saveProviderEdit}
                  >
                    {busy === `p:edit:${editProviderId}` ? "正在保存..." : "确认保存"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 部署编辑模态弹窗（providerId / modelId 为稳定标识不可改，仅改上游名 / 展示名 / 上下文） */}
          {editDeploymentId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-2xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Settings className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight">编辑模型部署</h3>
                      <p className="text-xs text-slate-500 font-medium font-mono truncate mt-0.5">
                        {editDeploymentMeta.providerId}/{editDeploymentMeta.modelId}（系统稳定标识不可修改）
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditDeploymentId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">上游模型真实名称</span>
                    <input
                      className={inputCls}
                      placeholder="真正下发厂商的 model（留空则以下方代号下发）"
                      value={dEditForm.upstreamModel}
                      onChange={(e) => setDEditForm({ ...dEditForm, upstreamModel: e.target.value })}
                    />
                    <span className="block text-[11px] text-slate-400">留空则默认下发模型标识</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">用户端展示名称</span>
                    <input
                      className={inputCls}
                      placeholder="如 DeepSeek V3 极速版"
                      value={dEditForm.displayName}
                      onChange={(e) => setDEditForm({ ...dEditForm, displayName: e.target.value })}
                    />
                    <span className="block text-[11px] text-slate-400">在工作区与调用模型选择器中展示给普通用户的易读名称</span>
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        上下文窗口上限 (Token) <span className="text-red-500 font-bold">*</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium">快捷填入:</span>
                        {[
                          { label: "32K", val: "32000" },
                          { label: "64K", val: "64000" },
                          { label: "128K", val: "128000" },
                          { label: "200K", val: "200000" },
                          { label: "1M", val: "1000000" },
                        ].map((preset) => (
                          <button
                            type="button"
                            key={preset.label}
                            onClick={() => {
                              setDEditForm({ ...dEditForm, contextLimit: preset.val });
                              if (dEditErrors.contextLimit) setDEditErrors({ ...dEditErrors, contextLimit: undefined });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                              dEditForm.contextLimit === preset.val
                                ? "bg-blue-50 text-[#3182ce] border-blue-200"
                                : "bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:text-[#3182ce]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      id="edit-deployment-input-contextLimit"
                      className={getInputCls(!!dEditErrors.contextLimit)}
                      placeholder="如 32000、64000、128000"
                      value={dEditForm.contextLimit}
                      onChange={(e) => {
                        setDEditForm({ ...dEditForm, contextLimit: e.target.value });
                        if (dEditErrors.contextLimit) setDEditErrors({ ...dEditErrors, contextLimit: undefined });
                      }}
                    />
                    {dEditErrors.contextLimit && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{dEditErrors.contextLimit}</span>
                      </p>
                    )}
                  </label>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setEditDeploymentId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `d:edit:${editDeploymentId}`}
                    onClick={saveDeploymentEdit}
                  >
                    {busy === `d:edit:${editDeploymentId}` ? "正在保存..." : "确认保存"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {/* 全局二次确认弹窗（对齐全站其它管理页面规范，彻底替换原生 alert/confirm） */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        warnings={confirmDialog.warnings}
        confirmText={confirmDialog.confirmText || "确认"}
        type={confirmDialog.type || "danger"}
        onConfirm={async () => {
          // 先立即关闭弹窗，删除请求转为后台执行，避免弹窗卡在请求完成（约 2 秒）后才关闭
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          await confirmDialog.onConfirm();
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
