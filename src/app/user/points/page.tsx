"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Coins,
  Wallet,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Clock3,
  RefreshCw,
  AlertCircle,
  Inbox,
  FileText,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { formatYuanFromPoints } from "@/lib/point-rate";

interface PointsData {
  walletBalance: number;
  expiringPoints: number;
  expiringAt: string | null;
  workspaces: Array<{ id: string; name: string; type: string; balance: number; unlimited: boolean }>;
  stats: {
    totalRecharged: number;
    totalGift: number;
    totalConsumed: number;
    totalExpired: number;
    walletBalance: number;
  };
  records: Array<{
    id: string;
    direction: "IN" | "OUT";
    type: string;
    scope: string;
    title: string;
    points: number;
    amountCents: number;
    operator: string;
    componentName: string | null;
    workspaceId: string | null;
    balanceAfter: number;
    orderNo: string | null;
    paymentMethod: string | null;
    createdAt: string;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "recharge", label: "充值" },
  { key: "consume", label: "消耗" },
  { key: "gift", label: "赠送" },
  { key: "expire", label: "到期清零" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  GIFT_REGISTER: "注册赠送",
  GIFT_EXPIRE: "到期清零",
  RECHARGE: "在线充值",
  OFFLINE_RECHARGE: "线下入账",
  MEMBERSHIP_GRANT: "会员额度",
  CONSUME: "组件消耗",
  REFUND: "退回",
  MANUAL_ADJUST: "人工调整",
};

const PAYMENT_LABEL: Record<string, string> = {
  WECHAT_PAY: "微信支付",
  ALIPAY: "支付宝",
  ONLINE_PAY: "在线支付",
  OFFLINE_BANK: "对公转账",
  CONTRACT: "合同结算",
  SYSTEM: "系统发放",
  MANUAL: "人工入账",
};

export default function MyPointsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PointsData | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = getAuthToken();
      const sp = new URLSearchParams({ type: typeFilter, page: String(page), pageSize: "15" });
      const res = await fetch(`/api/user/points?${sp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "加载失败");
        return;
      }
      setData(json.data);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const stats = data?.stats;

  return (
    <div className="max-w-5xl mx-auto space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" /> 我的算力
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            钱包算力点跨空间通用；个人空间赠送点 3 个月有效，企业充值点归入空间共享池。
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} /> 刷新
        </button>
      </div>

      {data?.expiringPoints ? (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Clock3 className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold text-orange-800 leading-relaxed">
            您有 <strong>{data.expiringPoints.toLocaleString()}</strong> 算力点即将过期
            {data.expiringAt ? `（${new Date(data.expiringAt).toLocaleDateString("zh-CN")} 到期）` : ""}
            ，未使用部分到期将自动清零，请优先使用。
          </p>
        </div>
      ) : null}

      {/* 统计卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">钱包余额（跨空间通用）</div>
            <div className="text-2xl font-black font-mono text-[#3182ce]">
              {(data?.walletBalance ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">点</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">累计充值 / 线下</div>
            <div className="text-2xl font-black font-mono text-emerald-600">
              {(stats?.totalRecharged ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">点</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">累计赠送</div>
            <div className="text-2xl font-black font-mono text-purple-600">
              {(stats?.totalGift ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">点</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">累计消耗</div>
            <div className="text-2xl font-black font-mono text-amber-600">
              {(stats?.totalConsumed ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">点</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 空间池分布 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-[#3182ce]" />
          <h3 className="text-sm font-black text-slate-800">各空间算力池</h3>
        </div>
        {data && data.workspaces.length === 0 ? (
          <div className="text-xs text-slate-400 font-medium py-4 text-center">暂无空间</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data?.workspaces.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 hover:border-[#3182ce]/40 transition-all cursor-pointer"
                onClick={() => router.push(`/workspace/${w.id}`)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{w.name}</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {w.type === "ENTERPRISE" ? "企业共享池" : "个人空间"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-black font-mono text-slate-800">
                    {w.unlimited ? "无限" : w.balance.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">点</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 跨空间流水 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 flex-wrap">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                typeFilter === t.key
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/60"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-bold text-slate-400">
            共 {data?.pagination.total ?? 0} 条
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
            读取中...
          </div>
        ) : error ? (
          <div className="p-16 text-center text-xs font-bold text-red-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            {error}
          </div>
        ) : !data || data.records.length === 0 ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <Inbox className="w-6 h-6 mx-auto mb-2" />
            暂无流水记录
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">流水信息</th>
                    <th className="px-4 py-3 whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 whitespace-nowrap">时间</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">算力点</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">折算</th>
                    <th className="px-4 py-3 whitespace-nowrap">支付方式</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.records.map((r) => {
                    const isIn = r.direction === "IN";
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-800 truncate max-w-[280px]">{r.title}</div>
                          {r.componentName && (
                            <div className="text-[10px] text-slate-400 mt-0.5">组件：{r.componentName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                              isIn
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                          >
                            {TYPE_LABEL[r.type] || r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-mono font-black whitespace-nowrap ${
                            isIn ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {isIn ? "+" : ""}
                          {r.points.toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                          ¥{(Number(r.amountCents || 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
                          {r.paymentMethod ? (PAYMENT_LABEL[r.paymentMethod] || r.paymentMethod) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400">
                共 {data.pagination.total} 条 · 第 {data.pagination.page}/{data.pagination.totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 px-1">
        <FileText className="w-3.5 h-3.5" />
        折算口径：100 算力点 = 1 元（仅作参考）；充值行显示实付金额，赠送/消耗行为不计入金额。
      </div>
    </div>
  );
}
