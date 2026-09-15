"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  Search,
  Bell,
  History,
  KeyRound,
  Monitor,
  Smartphone,
  Globe,
  MapPin,
  Clock,
  Download,
  Check,
  Plus,
  Minus,
  ArrowRight,
  Loader2,
  Coins,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";
import { useAdminPermission } from "@/contexts/AdminPermissionContext";

/** 用户列表每页固定展示 10 条 */
const PAGE_SIZE = 10;

/** 登录历史弹窗每页条数 */
const LOGIN_HISTORY_PAGE_SIZE = 10;

/** 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前 / N 个月前） */
function formatRelativeTime(input: string | Date): string {
  const time = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(time)) return "—";
  const diff = Date.now() - time;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (diff < 0) return "刚刚";
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return `${Math.floor(diff / (30 * DAY))} 个月前`;
}

/** 将“系统 · 浏览器”格式的设备串拆分为系统与浏览器两段，用于分组展示 */
function splitDevice(device?: string | null): { os: string; browser: string } {
  const raw = (device || "").trim();
  if (!raw || raw === "未知" || raw === "unknown") return { os: "未知设备", browser: "" };
  const parts = raw
    .split(/[·•|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { os: parts[0], browser: parts.slice(1).join(" · ") };
  return { os: parts[0] || raw, browser: "" };
}

/** 严格基于真实 UA 与设备信息解析终端与浏览器分类（真实数据客观判断，绝不虚构） */
function parseClientDeviceAndBrowser(device?: string | null, userAgent?: string | null): {
  isMobile: boolean;
  deviceType: "DESKTOP" | "MOBILE";
  browserType: "Chrome" | "Edge" | "IE" | "360" | "QQ" | "Other";
  browserName: string;
  osName: string;
} {
  const ua = (userAgent || "").toLowerCase();
  const rawDev = (device || "").toLowerCase();

  // 1. 终端真实客观判断
  const isMobile =
    /(mobile|android|iphone|ipad|ipod|phone|symbian)/i.test(ua) ||
    /(mobile|android|iphone|ipad)/i.test(rawDev);
  const deviceType: "DESKTOP" | "MOBILE" = isMobile ? "MOBILE" : "DESKTOP";

  // 2. 浏览器分类（严格按用户指令分类：Chrome、Edge、IE 浏览器、360 浏览器、QQ 浏览器、其他）
  let browserType: "Chrome" | "Edge" | "IE" | "360" | "QQ" | "Other" = "Other";
  let browserName = "其他浏览器";

  if (/(msie\s|trident.*rv:([\d.]+))/i.test(ua) || rawDev.includes("ie")) {
    browserType = "IE";
    browserName = "IE 浏览器";
  } else if (/(edg|edge)\//i.test(ua) || rawDev.includes("edge")) {
    browserType = "Edge";
    browserName = "Edge 浏览器";
  } else if (/(qihu\s*360|360ee|360se)/i.test(ua) || rawDev.includes("360")) {
    browserType = "360";
    browserName = "360 浏览器";
  } else if (/(qqbrowser|mqqbrowser)/i.test(ua) || rawDev.includes("qq")) {
    browserType = "QQ";
    browserName = "QQ 浏览器";
  } else if (
    (/(chrome\/|crios\/)/i.test(ua) || rawDev.includes("chrome")) &&
    !/(micromessenger|edg|edge|360ee|360se|qqbrowser)/i.test(ua)
  ) {
    browserType = "Chrome";
    browserName = "Chrome 浏览器";
  } else {
    // Safari、微信客户端、Firefox、原生 WebView 等统一归类为“其他”
    browserType = "Other";
    browserName = "其他浏览器";
  }

  const { os } = splitDevice(device);
  return {
    isMobile,
    deviceType,
    browserType,
    browserName,
    osName: os || (isMobile ? "移动端" : "桌面端"),
  };
}

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
  isZombie?: boolean;
  tenantId?: string | null;
  lastLoginAt?: string | null;
  isOnline: boolean;
  // 是否存在有效会话（sessionToken 未清空且未过期），强制下线的可用性以此为准
  hasSession?: boolean;
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
  const { hasPermission, isSuperAdmin } = useAdminPermission();

  // 细粒度业务权限判定（若无某权限，界面对应操作按钮与入口严格隐藏）
  const canViewDetail = hasPermission("user:detail");
  const canUpdate = hasPermission("user:update");
  const canChangeRole = hasPermission("user:role_change");
  const canBan = hasPermission("user:ban");
  const canUnban = hasPermission("user:unban");
  const canResetSession = hasPermission("user:reset_session");
  const canSecurityReset = hasPermission("user:security_reset");

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterAccountStatus, setFilterAccountStatus] = useState<string>("all"); // 账号状态
  const [filterLoginStatus, setFilterLoginStatus] = useState<string>("all"); // 登录状态
  const [filterMembershipLevel, setFilterMembershipLevel] =
    useState<string>("all");
  const [filterZombie, setFilterZombie] = useState<string>("all"); // 僵尸用户快捷筛选
  const [scanning, setScanning] = useState(false); // 手动扫描僵尸用户中
  const [exporting, setExporting] = useState(false); // 导出 Excel 中
  const [currentPage, setCurrentPage] = useState(1);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; left: number } | null>(null);
  // 操作菜单真实 DOM / 触发按钮引用：用于量测真实高度，决定上翻或自动滚动补偿
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const menuAnchorElRef = useRef<HTMLElement | null>(null);
  const menuPositionAdjustedRef = useRef<string | null>(null);
  // 程序化滚动（为了撑开菜单）不应触发"滚动即关闭菜单"
  const ignoreScrollCloseUntilRef = useRef(0);

  // 菜单打开时，滚动或缩放窗口则自动关闭（fixed 定位需跟随关闭，避免脱锚）
  useEffect(() => {
    if (!showActionMenu) return;
    const close = () => {
      if (Date.now() < ignoreScrollCloseUntilRef.current) return;
      setShowActionMenu(null);
      setActionMenuPos(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showActionMenu]);

  // 打开菜单后量测真实高度：上方放得下就上翻，否则自动滚动页面把菜单完整"推"进视口
  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;
  useIsomorphicLayoutEffect(() => {
    if (!showActionMenu) return;
    if (menuPositionAdjustedRef.current === showActionMenu) return;
    const menuEl = actionMenuRef.current;
    const anchorEl = menuAnchorElRef.current;
    if (!menuEl || !anchorEl) return;
    menuPositionAdjustedRef.current = showActionMenu;

    const menuHeight = menuEl.offsetHeight;
    const anchorRect = anchorEl.getBoundingClientRect();
    const gap = 8;
    const margin = 16;
    const viewportH = window.innerHeight;

    // 1) 上方空间充足 → 贴着按钮上方展开，无需滚动
    if (anchorRect.top - gap - menuHeight >= margin) {
      const top = anchorRect.top - gap - menuHeight;
      setActionMenuPos((p) => (p && Math.abs(p.top - top) > 1 ? { ...p, top } : p));
      return;
    }

    // 2) 下方空间不足 → 自动把页面上推（用户无需手动滚动）
    const overflow = anchorRect.bottom + gap + menuHeight - (viewportH - margin);
    if (overflow <= 0) return;

    const beforeScroll = window.scrollY;
    ignoreScrollCloseUntilRef.current = Date.now() + 600;
    window.scrollBy(0, overflow);
    const applied = window.scrollY - beforeScroll;

    // 页面滚动后按钮随之上移，菜单落点同步上移；若已到页面底部仍放不下则贴底显示
    const nextTop = Math.min(
      Math.max(anchorRect.bottom - applied + gap, margin),
      Math.max(viewportH - margin - menuHeight, margin),
    );
    setActionMenuPos((p) => (p ? { ...p, top: nextTop } : p));
  }, [showActionMenu]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "", status: "" });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  // 跨页全选：勾选后批量操作将携带当前筛选条件交给后端，而非数百个 ID
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  // 统一批量操作（封禁/解封/强制下线/删除）的流程状态机
  const [batchFlow, setBatchFlow] = useState<{
    action: "ban" | "unban" | "kick" | "delete";
    open: boolean;
    preview?: {
      selectedCount: number;
      skippedCount: number;
      skipped: { id: string; name: string; reason: string }[];
    };
    processing: boolean;
    result?: {
      processedCount: number;
      skippedCount: number;
      failedCount: number;
      skipped: { id: string; name: string; reason: string }[];
    };
  } | null>(null);
  // 批量结果弹窗中是否展开“跳过原因”明细
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
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

  // 新增的单用户全局操作弹窗状态
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [generatedPwd, setGeneratedPwd] = useState<string | null>(null);
  const [notifyUser, setNotifyUser] = useState<User | null>(null);
  const [notifyForm, setNotifyForm] = useState({
    title: "",
    content: "",
    type: "system",
    popupOnLogin: false,
  });
  const [adjustPointsUser, setAdjustPointsUser] = useState<User | null>(null);
  const [adjustPointsForm, setAdjustPointsForm] = useState({ points: "", reason: "" });
  const [adjustPointsSubmitting, setAdjustPointsSubmitting] = useState(false);
  const [loginHistoryUser, setLoginHistoryUser] = useState<User | null>(null);
  const [loginHistories, setLoginHistories] = useState<any[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [loginHistoryTotal, setLoginHistoryTotal] = useState(0);
  const [loginHistoryPage, setLoginHistoryPage] = useState(1);
  // 登录历史多维筛选状态
  const [loginHistoryFilterDevice, setLoginHistoryFilterDevice] = useState<"ALL" | "DESKTOP" | "MOBILE">("ALL");
  const [loginHistoryFilterBrowser, setLoginHistoryFilterBrowser] = useState<string>("ALL");
  const [loginHistoryFilterTimeRange, setLoginHistoryFilterTimeRange] = useState<"ALL" | "24H" | "7D" | "30D">("ALL");
  const [loginHistoryKeyword, setLoginHistoryKeyword] = useState<string>("");

  /** 弹窗表单字段级必填校验错误提示 */
  const [notifyErrors, setNotifyErrors] = useState<{ title?: string; content?: string }>({});
  const [adjustPointsErrors, setAdjustPointsErrors] = useState<{ points?: string }>({});

  // 安全删除用户弹窗（归属优先：先定归属，再定策略）
  const [deleteTarget, setDeleteTarget] = useState<{
    userId: string;
    name: string | null;
    email: string | null;
  } | null>(null);
  const [deletePreview, setDeletePreview] = useState<any>(null);
  const [transferToUserId, setTransferToUserId] = useState<string>("");
  const [archivePersonal, setArchivePersonal] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [transferCandidates, setTransferCandidates] = useState<
    { id: string; name: string | null; email: string | null }[]
  >([]);

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

  // 身份与角色从数据库获取，不信任 localStorage（防止客户端伪造角色）
  useEffect(() => {
    const initCurrentUser = async () => {
      try {
        const authToken = getAuthToken();
        const res = await fetch("/api/auth/me", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (await handleUnauthorized(res)) return;
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data.user?.id ?? null);
          // 统一规范为小写，与下方 currentUserRole === "super_admin" 等比较保持一致
          setCurrentUserRole(data.user?.role ? String(data.user.role).toLowerCase() : null);
        }
      } catch (e) {
        console.error("获取当前用户信息失败:", e);
      }
    };
    initCurrentUser();
  }, []);

  useEffect(() => {
    loadUsers(currentPage);
  }, [
    currentPage,
    searchQuery,
    filterRole,
    filterAccountStatus,
    filterLoginStatus,
    filterMembershipLevel,
    filterZombie,
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
        ...(filterZombie === "1" && { zombie: "1" }),
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
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ userId }),
      });

      // 处理 401 错误（未授权/被强制下线）
      if (await handleUnauthorized(res)) {
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error || "强制下线失败");
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

  // 仅重置页码，筛选条件的加载统一由上方 useEffect 触发（避免读到旧闭包值）
  const handleSearch = useCallback(() => {
    setCurrentPage(1);
  }, []);

  /** 手动触发全量僵尸用户扫描（刷新 is_zombie 标记 + 向超管推送清理提醒） */
  const handleZombieScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/users/zombie-scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        showToast(
          data.message || `僵尸用户扫描完成，共识别 ${data.zombieCount ?? 0} 个`,
          "success"
        );
        loadUsers(currentPage);
      } else {
        showToast(data?.error || "僵尸用户扫描失败", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "僵尸用户扫描失败", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleResetFilters = () => {
    setFilterRole("all");
    setFilterAccountStatus("all");
    setFilterLoginStatus("all");
    setFilterMembershipLevel("all");
    setFilterZombie("all");
    setSearchQuery("");
    setCurrentPage(1);
  };

  /** 导出当前筛选条件下的全量用户为 Excel 表格 */
  const handleExportExcel = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const authToken = getAuthToken();
      // 获取当前筛选条件下的全量匹配用户（单次拉取最多 5000 条）
      const queryParams = new URLSearchParams({
        page: "1",
        limit: "5000",
        ...(searchQuery.trim() && { search: searchQuery.trim() }),
        ...(filterRole !== "all" && { role: filterRole }),
        ...(filterAccountStatus !== "all" && { accountStatus: filterAccountStatus }),
        ...(filterMembershipLevel !== "all" && { membershipLevel: filterMembershipLevel }),
        ...(filterZombie === "1" && { zombie: "1" }),
      });

      const res = await fetch(`/api/admin/users?${queryParams}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        throw new Error("拉取用户导出数据失败");
      }

      const data = await res.json();
      const exportList: User[] = data.users || [];

      if (exportList.length === 0) {
        showToast("当前筛选条件下暂无用户数据可导出", "warning");
        return;
      }

      exportToExcel({
        filename: "知阁用户清单",
        sheetName: "用户数据",
        columns: [
          { header: "用户ID", key: "id", width: 28 },
          { header: "用户名", key: "name", width: 16 },
          { header: "邮箱地址", key: "email", width: 26 },
          { header: "手机号码", key: "phone", width: 16, formatter: (val) => val || "-" },
          {
            header: "平台角色",
            key: "role",
            width: 14,
            formatter: (val) => {
              if (val === "super_admin") return "超级管理员";
              if (val === "admin") return "平台管理员";
              return "普通用户";
            },
          },
          {
            header: "账号状态",
            key: "status",
            width: 12,
            formatter: (val) => {
              if (val === "active") return "正常";
              if (val === "disabled") return "已禁用";
              if (val === "banned") return "已封禁";
              if (val === "deleted") return "已注销";
              return val || "正常";
            },
          },
          {
            header: "会员等级",
            key: "membershipLevel",
            width: 14,
            formatter: (val) => {
              const map: Record<string, string> = {
                FREE: "免费版",
                BRONZE: "青铜会员",
                SILVER: "白银会员",
                GOLD: "黄金会员",
                DIAMOND: "钻石会员",
                CROWN: "皇冠会员",
              };
              return map[val] || val || "免费版";
            },
          },
          { header: "算力点余额", key: "points", width: 14, formatter: (val, row) => row.tokenBalance ?? val ?? 0 },
          { header: "是否僵尸用户", key: "isZombie", width: 14, formatter: (val) => (val ? "是" : "否") },
          { header: "最近登录时间", key: "lastLoginAt", width: 20, formatter: formatExcelDateTime },
          { header: "注册时间", key: "createdAt", width: 20, formatter: formatExcelDateTime },
        ],
        data: exportList,
      });

      showToast(`已成功导出 ${exportList.length} 位用户数据为 Excel 表格！`, "success");
    } catch (e: any) {
      console.error("Export users error:", e);
      showToast(e.message || "导出用户数据失败", "error");
    } finally {
      setExporting(false);
    }
  };

  const isSelectableUser = (user: User) =>
    user.role !== "super_admin" &&
    user.role !== "admin" &&
    user.id !== currentUserId;

  const toggleSelectUser = (user: User) => {
    if (!isSelectableUser(user)) return;
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(user.id)) {
      newSelected.delete(user.id);
    } else {
      newSelected.add(user.id);
    }
    setSelectedUsers(newSelected);
    setShowBatchActions(newSelected.size > 0);
  };

  const toggleSelectAll = () => {
    const selectableUsers = userData?.users?.filter(isSelectableUser) || [];
    const allSelectableSelected = selectableUsers.every((u) =>
      selectedUsers.has(u.id),
    );
    if (allSelectableSelected) {
      setSelectedUsers(new Set());
      setShowBatchActions(false);
    } else {
      const selectableIds = new Set(selectableUsers.map((u) => u.id));
      setSelectedUsers(selectableIds);
      setShowBatchActions(true);
    }
  };

  // 当前已选中的、可被操作的普通用户（管理员/超管/自己已在前端禁用勾选）
  const selectedUserList =
    userData?.users?.filter(
      (u) => selectedUsers.has(u.id) && isSelectableUser(u),
    ) || [];

  // 批量动作可用性：根据当前选中集合推断哪些动作“有意义”，无意义的直接隐藏
  // - 跨页全选时，当前页可操作用户即为当前筛选条件的代表样本（筛选条件决定了集合的同质状态）
  // - 删除为超级管理员专属动作（与单行操作的权限边界保持一致）
  const batchActionEligible = (() => {
    const pool = selectAllMatching
      ? userData?.users?.filter(isSelectableUser) || []
      : selectedUserList;
    return {
      ban: pool.some((u) => u.status === "active"),
      unban: pool.some((u) => u.status === "banned"),
      kick: pool.some((u) => u.status === "active" && !!u.hasSession),
      // 核心安全红线：只有超级管理员且所选用户中包含已被封禁的用户时，才允许执行批量删除
      delete:
        currentUserRole === "super_admin" &&
        pool.length > 0 &&
        pool.some((u) => u.status === "banned"),
    };
  })();

  // ============ 统一批量操作（封禁 / 解封 / 强制下线 / 删除）============
  type BatchActionType = "ban" | "unban" | "kick" | "delete";
  interface BatchFilters {
    search?: string;
    role?: string;
    accountStatus?: string;
    membershipLevel?: string;
  }
  const BATCH_ACTION_META: Record<
    BatchActionType,
    { label: string; verb: string; danger: boolean; irreversible?: boolean }
  > = {
    ban: { label: "批量封禁", verb: "封禁", danger: true },
    unban: { label: "批量解封", verb: "解封", danger: false },
    kick: { label: "批量强制下线", verb: "强制下线", danger: false },
    delete: { label: "批量删除", verb: "删除", danger: true, irreversible: true },
  };

  // 跨页全选时，把当前筛选条件交给后端（而非数百个 ID）
  const currentBatchFilters = (): BatchFilters => ({
    search: searchQuery.trim() || undefined,
    role: filterRole !== "all" ? filterRole : undefined,
    accountStatus: filterAccountStatus !== "all" ? filterAccountStatus : undefined,
    membershipLevel:
      filterMembershipLevel !== "all" ? filterMembershipLevel : undefined,
  });

  const openBatchFlow = async (action: BatchActionType) => {
    if (!selectAllMatching && selectedUsers.size === 0) {
      showToast("请先选择要操作的用户", "warning");
      return;
    }
    // 前置校验：批量删除时如果所选用户中均未封禁，予以友好明确的拦截提示
    if (action === "delete") {
      const pool = selectAllMatching
        ? userData?.users?.filter(isSelectableUser) || []
        : selectedUserList;
      const hasBanned = pool.some((u) => u.status === "banned");
      if (!hasBanned) {
        showToast("所选用户均未被封禁。根据平台安全规则，只有已被封禁的用户才允许执行删除，请先封禁目标用户", "warning");
        return;
      }
    }
    setShowBatchActions(false);
    setBatchFlow({ action, open: true, processing: false });
    try {
      const payload = selectAllMatching
        ? { filters: currentBatchFilters() }
        : { userIds: [...selectedUsers] };
      const res = await fetch("/api/admin/users/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action, dryRun: true }),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "获取操作预览失败");
      }
      const data = await res.json();
      setBatchFlow((f) =>
        f
          ? {
              ...f,
              preview: {
                selectedCount: data.selectedCount,
                skippedCount: data.skippedCount,
                skipped: data.skipped || [],
              },
            }
          : f
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "获取操作预览失败", "error");
      setBatchFlow(null);
    }
  };

  const confirmBatchFlow = async () => {
    if (!batchFlow) return;
    const { action } = batchFlow;
    const payload = selectAllMatching
      ? { filters: currentBatchFilters() }
      : { userIds: [...selectedUsers] };
    setBatchFlow((f) => (f ? { ...f, processing: true } : f));
    try {
      const res = await fetch("/api/admin/users/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action }),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "批量操作失败");
      }
      const data = await res.json();
      setBatchFlow((f) =>
        f
          ? {
              ...f,
              processing: false,
              result: {
                processedCount: data.processedCount,
                skippedCount: data.skippedCount,
                failedCount: data.failedCount,
                skipped: data.skipped || [],
              },
            }
          : f
      );
      setSelectedUsers(new Set());
      setSelectAllMatching(false);
      loadUsers(currentPage);
    } catch (e) {
      setBatchFlow((f) => (f ? { ...f, processing: false } : f));
      showToast(e instanceof Error ? e.message : "批量操作失败", "error");
    }
  };

  const closeBatchFlow = () => {
    setBatchFlow(null);
    setShowBatchActions(selectedUsers.size > 0 || selectAllMatching);
  };

  const handleViewDetails = async (user: User) => {
    // 先用列表已有的数据兜底渲染，即使详情接口不可用也不会白屏
    setViewingUser(user);
    setShowViewModal(true);

    // dev 环境下路由首次编译或 HMR 重启会造成瞬时连接中断，
    // 这里静默重试一次；仍失败则保持列表数据展示，不向控制台抛 TypeError 堆栈
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/admin/user?userId=${encodeURIComponent(user.id)}`, {
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
        return;
      } catch {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        } else {
          console.warn("[用户详情] 详情接口暂不可用，已展示列表基础信息");
        }
      }
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
    setDeleteError(null);
    // 前置安全红线校验：只有已被封禁(banned)的用户才允许被删除
    const target = userData?.users?.find((u) => u.id === userId);
    if (target && target.status !== "banned") {
      showToast("平台安全规则拦截：只有已被封禁的用户才能被删除，请先封禁该用户", "warning");
      return;
    }
    try {
      // 先拉取归属分析与数据摘要，再弹窗让管理员确认策略
      const res = await fetch(`/api/admin/user/delete-preview?userId=${userId}`);
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "获取删除预览失败");
      }
      const d = await res.json();
      setDeleteTarget({ userId, name: d.data.name, email: d.data.email });
      setDeletePreview(d.data);
      setTransferToUserId("");
      setArchivePersonal(false);
      // 预拉取可移交所有权的候选用户（排除目标本人与已注销账号）
      setTransferCandidates([]);
      fetch(`/api/admin/users?limit=200&role=user`)
        .then((r) => (r.ok ? r.json() : null))
        .then((list) => {
          if (!list?.users) return;
          setTransferCandidates(
            list.users.filter(
              (u: any) => u.id !== userId && u.status !== "deleted"
            )
          );
        })
        .catch(() => {});
    } catch (e) {
      showToast(e instanceof Error ? e.message : "获取删除预览失败", "error");
    }
  };

  /** 确认执行安全删除（软删除 + 归属策略） */
  const confirmDeleteUser = async () => {
    if (!deleteTarget || !deletePreview) return;
    // 情况 C：企业唯一所有者，红线拦截，确认按钮应被禁用
    if (deletePreview.case === "ENTERPRISE_SOLE_OWNER") return;
    // 情况 A：必须移交所有权或归档个人空间数据二选一
    if (deletePreview.requiresTransferOrArchive && !transferToUserId && !archivePersonal) {
      setDeleteError("请先将个人空间所有权移交给其他成员，或勾选「一并归档/删除个人空间数据」");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/user?userId=${deleteTarget.userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferToUserId: transferToUserId || undefined,
          archivePersonalData: archivePersonal,
          reason: "管理员删除用户",
        }),
      });
      if (await handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "删除失败");
      }
      showToast("用户已删除（软删除，数据已脱敏/保留）", "success");
      setDeleteTarget(null);
      setDeletePreview(null);
      setCurrentPage(1);
      loadUsers(currentPage);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === "active" ? "inactive" : "active";

    // 已封禁账号已是最高限制级，禁止再叠加「禁用登录」，避免状态被重复处理
    if (user.status === "banned") {
      showToast("该用户已被封禁，无需再执行禁用登录", "warning");
      return;
    }

    // 如果是停用操作，需要二次确认
    if (newStatus === "inactive") {
      setConfirmMessage(
        `确定要停用用户 "${user.name || user.email}" 吗？停用后该用户将无法登录系统。`,
      );
      // 注意：必须再包一层函数。若直接传 async 闭包，React 会把它当作
      // 函数式更新立即执行（StrictMode 下还会执行两次），导致未确认就停用且弹两次 Toast
      setConfirmAction(() => async () => {
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

  // ===== 新增：单用户全局操作处理函数（与系统其他模块形成闭环）=====

  // 重置密码：打开弹窗，由后端生成临时密码
  const handleResetPassword = (user: User) => {
    setResetPwdUser(user);
    setGeneratedPwd(null);
  };

  const submitResetPassword = async () => {
    if (!resetPwdUser) return;
    try {
      const res = await fetch("/api/admin/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ userId: resetPwdUser.id }),
      });
      if (await handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置密码失败");
      setGeneratedPwd(data.tempPassword);
      showToast("密码已重置", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "重置密码失败", "error");
    }
  };

  // 发送站内通知：打开弹窗填写
  const handleSendNotify = (user: User) => {
    setNotifyUser(user);
    setNotifyForm({ title: "", content: "", type: "system", popupOnLogin: false });
    setNotifyErrors({});
  };

  const submitNotify = async () => {
    if (!notifyUser) return;
    const title = notifyForm.title.trim();
    const content = notifyForm.content.trim();
    const errors: { title?: string; content?: string } = {};
    if (!title) errors.title = "请填写通知标题";
    if (!content) errors.content = "请填写通知正文";
    setNotifyErrors(errors);
    if (errors.title || errors.content) return;
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          targetType: "user",
          userId: notifyUser.id,
          title,
          content,
          type: notifyForm.type,
          popupOnLogin: notifyForm.popupOnLogin,
        }),
      });
      if (await handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送失败");
      showToast(data.message || "通知已发送", "success");
      setNotifyUser(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "发送失败", "error");
    }
  };

  // 调整算力点：打开弹窗填写数量与原因
  const handleAdjustPoints = (user: User) => {
    setAdjustPointsUser(user);
    setAdjustPointsForm({ points: "", reason: "" });
    setAdjustPointsErrors({});
  };

  const submitAdjustPoints = async () => {
    if (!adjustPointsUser) return;
    const raw = adjustPointsForm.points.trim();
    const points = Number(raw);
    if (!raw) {
      setAdjustPointsErrors({ points: "请填写调整数量" });
      return;
    }
    if (!Number.isFinite(points) || points === 0) {
      setAdjustPointsErrors({ points: "调整数量必须为非零数字" });
      return;
    }
    if (!Number.isInteger(points)) {
      setAdjustPointsErrors({ points: "调整数量必须为整数" });
      return;
    }
    setAdjustPointsErrors({});
    try {
      setAdjustPointsSubmitting(true);
      const res = await fetch("/api/admin/user/adjust-points", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          userId: adjustPointsUser.id,
          points,
          reason: adjustPointsForm.reason.trim() || undefined,
        }),
      });
      if (await handleUnauthorized(res)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "调整失败");
      showToast(data.message || "算力点已更新", "success");
      setAdjustPointsUser(null);
      loadUsers(currentPage);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "调整失败", "error");
    } finally {
      setAdjustPointsSubmitting(false);
    }
  };

  // 查看登录历史：打开弹窗拉取登录记录
  const handleViewLoginHistory = async (user: User, page: number = 1) => {
    if (page === 1) {
      setLoginHistoryUser(user);
      setLoginHistories([]);
      setLoginHistoryTotal(0);
      setLoginHistoryFilterDevice("ALL");
      setLoginHistoryFilterBrowser("ALL");
      setLoginHistoryFilterTimeRange("ALL");
      setLoginHistoryKeyword("");
    }
    setLoginHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/admin/login-histories?userId=${user.id}&page=${page}&limit=${LOGIN_HISTORY_PAGE_SIZE}`,
        { headers: { Authorization: `Bearer ${getAuthToken()}` } },
      );
      if (await handleUnauthorized(res)) {
        setLoginHistoryLoading(false);
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        const list = data.data.histories || [];
        setLoginHistories((prev) => (page === 1 ? list : [...prev, ...list]));
        setLoginHistoryTotal(data.data.total || 0);
        setLoginHistoryPage(page);
      } else {
        showToast(data.error || "获取登录历史失败", "error");
      }
    } catch (error) {
      showToast("获取登录历史失败", "error");
    } finally {
      setLoginHistoryLoading(false);
    }
  };

  // 根据多维筛选条件过滤登录历史（严格基于数据库真实数据与真实 UA，绝不虚构）
  const filteredLoginHistories = React.useMemo(() => {
    const now = Date.now();
    return loginHistories.filter((h) => {
      const parsed = parseClientDeviceAndBrowser(h.device, h.userAgent);
      const isMobile = h.deviceType ? h.deviceType === "MOBILE" : parsed.isMobile;
      const bType = h.browserType || parsed.browserType;

      // 1. 设备终端过滤（桌面端 vs 移动端，基于真实数据）
      if (loginHistoryFilterDevice === "DESKTOP" && isMobile) return false;
      if (loginHistoryFilterDevice === "MOBILE" && !isMobile) return false;

      // 2. 浏览器过滤（Chrome, Edge, IE, 360, QQ, Other）
      if (loginHistoryFilterBrowser !== "ALL") {
        if (bType !== loginHistoryFilterBrowser) return false;
      }

      // 3. 时间范围过滤（严格比对真实的 loginAt 时间戳）
      if (loginHistoryFilterTimeRange !== "ALL") {
        const itemTime = new Date(h.loginAt).getTime();
        const diffHours = (now - itemTime) / (1000 * 60 * 60);
        if (loginHistoryFilterTimeRange === "24H" && diffHours > 24) return false;
        if (loginHistoryFilterTimeRange === "7D" && diffHours > 24 * 7) return false;
        if (loginHistoryFilterTimeRange === "30D" && diffHours > 24 * 30) return false;
      }

      // 4. 关键词过滤（匹配真实的 IP、地点、设备名、UA）
      if (loginHistoryKeyword.trim()) {
        const kw = loginHistoryKeyword.trim().toLowerCase();
        const text = `${h.ipAddress || ""} ${h.location || ""} ${h.device || ""} ${parsed.osName} ${parsed.browserName} ${h.userAgent || ""}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }

      return true;
    });
  }, [
    loginHistories,
    loginHistoryFilterDevice,
    loginHistoryFilterBrowser,
    loginHistoryFilterTimeRange,
    loginHistoryKeyword,
  ]);

  // 登录历史分组：相邻同源（IP + 设备 + 归属地）记录合并为一组，避免重复堆叠
  const loginHistoryGroups = React.useMemo(() => {
    const groups: { key: string; items: any[] }[] = [];
    filteredLoginHistories.forEach((h) => {
      const key = `${h.ipAddress}#${h.device}#${h.location}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(h);
      else groups.push({ key, items: [h] });
    });
    return groups;
  }, [filteredLoginHistories]);

  const showToast = (message: string, type: "success" | "error" | "warning") => {
    const container = document.getElementById("zg-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `zg-toast ${type === "success" ? "show" : ""}`;

    // 根据设计系统规范，使用正确的颜色和图标
    const iconColor =
      type === "success" ? "#10b981" : type === "warning" ? "#f59e0b" : "#ef4444";
    const icon = type === "success" ? "✓" : type === "warning" ? "!" : "✕";

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

      {/* 筛选控制面板 (与申诉/工单大厂双行圆角胶囊布局 100% 一致) */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        {/* 第一行：多维业务过滤器 */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
          {/* 角色权限 */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
            <label className="text-xs text-slate-500 font-bold flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Filter className="w-3.5 h-3.5 text-[#3182ce]" />
              角色权限:
            </label>
            <select
              value={filterRole}
              onChange={(e) => {
                setFilterRole(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer transition-all"
            >
              <option value="all">全部角色</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 账号状态 */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
            <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">账号状态:</label>
            <select
              value={filterAccountStatus}
              onChange={(e) => {
                setFilterAccountStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer transition-all"
            >
              <option value="all">全部账号状态</option>
              {ACCOUNT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 登录状态 */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
            <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">登录状态:</label>
            <select
              value={filterLoginStatus}
              onChange={(e) => {
                setFilterLoginStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer transition-all"
            >
              <option value="all">全部登录状态</option>
              {LOGIN_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 等级 */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
            <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">会员等级:</label>
            <select
              value={filterMembershipLevel}
              onChange={(e) => {
                setFilterMembershipLevel(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer transition-all"
            >
              <option value="all">全部等级</option>
              {MEMBERSHIP_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 第二行：关键字搜索与快捷操作 */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2.5 pt-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="搜索用户名、邮箱、手机号..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-500 transition-colors"
                title="清空搜索"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
          >
            搜索
          </button>
          <button
            type="button"
            onClick={() => loadUsers(currentPage)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border border-slate-200/80 active:scale-95 disabled:opacity-50"
            title="点击刷新当前页最新数据"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
            <span>刷新数据</span>
          </button>

          {/* 僵尸用户快捷筛选：点击后列表仅展示被定时扫描标记为 is_zombie 的用户 */}
          <button
            type="button"
            onClick={() => {
              const next = filterZombie === "1" ? "all" : "1";
              setFilterZombie(next);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border active:scale-95 ${
              filterZombie === "1"
                ? "bg-slate-600 text-white border-slate-600 hover:bg-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80"
            }`}
            title="仅展示超 1 年未登录且无有效数据的僵尸用户"
          >
            <UserX className="w-3.5 h-3.5" />
            <span>僵尸用户</span>
          </button>

          {/* 手动触发全量僵尸扫描：仅超级管理员或拥有更新权限的管理员可见 */}
          {(isSuperAdmin || canUpdate) && (
            <button
              type="button"
              onClick={handleZombieScan}
              disabled={scanning}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border border-amber-200/80 active:scale-95 disabled:opacity-50"
              title="立即扫描僵尸用户（每日定时任务亦可触发）"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
              <span>扫描僵尸</span>
            </button>
          )}

          {/* 导出 Excel 表格 */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border border-emerald-200/80 active:scale-95 disabled:opacity-50"
            title="将当前筛选匹配的全量用户导出为 Excel 表格 (.xlsx)"
          >
            <Download className={`w-3.5 h-3.5 text-emerald-600 ${exporting ? "animate-spin" : ""}`} />
            <span>导出 Excel</span>
          </button>
        </div>
      </div>

      {/* 用户列表卡片 (圆润优雅 16px 大圆角与微阴影) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">

        {/* 批量操作工具栏 */}
        {showBatchActions && (selectedUserList.length > 0 || selectAllMatching) && (
          <div className="relative bg-gradient-to-r from-[#3182ce]/10 to-[#8b5cf6]/10 border-b border-white/50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-700">
                {selectAllMatching ? (
                  <>已按当前筛选条件跨页全选匹配用户</>
                ) : (
                  <>
                    已选择{" "}
                    <span className="text-[#3182ce]">{selectedUserList.length}</span>{" "}
                    个用户
                  </>
                )}
              </span>
              {userData && userData.totalPages > 1 && !selectAllMatching && (
                <button
                  onClick={() => {
                    setSelectAllMatching(true);
                    setShowBatchActions(true);
                  }}
                  className="text-sm text-[#3182ce] hover:text-[#2b6cb0] font-medium"
                >
                  跨页全选（当前筛选条件下共 {userData.total} 个）
                </button>
              )}
              {selectAllMatching && (
                <button
                  onClick={() => setSelectAllMatching(false)}
                  className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                >
                  取消跨页全选
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedUsers(new Set());
                  setSelectAllMatching(false);
                  setShowBatchActions(false);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                取消选择
              </button>
            </div>
            <div className="flex items-center gap-2">
              {canBan && batchActionEligible.ban && (
                <button
                  onClick={() => openBatchFlow("ban")}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <UserX className="w-4 h-4" />
                  批量封禁
                </button>
              )}
              {canUnban && batchActionEligible.unban && (
                <button
                  onClick={() => openBatchFlow("unban")}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  批量解封
                </button>
              )}
              {canResetSession && batchActionEligible.kick && (
                <button
                  onClick={() => openBatchFlow("kick")}
                  className="px-4 py-2 bg-[#3182ce] text-white rounded-lg text-sm font-bold hover:bg-[#2b6cb0] transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  批量强制下线
                </button>
              )}
              {isSuperAdmin && batchActionEligible.delete && (
                <button
                  onClick={() => openBatchFlow("delete")}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  批量删除
                </button>
              )}
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
                          checked={(() => {
                            const selectableUsers =
                              userData?.users?.filter(isSelectableUser) || [];
                            return (
                              selectableUsers.length > 0 &&
                              selectableUsers.every((u) => selectedUsers.has(u.id))
                            );
                          })()}
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
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4.5 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">
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
                            selectedUserList.some((u) => u.id === user.id)
                              ? "bg-[#3182ce]/5"
                              : ""
                          }`}
                        >
                          <td className="px-6 py-4 text-center">
                            {isSelectableUser(user) && (
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => toggleSelectUser(user)}
                                className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer"
                              />
                            )}
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt={user.name || "用户头像"}
                                  className="w-9 h-9 shrink-0 rounded-full object-cover shadow-xs border border-slate-200"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                                  {user.name?.charAt(0) ||
                                    user.email?.charAt(0) ||
                                    "U"}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-bold text-slate-800 truncate max-w-[140px]"
                                  title={user.name || "匿名用户"}
                                >
                                  {user.name || "匿名用户"}
                                </div>
                                <div
                                  className="text-[11px] text-slate-400 font-medium truncate max-w-[160px]"
                                  title={user.email || "未设置邮箱"}
                                >
                                  {user.email || "未设置邮箱"}
                                </div>
                                {user.isZombie && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 mt-0.5 rounded bg-slate-200 text-slate-500 text-[10px] font-bold leading-none"
                                    title="超 1 年未登录且从未产生有效数据"
                                  >
                                    僵尸用户
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 whitespace-nowrap">
                            {user.phone ? (
                              <div
                                className="text-xs text-slate-700 font-medium font-mono"
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
                              <span>{user.tokenBalance ?? user.points ?? 100} 算力点</span>
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
                          <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-4.5 py-3.5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                            <div className="flex items-center justify-end gap-2">
                              {/* 详情按钮：严格受控于 user:detail 权限，无权限直接隐藏 */}
                              {canViewDetail && (
                                <button
                                  onClick={() => handleViewDetails(user)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs"
                                  title="查看用户 360° 全景画像与风控记录"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>详情</span>
                                </button>
                              )}

                              {(() => {
                                const isTargetAdmin = user.role === "super_admin" || user.role === "admin";
                                const hasRowAction = !isTargetAdmin && user.id !== currentUserId && (
                                  (canResetSession && user.status === "active" && !!user.hasSession) ||
                                  (canUpdate && (user.status === "active" || user.status === "inactive")) ||
                                  (canBan && user.status !== "banned") ||
                                  (canUnban && user.status === "banned") ||
                                  canChangeRole ||
                                  canSecurityReset ||
                                  hasPermission("announcement:publish") ||
                                  hasPermission("order:update") ||
                                  hasPermission("audit:read") ||
                                  (isSuperAdmin && user.status === "banned")
                                );

                                return (
                                  <>
                                    {/* 更多高危/风控操作菜单：若该管理员没有任何一项可执行的动作，彻底不渲染更多按钮 */}
                                    {hasRowAction && (
                                      <div className="relative inline-block">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (showActionMenu === user.id) {
                                              setShowActionMenu(null);
                                              setActionMenuPos(null);
                                              return;
                                            }
                                            const anchorEl = e.currentTarget as HTMLElement;
                                            const rect = anchorEl.getBoundingClientRect();
                                            const menuWidth = 256; // w-64
                                            const gap = 8; // mt-2
                                            const margin = 16;
                                            let left = rect.right - menuWidth;
                                            if (left < margin) left = margin;
                                            if (left + menuWidth > window.innerWidth - margin) {
                                              left = window.innerWidth - menuWidth - margin;
                                            }
                                            const top = Math.max(rect.bottom + gap, margin);
                                            menuAnchorElRef.current = anchorEl;
                                            menuPositionAdjustedRef.current = null;
                                            setActionMenuPos({ top, left });
                                            setShowActionMenu(user.id);
                                          }}
                                          className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors inline-flex items-center justify-center border border-slate-200 text-slate-600 font-bold text-xs gap-1 cursor-pointer"
                                          title="展开更多风控与安全操作"
                                        >
                                          <MoreVertical className="w-4 h-4 text-slate-600" />
                                        </button>
                                      </div>
                                    )}

                                    {/* 若该管理员既无查看详情权限、又无任何行内操作权限，显示纯粹的只读占位 */}
                                    {!canViewDetail && !hasRowAction && (
                                      <span className="text-xs text-slate-400 font-medium px-2 py-1 select-none">
                                        只读
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
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
                  <div className="text-[10px] text-[#3182ce] font-bold mb-0.5">个人空间算力点</div>
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
                  <div className="space-y-1.5 col-span-2">
                    <div className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5">
                      所属企业 / 团队（工作空间）
                      <span className="font-mono font-normal text-slate-300 text-[10px]">workspace</span>
                    </div>
                    {(viewingUser as any).workspaceMemberships?.length > 0 ? (
                      <>
                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {(viewingUser as any).workspaceMemberships.map((m: any) => (
                          <li
                            key={m.workspaceId}
                            className="flex items-center gap-2 text-xs"
                            title={`workspaceId: ${m.workspaceId} · status: ${m.status}`}
                          >
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                m.type === "ENTERPRISE"
                                  ? "bg-blue-50 text-blue-700 border-blue-100"
                                  : "bg-slate-50 text-slate-600 border-slate-100"
                              }`}
                            >
                              {m.type === "ENTERPRISE" ? "企业" : "个人"}
                            </span>
                            <span className="font-black text-slate-800 truncate flex-1">
                              {m.name}
                            </span>
                            {/* 该工作空间自身的算力点余额 */}
                            <span className="shrink-0 text-[11px] font-black text-slate-500 tabular-nums">
                              {(m.tokenBalance ?? 0).toLocaleString()} 点
                            </span>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                m.role === "OWNER"
                                  ? "bg-amber-50 text-amber-700 border-amber-100"
                                  : "bg-slate-50 text-slate-500 border-slate-100"
                              }`}
                            >
                              {m.role === "OWNER" ? "所有者" : "成员"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {/* 如果实际归属数 > 实际显示数，底部干净提示（避免之前的「...及其他 N 个」吞信息） */}
                      {((viewingUser as any).stats?.workspaceCount || 0) > ((viewingUser as any).workspaceMemberships?.length || 0) && (
                        <div className="text-[11px] text-slate-400 font-bold mt-1.5 pt-1.5 border-t border-slate-100">
                          共 {((viewingUser as any).stats.workspaceCount)} 个工作空间，仅显示最近 {((viewingUser as any).workspaceMemberships.length)} 个
                        </div>
                      )}

                      {/* 算力点归属明细：区分「个人空间 / 企业空间 / 协同分配 / 全局钱包」四类，与工作空间首页 ResourceOverview 口径一致 */}
                      {(viewingUser as any).pointsBreakdown && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <div className="text-[10px] text-slate-400 font-bold mb-1.5">算力点归属明细</div>
                          <div className="grid grid-cols-4 gap-1.5">
                            <div className="text-center p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                              <div className="text-[9px] text-slate-500 font-bold">个人空间</div>
                              <div className="text-[11px] font-black text-slate-700 tabular-nums">
                                {((viewingUser as any).pointsBreakdown.personal ?? 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-center p-1.5 bg-blue-50 rounded-lg border border-blue-100">
                              <div className="text-[9px] text-blue-500 font-bold">企业空间</div>
                              <div className="text-[11px] font-black text-blue-700 tabular-nums">
                                {((viewingUser as any).pointsBreakdown.enterprise ?? 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-center p-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                              <div className="text-[9px] text-emerald-500 font-bold">协同分配</div>
                              <div className="text-[11px] font-black text-emerald-700 tabular-nums">
                                {((viewingUser as any).pointsBreakdown.memberAllocated ?? 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-center p-1.5 bg-purple-50 rounded-lg border border-purple-100">
                              <div className="text-[9px] text-purple-500 font-bold">全局钱包</div>
                              <div className="text-[11px] font-black text-purple-700 tabular-nums">
                                {((viewingUser as any).pointsBreakdown.wallet ?? 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400 font-bold">本人可调度合计</span>
                            <span className="text-[11px] font-black text-slate-800 tabular-nums">
                              {(
                                ((viewingUser as any).pointsBreakdown.personal ?? 0) +
                                ((viewingUser as any).pointsBreakdown.enterprise ?? 0) +
                                ((viewingUser as any).pointsBreakdown.memberAllocated ?? 0) +
                                ((viewingUser as any).pointsBreakdown.wallet ?? 0)
                              ).toLocaleString()} 点
                            </span>
                          </div>
                        </div>
                      )}
                        </>
                    ) : (
                      <div className="text-xs text-slate-400 font-bold">未关联任何企业或工作空间</div>
                    )}
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

      {/* 统一批量操作弹窗：预览确认 → 执行进度 → 结果（含跳过原因） */}
      {batchFlow && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !batchFlow.processing && closeBatchFlow()}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-white/90">
            {(() => {
              const meta = BATCH_ACTION_META[batchFlow.action];
              const danger = meta.danger;
              const iconBg = danger
                ? "bg-red-100 text-red-600"
                : "bg-[#3182ce]/10 text-[#3182ce]";
              const confirmBtn = danger
                ? "from-red-500 to-red-600 hover:shadow-red-500/30"
                : "from-[#3182ce] to-[#2b6cb0] hover:shadow-[#3182ce]/30";

              // 执行中
              if (batchFlow.processing) {
                return (
                  <div className="p-8 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-[#3182ce] rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">
                      正在{batchFlow.action === "delete" ? "删除" : meta.verb}用户，请稍候…
                    </p>
                  </div>
                );
              }

              // 结果展示
              if (batchFlow.result) {
                const r = batchFlow.result;
                return (
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">批量{meta.verb}完成</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                        <div className="text-2xl font-black text-emerald-600">{r.processedCount}</div>
                        <div className="text-xs text-emerald-700 mt-1">成功</div>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                        <div className="text-2xl font-black text-amber-600">{r.skippedCount}</div>
                        <div className="text-xs text-amber-700 mt-1">跳过</div>
                      </div>
                      <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
                        <div className="text-2xl font-black text-red-600">{r.failedCount}</div>
                        <div className="text-xs text-red-700 mt-1">失败</div>
                      </div>
                    </div>
                    {r.skipped.length > 0 && (
                      <div className="mb-4">
                        <button
                          onClick={() => setShowSkippedDetails((v) => !v)}
                          className="text-sm font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-1"
                        >
                          {showSkippedDetails ? "收起" : "展开"}跳过原因（{r.skipped.length}）
                          <span className={`transition-transform ${showSkippedDetails ? "rotate-180" : ""}`}>▾</span>
                        </button>
                        {showSkippedDetails && (
                          <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 text-sm">
                            {r.skipped.map((s) => (
                              <li key={s.id} className="px-3 py-2 flex items-start gap-2">
                                <span className="font-medium text-slate-700 truncate max-w-[120px]">{s.name}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 flex-1">{s.reason}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <button
                      onClick={closeBatchFlow}
                      className="w-full px-4 py-2.5 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-xl hover:shadow-md transition-all font-semibold text-sm"
                    >
                      完成
                    </button>
                  </div>
                );
              }

              // 预览确认
              const p = batchFlow.preview;
              return (
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>
                      {danger ? <AlertTriangle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {meta.label}
                      {meta.irreversible ? "（高危）" : ""}
                    </h3>
                  </div>
                  <p className="text-slate-600 mb-3">
                    已选中 <span className="font-bold text-slate-800">{p?.selectedCount ?? 0}</span> 个用户，
                    其中 <span className="font-bold text-amber-600">{p?.skippedCount ?? 0}</span> 个将被跳过，是否继续？
                  </p>
                  {meta.irreversible && (
                    <p className="text-red-600 text-sm font-medium mb-3 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      批量删除采用安全软删除：账号不可登录、隐私信息脱敏，企业协作数据保留；企业空间唯一所有者与个人空间所有者将自动跳过（个人空间所有者需在单个删除中移交或归档）。
                    </p>
                  )}
                  {p && p.skipped.length > 0 && (
                    <div className="mb-4">
                      <button
                        onClick={() => setShowSkippedDetails((v) => !v)}
                        className="text-sm font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-1"
                      >
                        {showSkippedDetails ? "收起" : "查看"}将被跳过的用户（{p.skipped.length}）
                        <span className={`transition-transform ${showSkippedDetails ? "rotate-180" : ""}`}>▾</span>
                      </button>
                      {showSkippedDetails && (
                        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 text-sm">
                          {p.skipped.map((s) => (
                            <li key={s.id} className="px-3 py-2 flex items-start gap-2">
                              <span className="font-medium text-slate-700 truncate max-w-[120px]">{s.name}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500 flex-1">{s.reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeBatchFlow}
                      className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-sm"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={confirmBatchFlow}
                      disabled={(p?.selectedCount ?? 0) === 0}
                      className={`flex-1 px-4 py-2.5 bg-gradient-to-r ${confirmBtn} text-white rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
                    >
                      确认{batchFlow.action === "delete" ? "删除" : meta.verb}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 封禁用户弹窗 (全风控闭环与大厂级告警设计) */}
      {banningUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setBanningUser(null)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200 font-sans z-10 flex flex-col max-h-[calc(100vh-2rem)]">
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

            <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
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

      {/* 重置密码弹窗 */}
      {resetPwdUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setResetPwdUser(null);
              setGeneratedPwd(null);
            }}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <div className="w-1.5 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                重置登录密码
              </h3>
              <button
                onClick={() => {
                  setResetPwdUser(null);
                  setGeneratedPwd(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                将为用户{" "}
                <span className="font-bold text-slate-800">
                  {resetPwdUser.name || resetPwdUser.email}
                </span>{" "}
                生成一个新的临时登录密码，请通过安全渠道告知用户并提醒其尽快修改。
              </p>
              {generatedPwd ? (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1">
                    临时密码（请妥善保管）
                  </div>
                  <div className="font-mono text-lg font-black text-[#3182ce] break-all">
                    {generatedPwd}
                  </div>
                  <button
                    onClick={() => navigator.clipboard?.writeText(generatedPwd)}
                    className="mt-2 text-xs text-[#3182ce] hover:underline"
                  >
                    复制临时密码
                  </button>
                </div>
              ) : (
                <button
                  onClick={submitResetPassword}
                  className="w-full py-2.5 bg-tech-blue hover:bg-tech-blueDark text-white rounded-xl text-sm font-bold transition-colors"
                >
                  生成临时密码
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 发送站内通知弹窗 */}
      {notifyUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setNotifyUser(null)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <div className="w-1.5 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                发送站内通知
              </h3>
              <button
                onClick={() => setNotifyUser(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600">
                接收用户：
                <span className="font-bold text-slate-800">
                  {notifyUser.name || notifyUser.email}
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    通知标题 <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-bold tabular-nums ${
                      notifyForm.title.length >= 30 ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {notifyForm.title.length} / 30
                  </span>
                </div>
                <input
                  value={notifyForm.title}
                  maxLength={30}
                  onChange={(e) => {
                    setNotifyForm({ ...notifyForm, title: e.target.value });
                    if (notifyErrors.title) setNotifyErrors({ ...notifyErrors, title: undefined });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
                    notifyErrors.title
                      ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      : "border-slate-200 focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20"
                  }`}
                  placeholder="请输入通知标题"
                />
                {notifyErrors.title && (
                  <p className="mt-1 text-[11px] text-red-500 font-bold">{notifyErrors.title}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    通知正文 <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-bold tabular-nums ${
                      notifyForm.content.length >= 500 ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {notifyForm.content.length} / 500
                  </span>
                </div>
                <textarea
                  value={notifyForm.content}
                  maxLength={500}
                  onChange={(e) => {
                    setNotifyForm({ ...notifyForm, content: e.target.value });
                    if (notifyErrors.content) setNotifyErrors({ ...notifyErrors, content: undefined });
                  }}
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none transition-colors ${
                    notifyErrors.content
                      ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      : "border-slate-200 focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20"
                  }`}
                  placeholder="请输入通知正文内容"
                />
                {notifyErrors.content && (
                  <p className="mt-1 text-[11px] text-red-500 font-bold">{notifyErrors.content}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  通知类型
                </label>
                <select
                  value={notifyForm.type}
                  onChange={(e) => setNotifyForm({ ...notifyForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20 transition-colors cursor-pointer"
                >
                  <option value="system">🔔 系统通知</option>
                  <option value="update">🚀 功能更新</option>
                  <option value="alert">⚠️ 安全告警</option>
                  <option value="activity">🎁 平台活动</option>
                </select>
              </div>
              <label className="flex items-center gap-2.5 p-3 bg-amber-50/60 border border-amber-100 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors">
                <input
                  type="checkbox"
                  checked={notifyForm.popupOnLogin}
                  onChange={(e) =>
                    setNotifyForm({ ...notifyForm, popupOnLogin: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#3182ce] cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-extrabold text-slate-800">登录时强提醒弹窗</span>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    开启后用户登录成功将优先弹窗展示，确认后才归入消息列表
                  </span>
                </div>
              </label>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setNotifyUser(null)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={submitNotify}
                  className="px-5 py-2 bg-tech-blue hover:bg-tech-blueDark text-white rounded-xl text-sm font-bold transition-colors"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 调整算力点弹窗 (知阁设计系统顶级规范组件) */}
      {adjustPointsUser && (() => {
        const delta = Number(adjustPointsForm.points);
        const hasValidDelta = adjustPointsForm.points.trim() !== "" && Number.isFinite(delta) && delta !== 0;
        const currentPoints = adjustPointsUser.points ?? 0;
        const afterPoints = currentPoints + (hasValidDelta ? delta : 0);
        const isNegativeAfter = hasValidDelta && afterPoints < 0;

        // 常用快捷数额预设
        const quickAddOptions = [50, 100, 200, 500, 1000];
        const quickSubOptions = [-50, -100, -200, -500];

        // 常用原因标签预设
        const quickReasons = ["活动奖励", "系统补偿", "新人赠送", "企业采购充值", "违规核减", "售后调账"];

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
            {/* 遮罩背景 */}
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
              onClick={() => !adjustPointsSubmitting && setAdjustPointsUser(null)}
            />

            {/* 弹窗主体容器 */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto overflow-hidden border border-blue-100 animate-in zoom-in-95 duration-200 text-left flex flex-col">
              
              {/* Header 顶部标题栏 */}
              <div className="px-6 py-4.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                    <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <span>调整算力点</span>
                      <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/80">
                        人工调账
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      用于用户算力补充、活动奖励核发或异常核减
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !adjustPointsSubmitting && setAdjustPointsUser(null)}
                  disabled={adjustPointsSubmitting}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body 表单内容区 */}
              <div className="p-5 sm:p-6 space-y-3.5 overflow-y-auto max-h-[calc(88vh-120px)]">

                {/* 用户信息与当前算力点微名片 */}
                <div className="p-3.5 bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3182ce] to-[#1a365d] text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {(adjustPointsUser.name || adjustPointsUser.email || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 text-sm truncate" title={adjustPointsUser.name || "用户"}>
                          {adjustPointsUser.name || "极客用户"}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                          {adjustPointsUser.role === "super_admin" ? "超管" : adjustPointsUser.role === "admin" ? "管理员" : "普通用户"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate mt-0.5">
                        {adjustPointsUser.email || `ID: ${adjustPointsUser.id}`}
                      </div>
                    </div>
                  </div>

                  {/* 当前算力点 */}
                  <div className="text-right shrink-0 bg-white px-3.5 py-1.5 rounded-lg border border-slate-200/70 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">当前算力余额</div>
                    <div className="text-base font-black text-[#3182ce] font-mono flex items-center justify-end gap-1">
                      <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{currentPoints}</span>
                      <span className="text-xs text-slate-400 font-normal">点</span>
                    </div>
                  </div>
                </div>

                {/* 调整数量输入区 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <span>调整数量</span>
                      <span className="text-red-500">*</span>
                      <span className="text-[10px] font-normal text-slate-400">（支持直接输入正负整数，或点击下方快捷选项）</span>
                    </label>
                  </div>

                  {/* 快捷数值选项栏 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1">快捷预设:</span>
                    {quickAddOptions.map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setAdjustPointsForm({ ...adjustPointsForm, points: String(num) });
                          if (adjustPointsErrors.points) setAdjustPointsErrors({});
                        }}
                        className={`h-6 px-2 rounded-[4px] text-xs font-mono font-bold transition-all cursor-pointer border ${
                          adjustPointsForm.points === String(num)
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        +{num}
                      </button>
                    ))}
                    {quickSubOptions.map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setAdjustPointsForm({ ...adjustPointsForm, points: String(num) });
                          if (adjustPointsErrors.points) setAdjustPointsErrors({});
                        }}
                        className={`h-6 px-2 rounded-[4px] text-xs font-mono font-bold transition-all cursor-pointer border ${
                          adjustPointsForm.points === String(num)
                            ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  {/* 数值复合输入框 (消除原生上下箭头与文字标签重叠) */}
                  <div className={`flex items-center w-full h-11 border rounded-xl bg-white transition-all overflow-hidden ${
                    adjustPointsErrors.points
                      ? "border-red-300 ring-2 ring-red-100"
                      : "border-slate-200 focus-within:border-[#3182ce] focus-within:ring-2 focus-within:ring-[#3182ce]/20"
                  }`}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={adjustPointsForm.points}
                      onChange={(e) => {
                        // 仅允许负号与整数数字
                        const val = e.target.value.replace(/[^0-9-]/g, "");
                        const sanitized = val.startsWith("-") 
                          ? "-" + val.slice(1).replace(/-/g, "") 
                          : val.replace(/-/g, "");
                        setAdjustPointsForm({ ...adjustPointsForm, points: sanitized });
                        if (adjustPointsErrors.points) setAdjustPointsErrors({});
                      }}
                      className="flex-1 h-full px-3.5 border-none outline-none text-sm font-mono font-bold bg-transparent text-slate-800 placeholder:text-slate-300"
                      placeholder="输入增减数量，如 100 或 -50"
                    />
                    {/* 右侧独立挂件区：左右物理分隔，绝无重叠 */}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border-l border-slate-100 h-full shrink-0 select-none">
                      {hasValidDelta && (
                        <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-black uppercase shrink-0 ${
                          delta > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {delta > 0 ? "赠送 (+)" : "扣除 (-)"}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-bold shrink-0">点算力</span>
                    </div>
                  </div>

                  {adjustPointsErrors.points && (
                    <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{adjustPointsErrors.points}</span>
                    </p>
                  )}
                </div>

                {/* 实时演算与变动对照预览卡片 */}
                {hasValidDelta && (
                  <div className={`p-3.5 rounded-xl border transition-all ${
                    isNegativeAfter
                      ? "bg-red-50/60 border-red-200"
                      : "bg-blue-50/40 border-blue-100"
                  }`}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      算力点调整演算明细
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                        <div className="text-[10px] text-slate-400 font-medium">当前可用</div>
                        <div className="text-sm font-black text-slate-700 font-mono mt-0.5">
                          {currentPoints}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                        <div className="text-[10px] text-slate-400 font-medium">本次增减</div>
                        <div className={`text-sm font-black font-mono mt-0.5 ${
                          delta > 0 ? "text-emerald-600" : "text-amber-600"
                        }`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </div>
                      </div>
                      <div className={`p-2 rounded-lg border ${
                        isNegativeAfter
                          ? "bg-red-50 border-red-200"
                          : "bg-blue-50/70 border-blue-200"
                      }`}>
                        <div className="text-[10px] text-slate-500 font-bold">调整后预计</div>
                        <div className={`text-sm font-black font-mono mt-0.5 ${
                          isNegativeAfter ? "text-red-600" : "text-[#3182ce]"
                        }`}>
                          {afterPoints}
                        </div>
                      </div>
                    </div>

                    {isNegativeAfter && (
                      <div className="mt-2 text-xs font-bold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>警告：扣减后该用户算力余额将变为负数 ({afterPoints} 点)</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 调整原因输入区 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                    <span>调整原因与备注说明</span>
                    <span className="text-[10px] text-slate-400 font-normal">（选填，将记录在算力收支明细中）</span>
                  </label>

                  {/* 快捷原因标签胶囊 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {quickReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setAdjustPointsForm({ ...adjustPointsForm, reason })}
                        className={`px-2 py-0.5 rounded-[4px] text-[11px] font-bold transition-all cursor-pointer border ${
                          adjustPointsForm.reason === reason
                            ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={adjustPointsForm.reason}
                    onChange={(e) =>
                      setAdjustPointsForm({ ...adjustPointsForm, reason: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 bg-white"
                    placeholder="可输入自定义调整原因（如：平台活动奖励核发）"
                  />
                </div>

              </div>

              {/* Footer 底部操作按钮栏 */}
              <div className="px-6 py-3.5 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-slate-400 font-medium">
                  操作即时生效并写入流水台账
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => !adjustPointsSubmitting && setAdjustPointsUser(null)}
                    disabled={adjustPointsSubmitting}
                    className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submitAdjustPoints}
                    disabled={adjustPointsSubmitting}
                    className="h-9 px-5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                  >
                    {adjustPointsSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>正在提交...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>确认调整</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 查看登录历史弹窗 (知阁设计系统顶级规范组件) */}
      {loginHistoryUser && (() => {
        const isFiltering =
          loginHistoryFilterDevice !== "ALL" ||
          loginHistoryFilterBrowser !== "ALL" ||
          loginHistoryFilterTimeRange !== "ALL" ||
          loginHistoryKeyword.trim() !== "";

        const resetFilters = () => {
          setLoginHistoryFilterDevice("ALL");
          setLoginHistoryFilterBrowser("ALL");
          setLoginHistoryFilterTimeRange("ALL");
          setLoginHistoryKeyword("");
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
            {/* 背景遮罩 */}
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
              onClick={() => setLoginHistoryUser(null)}
            />

            {/* 弹窗主体：扩大高度与宽度，将 80% 以上垂直空间释放给时间轴数据展示 */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-auto overflow-hidden border border-blue-100 h-[84vh] max-h-[800px] flex flex-col animate-in zoom-in-95 duration-200 text-left">
              
              {/* Header 顶部标题栏：极简单行整合，高度仅 48px */}
              <div className="px-5 py-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0">
                    <History className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 className="text-sm font-black text-slate-800 tracking-tight shrink-0">
                      登录历史
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/80 truncate max-w-[200px]" title={loginHistoryUser.name || loginHistoryUser.email || loginHistoryUser.id}>
                      <span className="truncate">{loginHistoryUser.name || loginHistoryUser.email || loginHistoryUser.id}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                      <Shield className="w-2.5 h-2.5 text-emerald-600" />
                      <span>审计凭证 · 存留3年</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold text-slate-400">
                    总计 <strong className="text-[#3182ce] font-mono">{loginHistoryTotal}</strong> 次
                  </span>
                  <button
                    type="button"
                    onClick={() => setLoginHistoryUser(null)}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                    title="关闭"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 极致紧凑多维筛选工具栏（高度缩至最低，释放大面积给列表） */}
              <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-200/70 space-y-2 shrink-0">
                {/* 选项组微型条：终端、时间跨度、浏览器平铺排布 */}
                <div className="flex items-center justify-between gap-x-4 gap-y-1.5 flex-wrap text-xs">
                  {/* 终端分类 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-bold text-slate-400">终端:</span>
                    <div className="inline-flex rounded-md bg-slate-200/60 p-0.5 gap-0.5">
                      <button
                        type="button"
                        onClick={() => setLoginHistoryFilterDevice("ALL")}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          loginHistoryFilterDevice === "ALL"
                            ? "bg-white text-[#2b6cb0] shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginHistoryFilterDevice("DESKTOP")}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          loginHistoryFilterDevice === "DESKTOP"
                            ? "bg-white text-[#2b6cb0] shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Monitor className="w-3 h-3" />
                        <span>桌面端</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginHistoryFilterDevice("MOBILE")}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          loginHistoryFilterDevice === "MOBILE"
                            ? "bg-white text-[#2b6cb0] shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>移动端</span>
                      </button>
                    </div>
                  </div>

                  {/* 时间跨度 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-bold text-slate-400">时间:</span>
                    <div className="inline-flex rounded-md bg-slate-200/60 p-0.5 gap-0.5">
                      {(
                        [
                          { key: "ALL", label: "全部" },
                          { key: "24H", label: "24小时" },
                          { key: "7D", label: "近7天" },
                          { key: "30D", label: "近30天" },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setLoginHistoryFilterTimeRange(t.key)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                            loginHistoryFilterTimeRange === t.key
                              ? "bg-white text-[#2b6cb0] shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 浏览器筛选：严格遵循用户指定的 Chrome、Edge、IE、360、QQ、其他 */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400">浏览器:</span>
                    <div className="inline-flex rounded-md bg-slate-200/60 p-0.5 gap-0.5 flex-wrap">
                      {[
                        { key: "ALL", label: "全部" },
                        { key: "Chrome", label: "Chrome" },
                        { key: "Edge", label: "Edge" },
                        { key: "IE", label: "IE 浏览器" },
                        { key: "360", label: "360 浏览器" },
                        { key: "QQ", label: "QQ 浏览器" },
                        { key: "Other", label: "其他" },
                      ].map((b) => (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => setLoginHistoryFilterBrowser(b.key)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                            loginHistoryFilterBrowser === b.key
                              ? "bg-white text-[#2b6cb0] shadow-2xs font-black"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 搜索输入与筛选状态指示条 */}
                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <div className="relative w-72">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={loginHistoryKeyword}
                      onChange={(e) => setLoginHistoryKeyword(e.target.value)}
                      placeholder="搜索登录 IP、归属地点或设备型号..."
                      className="w-full h-7 pl-7 pr-6 text-xs bg-white border border-slate-200/90 rounded-md outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all font-mono"
                    />
                    {loginHistoryKeyword && (
                      <button
                        type="button"
                        onClick={() => setLoginHistoryKeyword("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">
                      匹配 <strong className="text-[#3182ce] font-mono">{filteredLoginHistories.length}</strong> 条（聚合为 {loginHistoryGroups.length} 组）
                    </span>
                    {isFiltering && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>重置筛选</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Body 时间轴内容区 */}
              <div className="p-6 overflow-y-auto flex-1 min-h-[220px]">
                {loginHistoryLoading && loginHistories.length === 0 ? (
                  <div className="text-center text-slate-400 text-xs py-12 flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
                    <span>正在从安全审计日志加载中...</span>
                  </div>
                ) : filteredLoginHistories.length === 0 ? (
                  <div className="text-center text-slate-400 text-xs py-12 space-y-2">
                    <p className="font-bold text-slate-600">
                      {isFiltering ? "未匹配到符合条件的登录历史记录" : "暂无任何登录记录"}
                    </p>
                    {isFiltering && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="px-3 py-1 bg-blue-50 text-[#3182ce] rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        清空筛选条件
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    {loginHistoryGroups.map((group, gi) => {
                      const latest = group.items[0];
                      const parsed = parseClientDeviceAndBrowser(latest.device, latest.userAgent);
                      const isMobile = latest.deviceType ? latest.deviceType === "MOBILE" : parsed.isMobile;
                      const os = latest.osName || parsed.osName;
                      const browser = latest.browserName || parsed.browserName;
                      const absolute = new Date(latest.loginAt).toLocaleString("zh-CN");
                      const earliest = new Date(
                        group.items[group.items.length - 1].loginAt,
                      ).toLocaleString("zh-CN");

                      return (
                        <div key={`${group.key}-${gi}`} className="relative pl-7 pb-4 last:pb-0">
                          {/* 纵向时间轴连接线 */}
                          {gi !== loginHistoryGroups.length - 1 && (
                            <div className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-200"></div>
                          )}

                          {/* 时间轴节点圆点图标 */}
                          <div className="absolute left-0 top-1 w-[19px] h-[19px] rounded-full bg-blue-50 border-2 border-[#3182ce] flex items-center justify-center shadow-2xs">
                            {isMobile ? (
                              <Smartphone className="w-2.5 h-2.5 text-[#3182ce]" />
                            ) : (
                              <Monitor className="w-2.5 h-2.5 text-[#3182ce]" />
                            )}
                          </div>

                          {/* 历史记录卡片 */}
                          <div className="border border-slate-200/80 hover:border-blue-200 rounded-xl p-3.5 bg-white transition-all shadow-2xs hover:shadow-xs space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black text-slate-800 font-mono">
                                    {os}
                                  </span>
                                  {browser && (
                                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200/70 rounded px-1.5 py-0.5">
                                      {browser}
                                    </span>
                                  )}
                                  {group.items.length > 1 && (
                                    <span className="text-[10px] font-black text-[#3182ce] bg-blue-50 border border-blue-200/80 rounded-full px-2 py-0.5">
                                      连续 {group.items.length} 次
                                    </span>
                                  )}
                                </div>

                                <div
                                  className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap"
                                  title={latest.userAgent || "未提供 User-Agent"}
                                >
                                  <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                                    <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{latest.ipAddress}</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{latest.location}</span>
                                  </span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xs font-black text-slate-800">
                                  {formatRelativeTime(latest.loginAt)}
                                </div>
                                <div
                                  className="text-[10px] text-slate-400 font-mono mt-0.5"
                                  title={
                                    group.items.length > 1
                                      ? `${group.items.length} 次同源连续登录，最早 ${earliest}`
                                      : absolute
                                  }
                                >
                                  {absolute}
                                </div>
                              </div>
                            </div>

                            {/* 连续登录时间跨度提示 */}
                            {group.items.length > 1 && (
                              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>时间跨度：{earliest} ~ {absolute}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 加载更多操作栏 */}
                {loginHistories.length < loginHistoryTotal && (
                  <div className="pt-3 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        loginHistoryUser &&
                        handleViewLoginHistory(loginHistoryUser, loginHistoryPage + 1)
                      }
                      disabled={loginHistoryLoading}
                      className="h-9 px-6 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-[#3182ce] rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-2xs active:scale-95"
                    >
                      {loginHistoryLoading ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
                          <span>正在加载更多...</span>
                        </span>
                      ) : (
                        <span>加载更多记录（剩余 {loginHistoryTotal - loginHistories.length} 条）</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Footer 底部栏 */}
              <div className="px-6 py-3 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>登录日志为法律合规凭证，严禁篡改与删除</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLoginHistoryUser(null)}
                  className="h-8 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  关闭
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 操作下拉菜单：通过 React Portal 渲染到 document.body，规避外层 overflow-hidden 卡片与 sticky 单元格的裁切与层级问题 */}
      {showActionMenu && (() => {
        const currentMenuUser = userData?.users?.find((u) => u.id === showActionMenu) || null;
        if (!currentMenuUser || !actionMenuPos) return null;
        return createPortal(
          <div
            ref={actionMenuRef}
            className="fixed w-64 bg-white/98 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200 py-2 z-50"
            style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 强制下线 - 受控于 canResetSession：对存在有效会话的活跃用户显示，不能操作超级管理员和自己 */}
            {canResetSession &&
              currentMenuUser.status === "active" &&
              !!currentMenuUser.hasSession &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleForceLogout(currentMenuUser.id);
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-blue-600" />
                  强制下线
                </button>
              )}

            {/* 禁用登录 - 受控于 canUpdate：对离线的活跃用户显示，不能操作超级管理员和自己 */}
            {canUpdate &&
              currentMenuUser.status === "active" &&
              !currentMenuUser.hasSession &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStatus(currentMenuUser);
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-amber-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <UserX className="w-4 h-4 text-amber-600" />
                  禁用登录
                </button>
              )}

            {/* 解禁登录 - 受控于 canUpdate：已停用用户恢复登录，不能操作超级管理员和自己 */}
            {canUpdate &&
              currentMenuUser.status === "inactive" &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStatus(currentMenuUser);
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  解禁登录
                </button>
              )}

            {/* 封禁用户 - 受控于 canBan：对非封禁用户显示，不能操作超级管理员和自己 */}
            {canBan &&
              currentMenuUser.status !== "banned" &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={() => {
                    setBanningUser(currentMenuUser);
                    setBanDuration("permanent"); // 默认永久
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <UserX className="w-4 h-4 text-red-600" />
                  <span>封禁用户</span>
                </button>
              )}

            {/* 解封用户 - 受控于 canUnban：对已封禁用户显示，不能操作超级管理员和自己 */}
            {canUnban &&
              currentMenuUser.status === "banned" &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={() => {
                    handleChangeStatus(currentMenuUser.id, "active");
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>解封用户</span>
                </button>
              )}

            {/* 修改角色身份 - 受控于 canChangeRole：不能操作超级管理员和自己 */}
            {canChangeRole &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <button
                  onClick={() => {
                    handleEdit(currentMenuUser);
                    setShowActionMenu(null);
                    setActionMenuPos(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-[#3182ce]" />
                  <span>修改角色身份</span>
                </button>
              )}

            {/* 单用户高级运营操作分区（重置密码 / 发送通知 / 调整算力 / 查看登录历史） */}
            {currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId &&
              (canSecurityReset ||
                hasPermission("announcement:publish") ||
                hasPermission("order:update") ||
                hasPermission("audit:read") ||
                isSuperAdmin) && (
                <>
                  <div className="my-1 border-t border-slate-100" />

                  {/* 重置密码 - 受控于 canSecurityReset */}
                  {canSecurityReset && (
                    <button
                      onClick={() => {
                        handleResetPassword(currentMenuUser);
                        setShowActionMenu(null);
                        setActionMenuPos(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4 text-[#3182ce]" />
                      重置密码
                    </button>
                  )}

                  {/* 发送通知 - 受控于 announcement:publish 或超管 */}
                  {(hasPermission("announcement:publish") || isSuperAdmin) && (
                    <button
                      onClick={() => {
                        handleSendNotify(currentMenuUser);
                        setShowActionMenu(null);
                        setActionMenuPos(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 cursor-pointer"
                    >
                      <Bell className="w-4 h-4 text-[#3182ce]" />
                      发送通知
                    </button>
                  )}

                  {/* 调整算力点 - 受控于 order:update 或超管 */}
                  {(hasPermission("order:update") || isSuperAdmin) && (
                    <button
                      onClick={() => {
                        handleAdjustPoints(currentMenuUser);
                        setShowActionMenu(null);
                        setActionMenuPos(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 cursor-pointer"
                    >
                      <Zap className="w-4 h-4 text-[#3182ce]" />
                      调整算力点
                    </button>
                  )}

                  {/* 查看登录历史 - 受控于 audit:read 或超管 */}
                  {(hasPermission("audit:read") || isSuperAdmin) && (
                    <button
                      onClick={() => {
                        handleViewLoginHistory(currentMenuUser);
                        setShowActionMenu(null);
                        setActionMenuPos(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <History className="w-4 h-4 text-[#3182ce]" />
                      查看登录历史
                    </button>
                  )}
                </>
              )}

            {/* 删除用户 - 受控于 isSuperAdmin：只对已封禁(banned)用户显示，不能删除超级管理员和自己 */}
            {isSuperAdmin &&
              currentMenuUser.status === "banned" &&
              currentMenuUser.role !== "super_admin" &&
              currentMenuUser.id !== currentUserId && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => {
                      handleDelete(currentMenuUser.id);
                      setShowActionMenu(null);
                      setActionMenuPos(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除用户
                  </button>
                </>
              )}
          </div>,
          document.body,
        );
      })()}

      {/* 安全删除用户弹窗（归属优先：先定归属，再定策略） */}
      {typeof document !== "undefined" &&
        createPortal(
          deleteTarget && deletePreview ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* 头部 */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="text-lg font-bold text-slate-800">删除用户（安全删除）</h3>
                  <button
                    onClick={() => {
                      setDeleteTarget(null);
                      setDeletePreview(null);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  {/* 目标用户 */}
                  <div className="text-sm text-slate-600">
                    目标用户：
                    <span className="font-semibold text-slate-800">
                      {deleteTarget.name || deleteTarget.email || deleteTarget.userId}
                    </span>
                  </div>

                  {/* 平台安全红线拦截（未封禁或企业唯一所有者） */}
                  {(deletePreview.case === "ENTERPRISE_SOLE_OWNER" || (deletePreview.blockers && deletePreview.blockers.length > 0)) && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      <div className="flex items-center gap-2 font-bold mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        操作被拦截（平台安全规则约束）
                      </div>
                      {deletePreview.blockers.map((b: string, i: number) => (
                        <p key={i} className="leading-relaxed">{b}</p>
                      ))}
                    </div>
                  )}

                  {/* 情况 A：个人空间所有者 */}
                  {deletePreview.case === "PERSONAL_OWNER" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <div className="flex items-center gap-2 font-bold mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        该用户是个人工作空间的所有者
                      </div>
                      {deletePreview.warnings.map((w: string, i: number) => (
                        <p key={i} className="leading-relaxed">{w}</p>
                      ))}
                      <div className="mt-3 space-y-3">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="personalStrategy"
                            checked={!!transferToUserId && !archivePersonal}
                            onChange={() => setArchivePersonal(false)}
                            className="mt-1"
                          />
                          <span>
                            移交所有权给其他成员：
                            <select
                              value={transferToUserId}
                              onChange={(e) => {
                                setTransferToUserId(e.target.value);
                                if (e.target.value) setArchivePersonal(false);
                              }}
                              className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="">选择接收成员…</option>
                              {transferCandidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name || c.email || c.id}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="personalStrategy"
                            checked={archivePersonal}
                            onChange={() => {
                              setArchivePersonal(true);
                              setTransferToUserId("");
                            }}
                            className="mt-1"
                          />
                          <span>一并归档 / 删除该用户的个人空间数据</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* 情况 B：企业空间普通成员 */}
                  {deletePreview.case === "ENTERPRISE_MEMBER" && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                      <div className="flex items-center gap-2 font-bold mb-1">
                        <AlertCircle className="w-4 h-4" />
                        该用户是企业空间的普通成员
                      </div>
                      {deletePreview.warnings.map((w: string, i: number) => (
                        <p key={i} className="leading-relaxed">{w}</p>
                      ))}
                    </div>
                  )}

                  {/* 情况 REGULAR */}
                  {deletePreview.case === "REGULAR" && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      该用户无个人空间所有权、也非企业空间成员，将执行软删除（账号不可登录，隐私信息脱敏）。
                    </div>
                  )}

                  {/* 数据价值摘要 */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users className="w-4 h-4 text-[#3182ce]" />
                      拥有工作空间：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.ownedWorkspaceCount}</span>
                    </div>
                    <div className="text-slate-600">
                      企业成员空间：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.enterpriseMemberWorkspaceCount}</span>
                    </div>
                    <div className="text-slate-600">
                      个人空间文件：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.fileCount}</span>
                    </div>
                    <div className="text-slate-600">
                      知识库条目：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.docCount}</span>
                    </div>
                    <div className="text-slate-600">
                      累计消耗 Token：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.tokenConsumed}</span>
                    </div>
                    <div className="text-slate-600">
                      空间余额 Token：<span className="font-semibold text-slate-800">{deletePreview.dataSummary.tokenBalance}</span>
                    </div>
                  </div>

                  {/* 软删除说明 */}
                  <p className="text-xs text-slate-400">
                    默认执行逻辑删除（软删除）：保留用户 ID 与操作日志，账号不可登录，邮箱/手机号等隐私信息将被匿名化；企业协作数据保留，作者名显示为「已注销用户」。物理删除（被遗忘权）仅由独立定时任务在冷静期后执行。
                  </p>

                  {deleteError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                      {deleteError}
                    </div>
                  )}
                </div>

                {/* 底部操作 */}
                <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
                  <button
                    onClick={() => {
                      setDeleteTarget(null);
                      setDeletePreview(null);
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDeleteUser}
                    disabled={
                      deleting ||
                      deletePreview.case === "ENTERPRISE_SOLE_OWNER" ||
                      (deletePreview.blockers && deletePreview.blockers.length > 0) ||
                      (deletePreview.requiresTransferOrArchive && !transferToUserId && !archivePersonal)
                    }
                    className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? "删除中…" : "确认删除"}
                  </button>
                </div>
              </div>
            </div>
          ) : null,
          document.body
        )}
    </div>
  );
}
