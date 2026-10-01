"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, Tag, Cpu, Search, Zap } from "lucide-react";

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

interface ModelPriceItem {
  id: string;
  providerId: string;
  providerName: string;
  modelId: string;
  upstreamModel: string;
  displayName: string;
  contextLimit: number;
  capabilities: string[];
  mainstream: PriceView | null;
  active: PriceView | null;
  activePeriodId: string | null;
  periods: PeriodView[];
}

const KIND_LABEL: Record<string, string> = { IDLE: "闲时", PEAK: "高峰", HOLIDAY: "节日", CUSTOM: "自定义" };
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
const WEEK_CN: Record<number, string> = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
const CAP_LABELS: Record<string, string> = {
  TEXT_GENERATION: "文本生成",
  STRUCTURED_OUTPUT: "结构化输出",
  VISION: "视觉理解",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文件分析",
};

const fmtYuan = (v: number | null): string =>
  v == null ? "—" : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

function timeRule(p: PeriodView): string {
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

export default function ModelPricingPage() {
  const [items, setItems] = useState<ModelPriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/model-pricing/public", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "加载模型定价失败");
        if (alive) setItems(data.data as ModelPriceItem[]);
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

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (it) =>
        it.displayName.toLowerCase().includes(kw) ||
        it.providerName.toLowerCase().includes(kw) ||
        it.modelId.toLowerCase().includes(kw) ||
        it.upstreamModel.toLowerCase().includes(kw),
    );
  }, [items, keyword]);

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
          <p className="text-sm text-slate-500 font-medium max-w-2xl leading-relaxed">
            以下为平台开放模型的实时计费标准。价格按「元 / 百万 Token」计；平台会按当前时段自动套用对应单价，
            你无需手动切换。本页仅供查看，不可修改。
          </p>
        </div>
      </section>

      {/* 工具条 */}
      <div className="relative max-w-6xl mx-auto px-6 pb-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按模型名 / 供应商筛选"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all"
          />
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
            暂无可展示的模型定价（{keyword ? "无匹配结果" : "平台尚未配置开放模型"}）
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((it) => {
              const open = !!expanded[it.id];
              const activePeriod = it.periods.find((p) => p.id === it.activePeriodId) || null;
              const activeTag = activePeriod ? KIND_LABEL[activePeriod.kind] || "时段" : "主流";
              return (
                <div
                  key={it.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col"
                >
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

                  {/* 能力标签 */}
                  {it.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {it.capabilities.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200"
                        >
                          {CAP_LABELS[c] || c}
                        </span>
                      ))}
                    </div>
                  )}

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
                    {it.active ? (
                      <div className="flex items-baseline gap-6">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold">输入</span>
                          <div className="text-xl font-black text-slate-800 tabular-nums">
                            {fmtYuan(it.active.input)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold">输出</span>
                          <div className="text-xl font-black text-slate-800 tabular-nums">
                            {fmtYuan(it.active.output)}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold self-end mb-1">
                          元 / 百万 Token
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-slate-400 py-1">暂未配置价格</div>
                    )}
                    {it.mainstream && it.activePeriodId && (
                      <p className="text-[10px] text-slate-400 mt-2">
                        主流基准价：输入 {fmtYuan(it.mainstream.input)} · 输出 {fmtYuan(it.mainstream.output)} 元/百万 Token
                      </p>
                    )}
                  </div>

                  {/* 时段价格表（可展开） */}
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [it.id]: !open }))}
                    className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-xs font-bold text-slate-600 transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#3182ce]" />
                      时段价格表（{it.periods.length}）
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>

                  {open && (
                    <div className="mt-2 space-y-2">
                      {it.periods.length === 0 ? (
                        <p className="text-[11px] text-slate-400 px-1 py-2">
                          该模型未配置分时段价格，全时段使用主流基准价。
                        </p>
                      ) : (
                        it.periods.map((p) => {
                          const isActive = p.id === it.activePeriodId;
                          return (
                            <div
                              key={p.id}
                              className={`rounded-xl border p-3 ${
                                isActive
                                  ? "border-amber-300 bg-amber-50/60 ring-1 ring-amber-200"
                                  : "border-slate-200 bg-white"
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
            })}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-10">
        <p className="text-[11px] text-slate-400 text-center">
          价格实时随平台配置更新；缓存读写单价仅在使用缓存命中时计费。如有疑问请前往
          <Link href="/pricing" className="text-[#3182ce] font-bold hover:underline mx-0.5">
            价格方案
          </Link>
          或联系客服。
        </p>
      </div>
    </div>
  );
}
