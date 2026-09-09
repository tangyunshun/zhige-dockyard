"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, AlertCircle } from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface EnterprisePool {
  id: string;
  name: string;
  plan: string;
  /** 企业共享池余额，-1 表示无限额度档 */
  tokenBalance: number;
  /** 空间级阈值覆盖，null 表示继承套餐默认 */
  poolLowThreshold: number | null;
  planDefault: number;
  effectiveThreshold: number;
}

/**
 * 企业池管理（回收共享池算力点 + 设置低余额预警阈值）
 *
 * 归属：这是「企业空间所有者」自己的资产管理操作，因此在个人工作台（/user/points）
 * 与空间中枢（/workspace-hub）都提供入口，与企业空间内部的充值弹窗「回收」页签互通。
 * 组件自身完成权限收敛：仅返回该用户作为 owner 的企业空间，无任何企业空间时不渲染。
 */
export default function EnterprisePoolManager({
  className = "",
  onChanged,
}: {
  className?: string;
  /** 回收/阈值变更后的回调，供宿主页面刷新余额等数据 */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [pools, setPools] = useState<EnterprisePool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  const [recyclePoints, setRecyclePoints] = useState("");
  const [recycling, setRecycling] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);

  const loadPools = useCallback(async () => {
    try {
      const res = await fetch("/api/user/enterprise-pools", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: EnterprisePool[] = data.pools || [];
      setPools(list);
      setSelectedId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id || ""));
    } catch {
      /* 静默失败，不打断宿主页面渲染 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPools();
  }, [loadPools]);

  const selected = pools.find((p) => p.id === selectedId) || null;

  // 切换空间时回填阈值输入框并清空回收输入
  useEffect(() => {
    const sel = pools.find((p) => p.id === selectedId);
    if (!sel) return;
    setThresholdInput(sel.poolLowThreshold !== null ? String(sel.poolLowThreshold) : "");
    setRecyclePoints("");
  }, [selectedId, pools]);

  const isUnlimited = selected?.tokenBalance === -1;
  const inputAmount = Math.floor(Number(recyclePoints));
  const noBalance = !!selected && !isUnlimited && selected.tokenBalance === 0;
  const overBalance =
    !!selected &&
    !isUnlimited &&
    Number.isFinite(inputAmount) &&
    inputAmount > 0 &&
    inputAmount > selected.tokenBalance;
  const recycleBlocked = !selected || isUnlimited || noBalance || overBalance;

  const handleRecycle = async () => {
    if (!selected) return;
    const amount = Math.floor(Number(recyclePoints));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的回收算力点数");
      return;
    }
    try {
      setRecycling(true);
      const res = await fetch("/api/workspace/quota/recycle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ workspaceId: selected.id, points: amount }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `已回收 ${amount.toLocaleString()} 算力点至个人钱包`);
        setRecyclePoints("");
        await loadPools();
        onChanged?.();
      } else {
        toast.error(data.error || "回收失败");
      }
    } catch {
      toast.error("回收请求失败，请稍后重试");
    } finally {
      setRecycling(false);
    }
  };

  const handleSaveThreshold = async () => {
    if (!selected) return;
    const raw = thresholdInput.trim();
    const value = raw === "" ? null : Math.floor(Number(raw));
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast.error("请输入非负整数阈值，或留空以重置为套餐默认");
      return;
    }
    try {
      setSavingThreshold(true);
      const res = await fetch("/api/workspace/quota/pool-threshold", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ workspaceId: selected.id, threshold: value }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "阈值已更新");
        await loadPools();
        onChanged?.();
      } else {
        toast.error(data.error || "更新失败");
      }
    } catch {
      toast.error("请求失败，请稍后重试");
    } finally {
      setSavingThreshold(false);
    }
  };

  // 未登录/无企业空间时不渲染，避免在所有者的无关页面刷存在感
  if (loading || pools.length === 0) return null;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#2b6cb0] flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-800">企业池管理</div>
          <div className="text-[10px] text-slate-400">回收共享池算力点 · 设置低余额预警</div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold mb-1">目标企业空间</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full h-9 px-2.5 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none bg-white cursor-pointer"
          >
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold">共享池余额</span>
              <span className="text-xs font-black font-mono text-[#2b6cb0]">
                {isUnlimited ? "无限" : `${selected.tokenBalance.toLocaleString()} 点`}
              </span>
            </div>

            {/* 回收：按钮后给出明确限制提示，避免无效点击 */}
            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-400 font-bold">回收至个人钱包</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={recyclePoints}
                  onChange={(e) => setRecyclePoints(e.target.value)}
                  placeholder="例如 1000"
                  className="flex-1 h-9 px-2.5 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleRecycle}
                  disabled={recycling || recycleBlocked}
                  className="px-3 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-black rounded-lg text-[11px] shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {recycling ? "回收中..." : "确认回收"}
                </button>
              </div>
              {isUnlimited && (
                <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  该空间为无限额度档，无需回收
                </p>
              )}
              {!isUnlimited && noBalance && (
                <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  当前企业池余额为 0，暂无可回收算力点
                </p>
              )}
              {!isUnlimited && overBalance && (
                <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  回收金额 {inputAmount.toLocaleString()} 点超过当前企业池可用余额{" "}
                  {selected.tokenBalance.toLocaleString()} 点
                </p>
              )}
            </div>

            {/* 低余额预警阈值 */}
            <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] text-slate-400 font-bold">低余额预警阈值</label>
                <span className="text-[10px] font-bold text-[#3182ce]">
                  {selected.poolLowThreshold !== null
                    ? "空间自定义"
                    : `套餐默认 ${selected.planDefault}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder={`默认 ${selected.planDefault}`}
                  className="flex-1 h-9 px-2.5 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold}
                  className="px-3 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-black rounded-lg text-[11px] shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {savingThreshold ? "保存中..." : "保存阈值"}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                企业池余额低于该阈值时自动提醒补充。留空保存则沿用套餐默认阈值。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
