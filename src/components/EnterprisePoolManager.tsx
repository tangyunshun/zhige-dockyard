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
 * 企业池管理（共享池余额 / 低余额预警阈值；回收至个人钱包已暂停）
 *
 * 归属：这是「企业空间所有者」自己的资产管理操作，因此在个人工作台（/user/points）
 * 与空间中枢（/workspace-hub）都提供入口，与企业空间内部的充值弹窗「回收」页签互通。
 * 组件自身完成权限收敛：仅返回该用户作为 owner 的企业空间，无任何企业空间时不渲染。
 *
 * [R0-C / 原方案 F06 止损] 企业共享池 → 个人钱包转移暂停：本组件不再发起任何回收请求，
 * 余额读取与低余额阈值设置保持可用；服务端对旧页面/直接 HTTP 请求同样拒绝。
 */
const POOL_RECYCLE_PAUSED_MESSAGE = "企业额度转入个人钱包暂不可用，原余额保留在企业空间";
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

  const [thresholdInput, setThresholdInput] = useState("");
  const [thresholdError, setThresholdError] = useState<string | undefined>(undefined);
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

  // 切换空间时回填阈值输入框
  useEffect(() => {
    const sel = pools.find((p) => p.id === selectedId);
    if (!sel) return;
    setThresholdInput(sel.poolLowThreshold !== null ? String(sel.poolLowThreshold) : "");
    setThresholdError(undefined);
  }, [selectedId, pools]);

  /** 行内校验：阈值须为非负整数，留空表示重置为套餐默认 */
  const validateThreshold = (v: string): string | undefined => {
    const t = v.trim();
    if (t === "") return undefined;
    const value = Math.floor(Number(t));
    if (!Number.isFinite(value) || value < 0) return "请输入非负整数阈值，或留空以重置为套餐默认";
    return undefined;
  };

  const isUnlimited = selected?.tokenBalance === -1;

  // [R0-C] 防御性 handler：即使旧入口/残留事件被触发，也只提示暂停，
  // 绝不发起转个人请求、绝不显示成功到账。回收执行控件已不再渲染。
  const handleRecycle = () => {
    toast.info(POOL_RECYCLE_PAUSED_MESSAGE);
  };

  const handleSaveThreshold = async () => {
    if (!selected) return;
    const error = validateThreshold(thresholdInput);
    if (error) {
      // 行内校验：错误显示在输入框下方并红框高亮
      setThresholdError(error);
      return;
    }
    setThresholdError(undefined);
    const raw = thresholdInput.trim();
    const value = raw === "" ? null : Math.floor(Number(raw));
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

            {/* [R0-C] 企业共享池 → 个人钱包转移暂停：不渲染回收输入/执行控件，不显示成功到账 */}
            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-400 font-bold">回收至个人钱包</label>
              <div className="rounded-lg px-3 py-2.5 bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 leading-relaxed flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{POOL_RECYCLE_PAUSED_MESSAGE}</span>
              </div>
              <button
                type="button"
                onClick={handleRecycle}
                disabled
                className="w-full px-3 h-9 bg-slate-100 text-slate-400 font-black rounded-lg text-[11px] disabled:cursor-not-allowed"
              >
                暂不可用
              </button>
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
                  onChange={(e) => {
                    setThresholdInput(e.target.value);
                    // 已有错误时随输入实时重新校验，让提示随修正消失
                    if (thresholdError) setThresholdError(validateThreshold(e.target.value));
                  }}
                  placeholder={`默认 ${selected.planDefault}`}
                  className={`flex-1 h-9 px-2.5 text-xs border rounded-lg outline-none font-mono transition-colors ${
                    thresholdError
                      ? "border-red-300 bg-red-50/30 focus:border-red-400"
                      : "border-slate-200 focus:border-[#3182ce]"
                  }`}
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
              {thresholdError && (
                <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {thresholdError}
                </p>
              )}
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
