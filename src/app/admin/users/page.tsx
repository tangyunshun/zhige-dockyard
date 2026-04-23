"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Filter,
  MoreVertical,
  Edit2,
  Trash2,
  Shield,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  role: string;
  status: string;
  avatar?: string | null;
  createdAt: string;
}

interface UserData {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "", status: "" });

  useEffect(() => {
    loadUsers(currentPage);
  }, [currentPage, filterRole, filterStatus]);

  const loadUsers = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(searchQuery && { search: searchQuery }),
        ...(filterRole !== "all" && { role: filterRole }),
        ...(filterStatus !== "all" && { status: filterStatus }),
      });

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("加载用户列表失败");

      const result = await res.json();
      setUserData(result.data);
    } catch (error) {
      console.error("Load users error:", error);
      showToast("加载用户列表失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadUsers(1);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({ role: user.role, status: user.status });
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    try {
      const res = await fetch("/api/admin/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUser?.id,
          role: editForm.role,
          status: editForm.status,
        }),
      });

      if (!res.ok) throw new Error("更新用户失败");

      showToast("用户信息已更新", "success");
      setShowEditModal(false);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Update user error:", error);
      showToast("更新用户失败", "error");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("确定要删除该用户吗？此操作不可恢复！")) return;

    try {
      const res = await fetch(`/api/admin/user?userId=${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除用户失败");

      showToast("用户已删除", "success");
      loadUsers(currentPage);
    } catch (error) {
      console.error("Delete user error:", error);
      showToast("删除用户失败", "error");
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch("/api/admin/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error("更新状态失败");

      showToast(`用户已${newStatus === "active" ? "激活" : "停用"}`, "success");
      loadUsers(currentPage);
    } catch (error) {
      console.error("Toggle status error:", error);
      showToast("操作失败", "error");
    }
  };

  const showToast = (message: string, type: "success" | "error") => {
    const container = document.getElementById("zg-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `zg-toast ${type === "success" ? "show" : ""}`;
    toast.innerHTML = `
      <span class="${type === "success" ? "text-green-600" : "text-red-600"} font-bold">
        ${type === "success" ? "✓" : "✕"}
      </span>
      <span class="text-sm font-medium text-slate-700">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case "SUPER_ADMIN":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            超级管理员
          </span>
        );
      case "ADMIN":
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
            管理员
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
            普通用户
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            活跃
          </span>
        );
      case "INACTIVE":
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            未激活
          </span>
        );
      case "BANNED":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            已封禁
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
            {status}
          </span>
        );
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  return (
    <div className="space-y-6">
      {/* Toast 容器 */}
      <div
        id="zg-toast-container"
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
      ></div>

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">用户管理</h1>
        <p className="text-sm text-slate-500">
          管理系统用户、分配权限、审核用户
        </p>
      </div>

      {/* 筛选工具栏 */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索用户名、邮箱、手机号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
          >
            <option value="all">所有角色</option>
            <option value="super_admin">超级管理员</option>
            <option value="admin">管理员</option>
            <option value="user">普通用户</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
          >
            <option value="all">所有状态</option>
            <option value="active">活跃</option>
            <option value="inactive">未激活</option>
            <option value="banned">已封禁</option>
          </select>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            筛选
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      注册时间
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {userData?.users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-20 text-center text-slate-400"
                      >
                        暂无用户数据
                      </td>
                    </tr>
                  ) : (
                    userData?.users.map((user) => (
                      <tr
                        key={user.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold">
                              {user.name?.charAt(0) ||
                                user.email?.charAt(0) ||
                                "U"}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800">
                                {user.name || "匿名用户"}
                              </div>
                              <div className="text-xs text-slate-500">
                                {user.email || "未设置邮箱"}
                              </div>
                              {user.phone && (
                                <div className="text-xs text-slate-400">
                                  {user.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                        <td className="px-6 py-4">
                          {getStatusBadge(user.status)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatTimeAgo(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() =>
                                setShowActionMenu(
                                  showActionMenu === user.id ? null : user.id,
                                )
                              }
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-slate-600" />
                            </button>

                            {showActionMenu === user.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowActionMenu(null)}
                                />
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-20">
                                  <button
                                    onClick={() => {
                                      handleEdit(user);
                                      setShowActionMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    编辑用户
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleToggleStatus(user);
                                      setShowActionMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    {user.status === "active" ? (
                                      <>
                                        <UserX className="w-4 h-4" />
                                        停用用户
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="w-4 h-4" />
                                        激活用户
                                      </>
                                    )}
                                  </button>
                                  <hr className="my-2 border-slate-200" />
                                  <button
                                    onClick={() => {
                                      handleDelete(user.id);
                                      setShowActionMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    删除用户
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {userData && userData.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  共 {userData.total} 个用户，第 {userData.page}/
                  {userData.totalPages} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(userData.totalPages, p + 1),
                      )
                    }
                    disabled={currentPage === userData.totalPages}
                    className="px-4 py-2 bg-[#3182ce] text-white rounded-lg text-sm hover:bg-[#2563eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 编辑用户弹窗 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowEditModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">编辑用户信息</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  用户名
                </label>
                <input
                  type="text"
                  value={editingUser.name || ""}
                  disabled
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={editingUser.email || ""}
                  disabled
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  角色
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                  <option value="super_admin">超级管理员</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  状态
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                >
                  <option value="active">活跃</option>
                  <option value="inactive">未激活</option>
                  <option value="banned">已封禁</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdateUser}
                className="flex-1 px-4 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
