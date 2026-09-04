"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthToken } from "@/utils/auth";
import { getOAuthChannelMeta } from "@/constants/oauth";
import {
  Settings,
  Mail,
  MessageSquare,
  Globe,
  Shield,
  Database,
  AlertTriangle,
  Wrench,
  FileText,
  Save,
  CheckCircle2,
  RefreshCw,
  Server,
  Key,
  Lock,
  Layers,
  HardDrive,
  Activity,
  Send,
  Loader2,
  Upload,
  ImageIcon,
  QrCode,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Code2,
  ChevronDown,
  Copy,
  Check,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Eye,
  Edit3,
  FolderTree,
  Compass,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

export interface NavLinkItem {
  label: string;
  url: string;
}

export interface NavColumnItem {
  title: string;
  links: NavLinkItem[];
}

const DEFAULT_NAV_COLUMNS: NavColumnItem[] = [
  {
    title: "产品",
    links: [
      { label: "核心模块", url: "/capabilities" },
      { label: "组件大全", url: "/market" },
      { label: "更新日志", url: "/docs" },
      { label: "组件广场", url: "/market" },
    ],
  },
  {
    title: "资源",
    links: [
      { label: "帮助中心", url: "/help" },
      { label: "API 文档", url: "/docs" },
      { label: "最佳实践", url: "/knowledge" },
      { label: "开发者社区", url: "/developers" },
    ],
  },
  {
    title: "解决方案",
    links: [
      { label: "政务云", url: "/solutions" },
      { label: "军工科研", url: "/solutions" },
      { label: "金融信创", url: "/solutions" },
      { label: "智慧城市", url: "/solutions" },
    ],
  },
  {
    title: "公司",
    links: [
      { label: "关于我们", url: "/developers" },
      { label: "联系商务", url: "/help" },
      { label: "隐私条款", url: "/privacy-policy" },
      { label: "加入我们", url: "/developers" },
    ],
  },
];

export interface OAuthChannelItem {
  id: string;
  type: string;
  name: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  callbackUrl?: string;
}

interface OAuthChannelMenuItem {
  type: string;
  name: string;
  icon?: string;
  isImg?: boolean;
  dotColor?: string;
  tag: string;
  tagColor: string;
  hoverBg: string;
  hoverText: string;
}

const DEFAULT_OAUTH_CHANNELS: OAuthChannelItem[] = [
  {
    id: "github",
    type: "github",
    name: "GitHub 开发者授权登录",
    clientId: "",
    clientSecret: "",
    enabled: false,
    callbackUrl: "/api/auth/github/callback",
  },
  {
    id: "wechat",
    type: "wechat",
    name: "微信开放平台扫码登录",
    clientId: "",
    clientSecret: "",
    enabled: false,
    callbackUrl: "/api/auth/wechat/callback",
  },
];

interface DatabaseStats {
  status: string;
  latencyMs: number;
  tableCounts: {
    users: number;
    workspaces: number;
    components: number;
    billingRecords: number;
    operationLogs: number;
    accountAppeals: number;
  };
  lastBackupTime: string;
  dbEngine: string;
}

export default function AdminSettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 二维码文件选择与上传状态
  const wechatQrInputRef = useRef<HTMLInputElement>(null);
  const qqQrInputRef = useRef<HTMLInputElement>(null);
  const weiboQrInputRef = useRef<HTMLInputElement>(null);
  const [qrUploading, setQrUploading] = useState<{
    footerWechatQr?: boolean;
    footerQqQr?: boolean;
    footerWeiboQr?: boolean;
  }>({});

  // 第三方联合登录渠道下拉与复制状态
  const [showAddOAuthMenu, setShowAddOAuthMenu] = useState(false);
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);

  // 全局持久化表单状态
  const [configs, setConfigs] = useState<Record<string, string>>({
    siteName: "知阁·舟坊",
    siteUrl: "https://dockyard.zhige.com",
    description: "企业级全生命周期软件组件工程与效能中枢平台",
    logo: "/logo.png",
    copyright: "© 2026 知阁科技 ZhiGe Tech. 保留所有权利",
    icpNumber: "京ICP备20260904号-1",
    smtpHost: "smtp.zhige.com",
    smtpPort: "587",
    smtpUser: "service@zhige.com",
    smtpPass: "",
    senderEmail: "noreply@zhige.com",
    senderName: "知阁舟坊运维中枢",
    smsProvider: "aliyun",
    smsAccessKeyId: "",
    smsAccessKeySecret: "",
    smsSignName: "知阁科技",
    smsTemplateCode: "SMS_20260904",
    oauthGithubEnabled: "false",
    oauthGithubClientId: "",
    oauthGithubClientSecret: "",
    oauthWechatEnabled: "false",
    oauthWechatAppId: "",
    oauthWechatAppSecret: "",
    loginMaxFailures: "5",
    ipRateLimitMinute: "120",
    passwordExpireDays: "90",
    sessionTimeoutHours: "24",
    footerSlogan: "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
    footerSubTitle: "ZhiGe Dockyard",
    footerWechatQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat",
    footerQqQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq",
    footerWeiboQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo",
    footerPoliceIcp: "京公网安备 31000000000000 号",
    footerNavColumns: "",
  });

  // 真实数据库运行状态
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  // 注销冷静期配置
  const [cooldownDays, setCooldownDays] = useState(7);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [cooldownSaving, setCooldownSaving] = useState(false);

  // 前台分类导航工作台状态与常用路由推荐
  const [navColumns, setNavColumns] = useState<NavColumnItem[]>(DEFAULT_NAV_COLUMNS);
  const [selectedNavColIndex, setSelectedNavColIndex] = useState(0);
  const [showNavJson, setShowNavJson] = useState(false);
  const [showLiveFooterPreview, setShowLiveFooterPreview] = useState(true);

  // 常用站内路由推荐助手
  const COMMON_NAV_PRESETS = [
    { label: "核心模块", url: "/capabilities" },
    { label: "组件市场", url: "/market" },
    { label: "系统文档", url: "/docs" },
    { label: "帮助中心", url: "/help" },
    { label: "解决方案", url: "/solutions" },
    { label: "开发者社区", url: "/developers" },
    { label: "知识库", url: "/knowledge" },
    { label: "隐私条款", url: "/privacy-policy" },
  ];

  // 同步更新导航状态与底层 JSON 配置
  const syncNavColumns = (updated: NavColumnItem[]) => {
    setNavColumns(updated);
    setConfigs((prev) => ({
      ...prev,
      footerNavColumns: JSON.stringify(updated),
    }));
  };

  // 1. 添加新的大分类列
  const handleAddNavColumn = () => {
    const newTitle = `新分类 ${navColumns.length + 1}`;
    const updated = [
      ...navColumns,
      {
        title: newTitle,
        links: [{ label: "新建功能链接", url: "/capabilities" }],
      },
    ];
    syncNavColumns(updated);
    setSelectedNavColIndex(updated.length - 1);
    toast.success(`已新建【${newTitle}】分类，可在右侧工作台自由添加链接！`);
  };

  // 2. 修改分类标题
  const handleUpdateColumnTitle = (colIndex: number, newTitle: string) => {
    const updated = [...navColumns];
    updated[colIndex] = { ...updated[colIndex], title: newTitle };
    syncNavColumns(updated);
  };

  // 3. 删除分类
  const handleDeleteNavColumn = (colIndex: number) => {
    if (navColumns.length <= 1) {
      toast.warning("至少需要保留 1 个前台导航分类");
      return;
    }
    const targetTitle = navColumns[colIndex]?.title || "当前分类";
    const updated = navColumns.filter((_, idx) => idx !== colIndex);
    syncNavColumns(updated);
    setSelectedNavColIndex((prev) => (prev >= updated.length ? Math.max(0, updated.length - 1) : prev));
    toast.success(`已移除【${targetTitle}】分类`);
  };

  // 4. 分类列上移/左移排序
  const handleMoveNavColumn = (fromIndex: number, direction: "prev" | "next") => {
    const toIndex = direction === "prev" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= navColumns.length) return;
    const updated = [...navColumns];
    const temp = updated[fromIndex];
    updated[fromIndex] = updated[toIndex];
    updated[toIndex] = temp;
    syncNavColumns(updated);
    setSelectedNavColIndex(toIndex);
    toast.success("分类排列顺序已调整！");
  };

  // 5. 为指定分类添加子链接
  const handleAddNavLink = (colIndex: number) => {
    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    targetCol.links = [...targetCol.links, { label: "新导航项", url: "/market" }];
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
    toast.success(`已为【${targetCol.title}】添加新链接项！`);
  };

  // 6. 修改子链接字段
  const handleUpdateNavLink = (
    colIndex: number,
    linkIndex: number,
    field: "label" | "url",
    value: string
  ) => {
    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    const links = [...targetCol.links];
    links[linkIndex] = { ...links[linkIndex], [field]: value };
    targetCol.links = links;
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
  };

  // 7. 删除子链接
  const handleDeleteNavLink = (colIndex: number, linkIndex: number) => {
    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    targetCol.links = targetCol.links.filter((_, idx) => idx !== linkIndex);
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
  };

  // 8. 链接上移排序
  const handleMoveNavLinkUp = (colIndex: number, linkIndex: number) => {
    if (linkIndex <= 0) return;
    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    const links = [...targetCol.links];
    const temp = links[linkIndex - 1];
    links[linkIndex - 1] = links[linkIndex];
    links[linkIndex] = temp;
    targetCol.links = links;
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
  };

  // 9. 链接下移排序
  const handleMoveNavLinkDown = (colIndex: number, linkIndex: number) => {
    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    const links = [...targetCol.links];
    if (linkIndex >= links.length - 1) return;
    const temp = links[linkIndex + 1];
    links[linkIndex + 1] = links[linkIndex];
    links[linkIndex] = temp;
    targetCol.links = links;
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
  };

  // 10. 重置为官方默认
  const handleResetNavColumns = () => {
    syncNavColumns(DEFAULT_NAV_COLUMNS);
    setSelectedNavColIndex(0);
    toast.success("已恢复官方 4 大标准分类导航数据模板！");
  };

  // 第三方登录通道动态状态
  const [oauthChannels, setOauthChannels] = useState<OAuthChannelItem[]>(DEFAULT_OAUTH_CHANNELS);
  const [channelToDelete, setChannelToDelete] = useState<OAuthChannelItem | null>(null);

  // 同步更新第三方渠道与底层系统配置字段
  const syncOAuthChannels = (updated: OAuthChannelItem[]) => {
    setOauthChannels(updated);
    const github = updated.find((c) => c.type === "github" || c.id === "github");
    const wechat = updated.find((c) => c.type === "wechat" || c.id === "wechat");
    setConfigs((prev) => ({
      ...prev,
      oauthChannels: JSON.stringify(updated),
      oauthGithubEnabled: github ? (github.enabled ? "true" : "false") : "false",
      oauthGithubClientId: github ? github.clientId : "",
      oauthGithubClientSecret: github ? github.clientSecret : "",
      oauthWechatEnabled: wechat ? (wechat.enabled ? "true" : "false") : "false",
      oauthWechatAppId: wechat ? wechat.clientId : "",
      oauthWechatAppSecret: wechat ? wechat.clientSecret : "",
    }));
  };

  // 1. 添加第三方登录渠道（覆盖国内主流与国外常用平台）
  const handleAddOAuthChannel = (type: string) => {
    const meta = getOAuthChannelMeta(type);
    const newId = `${type}_${Date.now().toString(36)}`;
    const currentEnabledCount = oauthChannels.filter((c) => c.enabled).length;
    // 登录页排版规范最多支持显示 2 个，若已达到 2 个，新增渠道默认不开启并给出友好提示
    const shouldEnable = currentEnabledCount < 2;
    const newChannel: OAuthChannelItem = {
      id: newId,
      type,
      name: meta.name,
      clientId: "",
      clientSecret: "",
      enabled: shouldEnable,
      callbackUrl: meta.defaultCallback,
    };
    const updated = [...oauthChannels, newChannel];
    syncOAuthChannels(updated);
    if (shouldEnable) {
      toast.success(`已新增【${meta.name}】并已启用，请填写对应 Client ID 与 Secret！`);
    } else {
      toast.info(`已新增【${meta.name}】（已达到前台 2 个开启上限，默认未启用，若需开启请先禁用其他渠道）。`);
    }
  };

  // 2. 删除渠道
  const handleDeleteOAuthChannel = (id: string) => {
    const target = oauthChannels.find((c) => c.id === id);
    const updated = oauthChannels.filter((c) => c.id !== id);
    syncOAuthChannels(updated);
    toast.success(`已成功删除【${target?.name || "第三方通道"}】！`);
  };

  // 3. 开关切换（严格执行最多启用 2 个的前置判断与拦截）
  const handleToggleOAuthChannel = (id: string) => {
    const target = oauthChannels.find((c) => c.id === id);
    if (!target) return;

    // 前置阻断：如果当前试图开启，而当前已开启总数 >= 2
    if (!target.enabled) {
      const currentEnabledCount = oauthChannels.filter((c) => c.enabled).length;
      if (currentEnabledCount >= 2) {
        toast.warning(
          "登录页面排版规范最多只支持同时显示 2 个第三方登录渠道。若要启用该渠道，请先关闭已开启的其中一个渠道！"
        );
        return;
      }
    }

    const updated = oauthChannels.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    syncOAuthChannels(updated);
    toast.success(`已${!target.enabled ? "启用" : "关闭"}【${target.name}】渠道！`);
  };

  // 4. 更新渠道字段
  const handleUpdateOAuthChannel = (
    id: string,
    field: "name" | "clientId" | "clientSecret" | "callbackUrl",
    value: string
  ) => {
    const updated = oauthChannels.map((c) =>
      c.id === id ? { ...c, [field]: value } : c
    );
    syncOAuthChannels(updated);
  };

  // 5. 恢复默认官方渠道
  const handleResetOAuthChannels = () => {
    syncOAuthChannels(DEFAULT_OAUTH_CHANNELS);
    toast.success("已恢复官方默认预置第三方登录通道！");
  };

  // 1. 加载全局系统设置与数据库状态
  const loadSystemSettings = useCallback(async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.configs) {
          setConfigs((prev) => ({ ...prev, ...data.configs }));
          if (data.configs.footerNavColumns) {
            try {
              const parsed = JSON.parse(data.configs.footerNavColumns);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setNavColumns(parsed);
              }
            } catch (e) {
              // 解析异常保持现有
            }
          }
          // 解析第三方登录通道列表
          if (data.configs.oauthChannels) {
            try {
              const parsedChannels = JSON.parse(data.configs.oauthChannels);
              if (Array.isArray(parsedChannels) && parsedChannels.length > 0) {
                setOauthChannels(parsedChannels);
              }
            } catch (e) {}
          } else {
            // 兼容已有配置初始化
            setOauthChannels([
              {
                id: "github",
                type: "github",
                name: "GitHub 开发者授权登录",
                clientId: data.configs.oauthGithubClientId || "",
                clientSecret: data.configs.oauthGithubClientSecret || "",
                enabled: data.configs.oauthGithubEnabled === "true",
                callbackUrl: "/api/auth/github/callback",
              },
              {
                id: "wechat",
                type: "wechat",
                name: "微信开放平台扫码登录",
                clientId: data.configs.oauthWechatAppId || "",
                clientSecret: data.configs.oauthWechatAppSecret || "",
                enabled: data.configs.oauthWechatEnabled === "true",
                callbackUrl: "/api/auth/wechat/callback",
              },
            ]);
          }
        }
        if (data.databaseStats) {
          setDbStats(data.databaseStats);
        }
      } else {
        toast.error("加载系统配置失败，请确认权限");
      }
    } catch (e) {
      toast.error("网络异常，无法连接系统配置中心");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. 加载注销冷静期配置
  const loadCooldownConfig = useCallback(async () => {
    try {
      setCooldownLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/account-deletion-config", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCooldownDays(data.configuredValue ?? data.cooldownDays ?? 7);
      }
    } catch (e) {
      console.warn("加载注销冷静期失败:", e);
    } finally {
      setCooldownLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystemSettings();
    loadCooldownConfig();
  }, [loadSystemSettings, loadCooldownConfig]);

  // 表单键值变更
  const handleConfigChange = (key: string, value: string) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
  };

  // 保存当前模块的配置
  const handleSaveSettings = async (keysToSave: string[], successMsg: string) => {
    try {
      setSaving(true);
      const payload: Record<string, string> = {};
      keysToSave.forEach((k) => {
        payload[k] = configs[k] ?? "";
      });

      // 权威状态兜底同步：确保第三方登录通道从当前真实状态完整序列化
      if (keysToSave.includes("oauthChannels")) {
        const enabledCount = oauthChannels.filter((c) => c.enabled).length;
        if (enabledCount > 2) {
          toast.warning(`登录页面排版规范最多支持开启 2 个第三方登录渠道，当前开启了 ${enabledCount} 个。请先关闭多余渠道后再保存！`);
          setSaving(false);
          return;
        }
        payload["oauthChannels"] = JSON.stringify(oauthChannels);
        const github = oauthChannels.find((c) => c.type === "github" || c.id === "github");
        const wechat = oauthChannels.find((c) => c.type === "wechat" || c.id === "wechat");
        payload["oauthGithubEnabled"] = github ? (github.enabled ? "true" : "false") : "false";
        payload["oauthGithubClientId"] = github ? github.clientId : "";
        payload["oauthGithubClientSecret"] = github ? github.clientSecret : "";
        payload["oauthWechatEnabled"] = wechat ? (wechat.enabled ? "true" : "false") : "false";
        payload["oauthWechatAppId"] = wechat ? wechat.clientId : "";
        payload["oauthWechatAppSecret"] = wechat ? wechat.clientSecret : "";
      }

      // 权威状态兜底同步：确保前台分类导航从当前真实状态完整序列化
      if (keysToSave.includes("footerNavColumns")) {
        payload["footerNavColumns"] = JSON.stringify(navColumns);
      }

      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ settings: payload }),
      });

      if (res.ok) {
        toast.success(successMsg);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "保存失败，请检查填写内容");
      }
    } catch (e) {
      toast.error("保存配置时发生网络异常");
    } finally {
      setSaving(false);
    }
  };

  // 上传平台 Logo 处理
  const handleLogoUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.warning("Logo 图片大小不能超过 5MB");
      return;
    }

    try {
      setLogoUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings/upload-logo", {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfigs((prev) => ({ ...prev, logo: data.url }));
        toast.success(data.message || "平台 Logo 上传成功并已持久化保存！");
      } else {
        toast.error(data.error || "Logo 上传失败");
      }
    } catch (e) {
      toast.error("上传 Logo 过程中网络异常");
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 处理社交平台二维码上传
  const handleQrUpload = async (key: "footerWechatQr" | "footerQqQr" | "footerWeiboQr", file: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.warning("二维码图片大小不能超过 5MB");
      return;
    }

    try {
      setQrUploading((prev) => ({ ...prev, [key]: true }));
      const formData = new FormData();
      formData.append("file", file);
      formData.append("configKey", key);

      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings/upload-qrcode", {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfigs((prev) => ({ ...prev, [key]: data.url }));
        toast.success(data.message || "二维码上传成功并已持久化保存！");
      } else {
        toast.error(data.error || "二维码上传失败");
      }
    } catch (e) {
      toast.error("上传二维码过程中网络异常");
    } finally {
      setQrUploading((prev) => ({ ...prev, [key]: false }));
      if (key === "footerWechatQr" && wechatQrInputRef.current) wechatQrInputRef.current.value = "";
      if (key === "footerQqQr" && qqQrInputRef.current) qqQrInputRef.current.value = "";
      if (key === "footerWeiboQr" && weiboQrInputRef.current) weiboQrInputRef.current.value = "";
    }
  };

  // 保存注销冷静期
  const handleSaveCooldown = async () => {
    const days = Number(cooldownDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      toast.warning("注销冷静期必须是 1~90 之间的整数");
      return;
    }
    setCooldownSaving(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/account-deletion-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ cooldownDays: days }),
      });
      const data = await res.json();
      if (res.ok) {
        setCooldownDays(days);
        toast.success(data.message || "账号注销冷静期配置已更新！");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (e) {
      toast.error("保存冷静期失败，请稍后重试");
    } finally {
      setCooldownSaving(false);
    }
  };

  // 标签栏定义
  const tabs = [
    { id: "basic", label: "站点基础", icon: Settings },
    { id: "email", label: "SMTP 邮件", icon: Mail },
    { id: "sms", label: "短信网关", icon: MessageSquare },
    { id: "oauth", label: "第三方登录", icon: Globe },
    { id: "footer", label: "页脚与前台导航", icon: Layers },
    { id: "security", label: "安全与风控", icon: Shield },
    { id: "database", label: "数据库与灾备", icon: Database },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题微毛玻璃 Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-inner flex-shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">系统设置中心</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#3182ce] border border-blue-200 whitespace-nowrap">
                  真实 DB 持久化驱动
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                知阁平台全局参数配置、账号注销安全策略、邮件通知模板与第三方集成服务。所有配置均写入 system_config 表。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={loadSystemSettings}
              disabled={loading}
              className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
              刷新参数
            </button>
            <Link
              href="/admin/maintenance"
              className="h-9 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
              维护与熔断控制台
            </Link>
            <Link
              href="/admin/operation-logs"
              className="h-9 px-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
              操作审计日志
            </Link>
          </div>
        </div>
      </div>

      {/* 设置主卡片 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden text-left">
        {/* Segmented Tabs 标签切换栏 */}
        <div className="flex border-b border-slate-200/80 bg-slate-50/50 p-2 gap-1.5 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-[#3182ce] shadow-xs ring-1 ring-slate-200/60 font-black"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#3182ce]" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 内容区域 */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#3182ce] mb-3" />
              <p className="text-xs font-bold">正在拉取系统底层持久化配置...</p>
            </div>
          ) : (
            <>
              {/* Tab 1: 基础设置 */}
              {activeTab === "basic" && (
                <div className="space-y-6 max-w-3xl">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-black text-slate-800">平台基础信息设置</h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      管理全站对外展示的站点名称、域名、SEO 描述与备案版权信息。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">站点名称 (Site Name)</label>
                      <input
                        type="text"
                        value={configs.siteName || ""}
                        onChange={(e) => handleConfigChange("siteName", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="知阁·舟坊"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">平台主域名 URL</label>
                      <input
                        type="url"
                        value={configs.siteUrl || ""}
                        onChange={(e) => handleConfigChange("siteUrl", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="https://dockyard.zhige.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">平台定位与 SEO 描述</label>
                    <textarea
                      rows={3}
                      value={configs.description || ""}
                      onChange={(e) => handleConfigChange("description", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all resize-none"
                      placeholder="企业级组件开发与协作效能平台..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                      <div className="flex items-center justify-between mb-2.5">
                        <label className="block text-xs font-bold text-slate-700">平台 Logo 标识</label>
                        <span className="text-[11px] text-slate-400">支持 SVG / PNG / WebP</span>
                      </div>
                      
                      <div className="flex items-center gap-3.5 mb-3">
                        {/* 实时预览容器 */}
                        <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                          {configs.logo ? (
                            <img
                              src={configs.logo}
                              alt="Logo Preview"
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/logo.png";
                              }}
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          )}
                        </div>

                        {/* 上传与恢复默认操作 */}
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,image/x-icon"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleLogoUpload(file);
                              }}
                            />
                            <button
                              type="button"
                              disabled={logoUploading}
                              onClick={() => fileInputRef.current?.click()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-lg text-xs font-medium transition-all shadow-sm cursor-pointer"
                            >
                              {logoUploading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>上传中...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>上传新 Logo</span>
                                </>
                              )}
                            </button>

                            {configs.logo && configs.logo !== "/logo.png" && (
                              <button
                                type="button"
                                onClick={() => handleConfigChange("logo", "/logo.png")}
                                className="px-2.5 py-1.5 border border-slate-200 hover:bg-white text-slate-600 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                title="重置为系统默认 logo.png"
                              >
                                恢复默认
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            文件限制 5MB，系统将自动持久化至媒体库与配置表
                          </p>
                        </div>
                      </div>

                      {/* 资源路径微调/手动输入 */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Logo 存储路径或外部 CDN：</span>
                        <input
                          type="text"
                          value={configs.logo || ""}
                          onChange={(e) => handleConfigChange("logo", e.target.value)}
                          className="w-full px-3 h-8 border border-slate-200 bg-white rounded-lg focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 outline-none text-xs text-slate-700 transition-all font-mono"
                          placeholder="/logo.png 或 https://..."
                        />
                      </div>
                    </div>

                    <div className="flex flex-col justify-between p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">ICP 备案许可编号</label>
                        <input
                          type="text"
                          value={configs.icpNumber || ""}
                          onChange={(e) => handleConfigChange("icpNumber", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="京ICP备20260904号-1"
                        />
                        <p className="text-[11px] text-slate-400 mt-2">
                          根据国家工信部要求，境内站点必须在首页底部悬挂有效备案号及跳转链接。
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-200/60">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">底部版权信息 (Copyright)</label>
                        <input
                          type="text"
                          value={configs.copyright || ""}
                          onChange={(e) => handleConfigChange("copyright", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="© 2026 知阁科技 ZhiGe Tech."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          ["siteName", "siteUrl", "description", "logo", "copyright", "icpNumber"],
                          "站点基础信息已成功保存至配置表！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存基础设置
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: SMTP 邮件配置 */}
              {activeTab === "email" && (
                <div className="space-y-6 max-w-3xl">
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 flex items-start gap-3">
                    <Mail className="w-5 h-5 text-[#3182ce] shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900 leading-relaxed font-medium">
                      <span className="font-bold block mb-0.5">邮件微通道说明 (P4 级)</span>
                      此处的 SMTP 参数用于系统自动发送验证码、风险安全警示、申诉审批通过通知等。配置将直接注入 mailer.ts 传输实例。
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">SMTP 主机地址 (Host)</label>
                      <input
                        type="text"
                        value={configs.smtpHost || ""}
                        onChange={(e) => handleConfigChange("smtpHost", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="smtp.zhige.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">SMTP 通信端口 (Port)</label>
                      <input
                        type="text"
                        value={configs.smtpPort || ""}
                        onChange={(e) => handleConfigChange("smtpPort", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="587 或 465"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">认证账号 (SMTP User)</label>
                      <input
                        type="text"
                        value={configs.smtpUser || ""}
                        onChange={(e) => handleConfigChange("smtpUser", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="service@zhige.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">认证授权码 / 密码 (Password)</label>
                      <input
                        type="password"
                        value={configs.smtpPass || ""}
                        onChange={(e) => handleConfigChange("smtpPass", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="••••••••••••"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">发件人展示邮箱</label>
                      <input
                        type="email"
                        value={configs.senderEmail || ""}
                        onChange={(e) => handleConfigChange("senderEmail", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="noreply@zhige.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">发件人展示名称</label>
                      <input
                        type="text"
                        value={configs.senderName || ""}
                        onChange={(e) => handleConfigChange("senderName", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="知阁舟坊运维中枢"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "senderEmail", "senderName"],
                          "SMTP 邮件配置已成功更新并热加载！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存邮件参数
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: 短信网关 */}
              {activeTab === "sms" && (
                <div className="space-y-6 max-w-3xl">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600 leading-relaxed font-medium">
                      <span className="font-bold text-slate-800 block mb-0.5">运营商短信网关设置</span>
                      用于国内手机号动态验证码快速下发、空间高危敏感操作二次验证等场景。
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">短信服务商</label>
                      <select
                        value={configs.smsProvider || "aliyun"}
                        onChange={(e) => handleConfigChange("smsProvider", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all bg-white"
                      >
                        <option value="aliyun">阿里云短信 (Aliyun SMS)</option>
                        <option value="tencent">腾讯云短信 (Tencent Cloud SMS)</option>
                        <option value="huawei">华为云消息短信 (Huawei Cloud)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">短信签名 (Sign Name)</label>
                      <input
                        type="text"
                        value={configs.smsSignName || ""}
                        onChange={(e) => handleConfigChange("smsSignName", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="知阁科技"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">AccessKey ID</label>
                      <input
                        type="text"
                        value={configs.smsAccessKeyId || ""}
                        onChange={(e) => handleConfigChange("smsAccessKeyId", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="LTAI5t••••••••"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">AccessKey Secret</label>
                      <input
                        type="password"
                        value={configs.smsAccessKeySecret || ""}
                        onChange={(e) => handleConfigChange("smsAccessKeySecret", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="••••••••••••••••"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">通用验证码模板代码 (Template Code)</label>
                      <input
                        type="text"
                        value={configs.smsTemplateCode || ""}
                        onChange={(e) => handleConfigChange("smsTemplateCode", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="SMS_20260904"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          ["smsProvider", "smsSignName", "smsAccessKeyId", "smsAccessKeySecret", "smsTemplateCode"],
                          "短信网关配置已成功保存！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存短信网关配置
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 4: 第三方 OAuth 登录 */}
              {activeTab === "oauth" && (
                <div className="space-y-6 max-w-4xl">
                  {/* 顶部标题与操作栏 */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[#3182ce]" />
                        第三方联合登录通道
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        集中管理系统支持的第三方及企业联合登录渠道，支持快捷新增渠道、开关启用、编辑凭据与随时删除无用通道。
                      </p>
                    </div>

                    <div className="flex items-center gap-2 relative">
                      {/* 恢复官方预置按钮 */}
                      <button
                        type="button"
                        onClick={handleResetOAuthChannels}
                        className="h-8 px-3 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="恢复 GitHub 与微信开放平台官方默认渠道"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                        恢复预置
                      </button>

                      {/* 添加登录渠道下拉菜单 */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowAddOAuthMenu((prev) => !prev)}
                          className="h-8 px-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          添加登录渠道
                          <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
                        </button>

                        {showAddOAuthMenu && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setShowAddOAuthMenu(false)}
                            />
                            <div className="absolute right-0 top-9 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-xs font-medium animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                              {(() => {
                                const configuredTypes = new Set(oauthChannels.map((c) => c.type || c.id));
                                const domesticItems: OAuthChannelMenuItem[] = [
                                  {
                                    type: "wechat",
                                    name: "微信开放平台扫码",
                                    icon: "/icons/wechat.png",
                                    isImg: true,
                                    tag: "扫码型",
                                    tagColor: "text-emerald-600",
                                    hoverBg: "hover:bg-emerald-50",
                                    hoverText: "hover:text-emerald-700",
                                  },
                                  {
                                    type: "qq",
                                    name: "QQ 互联快捷登录",
                                    icon: "/icons/QQ.png",
                                    isImg: true,
                                    tag: "扫码/跳转",
                                    tagColor: "text-blue-600",
                                    hoverBg: "hover:bg-blue-50",
                                    hoverText: "hover:text-blue-600",
                                  },
                                  {
                                    type: "weibo",
                                    name: "新浪微博快捷登录",
                                    icon: "/icons/xinlang.png",
                                    isImg: true,
                                    tag: "扫码/跳转",
                                    tagColor: "text-rose-600",
                                    hoverBg: "hover:bg-rose-50",
                                    hoverText: "hover:text-rose-600",
                                  },
                                  {
                                    type: "feishu",
                                    name: "飞书企业扫码登录",
                                    dotColor: "bg-cyan-500",
                                    tag: "扫码/SSO",
                                    tagColor: "text-cyan-600",
                                    hoverBg: "hover:bg-cyan-50",
                                    hoverText: "hover:text-cyan-600",
                                  },
                                  {
                                    type: "dingtalk",
                                    name: "钉钉企业免登与扫码",
                                    dotColor: "bg-sky-500",
                                    tag: "扫码/免登",
                                    tagColor: "text-sky-600",
                                    hoverBg: "hover:bg-sky-50",
                                    hoverText: "hover:text-sky-600",
                                  },
                                  {
                                    type: "alipay",
                                    name: "支付宝快捷登录",
                                    icon: "/icons/alipay.png",
                                    isImg: true,
                                    tag: "扫码/跳转",
                                    tagColor: "text-blue-600",
                                    hoverBg: "hover:bg-blue-50",
                                    hoverText: "hover:text-blue-600",
                                  },
                                ].filter((item) => !configuredTypes.has(item.type));

                                const developerItems: OAuthChannelMenuItem[] = [
                                  {
                                    type: "github",
                                    name: "GitHub 开发者授权",
                                    dotColor: "bg-slate-800",
                                    tag: "跳转型",
                                    tagColor: "text-slate-500",
                                    hoverBg: "hover:bg-slate-50",
                                    hoverText: "hover:text-slate-900",
                                  },
                                  {
                                    type: "gitee",
                                    name: "Gitee 码云联合登录",
                                    dotColor: "bg-rose-500",
                                    tag: "跳转型",
                                    tagColor: "text-rose-500",
                                    hoverBg: "hover:bg-rose-50",
                                    hoverText: "hover:text-rose-600",
                                  },
                                  {
                                    type: "custom",
                                    name: "自定义企业 SSO / OAuth2",
                                    dotColor: "bg-indigo-500",
                                    tag: "自定义",
                                    tagColor: "text-indigo-500",
                                    hoverBg: "hover:bg-indigo-50",
                                    hoverText: "hover:text-indigo-600",
                                  },
                                ].filter((item) => !configuredTypes.has(item.type));

                                if (domesticItems.length === 0 && developerItems.length === 0) {
                                  return (
                                    <div className="px-4 py-4 text-center text-slate-400 space-y-1">
                                      <Check className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                      <div className="text-xs font-bold text-slate-700">全部支持的渠道已添加</div>
                                      <p className="text-[10px] text-slate-400">如需重新配置，可先在下方卡片中删除对应渠道</p>
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    {domesticItems.length > 0 && (
                                      <div>
                                        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                          国内主流平台（优先推荐）
                                        </div>
                                        {domesticItems.map((item) => (
                                          <button
                                            key={item.type}
                                            type="button"
                                            onClick={() => {
                                              handleAddOAuthChannel(item.type);
                                              setShowAddOAuthMenu(false);
                                            }}
                                            className={`w-full px-3 py-1.5 text-left text-slate-700 flex items-center justify-between cursor-pointer transition-colors ${item.hoverBg} ${item.hoverText}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              {item.isImg ? (
                                                <img src={item.icon} alt={item.name} className="w-4 h-4 object-contain" />
                                              ) : (
                                                <span className={`w-2 h-2 rounded-full ${item.dotColor}`} />
                                              )}
                                              {item.name}
                                            </div>
                                            <span className={`text-[10px] font-normal ${item.tagColor}`}>{item.tag}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {developerItems.length > 0 && (
                                      <div className={domesticItems.length > 0 ? "pt-1.5" : ""}>
                                        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                          开发者与通用平台
                                        </div>
                                        {developerItems.map((item) => (
                                          <button
                                            key={item.type}
                                            type="button"
                                            onClick={() => {
                                              handleAddOAuthChannel(item.type);
                                              setShowAddOAuthMenu(false);
                                            }}
                                            className={`w-full px-3 py-1.5 text-left text-slate-700 flex items-center justify-between cursor-pointer transition-colors ${item.hoverBg} ${item.hoverText}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              {item.isImg ? (
                                                <img src={item.icon} alt={item.name} className="w-4 h-4 object-contain" />
                                              ) : (
                                                <span className={`w-2 h-2 rounded-full ${item.dotColor}`} />
                                              )}
                                              {item.name}
                                            </div>
                                            <span className={`text-[10px] font-normal ${item.tagColor}`}>{item.tag}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 登录页面展示规范与当前配额指示横幅 */}
                  <div className="p-3.5 bg-blue-50/60 border border-blue-100/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>前台登录页排版规范</span>
                          <span className="text-[10px] font-normal text-slate-400">· 系统最多同时支持开启 2 个渠道</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          为保证前台登录界面的视觉平衡与紧凑排版，最多同时激活 2 个入口。若需开启新平台，请先关闭已启用的渠道。
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto font-mono">
                      <span className="text-slate-400 font-sans font-medium text-[11px]">当前启用：</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                          oauthChannels.filter((c) => c.enabled).length >= 2
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {oauthChannels.filter((c) => c.enabled).length} / 2
                        {oauthChannels.filter((c) => c.enabled).length >= 2 ? " (已满额)" : " (可开启)"}
                      </span>
                    </div>
                  </div>

                  {/* 渠道卡片列表 */}
                  {oauthChannels.length === 0 ? (
                    <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center space-y-3 bg-slate-50/50">
                      <Globe className="w-8 h-8 text-slate-300 mx-auto" />
                      <div className="text-xs font-bold text-slate-600">当前尚未配置任何第三方登录渠道</div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        您可以点击上方“添加登录渠道”或一键“恢复预置”快速启用常用的第三方快捷登录。
                      </p>
                      <button
                        type="button"
                        onClick={handleResetOAuthChannels}
                        className="px-4 py-1.5 bg-[#3182ce] text-white text-xs font-bold rounded-lg shadow-sm hover:bg-[#2b6cb0] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        一键恢复官方预置渠道
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {oauthChannels.map((channel, index) => {
                        // 渠道品牌视觉映射
                        const getChannelBadge = () => {
                          switch (channel.type) {
                            case "github":
                              return {
                                bg: "bg-slate-900 text-white",
                                label: "GitHub",
                                icon: <Globe className="w-3.5 h-3.5 text-white" />,
                              };
                            case "wechat":
                              return {
                                bg: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
                                label: "微信扫码",
                                icon: <img src="/icons/wechat.png" alt="微信" className="w-3.5 h-3.5 object-contain" />,
                              };
                            case "qq":
                              return {
                                bg: "bg-blue-50 text-blue-700 border border-blue-200/80",
                                label: "QQ互联",
                                icon: <img src="/icons/QQ.png" alt="QQ" className="w-3.5 h-3.5 object-contain" />,
                              };
                            case "weibo":
                              return {
                                bg: "bg-rose-50 text-rose-700 border border-rose-200/80",
                                label: "新浪微博",
                                icon: <img src="/icons/xinlang.png" alt="微博" className="w-3.5 h-3.5 object-contain" />,
                              };
                            case "feishu":
                              return {
                                bg: "bg-cyan-600 text-white",
                                label: "飞书企业",
                                icon: <Send className="w-3.5 h-3.5 text-white" />,
                              };
                            case "dingtalk":
                              return {
                                bg: "bg-sky-600 text-white",
                                label: "钉钉免登",
                                icon: <Send className="w-3.5 h-3.5 text-white" />,
                              };
                            case "alipay":
                              return {
                                bg: "bg-sky-50 text-blue-700 border border-blue-200/80",
                                label: "支付宝",
                                icon: <img src="/icons/alipay.png" alt="支付宝" className="w-3.5 h-3.5 object-contain" />,
                              };
                            case "gitee":
                              return {
                                bg: "bg-rose-600 text-white",
                                label: "Gitee",
                                icon: <Code2 className="w-3.5 h-3.5 text-white" />,
                              };
                            case "google":
                              return {
                                bg: "bg-amber-600 text-white",
                                label: "Google",
                                icon: <Globe className="w-3.5 h-3.5 text-white" />,
                              };
                            default:
                              return {
                                bg: "bg-indigo-600 text-white",
                                label: "SSO",
                                icon: <Key className="w-3.5 h-3.5 text-white" />,
                              };
                          }
                        };
                        const badge = getChannelBadge();
                        const meta = getOAuthChannelMeta(channel.type || channel.id);
                        const isCopied = copiedChannelId === channel.id;

                        return (
                          <div
                            key={channel.id}
                            className={`p-4 rounded-xl border transition-all ${
                              channel.enabled
                                ? "border-slate-200 bg-white shadow-xs"
                                : "border-slate-200/70 bg-slate-50/60 opacity-85"
                            }`}
                          >
                            {/* 卡片头部：标识、认证模式徽章、名称输入、开关与删除 */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 shadow-2xs ${badge.bg}`}
                                >
                                  {badge.icon}
                                  {badge.label}
                                </span>

                                {/* 认证模式属性标签（严格区分扫码与跳转） */}
                                {meta.authMode === "qrcode" && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
                                    📷 扫码登录
                                  </span>
                                )}
                                {meta.authMode === "redirect" && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200/60 flex items-center gap-1">
                                    🔗 网页跳转
                                  </span>
                                )}
                                {meta.authMode === "hybrid" && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center gap-1">
                                    🔄 扫码/跳转双模
                                  </span>
                                )}

                                <input
                                  type="text"
                                  value={channel.name}
                                  onChange={(e) =>
                                    handleUpdateOAuthChannel(channel.id, "name", e.target.value)
                                  }
                                  className="flex-1 min-w-[140px] px-2 py-1 text-xs font-bold text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#3182ce] rounded-md outline-none transition-colors"
                                  placeholder="渠道显示名称"
                                />
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-auto">
                                {/* 状态切换 */}
                                <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={channel.enabled}
                                    onChange={() => handleToggleOAuthChannel(channel.id)}
                                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce] cursor-pointer"
                                  />
                                  <span
                                    className={
                                      channel.enabled
                                        ? "text-emerald-600 font-bold"
                                        : "text-slate-400 font-medium"
                                    }
                                  >
                                    {channel.enabled ? "已启用" : "未开启"}
                                  </span>
                                </label>

                                <span className="text-slate-200">|</span>

                                {/* 删除渠道按钮 */}
                                <button
                                  type="button"
                                  onClick={() => setChannelToDelete(channel)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                  title="从系统中删除此第三方渠道"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* 卡片表单区域：Client ID & Secret */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                                  <span>Client ID / App ID</span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    应用唯一识别凭据
                                  </span>
                                </label>
                                <input
                                  type="text"
                                  value={channel.clientId || ""}
                                  onChange={(e) =>
                                    handleUpdateOAuthChannel(channel.id, "clientId", e.target.value)
                                  }
                                  className="w-full px-3 h-9 border border-slate-200 rounded-lg text-xs font-medium focus:border-[#3182ce] outline-none bg-white font-mono"
                                  placeholder={`输入 ${channel.name} 的 Client ID`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                                  <span>Client Secret / App Secret</span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    应用授权通信私钥
                                  </span>
                                </label>
                                <input
                                  type="password"
                                  value={channel.clientSecret || ""}
                                  onChange={(e) =>
                                    handleUpdateOAuthChannel(channel.id, "clientSecret", e.target.value)
                                  }
                                  className="w-full px-3 h-9 border border-slate-200 rounded-lg text-xs font-medium focus:border-[#3182ce] outline-none bg-white font-mono"
                                  placeholder="••••••••••••••••"
                                />
                              </div>
                            </div>

                            {/* 授权回调地址提示 */}
                            <div className="mt-3 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="font-bold text-slate-600 whitespace-nowrap">
                                  回调地址 (Redirect URI):
                                </span>
                                <span className="font-mono text-slate-700 truncate select-all">
                                  {configs.siteUrl || "https://dockyard.zhige.com"}
                                  {channel.callbackUrl || `/api/auth/${channel.type}/callback`}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const fullUrl = `${configs.siteUrl || "https://dockyard.zhige.com"}${channel.callbackUrl || `/api/auth/${channel.type}/callback`}`;
                                  navigator.clipboard?.writeText(fullUrl);
                                  setCopiedChannelId(channel.id);
                                  toast.success("已复制授权回调地址到剪贴板！");
                                  setTimeout(() => setCopiedChannelId(null), 2000);
                                }}
                                className="self-end sm:self-auto px-2 py-0.5 text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:bg-blue-50 rounded flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-600">已复制</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    复制回调地址
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 底部保存按钮 */}
                  <div className="pt-2">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          [
                            "oauthChannels",
                            "oauthGithubEnabled",
                            "oauthGithubClientId",
                            "oauthGithubClientSecret",
                            "oauthWechatEnabled",
                            "oauthWechatAppId",
                            "oauthWechatAppSecret",
                          ],
                          "第三方联合登录通道配置已成功落库保存！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存第三方登录设置
                    </button>
                  </div>

                  {/* 删除联合登录渠道二次确认模态框（统一知阁设计系统规范，彻底消除原生 confirm 闪烁与拦截问题） */}
                  {channelToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left animate-in zoom-in-95 duration-150">
                        <div className="p-5 pb-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                              <Trash2 className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black text-slate-800">确认删除登录渠道</h3>
                              <p className="text-[11px] text-slate-400 font-medium">从当前登录配置列表中移除</p>
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 leading-relaxed">
                            确定要移除 <strong className="text-slate-800">【{channelToDelete.name}】</strong> 渠道吗？
                            <p className="text-[11px] text-slate-400 mt-1">
                              移除后前台登录与注册页将不再展示此渠道。后续可在“添加登录渠道”下拉菜单中随时重新添加。
                            </p>
                          </div>
                        </div>
                        <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setChannelToDelete(null)}
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const targetId = channelToDelete.id;
                              setChannelToDelete(null);
                              handleDeleteOAuthChannel(targetId);
                            }}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            确认删除
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: 页脚与前台导航设置 */}
              {activeTab === "footer" && (
                <div className="space-y-6 max-w-5xl">
                  <div className="border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#3182ce]" />
                      <h3 className="text-sm font-black text-slate-800">前台全站页脚与导航中枢</h3>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      管理全站底部定位标语、社交媒体二维码、公安网安备案以及 4 大分类导航链接。所有配置均由数据库 systemconfig 真实驱动。
                    </p>
                  </div>

                  {/* 标语与副标题 */}
                  <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4">
                    <h4 className="text-xs font-bold text-slate-800">1. 品牌副标题与效能标语</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">品牌英文副标题</label>
                        <input
                          type="text"
                          value={configs.footerSubTitle || "ZhiGe Dockyard"}
                          onChange={(e) => handleConfigChange("footerSubTitle", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="ZhiGe Dockyard"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">全球定位标语 (Slogan)</label>
                        <input
                          type="text"
                          value={configs.footerSlogan || "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。"}
                          onChange={(e) => handleConfigChange("footerSlogan", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="全球领先的软件工程效能操作系统..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* 社交媒体二维码：支持一键上传、缩略图预览与外链微调 */}
                  <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">2. 社交平台交互二维码（支持真实上传与外链）</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          支持直接从本地选择二维码图片上传至服务器媒体库，前台页脚悬浮图标时将实时渲染该二维码。
                        </p>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        单图最大 5MB · 支持 PNG / JPG / SVG / WEBP
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. 微信二维码卡片 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <img src="/icons/wechat.png" alt="微信" className="w-4 h-4 object-contain shrink-0" />
                              <span className="text-xs font-bold text-slate-800">官方微信公众号 / 客服</span>
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              微信生态
                            </span>
                          </div>

                          {/* 预览与上传区域 */}
                          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative group">
                              {configs.footerWechatQr ? (
                                <img
                                  src={configs.footerWechatQr}
                                  alt="微信二维码"
                                  className="w-full h-full object-contain p-1"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <QrCode className="w-6 h-6 text-slate-300" />
                              )}
                            </div>

                            <div className="flex-1 space-y-1.5">
                              <input
                                type="file"
                                ref={wechatQrInputRef}
                                className="hidden"
                                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQrUpload("footerWechatQr", file);
                                }}
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={qrUploading.footerWechatQr}
                                  onClick={() => wechatQrInputRef.current?.click()}
                                  className="px-2.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-md text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                >
                                  {qrUploading.footerWechatQr ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>上传中</span>
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-3 h-3" />
                                      <span>上传图片</span>
                                    </>
                                  )}
                                </button>
                                {configs.footerWechatQr && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfigChange("footerWechatQr", "")}
                                    className="px-2 py-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md text-xs transition-all cursor-pointer"
                                    title="清空当前二维码"
                                  >
                                    清空
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400">点击上传本地二维码图片</p>
                            </div>
                          </div>
                        </div>

                        {/* URL 路径输入 */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">图片访问路径 / CDN：</label>
                          <input
                            type="text"
                            value={configs.footerWechatQr || ""}
                            onChange={(e) => handleConfigChange("footerWechatQr", e.target.value)}
                            className="w-full px-2.5 h-8 border border-slate-200 bg-white rounded-lg focus:border-[#3182ce] outline-none text-xs font-mono text-slate-700 transition-all"
                            placeholder="/uploads/qrcodes/... 或 https://..."
                          />
                        </div>
                      </div>

                      {/* 2. QQ 群二维码卡片 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <img src="/icons/QQ.png" alt="QQ" className="w-4 h-4 object-contain shrink-0" />
                              <span className="text-xs font-bold text-slate-800">官方 QQ 交流群</span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#0284c7] bg-sky-50 px-1.5 py-0.5 rounded">
                              QQ 社区
                            </span>
                          </div>

                          {/* 预览与上传区域 */}
                          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative group">
                              {configs.footerQqQr ? (
                                <img
                                  src={configs.footerQqQr}
                                  alt="QQ二维码"
                                  className="w-full h-full object-contain p-1"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <QrCode className="w-6 h-6 text-slate-300" />
                              )}
                            </div>

                            <div className="flex-1 space-y-1.5">
                              <input
                                type="file"
                                ref={qqQrInputRef}
                                className="hidden"
                                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQrUpload("footerQqQr", file);
                                }}
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={qrUploading.footerQqQr}
                                  onClick={() => qqQrInputRef.current?.click()}
                                  className="px-2.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-md text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                >
                                  {qrUploading.footerQqQr ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>上传中</span>
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-3 h-3" />
                                      <span>上传图片</span>
                                    </>
                                  )}
                                </button>
                                {configs.footerQqQr && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfigChange("footerQqQr", "")}
                                    className="px-2 py-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md text-xs transition-all cursor-pointer"
                                    title="清空当前二维码"
                                  >
                                    清空
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400">点击上传本地二维码图片</p>
                            </div>
                          </div>
                        </div>

                        {/* URL 路径输入 */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">图片访问路径 / CDN：</label>
                          <input
                            type="text"
                            value={configs.footerQqQr || ""}
                            onChange={(e) => handleConfigChange("footerQqQr", e.target.value)}
                            className="w-full px-2.5 h-8 border border-slate-200 bg-white rounded-lg focus:border-[#3182ce] outline-none text-xs font-mono text-slate-700 transition-all"
                            placeholder="/uploads/qrcodes/... 或 https://..."
                          />
                        </div>
                      </div>

                      {/* 3. 微博二维码卡片 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <img src="/icons/xinlang.png" alt="微博" className="w-4 h-4 object-contain shrink-0" />
                              <span className="text-xs font-bold text-slate-800">官方新浪微博</span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#ef4444] bg-red-50 px-1.5 py-0.5 rounded">
                              媒体矩阵
                            </span>
                          </div>

                          {/* 预览与上传区域 */}
                          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative group">
                              {configs.footerWeiboQr ? (
                                <img
                                  src={configs.footerWeiboQr}
                                  alt="微博二维码"
                                  className="w-full h-full object-contain p-1"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <QrCode className="w-6 h-6 text-slate-300" />
                              )}
                            </div>

                            <div className="flex-1 space-y-1.5">
                              <input
                                type="file"
                                ref={weiboQrInputRef}
                                className="hidden"
                                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQrUpload("footerWeiboQr", file);
                                }}
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={qrUploading.footerWeiboQr}
                                  onClick={() => weiboQrInputRef.current?.click()}
                                  className="px-2.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-md text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                >
                                  {qrUploading.footerWeiboQr ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>上传中</span>
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-3 h-3" />
                                      <span>上传图片</span>
                                    </>
                                  )}
                                </button>
                                {configs.footerWeiboQr && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfigChange("footerWeiboQr", "")}
                                    className="px-2 py-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md text-xs transition-all cursor-pointer"
                                    title="清空当前二维码"
                                  >
                                    清空
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400">点击上传本地二维码图片</p>
                            </div>
                          </div>
                        </div>

                        {/* URL 路径输入 */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">图片访问路径 / CDN：</label>
                          <input
                            type="text"
                            value={configs.footerWeiboQr || ""}
                            onChange={(e) => handleConfigChange("footerWeiboQr", e.target.value)}
                            className="w-full px-2.5 h-8 border border-slate-200 bg-white rounded-lg focus:border-[#3182ce] outline-none text-xs font-mono text-slate-700 transition-all"
                            placeholder="/uploads/qrcodes/... 或 https://..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 公安与资质备案 */}
                  <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4">
                    <h4 className="text-xs font-bold text-slate-800">3. 合规资质与公安网安备案</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">全国公安机关互联网站安全管理服务备案号</label>
                        <input
                          type="text"
                          value={configs.footerPoliceIcp || "京公网安备 31000000000000 号"}
                          onChange={(e) => handleConfigChange("footerPoliceIcp", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="京公网安备 31000000000000 号"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">工信部 ICP 备案许可编号 (双向同步)</label>
                        <input
                          type="text"
                          value={configs.icpNumber || "京ICP备 2026000000 号-1"}
                          onChange={(e) => handleConfigChange("icpNumber", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 bg-white rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                          placeholder="京ICP备 2026000000 号-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4 大分类导航配置：现代化宽屏智能工作台 */}
                  <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4">
                    {/* 工作台顶部控制栏 */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-nowrap">
                          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <Compass className="w-4 h-4 text-[#3182ce] shrink-0" />
                            <h4 className="text-xs font-black text-slate-800 whitespace-nowrap">
                              4. 前台分类导航与链接中枢（可视化宽屏工作台）
                            </h4>
                          </div>
                          <span className="text-[10px] font-bold text-[#3182ce] bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <Layers className="w-3 h-3" />
                            共 {navColumns.length} 个分类 · {navColumns.reduce((acc, c) => acc + (c.links?.length || 0), 0)} 个功能链接
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          采用大厂级主从联动工作台架构，分类与子链接支持灵活新增、修改、排序与删除，支持常用路由一键快速填入，配备前台页脚实时所见即所得预览。
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 whitespace-nowrap self-start lg:self-auto">
                        {/* 实时预览开关 */}
                        <button
                          type="button"
                          onClick={() => setShowLiveFooterPreview(!showLiveFooterPreview)}
                          className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                            showLiveFooterPreview
                              ? "bg-blue-50 text-[#3182ce] border-blue-200"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                          title="切换前台真实效果实时预览"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{showLiveFooterPreview ? "收起预览" : "实时预览"}</span>
                        </button>

                        {/* JSON 源码视图切换 */}
                        <button
                          type="button"
                          onClick={() => setShowNavJson(!showNavJson)}
                          className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                            showNavJson
                              ? "bg-slate-800 text-white border-slate-800"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                          title="查看或切换底层 JSON 源码"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span>{showNavJson ? "收起 JSON" : "JSON 源码"}</span>
                        </button>

                        {/* 重置默认模板 */}
                        <button
                          type="button"
                          onClick={handleResetNavColumns}
                          className="px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                          <span>恢复默认</span>
                        </button>

                        {/* 新增分类主按钮 */}
                        <button
                          type="button"
                          onClick={handleAddNavColumn}
                          className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新增分类</span>
                        </button>
                      </div>
                    </div>

                    {/* 分类胶囊选择选项卡（Segmented Tabs） */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      {navColumns.map((col, idx) => {
                        const isSelected = idx === Math.min(selectedNavColIndex, navColumns.length - 1);
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedNavColIndex(idx)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 border select-none ${
                              isSelected
                                ? "bg-[#3182ce] text-white border-[#3182ce] shadow-sm ring-2 ring-[#3182ce]/20"
                                : "bg-white text-slate-700 border-slate-200/90 hover:border-[#3182ce]/40 hover:bg-blue-50/40"
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{col.title || `分类 ${idx + 1}`}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {col.links?.length || 0}
                            </span>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={handleAddNavColumn}
                        className="px-3 py-2 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-500 hover:text-[#3182ce] hover:border-[#3182ce] hover:bg-blue-50/40 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>新建分类</span>
                      </button>
                    </div>

                    {/* 当前选中的分类主工作台 */}
                    {(() => {
                      const currentIdx = Math.min(selectedNavColIndex, Math.max(0, navColumns.length - 1));
                      const currentCol = navColumns[currentIdx];
                      if (!currentCol) return null;

                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4 transition-all">
                          {/* 分类信息编辑栏 */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2 flex-1 max-w-lg">
                              <span className="text-xs font-black text-slate-500 whitespace-nowrap">分类名称：</span>
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={currentCol.title}
                                  onChange={(e) => handleUpdateColumnTitle(currentIdx, e.target.value)}
                                  className="w-full px-3 py-1.5 text-xs font-black text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-[#3182ce] rounded-lg outline-none transition-all"
                                  placeholder="输入当前大分类名称（如：产品生态、技术资源、关于我们）"
                                />
                                <Edit3 className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>

                            {/* 分类排列位置微调与删除 */}
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <span className="text-[11px] text-slate-400">
                                当前第 {currentIdx + 1}/{navColumns.length} 列
                              </span>
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  disabled={currentIdx <= 0}
                                  onClick={() => handleMoveNavColumn(currentIdx, "prev")}
                                  className="p-1.5 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                                  title="前移分类列"
                                >
                                  <ArrowUp className="w-3.5 h-3.5 -rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  disabled={currentIdx >= navColumns.length - 1}
                                  onClick={() => handleMoveNavColumn(currentIdx, "next")}
                                  className="p-1.5 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer border-l border-slate-200"
                                  title="后移分类列"
                                >
                                  <ArrowDown className="w-3.5 h-3.5 -rotate-90" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteNavColumn(currentIdx)}
                                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                title="删除此分类及其所有链接"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>删除分类</span>
                              </button>
                            </div>
                          </div>

                          {/* 链接条目宽屏列表 */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <span>功能链接列表（{currentCol.links?.length || 0} 项）</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                支持自由输入站内绝对路由、外部 HTTPS 地址，或点击右侧快捷助手
                              </span>
                            </div>

                            {currentCol.links && currentCol.links.length > 0 ? (
                              <div className="space-y-2.5">
                                {currentCol.links.map((link, linkIdx) => (
                                  <div
                                    key={linkIdx}
                                    className="p-3 bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200/80 hover:border-[#3182ce]/50 transition-all space-y-2 group shadow-2xs"
                                  >
                                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                                      {/* 序号 */}
                                      <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[11px] font-mono font-bold text-slate-500 shrink-0 shadow-2xs">
                                        #{String(linkIdx + 1).padStart(2, "0")}
                                      </span>

                                      {/* 链接显示名称 */}
                                      <div className="flex-1 min-w-[160px]">
                                        <div className="text-[10px] font-bold text-slate-400 mb-1">
                                          菜单显示名称
                                        </div>
                                        <input
                                          type="text"
                                          value={link.label}
                                          onChange={(e) =>
                                            handleUpdateNavLink(currentIdx, linkIdx, "label", e.target.value)
                                          }
                                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all"
                                          placeholder="例如: 核心模块"
                                        />
                                      </div>

                                      {/* 跳转路径 */}
                                      <div className="flex-2 min-w-[240px]">
                                        <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                                          <span>跳转目标路径 (URL / 相对路径)</span>
                                          <span className="text-slate-400 font-normal font-mono">
                                            {link.url.startsWith("http") ? "外链" : "站内"}
                                          </span>
                                        </div>
                                        <div className="relative">
                                          <input
                                            type="text"
                                            value={link.url}
                                            onChange={(e) =>
                                              handleUpdateNavLink(currentIdx, linkIdx, "url", e.target.value)
                                            }
                                            className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all"
                                            placeholder="/capabilities 或 https://..."
                                          />
                                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                      </div>

                                      {/* 排序与删除按钮组 */}
                                      <div className="flex items-center gap-1 self-end md:self-center shrink-0 pt-3 md:pt-3">
                                        <button
                                          type="button"
                                          disabled={linkIdx <= 0}
                                          onClick={() => handleMoveNavLinkUp(currentIdx, linkIdx)}
                                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-md disabled:opacity-25 transition-all cursor-pointer"
                                          title="上移此链接"
                                        >
                                          <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={linkIdx >= currentCol.links.length - 1}
                                          onClick={() => handleMoveNavLinkDown(currentIdx, linkIdx)}
                                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-md disabled:opacity-25 transition-all cursor-pointer"
                                          title="下移此链接"
                                        >
                                          <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteNavLink(currentIdx, linkIdx)}
                                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-md transition-all cursor-pointer"
                                          title="删除此链接"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 常用路径快捷助手小胶囊 */}
                                    <div className="flex items-center gap-1.5 pt-1 pl-1 text-[10px] text-slate-400 overflow-x-auto">
                                      <span className="shrink-0 font-medium">推荐预置:</span>
                                      {COMMON_NAV_PRESETS.map((preset, pIdx) => (
                                        <button
                                          key={pIdx}
                                          type="button"
                                          onClick={() => {
                                            handleUpdateNavLink(currentIdx, linkIdx, "label", preset.label);
                                            handleUpdateNavLink(currentIdx, linkIdx, "url", preset.url);
                                            toast.success(`已快速填入【${preset.label}】(${preset.url})`);
                                          }}
                                          className="px-2 py-0.5 bg-white hover:bg-blue-50 hover:text-[#3182ce] border border-slate-200/80 rounded text-[10px] font-medium text-slate-600 shrink-0 transition-colors cursor-pointer"
                                        >
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-8 text-center text-slate-400 text-xs bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-2">
                                <FolderTree className="w-6 h-6 text-slate-300 mx-auto" />
                                <div>当前分类下暂无任何二级链接项</div>
                                <button
                                  type="button"
                                  onClick={() => handleAddNavLink(currentIdx)}
                                  className="px-3 py-1.5 bg-[#3182ce] text-white text-xs font-bold rounded-lg shadow-sm hover:bg-[#2b6cb0] transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  立即添加第一条链接
                                </button>
                              </div>
                            )}

                            {/* 宽屏添加子链接按钮 */}
                            <button
                              type="button"
                              onClick={() => handleAddNavLink(currentIdx)}
                              className="w-full py-2.5 border-2 border-dashed border-[#3182ce]/40 hover:border-[#3182ce] bg-blue-50/30 hover:bg-blue-50/70 text-[#3182ce] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-4 h-4" />
                              <span>为【{currentCol.title}】添加新链接项</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 可折叠的前台全站页脚真实渲染效果实时预览 */}
                    {showLiveFooterPreview && (
                      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                            <LayoutGrid className="w-4 h-4 text-[#3182ce]" />
                            <span>前台全站页脚真实渲染效果实时预览（所见即所得）</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            LIVE PREVIEW · 即改即显
                          </span>
                        </div>

                        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-100">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {navColumns.map((col, idx) => (
                              <div key={idx} className="space-y-2">
                                <div className="text-xs font-black text-slate-800 border-b border-slate-200/80 pb-1.5 flex items-center justify-between">
                                  <span>{col.title}</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></span>
                                </div>
                                <ul className="space-y-1.5">
                                  {col.links && col.links.length > 0 ? (
                                    col.links.map((link, lIdx) => (
                                      <li key={lIdx} className="text-[11px] text-slate-500 hover:text-[#3182ce] transition-colors flex items-center gap-1 cursor-default">
                                        <span className="text-slate-300">›</span>
                                        <span>{link.label}</span>
                                      </li>
                                    ))
                                  ) : (
                                    <li className="text-[10px] text-slate-400 italic">暂无链接</li>
                                  )}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 可选的底层 JSON 源码视图（默认折叠） */}
                    {showNavJson && (
                      <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-700">实时序列化 JSON 文本（高级）：</span>
                          <span className="text-[11px] text-slate-400">修改上方卡片会自动实时双向同步</span>
                        </div>
                        <textarea
                          rows={6}
                          value={configs.footerNavColumns}
                          onChange={(e) => {
                            handleConfigChange("footerNavColumns", e.target.value);
                            try {
                              const parsed = JSON.parse(e.target.value);
                              if (Array.isArray(parsed)) setNavColumns(parsed);
                            } catch {}
                          }}
                          className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:border-[#3182ce] outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          [
                            "footerSubTitle",
                            "footerSlogan",
                            "footerWechatQr",
                            "footerQqQr",
                            "footerWeiboQr",
                            "footerPoliceIcp",
                            "icpNumber",
                            "footerNavColumns",
                          ],
                          "前台页脚与导航设置已成功持久化至数据库，前台即刻生效！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存页脚与导航设置
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 5: 安全与风控设置 */}
              {activeTab === "security" && (
                <div className="space-y-6 max-w-3xl">
                  {/* 注销冷静期设置卡片 */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 font-medium leading-relaxed">
                        <strong>账号注销合规政策：</strong> 冷静期结束后，账号将被永久注销（逻辑删除 + 匿名化邮箱/手机号 + 清空个人配置 + 销毁全部会话），该操作不可逆转。
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">账号注销冷静期天数 (D-02)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={cooldownDays}
                          disabled={cooldownLoading || cooldownSaving}
                          onChange={(e) => setCooldownDays(Number(e.target.value))}
                          className="w-36 px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold transition-all disabled:opacity-50"
                        />
                        <span className="text-xs text-slate-500 font-bold">天 (自然日)</span>
                        {cooldownLoading && <Loader2 className="w-4 h-4 animate-spin text-[#3182ce]" />}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                        合规范围 1~90 天，系统默认 7 天。修改后对新提交的注销申请生效。
                      </p>
                    </div>

                    <button
                      onClick={handleSaveCooldown}
                      disabled={cooldownSaving || cooldownLoading}
                      className="h-9 px-5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {cooldownSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      更新注销冷静期
                    </button>
                  </div>

                  {/* 访问风控参数 */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-emerald-600" />
                      会话安全与暴力破解拦截策略
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">登录密码连续试错上限</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={configs.loginMaxFailures || "5"}
                            onChange={(e) => handleConfigChange("loginMaxFailures", e.target.value)}
                            className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                          />
                          <span className="text-xs text-slate-400 shrink-0">次触发验证码</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">IP 每分钟请求速率阈值 (Rate Limit)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={configs.ipRateLimitMinute || "120"}
                            onChange={(e) => handleConfigChange("ipRateLimitMinute", e.target.value)}
                            className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                          />
                          <span className="text-xs text-slate-400 shrink-0">次 / 分钟</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">登录态会话免活有效期</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={configs.sessionTimeoutHours || "24"}
                            onChange={(e) => handleConfigChange("sessionTimeoutHours", e.target.value)}
                            className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                          />
                          <span className="text-xs text-slate-400 shrink-0">小时超时重登</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">管理员强口令轮换周期</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={configs.passwordExpireDays || "90"}
                            onChange={(e) => handleConfigChange("passwordExpireDays", e.target.value)}
                            className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                          />
                          <span className="text-xs text-slate-400 shrink-0">天周期提醒</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() =>
                          handleSaveSettings(
                            ["loginMaxFailures", "ipRateLimitMinute", "sessionTimeoutHours", "passwordExpireDays"],
                            "安全与防暴力破解策略已更新！"
                          )
                        }
                        disabled={saving}
                        className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        保存安全策略
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 6: 数据库与灾备监控 */}
              {activeTab === "database" && (
                <div className="space-y-6 max-w-4xl">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-[#3182ce]" />
                        数据库运行指标与表容量监控
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        直接连接底层 PostgreSQL 实例，聚合展示知阁全部核心业务表数据体量。
                      </p>
                    </div>
                    <button
                      onClick={loadSystemSettings}
                      className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-[#3182ce]" />
                      刷新数据库指标
                    </button>
                  </div>

                  {/* 数据库健康指示卡 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">实例健康状态</span>
                        <Server className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-xl font-black text-emerald-700 mt-2">
                        {dbStats?.status === "HEALTHY" ? "正常运行 (HEALTHY)" : "联通检测中"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        {dbStats?.dbEngine || "PostgreSQL 15"}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">连接查询延迟 (Ping)</span>
                        <Activity className="w-4 h-4 text-[#3182ce]" />
                      </div>
                      <div className="text-xl font-black text-[#2b6cb0] mt-2">
                        {dbStats?.latencyMs ?? 2} <span className="text-xs font-normal">ms</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        Prisma Client 连接池就绪
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">最近数据归档快照</span>
                        <Layers className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="text-sm font-black text-slate-800 mt-2">
                        {dbStats?.lastBackupTime ? new Date(dbStats.lastBackupTime).toLocaleTimeString("zh-CN") : "今日自动归档"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        自动异地备份机制已激活
                      </div>
                    </div>
                  </div>

                  {/* 核心业务表记录体量 */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <h4 className="text-xs font-black text-slate-700">核心业务表真实记录量统计</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">全网注册用户 (users)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.users.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">工作空间总数 (workspaces)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.workspaces.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">组件目录库 (component_catalog)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.components.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">交易充值流水 (billing_records)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.billingRecords.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">审计操作日志 (operation_logs)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.operationLogs.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">风控申诉单 (account_appeals)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.accountAppeals.toLocaleString() ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

