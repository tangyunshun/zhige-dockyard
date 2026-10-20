"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import {
  Cpu,
  ShieldCheck,
  Boxes,
  Save,
  RotateCcw,
  ExternalLink,
  AlertTriangle,
  Check,
  Search,
  Coins,
  Clock,
} from "lucide-react";

/**
 * 平台级默认配置页：
 *  1) 默认模型池（默认初始 / 默认付费），新空间自动继承免费模型；
 *  2) 新空间一次性体验额度（开关 / 数值 / 有效期）；
 *  3) 可选「同步到所有空间」（谨慎使用，仅对未显式禁用该模型的空间生效）。
 */

interface ModelRow {
  deploymentId: string;
  providerId: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  contextLimit: number;
  defaultFree: boolean;
  defaultPaid: boolean;
}

interface GiftConfig {
  enabled: boolean;
  points: number;
  expireDays: number;
}

const authFetch = async (url: string, init?: RequestInit) => {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.json().catch(() => ({}));
};

export default function PlatformDefaultsPage() {
  const router = useRouter();
  const toast = useToast();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [gift, setGift] = useState<GiftConfig>({ enabled: false, points: 100, expireDays: 0 });
  const [freeIds, setFreeIds] = useState<string[]>([]);
  const [paidIds, setPaidIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncToAll, setSyncToAll] = useState(false);

  // 已保存快照，用于「放弃修改」
  const [saved, setSaved] = useState<{ freeIds: string[]; paidIds: string[]; gift: GiftConfig }>({
    freeIds: [],
    paidIds: [],
    gift: { enabled: false, points: 100, expireDays: 0 },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/platform-defaults");
      if (!res?.success) {
        toast.error(res?.error || "加载平台默认配置失败");
        return;
      }
      setModels(res.data.models || []);
      setFreeIds(res.data.freeIds || []);
      setPaidIds(res.data.paidIds || []);
      setGift(res.data.gift || { enabled: false, points: 100, expireDays: 0 });
      setSaved({
        freeIds: res.data.freeIds || [],
        paidIds: res.data.paidIds || [],
        gift: res.data.gift || { enabled: false, points: 100, expireDays: 0 },
      });
    } catch (e) {
      toast.error((e as Error)?.message || "加载平台默认配置失败");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.providerId.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    );
  }, [models, search]);

  const toggleFree = (id: string) => {
    setFreeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // 免费与付费互斥：加入免费时从付费移除
      if (!prev.includes(id)) setPaidIds((p) => p.filter((x) => x !== id));
      return next;
    });
  };

  const togglePaid = (id: string) => {
    setPaidIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!prev.includes(id)) setFreeIds((p) => p.filter((x) => x !== id));
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/admin/platform-defaults", {
        method: "PUT",
        body: JSON.stringify({
          freeIds,
          paidIds,
          giftEnabled: gift.enabled,
          giftPoints: gift.points,
          giftExpireDays: gift.expireDays,
          syncToAll,
        }),
      });
      if (!res?.success) {
        toast.error(res?.error || "保存失败");
        return;
      }
      toast.success(res.message || "已保存");
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify(freeIds.slice().sort()) !== JSON.stringify(saved.freeIds.slice().sort()) ||
    JSON.stringify(paidIds.slice().sort()) !== JSON.stringify(saved.paidIds.slice().sort()) ||
    gift.enabled !== saved.gift.enabled ||
    gift.points !== saved.gift.points ||
    gift.expireDays !== saved.gift.expireDays;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">加载配置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* 顶部标题栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-8.5 h-8.5 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
              <Boxes className="w-4.5 h-4.5" />
            </span>
            <span>平台默认配置</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            配置新空间默认可用的模型，以及新空间自动赠送的体验额度
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/models"
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>模型注册表</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
          <button
            type="button"
            onClick={() => {
              setFreeIds(saved.freeIds);
              setPaidIds(saved.paidIds);
              setGift(saved.gift);
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
            放弃修改
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "保存中..." : "保存配置"}</span>
          </button>
        </div>
      </div>

      {/* 新空间体验额度配置 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
            <Coins className="w-4.5 h-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-800">新空间体验额度</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              新创建的个人 / 企业空间按此配置自动获得一次性体验额度；额度独立于充值额度，优先消耗
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 启用开关 */}
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={gift.enabled}
              onChange={(e) => setGift({ ...gift, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-700">启用赠送</div>
              <div className="text-[10px] text-slate-400">关闭后新空间不赠送任何额度</div>
            </div>
          </label>

          {/* 赠送数值 */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              赠送额度（算力点）
            </label>
            <input
              type="number"
              min={0}
              value={gift.points}
              onChange={(e) => setGift({ ...gift, points: Number(e.target.value) })}
              className="mt-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
            />
          </div>

          {/* 有效期 */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#3182ce]" />
              有效期（天）
            </label>
            <input
              type="number"
              min={0}
              value={gift.expireDays}
              onChange={(e) => setGift({ ...gift, expireDays: Number(e.target.value) })}
              className="mt-1.5 w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
            />
            <div className="text-[10px] text-slate-400 mt-1">填 0 表示永久有效</div>
          </div>
        </div>
      </div>

      {/* 默认模型池配置 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-[#805ad5] border border-purple-100 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-800">默认模型池</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                默认初始模型：新空间自动开通 · 默认付费模型：不自动开通，需管理员为单个空间额外开通
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按模型名或供应商检索..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-[#3182ce] focus:bg-white focus:ring-2 focus:ring-[#3182ce]/15"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <div className="text-xs font-black text-emerald-700">默认初始模型（{freeIds.length}）</div>
            <div className="text-[10px] text-emerald-600/80 mt-0.5">新空间创建时自动加入可用清单</div>
          </div>
          <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
            <div className="text-xs font-black text-rose-700">默认付费模型（{paidIds.length}）</div>
            <div className="text-[10px] text-rose-600/80 mt-0.5">不自动开通，仅作为可申请开通的候选</div>
          </div>
        </div>

        {/* 模型列表 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500">
            <div className="col-span-6">模型</div>
            <div className="col-span-2 text-center">平台状态</div>
            <div className="col-span-2 text-center">默认初始</div>
            <div className="col-span-2 text-center">默认付费</div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {filtered.map((m) => (
              <div key={m.deploymentId} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-slate-50/60 transition-colors">
                <div className="col-span-6 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      {m.providerId}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-800 truncate">{m.modelId}</span>
                  </div>
                  {m.displayName && m.displayName !== m.modelId && (
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.displayName}</div>
                  )}
                </div>
                <div className="col-span-2 text-center">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      m.enabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {m.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
                <div className="col-span-2 flex justify-center">
                  <input
                    type="checkbox"
                    checked={freeIds.includes(m.deploymentId)}
                    onChange={() => toggleFree(m.deploymentId)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30 cursor-pointer"
                  />
                </div>
                <div className="col-span-2 flex justify-center">
                  <input
                    type="checkbox"
                    checked={paidIds.includes(m.deploymentId)}
                    onChange={() => togglePaid(m.deploymentId)}
                    className="w-4 h-4 rounded border-slate-300 text-rose-500 focus:ring-rose-500/30 cursor-pointer"
                  />
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">未找到匹配的模型部署</div>
            )}
          </div>
        </div>

        {/* 同步到所有空间 */}
        <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={syncToAll}
              onChange={(e) => setSyncToAll(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500/30 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                同时同步到所有已存在的空间
              </div>
              <div className="text-[10px] text-amber-700/80 mt-0.5 leading-snug">
                默认只对新创建的空间生效。勾选后，会把「默认初始模型」追加到所有空间已有的可用清单中；
                已被空间显式禁用的模型不会被强行开启。
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-slate-400">
            {hasChanges ? "有未保存的修改" : "当前配置已保存"}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !hasChanges}
            className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "保存中..." : "保存配置"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
