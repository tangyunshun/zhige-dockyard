"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import Pagination from "@/components/Pagination";
import {
  Search,
  RotateCw,
  ArrowLeft,
  FileText,
  Building2,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  Receipt,
  CheckCircle2,
  Download,
} from "lucide-react";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";

interface Order {
  id: string;
  userId: string;
  levelId: string;
  orderType: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  startDate: string;
  endDate: string;
  status: string;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  level: {
    name: string;
    nameZh: string;
    icon: string;
    color: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

export default function AdminMembershipOrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    status: "",
    userId: "",
    levelId: "",
  });

  useEffect(() => {
    loadOrders();
  }, [pagination.page, filters]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const authToken = getAuthToken();
      const params = new URLSearchParams({
        page: "1",
        limit: "5000",
        ...(filters.status && { status: filters.status }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.levelId && { levelId: filters.levelId }),
      });

      const res = await fetch(`/api/admin/membership/orders?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        toast.error("获取订单全量数据失败，请重试");
        return;
      }

      const result = await res.json();
      const allOrders: Order[] = result.data?.orders || [];

      if (allOrders.length === 0) {
        toast.error("当前筛选条件下无订单数据可导出");
        return;
      }

      const orderTypeMap: Record<string, string> = {
        NEW: "新购",
        RENEW: "续费",
        UPGRADE: "升级",
      };

      const paymentMethodMap: Record<string, string> = {
        WECHAT: "微信支付",
        WECHAT_PAY: "微信支付",
        ALIPAY: "支付宝",
        BANK_TRANSFER: "对公转账",
        SIMULATED: "模拟支付",
      };

      const statusMap: Record<string, string> = {
        PENDING: "待支付",
        PAID: "已支付",
        SUCCESS: "交易成功",
        REFUNDED: "已退款",
        CANCELLED: "已取消",
      };

      exportToExcel({
        filename: "知阁会员订单流水",
        sheetName: "订单明细",
        data: allOrders,
        columns: [
          { header: "订单编号", key: "id", width: 28 },
          { header: "用户 ID", key: "userId", width: 26 },
          { header: "用户姓名", key: "user.name", width: 14 },
          { header: "用户邮箱", key: "user.email", width: 24 },
          {
            header: "用户手机号",
            key: "user.phone",
            width: 16,
            formatter: (v: any) => v || "-",
          },
          {
            header: "会员套餐等级",
            key: "level.nameZh",
            width: 14,
            formatter: (v: any, row: Order) => v || row.levelId,
          },
          {
            header: "订单类型",
            key: "orderType",
            width: 12,
            formatter: (v: string) => orderTypeMap[v] || v || "未知",
          },
          {
            header: "支付方式",
            key: "paymentMethod",
            width: 14,
            formatter: (v: string) => paymentMethodMap[v] || v || "未知",
          },
          {
            header: "订单金额(元)",
            key: "amount",
            width: 14,
            formatter: (v: any) => (typeof v === "number" ? (v / 100).toFixed(2) : v ?? 0),
          },
          {
            header: "币种",
            key: "currency",
            width: 10,
            formatter: (v: any) => v || "CNY",
          },
          {
            header: "订单状态",
            key: "status",
            width: 12,
            formatter: (v: string) => statusMap[v] || v || "未知",
          },
          {
            header: "有效期起始时间",
            key: "startDate",
            width: 22,
            formatter: formatExcelDateTime,
          },
          {
            header: "有效期截止时间",
            key: "endDate",
            width: 22,
            formatter: formatExcelDateTime,
          },
          {
            header: "订单创建时间",
            key: "createdAt",
            width: 22,
            formatter: formatExcelDateTime,
          },
        ],
      });

      toast.success(`成功导出 ${allOrders.length} 笔会员订单！`);
    } catch (err) {
      console.error("导出会员订单 Excel 失败:", err);
      toast.error("导出 Excel 异常，请检查控制台");
    } finally {
      setExporting(false);
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: String(PAGE_SIZE),
        ...(filters.status && { status: filters.status }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.levelId && { levelId: filters.levelId }),
      });

      const res = await fetch(`/api/admin/membership/orders?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data.orders);
        setPagination(data.data.pagination);
      } else {
        const error = await res.json();
        console.error("Load orders error:", error);
        toast.error(error.message || "加载订单失败");
      }
    } catch (error) {
      console.error("Load orders error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-700",
      PAID: "bg-emerald-100 text-emerald-600",
      SUCCESS: "bg-emerald-100 text-emerald-600",
      REFUNDED: "bg-blue-100 text-[#2b6cb0]",
      CANCELLED: "bg-red-100 text-red-600",
    };

    const labels: Record<string, string> = {
      PENDING: "待支付",
      PAID: "已支付",
      SUCCESS: "成功",
      REFUNDED: "已退款",
      CANCELLED: "已取消",
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
          badges[status] || "bg-slate-100 text-slate-600"
        }`}
      >
        {status === "PAID" && <CheckCircle className="w-3 h-3" />}
        {status === "SUCCESS" && <CheckCircle className="w-3 h-3" />}
        {status === "PENDING" && <Clock className="w-3 h-3" />}
        {status === "CANCELLED" && <XCircle className="w-3 h-3" />}
        {labels[status] || status}
      </span>
    );
  };

  const getOrderTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      NEW: "新购",
      RENEW: "续费",
      UPGRADE: "升级",
    };
    return labels[type] || type;
  };

  const getPaymentMethodIcon = (method: string) => {
    const icons: Record<string, any> = {
      WECHAT: CreditCard,
      WECHAT_PAY: CreditCard,
      ALIPAY: CreditCard,
      BANK_TRANSFER: Building2,
      SIMULATED: CheckCircle2,
    };
    const Icon = icons[method] || Receipt;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部统一导航 */}
      <MembershipNavHeader
        title="会员订单管理"
        subtitle="集中审计全站会员购买订单、支付流水凭据与对账记录"
      >
        <button
          onClick={loadOrders}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
        >
          <Receipt className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
          <span>刷新订单流水</span>
        </button>
      </MembershipNavHeader>

      {/* 主内容区 */}
      <div>
        {/* 操作过滤栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/90 shadow-2xs p-4 mb-5 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
              <div className="relative w-full sm:w-80 md:w-96 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索用户 ID / 订单号..."
                  value={filters.userId}
                  onChange={(e) => {
                    setFilters({ ...filters, userId: e.target.value });
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold transition-all bg-white placeholder:text-slate-400 text-slate-700"
                />
              </div>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="w-full sm:w-36 h-10 px-3.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white cursor-pointer shrink-0 text-slate-700"
              >
                <option value="">全部状态</option>
                <option value="PENDING">待支付</option>
                <option value="PAID">已支付</option>
                <option value="SUCCESS">已成功</option>
                <option value="REFUNDED">已退款</option>
                <option value="CANCELLED">已取消</option>
              </select>
              <button
                type="button"
                onClick={loadOrders}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs border border-slate-200/80 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RotateCw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? 'animate-spin' : ''}`} />
                <span>刷新订单</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exporting || loading}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs border border-emerald-200/90 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                title="导出符合当前筛选条件的全部订单为 Excel 表格"
              >
                <Download className={`w-3.5 h-3.5 text-emerald-600 ${exporting ? "animate-bounce" : ""}`} />
                <span>{exporting ? "导出中..." : "导出 Excel"}</span>
              </button>
            </div>

            {/* 右侧：订单总数统计徽章 */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100/90 px-3.5 py-2 rounded-xl border border-slate-200/70 shrink-0 self-start md:self-auto">
              <Receipt className="w-4 h-4 text-[#3182ce]" />
              <span>共 {pagination.total} 笔订单</span>
            </div>
          </div>
        </div>

        {/* 订单列表 */}
        {loading ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600 font-medium">加载订单数据中...</p>
              </div>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无订单数据</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
              <div className="relative overflow-x-auto">
                <table className="w-full table-auto min-w-[1080px]">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        订单信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        订单类型
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        支付方式
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        金额
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        有效期
                      </th>
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div
                              className="font-mono text-xs font-bold text-slate-700 group-hover:text-[#3182ce] transition-colors mb-1 truncate"
                              title={order.id}
                            >
                              {order.id}
                            </div>
                            <div className="text-xs text-slate-500 font-medium flex items-center gap-1 whitespace-nowrap">
                              <Calendar className="w-3 h-3 shrink-0" />
                              {new Date(order.createdAt).toLocaleString(
                                "zh-CN",
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                              {order.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div
                                className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                                title={order.user.name}
                              >
                                {order.user.name}
                              </div>
                              <div
                                className="text-xs text-slate-500 font-medium truncate"
                                title={order.user.email}
                              >
                                {order.user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform duration-300"
                              style={{
                                backgroundColor: `${order.level.color}20`,
                              }}
                            >
                              {order.level.icon || "👑"}
                            </div>
                            <div
                              className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                              title={order.level.nameZh}
                            >
                              {order.level.nameZh}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-600 font-medium whitespace-nowrap">
                            {getOrderTypeLabel(order.orderType)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-medium">
                            {getPaymentMethodIcon(order.paymentMethod)}
                            <span
                              className={`text-sm whitespace-nowrap ${
                                order.paymentMethod === "SIMULATED"
                                  ? "text-amber-600 font-bold"
                                  : "text-slate-600"
                              }`}
                            >
                              {(order.paymentMethod === "WECHAT" || order.paymentMethod === "WECHAT_PAY") && "微信支付"}
                              {order.paymentMethod === "ALIPAY" && "支付宝"}
                              {order.paymentMethod === "BANK_TRANSFER" &&
                                "银行转账"}
                              {order.paymentMethod === "SIMULATED" && "模拟支付"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-black text-slate-800 text-lg tracking-tight whitespace-nowrap">
                            ¥{(order.amount / 100).toFixed(2)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-600 font-medium whitespace-nowrap">
                            <div
                              className="font-bold text-slate-700 whitespace-nowrap"
                              title={`${new Date(order.startDate).toLocaleDateString("zh-CN")} 至 ${new Date(order.endDate).toLocaleDateString("zh-CN")}`}
                            >
                              {new Date(order.startDate).toLocaleDateString(
                                "zh-CN",
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                              至{" "}
                              {new Date(order.endDate).toLocaleDateString(
                                "zh-CN",
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(order.user?.email || order.userId)}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                              title="前往用户中心反查该账号画像"
                            >
                              <User className="w-3.5 h-3.5" />
                              <span>反查用户</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 分页 */}
            {pagination.total > 0 && (
              <div className="mt-6 px-2">
                <Pagination
                  currentPage={pagination.page}
                  totalItems={pagination.total}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setPagination({ ...pagination, page: p })}
                  itemLabel="条订单"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
