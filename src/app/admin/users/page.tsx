"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import {
  Filter,
  MoreVertical,
  Edit,
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
  AlertTriangle,
  RotateCcw,
  Zap,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import DataTableFilter, {
  FilterConfig,
} from "@/components/common/DataTableFilter";
import SearchInput from "@/components/common/SearchInput";
import Pagination from "@/components/Pagination";

/** 用户列表每页固定展示 10 条 */
const PAGE_SIZE = 10;

// 定义完整的筛选项值（不依赖动态数据）
const ROLE_OPTIONS = [
  { value: "super_admin", label: "超级管理员" },
  { value: "admin", label: "管理员" },
  { value: "user", label: "普通用户" },
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: "active", label: "正常/活跃" },
  { value: "inactive", label: "已停用" },
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
  tokenBalance?: number;
  points?: number;
  tenantId?: string | null;
  lastLoginAt?: string | null;
  isOnline: boolean;
  createdAt: string;
  banReason?: string | null;
  bannedUntil?: string | null;
  workspacemember?: any[];
}

interface UserData {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
}

export default function AdminUsersPage() {
  const toast = useToast();
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
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });
  const [banningUser, setBanningUser] = useState<User | null>(null);
  const [banDuration, setBanDuration] = useState<string>("permanent");
  const [banReason, setBanReason] = useState<string>("发布违规违法内容");
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
          window.location.href = "/";
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
    searchQuery,
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
        limit: PAGE_SIZE.toString(),
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

      const authToken = getAuthToken();
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

      if (!res.ok) throw new Error("加载用户列表失败");

      const result = await res.json();
      const userList = Array.isArray(result.users)
        ? result.users
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result)
            ? result
            : [];
      const pagination = result.pagination || {};
      setUserData({
        users: userList,
        total: pagination.total ?? userList.length,
        page: pagination.page ?? 1,
        limit: pagination.limit ?? 20,
        totalPages: pagination.totalPages ?? 1,
      });
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
      const res = await fetch("/api/admin/users/force-logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    loadUsers(1);
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
    setConfirmDialog({
      isOpen: true,
      title: "批量删除用户",
      message: `确定要删除选中的 ${selectedUsers.size} 个用户吗？此操作不可恢复！`,
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/users/batch", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
          });

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
      },
    });
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

  const handleViewDetails = async (user: User) => {
    setViewingUser(user);
    setShowViewModal(true);
    try {
      const res = await fetch(`/api/admin/user?userId=${user.id}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.data) {
          setViewingUser(result.data);
        }
      }
    } catch (e) {
      console.error("Fetch full user details error:", e);
    }
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

  const handleBatchKick = () => {
    if (selectedUsers.size === 0) return;

    // 高风险操作：二次确认
    setConfirmMessage(
      `确定要强制选中的 ${selectedUsers.size} 个用户下线吗？他们当前的所有操作将会中断。`,
    );
    setConfirmAction(async () => {
      try {
        const res = await fetch("/api/admin/users/batch-kick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [...selectedUsers] }),
        });

        if (await handleUnauthorized(res)) {
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "批量强制下线失败");
        }

        const data = await res.json();
        showToast(data.message || "批量强制下线成功", "success");
        setSelectedUsers(new Set());
        setShowBatchActions(false);
        loadUsers(currentPage);
      } catch (error) {
        console.error("Batch kick error:", error);
        showToast(error instanceof Error ? error.message : "批量强制下线失败", "error");
      }
    });
    setShowConfirmModal(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditForm({ role: user.role, status: user.status });
    setShowEditModal(true);
  };

  const handleChangeStatus = async (
    userId: string, 
    newStatus: string, 
    bannedUntil?: string | null,
    reason?: string
  ) => {
    try {
      const endpoint = newStatus === "banned" ? "/api/admin/user/ban" : "/api/admin/user";
      const method = newStatus === "banned" ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        body: JSON.stringify({ 
          userId,
          status: newStatus,
          bannedUntil: bannedUntil || null,
          reason: reason || undefined,
          banReason: reason || undefined,
        }),
      });

      if (await handleUnauthorized(res)) {
        return;
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || "更新状态失败");
      }

      const statusText =
        newStatus === "active"
          ? "已激活"
          : newStatus === "inactive"
            ? "已停用"
            : "已封禁";
      showToast(`用户状态已${statusText}`, "success");
      loadUsers(currentPage);
    } catch (error: any) {
      console.error("Change status error:", error);
      showToast(error?.message || "更新状态失败", "error");
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
    setConfirmDialog({
      isOpen: true,
      title: "删除用户",
      message: "确定要删除该用户吗？此操作不可恢复！",
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/user?userId=${userId}`, {
            method: "DELETE",
          });

          if (await handleUnauthorized(res)) {
            return;
          }

          if (!res.ok) throw new Error("删除用户失败");

          showToast("用户已删除", "success");
          setCurrentPage(1);
          loadUsers(currentPage);
        } catch (error) {
          console.error("Delete user error:", error);
          showToast("删除用户失败", "error");
        }
      },
    });
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

  // 格式化完整的 YYYY-MM-DD HH:mm:ss 日期时间
  const formatFullDateTime = (dateStr?: string | Date | null): string => {
    if (!dateStr) return "从未记录";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "从未记录";
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return "从未记录";
    }
  };

  // 清洗并格式化显示 IP 地址 (解决 ::1 问题)
  const formatDisplayIp = (ip?: string | null): string => {
    if (!ip) return "127.0.0.1 (本地环境)";
    if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") {
      return "127.0.0.1 (本地开发测试环境)";
    }
    return ip;
  };

  // 空间内角色中文化
  const getWorkspaceRoleLabel = (role?: string | null): string => {
    if (!role) return "普通成员";
    const r = role.toUpperCase();
    if (r === "OWNER") return "空间创建者";
    if (r === "ADMIN") return "空间管理员";
    return "普通成员";
  };

  // 空间类型 Badge
  const getWorkspaceTypeBadge = (type?: string | null) => {
    if (type === "ENTERPRISE") {
      return (
        <span className="px-2 py-0.5 rounded-md bg-[#3182ce]/10 text-[#3182ce] border border-[#3182ce]/20 font-bold text-[10px] whitespace-nowrap">
          🏢 企业空间
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-200/60 font-bold text-[10px] whitespace-nowrap">
        👤 个人空间
      </span>
    );
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
          <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">
            超级管理员
          </span>
        );
      case "ADMIN":
        return (
          <span className="px-2 py-1 bg-blue-100 text-[#2b6cb0] text-xs font-bold rounded-full">
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
          <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-full">
            活跃
          </span>
        );
      case "INACTIVE":
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
            已停用
          </span>
        );
      case "BANNED":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">
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
        <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
              showResetButton={false}
            />
            <button
              onClick={handleSearch}
              className="inline-flex items-center px-5 h-11 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              <Filter className="w-4 h-4 mr-2" />
              筛选
            </button>
            <button
              onClick={() => {
                loadUsers(currentPage);
                toast.success("用户列表已刷新！");
              }}
              disabled={loading}
              className="inline-flex items-center px-4 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all duration-200 cursor-pointer shadow-2xs border border-slate-200/80 active:scale-95 disabled:opacity-50"
              title="点击刷新用户列表最新数据"
            >
              <RotateCcw className={`w-4 h-4 mr-1.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
              刷新数据
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
                onClick={handleBatchKick}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-bold rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <LogOut className="w-4 h-4" />
                批量踢出
              </button>
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
                            userData?.users?.length !== undefined &&
                            (userData?.users?.length || 0) > 0 &&
                            userData?.users?.every((u) => selectedUsers.has(u.id))
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
                        可用算力点
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
                    {!userData?.users || userData.users.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-20 text-center">
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
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt={user.name || "用户头像"}
                                  className="w-12 h-12 shrink-0 rounded-xl object-cover shadow-md group-hover:scale-110 transition-transform duration-300 border border-slate-100"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                                  {user.name?.charAt(0) ||
                                    user.email?.charAt(0) ||
                                    "U"}
                                </div>
                              )}
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
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200/70 text-[#3182ce] text-xs font-black font-mono shadow-2xs">
                              <Zap className="w-3.5 h-3.5 fill-[#3182ce]" />
                              <span>{user.tokenBalance ?? user.points ?? 100} 点</span>
                            </span>
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
                            {(() => {
                              const displayTime = user.lastLoginAt || user.createdAt;
                              const fullStr = formatFullDateTime(displayTime);
                              const parts = fullStr.split(" ");
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 shrink-0 rounded-full bg-emerald-500"></div>
                                  <div className="font-mono text-xs leading-tight">
                                    <div className="font-bold text-slate-800">{parts[0]}</div>
                                    {parts[1] && (
                                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">{parts[1]}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(() => {
                              const fullStr = formatFullDateTime(user.createdAt);
                              const parts = fullStr.split(" ");
                              return (
                                <div className="font-mono text-xs leading-tight">
                                  <div className="font-bold text-slate-800">{parts[0]}</div>
                                  {parts[1] && (
                                    <div className="text-[11px] text-slate-400 font-medium mt-0.5">{parts[1]}</div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleViewDetails(user)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs"
                                title="查看用户 360° 全景画像与风控记录"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>详情</span>
                              </button>

                              <div className="relative inline-block">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowActionMenu(
                                      showActionMenu === user.id ? null : user.id,
                                    );
                                  }}
                                  className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors inline-flex items-center justify-center border border-slate-200 text-slate-600 font-bold text-xs gap-1"
                                  title="展开更多高危风控与下线管控操作"
                                >
                                  <MoreVertical className="w-4 h-4 text-slate-600" />
                                </button>

                              {showActionMenu === user.id && (
                                <>
                                  <div
                                    className="absolute right-0 mt-2 w-64 bg-white/98 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 py-2 z-50"
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
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-amber-50 transition-colors border-b border-slate-50"
                                        >
                                          <UserX className="w-4 h-4 text-amber-600" />
                                          禁用登录
                                        </button>
                                      )}

                                    {/* 封禁/解封用户 - 不能操作超级管理员和自己 */}
                                    {user.role !== "super_admin" &&
                                      user.id !== currentUserId && (
                                        <button
                                          onClick={() => {
                                            if (user.status === "banned") {
                                              // 解封
                                              handleChangeStatus(user.id, "active");
                                              setShowActionMenu(null);
                                            } else {
                                              // 封禁，需要选择封禁时长
                                              setBanningUser(user);
                                              setBanDuration("permanent"); // 默认永久
                                              setShowActionMenu(null);
                                            }
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-b border-slate-50"
                                          style={{
                                            color: user.status === "banned" ? "#10b981" : "#ef4444",
                                            backgroundColor: user.status === "banned" ? "#10b981/5" : "#ef4444/5",
                                          }}
                                        >
                                          {user.status === "banned" ? (
                                            <>
                                              <UserCheck className="w-4 h-4" />
                                              解封用户
                                            </>
                                          ) : (
                                            <>
                                              <UserX className="w-4 h-4" />
                                              封禁用户
                                            </>
                                          )}
                                        </button>
                                      )}

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
                          </div>
                        </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {userData && userData.total > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
                  <Pagination
                    currentPage={userData.page || currentPage}
                    totalItems={userData.total}
                    pageSize={PAGE_SIZE}
                    onPageChange={(p) => setCurrentPage(p)}
                    itemLabel="个用户"
                  />
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
              <div className="bg-gradient-to-r from-emerald-50/50 to-emerald-50/50 rounded-xl p-4 border border-slate-100">
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
                          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                          <span className="text-emerald-600">活跃</span>
                        </>
                      ) : editingUser.status === "inactive" ? (
                        <>
                          <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
                          <span className="text-slate-600 font-bold">已停用</span>
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
                        <span className="text-amber-600">普通会员</span>
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
                  <span className="w-1.5 h-4 bg-gradient-to-b from-[#64748b] to-[#475569] rounded-full"></span>
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

      {/* 查看详情弹窗 (升级为大厂 360° 用户全景画像 Modal，数据极大丰富) */}
      {showViewModal && viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowViewModal(false)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-slate-100 max-h-[88vh] flex flex-col animate-in zoom-in-95 duration-200 font-sans z-10">
            {/* Header (固定顶部) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <div className="w-1.5 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                用户画像与安全风控详情
              </h3>
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body (独立流动，全面丰富数据展示) */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar min-h-0">
              {/* 用户名片与状态卡片 */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50/60 via-slate-50 to-white rounded-2xl border border-blue-100/70 shadow-2xs">
                {viewingUser.avatar ? (
                  <img
                    src={viewingUser.avatar}
                    alt={viewingUser.name || "用户头像"}
                    className="w-14 h-14 rounded-2xl object-cover shadow-sm border border-slate-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-black text-xl shadow-md shrink-0">
                    {viewingUser.name?.charAt(0) || viewingUser.email?.charAt(0) || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-slate-800 truncate">{viewingUser.name || "匿名用户"}</span>
                    {getAccountStatusBadge(viewingUser.status)}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">{viewingUser.email || "未设置邮箱"}</div>
                </div>
              </div>

              {/* 核心资产与统计指标 Banner (5-Grid) */}
              <div className="grid grid-cols-5 gap-3">
                <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100 text-center">
                  <div className="text-[10px] text-[#3182ce] font-bold mb-0.5">可用算力点</div>
                  <div className="text-base font-black text-[#2b6cb0]">
                    {viewingUser.tokenBalance ?? viewingUser.points ?? 100} <span className="text-[10px] font-normal text-slate-400">点</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-400 font-bold mb-0.5">归属工作空间</div>
                  <div className="text-base font-black text-[#3182ce]">
                    {(viewingUser as any).stats?.workspaceCount ?? (viewingUser.workspacemember?.length || 0)} <span className="text-[10px] font-normal text-slate-400">个</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-400 font-bold mb-0.5">API 密钥数量</div>
                  <div className="text-base font-black text-purple-600">
                    {(viewingUser as any).stats?.apikeyCount ?? 0} <span className="text-[10px] font-normal text-slate-400">个</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-400 font-bold mb-0.5">部署/使用组件</div>
                  <div className="text-base font-black text-emerald-600">
                    {(viewingUser as any).stats?.componentCount ?? 0} <span className="text-[10px] font-normal text-slate-400">个</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-400 font-bold mb-0.5">累计登录次数</div>
                  <div className="text-base font-black text-amber-600">
                    {(viewingUser as any).stats?.loginHistoryCount ?? 1} <span className="text-[10px] font-normal text-slate-400">次</span>
                  </div>
                </div>
              </div>

              {/* 如果用户已被封禁，极其清晰高亮地展示封禁详情与管理员判定原因 */}
              {viewingUser.status === "banned" && (
                <div className="bg-red-50/90 p-4 rounded-2xl border border-red-200/80 space-y-3 font-sans shadow-sm">
                  <div className="flex items-center justify-between border-b border-red-200/60 pb-2">
                    <div className="flex items-center gap-2 font-black text-red-800 text-xs">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>⛔ 账号风控封禁限制详情</span>
                    </div>
                    <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-md text-[11px] font-black shadow-2xs">
                      当前已被封禁
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-red-700 shrink-0">管理员判定原因 / 案由内容:</span>
                      <span className="font-mono text-red-900 font-black text-right bg-white/90 px-3 py-1 rounded-xl border border-red-200 shadow-2xs">
                        {viewingUser.banReason || "发布违规违法内容"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-red-700 border-t border-red-200/50 pt-2">
                      <span className="font-bold">判定依据与风控准则:</span>
                      <span className="font-bold bg-white/80 px-2 py-0.5 rounded-md text-red-900 border border-red-200">
                        《知阁·舟坊安全风控准则与平台合规声明》
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-red-700 pt-1">
                      <span className="font-bold">封禁生效截至时间:</span>
                      <span className="font-mono font-black text-red-800 bg-white/80 px-2 py-0.5 rounded-md border border-red-100">
                        {viewingUser.bannedUntil ? formatFullDateTime(viewingUser.bannedUntil) : "永久强制封禁"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 基本与账户信息 */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-[#3182ce]" />
                  基本账号与权益
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">用户名 / 姓名</div>
                    <div className="text-xs font-black text-slate-800 truncate">{viewingUser.name || "匿名用户"}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">绑定邮箱</div>
                    <div className="text-xs font-black text-slate-800 truncate">{viewingUser.email || "未设置"}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">联系电话</div>
                    <div className="text-xs font-black text-slate-800 truncate">{viewingUser.phone || "未绑定手机"}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">平台角色</div>
                    <div>{getRoleBadge(viewingUser.role)}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">会员套餐等级</div>
                    <div className="text-xs font-black text-slate-800">{getMembershipLevelBadge(viewingUser.membershipLevel)}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">所属企业/团队 ID</div>
                    <div className="text-xs font-mono font-bold text-slate-700 truncate">{viewingUser.tenantId || "无"}</div>
                  </div>
                </div>
              </div>

              {/* 安全风控与设备追溯卡片 */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#3182ce]" />
                  安全风控与设备追溯
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">最近登录 IP</div>
                    <div className="text-xs font-mono font-bold text-slate-800 truncate">
                      {formatDisplayIp((viewingUser as any).lastLoginIp)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">最近登录客户端设备</div>
                    <div className="text-xs font-black text-slate-800 truncate">
                      {(viewingUser as any).lastLoginDevice || "Chrome 浏览器 (Windows 11)"}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">设备授权上限与并发</div>
                    <div className="text-xs font-black text-slate-800">
                      最多授权 {(viewingUser as any).deviceLimit || 3} 台设备 / {(viewingUser as any).allowMultiDevice !== false ? "允许多端并发登录" : "单端独占登录"}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-slate-400 font-bold">最近活跃具体时间</div>
                    <div className="text-xs font-mono font-bold text-slate-700">
                      {formatFullDateTime(viewingUser.lastLoginAt)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 已加入的工作空间列表 (包含个人空间与企业空间，中文化标识) */}
              {viewingUser.workspacemember && viewingUser.workspacemember.length > 0 && (
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#3182ce]" />
                    已加入的工作空间 ({viewingUser.workspacemember.length})
                  </h4>
                  <div className="space-y-2">
                    {viewingUser.workspacemember.map((wm: any) => (
                      <div key={wm.id || wm.workspaceId} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 text-xs hover:border-slate-200 transition-all shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getWorkspaceTypeBadge(wm.workspace?.type)}
                          <span className="font-black text-slate-800 truncate">{wm.workspace?.name || "默认工作空间"}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#3182ce] font-bold text-[11px]">
                            {getWorkspaceRoleLabel(wm.role)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50/90 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all shadow-2xs"
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
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
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
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* 封禁用户弹窗 (全风控闭环与大厂级告警设计) */}
      {banningUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setBanningUser(null)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200 font-sans z-10">
            {/* Header 危险告警标头 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 bg-red-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">高危封禁管控</h3>
                  <p className="text-xs text-red-600 font-medium mt-0.5">封禁后该账号将即刻失效并强行清除 Session 下线</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBanningUser(null)}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors border border-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 被封禁用户名片 */}
              <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                {banningUser.avatar ? (
                  <img
                    src={banningUser.avatar}
                    alt={banningUser.name || "用户头像"}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
                    {banningUser.name?.charAt(0) || banningUser.email?.charAt(0) || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-slate-800 truncate">
                    {banningUser.name || "匿名用户"}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    {banningUser.email || "未绑定邮箱"}
                  </div>
                </div>
              </div>

              {/* 1. 封禁时长选择 */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2.5">
                  1. 选择封禁时长
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { value: "1day", label: "1 天", days: 1 },
                    { value: "3days", label: "3 天", days: 3 },
                    { value: "7days", label: "7 天", days: 7 },
                    { value: "30days", label: "30 天", days: 30 },
                    { value: "permanent", label: "永久封禁", days: 0 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBanDuration(option.value)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                        banDuration === option.value
                          ? option.value === "permanent"
                            ? "border-red-600 bg-red-600 text-white shadow-md shadow-red-500/20"
                            : "border-red-500 bg-red-50 text-red-600 font-black shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 封禁原因与判定规则 */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  2. 封禁原因与判定规则 <span className="text-red-500 font-bold">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {[
                    "发布违规违法内容",
                    "涉嫌恶意刷量与攻击",
                    "频繁违规调用 API",
                    "违反平台合规声明",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setBanReason(tag)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        banReason === tag
                          ? "border-red-400 bg-red-100 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="请选择上方快捷标签或输入详细的违规封禁说明..."
                  className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-all resize-none font-sans"
                />
              </div>
            </div>

            {/* Modal Footer 操作按钮 */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setBanningUser(null)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!banReason || !banReason.trim()) {
                    showToast("请选择快捷封禁标签或在下方填写具体的封禁判定原因", "error");
                    return;
                  }
                  let bannedUntil: string | null = null;
                  if (banDuration !== "permanent") {
                    const dayMap: Record<string, number> = {
                      "1day": 1,
                      "3days": 3,
                      "7days": 7,
                      "30days": 30,
                    };
                    const days = dayMap[banDuration] || 1;
                    bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
                  }
                  await handleChangeStatus(banningUser.id, "banned", bannedUntil, banReason);
                  setBanningUser(null);
                }}
                className="px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl text-xs font-black shadow-md shadow-red-500/20 hover:shadow-lg transition-all cursor-pointer"
              >
                确认并强制封禁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
