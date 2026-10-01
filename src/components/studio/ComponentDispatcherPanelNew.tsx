"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { X, Shield, ArrowRight, Layers, Database, FileText, CheckCircle2, ChevronRight, Activity, Star, TrendingUp, Code, FolderOpen, Layout, Server, Monitor, Users, ShieldCheck, FlaskConical, Coins, Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentDefinition, ComponentCategory } from "@/constants/components";
import { getAuthToken } from "@/utils/auth";
import { describeAcceptedMimes } from "@/lib/fileConstraintsFormat";

const getDispatcherStageIcon = (category: string, categoryToStageId: Record<string, number>, className?: string) => {
  const stageId = categoryToStageId[category] || 1;
  const iconProps = { className: className || "w-5 h-5 text-white" };
  switch (stageId) {
    case 1: return <FileText {...iconProps} />;
    case 2: return <Layers {...iconProps} />;
    case 3: return <Code {...iconProps} />;
    case 4: return <Database {...iconProps} />;
    case 5: return <Layout {...iconProps} />;
    case 6: return <CheckCircle2 {...iconProps} />;
    case 7: return <Server {...iconProps} />;
    case 8: return <ShieldCheck {...iconProps} />;
    case 9: return <Users {...iconProps} />;
    case 10: return <FolderOpen {...iconProps} />;
    default: return <Layers {...iconProps} />;
  }
};

interface ComponentDispatcherPanelProps {
  isOpen: boolean;
  onClose: () => void;
  componentId: string | null;
  onNavigateToWorkspace?: (workspaceId: string, componentId: string) => void;
}

/**
 * 执行前费用预估：由 /api/billing/estimate（算账中心）下发的只读结果。
 * 前端一律消费该接口的 points / yuan / explanation，严禁自行做任何价格或点数计算。
 */
interface ExecutionEstimate {
  points: number | null;
  yuan: number | null;
  basis: "CONVERTED_PRICE" | "BLOCKED_PRICE_UNREGISTERED";
  blockedReason: string | null;
  /** 服务端生成的计价说明文案（含 BYOK 服务费说明） */
  explanation: string;
  deployment: {
    id: string;
    providerId: string;
    modelId: string;
    upstreamModelId: string;
    defaultSource: string;
  };
  pendingRegistration: { deploymentId: string; reason: string | null } | null;
  /** 押金-结算灰度信息（白名单组件才返回 deposit，前端展示「预扣押金」） */
  settlement?: {
    enabled: boolean;
    whitelist: string[];
    deposit: { points: number | null; worstInputTokens: number; worstOutputTokens: number } | null;
  } | null;
}

export default function ComponentDispatcherPanel({
  isOpen,
  onClose,
  componentId,
  onNavigateToWorkspace,
}: ComponentDispatcherPanelProps) {
  const toast = useToast();
  const router = useRouter();
  const {
    favorites,
    toggleFavorite,
    bindComponent,
    unbindComponent,
    userState,
    componentCatalog,
    componentCategories,
  } = useAppContext();

  const isLoggedIn = userState?.isLoggedIn || false;
  const workspaces = userState?.workspaces || [];

  // 分类 → 阶段号映射（由数据库 component_category.sortOrder 驱动，不再硬编码）
  const categoryToStageId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(componentCategories || {}).forEach(([key, value]) => {
      map[key] = value.sortOrder && value.sortOrder > 0 ? value.sortOrder : 1;
    });
    return map;
  }, [componentCategories]);

  // 获取当前活跃的工作空间及绑定状态
  const activeWsId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("workspaceId") || workspaces[0]?.id
    : workspaces[0]?.id;

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [bindingStatusMap, setBindingStatusMap] = useState<Record<string, boolean>>({});
  const [loadingStatuses, setLoadingStatuses] = useState<Record<string, boolean>>({});
  const [workspaceQuotas, setWorkspaceQuotas] = useState<Record<string, number>>({});
  const [loadingConfig, setLoadingConfig] = useState(true);

  // 初始化 selectedWorkspaceId
  useEffect(() => {
    if (activeWsId) {
      setSelectedWorkspaceId(activeWsId);
    } else if (workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [activeWsId, workspaces]);

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces.find(w => w.id === activeWsId) || workspaces[0] || null;
  const selectedWorkspaceName = selectedWorkspace ? selectedWorkspace.name : "默认空间";
  const isBound = selectedWorkspace ? (bindingStatusMap[selectedWorkspace.id] || false) : false;

  const comp = componentCatalog.find((c) => c.id === componentId) || null;

  // 合同就绪状态（数据库唯一真源，来自 catalog API）：无 PUBLISHED 激活合同即不可执行，禁止前端硬编码完成态
  const dispatcherContractReady = comp?.contractReady === true;
  const dispatcherContractLabel = dispatcherContractReady
    ? null
    : comp?.readinessStatus === "BLOCKED"
      ? "已阻断 (不可执行)"
      : comp?.readinessStatus === "NOT_EXECUTABLE"
        ? "能力不满足"
        : comp?.readinessStatus === "UNCONFIGURED" || !comp?.activeContractLifecycle || comp.activeContractLifecycle === "DRAFT"
          ? "待配置/不可执行"
          : "暂不可执行";

  // ===== 结构化表单（合同 input.kind=STRUCTURED_FORM 为唯一配置来源，前端强类型消费服务端合同，不得硬编码任何字段）=====
  const structuredFormFields = useMemo(() => {
    if (comp?.inputContractKind !== "STRUCTURED_FORM") return null;
    const fields = Array.isArray(comp?.formConstraints?.fields)
      ? comp!.formConstraints!.fields!.filter((f) => typeof f?.name === "string" && f!.name)
      : [];
    return fields.length > 0 ? fields : null;
  }, [comp]);

  /** 文件约束（多主材料数量/MIME/大小提示的唯一真源，来自激活合同） */
  const dispatcherFileConstraints = comp?.fileConstraints ?? null;
  /** 成本基准状态：ASSUMPTION = 平台真实历史基准未配置（必须标注为假设估算） */
  const costBaselineStatus = comp?.costBaselineStatus ?? null;

  // 合同声明的模型能力（唯一来源为后端 catalog 下发的 requiredCapabilities，前端不得按组件 ID 猜测）
  const requiredCapsKey = useMemo(
    () =>
      Array.isArray(comp?.requiredCapabilities)
        ? Array.from(new Set(comp!.requiredCapabilities!.filter((c) => typeof c === "string" && c.trim()))).sort().join(",")
        : "",
    [comp],
  );

  // ===== 执行前费用预估：一律来自算账中心只读接口，前端不做任何价格/点数计算 =====
  const [pricingHint, setPricingHint] = useState<ExecutionEstimate | null>(null);
  const [pricingHintLoading, setPricingHintLoading] = useState(false);
  /** 本次查询是否已返回结果（用于区分「加载中」与「确实无法估价」，避免首帧误报） */
  const [pricingHintResolved, setPricingHintResolved] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formRunning, setFormRunning] = useState(false);
  const [formRunError, setFormRunError] = useState<{ code: string; message: string } | null>(null);
  const [formRunResult, setFormRunResult] = useState<
    { executionMode: string; contractVersion: string | null; content: string } | null
  >(null);

  // 切换组件时清空表单态，避免把上一组件的输入/结果带到下一组件的合同表单
  useEffect(() => {
    setFormValues({});
    setFormErrors({});
    setFormRunError(null);
    setFormRunResult(null);
  }, [componentId]);

  /**
   * 执行前价格提示：随「运行目标 workspace + 合同能力」变化拉取当前生效单价。
   * 裁决口径与真实执行路径完全一致（服务端 resolveDefaultDeployment），前端只做只读展示，
   * 不得自行推导或硬编码任何价格。
   */
  useEffect(() => {
    if (!isOpen || !isLoggedIn || !selectedWorkspaceId || !requiredCapsKey) {
      setPricingHint(null);
      setPricingHintLoading(false);
      setPricingHintResolved(false);
      return;
    }
    let cancelled = false;
    setPricingHintLoading(true);
    setPricingHintResolved(false);
    const authToken = getAuthToken();
    const params = new URLSearchParams({
      componentId: componentId || "",
      workspaceId: selectedWorkspaceId,
    });
    fetch(`/api/billing/estimate?${params.toString()}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setPricingHint(json?.success ? (json.data as ExecutionEstimate) : null);
      })
      .catch(() => {
        if (!cancelled) setPricingHint(null);
      })
      .finally(() => {
        if (!cancelled) {
          setPricingHintLoading(false);
          setPricingHintResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn, selectedWorkspaceId, requiredCapsKey]);

  /**
   * 结构化表单提交：以合同字段做前端必填/选项校验（**不替代后端合同校验**），
   * 提交 formData 到既有 Studio API（绝不提交 providerId/modelId，用户不得越权选模型）。
   */
  const handleStructuredSubmit = async () => {
    if (!comp || !structuredFormFields) return;
    if (comp.contractReady !== true) {
      toast.error(comp.activeContractLifecycle === "DRAFT" ? "该组件合同即将上线，暂不可执行" : "该组件尚未配置有效合同，暂不可执行");
      return;
    }
    if (!isLoggedIn) {
      toast.info("智阁舟坊：请先登录账户以执行该组件");
      setTimeout(() => {
        onClose();
        router.push(`/auth/login?redirect=${encodeURIComponent(`/studio?componentId=${comp.id}`)}`);
      }, 800);
      return;
    }
    const targetWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0] || null;
    if (!targetWorkspace) {
      toast.warning("未检测到可用的工作空间，请先创建空间");
      return;
    }

    const errs: Record<string, string> = {};
    for (const f of structuredFormFields) {
      const name = String(f.name);
      const label = f.label || name;
      const value = (formValues[name] ?? "").trim();
      const isSelect = f.type === "select";
      if (f.required && !value) {
        errs[name] = isSelect ? `请选择「${label}」` : `请填写「${label}」`;
      } else if (isSelect && value && Array.isArray(f.options) && f.options.length > 0 && !f.options.includes(value)) {
        errs[name] = `「${label}」取值不合法（仅允许：${f.options.join(" / ")}）`;
      }
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("请先补全合同要求的结构化字段");
      return;
    }

    setFormRunning(true);
    setFormRunError(null);
    setFormRunResult(null);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "simulate",
          workspaceId: targetWorkspace.id,
          componentId: comp.id,
          formData: formValues,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setFormRunError({
          code: String(data?.code ?? `HTTP_${res.status}`),
          message: String(data?.error ?? data?.message ?? "执行失败，请稍后重试"),
        });
        return;
      }
      setFormRunResult({
        executionMode: String(data?.executionMode ?? ""),
        contractVersion: data?.contractVersion ? String(data.contractVersion) : null,
        content: String(data?.artifacts?.[0]?.content ?? ""),
      });
    } catch (e) {
      setFormRunError({ code: "NETWORK_ERROR", message: (e as Error)?.message || "网络异常，请稍后重试" });
    } finally {
      setFormRunning(false);
    }
  };

  // Esc 关闭 + 弹窗打开期间锁定背景滚动
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  // 立即装配/使用中枢函数 (支持登录拦截与一键秒级装配跳转)
  const handleQuickUse = async () => {
    if (!comp) return;
    // 无有效 PUBLISHED 激活合同：前端拦截至执行/装配入口，如实显示原因（不发送执行请求）
    if (comp.contractReady !== true) {
      if (comp.blockingReasons && comp.blockingReasons.length > 0) {
        toast.error(`执行拦截：${comp.blockingReasons[0]}`);
      } else if (comp.readinessStatus === "BLOCKED") {
        toast.error("执行拦截：组件存在未满足的业务依赖门禁，当前不能发布/执行。");
      } else {
        toast.error(
          comp.activeContractLifecycle === "DRAFT"
            ? "该组件合同处于草稿阶段，暂不可执行"
            : comp.activeContractLifecycle === "ARCHIVED"
              ? "该组件合同已归档，暂不可执行"
              : "该组件尚未配置有效可执行合同（或状态信息不可用），暂不可执行",
        );
      }
      return;
    }
    if (!isLoggedIn) {
      toast.info("智阁舟坊：请先登录账户以解锁装配效能组件");
      setTimeout(() => {
        onClose();
        router.push(`/auth/login?redirect=${encodeURIComponent(`/studio?componentId=${comp.id}`)}`);
      }, 800);
      return;
    }
    
    const targetWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0] || null;
    if (!targetWorkspace) {
      toast.warning("未检测到可用的工作空间，请先创建空间");
      return;
    }
    
    const wsId = targetWorkspace.id;
    const wsName = targetWorkspace.name;
    const targetIsBound = bindingStatusMap[wsId] || false;
    
    if (targetIsBound) {
      // 已经装配，直接进入空间研发页
      handleGoToWorkspace(wsId);
    } else {
      toast.info(`正在为您的一键算力空间 [${wsName}] 快速装配引进该效能组件...`);
      try {
        const result = await bindComponent(comp.id, wsId);
        if (result.ok) {
          toast.success("装配成功！正在为您载入智阁极客工作流...");
          setBindingStatusMap(prev => ({ ...prev, [wsId]: true }));
          setTimeout(() => {
            handleGoToWorkspace(wsId);
          }, 800);
        } else {
          toast.error(result.error || "装配引进失败，请重试");
        }
      } catch (err) {
        toast.error("网络异常，请稍后重试");
      }
    }
  };

  // 1. 获取各个空间对于该组件的绑定状态，并同步拉取配额
  useEffect(() => {
    if (!isOpen || !componentId || !isLoggedIn) return;

    const fetchStates = async () => {
      setLoadingConfig(true);
      const statusMap: Record<string, boolean> = {};
      const quotaMap: Record<string, number> = {};

      try {
        const authToken = getAuthToken();
        const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

        // A. 批量并发获取每个空间的组件绑定状态
        await Promise.all(
          workspaces.map(async (ws) => {
            try {
              const res = await fetch(`/api/studio?action=bound&workspaceId=${ws.id}`, { headers });
              if (res.ok) {
                const resData = await res.json();
                if (resData.success && Array.isArray(resData.data)) {
                  statusMap[ws.id] = resData.data.includes(componentId);
                }
              }
            } catch (e) {
              console.error(`加载空间 ${ws.id} 绑定状态失败:`, e);
            }
          })
        );

        // B. 一次性获取所有空间算力配额
        try {
          const res = await fetch("/api/user/workspace-hub/quota", { headers });
          if (res.ok) {
            const resData = await res.json();
            if (resData.success && resData.data?.workspaces) {
              resData.data.workspaces.forEach((w: any) => {
                if (w.quota) {
                  quotaMap[w.id] = Number(w.quota.tokenBalance);
                } else if (w.type === "PERSONAL") {
                  quotaMap[w.id] = 100;
                }
              });
            }
          }
        } catch (e) {
          console.error("加载算力配额失败:", e);
        }

        setBindingStatusMap(statusMap);
        setWorkspaceQuotas(quotaMap);
      } catch (err) {
        console.warn("加载分发控制台数据失败:", err);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchStates();
  }, [isOpen, componentId, isLoggedIn, workspaces, userState.userInfo?.id]);

  if (!isOpen || !comp) return null;

  const categoryInfo = comp ? componentCategories[comp.category as ComponentCategory] : null;
  const isFav = favorites.includes(comp.id);

  // 2. 处理绑定/解绑切换动作
  const handleToggleBind = async (workspaceId: string, workspaceName: string) => {
    const wasBound = bindingStatusMap[workspaceId] || false;
    
    // 设置局部加载菊花
    setLoadingStatuses((prev) => ({ ...prev, [workspaceId]: true }));

    try {
      if (wasBound) {
        const result = await unbindComponent(comp.id, workspaceId);
        if (result.ok) {
          setBindingStatusMap((prev) => ({ ...prev, [workspaceId]: false }));
          toast.success(`组件 ${comp.name} 已成功从空间 [${workspaceName}] 解除引进`);
        } else {
          toast.error(result.error || "操作失败，请重试");
        }
      } else {
        const result = await bindComponent(comp.id, workspaceId);
        if (result.ok) {
          setBindingStatusMap((prev) => ({ ...prev, [workspaceId]: true }));
          toast.success(`组件 ${comp.name} 已成功分发至空间 [${workspaceName}]`);
        } else {
          toast.error(result.error || "操作失败，请重试");
        }
      }
    } catch (e) {
      console.error("切换组件绑定失败:", e);
      toast.error("网络异常，请重试");
    } finally {
      setLoadingStatuses((prev) => ({ ...prev, [workspaceId]: false }));
    }
  };

  const handleToggleFavorite = async () => {
    if (!isLoggedIn) {
      toast.error("请先登录系统以收藏组件");
      return;
    }
    const success = await toggleFavorite(comp.id);
    if (success) {
      toast.success(isFav ? "已取消收藏" : "已添加到收藏");
    } else {
      toast.error("操作失败");
    }
  };

  const handleGoToWorkspace = (workspaceId: string) => {
    if (onNavigateToWorkspace) {
      onNavigateToWorkspace(workspaceId, comp.id);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[5px] transition-opacity"
      />

      {/* 居中大规格便当盒模态框 (ZhiGe Bento Spec Modal) */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[700px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-98 duration-200 border border-slate-200/80 z-10">
        
        {/* 顶部 Header - 紧凑精美 */}
        <header className="bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm">
              {getDispatcherStageIcon(comp.category, categoryToStageId, "w-4.5 h-4.5 text-white")}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                <span>{comp.name}</span>
                <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-500 font-mono rounded">
                  {comp.id}
                </span>
              </h2>
              <p className="text-[9.5px] text-slate-400 font-bold mt-0.5">
                {isLoggedIn ? "资产技术说明与分发部署控制台" : "产品效能资产使用说明书"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <button
                onClick={handleToggleFavorite}
                className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all shadow-sm ${
                  isFav 
                    ? "border-amber-300 bg-amber-50 text-amber-500 hover:bg-amber-100" 
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600"
                }`}
                title="收藏本组件"
              >
                <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 极客双列 Bento 内容区分栏 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* 左侧详情与数据契约栏 (占 7 列) - 纯白大气底色 */}
          <div className="lg:col-span-7 h-full overflow-y-auto p-5 space-y-5 scrollbar-thin">
            
            {/* 1. 基本信息看板 - 扁平无边框设计 */}
            <section className="bg-slate-50/50 rounded-xl p-4.5 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[9px] font-black border"
                  style={{
                    backgroundColor: `${categoryInfo?.color}10`,
                    borderColor: `${categoryInfo?.color}20`,
                    color: categoryInfo?.color,
                  }}
                >
                  {categoryInfo?.name || "常规分类"}
                </span>
                <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                  <Activity className="w-3.5 h-3.5 text-[#f59e0b]" />
                  {/* estimatedModelTokens 是「Token 用量估算」，不是算力点；实际扣点以右侧「执行前费用预估」为准 */}
                  <span>估算用量 {comp.estimatedModelTokens} Token/次（非算力点）</span>
                </div>
              </div>
              
              <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                {comp.description}
              </p>

              {comp.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {comp.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white text-slate-500 border border-slate-200 text-[9px] font-bold rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 2. 技术数据契约流转拓扑 (Topology Data Contract) - 精致轻量深色面板 */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <Database className="w-3.5 h-3.5 text-[#3182ce]" />
                数据加工流转契约协议 (物理材料 - 物理产出)
              </h3>
              
              <div className="relative bg-[#0f172a] text-slate-200 rounded-xl p-4 border border-slate-800 shadow-md overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-15"></div>

                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3">
                  {/* 输入材料极 */}
                  <div className="flex-1 w-full bg-slate-900/90 rounded-lg p-3 border border-slate-900 shadow-inner flex flex-col justify-between min-h-[105px]">
                    <div>
                      <div className="text-[8px] font-black text-[#63b3ed] uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        输入材料规范 (Input)
                      </div>
                      <div className="font-mono text-[9.5px] text-slate-400 leading-relaxed bg-slate-900/50 p-2 rounded border border-slate-800/80 min-h-[40px] flex items-center">
                        {comp.previewData?.inputMock || comp.contract || "输入材料"}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[8px] font-bold text-slate-500">
                        <span>输入方式:</span>
                        <span className={(() => {
                          const m = comp.inputMode;
                          if (m === "file") return "text-amber-300 bg-amber-950/40 border border-amber-900/30 px-1 py-0.2 rounded";
                          if (m === "both") return "text-emerald-300 bg-emerald-950/40 border border-emerald-900/30 px-1 py-0.2 rounded";
                          return "text-blue-200 bg-slate-900/40 border border-slate-800/30 px-1 py-0.2 rounded";
                        })()}>
                          {(() => {
                            const m = comp.inputMode;
                            return m === "file" ? "📎 文件上传" : m === "both" ? "🔀 上传 / 输入" : "⌨️ 文本输入";
                          })()}
                        </span>
                      {dispatcherFileConstraints?.acceptedMimes?.length ? (
                        <div className="mt-1 flex items-center gap-1 text-[8px] font-bold text-slate-500">
                          <span>格式:</span>
                          <span className="text-amber-200/90 font-mono bg-amber-950/30 px-1 py-0.2 rounded truncate max-w-[140px]" title={dispatcherFileConstraints.acceptedMimes.join(", ")}>
                            {describeAcceptedMimes(dispatcherFileConstraints.acceptedMimes)}
                          </span>
                        </div>
                      ) : null}
                      </div>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-900 flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
                      <span>载体:</span>
                      <span className="text-[#63b3ed] bg-blue-950/40 border border-blue-900/20 px-1 py-0.2 rounded truncate max-w-[140px]">
                        {comp.previewData?.inputMock || comp.contract || comp.hint || "输入材料"}
                      </span>
                    </div>
                  </div>

                  {/* 中枢枢纽 */}
                  <div className="flex flex-col items-center justify-center shrink-0 sm:w-10">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[8px] font-black shadow-md border border-[#63b3ed]/20">
                      中枢
                    </div>
                    <span className="text-[6.5px] font-black text-indigo-400 uppercase tracking-widest scale-90 mt-1 whitespace-nowrap hidden sm:block">数据流转</span>
                  </div>

                  {/* 输出成果极 */}
                  <div className="flex-1 w-full bg-slate-900/90 rounded-lg p-3 border border-slate-900 shadow-inner flex flex-col justify-between min-h-[105px]">
                    <div>
                      <div className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        输出成果契约 (Output)
                      </div>
                      <div className="font-mono text-[9.5px] text-slate-400 leading-relaxed bg-slate-900/50 p-2 rounded border border-slate-800/80 min-h-[40px] flex flex-col justify-center">
                        <div>{comp.previewData?.outputMock || comp.contract || "输出成果"}</div>
                        {comp.blockingReasons && comp.blockingReasons.length > 0 && (
                          <div className="text-[8.5px] text-amber-400/95 mt-1 font-sans font-semibold border-t border-slate-800/80 pt-1">
                            ⚠️ 阻断说明：{comp.blockingReasons.join("；")}
                          </div>
                        )}
                        {comp.qualityHints && comp.qualityHints.length > 0 && (
                          <div className="text-[8.5px] text-blue-300/90 mt-1 font-sans font-semibold border-t border-slate-800/80 pt-1 space-y-0.5">
                            {comp.qualityHints.map((hint: string, hIdx: number) => (
                              <div key={hIdx}>💡 质量说明：{hint}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-900 flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
                      <span>产出:</span>
                      <span className="text-emerald-300 bg-emerald-950/40 border border-emerald-900/20 px-1 py-0.2 rounded truncate max-w-[140px]">
                        {comp.previewData?.outputMock || comp.contract || comp.hint || "输出成果"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 契约基本属性 */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-[8px] font-bold text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 服务端安全校验</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 隔离安全加密</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 吞吐率对齐 100%</span>
                </div>
              </div>
            </section>

            {/* 3. 可视化 ROI 商业提效滑轨 - 轻量化 */}
            <section className="bg-gradient-to-r from-emerald-50/40 via-blue-50/10 to-emerald-50/30 border border-emerald-100/60 rounded-xl p-3.5 flex items-center gap-3 justify-between">
              <div className="space-y-0.5 min-w-0 flex-1">
                <span className="text-[10px] font-black text-emerald-600 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>商业级投入产出比 (ROI Efficiency)</span>
                </span>
                <span className="text-[9.5px] text-slate-500 font-semibold block truncate leading-relaxed">
                  {comp.previewData?.roiText || "企业级研发提效辅助"}
                </span>
                {comp.qualityHints && comp.qualityHints.some((h: string) => h.includes("压测") || h.includes("基准") || h.includes("保证")) ? (
                  <span className="text-[8px] text-amber-700 font-bold block pt-0.5">
                    * 性能与吞吐指标属于业务预估，未经实际生产压测，不构成确定性性能保证
                  </span>
                ) : null}
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-2 shadow-inner shrink-0 w-[120px] text-center space-y-0.5">
                <span className="text-[7.5px] font-black text-slate-400 block tracking-wider uppercase">提效评估</span>
                <span className="text-[9.5px] font-bold text-emerald-700 block leading-tight">
                  业务预估，未经压测
                </span>
              </div>
            </section>

          </div>

          {/* 右侧空间分发与部署中枢 (占 5 列) - 精致渐变分栏底色 */}
          <div className="lg:col-span-5 h-full overflow-y-auto p-5 bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] scrollbar-thin flex flex-col justify-between border-l border-slate-200">
            <div className="space-y-4">
              
              {/* 任务路由网关 (ZhiGe Routing Hub) - 精致仪表卡片 */}
              <section className="bg-white border border-[#3182ce]/15 rounded-xl p-4 shadow-[0_4px_12px_rgba(49,130,206,0.03)] relative overflow-hidden flex flex-col gap-3">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#3182ce]/5 to-indigo-500/2 rounded-full blur-lg pointer-events-none"></div>
                <div className="space-y-1.5 min-w-0 relative z-10 flex-1">
                  <span className="text-[8.5px] font-black text-[#3182ce] uppercase tracking-wider block">
                    准备就绪的运行目标 workspace
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs font-black text-slate-800 truncate">
                      {selectedWorkspaceName}
                    </span>
                    {selectedWorkspace?.type === "PERSONAL" ? (
                      <span className="text-[7.5px] px-1.5 py-0.2 bg-blue-50 text-[#3182ce] border border-blue-100 rounded font-semibold scale-90">个人</span>
                    ) : selectedWorkspace ? (
                      <span className="text-[7.5px] px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-100 rounded font-semibold scale-90">企业</span>
                    ) : null}
                  </div>
                  
                  {/* 配额与状态对齐展示 */}
                  <div className="flex items-center gap-3 pt-1 text-[9.5px] font-semibold text-slate-500 border-t border-slate-50 mt-2">
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3 text-[#3182ce]/70" /> 资源配额: <strong className="text-slate-700 font-bold font-mono">{(workspaceQuotas[selectedWorkspace?.id || ""] || 0).toLocaleString()}</strong>
                      {selectedWorkspace && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToWorkspace) {
                              onNavigateToWorkspace(selectedWorkspace.id, comp.id);
                            }
                          }}
                          className="ml-1 text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-black hover:bg-amber-100 transition-colors border border-amber-200 cursor-pointer"
                        >
                          充值
                        </button>
                      )}
                    </span>
                    <span className="flex items-center gap-1"><Server className="w-3 h-3 text-[#3182ce]/70" /> 状态: 
                      {isBound ? (
                        <strong className="text-emerald-600 font-black">已引进</strong>
                      ) : (
                        <strong className="text-slate-400 font-bold">待装配</strong>
                      )}
                    </span>
                  </div>
                </div>
                
                {/* 成本基准诚实提示：平台真实历史基准未配置时必须标注为「假设估算」，不得显示为真实报价 */}
                {costBaselineStatus === "ASSUMPTION" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[9.5px] leading-relaxed text-amber-800 font-semibold shrink-0 z-10">
                    当前使用「假设估算」：平台真实历史工时/单价基准尚未配置，结果**不代表平台真实报价**，报告中会标注假设值性质。
                  </div>
                )}
                {costBaselineStatus === "CONFIGURED" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9.5px] leading-relaxed text-emerald-700 font-semibold shrink-0 z-10">
                    已接入平台真实历史基准，报告中将注明基准来源。
                  </div>
                )}

                {/* 执行前价格提示：当前生效单价来自模型定价唯一真源（空间裁决 + 时段价），执行前如实告知，只读不可配置 */}
                {isLoggedIn && selectedWorkspaceId ? (
                  pricingHintLoading || !pricingHintResolved ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[9.5px] text-slate-500 font-semibold shrink-0 z-10">
                      正在估算本次扣点…
                    </div>
                  ) : pricingHint ? (
                    <div className="rounded-lg border border-[#3182ce]/25 bg-[#3182ce]/5 px-3 py-2 space-y-1.5 shrink-0 z-10">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Coins className="w-3 h-3 text-[#3182ce]" />
                        <span className="text-[9.5px] font-black text-[#3182ce]">执行前费用预估</span>
                        <span className="text-[8.5px] text-slate-500 font-semibold truncate max-w-[150px]">
                          {pricingHint.deployment.upstreamModelId}
                          {pricingHint.deployment.defaultSource === "WORKSPACE_BYO" ? "（空间自带）" : ""}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-[9.5px] font-semibold text-slate-600">
                        <span>
                          预计扣点 <strong className="font-mono text-slate-800">{pricingHint.points ?? "—"}</strong>
                        </span>
                        <span>
                          ≈ <strong className="font-mono text-slate-800">¥{pricingHint.yuan === null ? "—" : pricingHint.yuan}</strong>
                        </span>
                        {pricingHint.settlement?.enabled && pricingHint.settlement.deposit?.points != null ? (
                          <span className="text-[#3182ce]">
                            预扣押金 <strong className="font-mono">{pricingHint.settlement.deposit.points}</strong> 点（按实际用量多退少补）
                          </span>
                        ) : null}
                      </div>

                      <div className="text-[8.5px] leading-relaxed text-slate-500 font-semibold">
                        {pricingHint.explanation}
                        <button
                          type="button"
                          onClick={() => router.push("/models")}
                          className="ml-1 text-[#3182ce] underline underline-offset-2 hover:text-[#2b6cb0] cursor-pointer"
                        >
                          查看全部时段价目
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[9.5px] leading-relaxed text-amber-800 font-semibold shrink-0 z-10">
                      暂未获取到本次执行的费用预估（模型未登记单价或不满足执行条件），执行前请先确认空间模型与定价配置。
                    </div>
                  )
                ) : null}

                {/* 文件材料规范提示：数量/MIME/大小全部来自激活合同的 fileConstraints（数据驱动，前端不硬编码） */}
                {dispatcherFileConstraints && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[9.5px] leading-relaxed text-slate-600 font-semibold shrink-0 z-10">
                    {(dispatcherFileConstraints.maxCount ?? 1) > 1 ? (
                      <span>多文件组件：支持 {dispatcherFileConstraints.minCount ?? 1}~{dispatcherFileConstraints.maxCount} 个文件</span>
                    ) : (
                      <span>文件材料规范：支持单文件上传</span>
                    )}
                    {dispatcherFileConstraints.acceptedMimes?.length
                      ? `；支持格式 ${describeAcceptedMimes(dispatcherFileConstraints.acceptedMimes)}`
                      : ""}
                    {dispatcherFileConstraints.maxSingleFileBytes
                      ? `；单文件 ≤ ${Math.round(dispatcherFileConstraints.maxSingleFileBytes / 1024 / 1024)} MB`
                      : ""}
                  </div>
                )}

                {/* 结构化表单（合同字段驱动）：存在合同表单时以表单提交替代一键转场，避免第二套执行入口 */}
                {structuredFormFields ? (
                  <div className="space-y-2 shrink-0 z-10">
                    {structuredFormFields.map((f) => {
                      const name = String(f.name);
                      const label = f.label || name;
                      const err = formErrors[name];
                      return (
                        <label key={name} className="block space-y-1">
                          <span className="text-[9.5px] font-black text-slate-700">
                            {label}
                            {f.required && <span className="text-rose-500"> *</span>}
                          </span>
                          {f.type === "select" ? (
                            <select
                              value={formValues[name] ?? ""}
                              onChange={(e) => setFormValues((prev) => ({ ...prev, [name]: e.target.value }))}
                              className={`w-full h-8 rounded border text-[10px] px-2 bg-white ${
                                err ? "border-rose-300" : "border-slate-200"
                              }`}
                            >
                              <option value="">请选择…</option>
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <textarea
                              value={formValues[name] ?? ""}
                              onChange={(e) => setFormValues((prev) => ({ ...prev, [name]: e.target.value }))}
                              rows={4}
                              placeholder={`请输入${label}`}
                              className={`w-full rounded border text-[10px] px-2 py-1.5 bg-white resize-y ${
                                err ? "border-rose-300" : "border-slate-200"
                              }`}
                            />
                          )}
                          {err && <span className="block text-[9px] font-bold text-rose-500">{err}</span>}
                        </label>
                      );
                    })}

                    <button
                      onClick={handleStructuredSubmit}
                      disabled={!dispatcherContractReady || formRunning}
                      className={`w-full h-8.5 text-white text-[10px] font-black rounded shadow-md transition-all flex items-center justify-center gap-1 ${
                        !dispatcherContractReady
                          ? "bg-slate-300 cursor-not-allowed"
                          : formRunning
                            ? "bg-slate-400 cursor-wait"
                            : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#2b6cb0] hover:shadow-lg cursor-pointer"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 fill-current text-white/20" />
                      <span>
                        {!dispatcherContractReady ? dispatcherContractLabel : formRunning ? "执行中…" : "按合同表单执行"}
                      </span>
                    </button>

                    {formRunError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[9.5px] text-rose-700 font-semibold">
                        执行失败 [{formRunError.code}]：{formRunError.message}
                      </div>
                    )}
                    {formRunResult && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9.5px] text-emerald-800 font-semibold space-y-1">
                        <div>
                          执行成功：executionMode=<strong>{formRunResult.executionMode}</strong>
                          {formRunResult.contractVersion ? ` ｜ 合同版本 ${formRunResult.contractVersion}` : ""}
                        </div>
                        <div className="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[9px] text-slate-700 bg-white/70 rounded p-1.5">
                          {formRunResult.content.slice(0, 600) || "（成果物为空）"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 shrink-0 z-10">
                    {!dispatcherContractReady && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[9.5px] leading-relaxed text-amber-900 font-semibold space-y-1">
                        <div className="font-bold flex items-center gap-1 text-amber-800">
                          <Shield className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>
                            {(comp.blockingReasons && comp.blockingReasons.length > 0) || comp.readinessStatus === "BLOCKED"
                              ? "组件发布阻断说明（BLOCKED）"
                              : comp.readinessStatus === "NOT_EXECUTABLE"
                                ? "运行能力不足（NOT_EXECUTABLE）"
                                : "组件当前不可执行（待配置/不可执行）"}
                          </span>
                        </div>
                        <p className="text-amber-800/90">
                          {comp.blockingReasons && comp.blockingReasons.length > 0
                            ? comp.blockingReasons.join("；")
                            : comp.readinessStatus === "NOT_EXECUTABLE"
                              ? "平台当前模型部署未满足合同所需能力要求，暂不可执行。"
                              : comp.readinessStatus === "UNCONFIGURED" || comp.isCandidateEligible || comp.activeContractLifecycle === "DRAFT"
                                ? "该组件尚未在平台正式发布上线（待配置/不可执行）。"
                                : comp.activeContractLifecycle === "ARCHIVED"
                                  ? "该组件合同已归档，暂不可执行。"
                                  : "该组件状态信息不可用，暂不可执行。"}
                        </p>
                      </div>
                    )}
                    {comp.qualityHints && comp.qualityHints.length > 0 && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[9px] leading-relaxed text-blue-900 font-medium space-y-0.5">
                        <div className="font-bold flex items-center gap-1 text-blue-950">
                          <span>💡 质量与使用限制说明</span>
                        </div>
                        {comp.qualityHints.map((hint: string, hIdx: number) => (
                          <p key={hIdx}>• {hint}</p>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={handleQuickUse}
                      disabled={!dispatcherContractReady}
                      className={`w-full h-8.5 text-white text-[10px] font-black rounded shadow-md transition-all flex items-center justify-center gap-1 ${
                        dispatcherContractReady
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#2b6cb0] hover:shadow-lg cursor-pointer"
                          : "bg-slate-300 cursor-not-allowed"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 fill-current text-white/20" />
                      <span>{dispatcherContractReady ? "立即使用 (一键转场)" : dispatcherContractLabel}</span>
                    </button>
                  </div>
                )}
              </section>

              {/* 3. 工作空间分发列表 - 极致扁平化 */}
              <section className="space-y-2.5">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  工作空间分发绑定矩阵
                </h3>

                {!isLoggedIn ? (
                  <div className="bg-amber-50/20 border border-amber-100 rounded-xl p-5 text-center shadow-sm space-y-3">
                    <p className="text-[10.5px] text-amber-800 font-bold">您当前为游客模式，无法绑定空间。</p>
                    <p className="text-[9.5px] text-slate-400 font-medium">请登录系统以在开发沙盒中装配此效能资产。</p>
                    <button
                      onClick={handleQuickUse}
                      className="w-full h-8 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-[9.5px] font-black rounded shadow transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                      <span>立即登录使用</span>
                    </button>
                  </div>
                ) : loadingConfig ? (
                  <div className="bg-white rounded-xl p-6 border border-slate-200/50 shadow-sm flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-1.5" />
                    <p className="text-[9.5px] text-slate-400 font-bold">读取空间矩阵...</p>
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="bg-white rounded-xl p-5 border border-slate-200 border-dashed text-center">
                    <p className="text-[10.5px] text-slate-500 font-bold">暂无可用工作空间</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">请前往控制台创建新开发空间</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {workspaces.map((ws) => {
                      const isWsBound = bindingStatusMap[ws.id] || false;
                      const isSelected = selectedWorkspaceId === ws.id;
                      const isProcessing = loadingStatuses[ws.id] || false;
                      const tokenBalance = workspaceQuotas[ws.id] || 0;

                      return (
                        <div
                          key={ws.id}
                          onClick={() => setSelectedWorkspaceId(ws.id)}
                          className={`border rounded-lg p-2.5 flex items-center justify-between transition-all cursor-pointer relative group ${
                            isSelected
                              ? "border-[#3182ce] ring-1 ring-[#3182ce]/15 bg-white shadow-[0_2px_8px_rgba(49,130,206,0.03)]"
                              : "border-slate-200/60 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* 同心圆激活指示器 - 更加扁平小巧 */}
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? "border-[#3182ce] bg-[#3182ce] text-white" : "border-slate-300"
                            }`}>
                              {isSelected && <div className="w-1 h-1 rounded-full bg-white"></div>}
                            </div>
                            
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[11px] font-black text-slate-800 truncate">{ws.name}</span>
                                {ws.type === "PERSONAL" ? (
                                  <span className="text-[7px] px-1 py-0.1 bg-slate-100 text-slate-400 rounded flex-shrink-0 font-bold scale-90">个人</span>
                                ) : (
                                  <span className="text-[7px] px-1 py-0.1 bg-amber-50 text-amber-500 rounded border border-amber-100 flex-shrink-0 font-bold scale-90">企业</span>
                                )}
                                
                                {isWsBound ? (
                                  <span className="text-[7.5px] px-1 py-0.1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex-shrink-0 font-black scale-90 flex items-center gap-0.5">
                                    <span className="w-0.8 h-0.8 rounded-full bg-emerald-500"></span>
                                    已装配
                                  </span>
                                ) : (
                                  <span className="text-[7.5px] px-1 py-0.1 bg-slate-100 text-slate-400 rounded-full border border-slate-200/50 flex-shrink-0 font-bold scale-90">
                                    待引进
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-slate-400 font-bold mt-0.5 flex items-center gap-1.5">
                                <span>算力:</span>
                                <span className={tokenBalance <= 0 ? "text-red-500 font-black font-mono" : "text-emerald-600 font-black font-mono"}>
                                  {tokenBalance.toLocaleString()} 算力点
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 右侧微按钮操作区 */}
                          <div className="flex items-center">
                            {isProcessing ? (
                              <div className="w-4 h-4 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
                            ) : (
                              <button
                                disabled={!dispatcherContractReady}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWorkspaceId(ws.id);
                                  setTimeout(handleQuickUse, 50);
                                }}
                                className={`h-6.5 px-2 text-[9px] font-black rounded transition-all flex items-center gap-0.5 border ${
                                  !dispatcherContractReady
                                    ? "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed"
                                    : isSelected
                                      ? "text-white bg-[#3182ce] border-[#3182ce] hover:bg-[#2b6cb0] cursor-pointer"
                                      : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200 cursor-pointer"
                                }`}
                              >
                                <span>{!dispatcherContractReady ? dispatcherContractLabel : isWsBound ? "进入" : "装配并运行"}</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}
