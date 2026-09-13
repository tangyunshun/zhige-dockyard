"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import Pagination from "@/components/Pagination";
import {
  Search,
  ArrowLeft,
  History,
  User,
  Calendar,
  Clock,
  Mail,
  Phone,
  ArrowUpCircle,
  ArrowDownCircle,
  Settings,
  Edit,
  RefreshCw,
} from "lucide-react";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";

interface ChangeLog {
  id: string;
  userId: string;
  levelId: string;
  operatorId: string;
  changeType: string;
  oldValue: any;
  newValue: any;
  reason: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatar?: string | null;
  };
  operator: {
    id: string;
    name: string;
    email: string;
  } | null;
  level: {
    name: string;
    nameZh: string;
    icon: string;
    color: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

export default function AdminMembershipLogsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    userId: "",
    changeType: "",
  });

  useEffect(() => {
    loadLogs();
  }, [pagination.page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.changeType && { changeType: filters.changeType }),
      });

      const res = await fetch(`/api/admin/membership/logs?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      } else {
        const error = await res.json();
        console.error("Load logs error:", error);
        toast.error(error.message || "加载日志失败");
      }
    } catch (error) {
      console.error("Load logs error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  /** 格式化日期时间为 YYYY/MM/DD HH:mm:ss 完整精确时间 */
  const formatDateTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => n.toString().padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  const CHANGE_TYPE_CONFIG: Record<
    string,
    { label: string; color: string; bg: string; icon: any }
  > = {
    MEMBERSHIP_UPGRADE: {
      label: "会员升级",
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200/80",
      icon: ArrowUpCircle,
    },
    UPGRADE: {
      label: "会员升级",
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200/80",
      icon: ArrowUpCircle,
    },
    LEVEL_UP: {
      label: "等级提升",
      color: "text-emerald-700",
      bg: "bg-emerald-50 border-emerald-200/80",
      icon: ArrowUpCircle,
    },
    MEMBERSHIP_RENEW: {
      label: "会员续费",
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200/80",
      icon: RefreshCw,
    },
    RENEW: {
      label: "会员续费",
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200/80",
      icon: RefreshCw,
    },
    LEVEL_DOWN: {
      label: "等级降低",
      color: "text-amber-700",
      bg: "bg-amber-50 border-amber-200/80",
      icon: ArrowDownCircle,
    },
    DOWNGRADE: {
      label: "会员降级",
      color: "text-amber-700",
      bg: "bg-amber-50 border-amber-200/80",
      icon: ArrowDownCircle,
    },
    QUOTA_CHANGE: {
      label: "配额变更",
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200/80",
      icon: Settings,
    },
    MANUAL_ADJUST: {
      label: "手动调整",
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200/80",
      icon: Edit,
    },
    ADMIN_SET: {
      label: "后台设定",
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200/80",
      icon: Edit,
    },
  };

  const getChangeTypeBadge = (type: string) => {
    const config = CHANGE_TYPE_CONFIG[type] || {
      label: type === "MEMBERSHIP_UPGRADE" ? "会员升级" : type,
      color: "text-slate-700",
      bg: "bg-slate-50 border-slate-200",
      icon: History,
    };
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${config.bg} ${config.color}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{config.label}</span>
      </span>
    );
  };

  /** 格式化详细变更原因 */
  const formatDetailedReason = (log: ChangeLog) => {
    let text = (log.reason || "").trim();
    if (text === "在线支付月费开通") {
      text = "在线支付月付开通会员";
    } else if (text === "在线支付年费开通") {
      text = "在线支付年付开通会员";
    }

    if (log.newValue?.nameZh) {
      const fromZh = log.oldValue?.nameZh || "免费版";
      const toZh = log.newValue.nameZh;
      if (!text.includes(toZh)) {
        text += `（${fromZh} → ${toZh}）`;
      }
    } else if (log.level?.nameZh && !text.includes(log.level.nameZh)) {
      text += `（升级为 ${log.level.nameZh}）`;
    }

    return text || "系统常规状态记录";
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部统一导航 */}
      <MembershipNavHeader
        title="会员变更日志"
        subtitle="溯源审计全站用户等级调整、配额增减、管理员操作轨迹与历史原因"
      />

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
                  placeholder="搜索用户 ID / 用户名 / 变更原因..."
                  value={filters.userId}
                  onChange={(e) => {
                    setFilters({ ...filters, userId: e.target.value });
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold transition-all bg-white placeholder:text-slate-400 text-slate-700"
                />
              </div>
              <select
                value={filters.changeType}
                onChange={(e) => {
                  setFilters({ ...filters, changeType: e.target.value });
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="w-full sm:w-36 h-10 px-3.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white cursor-pointer shrink-0 text-slate-700"
              >
                <option value="">全部类型</option>
                <option value="MEMBERSHIP_UPGRADE">会员升级</option>
                <option value="LEVEL_UP">等级提升</option>
                <option value="LEVEL_DOWN">等级降低</option>
                <option value="QUOTA_CHANGE">配额变更</option>
                <option value="MANUAL_ADJUST">手动调整</option>
              </select>
              <button
                type="button"
                onClick={loadLogs}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs border border-slate-200/80 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
                <span>刷新日志</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100/90 px-3.5 py-2 rounded-xl border border-slate-200/70 shrink-0 self-start md:self-auto">
              <History className="w-4 h-4 text-[#3182ce]" />
              <span>共 {pagination.total} 条日志</span>
            </div>
          </div>
        </div>

        {/* 日志列表 */}
        {loading ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600 font-medium">加载日志数据中...</p>
              </div>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无会员变更日志数据</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
              <div className="relative overflow-x-auto">
                <table className="w-full table-auto min-w-[950px]">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        变更类型
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        变更等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        变更原因
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        变更时间
                      </th>
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getChangeTypeBadge(log.changeType)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {log.user?.avatar ? (
                              <img
                                src={log.user.avatar}
                                alt={log.user.name}
                                className="w-10 h-10 shrink-0 rounded-full object-cover border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-2xs group-hover:scale-105 transition-transform">
                                {log.user?.name?.[0]?.toUpperCase() || "U"}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div
                                className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                                title={log.user?.name}
                              >
                                {log.user?.name || "未知用户"}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5 font-medium">
                                {log.user?.email && (
                                  <span
                                    className="flex items-center gap-1 whitespace-nowrap"
                                    title={log.user.email}
                                  >
                                    <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                                    <span className="truncate">{log.user.email}</span>
                                  </span>
                                )}
                                {log.user?.phone && (
                                  <span
                                    className="flex items-center gap-1 whitespace-nowrap"
                                    title={log.user.phone}
                                  >
                                    <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                                    <span className="truncate">{log.user.phone}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {log.level ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform duration-300"
                                style={{
                                  backgroundColor: `${log.level.color}20`,
                                }}
                              >
                                {log.level.icon || "👑"}
                              </div>
                              <div className="font-medium text-slate-800">
                                {log.level.nameZh}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500 font-medium">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div
                            className="text-xs text-slate-700 font-medium max-w-sm leading-relaxed"
                            title={formatDetailedReason(log)}
                          >
                            {formatDetailedReason(log)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span
                              className="font-mono tracking-tight"
                              title={`变更时间：${formatDateTime(log.createdAt)}`}
                            >
                              {formatDateTime(log.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(log.user?.email || log.userId)}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                              title="反查当事用户画像与履历"
                            >
                              <User className="w-3.5 h-3.5" />
                              <span>用户画像</span>
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
                  itemLabel="条变更记录"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
