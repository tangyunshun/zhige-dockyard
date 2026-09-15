"use client";

/**
 * 算力计价与厂商折算（后台可配置）
 *
 * 1. 统一口径：全系统只使用「算力点」，1 token = 1 算力点，100 算力点 = 1 元；
 * 2. 各 AI 厂商按自身官方价折算成算力点，价格与加价系数可在线编辑并写入数据库；
 * 3. 保存后即时生效（60 秒缓存窗口），无需发版；未迁移配置表时自动回退内置默认值。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Zap,
  Copy,
  Check,
  Calculator,
  Info,
  AlertTriangle,
  Coins,
  Save,
  RotateCcw,
  Trash2,
  X,
  Layers,
  AlertCircle,
  Plus,
} from "lucide-react";
import {
  DEFAULT_MARKUP,
  MIN_MARKUP,
  UNIT_EXPLAIN_HINT,
  marginRate,
  pointsToTokens,
  pointsPerToken,
  TYPICAL_CALL_INPUT_TOKENS,
  TYPICAL_CALL_OUTPUT_TOKENS,
} from "@/lib/model-rate";
import {
  POINT_UNIT_HINT,
  POINT_RATE_HINT,
  POINTS_PER_YUAN,
} from "@/lib/point-rate";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { confirm } from "@/components/GlobalConfirmProvider";
import type { PricingConfig } from "@/lib/pricing-config";
import {
  DEFAULT_PRICING_CONFIG,
  MAX_PRICE_PER_MILLION,
  MAX_MODEL_NAME_LENGTH,
  MAX_MARKUP,
} from "@/lib/pricing-config";

interface MembershipLevelItem {
  id: string;
  name: string;
  nameZh: string;
  priceMonthly: number;
  priceYearly: number;
  tokenLimit: number;
  features?: any;
}

interface WorkspacePlanItem {
  id: string;
  key: string;
  name: string;
  priceMonthly: number;
  tokenLimit: number;
}

interface TokenPackItem {
  id: string;
  name: string;
  points: number;
  price: number;
}

/**
 * 模态框表单字段容器：统一「必填标识 / 辅助说明 / 错误提示」三态样式，
 * 确保每个字段都有明确的校验反馈，而不是只在提交时弹一个笼统的提示。
 */
function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-slate-700 font-bold text-xs mb-1">
        <span>{label}</span>
        {required ? (
          <span className="text-rose-500 font-black">*</span>
        ) : (
          <span className="text-slate-400 text-[10px] font-normal">（选填）</span>
        )}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 mt-1 text-[11px] font-bold text-rose-600 leading-snug">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-[10px] text-slate-400 font-medium leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export default function AdminAiPricingPage() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // 真实数据库联查数据（零硬编码，100% 数据库驱动）
  const [membershipLevels, setMembershipLevels] = useState<MembershipLevelItem[]>([]);
  const [workspacePlans, setWorkspacePlans] = useState<WorkspacePlanItem[]>([]);
  const [tokenPacks, setTokenPacks] = useState<TokenPackItem[]>([]);

  // 体检维度切换：个人会员等级 / 空间套餐
  const [evalTab, setEvalTab] = useState<"membership" | "workspace">("membership");

  // 算力沙盘推演工具状态
  const [simYuan, setSimYuan] = useState<number>(100);
  const [selectedModelKey, setSelectedModelKey] = useState<string>("");

  // 扩充模型模态框状态与校验错误状态
  // 单价以字符串维护，才能真实区分「未填写」与「0」，从而给出准确的必填校验
  const [showAddModal, setShowAddModal] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newModelForm, setNewModelForm] = useState({
    providerId: "",
    modelId: "",
    modelName: "",
    inputPrice: "",
    outputPrice: "",
    note: "",
  });

  // 是否存在未保存的改动
  const [isDirty, setIsDirty] = useState(false);

  // 模型快捷参考基准：从数据库当前厂商配置中动态派生，零静态硬编码
  const popularTemplates = useMemo(() => {
    if (!config?.providers) return [];
    const tpls: {
      label: string;
      providerId: string;
      modelId: string;
      modelName: string;
      inputPrice: number;
      outputPrice: number;
      note: string;
    }[] = [];

    config.providers.forEach((p) => {
      p.models.slice(0, 2).forEach((m) => {
        tpls.push({
          label: m.name,
          providerId: p.id,
          modelId: `${m.id}-copy`,
          modelName: `${m.name} (自建)`,
          inputPrice: m.inputPrice,
          outputPrice: m.outputPrice,
          note: m.note || `${p.name} 旗下一键基准`,
        });
      });
    });

    return tpls.slice(0, 6);
  }, [config?.providers]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/admin/settings/pricing", { headers });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setConfig(data.config);
        setPersisted(!!data.persisted);
        if (Array.isArray(data.membershipLevels)) setMembershipLevels(data.membershipLevels);
        if (Array.isArray(data.workspacePlans)) setWorkspacePlans(data.workspacePlans);
        if (Array.isArray(data.tokenPacks)) setTokenPacks(data.tokenPacks);
        setIsDirty(false);
      } else if (res.status === 401 || res.status === 403) {
        console.warn("[ai-pricing] 权限未通过:", res.status, data);
        toastError("管理员权限校验未通过，请确认已作为系统管理员登录");
      } else {
        console.error("[ai-pricing] 读取配置响应异常:", res.status, data);
        toastError(data?.error || "读取计价配置失败");
      }
    } catch {
      toastError("网络异常，读取计价配置失败");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const markup = config?.markup ?? DEFAULT_MARKUP;
  const providers = config?.providers ?? [];
  const margin = marginRate(markup);

  // 加价系数：强制约束在 [MIN_MARKUP, MAX_MARKUP]，避免误输入导致全站毛利失真
  const setMarkup = (v: number) => {
    const safe = Number.isFinite(v)
      ? Math.min(MAX_MARKUP, Math.max(MIN_MARKUP, v))
      : MIN_MARKUP;
    setIsDirty(true);
    setConfig((prev) => (prev ? { ...prev, markup: safe } : prev));
  };

  const updatePrice = (
    providerId: string,
    modelId: string,
    kind: "inputPricePerMillion" | "outputPricePerMillion",
    value: number
  ) => {
    setIsDirty(true);
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            providers: prev.providers.map((p) =>
              p.id !== providerId
                ? p
                : {
                    ...p,
                    models: p.models.map((m) =>
                      m.id !== modelId ? m : { ...m, [kind]: Math.max(0, value) }
                    ),
                  }
            ),
          }
        : prev
    );
  };

  // 删除模型（高风险操作，二次确认）
  const handleRemoveModel = async (providerId: string, modelId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    const isLastOfProvider = (provider?.models.length ?? 0) <= 1;

    const ok = await confirm({
      title: "确认移除该模型？",
      message: `将从计价表中移除【${provider?.name || providerId}】的模型「${model?.name || modelId}」。${
        isLastOfProvider
          ? "该厂商下仅剩这一个模型，移除并保存后该厂商会被自动清理。"
          : ""
      }该操作在点击「保存配置」后才会真正写入数据库。确定继续吗？`,
      type: "warning",
      confirmText: "确认移除",
      cancelText: "取消",
    });
    if (!ok) return;

    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: prev.providers.map((p) => {
          if (p.id !== providerId) return p;
          return {
            ...p,
            models: p.models.filter((m) => m.id !== modelId),
          };
        }),
      };
    });
    setIsDirty(true);
    toastSuccess("已从当前配置中移除该模型（点击「保存配置」后生效）");
  };

  // 快捷填入模板
  const handleApplyTemplate = (tpl: (typeof popularTemplates)[0]) => {
    const providerExists = providers.some((p) => p.id === tpl.providerId);
    const fallbackProviderId = providers[0]?.id || "";
    setNewModelForm({
      providerId: providerExists ? tpl.providerId : fallbackProviderId,
      modelId: tpl.modelId,
      modelName: tpl.modelName,
      inputPrice: String(tpl.inputPrice),
      outputPrice: String(tpl.outputPrice),
      note: tpl.note,
    });
    setFormErrors({});
    if (!providerExists) {
      toastSuccess(
        `模板厂商「${tpl.providerId}」不在当前配置中，已自动归属到「${
          providers[0]?.name || "默认厂商"
        }」，请确认后再提交`
      );
    }
  };

  // 模态框实时折算试算
  const modalPreview = useMemo(() => {
    const targetProvider = providers.find((p) => p.id === newModelForm.providerId);
    const k = targetProvider?.markup ?? markup;
    const inPrice = Number(newModelForm.inputPrice) || 0;
    const outPrice = Number(newModelForm.outputPrice) || 0;
    const inTokens = pointsToTokens(1, inPrice, k);
    const outTokens = pointsToTokens(1, outPrice, k);
    const typicalCallPoints = Math.max(
      1,
      Math.ceil(
        TYPICAL_CALL_INPUT_TOKENS * pointsPerToken(inPrice, k) +
          TYPICAL_CALL_OUTPUT_TOKENS * pointsPerToken(outPrice, k)
      )
    );
    const currentMargin = (marginRate(k) * 100).toFixed(0);
    return {
      k,
      inTokens,
      outTokens,
      typicalCallPoints,
      currentMargin,
    };
  }, [newModelForm, providers, markup]);

  // 打开新增模型模态框（默认归属第一个厂商，并清空历史校验）
  const openAddModal = () => {
    setFormErrors({});
    setNewModelForm({
      providerId: providers[0]?.id || "",
      modelId: "",
      modelName: "",
      inputPrice: "",
      outputPrice: "",
      note: "",
    });
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setFormErrors({});
  };

  const EMPTY_MODEL_FORM = {
    providerId: "",
    modelId: "",
    modelName: "",
    inputPrice: "",
    outputPrice: "",
    note: "",
  };

  // 前置业务验证规则（与后端 validatePricingConfig 保持同一套口径）
  const validateForm = () => {
    const errors: Record<string, string> = {};
    const id = newModelForm.modelId.trim();
    const name = newModelForm.modelName.trim();
    const rawIn = newModelForm.inputPrice.trim();
    const rawOut = newModelForm.outputPrice.trim();
    const inPrice = Number(rawIn);
    const outPrice = Number(rawOut);

    if (!newModelForm.providerId) {
      errors.providerId = "请选择模型所属的厂商平台";
    } else if (!providers.some((p) => p.id === newModelForm.providerId)) {
      errors.providerId = "所选厂商在当前配置中不存在，请重新选择";
    }

    if (!id) {
      errors.modelId = "模型代码标识 (ID) 为必填项";
    } else if (!/^[a-z0-9][a-z0-9_.:-]*$/i.test(id)) {
      errors.modelId = "仅允许字母、数字与 - _ . :，且需以字母或数字开头";
    } else if (id.length > 80) {
      errors.modelId = "模型代码标识不能超过 80 个字符";
    } else {
      const targetProvider = providers.find((p) => p.id === newModelForm.providerId);
      if (targetProvider?.models.some((m) => m.id.toLowerCase() === id.toLowerCase())) {
        errors.modelId = `该厂商下已存在代码为「${id}」的模型，不可重复添加`;
      }
    }

    if (!name) {
      errors.modelName = "模型展示名称为必填项";
    } else if (name.length < 2) {
      errors.modelName = "模型展示名称至少需 2 个字符";
    } else if (name.length > MAX_MODEL_NAME_LENGTH) {
      errors.modelName = `模型展示名称不能超过 ${MAX_MODEL_NAME_LENGTH} 个字符`;
    }

    if (!rawIn) {
      errors.inputPrice = "输入单价为必填项（可为 0，表示免费输入）";
    } else if (!Number.isFinite(inPrice) || inPrice < 0) {
      errors.inputPrice = "请输入 ≥ 0 的有效数值";
    } else if (inPrice > MAX_PRICE_PER_MILLION) {
      errors.inputPrice = `不得超过 ${MAX_PRICE_PER_MILLION.toLocaleString()} 元/百万 Token`;
    }

    if (!rawOut) {
      errors.outputPrice = "输出单价为必填项（可为 0，表示免费输出）";
    } else if (!Number.isFinite(outPrice) || outPrice < 0) {
      errors.outputPrice = "请输入 ≥ 0 的有效数值";
    } else if (outPrice > MAX_PRICE_PER_MILLION) {
      errors.outputPrice = `不得超过 ${MAX_PRICE_PER_MILLION.toLocaleString()} 元/百万 Token`;
    }

    if (newModelForm.note.trim().length > 100) {
      errors.note = "备注说明不能超过 100 个字符";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 确认新增模型（写入内存草稿，需再点「保存配置」落库）
  const handleConfirmAddModel = () => {
    if (!validateForm()) {
      toastError("表单存在不合规项，请查看字段下方的红色提示");
      return;
    }

    const cleanId = newModelForm.modelId.trim();
    const cleanName = newModelForm.modelName.trim();
    const inPrice = Math.max(0, Number(newModelForm.inputPrice) || 0);
    const outPrice = Math.max(0, Number(newModelForm.outputPrice) || 0);

    setConfig((prev) => {
      if (!prev) return prev;
      const updatedProviders = prev.providers.map((p) => {
        if (p.id !== newModelForm.providerId) return p;
        return {
          ...p,
          models: [
            ...p.models,
            {
              id: cleanId,
              name: cleanName,
              inputPricePerMillion: inPrice,
              outputPricePerMillion: outPrice,
              note: newModelForm.note.trim() || undefined,
            },
          ],
        };
      });
      return { ...prev, providers: updatedProviders };
    });

    setIsDirty(true);
    setSelectedModelKey(`${newModelForm.providerId}:${cleanId}`);
    setShowAddModal(false);
    setNewModelForm(EMPTY_MODEL_FORM);
    setFormErrors({});
    toastSuccess(`已成功扩充模型「${cleanName}」，可在沙盘中即时推演，点击右上角「保存配置」存入数据库`);
  };

  // 重置为平台官方默认价格配置（会覆盖当前所有调价，二次确认）
  const handleResetToDefault = async () => {
    const ok = await confirm({
      title: "确认重置为官方基准配置？",
      message:
        "当前计价表中所有厂商的调价、新增与移除都会被官方基准配置覆盖，且需要点击「保存配置」后才会写入数据库。确定继续吗？",
      type: "warning",
      confirmText: "重置为基准",
      cancelText: "取消",
    });
    if (!ok) return;

    setConfig(DEFAULT_PRICING_CONFIG);
    setIsDirty(true);
    toastSuccess("已重置为官方基准配置（点击「保存配置」后写入数据库）");
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/admin/settings/pricing", {
        method: "PUT",
        headers,
        body: JSON.stringify({ config }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setConfig(data.config);
        setPersisted(true);
        setIsDirty(false);
        toastSuccess("计价配置已持久化写入系统数据库并实时生效");
      } else {
        // 后端逐条校验错误：优先展示首条，并在控制台保留完整清单便于排查
        const detailErrors: string[] = Array.isArray(data?.errors) ? data.errors : [];
        if (detailErrors.length > 0) {
          console.warn("[ai-pricing] 保存被后端校验拒绝：", detailErrors);
        }
        toastError(
          detailErrors.length > 1
            ? `${detailErrors[0]}（共 ${detailErrors.length} 处不合规）`
            : data?.error || "保存失败"
        );
      }
    } catch {
      toastError("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 存在未保存改动时拦截关闭 / 刷新页面
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // 模态框：ESC 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddModal(false);
        setFormErrors({});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showAddModal]);

  const configSnippet = useMemo(() => {
    if (!config) return "";
    return JSON.stringify(config, null, 2);
  }, [config]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // 提取所有可供沙盘模拟的模型列表
  const allFlattenedModels = useMemo(() => {
    const list: {
      key: string;
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
      inputPrice: number;
      outputPrice: number;
      k: number;
    }[] = [];
    providers.forEach((p) => {
      p.models.forEach((m) => {
        list.push({
          key: `${p.id}:${m.id}`,
          providerId: p.id,
          providerName: p.name,
          modelId: m.id,
          modelName: m.name,
          inputPrice: m.inputPricePerMillion,
          outputPrice: m.outputPricePerMillion,
          k: p.markup ?? markup,
        });
      });
    });
    return list;
  }, [providers, markup]);

  // 沙盘选中的模型对象
  const activeSimModel = useMemo(() => {
    if (!allFlattenedModels.length) return null;
    return allFlattenedModels.find((m) => m.key === selectedModelKey) || allFlattenedModels[0];
  }, [allFlattenedModels, selectedModelKey]);

  // 沙盘推演计算
  const simResults = useMemo(() => {
    if (!activeSimModel) return null;
    const points = simYuan * POINTS_PER_YUAN;
    const k = activeSimModel.k;
    const actualInTokens = pointsToTokens(points, activeSimModel.inputPrice, k);
    const actualOutTokens = pointsToTokens(points, activeSimModel.outputPrice, k);
    const callPoints = Math.max(
      1,
      Math.ceil(
        TYPICAL_CALL_INPUT_TOKENS * pointsPerToken(activeSimModel.inputPrice, k) +
          TYPICAL_CALL_OUTPUT_TOKENS * pointsPerToken(activeSimModel.outputPrice, k)
      )
    );
    const totalCalls = Math.floor(points / callPoints);
    const costYuan = simYuan / k;
    const profitYuan = simYuan - costYuan;
    const profitMargin = ((simYuan - costYuan) / simYuan) * 100;

    return {
      points,
      actualInTokens,
      actualOutTokens,
      callPoints,
      totalCalls,
      costYuan,
      profitYuan,
      profitMargin,
    };
  }, [activeSimModel, simYuan]);

  return (
    <div className="space-y-6 pb-12 text-left font-sans">
      {/* 页头标头 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#3182ce]" />
              算力计价与模型折算中枢
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1.5">
              AI 模型 Token 与全系统「算力点」双向折算规则、成本与毛利实时测算（基于真实数据库持久化配置，改动即时生效）
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!persisted && !loading && (
              <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-black text-amber-700">
                ⚠ 当前使用系统初始默认值
              </span>
            )}
            {persisted && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-700">
                ✓ 已启用数据库真实配置 (systemconfig)
              </span>
            )}
            {isDirty && (
              <span className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-black text-rose-600">
                ● 有未保存的改动
              </span>
            )}
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all cursor-pointer"
              title="重置为平台基准官方推荐配置"
            >
              重置为基准
            </button>
            <button
              type="button"
              onClick={loadConfig}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新加载
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !config}
              className="px-4 py-1.5 rounded-xl bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "正在持久化保存..." : "保存配置"}
            </button>
          </div>
        </div>
      </div>

      {/* 一、全系统统一算力口径 */}
      <div className="bg-gradient-to-br from-[#3182ce]/5 via-white to-[#8b5cf6]/5 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-[#3182ce]" />
          一、全系统统一计价口径与等价物
        </h2>
        <div className="space-y-2 text-xs font-bold text-slate-700 leading-relaxed">
          <p>{POINT_UNIT_HINT}</p>
          <p className="text-slate-500">{POINT_RATE_HINT}</p>
          <p className="text-slate-500">{UNIT_EXPLAIN_HINT}</p>
          <div className="mt-3 p-3.5 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
            <div>• 单Token折算扣点公式：<code>pointsPerToken = 厂商官方单价(元/百万token) ÷ 10,000 × 加价系数 k</code></div>
            <div>• 平台统一采购毛利率：<code>毛利率 = 1 − 1 / k</code></div>
          </div>
        </div>
      </div>

      {/* 二、加价系数 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
          <Coins className="w-4 h-4 text-[#3182ce]" />
          二、平台全局加价系数（决定毛利率）
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="range"
            min={1.0}
            max={5.0}
            step={0.1}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="flex-1 min-w-[220px] accent-[#3182ce] cursor-pointer"
          />
          <input
            type="number"
            min={MIN_MARKUP}
            max={MAX_MARKUP}
            step={0.01}
            value={markup}
            title={`加价系数可调范围 ${MIN_MARKUP} ~ ${MAX_MARKUP}`}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className={`w-24 px-3 py-2 border rounded-xl text-xs font-black text-center outline-none transition-colors ${
              markup < MIN_MARKUP || markup > MAX_MARKUP
                ? "border-rose-300 bg-rose-50/50 text-rose-700"
                : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
            }`}
          />
          <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-700">综合毛利率 </span>
            <span className="text-sm font-black text-emerald-700">
              {(margin * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-[11px] font-bold text-slate-400 mt-3">
          说明：k = 1.0 为成本平价直售；默认 k = {DEFAULT_MARKUP}（对应 60% 毛利率）。充值汇率锁定为 ¥1 = {POINTS_PER_YUAN} 算力点。
        </p>
      </div>

      {/* 三、厂商 × 模型折算表（支持直接改价、新增模型、删除模型） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#3182ce]" />
              三、厂商 × AI 模型实时折算表（价格可直接微调）
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              单位：元 / 百万 Token；典型调用按 {TYPICAL_CALL_INPUT_TOKENS.toLocaleString()} 输入 + {TYPICAL_CALL_OUTPUT_TOKENS.toLocaleString()} 输出 Token 综合估算
            </p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-1.5 bg-[#3182ce]/10 hover:bg-[#3182ce]/20 text-[#3182ce] text-xs font-black rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            扩充新模型
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            正在从系统数据库加载计价配置...
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[580px] overflow-y-auto relative scrollbar-thin">
            <table className="w-full text-xs min-w-[1020px]">
              <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-left whitespace-nowrap">厂商 / 模型名称</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">输入官方单价</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">输出官方单价</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">1 点可兑(输入)</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">1 点可兑(输出)</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">保本价可兑(输出)</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">典型调用扣点</th>
                  <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">实测毛利</th>
                  <th className="sticky right-0 top-0 bg-slate-50/95 backdrop-blur-xs z-30 px-4.5 py-3 text-center whitespace-nowrap font-bold shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((provider) =>
                  provider.models.map((model) => {
                    const k = provider.markup ?? markup;
                    const actualIn = pointsToTokens(1, model.inputPricePerMillion, k);
                    const actualOut = pointsToTokens(1, model.outputPricePerMillion, k);
                    const breakEvenOut = pointsToTokens(
                      1,
                      model.outputPricePerMillion,
                      MIN_MARKUP
                    );
                    const perCall = Math.max(
                      1,
                      Math.ceil(
                        TYPICAL_CALL_INPUT_TOKENS *
                          pointsPerToken(model.inputPricePerMillion, k) +
                          TYPICAL_CALL_OUTPUT_TOKENS *
                            pointsPerToken(model.outputPricePerMillion, k)
                      )
                    );
                    return (
                      <tr
                        key={`${provider.id}-${model.id}`}
                        className="group hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-black text-slate-800">{provider.name}</div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {model.name} ({model.id})
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={model.inputPricePerMillion}
                            title={`输入官方单价（元/百万 Token），有效范围 0 ~ ${MAX_PRICE_PER_MILLION.toLocaleString()}`}
                            onChange={(e) =>
                              updatePrice(
                                provider.id,
                                model.id,
                                "inputPricePerMillion",
                                Number(e.target.value)
                              )
                            }
                            className={`w-24 px-2 py-1 text-right border rounded-lg font-mono font-bold outline-none transition-colors ${
                              model.inputPricePerMillion < 0 ||
                              model.inputPricePerMillion > MAX_PRICE_PER_MILLION
                                ? "border-rose-300 bg-rose-50/50 text-rose-700 focus:border-rose-400"
                                : "border-slate-200 text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={model.outputPricePerMillion}
                            title={`输出官方单价（元/百万 Token），有效范围 0 ~ ${MAX_PRICE_PER_MILLION.toLocaleString()}`}
                            onChange={(e) =>
                              updatePrice(
                                provider.id,
                                model.id,
                                "outputPricePerMillion",
                                Number(e.target.value)
                              )
                            }
                            className={`w-24 px-2 py-1 text-right border rounded-lg font-mono font-bold outline-none transition-colors ${
                              model.outputPricePerMillion < 0 ||
                              model.outputPricePerMillion > MAX_PRICE_PER_MILLION
                                ? "border-rose-300 bg-rose-50/50 text-rose-700 focus:border-rose-400"
                                : "border-slate-200 text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#3182ce]">
                          {actualIn.toLocaleString()} Token
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-[#3182ce]">
                          {actualOut.toLocaleString()} Token
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-400">
                          {breakEvenOut.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-slate-800">
                          {perCall} 点
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px]">
                            {(marginRate(k) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-4 py-3 text-center whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <button
                            type="button"
                            onClick={() => handleRemoveModel(provider.id, model.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 shadow-2xs transition-all duration-150 cursor-pointer active:scale-95 group/del"
                            title={`从配置表中移除模型 ${model.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500 group-hover/del:text-white transition-colors" />
                            <span>移除</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 四、会员等级与空间套餐盈利能力体检（100% 真实数据库联查驱动，彻底消除写死假数据） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              四、会员等级与空间套餐盈利能力体检
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              按各套餐赠送配额、预估实耗率与基础采购成本进行测算，评估空间服务定价的毛利空间
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setEvalTab("membership")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                evalTab === "membership"
                  ? "bg-white text-[#3182ce] shadow-xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              个人会员体系 ({membershipLevels.length})
            </button>
            <button
              type="button"
              onClick={() => setEvalTab("workspace")}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                evalTab === "workspace"
                  ? "bg-white text-[#3182ce] shadow-xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              空间团队套餐 ({workspacePlans.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto relative scrollbar-thin">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-left whitespace-nowrap">套餐 / 等级名称</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">真实月费</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">每月包含算力点</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">名义面值</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">30% 实耗成本</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">60% 实耗成本</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-right whitespace-nowrap">100% 极限成本</th>
                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4 py-3 text-center whitespace-nowrap">盈利能力评估</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evalTab === "membership" &&
                membershipLevels.map((lv) => {
                  const points = Number(lv.tokenLimit) || 0;
                  const monthly = Number(lv.priceMonthly) || 0;
                  const unitCost = 1 / POINTS_PER_YUAN / markup;
                  const nominal = points / POINTS_PER_YUAN;
                  const cost30 = points * 0.3 * unitCost;
                  const cost60 = points * 0.6 * unitCost;
                  const cost100 = points * unitCost;
                  const isLossAt60 = monthly > 0 && cost60 > monthly;
                  const isFree = monthly === 0;

                  return (
                    <tr key={lv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">
                        {lv.nameZh || lv.name}
                        <span className="text-[10px] text-slate-400 font-mono ml-1.5">({lv.name})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                        ¥{monthly}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                        {points.toLocaleString()} 点
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#3182ce]">
                        ¥{nominal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        ¥{cost30.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          isLossAt60 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        ¥{cost60.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-700">
                        ¥{cost100.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isFree ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] text-[10px] font-bold">
                            基础引流
                          </span>
                        ) : isLossAt60 ? (
                          <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold">
                            ⚠ 倒贴运营风险
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            ✓ 盈利健康
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {evalTab === "workspace" &&
                workspacePlans.map((wp) => {
                  const points = Number(wp.tokenLimit) || 0;
                  const monthly = Number(wp.priceMonthly) || 0;
                  const unitCost = 1 / POINTS_PER_YUAN / markup;
                  const nominal = points / POINTS_PER_YUAN;
                  const cost30 = points * 0.3 * unitCost;
                  const cost60 = points * 0.6 * unitCost;
                  const cost100 = points * unitCost;
                  const isLossAt60 = monthly > 0 && cost60 > monthly;
                  const isFree = monthly === 0;

                  return (
                    <tr key={wp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">
                        {wp.name}
                        <span className="text-[10px] text-slate-400 font-mono ml-1.5">({wp.key})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                        ¥{monthly}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                        {points.toLocaleString()} 点
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#3182ce]">
                        ¥{nominal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        ¥{cost30.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          isLossAt60 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        ¥{cost60.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-700">
                        ¥{cost100.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isFree ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] text-[10px] font-bold">
                            团队试用
                          </span>
                        ) : isLossAt60 ? (
                          <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold">
                            ⚠ 倒贴运营风险
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            ✓ 盈利健康
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3.5 bg-amber-50/60 border-t border-amber-200">
          <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
            ⚠ 精算说明：实耗成本 = 赠送点数 × 实耗率 × (0.01 ÷ 加价系数 k)；若 60% 真实实耗成本已超过月费，说明当前套餐赠送额度过高或加价系数偏低，建议提升加价系数 k 或在会员管理中优化赠送配额。
          </p>
        </div>
      </div>

      {/* 五、算力与成本双向推演沙盘（全新高阶业务工具） */}
      {activeSimModel && simResults && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#3182ce]" />
              <h2 className="text-sm font-black text-slate-800">
                五、算力消耗与收益双向推演沙盘
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">输入金额与选定模型，测算采购成本与毛利空间</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">1. 选定拟推演的模型</label>
              <select
                value={activeSimModel.key}
                onChange={(e) => setSelectedModelKey(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#3182ce]"
              >
                {allFlattenedModels.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.providerName} - {m.modelName} (输入¥{m.inputPrice} / 输出¥{m.outputPrice})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">2. 设定用户充值金额 (元)</label>
              <input
                type="number"
                min={1}
                step={10}
                value={simYuan}
                onChange={(e) => setSimYuan(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black font-mono text-slate-800 outline-none focus:border-[#3182ce]"
              />
            </div>

            <div className="p-4 bg-gradient-to-br from-blue-50/80 to-emerald-50/60 rounded-xl border border-blue-100 flex flex-col justify-between">
              <div className="text-xs text-slate-600 font-bold">推演毛利结算</div>
              <div className="text-xl font-black text-emerald-700 font-mono">
                ¥{simResults.profitYuan.toFixed(2)}{" "}
                <span className="text-xs font-bold">({simResults.profitMargin.toFixed(1)}% 毛利率)</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                官方采购成本：¥{simResults.costYuan.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">用户到账算力点</span>
              <span className="text-base font-black text-[#3182ce] font-mono mt-0.5 block">
                {simResults.points.toLocaleString()} 点
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">纯输入 Token 额度</span>
              <span className="text-base font-black text-slate-800 font-mono mt-0.5 block">
                {simResults.actualInTokens.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">纯输出 Token 额度</span>
              <span className="text-base font-black text-slate-800 font-mono mt-0.5 block">
                {simResults.actualOutTokens.toLocaleString()}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">可支撑完整调用</span>
              <span className="text-base font-black text-emerald-600 font-mono mt-0.5 block">
                约 {simResults.totalCalls.toLocaleString()} 次
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 六、配置 JSON */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Copy className="w-4 h-4 text-[#3182ce]" />
            六、当前生效配置快照 JSON
          </h2>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "已复制" : "复制快照"}
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] font-mono overflow-x-auto leading-relaxed max-h-80">
          {configSnippet || "加载中..."}
        </pre>
        <p className="text-[11px] font-bold text-slate-400 mt-2">
          配置已通过真实接口持久化存储于 MySQL <code>systemconfig</code> 表（key = <code>ai_pricing_config</code>），全站各微服务读取已建立 60 秒高速缓存。
        </p>
      </div>

      {/* 模态框：扩充新 AI 模型至计价表 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-pricing-add-model-title"
          onClick={closeAddModal}
        >
          <div
            className="bg-white rounded-2xl border border-blue-100 shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部：固定吸顶 (shrink-0) */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 bg-gradient-to-r from-blue-50/70 via-white to-white border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="ai-pricing-add-model-title"
                    className="text-base font-black text-slate-800 tracking-tight"
                  >
                    扩充新模型至计价表
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    录入官方单价后系统将依据加价规则自动折算算力扣减点数；标
                    <span className="text-rose-500 font-bold mx-0.5">*</span>
                    为必填项
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="关闭"
                className="w-8 h-8 rounded-lg bg-white/80 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center shrink-0 cursor-pointer border border-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 表单主体：内部安全滚动 (flex-1 min-h-0 overflow-y-auto scrollbar-thin 彻底根治截断) */}
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto flex-1 min-h-0 scrollbar-thin text-left">
              {/* 快捷预置模板（由数据库当前配置动态派生） */}
              {popularTemplates.length > 0 && (
                <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span className="text-[11px] font-black text-slate-700">
                        一键快速预填基准参数：
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">点击即可自动填充标准参数</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {popularTemplates.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        title={tpl.note}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] text-[11px] font-bold text-slate-600 transition-all cursor-pointer active:scale-95 shadow-2xs"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 双列紧凑表单栅格 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. 所属厂商平台 */}
                <FormField
                  label="所属厂商平台"
                  required
                  error={formErrors.providerId}
                  hint="模型将挂载到该厂商体系下"
                >
                  <select
                    value={newModelForm.providerId}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, providerId: e.target.value });
                      setFormErrors((prev) => ({ ...prev, providerId: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer ${
                      formErrors.providerId
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  >
                    <option value="">请选择厂商平台</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </FormField>

                {/* 2. 模型代码标识 (ID) */}
                <FormField
                  label="模型代码标识 (ID)"
                  required
                  error={formErrors.modelId}
                  hint="如 deepseek-reasoner，同一厂商不可重复"
                >
                  <input
                    type="text"
                    placeholder="如 deepseek-reasoner 或 gpt-4o"
                    value={newModelForm.modelId}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, modelId: e.target.value });
                      setFormErrors((prev) => ({ ...prev, modelId: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-xs text-slate-800 outline-none transition-all ${
                      formErrors.modelId
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                </FormField>

                {/* 3. 模型中文名称 */}
                <FormField
                  label="模型展示名称"
                  required
                  error={formErrors.modelName}
                  hint="在计价表、账单中呈现的名称"
                >
                  <input
                    type="text"
                    placeholder="如 DeepSeek-R1 深度推理"
                    value={newModelForm.modelName}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, modelName: e.target.value });
                      setFormErrors((prev) => ({ ...prev, modelName: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-slate-800 outline-none transition-all ${
                      formErrors.modelName
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                </FormField>

                {/* 4. 备注说明 (选填) */}
                <FormField
                  label="模型特性备注"
                  error={formErrors.note}
                  hint="标明适用场景（如长思维链、代码生成）"
                >
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="如 长逻辑链推理 / 高性价比通用"
                    value={newModelForm.note}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, note: e.target.value });
                      setFormErrors((prev) => ({ ...prev, note: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl text-xs text-slate-800 outline-none transition-all ${
                      formErrors.note
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                </FormField>

                {/* 5. 输入成本单价 */}
                <FormField
                  label="输入单价 (元/百万Token)"
                  required
                  error={formErrors.inputPrice}
                  hint="厂商官方基准价格，0 表示免费"
                >
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="如 4"
                    value={newModelForm.inputPrice}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, inputPrice: e.target.value });
                      setFormErrors((prev) => ({ ...prev, inputPrice: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-xs font-bold text-slate-800 outline-none transition-all ${
                      formErrors.inputPrice
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                </FormField>

                {/* 6. 输出成本单价 */}
                <FormField
                  label="输出单价 (元/百万Token)"
                  required
                  error={formErrors.outputPrice}
                  hint="厂商官方基准价格，0 表示免费"
                >
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="如 16"
                    value={newModelForm.outputPrice}
                    onChange={(e) => {
                      setNewModelForm({ ...newModelForm, outputPrice: e.target.value });
                      setFormErrors((prev) => ({ ...prev, outputPrice: "" }));
                    }}
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-xs font-bold text-slate-800 outline-none transition-all ${
                      formErrors.outputPrice
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-400"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                </FormField>
              </div>

              {/* 实时折算预演看板（即时反馈闭环） */}
              <div className="rounded-xl bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border border-slate-200/80 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-700 flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>即时折算预览</span>
                  </div>
                  <span className="text-[#3182ce] font-mono">
                    当前厂商加价率：k = {modalPreview.k.toFixed(2)} (毛利率约 {modalPreview.currentMargin}%)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-lg border border-slate-100 py-1.5 px-2 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold">1 点可兑输入</div>
                    <div className="text-xs font-black text-[#3182ce] font-mono mt-0.5">
                      {modalPreview.inTokens.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 py-1.5 px-2 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold">1 点可兑输出</div>
                    <div className="text-xs font-black text-[#3182ce] font-mono mt-0.5">
                      {modalPreview.outTokens.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 py-1.5 px-2 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold">单次典型问答实耗</div>
                    <div className="text-xs font-black text-emerald-600 font-mono mt-0.5">
                      {modalPreview.typicalCallPoints} 点
                    </div>
                  </div>
                </div>
              </div>

              {/* 错误集中提醒区（若存在报错） */}
              {Object.keys(formErrors).filter((k) => formErrors[k]).length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-black text-rose-700 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>请核对并修正以下表单问题：</span>
                  </div>
                  <ul className="space-y-0.5 pl-4 list-disc text-[11px] font-bold text-rose-600">
                    {Object.entries(formErrors)
                      .filter(([, msg]) => msg)
                      .map(([k, msg]) => (
                        <li key={k}>{msg}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 底部操作区：固定吸底 (shrink-0)，操作按钮绝不被截断 */}
            <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 shrink-0">
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                提交后将写入当前折算表，需点击右上角「保存配置」存入数据库
              </p>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddModel}
                  className="px-5 py-2 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
                >
                  <Check className="w-3.5 h-3.5" />
                  确认添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
