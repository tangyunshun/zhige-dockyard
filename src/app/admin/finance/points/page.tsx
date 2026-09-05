"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { confirm } from "@/components/GlobalConfirmProvider";
import {
  ReceiptText,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  Wallet,
  Clock3,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

interface LedgerRow {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  typeLabel: string;
  scope: string;
  title: string;
  points: number;
  amountCents: number;
  operator: string;
  componentName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceType: string | null;
  balanceAfter: number;
  orderNo: string | null;
  paymentMethod: string | null;
  createdAt: string;
}

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "recharge", label: "充值" },
  { key: "consume", label: "消耗" },
  { key: "gift", label: "赠送" },
  { key: "expire", label: "到期清零" },
  { key: "refund", label: "退回" },
  { key: "adjust", label: "调整" },
] as const;

const PAYMENT_LABEL: Record<string, string> = {
  WECHAT_PAY: "微信支付",
  ALIPAY: "支付宝",
  ONLINE_PAY: "在线支付",
  OFFLINE_BANK: "对公转账",
  CONTRACT: "合同结算",
  SYSTEM: "系统发放",
  MANUAL: "人工入账",
};

export default function AdminPointsLedgerPage() {
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [records, setRecords] = useState<LedgerRow[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [expireLoading, setExpireLoading] = useState(false);
  const [expireMsg, setExpireMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const token = getAuthToken();
      const res = await fetch("/api/admin/points/summary", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setSummary(json.data);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);
      const token = getAuthToken();
      const sp = new URLSearchParams({ type: typeFilter, page: String(page), pageSize: "20" });
      const res = await fetch(`/api/admin/points/ledger?${sp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) {
        setRecords(json.data.records || []);
        setPagination(json.data.pagination || pagination);
      }
    } finally {
      setLoadingLedger(false);
    }
  }, [typeFilter, page]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const runExpire = async () => {
    if (!(await confirm({ title: "确认清算", message: "确认立即触发全局算力分桶到期清算？将把已过期的赠送算力点清零并写流水。", type: "warning" }))) return;
    setExpireLoading(true);
    setExpireMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/points/expire", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        setExpireMsg(json.message || "清算完成");
        loadSummary();
      } else {
        setExpireMsg(json.error || "清算失败");
      }
    } finally {
      setExpireLoading(false);
    }
  };

  const cards = summary
    ? [
        { label: "累计发放（含充值与赠送）", value: summary.totalIssued, icon: Coins, tone: "text-purple-600" },
        { label: "累计消耗", value: summary.totalConsumed, icon: ArrowDownRight, tone: "text-amber-600" },
        { label: "充值 GMV", value: `¥${(Number(summary.rechargeGmvCents) / 100).toLocaleString()}`, icon: Wallet, tone: "text-[#3182ce]", raw: true },
        {
          label: "对账差异",
          value: summary.reconcile.diff,
          icon: summary.reconcile.balanced ? ShieldCheck : ShieldAlert,
          tone: summary.reconcile.balanced ? "text-emerald-600" : "text-red-600",
        },
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-[#3182ce]" />
          <h2 className="text-xl font-black text-slate-800">算力总账与对账</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSummary}
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
          <button
            onClick={runExpire}
            disabled={expireLoading}
            className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Clock3 className="w-3.5 h-3.5" /> {expireLoading ? "清算中..." : "到期清算"}
          </button>
        </div>
      </div>

      {expireMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-bold text-emerald-700">
          {expireMsg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingSummary
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 h-20 animate-pulse" />
            ))
          : cards.map((c) => (
              <div key={c.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 font-bold mb-1 leading-tight">{c.label}</div>
                  <div className={`text-xl font-black font-mono ${c.tone}`}>
                    {c.raw ? c.value : Number(c.value).toLocaleString()}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                  <c.icon className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            ))}
      </div>

      {summary && !summary.reconcile.balanced && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold text-red-700 leading-relaxed">
            对账异常：流水理论余额 <strong>{summary.reconcile.theoretical.toLocaleString()}</strong> 点，
            账户实际余额 <strong>{summary.reconcile.actual.toLocaleString()}</strong> 点，
            差异 <strong>{summary.reconcile.diff.toLocaleString()}</strong> 点。请核查发放/扣减/退款流水一致性。
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 flex-wrap">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                typeFilter === t.key
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/60"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-bold text-slate-400">共 {pagination.total} 条</span>
        </div>

        {loadingLedger ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" /> 读取中...
          </div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" /> 暂无流水
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">流水信息</th>
                    <th className="px-4 py-3 whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 whitespace-nowrap">空间</th>
                    <th className="px-4 py-3 whitespace-nowrap">时间</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">算力点</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">折算</th>
                    <th className="px-4 py-3 whitespace-nowrap">操作人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {records.map((r) => {
                    const isIn = r.direction === "IN";
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-800 truncate max-w-[260px]">{r.title}</div>
                          {r.componentName && <div className="text-[10px] text-slate-400 mt-0.5">组件：{r.componentName}</div>}
                          {r.workspaceName && <div className="text-[10px] text-slate-400">{r.workspaceName}</div>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                              isIn ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                          >
                            {r.typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
                          {r.workspaceType === "ENTERPRISE" ? "企业" : r.workspaceType === "PERSONAL" ? "个人" : "钱包"}
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
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 font-medium">{r.operator}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400">
                共 {pagination.total} 条 · 第 {pagination.page}/{pagination.totalPages} 页
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
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
