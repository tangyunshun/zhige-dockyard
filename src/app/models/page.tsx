"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Clock, Tag, Cpu, Search, Zap, Calculator, AlertTriangle, Sparkles } from "lucide-react";
import { yuanToPoints, formatYuanFromPoints, POINT_UNIT_HINT, POINTS_PER_YUAN } from "@/lib/point-rate";

interface PriceView {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  source: string;
  status: string;
}

interface PeriodView {
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
  prices: { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null };
  source: string;
  status: string;
}

interface PricingMeta {
  peakWindow: { weekdaysText: string; ranges: string[] };
}

interface ModelPriceItem {
  id: string;
  providerId: string;
  providerName: string;
  modelId: string;
  upstreamModel: string;
  priceOrigin: string;
  displayName: string;
  contextLimit: number;
  capabilities: string[];
  mainstream: PriceView | null;
  active: PriceView | null;
  activePeriodId: string | null;
  periods: PeriodView[];
}

const KIND_LABEL: Record<string, string> = { IDLE: "闲时", PEAK: "高峰", HOLIDAY: "节假日", CUSTOM: "自定义" };
const KIND_CLASS: Record<string, string> = {
  IDLE: "bg-emerald-50 text-emerald-600 border-emerald-100",
  PEAK: "bg-rose-50 text-rose-600 border-rose-100",
  HOLIDAY: "bg-amber-50 text-amber-600 border-amber-100",
  CUSTOM: "bg-slate-100 text-slate-600 border-slate-200",
};
const STATUS_LABEL: Record<string, string> = {
  VERIFIED: "已生效",
  OBSERVED_ONLY: "仅观测",
  UNVERIFIED: "未验证",
  UNCONFIGURED: "未配置",
  FREE: "免费",
};
const STATUS_CLASS: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-600 border-emerald-100",
  OBSERVED_ONLY: "bg-sky-50 text-sky-600 border-sky-100",
  UNVERIFIED: "bg-amber-50 text-amber-600 border-amber-100",
  UNCONFIGURED: "bg-slate-100 text-slate-400 border-slate-200",
  FREE: "bg-purple-50 text-purple-600 border-purple-100",
};
const ORIGIN_LABEL: Record<string, string> = { PLATFORM: "平台模型", USER_BYOK: "空间自带" };
const ORIGIN_CLASS: Record<string, string> = {
  PLATFORM: "bg-blue-50 text-[#2b6cb0] border-blue-200",
  USER_BYOK: "bg-violet-50 text-violet-600 border-violet-200",
};
const WEEK_CN: Record<number, string> = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
const CAP_LABELS: Record<string, string> = {
  TEXT_GENERATION: "文本生成",
  STRUCTURED_OUTPUT: "结构化输出",
  VISION: "视觉理解",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文件分析",
};

/** 单次执行保底扣点（与后端 systemconfig billing.minPointsPerTask 默认一致，前端仅作展示参考） */
const MIN_POINTS_PER_TASK = 5;

const fmtYuan = (v: number | null): string =>
  v == null ? "—" : `¥${v.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}`;
/** 元/百万 ➔ 算力点/百万（100 算力点 = 1 元，统一口径） */
const fmtPoints = (v: number | null): string =>
  v == null ? "—" : `${yuanToPoints(v).toLocaleString("zh-CN")}`;

function timeRule(p: PeriodView): string {
  // 自动节假日：无日期/星期约束，由官方日历自动命中
  if (p.kind === "HOLIDAY" && !p.startDate && !p.endDate && !p.weekdays && !p.startTime && !p.endTime) {
    return "法定节假日自动套用（按国务院官方日历）";
  }
  const parts: string[] = [];
  if (p.weekdays && p.weekdays.trim()) {
    const days = p.weekdays
      .split(",")
      .map((s) => WEEK_CN[Number(s.trim())])
      .filter(Boolean);
    if (days.length) parts.push(days.join("、"));
  }
  if (p.startTime && p.endTime) parts.push(`${p.startTime}~${p.endTime}`);
  let s = parts.length ? parts.join(" ") : "全天";
  if (p.startDate || p.endDate) s += `（${p.startDate ?? "起"} ~ ${p.endDate ?? "止"}）`;
  return s;
}

/** 按当前生效价估算扣点：费用 = 输入/百万×单价 + 输出/百万×单价；保底 MIN_POINTS_PER_TASK 点 */
function estimatePoints(active: PriceView | null, inTokens: number, outTokens: number): number | null {
  if (!active || active.input == null || active.output == null) return null;
  if (inTokens <= 0 && outTokens <= 0) return null;
  const yuan =
    (Math.max(0, inTokens) / 1_000_000) * active.input +
    (Math.max(0, outTokens) / 1_000_000) * active.output;
  if (yuan <= 0) return null;
  return Math.max(yuanToPoints(yuan), MIN_POINTS_PER_TASK);
}

function ModelCard({ it }: { it: ModelPriceItem }) {
  const [open, setOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [inTokens, setInTokens] = useState("");
  const [outTokens, setOutTokens] = useState("");

  const activePeriod = it.periods.find((p) => p.id === it.activePeriodId) || null;
  // 时段列表：当前生效中的时段排第一，其余保持原（优先级）顺序
  const sortedPeriods = [...it.periods].sort(
    (a, b) => Number(b.id === it.activePeriodId) - Number(a.id === it.activePeriodId),
  );
  const activeTag = activePeriod ? KIND_LABEL[activePeriod.kind] || "时段" : "主流";
  const hasPrice = !!it.active && it.active.input != null && it.active.output != null;
  const est = estimatePoints(it.active, Number(inTokens), Number(outTokens));

  const verifyStatus = it.active?.status ?? it.mainstream?.status ?? "UNCONFIGURED";

  // 分时分层价目（面向客户）：闲时=基础价，高峰=工作日高峰窗口，节假日=法定节假日（自动按闲时价）
  // 只依据该模型自己配置的时段渲染；未配置分时价的模型不显示分层块（不借用其他模型的全局窗口）
  const ownPeriods = it.periods.filter((p) => p.enabled);
  const hasOwnTiers = ownPeriods.some((p) => p.kind === "IDLE" || p.kind === "PEAK" || p.kind === "HOLIDAY");
  const idleTier =
    ownPeriods.find((p) => p.kind === "IDLE")?.prices ??
    (it.mainstream && it.mainstream.input != null && it.mainstream.output != null
      ? { input: it.mainstream.input, output: it.mainstream.output, cacheRead: it.mainstream.cacheRead, cacheWrite: it.mainstream.cacheWrite }
      : null);
  const peakTier = ownPeriods.find((p) => p.kind === "PEAK")?.prices ?? null;
  const holidayTier = ownPeriods.find((p) => p.kind === "HOLIDAY")?.prices ?? null;
  const peakCaption = ownPeriods
    .filter((p) => p.kind === "PEAK")
    .map((p) => (p.startTime && p.endTime ? `${p.startTime}-${p.endTime}` : timeRule(p)))
    .join("/");

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-800 truncate flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#3182ce] shrink-0" />
            {it.displayName}
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
            {it.providerName} · {it.modelId}
          </p>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-[#2b6cb0] border border-blue-200">
          上下文 {it.contextLimit.toLocaleString()} Token
        </span>
      </div>

      {/* 标签行：价格来源 + 核验状态 */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
            ORIGIN_CLASS[it.priceOrigin] || ORIGIN_CLASS.PLATFORM
          }`}
        >
          {ORIGIN_LABEL[it.priceOrigin] || "平台模型"}
        </span>
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
            STATUS_CLASS[verifyStatus] || STATUS_CLASS.UNCONFIGURED
          }`}
        >
          {STATUS_LABEL[verifyStatus] || verifyStatus}
        </span>
        {it.capabilities.map((c) => (
          <span
            key={c}
            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200"
          >
            {CAP_LABELS[c] || c}
          </span>
        ))}
      </div>

      {/* 当前生效价 */}
      <div className="mt-4 rounded-xl bg-gradient-to-br from-[#3182ce]/[0.06] to-purple-500/[0.04] border border-blue-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#2b6cb0]" />
            当前生效价（{activeTag}价）
          </span>
          {activePeriod && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
              {activePeriod.name}
            </span>
          )}
        </div>
        {hasPrice ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold">输入</span>
                <div className="text-lg font-black text-slate-800 tabular-nums">{fmtYuan(it.active!.input)}</div>
                <span className="text-[10px] text-[#3182ce] font-semibold tabular-nums">
                  {fmtPoints(it.active!.input)} 点 / 百万
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold">输出</span>
                <div className="text-lg font-black text-slate-800 tabular-nums">{fmtYuan(it.active!.output)}</div>
                <span className="text-[10px] text-[#3182ce] font-semibold tabular-nums">
                  {fmtPoints(it.active!.output)} 点 / 百万
                </span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              单价单位：元 / 百万 Token（{POINTS_PER_YUAN} 算力点 = 1 元）
            </p>
          </>
        ) : (
          <div className="text-sm font-bold text-slate-400 py-1">暂未配置价格</div>
        )}
        {it.mainstream && it.activePeriodId && hasPrice && (
          <p className="text-[10px] text-slate-400 mt-2 border-t border-blue-100 pt-2">
            主流基准价（闲时）：输入 {fmtYuan(it.mainstream.input)} · 输出 {fmtYuan(it.mainstream.output)} 元/百万 Token
          </p>
        )}
        {hasOwnTiers && (idleTier || peakTier || holidayTier) && (() => {
          const activeKind = it.periods.find((p) => p.id === it.activePeriodId)?.kind;
          const tiers = [
            {
              kind: "IDLE",
              label: "闲时",
              caption: "全天默认",
              tier: idleTier,
              box: "bg-emerald-50/60 border-emerald-100",
              dot: "bg-emerald-500",
              text: "text-emerald-600",
            },
            {
              kind: "PEAK",
              label: "高峰",
              caption: peakCaption,
              tier: peakTier,
              box: "bg-rose-50/60 border-rose-100",
              dot: "bg-rose-500",
              text: "text-rose-600",
            },
            {
              kind: "HOLIDAY",
              label: "节假日",
              caption: "按官方日历自动",
              tier: holidayTier,
              box: "bg-amber-50/60 border-amber-100",
              dot: "bg-amber-500",
              text: "text-amber-600",
            },
          ];
          return (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-blue-100 pt-3">
              {tiers.map((t) => (
                <div
                  key={t.kind}
                  className={`rounded-lg border px-2.5 py-2 transition-shadow ${t.box} ${
                    activeKind === t.kind ? "ring-2 ring-[#3182ce]/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1 text-[10px] font-black ${t.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
                      {t.label}
                    </span>
                    {activeKind === t.kind && (
                      <span className="text-[8px] font-black text-[#3182ce] bg-white/80 border border-blue-100 rounded-full px-1.5 py-px">
                        当前
                      </span>
                    )}
                  </div>
                  {t.tier ? (
                    <div className="mt-1.5 grid grid-cols-2 gap-1">
                      <div>
                        <div className="text-[8px] text-slate-400 font-semibold">输入</div>
                        <div className="text-[11px] font-black text-slate-700 tabular-nums leading-tight">
                          {fmtYuan(t.tier.input)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400 font-semibold">输出</div>
                        <div className="text-[11px] font-black text-slate-700 tabular-nums leading-tight">
                          {fmtYuan(t.tier.output)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-slate-300 font-semibold">—</div>
                  )}
                  <div className="text-[9px] text-slate-400 mt-1.5 leading-tight">{t.caption}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 费用估算器（可展开） */}
      <button
        type="button"
        onClick={() => setCalcOpen((s) => !s)}
        className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-xs font-bold text-slate-600 transition-all cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-[#3182ce]" />
          费用估算器
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${calcOpen ? "rotate-180" : ""}`} />
      </button>
      {calcOpen && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
          {hasPrice ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] text-slate-500 font-bold">输入 Token</span>
                  <input
                    type="number"
                    min="0"
                    value={inTokens}
                    onChange={(e) => setInTokens(e.target.value)}
                    placeholder="如 2000"
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 outline-none focus:border-[#3182ce]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-slate-500 font-bold">输出 Token</span>
                  <input
                    type="number"
                    min="0"
                    value={outTokens}
                    onChange={(e) => setOutTokens(e.target.value)}
                    placeholder="如 1000"
                    className="mt-1 w-full h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 outline-none focus:border-[#3182ce]"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white border border-blue-100 px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500">预计扣点</span>
                <span className="font-mono text-base font-black text-[#3182ce] tabular-nums">
                  {est == null ? "—" : `${est} 点`}
                  {est != null && (
                    <span className="text-[10px] text-slate-400 font-semibold ml-1">
                      （{formatYuanFromPoints(est)}）
                    </span>
                  )}
                </span>
              </div>
              {est != null && est === MIN_POINTS_PER_TASK && (Number(inTokens) > 0 || Number(outTokens) > 0) && (
                <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  已达单次保底 {MIN_POINTS_PER_TASK} 点（用量过低时按保底计）。
                </p>
              )}
              <p className="text-[10px] text-slate-400 leading-relaxed">
                估算依据：当前生效单价 × 填写用量；单次执行保底 {MIN_POINTS_PER_TASK} 点。实际扣点以执行前估价为准。
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">该模型未配置价格，暂无法估算费用。</p>
          )}
        </div>
      )}

      {/* 时段价格表（可展开） */}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-xs font-bold text-slate-600 transition-all cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-[#3182ce]" />
          时段价格表（{it.periods.length}）
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {it.periods.length === 0 ? (
            <p className="text-[11px] text-slate-400 px-1 py-2">该模型未配置分时段价格，全时段使用主流基准价。</p>
          ) : (
            sortedPeriods.map((p) => {
              const isActive = p.id === it.activePeriodId;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 ${
                    isActive ? "border-amber-300 bg-amber-50/60 ring-1 ring-amber-200" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                          KIND_CLASS[p.kind] || KIND_CLASS.CUSTOM
                        }`}
                      >
                        {KIND_LABEL[p.kind] || "时段"}
                      </span>
                      <span className="text-xs font-black text-slate-700 truncate">{p.name}</span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-white shrink-0">
                          生效中
                        </span>
                      )}
                      {!p.enabled && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500 shrink-0">
                          已停用
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400">
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeRule(p)}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">输入</span>
                      <span className="font-bold text-slate-700 tabular-nums">{fmtYuan(p.prices.input)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">输出</span>
                      <span className="font-bold text-slate-700 tabular-nums">{fmtYuan(p.prices.output)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">缓存读</span>
                      <span className="font-bold text-slate-700 tabular-nums">{fmtYuan(p.prices.cacheRead)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">缓存写</span>
                      <span className="font-bold text-slate-700 tabular-nums">{fmtYuan(p.prices.cacheWrite)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function ModelPricingPage() {
  const [items, setItems] = useState<ModelPriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [capFilter, setCapFilter] = useState<string | null>(null);
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [meta, setMeta] = useState<PricingMeta | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/model-pricing/public", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "加载模型定价失败");
        if (alive) {
          setItems(data.data as ModelPriceItem[]);
          setMeta((data.meta as PricingMeta) ?? null);
        }
      } catch (e) {
        if (alive) setError((e as Error)?.message || "加载失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const providers = useMemo(
    () => Array.from(new Set(items.map((it) => it.providerName))).sort(),
    [items],
  );
  const capabilities = useMemo(
    () => Array.from(new Set(items.flatMap((it) => it.capabilities))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((it) => {
      if (providerFilter && it.providerName !== providerFilter) return false;
      if (capFilter && !it.capabilities.includes(capFilter)) return false;
      if (onlyPriced && !(it.active && it.active.input != null && it.active.output != null)) return false;
      if (!kw) return true;
      return (
        it.displayName.toLowerCase().includes(kw) ||
        it.providerName.toLowerCase().includes(kw) ||
        it.modelId.toLowerCase().includes(kw) ||
        it.upstreamModel.toLowerCase().includes(kw)
      );
    });
  }, [items, keyword, providerFilter, capFilter, onlyPriced]);

  const pricedCount = items.filter((it) => it.active && it.active.input != null).length;

  return (
    <div className="min-h-screen bg-[#f0f8ff] font-sans">
      {/* Hero */}
      <section className="relative pt-16 pb-8 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.10) 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-blue-200/30 mb-4">
            <span className="text-xs text-[#2b6cb0] font-black tracking-wide flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              平台模型计费公示
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight mb-2">
            模型定价与时段价格表
          </h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            以下为平台开放模型的实时计费标准。价格按「元 / 百万 Token」计（{POINTS_PER_YUAN} 算力点 = 1 元）。分时规则（随后台配置实时变化）：
            <b className="text-slate-600">闲时</b>为全天基础价；
            <b className="text-slate-600">高峰</b>
            {meta?.peakWindow?.ranges?.length
              ? `为${meta.peakWindow.weekdaysText} ${meta.peakWindow.ranges.join("、")} 的加价单价`
              : "为后台配置的高峰窗口加价单价"}
            ；
            <b className="text-slate-600">节假日</b>为法定节假日（按官方日历自动命中）按闲时价计费。平台按当前时段自动套用对应单价，你无需手动切换。本页仅供查看，不可修改。
          </p>
        </div>
      </section>

      {/* 计费口径说明条 */}
      <div className="relative max-w-6xl mx-auto px-6 pb-4">
        <div className="rounded-2xl border border-blue-200/60 bg-white/80 backdrop-blur-sm px-4 py-3 flex items-start gap-2.5 shadow-sm">
          <Sparkles className="w-4 h-4 text-[#3182ce] mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {POINT_UNIT_HINT} 当前为「按预估算力点扣减」兼容模式：执行前展示的预估扣点供参考，
            真实按 Token 结算（按实际用量多退少补）将在后续版本上线。价格如有调整以线上公示为准。
          </p>
        </div>
      </div>

      {/* 工具条 */}
      <div className="relative max-w-6xl mx-auto px-6 pb-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按模型名 / 供应商筛选"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all"
          />
        </div>

        {/* 供应商筛选 */}
        {providers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-bold mr-1">供应商</span>
            <button
              type="button"
              onClick={() => setProviderFilter(null)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                providerFilter === null
                  ? "bg-[#3182ce] text-white border-[#3182ce]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-[#3182ce]/40"
              }`}
            >
              全部
            </button>
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProviderFilter(p)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                  providerFilter === p
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white text-slate-500 border-slate-200 hover:border-[#3182ce]/40"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* 能力筛选 */}
        {capabilities.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-bold mr-1">能力</span>
            <button
              type="button"
              onClick={() => setCapFilter(null)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                capFilter === null
                  ? "bg-[#3182ce] text-white border-[#3182ce]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-[#3182ce]/40"
              }`}
            >
              全部
            </button>
            {capabilities.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCapFilter(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                  capFilter === c
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white text-slate-500 border-slate-200 hover:border-[#3182ce]/40"
                }`}
              >
                {CAP_LABELS[c] || c}
              </button>
            ))}
          </div>
        )}

        {/* 仅看已配置 + 计数 */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyPriced}
              onChange={(e) => setOnlyPriced(e.target.checked)}
              className="rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30"
            />
            仅显示已配置价格
          </label>
          <span className="text-[11px] text-slate-400 font-semibold">
            共 {items.length} 个模型 · 已配置 {pricedCount} 个 · 命中 {filtered.length}
          </span>
        </div>
      </div>

      {/* 列表 */}
      <div className="relative max-w-6xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="text-center py-20 text-sm text-slate-400 font-bold">正在加载模型定价…</div>
        ) : error ? (
          <div className="text-center py-20 text-sm text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-2xl">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-sm text-slate-400 font-bold">
            暂无可展示的模型定价（{keyword || providerFilter || capFilter || onlyPriced ? "无匹配结果" : "平台尚未配置开放模型"}）
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((it) => (
              <ModelCard key={it.id} it={it} />
            ))}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-10">
        <p className="text-[11px] text-slate-400 text-center">
          价格实时随平台配置更新；缓存读写单价仅在使用缓存命中时计费。如有疑问请联系客服。
        </p>
      </div>
    </div>
  );
}
