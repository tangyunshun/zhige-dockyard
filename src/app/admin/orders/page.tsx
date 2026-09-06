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
  Copy,
  Check,
  User,
  Shield,
  Clock,
  RotateCcw,
  XCircle,
  Mail,
  Phone,
  Calendar,
  Sparkles,
  Layers,
  Crown,
  Award,
  ShieldCheck,
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
  referenceId?: string | null;
  metadata?: any;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
    membershipLevel: string;
    phone?: string | null;
    createdAt?: string;
  } | null;
  workspace?: {
    id: string;
    name: string;
    type: string;
    logo: string | null;
    plan: string;
  } | null;
}

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const router = useRouter();
  const toast = useToast();

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailRecord, setDetailRecord] = useState<BillingRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const copyToClipboard = (text: string, key: string, label = "内容") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label}已复制到剪贴板`);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

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
    const query = searchTerm.toLowerCase().trim();
    const userName = (r.user?.name || "").toLowerCase();
    const userEmail = (r.user?.email || "").toLowerCase();
    const wsName = (r.workspace?.name || "").toLowerCase();
    const orderId = (r.id || "").toLowerCase();
    const title = (r.title || "").toLowerCase();
    const userId = (r.userId || "").toLowerCase();

    const matchesSearch =
      !query ||
      orderId.includes(query) ||
      title.includes(query) ||
      userName.includes(query) ||
      userEmail.includes(query) ||
      wsName.includes(query) ||
      userId.includes(query);

    const matchesType = typeFilter === "ALL" || r.type === typeFilter;
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;

    let matchesChannel = true;
    if (channelFilter !== "ALL") {
      const ch = (r.channel || "").toUpperCase();
      if (channelFilter === "ONLINE_PAY") matchesChannel = !ch || ch.includes("ONLINE");
      else if (channelFilter === "WECHAT") matchesChannel = ch.includes("WECHAT") || ch.includes("WX");
      else if (channelFilter === "ALIPAY") matchesChannel = ch.includes("ALIPAY") || ch.includes("ALI");
      else if (channelFilter === "STRIPE") matchesChannel = ch.includes("STRIPE");
      else if (channelFilter === "OTHER") matchesChannel = !ch.includes("WECHAT") && !ch.includes("ALIPAY") && !ch.includes("STRIPE") && !ch.includes("ONLINE");
    }

    return matchesSearch && matchesType && matchesStatus && matchesChannel;
  });

  // 会员等级徽章渲染（采用企业级 Lucide 商务矢量图标，彻底摒弃 emoji 符号）
  const renderMembershipBadge = (level?: string) => {
    switch (level?.toUpperCase()) {
      case "CROWN":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <Crown className="w-3 h-3 text-amber-600 shrink-0" />
            皇冠会员
          </span>
        );
      case "DIAMOND":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
            <ShieldCheck className="w-3 h-3 text-purple-600 shrink-0" />
            钻石会员
          </span>
        );
      case "GOLD":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-yellow-50 text-yellow-800 border border-yellow-200 shadow-2xs">
            <Award className="w-3 h-3 text-yellow-600 shrink-0" />
            黄金会员
          </span>
        );
      case "SILVER":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
            <Award className="w-3 h-3 text-slate-500 shrink-0" />
            白银会员
          </span>
        );
      case "BRONZE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-orange-50 text-orange-800 border border-orange-200">
            <Award className="w-3 h-3 text-orange-600 shrink-0" />
            青铜会员
          </span>
        );
      default:
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">普通用户</span>;
    }
  };

  // 支付渠道渲染（100% 简体中文，彻底杜绝裸露英文）
  const renderChannelBadge = (channel?: string | null) => {
    const ch = (channel || "").toUpperCase().trim();
    if (!ch || ch === "ONLINE_PAY" || ch === "ONLINE") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200">
          <CreditCard className="w-3 h-3" />
          在线收银台支付
        </span>
      );
    }
    if (ch.includes("WECHAT") || ch.includes("WX")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          微信支付
        </span>
      );
    }
    if (ch.includes("ALIPAY") || ch.includes("ALI")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          支付宝支付
        </span>
      );
    }
    if (ch.includes("STRIPE") || ch.includes("CARD")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <CreditCard className="w-3 h-3" />
          Stripe 国际支付
        </span>
      );
    }
    if (ch.includes("BALANCE")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Receipt className="w-3 h-3" />
          账户余额划扣
        </span>
      );
    }
    if (ch.includes("MANUAL") || ch.includes("SYSTEM") || ch.includes("ADMIN")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Sparkles className="w-3 h-3" />
          系统调账入账
        </span>
      );
    }
    if (ch.includes("BANK") || ch.includes("TRANSFER")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
          <Building2 className="w-3 h-3" />
          对公银行转账
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <Receipt className="w-3 h-3 text-slate-400" />
        在线快捷支付
      </span>
    );
  };

  // 交易状态渲染
  const renderStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
        return (
          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/60">
            <CheckCircle2 className="w-3.5 h-3.5" />
            支付成功
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-50/80 px-2 py-0.5 rounded-md border border-amber-200/60">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            处理中
          </span>
        );
      case "REFUNDED":
        return (
          <span className="inline-flex items-center gap-1 text-purple-600 font-bold bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-200/60">
            <RotateCcw className="w-3.5 h-3.5" />
            已退款
          </span>
        );
      case "FAILED":
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50/80 px-2 py-0.5 rounded-md border border-rose-200/60">
            <XCircle className="w-3.5 h-3.5" />
            已取消
          </span>
        );
      default:
        return <span className="text-slate-500 font-bold">{status}</span>;
    }
  };

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
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="搜索订单号 / 用户名 / 邮箱 / 空间名称 / 项目标题..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 交易类型筛选 */}
          {/* 交易类型筛选 */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="ALL">全部交易类型</option>
            <option value="TOKEN_RECHARGE">算力加油包充值</option>
            <option value="PLAN_UPGRADE">空间套餐升级</option>
            <option value="MEMBERSHIP">会员级别订阅</option>
          </select>

          {/* 支付状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="ALL">全部支付状态</option>
            <option value="SUCCESS">支付成功</option>
            <option value="PENDING">处理中</option>
            <option value="REFUNDED">已退款</option>
            <option value="FAILED">已取消 / 失败</option>
          </select>

          {/* 支付渠道筛选 */}
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="ALL">全部支付渠道</option>
            <option value="ONLINE_PAY">在线收银台支付</option>
            <option value="WECHAT">微信支付</option>
            <option value="ALIPAY">支付宝支付</option>
            <option value="STRIPE">Stripe 国际支付</option>
            <option value="OTHER">其他渠道 / 系统扣补</option>
          </select>

          {/* 重置筛选 */}
          {(searchTerm || typeFilter !== "ALL" || statusFilter !== "ALL" || channelFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setTypeFilter("ALL");
                setStatusFilter("ALL");
                setChannelFilter("ALL");
                setCurrentPage(1);
              }}
              className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              title="重置所有筛选"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>
          )}

          {/* 刷新按钮 */}
          <button
            onClick={loadOrders}
            className="h-10 px-4 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 订单列表表格 */}
      {loading ? (
        <div className="bg-white p-16 rounded-2xl text-center border border-slate-200/80 shadow-xs text-xs text-slate-400 font-bold">
          <RefreshCw className="w-7 h-7 animate-spin text-[#3182ce] mx-auto mb-3" />
          正在拉取全平台交易订单库与履约流水...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto text-[#3182ce] mb-3">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">暂无符合条件的交易账单记录</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">当前平台尚未产生对应筛选条件的充值或交易订单。</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-black text-slate-600 whitespace-nowrap">
                  <th className="py-3.5 px-4">交易单号</th>
                  <th className="py-3.5 px-4">交易类型</th>
                  <th className="py-3.5 px-4">充值项目描述</th>
                  <th className="py-3.5 px-4">实付金额</th>
                  <th className="py-3.5 px-4">支付方式</th>
                  <th className="py-3.5 px-4">交易状态</th>
                  <th className="py-3.5 px-4">充值用户</th>
                  <th className="py-3.5 px-4">关联工作空间</th>
                  <th className="py-3.5 px-4">交易时间</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3.5 px-4 text-right font-black shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {pagedRecords.map((r) => {
                  const userName = r.user?.name || (r.user?.email ? r.user.email.split("@")[0] : "未命名用户");
                  const userInitial = (userName[0] || "U").toUpperCase();

                  return (
                    <tr key={r.id} className="group hover:bg-slate-50/60 transition-colors">
                      {/* 单号 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-slate-800 select-all" title={r.id}>
                            {r.id.length > 14 ? `${r.id.slice(0, 14)}...` : r.id}
                          </span>
                          <button
                            onClick={() => copyToClipboard(r.id, `ord-${r.id}`, "订单单号")}
                            className="text-slate-400 hover:text-[#3182ce] p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="复制完整订单号"
                          >
                            {copiedKey === `ord-${r.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 交易类型 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {r.type === "TOKEN_RECHARGE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                            <Zap className="w-3 h-3 fill-amber-500" />
                            算力充值
                          </span>
                        ) : r.type === "PLAN_UPGRADE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200">
                            <CreditCard className="w-3 h-3" />
                            套餐升级
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                            <Sparkles className="w-3 h-3" />
                            会员订阅
                          </span>
                        )}
                      </td>

                      {/* 项目描述 */}
                      <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap max-w-[200px] truncate" title={r.title}>
                        {r.title}
                      </td>

                      {/* 金额 */}
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-sm whitespace-nowrap">
                        ¥ {(r.amount / 100).toFixed(2)}
                      </td>

                      {/* 支付方式 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderChannelBadge(r.channel)}
                      </td>

                      {/* 状态 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(r.status)}
                      </td>

                      {/* 充值用户：真实用户头像+姓名+邮箱+等级 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {r.user?.avatar ? (
                            <img
                              src={r.user.avatar}
                              alt={userName}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                              {userInitial}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 truncate max-w-[120px]" title={userName}>
                                {userName}
                              </span>
                              {renderMembershipBadge(r.user?.membershipLevel)}
                            </div>
                            <div className="text-[11px] text-slate-400 font-normal truncate max-w-[150px]" title={r.user?.email || "未绑定邮箱"}>
                              {r.user?.email || "未绑定邮箱"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 关联工作空间：真实名称或个人账户 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {r.workspace ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold text-xs shrink-0">
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 truncate max-w-[140px]" title={r.workspace.name}>
                                {r.workspace.name}
                              </div>
                              <div className="text-[10px] text-emerald-600 font-medium">
                                {r.workspace.type === "ENTERPRISE" ? "企业定制空间" : "团队协同空间"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60 font-medium text-[11px]">
                            <User className="w-3 h-3 text-slate-400" />
                            个人账户直充
                          </span>
                        )}
                      </td>

                      {/* 交易时间 */}
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] font-mono whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("zh-CN")}
                      </td>

                      {/* 操作 */}
                      <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 py-3.5 px-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                        <button
                          onClick={() => setDetailRecord(r)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all duration-200 shadow-2xs"
                          title="查看完整充值履约档案"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          查看详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

      {/* 订单明细详情 Modal：大厂级全景充值与履约看板 */}
      {/* 订单明细详情 Modal：大厂级全景充值与履约看板（分层自适应，绝对不截断） */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-white/80 text-left overflow-hidden">
            {/* 1. 弹窗头部（固定置顶） */}
            <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">交易订单与充值履约详情</h3>
                  <p className="text-[11px] text-slate-400 font-medium">全景审计用户充值流水与算力到账凭证</p>
                </div>
              </div>
              <button
                onClick={() => setDetailRecord(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                title="关闭详情"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2. 弹窗主体内容（自适应纵向滚动） */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* 核心金额与入账横幅 */}
              <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 rounded-2xl border border-blue-100/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">实付交易总额</div>
                  <div className="text-2xl font-black text-[#3182ce] font-mono mt-0.5 flex items-baseline gap-1">
                    ¥ {(detailRecord.amount / 100).toFixed(2)}
                    <span className="text-xs text-slate-400 font-normal">CNY</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div>{renderChannelBadge(detailRecord.channel)}</div>
                  <div>{renderStatusBadge(detailRecord.status)}</div>
                </div>
              </div>

              {/* 单号凭据栏 */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 flex items-center justify-between font-mono text-xs">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">系统交易单号 (Transaction ID)</span>
                  <span className="font-bold text-slate-800 select-all truncate block">{detailRecord.id}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(detailRecord.id, "modal-ord-id", "订单单号")}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-[11px] font-bold shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === "modal-ord-id" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  复制单号
                </button>
              </div>

              {/* 双列档案卡片：用户画像 + 空间归属 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 充值用户画像卡片 */}
                <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#3182ce]" />
                      充值人画像
                    </span>
                    {renderMembershipBadge(detailRecord.user?.membershipLevel)}
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    {detailRecord.user?.avatar ? (
                      <img
                        src={detailRecord.user.avatar}
                        alt={detailRecord.user.name || "用户"}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white font-black text-base flex items-center justify-center shrink-0 shadow-xs">
                        {((detailRecord.user?.name || detailRecord.user?.email || "U")[0]).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 text-sm truncate">
                        {detailRecord.user?.name || (detailRecord.user?.email ? detailRecord.user.email.split("@")[0] : "未命名用户")}
                      </div>
                      <div className="text-xs text-slate-500 font-medium truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                        {detailRecord.user?.email || "未绑定邮箱"}
                      </div>
                      {detailRecord.user?.phone && (
                        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" />
                          {detailRecord.user.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>用户 ID: {detailRecord.userId.slice(0, 12)}...</span>
                    <button
                      onClick={() => copyToClipboard(detailRecord.userId, "modal-uid", "用户ID")}
                      className="text-[#3182ce] hover:underline cursor-pointer flex items-center gap-0.5 font-sans font-bold"
                    >
                      {copiedKey === "modal-uid" ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                      复制 ID
                    </button>
                  </div>
                </div>

                {/* 空间归属卡片 */}
                <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      空间归属与属性
                    </span>
                    {detailRecord.workspace && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        {detailRecord.workspace.plan || "STANDARD"}
                      </span>
                    )}
                  </div>

                  {detailRecord.workspace ? (
                    <div className="space-y-2 pt-1">
                      <div className="font-black text-slate-900 text-sm truncate">
                        {detailRecord.workspace.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        空间类型：
                        <span className="font-bold text-slate-700">
                          {detailRecord.workspace.type === "ENTERPRISE" ? "企业定制空间" : "团队协同空间"}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>空间 ID: {detailRecord.workspaceId?.slice(0, 12)}...</span>
                        <button
                          onClick={() => copyToClipboard(detailRecord.workspaceId || "", "modal-wsid", "空间ID")}
                          className="text-emerald-600 hover:underline cursor-pointer flex items-center gap-0.5 font-sans font-bold"
                        >
                          {copiedKey === "modal-wsid" ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                          复制 ID
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                        <User className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">个人账户直接充值</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">点卡权益直接注入充值人个人账户算力池</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 商品与履约结算详情卡片（对齐网格布局） */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3 text-xs">
                <div className="text-xs font-black text-slate-700 flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                  <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
                  充值商品与履约明细
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-0.5">
                  <div>
                    <span className="text-slate-400 text-[11px] font-medium block">充值项目标题</span>
                    <span className="font-bold text-slate-800 text-xs mt-1 block" title={detailRecord.title}>
                      {detailRecord.title}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] font-medium block">交易业务大类</span>
                    <span className="font-bold text-slate-800 text-xs mt-1 block">
                      {detailRecord.type === "TOKEN_RECHARGE" ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                          算力加油包充值
                        </span>
                      ) : detailRecord.type === "PLAN_UPGRADE" ? (
                        <span className="inline-flex items-center gap-1 text-[#3182ce]">
                          <Building2 className="w-3.5 h-3.5 text-[#3182ce]" />
                          空间套餐版本升级
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-purple-700">
                          <Crown className="w-3.5 h-3.5 text-purple-600" />
                          会员等级订阅
                        </span>
                      )}
                    </span>
                  </div>

                  {/* 外部商户/业务流水号（完整规整对齐，带代码条背景与快捷复制） */}
                  {detailRecord.referenceId && (
                    <div className="sm:col-span-2 pt-2.5 border-t border-slate-200/60">
                      <span className="text-slate-400 text-[11px] font-medium block">外部商户 / 业务流水号</span>
                      <div className="mt-1 flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs">
                        <span className="font-bold text-slate-800 select-all truncate">{detailRecord.referenceId}</span>
                        <button
                          onClick={() => copyToClipboard(detailRecord.referenceId || "", "modal-ref-id", "业务流水号")}
                          className="text-[#3182ce] hover:underline flex items-center gap-1 text-[11px] font-sans font-bold ml-2 shrink-0 cursor-pointer"
                        >
                          {copiedKey === "modal-ref-id" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          复制
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 时间线与审计记录 */}
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>下单创建时间：</span>
                  <span className="font-mono text-slate-800 font-bold">
                    {new Date(detailRecord.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">已实时入账同步至算力中枢</span>
                </div>
              </div>
            </div>

            {/* 3. 弹窗底部操作按钮（固定置底） */}
            <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/60">
              <button
                onClick={() => {
                  const summary = `【交易凭证】\n单号：${detailRecord.id}\n项目：${detailRecord.title}\n金额：¥${(detailRecord.amount / 100).toFixed(2)}\n用户：${detailRecord.user?.name || detailRecord.user?.email || detailRecord.userId}\n时间：${new Date(detailRecord.createdAt).toLocaleString("zh-CN")}`;
                  copyToClipboard(summary, "modal-summary", "订单摘要");
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {copiedKey === "modal-summary" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                复制凭证摘要
              </button>

              <button
                onClick={() => setDetailRecord(null)}
                className="px-6 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-md shadow-[#3182ce]/20"
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
