"use client";

import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import {
  Mail,
  Bell,
  Settings,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Megaphone,
  Users,
  Send,
  SlidersHorizontal,
  RotateCcw,
  Activity,
  AlertTriangle,
  ExternalLink,
  FolderGit2,
  X,
  Radio,
  History,
  Trash2,
  Eye,
  FileText,
  CheckCheck,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import ConfirmModal from "@/components/ConfirmModal";

interface UserNotification {
  id: string;
  userId: string;
  emailNotifications: boolean;
  systemMessages: boolean;
  projectUpdates: boolean;
  commentMentions: boolean;
  frequency: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface NotificationSummary {
  totalUsers: number;
  emailEnabledCount: number;
  systemEnabledCount: number;
  projectUpdatesCount: number;
  commentMentionsCount: number;
  totalNotificationsSent: number;
  frequencyCounts: {
    REALTIME: number;
    HOURLY?: number;
    DAILY: number;
    WEEKLY: number;
    CRITICAL_ONLY?: number;
    QUIET_HOURS?: number;
  };
}

interface NotificationData {
  notifications: UserNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: NotificationSummary;
}

// 系统推送历史记录项数据接口
interface NotificationHistoryItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  } | null;
}

interface HistoryStats {
  total: number;
  todayCount: number;
  unreadCount: number;
  readCount: number;
}

export default function AdminNotificationsPage() {
  const toast = useToast();
  const [notificationData, setNotificationData] =
    useState<NotificationData | null>(null);
  const [loading, setLoading] = useState(true);

  // 多维筛选条件
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFrequency, setFilterFrequency] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [filterSystem, setFilterSystem] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // 模态框状态 1：发布系统通知模态框
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchForm, setDispatchForm] = useState<{
    targetType: "all" | "role" | "targeted";
    targetRole: string; // admin | creator | user
    groupId: string | null; // 选中的受众群组 ID（系统角色群组 / 自定义群组）
    targetUsers: Array<{
      id: string;
      name: string | null;
      email: string | null;
      role?: string;
    }>;
    title: string;
    content: string;
    type: string;
    errors: Record<string, string>;
  }>({
    targetType: "all",
    targetRole: "admin",
    groupId: null,
    targetUsers: [],
    title: "",
    content: "",
    type: "system",
    errors: {},
  });

  // 服务端防抖搜索与批量选人状态 (针对海量几十万用户场景)
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    avatar?: string | null;
  }>>([]);
  const [userSearching, setUserSearching] = useState(false);
  // 搜索总数（来自分页 pagination.total）—— 用于"一键全部添加"提示与判断
  const [userSearchTotal, setUserSearchTotal] = useState<number | null>(null);
  const [userSearchKeyword, setUserSearchKeyword] = useState("");
  // 定向发送池规模感知：超过 50 时默认折叠
  const [showPoolList, setShowPoolList] = useState(false);
  const [poolSearchTerm, setPoolSearchTerm] = useState("");
  // 海量文件导入（CSV/TXT）
  const [bulkImporting, setBulkImporting] = useState(false);
  const [batchPasteMode, setBatchPasteMode] = useState(false); // 是否切换为文本批量粘贴导入模式
  const [batchPasteText, setBatchPasteText] = useState("");
  const [roleCountEstimate, setRoleCountEstimate] = useState<number | null>(null);
  const [loadingRoleCount, setLoadingRoleCount] = useState(false);

  // 受众群组：系统角色群组（由数据库 user.role 动态生成）+ 管理员自定义群组
  const [notificationGroups, setNotificationGroups] = useState<Array<{
    id: string;
    name: string;
    type: string;
    roleKey: string | null;
    description: string | null;
    baseCount: number;
    includeCount: number;
    excludeCount: number;
    finalCount: number;
  }>>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // 群组成员管理弹窗（对群组内个体进行剔除 / 追加）
  const [showGroupMemberModal, setShowGroupMemberModal] = useState(false);
  const [managingGroup, setManagingGroup] = useState<{
    id: string;
    name: string;
    type: string;
    roleKey: string | null;
  } | null>(null);
  const [groupMembers, setGroupMembers] = useState<Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    source: string;
  }>>([]);
  const [groupExcluded, setGroupExcluded] = useState<Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  }>>([]);
  const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  }>>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // 模态框状态 2：用户偏好调优模态框
  const [editingPref, setEditingPref] = useState<UserNotification | null>(null);
  const [prefSubmitting, setPrefSubmitting] = useState(false);
  const [prefForm, setPrefForm] = useState<{
    emailNotifications: boolean;
    systemMessages: boolean;
    projectUpdates: boolean;
    commentMentions: boolean;
    frequency: string;
  }>({
    emailNotifications: true,
    systemMessages: true,
    projectUpdates: true,
    commentMentions: true,
    frequency: "REALTIME",
  });

  // 确认对话框
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "warning" | "danger";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => { },
  });

  // 顶层双 Tab 导航：偏好治理 vs 推送历史
  const [activeTab, setActiveTab] = useState<"preferences" | "history">("preferences");

  // 推送历史记录状态
  const [historyList, setHistoryList] = useState<NotificationHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(10);
  const [historyStats, setHistoryStats] = useState<HistoryStats>({
    total: 0,
    todayCount: 0,
    unreadCount: 0,
    readCount: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(false);

  // 历史多维筛选条件
  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState("");
  const [historyReadFilter, setHistoryReadFilter] = useState("");
  const [historyUserSearch, setHistoryUserSearch] = useState("");

  // 查看历史详情模态框
  const [viewingHistory, setViewingHistory] = useState<NotificationHistoryItem | null>(null);

  const loadHistory = async (isSilent: boolean = false) => {
    try {
      if (!isSilent) setHistoryLoading(true);
      const params = new URLSearchParams({
        page: historyPage.toString(),
        limit: historyPageSize.toString(),
        ...(historySearch.trim() && { search: historySearch.trim() }),
        ...(historyType && { type: historyType }),
        ...(historyReadFilter && { isRead: historyReadFilter }),
        ...(historyUserSearch.trim() && { userSearch: historyUserSearch.trim() }),
      });

      const res = await fetch(`/api/admin/notifications/history?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!res.ok) throw new Error("加载推送历史记录失败");

      const result = await res.json();
      if (result.success && result.data) {
        setHistoryList(result.data.records || []);
        setHistoryTotal(result.data.total || 0);
        if (result.data.stats) {
          setHistoryStats(result.data.stats);
        }
      }
    } catch (error) {
      console.error("Load notification history error:", error);
      toast.error("加载推送历史记录失败，请检查网络");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, historyPage, historySearch, historyType, historyReadFilter, historyUserSearch]);

  const handleResetHistoryFilters = () => {
    setHistorySearch("");
    setHistoryType("");
    setHistoryReadFilter("");
    setHistoryUserSearch("");
    setHistoryPage(1);
  };

  const getNotificationTypeBadge = (type: string) => {
    switch (type) {
      case "system":
        return {
          icon: "🔔",
          label: "系统通知",
          className: "bg-blue-50 text-[#3182ce] border-blue-200",
        };
      case "update":
        return {
          icon: "🚀",
          label: "功能更新",
          className: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "alert":
        return {
          icon: "⚠️",
          label: "安全告警",
          className: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "activity":
        return {
          icon: "🎁",
          label: "平台活动",
          className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      default:
        return {
          icon: "📢",
          label: "常规消息",
          className: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  };

  const loadNotifications = async (isSilent: boolean = false) => {
    try {
      if (!isSilent) setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        ...(searchQuery.trim() && { search: searchQuery.trim() }),
        ...(filterFrequency && { frequency: filterFrequency }),
        ...(filterEmail && { emailNotifications: filterEmail }),
        ...(filterSystem && { systemMessages: filterSystem }),
      });

      const res = await fetch(`/api/admin/notifications?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!res.ok) throw new Error("加载通知治理设置失败");

      const result = await res.json();
      setNotificationData(result.data);
    } catch (error) {
      console.error("Load notifications error:", error);
      toast.error("加载通知治理数据失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [currentPage, searchQuery, filterFrequency, filterEmail, filterSystem]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterFrequency("");
    setFilterEmail("");
    setFilterSystem("");
    setCurrentPage(1);
  };

  // 服务端防抖检索用户 (针对几十万海量用户，输入防抖300ms，仅拉取前12条，保护前端性能)
  useEffect(() => {
    if (!showDispatchModal || dispatchForm.targetType !== "targeted") return;
    if (!userSearchTerm.trim()) {
      setUserSearchResults([]);
      setUserSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setUserSearching(true);
        const authToken = getAuthToken();
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearchTerm.trim())}&limit=12`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (res.ok) {
          const result = await res.json();
          setUserSearchResults(result.users || result.data?.users || []);
          setUserSearchTotal(result.pagination?.total ?? null);
          setUserSearchKeyword(userSearchTerm.trim());
        }
      } catch (err) {
        console.error("服务端防抖搜索用户失败", err);
      } finally {
        setUserSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearchTerm, showDispatchModal, dispatchForm.targetType]);

  // 当选择受众群组模式时：拉取全部群组。
  // 系统角色群组由数据库 user.role 动态聚合生成，不再硬编码固定的三档角色。
  useEffect(() => {
    if (!showDispatchModal || dispatchForm.targetType !== "role") return;
    const fetchGroups = async () => {
      try {
        setLoadingGroups(true);
        const authToken = getAuthToken();
        const res = await fetch(`/api/admin/notification-groups`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (res.ok) {
          const result = await res.json();
          const list = result.groups || [];
          setNotificationGroups(list);
          // 尚未选择、或所选群组已失效时，默认选中第一个群组
          const stillValid = list.some((g: { id: string }) => g.id === dispatchForm.groupId);
          if (!stillValid && list.length > 0) {
            const first = list[0];
            setDispatchForm((prev) => ({
              ...prev,
              groupId: first.id,
              targetRole: first.roleKey || prev.targetRole,
            }));
          }
        }
      } catch {
        // 群组加载失败不阻断弹窗使用
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, [showDispatchModal, dispatchForm.targetType, dispatchForm.groupId]);

  // 同步当前选中群组的最终覆盖人数（基础人群 − 剔除 + 追加），供确认区与按钮文案复用
  useEffect(() => {
    const selected = notificationGroups.find((g) => g.id === dispatchForm.groupId);
    setRoleCountEstimate(selected ? selected.finalCount : null);
  }, [notificationGroups, dispatchForm.groupId]);

  // 成员管理弹窗内搜索用户（防抖 300ms，仅取前 12 条）
  useEffect(() => {
    if (!showGroupMemberModal || !memberSearchTerm.trim()) {
      setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setMemberSearching(true);
        const res = await fetch(
          `/api/admin/users?search=${encodeURIComponent(memberSearchTerm.trim())}&limit=12`,
          { headers: { Authorization: `Bearer ${getAuthToken()}` } }
        );
        if (res.ok) {
          const result = await res.json();
          setMemberSearchResults(result.users || result.data?.users || []);
        }
      } catch {
        // 静默失败：不打断输入
      } finally {
        setMemberSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearchTerm, showGroupMemberModal]);

  // 添加单人至定向发送池
  const handleAddUserToTarget = (user: { id: string; name: string | null; email: string | null; role?: string }) => {
    if (dispatchForm.targetUsers.some((u) => u.id === user.id)) {
      toast.info("该用户已在定向发送池中");
      return;
    }
    setDispatchForm((prev) => ({
      ...prev,
      targetUsers: [...prev.targetUsers, user],
      errors: { ...prev.errors, target: "" },
    }));
  };

  // 从发送池移除单人
  const handleRemoveUserFromTarget = (userId: string) => {
    setDispatchForm((prev) => ({
      ...prev,
      targetUsers: prev.targetUsers.filter((u) => u.id !== userId),
    }));
  };

  // 一键将当前搜索结果全部添加至发送池
  const handleAddAllSearchResults = () => {
    const existingIds = new Set(dispatchForm.targetUsers.map((u) => u.id));
    const toAdd = userSearchResults.filter((u) => !existingIds.has(u.id));
    if (toAdd.length === 0) {
      toast.info("当前搜索到的用户已全部在发送池中");
      return;
    }
    setDispatchForm((prev) => ({
      ...prev,
      targetUsers: [...prev.targetUsers, ...toAdd],
      errors: { ...prev.errors, target: "" },
    }));
    toast.success(`已添加当前 ${toAdd.length} 位用户至定向发送池`);
  };

  // 批量文本粘贴智能解析（支持 Excel 整列复制或逗号分隔的邮箱/用户ID）
  const handleBatchParsePaste = () => {
    if (!batchPasteText.trim()) {
      toast.error("请输入或粘贴要导入的用户邮箱或用户ID");
      return;
    }
    const tokens = batchPasteText
      .split(/[\n,;，；\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      toast.error("未解析出有效的用户标识");
      return;
    }

    const existingIds = new Set(dispatchForm.targetUsers.map((u) => u.id));
    const existingEmails = new Set(
      dispatchForm.targetUsers.map((u) => u.email).filter(Boolean)
    );

    const newlyAdded: Array<{ id: string; name: string | null; email: string | null }> = [];
    tokens.forEach((token) => {
      const isEmail = token.includes("@");
      if (isEmail) {
        if (!existingEmails.has(token) && !existingIds.has(token)) {
          existingEmails.add(token);
          newlyAdded.push({
            id: token,
            name: token.split("@")[0],
            email: token,
          });
        }
      } else {
        if (!existingIds.has(token)) {
          existingIds.add(token);
          newlyAdded.push({
            id: token,
            name: `用户 (${token.slice(0, 8)}...)`,
            email: null,
          });
        }
      }
    });

    if (newlyAdded.length > 0) {
      setDispatchForm((prev) => ({
        ...prev,
        targetUsers: [...prev.targetUsers, ...newlyAdded],
        errors: { ...prev.errors, target: "" },
      }));
      toast.success(`已成功解析并导入 ${newlyAdded.length} 位用户标识`);
      setBatchPasteText("");
    } else {
      toast.info("所录入的用户均已在发送池中，无需重复添加");
    }
  };

  // 打开推送模态框（支持全局广播或定向针对具体某人或多人）
  const openDispatchModal = (targetUser?: UserNotification["user"]) => {
    setUserSearchTerm("");
    setUserSearchResults([]);
    setBatchPasteMode(false);
    setBatchPasteText("");
    if (targetUser) {
      setDispatchForm({
        targetType: "targeted",
        targetRole: "admin",
        groupId: null,
        targetUsers: [
          {
            id: targetUser.id,
            name: targetUser.name || targetUser.email || "目标用户",
            email: targetUser.email || "",
            role: targetUser.role,
          },
        ],
        title: "",
        content: "",
        type: "system",
        errors: {},
      });
    } else {
      setDispatchForm({
        targetType: "all",
        targetRole: "admin",
        groupId: null,
        targetUsers: [],
        title: "",
        content: "",
        type: "system",
        errors: {},
      });
    }
    setShowDispatchModal(true);
  };

  // 提交推送系统通知
  // 加载指定群组的当前成员与被剔除成员
  const loadGroupMembers = async (groupId: string) => {
    try {
      setLoadingGroupMembers(true);
      const res = await fetch(`/api/admin/notification-groups/members?groupId=${groupId}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const result = await res.json();
        setGroupMembers(result.members || []);
        setGroupExcluded(result.excluded || []);
      }
    } catch {
      toast.error("加载群组成员失败");
    } finally {
      setLoadingGroupMembers(false);
    }
  };

  // 刷新群组人数统计（增删成员后同步「预计覆盖」）
  const refreshGroupCounts = async () => {
    try {
      const res = await fetch("/api/admin/notification-groups", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const result = await res.json();
        setNotificationGroups(result.groups || []);
      }
    } catch {
      // 静默失败：不影响主流程
    }
  };

  // 统一提交群组名单变更：addUserIds 追加、removeUserIds 移除
  const updateGroupMembers = async (payload: {
    addUserIds?: string[];
    removeUserIds?: string[];
    memberAction?: string;
  }) => {
    if (!managingGroup) return;
    try {
      const res = await fetch("/api/admin/notification-groups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ groupId: managingGroup.id, ...payload }),
      });
      if (res.ok) {
        await loadGroupMembers(managingGroup.id);
        await refreshGroupCounts();
      } else {
        const data = await res.json();
        toast.error(data.error || "更新群组成员失败");
      }
    } catch {
      toast.error("更新群组成员失败");
    }
  };

  // 打开群组成员管理弹窗
  const openGroupMemberModal = async (group: { id: string; name: string; type: string; roleKey: string | null }) => {
    setManagingGroup(group);
    setShowGroupMemberModal(true);
    setMemberSearchTerm("");
    setMemberSearchResults([]);
    await loadGroupMembers(group.id);
  };

  // 创建自定义群组
  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      setCreatingGroup(true);
      const res = await fetch("/api/admin/notification-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`自定义群组「${name}」已创建，请为其添加成员`);
        setNewGroupName("");
        setNotificationGroups((prev) => [
          ...prev,
          { ...data.group, baseCount: 0, includeCount: 0, excludeCount: 0, finalCount: 0 },
        ]);
        setDispatchForm((prev) => ({ ...prev, groupId: data.group.id }));
      } else {
        toast.error(data.error || "创建群组失败");
      }
    } catch {
      toast.error("创建群组失败");
    } finally {
      setCreatingGroup(false);
    }
  };

  // 删除自定义群组
  const handleDeleteGroup = async (groupId: string) => {
    try {
      const res = await fetch(`/api/admin/notification-groups?id=${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("群组已删除");
        setNotificationGroups((prev) => prev.filter((g) => g.id !== groupId));
        if (dispatchForm.groupId === groupId) {
          setDispatchForm((prev) => ({ ...prev, groupId: null }));
        }
      } else {
        toast.error(data.error || "删除群组失败");
      }
    } catch {
      toast.error("删除群组失败");
    }
  };

  // 从群组中剔除指定成员
  const handleExcludeMember = async (userId: string) => {
    await updateGroupMembers({ addUserIds: [userId], memberAction: "exclude" });
    toast.success("已将该成员从群组中剔除");
  };

  // 追加成员进群组（自定义群组加人 / 系统群组跨角色加人）
  const handleIncludeMember = async (user: { id: string; name: string | null; email: string | null }) => {
    await updateGroupMembers({ addUserIds: [user.id], memberAction: "include" });
    toast.success(`已将 ${user.name || user.email} 加入群组`);
    setMemberSearchTerm("");
    setMemberSearchResults([]);
  };

  // 撤销剔除，恢复该成员回到群组
  const handleRestoreMember = async (userId: string) => {
    await updateGroupMembers({ removeUserIds: [userId] });
    toast.success("已恢复该成员至群组");
  };

  // 一键添加服务端匹配的全部用户（解决"匹配 2 万个只能加 12 个"的痛点）
  const handleAddAllMatched = async (keyword: string) => {
    try {
      const res = await fetch("/api/admin/users/search-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ keyword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "一键添加失败");
        return;
      }
      const data = await res.json();
      const newUsers = (data.ids || []).map((id: string) => ({
        id,
        name: null,
        email: null,
        role: "user",
      }));
      setDispatchForm((prev) => {
        const existing = new Set(prev.targetUsers.map((u) => u.id));
        const toAdd = newUsers.filter((u: { id: string }) => !existing.has(u.id));
        return { ...prev, targetUsers: [...prev.targetUsers, ...toAdd] };
      });
      toast.success(
        `已从服务端一次性拉取并添加 ${data.ids.length.toLocaleString()} 位匹配用户${
          data.moreAvailable ? "（已达接口单次上限，剩余用户请细化关键词）" : ""
        }`
      );
    } catch {
      toast.error("一键添加失败");
    }
  };

  // 上传 CSV/TXT 文件批量导入用户标识
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBulkImporting(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/users/import-identifiers", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "文件导入失败");
        return;
      }
      const data = await res.json();
      const matchedUsers = data.matched || [];
      setDispatchForm((prev) => {
        const existing = new Set(prev.targetUsers.map((u) => u.id));
        const toAdd = matchedUsers.filter((u: { id: string }) => !existing.has(u.id));
        return { ...prev, targetUsers: [...prev.targetUsers, ...toAdd] };
      });
      const unmatchedHint = data.unmatchedCount > 0 ? `；${data.unmatchedCount.toLocaleString()} 位未能匹配（已忽略）` : "";
      toast.success(`已导入 ${data.matchedCount.toLocaleString()} / ${data.totalInput.toLocaleString()} 位用户${unmatchedHint}`);
    } catch {
      toast.error("文件导入失败");
    } finally {
      setBulkImporting(false);
      e.target.value = "";
    }
  };

  // 按邮箱或用户ID从定向发送池中移除单个（大规模池必备）
  const handleRemoveFromPool = (token: string) => {
    const t = token.trim();
    if (!t) return;
    setDispatchForm((prev) => {
      const before = prev.targetUsers.length;
      const after = prev.targetUsers.filter(
        (u) => u.id !== t && (u.email || "").toLowerCase() !== t.toLowerCase()
      );
      const removed = before - after.length;
      if (removed > 0) toast.info(`已从池中移除 ${removed} 位`);
      else toast.error(`未在池中匹配到「${t}」`);
      return { ...prev, targetUsers: after };
    });
    setPoolSearchTerm("");
  };

  const handleDispatchSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!dispatchForm.title.trim()) {
      newErrors.title = "请输入通知标题 (2-50 字)";
    } else if (dispatchForm.title.trim().length < 2) {
      newErrors.title = "通知标题至少需要 2 个字符";
    } else if (dispatchForm.title.trim().length > 50) {
      newErrors.title = "通知标题不能超过 50 个字符";
    }

    if (!dispatchForm.content.trim()) {
      newErrors.content = "请输入通知正文内容 (5-1000 字)";
    } else if (dispatchForm.content.trim().length < 5) {
      newErrors.content = "通知正文至少需要 5 个字符";
    } else if (dispatchForm.content.trim().length > 1000) {
      newErrors.content = "通知正文不能超过 1,000 字";
    }

    if (dispatchForm.targetType === "targeted" && dispatchForm.targetUsers.length === 0) {
      newErrors.target = "请至少选择或添加一位接收通知的目标用户";
    }

    if (Object.keys(newErrors).length > 0) {
      setDispatchForm((prev) => ({ ...prev, errors: newErrors }));
      toast.error("表单包含未通过验证的项，请检查后重新提交");
      return;
    }

    setDispatchSubmitting(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          targetType: dispatchForm.targetType,
          targetRole: dispatchForm.targetRole,
          groupId: dispatchForm.groupId,
          userIds: dispatchForm.targetUsers.map((u) => u.id),
          title: dispatchForm.title.trim(),
          content: dispatchForm.content.trim(),
          type: dispatchForm.type,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "系统通知推送成功！");
        setShowDispatchModal(false);
        loadNotifications(true);
        loadHistory(true);
      } else {
        toast.error(data.error || "推送通知失败");
      }
    } catch (e) {
      console.error("Dispatch notification error:", e);
      toast.error("网络异常，推送通知失败");
    } finally {
      setDispatchSubmitting(false);
    }
  };

  // 打开偏好调优模态框
  const openPrefModal = (item: UserNotification) => {
    setEditingPref(item);
    setPrefForm({
      emailNotifications: item.emailNotifications,
      systemMessages: item.systemMessages,
      projectUpdates: item.projectUpdates,
      commentMentions: item.commentMentions,
      frequency: item.frequency || "REALTIME",
    });
  };

  // 提交偏好调优
  const handlePrefSubmit = async () => {
    if (!editingPref) return;
    setPrefSubmitting(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          id: editingPref.id,
          ...prefForm,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("用户通知偏好已成功更新");
        setEditingPref(null);
        loadNotifications(true);
      } else {
        toast.error(data.error || "更新偏好失败");
      }
    } catch (e) {
      console.error("Update pref error:", e);
      toast.error("网络异常，更新偏好失败");
    } finally {
      setPrefSubmitting(false);
    }
  };

  // 快捷发送通道连通性测试（真实探测并核验邮箱状态）
  const handleSendTestNotification = (item: UserNotification) => {
    const hasEmail = Boolean(item.user.email && item.user.email.trim());
    setConfirmModal({
      isOpen: true,
      title: "通知通道连通性测试",
      message: hasEmail
        ? `即将向用户【${item.user.name || item.user.email}】发送一条通道健康连通性测试通知。\n\n检测到该用户已绑定邮箱：${item.user.email}，本次将联动验证其站内信与邮件接收能力。\n\n请确认是否发送测试消息？`
        : `即将向用户【${item.user.name || "目标账户"}】发送一条通道健康连通性测试通知。\n\n⚠️ 检测到该用户尚未绑定有效外部邮箱，本次将仅对其已开启的站内信通道进行健康探测，无法验证邮件送达。\n\n请确认是否发送测试消息？`,
      type: "info",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              targetType: "single",
              userId: item.userId,
              title: "【知阁系统】通知通道健康连通测试",
              content: `您好，这是一条由平台管理治理中心发起的通知通道健康自检消息。投递时间：${new Date().toLocaleString("zh-CN")}。您的系统消息通道运行正常。${hasEmail ? `已同步核验外部邮箱：${item.user.email}` : "（注：您尚未绑定外部邮箱，建议前往个人中心绑定以接收告警）"}`,
              type: "system",
            }),
          });
          const data = await res.json();
          if (res.ok) {
            toast.success(data.message || `已向 ${item.user.name || item.user.email} 成功送达测试通知`);
            loadNotifications(true);
          } else {
            toast.error(data.error || "发送测试通知失败");
          }
        } catch {
          toast.error("网络异常，发送失败");
        }
      },
    });
  };

  const getFrequencyBadge = (frequency: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      REALTIME: {
        bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        text: "⚡ 实时推送",
        label: "实时",
      },
      HOURLY: {
        bg: "bg-cyan-50 text-cyan-700 border-cyan-200",
        text: "⏱️ 每小时汇总",
        label: "小时",
      },
      DAILY: {
        bg: "bg-blue-50 text-[#3182ce] border-blue-200",
        text: "📅 每日汇总",
        label: "每日",
      },
      WEEKLY: {
        bg: "bg-purple-50 text-purple-700 border-purple-200",
        text: "📊 每周精选",
        label: "每周",
      },
      CRITICAL_ONLY: {
        bg: "bg-rose-50 text-rose-700 border-rose-200",
        text: "🛡️ 仅严重告警",
        label: "严重告警",
      },
      QUIET_HOURS: {
        bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
        text: "🌙 工作免打扰",
        label: "免打扰",
      },
    };

    const target = badges[frequency] || {
      bg: "bg-slate-100 text-slate-600 border-slate-200",
      text: frequency,
      label: frequency,
    };

    return (
      <span
        className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${target.bg}`}
      >
        {target.text}
      </span>
    );
  };

  const summary = notificationData?.summary || {
    totalUsers: 0,
    emailEnabledCount: 0,
    systemEnabledCount: 0,
    projectUpdatesCount: 0,
    commentMentionsCount: 0,
    totalNotificationsSent: 0,
    frequencyCounts: { REALTIME: 0, HOURLY: 0, DAILY: 0, WEEKLY: 0, CRITICAL_ONLY: 0, QUIET_HOURS: 0 },
  };

  const isDispatchTitleValid =
    dispatchForm.title.trim().length >= 2 &&
    dispatchForm.title.trim().length <= 50;
  const isDispatchContentValid =
    dispatchForm.content.trim().length >= 5 &&
    dispatchForm.content.trim().length <= 1000;
  const isDispatchTargetValid =
    dispatchForm.targetType === "all" ||
    dispatchForm.targetType === "role" ||
    (dispatchForm.targetType === "targeted" && dispatchForm.targetUsers.length > 0);
  const isDispatchFormValid =
    isDispatchTitleValid && isDispatchContentValid && isDispatchTargetValid;

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 pb-12 font-sans text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* 顶部业务大纲标头 Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  通知与消息推送治理中心 (Notifications & Alerts)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80">
                  通道偏好与系统调度
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                监控全平台用户通知渠道订阅水位，统一调度全网系统消息、定向通知与服务告警
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => openDispatchModal()}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="向全平台用户或指定账户发送站内信或服务通知"
            >
              <Send className="w-3.5 h-3.5" />
              <span>发布系统通知</span>
            </button>

            <Link
              href="/admin/documents?category=announcement"
              className="h-9 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="前往文档中心发布或管理系统官方公告"
            >
              <Megaphone className="w-4 h-4 text-[#3182ce]" />
              <span>官方公告管理</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <button
              onClick={() => loadNotifications()}
              disabled={loading}
              className="h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all inline-flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              title="刷新通知偏好与调度数据"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* 双 Tab 导航切换栏 */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab("preferences")}
            className={`pb-3 px-4 text-sm font-black transition-all flex items-center gap-2 border-b-2 cursor-pointer ${activeTab === "preferences"
                ? "border-[#3182ce] text-[#2b6cb0]"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>用户订阅偏好治理</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
              {summary.totalUsers}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("history");
              loadHistory();
            }}
            className={`pb-3 px-4 text-sm font-black transition-all flex items-center gap-2 border-b-2 cursor-pointer ${activeTab === "history"
                ? "border-[#3182ce] text-[#2b6cb0]"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            <History className="w-4 h-4" />
            <span>系统推送历史记录</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
              {historyTotal > 0 ? historyTotal : summary.totalNotificationsSent}
            </span>
          </button>
        </div>

        {activeTab === "preferences" ? (
          <>
            {/* 4 大标准 Bento 指标统计卡片（真实聚合，杜绝失真与AI黑化） */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">
                    已纳管用户数
                  </div>
                  <div className="text-2xl font-black font-mono text-[#3182ce]">
                    {summary.totalUsers}{" "}
                    <span className="text-xs font-normal text-slate-400">人</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">
                    具备独立偏好配置的账户
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">
                    邮件通知开启率
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-600">
                    {summary.emailEnabledCount}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      (
                      {summary.totalUsers > 0
                        ? Math.round(
                          (summary.emailEnabledCount / summary.totalUsers) * 100
                        )
                        : 0}
                      %)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">
                    保持外部邮箱触达活跃
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Mail className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">
                    系统消息开启率
                  </div>
                  <div className="text-2xl font-black font-mono text-amber-600">
                    {summary.systemEnabledCount}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      (
                      {summary.totalUsers > 0
                        ? Math.round(
                          (summary.systemEnabledCount / summary.totalUsers) * 100
                        )
                        : 0}
                      %)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">
                    站内通知实时触达畅通
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Bell className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">
                    全站通知累计发送
                  </div>
                  <div className="text-2xl font-black font-mono text-purple-600">
                    {summary.totalNotificationsSent}{" "}
                    <span className="text-xs font-normal text-slate-400">条</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">
                    全平台历史通知投递总量
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 搜索与多维筛选卡片 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs mb-6 space-y-4">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 flex-wrap">
                {/* 左侧筛选控件群 */}
                <div className="flex items-center gap-2.5 flex-wrap flex-1">
                  {/* 搜索输入框 */}
                  <div className="relative min-w-[200px] flex-1 sm:flex-initial sm:w-60">
                    <input
                      type="text"
                      placeholder="搜索用户名、昵称或邮箱..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-slate-50/50 focus:bg-white"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>

                  {/* 频率筛选（扩充为6大标准频率） */}
                  <div className="w-40 shrink-0">
                    <select
                      value={filterFrequency}
                      onChange={(e) => {
                        setFilterFrequency(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                    >
                      <option value="">全部推送频率</option>
                      <option value="REALTIME">⚡ 实时推送</option>
                      <option value="HOURLY">⏱️ 每小时汇总</option>
                      <option value="DAILY">📅 每日汇总</option>
                      <option value="WEEKLY">📊 每周精选</option>
                      <option value="CRITICAL_ONLY">🛡️ 仅严重告警</option>
                      <option value="QUIET_HOURS">🌙 工作免打扰</option>
                    </select>
                  </div>

                  {/* 邮件通知筛选 */}
                  <div className="w-36 shrink-0">
                    <select
                      value={filterEmail}
                      onChange={(e) => {
                        setFilterEmail(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                    >
                      <option value="">邮件渠道: 全部</option>
                      <option value="true">🟢 邮件开启</option>
                      <option value="false">⚪ 邮件关闭</option>
                    </select>
                  </div>

                  {/* 系统消息筛选 */}
                  <div className="w-36 shrink-0">
                    <select
                      value={filterSystem}
                      onChange={(e) => {
                        setFilterSystem(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                    >
                      <option value="">站内信渠道: 全部</option>
                      <option value="true">🟢 站内信开启</option>
                      <option value="false">⚪ 站内信关闭</option>
                    </select>
                  </div>

                  {/* 重置按钮 (独立不换行) */}
                  {(searchQuery || filterFrequency || filterEmail || filterSystem) && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                      title="重置所有筛选"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>重置</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 快捷频率分布胶囊栏 (Pills) */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 overflow-x-auto pb-0.5 text-xs">
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap mr-1 flex items-center gap-1">
                  <Radio className="w-3 h-3 text-[#3182ce]" />
                  <span>推送频率筛选:</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrequency("");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${filterFrequency === ""
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  <span>全部频率</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${filterFrequency === ""
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {summary.totalUsers}
                  </span>
                </button>

                {[
                  { key: "REALTIME", label: "⚡ 实时推送" },
                  { key: "HOURLY", label: "⏱️ 每小时汇总" },
                  { key: "DAILY", label: "📅 每日汇总" },
                  { key: "WEEKLY", label: "📊 每周精选" },
                  { key: "CRITICAL_ONLY", label: "🛡️ 仅严重告警" },
                  { key: "QUIET_HOURS", label: "🌙 工作免打扰" },
                ].map((freq) => {
                  const count = (summary.frequencyCounts as any)?.[freq.key] || 0;
                  const isSelected = filterFrequency === freq.key;
                  return (
                    <button
                      key={freq.key}
                      type="button"
                      onClick={() => {
                        setFilterFrequency(freq.key);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${isSelected
                          ? "bg-[#3182ce] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                      <span>{freq.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-200 text-slate-700"
                          }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 列表表格 */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-3"></div>
                  <p className="text-xs text-slate-500 font-bold">
                    正在加载通知设置与偏好数据...
                  </p>
                </div>
              ) : !notificationData || notificationData.notifications.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 mb-1">
                    暂未检索到用户通知配置
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                    当前筛选条件下没有匹配的用户设置数据，您可以尝试重置筛选或发布全员系统通知。
                  </p>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 h-8.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    重置所有筛选
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[960px]">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3 px-5 whitespace-nowrap">用户账户信息</th>
                        <th className="py-3 px-5 whitespace-nowrap">通知推送频率</th>
                        <th className="py-3 px-5 whitespace-nowrap">邮件通知</th>
                        <th className="py-3 px-5 whitespace-nowrap">系统消息</th>
                        <th className="py-3 px-5 whitespace-nowrap">项目更新</th>
                        <th className="py-3 px-5 whitespace-nowrap">最后同步时间</th>
                        <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                          治理操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {notificationData.notifications.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-blue-50/30 transition-colors group"
                        >
                          {/* 用户信息 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              {item.user.avatar ? (
                                <img
                                  src={item.user.avatar}
                                  alt={item.user.name || ""}
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-black shrink-0 shadow-2xs">
                                  {item.user.name?.charAt(0) ||
                                    item.user.email?.charAt(0) ||
                                    "U"}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={`/admin/users?search=${encodeURIComponent(
                                      item.user.email ||
                                      item.user.name ||
                                      item.userId
                                    )}`}
                                    className="font-bold text-slate-800 hover:text-[#3182ce] transition-colors truncate max-w-[150px]"
                                    title="在用户画像中心反查该用户"
                                  >
                                    {item.user.name || "未设置昵称"}
                                  </Link>
                                  {item.user.role === "admin" && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-[#3182ce] border border-blue-200">
                                      管理员
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">
                                  {item.user.email || "未绑定邮箱"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 频率 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {getFrequencyBadge(item.frequency)}
                          </td>

                          {/* 邮件通知 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {!item.user.email ? (
                              <span
                                className="inline-flex items-center gap-1 text-slate-500 font-medium px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px]"
                                title="该用户尚未绑定外部邮箱，邮件通道不可达"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>未配置邮箱 (不可达)</span>
                              </span>
                            ) : item.emailNotifications ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>已开启</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                                <XCircle className="w-4 h-4 text-slate-300" />
                                <span>已关闭</span>
                              </span>
                            )}
                          </td>

                          {/* 系统消息 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {item.systemMessages ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>已开启</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                                <XCircle className="w-4 h-4 text-slate-300" />
                                <span>已关闭</span>
                              </span>
                            )}
                          </td>

                          {/* 项目更新 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {item.projectUpdates ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>已开启</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                                <XCircle className="w-4 h-4 text-slate-300" />
                                <span>已关闭</span>
                              </span>
                            )}
                          </td>

                          {/* 最后更新时间 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <div className="text-[11px] text-slate-500 font-mono">
                              {new Date(
                                item.updatedAt || item.createdAt
                              ).toLocaleString("zh-CN", { hour12: false })}
                            </div>
                          </td>

                          {/* 操作列 */}
                          <td className="sticky right-0 bg-white/95 group-hover:bg-blue-50/95 backdrop-blur-xs z-10 py-3.5 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 定向推送通知 */}
                              <button
                                onClick={() => openDispatchModal(item.user)}
                                className="px-2.5 h-7 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="向该用户发送一条定向系统通知"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>推送</span>
                              </button>

                              {/* 偏好详情（明确管理端诊断定位，更名为偏好详情） */}
                              <button
                                onClick={() => openPrefModal(item)}
                                className="px-2.5 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="查看该用户的个人通知偏好与接收通道诊断"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                                <span>偏好详情</span>
                              </button>

                              {/* 连通性测试（带清晰文字描述） */}
                              <button
                                onClick={() => handleSendTestNotification(item)}
                                className="px-2.5 h-7 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="向该用户发送一条通道健康连通性自检通知"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>连通测试</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 统一分页组件容器：加固自适应与滚动保护，杜绝截断 */}
              {notificationData && notificationData.total > 0 && (
                <div className="p-4 border-t border-slate-100 w-full overflow-x-auto">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={notificationData.total}
                    pageSize={pageSize}
                    onPageChange={(page) => setCurrentPage(page)}
                    itemLabel="位用户偏好"
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            {/* 历史记录 4 大 Bento 指标统计卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">历史推送总量</div>
                  <div className="text-2xl font-black font-mono text-[#3182ce]">
                    {historyStats.total} <span className="text-xs font-normal text-slate-400">条</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">全平台累计派发通知</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">今日派发通知</div>
                  <div className="text-2xl font-black font-mono text-purple-600">
                    {historyStats.todayCount} <span className="text-xs font-normal text-slate-400">条</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">今日实时新增消息</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">用户未读存量</div>
                  <div className="text-2xl font-black font-mono text-amber-600">
                    {historyStats.unreadCount} <span className="text-xs font-normal text-slate-400">条</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">等待用户在客户端阅毕</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Bell className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1">已读转化总量</div>
                  <div className="text-2xl font-black font-mono text-emerald-600">
                    {historyStats.readCount} <span className="text-xs font-normal text-slate-400">条</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">用户已在前台查看阅毕</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CheckCheck className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 历史多维搜索与筛选卡片 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* 标题或正文关键字搜索 */}
                <div className="relative min-w-[220px] flex-1 sm:w-64">
                  <input
                    type="text"
                    placeholder="搜索通知标题、正文关键词..."
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-slate-50/50 focus:bg-white"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>

                {/* 接收人过滤 */}
                <div className="relative min-w-[180px] sm:w-52">
                  <input
                    type="text"
                    placeholder="接收人姓名/邮箱..."
                    value={historyUserSearch}
                    onChange={(e) => {
                      setHistoryUserSearch(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full pl-8 pr-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-slate-50/50 focus:bg-white"
                  />
                  <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                </div>

                {/* 消息类型 */}
                <div className="w-38 shrink-0">
                  <select
                    value={historyType}
                    onChange={(e) => {
                      setHistoryType(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                  >
                    <option value="">全部通知类型</option>
                    <option value="system">🔔 系统通知</option>
                    <option value="update">🚀 功能更新</option>
                    <option value="alert">⚠️ 安全告警</option>
                    <option value="activity">🎁 平台活动</option>
                  </select>
                </div>

                {/* 阅读状态筛选 */}
                <div className="w-36 shrink-0">
                  <select
                    value={historyReadFilter}
                    onChange={(e) => {
                      setHistoryReadFilter(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                  >
                    <option value="">阅读状态: 全部</option>
                    <option value="true">🟢 用户已读</option>
                    <option value="false">⚪ 尚未阅读</option>
                  </select>
                </div>

                {/* 重置筛选 */}
                {(historySearch || historyType || historyReadFilter || historyUserSearch) && (
                  <button
                    type="button"
                    onClick={handleResetHistoryFilters}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                    title="重置所有历史筛选"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重置</span>
                  </button>
                )}
              </div>
            </div>

            {/* 历史记录数据表格 Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-3" />
                  <p className="text-xs text-slate-500 font-bold">正在加载推送历史记录流水...</p>
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto mb-3">
                    <History className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 mb-1">暂无推送历史记录</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                    未检索到符合条件的系统消息派发记录。您可以点击右上角发布通知，或调整搜索关键词。
                  </p>
                  <button
                    onClick={() => openDispatchModal()}
                    className="px-4 h-8.5 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl transition-colors cursor-pointer"
                  >
                    立即发布新通知
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3 px-5 whitespace-nowrap">消息类型</th>
                        <th className="py-3 px-5 whitespace-nowrap">通知标题与内容</th>
                        <th className="py-3 px-5 whitespace-nowrap">接收目标账户</th>
                        <th className="py-3 px-5 whitespace-nowrap">阅读状态</th>
                        <th className="py-3 px-5 whitespace-nowrap">推送时间</th>
                        <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                          治理操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {historyList.map((item) => {
                        const typeBadge = getNotificationTypeBadge(item.type);
                        return (
                          <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                            {/* 消息类型 */}
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${typeBadge.className}`}>
                                <span>{typeBadge.icon}</span>
                                <span>{typeBadge.label}</span>
                              </span>
                            </td>

                            {/* 标题与内容 */}
                            <td className="py-3.5 px-5 max-w-[320px]">
                              <div className="font-bold text-slate-800 truncate" title={item.title}>
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5" title={item.content}>
                                {item.content}
                              </div>
                            </td>

                            {/* 接收目标账户 */}
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              {item.user ? (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-black shrink-0 shadow-2xs">
                                    {item.user.avatar ? (
                                      <img src={item.user.avatar} alt="" className="w-full h-full rounded-xl object-cover" />
                                    ) : (
                                      (item.user.name?.charAt(0) || item.user.email?.charAt(0) || "U").toUpperCase()
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800 truncate max-w-[130px]">
                                      {item.user.name || "用户"}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                                      {item.user.email || "无邮箱"}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">全员广播或账户已出清</span>
                              )}
                            </td>

                            {/* 阅读状态 */}
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              {item.isRead ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>已读</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-[11px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>未读</span>
                                </span>
                              )}
                            </td>

                            {/* 推送时间 */}
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <div className="text-[11px] text-slate-500 font-mono">
                                {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                              </div>
                            </td>

                            {/* 操作列 (Sticky Right 固定吸附，仅提供详情查看) */}
                            <td className="sticky right-0 bg-white/95 group-hover:bg-blue-50/95 backdrop-blur-xs z-10 py-3.5 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                              <div className="flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() => setViewingHistory(item)}
                                  className="px-3 h-7 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  title="查看此条通知推送的完整内容与详情"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>详情</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 历史记录分页器 */}
              {historyTotal > 0 && (
                <div className="p-4 border-t border-slate-100 w-full overflow-x-auto">
                  <Pagination
                    currentPage={historyPage}
                    totalItems={historyTotal}
                    pageSize={historyPageSize}
                    onPageChange={(page) => setHistoryPage(page)}
                    itemLabel="条推送流水"
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 模态框 1：系统通知发布与推送模态框 (Dispatch Notification Modal) */}
        {showDispatchModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
              {/* 渐变头部 */}
              <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-white">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">
                      {dispatchForm.targetType === "all"
                        ? "发布全员广播系统通知"
                        : dispatchForm.targetType === "role"
                        ? "按受众群组批量发布系统通知"
                        : "精准批量定向发布系统通知"}
                    </h3>
                    <p className="text-[11px] text-blue-100/80 font-medium">
                      消息将直达用户前台右上角通知中心与站内信箱
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 主体表单 */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[#f0f8ff]/50">
                {/* 卡片 1：接收对象与消息类型 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      推送范围与消息属性
                    </h4>
                  </div>

                  {/* 目标范围切换 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      通知目标对象 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {/* 模式 1：全员广播 */}
                      <label
                        className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${dispatchForm.targetType === "all"
                            ? "bg-blue-50/70 border-[#3182ce] text-[#3182ce] shadow-2xs"
                            : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="targetType"
                            checked={dispatchForm.targetType === "all"}
                            onChange={() =>
                              setDispatchForm({
                                ...dispatchForm,
                                targetType: "all",
                                errors: { ...dispatchForm.errors, target: "" },
                              })
                            }
                            className="text-[#3182ce] focus:ring-[#3182ce]"
                          />
                          <span className="text-xs font-bold">📢 全员广播</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          全平台所有激活用户
                        </span>
                      </label>

                      {/* 模式 2：受众角色群组 */}
                      <label
                        className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${dispatchForm.targetType === "role"
                            ? "bg-blue-50/70 border-[#3182ce] text-[#3182ce] shadow-2xs"
                            : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="targetType"
                            checked={dispatchForm.targetType === "role"}
                            onChange={() =>
                              setDispatchForm({
                                ...dispatchForm,
                                targetType: "role",
                                errors: { ...dispatchForm.errors, target: "" },
                              })
                            }
                            className="text-[#3182ce] focus:ring-[#3182ce]"
                          />
                          <span className="text-xs font-bold">👥 受众角色群组</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          海量用户按身份批量推送
                        </span>
                      </label>

                      {/* 模式 3：精准批量定向 */}
                      <label
                        className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${dispatchForm.targetType === "targeted"
                            ? "bg-blue-50/70 border-[#3182ce] text-[#3182ce] shadow-2xs"
                            : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="targetType"
                            checked={dispatchForm.targetType === "targeted"}
                            onChange={() =>
                              setDispatchForm({
                                ...dispatchForm,
                                targetType: "targeted",
                                errors: { ...dispatchForm.errors, target: "" },
                              })
                            }
                            className="text-[#3182ce] focus:ring-[#3182ce]"
                          />
                          <span className="text-xs font-bold">🎯 精准批量定向</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {dispatchForm.targetUsers.length > 0
                            ? `已指定 ${dispatchForm.targetUsers.length} 位目标`
                            : "搜索多选 / 批量粘贴"}
                        </span>
                      </label>
                    </div>

                    {/* 模式 2 展开：受众群组选择（系统角色群组 + 自定义群组，均支持成员级增删） */}
                    {dispatchForm.targetType === "role" && (
                      <div className="mt-3 p-3.5 bg-blue-50/40 border border-blue-200/70 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[#3182ce]" />
                            <span>选择目标受众群体角色</span>
                          </label>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100/80 text-[#3182ce]">
                            {loadingGroups ? "正在测算群组人数..." : `预计覆盖：${roleCountEstimate ?? 0} 位用户`}
                          </span>
                        </div>

                        {/* 系统角色群组：角色清单由数据库 user.role 动态聚合生成，不再硬编码固定三档 */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 mb-1.5">
                            系统角色群组（按平台内真实存在的角色动态生成）
                          </div>
                          {notificationGroups.filter((g) => g.type === "system").length === 0 ? (
                            <div className="text-[10px] text-slate-400">
                              {loadingGroups ? "加载中..." : "暂未发现任何角色数据"}
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {notificationGroups.filter((g) => g.type === "system").map((g) => (
                                <div
                                  key={g.id}
                                  onClick={() => setDispatchForm((prev) => ({ ...prev, groupId: g.id, targetRole: g.roleKey || prev.targetRole }))}
                                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${dispatchForm.groupId === g.id
                                      ? "bg-white border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]"
                                      : "bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300"
                                    }`}
                                >
                                  <div className="text-xs font-bold text-slate-800">{g.name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{g.description || `角色值：${g.roleKey}`}</div>
                                  <div className="mt-1 flex items-center justify-between gap-1">
                                    <span className="text-[10px] font-bold text-[#3182ce]">{g.finalCount} 人</span>
                                    {(g.excludeCount > 0 || g.includeCount > 0) && (
                                      <span className="text-[9px] font-bold text-amber-600 whitespace-nowrap">
                                        +{g.includeCount}／-{g.excludeCount}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openGroupMemberModal(g); }}
                                    className="mt-1.5 w-full text-[10px] text-slate-500 hover:text-[#3182ce] border border-slate-200 hover:border-[#3182ce] rounded px-1 py-0.5 transition-colors cursor-pointer"
                                  >
                                    管理成员
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 自定义群组：管理员自由创建，成员完全可控 */}
                        <div className="border-t border-blue-200/70 pt-2.5">
                          <div className="text-[10px] font-bold text-slate-500 mb-1.5">自定义群组</div>
                          <div className="flex gap-1.5 mb-2">
                            <input
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              placeholder="输入群组名称，如：内测白名单用户"
                              className="flex-1 px-2 py-1 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                            />
                            <button
                              type="button"
                              onClick={handleCreateGroup}
                              disabled={creatingGroup || !newGroupName.trim()}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#3182ce] rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {creatingGroup ? "创建中" : "+ 新建"}
                            </button>
                          </div>
                          {notificationGroups.filter((g) => g.type === "custom").length === 0 ? (
                            <div className="text-[10px] text-slate-400">暂无自定义群组，可在上方创建</div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {notificationGroups.filter((g) => g.type === "custom").map((g) => (
                                <div
                                  key={g.id}
                                  onClick={() => setDispatchForm((prev) => ({ ...prev, groupId: g.id }))}
                                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${dispatchForm.groupId === g.id
                                      ? "bg-white border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]"
                                      : "bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300"
                                    }`}
                                >
                                  <div className="text-xs font-bold text-slate-800">{g.name}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{g.description || "自定义群组"}</div>
                                  <div className="mt-1 text-[10px] font-bold text-[#3182ce]">{g.finalCount} 人</div>
                                  <div className="mt-1.5 flex gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openGroupMemberModal(g); }}
                                      className="flex-1 text-[10px] text-slate-500 hover:text-[#3182ce] border border-slate-200 hover:border-[#3182ce] rounded px-1 py-0.5 transition-colors cursor-pointer"
                                    >
                                      成员
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                                      className="flex-1 text-[10px] text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-300 rounded px-1 py-0.5 transition-colors cursor-pointer"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 模式 3 展开：精准批量定向选人池与录入通道 */}
                    {dispatchForm.targetType === "targeted" && (
                      <div className="mt-3 p-3.5 bg-slate-50 border border-blue-200/80 rounded-xl space-y-3">
                        {/* 已选目标用户池 Header */}
                        <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-800">
                              已选定目标用户池
                            </span>
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#3182ce] text-white">
                              {dispatchForm.targetUsers.length} 人
                            </span>
                          </div>
                          {dispatchForm.targetUsers.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDispatchForm((prev) => ({ ...prev, targetUsers: [] }))
                              }
                              className="text-[11px] text-red-500 hover:underline font-bold transition-colors cursor-pointer"
                            >
                              清空全部已选
                            </button>
                          )}
                        </div>

                        {/* 已选用户标签流式池：规模感知——≤ 50 流式全显；> 50 默认折叠，仅显示总数 + 池内搜索移除 */}
                        {dispatchForm.targetUsers.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between px-2 py-1.5 bg-white border border-slate-200/80 rounded-lg">
                              <span className="text-[11px] text-slate-700">
                                池内共 <strong>{dispatchForm.targetUsers.length}</strong> 位用户
                                {dispatchForm.targetUsers.length > 50 && (
                                  <span className="ml-1 text-slate-400">（规模较大，已默认折叠以保护性能）</span>
                                )}
                              </span>
                              {dispatchForm.targetUsers.length > 50 && (
                                <button
                                  type="button"
                                  onClick={() => setShowPoolList((s) => !s)}
                                  className="text-[10px] text-[#3182ce] hover:underline font-bold cursor-pointer shrink-0"
                                >
                                  {showPoolList ? "收起列表" : "展开前 200 位"}
                                </button>
                              )}
                            </div>

                            {/* 池内按邮箱/用户ID 移除单个（大规模时必备，避免找不到某人） */}
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={poolSearchTerm}
                                onChange={(e) => setPoolSearchTerm(e.target.value)}
                                placeholder="输入邮箱或用户ID以从池中移除单个"
                                className="flex-1 px-2 h-7 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:border-[#3182ce] bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveFromPool(poolSearchTerm)}
                                disabled={!poolSearchTerm.trim()}
                                className="px-2 h-7 text-[10px] font-bold text-red-500 border border-red-200 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                              >
                                移除
                              </button>
                            </div>

                            {(dispatchForm.targetUsers.length <= 50 || showPoolList) && (
                              <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 p-2 bg-white rounded-lg border border-slate-200/80">
                                {dispatchForm.targetUsers
                                  .slice(0, dispatchForm.targetUsers.length > 50 ? 200 : dispatchForm.targetUsers.length)
                                  .map((u) => (
                                    <span
                                      key={u.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.8 bg-blue-50 border border-blue-200 rounded-md text-[11px] text-slate-700 font-medium"
                                    >
                                      <span className="font-bold text-[#3182ce]">
                                        {u.name || u.email || (u.id ? `ID:${u.id.slice(0, 8)}` : "用户")}
                                      </span>
                                      {u.email && u.email !== u.name && (
                                        <span className="text-slate-400 text-[10px]">({u.email})</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveUserFromTarget(u.id)}
                                        className="text-slate-400 hover:text-red-500 transition-colors ml-0.5 cursor-pointer"
                                        title="移除此用户"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                {dispatchForm.targetUsers.length > 200 && (
                                  <div className="w-full text-center text-[10px] text-slate-400 py-1">
                                    仅显示前 200 位，共 {dispatchForm.targetUsers.length} 位
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-2.5 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                            暂未选定目标用户，请通过下方【海量检索】或【批量粘贴】添加用户
                          </div>
                        )}

                        {/* 录入通道模式切换 */}
                        <div className="flex items-center gap-3 border-b border-slate-200/80 pt-1">
                          <button
                            type="button"
                            onClick={() => setBatchPasteMode(false)}
                            className={`pb-1.5 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${!batchPasteMode
                                ? "text-[#3182ce] border-b-2 border-[#3182ce]"
                                : "text-slate-400 hover:text-slate-600"
                              }`}
                          >
                            <Search className="w-3 h-3" />
                            <span>海量实时检索添加</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchPasteMode(true)}
                            className={`pb-1.5 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${batchPasteMode
                                ? "text-[#3182ce] border-b-2 border-[#3182ce]"
                                : "text-slate-400 hover:text-slate-600"
                              }`}
                          >
                            <FileText className="w-3 h-3" />
                            <span>批量粘贴导入 (邮箱/ID)</span>
                          </button>
                        </div>

                        {/* 通道 1：服务端防抖搜索（不拉全量，海量用户毫秒级响应） */}
                        {!batchPasteMode ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={userSearchTerm}
                                onChange={(e) => setUserSearchTerm(e.target.value)}
                                placeholder="输入用户名、邮箱或手机号进行服务端实时检索..."
                                className="w-full pl-8 pr-8 h-8.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-[#3182ce] focus:outline-none focus:ring-1 focus:ring-[#3182ce] text-slate-700 font-medium"
                              />
                              {userSearching && (
                                <RefreshCw className="w-3 h-3 text-[#3182ce] animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                              )}
                            </div>

                            {userSearchTerm.trim() && (
                              <div className="border border-slate-200/80 rounded-lg bg-white p-1">
                                {userSearchResults.length > 0 && (
                                  <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-slate-100 text-[10px] text-slate-400">
                                    <span>
                                      匹配 <strong className="text-slate-700">{userSearchTotal ?? userSearchResults.length}</strong> 位
                                      {(userSearchTotal ?? 0) > userSearchResults.length && (
                                        <span>，仅显示前 {userSearchResults.length} 位（请细化关键词或一键添加全部）</span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {userSearchKeyword && (userSearchTotal ?? 0) > userSearchResults.length && (
                                        <button
                                          type="button"
                                          onClick={() => handleAddAllMatched(userSearchKeyword)}
                                          className="text-[#3182ce] hover:underline font-bold cursor-pointer"
                                          title="服务端一次性拉取全部匹配用户并加入发送池"
                                        >
                                          ⚡ 一键添加全部 {userSearchTotal} 位
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={handleAddAllSearchResults}
                                        className="text-[#3182ce] hover:underline font-bold cursor-pointer"
                                      >
                                        + 当前页全选
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <div className="max-h-36 overflow-y-auto space-y-1">
                                  {userSearchResults.map((u) => {
                                    const isAdded = dispatchForm.targetUsers.some((tu) => tu.id === u.id);
                                    return (
                                      <div
                                        key={u.id}
                                        className="flex items-center justify-between p-1.5 rounded-md hover:bg-slate-50 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                            {(u.name || u.email || "U").slice(0, 1).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <span className="text-xs font-bold text-slate-800 block truncate">
                                              {u.name || "未命名用户"}
                                            </span>
                                            <span className="text-[10px] text-slate-400 block truncate">
                                              {u.email || `ID: ${u.id.slice(0, 8)}...`}
                                            </span>
                                          </div>
                                        </div>
                                        {isAdded ? (
                                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                                            已在发送池
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleAddUserToTarget(u)}
                                            className="text-[10px] font-bold text-[#3182ce] bg-blue-50 hover:bg-[#3182ce] hover:text-white px-2 py-0.5 rounded transition-colors shrink-0 cursor-pointer"
                                          >
                                            + 添加
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {userSearchResults.length === 0 && !userSearching && (
                                    <div className="py-3 text-center text-xs text-slate-400">
                                      未搜索到匹配的用户，请检查搜索词
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* 通道 2：批量粘贴文本导入 */
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={batchPasteText}
                              onChange={(e) => setBatchPasteText(e.target.value)}
                              placeholder={"支持从 Excel 或剪贴板整列复制用户邮箱或用户ID粘贴至此，支持换行、逗号或分号分隔，例如：\nuser1@example.com\nuser2@example.com, clxxxyyyzzz"}
                              className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg focus:border-[#3182ce] focus:outline-none focus:ring-1 focus:ring-[#3182ce] text-slate-700 font-mono"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-slate-400">
                                支持换行/逗号/分号分隔；如需数万用户，可直接上传 CSV/TXT
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <label className={`px-3 h-7 flex items-center text-xs font-bold rounded-lg transition-colors cursor-pointer ${bulkImporting ? "bg-slate-200 text-slate-500" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                                  {bulkImporting ? "导入中..." : "📂 上传 CSV/TXT"}
                                  <input
                                    type="file"
                                    accept=".csv,.txt,.tsv"
                                    className="hidden"
                                    disabled={bulkImporting}
                                    onChange={handleImportFile}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={handleBatchParsePaste}
                                  className="px-3 h-7 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                >
                                  智能解析并加入发送池
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {dispatchForm.errors.target && (
                          <p className="text-[11px] text-red-500 font-bold">
                            {dispatchForm.errors.target}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 消息类型 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      通知消息类型
                    </label>
                    <select
                      value={dispatchForm.type}
                      onChange={(e) =>
                        setDispatchForm({ ...dispatchForm, type: e.target.value })
                      }
                      className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] text-xs font-bold text-slate-800 bg-slate-50/50 focus:bg-white"
                    >
                      <option value="system">🔔 系统通知 (System Notice)</option>
                      <option value="update">🚀 功能与版本更新 (Feature Update)</option>
                      <option value="alert">⚠️ 安全与业务告警 (Important Alert)</option>
                      <option value="activity">🎁 平台活动与福利 (Event & Reward)</option>
                    </select>
                  </div>
                </div>

                {/* 卡片 2：正文与超链接 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <div className="w-2 h-3.5 rounded-full bg-emerald-500" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      通知内容配置
                    </h4>
                  </div>

                  {/* 标题 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        通知标题 <span className="text-red-500">*</span>
                      </label>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded ${dispatchForm.title.length > 50
                            ? "bg-red-50 text-red-600 font-bold"
                            : "bg-slate-100 text-slate-500"
                          }`}
                      >
                        {dispatchForm.title.length} / 50 字
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={50}
                      value={dispatchForm.title}
                      onChange={(e) =>
                        setDispatchForm({
                          ...dispatchForm,
                          title: e.target.value,
                          errors: { ...dispatchForm.errors, title: "" },
                        })
                      }
                      placeholder="如：知阁平台算力服务维护升级通知（最多50字）"
                      className={`w-full px-3.5 h-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-bold transition-all bg-slate-50/50 focus:bg-white ${dispatchForm.errors.title
                          ? "border-red-400 focus:border-red-500"
                          : "border-slate-200 focus:border-[#3182ce]"
                        }`}
                    />
                    {dispatchForm.errors.title && (
                      <p className="mt-1 text-[11px] text-red-500 font-bold">
                        {dispatchForm.errors.title}
                      </p>
                    )}
                  </div>

                  {/* 正文 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        通知详细正文 <span className="text-red-500">*</span>
                      </label>
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded ${dispatchForm.content.length > 1000
                            ? "bg-red-50 text-red-600 font-bold"
                            : "bg-slate-100 text-slate-500"
                          }`}
                      >
                        {dispatchForm.content.length} / 1,000 字
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      maxLength={1000}
                      value={dispatchForm.content}
                      onChange={(e) =>
                        setDispatchForm({
                          ...dispatchForm,
                          content: e.target.value,
                          errors: { ...dispatchForm.errors, content: "" },
                        })
                      }
                      placeholder="请输入具体的通知说明文字、操作建议或影响范围..."
                      className={`w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-medium transition-all bg-slate-50/50 focus:bg-white resize-y leading-relaxed ${dispatchForm.errors.content
                          ? "border-red-400 focus:border-red-500"
                          : "border-slate-200 focus:border-[#3182ce]"
                        }`}
                    />
                    {dispatchForm.errors.content && (
                      <p className="mt-1 text-[11px] text-red-500 font-bold">
                        {dispatchForm.errors.content}
                      </p>
                    )}
                  </div>
                </div>

                {/* 卡片 3：规范提醒 */}
                <div className="p-3.5 bg-blue-50/80 border border-blue-100/80 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                  <AlertTriangle className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>推送合规与受众提示：</strong>
                    {dispatchForm.targetType === "all" ? (
                      <span>
                        全员广播通知一旦触发，将即刻批量写入全站所有激活用户的信箱并弹出未读气泡，请在发送前仔细核对标题与正文合规性。
                      </span>
                    ) : dispatchForm.targetType === "role" ? (
                      <span>
                        当前将批量推送到【<strong className="text-slate-900">{
                          dispatchForm.targetRole === "admin"
                            ? "管理与运营团队"
                            : dispatchForm.targetRole === "creator"
                              ? "创作者与开发组"
                              : "普通注册会员"
                        }</strong>】群组（预计覆盖 {roleCountEstimate !== null ? `${roleCountEstimate} 位` : "全量"} 活跃用户）。
                      </span>
                    ) : (
                      <span>
                        当前将精准批量送达已选定的【<strong className="text-slate-900">{dispatchForm.targetUsers.length}</strong>】位目标用户信箱。
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 模态框操作底部 */}
              <div className="bg-white border-t border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="text-xs font-medium">
                  {!isDispatchTitleValid ? (
                    <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>请输入 2-50 字的通知标题</span>
                    </span>
                  ) : !isDispatchContentValid ? (
                    <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>正文至少需要 5 个字</span>
                    </span>
                  ) : !isDispatchTargetValid ? (
                    <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>请至少选择或添加一位定向接收用户</span>
                    </span>
                  ) : (
                    <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>通知内容与受众配置均已就绪</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
                    className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDispatchSubmit}
                    disabled={dispatchSubmitting || !isDispatchFormValid}
                    className="px-5 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {dispatchSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>
                      {dispatchForm.targetType === "all"
                        ? "确认全员广播推送"
                        : dispatchForm.targetType === "role"
                          ? `确认推送至角色群组 (${roleCountEstimate ?? ""}人)`
                          : `确认批量送达 (${dispatchForm.targetUsers.length}人)`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 模态框：群组成员管理（对群组内个体进行剔除 / 追加 / 恢复） */}
        {showGroupMemberModal && managingGroup && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-800 truncate">
                    管理群组成员：{managingGroup.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {managingGroup.type === "system"
                      ? `系统角色群组（角色值：${managingGroup.roleKey}）· 可剔除个别成员，也可跨角色追加成员`
                      : "自定义群组 · 通过下方搜索添加成员"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGroupMemberModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 搜索并追加成员 */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <label className="text-[11px] font-bold text-slate-600 block mb-1.5">
                  搜索用户并加入本群组
                </label>
                <input
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  placeholder="输入姓名 / 邮箱搜索用户"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
                {memberSearchTerm.trim() && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {memberSearching ? (
                      <div className="text-[11px] text-slate-400">搜索中...</div>
                    ) : memberSearchResults.length === 0 ? (
                      <div className="text-[11px] text-slate-400">未找到匹配用户</div>
                    ) : (
                      memberSearchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between px-2 py-1.5 bg-white border border-slate-200 rounded-lg"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-slate-700 truncate">
                              {u.name || u.email}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleIncludeMember(u)}
                            className="ml-2 px-2 py-1 text-[10px] font-bold text-[#3182ce] border border-[#3182ce] rounded hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            + 加入群组
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 当前成员（可剔除） */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-slate-600">
                    当前群组内成员（{groupMembers.length} 位）
                  </label>
                  {loadingGroupMembers && (
                    <span className="text-[10px] text-slate-400">加载中...</span>
                  )}
                </div>
                {groupMembers.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-4 text-center">
                    暂无成员，请通过上方搜索添加
                  </div>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {groupMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-2 py-1.5 bg-white border border-slate-200 rounded-lg"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-700 truncate">
                            {m.name || m.email}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {m.email} · {m.role}
                            {m.source === "include" && (
                              <span className="ml-1 text-[#3182ce] font-bold">（额外追加）</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExcludeMember(m.id)}
                          className="ml-2 px-2 py-1 text-[10px] font-bold text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          剔除
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 已剔除成员（可恢复） */}
                {groupExcluded.length > 0 && (
                  <div className="mt-4">
                    <label className="text-[11px] font-bold text-slate-600 block mb-2">
                      已从本群组剔除（{groupExcluded.length} 位）
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {groupExcluded.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-2 py-1.5 bg-red-50/50 border border-red-100 rounded-lg"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-slate-700 truncate">
                              {m.name || m.email}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{m.email}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRestoreMember(m.id)}
                            className="ml-2 px-2 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-200 rounded hover:bg-emerald-50 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            恢复
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGroupMemberModal(false)}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#3182ce] rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 模态框 2：用户偏好调优模态框 (Edit Preferences Modal) */}
        {editingPref && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
              {/* 头部：知阁知性蓝品牌渐变 */}
              <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center font-bold text-white shadow-2xs">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black">
                      用户通知偏好详情与诊断
                    </h3>
                    <p className="text-[11px] text-blue-100 font-medium">
                      目标账户：{editingPref.user.name || "未命名账户"}（{editingPref.user.email || "未绑定外部邮箱"}）
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingPref(null)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 职责说明提示卡片 */}
              <div className="mx-6 mt-4 p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 shrink-0">
                <AlertTriangle className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>治理职责说明：</strong>
                  通知接收偏好主要由用户在个人中心工作台中自主管理。管理员在此仅用于排查消息投递故障，或在必要时协助维护通道状态。
                </div>
              </div>

              {/* 主体卡片 */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-white">
                <div className="text-xs font-bold text-slate-500 mb-2 flex items-center justify-between">
                  <span>通知通道开启状态：</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {editingPref.user.email ? `外部邮箱已绑定: ${editingPref.user.email}` : "⚠️ 未配置有效外部邮箱"}
                  </span>
                </div>

                {/* 邮件通知 */}
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#3182ce]" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        邮件通知 (Email Alerts)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {editingPref.user.email
                          ? "通过绑定的外部邮箱接收重要通知与业务告警"
                          : "该账户未绑定邮箱，若开启也无法向其送达邮件"}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefForm.emailNotifications}
                    onChange={(e) =>
                      setPrefForm({
                        ...prefForm,
                        emailNotifications: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                  />
                </label>

                {/* 系统消息 */}
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        系统消息 (System Messages)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        站内铃铛与未读红点提示
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefForm.systemMessages}
                    onChange={(e) =>
                      setPrefForm({
                        ...prefForm,
                        systemMessages: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                  />
                </label>

                {/* 项目更新 */}
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <FolderGit2 className="w-4 h-4 text-purple-500" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        项目与工作空间动态 (Project Updates)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        所属工作空间的成员变动与组件发布
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefForm.projectUpdates}
                    onChange={(e) =>
                      setPrefForm({
                        ...prefForm,
                        projectUpdates: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                  />
                </label>

                {/* 汇总投递频率（扩充为6大标准研发协同频率） */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    汇总投递频率
                  </label>
                  <select
                    value={prefForm.frequency}
                    onChange={(e) =>
                      setPrefForm({ ...prefForm, frequency: e.target.value })
                    }
                    className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] text-xs font-bold text-slate-800 bg-slate-50/50 focus:bg-white cursor-pointer"
                  >
                    <option value="REALTIME">⚡ 实时推送 (REALTIME) - 即刻推送无延迟</option>
                    <option value="HOURLY">⏱️ 每小时汇总 (HOURLY) - 团队紧凑跟进</option>
                    <option value="DAILY">📅 每日汇总 (DAILY) - 下班前统一复盘</option>
                    <option value="WEEKLY">📊 每周精选 (WEEKLY) - 周度工作提炼</option>
                    <option value="CRITICAL_ONLY">🛡️ 仅严重告警 (CRITICAL_ONLY) - 过滤低级扰动</option>
                    <option value="QUIET_HOURS">🌙 工作免打扰 (QUIET_HOURS) - 仅工作时段派发</option>
                  </select>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPrefForm({
                      emailNotifications: Boolean(editingPref.user.email),
                      systemMessages: true,
                      projectUpdates: true,
                      commentMentions: false,
                      frequency: "REALTIME",
                    });
                    toast.success("已重置为推荐配置（点击保存即可生效）");
                  }}
                  className="px-3 h-8.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="恢复推荐偏好配置"
                >
                  重置为默认
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingPref(null)}
                    className="px-4 h-8.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={handlePrefSubmit}
                    disabled={prefSubmitting}
                    className="px-5 h-8.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {prefSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>保存治理调整</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 推送历史详情模态框 */}
        {viewingHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
              {/* 顶栏 Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">
                    {getNotificationTypeBadge(viewingHistory.type).icon}
                  </span>
                  <div>
                    <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                      系统推送详情
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getNotificationTypeBadge(viewingHistory.type).className
                          }`}
                      >
                        {getNotificationTypeBadge(viewingHistory.type).label}
                      </span>
                    </h3>
                    <p className="text-[11px] text-blue-100 font-medium">
                      编号 ID: #{viewingHistory.id.slice(0, 16)}...
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingHistory(null)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {/* 内容区 Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                {/* 标题 */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-400 block mb-1">
                    通知标题
                  </span>
                  <h4 className="text-sm font-black text-slate-800 leading-snug">
                    {viewingHistory.title}
                  </h4>
                </div>

                {/* 元信息 Bento 卡片 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 接收用户 */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 block">
                      接收用户
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-black text-[#3182ce] shrink-0">
                        {(viewingHistory.user?.name || viewingHistory.user?.email || "U")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {viewingHistory.user?.name || "未设昵称"}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 truncate">
                          {viewingHistory.user?.email || "未绑定邮箱"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 派发与已读状态 */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 block">
                      触达状态与时间
                    </span>
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${viewingHistory.isRead
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                      >
                        {viewingHistory.isRead ? "✓ 用户已查阅" : "○ 用户未查阅"}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(viewingHistory.createdAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 详细正文 */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 block">
                    详细通知正文
                  </span>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 text-slate-700 leading-relaxed font-mono whitespace-pre-wrap select-text max-h-60 overflow-y-auto">
                    {viewingHistory.content}
                  </div>
                </div>
              </div>

              {/* 底栏 Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>系统出清规则：已阅读历史通知在超期 3 个月（90天）后将由系统自动安全出清</span>
                </span>

                <button
                  type="button"
                  onClick={() => setViewingHistory(null)}
                  className="px-5 h-8.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 确认对话框 */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          type={confirmModal.type}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        />
      </div>
    </div>
  );
}
