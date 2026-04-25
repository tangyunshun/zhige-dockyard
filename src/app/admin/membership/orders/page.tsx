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
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
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
        <div className="flex items-center justify-between mb-6">
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
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
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
            className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>手动开通会员</span>
          </button>
        </div>

        {/* 订单列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">暂无订单数据</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      订单信息
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      用户
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      会员等级
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      订单类型
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      支付方式
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      金额
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      状态
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                      有效期
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div>
                          <div className="font-medium text-slate-800 text-sm">
                            {order.id}
                          </div>
                          <div className="text-xs text-slate-500">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {new Date(order.createdAt).toLocaleString("zh-CN")}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <div>
                            <div className="text-sm font-medium text-slate-800">
                              {order.user.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {order.user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                            style={{
                              backgroundColor: `${order.level.color}20`,
                            }}
                          >
                            {order.level.icon || "👑"}
                          </div>
                          <div className="font-medium text-slate-800">
                            {order.level.nameZh}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-slate-600">
                          {getOrderTypeLabel(order.orderType)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          {getPaymentMethodIcon(order.paymentMethod)}
                          <span className="text-sm">
                            {order.paymentMethod === "WECHAT" && "微信支付"}
                            {order.paymentMethod === "ALIPAY" && "支付宝"}
                            {order.paymentMethod === "BANK_TRANSFER" &&
                              "银行转账"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-800">
                          ¥{(order.amount / 100).toFixed(2)}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm text-slate-600">
                          <div>
                            {new Date(order.startDate).toLocaleDateString(
                              "zh-CN"
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            至{" "}
                            {new Date(order.endDate).toLocaleDateString(
                              "zh-CN"
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-slate-600">
                  共 {pagination.total} 条记录，第 {pagination.page} /{" "}
                  {pagination.totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setPagination({ ...pagination, page: pagination.page - 1 })
                    }
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setPagination({ ...pagination, page: pagination.page + 1 })
                    }
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
