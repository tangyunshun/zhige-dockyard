"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import {
  Banknote,
  RefreshCw,
  AlertCircle,
  Inbox,
  CheckCircle2,
  XCircle,
  Wallet,
  Building2,
  FileText,
  Clock3,
} from "lucide-react";

interface OrderItem {
  id: string;
  orderNo: string;
  workspaceId: string;
  workspaceName: string | null;
  scope: string;
  applicantId: string;
  applicantName: string;
  packName: string | null;
  points: number;
  amountCents: number;
  paymentMethod: string;
  invoiceTitle: string | null;
  taxNo: string | null;
  bankName: string | null;
  bankAccount: string | null;
  remark: string | null;
  status: string;
  reviewerName: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
}

const STATUS_META: Record<string, { label: string; style: string }> = {
  PENDING: { label: "待审批", style: "bg-amber-50 text-amber-600 border-amber-200" },
  APPROVED: { label: "待收款", style: "bg-blue-50 text-blue-600 border-blue-200" },
  PAID: { label: "已入账", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  REJECTED: { label: "已驳回", style: "bg-red-50 text-red-600 border-red-200" },
  CANCELLED: { label: "已撤销", style: "bg-slate-100 text-slate-500 border-slate-200" },
};

const PAYMENT_LABEL: Record<string, string> = {
  OFFLINE_BANK: "对公转账",
  CONTRACT: "合同结算",
};

export default function AdminRechargeOrdersPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [selected, setSelected] = useState<OrderItem | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = getAuthToken();
      const res = await fetch(`/api/admin/recharge-orders?status=${statusFilter}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "加载失败");
        return;
      }
      setOrders(json.orders || []);
      setStats(json.stats);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const doAction = async (action: "APPROVE" | "REJECT" | "CONFIRM_PAID") => {
    if (!selected) return;
    if (action === "REJECT" && !reviewNote.trim()) {
      toast.error("驳回必须填写意见");
      return;
    }
    setActioning(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/recharge-orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ id: selected.id, action, reviewNote }),
      });
      const json = await res.json();
      if (res.ok) {
        setSelected(null);
        setReviewNote("");
        await load();
      } else {
        toast.error(json.error || "操作失败");
      }
    } finally {
      setActioning(false);
    }
  };

  const tabs = [
    { key: "PENDING", label: "待审批" },
    { key: "APPROVED", label: "待收款" },
    { key: "PAID", label: "已入账" },
    { key: "REJECTED", label: "已驳回" },
    { key: "ALL", label: "全部" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[#3182ce]" />
          <h2 className="text-xl font-black text-slate-800">线下充值工单审批</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 刷新
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "待审批", value: stats.pending, icon: Clock3, tone: "text-amber-600" },
            { label: "待收款", value: stats.approved, icon: Wallet, tone: "text-blue-600" },
            { label: "已入账", value: stats.paid, icon: CheckCircle2, tone: "text-emerald-600" },
            {
              label: "已入账金额",
              value: `¥${(Number(stats.paidAmountCents || 0) / 100).toLocaleString()}`,
              icon: Banknote,
              tone: "text-[#3182ce]",
              raw: true,
            },
          ].map((c) => (
            <div key={c.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-bold mb-1">{c.label}</div>
                <div className={`text-xl font-black font-mono ${c.tone}`}>{c.raw ? c.value : c.value}</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                <c.icon className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key === "ALL" ? "" : t.key)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                (t.key === "ALL" ? statusFilter === "" : statusFilter === t.key)
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/60"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-bold text-slate-400">共 {orders.length} 条</span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" /> 读取中...
          </div>
        ) : error ? (
          <div className="p-16 text-center text-xs font-bold text-red-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" /> {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <Inbox className="w-6 h-6 mx-auto mb-2" /> 暂无工单
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((o) => {
              const sm = STATUS_META[o.status] || STATUS_META.CANCELLED;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    setSelected(o);
                    setReviewNote("");
                  }}
                  className="w-full text-left p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{o.workspaceName || "未知空间"}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${sm.style}`}>{sm.label}</span>
                      <span className="text-[10px] font-bold text-slate-400">{o.scope === "WORKSPACE" ? "企业共享池" : "个人钱包"}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-3 flex-wrap">
                      <span className="font-mono">{o.orderNo}</span>
                      <span>申请人：{o.applicantName || "-"}</span>
                      <span>方式：{PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod}</span>
                      <span className="text-slate-400">{new Date(o.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black font-mono text-[#3182ce]">{o.points.toLocaleString()} 点</div>
                    <div className="text-[10px] font-bold text-slate-400">¥{(Number(o.amountCents) / 100).toFixed(2)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] p-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#3182ce]" /> 工单详情
              </h4>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-sm">
              <Row label="工单号" value={selected.orderNo} mono />
              <Row label="空间" value={selected.workspaceName || "-"} />
              <Row label="入账范围" value={selected.scope === "WORKSPACE" ? "企业共享池" : "个人钱包"} />
              <Row label="申请人" value={selected.applicantName || "-"} />
              <Row label="充值算力点" value={`${selected.points.toLocaleString()} 点`} highlight />
              <Row label="应付金额" value={`¥${(Number(selected.amountCents) / 100).toFixed(2)}`} />
              <Row label="付款方式" value={PAYMENT_LABEL[selected.paymentMethod] || selected.paymentMethod} />
              {selected.invoiceTitle && <Row label="发票抬头" value={selected.invoiceTitle} />}
              {selected.taxNo && <Row label="税号" value={selected.taxNo} mono />}
              {selected.bankName && <Row label="开户银行" value={selected.bankName} />}
              {selected.bankAccount && <Row label="银行账号" value={selected.bankAccount} mono />}
              {selected.remark && <Row label="备注" value={selected.remark} />}
              {selected.reviewNote && <Row label="审批意见" value={selected.reviewNote} />}
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                {selected.scope === "WORKSPACE" ? <Building2 className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                状态：{STATUS_META[selected.status]?.label}
              </div>
            </div>

            {selected.status === "PENDING" && (
              <div className="shrink-0 space-y-2">
                <input
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="审批意见（驳回必填）"
                  className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => doAction("REJECT")}
                    disabled={actioning}
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> 驳回
                  </button>
                  <button
                    onClick={() => doAction("APPROVE")}
                    disabled={actioning}
                    className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> 审批通过
                  </button>
                </div>
              </div>
            )}

            {selected.status === "APPROVED" && (
              <div className="shrink-0 flex justify-end">
                <button
                  onClick={() => doAction("CONFIRM_PAID")}
                  disabled={actioning}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black rounded-xl text-xs shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Wallet className="w-4 h-4" /> 确认收款并自动入账
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 font-bold shrink-0">{label}</span>
      <span
        className={`text-sm text-right font-bold text-slate-800 ${mono ? "font-mono text-[11px]" : ""} ${
          highlight ? "text-[#3182ce]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
