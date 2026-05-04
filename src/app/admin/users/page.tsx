"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
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
  User,
  Key,
  AlertCircle,
} from "lucide-react";
import DataTableFilter, {
  FilterConfig,
} from "@/components/common/DataTableFilter";
import SearchInput from "@/components/common/SearchInput";

// 定义完整的筛选项值（不依赖动态数据）
const ROLE_OPTIONS = [
  { value: "super_admin", label: "超级管理员" },
  { value: "admin", label: "管理员" },
  { value: "user", label: "普通用户" },
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: "active", label: "活跃" },
  { value: "inactive", label: "未激活" },
  { value: "banned", label: "已封禁" },
];

const LOGIN_STATUS_OPTIONS = [
  { value: "online", label: "在线" },
  { value: "offline", label: "离线" },
];

const MEMBERSHIP_LEVEL_OPTIONS = [
  { value: "FREE", label: "非会员" },
  { value: "BRONZE", label: "青铜会员" },
  { value: "SILVER", label: "白银会员" },
  { value: "GOLD", label: "黄金会员" },
  { value: "DIAMOND", label: "钻石会员" },
  { value: "CROWN", label: "皇冠会员" },
];

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
  const [filterAccountStatus, setFilterAccountStatus] = useState<string>("all"); // 账号状态
  const [filterLoginStatus, setFilterLoginStatus] = useState<string>("all"); // 登录状态
  const [filterMembershipLevel, setFilterMembershipLevel] =
    useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "", status: "" });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const isProcessingRef = React.useRef(false);
  const forceLogoutUserIdRef = React.useRef<string | null>(null);

  // 处理 401 错误（未授权/被强制下线）- 现在由全局 AuthCheck 处理
  const handleUnauthorized = async (response: Response) => {
    if (response.status === 401) {
      try {
        const errorData = await response.json();
        // 清除本地存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        // 清除 cookie
        document.cookie = "auth_token=; path=/; max-age=0";
        // 显示提示并重定向
        showToast(errorData.error || "您已被强制下线，请重新登录", "error");
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 1500);
        return true;
      } catch (e) {
        console.error("Error parsing 401 response:", e);
      }
    }
    return false;
  };

  useEffect(() => {
    // 获取当前登录用户 ID 和角色
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    const userRole =
      typeof window !== "undefined" ? localStorage.getItem("userRole") : null;
    setCurrentUserId(userId);
    setCurrentUserRole(userRole);
    console.log("当前用户 ID:", userId, "角色:", userRole);
    loadUsers(currentPage);
  }, [
    currentPage,
    filterRole,
    filterAccountStatus,
    filterLoginStatus,
    filterMembershipLevel,
  ]);

  const loadUsers = async (page: number, searchValue?: string) => {
    try {
      setLoading(true);
      const currentSearch =
        searchValue !== undefined ? searchValue : searchQuery;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        ...(currentSearch && { search: currentSearch }),
        ...(filterRole !== "all" && { role: filterRole }),
        ...(filterAccountStatus !== "all" && {
          accountStatus: filterAccountStatus,
        }),
        ...(filterLoginStatus !== "all" && {
          loginStatus: filterLoginStatus,
        }),
        ...(filterMembershipLevel !== "all" && {
          membershipLevel: filterMembershipLevel,
        }),
      });

      const res = await fetch(`/api/admin/users?${params}`);

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

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

  const handleConfirm = () => {
    if (forceLogoutUserIdRef.current) {
      // 执行强制下线操作
      executeForceLogout(forceLogoutUserIdRef.current);
      forceLogoutUserIdRef.current = null;
      setShowConfirmModal(false);
    } else if (confirmAction) {
      // 其他确认操作（如停用用户）
      confirmAction();
      setConfirmAction(null);
      setShowConfirmModal(false);
    }
  };

  const executeForceLogout = async (userId: string) => {
    try {
      const currentUserId = localStorage.getItem("userId");

      const res = await fetch("/api/admin/user/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUserId}`,
        },
        body: JSON.stringify({ userId }),
      });

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

      if (!res.ok) {
        // 不显示错误，ActivityMonitor 会处理超时跳转
        console.error("Force logout failed:", res.status);
        return;
      }

      showToast("用户已被强制下线", "success");
      loadUsers(currentPage);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "强制下线失败",
        "error",
      );
    }
  };

  const handleSearch = useCallback(
    (searchValue: string = searchQuery) => {
      setCurrentPage(1);
      loadUsers(1, searchValue);
    },
    [searchQuery],
  );

  // 实时搜索处理函数（带防抖）
  const handleRealTimeSearch = useCallback((value: string) => {
    setCurrentPage(1);
    loadUsers(1, value);
  }, []);

  const handleResetFilters = () => {
    setFilterRole("all");
    setFilterAccountStatus("all");
    setFilterLoginStatus("all");
    setFilterMembershipLevel("all");
    setSearchQuery("");
    setCurrentPage(1);
    loadUsers(1, "");
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

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

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

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

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
    // 防止重复点击
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      // 从当前显示的用户列表中查找用户信息
      const user = userData?.users.find((u) => u.id === userId);
      if (!user) return;

      setConfirmMessage(
        `确定要强制用户 "${user.name || user.email}" 下线吗？用户当前的所有操作将会中断。`,
      );

      // 保存用户 ID 到 ref，供确认按钮使用
      forceLogoutUserIdRef.current = userId;

      setShowConfirmModal(true);
      setShowActionMenu(null);
      isProcessingRef.current = false;
    } catch (error) {
      isProcessingRef.current = false;
      console.error("Force logout setup error:", error);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({ role: user.role, status: user.status });
    setShowEditModal(true);
  };

  const handleChangeStatus = async (userId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (await handleUnauthorized(res)) {
        return;
      }

      if (!res.ok) throw new Error("修改状态失败");

      const statusText =
        newStatus === "active"
          ? "已激活"
          : newStatus === "inactive"
            ? "已停用"
            : "已封禁";
      showToast(`用户状态已${statusText}`, "success");
      loadUsers(currentPage);
    } catch (error) {
      console.error("Change status error:", error);
      showToast("修改状态失败", "error");
    }
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

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

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

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

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

    // 如果是停用操作，需要二次确认
    if (newStatus === "inactive") {
      setConfirmMessage(
        `确定要停用用户 "${user.name || user.email}" 吗？停用后该用户将无法登录系统。`,
      );
      setConfirmAction(async () => {
        try {
          const res = await fetch("/api/admin/user", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              status: newStatus,
            }),
          });

          // 处理 401 错误（未授权/被强制下线）
          if (await handleUnauthorized(res)) {
            return;
          }

          if (!res.ok) throw new Error("更新状态失败");

          showToast("用户已停用", "success");
          loadUsers(currentPage);
        } catch (error) {
          showToast("停用失败", "error");
        }
      });
      setShowConfirmModal(true);
    } else {
      // 激活操作直接执行
      try {
        const res = await fetch("/api/admin/user", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            status: newStatus,
          }),
        });

        // 处理 401 错误（未授权/被强制下线）
        if (await handleUnauthorized(res)) {
          return;
        }

        if (!res.ok) throw new Error("更新状态失败");

        showToast("用户已激活", "success");
        loadUsers(currentPage);
      } catch (error) {
        showToast("激活失败", "error");
      }
    }
  };

  const showToast = (message: string, type: "success" | "error") => {
    const container = document.getElementById("zg-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `zg-toast ${type === "success" ? "show" : ""}`;

    // 根据设计系统规范，使用正确的颜色和图标
    const iconColor = type === "success" ? "#10b981" : "#ef4444";
    const icon = type === "success" ? "✓" : "✕";

    toast.innerHTML = `
      <span style="color: ${iconColor}; font-weight: 700; font-size: 16px; line-height: 1; display: flex; align-items: center;">
        ${icon}
      </span>
      <span style="font-size: 14px; font-weight: 600; color: #0f172a; white-space: nowrap;">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const getMembershipLevelBadge = (level: string) => {
    const levelMap: Record<string, string> = {
      FREE: "非会员",
      BRONZE: "青铜会员",
      SILVER: "白银会员",
      GOLD: "黄金会员",
      DIAMOND: "钻石会员",
      CROWN: "皇冠会员",
    };

    // 如果是 FREE 等级，显示普通文本
    if (level === "FREE") {
      return (
        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-medium rounded-lg">
          {levelMap[level] || "非会员"}
        </span>
      );
    }

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

  const getAccountStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
            活跃
          </span>
        );
      case "INACTIVE":
        return (
          <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
            未激活
          </span>
        );
      case "BANNED":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            已封禁
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
            未知
          </span>
        );
    }
  };

  const getLoginStatusBadge = (isOnline: boolean) => {
    if (isOnline) {
      return (
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          在线
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
          离线
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
      {/* Toast 容器 - 按照设计系统规范 */}
      <style jsx global>{`
        #zg-toast-container {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          align-items: center;
        }
        .zg-toast {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 99px;
          box-shadow:
            0 8px 24px -6px rgba(15, 23, 42, 0.1),
            0 2px 6px -2px rgba(15, 23, 42, 0.04);
          padding: 8px 12px 8px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          max-width: 480px;
          transform: translateY(-20px) scale(0.95);
          opacity: 0;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.15);
          pointer-events: auto;
        }
        .zg-toast.show {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
      `}</style>

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
          <div className="flex-1">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleRealTimeSearch}
              placeholder="搜索用户名、邮箱、手机号..."
              debounceMs={300}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataTableFilter
              filters={[
                {
                  key: "role",
                  label: "角色",
                  placeholder: "所有角色",
                  options: ROLE_OPTIONS,
                },
                {
                  key: "accountStatus",
                  label: "账号状态",
                  placeholder: "所有账号状态",
                  options: ACCOUNT_STATUS_OPTIONS,
                },
                {
                  key: "loginStatus",
                  label: "登录状态",
                  placeholder: "所有登录状态",
                  options: LOGIN_STATUS_OPTIONS,
                },
                {
                  key: "membershipLevel",
                  label: "等级",
                  placeholder: "所有等级",
                  options: MEMBERSHIP_LEVEL_OPTIONS,
                },
              ]}
              values={{
                role: filterRole,
                accountStatus: filterAccountStatus,
                loginStatus: filterLoginStatus,
                membershipLevel: filterMembershipLevel,
              }}
              onChange={(key, value) => {
                if (key === "role") setFilterRole(value);
                if (key === "accountStatus") setFilterAccountStatus(value);
                if (key === "loginStatus") setFilterLoginStatus(value);
                if (key === "membershipLevel") setFilterMembershipLevel(value);
              }}
              onReset={handleResetFilters}
              showResetButton={true}
            />
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
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm">
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
                <table className="w-full table-auto">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-center whitespace-nowrap">
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
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        手机号
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        会员等级
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        角色
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        账号状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        登录状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        最后登录
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        注册时间
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-slate-100"
                    onClick={() => setShowActionMenu(null)}
                  >
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
                              <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                                {user.name?.charAt(0) ||
                                  user.email?.charAt(0) ||
                                  "U"}
                              </div>
                              <div>
                                <div
                                  className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors"
                                  title={user.name || "匿名用户"}
                                >
                                  {user.name || "匿名用户"}
                                </div>
                                <div
                                  className="text-xs text-slate-500 font-medium"
                                  title={user.email || "未设置邮箱"}
                                >
                                  {user.email || "未设置邮箱"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {user.phone ? (
                              <div
                                className="text-sm text-slate-700 font-medium"
                                title={user.phone}
                              >
                                {user.phone}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                未设置
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getMembershipLevelBadge(user.membershipLevel)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getRoleBadge(user.role)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getAccountStatusBadge(user.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getLoginStatusBadge(user.isOnline)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {user.lastLoginAt ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 shrink-0 rounded-full bg-green-500"></div>
                                <span
                                  className="text-sm text-slate-600 font-medium"
                                  title={formatTimeAgo(user.lastLoginAt)}
                                >
                                  {formatTimeAgo(user.lastLoginAt)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                从未登录
                              </span>
                            )}
                          </td>
                          <td
                            className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap"
                            title={formatTimeAgo(user.createdAt)}
                          >
                            {formatTimeAgo(user.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="relative inline-block">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowActionMenu(
                                    showActionMenu === user.id ? null : user.id,
                                  );
                                }}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center justify-center"
                              >
                                <MoreVertical className="w-5 h-5 text-slate-600" />
                              </button>

                              {showActionMenu === user.id && (
                                <>
                                  {/* 下拉菜单 - 使用 fixed 定位避免溢出 */}
                                  <div
                                    className="fixed right-8 top-[calc(50%+20px)] w-64 bg-white/98 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 py-2 z-50"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* 强制下线 - 只对在线的活跃用户显示，超级管理员专属操作，不能操作超级管理员和自己 */}
                                    {currentUserRole === "super_admin" &&
                                      user.status === "active" &&
                                      user.isOnline &&
                                      user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleForceLogout(user.id);
                                            setShowActionMenu(null);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50"
                                        >
                                          <LogOut className="w-4 h-4 text-blue-600" />
                                          强制下线
                                        </button>
                                      )}

                                    {/* 禁用登录 - 对离线的活跃用户显示（包括从未登录和已登录但当前离线的），超级管理员专属操作，不能操作超级管理员和自己 */}
                                    {currentUserRole === "super_admin" &&
                                      user.status === "active" &&
                                      !user.isOnline &&
                                      user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleStatus(user);
                                            setShowActionMenu(null);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 transition-colors border-b border-slate-50"
                                        >
                                          <UserX className="w-4 h-4 text-orange-600" />
                                          禁用登录
                                        </button>
                                      )}

                                    {/* 修改角色 - 只对非活跃用户显示，不能操作超级管理员 */}
                                    {user.status !== "active" &&
                                      user.role !== "super_admin" && (
                                        <button
                                          onClick={() => {
                                            handleEdit(user);
                                            setShowActionMenu(null);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#3182ce]/5 transition-colors border-b border-slate-50"
                                        >
                                          <Edit2 className="w-4 h-4 text-[#3182ce]" />
                                          修改角色
                                        </button>
                                      )}

                                    {/* 修改状态 - 所有用户都可以修改（除了超级管理员和自己） */}
                                    {user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <div className="relative group">
                                          <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#3182ce]/5 transition-colors border-b border-slate-50 cursor-pointer">
                                            <UserCheck className="w-4 h-4 text-[#3182ce]" />
                                            修改状态
                                            <svg
                                              className="w-4 h-4 ml-auto text-slate-400"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 5l7 7-7 7"
                                              />
                                            </svg>
                                          </button>
                                          {/* 状态选择子菜单 */}
                                          <div className="absolute left-full top-0 ml-2 w-40 bg-white/98 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                await handleChangeStatus(
                                                  user.id,
                                                  "active",
                                                );
                                                setShowActionMenu(null);
                                              }}
                                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                                                user.status === "active"
                                                  ? "bg-green-50 text-green-700 font-bold"
                                                  : "text-slate-700 hover:bg-green-50"
                                              }`}
                                            >
                                              <span
                                                className={`w-2 h-2 rounded-full ${
                                                  user.status === "active"
                                                    ? "bg-green-500"
                                                    : "bg-slate-300"
                                                }`}
                                              ></span>
                                              活跃
                                            </button>
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                await handleChangeStatus(
                                                  user.id,
                                                  "inactive",
                                                );
                                                setShowActionMenu(null);
                                              }}
                                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                                                user.status === "inactive"
                                                  ? "bg-orange-50 text-orange-700 font-bold"
                                                  : "text-slate-700 hover:bg-orange-50"
                                              }`}
                                            >
                                              <span
                                                className={`w-2 h-2 rounded-full ${
                                                  user.status === "inactive"
                                                    ? "bg-orange-500"
                                                    : "bg-slate-300"
                                                }`}
                                              ></span>
                                              未激活
                                            </button>
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                await handleChangeStatus(
                                                  user.id,
                                                  "banned",
                                                );
                                                setShowActionMenu(null);
                                              }}
                                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                                                user.status === "banned"
                                                  ? "bg-red-50 text-red-700 font-bold"
                                                  : "text-slate-700 hover:bg-red-50"
                                              }`}
                                            >
                                              <span
                                                className={`w-2 h-2 rounded-full ${
                                                  user.status === "banned"
                                                    ? "bg-red-500"
                                                    : "bg-slate-300"
                                                }`}
                                              ></span>
                                              已封禁
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                    {/* 停用/激活用户 - 只对非活跃用户显示（激活），不能操作超级管理员和自己 */}
                                    {user.status !== "active" &&
                                      user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <button
                                          onClick={() => {
                                            handleToggleStatus(user);
                                            setShowActionMenu(null);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#10b981]/5 transition-colors border-b border-slate-50"
                                        >
                                          {user.status === "inactive" ? (
                                            <>
                                              <UserCheck className="w-4 h-4 text-green-600" />
                                              激活用户
                                            </>
                                          ) : (
                                            <>
                                              <UserX className="w-4 h-4 text-orange-600" />
                                              停用用户
                                            </>
                                          )}
                                        </button>
                                      )}

                                    {/* 查看详情 - 所有用户都可以查看 */}
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

                                    {/* 删除用户 - 只对已停用用户显示，不能删除超级管理员和自己 */}
                                    {user.status === "banned" &&
                                      user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <>
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
                                        </>
                                      )}
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-white/90 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent sticky top-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
                修改角色信息
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 基本信息区域 */}
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></span>
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      用户名
                    </label>
                    <div className="text-sm font-semibold text-slate-800 px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {editingUser.name || "未设置"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      邮箱
                    </label>
                    <div className="text-sm font-semibold text-slate-800 px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {editingUser.email || "未设置"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      手机号
                    </label>
                    <div className="text-sm font-semibold text-slate-800 px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {editingUser.phone || "未设置"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 系统信息区域 */}
              <div className="bg-gradient-to-r from-green-50/50 to-teal-50/50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></span>
                  系统信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      当前角色
                    </label>
                    <div className="text-sm font-semibold px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {editingUser.role === "super_admin" ? (
                        <span className="text-red-600">超级管理员</span>
                      ) : editingUser.role === "admin" ? (
                        <span className="text-blue-600">管理员</span>
                      ) : (
                        <span className="text-slate-600">普通用户</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      当前状态
                    </label>
                    <div className="text-sm font-semibold px-3 py-2 bg-white/60 rounded-lg border border-slate-100 flex items-center gap-2">
                      {editingUser.status === "active" ? (
                        <>
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          <span className="text-green-600">活跃</span>
                        </>
                      ) : editingUser.status === "inactive" ? (
                        <>
                          <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                          <span className="text-yellow-600">未激活</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          <span className="text-red-600">已封禁</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      * 状态由系统自动判断，不可手动修改
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      会员等级
                    </label>
                    <div className="text-sm font-semibold px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {editingUser.membershipLevel === "premium" ? (
                        <span className="text-orange-600">普通会员</span>
                      ) : editingUser.membershipLevel === "vip" ? (
                        <span className="text-purple-600">VIP 会员</span>
                      ) : editingUser.membershipLevel === "svip" ? (
                        <span className="text-red-600">SVIP 会员</span>
                      ) : (
                        <span className="text-slate-600">普通会员</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      注册时间
                    </label>
                    <div className="text-sm font-semibold text-slate-800 px-3 py-2 bg-white/60 rounded-lg border border-slate-100">
                      {new Date(editingUser.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
              </div>

              {/* 可编辑字段 */}
              <div className="bg-gradient-to-r from-slate-50/50 to-gray-50/50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-gradient-to-b from-[#6b7280] to-[#4b5563] rounded-full"></span>
                  修改角色权限
                </h4>
                {editingUser.role === "super_admin" ? (
                  <div className="text-sm text-slate-500 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    超级管理员角色不可修改
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                      <span className="text-red-500">*</span>
                      新角色
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
                    </select>
                    <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                      <span className="text-red-500">*</span>
                      修改角色将立即生效，请谨慎操作
                    </p>
                  </div>
                )}
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
                disabled={editingUser.role === "super_admin"}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white rounded-xl font-semibold hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存修改
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
                  <User className="w-4 h-4 text-[#3182ce]" />
                  基本信息
                </h4>
                <div className="grid grid-cols-2 gap-4">
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
                    <div>{getStatusBadge(viewingUser)}</div>
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
                  <Key className="w-4 h-4 text-[#3182ce]" />
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
            </div>
          </div>
        </div>
      )}

      {/* 自定义确认弹窗 */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowConfirmModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-white/90">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">确认操作</h3>
              </div>
              <p className="text-slate-600 mb-6">{confirmMessage}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleConfirm();
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
