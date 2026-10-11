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
    <div className="bg-gradient-to-br from-[#f0f9ff] to-[#e6fffa] border border-[#bee3f8] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-2 text-[#2b6cb0]">
        <Percent className="w-5 h-5" />
        <span className="text-sm font-black tracking-tight">全局加价率（单一真源）</span>
      </div>

      <div className="text-xs text-slate-600">
        {loading ? (
          <span className="text-slate-400">读取中…</span>
        ) : (
          <>
            当前：
            <span className="font-bold text-[#2b6cb0]">
              {state.percent != null ? `${(state.percent).toFixed(2)}%` : "未配置"}
            </span>
            <span className="mx-1.5 text-slate-300">|</span>
            共 <span className="font-bold">{state.modelRows}</span> 主表
            <span className="mx-1.5 text-slate-300">|</span>
            <span className="font-bold text-slate-500">{state.overriddenModelRows}</span> 个已独立设置
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:ml-auto">
        {/* 模式单选：百分比 / 基点 互斥 */}
        <div className="flex items-center gap-1 self-end rounded-xl bg-white/70 p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => switchMode("percent")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "percent" ? "bg-[#3182ce] text-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            按百分比 (%)
          </button>
          <button
            type="button"
            onClick={() => switchMode("bps")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "bps" ? "bg-[#3182ce] text-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            按基点 (bps)
          </button>
        </div>

        {/* 仅展示当前模式输入框，避免双框赋值冲突 */}
        <div className="flex items-center gap-2">
          {mode === "percent" ? (
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={pctInput}
              onChange={(e) => setPctInput(e.target.value)}
              placeholder="如 30"
              className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm text-slate-800"
            />
          ) : (
            <input
              type="number"
              min={0}
              max={100000}
              step={1}
              value={bpsInput}
              onChange={(e) => setBpsInput(e.target.value)}
              placeholder="如 3000"
              className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm text-slate-800"
            />
          )}
          <span className="text-sm text-slate-500 font-bold">{mode === "percent" ? "%" : "bps"}</span>
          <button
            disabled={nextBps == null || syncing}
            onClick={() => {
              setPendingScope("default");
              setConfirmOpen(true);
            }}
            className="px-3 py-2 bg-white border border-[#3182ce] text-[#3182ce] hover:bg-[#ebf8ff] text-xs font-black rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            设为默认（保留独立）
          </button>
          <button
            disabled={nextBps == null || syncing}
            onClick={() => {
              setPendingScope("all");
              setConfirmOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            强制全量覆盖
          </button>
        </div>

        {/* 当前模式友好提示 */}
        <span className="text-[11px] text-slate-500">
          {mode === "percent"
            ? `相当于成本加价 ${pctValid ? pctNum : "X"}%，系统售价 = 成本 × ${
                pctValid ? (1 + pctNum / 100).toFixed(2) : "1.XX"
              }（自动折算为底层 ${pctValid ? Math.round(pctNum * 100) : "NNNN"} 基点）`
            : `什么是基点？金融与算力标准单位：1% = 100 基点，${
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
