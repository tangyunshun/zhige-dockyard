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
  Users,
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  Crown,
  RefreshCw,
  Download,
} from "lucide-react";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";

interface MemberUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  membershipLevel: string;
  createdAt: string;
  membershipActivatedAt?: string | null;
  membershipExpireAt?: string | null;
  membershipConfig: {
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

export default function AdminMembershipUsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState<MemberUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    membershipLevel: "",
    search: "",
  });

  useEffect(() => {
    loadUsers();
  }, [pagination.page, filters]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const authToken = getAuthToken();
      const params = new URLSearchParams({
        page: "1",
        limit: "5000",
        ...(filters.membershipLevel && {
          membership_level: filters.membershipLevel,
        }),
        ...(filters.search && {
          search: filters.search,
        }),
      });

      const res = await fetch(`/api/admin/membership/users?${params}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        toast.error("获取会员用户全量数据失败，请重试");
        return;
      }

      const responseData = await res.json();
      const allUsers: MemberUser[] = responseData.data?.users || [];

      if (allUsers.length === 0) {
        toast.error("当前筛选条件下无会员用户数据可导出");
        return;
      }

      const levelNameMap: Record<string, string> = {
        FREE: "免费版",
        PRO: "专业版",
        ENTERPRISE: "企业版",
        FLAGSHIP: "旗舰版",
        CROWN: "皇冠版",
      };

      exportToExcel({
        filename: "知阁会员用户列表",
        sheetName: "会员用户",
        data: allUsers,
        columns: [
          { header: "用户 ID", key: "id", width: 28 },
          { header: "用户姓名", key: "name", width: 16 },
          { header: "电子邮箱", key: "email", width: 26 },
          {
            header: "手机号码",
            key: "phone",
            width: 16,
            formatter: (v: any) => v || "-",
          },
          {
            header: "当前会员等级",
            key: "membershipLevel",
            width: 16,
            formatter: (_v: string, row: MemberUser) =>
              row.membershipConfig?.nameZh || levelNameMap[row.membershipLevel] || row.membershipLevel || "未知等级",
          },
          {
            header: "会员开通时间",
            key: "membershipActivatedAt",
            width: 22,
            formatter: formatExcelDateTime,
          },
          {
            header: "会员到期时间",
            key: "membershipExpireAt",
            width: 22,
            formatter: formatExcelDateTime,
          },
          {
            header: "账号注册时间",
            key: "createdAt",
            width: 22,
            formatter: formatExcelDateTime,
          },
        ],
      });

      toast.success(`成功导出 ${allUsers.length} 位会员用户信息！`);
    } catch (err) {
      console.error("导出会员用户 Excel 失败:", err);
      toast.error("导出 Excel 异常，请检查控制台");
    } finally {
      setExporting(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: String(PAGE_SIZE),
        ...(filters.membershipLevel && {
          membership_level: filters.membershipLevel,
        }),
        ...(filters.search && {
          search: filters.search,
        }),
      });

      const res = await fetch(`/api/admin/membership/users?${params}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      console.log("=== API 响应 ===");
      console.log("状态码:", res.status);

      const responseData = await res.json();
      console.log("响应数据:", responseData);

      if (res.ok) {
        console.log("✓ 加载成功");
        setUsers(responseData.data.users);
        setPagination(responseData.data.pagination);
      } else {
        console.error("✗ 加载失败");
        console.error("错误详情:", responseData);
        if (responseData.error) {
          console.error("错误消息:", responseData.error);
        }
        if (responseData.code) {
          console.error("错误代码:", responseData.code);
        }
        toast.error(responseData.message || "加载用户失败");
      }
    } catch (error) {
      console.error("=== 捕获异常 ===");
      console.error("错误:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部统一导航 */}
      <MembershipNavHeader
        title="会员用户管理"
        subtitle="集中检索全站付费与特殊权益会员，追踪身份等级、到期时效与账号画像"
      />

      {/* 主内容区 */}
      <div>
        {/* 操作过滤栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/90 shadow-2xs p-4 mb-5 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl pointer-events-none"></div>
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
              {/* 搜索框：提供充足宽度，杜绝 placeholder 截断 */}
              <div className="relative w-full sm:w-80 md:w-96 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索用户名、邮箱、手机号..."
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, search: e.target.value }));
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-white placeholder:text-slate-400"
                />
              </div>

              {/* 等级下拉筛选 */}
              <select
                value={filters.membershipLevel}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, membershipLevel: e.target.value }));
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="w-full sm:w-36 h-10 px-3.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white cursor-pointer shrink-0 text-slate-700"
              >
                <option value="">全部等级</option>
                <option value="BRONZE">青铜版</option>
                <option value="SILVER">白银版</option>
                <option value="GOLD">黄金版</option>
                <option value="DIAMOND">钻石版</option>
                <option value="CROWN">皇冠版</option>
              </select>

              {/* 刷新数据按钮 */}
              <button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs border border-slate-200/80 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
                <span>刷新数据</span>
              </button>

              {/* 导出 Excel 按钮 */}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exporting || loading}
                className="inline-flex items-center gap-1.5 px-3.5 h-10 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs border border-emerald-200/90 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                title="导出符合当前筛选条件的全部会员用户为 Excel 表格"
              >
                <Download className={`w-3.5 h-3.5 text-emerald-600 ${exporting ? "animate-bounce" : ""}`} />
                <span>{exporting ? "导出中..." : "导出 Excel"}</span>
              </button>
            </div>

            {/* 会员总数徽章统计 */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100/90 px-3.5 py-2 rounded-xl border border-slate-200/70 shrink-0 self-start md:self-auto">
              <Users className="w-4 h-4 text-[#3182ce]" />
              <span>共 {pagination.total} 位会员</span>
            </div>
          </div>
        </div>

        {/* 用户列表 */}
        {loading ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600 font-medium">加载用户数据中...</p>
              </div>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-slate-100 opacity-50 blur-3xl"></div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无会员数据</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
              <div className="relative overflow-x-auto">
                <table className="w-full table-auto min-w-[960px]">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        开通会员时间
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        注册时间
                      </th>
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-sm group-hover:scale-110 transition-transform duration-300">
                              {user.name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div
                                className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                                title={user.name}
                              >
                                {user.name}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
                                <span
                                  className="flex items-center gap-1 whitespace-nowrap"
                                  title={user.email}
                                >
                                  <Mail className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{user.email}</span>
                                </span>
                                {user.phone && (
                                  <span
                                    className="flex items-center gap-1 whitespace-nowrap"
                                    title={user.phone}
                                  >
                                    <Phone className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      {user.phone}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.membershipConfig ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform duration-300"
                                style={{
                                  backgroundColor: `${user.membershipConfig.color}20`,
                                }}
                              >
                                {user.membershipConfig.icon || "👑"}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                                  title={user.membershipConfig.nameZh}
                                >
                                  {user.membershipConfig.nameZh}
                                </div>
                                <div
                                  className="text-xs text-slate-500 font-medium truncate"
                                  title={user.membershipConfig.name}
                                >
                                  {user.membershipConfig.name}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">
                              未知等级
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.membershipActivatedAt ? (
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <Calendar className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                              <span
                                className="font-mono tracking-tight"
                                title={`开通时间：${formatDateTime(user.membershipActivatedAt)}${user.membershipExpireAt ? `\n到期时间：${formatDateTime(user.membershipExpireAt)}` : ""}`}
                              >
                                {formatDateTime(user.membershipActivatedAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              -
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span
                              className="font-mono tracking-tight"
                              title={`注册时间：${formatDateTime(user.createdAt)}`}
                            >
                              {formatDateTime(user.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(user.email || user.id)}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                              title="前往用户管理中心查看或调整该用户"
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
                  itemLabel="个会员用户"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
