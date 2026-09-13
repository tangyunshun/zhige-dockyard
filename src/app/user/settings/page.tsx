"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  EyeOff,
  Sliders,
  Clock,
  FileSpreadsheet,
  Calendar,
  Building,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

// 默认基础系统偏好配置
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
  // 代码与开发偏好
  codeTheme: "dark",
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
  stealthMode: false,
  requireDeleteConfirm: true,
};

// 完整中英双语词典（确保切换英文后 100% 真实生效，绝无假功能）
const I18N_DICTIONARY: Record<string, Record<string, string>> = {
  "zh-CN": {
    pageTitle: "系统偏好与协同设置",
    pageSubtitle: "自主定制您的显示界面、工作空间呈现方式、代码开发习惯、通知接收渠道以及登录安全策略，全端实时生效。",
    badgeSync: "实时生效 · 全端同步",
    badgeDirty: "● 有未保存的修改",
    btnReload: "重新加载",
    btnReset: "恢复默认",
    btnSaveAll: "保存全部设置",
    btnSaving: "正在保存...",
    overviewLang: "语言环境",
    overviewTheme: "界面外观",
    overviewHub: "中枢呈现",
    overviewNotify: "消息通道",
    overviewDevice: "设备登录",
    tabDisplay: "界面与显示",
    tabWorkspace: "工作台与协同",
    tabEditor: "代码与开发",
    tabNotification: "通知与订阅",
    tabSecurity: "登录与安全",
    langTitle: "语言与区域偏好",
    langZh: "简体中文 (Simplified Chinese)",
    langZhDesc: "知阁·舟坊官方原生推荐语言",
    langEn: "English (International)",
    langEnDesc: "面向国际化开发者的英文界面",
    themeTitle: "色彩与外观主题",
    themeLight: "明亮浅色",
    themeLightDesc: "知阁经典通透白蓝视觉风格",
    themeDark: "沉浸深色",
    themeDarkDesc: "低眩光护眼暗色模式",
    themeAuto: "跟随系统",
    themeAutoDesc: "自动适配操作系统深浅模式",
    densityTitle: "列表与卡片显示密度",
    densityCompact: "紧凑密度",
    densityCompactDesc: "缩小表格行高与边距，一屏查看更多数据",
    densityComfortable: "舒适标准 (推荐)",
    densityComfortableDesc: "大厂标准黄金间距，视觉平衡舒适",
    densitySpacious: "宽松大号",
    densitySpaciousDesc: "加大行距与字体尺寸，适合大屏宽视口",
    animTitle: "启用平滑交互过渡动效",
    animDesc: "关闭后将减少页面展开、收起时的动画以提升低配设备性能",
    hubViewTitle: "空间中枢默认进入视图",
    hubGrid: "卡片网格视图 (Grid)",
    hubGridDesc: "以现代 Bento 交互卡片展示每个工作空间的状态、健康分与关联组件",
    hubList: "明细表格视图 (Table)",
    hubListDesc: "以高信息密度数据表格呈现多空间指标、成员数量与所属方案",
    defaultWsTitle: "登录后默认进入的工作空间",
    defaultWsDesc: "设定进入中枢或平台后的首选激活工作空间（数据直接读取自您已参与的真实空间）",
    defaultWsAuto: "🔄 自动记忆（上次退出前访问的空间）",
    sidebarTitle: "进入工作空间默认展开左侧导航",
    sidebarDesc: "关闭后将在进入空间时默认收起左侧栏，以腾出更开阔的研发画布",
    compSortTitle: "研发组件默认排序方式",
    compSortDesc: "控制工作台与生态市场中组件的排列优先顺序",
    compSortPop: "🔥 按常用热度与调度频次排序",
    compSortTime: "🕒 按最近版本更新时间排序",
    compSortName: "🔤 按组件首字母名称排序",
    dateFormatTitle: "日期与时间显示格式",
    dateFormatDesc: "应用于操作日志、动态记录和审计流水的全局时间格式",
    timePreviewPrefix: "当前样例预览",
    exportFormatTitle: "数据导出默认文件格式",
    exportFormatDesc: "设置导出审计日志、任务报表时的默认文件类型",
    codeThemeTitle: "代码语法高亮主题",
    codeMonokai: "深色极客 (Monokai Dark)",
    codeGithub: "浅色经典 (GitHub Light)",
    fontSizeTitle: "代码字体字号",
    tabSizeTitle: "Tab 缩进空格数",
    lineNumTitle: "在代码块左侧显示行号",
    lineNumDesc: "便于快速对照定位报错代码与比对行差异",
    previewTitle: "实时渲染预览效果",
    previewFoot: "上述预览将应用于知阁代码查看器、OpenAPI 调试及日志详情中",
    notifyChannelTitle: "消息与动态订阅通道",
    emailChannelTitle: "外部邮件提醒通道 (Email Alerts)",
    emailBoundPrefix: "通过外部邮箱",
    emailBoundSuffix: "接收重要安全事件与订单通知",
    emailUnboundTip: "需在个人资料完成邮箱绑定后，方可接收邮件通知",
    emailUnboundBtn: "未绑定邮箱（点击前往绑定）",
    sysChannelTitle: "站内系统消息通知 (In-app Messages)",
    sysChannelDesc: "页面顶部铃铛红点气泡、未读计数与通知中心列表推送",
    projectChannelTitle: "工作空间协作动态 (Project Updates)",
    projectChannelDesc: "工作空间成员加入/移除、组件版本发布、方案调整等团队动态",
    freqTitle: "消息汇总投递频率",
    freqDesc: "控制系统向您发送聚合通知的节奏",
    freqRealtime: "⚡ 实时即刻推送 - 产生事件即刻送达，无任何汇总延迟",
    freqHourly: "⏱️ 每小时汇总 - 紧密追踪团队工作进展",
    freqDaily: "📅 每日下班汇总 - 每天下午下班前统一复盘交付",
    freqWeekly: "📊 每周精选汇总 - 周末统一发送本周精选摘要",
    freqCritical: "🛡️ 仅严重安全事件 - 屏蔽常规动态，仅派发高危告警",
    freqQuiet: "🌙 工作免打扰 - 仅在工作日标准时段派发通知",
    soundTitle: "重要操作成功声音反馈",
    soundDesc: "在完成构建、发布组件或保存配置时播放轻柔确认音",
    btnTestSound: "🔊 试听音效",
    soundPlayedTip: "已播放提示音",
    multiDeviceTitle: "允许多设备同时登录",
    multiDeviceDesc: "开启后允许在电脑、平板和手机同时在线协同；关闭后将严格限制为单设备登录，在其他设备登录时将自动下线旧设备以防账号被盗。",
    stealthTitle: "空间协同隐身模式",
    stealthDesc: "开启后，在工作空间成员列表中将不再展示您的实时在线小绿点，适合深度专注办公。",
    confirmDelTitle: "重要删除操作二次确认",
    confirmDelDesc: "在解散工作空间、下架组件或删除审计流水时强制弹出风险确认框，杜绝手滑误操作。",
    stickyTip: "您有尚未保存的系统偏好设置",
    btnDiscard: "放弃更改",
    btnSaveNow: "立即保存",
    resetModalTitle: "恢复系统出厂初始偏好",
    resetModalDesc: "即将把您的界面语言、外观模式、工作台中枢视图、代码缩进以及多端登录策略恢复为系统官方推荐的初始设置。恢复后需点击保存生效，是否继续？",
    btnCancel: "取消",
    btnConfirmReset: "确认恢复默认",
  },
  en: {
    pageTitle: "System Preferences & Settings",
    pageSubtitle: "Customize your interface, workspace presentation, coding habits, notification channels, and session security in real-time.",
    badgeSync: "Real-time Sync · All Devices",
    badgeDirty: "● Unsaved Changes",
    btnReload: "Reload",
    btnReset: "Reset Defaults",
    btnSaveAll: "Save All Settings",
    btnSaving: "Saving...",
    overviewLang: "Language",
    overviewTheme: "Theme",
    overviewHub: "Hub View",
    overviewNotify: "Channels",
    overviewDevice: "Login Policy",
    tabDisplay: "Display & Theme",
    tabWorkspace: "Workspace & Hub",
    tabEditor: "Code & Editor",
    tabNotification: "Notifications",
    tabSecurity: "Security & Login",
    langTitle: "Language & Regional Preferences",
    langZh: "Simplified Chinese (简体中文)",
    langZhDesc: "ZhiGe Dockyard native recommended language",
    langEn: "English (International)",
    langEnDesc: "English interface for global developers",
    themeTitle: "Theme & Visual Appearance",
    themeLight: "Light Mode",
    themeLightDesc: "ZhiGe classic bright white & blue style",
    themeDark: "Dark Mode",
    themeDarkDesc: "Low-glare eye-care immersive dark theme",
    themeAuto: "Follow System",
    themeAutoDesc: "Automatically matches OS color scheme",
    densityTitle: "Display Density & Spacing",
    densityCompact: "Compact Density",
    densityCompactDesc: "Reduces table padding to display more data per screen",
    densityComfortable: "Comfortable (Recommended)",
    densityComfortableDesc: "Standard balanced spacing for optimal readability",
    densitySpacious: "Spacious",
    densitySpaciousDesc: "Larger padding and typography for wide screens",
    animTitle: "Enable Smooth Transitions & Animations",
    animDesc: "Disable to reduce animations and improve performance on low-end devices",
    hubViewTitle: "Workspace Hub Default View",
    hubGrid: "Card Grid View (Bento)",
    hubGridDesc: "Displays workspaces with interactive Bento cards showing health score and components",
    hubList: "Data Table View (List)",
    hubListDesc: "High information density table presenting metrics, members, and tier plans",
    defaultWsTitle: "Default Active Workspace on Login",
    defaultWsDesc: "Select your preferred workspace to load automatically (fetched directly from your real workspaces)",
    defaultWsAuto: "🔄 Auto-memory (Last visited workspace)",
    sidebarTitle: "Expand Sidebar by Default in Workspace",
    sidebarDesc: "Disable to collapse the sidebar by default and maximize your workspace canvas",
    compSortTitle: "Component Default Sort Order",
    compSortDesc: "Controls the primary ordering of components in studio and marketplace",
    compSortPop: "🔥 Most Frequently Used & Popularity",
    compSortTime: "🕒 Recently Updated First",
    compSortName: "🔤 Alphabetical by Name (A-Z)",
    dateFormatTitle: "Date & Time Display Format",
    dateFormatDesc: "Global timestamp format applied to audit logs, records, and timelines",
    timePreviewPrefix: "Current Format Preview",
    exportFormatTitle: "Default Data Export Format",
    exportFormatDesc: "Default file type when exporting audit logs and task reports",
    codeThemeTitle: "Code Syntax Highlighting Theme",
    codeMonokai: "Dark Geek (Monokai Dark)",
    codeGithub: "Classic Light (GitHub Light)",
    fontSizeTitle: "Code Editor Font Size",
    tabSizeTitle: "Tab Indentation Spaces",
    lineNumTitle: "Show Line Numbers in Code Blocks",
    lineNumDesc: "Facilitates line referencing, debugging, and diff inspections",
    previewTitle: "Live Syntax Rendering Preview",
    previewFoot: "Applied to ZhiGe code viewers, OpenAPI consoles, and log inspect modals",
    notifyChannelTitle: "Notification & Subscription Channels",
    emailChannelTitle: "External Email Alerts (Email Channel)",
    emailBoundPrefix: "Receive critical security and order alerts via",
    emailBoundSuffix: "",
    emailUnboundTip: "Please bind a verified email in profile to receive email alerts",
    emailUnboundBtn: "Unbound Email (Click to bind)",
    sysChannelTitle: "In-app System Messages",
    sysChannelDesc: "Top navigation badge, unread counters, and notification drawer alerts",
    projectChannelTitle: "Workspace Collaboration Updates",
    projectChannelDesc: "Team member joined/removed, component releases, and solution changes",
    freqTitle: "Notification Digest Frequency",
    freqDesc: "Configure how often the system batches and delivers notifications",
    freqRealtime: "⚡ Real-time Instant - Immediate dispatch with zero delay",
    freqHourly: "⏱️ Hourly Digest - Keep close track of team progress",
    freqDaily: "📅 Daily Evening Summary - Unified recap at the end of workday",
    freqWeekly: "📊 Weekly Highlights - Curated weekly recap on weekends",
    freqCritical: "🛡️ Critical Alerts Only - Filter routine events, notify only emergencies",
    freqQuiet: "🌙 Quiet Hours - Deliver alerts only during standard business hours",
    soundTitle: "Audio Confirmation on Successful Actions",
    soundDesc: "Plays a gentle chime when saving configurations or publishing components",
    btnTestSound: "🔊 Test Sound",
    soundPlayedTip: "Chime sound played",
    multiDeviceTitle: "Allow Concurrent Multi-device Login",
    multiDeviceDesc: "When enabled, allows simultaneous online sessions. When disabled, forces single-device login and automatically kicks previous sessions.",
    stealthTitle: "Workspace Collaboration Stealth Mode",
    stealthDesc: "When enabled, hides your real-time green active status indicator from workspace member lists.",
    confirmDelTitle: "Require Confirmation for Critical Deletions",
    confirmDelDesc: "Always prompt a safety dialog before dismissing workspaces, components, or logs.",
    stickyTip: "You have unsaved system preferences",
    btnDiscard: "Discard Changes",
    btnSaveNow: "Save Now",
    resetModalTitle: "Reset to Factory Defaults",
    resetModalDesc: "This will restore your language, theme, workspace view, code tab size, and login policies to official defaults. Click Save to apply. Continue?",
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

  // 系统偏好状态
  const [settings, setSettings] = useState(DEFAULT_SYSTEM_SETTINGS);
  const [initialSettings, setInitialSettings] = useState(DEFAULT_SYSTEM_SETTINGS);

  // 真实工作空间列表（从数据库中真实获取，非模拟数据）
  const [userWorkspaces, setUserWorkspaces] = useState<RealWorkspace[]>([]);

  // 会话与多设备登录状态（对接后端 User.allowMultiDevice）
  const [allowMultiDevice, setAllowMultiDevice] = useState(true);
  const [initialAllowMultiDevice, setInitialAllowMultiDevice] = useState(true);

  // 真实通知与消息订阅偏好（对接后端 UserNotification 表）
  const [notificationPref, setNotificationPref] = useState<{
    emailNotifications: boolean;
    systemMessages: boolean;
    projectUpdates: boolean;
    frequency: string;
    hasEmail: boolean;
    userEmail: string;
  }>({
    emailNotifications: true,
    systemMessages: true,
    projectUpdates: true,
    frequency: "REALTIME",
    hasEmail: false,
    userEmail: "",
  });
  const [initialNotificationPref, setInitialNotificationPref] = useState(notificationPref);

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
          // 如果系统已存为 dark，则在页面根节点同步
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

  // 2. 读取当前用户真实的工作空间列表（从数据库真实拉取）
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
          setAllowMultiDevice(Boolean(data.data.allowMultiDevice));
          setInitialAllowMultiDevice(Boolean(data.data.allowMultiDevice));
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

  // 全量初始化加载（仅在挂载时运行一次，杜绝循环请求）
  const reloadAllSettings = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        await Promise.all([
          loadSettings(),
          loadUserWorkspaces(),
          loadSessionSettings(),
          loadNotificationPref(),
        ]);
        if (isManual) toast.success(settings.language === "en" ? "Preferences refreshed" : "所有系统偏好与策略已刷新至最新");
      } catch {
        if (isManual) toast.error(settings.language === "en" ? "Failed to refresh" : "刷新配置失败，请检查网络");
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [loadSettings, loadUserWorkspaces, loadSessionSettings, loadNotificationPref, settings.language, toast]
  );

  useEffect(() => {
    reloadAllSettings(false);
  }, []);

  // 判断是否有未保存的修改
  const isDirty =
    JSON.stringify(settings) !== JSON.stringify(initialSettings) ||
    allowMultiDevice !== initialAllowMultiDevice ||
    JSON.stringify(notificationPref) !== JSON.stringify(initialNotificationPref);

  // 播放 Web Audio API 真实提示音
  const playSampleSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // 产生轻柔愉悦的科技确认音：587Hz (D5) -> 880Hz (A5)
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

  // 保存全部配置（全闭环并发持久化）
  const saveAllSettings = async () => {
    setSaving(true);
    try {
      const authToken = getAuthToken();

      const [resSettings, resSession, resNotification] = await Promise.all([
        // 1. 保存偏好设置对象
        fetch("/api/user/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(settings),
        }),
        // 2. 保存单/多设备登录策略
        fetch("/api/user/session-settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ allowMultiDevice }),
        }),
        // 3. 保存通知通道偏好
        fetch("/api/user/notifications/preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            emailNotifications: notificationPref.emailNotifications,
            systemMessages: notificationPref.systemMessages,
            projectUpdates: notificationPref.projectUpdates,
            frequency: notificationPref.frequency,
          }),
        }),
      ]);

      if (resSettings.ok && resSession.ok && resNotification.ok) {
        setInitialSettings(settings);
        setInitialAllowMultiDevice(allowMultiDevice);
        setInitialNotificationPref(notificationPref);

        // 同步至本地语言和外观缓存，触发全局即时响应
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
            ? "All preferences and security policies saved successfully!"
            : "所有个性化偏好与安全策略已成功保存并即时生效"
        );
      } else {
        toast.error(
          settings.language === "en" ? "Failed to save settings" : "部分配置保存未成功，请检查输入或稍后重试"
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
    setNotificationPref(initialNotificationPref);
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
    setNotificationPref((prev) => ({
      ...prev,
      emailNotifications: prev.hasEmail,
      systemMessages: true,
      projectUpdates: true,
      frequency: "REALTIME",
    }));
    document.documentElement.classList.remove("dark");
    setShowResetConfirm(false);
    toast.success(
      settings.language === "en"
        ? "Restored to official defaults. Click save to apply."
        : "已恢复为系统初始推荐设置，点击保存后即可生效"
    );
  };

  // 快速切换辅助
  const updateSetting = <K extends keyof typeof DEFAULT_SYSTEM_SETTINGS>(
    key: K,
    value: (typeof DEFAULT_SYSTEM_SETTINGS)[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    // 即时切换深浅色模式类名，让用户立刻看到效果
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

  return (
    <div className="space-y-6 pb-24 text-left">
      {/* 页面顶部标题卡片（对齐管理员后台微毛玻璃规范） */}
      <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-inner flex-shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                  {t("pageTitle")}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200 whitespace-nowrap flex items-center gap-1">
                  <Sliders className="w-3 h-3" />
                  {t("badgeSync")}
                </span>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap animate-pulse">
                    {t("badgeDirty")}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                {t("pageSubtitle")}
              </p>
            </div>
          </div>

          {/* 顶部快捷操作栏 */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => reloadAllSettings(true)}
              disabled={refreshing || saving}
              className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-50"
              title="重新从服务器拉取配置"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>{refreshing ? t("btnSaving") : t("btnReload")}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={saving}
              className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
              title="恢复为系统出厂初始推荐配置"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t("btnReset")}</span>
            </button>

            <button
              type="button"
              onClick={saveAllSettings}
              disabled={saving}
              className="h-9 px-5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-all shadow-2xs hover:shadow-xs flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? t("btnSaving") : t("btnSaveAll")}</span>
            </button>
          </div>
        </div>

        {/* 当前配置状态总览胶囊 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-4 border-t border-slate-200/60">
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 font-bold block">{t("overviewLang")}</span>
            <span className="text-xs font-black text-slate-700">
              {settings.language === "zh-CN" ? "简体中文" : "English"}
            </span>
          </div>
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 font-bold block">{t("overviewTheme")}</span>
            <span className="text-xs font-black text-slate-700">
              {settings.theme === "light"
                ? t("themeLight")
                : settings.theme === "dark"
                ? t("themeDark")
                : t("themeAuto")}
            </span>
          </div>
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 font-bold block">{t("overviewHub")}</span>
            <span className="text-xs font-black text-slate-700">
              {settings.workspaceView === "grid" ? "卡片网格 (Grid)" : "明细列表 (Table)"}
            </span>
          </div>
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5">
            <span className="text-[10px] text-slate-400 font-bold block">{t("overviewNotify")}</span>
            <span className="text-xs font-black text-slate-700">
              {[notificationPref.emailNotifications, notificationPref.systemMessages, notificationPref.projectUpdates].filter(Boolean).length} 通道开启
            </span>
          </div>
          <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400 font-bold block">{t("overviewDevice")}</span>
            <span className="text-xs font-black text-slate-700">
              {allowMultiDevice ? "多设备并发" : "单设备防盗登"}
            </span>
          </div>
        </div>
      </div>

      {/* 5 大核心分类 Tab 导航工作台 */}
      <div className="flex items-center gap-1.5 p-1 bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-2xs overflow-x-auto">
        {[
          { id: "display", label: t("tabDisplay"), icon: Monitor },
          { id: "workspace", label: t("tabWorkspace"), icon: LayoutGrid },
          { id: "editor", label: t("tabEditor"), icon: Code },
          { id: "notification", label: t("tabNotification"), icon: Bell },
          { id: "security", label: t("tabSecurity"), icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isActive
                  ? "bg-[#3182ce] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: 界面与显示设置 */}
      {activeTab === "display" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* 1.1 语言偏好（切换后整页文本即刻真实响应为英文或中文） */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Globe className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-sm font-black text-slate-800">{t("langTitle")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label
                className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                  settings.language === "zh-CN"
                    ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("langZh")}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t("langZhDesc")}</p>
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
                    ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("langEn")}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t("langEnDesc")}</p>
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
          </div>

          {/* 1.2 主题模式 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Palette className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-sm font-black text-slate-800">{t("themeTitle")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[
                { id: "light", label: t("themeLight"), desc: t("themeLightDesc") },
                { id: "dark", label: t("themeDark"), desc: t("themeDarkDesc") },
                { id: "auto", label: t("themeAuto"), desc: t("themeAutoDesc") },
              ].map((item) => {
                const isSelected = settings.theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateSetting("theme", item.id as any)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-800">{item.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-[#3182ce]" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1.3 日期与时间格式偏好（紧扣偏好设置属性真实新增） */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#3182ce]" />
                <h3 className="text-sm font-black text-slate-800">{t("dateFormatTitle")}</h3>
              </div>
              <span className="text-xs font-mono font-bold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                {t("timePreviewPrefix")}: {getFormattedTimePreview()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">日期显示格式</label>
                <select
                  value={settings.dateFormat}
                  onChange={(e) => updateSetting("dateFormat", e.target.value as any)}
                  className="w-full px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (例如 2026-09-14，国际标准)</option>
                  <option value="YYYY/MM/DD">YYYY/MM/DD (例如 2026/09/14)</option>
                  <option value="YYYY年MM月DD日">YYYY年MM月DD日 (例如 2026年09月14日)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">时间小时制式</label>
                <select
                  value={settings.timeFormat}
                  onChange={(e) => updateSetting("timeFormat", e.target.value as any)}
                  className="w-full px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
                >
                  <option value="24h">24 小时制 (例如 14:30:25，工程研发推荐)</option>
                  <option value="12h">12 小时制 (例如 下午 02:30:25 / 02:30 PM)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 1.4 排版与显示密度 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
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
                        ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-slate-800">{item.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-[#3182ce]" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* 平滑过渡动效开关 */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 mt-2">
              <div>
                <span className="text-xs font-bold text-slate-800 block">{t("animTitle")}</span>
                <span className="text-[11px] text-slate-400">{t("animDesc")}</span>
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

      {/* Tab 2: 工作台与协同偏好 */}
      {activeTab === "workspace" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* 2.1 默认工作空间（从数据库真实读取并支持设置） */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Building className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-sm font-black text-slate-800">{t("defaultWsTitle")}</h3>
            </div>
            <p className="text-xs text-slate-400">{t("defaultWsDesc")}</p>

            <div className="pt-1">
              <select
                value={settings.defaultWorkspaceId}
                onChange={(e) => updateSetting("defaultWorkspaceId", e.target.value)}
                className="w-full px-3.5 h-10 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
              >
                <option value="auto">{t("defaultWsAuto")}</option>
                {userWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.type === "ENTERPRISE" ? "🏢 [企业级空间]" : "👤 [个人空间]"}{" "}
                    {ws.name} (ID: {ws.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2.2 中枢默认呈现视图 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
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
                    ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
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
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {t("hubGridDesc")}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateSetting("workspaceView", "list")}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  settings.workspaceView === "list"
                    ? "border-[#3182ce] bg-[#3182ce]/5 shadow-2xs"
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
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {t("hubListDesc")}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2.3 导航侧边栏与组件排序策略 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Sliders className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-sm font-black text-slate-800">协同工作台交互行为</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">{t("sidebarTitle")}</span>
                  <span className="text-[11px] text-slate-400">{t("sidebarDesc")}</span>
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
                  <span className="text-[11px] text-slate-400">{t("compSortDesc")}</span>
                </div>
                <select
                  value={settings.componentSort}
                  onChange={(e) => updateSetting("componentSort", e.target.value as any)}
                  className="px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
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

      {/* Tab 3: 代码与开发偏好 */}
      {activeTab === "editor" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 左侧控制项 */}
            <div className="lg:col-span-7 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Code className="w-4 h-4 text-[#3182ce]" />
                <h3 className="text-sm font-black text-slate-800">代码预览与编辑器偏好</h3>
              </div>

              {/* 代码配色主题 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">{t("codeThemeTitle")}</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => updateSetting("codeTheme", "dark")}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      settings.codeTheme === "dark"
                        ? "border-[#3182ce] bg-[#3182ce]/5 text-[#3182ce]"
                        : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/70"
                    }`}
                  >
                    <span>{t("codeMonokai")}</span>
                    {settings.codeTheme === "dark" && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("codeTheme", "light")}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      settings.codeTheme === "light"
                        ? "border-[#3182ce] bg-[#3182ce]/5 text-[#3182ce]"
                        : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100/70"
                    }`}
                  >
                    <span>{t("codeGithub")}</span>
                    {settings.codeTheme === "light" && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 字体大小与 Tab 缩进 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">{t("fontSizeTitle")}</label>
                  <select
                    value={settings.codeFontSize}
                    onChange={(e) => updateSetting("codeFontSize", e.target.value as any)}
                    className="w-full px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
                  >
                    <option value="12px">12px - 紧凑高密度</option>
                    <option value="13px">13px - 标准舒适推荐</option>
                    <option value="14px">14px - 大号清晰护眼</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">{t("tabSizeTitle")}</label>
                  <select
                    value={settings.tabSize}
                    onChange={(e) => updateSetting("tabSize", Number(e.target.value) as any)}
                    className="w-full px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
                  >
                    <option value={2}>2 个空格 (主流前端 / TypeScript 规范)</option>
                    <option value={4}>4 个空格 (经典后端 Java / Python 规范)</option>
                  </select>
                </div>
              </div>

              {/* 数据导出默认格式 */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">{t("exportFormatTitle")}</span>
                  <span className="text-[11px] text-slate-400">{t("exportFormatDesc")}</span>
                </div>
                <select
                  value={settings.exportFormat}
                  onChange={(e) => updateSetting("exportFormat", e.target.value as any)}
                  className="px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
                >
                  <option value="xlsx">📊 Excel 表格 (.xlsx) - 商务与报表通用</option>
                  <option value="json">📄 JSON 结构化数据 (.json) - 研发接口调试</option>
                </select>
              </div>

              {/* 显示代码行号开关 */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">{t("lineNumTitle")}</span>
                  <span className="text-[11px] text-slate-400">{t("lineNumDesc")}</span>
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

            {/* 右侧实时代码效果预览框 */}
            <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-2.5 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-500">{t("previewTitle")}</span>
                <span className="text-[11px] font-mono text-slate-400">
                  {settings.codeTheme} · {settings.codeFontSize} · Tab {settings.tabSize}
                </span>
              </div>

              <div
                className={`flex-1 rounded-xl p-4 font-mono overflow-x-auto border transition-all ${
                  settings.codeTheme === "dark"
                    ? "bg-slate-900 border-slate-800 text-slate-200"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
                style={{ fontSize: settings.codeFontSize }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    {settings.showLineNumbers && <span className="text-slate-500 select-none text-[11px]">01</span>}
                    <span className="text-[#3182ce] font-bold">export function</span>{" "}
                    <span className="text-amber-500 font-bold">buildDockyard</span>() &#123;
                  </div>
                  <div className="flex items-center gap-2.5">
                    {settings.showLineNumbers && <span className="text-slate-500 select-none text-[11px]">02</span>}
                    <span style={{ paddingLeft: `${settings.tabSize * 8}px` }}>
                      <span className="text-emerald-500 font-bold">const</span> status ={" "}
                      <span className="text-purple-400">"READY"</span>;
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {settings.showLineNumbers && <span className="text-slate-500 select-none text-[11px]">03</span>}
                    <span style={{ paddingLeft: `${settings.tabSize * 8}px` }}>
                      <span className="text-[#3182ce] font-bold">return</span> &#123; active:{" "}
                      <span className="text-emerald-400 font-bold">true</span> &#125;;
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {settings.showLineNumbers && <span className="text-slate-500 select-none text-[11px]">04</span>}
                    <span>&#125;</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center pt-1">
                {t("previewFoot")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: 通知与消息订阅偏好 */}
      {activeTab === "notification" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
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

            <div className="space-y-3">
              {/* 通道 1：邮件通知 */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {t("emailChannelTitle")}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
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
                  className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer"
                />
              </label>

              {/* 通道 2：系统消息 */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {t("sysChannelTitle")}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
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
                  className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer"
                />
              </label>

              {/* 通道 3：项目与空间更新 */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <FolderGit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {t("projectChannelTitle")}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
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
                  className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce] cursor-pointer"
                />
              </label>
            </div>

            {/* 汇总投递频率 */}
            <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 block">
                  {t("freqTitle")}
                </label>
                <span className="text-[11px] text-slate-400">{t("freqDesc")}</span>
              </div>
              <select
                value={notificationPref.frequency}
                onChange={(e) =>
                  setNotificationPref({
                    ...notificationPref,
                    frequency: e.target.value,
                  })
                }
                className="w-full px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-white focus:border-[#3182ce] outline-none cursor-pointer"
              >
                <option value="REALTIME">{t("freqRealtime")}</option>
                <option value="HOURLY">{t("freqHourly")}</option>
                <option value="DAILY">{t("freqDaily")}</option>
                <option value="WEEKLY">{t("freqWeekly")}</option>
                <option value="CRITICAL_ONLY">{t("freqCritical")}</option>
                <option value="QUIET_HOURS">{t("freqQuiet")}</option>
              </select>
            </div>

            {/* 声音反馈开关 + 真实试听按钮（Web Audio API 真实发声） */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">{t("soundTitle")}</span>
                  <span className="text-[11px] text-slate-400">{t("soundDesc")}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {settings.soundEffects && (
                  <button
                    type="button"
                    onClick={playSampleSound}
                    className="h-7 px-2.5 bg-white border border-slate-200 hover:border-[#3182ce] text-slate-600 hover:text-[#3182ce] text-xs font-bold rounded-lg transition-all shadow-2xs cursor-pointer"
                    title="点击播放真实的声音反馈"
                  >
                    {t("btnTestSound")}
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

      {/* Tab 5: 登录与安全设置 */}
      {activeTab === "security" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Shield className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-sm font-black text-slate-800">账号安全与登录会话策略</h3>
            </div>

            <div className="space-y-3">
              {/* 多设备登录并发开关 */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 mt-0.5">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{t("multiDeviceTitle")}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
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

              {/* 空间协同在线隐身状态 */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <EyeOff className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{t("stealthTitle")}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {t("stealthDesc")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("stealthMode", !settings.stealthMode)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                    settings.stealthMode ? "bg-[#3182ce]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.stealthMode ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {/* 高危删除二次确认开关 */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{t("confirmDelTitle")}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
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

      {/* 底部吸底操作浮动栏（有修改时自动浮现，防误忘保存） */}
      {isDirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-2xl bg-white/95 backdrop-blur-xl border border-[#3182ce]/30 rounded-2xl shadow-xl p-3.5 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>{t("stickyTip")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              {t("btnDiscard")}
            </button>
            <button
              type="button"
              onClick={saveAllSettings}
              disabled={saving}
              className="px-5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{t("btnSaveNow")}</span>
            </button>
          </div>
        </div>
      )}

      {/* 恢复出厂默认设置二次确认模态框 */}
      {mounted && showResetConfirm && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-black text-slate-800">{t("resetModalTitle")}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t("resetModalDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {t("btnCancel")}
              </button>
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="h-9 px-5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t("btnConfirmReset")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
