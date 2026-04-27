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
  Users,
  Eye,
  LogOut,
  Award,
  CheckCircle,
} from "lucide-react";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  role: string;
  status: string;
  avatar?: string | null;
  membershipLevel: string;
  tenantId?: string | null;
  lastLoginAt?: string | null;
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
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);

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

  const toggleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
    setShowBatchActions(newSelected.size > 0);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === (userData?.users.length || 0)) {
      setSelectedUsers(new Set());
      setShowBatchActions(false);
    } else {
      const allIds = new Set(userData?.users.map((u) => u.id) || []);
      setSelectedUsers(allIds);
      setShowBatchActions(true);
    }
  };

  const handleBatchDelete = async () => {
    if (
      !confirm(
        `确定要删除选中的 ${selectedUsers.size} 个用户吗？此操作不可恢复！`,
      )
    )
      return;

    try {
      const res = await fetch("/api/admin/users/batch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
      });

      if (!res.ok) throw new Error("批量删除失败");

      showToast(`已删除 ${selectedUsers.size} 个用户`, "success");
      setSelectedUsers(new Set());
      setShowBatchActions(false);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Batch delete error:", error);
      showToast("批量删除失败", "error");
    }
  };

  const handleBatchActivate = async () => {
    try {
      const res = await fetch("/api/admin/users/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          status: "active",
        }),
      });

      if (!res.ok) throw new Error("批量激活失败");

      showToast(`已激活 ${selectedUsers.size} 个用户`, "success");
      setSelectedUsers(new Set());
      setShowBatchActions(false);
      loadUsers(currentPage);
    } catch (error) {
      console.error("Batch activate error:", error);
      showToast("批量激活失败", "error");
    }
  };

  const handleViewDetails = (user: User) => {
    setViewingUser(user);
    setShowViewModal(true);
  };

  const handleForceLogout = async (userId: string) => {
    if (!confirm("确定要强制该用户下线吗？用户当前的所有操作将会中断。"))
      return;

    try {
      const res = await fetch("/api/admin/user/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) throw new Error("强制下线失败");

      showToast("用户已被强制下线", "success");
      setShowActionMenu(null);
    } catch (error) {
      console.error("Force logout error:", error);
      showToast("强制下线失败", "error");
    }
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

  const getMembershipLevelBadge = (level: string) => {
    const levelMap: Record<string, string> = {
      FREE: "普通会员",
      BRONZE: "青铜会员",
      SILVER: "白银会员",
      GOLD: "黄金会员",
      DIAMOND: "钻石会员",
      CROWN: "皇冠会员",
    };

    return (
      <span className="px-2 py-1 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 text-[#d97706] text-xs font-bold rounded-lg border border-[#f59e0b]/20">
        {levelMap[level] || level}
      </span>
    );
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
    <div className="space-y-6 pb-8">
      {/* Toast 容器 */}
      <div
        id="zg-toast-container"
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
      ></div>

      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          用户管理
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          管理系统用户、分配权限、审核用户
        </p>
      </div>

      {/* 筛选工具栏 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户名、邮箱、手机号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-11 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-sm font-medium transition-all bg-white/80"
            >
              <option value="all">所有角色</option>
              <option value="super_admin">超级管理员</option>
              <option value="admin">管理员</option>
              <option value="user">普通用户</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-sm font-medium transition-all bg-white/80"
            >
              <option value="all">所有状态</option>
              <option value="active">活跃</option>
              <option value="inactive">未激活</option>
              <option value="banned">已封禁</option>
            </select>
            <button
              onClick={handleSearch}
              className="inline-flex items-center px-5 h-11 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Filter className="w-4 h-4 mr-2" />
              筛选
            </button>
          </div>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

        {/* 批量操作工具栏 */}
        {showBatchActions && (
          <div className="relative bg-gradient-to-r from-[#3182ce]/10 to-[#8b5cf6]/10 border-b border-white/50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-700">
                已选择{" "}
                <span className="text-[#3182ce]">{selectedUsers.size}</span>{" "}
                个用户
              </span>
              <button
                onClick={() => {
                  setSelectedUsers(new Set());
                  setShowBatchActions(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                取消选择
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBatchActivate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-sm font-bold rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <CheckCircle className="w-4 h-4" />
                批量激活
              </button>
              <button
                onClick={handleBatchDelete}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-bold rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                批量删除
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedUsers.size ===
                              (userData?.users.length || 0) &&
                            userData?.users.length !== 0
                          }
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        用户信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        手机号
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        角色
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        最后登录
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        注册时间
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userData?.users.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-20 text-center">
                          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Users className="w-8 h-8 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium text-sm">
                            暂无用户数据
                          </p>
                        </td>
                      </tr>
                    ) : (
                      userData?.users.map((user) => (
                        <tr
                          key={user.id}
                          className={`group hover:bg-white/60 transition-all duration-300 ${
                            selectedUsers.has(user.id) ? "bg-[#3182ce]/5" : ""
                          }`}
                        >
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedUsers.has(user.id)}
                              onChange={() => toggleSelectUser(user.id)}
                              className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                                {user.name?.charAt(0) ||
                                  user.email?.charAt(0) ||
                                  "U"}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                  {user.name || "匿名用户"}
                                </div>
                                <div className="text-xs text-slate-500 font-medium">
                                  {user.email || "未设置邮箱"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {user.phone ? (
                              <div className="text-sm text-slate-700 font-medium">
                                {user.phone}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                未设置
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {getMembershipLevelBadge(user.membershipLevel)}
                          </td>
                          <td className="px-6 py-4">
                            {getRoleBadge(user.role)}
                          </td>
                          <td className="px-6 py-4">
                            {getStatusBadge(user.status)}
                          </td>
                          <td className="px-6 py-4">
                            {user.lastLoginAt ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span className="text-sm text-slate-600 font-medium">
                                  {formatTimeAgo(user.lastLoginAt)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                从未登录
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-medium">
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
                                <MoreVertical className="w-5 h-5 text-slate-600" />
                              </button>

                              {showActionMenu === user.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowActionMenu(null)}
                                  />
                                  <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-white/90 py-2 z-20 overflow-hidden">
                                    <button
                                      onClick={() => {
                                        handleEdit(user);
                                        setShowActionMenu(null);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#3182ce]/5 transition-colors border-b border-slate-50"
                                    >
                                      <Edit2 className="w-4 h-4 text-[#3182ce]" />
                                      编辑用户
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleToggleStatus(user);
                                        setShowActionMenu(null);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#10b981]/5 transition-colors border-b border-slate-50"
                                    >
                                      {user.status === "active" ? (
                                        <>
                                          <UserX className="w-4 h-4 text-[#10b981]" />
                                          停用用户
                                        </>
                                      ) : (
                                        <>
                                          <UserCheck className="w-4 h-4 text-[#10b981]" />
                                          激活用户
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleViewDetails(user);
                                        setShowActionMenu(null);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-purple-50 transition-colors border-b border-slate-50"
                                    >
                                      <Eye className="w-4 h-4 text-purple-600" />
                                      查看详情
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleForceLogout(user.id);
                                        setShowActionMenu(null);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors"
                                    >
                                      <LogOut className="w-4 h-4 text-blue-600" />
                                      强制下线
                                    </button>
                                    <div className="my-2 border-t border-slate-100" />
                                    <button
                                      onClick={() => {
                                        handleDelete(user.id);
                                        setShowActionMenu(null);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
                <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent flex items-center justify-between">
                  <div className="text-sm text-slate-500 font-medium">
                    共 {userData.total} 个用户，第 {userData.page}/
                    {userData.totalPages} 页
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="px-4 py-2 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white rounded-xl text-sm font-semibold hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 编辑用户弹窗 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowEditModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-white/90">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
                编辑用户信息
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
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
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 font-medium"
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
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 font-medium"
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
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none font-medium transition-all"
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
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none font-medium transition-all"
                >
                  <option value="active">活跃</option>
                  <option value="inactive">未激活</option>
                  <option value="banned">已封禁</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleUpdateUser}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white rounded-xl font-semibold hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看详情弹窗 */}
      {showViewModal && viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowViewModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-white/90 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent sticky top-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
                用户详情
              </h3>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#3182ce]" />
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      用户 ID
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.id}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      用户名
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.name || "匿名用户"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      邮箱
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.email || "未设置"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      手机号
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.phone || "未设置"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 账户状态 */}
              <div>
                <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#3182ce]" />
                  账户状态
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      角色
                    </div>
                    <div>{getRoleBadge(viewingUser.role)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      状态
                    </div>
                    <div>{getStatusBadge(viewingUser.status)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      会员等级
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {getMembershipLevelBadge(viewingUser.membershipLevel)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      租户 ID
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.tenantId || "无"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 登录信息 */}
              <div>
                <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-[#3182ce]" />
                  登录信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      最后登录
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingUser.lastLoginAt
                        ? new Date(viewingUser.lastLoginAt).toLocaleString(
                            "zh-CN",
                          )
                        : "从未登录"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500 font-medium">
                      注册时间
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {new Date(viewingUser.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent sticky bottom-0">
              <button
                onClick={() => setShowViewModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition-all"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  handleEdit(viewingUser);
                }}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white rounded-xl font-semibold hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                编辑用户
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
