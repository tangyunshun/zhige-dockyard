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
  Crown,
} from "lucide-react";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";

interface MemberUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  membershipLevel: string;
  createdAt: string;
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

export default function AdminMembershipUsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
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
          <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索用户名、邮箱、手机号..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  className="pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>
              <select
                value={filters.membershipLevel}
                onChange={(e) =>
                  setFilters({ ...filters, membershipLevel: e.target.value })
                }
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
              >
                <option value="">全部等级</option>
                <option value="BRONZE">青铜版</option>
                <option value="SILVER">白银版</option>
                <option value="GOLD">黄金版</option>
                <option value="DIAMOND">钻石版</option>
                <option value="CROWN">皇冠版</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
              <Users className="w-4 h-4" />
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
                <table className="w-full table-auto min-w-[860px]">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        会员等级
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
                          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                            <Calendar className="w-4 h-4 shrink-0 text-slate-400" />
                            <span
                              className="whitespace-nowrap"
                              title={new Date(
                                user.createdAt,
                              ).toLocaleDateString("zh-CN")}
                            >
                              {new Date(user.createdAt).toLocaleDateString(
                                "zh-CN",
                              )}
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
