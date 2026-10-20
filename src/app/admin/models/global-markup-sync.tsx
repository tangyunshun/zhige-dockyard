"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Percent, RefreshCw, TriangleAlert } from "lucide-react";

interface MarkupState {
  markupCoefficientBps: number | null;
  percent: number | null;
  modelRows: number;
  periodRows: number;
  overriddenModelRows: number;
}

async function authFetch(url: string, init?: RequestInit) {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

type MarkupMode = "percent" | "bps";

export function GlobalMarkupSync({ onApplied }: { onApplied?: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<MarkupState>({
    markupCoefficientBps: null,
    percent: null,
    modelRows: 0,
    periodRows: 0,
    overriddenModelRows: 0,
  });
  const [loading, setLoading] = useState(true);
  // 问题4：百分比(%) / 基点(bps) 单选互斥，仅展示当前模式的输入框
  const [mode, setMode] = useState<MarkupMode>("percent");
  const [pctInput, setPctInput] = useState("");
  const [bpsInput, setBpsInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingScope, setPendingScope] = useState<"default" | "all">("all");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, json } = await authFetch("/api/admin/model-pricing/global-markup", { method: "GET" });
    if (ok && json?.success) {
      setState({
        markupCoefficientBps: json.data.markupCoefficientBps,
        percent: json.data.percent,
        modelRows: json.data.modelRows ?? 0,
        periodRows: json.data.periodRows ?? 0,
        overriddenModelRows: json.data.overriddenModelRows ?? 0,
      });
      // 预填当前值：百分比模式填百分比、基点模式填基点（两者均为同一真源的两种表达）
      setPctInput(json.data.percent != null ? String(Number(Number(json.data.percent).toFixed(2))) : "");
      setBpsInput(json.data.markupCoefficientBps != null ? String(json.data.markupCoefficientBps) : "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pctNum = Number(pctInput);
  const bpsNum = Number(bpsInput);
  const pctValid = pctInput.trim() !== "" && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 1000;
  const bpsValid =
    bpsInput.trim() !== "" && Number.isFinite(bpsNum) && Number.isInteger(bpsNum) && bpsNum >= 0 && bpsNum <= 100_000;
  const nextBps = mode === "percent" ? (pctValid ? Math.round(pctNum * 100) : null) : bpsValid ? bpsNum : null;
  const nextPct = nextBps != null ? nextBps / 100 : null;

  // 切换模式时自动折算当前输入到另一单位（如 20% ↔ 2000 bps）
  const switchMode = (m: MarkupMode) => {
    if (m === mode) return;
    const cur = mode === "percent" ? (pctValid ? pctNum : NaN) : bpsValid ? bpsNum : NaN;
    if (Number.isFinite(cur)) {
      if (m === "bps") setBpsInput(String(Math.round(cur * 100)));
      else setPctInput(String(cur / 100));
    }
    setMode(m);
  };

  const doSync = async () => {
    if (nextBps == null) {
      toast.error("请输入有效的加价率");
      return;
    }
    setSyncing(true);
    const { ok, json } = await authFetch("/api/admin/model-pricing/global-markup", {
      method: "POST",
      body: JSON.stringify({ percent: nextPct, scope: pendingScope }),
    });
    setSyncing(false);
    if (ok && json?.success) {
      toast.success(
        pendingScope === "default"
          ? `全局默认加价率已设为 ${(nextBps / 100).toFixed(2)}%（已独立设置的 ${json.data.overriddenModelRows} 个模型不受影响）`
          : `全局加价率已同步为 ${(nextBps / 100).toFixed(2)}%（影响 ${json.data.modelRows} 个主表 + ${json.data.periodRows} 个时段）`,
      );
      setConfirmOpen(false);
      await load();
      onApplied?.();
    } else {
      toast.error(json?.error || "全局加价率同步失败");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden">
      {/* 头部：标题与模式切换 */}
      <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center shrink-0 shadow-2xs">
            <Percent className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">全局加价率</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-100/80">
                单一真源
              </span>
            </div>
            <div
              className="text-[11px] text-slate-400 truncate"
              title="管控全部官方提供商模型与时段价上浮系数"
            >
              管控全部官方提供商模型与时段价上浮系数
            </div>
          </div>
        </div>

        {/* 模式单选：百分比 / 基点 互斥切换 */}
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 border border-slate-200/60 shrink-0">
          <button
            type="button"
            onClick={() => switchMode("percent")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
              mode === "percent"
                ? "bg-white text-[#2b6cb0] shadow-2xs"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            百分比 (%)
          </button>
          <button
            type="button"
            onClick={() => switchMode("bps")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
              mode === "bps"
                ? "bg-white text-[#2b6cb0] shadow-2xs"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            基点 (bps)
          </button>
        </div>
      </div>

      {/* 中部：核心指标与配置操作 */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* KPI 关键指标栏 */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-50/80 border border-slate-100/90 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400 font-medium">当前基准加价率</div>
            <div className="text-lg font-black font-mono text-[#2b6cb0] mt-0.5">
              {loading ? "…" : state.percent != null ? `${state.percent.toFixed(2)}%` : "未配置"}
            </div>
          </div>
          <div className="bg-slate-50/80 border border-slate-100/90 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400 font-medium">覆盖主表总数</div>
            <div className="text-lg font-black font-mono text-slate-700 mt-0.5">
              {loading ? "…" : state.modelRows}
            </div>
          </div>
          <div className="bg-slate-50/80 border border-slate-100/90 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400 font-medium">独立设置模型数</div>
            <div className="text-lg font-black font-mono text-slate-500 mt-0.5">
              {loading ? "…" : state.overriddenModelRows}
            </div>
          </div>
        </div>

        {/* 输入框与操作按钮组合栏 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex items-center min-w-[130px] flex-1 sm:flex-initial">
            {mode === "percent" ? (
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={pctInput}
                onChange={(e) => setPctInput(e.target.value)}
                placeholder="如 20"
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-sm font-semibold text-slate-800 transition-all"
              />
            ) : (
              <input
                type="number"
                min={0}
                max={100000}
                step={1}
                value={bpsInput}
                onChange={(e) => setBpsInput(e.target.value)}
                placeholder="如 2000"
                className="w-full pl-3 pr-11 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-sm font-semibold text-slate-800 transition-all"
              />
            )}
            <span className="absolute right-3 text-xs text-slate-400 font-bold pointer-events-none">
              {mode === "percent" ? "%" : "bps"}
            </span>
          </div>

          <button
            type="button"
            disabled={nextBps == null || syncing}
            onClick={() => {
              setPendingScope("default");
              setConfirmOpen(true);
            }}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:border-[#3182ce] hover:text-[#3182ce] text-xs font-bold rounded-lg shadow-2xs hover:shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            设为默认 (保留独立)
          </button>

          <button
            type="button"
            disabled={nextBps == null || syncing}
            onClick={() => {
              setPendingScope("all");
              setConfirmOpen(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#234e70] text-white text-xs font-bold rounded-lg shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            强制全量覆盖
          </button>
        </div>
      </div>

      {/* 底部折算说明栏 */}
      <div className="bg-slate-50/70 border-t border-slate-100/90 px-4 sm:px-5 py-2.5 text-[11px] text-slate-500 flex items-center justify-between gap-2">
        <span className="truncate">
          {mode === "percent"
            ? `相当于成本加价 ${pctValid ? pctNum : "X"}%，系统售价 = 成本 × ${
                pctValid ? (1 + pctNum / 100).toFixed(2) : "1.XX"
              }（自动折算为底层 ${pctValid ? Math.round(pctNum * 100) : "NNNN"} 基点）`
            : `金融与算力标准单位：1% = 100 基点，${
                bpsValid ? `${bpsNum} 基点即加价 ${(bpsNum / 100).toFixed(2)}%` : "2000 基点即加价 20.00%"
              }`}
        </span>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        type="danger"
        title={pendingScope === "default" ? "确认设为全局默认加价率？" : "确认全局调整加价率？"}
        message={
          pendingScope === "default"
            ? "仅把该加价率写入系统配置（billing.markupCoefficientBps）作为全局默认；已独立设置加价率的模型（markupRateBps 非空）不受影响，仍按其自身值结算。继承全局的模型将即时按新默认派生售价。"
            : "此操作将把同一加价率应用到全部模型主表与全部时段价，并写入系统配置作为唯一真源。所有模型对外售价将按新加价率实时重新派生（已独立设置的模型也会被覆盖）。"
        }
        warnings={
          pendingScope === "default"
            ? [
                `全局默认：${state.percent != null ? (state.percent).toFixed(2) : "—"}% → ${nextPct != null ? nextPct.toFixed(2) : "—"}%`,
                `已独立设置的模型：${state.overriddenModelRows} 个（保持不变）`,
                "本操作立即对所有继承全局的模型生效",
              ]
            : [
                `影响面：${state.modelRows} 个模型主表 + ${state.periodRows} 个时段价`,
                `加价率：${state.percent != null ? (state.percent).toFixed(2) : "—"}% → ${nextPct != null ? nextPct.toFixed(2) : "—"}%`,
                `已独立设置的 ${state.overriddenModelRows} 个模型也会被覆盖`,
                "每行价格版本 +1，且写入操作审计日志（含变更前后值）",
                "本操作立即对所有用户估价 / 结算口径生效，无法撤销",
              ]
        }
        confirmText="确认全局同步"
        cancelText="取消"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSync}
      />
    </div>
  );
}
