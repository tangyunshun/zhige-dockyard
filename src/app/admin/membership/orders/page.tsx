"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Search,
  Plus,
  ArrowLeft,
  FileText,
  DollarSign,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
} from "lucide-react";

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

export default function AdminMembershipOrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({
    status: "",
    userId: "",
    levelId: "",
  });

  useEffect(() => {
    loadOrders();
  }, [pagination.page, filters]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.status && { status: filters.status }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.levelId && { levelId: filters.levelId }),
      });

      const res = await fetch(`/api/admin/membership/orders?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
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
      PAID: "bg-green-100 text-green-700",
      REFUNDED: "bg-blue-100 text-blue-700",
      CANCELLED: "bg-red-100 text-red-700",
    };

    const labels: Record<string, string> = {
      PENDING: "待支付",
      PAID: "已支付",
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
      ALIPAY: CreditCard,
      BANK_TRANSFER: DollarSign,
    };
    const Icon = icons[method] || DollarSign;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-xl font-bold text-slate-800">会员订单管理</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 操作栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-6 mb-6 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索用户 ID..."
                  value={filters.userId}
                  onChange={(e) =>
                    setFilters({ ...filters, userId: e.target.value })
                  }
                  className="pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
              >
                <option value="">全部状态</option>
                <option value="PENDING">待支付</option>
                <option value="PAID">已支付</option>
                <option value="REFUNDED">已退款</option>
                <option value="CANCELLED">已取消</option>
              </select>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 h-11 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-bold text-sm hover:shadow-xl hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>手动开通会员</span>
            </button>
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
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        订单信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        用户
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        订单类型
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        支付方式
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        金额
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        有效期
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-mono text-xs font-bold text-slate-700 group-hover:text-[#3182ce] transition-colors mb-1">
                              {order.id}
                            </div>
                            <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(order.createdAt).toLocaleString(
                                "zh-CN",
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                              {order.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                {order.user.name}
                              </div>
                              <div className="text-xs text-slate-500 font-medium">
                                {order.user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform duration-300"
                              style={{
                                backgroundColor: `${order.level.color}20`,
                              }}
                            >
                              {order.level.icon || "👑"}
                            </div>
                            <div className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {order.level.nameZh}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 font-medium">
                            {getOrderTypeLabel(order.orderType)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-600 font-medium">
                            {getPaymentMethodIcon(order.paymentMethod)}
                            <span className="text-sm">
                              {order.paymentMethod === "WECHAT" && "微信支付"}
                              {order.paymentMethod === "ALIPAY" && "支付宝"}
                              {order.paymentMethod === "BANK_TRANSFER" &&
                                "银行转账"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-black text-slate-800 text-lg tracking-tight">
                            ¥{(order.amount / 100).toFixed(2)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-600 font-medium">
                            <div className="font-bold text-slate-700">
                              {new Date(order.startDate).toLocaleDateString(
                                "zh-CN",
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-0.5">
                              至{" "}
                              {new Date(order.endDate).toLocaleDateString(
                                "zh-CN",
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-2">
                <div className="text-sm text-slate-600 font-medium">
                  共{" "}
                  <span className="font-bold text-[#3182ce]">
                    {pagination.total}
                  </span>{" "}
                  条记录，第{" "}
                  <span className="font-bold text-[#3182ce]">
                    {pagination.page}
                  </span>{" "}
                  / {pagination.totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        page: pagination.page - 1,
                      })
                    }
                    disabled={pagination.page === 1}
                    className="px-4 h-10 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 hover:border-[#3182ce] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        page: pagination.page + 1,
                      })
                    }
                    disabled={pagination.page === pagination.totalPages}
                    className="px-4 h-10 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 hover:border-[#3182ce] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
