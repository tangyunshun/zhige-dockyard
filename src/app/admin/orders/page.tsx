"use client";

import React, { useState, useEffect } from "react";
import { ClipboardList, ArrowLeft, Search, RefreshCw, Zap, CreditCard, CheckCircle2, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface BillingRecord {
  id: string;
  userId: string;
  workspaceId: string | null;
  type: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  createdAt: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const toast = useToast();

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch("/api/admin/billing-records", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "拉取交易账单失败");
      }
    } catch (e) {
      console.error("加载订单失败:", e);
      toast.error("网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.userId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === "ALL" || r.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6 text-left font-sans max-w-7xl mx-auto">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#3182ce]" />
            订单与算力充值交易管理 (Orders & Billing)
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            实时追溯审计全平台算力加油包充值、空间套餐升级与交易明细
          </p>
        </div>
        <button
          onClick={() => router.push("/admin")}
          className="h-9 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          返回大盘
        </button>
      </div>

      {/* 搜索与过滤栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索订单号 / 用户 ID / 标题..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#3182ce] outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
          >
            <option value="ALL">全部交易类型</option>
            <option value="TOKEN_RECHARGE">⚡ 算力加油包充值</option>
            <option value="PLAN_UPGRADE">👑 空间套餐升级</option>
            <option value="MEMBERSHIP">💎 会员级别订阅</option>
          </select>
          <button
            onClick={loadOrders}
            className="h-10 px-4 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
        </div>
      </div>

      {/* 订单列表表格 */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl text-center border text-xs text-slate-400 font-bold">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
          正在拉取全平台交易订单库...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto text-[#3182ce] mb-3">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">暂无符合条件的交易账单记录</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">当前平台尚未产生对应条件的充值或交易订单。</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-black text-slate-600">
                  <th className="py-3.5 px-4">交易单号 ID</th>
                  <th className="py-3.5 px-4">交易类型</th>
                  <th className="py-3.5 px-4">项目描述</th>
                  <th className="py-3.5 px-4">金额 (CNY)</th>
                  <th className="py-3.5 px-4">状态</th>
                  <th className="py-3.5 px-4">充值用户</th>
                  <th className="py-3.5 px-4">交易时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.id}</td>
                    <td className="py-3.5 px-4">
                      {r.type === "TOKEN_RECHARGE" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                          <Zap className="w-3 h-3 fill-amber-500" />
                          算力充值
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200">
                          <CreditCard className="w-3 h-3" />
                          套餐升级
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{r.title}</td>
                    <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-sm">
                      ¥ {(r.amount / 100).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        成功
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{(r.userId || "").slice(0, 8)}...</td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(r.createdAt).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
