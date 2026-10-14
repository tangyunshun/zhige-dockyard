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
      toast.success(`BYO 平台服务费率已设为 ${(json.data.percent as number).toFixed(2)}%`);
      setConfirmOpen(false);
      await load();
      onApplied?.();
    } else {
      toast.error(json?.error || "保存 BYO 服务费率失败");
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#fffaf0] to-[#fff7e6] border border-[#f6e2b3] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-2 text-[#b7791f]">
        <Percent className="w-5 h-5" />
        <span className="text-sm font-black tracking-tight">BYO 平台服务费率（单一真源）</span>
      </div>

      <div className="text-xs text-slate-600">
        {loading ? (
          <span className="text-slate-400">读取中…</span>
        ) : (
          <>
            当前：
            <span className="font-bold text-[#b7791f]">
              {percent != null ? `${(percent).toFixed(2)}%` : "未配置（回退默认 15%）"}
            </span>
            <span className="mx-1.5 text-slate-300">|</span>
            <span className="font-mono">{bps != null ? `${bps} bps` : "1500 bps"}</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:ml-auto">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={MAX_PERCENT}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="如 15"
            className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-[#d69e2e] focus:ring-2 focus:ring-[#d69e2e]/20 outline-none text-sm text-slate-800"
          />
          <span className="text-sm text-slate-500 font-bold">%</span>
          <button
            disabled={!valid || saving}
            onClick={() => setConfirmOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#ecc94b] to-[#d69e2e] hover:from-[#d69e2e] hover:to-[#b7791f] text-white text-xs font-black rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
            保存费率
          </button>
        </div>
        <span className="text-[11px] text-slate-500">
          服务费对所有“自带私有模型（BYO）”统一生效；保存后立即对估价 / 结算口径生效，无需发版。
        </span>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        type="danger"
        title="确认修改 BYO 平台服务费率？"
        message="该费率为全局单一真源，将写入系统配置（billing.byokServiceRateBps），对所有空间的自带模型统一生效。已登记价格的自带模型对外收费将按新费率实时重新折算。"
        warnings={[
          `服务费率：${percent != null ? (percent).toFixed(2) : "—"}% → ${valid ? pctNum.toFixed(2) : "—"}%`,
          "立即对全部自带模型的估价 / 结算口径生效，无法撤销",
        ]}
        confirmText="确认保存"
        cancelText="取消"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSave}
      />
    </div>
  );
}
