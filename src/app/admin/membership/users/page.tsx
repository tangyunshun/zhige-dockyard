"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
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

export default function AdminMembershipUsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<MemberUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
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
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.membershipLevel && {
          membershipLevel: filters.membershipLevel,
        }),
      });

      const res = await fetch(`/api/admin/membership/users?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data.users);
        setPagination(data.data.pagination);
      } else {
        const error = await res.json();
        console.error("Load users error:", error);
        toast.error(error.message || "加载用户失败");
      }
    } catch (error) {
      console.error("Load users error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
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
            <h1 className="text-xl font-bold text-slate-800">会员用户管理</h1>
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
                <option value="FREE">免费版</option>
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
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        用户信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        注册时间
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
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-sm group-hover:scale-110 transition-transform duration-300">
                              {user.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                {user.name}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {user.email}
                                </span>
                                {user.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {user.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {user.membershipConfig ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform duration-300"
                                style={{
                                  backgroundColor: `${user.membershipConfig.color}20`,
                                }}
                              >
                                {user.membershipConfig.icon || "👑"}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                  {user.membershipConfig.nameZh}
                                </div>
                                <div className="text-xs text-slate-500 font-medium">
                                  {user.membershipConfig.name}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500 font-medium">
                              未知等级
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {new Date(user.createdAt).toLocaleDateString(
                              "zh-CN",
                            )}
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
