"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Receipt,
  CheckCircle2,
  Download,
  Calendar,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  Info,
  Clock,
  HelpCircle,
  Building,
  User,
  FileCheck2,
  ShieldCheck,
  Zap,
  Layers,
  Crown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { exportToExcel } from "@/utils/excel-export";
import { getAuthToken } from "@/utils/auth";
// 账单/算力点流水枚举中文一律来自数据库字典（system_config.billing_display_dict），前端不内置
import { setBillingDicts, lookupBillingValueLabel } from "@/lib/billing-display-dict";

interface BillingRecord {
  id: string;
  type: string;
  title: string;
  amount: string;
  amountCents?: number;
  status: "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED" | string;
  date: string;
  invoicedCount?: number;
  maxInvoices?: number;
  canInvoice?: boolean;
}

interface InvoiceRecordItem {
  id: string;
  title: string;
  buyerType?: "PERSONAL" | "ENTERPRISE";
  taxNo: string | null;
  email: string | null;
  phone?: string | null;
  idCard?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  address?: string | null;
  tel?: string | null;
  invoiceType: "PLAIN" | "VAT" | string;
  goodsName?: string;
  orderNo: string | null;
  invoiceSequence?: number;
  remark: string | null;
  amountCents: number;
  status: "PENDING" | "COMPLETED" | "REJECTED" | string;
  invoiceUrl: string | null;
  createdAt: string;
}

/** 账单日期格式化（与账单接口返回的 ISO 时间一致；中文展示用） */
function formatBillingDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 消费类型展示元信息（与 billing_record.type 枚举保持一致；中文标签来自数据库字典，仅配色留前端） */
const CONSUMPTION_TYPE_BADGE: Record<string, string> = {
  TOKEN_RECHARGE: "bg-amber-50 text-amber-600 border-amber-200",
  PLAN_UPGRADE: "bg-blue-50 text-[#2b6cb0] border-blue-200",
  MEMBERSHIP: "bg-purple-50 text-purple-600 border-purple-200",
  REFUND: "bg-rose-50 text-rose-600 border-rose-200",
};

function getConsumptionTypeMeta(type: string): { label: string; badge: string } {
  return {
    label: lookupBillingValueLabel(type) || type || "其他",
    badge: CONSUMPTION_TYPE_BADGE[type] || "bg-slate-50 text-slate-500 border-slate-200",
  };
}

const CONSUMPTION_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  TOKEN_RECHARGE: Zap,
  PLAN_UPGRADE: Layers,
  MEMBERSHIP: Crown,
  REFUND: RefreshCw,
};

function getConsumptionTypeIcon(type: string): React.ComponentType<any> {
  return CONSUMPTION_TYPE_ICONS[type] || Layers;
}

/** 账单状态展示元信息（与 billing_record.status 枚举保持一致；中文标签来自数据库字典，仅配色留前端） */
const BILLING_STATUS_BADGE: Record<string, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-600 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-600 border-amber-200",
  FAILED: "bg-rose-50 text-rose-600 border-rose-200",
  REFUNDED: "bg-slate-100 text-slate-500 border-slate-200",
  EXPIRED: "bg-slate-100 text-slate-400 border-slate-200",
  CANCELLED: "bg-rose-50 text-rose-600 border-rose-200",
};

/** 状态中文兜底：数据库字典未收录的状态（如 CANCELLED）也能显示中文，而非英文原始值 */
const BILLING_STATUS_LABELS: Record<string, string> = {
  SUCCESS: "已到账",
  PENDING: "待支付",
  FAILED: "支付失败",
  REFUNDED: "已退款",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
};

function getBillingStatusMeta(status: string): { label: string; badge: string } {
  return {
    label: lookupBillingValueLabel(status) || BILLING_STATUS_LABELS[status] || status || "未知",
    badge: BILLING_STATUS_BADGE[status] || "bg-slate-50 text-slate-500 border-slate-200",
  };
}

export default function BillingDetailHub() {
  const toast = useToast();

  const [userInfo, setUserInfo] = useState<any>(null);

  // 账单明细主视图 Tab 切换（“账单与交易历史” / “发票申请与开具记录”）
  const [activeDetailTab, setActiveDetailTab] = useState<"bills" | "invoices">("bills");

  // 账单与交易流水状态（支持完整服务端分页与多维度筛选）
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [billingPage, setBillingPage] = useState(1);
  const [billingPageSize, setBillingPageSize] = useState(10);
  const [billingTotal, setBillingTotal] = useState(0);
  const [billingTotalPages, setBillingTotalPages] = useState(1);
  const [billingStartDate, setBillingStartDate] = useState("");
  const [billingEndDate, setBillingEndDate] = useState("");
  const [billingTypeFilter, setBillingTypeFilter] = useState("ALL");
  const [billingStatusFilter, setBillingStatusFilter] = useState("ALL");
  const [loadingBills, setLoadingBills] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // 电子发票申请记录列表（改为页面内完整数据列表，支持服务端分页与筛选）
  const [invoiceRecords, setInvoiceRecords] = useState<InvoiceRecordItem[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceStartDate, setInvoiceStartDate] = useState("");
  const [invoiceEndDate, setInvoiceEndDate] = useState("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("ALL");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("ALL");
  const [loadingInvoiceRecords, setLoadingInvoiceRecords] = useState(false);

  // 计费与开票规则弹窗
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // 电子发票申请弹窗控制与表单状态
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  const [invoiceBuyerType, setInvoiceBuyerType] = useState<"PERSONAL" | "ENTERPRISE">("ENTERPRISE");
  const [invoiceVatType, setInvoiceVatType] = useState<"PLAIN" | "VAT">("PLAIN");

  const [selectedOrderNo, setSelectedOrderNo] = useState<string>("");
  const [selectedOrderAmountCents, setSelectedOrderAmountCents] = useState<number>(0);
  const [selectedOrderInvoicedCount, setSelectedOrderInvoicedCount] = useState<number>(0);

  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [invoiceTaxNo, setInvoiceTaxNo] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoicePhone, setInvoicePhone] = useState("");
  const [invoiceIdCard, setInvoiceIdCard] = useState("");
  const [invoiceBankName, setInvoiceBankName] = useState("");
  const [invoiceBankAccount, setInvoiceBankAccount] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [invoiceTel, setInvoiceTel] = useState("");
  const [invoiceRemark, setInvoiceRemark] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // 加载账单显示字典（来源：数据库 system_config.billing_display_dict，经 /api/user/billing-dict 下发）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/user/billing-dict", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && d.success && d.data) setBillingDicts(d.data);
      } catch {
        /* 字典缺失时回退原始枚举值展示，绝不阻塞主流程 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载当前登录用户信息（仅用于开票弹窗默认填入邮箱/手机）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/auth/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const u = await res.json();
          if (!cancelled) setUserInfo(u.user || null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 拉取账单流水（数据库 billing_record 表）：支持真实服务端分页、时间筛选、类型筛选、状态筛选 */
  const loadBillingRecords = useCallback(
    async (
      targetPage = billingPage,
      targetPageSize = billingPageSize,
      sDate = billingStartDate,
      eDate = billingEndDate,
      tFilter = billingTypeFilter,
      statFilter = billingStatusFilter
    ) => {
      try {
        setLoadingBills(true);
        const authToken = getAuthToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(targetPageSize),
          type: tFilter || "ALL",
          status: statFilter || "ALL",
        });
        if (sDate) params.set("startDate", sDate);
        if (eDate) params.set("endDate", eDate);

        const billRes = await fetch(`/api/billing/records?${params.toString()}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (billRes.ok) {
          const bData = await billRes.json();
          if (bData.success && Array.isArray(bData.data)) {
            const mapped: BillingRecord[] = bData.data.map((r: any) => ({
              id: r.id,
              type: r.type,
              title: r.title,
              amount: `¥ ${((Number(r.amount) || 0) / 100).toFixed(2)}`,
              amountCents: Number(r.amount) || 0,
              status: r.status,
              date: formatBillingDate(r.date ?? r.createdAt),
              invoicedCount: Number(r.invoicedCount ?? 0),
              maxInvoices: Number(r.maxInvoices ?? 2),
              canInvoice: r.canInvoice ?? (Number(r.invoicedCount ?? 0) < 2),
            }));
            setBillingHistory(mapped);
            setBillingTotal(Number(bData.total ?? mapped.length));
            setBillingTotalPages(Number(bData.totalPages ?? 1));
            setBillingPage(Number(bData.page ?? targetPage));
            setBillingError(null);
            return;
          }
          setBillingError(bData.error || "账单服务返回异常");
        } else {
          setBillingError(`账单接口返回 HTTP ${billRes.status}`);
        }
      } catch (err) {
        console.error("加载账单流水失败:", err);
        setBillingError("网络异常，无法连接到账单服务");
      } finally {
        setLoadingBills(false);
      }
    },
    [billingPage, billingPageSize, billingStartDate, billingEndDate, billingTypeFilter, billingStatusFilter, toast]
  );

  /** 加载电子发票申请记录（从 /api/user/invoice/apply 拉取当前用户真实数据，支持分页与时间/状态筛选） */
  const loadInvoiceRecords = useCallback(
    async (
      targetPage = invoicePage,
      targetLimit = invoicePageSize,
      sDate = invoiceStartDate,
      eDate = invoiceEndDate,
      tFilter = invoiceTypeFilter,
      statFilter = invoiceStatusFilter
    ) => {
      if (sDate && eDate && sDate > eDate) {
        toast.warning("发票筛选时间不合法：结束日期不能早于开始日期");
        return;
      }
      try {
        setLoadingInvoiceRecords(true);
        const authToken = getAuthToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(targetLimit),
        });
        if (sDate) params.set("startDate", sDate);
        if (eDate) params.set("endDate", eDate);
        if (tFilter && tFilter !== "ALL") params.set("invoiceType", tFilter);
        if (statFilter && statFilter !== "ALL") params.set("status", statFilter);

        const res = await fetch(`/api/user/invoice/apply?${params.toString()}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.applies)) {
            setInvoiceRecords(data.applies);
            setInvoiceTotal(Number(data.total ?? data.applies.length));
            setInvoiceTotalPages(Number(data.totalPages ?? 1));
            setInvoicePage(Number(data.page ?? targetPage));
          }
        }
      } catch (e) {
        console.warn("加载发票申请记录失败:", e);
      } finally {
        setLoadingInvoiceRecords(false);
      }
    },
    [invoicePage, invoicePageSize, invoiceStartDate, invoiceEndDate, invoiceTypeFilter, invoiceStatusFilter, toast]
  );

  /** 账单时间筛选与查询动作防护 */
  const handleBillingStartDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val && billingEndDate && val > billingEndDate) {
        toast.warning("开始日期不能晚于结束日期，已自动为您重置结束日期");
        setBillingStartDate(val);
        setBillingEndDate("");
        void loadBillingRecords(1, billingPageSize, val, "");
        return;
      }
      setBillingStartDate(val);
      void loadBillingRecords(1, billingPageSize, val, billingEndDate);
    },
    [billingEndDate, billingPageSize, loadBillingRecords, toast]
  );

  const handleBillingEndDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val && billingStartDate && val < billingStartDate) {
        toast.warning("结束日期不能早于开始日期，请重新选择");
        return;
      }
      setBillingEndDate(val);
      void loadBillingRecords(1, billingPageSize, billingStartDate, val);
    },
    [billingStartDate, billingPageSize, loadBillingRecords, toast]
  );

  const handleSearchBills = useCallback(() => {
    if (billingStartDate && billingEndDate && billingStartDate > billingEndDate) {
      toast.warning("查询失败：结束日期不能早于开始日期");
      return;
    }
    void loadBillingRecords(1, billingPageSize);
  }, [billingStartDate, billingEndDate, billingPageSize, loadBillingRecords, toast]);

  const handleResetBills = useCallback(() => {
    setBillingStartDate("");
    setBillingEndDate("");
    setBillingTypeFilter("ALL");
    setBillingStatusFilter("ALL");
    void loadBillingRecords(1, billingPageSize, "", "", "ALL", "ALL");
  }, [billingPageSize, loadBillingRecords]);

  /** 电子发票时间筛选与查询动作防护 */
  const handleInvoiceStartDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val && invoiceEndDate && val > invoiceEndDate) {
        toast.warning("开始日期不能晚于结束日期，已自动为您重置结束日期");
        setInvoiceStartDate(val);
        setInvoiceEndDate("");
        void loadInvoiceRecords(1, invoicePageSize, val, "");
        return;
      }
      setInvoiceStartDate(val);
      void loadInvoiceRecords(1, invoicePageSize, val, invoiceEndDate);
    },
    [invoiceEndDate, invoicePageSize, loadInvoiceRecords, toast]
  );

  const handleInvoiceEndDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val && invoiceStartDate && val < invoiceStartDate) {
        toast.warning("结束日期不能早于开始日期，请重新选择");
        return;
      }
      setInvoiceEndDate(val);
      void loadInvoiceRecords(1, invoicePageSize, invoiceStartDate, val);
    },
    [invoiceStartDate, invoicePageSize, loadInvoiceRecords, toast]
  );

  const handleSearchInvoices = useCallback(() => {
    if (invoiceStartDate && invoiceEndDate && invoiceStartDate > invoiceEndDate) {
      toast.warning("查询失败：结束日期不能早于开始日期");
      return;
    }
    void loadInvoiceRecords(1, invoicePageSize);
  }, [invoiceStartDate, invoiceEndDate, invoicePageSize, loadInvoiceRecords, toast]);

  const handleResetInvoices = useCallback(() => {
    setInvoiceStartDate("");
    setInvoiceEndDate("");
    setInvoiceTypeFilter("ALL");
    setInvoiceStatusFilter("ALL");
    void loadInvoiceRecords(1, invoicePageSize, "", "", "ALL", "ALL");
  }, [invoicePageSize, loadInvoiceRecords]);

  // 交易对账单导出（标准 Excel 格式，含表头信息区/样式/导出留痕）
  const handleDownloadInvoice = async (invId: string) => {
    const inv = billingHistory.find((b) => b.id === invId);
    if (!inv) {
      toast.error("未找到该笔交易记录，无法导出对账单");
      return;
    }
    try {
      await exportToExcel({
        filename: "交易对账单",
        sheetName: "交易对账单",
        title: "知阁·舟坊 交易对账单",
        columns: [
          { header: "账单流水号", key: "id", width: 34 },
          { header: "消费类型", key: "type", formatter: (v: string) => getConsumptionTypeMeta(v).label, width: 14 },
          { header: "描述说明", key: "title", width: 34 },
          { header: "交易金额（元）", formatter: (_v: any, row: BillingRecord) => (Number(row.amountCents) || 0) / 100, width: 15 },
          { header: "支付状态", key: "status", formatter: (v: string) => getBillingStatusMeta(v).label, width: 12 },
          {
            header: "开票进度",
            formatter: (_v: any, row: BillingRecord) =>
              row.status === "SUCCESS" ? `已开 ${row.invoicedCount ?? 0} 次（限 2 次）` : "—",
            width: 20,
          },
          { header: "交易时间", key: "date", width: 22 },
        ],
        data: [inv],
        trace: { exportType: "交易对账单", rowCount: 1, page: "/user/pay", filters: { orderNo: inv.id } },
      });
      toast.success("对账单已导出（Excel 格式）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "对账单导出失败，请稍后重试");
    }
  };

  /** 打开开票弹窗：支持绑定某笔订单或自由申请 */
  const handleOpenInvoiceModal = (order?: BillingRecord) => {
    setFieldErrors({});
    if (order) {
      setSelectedOrderNo(order.id);
      setSelectedOrderAmountCents(
        order.amountCents || Math.round(parseFloat(order.amount.replace(/[^0-9.]/g, "") || "0") * 100)
      );
      setSelectedOrderInvoicedCount(order.invoicedCount ?? 0);
    } else {
      setSelectedOrderNo("");
      setSelectedOrderAmountCents(0);
      setSelectedOrderInvoicedCount(0);
    }
    if (!invoiceEmail && userInfo?.email) {
      setInvoiceEmail(userInfo.email);
    }
    if (!invoicePhone && userInfo?.phone) {
      setInvoicePhone(userInfo.phone);
    }
    setIsInvoiceModalOpen(true);
  };

  /** 提交开票申请 */
  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (selectedOrderNo && selectedOrderInvoicedCount >= 2) {
      errors.orderNo = "该笔交易已达到 2 次开票上限，根据税务合规制度不可再次申请开票";
    }
    if (!invoiceTitle.trim()) {
      errors.title = "请输入发票抬头名称";
    } else if (invoiceTitle.trim().length < 2) {
      errors.title = "发票抬头至少需要 2 个字符";
    }
    if (!invoiceEmail.trim()) {
      errors.email = "请输入接收电子发票的邮箱";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail.trim())) {
      errors.email = "请输入格式正确的电子邮箱（如 service@company.com）";
    }
    if (!invoicePhone.trim()) {
      errors.phone = "请输入接收联系人手机号码";
    } else if (!/^1[3-9]\d{9}$/.test(invoicePhone.trim())) {
      errors.phone = "请输入标准 11 位手机号码（如 13800138000）";
    }
    if (invoiceBuyerType === "ENTERPRISE") {
      if (!invoiceTaxNo.trim()) {
        errors.taxNo = "企业开票必须填写纳税人识别号/统一社会信用代码";
      } else if (!/^[0-9A-HJ-NPQRTUWXY]{15,20}$/i.test(invoiceTaxNo.trim())) {
        errors.taxNo = "纳税人识别号格式不正确（应为 15~20 位大写字母与数字组合）";
      }
      if (invoiceVatType === "VAT") {
        if (!invoiceBankName.trim()) errors.bankName = "专用发票必须填写基本开户银行名称";
        if (!invoiceBankAccount.trim()) errors.bankAccount = "专用发票必须填写企业银行账号";
        else if (!/^\d{8,30}$/.test(invoiceBankAccount.trim().replace(/\s+/g, ""))) {
          errors.bankAccount = "银行账号格式不正确（应为 8~30 位纯数字）";
        }
        if (!invoiceAddress.trim()) errors.address = "专用发票必须填写企业注册详细地址";
        if (!invoiceTel.trim()) errors.tel = "专用发票必须填写企业注册固定电话";
      }
    } else {
      if (invoiceIdCard.trim() && !/(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(invoiceIdCard.trim())) {
        errors.idCard = "身份证号格式不合规，若无需报税可留空";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.warning("表单填写有误，请根据红字提示核对修正后重新提交");
      return;
    }
    setFieldErrors({});

    try {
      setSubmittingInvoice(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/user/invoice/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          orderNo: selectedOrderNo || undefined,
          buyerType: invoiceBuyerType,
          title: invoiceTitle.trim(),
          taxNo: invoiceBuyerType === "ENTERPRISE" ? invoiceTaxNo.trim() : undefined,
          amountCents: selectedOrderAmountCents > 0 ? selectedOrderAmountCents : undefined,
          email: invoiceEmail.trim(),
          phone: invoicePhone.trim(),
          idCard: invoiceBuyerType === "PERSONAL" && invoiceIdCard.trim() ? invoiceIdCard.trim() : undefined,
          bankName: invoiceBuyerType === "ENTERPRISE" && invoiceVatType === "VAT" ? invoiceBankName.trim() : undefined,
          bankAccount: invoiceBuyerType === "ENTERPRISE" && invoiceVatType === "VAT" ? invoiceBankAccount.trim() : undefined,
          address: invoiceBuyerType === "ENTERPRISE" && invoiceVatType === "VAT" ? invoiceAddress.trim() : undefined,
          tel: invoiceBuyerType === "ENTERPRISE" && invoiceVatType === "VAT" ? invoiceTel.trim() : undefined,
          type: invoiceBuyerType === "ENTERPRISE" ? invoiceVatType : "PLAIN",
          remark: invoiceRemark.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(data.message || "发票申请已提交，财务核对后将为您开具电子发票！");
        setIsInvoiceModalOpen(false);
        setInvoiceTitle("");
        setInvoiceTaxNo("");
        setInvoiceBankName("");
        setInvoiceBankAccount("");
        setInvoiceAddress("");
        setInvoiceTel("");
        setInvoiceRemark("");
        setSelectedOrderNo("");
        setSelectedOrderAmountCents(0);
        await Promise.all([
          loadInvoiceRecords(1, invoicePageSize),
          loadBillingRecords(1, billingPageSize),
        ]);
        setActiveDetailTab("invoices");
        setTimeout(() => {
          document.getElementById("billing-detail-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } else {
        toast.error(data.error || "提交发票申请失败，请稍后重试");
      }
    } catch (err) {
      console.error("提交发票申请失败:", err);
      toast.error("网络提交失败，请检查网络连接");
    } finally {
      setSubmittingInvoice(false);
    }
  };

  // 充值流程闭环：从收银台携带 ?orderNo= 跳转过来时，自动定位该笔交易并预填开票申请
  const pendingInvoiceOrderNoRef = useRef<string>("");
  const invoiceAutoOpenedRef = useRef(false);
  const openInvoiceModalRef = useRef<((o?: any) => void) | null>(null);
  useEffect(() => {
    if (!pendingInvoiceOrderNoRef.current) {
      try {
        pendingInvoiceOrderNoRef.current = new URLSearchParams(window.location.search).get("orderNo") || "";
      } catch {
        /* ignore */
      }
    }
    const target = pendingInvoiceOrderNoRef.current;
    if (!target || invoiceAutoOpenedRef.current) return;
    const rec = billingHistory.find((r) => r.id === target && r.type === "TOKEN_RECHARGE");
    if (rec && openInvoiceModalRef.current) {
      invoiceAutoOpenedRef.current = true;
      openInvoiceModalRef.current(rec);
    }
  }, [billingHistory]);
  openInvoiceModalRef.current = handleOpenInvoiceModal;

  // 首次加载账单与发票数据
  useEffect(() => {
    void loadBillingRecords(1, billingPageSize);
    void loadInvoiceRecords(1, invoicePageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="billing-detail-section" className="scroll-mt-20 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full" />
        <h2 className="text-sm font-bold text-slate-800">企业发票与账单明细</h2>
      </div>

      {/* 增值税电子发票申请专用服务卡片 */}
      <div className="zg-card p-4.5 bg-gradient-to-r from-white via-blue-50/20 to-slate-50/50 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-2xs">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h3 className="text-sm font-bold text-slate-800">增值税电子普通 / 专用发票</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                支持专票 / 普票
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2b6cb0] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                每笔订单至多开票 2 次
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              支持按个人或企业抬头一键开具电子发票，合规报销入账；历史开票记录已直接下沉至数据列表，支持完整时间筛选与分页查询。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setIsRuleModalOpen(true)}
            className="text-xs font-bold text-slate-500 hover:text-[#3182ce] transition-colors cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>计费与开票规则</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenInvoiceModal()}
            className="zg-btn zg-btn-primary text-xs h-8.5 px-3.5 gap-1.5 font-bold shadow-xs cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>在线申请开票</span>
          </button>
        </div>
      </div>

      {/* 账单流水与发票记录双 Tab 数据列表卡片 */}
      <div className="zg-card p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/70 gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setActiveDetailTab("bills")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeDetailTab === "bills" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>账单与交易历史</span>
              {billingTotal > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold">
                  {billingTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveDetailTab("invoices");
                void loadInvoiceRecords(1, invoicePageSize);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeDetailTab === "invoices" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>发票申请与开具记录</span>
              {invoiceTotal > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 text-[#3182ce] font-bold">
                  {invoiceTotal}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => {
                if (activeDetailTab === "bills") {
                  void loadBillingRecords(1, billingPageSize);
                } else {
                  void loadInvoiceRecords(1, invoicePageSize);
                }
              }}
              disabled={activeDetailTab === "bills" ? loadingBills : loadingInvoiceRecords}
              className="zg-btn zg-btn-default text-xs h-8 px-3 gap-1.5 font-bold cursor-pointer"
              title="刷新当前列表数据"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-500 ${
                  (activeDetailTab === "bills" ? loadingBills : loadingInvoiceRecords) ? "animate-spin" : ""
                }`}
              />
              <span>{(activeDetailTab === "bills" ? loadingBills : loadingInvoiceRecords) ? "加载中…" : "刷新"}</span>
            </button>
          </div>
        </div>

        {/* VIEW 1: 账单与交易历史 */}
        {activeDetailTab === "bills" && (
          <>
            <div className="p-3 sm:p-3.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 shrink-0 bg-white px-2.5 py-1 rounded-md border border-slate-200/90 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-600 font-bold shrink-0 text-xs">交易时间</span>
                  <input
                    type="date"
                    max={billingEndDate || undefined}
                    value={billingStartDate}
                    onChange={handleBillingStartDateChange}
                    className="text-xs !h-6 !py-0 !px-1.5 !w-[116px] shrink-0 text-slate-700 font-medium bg-slate-50/70 border border-slate-200/80 rounded cursor-pointer hover:bg-white focus:bg-white focus:border-[#3182ce] focus:outline-none transition-colors"
                    title="交易开始时间（不可晚于结束时间）"
                  />
                  <span className="text-slate-400 font-bold shrink-0 text-[11px]">至</span>
                  <input
                    type="date"
                    min={billingStartDate || undefined}
                    value={billingEndDate}
                    onChange={handleBillingEndDateChange}
                    className="text-xs !h-6 !py-0 !px-1.5 !w-[116px] shrink-0 text-slate-700 font-medium bg-slate-50/70 border border-slate-200/80 rounded cursor-pointer hover:bg-white focus:bg-white focus:border-[#3182ce] focus:outline-none transition-colors"
                    title="交易结束时间（不可早于开始时间）"
                  />
                  {(billingStartDate || billingEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setBillingStartDate("");
                        setBillingEndDate("");
                        void loadBillingRecords(1, billingPageSize, "", "", billingTypeFilter, billingStatusFilter);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition-colors"
                      title="清空已选时间"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                <select
                  value={billingTypeFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBillingTypeFilter(val);
                    void loadBillingRecords(1, billingPageSize, billingStartDate, billingEndDate, val, billingStatusFilter);
                  }}
                  className="zg-input text-xs !h-8 !py-1 !px-2.5 !w-auto min-w-[125px] shrink-0 text-slate-700 font-medium cursor-pointer bg-white border-slate-200/90 shadow-2xs"
                >
                  <option value="ALL">全部消费类型</option>
                  <option value="TOKEN_RECHARGE">{lookupBillingValueLabel("TOKEN_RECHARGE") || "算力点充值"}</option>
                  <option value="PLAN_UPGRADE">{lookupBillingValueLabel("PLAN_UPGRADE") || "空间扩容"}</option>
                  <option value="MEMBERSHIP">{lookupBillingValueLabel("MEMBERSHIP") || "会员订阅"}</option>
                  <option value="REFUND">{lookupBillingValueLabel("REFUND") || "退款冲正"}</option>
                </select>

                <select
                  value={billingStatusFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBillingStatusFilter(val);
                    void loadBillingRecords(1, billingPageSize, billingStartDate, billingEndDate, billingTypeFilter, val);
                  }}
                  className="zg-input text-xs !h-8 !py-1 !px-2.5 !w-auto min-w-[110px] shrink-0 text-slate-700 font-medium cursor-pointer bg-white border-slate-200/90 shadow-2xs"
                >
                  <option value="ALL">全部状态</option>
                  <option value="SUCCESS">{lookupBillingValueLabel("SUCCESS") || BILLING_STATUS_LABELS.SUCCESS}</option>
                  <option value="PENDING">{lookupBillingValueLabel("PENDING") || BILLING_STATUS_LABELS.PENDING}</option>
                  <option value="FAILED">{lookupBillingValueLabel("FAILED") || BILLING_STATUS_LABELS.FAILED}</option>
                  <option value="REFUNDED">{lookupBillingValueLabel("REFUNDED") || BILLING_STATUS_LABELS.REFUNDED}</option>
                  <option value="CANCELLED">{lookupBillingValueLabel("CANCELLED") || BILLING_STATUS_LABELS.CANCELLED}</option>
                </select>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSearchBills}
                    className="zg-btn zg-btn-primary !h-8 !px-3.5 !text-xs font-bold gap-1 cursor-pointer shadow-xs shrink-0"
                    title="查询符合条件的账单"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>查询</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetBills}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 cursor-pointer shrink-0"
                    title="清空所有筛选条件"
                  >
                    重置筛选
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-medium shrink-0 ml-auto whitespace-nowrap">
                共检索到 <strong className="text-slate-700 font-mono font-bold">{billingTotal}</strong> 笔交易明细
              </div>
            </div>

            {billingError && (
              <div className="m-4 p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="text-red-700 font-bold">账单接口加载失败：{billingError}</div>
                </div>
                <button
                  type="button"
                  onClick={() => loadBillingRecords(billingPage, billingPageSize)}
                  className="zg-btn zg-btn-default text-xs h-7 px-2.5 text-red-600 border-red-200"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>重试</span>
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs table-auto min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4 whitespace-nowrap">账单流水号</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">消费类型</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">描述说明</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">交易金额</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">交易时间</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">支付状态</th>
                    <th className="py-3.5 px-4 whitespace-nowrap" title="平台合规制度：每笔交易最多可开票 2 次">
                      发票开具进度 (限 2 次)
                    </th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap sticky right-0 bg-slate-100 z-10">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {loadingBills ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-6 h-6 text-[#3182ce] animate-spin" />
                          <p className="font-bold text-slate-600">正在拉取账单数据…</p>
                        </div>
                      </td>
                    </tr>
                  ) : billingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <Receipt className="w-7 h-7 text-slate-300" />
                          <p className="font-bold text-slate-600">暂无符合条件的交易记录</p>
                          <p className="text-[11px] text-slate-400">完成会员订阅、空间扩容或算力充值后将在此展示明细</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    billingHistory.map((rec) => {
                      const TypeIcon = getConsumptionTypeIcon(rec.type);
                      const count = rec.invoicedCount ?? 0;
                      const isSuccess = rec.status === "SUCCESS";
                      const canApply = isSuccess && (rec.canInvoice ?? count < 2);

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-800 font-bold whitespace-nowrap">{rec.id}</td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${getConsumptionTypeMeta(rec.type).badge}`}
                            >
                              <TypeIcon className="w-3 h-3 shrink-0" />
                              <span>{getConsumptionTypeMeta(rec.type).label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold max-w-[240px] truncate" title={rec.title}>
                            {rec.title}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 whitespace-nowrap">{rec.amount}</td>
                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">{rec.date}</td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${getBillingStatusMeta(rec.status).badge}`}>
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>{getBillingStatusMeta(rec.status).label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {rec.status === "SUCCESS" ? (
                              count === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  未开票 (0/2)
                                </span>
                              ) : count === 1 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  已开 1 次 (剩余 1 次)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                                  已达上限 (2/2)
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2.5 sticky right-0 bg-white">
                            <button
                              type="button"
                              onClick={() => handleDownloadInvoice(rec.id)}
                              className="text-[#3182ce] hover:text-[#2b6cb0] font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                              title="导出标准 Excel 对账单"
                            >
                              <Download className="w-3 h-3 shrink-0" />
                              <span>对账单</span>
                            </button>
                            {canApply && (
                              <button
                                type="button"
                                onClick={() => handleOpenInvoiceModal(rec)}
                                className="text-emerald-600 hover:text-emerald-700 font-bold text-xs cursor-pointer inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                                title={count === 1 ? "该订单已开票 1 次，支持最后 1 次开票申请" : "申请开具电子发票"}
                              >
                                <Receipt className="w-3 h-3" />
                                <span>{count === 1 ? "二次开票" : "申请开票"}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {billingTotal > 0 && (
              <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-slate-500 font-medium shrink-0 whitespace-nowrap">
                  <span>
                    共 <strong className="text-slate-800 font-bold">{billingTotal}</strong> 笔明细 · 第{" "}
                    <strong className="text-slate-800 font-bold">{billingPage}</strong> / {billingTotalPages} 页
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span>每页显示</span>
                    <select
                      value={billingPageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value);
                        setBillingPageSize(newSize);
                        void loadBillingRecords(1, newSize);
                      }}
                      className="zg-input text-xs !h-7 !py-0.5 !px-2 !w-[78px] shrink-0 font-mono bg-white border border-slate-200 cursor-pointer"
                    >
                      <option value="10">10 笔</option>
                      <option value="20">20 笔</option>
                      <option value="50">50 笔</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1 font-medium shrink-0 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => loadBillingRecords(1, billingPageSize)}
                    disabled={billingPage <= 1 || loadingBills}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => loadBillingRecords(Math.max(1, billingPage - 1), billingPageSize)}
                    disabled={billingPage <= 1 || loadingBills}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    上一页
                  </button>
                  <span className="px-2.5 py-0.5 font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded text-xs">
                    {billingPage} / {billingTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadBillingRecords(Math.min(billingTotalPages, billingPage + 1), billingPageSize)}
                    disabled={billingPage >= billingTotalPages || loadingBills}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => loadBillingRecords(billingTotalPages, billingPageSize)}
                    disabled={billingPage >= billingTotalPages || loadingBills}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* VIEW 2: 发票申请与开具记录列表 */}
        {activeDetailTab === "invoices" && (
          <>
            <div className="p-3 bg-blue-50/60 border-b border-blue-100/80 flex items-start sm:items-center gap-2.5 text-xs text-[#2b6cb0]">
              <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex-1 font-medium">
                <strong>开票合规须知：</strong>平台每笔真实交易订单至多支持开票 <strong>2 次</strong>（包含首次开票与退换重开）。财务团队通常在 <strong>1~3 个工作日</strong>内完成税务核验并开具全电发票，开具成功后将自动投递至预留邮箱。
              </div>
            </div>

            <div className="p-3 sm:p-3.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 shrink-0 bg-white px-2.5 py-1 rounded-md border border-slate-200/90 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-600 font-bold shrink-0 text-xs">申请时间</span>
                  <input
                    type="date"
                    max={invoiceEndDate || undefined}
                    value={invoiceStartDate}
                    onChange={handleInvoiceStartDateChange}
                    className="text-xs !h-6 !py-0 !px-1.5 !w-[116px] shrink-0 text-slate-700 font-medium bg-slate-50/70 border border-slate-200/80 rounded cursor-pointer hover:bg-white focus:bg-white focus:border-[#3182ce] focus:outline-none transition-colors"
                    title="发票申请开始时间（不可晚于结束时间）"
                  />
                  <span className="text-slate-400 font-bold shrink-0 text-[11px]">至</span>
                  <input
                    type="date"
                    min={invoiceStartDate || undefined}
                    value={invoiceEndDate}
                    onChange={handleInvoiceEndDateChange}
                    className="text-xs !h-6 !py-0 !px-1.5 !w-[116px] shrink-0 text-slate-700 font-medium bg-slate-50/70 border border-slate-200/80 rounded cursor-pointer hover:bg-white focus:bg-white focus:border-[#3182ce] focus:outline-none transition-colors"
                    title="发票申请结束时间（不可早于开始时间）"
                  />
                  {(invoiceStartDate || invoiceEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceStartDate("");
                        setInvoiceEndDate("");
                        void loadInvoiceRecords(1, invoicePageSize, "", "", invoiceTypeFilter, invoiceStatusFilter);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition-colors"
                      title="清空已选时间"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                <select
                  value={invoiceTypeFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInvoiceTypeFilter(val);
                    void loadInvoiceRecords(1, invoicePageSize, invoiceStartDate, invoiceEndDate, val, invoiceStatusFilter);
                  }}
                  className="zg-input text-xs !h-8 !py-1 !px-2.5 !w-auto min-w-[125px] shrink-0 text-slate-700 font-medium cursor-pointer bg-white border-slate-200/90 shadow-2xs"
                >
                  <option value="ALL">全部发票种类</option>
                  <option value="PLAIN">增值税普通发票</option>
                  <option value="VAT">增值税专用发票</option>
                </select>

                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInvoiceStatusFilter(val);
                    void loadInvoiceRecords(1, invoicePageSize, invoiceStartDate, invoiceEndDate, invoiceTypeFilter, val);
                  }}
                  className="zg-input text-xs !h-8 !py-1 !px-2.5 !w-auto min-w-[115px] shrink-0 text-slate-700 font-medium cursor-pointer bg-white border-slate-200/90 shadow-2xs"
                >
                  <option value="ALL">全部开票状态</option>
                  <option value="PENDING">审核中</option>
                  <option value="COMPLETED">已开具</option>
                  <option value="REJECTED">已驳回</option>
                </select>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSearchInvoices}
                    className="zg-btn zg-btn-primary !h-8 !px-3.5 !text-xs font-bold gap-1 cursor-pointer shadow-xs shrink-0"
                    title="查询符合条件的发票"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>查询</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetInvoices}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 cursor-pointer shrink-0"
                    title="清空所有筛选条件"
                  >
                    重置筛选
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-medium shrink-0 ml-auto whitespace-nowrap">
                共检索到 <strong className="text-slate-700 font-mono font-bold">{invoiceTotal}</strong> 笔开票记录
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs table-auto min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4 whitespace-nowrap">申请流水号</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">发票抬头 / 主体</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">发票种类</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">税号 / 证件号</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">接收邮箱 / 手机</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">关联订单 / 次数</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">申请时间</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">当前状态</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {loadingInvoiceRecords ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-6 h-6 text-[#3182ce] animate-spin" />
                          <p className="font-bold text-slate-600">正在拉取发票申请记录…</p>
                        </div>
                      </td>
                    </tr>
                  ) : invoiceRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <Receipt className="w-7 h-7 text-slate-300" />
                          <p className="font-bold text-slate-600">暂无开票申请记录</p>
                          <p className="text-[11px] text-slate-400 mb-2">
                            若您已完成交易，可在“账单与交易历史”中点击“申请开票”或点击下方按钮发起申请
                          </p>
                          <button
                            type="button"
                            onClick={() => handleOpenInvoiceModal()}
                            className="zg-btn zg-btn-primary !h-8 !px-4 !text-xs font-bold"
                          >
                            立即申请开票
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    invoiceRecords.map((item) => {
                      const isVat = item.invoiceType === "VAT";
                      const isCompleted = item.status === "COMPLETED";
                      const isRejected = item.status === "REJECTED";
                      const isPersonal = item.buyerType === "PERSONAL";

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                            <span title={item.id}>{item.id.slice(0, 10)}…</span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 max-w-[180px] truncate" title={item.title}>
                                {item.title}
                              </span>
                              <span className={`text-[9px] px-1 py-0.2 rounded font-bold border ${
                                isPersonal ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-blue-50 text-[#2b6cb0] border-blue-200/80"
                              }`}>
                                {isPersonal ? "个人" : "企业"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isVat ? "bg-purple-50 text-purple-700 border-purple-200/80" : "bg-blue-50 text-[#2b6cb0] border-blue-200/80"
                              }`}
                            >
                              {isVat ? "增值税专票" : "增值税普票"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {item.taxNo || item.idCard || <span className="text-slate-300">无</span>}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-col text-[11px] text-slate-500">
                              <span className="truncate max-w-[150px]" title={item.email || ""}>
                                {item.email || "—"}
                              </span>
                              {item.phone && <span className="font-mono text-slate-400">{item.phone}</span>}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-col text-[11px]">
                              <span className="font-mono text-slate-600 truncate max-w-[120px]" title={item.orderNo || ""}>
                                {item.orderNo || "自主开票"}
                              </span>
                              <span className="text-[10px] font-bold text-amber-600">第 {item.invoiceSequence || 1} / 2 次</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isCompleted
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                  : isRejected
                                    ? "bg-red-50 text-red-600 border-red-200/80"
                                    : "bg-amber-50 text-amber-700 border-amber-200/80"
                              }`}
                            >
                              {isCompleted ? "已开具 · 电子发票" : isRejected ? "未通过 · 已驳回" : "审核中 · 财务开具中"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {isCompleted && item.invoiceUrl ? (
                              <a
                                href={item.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="zg-btn zg-btn-primary !h-7 !px-2.5 !text-xs gap-1 font-bold inline-flex items-center"
                              >
                                <Download className="w-3 h-3" />
                                <span>下载发票</span>
                              </a>
                            ) : isRejected ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setInvoiceTitle(item.title || "");
                                  setInvoiceTaxNo(item.taxNo || "");
                                  setInvoiceEmail(item.email || "");
                                  setInvoicePhone(item.phone || "");
                                  setInvoiceBuyerType(item.buyerType === "PERSONAL" ? "PERSONAL" : "ENTERPRISE");
                                  setInvoiceVatType(item.invoiceType === "VAT" ? "VAT" : "PLAIN");
                                  handleOpenInvoiceModal();
                                }}
                                className="zg-btn !bg-red-50 hover:!bg-red-100 !text-red-600 !border-red-200 !h-7 !px-2.5 !text-xs font-bold"
                              >
                                重新申请
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70">
                                等待财务核验
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {invoiceTotal > 0 && (
              <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-slate-500 font-medium shrink-0 whitespace-nowrap">
                  <span>
                    共 <strong className="text-slate-800 font-bold">{invoiceTotal}</strong> 笔开票申请 · 第{" "}
                    <strong className="text-slate-800 font-bold">{invoicePage}</strong> / {invoiceTotalPages} 页
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span>每页显示</span>
                    <select
                      value={invoicePageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value);
                        setInvoicePageSize(newSize);
                        void loadInvoiceRecords(1, newSize);
                      }}
                      className="zg-input text-xs !h-7 !py-0.5 !px-2 !w-[78px] shrink-0 font-mono bg-white border border-slate-200 cursor-pointer"
                    >
                      <option value="10">10 笔</option>
                      <option value="20">20 笔</option>
                      <option value="50">50 笔</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1 font-medium shrink-0 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => loadInvoiceRecords(1, invoicePageSize)}
                    disabled={invoicePage <= 1 || loadingInvoiceRecords}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => loadInvoiceRecords(Math.max(1, invoicePage - 1), invoicePageSize)}
                    disabled={invoicePage <= 1 || loadingInvoiceRecords}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    上一页
                  </button>
                  <span className="px-2.5 py-0.5 font-mono font-bold text-slate-700 bg-white border border-slate-200 rounded text-xs">
                    {invoicePage} / {invoiceTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadInvoiceRecords(Math.min(invoiceTotalPages, invoicePage + 1), invoicePageSize)}
                    disabled={invoicePage >= invoiceTotalPages || loadingInvoiceRecords}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => loadInvoiceRecords(invoiceTotalPages, invoicePageSize)}
                    disabled={invoicePage >= invoiceTotalPages || loadingInvoiceRecords}
                    className="zg-btn zg-btn-default !text-xs !h-7 !px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 开票弹窗 */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white/98 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">增值税电子发票申请</h3>
                  <p className="text-[11px] text-slate-400">合规电子发票，用于企业财务报销与个人记账凭证</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg flex items-start gap-2 text-xs text-amber-800">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">平台开票规则须知（单笔交易限开 2 次）：</div>
                <div className="text-[11px] text-amber-700/90 leading-relaxed">
                  根据国家税务及财务审计规范，<strong>同一笔交易订单最多支持开具发票 2 次</strong>（包含首次开票与退换重开）。如本笔订单开票次数已达 2 次，系统将自动阻断申请。
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmitInvoice} className="space-y-3.5 text-xs overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">发票开具主体</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceBuyerType("ENTERPRISE");
                      setFieldErrors({});
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-bold transition-all cursor-pointer ${
                      invoiceBuyerType === "ENTERPRISE" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>企业单位抬头</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceBuyerType("PERSONAL");
                      setInvoiceVatType("PLAIN");
                      setFieldErrors({});
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-bold transition-all cursor-pointer ${
                      invoiceBuyerType === "PERSONAL" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>个人 / 非企业单位</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5">关联交易订单 (单笔限开 2 次)</label>
                <select
                  value={selectedOrderNo}
                  onChange={(e) => {
                    const ordNo = e.target.value;
                    setSelectedOrderNo(ordNo);
                    const matched = billingHistory.find((b) => b.id === ordNo);
                    if (matched) {
                      setSelectedOrderAmountCents(
                        matched.amountCents || Math.round(parseFloat(matched.amount.replace(/[^0-9.]/g, "") || "0") * 100)
                      );
                      setSelectedOrderInvoicedCount(matched.invoicedCount ?? 0);
                    } else {
                      setSelectedOrderAmountCents(0);
                      setSelectedOrderInvoicedCount(0);
                    }
                  }}
                  className="zg-input text-xs font-mono"
                >
                  <option value="">全额开票 / 自主填报交易</option>
                  {billingHistory
                    .filter((b) => b.status === "SUCCESS")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} ({b.title} · {b.amount} · 已开 {b.invoicedCount ?? 0}/2 次)
                      </option>
                    ))}
                </select>
                {selectedOrderNo && (
                  <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center justify-between">
                    <span>
                      当前交易已开票：<strong className="text-amber-600 font-mono">{selectedOrderInvoicedCount} / 2 次</strong>
                    </span>
                    <span className="font-bold text-[#3182ce]">
                      {selectedOrderInvoicedCount >= 2 ? "已达上限，不可开票" : `本次提交为第 ${selectedOrderInvoicedCount + 1} 次申请`}
                    </span>
                  </p>
                )}
                {fieldErrors.orderNo && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                    <span>{fieldErrors.orderNo}</span>
                  </p>
                )}
              </div>

              {invoiceBuyerType === "ENTERPRISE" ? (
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">发票种类</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`border rounded-lg p-2.5 flex items-center gap-2 cursor-pointer transition-all ${
                      invoiceVatType === "PLAIN" ? "border-[#3182ce] bg-blue-50/40 text-[#2b6cb0]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="vatType" checked={invoiceVatType === "PLAIN"} onChange={() => setInvoiceVatType("PLAIN")} className="text-[#3182ce]" />
                      <span className="font-bold">增值税普通发票</span>
                    </label>
                    <label className={`border rounded-lg p-2.5 flex items-center gap-2 cursor-pointer transition-all ${
                      invoiceVatType === "VAT" ? "border-[#3182ce] bg-blue-50/40 text-[#2b6cb0]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="vatType" checked={invoiceVatType === "VAT"} onChange={() => setInvoiceVatType("VAT")} className="text-[#3182ce]" />
                      <div className="flex items-center gap-1">
                        <span className="font-bold">增值税专用发票</span>
                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-bold">需四要素</span>
                      </div>
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-700 font-bold mb-1.5">发票种类</label>
                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-600 font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>增值税普通发票 (电子)</span>
                    <span className="text-[10px] text-slate-400 font-normal">（个人/非企业不支持开具专用发票）</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1 zg-required">
                  {invoiceBuyerType === "ENTERPRISE" ? "企业全称 / 发票抬头" : "个人姓名 / 发票抬头"}
                </label>
                <input
                  type="text"
                  placeholder={invoiceBuyerType === "ENTERPRISE" ? "请输入工商注册的完整公司全称" : "请输入个人姓名或组织名称"}
                  value={invoiceTitle}
                  onChange={(e) => {
                    setInvoiceTitle(e.target.value);
                    if (fieldErrors.title) setFieldErrors((prev) => { const n = { ...prev }; delete n.title; return n; });
                  }}
                  className={`zg-input text-xs ${fieldErrors.title ? "is-error" : ""}`}
                />
                {fieldErrors.title && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                    <span>{fieldErrors.title}</span>
                  </p>
                )}
              </div>

              {invoiceBuyerType === "ENTERPRISE" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1 zg-required">纳税人识别号 / 统一社会信用代码</label>
                  <input
                    type="text"
                    placeholder="请输入 15~20 位纳税人识别号或信用代码"
                    value={invoiceTaxNo}
                    onChange={(e) => {
                      setInvoiceTaxNo(e.target.value.toUpperCase());
                      if (fieldErrors.taxNo) setFieldErrors((prev) => { const n = { ...prev }; delete n.taxNo; return n; });
                    }}
                    className={`zg-input text-xs font-mono ${fieldErrors.taxNo ? "is-error" : ""}`}
                  />
                  {fieldErrors.taxNo && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span>{fieldErrors.taxNo}</span>
                    </p>
                  )}
                </div>
              )}

              {invoiceBuyerType === "PERSONAL" && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">身份证号码 (选填)</label>
                  <input
                    type="text"
                    placeholder="若有报税或报销需求可填写 18 位身份证号码"
                    value={invoiceIdCard}
                    onChange={(e) => {
                      setInvoiceIdCard(e.target.value.toUpperCase());
                      if (fieldErrors.idCard) setFieldErrors((prev) => { const n = { ...prev }; delete n.idCard; return n; });
                    }}
                    className={`zg-input text-xs font-mono ${fieldErrors.idCard ? "is-error" : ""}`}
                  />
                  {fieldErrors.idCard && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span>{fieldErrors.idCard}</span>
                    </p>
                  )}
                </div>
              )}

              {invoiceBuyerType === "ENTERPRISE" && invoiceVatType === "VAT" && (
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                    <FileCheck2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>增值税专用发票开具四要素（均为必填项）</span>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1 zg-required">基本开户银行</label>
                    <input
                      type="text"
                      placeholder="例：中国工商银行股份有限公司北京中关村支行"
                      value={invoiceBankName}
                      onChange={(e) => {
                        setInvoiceBankName(e.target.value);
                        if (fieldErrors.bankName) setFieldErrors((prev) => { const n = { ...prev }; delete n.bankName; return n; });
                      }}
                      className={`zg-input text-xs ${fieldErrors.bankName ? "is-error" : ""}`}
                    />
                    {fieldErrors.bankName && <p className="text-[10px] text-red-500 font-bold mt-0.5">{fieldErrors.bankName}</p>}
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1 zg-required">银行账户号码</label>
                    <input
                      type="text"
                      placeholder="例：0200 0010 0900 1234 567"
                      value={invoiceBankAccount}
                      onChange={(e) => {
                        setInvoiceBankAccount(e.target.value);
                        if (fieldErrors.bankAccount) setFieldErrors((prev) => { const n = { ...prev }; delete n.bankAccount; return n; });
                      }}
                      className={`zg-input text-xs font-mono ${fieldErrors.bankAccount ? "is-error" : ""}`}
                    />
                    {fieldErrors.bankAccount && <p className="text-[10px] text-red-500 font-bold mt-0.5">{fieldErrors.bankAccount}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 zg-required">企业注册地址</label>
                      <input
                        type="text"
                        placeholder="例：北京市海淀区中关村南大街1号"
                        value={invoiceAddress}
                        onChange={(e) => {
                          setInvoiceAddress(e.target.value);
                          if (fieldErrors.address) setFieldErrors((prev) => { const n = { ...prev }; delete n.address; return n; });
                        }}
                        className={`zg-input text-xs ${fieldErrors.address ? "is-error" : ""}`}
                      />
                      {fieldErrors.address && <p className="text-[10px] text-red-500 font-bold mt-0.5">{fieldErrors.address}</p>}
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 zg-required">企业注册电话</label>
                      <input
                        type="text"
                        placeholder="例：010-88888888"
                        value={invoiceTel}
                        onChange={(e) => {
                          setInvoiceTel(e.target.value);
                          if (fieldErrors.tel) setFieldErrors((prev) => { const n = { ...prev }; delete n.tel; return n; });
                        }}
                        className={`zg-input text-xs font-mono ${fieldErrors.tel ? "is-error" : ""}`}
                      />
                      {fieldErrors.tel && <p className="text-[10px] text-red-500 font-bold mt-0.5">{fieldErrors.tel}</p>}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1 zg-required">接收电子发票邮箱</label>
                  <input
                    type="email"
                    placeholder="开具成功后将发送PDF至该邮箱"
                    value={invoiceEmail}
                    onChange={(e) => {
                      setInvoiceEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => { const n = { ...prev }; delete n.email; return n; });
                    }}
                    className={`zg-input text-xs ${fieldErrors.email ? "is-error" : ""}`}
                  />
                  {fieldErrors.email && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span>{fieldErrors.email}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1 zg-required">
                    {invoiceBuyerType === "ENTERPRISE" ? "财务经办人手机号" : "联系人手机号码"}
                  </label>
                  <input
                    type="tel"
                    placeholder="11 位中国大陆手机号码"
                    value={invoicePhone}
                    onChange={(e) => {
                      setInvoicePhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors((prev) => { const n = { ...prev }; delete n.phone; return n; });
                    }}
                    className={`zg-input text-xs font-mono ${fieldErrors.phone ? "is-error" : ""}`}
                  />
                  {fieldErrors.phone && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span>{fieldErrors.phone}</span>
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">发票备注说明 (选填)</label>
                <textarea
                  rows={2}
                  placeholder="如项目编号、财务报销备注等（至多 100 字）"
                  value={invoiceRemark}
                  onChange={(e) => setInvoiceRemark(e.target.value.slice(0, 100))}
                  className="zg-input text-xs resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="zg-btn zg-btn-default text-xs h-8.5 px-4 font-bold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingInvoice || (Boolean(selectedOrderNo) && selectedOrderInvoicedCount >= 2)}
                  className="zg-btn zg-btn-primary text-xs h-8.5 px-5 font-bold cursor-pointer disabled:opacity-40"
                >
                  {submittingInvoice ? "提交开票中..." : "确认提交开票申请"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 计费与开票规则真实弹窗 Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white/98 backdrop-blur-xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">平台计费与电子发票开具细则</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">知阁·舟坊官方计费、消费结算与发票合规保障细则</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                <div className="font-black text-slate-800 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]" />
                  <span>1. 发票支持类型与资质要求</span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  平台支持开具<strong>「增值税电子普通发票」</strong>与<strong>「增值税电子专用发票」</strong>。个人用户仅可开具普通发票，企业客户开具专票需提供 18 位统一社会信用代码。
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                <div className="font-black text-slate-800 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#38a169]" />
                  <span>2. 可开票范围与金额核算</span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  在平台内购买的<strong>会员套餐、空间扩容包、算力点充值包</strong>均可在支付成功后按实际支付金额申请全额开票。使用平台赠送点数或优惠抵扣的部分不计入开票金额。
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                <div className="font-black text-slate-800 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#dd6b20]" />
                  <span>3. 开具时限与交付方式</span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  提交开票申请后，平台财务团队将在 <strong>1~3 个工作日内</strong>完成抬头与税务校验并开出全电发票，系统将自动将发票文件（PDF/OFD）发送至填写的接收邮箱，您也可在「开票记录」中下载。
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                <div className="font-black text-slate-800 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#e53e3e]" />
                  <span>4. 退款与发票红冲政策</span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  若涉及已开具发票的订单申请退款，平台需按税局规定先行开具红字增值税发票冲销后，方可退还资金。如需修改发票抬头或重开，请先撤销或联系客服协助处理。
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="zg-btn zg-btn-primary text-xs h-8 px-5 font-bold"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
