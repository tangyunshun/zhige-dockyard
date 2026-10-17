"use client";

/**
 * 收银台（PAY-LINK 批次）
 *
 * 职责：把「可购算力包 → 下单 → 支付 → 到账刷新」这条本就存在的后端链路
 * 在用户侧正式补全闭环。本页只做前端编排，所有账务/入账动作均在后端完成：
 *   - GET /api/workspace/quota/token-packs  真实在售算力包 + 当前会员折扣
 *   - GET /api/workspace/quota               当前算力余额（与 /pricing 同口径）
 *   - GET /api/workspace/list                可选充值归属空间（仅本人为所有者/管理员）
 *   - POST /api/payments/create              创建待支付订单（不立即入账）
 *   - POST /api/payments/mock/confirm        模拟支付确认并入账（仅 MOCK 模式）
 *   - POST/GET /api/workspace/quota/recharge-orders  对公转账/企业充值工单
 *   - POST/GET /api/user/invoice/apply       发票申请（复用 billingrecord 表）
 *
 * 支付通道：商户真实凭证未接入前，后端恒定返回 paymentMode=MOCK；
 * 真实商户号接入后，后端返回 REAL 并由 startPay 跳转网关收银台，前端无需改动。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Coins,
  CreditCard,
  CheckCircle2,
  Loader2,
  Wallet,
  Zap,
  RefreshCw,
  ArrowRight,
  Receipt,
  FileText,
  Building2,
  ReceiptText,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";

interface TokenPack {
  id: string;
  name: string;
  points: number;
  price: number; // 原价（元）
  icon: string;
  color: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface WorkspaceOption {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: string;
}

interface CreatedOrder {
  orderNo: string;
  amountCents: number;
  points: number;
  discountPercent: number;
  paymentMode: "MOCK" | "REAL";
  realGatewayReady: boolean;
  payUrl: string | null;
  notice: string;
}

const PAYMENT_METHODS = [
  { value: "WECHAT_PAY", label: "微信支付", hint: "微信扫码支付", icon: "/icons/wechat-pay.png" },
  { value: "ALIPAY", label: "支付宝", hint: "支付宝扫码支付", icon: "/icons/alipay.png" },
] as const;

type PayTab = "recharge" | "transfer" | "invoice" | "orders" | "billing";

const SUB_MENU: { key: PayTab; label: string; icon: any }[] = [
  { key: "recharge", label: "充值算力点", icon: Zap },
  { key: "transfer", label: "对公转账/企业充值", icon: Building2 },
  { key: "invoice", label: "发票与开票记录", icon: ReceiptText },
  { key: "orders", label: "充值记录", icon: Receipt },
  { key: "billing", label: "计费与权益说明", icon: FileText },
];

const channelLabel = (c?: string) =>
  c === "WECHAT_PAY" ? "微信支付" : c === "ALIPAY" ? "支付宝" : c || "—";

const statusLabel = (s?: string) =>
  ({
    PENDING: "待支付",
    PAID: "已到账",
    COMPLETED: "已到账",
    SUCCESS: "已到账",
    FAILED: "支付失败",
    REFUNDED: "已退款",
  } as Record<string, string>)[s || ""] || s || "—";

const orderStatusLabel = (s?: string) =>
  ({
    PENDING: "待审批",
    APPROVED: "已通过·待收款",
    PAID: "已入账",
    REJECTED: "已驳回",
    CANCELLED: "已撤销",
  } as Record<string, string>)[s || ""] || s || "—";

const invoiceStatusLabel = (s?: string) =>
  s === "ISSUED" ? "已开具" : s === "REJECTED" ? "已驳回" : "待开具";

const StatusBadge = ({ text, tone }: { text: string; tone: "emerald" | "amber" | "slate" | "rose" }) => {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "amber"
        ? "bg-amber-50 text-amber-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500";
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{text}</span>
  );
};

const orderTone = (s?: string) =>
  s === "PAID" ? "emerald" : s === "PENDING" ? "amber" : s === "REJECTED" || s === "CANCELLED" ? "rose" : "slate";

export default function UserPayPage() {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<PayTab>("recharge");

  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [membershipDiscount, setMembershipDiscount] = useState(0); // 百分比，10=9折
  const [membershipName, setMembershipName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"WECHAT_PAY" | "ALIPAY">("WECHAT_PAY");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 对公转账/企业充值
  const defaultTransferForm = {
    workspaceId: "",
    points: "",
    invoiceTitle: "",
    taxNo: "",
    bankName: "",
    bankAccount: "",
    remark: "",
  };
  const [transferForm, setTransferForm] = useState(defaultTransferForm);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferResult, setTransferResult] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferOrders, setTransferOrders] = useState<any[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  // 发票与开票记录
  const defaultInvoiceForm = {
    orderNo: "",
    type: "VAT",
    title: "",
    taxNo: "",
    amountYuan: "",
    email: "",
    remark: "",
  };
  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm);
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceApplies, setInvoiceApplies] = useState<any[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = getAuthToken();
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const data = await authFetch("/api/workspace/quota");
      if (data?.success) setBalance(Number(data.tokenBalance) || 0);
    } catch {
      /* 余额加载失败静默降级，不阻断选包 */
    }
  }, [authFetch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [packRes, wsRes] = await Promise.all([
        authFetch("/api/workspace/quota/token-packs"),
        authFetch("/api/workspace/list"),
      ]);

      const list: TokenPack[] = Array.isArray(packRes?.packs) ? packRes.packs : [];
      setPacks(list);
      if (packRes?.membership) {
        setMembershipDiscount(Number(packRes.membership.tokenPackDiscount) || 0);
        setMembershipName(packRes.membership.nameZh || null);
      }
      if (list.length > 0) {
        // 默认选中「推荐」包，否则第一个
        const popular = list.find((p) => p.isPopular);
        setSelectedPackId((popular || list[0]).id);
      }

      const allWs: WorkspaceOption[] = Array.isArray(wsRes?.workspaces)
        ? wsRes.workspaces
            .filter((w: any) => w.role === "OWNER" || w.role === "ADMIN")
            .map((w: any) => ({
              id: w.id,
              name: w.name,
              type: w.type,
              role: w.role,
            }))
        : [];
      setWorkspaces(allWs);
      // 支持外部带入 ?workspaceId= 预选充值归属空间（如空间算力点页跳来），
      // 优先用 URL 参数，避免默认落到「当前活跃空间」导致充错账户
      const urlWs = (() => {
        try {
          return new URLSearchParams(window.location.search).get("workspaceId") || "";
        } catch {
          return "";
        }
      })();
      const current = wsRes?.currentWorkspaceId as string | undefined;
      const preselect = urlWs && allWs.some((w) => w.id === urlWs)
        ? urlWs
        : current && allWs.some((w) => w.id === current)
          ? current
          : allWs[0]?.id || "";
      setSelectedWorkspaceId(preselect);
      setTransferForm((f) => ({ ...f, workspaceId: preselect }));

      await loadBalance();
    } catch (e) {
      setError((e as Error)?.message || "加载充值信息失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, loadBalance]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const data = await authFetch("/api/user/billing-records");
      setOrders(Array.isArray(data?.records) ? data.records : []);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [authFetch]);

  const loadTransferOrders = useCallback(async () => {
    setTransferLoading(true);
    try {
      const data = await authFetch("/api/workspace/quota/recharge-orders");
      setTransferOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch {
      setTransferOrders([]);
    } finally {
      setTransferLoading(false);
    }
  }, [authFetch]);

  const loadInvoiceApplies = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const data = await authFetch("/api/user/invoice/apply");
      setInvoiceApplies(Array.isArray(data?.applies) ? data.applies : []);
    } catch {
      setInvoiceApplies([]);
    } finally {
      setInvoiceLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === "orders") void loadOrders();
    if (tab === "transfer") void loadTransferOrders();
    if (tab === "invoice") void loadInvoiceApplies();
  }, [tab, loadOrders, loadTransferOrders, loadInvoiceApplies]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) || null,
    [packs, selectedPackId],
  );

  // 会员价（与后端 discountedCents 同口径：原价 ×(1 - 折扣%)）
  const memberPrice = useMemo(() => {
    if (!selectedPack) return null;
    if (membershipDiscount <= 0) return selectedPack.price;
    return Math.round(selectedPack.price * (1 - membershipDiscount / 100) * 100) / 100;
  }, [selectedPack, membershipDiscount]);

  const canPay = !!selectedPack && !!selectedWorkspaceId && !creating && !order;

  const startPay = async () => {
    if (!selectedPack || !selectedWorkspaceId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await authFetch("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          points: selectedPack.points,
          packId: selectedPack.id,
          paymentMethod,
        }),
      });
      setOrder({
        orderNo: data.orderNo,
        amountCents: Number(data.amountCents) || 0,
        points: Number(data.points) || selectedPack.points,
        discountPercent: Number(data.discountPercent) || 0,
        paymentMode: data.paymentMode === "REAL" ? "REAL" : "MOCK",
        realGatewayReady: !!data.realGatewayReady,
        payUrl: data.payUrl || null,
        notice: data.notice || "",
      });
      if (data.paymentMode === "REAL" && data.payUrl) {
        // 真实网关：跳转网关收银台（商户号接入后自动启用，前端无需改动）
        window.location.href = data.payUrl;
      }
    } catch (e) {
      setError((e as Error)?.message || "创建充值订单失败");
    } finally {
      setCreating(false);
    }
  };

  const confirmMock = async () => {
    if (!order) return;
    setConfirming(true);
    setError(null);
    try {
      const data = await authFetch("/api/payments/mock/confirm", {
        method: "POST",
        body: JSON.stringify({ orderNo: order.orderNo }),
      });
      setConfirmResult(data.message || "支付成功，算力点已到账");
      toast.success(`充值成功，已入账 ${order.points.toLocaleString()} 算力点`);
      await loadBalance();
    } catch (e) {
      setError((e as Error)?.message || "支付确认失败");
    } finally {
      setConfirming(false);
    }
  };

  const resetOrder = () => {
    setOrder(null);
    setConfirmResult(null);
    setError(null);
  };

  const submitTransfer = async () => {
    if (!transferForm.workspaceId || !(Number(transferForm.points) > 0)) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const data = await authFetch("/api/workspace/quota/recharge-orders", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: transferForm.workspaceId,
          points: Number(transferForm.points),
          invoiceTitle: transferForm.invoiceTitle || undefined,
          taxNo: transferForm.taxNo || undefined,
          bankName: transferForm.bankName || undefined,
          bankAccount: transferForm.bankAccount || undefined,
          remark: transferForm.remark || undefined,
          paymentMethod: "OFFLINE_BANK",
        }),
      });
      setTransferResult(data?.order?.orderNo || "已提交");
      await loadTransferOrders();
    } catch (e) {
      setTransferError((e as Error)?.message || "提交失败");
    } finally {
      setTransferSubmitting(false);
    }
  };

  const submitInvoice = async () => {
    if (!invoiceForm.title.trim()) return;
    setInvoiceSubmitting(true);
    setInvoiceError(null);
    try {
      const data = await authFetch("/api/user/invoice/apply", {
        method: "POST",
        body: JSON.stringify({
          orderNo: invoiceForm.orderNo || undefined,
          title: invoiceForm.title,
          taxNo: invoiceForm.taxNo || undefined,
          amountCents: Math.round((Number(invoiceForm.amountYuan) || 0) * 100),
          email: invoiceForm.email || undefined,
          type: invoiceForm.type,
          remark: invoiceForm.remark || undefined,
        }),
      });
      setInvoiceResult(data?.apply?.id || "已提交");
      await loadInvoiceApplies();
    } catch (e) {
      setInvoiceError((e as Error)?.message || "提交失败");
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const inputCls =
    "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none bg-white";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  return (
    <div className="space-y-4">
      {/* 页头：标题 + 会员权益入口（单一，不重复） */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">收银台</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              充值算力点、对公转账、开票与记录管理
            </p>
          </div>
        </div>
        <Link
          href="/pricing"
          className="text-[12px] font-bold text-[#3182ce] hover:underline whitespace-nowrap"
        >
          会员权益与算力计费说明 →
        </Link>
      </div>

      {/* 顶部功能标签页（替代左侧子菜单，避免与全局侧边栏重复嵌套） */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200">
        {SUB_MENU.map((m) => {
          const Icon = m.icon;
          const active = tab === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setTab(m.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-[#3182ce] text-[#2b6cb0]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* 内容区随标签页切换 */}
      <div>
        {tab === "recharge" && (
          <div className="space-y-4">
            {/* 当前余额（与 /pricing 同口径） */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#3182ce]" />
                <span className="text-xs text-slate-500 font-bold">当前算力点余额</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-slate-800 tabular-nums font-mono">
                  {balance == null
                    ? "—"
                    : isUnlimitedToken(balance)
                      ? "∞"
                      : formatTokenBalance(balance)}
                </span>
                <span className="text-[11px] text-slate-400 font-bold">算力点</span>
                <button
                  onClick={() => void loadBalance()}
                  disabled={loading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#3182ce] hover:bg-slate-100 transition-colors"
                  title="刷新余额"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-bold">
                {error}
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white py-16 flex items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载充值信息…
              </div>
            ) : (
              <>
                {/* 支付成功结果 */}
                {order && order.paymentMode === "MOCK" && confirmResult ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center space-y-4">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <div className="text-base font-black text-emerald-700">充值成功</div>
                    <p className="text-xs text-emerald-700 font-medium">{confirmResult}</p>
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                      <span>当前余额</span>
                      <span className="font-black text-slate-800 tabular-nums font-mono">
                        {balance == null ? "—" : formatTokenBalance(balance)} 算力点
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={resetOrder}
                        className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all"
                      >
                        再充一笔
                      </button>
                      <Link
                        href="/user/points"
                        className="px-4 py-2.5 rounded-xl bg-[#3182ce] text-white font-bold text-sm hover:brightness-105 transition-all"
                      >
                        查看算力流水
                      </Link>
                    </div>
                  </div>
                ) : order && order.paymentMode === "MOCK" ? (
                  /* 收银台确认面板 */
                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 space-y-5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <CreditCard className="w-4 h-4" />
                      <span className="text-sm font-black">收银台</span>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>商品</span>
                        <span className="font-bold text-slate-800">
                          {selectedPack?.name}（{order.points.toLocaleString()} 算力点）
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>订单号</span>
                        <span className="font-mono">{order.orderNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>支付方式</span>
                        <span className="font-bold">{channelLabel(paymentMethod)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1 border-t border-slate-200">
                        <span>应付金额</span>
                        <span className="text-xl font-black text-slate-900 tabular-nums">
                          ¥{(order.amountCents / 100).toFixed(2)}
                        </span>
                      </div>
                      {order.discountPercent > 0 && (
                        <div className="text-[11px] text-emerald-600 font-semibold">
                          会员{order.discountPercent}% 优惠已计入
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => void confirmMock()}
                      disabled={confirming}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                    >
                      {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {confirming ? "确认收款中…" : "确认支付并到账"}
                    </button>
                    <button
                      onClick={resetOrder}
                      disabled={confirming}
                      className="w-full py-2 text-xs text-slate-400 hover:text-slate-600"
                    >
                      取消并返回
                    </button>
                  </div>
                ) : (
                  /* 选包 + 下单 */
                  <div className="space-y-5">
                    {/* 充值归属空间 */}
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                      <label className={labelCls}>
                        充值归属空间 <span className="text-slate-400 font-normal">（仅本人为所有者/管理员的空间）</span>
                      </label>
                      {workspaces.length === 0 ? (
                        <p className="text-xs text-slate-400">未找到可充值空间，请先创建个人或企业空间。</p>
                      ) : (
                        <select
                          value={selectedWorkspaceId}
                          onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                          className={inputCls}
                        >
                          {workspaces.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·钱包"}）
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        个人空间充值进入跨空间通用的个人钱包；企业空间充值进入该企业共享池，成员共用。
                      </p>
                    </div>

                    {/* 算力包列表 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-[#3182ce]" />
                        <span className="text-sm font-black text-slate-700">选择算力包</span>
                        {membershipDiscount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100">
                            {membershipName || "会员"}专享 {membershipDiscount}% 折扣
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {packs.map((p) => {
                          const active = p.id === selectedPackId;
                          const mp = membershipDiscount > 0
                            ? Math.round(p.price * (1 - membershipDiscount / 100) * 100) / 100
                            : p.price;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPackId(p.id)}
                              className={`relative text-left rounded-2xl border p-4 transition-all ${
                                active
                                  ? "border-[#3182ce] bg-[#3182ce]/[0.04] shadow-sm ring-1 ring-[#3182ce]/30"
                                  : "border-slate-200 bg-white hover:border-[#3182ce]/40"
                              }`}
                            >
                              {p.isPopular && (
                                <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100">
                                  推荐
                                </span>
                              )}
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                                  style={{ background: `${p.color}1a` }}
                                >
                                  {p.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-sm font-black text-slate-800 truncate">{p.name}</div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {p.points.toLocaleString()} 算力点
                                  </div>
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed min-h-[32px]">
                                {p.description}
                              </p>
                              <div className="flex items-baseline gap-1.5 mt-2">
                                <span className="text-lg font-black text-slate-900 tabular-nums">
                                  ¥{mp.toFixed(2)}
                                </span>
                                {membershipDiscount > 0 && (
                                  <span className="text-[11px] text-slate-400 line-through">
                                    ¥{p.price.toFixed(2)}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-bold">约 ¥{(mp / p.points * 1000000 / 100).toFixed(4)}/百万点</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 支付方式 */}
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                      <div className="text-xs font-bold text-slate-600 mb-2">支付方式</div>
                      <div className="grid grid-cols-2 gap-3">
                        {PAYMENT_METHODS.map((m) => {
                          const active = paymentMethod === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setPaymentMethod(m.value)}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                                active
                                  ? "border-[#3182ce] bg-[#3182ce]/[0.04] ring-1 ring-[#3182ce]/30"
                                  : "border-slate-200 hover:border-[#3182ce]/40"
                              }`}
                            >
                              <img src={m.icon} alt={m.label} className="w-6 h-6 object-contain shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm font-black text-slate-800">{m.label}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{m.hint}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 去支付 */}
                    <button
                      onClick={() => void startPay()}
                      disabled={!canPay}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      {creating
                        ? "正在创建订单…"
                        : selectedPack && memberPrice != null
                          ? `去支付 ¥${memberPrice.toFixed(2)}`
                          : "去支付"}
                    </button>
                    {!selectedWorkspaceId && workspaces.length > 0 && (
                      <p className="text-center text-[11px] text-rose-500 font-medium">请先选择充值归属空间</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "transfer" && (
          <div className="space-y-4">
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl px-4 py-3 text-[12px] font-bold text-blue-800 leading-relaxed">
              对公转账 / 合同结算：提交后将生成充值工单，由平台管理员审批通过后自动入账至所选空间的算力账户。请按提示完成对公打款并准确填写信息，便于财务对账。
            </div>

            {/* 申请表单 */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 space-y-4">
              <div>
                <label className={labelCls}>
                  充值归属空间 <span className="text-slate-400 font-normal">（仅本人为所有者/管理员的空间）</span>
                </label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-slate-400">未找到可充值空间。</p>
                ) : (
                  <select
                    value={transferForm.workspaceId}
                    onChange={(e) => setTransferForm({ ...transferForm, workspaceId: e.target.value })}
                    className={inputCls}
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·钱包"}）
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={labelCls}>
                  充值算力点数 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={transferForm.points}
                  onChange={(e) => setTransferForm({ ...transferForm, points: e.target.value })}
                  placeholder="例如 10000"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>发票抬头</label>
                  <input
                    value={transferForm.invoiceTitle}
                    onChange={(e) => setTransferForm({ ...transferForm, invoiceTitle: e.target.value })}
                    placeholder="单位名称"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>税号</label>
                  <input
                    value={transferForm.taxNo}
                    onChange={(e) => setTransferForm({ ...transferForm, taxNo: e.target.value })}
                    placeholder="纳税人识别号"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>开户银行</label>
                  <input
                    value={transferForm.bankName}
                    onChange={(e) => setTransferForm({ ...transferForm, bankName: e.target.value })}
                    placeholder="如：招商银行XX支行"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>银行账号</label>
                  <input
                    value={transferForm.bankAccount}
                    onChange={(e) => setTransferForm({ ...transferForm, bankAccount: e.target.value })}
                    placeholder="对公账号"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>备注</label>
                <textarea
                  value={transferForm.remark}
                  onChange={(e) => setTransferForm({ ...transferForm, remark: e.target.value })}
                  placeholder="合同编号、付款用途等"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none resize-none bg-white"
                />
              </div>

              {transferError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-bold">
                  {transferError}
                </div>
              )}
              {transferResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[12px] font-bold text-emerald-700">
                  工单已提交，单号：{transferResult}。可在「充值记录」中查看审批进度。
                </div>
              ) : (
                <button
                  onClick={() => void submitTransfer()}
                  disabled={transferSubmitting || !transferForm.workspaceId || !(Number(transferForm.points) > 0)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {transferSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                  {transferSubmitting ? "提交中…" : "提交充值工单"}
                </button>
              )}
              {transferResult && (
                <button
                  onClick={() => {
                    setTransferResult(null);
                    setTransferForm({ ...defaultTransferForm, workspaceId: selectedWorkspaceId });
                  }}
                  className="w-full py-2 text-xs text-slate-400 hover:text-slate-600"
                >
                  再提交一笔
                </button>
              )}
            </div>

            {/* 工单列表 */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 text-xs font-black text-slate-700">我的充值工单</div>
              {transferLoading ? (
                <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : transferOrders.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">暂无充值工单</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {transferOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">{o.workspaceName || "空间"}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          单号 {o.orderNo} · {Number(o.points).toLocaleString()} 算力点
                          {o.createdAt ? ` · ${new Date(o.createdAt).toLocaleDateString("zh-CN")}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-slate-900 tabular-nums">
                          ¥{((Number(o.amountCents) || 0) / 100).toFixed(2)}
                        </div>
                        <div className="mt-0.5 flex justify-end">
                          <StatusBadge text={orderStatusLabel(o.status)} tone={orderTone(o.status)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "invoice" && (
          <div className="space-y-4">
            {/* 申请表单 */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 space-y-4">
              <div className="text-sm font-black text-slate-800">申请开票</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>关联充值工单号</label>
                  <input
                    value={invoiceForm.orderNo}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, orderNo: e.target.value })}
                    placeholder="选填，如 RO..."
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>发票类型</label>
                  <select
                    value={invoiceForm.type}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, type: e.target.value })}
                    className={inputCls}
                  >
                    <option value="VAT">增值税专用发票</option>
                    <option value="PLAIN">增值税普通发票</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>
                    发票抬头 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={invoiceForm.title}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, title: e.target.value })}
                    placeholder="单位名称"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>税号</label>
                  <input
                    value={invoiceForm.taxNo}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, taxNo: e.target.value })}
                    placeholder="纳税人识别号"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>开票金额（元）</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceForm.amountYuan}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, amountYuan: e.target.value })}
                    placeholder="如 1000"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>收票邮箱</label>
                  <input
                    value={invoiceForm.email}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, email: e.target.value })}
                    placeholder="用于接收电子发票"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>备注</label>
                <textarea
                  value={invoiceForm.remark}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, remark: e.target.value })}
                  placeholder="开票要求等"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none resize-none bg-white"
                />
              </div>

              {invoiceError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-bold">
                  {invoiceError}
                </div>
              )}
              {invoiceResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[12px] font-bold text-emerald-700">
                  开票申请已提交（记录 {invoiceResult}）。财务核对后将开具电子发票。
                </div>
              ) : (
                <button
                  onClick={() => void submitInvoice()}
                  disabled={invoiceSubmitting || !invoiceForm.title.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {invoiceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
                  {invoiceSubmitting ? "提交中…" : "提交开票申请"}
                </button>
              )}
              {invoiceResult && (
                <button
                  onClick={() => {
                    setInvoiceResult(null);
                    setInvoiceForm(defaultInvoiceForm);
                  }}
                  className="w-full py-2 text-xs text-slate-400 hover:text-slate-600"
                >
                  再申请一张
                </button>
              )}
            </div>

            {/* 开票记录 */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 text-xs font-black text-slate-700">开票记录</div>
              {invoiceLoading ? (
                <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : invoiceApplies.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">暂无开票记录</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invoiceApplies.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">{a.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {a.invoiceType === "PLAIN" ? "普票" : "专票"}
                          {a.orderNo ? ` · 工单 ${a.orderNo}` : ""}
                          {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString("zh-CN")}` : ""}
                          {a.taxNo ? ` · ${a.taxNo}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-slate-900 tabular-nums">
                          ¥{((Number(a.amountCents) || 0) / 100).toFixed(2)}
                        </div>
                        <div className="mt-0.5 flex justify-end">
                          {a.invoiceUrl ? (
                            <a
                              href={a.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-[#3182ce] hover:underline"
                            >
                              下载发票
                            </a>
                          ) : (
                            <StatusBadge text={invoiceStatusLabel(a.status)} tone={a.status === "ISSUED" ? "emerald" : a.status === "REJECTED" ? "rose" : "amber"} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {ordersLoading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : orders.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">暂无充值记录</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orders.map((r: any) => {
                    const md = r.metadata || {};
                    const pts = md.points ?? md.tokenAmount ?? "";
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">
                            {r.title || "算力点充值"}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : ""}
                            {pts ? ` · ${Number(pts).toLocaleString()} 算力点` : ""}
                            {md.packName ? ` · ${md.packName}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black text-slate-900 tabular-nums">
                            ¥{((Number(r.amount) || 0) / 100).toFixed(2)}
                          </div>
                          <div className="text-[11px] mt-0.5 flex items-center gap-1.5 justify-end">
                            <span className="text-slate-400">{channelLabel(r.channel)}</span>
                            <StatusBadge
                              text={statusLabel(r.status)}
                              tone={r.status === "PAID" || r.status === "COMPLETED" || r.status === "SUCCESS" ? "emerald" : r.status === "PENDING" ? "amber" : "slate"}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 space-y-4 text-sm text-slate-600 leading-relaxed">
              <div>
                <div className="font-black text-slate-800 mb-1">算力点怎么计</div>
                <p className="text-[13px]">
                  算力点为余额制，充值或购买算力包后实时到账、随用随扣，不参与任何会员等级的月度自动发放与重置。执行组件时按所选模型的实际消耗实时扣减。
                </p>
              </div>
              <div>
                <div className="font-black text-slate-800 mb-1">会员折扣</div>
                <p className="text-[13px]">
                  升级会员后购买算力包可享专属折扣（不同等级折扣不同），折扣在结算时自动计入。
                </p>
              </div>
              <div>
                <div className="font-black text-slate-800 mb-1">归属与共享</div>
                <p className="text-[13px]">
                  个人空间充值进入跨空间通用的个人钱包；企业空间充值进入该企业共享池，成员共用。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
