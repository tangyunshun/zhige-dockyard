"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { X, Shield, ArrowRight, Layers, Database, FileText, CheckCircle2, ChevronRight, Activity, Star, TrendingUp, Code, FolderOpen, Layout, Server, Monitor, Users, ShieldCheck, FlaskConical, Coins, Sparkles, ListOrdered, HelpCircle, Clock } from "lucide-react";
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

/**
 * 组件能力可视化图表（图表本体）：按数据库 detail.visual 规格渲染，因组件而异。
 * kind=flow 多节点流程图 / compare 前后对比条形图 / metrics 核心指标卡 / timeline 阶段时间线 / checklist 安全检查清单。
 * 所有数字均来自组件既有文案中的真实业务预估，前端不做任何数值编造。
 */
function VisualChartBody({ comp }: { comp: ComponentDefinition }) {
  const visual = comp.detail?.visual;
  if (!visual) return null;
  const accent = visual.accent || "#3182ce";

  const header = (
    <div className="flex items-baseline justify-between gap-2 flex-wrap">
      <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
        <TrendingUp className="w-3.5 h-3.5" style={{ color: accent }} />
        {visual.title || "能力可视化"}
      </h3>
      <span className="text-[8px] font-bold text-slate-400">业务预估口径 · 非压测承诺</span>
    </div>
  );

  // flow：多节点卡片流程图（节点数量与内容随组件而变，主题色来自数据库配置）
  if (visual.kind === "flow" && visual.nodes && visual.nodes.length >= 2) {
    return (
      <section className="space-y-2.5">
        {header}
        <div className="bg-gradient-to-br from-slate-50 via-blue-50/20 to-emerald-50/20 rounded-xl border border-slate-200 p-4">
          <div className="flex items-stretch gap-1.5 flex-wrap">
            {visual.nodes.map((n, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className="flex flex-col items-center justify-center gap-1 w-5 shrink-0">
                    <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                    <span
                      className="w-1 h-1 rounded-full animate-pulse [animation-delay:150ms] opacity-50"
                      style={{ backgroundColor: accent }}
                    />
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                  </div>
                )}
                <div className="flex-1 min-w-[110px] bg-white rounded-lg border border-slate-200 p-2.5 space-y-1">
                  <div className="text-[8px] font-black uppercase tracking-wider" style={{ color: accent }}>
                    {n.tag || `步骤 ${i + 1}`}
                  </div>
                  <div className="text-[10px] font-black text-slate-800 leading-snug">{n.title}</div>
                  {n.desc && <div className="text-[9px] text-slate-500 font-medium leading-snug">{n.desc}</div>}
                </div>
              </React.Fragment>
            ))}
          </div>
          {visual.caption && <p className="mt-2.5 text-[9px] text-slate-500 font-bold">{visual.caption}</p>}
        </div>
      </section>
    );
  }

  // pipeline：管线流程图（胶囊节点 + 渐变管线 + ping 流动光效，酷炫链路表达）
  if (visual.kind === "pipeline" && visual.nodes && visual.nodes.length >= 2) {
    return (
      <section className="space-y-2.5">
        {header}
        <div className="rounded-xl border border-slate-200 p-4 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}08, #ffffff 45%, ${accent}05)` }}
        >
          <div className="flex items-stretch gap-1 flex-wrap">
            {visual.nodes.map((n, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className="flex flex-col items-center justify-center w-6 shrink-0 self-stretch py-3">
                    <div className="relative w-full h-1 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${accent}30, ${accent}, ${accent}30)` }}
                    >
                      <span
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full animate-ping opacity-60"
                        style={{ backgroundColor: accent }}
                      />
                      <span
                        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    </div>
                    <span className="text-[7px] font-black text-slate-400 mt-1">STREAM</span>
                  </div>
                )}
                <div
                  className="flex-1 min-w-[104px] rounded-xl border-2 p-2.5 space-y-1 bg-white shadow-sm"
                  style={{ borderColor: `${accent}45` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full text-white text-[8px] font-black flex items-center justify-center shrink-0"
                      style={{ backgroundColor: accent }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[7.5px] font-black uppercase tracking-wider" style={{ color: accent }}>
                      {n.tag || `STAGE ${i + 1}`}
                    </span>
                  </div>
                  <div className="text-[10px] font-black text-slate-800 leading-snug">{n.title}</div>
                  {n.desc && <div className="text-[9px] text-slate-500 font-medium leading-snug">{n.desc}</div>}
                </div>
              </React.Fragment>
            ))}
          </div>
          {visual.caption && <p className="mt-2.5 text-[9px] text-slate-500 font-bold">{visual.caption}</p>}
        </div>
      </section>
    );
  }

  // console：终端执行模拟窗（输入 / 过程 / 输出全部取自组件真实文案，呈现真实执行示例）
  if (visual.kind === "console" && visual.consoleSpec) {
    const cs = visual.consoleSpec;
    return (
      <section className="space-y-2.5">
        {header}
        <div className="rounded-xl border border-slate-800/60 overflow-hidden shadow-lg">
          {/* 终端标题栏 */}
          <div className="bg-slate-900 px-3.5 py-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="ml-1.5 text-[8.5px] font-bold text-slate-400 font-mono truncate">
              {cs.title || `zhige-runtime · ${comp.id}`}
            </span>
          </div>
          {/* 终端内容 */}
          <div className="bg-[#0b1120] px-3.5 py-3 space-y-1.5 font-mono">
            <div className="flex items-start gap-1.5 text-[10px] leading-relaxed">
              <span className="text-emerald-400 font-black shrink-0">$</span>
              <span className="text-slate-200">{cs.input}</span>
            </div>
            {(cs.steps || []).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[9.5px] leading-relaxed pl-4">
                <span className="font-black shrink-0" style={{ color: accent }}>▸</span>
                <span className="text-slate-400">{s}</span>
              </div>
            ))}
            <div className="flex items-start gap-1.5 text-[10px] leading-relaxed pl-4 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" />
              <span className="text-emerald-300 font-bold">{cs.output}</span>
            </div>
            <div className="flex items-center gap-1 pl-4 pt-0.5">
              <span className="text-emerald-400 font-black text-[10px]">$</span>
              <span className="w-1.5 h-3.5 bg-emerald-400/80 animate-pulse rounded-[1px]" />
            </div>
          </div>
        </div>
        {visual.caption && <p className="text-[9px] text-slate-500 font-bold">{visual.caption}</p>}
      </section>
    );
  }

  // compare：传统人工 vs 使用组件 的对比条形图（条长按真实工时比例绘制）
  if (visual.kind === "compare" && visual.bars && visual.bars.length > 0) {
    return (
      <section className="space-y-2.5">
        {header}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-3 text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-300" /> 传统人工</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> 使用组件</span>
          </div>
          {visual.bars.map((b, i) => {
            // 条长按工时数量级示意（秒 < 分钟 < 十分钟 < 小时 < 天 < 周/月），
            // 避免悬殊比例（如 360:1）下短条完全不可见造成视觉失真
            const magnitudeWidth = (minutes: number) => {
              if (minutes < 1) return 10;
              if (minutes < 10) return 28;
              if (minutes < 60) return 46;
              if (minutes < 60 * 8) return 66;
              if (minutes < 60 * 24 * 3) return 84;
              return 100;
            };
            const beforeW = magnitudeWidth(b.before);
            const afterW = magnitudeWidth(b.after);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[9.5px] font-black text-slate-600">
                  <span>{b.label}</span>
                  <span className="font-mono text-emerald-600 whitespace-nowrap">{b.beforeText} → {b.afterText}</span>
                </div>
                <div className="space-y-1">
                  <div className="h-3 rounded-full bg-rose-100 overflow-hidden">
                    <div className="h-full rounded-full bg-rose-300" style={{ width: `${beforeW}%` }} />
                  </div>
                  <div className="h-3 rounded-full bg-emerald-50 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${afterW}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {visual.caption && <p className="text-[9px] text-slate-400 font-bold pt-1">{visual.caption}</p>}
        </div>
      </section>
    );
  }

  // metrics：核心指标卡（数字来自组件既有说明）
  if (visual.kind === "metrics" && visual.metrics && visual.metrics.length > 0) {
    return (
      <section className="space-y-2.5">
        {header}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visual.metrics.map((m, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/40 p-3 space-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-8 rounded-full blur-md pointer-events-none" style={{ backgroundColor: `${accent}12` }} />
              <div className="text-[14px] font-black font-mono leading-none" style={{ color: accent }}>{m.value}</div>
              <div className="text-[9px] font-black text-slate-700">{m.label}</div>
              {m.hint && <div className="text-[8.5px] text-slate-400 font-bold leading-snug">{m.hint}</div>}
            </div>
          ))}
        </div>
        {visual.caption && <p className="text-[9px] text-slate-400 font-bold">{visual.caption}</p>}
      </section>
    );
  }

  // timeline：阶段时间线（多阶段交付/计划类组件）
  if (visual.kind === "timeline" && visual.stages && visual.stages.length >= 2) {
    return (
      <section className="space-y-2.5">
        {header}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="relative">
            <div
              className="absolute left-[5px] top-2 bottom-2 w-0.5 rounded-full"
              style={{ background: `linear-gradient(to bottom, ${accent}, ${accent}66, #10b981)` }}
            />
            <div className="space-y-3">
              {visual.stages.map((s, i) => (
                <div key={i} className="relative pl-6">
                  <span className="absolute left-0 top-1 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: accent }} />
                  <div className="text-[8.5px] font-black uppercase tracking-wider" style={{ color: accent }}>{s.phase}</div>
                  <div className="text-[10px] font-black text-slate-800 leading-snug">{s.title}</div>
                  {s.desc && <div className="text-[9px] text-slate-500 font-medium leading-snug">{s.desc}</div>}
                </div>
              ))}
            </div>
          </div>
          {visual.caption && <p className="mt-2.5 text-[9px] text-slate-400 font-bold">{visual.caption}</p>}
        </div>
      </section>
    );
  }

  // checklist：安全 / 合规 / 审计类组件的风险检查清单（等级色标 + 处置说明）
  if (visual.kind === "checklist" && visual.checks && visual.checks.length > 0) {
    const levelStyle: Record<string, { bg: string; text: string; label: string }> = {
      high: { bg: "bg-rose-50 border-rose-200", text: "text-rose-600", label: "高危" },
      medium: { bg: "bg-amber-50 border-amber-200", text: "text-amber-600", label: "中危" },
      low: { bg: "bg-sky-50 border-sky-200", text: "text-sky-600", label: "关注" },
    };
    return (
      <section className="space-y-2.5">
        {header}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          {visual.checks.map((c, i) => {
            const st = levelStyle[c.level || "low"] || levelStyle.low;
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${st.bg}`}>
                <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${st.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black text-slate-800">{c.item}</span>
                    <span className={`px-1.5 py-px rounded text-[8px] font-black border ${st.text} border-current/30`}>
                      {st.label}
                    </span>
                  </div>
                  {c.note && <div className="text-[9px] text-slate-500 font-medium leading-snug mt-0.5">{c.note}</div>}
                </div>
              </div>
            );
          })}
          {visual.caption && <p className="text-[9px] text-slate-400 font-bold pt-1">{visual.caption}</p>}
        </div>
      </section>
    );
  }

  return null;
}

/**
 * 组件价值叙事包装：痛点（为什么需要它）→ 图表（它怎么帮你）→ 收获（你能得到什么）。
 * 让用户打开弹窗第一眼就知道「这组件能解决我的问题」。
 */
function VisualChart({ comp }: { comp: ComponentDefinition }) {
  const visual = comp.detail?.visual;
  const body = <VisualChartBody comp={comp} />;
  const hasPain = Boolean(visual?.painPoint);
  const hasGain = Boolean(visual?.gain);
  if (!hasPain && !hasGain) return body;

  return (
    <div className="space-y-2.5">
      {hasPain && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-100 bg-gradient-to-r from-rose-50/80 to-white px-3.5 py-2.5">
          <span className="shrink-0 mt-px w-4.5 h-4.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center leading-none">
            ?
          </span>
          <p className="text-[10.5px] text-slate-700 font-semibold leading-relaxed">
            <span className="text-rose-600 font-black">你的痛点：</span>
            {visual!.painPoint}
          </p>
        </div>
      )}
      {body}
      {hasGain && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-white px-3.5 py-2.5">
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-px" />
          <p className="text-[10.5px] text-slate-700 font-semibold leading-relaxed">
            <span className="text-emerald-600 font-black">用完你会得到：</span>
            {visual!.gain}
          </p>
        </div>
      )}
    </div>
  );
}

interface ComponentDispatcherPanelProps {
  isOpen: boolean;
  onClose: () => void;
  componentId: string | null;
  onNavigateToWorkspace?: (workspaceId: string, componentId: string) => void;
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

  /** 成本基准状态：ASSUMPTION = 平台真实历史基准未配置（必须标注为假设估算） */
  const costBaselineStatus = comp?.costBaselineStatus ?? null;

  const dispatcherFileConstraints = comp?.fileConstraints ?? null;

  /** 单次执行预计扣点：与空间执行面板、实际扣点同一真源（估价接口按模型单价动态换算）。
   *  严禁把目录 Token 估算值（estimatedModelTokens）直接当「算力点」展示——那是口径混用的根源。 */
  const [dispatchEstPoints, setDispatchEstPoints] = useState<number | null>(null);
  useEffect(() => {
    setDispatchEstPoints(null);
    if (!isOpen || !comp || !isLoggedIn || !selectedWorkspaceId) return;
    const authToken = getAuthToken();
    if (!authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ componentId: comp.id, workspaceId: selectedWorkspaceId });
        const res = await fetch(`/api/billing/estimate?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        const pts = json?.data?.points;
        if (!cancelled && typeof pts === "number" && pts > 0) setDispatchEstPoints(pts);
      } catch {
        if (!cancelled) setDispatchEstPoints(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, comp?.id, isLoggedIn, selectedWorkspaceId]);
  // 估价兜底：估价接口不可用时（未登录 / 未选空间 / 模型未裁决 / 合同未声明能力），
  // 用后台配置的固定扣点 estimatedModelTokens 兜底展示。平台模型下它就是真实扣点，
  // 文案统一标注「预估约」以覆盖 BYOK 动态计价与「只补不退」补扣场景，避免只显示模糊文案。
  const dispatchFallbackPoints =
    comp && Number.isFinite(comp.estimatedModelTokens) && comp.estimatedModelTokens > 0
      ? comp.estimatedModelTokens
      : null;
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

        // B. 一次性获取所有空间算力配额（无 quota 数据的空间不伪造余额，显示为 0 由用户自行充值）
        try {
          const res = await fetch("/api/user/workspace-hub/quota", { headers });
          if (res.ok) {
            const resData = await res.json();
            if (resData.success && resData.data?.workspaces) {
              resData.data.workspaces.forEach((w: any) => {
                quotaMap[w.id] = w.quota ? Number(w.quota.tokenBalance) : 0;
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
      <div className="relative w-full max-w-6xl h-[90vh] max-h-[860px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-98 duration-200 border border-slate-200/80 z-10">
        
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
                  {/* 单次消耗口径与空间执行面板、实际扣点一致（估价接口真源）；估价不可用时用后台固定扣点兜底为「预估约」 */}
                  <span>
                    单次消耗{" "}
                    {dispatchEstPoints != null
                      ? `${dispatchEstPoints} 算力点`
                      : dispatchFallbackPoints != null
                        ? `预估约 ${dispatchFallbackPoints} 算力点`
                        : "点数按模型单价动态折算"}
                    {isLoggedIn && selectedWorkspaceId ? "（以执行时实际扣点为准）" : ""}
                  </span>
                </div>
              </div>
              
              {/* 真实评分统计（component_stats.averageRating，由使用者评分重算；无评分显示"暂无评分"） */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                {(comp.averageRating ?? 0) > 0 ? (
                  <span>
                    评分 {comp.averageRating!.toFixed(1)} / 5
                    <span className="text-slate-400 font-medium ml-1">（{comp.ratingCount ?? 0} 位真实使用者评分）</span>
                  </span>
                ) : (
                  <span className="text-slate-400">暂无评分（评分来自真实执行过该组件的用户）</span>
                )}
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

            {/* 1.45 它是什么 · 深度解读（总体介绍放第一位：先知道它是干啥的，再看能力与流程） */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <Sparkles className="w-3.5 h-3.5 text-[#3182ce]" />
                它是什么 · 深度解读
              </h3>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  {comp.detail?.fullDescription || comp.description || "该组件的详细介绍正在完善中。"}
                </p>
              </div>
            </section>

            {/* 1.5 能力可视化图表：按数据库 visual 规格渲染（因组件而异），未配置时回退通用三节点流程图 */}
            {comp.detail?.visual ? (
              <VisualChart comp={comp} />
            ) : (
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <ArrowRight className="w-3.5 h-3.5 text-[#3182ce]" />
                工作流程 · 它怎么干活
              </h3>
              <div className="bg-gradient-to-br from-slate-50 via-blue-50/20 to-emerald-50/20 rounded-xl border border-slate-200 p-4">
                <div className="flex items-stretch gap-1.5">
                  {/* 节点①：你的输入 */}
                  <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 p-2.5 space-y-1.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
                    </div>
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">① 你的输入</div>
                    <div className="text-[10px] text-slate-800 font-bold leading-snug line-clamp-3">
                      {comp.previewData?.inputMock || comp.contract || "输入材料"}
                    </div>
                    <div className="text-[8.5px] text-slate-500 font-bold">
                      {comp.inputMode === "file" ? "文件上传" : comp.inputMode === "both" ? "上传 / 输入" : "文本输入"}
                    </div>
                  </div>

                  {/* 流动连接线（脉冲点 + 箭头） */}
                  <div className="flex flex-col items-center justify-center w-7 shrink-0 gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#3182ce] animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-[#3182ce]/60 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-[#3182ce]/30 animate-pulse [animation-delay:300ms]" />
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>

                  {/* 节点②：组件处理（视觉焦点，分类色渐变高亮） */}
                  <div className="flex-1 min-w-0 rounded-lg p-2.5 space-y-1.5 bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-10 h-10 bg-white/10 rounded-full blur-md pointer-events-none" />
                    <div className="w-7 h-7 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="text-[8px] font-black text-white/70 uppercase tracking-wider">② 组件处理</div>
                    <div className="text-[10px] text-white font-black leading-snug line-clamp-2">{comp.name}</div>
                    <div className="text-[8.5px] text-white/80 font-bold">
                      {dispatcherContractReady ? "已就绪 · 可执行" : dispatcherContractLabel}
                    </div>
                  </div>

                  {/* 流动连接线（输出侧绿色） */}
                  <div className="flex flex-col items-center justify-center w-7 shrink-0 gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-emerald-500/60 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-emerald-500/30 animate-pulse [animation-delay:300ms]" />
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>

                  {/* 节点③：交付成果 */}
                  <div className="flex-1 min-w-0 bg-white rounded-lg border border-emerald-200 p-2.5 space-y-1.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">③ 交付成果</div>
                    <div className="text-[10px] text-slate-800 font-bold leading-snug line-clamp-3">
                      {comp.previewData?.outputMock || comp.contract || "结构化成果"}
                    </div>
                    {comp.detail?.estimatedDuration ? (
                      <div className="text-[8.5px] text-slate-500 font-bold flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {comp.detail.estimatedDuration}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 底部约束信息条：数据契约 / 支持格式 / 大小限制（全部来自真实字段） */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] font-bold text-slate-500">
                  {comp.contract ? (
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-[#3182ce]" /> 数据契约：{comp.contract}</span>
                  ) : null}
                  {dispatcherFileConstraints?.acceptedMimes?.length ? (
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-[#3182ce]" /> {describeAcceptedMimes(dispatcherFileConstraints.acceptedMimes)}</span>
                  ) : null}
                  {dispatcherFileConstraints?.maxSingleFileBytes ? (
                    <span className="flex items-center gap-1"><Server className="w-3 h-3 text-[#3182ce]" /> 单文件 ≤ {Math.round(dispatcherFileConstraints.maxSingleFileBytes / 1024 / 1024)} MB</span>
                  ) : null}
                </div>
              </div>
            </section>
            )}

            {/* 1.6 核心能力：能帮我解决什么问题（用户决策的核心） */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <Sparkles className="w-3.5 h-3.5 text-[#3182ce]" />
                核心能力 · 能帮你解决什么
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(comp.detail?.capabilities && comp.detail.capabilities.length > 0
                  ? comp.detail.capabilities
                  : ["（能力清单完善中）"]
                ).map((cap: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 bg-white rounded-lg border border-slate-200 p-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                    <span className="text-[10.5px] text-slate-700 font-medium leading-relaxed">{cap}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 1.7 使用价值：能给你带来什么（用户决策的核心） */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                使用价值 · 能为你带来什么
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(comp.detail?.valueProps && comp.detail.valueProps.length > 0
                  ? comp.detail.valueProps
                  : ["（价值说明完善中）"]
                ).map((val: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 bg-emerald-50/50 rounded-lg border border-emerald-100 p-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-[10.5px] text-emerald-900 font-medium leading-relaxed">{val}</span>
                  </div>
                ))}
              </div>
              {/* 前后对比：以前 vs 现在 */}
              {comp.detail?.beforeAfter && comp.detail.beforeAfter.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> 以前 vs 现在
                  </div>
                  <div className="space-y-1.5">
                    {comp.detail.beforeAfter.map((item, i) => (
                      <div key={i} className="flex items-stretch gap-2 text-[10px]">
                        <div className="flex-1 rounded bg-rose-50 border border-rose-100 px-2 py-1.5 text-rose-700 font-medium">
                          以前：{item.before}
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 self-center shrink-0" />
                        <div className="flex-1 rounded bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-emerald-800 font-medium">
                          现在：{item.after}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

            {/* 4. 使用流程：怎么用 */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <ListOrdered className="w-3.5 h-3.5 text-[#3182ce]" />
                使用流程 · 怎么用
              </h3>
              {(() => {
                // detail.usage 的数据契约是「换行分隔的步骤字符串」（与 WorkspaceInternalLayoutV3 / ComponentDetail 一致），
                // 这里按换行拆成有序步骤渲染，避免对非数组做 .map 导致运行时崩溃。
                const raw = comp.detail?.usage;
                const steps: string[] =
                  typeof raw === "string" && raw.trim().length > 0
                    ? raw.split("\n").map((s) => s.trim()).filter(Boolean)
                    : ["在空间内装配该组件并配置运行模型。", "按合同要求准备输入材料。", "执行并查看结构化结果。"];
                return (
                  <ol className="space-y-2">
                    {steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 bg-white rounded-lg border border-slate-200 p-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-[#3182ce] text-white text-[9px] font-black flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-[10.5px] text-slate-600 font-medium leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </section>

            {/* 5. 真实战绩 / 口碑 */}
            <section className="bg-slate-50/60 rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#3182ce]" />
                  真实战绩
                </h3>
                <p className="text-[9.5px] text-slate-500 font-semibold">由服务端从真实执行记录聚合，无任何模拟数值</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center">
                  <div className="text-[16px] font-black text-slate-800 font-mono leading-none">
                    {(comp.realUsageCount ?? 0).toLocaleString("zh-CN")}
                  </div>
                  <div className="text-[8px] text-slate-400 font-bold mt-1">全网真实调用</div>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                {/* 历史成功率环形图（真实执行记录聚合，无模拟数值） */}
                {(() => {
                  const total = comp.realTaskStats?.total ?? 0;
                  const pct =
                    total > 0
                      ? Math.round(((comp.realTaskStats?.success ?? 0) / total) * 100)
                      : null;
                  return (
                    <div className="flex items-center gap-2">
                      <div className="relative w-11 h-11 shrink-0">
                        <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                          {pct !== null && (
                            <circle
                              cx="18"
                              cy="18"
                              r="15.5"
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={`${pct} ${100 - pct}`}
                            />
                          )}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-700">
                          {pct !== null ? `${pct}%` : "—"}
                        </div>
                      </div>
                      <div className="text-[8px] text-slate-400 font-bold leading-tight">
                        历史<br />成功率
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* 6. 常见问题 FAQ */}
            {comp.detail?.faq && comp.detail.faq.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#3182ce]" />
                  常见问题
                </h3>
                <div className="space-y-2">
                  {comp.detail.faq.map((item: { q: string; a: string }, i: number) => (
                    <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
                      <div className="text-[10.5px] font-black text-slate-800 flex items-start gap-1.5">
                        <span className="text-[#3182ce] shrink-0">Q</span>
                        <span>{item.q}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium leading-relaxed pl-4">{item.a}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                      <Coins className="w-3 h-3 text-[#3182ce]/70" /> 算力点: <strong className="text-slate-700 font-bold font-mono">{(workspaceQuotas[selectedWorkspace?.id || ""] || 0).toLocaleString()}</strong>
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

                {/* 组件大厅只负责介绍与装配引进；材料填写、模型配置与任务执行均在空间内完成 */}
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
                      <span>{dispatcherContractReady ? (isBound ? "立即执行" : "前往空间执行此组件") : dispatcherContractLabel}</span>
                    </button>
                  </div>
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
                    <p className="text-[9.5px] text-slate-400 font-bold">读取空间组件列表...</p>
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
