"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Settings,
  Globe,
  Palette,
  Monitor,
  LayoutGrid,
  List,
  Code,
  Bell,
  Mail,
  FolderGit2,
  Shield,
  Smartphone,
  Check,
  Save,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Volume2,
  Sliders,
  Calendar,
  Building,
  Search,
  X,
  Lock,
  MessageSquare,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

// 默认基础系统偏好配置（默认采用亮色系主题，契合知阁全局亮色规范）
const DEFAULT_SYSTEM_SETTINGS = {
  language: "zh-CN",
  theme: "light",
  displayDensity: "comfortable",
  enableAnimations: true,
  // 默认工作空间与中枢偏好
  defaultWorkspaceId: "auto",
  workspaceView: "grid",
  sidebarDefaultExpanded: true,
  componentSort: "popularity",
  // 代码与数据导出偏好
  codeTheme: "light",
  codeFontSize: "13px",
  tabSize: 2,
  showLineNumbers: true,
  // 日期时间与数据导出偏好
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24h",
  exportFormat: "xlsx",
  // 声音与交互
  soundEffects: true,
  // 隐私安全
  requireDeleteConfirm: true,
};

// 完整中英双语词典（无 Emoji 装饰符、无 AI 黑话，100% 专业工程与业务表达）
const I18N_DICTIONARY: Record<string, Record<string, string>> = {
  "zh-CN": {
    pageTitle: "系统偏好与协同设置",
    pageSubtitle: "统一管理界面显示、默认工作空间、代码与报表导出格式、消息订阅通道及登录会话安全策略。",
    badgeSync: "云端实时同步",
    badgeDirty: "待保存更改",
    btnReload: "重新加载",
    btnReset: "恢复默认",
    btnSaveAll: "保存全部设置",
    btnSaving: "正在保存…",
    overviewLang: "语言与时制",
    overviewTheme: "界面与排版",
    overviewHub: "默认协同空间",
    overviewNotify: "消息订阅通道",
    overviewDevice: "会话与安全策略",
    tabDisplay: "界面与显示",
    tabWorkspace: "工作台与协同",
    tabEditor: "代码与导出",
    tabNotification: "通知与订阅",
    tabSecurity: "登录与安全",
    langTitle: "语言与区域偏好",
    langZh: "简体中文 (zh-CN)",
    langZhDesc: "知阁·舟坊平台标准中文界面与业务文案",
    langEn: "English (International)",
    langEnDesc: "面向国际化协作场景的英文界面",
    themeTitle: "色彩与外观模式",
    themeLight: "明亮浅色（推荐）",
    themeLightDesc: "知阁标准通透白蓝视觉体系，清晰明快",
    themeAuto: "跟随系统外观",
    themeAutoDesc: "根据操作系统日间/夜间设置自动适配",
    themeDark: "高对比深色辅助",
    themeDarkDesc: "适用于低照度环境的深色辅助视图",
    densityTitle: "列表与卡片显示密度",
    densityCompact: "紧凑高密度",
    densityCompactDesc: "收敛表格行高与内边距，单屏承载更多业务数据",
    densityComfortable: "舒适标准（推荐）",
    densityComfortableDesc: "标准信息间距与留白比例，兼顾阅读与操作体验",
    densitySpacious: "宽松大视口",
    densitySpaciousDesc: "加大行距与控件间距，适合大尺寸显示器浏览",
    animTitle: "启用平滑界面过渡动效",
    animDesc: "关闭后将减少弹窗与面板切换动画，提升低配置终端响应速度",
    hubViewTitle: "工作空间管理中枢默认视图",
    hubGrid: "卡片网格视图 (Grid)",
    hubGridDesc: "以 Bento 卡片直观展示各工作空间配额、角色与运行概况",
    hubList: "明细表格视图 (Table)",
    hubListDesc: "以高密度表格对比多个工作空间的成员规模与创建时间",
    defaultWsTitle: "登录后默认激活的工作空间",
    defaultWsDesc: "设定登录平台或进入工作台时优先加载的工作空间（数据源于您真实归属的空间列表）",
    defaultWsAuto: "自动记忆（延续上次退出前访问的工作空间）",
    sidebarTitle: "进入工作台默认展开左侧导航栏",
    sidebarDesc: "关闭后进入工作空间时默认折叠左侧菜单，留出更大操作画布",
    compSortTitle: "组件市场与列表默认排序维度",
    compSortDesc: "控制已购组件与组件中心列表的默认排列顺序",
    compSortPop: "按调用频次与常用热度排序",
    compSortTime: "按最近版本更新时间排序",
    compSortName: "按组件名称首字母排序 (A-Z)",
    dateFormatTitle: "全局日期与时间显示格式",
    dateFormatDesc: "应用于算力流水、任务记录与操作审计日志的时间戳格式",
    timePreviewPrefix: "当前实时格式预览",
    exportFormatTitle: "账单与审计报表默认导出格式",
    exportFormatDesc: "设置导出算力流水、账单明细与审计日志时的默认文件格式",
    codeThemeTitle: "代码块与接口示例配色风格",
    codeGithub: "知阁亮白主题 (Standard Light)",
    codeSoft: "柔和护眼蓝灰 (Soft Blue)",
    codeMonokai: "高对比深蓝灰 (Contrast Slate)",
    fontSizeTitle: "代码与日志字号大小",
    tabSizeTitle: "代码缩进空格宽度",
    lineNumTitle: "在代码块与日志面板左侧显示行号",
    lineNumDesc: "便于核对开放接口请求体、响应 JSON 与任务日志行号",
    previewTitle: "实时代码排版与配色预览",
    previewFoot: "该预览样式将同步应用于开放接口示例、JSON 响应查看器及任务日志面板",
    notifyChannelTitle: "消息与协作动态订阅通道",
    emailChannelTitle: "外部邮件提醒通道 (Email)",
    emailBoundPrefix: "通过已绑定邮箱",
    emailBoundSuffix: "接收账单开票、安全告警与重要审批结果通知",
    emailUnboundTip: "当前账号尚未绑定邮箱，请先前往个人资料完成绑定后开启",
    emailUnboundBtn: "未绑定邮箱（前往个人资料绑定）",
    sysChannelTitle: "站内系统消息通知",
    sysChannelDesc: "顶部导航栏消息提醒、算力余额预警、充值到账与平台公告推送",
    projectChannelTitle: "工作空间与成员协作动态",
    projectChannelDesc: "企业空间成员加入/移除、角色权限变更与空间配额变动提醒",
    mentionChannelTitle: "任务审阅与评价反馈提醒",
    mentionChannelDesc: "组件任务退点审批结果、任务审阅反馈及协作批注状态更新通知",
    freqTitle: "消息汇总与投递频率",
    freqDesc: "控制系统向您推送非紧急通知的汇总节奏",
    freqRealtime: "实时推送 — 事件产生后立即送达，无汇总延迟",
    freqHourly: "每小时汇总 — 按小时合并推送工作空间协作动态",
    freqDaily: "每日汇总 — 每日下午统一汇总当日任务与账单动态",
    freqWeekly: "每周汇总 — 每周末生成本周工作空间运行摘要",
    freqCritical: "仅重要安全与账务事件 — 屏蔽日常动态，仅推送安全与扣费告警",
    freqQuiet: "工作时段推送 — 仅在工作日 09:00–19:00 期间发送通知",
    soundTitle: "关键操作完成声音提示",
    soundDesc: "在保存配置、完成充值或导出报表成功时播放轻柔提示音",
    btnTestSound: "试听提示音",
    soundPlayedTip: "已播放操作确认提示音",
    multiDeviceTitle: "允许多台设备同时在线登录",
    multiDeviceDesc: "开启后支持在电脑、平板等多终端同时在线；关闭后将强制单设备登录，新设备登录时自动下线旧会话。",
    deviceLimitTitle: "最大并发在线设备数量上限",
    deviceLimitDesc: "当开启多设备同时登录时，允许同一个账号同时保持活跃的终端数量上限",
    loginAlertTitle: "异地与新终端登录安全告警",
    loginAlertDesc: "当检测到非常用 IP 或新浏览器终端登录账号时，立即发送站内与邮件安全提醒",
    twoFactorTitle: "敏感高危操作二次验证保护",
    twoFactorDesc: "在执行吊销密钥、解散企业空间或修改核心安全设置时要求二次身份核验",
    confirmDelTitle: "删除与吊销操作强制二次确认",
    confirmDelDesc: "在删除组件记录、吊销 API Key 或移除空间成员时强制弹出确认框，防止误触",
    stickyTip: "检测到尚未保存的系统偏好与安全策略修改",
    btnDiscard: "放弃修改",
    btnSaveNow: "立即保存生效",
    resetModalTitle: "确认恢复系统初始推荐配置",
    resetModalDesc: "即将把您的界面语言、显示密度、默认工作空间视图、代码排版以及登录安全策略恢复为平台推荐默认值。恢复后点击「保存全部设置」即可正式生效。",
    btnCancel: "取消",
    btnConfirmReset: "确认恢复默认",
  },
  en: {
    pageTitle: "System Preferences & Collaboration Settings",
    pageSubtitle: "Manage interface display, default workspace, code & export formats, notification channels, and session security policies.",
    badgeSync: "Cloud Synced",
    badgeDirty: "Unsaved Changes",
    btnReload: "Reload",
    btnReset: "Reset Defaults",
    btnSaveAll: "Save All Settings",
    btnSaving: "Saving…",
    overviewLang: "Language & Time",
    overviewTheme: "Display & Density",
    overviewHub: "Default Workspace",
    overviewNotify: "Alert Channels",
    overviewDevice: "Session & Security",
    tabDisplay: "Display & Region",
    tabWorkspace: "Workspace & Hub",
    tabEditor: "Code & Export",
    tabNotification: "Notifications",
    tabSecurity: "Login & Security",
    langTitle: "Language & Regional Preferences",
    langZh: "Simplified Chinese (简体中文)",
    langZhDesc: "Standard Chinese interface for ZhiGe Dockyard",
    langEn: "English (International)",
    langEnDesc: "English interface for international collaboration",
    themeTitle: "Color & Appearance Mode",
    themeLight: "Bright Light (Recommended)",
    themeLightDesc: "ZhiGe signature bright white and blue visual system",
    themeAuto: "Follow OS Appearance",
    themeAutoDesc: "Automatically adapts to system day/night settings",
    themeDark: "High-Contrast Dark Assist",
    themeDarkDesc: "Auxiliary high-contrast view for low-light environments",
    densityTitle: "Table & Card Display Density",
    densityCompact: "Compact Density",
    densityCompactDesc: "Tighter row heights and padding to display more items per screen",
    densityComfortable: "Comfortable Standard (Recommended)",
    densityComfortableDesc: "Balanced spacing for optimal reading and operation",
    densitySpacious: "Spacious Wide View",
    densitySpaciousDesc: "Generous spacing and typography for large monitors",
    animTitle: "Enable Smooth Interface Transitions",
    animDesc: "Disable to reduce modal and panel animations on lower-spec devices",
    hubViewTitle: "Workspace Hub Default View Mode",
    hubGrid: "Card Grid View (Grid)",
    hubGridDesc: "Displays workspaces as Bento cards with quota, role, and status",
    hubList: "Data Table View (Table)",
    hubListDesc: "High-density table comparing workspace members and creation dates",
    defaultWsTitle: "Default Active Workspace on Login",
    defaultWsDesc: "Select your preferred workspace to activate upon login (loaded from your real workspaces)",
    defaultWsAuto: "Auto-Memory (Resume last visited workspace)",
    sidebarTitle: "Expand Left Navigation Sidebar by Default",
    sidebarDesc: "Disable to collapse the sidebar by default for a wider canvas",
    compSortTitle: "Default Component Sort Order",
    compSortDesc: "Controls default ordering in My Components and Component Marketplace",
    compSortPop: "Sort by Usage Frequency & Popularity",
    compSortTime: "Sort by Recently Updated Version",
    compSortName: "Sort Alphabetically by Name (A-Z)",
    dateFormatTitle: "Global Date & Time Display Format",
    dateFormatDesc: "Applied to points ledgers, task records, and audit logs",
    timePreviewPrefix: "Live Format Preview",
    exportFormatTitle: "Default Report & Ledger Export Format",
    exportFormatDesc: "Default file format when exporting billing ledgers and audit logs",
    codeThemeTitle: "Code & API Example Color Style",
    codeGithub: "ZhiGe Standard Light",
    codeSoft: "Soft Eye-Care Blue",
    codeMonokai: "High-Contrast Slate",
    fontSizeTitle: "Code & Log Font Size",
    tabSizeTitle: "Code Indentation Tab Size",
    lineNumTitle: "Show Line Numbers in Code & Log Panels",
    lineNumDesc: "Helps inspect OpenAPI payloads, JSON responses, and task logs",
    previewTitle: "Live Code Formatting & Style Preview",
    previewFoot: "Applied to OpenAPI code examples, JSON viewers, and task log panels",
    notifyChannelTitle: "Notification & Collaboration Channels",
    emailChannelTitle: "External Email Alerts (Email)",
    emailBoundPrefix: "Receive billing, security, and review alerts via",
    emailBoundSuffix: "for critical account and order updates",
    emailUnboundTip: "No email bound yet. Please bind an email in Profile first",
    emailUnboundBtn: "Email Unbound (Go to Profile)",
    sysChannelTitle: "In-App System Notifications",
    sysChannelDesc: "Top navigation badge, balance warnings, top-up receipts, and announcements",
    projectChannelTitle: "Workspace & Member Activity Updates",
    projectChannelDesc: "Member join/leave events, role permission changes, and quota updates",
    mentionChannelTitle: "Task Review & Refund Approval Alerts",
    mentionChannelDesc: "Points refund approval updates, task review feedback, and annotations",
    freqTitle: "Notification Delivery Frequency",
    freqDesc: "Controls how non-urgent notifications are batched and delivered",
    freqRealtime: "Real-time Instant — Deliver immediately as events occur",
    freqHourly: "Hourly Digest — Batch workspace updates every hour",
    freqDaily: "Daily Summary — Consolidated daily recap in the afternoon",
    freqWeekly: "Weekly Digest — Weekly workspace summary on weekends",
    freqCritical: "Critical Security & Billing Only — Mute routine activity",
    freqQuiet: "Work Hours Only — Deliver between 09:00 and 19:00 on weekdays",
    soundTitle: "Audio Feedback on Key Actions",
    soundDesc: "Play a subtle confirmation tone when saving settings or exporting data",
    btnTestSound: "Test Tone",
    soundPlayedTip: "Confirmation tone played",
    multiDeviceTitle: "Allow Concurrent Multi-Device Login",
    multiDeviceDesc: "Enable simultaneous sessions across PC and mobile; disable to enforce single-device login.",
    deviceLimitTitle: "Maximum Concurrent Active Devices",
    deviceLimitDesc: "Maximum number of simultaneous online terminals allowed when multi-device is enabled",
    loginAlertTitle: "New Device & Unfamiliar IP Login Alerts",
    loginAlertDesc: "Send immediate in-app and email alerts when logging in from a new browser or IP",
    twoFactorTitle: "Two-Step Verification for Sensitive Actions",
    twoFactorDesc: "Require secondary verification before revoking keys or dismissing workspaces",
    confirmDelTitle: "Require Confirmation Before Deletion",
    confirmDelDesc: "Always show a confirmation modal before deleting records or revoking keys",
    stickyTip: "You have unsaved system preferences and security changes",
    btnDiscard: "Discard Changes",
    btnSaveNow: "Save & Apply Now",
    resetModalTitle: "Restore Official Default Preferences",
    resetModalDesc: "This will reset your language, display density, default workspace view, code formatting, and security policies to recommended defaults. Click Save All Settings to persist.",
    btnCancel: "Cancel",
    btnConfirmReset: "Confirm Reset",
  },
};

interface RealWorkspace {
  id: string;
  name: string;
  type?: string;
}

export default function UserSettingsPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"display" | "workspace" | "editor" | "notification" | "security">("display");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // 1. 系统偏好状态（对接 /api/user/settings）
  const [settings, setSettings] = useState(DEFAULT_SYSTEM_SETTINGS);
  const [initialSettings, setInitialSettings] = useState(DEFAULT_SYSTEM_SETTINGS);

  // 2. 真实工作空间列表（对接 /api/workspace/list）
  const [userWorkspaces, setUserWorkspaces] = useState<RealWorkspace[]>([]);

  // 3. 会话与多设备登录状态（对接 /api/user/session-settings）
  const [allowMultiDevice, setAllowMultiDevice] = useState(true);
  const [initialAllowMultiDevice, setInitialAllowMultiDevice] = useState(true);
  const [deviceLimit, setDeviceLimit] = useState(3);
  const [initialDeviceLimit, setInitialDeviceLimit] = useState(3);

  // 4. 真实通知与消息订阅偏好（对接 /api/user/notifications/preferences）
  const [notificationPref, setNotificationPref] = useState<{
    emailNotifications: boolean;
    systemMessages: boolean;
    projectUpdates: boolean;
    commentMentions: boolean;
    frequency: string;
    hasEmail: boolean;
    userEmail: string;
  }>({
    emailNotifications: true,
    systemMessages: true,
    projectUpdates: true,
    commentMentions: true,
    frequency: "REALTIME",
    hasEmail: false,
    userEmail: "",
  });
  const [initialNotificationPref, setInitialNotificationPref] = useState(notificationPref);

  // 5. 账号安全防护开关（对接 /api/user/security-settings）
  const [securityPref, setSecurityPref] = useState<{
    twoFactorEnabled: boolean;
    loginAlertEnabled: boolean;
  }>({
    twoFactorEnabled: false,
    loginAlertEnabled: true,
  });
  const [initialSecurityPref, setInitialSecurityPref] = useState(securityPref);

  // 加载与保存状态
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 国际化文本解析器
  const t = (key: string): string => {
    const lang = settings.language === "en" ? "en" : "zh-CN";
    return I18N_DICTIONARY[lang]?.[key] || I18N_DICTIONARY["zh-CN"]?.[key] || key;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // 弹窗开启时锁定背景滚动
  useEffect(() => {
    if (!showResetConfirm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showResetConfirm]);

  // 1. 读取基础配置
  const loadSettings = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/settings", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        if (result.data) {
          const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...result.data };
          setSettings(merged);
          setInitialSettings(merged);
          if (result.updatedAt) {
            setLastSyncedAt(result.updatedAt);
          }
          if (merged.theme === "dark") {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        }
      }
    } catch (error) {
      console.error("加载偏好设置异常:", error);
    }
  }, []);

  // 2. 读取当前用户真实的工作空间列表
  const loadUserWorkspaces = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/list", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.workspaces)) {
          setUserWorkspaces(
            data.workspaces.map((w: any) => ({
              id: w.id,
              name: w.name || "未命名空间",
              type: w.type || "PERSONAL",
            }))
          );
        }
      }
    } catch (error) {
      console.error("加载真实工作空间列表异常:", error);
    }
  }, []);

  // 3. 读取会话与登录策略
  const loadSessionSettings = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/session-settings", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const allow = Boolean(data.data.allowMultiDevice);
          const limit = Number(data.data.deviceLimit) || 3;
          setAllowMultiDevice(allow);
          setInitialAllowMultiDevice(allow);
          setDeviceLimit(limit);
          setInitialDeviceLimit(limit);
        }
      }
    } catch (error) {
      console.error("加载登录设备策略异常:", error);
    }
  }, []);

  // 4. 读取通知与消息推送偏好
  const loadNotificationPref = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/notifications/preferences", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        if (result.data) {
          const prefData = {
            emailNotifications: result.data.emailNotifications ?? true,
            systemMessages: result.data.systemMessages ?? true,
            projectUpdates: result.data.projectUpdates ?? true,
            commentMentions: result.data.commentMentions ?? true,
            frequency: result.data.frequency || "REALTIME",
            hasEmail: Boolean(result.data.user?.hasEmail),
            userEmail: result.data.user?.email || "",
          };
          setNotificationPref(prefData);
          setInitialNotificationPref(prefData);
        }
      }
    } catch (error) {
      console.error("加载通知偏好异常:", error);
    }
  }, []);

  // 5. 读取安全防护开关
  const loadSecuritySettings = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/security-settings", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const sec = {
            twoFactorEnabled: Boolean(result.data.twoFactorEnabled),
            loginAlertEnabled: Boolean(result.data.loginAlertEnabled),
          };
          setSecurityPref(sec);
          setInitialSecurityPref(sec);
        }
      }
    } catch (error) {
      console.error("加载安全设置异常:", error);
    }
  }, []);

  // 全量初始化加载
  const reloadAllSettings = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        await Promise.all([
          loadSettings(),
          loadUserWorkspaces(),
          loadSessionSettings(),
          loadNotificationPref(),
          loadSecuritySettings(),
        ]);
        if (isManual) {
          toast.success(
            settings.language === "en"
              ? "All preferences refreshed from server"
              : "所有系统偏好与安全策略已从云端同步刷新"
          );
        }
      } catch {
        if (isManual) {
          toast.error(settings.language === "en" ? "Failed to refresh" : "刷新配置失败，请检查网络");
        }
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [
      loadSettings,
      loadUserWorkspaces,
      loadSessionSettings,
      loadNotificationPref,
      loadSecuritySettings,
      settings.language,
      toast,
    ]
  );

  useEffect(() => {
    void reloadAllSettings(false);
  }, []);

  // 分模块计算是否有未保存修改，便于在 Tab 上精准显示变更角标
  const tabDirtyMap = useMemo(() => {
    const displayDirty =
      settings.language !== initialSettings.language ||
      settings.theme !== initialSettings.theme ||
      settings.dateFormat !== initialSettings.dateFormat ||
      settings.timeFormat !== initialSettings.timeFormat ||
      settings.displayDensity !== initialSettings.displayDensity ||
      settings.enableAnimations !== initialSettings.enableAnimations;

    const workspaceDirty =
      settings.defaultWorkspaceId !== initialSettings.defaultWorkspaceId ||
      settings.workspaceView !== initialSettings.workspaceView ||
      settings.sidebarDefaultExpanded !== initialSettings.sidebarDefaultExpanded ||
      settings.componentSort !== initialSettings.componentSort;

    const editorDirty =
      settings.codeTheme !== initialSettings.codeTheme ||
      settings.codeFontSize !== initialSettings.codeFontSize ||
      settings.tabSize !== initialSettings.tabSize ||
      settings.exportFormat !== initialSettings.exportFormat ||
      settings.showLineNumbers !== initialSettings.showLineNumbers;

    const notificationDirty =
      notificationPref.emailNotifications !== initialNotificationPref.emailNotifications ||
      notificationPref.systemMessages !== initialNotificationPref.systemMessages ||
      notificationPref.projectUpdates !== initialNotificationPref.projectUpdates ||
      notificationPref.commentMentions !== initialNotificationPref.commentMentions ||
      notificationPref.frequency !== initialNotificationPref.frequency ||
      settings.soundEffects !== initialSettings.soundEffects;

    const securityDirty =
      allowMultiDevice !== initialAllowMultiDevice ||
      deviceLimit !== initialDeviceLimit ||
      securityPref.loginAlertEnabled !== initialSecurityPref.loginAlertEnabled ||
      securityPref.twoFactorEnabled !== initialSecurityPref.twoFactorEnabled ||
      settings.requireDeleteConfirm !== initialSettings.requireDeleteConfirm;

    return {
      display: displayDirty,
      workspace: workspaceDirty,
      editor: editorDirty,
      notification: notificationDirty,
      security: securityDirty,
    };
  }, [
    settings,
    initialSettings,
    notificationPref,
    initialNotificationPref,
    allowMultiDevice,
    initialAllowMultiDevice,
    deviceLimit,
    initialDeviceLimit,
    securityPref,
    initialSecurityPref,
  ]);

  const isDirty = Object.values(tabDirtyMap).some(Boolean);
  const dirtyTabCount = Object.values(tabDirtyMap).filter(Boolean).length;

  // 全局设置项索引（支持顶部关键词快速检索定位）
  const searchableItems = useMemo(
    () => [
      { id: "lang", tab: "display" as const, title: t("langTitle"), desc: `${t("langZh")} / ${t("langEn")}` },
      { id: "theme", tab: "display" as const, title: t("themeTitle"), desc: `${t("themeLight")} / ${t("themeAuto")}` },
      { id: "date", tab: "display" as const, title: t("dateFormatTitle"), desc: t("dateFormatDesc") },
      { id: "density", tab: "display" as const, title: t("densityTitle"), desc: `${t("densityCompact")} / ${t("densityComfortable")}` },
      { id: "anim", tab: "display" as const, title: t("animTitle"), desc: t("animDesc") },
      { id: "defWs", tab: "workspace" as const, title: t("defaultWsTitle"), desc: t("defaultWsDesc") },
      { id: "hubView", tab: "workspace" as const, title: t("hubViewTitle"), desc: `${t("hubGrid")} / ${t("hubList")}` },
      { id: "sidebar", tab: "workspace" as const, title: t("sidebarTitle"), desc: t("sidebarDesc") },
      { id: "compSort", tab: "workspace" as const, title: t("compSortTitle"), desc: t("compSortDesc") },
      { id: "codeTheme", tab: "editor" as const, title: t("codeThemeTitle"), desc: `${t("codeGithub")} / ${t("codeSoft")}` },
      { id: "fontSize", tab: "editor" as const, title: `${t("fontSizeTitle")} & ${t("tabSizeTitle")}`, desc: "12px / 13px / 14px · Tab 2 / 4" },
      { id: "export", tab: "editor" as const, title: t("exportFormatTitle"), desc: t("exportFormatDesc") },
      { id: "lineNum", tab: "editor" as const, title: t("lineNumTitle"), desc: t("lineNumDesc") },
      { id: "email", tab: "notification" as const, title: t("emailChannelTitle"), desc: t("emailBoundSuffix") },
      { id: "sysMsg", tab: "notification" as const, title: t("sysChannelTitle"), desc: t("sysChannelDesc") },
      { id: "projMsg", tab: "notification" as const, title: t("projectChannelTitle"), desc: t("projectChannelDesc") },
      { id: "mention", tab: "notification" as const, title: t("mentionChannelTitle"), desc: t("mentionChannelDesc") },
      { id: "freq", tab: "notification" as const, title: t("freqTitle"), desc: t("freqDesc") },
      { id: "sound", tab: "notification" as const, title: t("soundTitle"), desc: t("soundDesc") },
      { id: "multiDev", tab: "security" as const, title: t("multiDeviceTitle"), desc: t("multiDeviceDesc") },
      { id: "devLimit", tab: "security" as const, title: t("deviceLimitTitle"), desc: t("deviceLimitDesc") },
      { id: "loginAlert", tab: "security" as const, title: t("loginAlertTitle"), desc: t("loginAlertDesc") },
      { id: "twoFactor", tab: "security" as const, title: t("twoFactorTitle"), desc: t("twoFactorDesc") },
      { id: "confirmDel", tab: "security" as const, title: t("confirmDelTitle"), desc: t("confirmDelDesc") },
    ],
    [settings.language]
  );

  const matchedSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchableItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    );
  }, [searchQuery, searchableItems]);

  // 播放 Web Audio API 真实提示音
  const playSampleSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      toast.info(t("soundPlayedTip"));
    } catch (e) {
      console.warn("Play sound error:", e);
    }
  };

  // 保存全部配置（4 大真实 API 并发持久化）
  const saveAllSettings = async () => {
    setSaving(true);
    try {
      const authToken = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      const [resSettings, resSession, resNotification, resSecurity] = await Promise.all([
        fetch("/api/user/settings", {
          method: "PUT",
          headers,
          body: JSON.stringify(settings),
        }),
        fetch("/api/user/session-settings", {
          method: "PUT",
          headers,
          body: JSON.stringify({ allowMultiDevice, deviceLimit }),
        }),
        fetch("/api/user/notifications/preferences", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            emailNotifications: notificationPref.emailNotifications,
            systemMessages: notificationPref.systemMessages,
            projectUpdates: notificationPref.projectUpdates,
            commentMentions: notificationPref.commentMentions,
            frequency: notificationPref.frequency,
          }),
        }),
        fetch("/api/user/security-settings", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            twoFactorEnabled: securityPref.twoFactorEnabled,
            loginAlertEnabled: securityPref.loginAlertEnabled,
          }),
        }),
      ]);

      if (resSettings.ok && resSession.ok && resNotification.ok && resSecurity.ok) {
        setInitialSettings(settings);
        setInitialAllowMultiDevice(allowMultiDevice);
        setInitialDeviceLimit(deviceLimit);
        setInitialNotificationPref(notificationPref);
        setInitialSecurityPref(securityPref);
        setLastSyncedAt(new Date().toISOString());

        // 「默认激活工作空间」真正生效：指定具体空间时立即同步为当前激活空间，
        // 下次进入工作台/空间即定位到该空间（auto 表示延续上次，无需回写）。
        if (settings.defaultWorkspaceId && settings.defaultWorkspaceId !== "auto") {
          try {
            await fetch("/api/workspace/switch", {
              method: "POST",
              headers,
              body: JSON.stringify({ workspaceId: settings.defaultWorkspaceId }),
            });
          } catch {
            /* 偏好本身已落库；激活同步失败不阻断整体保存成功 */
          }
        }

        try {
          localStorage.setItem("zhige_appearance", JSON.stringify(settings));
          localStorage.setItem("zhige_locale", settings.language);
          document.cookie = `NEXT_LOCALE=${settings.language}; path=/; max-age=31536000`;
          window.dispatchEvent(new CustomEvent("zhige_appearance_updated", { detail: settings }));
        } catch {
          // 忽略存储异常
        }

        if (settings.soundEffects) {
          playSampleSound();
        }

        toast.success(
          settings.language === "en"
            ? "All preferences and security policies saved!"
            : "所有系统偏好、通知订阅与安全策略已成功保存并同步"
        );
      } else {
        toast.error(
          settings.language === "en" ? "Failed to save settings" : "部分配置保存未成功，请稍后重试"
        );
      }
    } catch (error) {
      console.error("保存设置异常:", error);
      toast.error(settings.language === "en" ? "Network error" : "保存失败，通信网络异常");
    } finally {
      setSaving(false);
    }
  };

  // 放弃修改重置回上次保存状态
  const discardChanges = () => {
    setSettings(initialSettings);
    setAllowMultiDevice(initialAllowMultiDevice);
    setDeviceLimit(initialDeviceLimit);
    setNotificationPref(initialNotificationPref);
    setSecurityPref(initialSecurityPref);
    if (initialSettings.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    toast.info(settings.language === "en" ? "Changes discarded" : "已放弃未保存的更改");
  };

  // 恢复出厂默认配置
  const handleResetToDefaults = () => {
    setSettings(DEFAULT_SYSTEM_SETTINGS);
    setAllowMultiDevice(true);
    setDeviceLimit(3);
    setNotificationPref((prev) => ({
      ...prev,
      emailNotifications: prev.hasEmail,
      systemMessages: true,
      projectUpdates: true,
      commentMentions: true,
      frequency: "REALTIME",
    }));
    setSecurityPref({
      twoFactorEnabled: false,
      loginAlertEnabled: true,
    });
    document.documentElement.classList.remove("dark");
    setShowResetConfirm(false);
    toast.success(
      settings.language === "en"
        ? "Restored to official defaults. Click Save All Settings to apply."
        : "已恢复为系统初始推荐设置，请点击「保存全部设置」完成持久化"
    );
  };

  // 快速切换辅助
  const updateSetting = <K extends keyof typeof DEFAULT_SYSTEM_SETTINGS>(
    key: K,
    value: (typeof DEFAULT_SYSTEM_SETTINGS)[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (key === "theme") {
      if (value === "dark") {
        document.documentElement.classList.add("dark");
      } else if (value === "light") {
        document.documentElement.classList.remove("dark");
      } else if (value === "auto") {
        const isSysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (isSysDark) document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      }
    }
  };

  // 动态格式化时间样例预览
  const getFormattedTimePreview = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    let datePart = `${year}-${month}-${day}`;
    if (settings.dateFormat === "YYYY/MM/DD") datePart = `${year}/${month}/${day}`;
    else if (settings.dateFormat === "YYYY年MM月DD日") datePart = `${year}年${month}月${day}日`;

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    let timePart = `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
    if (settings.timeFormat === "12h") {
      const ampm = hours >= 12 ? (settings.language === "en" ? "PM" : "下午") : (settings.language === "en" ? "AM" : "上午");
      hours = hours % 12 || 12;
      timePart = `${ampm} ${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
    }
    return `${datePart} ${timePart}`;
  };

  const defaultWsLabel = useMemo(() => {
    if (settings.defaultWorkspaceId === "auto") {
      return settings.language === "en" ? "Auto-Memory" : "自动记忆空间";
    }
    const found = userWorkspaces.find((w) => w.id === settings.defaultWorkspaceId);
    return found ? found.name : settings.language === "en" ? "Auto-Memory" : "自动记忆空间";
  }, [settings.defaultWorkspaceId, settings.language, userWorkspaces]);

  const activeChannelCount = [
    notificationPref.emailNotifications,
    notificationPref.systemMessages,
    notificationPref.projectUpdates,
    notificationPref.commentMentions,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 pb-24 font-sans text-left">
      {/* 顶部标准页头（对齐全系统个人中心统一头部规范） */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Settings className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              {t("pageTitle")}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/60 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{t("badgeSync")}</span>
            </span>
            {isDirty && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>
                  {t("badgeDirty")} ({dirtyTabCount})
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            {t("pageSubtitle")}
            {lastSyncedAt && (
              <span className="ml-2 text-slate-400">
                · 上次同步：{new Date(lastSyncedAt).toLocaleString("zh-CN", { hour12: false })}
              </span>
            )}
          </p>
        </div>

        {/* 顶部快捷操作栏 */}
        <div className="flex items-center gap-2.5 self-start lg:self-auto ml-10 lg:ml-0">
          <button
            type="button"
            onClick={() => void reloadAllSettings(true)}
            disabled={refreshing || saving}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5 font-bold"
            title="从云端重新同步最新配置"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>{refreshing ? t("btnSaving") : t("btnReload")}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={saving}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5 font-bold"
            title="恢复为平台推荐默认设置"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>{t("btnReset")}</span>
          </button>

          <button
            type="button"
            onClick={() => void saveAllSettings()}
            disabled={saving}
            className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? t("btnSaving") : t("btnSaveAll")}</span>
          </button>
        </div>
      </div>

      {/* 顶部 5 宫格可交互 Bento 状态总览矩阵（点击卡片可直接跳转对应分类） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => setActiveTab("display")}
          className={`zg-card p-4 text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeTab === "display" ? "ring-1 ring-[#3182ce] !border-[#3182ce]" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500">{t("overviewLang")}</span>
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <Globe className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-sm font-black text-slate-800 truncate">
            {settings.language === "zh-CN" ? "简体中文 (zh-CN)" : "English (Intl)"}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-1.5 pt-1.5 border-t border-slate-100 truncate">
            {settings.dateFormat} · {settings.timeFormat === "24h" ? "24小时制" : "12小时制"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("display")}
          className="zg-card p-4 text-left transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500">{t("overviewTheme")}</span>
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <Palette className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-sm font-black text-slate-800 truncate">
            {settings.theme === "light"
              ? "明亮浅色"
              : settings.theme === "dark"
                ? "深色辅助"
                : "跟随系统"}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1.5 pt-1.5 border-t border-slate-100 truncate">
            密度：{settings.displayDensity === "compact" ? "紧凑" : settings.displayDensity === "spacious" ? "宽松" : "舒适标准"} · 动效{settings.enableAnimations ? "开启" : "关闭"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("workspace")}
          className={`zg-card p-4 text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeTab === "workspace" ? "ring-1 ring-[#3182ce] !border-[#3182ce]" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500">{t("overviewHub")}</span>
            <span className="w-6 h-6 rounded-lg bg-emerald-50 text-[#38a169] flex items-center justify-center">
              <Building className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-sm font-black text-slate-800 truncate" title={defaultWsLabel}>
            {defaultWsLabel}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1.5 pt-1.5 border-t border-slate-100 truncate">
            默认视图：{settings.workspaceView === "grid" ? "卡片网格" : "明细表格"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notification")}
          className={`zg-card p-4 text-left transition-all cursor-pointer flex flex-col justify-between ${
            activeTab === "notification" ? "ring-1 ring-[#3182ce] !border-[#3182ce]" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500">{t("overviewNotify")}</span>
            <span className="w-6 h-6 rounded-lg bg-amber-50 text-[#dd6b20] flex items-center justify-center">
              <Bell className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-black text-[#38a169]">{activeChannelCount} / 4 通道开启</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1.5 pt-1.5 border-t border-slate-100 truncate">
            {notificationPref.hasEmail ? `已绑定 ${notificationPref.userEmail}` : "尚未绑定外部邮箱"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`zg-card p-4 text-left transition-all cursor-pointer flex flex-col justify-between sm:col-span-2 lg:col-span-1 ${
            activeTab === "security" ? "ring-1 ring-[#3182ce] !border-[#3182ce]" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500">{t("overviewDevice")}</span>
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-[#2b6cb0] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-sm font-black text-slate-800 truncate">
            {allowMultiDevice ? `多端并发 (上限 ${deviceLimit} 台)` : "单设备独占登录"}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1.5 pt-1.5 border-t border-slate-100 truncate">
            异地告警{securityPref.loginAlertEnabled ? "开启" : "关闭"} · 二次验证{securityPref.twoFactorEnabled ? "开启" : "关闭"}
          </div>
        </button>
      </div>

      {/* 分类 Tab 切换栏 + 全局设置项快速搜索定位器 */}
      <div className="zg-card p-3 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* 5 大核心分类 Tab */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { id: "display", label: t("tabDisplay"), icon: Monitor, dirty: tabDirtyMap.display },
              { id: "workspace", label: t("tabWorkspace"), icon: LayoutGrid, dirty: tabDirtyMap.workspace },
              { id: "editor", label: t("tabEditor"), icon: Code, dirty: tabDirtyMap.editor },
              { id: "notification", label: t("tabNotification"), icon: Bell, dirty: tabDirtyMap.notification },
              { id: "security", label: t("tabSecurity"), icon: Shield, dirty: tabDirtyMap.security },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-[#3182ce] text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.dirty && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isActive ? "bg-amber-300" : "bg-amber-500"
                      }`}
                      title="该分类下有未保存的修改"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 全局设置项检索框 */}
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="快速搜索设置项（如：导出、邮箱、设备、时制）…"
              className="zg-input !h-8 !pl-8 !pr-7 !text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 搜索匹配结果直达条 */}
        {searchQuery.trim() && (
          <div className="pt-2 border-t border-slate-100">
            {matchedSearchItems.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500">
                  匹配到 {matchedSearchItems.length} 项设置（点击直达对应分类）：
                </span>
                {matchedSearchItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.tab);
                      setSearchQuery("");
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200/80 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {item.title} →
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-1">
                未找到包含「{searchQuery}」的偏好设置项，请尝试其他关键词。
              </p>
            )}
          </div>
        )}
      </div>

      {/* 加载骨架态 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 zg-skeleton rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ============ Tab 1: 界面与显示设置 ============ */}
          {activeTab === "display" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* 1.1 语言偏好（真实适配说明与多语言切换） */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">{t("langTitle")}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full font-bold">
                    标准中文全系统 100% 覆盖
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      settings.language === "zh-CN"
                        ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-800">{t("langZh")}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          全系统官方标准
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{t("langZhDesc")}</p>
                    </div>
                    <input
                      type="radio"
                      name="language"
                      value="zh-CN"
                      checked={settings.language === "zh-CN"}
                      onChange={() => updateSetting("language", "zh-CN")}
                      className="w-4 h-4 text-[#3182ce] focus:ring-[#3182ce]"
                    />
                  </label>

                  <label
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      settings.language === "en"
                        ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-800">{t("langEn")}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-[#2b6cb0]">
                          技术预览
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{t("langEnDesc")}</p>
                    </div>
                    <input
                      type="radio"
                      name="language"
                      value="en"
                      checked={settings.language === "en"}
                      onChange={() => updateSetting("language", "en")}
                      className="w-4 h-4 text-[#3182ce] focus:ring-[#3182ce]"
                    />
                  </label>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 flex items-start gap-2.5 text-[11px] text-slate-500 leading-relaxed mt-1">
                  <Info className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-700">语言适配范围说明：</span>
                    知阁·舟坊平台以标准简体中文作为统一研发底座与业务规范。选择 English 时，当前偏好中心、代码示例及部分开放接口将自动呈现英文；全系统跨页面词库适配正按研发规范演进中。
                  </div>
                </div>
              </div>

              {/* 1.2 主题模式（视觉色板锁死与全站适配现状明确） */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">{t("themeTitle")}</h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#3182ce] bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full font-bold">
                    知阁知性蓝体系 · 浅色全量适配
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {[
                    {
                      id: "light",
                      label: t("themeLight"),
                      badge: "全站 100% 适配",
                      badgeClass: "bg-emerald-100 text-emerald-700",
                      desc: "知阁官方标准通透白蓝视觉体系（#f0f8ff / #3182ce），全站各页面全面锁死与适配。",
                    },
                    {
                      id: "auto",
                      label: t("themeAuto"),
                      badge: "跟随系统",
                      badgeClass: "bg-blue-100 text-[#2b6cb0]",
                      desc: "根据操作系统外观自适应调整亮度参数，全站主框架保持极佳的高清与明快对比度。",
                    },
                    {
                      id: "dark",
                      label: t("themeDark"),
                      badge: "代码/编辑器辅助",
                      badgeClass: "bg-slate-200 text-slate-700",
                      desc: "适用于代码查看器、控制台输出等特定面板的高对比辅助，主框架遵循明快规范防漂移。",
                    },
                  ].map((item) => {
                    const isSelected = settings.theme === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateSetting("theme", item.id as any)}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                          isSelected
                            ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold text-slate-800">{item.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-[#3182ce]" />}
                        </div>
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-1.5 ${item.badgeClass}`}>
                          {item.badge}
                        </span>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 flex items-start gap-2.5 text-[11px] text-slate-500 leading-relaxed mt-1">
                  <Info className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-700">色彩规范与适配现状：</span>
                    平台遵循大厂极简现代化视觉规范，主框架全面采用明快通透的知性蓝色板（拒绝暗色系背景以防文字漂移与对比度丢失）。深色模式重点作用于代码编辑器与日志查看器（可在「代码与导出」Tab 独立设定代码配色）。
                  </div>
                </div>
              </div>

              {/* 1.3 日期与时间显示格式 */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">{t("dateFormatTitle")}</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#2b6cb0] bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200/80 inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>
                      {t("timePreviewPrefix")}: {getFormattedTimePreview()}
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">日期显示格式</label>
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => updateSetting("dateFormat", e.target.value as any)}
                      className="zg-input !h-9 !text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD（如 2026-10-30，标准格式）</option>
                      <option value="YYYY/MM/DD">YYYY/MM/DD（如 2026/10/30，斜杠分隔）</option>
                      <option value="YYYY年MM月DD日">YYYY年MM月DD日（如 2026年10月30日，中文日期）</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">时间小时制式</label>
                    <select
                      value={settings.timeFormat}
                      onChange={(e) => updateSetting("timeFormat", e.target.value as any)}
                      className="zg-input !h-9 !text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="24h">24 小时制（如 14:30:25，对账与审计推荐）</option>
                      <option value="12h">12 小时制（如 下午 02:30:25 / 02:30 PM）</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 1.4 排版与显示密度 */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Sliders className="w-4 h-4 text-[#3182ce]" />
                  <h3 className="text-sm font-black text-slate-800">{t("densityTitle")}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {[
                    { id: "compact", label: t("densityCompact"), desc: t("densityCompactDesc") },
                    { id: "comfortable", label: t("densityComfortable"), desc: t("densityComfortableDesc") },
                    { id: "spacious", label: t("densitySpacious"), desc: t("densitySpaciousDesc") },
                  ].map((item) => {
                    const isSelected = settings.displayDensity === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateSetting("displayDensity", item.id as any)}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold text-slate-800">{item.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-[#3182ce]" />}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* 平滑过渡动效开关 */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 mt-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">{t("animTitle")}</span>
                    <span className="text-[11px] text-slate-500">{t("animDesc")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSetting("enableAnimations", !settings.enableAnimations)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                      settings.enableAnimations ? "bg-[#3182ce]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        settings.enableAnimations ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============ Tab 2: 工作台与协同偏好 ============ */}
          {activeTab === "workspace" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* 2.1 默认工作空间（从数据库真实读取并支持持久化） */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">{t("defaultWsTitle")}</h3>
                  </div>
                  <Link
                    href="/user/workspaces"
                    className="text-xs font-bold text-[#3182ce] hover:underline inline-flex items-center gap-1"
                  >
                    <span>前往工作空间管理</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <p className="text-xs text-slate-500">{t("defaultWsDesc")}</p>

                <div className="pt-1">
                  <select
                    value={settings.defaultWorkspaceId}
                    onChange={(e) => updateSetting("defaultWorkspaceId", e.target.value)}
                    className="zg-input !h-10 !text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="auto">{t("defaultWsAuto")}</option>
                    {userWorkspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.type === "ENTERPRISE" ? "[企业工作空间]" : "[个人工作空间]"} {ws.name} (ID: {ws.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2.2 中枢默认呈现视图 */}
              <div className="zg-card p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <LayoutGrid className="w-4 h-4 text-[#3182ce]" />
                  <h3 className="text-sm font-black text-slate-800">{t("hubViewTitle")}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => updateSetting("workspaceView", "grid")}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                      settings.workspaceView === "grid"
                        ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{t("hubGrid")}</span>
                        {settings.workspaceView === "grid" && <Check className="w-4 h-4 text-[#3182ce]" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {t("hubGridDesc")}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("workspaceView", "list")}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                      settings.workspaceView === "list"
                        ? "border-[#3182ce] bg-blue-50/40 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                      <List className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{t("hubList")}</span>
                        {settings.workspaceView === "list" && <Check className="w-4 h-4 text-[#3182ce]" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {t("hubListDesc")}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2.3 导航侧边栏与组件排序策略 */}
              <div className="zg-card p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Sliders className="w-4 h-4 text-[#3182ce]" />
                  <h3 className="text-sm font-black text-slate-800">协同工作台交互行为</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{t("sidebarTitle")}</span>
                      <span className="text-[11px] text-slate-500">{t("sidebarDesc")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting("sidebarDefaultExpanded", !settings.sidebarDefaultExpanded)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        settings.sidebarDefaultExpanded ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          settings.sidebarDefaultExpanded ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{t("compSortTitle")}</span>
                      <span className="text-[11px] text-slate-500">{t("compSortDesc")}</span>
                    </div>
                    <select
                      value={settings.componentSort}
                      onChange={(e) => updateSetting("componentSort", e.target.value as any)}
                      className="zg-input !h-9 !w-full sm:!w-64 !text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="popularity">{t("compSortPop")}</option>
                      <option value="updatedAt">{t("compSortTime")}</option>
                      <option value="name">{t("compSortName")}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ Tab 3: 代码与导出偏好 ============ */}
          {activeTab === "editor" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* 左侧控制项 */}
                <div className="lg:col-span-7 zg-card p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                    <Code className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">代码查看器与报表导出格式</h3>
                  </div>

                  {/* 代码配色主题（默认亮白，支持柔和护眼蓝与高对比蓝灰） */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">{t("codeThemeTitle")}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: "light", label: t("codeGithub") },
                        { id: "soft", label: t("codeSoft") },
                        { id: "dark", label: t("codeMonokai") },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateSetting("codeTheme", item.id as any)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                            settings.codeTheme === item.id
                              ? "border-[#3182ce] bg-blue-50/50 text-[#2b6cb0]"
                              : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/70"
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {settings.codeTheme === item.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 字体大小与 Tab 缩进 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">{t("fontSizeTitle")}</label>
                      <select
                        value={settings.codeFontSize}
                        onChange={(e) => updateSetting("codeFontSize", e.target.value as any)}
                        className="zg-input !h-9 !text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="12px">12px — 紧凑高信息密度</option>
                        <option value="13px">13px — 标准舒适推荐</option>
                        <option value="14px">14px — 大号清晰阅读</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">{t("tabSizeTitle")}</label>
                      <select
                        value={settings.tabSize}
                        onChange={(e) => updateSetting("tabSize", Number(e.target.value) as any)}
                        className="zg-input !h-9 !text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value={2}>2 个空格（JSON / TypeScript 标准）</option>
                        <option value={4}>4 个空格（Python / 服务端标准）</option>
                      </select>
                    </div>
                  </div>

                  {/* 数据导出默认格式 */}
                  <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">{t("exportFormatTitle")}</span>
                        <span className="text-[11px] text-slate-500">{t("exportFormatDesc")}</span>
                      </div>
                    </div>
                    <select
                      value={settings.exportFormat}
                      onChange={(e) => updateSetting("exportFormat", e.target.value as any)}
                      className="zg-input !h-9 !w-full sm:!w-64 !text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="xlsx">Excel 表格 (.xlsx) — 财务对账与报表通用</option>
                      <option value="csv">CSV 文本 (.csv) — 轻量级表格导入导出</option>
                      <option value="json">JSON 结构化数据 (.json) — 开放接口联调</option>
                    </select>
                  </div>

                  {/* 显示代码行号开关 */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{t("lineNumTitle")}</span>
                      <span className="text-[11px] text-slate-500">{t("lineNumDesc")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting("showLineNumbers", !settings.showLineNumbers)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        settings.showLineNumbers ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          settings.showLineNumbers ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 右侧实时代码效果预览框（遵循浅色/护眼规范） */}
                <div className="lg:col-span-5 zg-card p-5 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-black text-slate-700">{t("previewTitle")}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                      {settings.codeFontSize} · Tab {settings.tabSize} · {settings.exportFormat.toUpperCase()}
                    </span>
                  </div>

                  <div
                    className={`flex-1 rounded-xl p-4 font-mono overflow-x-auto border transition-all ${
                      settings.codeTheme === "soft"
                        ? "bg-[#f0f7ff] border-blue-200/80 text-slate-800"
                        : settings.codeTheme === "dark"
                          ? "bg-slate-800 border-slate-700 text-slate-100"
                          : "bg-[#f8fafc] border-slate-200/90 text-slate-800"
                    }`}
                    style={{ fontSize: settings.codeFontSize }}
                  >
                    <div className="space-y-1.5 leading-relaxed">
                      <div className="flex items-center gap-3">
                        {settings.showLineNumbers && <span className="text-slate-400 select-none text-[11px]">01</span>}
                        <span>
                          <span className="text-[#3182ce] font-bold">const</span> requestConfig = &#123;
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {settings.showLineNumbers && <span className="text-slate-400 select-none text-[11px]">02</span>}
                        <span style={{ paddingLeft: `${settings.tabSize * 8}px` }}>
                          endpoint: <span className="text-[#38a169] font-semibold">"/api/open/v1/execute"</span>,
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {settings.showLineNumbers && <span className="text-slate-400 select-none text-[11px]">03</span>}
                        <span style={{ paddingLeft: `${settings.tabSize * 8}px` }}>
                          workspace: <span className="text-[#dd6b20] font-semibold">"{settings.defaultWorkspaceId}"</span>,
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {settings.showLineNumbers && <span className="text-slate-400 select-none text-[11px]">04</span>}
                        <span style={{ paddingLeft: `${settings.tabSize * 8}px` }}>
                          exportType: <span className="text-[#3182ce] font-semibold">"{settings.exportFormat}"</span>,
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {settings.showLineNumbers && <span className="text-slate-400 select-none text-[11px]">05</span>}
                        <span>&#125;;</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 text-center pt-1">
                    {t("previewFoot")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ============ Tab 4: 通知与消息订阅偏好 ============ */}
          {activeTab === "notification" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="zg-card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">{t("notifyChannelTitle")}</h3>
                  </div>
                  {notificationPref.hasEmail ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 self-start sm:self-center">
                      <Check className="w-3.5 h-3.5" />
                      <span>已绑定邮箱: {notificationPref.userEmail}</span>
                    </span>
                  ) : (
                    <Link
                      href="/user/profile"
                      className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors self-start sm:self-center cursor-pointer"
                      title="前往个人资料设置绑定邮箱"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>{t("emailUnboundBtn")}</span>
                      <ExternalLink className="w-3 h-3 text-amber-600" />
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 通道 1：邮件通知 */}
                  <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 hover:bg-blue-50/30 transition-colors cursor-pointer border border-slate-200/70">
                    <div className="flex items-start gap-3 pr-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 mt-0.5">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {t("emailChannelTitle")}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {notificationPref.hasEmail
                            ? `${t("emailBoundPrefix")} (${notificationPref.userEmail}) ${t("emailBoundSuffix")}`
                            : t("emailUnboundTip")}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPref.emailNotifications}
                      onChange={(e) =>
                        setNotificationPref({
                          ...notificationPref,
                          emailNotifications: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 通道 2：站内系统消息 */}
                  <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 hover:bg-blue-50/30 transition-colors cursor-pointer border border-slate-200/70">
                    <div className="flex items-start gap-3 pr-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#dd6b20] flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {t("sysChannelTitle")}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("sysChannelDesc")}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPref.systemMessages}
                      onChange={(e) =>
                        setNotificationPref({
                          ...notificationPref,
                          systemMessages: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 通道 3：项目与空间更新 */}
                  <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 hover:bg-blue-50/30 transition-colors cursor-pointer border border-slate-200/70">
                    <div className="flex items-start gap-3 pr-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#38a169] flex items-center justify-center shrink-0 mt-0.5">
                        <FolderGit2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {t("projectChannelTitle")}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("projectChannelDesc")}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPref.projectUpdates}
                      onChange={(e) =>
                        setNotificationPref({
                          ...notificationPref,
                          projectUpdates: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 通道 4：任务审阅与退点审批反馈（新增补全 usernotification.commentMentions 闭环） */}
                  <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 hover:bg-blue-50/30 transition-colors cursor-pointer border border-slate-200/70">
                    <div className="flex items-start gap-3 pr-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2b6cb0] flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {t("mentionChannelTitle")}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("mentionChannelDesc")}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPref.commentMentions}
                      onChange={(e) =>
                        setNotificationPref({
                          ...notificationPref,
                          commentMentions: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer shrink-0"
                    />
                  </label>
                </div>

                {/* 汇总投递频率 */}
                <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="text-xs font-bold text-slate-800 block">
                      {t("freqTitle")}
                    </label>
                    <span className="text-[11px] text-slate-500">{t("freqDesc")}</span>
                  </div>
                  <select
                    value={notificationPref.frequency}
                    onChange={(e) =>
                      setNotificationPref({
                        ...notificationPref,
                        frequency: e.target.value,
                      })
                    }
                    className="zg-input !h-9 !text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="REALTIME">{t("freqRealtime")}</option>
                    <option value="HOURLY">{t("freqHourly")}</option>
                    <option value="DAILY">{t("freqDaily")}</option>
                    <option value="WEEKLY">{t("freqWeekly")}</option>
                    <option value="CRITICAL_ONLY">{t("freqCritical")}</option>
                    <option value="QUIET_HOURS">{t("freqQuiet")}</option>
                  </select>
                </div>

                {/* 声音反馈开关 + 真实试听按钮 */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{t("soundTitle")}</span>
                      <span className="text-[11px] text-slate-500">{t("soundDesc")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {settings.soundEffects && (
                      <button
                        type="button"
                        onClick={playSampleSound}
                        className="zg-btn zg-btn-default !h-8 !px-3 !text-xs gap-1.5 font-bold"
                        title="点击播放真实的操作确认音"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-[#3182ce]" />
                        <span>{t("btnTestSound")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updateSetting("soundEffects", !settings.soundEffects)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        settings.soundEffects ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          settings.soundEffects ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ Tab 5: 登录与安全设置 ============ */}
          {activeTab === "security" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="zg-card p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#3182ce]" />
                    <h3 className="text-sm font-black text-slate-800">账号安全与登录会话策略</h3>
                  </div>
                  <Link
                    href="/user/security"
                    className="text-xs font-bold text-[#3182ce] hover:underline inline-flex items-center gap-1"
                  >
                    <span>前往账号安全与密码中心</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <div className="space-y-3">
                  {/* 1. 多设备登录并发开关 */}
                  <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 mt-0.5">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{t("multiDeviceTitle")}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            {t("multiDeviceDesc")}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllowMultiDevice((v) => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                          allowMultiDevice ? "bg-[#3182ce]" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                            allowMultiDevice ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {/* 并发设备数量上限选择器（当开启多设备登录时生效） */}
                    {allowMultiDevice && (
                      <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pl-12">
                        <div>
                          <span className="text-xs font-bold text-slate-700 block">
                            {t("deviceLimitTitle")}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {t("deviceLimitDesc")}
                          </span>
                        </div>
                        <select
                          value={deviceLimit}
                          onChange={(e) => setDeviceLimit(Number(e.target.value))}
                          className="zg-input !h-8 !w-full sm:!w-48 !text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          <option value={2}>最多 2 台终端同时在线</option>
                          <option value={3}>最多 3 台终端同时在线（推荐）</option>
                          <option value={5}>最多 5 台终端同时在线</option>
                          <option value={10}>最多 10 台终端（团队协作）</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 2. 异地与新设备登录告警开关（对接 /api/user/security-settings） */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#38a169] flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{t("loginAlertTitle")}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("loginAlertDesc")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSecurityPref((prev) => ({
                          ...prev,
                          loginAlertEnabled: !prev.loginAlertEnabled,
                        }))
                      }
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        securityPref.loginAlertEnabled ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          securityPref.loginAlertEnabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {/* 3. 敏感高危操作二次验证保护（对接 /api/user/security-settings） */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2b6cb0] flex items-center justify-center shrink-0 mt-0.5">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{t("twoFactorTitle")}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("twoFactorDesc")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSecurityPref((prev) => ({
                          ...prev,
                          twoFactorEnabled: !prev.twoFactorEnabled,
                        }))
                      }
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        securityPref.twoFactorEnabled ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          securityPref.twoFactorEnabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {/* 4. 删除与吊销操作强制二次确认开关 */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#dd6b20] flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{t("confirmDelTitle")}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t("confirmDelDesc")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSetting("requireDeleteConfirm", !settings.requireDeleteConfirm)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                        settings.requireDeleteConfirm ? "bg-[#3182ce]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          settings.requireDeleteConfirm ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 底部吸底操作浮动栏（有修改时自动浮现，防遗漏保存） */}
      {isDirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-2xl bg-white/95 backdrop-blur-xl border border-[#3182ce]/30 rounded-2xl shadow-xl p-3.5 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>{t("stickyTip")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              className="zg-btn zg-btn-default !h-8 !px-3.5 !text-xs font-bold"
            >
              {t("btnDiscard")}
            </button>
            <button
              type="button"
              onClick={() => void saveAllSettings()}
              disabled={saving}
              className="zg-btn zg-btn-primary !h-8 !px-4 !text-xs gap-1.5 font-bold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? t("btnSaving") : t("btnSaveNow")}</span>
            </button>
          </div>
        </div>
      )}

      {/* 恢复出厂默认设置二次确认模态框（Portal 挂载至 document.body） */}
      {mounted &&
        showResetConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden text-left p-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 text-[#dd6b20] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-base font-black text-slate-800">{t("resetModalTitle")}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t("resetModalDesc")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="zg-btn zg-btn-default text-xs h-8 px-4 font-bold"
                >
                  {t("btnCancel")}
                </button>
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  className="zg-btn zg-btn-primary text-xs h-8 px-4 gap-1.5 font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t("btnConfirmReset")}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
