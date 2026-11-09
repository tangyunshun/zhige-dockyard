"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Percent, RefreshCw } from "lucide-react";

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

const MAX_PERCENT = 100;

export function ByokServiceRateSync({ onApplied }: { onApplied?: () => void }) {
  const toast = useToast();
  const [bps, setBps] = useState<number | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, json } = await authFetch("/api/admin/model-pricing/byok-service-rate", { method: "GET" });
    if (ok && json?.success) {
      setBps(json.data.byokServiceRateBps);
      setPercent(json.data.percent);
      setInput(json.data.percent != null ? String(Number(Number(json.data.percent).toFixed(2))) : "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pctNum = Number(input);
  const valid = input.trim() !== "" && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= MAX_PERCENT;

  const doSave = async () => {
    if (!valid) {
      toast.error(`请输入 0~${MAX_PERCENT} 之间的服务费率百分比`);
      return;
    }
    setSaving(true);
    const { ok, json } = await authFetch("/api/admin/model-pricing/byok-service-rate", {
      method: "POST",
      body: JSON.stringify({ percent: pctNum }),
    });
    setSaving(false);
    if (ok && json?.success) {
      toast.success(`BYO 平台服务费率已保存为 ${(json.data.percent as number).toFixed(2)}%（仅保存配置；Studio 自带模型任务调用仍暂停，保存不会恢复调用或启动收费，恢复需单独授权）`);
      setConfirmOpen(false);
      await load();
      onApplied?.();
    } else {
      toast.error(json?.error || "保存 BYO 服务费率失败");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden">
      {/* 头部：标题与生效状态 */}
      <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
            <Percent className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">BYO 平台服务费率</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100/80">
                单一真源
              </span>
            </div>
            <div
              className="text-[11px] text-slate-400 truncate"
              title="对所有空间自带私有模型（BYO）的统一抽佣比例（仅存配置；Studio 自带模型任务调用仍暂停，恢复需单独授权）"
            >
              自带私有模型（BYO）全局统一抽佣比例（仅存配置）
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-100/80 text-amber-700 text-[11px] font-bold shrink-0"
          title="仅保存费率配置；Studio 自带模型任务调用仍暂停，保存不会恢复调用或启动收费，恢复需单独授权"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          任务暂停 · 仅保存配置
        </div>
      </div>

      {/* 中部：核心指标与配置操作 */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* KPI 关键指标栏 */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-50/80 border border-slate-100/90 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400 font-medium">当前服务费率 (百分比)</div>
            <div className="text-lg font-black font-mono text-amber-600 mt-0.5">
              {loading ? "…" : percent != null ? `${percent.toFixed(2)}%` : "15.00% (默认)"}
            </div>
          </div>
          <div className="bg-slate-50/80 border border-slate-100/90 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400 font-medium">对应底层基点折算</div>
            <div className="text-lg font-black font-mono text-slate-700 mt-0.5">
              {loading ? "…" : bps != null ? `${bps} bps` : "1500 bps"}
            </div>
          </div>
        </div>

        {/* 输入框与保存按钮组合栏 */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center min-w-[130px] flex-1 sm:flex-initial">
            <input
              type="number"
              min={0}
              max={MAX_PERCENT}
              step={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="如 15"
              className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 outline-none text-sm font-semibold text-slate-800 transition-all"
            />
            <span className="absolute right-3 text-xs text-slate-400 font-bold pointer-events-none">%</span>
          </div>

          <button
            type="button"
            disabled={!valid || saving}
            onClick={() => setConfirmOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
            保存费率
          </button>
        </div>
      </div>

      {/* 底部说明栏 */}
      <div className="bg-slate-50/70 border-t border-slate-100/90 px-4 sm:px-5 py-2.5 text-[11px] text-slate-500 flex items-center justify-between gap-2">
        <span
          className="truncate"
          title="费率仅作为已存配置展示：自带模型（BYO）任务调用当前暂停（平台收费口径待确认），保存的费率不会立即用于 Studio 任务收费"
        >
          费率仅作为已存配置展示：自带模型任务调用当前暂停（收费口径待确认），不会用于当前任务收费
        </span>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        type="danger"
        title="确认保存 BYO 平台服务费率？"
        message="仅保存费率配置；Studio 自带模型任务调用仍暂停，保存不会恢复调用或启动收费，恢复需单独授权。"
        warnings={[
          `服务费率：${percent != null ? (percent).toFixed(2) : "—"}% → ${valid ? pctNum.toFixed(2) : "—"}%`,
          "保存不会恢复自带模型任务调用或启动收费；费率数值仅作为已存配置保留",
        ]}
        confirmText="确认保存"
        cancelText="取消"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSave}
      />
    </div>
  );
}
