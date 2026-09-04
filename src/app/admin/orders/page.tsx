"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardList,
  ArrowLeft,
  Search,
  RefreshCw,
  Zap,
  CreditCard,
  CheckCircle2,
  DollarSign,
  Users,
  Building2,
  Eye,
  X,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";

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

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const router = useRouter();
  const toast = useToast();

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailRecord, setDetailRecord] = useState<BillingRecord | null>(null);

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

  const totalRevenue = records.reduce((sum, r) => sum + (r.amount || 0), 0);
  const tokenRechargeCount = records.filter((r) => r.type === "TOKEN_RECHARGE").length;
  const planUpgradeCount = records.filter((r) => r.type === "PLAN_UPGRADE").length;

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.workspaceId && r.workspaceId.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = typeFilter === "ALL" || r.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // 过滤后结果分页（每页 10 条）
  const totalItems = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRecords = filteredRecords.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="space-y-6 pb-8 text-left font-sans">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
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

      {/* 4 大财务指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">累计交易总额</div>
            <div className="text-2xl font-black font-mono text-[#3182ce]">
              ¥ {(totalRevenue / 100).toFixed(2)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">有效交易笔数</div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {records.length} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">算力加油充值</div>
            <div className="text-2xl font-black font-mono text-amber-600">
              {tokenRechargeCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">套餐订购升级</div>
            <div className="text-2xl font-black font-mono text-purple-600">
              {planUpgradeCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 搜索与过滤栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="搜索订单号 / 用户 ID / 标题..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#3182ce] outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
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
                  <th className="py-3.5 px-4">关联工作空间</th>
                  <th className="py-3.5 px-4">交易时间</th>
                  <th className="py-3.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {pagedRecords.map((r) => (
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
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/admin/users?search=${encodeURIComponent(r.userId)}`}
                        className="inline-flex items-center gap-1 font-mono text-[#3182ce] hover:underline font-bold"
                        title="反查此充值用户详情"
                      >
                        <Users className="w-3 h-3" />
                        {(r.userId || "").slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">
                      {r.workspaceId ? (
                        <Link
                          href={`/admin/workspaces?search=${encodeURIComponent(r.workspaceId)}`}
                          className="inline-flex items-center gap-1 font-mono text-emerald-600 hover:underline font-bold"
                          title="反查所属工作空间画像"
                        >
                          <Building2 className="w-3 h-3" />
                          {r.workspaceId.slice(0, 8)}...
                        </Link>
                      ) : (
                        <span className="text-slate-400">个人账户</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(r.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setDetailRecord(r)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        title="查看订单完整详情"
                      >
                        <Eye className="w-3 h-3 text-slate-500" />
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 分页 */}
          {totalItems > 0 && (
            <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50/50 to-transparent">
              <Pagination
                currentPage={safePage}
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setCurrentPage(p)}
                itemLabel="笔交易"
              />
            </div>
          )}
        </div>
      )}

      {/* 订单明细详情 Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3182ce]" />
                <h3 className="font-black text-slate-900 text-sm">交易订单详情</h3>
              </div>
              <button
                onClick={() => setDetailRecord(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 font-mono">
                <div className="text-[10px] text-slate-400 font-bold uppercase">交易单号 (Transaction ID)</div>
                <div className="font-black text-slate-900 select-all">{detailRecord.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
                  <div className="text-[10px] text-blue-600 font-bold uppercase">交易金额</div>
                  <div className="text-base font-black text-[#3182ce] font-mono mt-0.5">
                    ¥ {(detailRecord.amount / 100).toFixed(2)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                  <div className="text-[10px] text-emerald-600 font-bold uppercase">支付状态</div>
                  <div className="text-sm font-black text-emerald-700 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    已入账结算
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 font-bold uppercase">充值项目描述</div>
                <div className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800">{detailRecord.title}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">充值用户 ID</div>
                  <Link
                    href={`/admin/users?search=${encodeURIComponent(detailRecord.userId)}`}
                    className="font-mono text-[#3182ce] hover:underline font-bold block truncate"
                  >
                    {detailRecord.userId}
                  </Link>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">关联工作空间 ID</div>
                  {detailRecord.workspaceId ? (
                    <Link
                      href={`/admin/workspaces?search=${encodeURIComponent(detailRecord.workspaceId)}`}
                      className="font-mono text-emerald-600 hover:underline font-bold block truncate"
                    >
                      {detailRecord.workspaceId}
                    </Link>
                  ) : (
                    <div className="text-slate-400 font-mono">无（个人充值）</div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-bold">创建时间：</span>
                <span className="font-mono text-slate-800 font-bold">
                  {new Date(detailRecord.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setDetailRecord(null)}
                className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
