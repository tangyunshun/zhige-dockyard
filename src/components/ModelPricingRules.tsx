"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * 模型计价规则（分时段）统一展示组件。
 *
 * 背景：一个模型可配置多个计价时段（闲时 / 高峰 / 节假日 / 自定义），
 * 各时段有各自的生效范围与售价；真实成交价由服务端按当前时间自动裁决。
 * 本组件把该模型的**完整计价规则**一次性呈现给用户，避免只显示「当前一个时段」
 * 造成的困惑（如「闲时时段（全时段）」看似矛盾、看不到高峰/节假日）。
 *
 * 呈现：
 *  1. 顶部「闲时 / 高峰 / 节假日」三栏分层概览（当前生效项高亮「当前」）；
 *  2. 下方可展开「全部计价时段」明细（每时段：类型、名称、生效范围、输入/输出价）。
 *  无分时段时显示「日常主流基准价」。
 *
 * 数据来源：/api/workspace/available-models 下发的 pricingPeriods（字段可选，兼容多来源）。
 */
export interface PricingPeriodLike {
  id: string;
  name: string;
  kind: string;
  kindLabel?: string;
  isActiveNow?: boolean;
  scheduleText?: string;
  inputMicrosPerMillion: number | null;
  outputMicrosPerMillion: number | null;
  cacheReadMicrosPerMillion?: number | null;
  cacheWriteMicrosPerMillion?: number | null;
}

const KIND_ORDER = ["IDLE", "PEAK", "HOLIDAY"] as const;

const TIER_META: Record<string, { label: string; box: string; dot: string; text: string; caption: string }> = {
  IDLE: { label: "闲时", box: "bg-emerald-50/60 border-emerald-100", dot: "bg-emerald-500", text: "text-emerald-600", caption: "全天默认" },
  PEAK: { label: "高峰", box: "bg-rose-50/60 border-rose-100", dot: "bg-rose-500", text: "text-rose-600", caption: "工作日高峰窗口" },
  HOLIDAY: { label: "节假日", box: "bg-amber-50/60 border-amber-100", dot: "bg-amber-500", text: "text-amber-600", caption: "按官方日历自动" },
};

const KIND_LABEL_FALLBACK: Record<string, string> = {
  IDLE: "闲时",
  PEAK: "高峰",
  HOLIDAY: "节假日",
  CUSTOM: "自定义",
};

function yuan(micros: number | null | undefined): string {
  return micros == null ? "—" : `¥${(micros / 1_000_000).toFixed(2)}`;
}

export default function ModelPricingRules({
  periods,
  className = "",
}: {
  periods: PricingPeriodLike[] | null | undefined;
  className?: string;
}) {
  const list = Array.isArray(periods) ? periods.filter((p) => p && p.kind) : [];
  const [open, setOpen] = useState(false);

  if (list.length === 0) {
    return <div className={`text-[10px] text-slate-400 font-sans ${className}`}>日常主流基准价（未分时段）</div>;
  }

  // 三类分层概览：聚合该类型下所有时段，取任一已配价时段作价格代表，生效范围合并展示
  const tiers = KIND_ORDER.map((k) => {
    const group = list.filter((p) => p.kind === k);
    if (group.length === 0) return null;
    const rep = group.find((p) => p.inputMicrosPerMillion != null) || group[0];
    const caption =
      group.map((p) => p.scheduleText).filter(Boolean).join("、") || TIER_META[k].caption;
    return { kind: k, meta: TIER_META[k], rep, caption, active: group.some((p) => p.isActiveNow) };
  }).filter(Boolean) as {
    kind: string;
    meta: (typeof TIER_META)[string];
    rep: PricingPeriodLike;
    caption: string;
    active: boolean;
  }[];

  return (
    <div className={`space-y-1.5 ${className}`}>
      {tiers.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {tiers.map((t) => (
            <div
              key={t.kind}
              className={`rounded-lg border px-2 py-1.5 ${t.meta.box} ${t.active ? "ring-2 ring-[#3182ce]/30" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1 text-[10px] font-black ${t.meta.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${t.meta.dot}`} />
                  {t.meta.label}
                </span>
                {t.active && (
                  <span className="text-[8px] font-black text-[#3182ce] bg-white/80 border border-blue-100 rounded-full px-1.5 py-px">
                    当前
                  </span>
                )}
              </div>
              {t.rep.inputMicrosPerMillion != null ? (
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <div>
                    <div className="text-[8px] text-slate-400 font-semibold">输入</div>
                    <div className="text-[11px] font-black text-slate-700 tabular-nums leading-tight">
                      {yuan(t.rep.inputMicrosPerMillion)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-400 font-semibold">输出</div>
                    <div className="text-[11px] font-black text-slate-700 tabular-nums leading-tight">
                      {yuan(t.rep.outputMicrosPerMillion)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-slate-300 font-semibold">—</div>
              )}
              <div className="text-[9px] text-slate-400 mt-1 leading-tight">{t.caption}</div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-700 font-bold py-0.5 cursor-pointer"
      >
        <span>全部计价时段（{list.length}）</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1">
          {list.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-2 text-[10px] font-sans rounded px-1.5 py-1 ${
                p.isActiveNow ? "bg-amber-50 text-amber-700 font-bold" : "text-slate-500 bg-slate-50/60"
              }`}
            >
              <span className="flex items-center gap-1 min-w-0">
                <span className="shrink-0 px-1 rounded bg-white border border-slate-200 text-[9px] font-bold text-slate-600">
                  {p.kindLabel || KIND_LABEL_FALLBACK[p.kind] || "时段"}
                </span>
                <span className="truncate">{p.name}</span>
                <span className="text-slate-400 truncate">· {p.scheduleText || ""}</span>
              </span>
              <span className="shrink-0 font-mono">
                {yuan(p.inputMicrosPerMillion)}/{yuan(p.outputMicrosPerMillion)}
                {p.isActiveNow && <span className="ml-1 text-amber-600">生效中</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
