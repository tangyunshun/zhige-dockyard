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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import BillingDetailHub from "@/components/billing/BillingDetailHub";
import PointsLedgerPanel from "@/components/billing/PointsLedgerPanel";
import Pagination from "@/components/Pagination";
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
  FolderOpen,
  Users,
  ChevronDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Info,
  Download,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";
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

type PayTab = "recharge" | "transfer" | "orders" | "detail" | "billing";

const SUB_MENU: { key: PayTab; label: string; icon: any }[] = [
  { key: "recharge", label: "充值算力点", icon: Zap },
  { key: "transfer", label: "对公转账/企业充值", icon: Building2 },
  { key: "orders", label: "充值记录", icon: Receipt },
  { key: "detail", label: "账单与发票", icon: Receipt },
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
    EXPIRED: "已超时关闭",
    CANCELLED: "已取消",
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
  const searchParams = useSearchParams();
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
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferResult, setTransferResult] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferOrders, setTransferOrders] = useState<any[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferPage, setTransferPage] = useState(1);
  const [transferPageSize, setTransferPageSize] = useState(5);
  const [transferTotal, setTransferTotal] = useState(0);
  const [transferTotalPages, setTransferTotalPages] = useState(1);
  const [transferStartDate, setTransferStartDate] = useState("");
  const [transferEndDate, setTransferEndDate] = useState("");
  const [transferStatusFilter, setTransferStatusFilter] = useState("ALL");
  const [selectedTransferIds, setSelectedTransferIds] = useState<string[]>([]);
  const [transferDetail, setTransferDetail] = useState<any | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);

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
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceApplies, setInvoiceApplies] = useState<any[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(5);

  // 充值记录分页与筛选
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [orderFilterStatus, setOrderFilterStatus] = useState("ALL");
  const [orderFilterChannel, setOrderFilterChannel] = useState("ALL");
  const [orderKeyword, setOrderKeyword] = useState("");
  const [orderDateStart, setOrderDateStart] = useState("");
  const [orderDateEnd, setOrderDateEnd] = useState("");
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [orderSummary, setOrderSummary] = useState<Record<string, number>>({
    PENDING: 0, SUCCESS: 0, CANCELLED: 0, EXPIRED: 0, total: 0,
  });

  // 官方对公账户（动态配置，非硬编码）
  const [officialAccount, setOfficialAccount] = useState<any>(null);
  const [officialAccountLoading, setOfficialAccountLoading] = useState(false);

  // 取消订单中的订单号
  const [cancellingOrderNo, setCancellingOrderNo] = useState<string | null>(null);

  // 用户在收银台点「返回重新选择规格」后，本次会话内不再自动恢复该待支付订单
  //（否则清空后会被自动恢复逻辑立刻弹回，表现为按钮“点了没反应”）。
  // 刷新页面或重新进入后仍会正常恢复，保证「中途返回保留未支付记录」不受影响。
  const skipPendingRestoreRef = useRef(false);

  // 复制反馈状态
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const loadOrders = useCallback(async (page = ordersPage) => {
    setOrdersLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", String(ordersPageSize));
      if (orderFilterStatus !== "ALL") qs.set("status", orderFilterStatus);
      if (orderFilterChannel !== "ALL") qs.set("channel", orderFilterChannel);
      if (orderDateStart) qs.set("startDate", orderDateStart);
      if (orderDateEnd) qs.set("endDate", orderDateEnd);
      if (orderKeyword.trim()) qs.set("keyword", orderKeyword.trim());
      const data = await authFetch(`/api/payments/orders?${qs.toString()}`);
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setOrdersTotal(Number(data?.total) || 0);
      setOrdersTotalPages(Number(data?.totalPages) || 1);
      if (data?.summary) setOrderSummary(data.summary);
    } catch {
      setOrders([]);
      setOrdersTotal(0);
      setOrdersTotalPages(1);
    } finally {
      setOrdersLoading(false);
    }
  }, [authFetch, ordersPage, ordersPageSize, orderFilterStatus, orderFilterChannel, orderDateStart, orderDateEnd, orderKeyword]);

  const loadOfficialAccount = useCallback(async () => {
    setOfficialAccountLoading(true);
    try {
      const data = await authFetch("/api/system/recharge-account");
      setOfficialAccount(data?.account || null);
    } catch {
      setOfficialAccount(null);
    } finally {
      setOfficialAccountLoading(false);
    }
  }, [authFetch]);

  // 进入充值页时，若库中存在本人「待支付」订单则自动恢复，支持中途返回后继续支付
  const loadPendingOrder = useCallback(async () => {
    if (order || skipPendingRestoreRef.current) return;
    try {
      const data = await authFetch("/api/payments/orders?status=PENDING&limit=1");
      const pending = Array.isArray(data?.orders) ? data.orders[0] : null;
      if (pending && pending.status === "PENDING") {
        setOrder({
          orderNo: pending.orderNo,
          amountCents: Number(pending.amountCents) || 0,
          points: Number(pending.points) || 0,
          discountPercent: Number(pending.discountPercent) || 0,
          paymentMode: pending.paymentMode === "REAL" ? "REAL" : "MOCK",
          realGatewayReady: false,
          payUrl: null,
          notice: pending.paymentMode === "REAL" ? "请使用原支付渠道完成付款" : "当前为模拟支付，确认后即可到账",
        });
      }
    } catch {
      /* 静默降级，不阻断选包 */
    }
  }, [authFetch, order]);

  // 取消未支付订单
  const cancelOrder = async (orderNo: string) => {
    setCancellingOrderNo(orderNo);
    try {
      await authFetch("/api/payments/cancel", {
        method: "POST",
        body: JSON.stringify({ orderNo }),
      });
      toast.success("订单已取消，可重新发起充值");
      if (order && order.orderNo === orderNo) resetOrder();
      await loadOrders(ordersPage);
    } catch (e) {
      toast.error((e as Error)?.message || "取消订单失败");
    } finally {
      setCancellingOrderNo(null);
    }
  };

  // 从充值记录「继续支付」：恢复该订单到收银台
  const continuePay = (o: any) => {
    setOrder({
      orderNo: o.orderNo,
      amountCents: Number(o.amountCents) || 0,
      points: Number(o.points) || 0,
      discountPercent: Number(o.discountPercent) || 0,
      paymentMode: o.paymentMode === "REAL" ? "REAL" : "MOCK",
      realGatewayReady: false,
      payUrl: null,
      notice: o.paymentMode === "REAL" ? "请使用原支付渠道完成付款" : "当前为模拟支付，确认后即可到账",
    });
    setConfirmResult(null);
    setTab("recharge");
  };

  const loadTransferOrders = useCallback(
    async (
      targetPage = transferPage,
      sDate = transferStartDate,
      eDate = transferEndDate,
      stat = transferStatusFilter,
    ) => {
      setTransferLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(transferPageSize),
        });
        if (sDate) params.set("startDate", sDate);
        if (eDate) params.set("endDate", eDate);
        if (stat && stat !== "ALL") params.set("status", stat);
        const data = await authFetch(`/api/workspace/quota/recharge-orders?${params.toString()}`);
        const list = Array.isArray(data?.orders) ? data.orders : [];
        setTransferOrders(list);
        const pg = data?.pagination || {};
        setTransferTotal(Number(pg.total ?? list.length));
        setTransferTotalPages(Number(pg.totalPages ?? 1));
        setTransferPage(Number(pg.page ?? targetPage));
      } catch {
        setTransferOrders([]);
      } finally {
        setTransferLoading(false);
      }
    },
    [authFetch, transferPage, transferPageSize, transferStartDate, transferEndDate, transferStatusFilter],
  );

  /** 创建时间距今是否超过 3 年（仅超 3 年工单允许删除/批量删除） */
  const isOrderExpired3y = (createdAt?: string) => {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() > 3 * 365 * 24 * 60 * 60 * 1000;
  };

  const handleTransferStartChange = (val: string) => {
    if (val && transferEndDate && val > transferEndDate) {
      toast.warning("开始时间不能晚于结束时间，已为您清空结束时间");
      setTransferEndDate("");
      setTransferStartDate(val);
      void loadTransferOrders(1, val, "");
      return;
    }
    setTransferStartDate(val);
    void loadTransferOrders(1, val, transferEndDate);
  };
  const handleTransferEndChange = (val: string) => {
    if (val && transferStartDate && val < transferStartDate) {
      toast.warning("结束时间不能早于开始时间，请重新选择");
      return;
    }
    setTransferEndDate(val);
    void loadTransferOrders(1, transferStartDate, val);
  };
  const handleTransferStatusChange = (val: string) => {
    setTransferStatusFilter(val);
    void loadTransferOrders(1, transferStartDate, transferEndDate, val);
  };
  const handleTransferReset = () => {
    setTransferStartDate("");
    setTransferEndDate("");
    setTransferStatusFilter("ALL");
    setSelectedTransferIds([]);
    void loadTransferOrders(1, "", "", "ALL");
  };
  const handleTransferPageChange = (p: number) => {
    setTransferPage(p);
    void loadTransferOrders(p, transferStartDate, transferEndDate, transferStatusFilter);
  };
  const toggleTransferSelect = (id: string) => {
    setSelectedTransferIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const handleCancelOrder = async (id: string) => {
    setTransferBusy(true);
    try {
      const data = await authFetch("/api/workspace/quota/recharge-orders", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "CANCEL" }),
      });
      if (data?.success) {
        toast.success("工单已撤销");
        setTransferDetail(null);
        await loadTransferOrders(transferPage, transferStartDate, transferEndDate, transferStatusFilter);
      } else {
        toast.error(data?.error || "撤销失败");
      }
    } catch {
      toast.error("撤销失败");
    } finally {
      setTransferBusy(false);
    }
  };
  const handleDeleteTransfer = async (ids: string[]) => {
    if (ids.length === 0) return;
    setTransferBusy(true);
    try {
      const data = await authFetch("/api/workspace/quota/recharge-orders", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      if (data?.success) {
        toast.success(data.message || `已删除 ${data.deleted} 笔工单`);
        setSelectedTransferIds([]);
        await loadTransferOrders(transferPage, transferStartDate, transferEndDate, transferStatusFilter);
      } else {
        toast.error(data?.error || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setTransferBusy(false);
    }
  };
  const handleExportTransfer = async () => {
    setTransferBusy(true);
    try {
      const params = new URLSearchParams({ pageSize: String(99999) });
      if (transferStartDate) params.set("startDate", transferStartDate);
      if (transferEndDate) params.set("endDate", transferEndDate);
      if (transferStatusFilter !== "ALL") params.set("status", transferStatusFilter);
      const data = await authFetch(`/api/workspace/quota/recharge-orders?${params.toString()}`);
      const list = Array.isArray(data?.orders) ? data.orders : [];
      if (list.length === 0) {
        toast.warning("当前筛选条件下暂无工单可导出");
        return;
      }
      exportToExcel({
        filename: "我的对公充值工单",
        sheetName: "对公充值工单",
        maxRows: 99999,
        trace: {
          exportType: "对公充值工单",
          filters: { startDate: transferStartDate || undefined, endDate: transferEndDate || undefined, status: transferStatusFilter },
          rowCount: list.length,
          page: "/user/pay",
        },
        columns: [
          { header: "工单号", key: "orderNo", width: 24 },
          { header: "空间", key: "workspaceName", width: 20 },
          { header: "点数", key: "points", width: 12 },
          { header: "金额(元)", key: "amountCents", width: 16, formatter: (v: number) => (Number(v || 0) / 100).toFixed(2) },
          { header: "状态", key: "status", width: 14, formatter: (v: string) => orderStatusLabel(v) },
          { header: "创建时间", key: "createdAt", width: 22, formatter: formatExcelDateTime },
          { header: "到账时间", key: "paidAt", width: 22, formatter: formatExcelDateTime },
        ],
        data: list,
      });
      toast.success(`已导出 ${list.length} 笔工单`);
    } catch {
      toast.error("导出失败");
    } finally {
      setTransferBusy(false);
    }
  };

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
    if (tab === "orders") void loadOrders(1);
    if (tab === "transfer") {
      void loadTransferOrders();
      void loadOfficialAccount();
    }
    if (tab === "recharge") void loadPendingOrder();
  }, [tab, loadOrders, loadTransferOrders, loadInvoiceApplies, loadOfficialAccount, loadPendingOrder]);

  // 从 URL ?tab= 同步当前 Tab（支持从「申请开票」等入口直达账单与发票）
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && SUB_MENU.some((t) => t.key === urlTab)) {
      setTab(urlTab as PayTab);
    }
  }, [searchParams]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) || null,
    [packs, selectedPackId],
  );

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId],
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
    // 重新发起下单：恢复正常的待支付订单自动恢复能力
    skipPendingRestoreRef.current = false;
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
    // 用户主动返回选包：本次会话内不再自动恢复该待支付订单（可在「充值记录」里继续支付或取消）
    skipPendingRestoreRef.current = true;
    setOrder(null);
    setConfirmResult(null);
    setError(null);
  };

  // 官方对公收款账户改为动态配置，由 /api/system/recharge-account 读取（见 officialAccount 状态），不再写死。

  const copyToClipboard = (text: string, label: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("input");
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedField(label);
      toast.success(`已复制 ${label}`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error(`复制 ${label} 失败，请手动长按复制`);
    }
  };

  // 对公转账/企业充值表单字段校验
  const validateTransferForm = () => {
    const errs: Record<string, string> = {};
    if (!transferForm.workspaceId) {
      errs.workspaceId = "请选择充值归属空间";
    }
    const pts = Number(transferForm.points);
    if (!transferForm.points || isNaN(pts)) {
      errs.points = "请输入充值算力点数";
    } else if (!Number.isInteger(pts) || pts < 100) {
      errs.points = "充值算力点数必须为正整数且最低 100 点起充";
    }

    if (!transferForm.invoiceTitle.trim()) {
      errs.invoiceTitle = "请填写发票抬头/汇款单位全称（用于财务认领对账）";
    } else if (transferForm.invoiceTitle.trim().length < 2) {
      errs.invoiceTitle = "汇款单位全称至少输入 2 个字符";
    }

    if (transferForm.taxNo.trim()) {
      const taxRegex = /^[0-9A-HJ-NP-RT-UW-YA-Z]{15,20}$/i;
      if (!taxRegex.test(transferForm.taxNo.trim())) {
        errs.taxNo = "请输入 15~20 位的统一社会信用代码/纳税人识别号";
      }
    }

    if (transferForm.bankAccount.trim()) {
      const bankAccountRegex = /^[\d\-]{9,32}$/;
      if (!bankAccountRegex.test(transferForm.bankAccount.trim())) {
        errs.bankAccount = "请输入 9~32 位的企业银行对公账号（仅限数字与连字符）";
      }
    }

    setTransferErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitTransfer = async () => {
    if (!validateTransferForm()) {
      toast.error("请完善转账工单信息并修正标红错误项");
      return;
    }
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const data = await authFetch("/api/workspace/quota/recharge-orders", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: transferForm.workspaceId,
          points: Number(transferForm.points),
          invoiceTitle: transferForm.invoiceTitle.trim() || undefined,
          taxNo: transferForm.taxNo.trim() || undefined,
          bankName: transferForm.bankName.trim() || undefined,
          bankAccount: transferForm.bankAccount.trim() || undefined,
          remark: transferForm.remark.trim() || undefined,
          paymentMethod: "OFFLINE_BANK",
        }),
      });
      setTransferResult(data?.order?.orderNo || "已提交");
      toast.success("对公转账工单提交成功，请按指引完成线下汇款");
      setTransferPage(1);
      await loadTransferOrders();
    } catch (e) {
      const msg = (e as Error)?.message || "提交失败";
      setTransferError(msg);
      toast.error(msg);
    } finally {
      setTransferSubmitting(false);
    }
  };

  // 发票开票申请表单校验
  const validateInvoiceForm = () => {
    const errs: Record<string, string> = {};
    if (!invoiceForm.title.trim()) {
      errs.title = "请填写发票抬头（企业全称或个人姓名）";
    } else if (invoiceForm.title.trim().length < 2) {
      errs.title = "发票抬头至少输入 2 个字符";
    }

    if (invoiceForm.type === "VAT") {
      if (!invoiceForm.taxNo.trim()) {
        errs.taxNo = "开具增值税专用发票必须填写 18 位统一社会信用代码";
      } else if (!/^[0-9A-HJ-NP-RT-UW-YA-Z]{15,20}$/i.test(invoiceForm.taxNo.trim())) {
        errs.taxNo = "统一社会信用代码格式不正确（15~20位大写字母或数字）";
      }
    } else if (invoiceForm.taxNo.trim()) {
      if (!/^[0-9A-HJ-NP-RT-UW-YA-Z]{15,20}$/i.test(invoiceForm.taxNo.trim())) {
        errs.taxNo = "统一社会信用代码格式不正确（15~20位大写字母或数字）";
      }
    }

    const amt = Number(invoiceForm.amountYuan);
    if (!invoiceForm.amountYuan || isNaN(amt) || amt <= 0) {
      errs.amountYuan = "请输入大于 0 的有效开票金额（最低 ¥0.01）";
    }

    if (!invoiceForm.email.trim()) {
      errs.email = "请填写收票电子邮箱（用于接收电子发票）";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceForm.email.trim())) {
      errs.email = "电子邮箱格式不正确，例如 finance@company.com";
    }

    setInvoiceErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitInvoice = async () => {
    if (!validateInvoiceForm()) {
      toast.error("请完善开票申请信息并修正标红错误项");
      return;
    }
    setInvoiceSubmitting(true);
    setInvoiceError(null);
    try {
      const data = await authFetch("/api/user/invoice/apply", {
        method: "POST",
        body: JSON.stringify({
          orderNo: invoiceForm.orderNo.trim() || undefined,
          title: invoiceForm.title.trim(),
          taxNo: invoiceForm.taxNo.trim() || undefined,
          amountCents: Math.round((Number(invoiceForm.amountYuan) || 0) * 100),
          email: invoiceForm.email.trim() || undefined,
          type: invoiceForm.type,
          remark: invoiceForm.remark.trim() || undefined,
        }),
      });
      setInvoiceResult(data?.apply?.id || "已提交");
      toast.success("开票申请已提交，财务核对后将开具电子发票");
      setInvoicePage(1);
      await loadInvoiceApplies();
    } catch (e) {
      const msg = (e as Error)?.message || "提交失败";
      setInvoiceError(msg);
      toast.error(msg);
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  // 分页计算：对公转账工单

  // 分页计算：开票申请记录
  const totalInvoiceApplies = invoiceApplies.length;
  const totalInvoicePages = Math.max(1, Math.ceil(totalInvoiceApplies / invoicePageSize));
  const safeInvoicePage = Math.min(Math.max(1, invoicePage), totalInvoicePages);
  const pagedInvoiceApplies = useMemo(() => {
    const start = (safeInvoicePage - 1) * invoicePageSize;
    return invoiceApplies.slice(start, start + invoicePageSize);
  }, [invoiceApplies, safeInvoicePage, invoicePageSize]);

  // 分页计算：充值记录（服务端分页，orders 已是当前页数据）
  const totalOrders = ordersTotal;
  const totalOrdersPages = ordersTotalPages;
  const safeOrdersPage = Math.min(Math.max(1, ordersPage), ordersTotalPages);
  const pagedOrders = useMemo(() => orders, [orders]);

  const inputCls =
    "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none bg-white";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  return (
    <div className="space-y-6 font-sans">
      {/* 页头标题与说明 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Coins className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">收银台与充值结算</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/60">
              安全结算
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            算力点在线充值、对公汇款转账工单、增值税发票申请与全渠道订单追踪。
          </p>
        </div>
        <Link
          href="/pricing"
          className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold self-start sm:self-auto ml-10 sm:ml-0"
        >
          <span>查看会员权益说明</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 顶部功能标签页 */}
      <div className="zg-card p-1.5 flex items-center gap-1.5 overflow-x-auto">
        {SUB_MENU.map((m) => {
          const Icon = m.icon;
          const active = tab === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setTab(m.key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-[#3182ce] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#3182ce] hover:bg-slate-100/70"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* 内容区随标签页切换 */}
      <div>
        {tab === "recharge" && (
          <div className="space-y-5">
            {/* 账户算力概览与充值归属空间 Bento 顶栏 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* 左侧：当前可用算力点余额与充后预览 */}
              <div className="lg:col-span-5 zg-card p-5 flex flex-col justify-between border-t-2 border-t-[#3182ce]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center shadow-xs shrink-0">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">当前可用算力点余额</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f0f7ff] text-[#2b6cb0] border border-[#bee3f8]">
                          实时账本
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">支付确认后算力点秒级汇入所选目标账户</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadBalance()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 h-7.5 px-3 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
                    title="刷新算力余额"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>刷新</span>
                  </button>
                </div>

                {/* 双栏核心指标对比：当前可用 vs 充后预计 */}
                <div className="grid grid-cols-2 gap-3 my-4">
                  <div className="p-3 rounded-lg bg-[#f8fbff] border border-blue-100/90">
                    <div className="text-[11px] font-bold text-slate-500">当前账户可用</div>
                    <div className="text-2xl font-black font-mono text-slate-800 tracking-tight mt-1 tabular-nums">
                      {balance == null
                        ? "—"
                        : isUnlimitedToken(balance)
                          ? "∞ 无限配额"
                          : formatTokenBalance(balance)}
                      <span className="text-xs font-bold text-slate-400 font-sans ml-1">算力点</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-emerald-800">本单充后预计</span>
                      {selectedPack && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-100/90 text-[#38a169]">
                          +{selectedPack.points.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-black font-mono text-[#38a169] tracking-tight mt-1 tabular-nums">
                      {balance == null
                        ? "—"
                        : isUnlimitedToken(balance)
                          ? "∞ 无限配额"
                          : formatTokenBalance(balance + (selectedPack?.points || 0))}
                      <span className="text-xs font-bold text-emerald-600/70 font-sans ml-1">算力点</span>
                    </div>
                  </div>
                </div>

                {/* 底部会员折扣与流水入口 */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  {membershipDiscount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-50 text-[#dd6b20] border border-orange-200/70">
                      <Zap className="w-3 h-3" />
                      <span>{membershipName || "会员"}专享 {membershipDiscount}% 算力包折扣</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                      参考折算：100 算力点 = ¥1.00
                    </span>
                  )}
                  <Link
                    href="/user/points"
                    className="text-[11px] font-bold text-[#2b6cb0] hover:text-[#3182ce] inline-flex items-center gap-1 shrink-0"
                  >
                    <span>查看流水明细</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* 右侧：充值归属空间选择与入账规则对照 */}
              <div className="lg:col-span-7 zg-card p-5 flex flex-col justify-between border-t-2 border-t-[#3182ce]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#f0f7ff] text-[#3182ce] border border-[#bee3f8] flex items-center justify-center shrink-0">
                      {selectedWorkspace?.type === "ENTERPRISE" ? (
                        <Building2 className="w-5 h-5" />
                      ) : (
                        <FolderOpen className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label htmlFor="pay-workspace-select" className="text-sm font-black text-slate-800 zg-required">
                          充值归属空间
                        </label>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                          仅本人拥有管理权限的空间
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        选择本次充值算力点入账的目标空间账户，支持个人通用钱包与企业共享池
                      </p>
                    </div>
                  </div>
                  {selectedWorkspace && (
                    <span
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border shrink-0 ${
                        selectedWorkspace.type === "ENTERPRISE"
                          ? "bg-emerald-50 text-[#38a169] border-emerald-200"
                          : "bg-[#f0f7ff] text-[#2b6cb0] border-[#bee3f8]"
                      }`}
                    >
                      {selectedWorkspace.type === "ENTERPRISE" ? "当前入账：企业共享算力池" : "当前入账：个人通用钱包"}
                    </span>
                  )}
                </div>

                {/* 空间下拉选择器 */}
                <div className="my-3.5">
                  {workspaces.length === 0 ? (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
                      <span>未找到可充值空间，请先创建个人或企业空间。</span>
                      <Link href="/user/workspaces" className="font-bold text-[#3182ce] hover:text-[#2b6cb0]">
                        前往工作空间 →
                      </Link>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#3182ce]">
                        {selectedWorkspace?.type === "ENTERPRISE" ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <FolderOpen className="w-4 h-4" />
                        )}
                      </div>
                      <select
                        id="pay-workspace-select"
                        value={selectedWorkspaceId}
                        disabled={!!order}
                        onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                        className="w-full h-10 pl-9 pr-9 text-xs font-bold text-slate-800 bg-[#f8fbff] hover:bg-white focus:bg-white border border-[#bee3f8] focus:border-[#3182ce] rounded-lg appearance-none outline-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·通用钱包"}）
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 个人通用钱包 vs 企业共享池入账规则对照 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    className={`p-2.5 rounded-lg border transition-colors ${
                      selectedWorkspace?.type !== "ENTERPRISE"
                        ? "bg-[#f0f7ff]/80 border-[#90cdf4]"
                        : "bg-slate-50/70 border-slate-200/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <FolderOpen className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                        <span>个人空间 · 通用钱包</span>
                      </div>
                      {selectedWorkspace?.type !== "ENTERPRISE" && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#3182ce] text-white">
                          当前选中
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      算力点汇入跨空间通用的个人钱包，本人名下所有空间均可直接调用。
                    </p>
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border transition-colors ${
                      selectedWorkspace?.type === "ENTERPRISE"
                        ? "bg-emerald-50/70 border-emerald-300"
                        : "bg-slate-50/70 border-slate-200/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Users className="w-3.5 h-3.5 text-[#38a169] shrink-0" />
                        <span>企业空间 · 共享算力池</span>
                      </div>
                      {selectedWorkspace?.type === "ENTERPRISE" && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#38a169] text-white">
                          当前选中
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      算力点直接计入该企业空间专属共享池，供全体空间成员协同调用。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="p-12 space-y-4">
                <div className="h-20 zg-skeleton rounded-2xl" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-36 zg-skeleton rounded-2xl" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* 支付成功结果面板 */}
                {order && order.paymentMode === "MOCK" && confirmResult ? (
                  <div className="zg-card p-8 text-center space-y-4 border-emerald-200 bg-emerald-50/40">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="text-lg font-black text-emerald-800">支付充值已成功到账</div>
                      <p className="text-xs text-emerald-700 font-medium mt-1">{confirmResult}</p>
                    </div>
                    <div className="p-4 bg-white/80 rounded-xl border border-emerald-200/60 max-w-sm mx-auto flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">更新后可用余额</span>
                      <span className="font-mono font-black text-slate-800 text-base">
                        {balance == null ? "—" : formatTokenBalance(balance)} 点
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={resetOrder}
                        className="zg-btn zg-btn-default text-xs h-9 px-4 font-bold"
                      >
                        继续充值
                      </button>
                      <Link
                        href="/user/points"
                        className="zg-btn zg-btn-primary text-xs h-9 px-4 font-bold"
                      >
                        查看算力明细流水
                      </Link>
                      <Link
                        href={`/user/pay?tab=detail&orderNo=${encodeURIComponent(order.orderNo)}`}
                        className="zg-btn zg-btn-default text-xs h-9 px-4 font-bold"
                      >
                        申请开票
                      </Link>
                    </div>
                  </div>
                ) : order && order.paymentMode === "MOCK" ? (
                  /* 收银台确认面板 */
                  <div className="zg-card p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#3182ce]" />
                        <h2 className="text-sm font-bold text-slate-800">收银台确认</h2>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">单号：{order.orderNo}</span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">购买商品规格</span>
                        <span className="font-bold text-slate-800">
                          {(selectedPack?.name || order.title)}（{order.points.toLocaleString()} 算力点）
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">支付结算方式</span>
                        <span className="font-bold text-slate-800">{channelLabel(paymentMethod)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                        <span className="font-bold text-slate-600">应付实付总额</span>
                        <span className="text-2xl font-black font-mono text-[#3182ce]">
                          ¥{(order.amountCents / 100).toFixed(2)}
                        </span>
                      </div>
                      {order.discountPercent > 0 && (
                        <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>会员专属 {order.discountPercent}% 优惠已计入抵扣</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void confirmMock()}
                        disabled={confirming}
                        className="zg-btn zg-btn-primary w-full h-10 text-xs font-bold gap-2"
                      >
                        {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>{confirming ? "正在安全入账中…" : "确认支付并立即到账"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelOrder(order.orderNo)}
                        disabled={confirming || cancellingOrderNo === order.orderNo}
                        className="w-full py-2 text-xs text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {cancellingOrderNo === order.orderNo ? "取消中…" : "取消支付"}
                      </button>
                      <button
                        type="button"
                        onClick={resetOrder}
                        disabled={confirming}
                        className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors cursor-pointer"
                      >
                        返回重新选择规格
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 选包与下单面板 */
                  <div className="space-y-5">
                    {/* 算力包选购网格 */}
                    <div>
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-[#3182ce]" />
                          <h2 className="text-sm font-bold text-slate-800">选择算力包规格</h2>
                        </div>
                        {membershipDiscount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            {membershipName || "会员"}专享 {membershipDiscount}% 折扣
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                              className={`relative text-left rounded-xl p-4.5 transition-all cursor-pointer ${
                                active
                                  ? "bg-white border-2 border-[#3182ce] shadow-sm shadow-blue-500/10 ring-2 ring-[#3182ce]/20"
                                  : "bg-white/80 border border-slate-200/80 hover:border-[#3182ce]/50 hover:bg-white"
                              }`}
                            >
                              {p.isPopular && (
                                <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-white shadow-xs">
                                  热销推荐
                                </span>
                              )}
                              <div className="flex items-center gap-3">
                                <span
                                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-2xs"
                                  style={{ background: `${p.color}1a` }}
                                >
                                  {p.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
                                  <div className="text-xs font-mono font-bold text-slate-400 mt-0.5">
                                    {p.points.toLocaleString()} 算力点
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed min-h-[34px]">
                                {p.description}
                              </p>
                              <div className="flex items-baseline gap-2 mt-3 pt-2.5 border-t border-slate-100">
                                <span className="text-xl font-black font-mono text-[#3182ce] tabular-nums">
                                  ¥{mp.toFixed(2)}
                                </span>
                                {membershipDiscount > 0 && (
                                  <span className="text-xs text-slate-400 line-through">
                                    ¥{p.price.toFixed(2)}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-medium ml-auto">
                                  约 ¥{(mp / p.points * 1000000 / 100).toFixed(4)}/百万点
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 支付方式选择 */}
                    <div className="zg-card p-5">
                      <div className="text-xs font-bold text-slate-700 mb-3">选择结算支付通道</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {PAYMENT_METHODS.map((m) => {
                          const active = paymentMethod === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setPaymentMethod(m.value)}
                              className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                                active
                                  ? "border-[#3182ce] bg-blue-50/30 ring-1 ring-[#3182ce]/30"
                                  : "border-slate-200/80 bg-white/70 hover:border-[#3182ce]/50 hover:bg-white"
                              }`}
                            >
                              <img src={m.icon} alt={m.label} className="w-7 h-7 object-contain shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800">{m.label}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{m.hint}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 去支付按钮 */}
                    <button
                      type="button"
                      onClick={() => void startPay()}
                      disabled={!canPay}
                      className="zg-btn zg-btn-primary w-full h-11 text-sm font-bold gap-2 shadow-sm hover:shadow-md"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      <span>
                        {creating
                          ? "正在创建订单…"
                          : selectedPack && memberPrice != null
                            ? `前往支付 ¥${memberPrice.toFixed(2)}`
                            : "立即支付"}
                      </span>
                    </button>
                    {!selectedWorkspaceId && workspaces.length > 0 && (
                      <p className="text-center text-xs text-red-500 font-bold">请先选择充值归属空间</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "transfer" && (
          <div className="space-y-4">
            {/* 官方对公收款银行账户指引卡片 */}
            <div className="zg-card p-5 bg-gradient-to-br from-blue-50/60 via-white to-slate-50/60 border border-blue-200/80 shadow-xs space-y-3.5">
              <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                    <Building2 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <span>平台官方对公转账收款账户</span>
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-blue-100/70 text-[#2b6cb0] border border-blue-200">
                        银行电汇 / 网银对公
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      提交工单后请通过企业网银或银行柜台汇款，财务核对流水后自动入账并开具发票
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">户名（对公汇款收款方）</span>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-xs font-bold text-slate-800 break-all">{officialAccount?.companyName || "—"}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(officialAccount?.companyName || "", "公司户名")}
                      className="p-1 rounded text-slate-400 hover:text-[#3182ce] hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
                      title="复制户名"
                    >
                      {copiedField === "公司户名" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200/80 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">开户银行全称</span>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-xs font-bold text-slate-800 break-all">{officialAccount?.bankName || "—"}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(officialAccount?.bankName || "", "开户银行")}
                      className="p-1 rounded text-slate-400 hover:text-[#3182ce] hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
                      title="复制开户行"
                    >
                      {copiedField === "开户银行" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200/80 flex flex-col justify-between">
                  <span className="text-[11px] font-medium text-slate-400">对公银行结算账号</span>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-sm font-black font-mono text-[#3182ce] break-all">{officialAccount?.accountNumber || "—"}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard((officialAccount?.accountNumber || "").replace(/\s+/g, ""), "银行账号")}
                      className="p-1 rounded text-slate-400 hover:text-[#3182ce] hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
                      title="复制银行账号"
                    >
                      {copiedField === "银行账号" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50/90 border border-amber-200/80 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>
                  {officialAccount ? (
                    <>
                      <strong>转账重要提示：</strong>打款时请务必在网银的「转账附言 / 备注 / 用途」中准确填写本工单生成的订单号，以便财务自动对账认领。
                    </>
                  ) : (
                    <>平台暂未配置对公收款账户，请联系平台管理员获取收款信息。</>
                  )}
                </span>
              </div>
            </div>

            {/* 申请表单 */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                  <h3 className="text-sm font-bold text-slate-800">填写对公充值工单信息</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">标有星号的项目为必填项</span>
              </div>

              {/* 充值归属空间 */}
              <div>
                <label className={`${labelCls} zg-required`}>
                  充值归属空间
                </label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-rose-500 font-medium mt-1">未找到可充值空间，请先创建个人空间或加入企业空间。</p>
                ) : (
                  <select
                    value={transferForm.workspaceId}
                    onChange={(e) => {
                      setTransferForm({ ...transferForm, workspaceId: e.target.value });
                      if (transferErrors.workspaceId) {
                        setTransferErrors((prev) => {
                          const n = { ...prev };
                          delete n.workspaceId;
                          return n;
                        });
                      }
                    }}
                    className={`${inputCls} ${transferErrors.workspaceId ? "border-rose-400 bg-rose-50/20 focus:border-rose-500" : ""}`}
                  >
                    <option value="">-- 请选择充值入账的目标空间 --</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·通用钱包"}）
                      </option>
                    ))}
                  </select>
                )}
                {transferErrors.workspaceId ? (
                  <p className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{transferErrors.workspaceId}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    款项经财务核对确认后，将直接全额划入该空间的算力池账户。
                  </p>
                )}
              </div>

              {/* 充值算力点数 */}
              <div>
                <label className={`${labelCls} zg-required`}>
                  充值算力点数
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="100"
                    step="1"
                    value={transferForm.points}
                    onChange={(e) => {
                      setTransferForm({ ...transferForm, points: e.target.value });
                      if (transferErrors.points) {
                        setTransferErrors((prev) => {
                          const n = { ...prev };
                          delete n.points;
                          return n;
                        });
                      }
                    }}
                    placeholder="请输入需充值的点数，如 10000"
                    className={`${inputCls} font-mono ${transferErrors.points ? "border-rose-400 bg-rose-50/20 focus:border-rose-500" : ""}`}
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                    算力点
                  </span>
                </div>
                {transferErrors.points ? (
                  <p className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{transferErrors.points}</span>
                  </p>
                ) : (
                  <div className="flex items-center justify-between text-[11px] mt-1 flex-wrap gap-2">
                    <span className="text-slate-400">最低 100 算力点起充，基准单价：100 算力点 = ¥1.00</span>
                    {Number(transferForm.points) >= 100 && (
                      <span className="font-bold text-[#2b6cb0] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60 font-mono">
                        预计打款金额：¥{(Number(transferForm.points) / 100).toFixed(2)} 元
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 发票抬头 / 汇款单位全称 */}
                <div>
                  <label className={`${labelCls} zg-required`}>
                    发票抬头 / 汇款单位全称
                  </label>
                  <input
                    value={transferForm.invoiceTitle}
                    onChange={(e) => {
                      setTransferForm({ ...transferForm, invoiceTitle: e.target.value });
                      if (transferErrors.invoiceTitle) {
                        setTransferErrors((prev) => {
                          const n = { ...prev };
                          delete n.invoiceTitle;
                          return n;
                        });
                      }
                    }}
                    placeholder="请填写付款企业/机构营业执照全称"
                    className={`${inputCls} ${transferErrors.invoiceTitle ? "border-rose-400 bg-rose-50/20 focus:border-rose-500" : ""}`}
                  />
                  {transferErrors.invoiceTitle ? (
                    <p className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{transferErrors.invoiceTitle}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">请填写与打款银行账户完全一致的企业/机构对公全称。</p>
                  )}
                </div>

                {/* 税号 */}
                <div>
                  <label className={labelCls}>
                    统一社会信用代码 / 税号
                  </label>
                  <input
                    value={transferForm.taxNo}
                    onChange={(e) => {
                      setTransferForm({ ...transferForm, taxNo: e.target.value.toUpperCase() });
                      if (transferErrors.taxNo) {
                        setTransferErrors((prev) => {
                          const n = { ...prev };
                          delete n.taxNo;
                          return n;
                        });
                      }
                    }}
                    placeholder="18 位统一社会信用代码（选填）"
                    className={`${inputCls} font-mono ${transferErrors.taxNo ? "border-rose-400 bg-rose-50/20 focus:border-rose-500" : ""}`}
                  />
                  {transferErrors.taxNo ? (
                    <p className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{transferErrors.taxNo}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">选填，如后续需要开具增值税专用发票请提供。</p>
                  )}
                </div>

                {/* 开户银行 */}
                <div>
                  <label className={labelCls}>
                    打款企业开户银行
                  </label>
                  <input
                    value={transferForm.bankName}
                    onChange={(e) => setTransferForm({ ...transferForm, bankName: e.target.value })}
                    placeholder="如：中国招商银行深圳高新园支行（选填）"
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">选填，便于财务加快流水核对流程。</p>
                </div>

                {/* 银行账号 */}
                <div>
                  <label className={labelCls}>
                    打款企业银行账号
                  </label>
                  <input
                    value={transferForm.bankAccount}
                    onChange={(e) => {
                      setTransferForm({ ...transferForm, bankAccount: e.target.value });
                      if (transferErrors.bankAccount) {
                        setTransferErrors((prev) => {
                          const n = { ...prev };
                          delete n.bankAccount;
                          return n;
                        });
                      }
                    }}
                    placeholder="汇款企业的对公银行账号（选填）"
                    className={`${inputCls} font-mono ${transferErrors.bankAccount ? "border-rose-400 bg-rose-50/20 focus:border-rose-500" : ""}`}
                  />
                  {transferErrors.bankAccount ? (
                    <p className="flex items-center gap-1 text-[11px] text-rose-600 font-medium mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{transferErrors.bankAccount}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">选填，9~32 位银行账号数字。</p>
                  )}
                </div>
              </div>

              {/* 备注说明 */}
              <div>
                <label className={labelCls}>备注说明</label>
                <textarea
                  value={transferForm.remark}
                  onChange={(e) => setTransferForm({ ...transferForm, remark: e.target.value })}
                  placeholder="最多 200 字，可填写合同编号、经办人联系电话或打款补充说明"
                  rows={2}
                  maxLength={200}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none resize-none bg-white placeholder:text-slate-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">选填，已输入 {transferForm.remark.length}/200 字。</p>
              </div>

              {transferError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{transferError}</span>
                </div>
              )}

              {transferResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs font-bold text-emerald-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>充值工单已提交成功！单号：<span className="font-mono">{transferResult}</span></span>
                  </div>
                  <p className="text-emerald-700 font-normal pl-6">
                    请按照上方的对公账户完成打款，并在附言中填写此单号。管理员审核通过后将自动入账至所选空间。
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitTransfer()}
                  disabled={transferSubmitting || !transferForm.workspaceId}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {transferSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                  <span>{transferSubmitting ? "正在提交工单…" : "提交对公充值工单"}</span>
                </button>
              )}

              {transferResult && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferResult(null);
                    setTransferErrors({});
                    setTransferForm({ ...defaultTransferForm, workspaceId: selectedWorkspaceId });
                  }}
                  className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  再提交一笔充值工单
                </button>
              )}
            </div>

            {/* 工单列表及分页 */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              {/* 筛选与操作条 */}
              <div className="px-5 py-3 border-b border-slate-100 flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                    <span className="text-xs font-black text-slate-700">我的对公充值工单</span>
                    <span className="text-[11px] text-slate-400">
                      共 <strong className="font-mono text-slate-700">{transferTotal}</strong> 笔
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleExportTransfer}
                      disabled={transferBusy}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" /> 导出
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <select
                    value={transferStatusFilter}
                    onChange={(e) => handleTransferStatusChange(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                  >
                    <option value="ALL">全部状态</option>
                    <option value="PENDING">待审批</option>
                    <option value="APPROVED">待收款</option>
                    <option value="PAID">已入账</option>
                    <option value="REJECTED">已驳回</option>
                    <option value="CANCELLED">已撤销</option>
                  </select>
                  <span className="text-xs font-bold text-slate-500">开始时间</span>
                  <input
                    type="date"
                    value={transferStartDate}
                    max={transferEndDate || undefined}
                    onChange={(e) => handleTransferStartChange(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-500">结束时间</span>
                  <input
                    type="date"
                    value={transferEndDate}
                    min={transferStartDate || undefined}
                    onChange={(e) => handleTransferEndChange(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                  />
                  <button
                    onClick={handleTransferReset}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                  >
                    重置筛选
                  </button>
                </div>
              </div>

              {transferLoading ? (
                <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : transferTotal === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">暂无充值工单记录</div>
              ) : (
                <>
                  {selectedTransferIds.length > 0 && (
                    <div className="flex items-center justify-between gap-2 px-5 py-2 bg-blue-50/70 border-b border-blue-100 text-xs">
                      <span className="font-bold text-slate-600">
                        已选 {selectedTransferIds.length} 笔（仅超 3 年工单可删除）
                      </span>
                      <button
                        onClick={() => handleDeleteTransfer(selectedTransferIds)}
                        disabled={transferBusy}
                        className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 font-bold hover:bg-rose-100 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 批量删除
                      </button>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {transferOrders.map((o) => {
                      const expired = isOrderExpired3y(o.createdAt);
                      return (
                        <div key={o.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedTransferIds.includes(o.id)}
                            disabled={!expired}
                            onChange={() => toggleTransferSelect(o.id)}
                            title={expired ? "可勾选删除（超 3 年）" : "近 3 年内工单不可删除"}
                            className="w-4 h-4 accent-[#3182ce] cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-800 truncate flex items-center gap-2">
                              <span>{o.workspaceName || "工作空间"}</span>
                              {o.invoiceTitle && (
                                <span className="text-[11px] font-normal text-slate-400 truncate max-w-[200px]" title={o.invoiceTitle}>
                                  · {o.invoiceTitle}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-medium">单号 {o.orderNo}</span>
                              <span>·</span>
                              <span className="font-mono text-slate-600 font-bold">{Number(o.points).toLocaleString()} 算力点</span>
                              {o.createdAt && (
                                <>
                                  <span>·</span>
                                  <span>{new Date(o.createdAt).toLocaleDateString("zh-CN")}</span>
                                </>
                              )}
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
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <button
                              onClick={() => setTransferDetail(o)}
                              className="text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                            >
                              详情
                            </button>
                            {o.status === "PENDING" && (
                              <button
                                onClick={() => handleCancelOrder(o.id)}
                                disabled={transferBusy}
                                className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer disabled:opacity-50"
                              >
                                撤销
                              </button>
                            )}
                            {expired && (
                              <button
                                onClick={() => handleDeleteTransfer([o.id])}
                                disabled={transferBusy}
                                className="text-[11px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer disabled:opacity-50"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!transferLoading && transferTotal > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/60 border-t border-slate-100">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span>每页</span>
                    <select
                      value={transferPageSize}
                      onChange={(e) => {
                        setTransferPageSize(Number(e.target.value) || 5);
                        setTransferPage(1);
                      }}
                      className="h-7 px-2 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                    >
                      <option value={5}>5 条</option>
                      <option value={10}>10 条</option>
                      <option value={20}>20 条</option>
                      <option value={50}>50 条</option>
                    </select>
                  </label>
                  <Pagination
                    currentPage={transferPage}
                    totalItems={transferTotal}
                    pageSize={transferPageSize}
                    onPageChange={handleTransferPageChange}
                    itemLabel="笔工单"
                  />
                </div>
              )}
            </div>

            {/* 工单详情弹窗 */}
            {transferDetail && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
                onClick={() => setTransferDetail(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] p-6 flex flex-col gap-3 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <h4 className="text-base font-black text-slate-900">工单详情</h4>
                    <button onClick={() => setTransferDetail(null)} className="text-slate-400 hover:text-slate-600 font-bold">
                      关闭
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                      <span className="text-xs text-slate-500 font-bold shrink-0">工单号</span>
                      <span className="text-sm text-right font-bold text-slate-800 font-mono text-[11px]">{transferDetail.orderNo}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                      <span className="text-xs text-slate-500 font-bold shrink-0">空间</span>
                      <span className="text-sm text-right font-bold text-slate-800">{transferDetail.workspaceName || "-"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                      <span className="text-xs text-slate-500 font-bold shrink-0">充值算力点</span>
                      <span className="text-sm text-right font-bold text-[#3182ce]">{Number(transferDetail.points || 0).toLocaleString()} 算力点</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                      <span className="text-xs text-slate-500 font-bold shrink-0">应付金额</span>
                      <span className="text-sm text-right font-bold text-slate-800">¥{((Number(transferDetail.amountCents) || 0) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                      <span className="text-xs text-slate-500 font-bold shrink-0">状态</span>
                      <StatusBadge text={orderStatusLabel(transferDetail.status)} tone={orderTone(transferDetail.status)} />
                    </div>
                    {transferDetail.invoiceTitle && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">发票抬头</span>
                        <span className="text-sm text-right font-bold text-slate-800">{transferDetail.invoiceTitle}</span>
                      </div>
                    )}
                    {transferDetail.taxNo && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">税号</span>
                        <span className="text-sm text-right font-bold text-slate-800 font-mono text-[11px]">{transferDetail.taxNo}</span>
                      </div>
                    )}
                    {transferDetail.bankName && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">开户银行</span>
                        <span className="text-sm text-right font-bold text-slate-800">{transferDetail.bankName}</span>
                      </div>
                    )}
                    {transferDetail.bankAccount && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">银行账号</span>
                        <span className="text-sm text-right font-bold text-slate-800 font-mono text-[11px]">{transferDetail.bankAccount}</span>
                      </div>
                    )}
                    {transferDetail.remark && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">备注</span>
                        <span className="text-sm text-right font-bold text-slate-800">{transferDetail.remark}</span>
                      </div>
                    )}
                    {transferDetail.reviewNote && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-dashed border-slate-100">
                        <span className="text-xs text-slate-500 font-bold shrink-0">审批意见</span>
                        <span className="text-sm text-right font-bold text-slate-800">{transferDetail.reviewNote}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 py-1">
                      <span className="text-xs text-slate-500 font-bold shrink-0">创建时间</span>
                      <span className="text-sm text-right font-bold text-slate-800">
                        {transferDetail.createdAt ? new Date(transferDetail.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-"}
                      </span>
                    </div>
                  </div>
                  {transferDetail.status === "PENDING" && (
                    <div className="shrink-0 flex justify-end">
                      <button
                        onClick={() => handleCancelOrder(transferDetail.id)}
                        disabled={transferBusy}
                        className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        撤销工单
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}


        {tab === "detail" && (
          <>
            <BillingDetailHub />
            <PointsLedgerPanel />
          </>
        )}

        {tab === "orders" && (
          <div className="space-y-4">
            {/* 筛选与统计条 */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                  <span className="text-xs font-black text-slate-700">在线充值订单与流水</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  共 <strong className="font-mono text-slate-700">{ordersTotal}</strong> 笔订单
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { k: "ALL", label: "全部", n: orderSummary.total },
                  { k: "PENDING", label: "待支付", n: orderSummary.PENDING },
                  { k: "SUCCESS", label: "已到账", n: orderSummary.SUCCESS },
                  { k: "CANCELLED", label: "已取消", n: orderSummary.CANCELLED },
                  { k: "EXPIRED", label: "已超时关闭", n: orderSummary.EXPIRED },
                ].map((it) => {
                  const active = orderFilterStatus === it.k;
                  return (
                    <button
                      key={it.k}
                      type="button"
                      onClick={() => { setOrderFilterStatus(it.k); setOrdersPage(1); void loadOrders(1); }}
                      className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                        active ? "bg-[#3182ce] text-white border-[#3182ce]" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-[#3182ce]/50"
                      }`}
                    >
                      <span>{it.label}</span>
                      <span className={`font-mono ${active ? "text-white/80" : "text-slate-400"}`}>{it.n}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <select
                  value={orderFilterChannel}
                  onChange={(e) => { setOrderFilterChannel(e.target.value); setOrdersPage(1); void loadOrders(1); }}
                  className="h-9 px-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg bg-white outline-none focus:border-[#3182ce] cursor-pointer w-auto"
                >
                  <option value="ALL">全部支付通道</option>
                  <option value="WECHAT_PAY">微信支付</option>
                  <option value="ALIPAY">支付宝</option>
                </select>
                <input
                  value={orderKeyword}
                  onChange={(e) => setOrderKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setOrdersPage(1); void loadOrders(1); } }}
                  placeholder="搜索订单号 / 商品名"
                  className="h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-[#3182ce] flex-1 min-w-[180px] max-w-[260px]"
                />
                <input
                  type="date"
                  value={orderDateStart}
                  max={orderDateEnd || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOrderDateStart(v);
                    if (v && orderDateEnd && v > orderDateEnd) setOrderDateEnd("");
                    setOrdersPage(1);
                    void loadOrders(1);
                  }}
                  className="h-9 px-2.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-[#3182ce]"
                />
                <input
                  type="date"
                  value={orderDateEnd}
                  min={orderDateStart || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && orderDateStart && v < orderDateStart) return;
                    setOrderDateEnd(v);
                    setOrdersPage(1);
                    void loadOrders(1);
                  }}
                  className="h-9 px-2.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-[#3182ce]"
                />
                <button
                  type="button"
                  onClick={() => { setOrderKeyword(""); setOrderDateStart(""); setOrderDateEnd(""); setOrderFilterChannel("ALL"); setOrderFilterStatus("ALL"); setOrdersPage(1); void loadOrders(1); }}
                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                >重置筛选</button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                  <span className="text-xs font-black text-slate-700">订单明细</span>
                </div>
              </div>

              {ordersLoading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : totalOrders === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">暂无充值记录</div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[880px]">
                    {/* 表头 */}
                    <div className="grid grid-cols-[minmax(0,2.1fr)_100px_120px_90px_150px_minmax(150px,0.9fr)] gap-2 px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-400">
                      <span>商品信息</span>
                      <span className="text-right">算力点</span>
                      <span className="text-right">支付金额</span>
                      <span className="text-center">状态</span>
                      <span>下单时间</span>
                      <span className="text-right">操作</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {pagedOrders.map((r: any) => {
                        const pts = r.points ?? "";
                        const isPending = r.status === "PENDING";
                        const isSuccess = r.status === "SUCCESS" || r.status === "PAID" || r.status === "COMPLETED";
                        return (
                          <div
                            key={r.orderNo}
                            className="grid grid-cols-[minmax(0,2.1fr)_100px_120px_90px_150px_minmax(150px,0.9fr)] gap-2 px-5 py-3.5 items-center hover:bg-slate-50/50 transition-colors"
                          >
                            {/* 商品信息 */}
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-slate-800 truncate">
                                {r.title || "算力点充值"}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 min-w-0">
                                <span className="font-mono truncate" title={r.orderNo}>{r.orderNo}</span>
                                {r.workspaceName && (
                                  <><span className="text-slate-300">|</span><span className="truncate">{r.workspaceName}</span></>
                                )}
                              </div>
                            </div>

                            {/* 算力点 */}
                            <div className="text-right">
                              <span className="text-[13px] font-black font-mono text-[#3182ce] tabular-nums">
                                {pts ? `+${Number(pts).toLocaleString()}` : "—"}
                              </span>
                            </div>

                            {/* 支付金额 */}
                            <div className="text-right">
                              <div className="text-[13px] font-black text-slate-900 tabular-nums">
                                ¥{((Number(r.amountCents) || 0) / 100).toFixed(2)}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{channelLabel(r.channel)}</div>
                            </div>

                            {/* 状态 */}
                            <div className="flex justify-center">
                              <StatusBadge
                                text={statusLabel(r.status)}
                                tone={isSuccess ? "emerald" : isPending ? "amber" : r.status === "CANCELLED" ? "rose" : "slate"}
                              />
                            </div>

                            {/* 下单时间 */}
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {r.createdAt
                                ? new Date(r.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                                : "—"}
                            </div>

                            {/* 操作 */}
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => continuePay(r)}
                                    className="text-[11px] font-bold text-[#2b6cb0] bg-blue-50 hover:bg-blue-100 border border-blue-200/70 rounded px-2 py-0.5 cursor-pointer"
                                  >继续支付</button>
                                  <button
                                    type="button"
                                    disabled={cancellingOrderNo === r.orderNo}
                                    onClick={() => cancelOrder(r.orderNo)}
                                    className="text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 rounded px-2 py-0.5 cursor-pointer disabled:opacity-50"
                                  >{cancellingOrderNo === r.orderNo ? "取消中…" : "取消支付"}</button>
                                </>
                              )}
                              {isSuccess && (
                                <Link
                                  href={`/user/pay?tab=detail&orderNo=${encodeURIComponent(r.orderNo)}`}
                                  className="text-[11px] font-bold text-[#2b6cb0] bg-blue-50 hover:bg-blue-100 border border-blue-200/70 rounded px-2 py-0.5 cursor-pointer"
                                >申请开票</Link>
                              )}
                              {!isPending && !isSuccess && (
                                <span className="text-[11px] text-slate-300">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 充值订单分页控制栏 */}
              {totalOrders > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>
                      第 <strong className="font-mono font-bold text-slate-700">{safeOrdersPage}</strong> / {totalOrdersPages} 页
                    </span>
                    <span className="text-slate-300">|</span>
                    <label className="inline-flex items-center gap-1.5">
                      <span>每页</span>
                      <select
                        value={ordersPageSize}
                        onChange={(e) => {
                          setOrdersPageSize(Number(e.target.value) || 10);
                          setOrdersPage(1);
                          void loadOrders(1);
                        }}
                        className="h-7 px-2 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                      >
                        <option value={5}>5 条</option>
                        <option value={10}>10 条</option>
                        <option value={20}>20 条</option>
                        <option value={50}>50 条</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => { setOrdersPage(1); void loadOrders(1); }}
                      disabled={safeOrdersPage <= 1}
                      className="zg-btn zg-btn-default !text-xs !h-7 !px-2 disabled:opacity-40"
                    >
                      首页
                    </button>
                    <button
                      type="button"
                      onClick={() => { const p = Math.max(1, safeOrdersPage - 1); setOrdersPage(p); void loadOrders(p); }}
                      disabled={safeOrdersPage <= 1}
                      className="zg-btn zg-btn-default !text-xs !h-7 !px-2 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 font-mono font-bold text-slate-700">
                      {safeOrdersPage}
                    </span>
                    <button
                      type="button"
                      onClick={() => { const p = Math.min(totalOrdersPages, safeOrdersPage + 1); setOrdersPage(p); void loadOrders(p); }}
                      disabled={safeOrdersPage >= totalOrdersPages}
                      className="zg-btn zg-btn-default !text-xs !h-7 !px-2 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOrdersPage(totalOrdersPages); void loadOrders(totalOrdersPages); }}
                      disabled={safeOrdersPage >= totalOrdersPages}
                      className="zg-btn zg-btn-default !text-xs !h-7 !px-2 disabled:opacity-40"
                    >
                      末页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-5">
            {/* 顶部计费与权益总览横幅 */}
            <div className="zg-card p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-[#3182ce]/8 blur-3xl pointer-events-none" />
              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2.5 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/80">
                      <FileText className="w-3 h-3 text-[#3182ce]" />
                      <span>官方计费准则</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>充值算力长期有效</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                      <span>基准口径：100 算力点 = ¥1.00</span>
                    </span>
                  </div>
                  <h2 className="text-base font-black text-slate-800 tracking-tight">
                    算力点计费机制、会员折扣与多空间资产归属说明
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    平台采用透明的「预冻结 + 实扣结算」双阶段账务模型，每一笔充值、执行消耗、异常退费与对公发票均实时落库留痕，支持随时在账务中心导出核对。
                  </p>
                </div>

                {/* 当前账号权益快照 */}
                <div className="shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white p-4 sm:min-w-[260px] shadow-sm shadow-blue-500/15 border border-white/15">
                  <div className="flex items-center justify-between text-[11px] text-white/80 font-bold mb-2">
                    <span>当前账号结算权益</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                      {membershipName || "免费体验版"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-1.5 border-y border-white/15">
                    <div>
                      <div className="text-[10px] text-white/75">算力包专属折扣</div>
                      <div className="text-sm font-black mt-0.5">
                        {membershipDiscount > 0
                          ? `立减 ${membershipDiscount}%（${(10 - membershipDiscount / 10).toFixed(1).replace(/\.0$/, "")} 折）`
                          : "标准原价结算"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-white/75">当前可用算力</div>
                      <div className="text-sm font-black font-mono mt-0.5">
                        {balance == null
                          ? "—"
                          : isUnlimitedToken(balance)
                            ? "∞ 无限"
                            : `${formatTokenBalance(balance)} 点`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("recharge")}
                      className="flex-1 h-7 rounded-lg bg-white text-[#2b6cb0] hover:bg-blue-50 text-[11px] font-black transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                    >
                      <Zap className="w-3 h-3" />
                      <span>立即选购算力包</span>
                    </button>
                    <Link
                      href="/pricing"
                      className="h-7 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-all inline-flex items-center gap-1"
                    >
                      <span>升级权益</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 三大核心规则 Bento 矩阵 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 卡片 1：算力点怎么计（知性蓝主题） */}
              <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between group hover:border-[#3182ce]/50 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#3182ce]/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] border border-blue-200/60 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800">算力点怎么计</h3>
                        <p className="text-[11px] text-slate-400 font-medium">余额制 · 按实耗扣减</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#2b6cb0] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60 shrink-0">
                      随用随扣
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3.5">
                    算力点为余额制，充值或购买算力包后实时到账、随用随扣，不参与任何会员等级的月度自动发放与重置。执行组件时按所选模型的实际消耗实时扣减。
                  </p>

                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                      <span>任务启动预冻结押金，完成后按实际消耗多退少补</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                      <span>充值算力长期有效，系统优先抵扣临期赠送算力点</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                      <span>执行异常或结果不可用时，支持在算力页申请退回</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">笔笔流水可追溯</span>
                  <Link
                    href="/user/points"
                    className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>查看我的算力流水</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* 卡片 2：会员折扣（辅助橙主题） */}
              <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between group hover:border-amber-300 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#dd6b20] border border-amber-200/60 flex items-center justify-center shrink-0">
                        <Coins className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800">会员折扣权益</h3>
                        <p className="text-[11px] text-slate-400 font-medium">等级越高 · 购包越省</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 shrink-0">
                      自动抵扣
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3.5">
                    升级会员后购买算力包可享专属折扣（不同等级折扣不同），折扣在结算时自动计入应付金额，无需手动领券。
                  </p>

                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#dd6b20] shrink-0 mt-0.5" />
                      <span>
                        当前状态：
                        <strong className="text-slate-800 ml-0.5">
                          {membershipName || "免费体验版"}
                        </strong>
                        {membershipDiscount > 0 ? (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold">
                            立减 {membershipDiscount}%
                          </span>
                        ) : (
                          <span className="text-slate-400 ml-1">（升级即享购包折扣）</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#dd6b20] shrink-0 mt-0.5" />
                      <span>算力包阶梯规格越大，折合每百万点单价越划算</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#dd6b20] shrink-0 mt-0.5" />
                      <span>实付金额可直接按折后总额申请增值税电子发票</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">支持随时升级等级</span>
                  <Link
                    href="/pricing"
                    className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>对比各等级折扣</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* 卡片 3：归属与共享（辅助绿主题） */}
              <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between group hover:border-emerald-300 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#38a169] border border-emerald-200/60 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800">归属与共享机制</h3>
                        <p className="text-[11px] text-slate-400 font-medium">公私分明 · 团队协同</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 shrink-0">
                      账户隔离
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3.5">
                    个人空间充值进入跨空间通用的个人钱包；企业空间充值进入该企业共享池，供该企业空间内全体成员协同共用。
                  </p>

                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#38a169] shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-slate-800">个人通用钱包：</strong>
                        本人名下个人空间共享，资产归属个人账号
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#38a169] shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-slate-800">企业空间共享池：</strong>
                        企业空间独立核算，成员执行任务自动扣减池内余额
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#38a169] shrink-0 mt-0.5" />
                      <span>
                        当前可管理空间：<strong className="text-slate-800 font-mono">{workspaces.length}</strong> 个（仅所有者/管理员可充值）
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">支持对公汇款入池</span>
                  <button
                    type="button"
                    onClick={() => setTab("transfer")}
                    className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                  >
                    <span>办理企业对公充值</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* 底部全流程充值与开票闭环指引卡片 */}
            <div className="zg-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                  <h3 className="text-sm font-black text-slate-800">充值结算与票据服务闭环流程</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  在线直充实时入账 · 对公汇款工单审批 · 增值税普票/专票在线申领
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                      STEP 01
                    </span>
                    <Wallet className="w-4 h-4 text-[#3182ce]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">选择归属空间与规格</div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      指定充入「个人钱包」或「企业共享池」，自动匹配当前会员折扣。
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                      STEP 02
                    </span>
                    <CreditCard className="w-4 h-4 text-[#3182ce]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">在线支付或对公汇款</div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      支持微信/支付宝即时结算，企业大额采购可提交对公转账工单。
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      STEP 03
                    </span>
                    <Zap className="w-4 h-4 text-[#38a169]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">算力入账与实耗扣减</div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      到账后即可用于组件执行与工作流调用，每笔变动均生成流水明细。
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
                      STEP 04
                    </span>
                    <ReceiptText className="w-4 h-4 text-[#dd6b20]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">申请发票与对账归档</div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      凭充值订单号在线申领增值税电子普票或专票，支持导出 Excel 对账。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTab("recharge")}
                    className="zg-btn zg-btn-primary text-xs h-8 px-3.5 gap-1.5 font-bold"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>前往充值算力点</span>
                  </button>
                  <Link
                    href="/user/billing-center"
                    className="zg-btn !bg-blue-50/90 hover:!bg-blue-100/80 !text-[#2b6cb0] !border-blue-200/80 text-xs h-8 px-3.5 gap-1.5 font-bold inline-flex items-center"
                  >
                    <ReceiptText className="w-3.5 h-3.5" />
                    <span>在线申请开票</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTab("orders")}
                    className="zg-btn zg-btn-default text-xs h-8 px-3.5 gap-1.5 font-bold"
                  >
                    <Receipt className="w-3.5 h-3.5 text-slate-500" />
                    <span>查看充值记录</span>
                  </button>
                </div>
                <Link
                  href="/user/billing-center"
                  className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline inline-flex items-center gap-1"
                >
                  <span>前往套餐与计费中心</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
