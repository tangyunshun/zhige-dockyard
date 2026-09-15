"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getAuthToken } from "@/utils/auth";
import { confirm } from "@/components/GlobalConfirmProvider";
import type {
  OAuthChannelMeta,
} from "@/constants/oauth";
import type {
  NavPresetItem,
  NavColumnTemplateItem,
  OfficialOAuthChannelItem,
  SmsProviderItem,
} from "@/lib/setting-catalogs";
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
  Download,
  Eye,
  Edit3,
  FolderTree,
  Compass,
  LayoutGrid,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import SiteRoutePicker from "@/components/admin/SiteRoutePicker";
import { EmailInput } from "@/components/EmailInput";

export interface NavLinkItem {
  label: string;
  url: string;
}

export interface NavColumnItem {
  title: string;
  links: NavLinkItem[];
}

export interface OAuthChannelItem {
  id: string;
  type: string;
  name: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  callbackUrl?: string;
}

/** 平台标准前台公开页面分类路由字典（供前台页脚导航配置时快速选择与参考，杜绝盲填或路径错误） */
export interface SystemSiteRouteItem {
  label: string;
  url: string;
  description: string;
}

export interface SystemSiteRouteGroup {
  category: string;
  routes: SystemSiteRouteItem[];
}

export const SYSTEM_SITE_ROUTE_GROUPS: SystemSiteRouteGroup[] = [
  {
    category: "🌟 核心业务与工作台",
    routes: [
      { label: "核心能力与模块", url: "/capabilities", description: "全生命周期工程组件能力体系" },
      { label: "组件市场广场", url: "/market", description: "企业级组件发现、筛选与接入" },
      { label: "工程工作台", url: "/studio", description: "在线组件可视化设计与开发" },
      { label: "工作空间中枢", url: "/workspace-hub", description: "个人与团队项目统一控制台" },
    ],
  },
  {
    category: "💼 行业场景解决方案",
    routes: [
      { label: "解决方案总览", url: "/solutions", description: "四大核心行业信创解决方案" },
      { label: "政务云信创方案", url: "/solutions?type=gov", description: "安全可控的政务软件架构" },
      { label: "军工科研解决方案", url: "/solutions?type=military", description: "高等级内网隔离与研发规范" },
      { label: "金融安全解决方案", url: "/solutions?type=fintech", description: "分布式交易与合规风控" },
      { label: "智慧城市物联网", url: "/solutions?type=city", description: "数字孪生与物联网中台集成" },
    ],
  },
  {
    category: "📚 开发者生态与技术文档",
    routes: [
      { label: "开发者文档中心", url: "/docs", description: "系统集成、API 文档与快速上手" },
      { label: "开发者开放社区", url: "/developers", description: "极客社区、开源规范与生态伙伴" },
      { label: "最佳实践知识库", url: "/knowledge", description: "组件复用规范与架构白皮书" },
      { label: "平台版本发布日志", url: "/releases", description: "历史版本迭代与更新记录" },
      { label: "帮助与服务支持", url: "/help", description: "常见故障排查与工单服务" },
    ],
  },
  {
    category: "🛡️ 安全风控与服务合规",
    routes: [
      { label: "全生命周期安全", url: "/security", description: "信创等保三级与静态代码安全" },
      { label: "会员权益与算力定价", url: "/pricing", description: "个人版/专业版/企业版算力价格" },
      { label: "用户隐私保护指引", url: "/privacy-policy", description: "合规隐私政策与数据使用声明" },
      { label: "平台服务许可协议", url: "/terms-of-service", description: "终端用户协议与法律条款" },
      { label: "账号封禁申诉通道", url: "/account-appeal", description: "安全限制申诉与人工复审" },
    ],
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
  lastBackupTime: string | null;
  lastBackupInfo?: string | null;
  dbEngine: string;
}

export default function AdminSettingsPage() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 邮件测试模态框状态
  const [showEmailTestModal, setShowEmailTestModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testEmailAddressError, setTestEmailAddressError] = useState("");
  const [testEmailAddressTouched, setTestEmailAddressTouched] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // 邮箱地址实时校验方法（返回细粒度错误提示语，合法时返回空字符串）
  const validateTestEmailAddress = (email: string): string => {
    const trimmed = email.trim();
    if (!trimmed) {
      return "测试收件邮箱不能为空，请输入可接收邮件的管理员邮箱";
    }
    if (!trimmed.includes("@")) {
      return "邮箱格式不正确，缺少 '@' 符号";
    }
    const parts = trimmed.split("@");
    if (parts.length > 2) {
      return "邮箱格式不正确，不能包含多个 '@' 符号";
    }
    const [localPart, domainPart] = parts;
    if (!localPart) {
      return "请输入 '@' 前面的邮箱账号名称";
    }
    if (!domainPart) {
      return "请输入 '@' 后面的邮箱域名后缀（例如：qq.com 或 163.com）";
    }
    if (!domainPart.includes(".")) {
      return "邮箱域名后缀格式不完整，需包含顶级域名（例如：.com 或 .cn）";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "请输入合法的测试收件人邮箱地址（例如：admin@163.com）";
    }
    return "";
  };
  const [testEmailResult, setTestEmailResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
    troubleshooting?: string[];
    errorType?: string;
  } | null>(null);

  // 短信测试模态框状态
  const [showSmsTestModal, setShowSmsTestModal] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState("");
  const [testSmsPhoneError, setTestSmsPhoneError] = useState("");
  const [testSmsPhoneTouched, setTestSmsPhoneTouched] = useState(false);
  const [sendingTestSms, setSendingTestSms] = useState(false);

  // 手机号实时校验方法（返回错误提示语，合法时返回空字符串）
  const validateTestSmsPhone = (phone: string): string => {
    const trimmed = phone.trim();
    if (!trimmed) {
      return "测试接收手机号不能为空，请输入 11 位手机号码";
    }
    if (!/^1\d*$/.test(trimmed)) {
      return "手机号码必须以数字 1 开头且仅包含纯数字";
    }
    if (trimmed.length < 11) {
      return `已输入 ${trimmed.length} 位，手机号码必须为 11 位数字（还差 ${11 - trimmed.length} 位）`;
    }
    if (!/^1[3-9]\d{9}$/.test(trimmed)) {
      return "手机号码格式不正确，第二位必须是 3-9 之间的有效运营商号段";
    }
    return "";
  };
  const [testSmsResult, setTestSmsResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
    troubleshooting?: string[];
  } | null>(null);

  // 添加自定义短信服务商模态框状态
  const [showAddSmsProviderModal, setShowAddSmsProviderModal] = useState(false);
  const [newSmsProvider, setNewSmsProvider] = useState({ value: "", label: "" });
  const [addingSmsProvider, setAddingSmsProvider] = useState(false);

  // 数据库 Ping 测速与备份快照创建状态
  const [pingingDb, setPingingDb] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

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

  // 表单值一律以数据库返回为准，前端不再维护第二份默认配置，
  // 避免前后端默认口径不一致导致"页面看到的"与"实际落库的"对不上。
  const [configs, setConfigs] = useState<Record<string, string>>({});

  // 是否存在尚未保存的修改（用于顶部提示与离开页面拦截）
  const [isDirty, setIsDirty] = useState(false);

  // 真实数据库运行状态
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  // 注销冷静期配置
  const [cooldownDays, setCooldownDays] = useState(7);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [cooldownSaving, setCooldownSaving] = useState(false);

  // 前台分类导航工作台状态与常用路由推荐
  const [navColumns, setNavColumns] = useState<NavColumnItem[]>([]);
  const [selectedNavColIndex, setSelectedNavColIndex] = useState(0);
  const [showNavJson, setShowNavJson] = useState(false);
  const [showLiveFooterPreview, setShowLiveFooterPreview] = useState(true);

  // 目录型数据（第三方登录平台目录 / 常用路由推荐 / 官方模板），全部由数据库下发
  const [oauthProviderCatalog, setOauthProviderCatalog] = useState<OAuthChannelMeta[]>([]);
  const [navPresets, setNavPresets] = useState<NavPresetItem[]>([]);
  const [officialNavTemplate, setOfficialNavTemplate] = useState<NavColumnTemplateItem[]>([]);
  const [officialOauthTemplate, setOfficialOauthTemplate] =
    useState<OfficialOAuthChannelItem[]>([]);
  const [smsProviders, setSmsProviders] = useState<SmsProviderItem[]>([]);

  /** 按 type 从数据库目录中取平台元数据，未收录时给出通用兜底 */
  const getProviderMeta = (typeOrId: string): OAuthChannelMeta => {
    const normalized = (typeOrId || "").toLowerCase();
    const hit = oauthProviderCatalog.find((p) => p.type === normalized || p.id === normalized);
    if (hit) return hit;
    return {
      id: normalized,
      type: normalized,
      name: "自定义第三方登录",
      authMode: "hybrid",
      brandColor: "#3182ce",
      bgLightColor: "#ebf8ff",
      textColor: "#3182ce",
      iconType: "custom",
      hint: "支持扫码或跳转授权登录",
      defaultCallback: `/api/auth/${normalized}/callback`,
      domestic: true,
    };
  };

  // 同步更新导航状态与底层 JSON 配置
  const syncNavColumns = (updated: NavColumnItem[]) => {
    setNavColumns(updated);
    setIsDirty(true);
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

  // 6.1 快速选取站内标准路由：自动填入 url，且当菜单名为空或默认值时智能同步菜单名
  const handleSelectPresetRoute = (
    colIndex: number,
    linkIndex: number,
    targetUrl: string,
    customLabel?: string
  ) => {
    if (!targetUrl) return;
    // 优先使用直接传入的标签，其次从路由字典中查找匹配项
    let matchedLabel = customLabel || "";
    if (!matchedLabel) {
      for (const group of SYSTEM_SITE_ROUTE_GROUPS) {
        const found = group.routes.find((r) => r.url === targetUrl);
        if (found) {
          matchedLabel = found.label;
          break;
        }
      }
    }
    if (!matchedLabel) {
      const pFound = navPresets.find((p) => p.url === targetUrl);
      if (pFound) matchedLabel = pFound.label;
    }

    const updated = [...navColumns];
    const targetCol = { ...updated[colIndex] };
    const links = [...targetCol.links];
    const currentLink = links[linkIndex];

    const shouldUpdateLabel =
      matchedLabel &&
      (!currentLink.label.trim() ||
        currentLink.label === "新建功能链接" ||
        currentLink.label === "新导航项" ||
        /^链接\s*\d+$/.test(currentLink.label));

    links[linkIndex] = {
      ...currentLink,
      url: targetUrl,
      label: shouldUpdateLabel ? matchedLabel : currentLink.label,
    };
    targetCol.links = links;
    updated[colIndex] = targetCol;
    syncNavColumns(updated);
    toast.success(`已应用站内路由【${matchedLabel || targetUrl}】`);
  };

  // 6.2 规范化 URL 格式（失焦时自动修正缺前导斜杠的站内相对路径，防止 404）
  const handleNormalizeNavUrl = (
    colIndex: number,
    linkIndex: number,
    rawUrl: string
  ) => {
    const trimmed = (rawUrl || "").trim();
    if (!trimmed) return;
    if (
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("/") &&
      !trimmed.startsWith("#")
    ) {
      const fixed = `/${trimmed}`;
      handleUpdateNavLink(colIndex, linkIndex, "url", fixed);
      toast.info(`已自动为您规范站内路径为 ${fixed}`);
    }
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

  // 10. 重置为官方默认（仅覆盖当前编辑态，需点击保存才会落库）
  const handleResetNavColumns = async () => {
    const ok = await confirm({
      title: "确认载入官方标准导航模板？",
      message: "当前编辑中的分类与链接将被官方标准模板覆盖，且需要点击页面底部的【保存】按钮后才会真正写入数据库。确定继续吗？",
      type: "warning",
      confirmText: "载入模板",
      cancelText: "取消",
    });
    if (!ok) return;

    if (officialNavTemplate.length === 0) {
      toast.warning("尚未从数据库读取到官方标准导航模板，请稍后重试");
      return;
    }
    syncNavColumns(officialNavTemplate);
    setSelectedNavColIndex(0);
    toast.success("已载入官方标准导航模板，请点击【保存】按钮后生效！");
  };

  // 第三方登录通道动态状态
  const [oauthChannels, setOauthChannels] = useState<OAuthChannelItem[]>([]);

  // 同步更新第三方渠道与底层系统配置字段
  const syncOAuthChannels = (updated: OAuthChannelItem[]) => {
    setOauthChannels(updated);
    setIsDirty(true);
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
    const meta = getProviderMeta(type);
    // 同一平台仅允许登记一次，避免前台登录页出现两个相同入口
    if (oauthChannels.some((c) => c.type === type)) {
      toast.warning(`【${meta.name}】渠道已存在，同一平台仅允许添加一次`);
      return;
    }
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

  // 2. 删除渠道（调用知阁统一 ConfirmModal，挂载到顶层 document.body，全屏遮挡后台侧边栏）
  const handleDeleteOAuthChannel = async (channel: OAuthChannelItem) => {
    const ok = await confirm({
      title: "确认删除登录渠道",
      message: `确定要移除【${channel.name}】渠道吗？\n\n移除后前台登录与注册页将不再展示此渠道。后续可在“添加登录渠道”下拉菜单中随时重新添加。`,
      type: "danger",
      confirmText: "确认删除",
      cancelText: "取消",
    });
    if (!ok) return;

    const updated = oauthChannels.filter((c) => c.id !== channel.id);
    syncOAuthChannels(updated);
    toast.success(`已成功删除【${channel.name}】登录渠道！`);
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

  // 5. 恢复默认官方渠道（仅覆盖当前编辑态，需点击保存才会落库）
  const handleResetOAuthChannels = async () => {
    const ok = await confirm({
      title: "确认载入官方默认渠道？",
      message: "当前编辑中的第三方登录渠道将被官方默认配置覆盖，且需要点击【保存第三方登录设置】后才会真正写入数据库。确定继续吗？",
      type: "warning",
      confirmText: "载入默认",
      cancelText: "取消",
    });
    if (!ok) return;

    if (officialOauthTemplate.length === 0) {
      toast.warning("尚未从数据库读取到官方预置渠道模板，请稍后重试");
      return;
    }
    syncOAuthChannels(officialOauthTemplate);
    toast.success("已载入官方默认渠道，请点击【保存第三方登录设置】后生效！");
  };

  // 1. 加载全局系统设置与数据库状态（silent = true 时不显示整页 loading，用于保存后的静默校准）
  const loadSystemSettings = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
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
              // 以数据库为准：空数组同样是合法结果（管理员清空后不应残留旧数据）
              if (Array.isArray(parsed)) {
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
              if (Array.isArray(parsedChannels)) {
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
        // 目录型数据：以数据库为准，前端不做第二份硬编码
        if (Array.isArray(data.oauthProviderCatalog)) {
          setOauthProviderCatalog(data.oauthProviderCatalog);
        }
        if (Array.isArray(data.navPresets)) {
          setNavPresets(data.navPresets);
        }
        if (Array.isArray(data.officialNavTemplate)) {
          setOfficialNavTemplate(data.officialNavTemplate);
        }
        if (Array.isArray(data.officialOauthTemplate)) {
          setOfficialOauthTemplate(data.officialOauthTemplate);
        }
        if (Array.isArray(data.smsProviders)) {
          setSmsProviders(data.smsProviders);
        }
        // 完成一次加载即视为与数据库已同步，清除未保存标记
        setIsDirty(false);
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

  // 刷新参数：存在未保存修改时先确认，避免刷新后编辑内容被静默丢弃
  const handleRefresh = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "存在未保存的修改",
        message: "刷新将从数据库重新拉取配置，当前未保存的修改会被丢弃。确定刷新吗？",
        type: "warning",
        confirmText: "丢弃并刷新",
        cancelText: "返回继续编辑",
      });
      if (!ok) return;
    }
    await loadSystemSettings();
  };

  // 存在未保存修改时拦截关闭 / 刷新页面
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // 表单键值变更
  const handleConfigChange = (key: string, value: string) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  // 前置业务校验规则：在提交数据库前拦截非法输入，形成完整的防御性闭环
  const validateModuleSettings = (keys: string[]): string | null => {
    // 1. 基础设置校验
    if (keys.includes("siteName")) {
      const siteName = (configs.siteName || "").trim();
      if (!siteName) return "站点名称为必填项，请输入站点名称";
      if (siteName.length < 2 || siteName.length > 50) return "站点名称长度需在 2 ~ 50 个字符之间";
    }
    if (keys.includes("siteUrl")) {
      const siteUrl = (configs.siteUrl || "").trim();
      if (!siteUrl) return "平台主域名为必填项，请输入访问域名";
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(siteUrl)) {
        return "平台主域名格式不合法，需以 http:// 或 https:// 开头";
      }
    }

    // 2. SMTP 邮件设置校验
    if (keys.includes("smtpHost")) {
      const host = (configs.smtpHost || "").trim();
      if (!host) return "SMTP 服务器主机地址为必填项";
      const port = Number(configs.smtpPort || 0);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return "SMTP 通信端口必须是 1 ~ 65535 之间的有效端口号";
      }
      const user = (configs.smtpUser || "").trim();
      if (!user) return "认证发信账号为必填项";
      const sender = (configs.senderEmail || "").trim();
      if (!sender) return "发件人展示邮箱为必填项";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
        return "发件人展示邮箱格式不正确，请输入合法邮箱地址";
      }
    }

    // 3. 短信网关校验
    if (keys.includes("smsProvider")) {
      if (!configs.smsProvider) return "请选择短信服务商";
      if (!(configs.smsSignName || "").trim()) return "短信签名为必填项";
      if (!(configs.smsAccessKeyId || "").trim()) return "访问凭证 ID (AccessKey ID) 为必填项";
      if (!(configs.smsAccessKeySecret || "").trim()) return "访问凭证密钥 (AccessKey Secret) 为必填项";
      if (!(configs.smsTemplateCode || "").trim()) return "通用验证码短信模板编号为必填项";
    }

    // 4. 安全与风控策略区间校验
    if (keys.includes("loginMaxFailures")) {
      const failures = Number(configs.loginMaxFailures);
      if (!Number.isInteger(failures) || failures < 3 || failures > 20) {
        return "登录密码连续试错上限需为 3 ~ 20 之间的整数";
      }
      const rateLimit = Number(configs.ipRateLimitMinute);
      if (!Number.isInteger(rateLimit) || rateLimit < 10 || rateLimit > 100000) {
        return "IP 每分钟请求速率阈值需为 10 ~ 100,000 之间的整数";
      }
      const timeout = Number(configs.sessionTimeoutHours);
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 720) {
        return "登录态免活有效期需为 1 ~ 720 小时之间的整数";
      }
      const expire = Number(configs.passwordExpireDays);
      if (!Number.isInteger(expire) || expire < 30 || expire > 720) {
        return "管理员强密码轮换周期需为 30 ~ 720 天之间的整数";
      }
    }

    return null;
  };

  // 保存当前模块的配置
  const handleSaveSettings = async (keysToSave: string[], successMsg: string) => {
    // 执行前置输入校验
    const validationError = validateModuleSettings(keysToSave);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

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
        setIsDirty(false);
        // 静默重新拉取一次，确保前端展示与数据库最终落库结果完全一致
        await loadSystemSettings(true);
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

  // 发送测试邮件
  const handleSendTestEmail = async () => {
    setTestEmailAddressTouched(true);
    const err = validateTestEmailAddress(testEmailAddress);
    if (err) {
      setTestEmailAddressError(err);
      return;
    }
    setTestEmailAddressError("");
    setSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          toEmail: testEmailAddress,
          smtpHost: configs.smtpHost,
          smtpPort: configs.smtpPort,
          smtpUser: configs.smtpUser,
          smtpPass: configs.smtpPass,
          senderEmail: configs.senderEmail,
          senderName: configs.senderName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestEmailResult({
          success: true,
          message: data.message || "测试邮件已成功投递！",
          latency: data.latencyMs,
        });
        toast.success(`测试邮件发送成功（耗时 ${data.latencyMs}ms）！`);
      } else {
        setTestEmailResult({
          success: false,
          message: data.error || "SMTP 连接失败，请检查配置参数",
          latency: data.latencyMs,
          troubleshooting: Array.isArray(data.troubleshooting) ? data.troubleshooting : undefined,
          errorType: data.errorType,
        });
        // 弹窗内部已有详细错误与排查指南，彻底移除顶部冗余 Toast 提示，避免遮挡
      }
    } catch (e: any) {
      setTestEmailResult({
        success: false,
        message: "网络通信异常，未能连通测试接口，请检查本地网络或服务端进程状态",
        troubleshooting: [
          "检查宿主机及容器网络是否通畅，确认 Next.js 后端服务正常运行",
          "查看开发者工具 Network 控制台，排查接口是否受到防火墙或代理软件中断"
        ],
      });
      // 彻底移除顶部冗余 Toast 提示
    } finally {
      setSendingTestEmail(false);
    }
  };

  // 发送测试短信
  const handleSendTestSms = async () => {
    setTestSmsPhoneTouched(true);
    const err = validateTestSmsPhone(testSmsPhone);
    if (err) {
      setTestSmsPhoneError(err);
      return;
    }
    setTestSmsPhoneError("");
    setSendingTestSms(true);
    setTestSmsResult(null);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings/test-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          phone: testSmsPhone,
          smsProvider: configs.smsProvider,
          smsSignName: configs.smsSignName,
          smsAccessKeyId: configs.smsAccessKeyId,
          smsAccessKeySecret: configs.smsAccessKeySecret,
          smsTemplateCode: configs.smsTemplateCode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestSmsResult({
          success: true,
          message: data.message || "短信网关连通测试通过！",
          latency: data.latencyMs,
        });
        toast.success(`短信网关测试通过（耗时 ${data.latencyMs}ms）！`);
      } else {
        setTestSmsResult({
          success: false,
          message: data.error || "网关连通失败，请检查密钥与配置",
          latency: data.latencyMs,
          troubleshooting: Array.isArray(data.troubleshooting) ? data.troubleshooting : undefined,
        });
        // 弹窗内部已有详细错误与排查指南，彻底移除顶部冗余 Toast 提示，避免遮挡
      }
    } catch (e) {
      setTestSmsResult({
        success: false,
        message: "网络异常，未能连通短信网关测试接口，请检查服务器网络或外部网关可用性",
        troubleshooting: [
          "检查宿主运行环境对外网络连接是否通畅",
          "确认服务端未受到外部防火墙阻断",
        ],
      });
      // 彻底移除顶部冗余 Toast 提示
    } finally {
      setSendingTestSms(false);
    }
  };

  // 添加自定义短信服务商（持久化保存至数据库）
  const handleAddSmsProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSmsProvider.value.trim() || !newSmsProvider.label.trim()) {
      toast.warning("请完整填写服务商标识与显示名称");
      return;
    }
    const cleanVal = newSmsProvider.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleanVal) {
      toast.warning("服务商标识仅支持小写英文、数字与下划线");
      return;
    }
    try {
      setAddingSmsProvider(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "add_sms_provider",
          provider: {
            value: cleanVal,
            label: newSmsProvider.label.trim(),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "短信服务商已成功添加！");
        if (Array.isArray(data.smsProviders)) {
          setSmsProviders(data.smsProviders);
        }
        handleConfigChange("smsProvider", cleanVal);
        setShowAddSmsProviderModal(false);
        setNewSmsProvider({ value: "", label: "" });
      } else {
        toast.error(data.error || "添加短信服务商失败");
      }
    } catch {
      toast.error("网络异常，添加短信服务商失败");
    } finally {
      setAddingSmsProvider(false);
    }
  };

  // 删除指定的短信服务商（持久化从数据库字典中移除，走统一全局 ConfirmModal 全屏遮罩）
  const handleDeleteSmsProvider = async (providerValue: string) => {
    const target = smsProviders.find((p) => p.value === providerValue);
    const targetLabel = target?.label || providerValue;

    const ok = await confirm({
      title: "确认删除短信服务商",
      message: `确定要从系统字典中移除【${targetLabel}】通道吗？\n\n移除后系统配置与下拉列表中将不再展示该服务商。后续可点击「添加其他服务商」随时重新录入。`,
      type: "danger",
      confirmText: "确认删除",
      cancelText: "取消",
    });
    if (!ok) return;

    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "delete_sms_provider",
          value: providerValue,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `短信服务商【${targetLabel}】已成功移除！`);
        if (Array.isArray(data.smsProviders)) {
          setSmsProviders(data.smsProviders);
        } else {
          setSmsProviders((prev) => prev.filter((p) => p.value !== providerValue));
        }
        if (configs.smsProvider === providerValue) {
          handleConfigChange("smsProvider", "");
        }
      } else {
        toast.error(data.error || "删除短信服务商失败");
      }
    } catch {
      toast.error("网络异常，删除短信服务商失败");
    }
  };

  // 即时测定数据库延迟 (Ping)
  const handlePingDb = async () => {
    setPingingDb(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "ping_db" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDbStats((prev) =>
          prev
            ? {
                ...prev,
                latencyMs: data.latencyMs,
                status: data.status,
              }
            : null
        );
        toast.success(`数据库连接正常，即时往返延迟: ${data.latencyMs}ms`);
      } else {
        toast.error("探测数据库延迟失败");
      }
    } catch (e) {
      toast.error("网络异常，无法测定数据库延迟");
    } finally {
      setPingingDb(false);
    }
  };

  // 创建配置快照（system_config 全量配置 + 核心业务表统计）并自动导出 JSON 文件
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "create_backup" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // 更新本地状态中的归档时间
        setDbStats((prev) =>
          prev
            ? {
                ...prev,
                lastBackupTime: data.backupTime,
              }
            : null
        );

        // 自动触发 JSON 灾备文件下载
        const exportContent = JSON.stringify(data.backupData, null, 2);
        const blob = new Blob([exportContent], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        link.href = url;
        link.download = `zhige_dockyard_backup_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("备份快照已生成，归档时间已更新并已触发备份包下载！");
      } else {
        toast.error(data.error || "创建备份失败");
      }
    } catch (e) {
      toast.error("网络异常，创建备份快照失败");
    } finally {
      setCreatingBackup(false);
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
                  全局统一生效
                </span>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                    ● 有未保存的修改
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                知阁平台全局参数配置、账号注销安全策略、邮件通知与第三方集成服务。所有配置均写入系统数据库统一生效。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
              刷新参数
            </button>
            <Link
              href="/admin/maintenance"
              title="前往全站维护模式管理页面，支持开启/关闭系统停机维护、配置白名单与公告"
              className="h-9 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
              全站维护模式
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
              <p className="text-xs font-bold">正在拉取系统最新配置...</p>
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
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>站点名称</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.siteName || ""}
                        onChange={(e) => handleConfigChange("siteName", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="知阁·舟坊"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>平台主域名</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
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
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">平台定位与搜索引擎描述 (SEO)</label>
                    <textarea
                      rows={3}
                      value={configs.description || ""}
                      onChange={(e) => handleConfigChange("description", e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all resize-none"
                      placeholder="企业级软件组件开发与效能中枢协作平台..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                      <div className="flex items-center justify-between mb-2.5">
                        <label className="block text-xs font-bold text-slate-700">平台 Logo 图标</label>
                        <span className="text-[11px] text-slate-400">支持 SVG、PNG、WebP 等图片格式</span>
                      </div>
                      
                      <div className="flex items-center gap-3.5 mb-3">
                        {/* 实时预览容器 */}
                        <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                          {configs.logo ? (
                            <img
                              src={configs.logo}
                              alt="Logo 预览"
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white rounded-[4px] text-xs font-bold transition-all shadow-xs cursor-pointer"
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
                                className="px-2.5 py-1.5 border border-slate-200 hover:bg-white text-slate-600 rounded-[4px] text-xs font-medium transition-all cursor-pointer"
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
                        <span className="text-[11px] font-semibold text-slate-500">Logo 存储路径或外部 CDN 地址：</span>
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">工信部 ICP 备案许可编号</label>
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">底部版权所有声明 (Copyright)</label>
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
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                      <span className="font-bold block mb-0.5">SMTP 邮件服务配置说明</span>
                      此处的 SMTP 参数用于系统自动发送验证码、风险安全警示、申诉审批通过通知等关键事务邮件。配置保存后系统将即时生效，您可点击下方【发送测试邮件】进行连通性验证。
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>SMTP 服务器主机地址</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smtpHost || ""}
                        onChange={(e) => handleConfigChange("smtpHost", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="smtp.zhige.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>SMTP 通信端口</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smtpPort || ""}
                        onChange={(e) => handleConfigChange("smtpPort", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="587 或 465"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>认证发信账号</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smtpUser || ""}
                        onChange={(e) => handleConfigChange("smtpUser", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="service@zhige.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>认证授权码 / 密码</span>
                        <span className="text-slate-400 text-[10px] font-normal">（选填）</span>
                      </label>
                      <input
                        type="password"
                        value={configs.smtpPass || ""}
                        onChange={(e) => handleConfigChange("smtpPass", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                        placeholder="••••••••••••"
                      />
                    </div>

                    <div>
                      <EmailInput
                        label={<span>发件人展示邮箱</span>}
                        required
                        size="sm"
                        value={configs.senderEmail || ""}
                        onChange={(val) => handleConfigChange("senderEmail", val)}
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

                  <div className="pt-2 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "senderEmail", "senderName"],
                          "SMTP 邮件配置已成功更新并即时生效！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存邮件参数
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailTestModal(true);
                        setTestEmailResult(null);
                        setTestEmailAddressError("");
                        setTestEmailAddressTouched(false);
                      }}
                      className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 text-xs font-bold rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-[#3182ce]" />
                      发送测试邮件
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
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <span>短信服务商</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSmsProvider({ value: "", label: "" });
                            setShowAddSmsProviderModal(true);
                          }}
                          className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>添加其他服务商</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={configs.smsProvider || ""}
                          onChange={(e) => handleConfigChange("smsProvider", e.target.value)}
                          className="flex-1 min-w-0 px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all bg-white"
                        >
                          <option value="">请选择短信服务商</option>
                          {smsProviders.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        {configs.smsProvider && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSmsProvider(configs.smsProvider)}
                            className="h-10 px-3 border border-rose-200 hover:border-rose-300 bg-rose-50 hover:bg-rose-100/80 text-rose-600 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
                            title="从系统字典中移除当前选中的短信服务商"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>删除</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>短信签名</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smsSignName || ""}
                        onChange={(e) => handleConfigChange("smsSignName", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="知阁科技"
                      />
                    </div>

                    {configs.smsProvider === "custom_http" && (
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <span>自定义短信 API 接口地址 (Webhook / Gateway URL)</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <input
                          type="url"
                          value={configs.smsCustomApiUrl || ""}
                          onChange={(e) => handleConfigChange("smsCustomApiUrl", e.target.value)}
                          className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                          placeholder="https://api.sms-provider.com/v1/send"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>访问凭证 ID (AccessKey ID)</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smsAccessKeyId || ""}
                        onChange={(e) => handleConfigChange("smsAccessKeyId", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="LTAI5t••••••••"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>访问凭证密钥 (AccessKey Secret)</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="password"
                        value={configs.smsAccessKeySecret || ""}
                        onChange={(e) => handleConfigChange("smsAccessKeySecret", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="••••••••••••••••"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>通用验证码短信模板编号 (Template Code)</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={configs.smsTemplateCode || ""}
                        onChange={(e) => handleConfigChange("smsTemplateCode", e.target.value)}
                        className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all"
                        placeholder="SMS_20260904"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() =>
                        handleSaveSettings(
                          ["smsProvider", "smsSignName", "smsAccessKeyId", "smsAccessKeySecret", "smsTemplateCode"],
                          "短信网关配置已成功保存！"
                        )
                      }
                      disabled={saving}
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存短信网关配置
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowSmsTestModal(true);
                        setTestSmsResult(null);
                        setTestSmsPhoneError("");
                        setTestSmsPhoneTouched(false);
                      }}
                      className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 text-xs font-bold rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-500" />
                      测试短信网关
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
                                // 可添加的平台完全由数据库目录决定，新增/下线平台无需改动前端代码
                                const availableProviders = oauthProviderCatalog.filter(
                                  (p) => !configuredTypes.has(p.type)
                                );
                                const domesticItems = availableProviders.filter((p) => p.domestic);
                                const developerItems = availableProviders.filter((p) => !p.domestic);

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
                                            className="w-full px-3 py-1.5 text-left text-slate-700 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50 hover:text-slate-900"
                                          >
                                            <div className="flex items-center gap-2">
                                              {item.iconUrl ? (
                                                <img src={item.iconUrl} alt={item.name} className="w-4 h-4 object-contain" />
                                              ) : (
                                                <span
                                                  className="w-2 h-2 rounded-full"
                                                  style={{ backgroundColor: item.brandColor }}
                                                />
                                              )}
                                              {item.name}
                                            </div>
                                            <span
                                              className="text-[10px] font-normal"
                                              style={{ color: item.textColor }}
                                            >
                                              {AUTH_MODE_LABEL[item.authMode] || "自定义"}
                                            </span>
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
                                            className="w-full px-3 py-1.5 text-left text-slate-700 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50 hover:text-slate-900"
                                          >
                                            <div className="flex items-center gap-2">
                                              {item.iconUrl ? (
                                                <img src={item.iconUrl} alt={item.name} className="w-4 h-4 object-contain" />
                                              ) : (
                                                <span
                                                  className="w-2 h-2 rounded-full"
                                                  style={{ backgroundColor: item.brandColor }}
                                                />
                                              )}
                                              {item.name}
                                            </div>
                                            <span
                                              className="text-[10px] font-normal"
                                              style={{ color: item.textColor }}
                                            >
                                              {AUTH_MODE_LABEL[item.authMode] || "自定义"}
                                            </span>
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
                        const meta = getProviderMeta(channel.type || channel.id);
                        // 渠道品牌视觉完全由数据库平台目录驱动（品牌色 / 图标），新增平台无需改动前端
                        const badge = {
                          style: {
                            backgroundColor: meta.bgLightColor,
                            color: meta.textColor,
                            borderColor: `${meta.brandColor}33`,
                          },
                          label: meta.name,
                          icon: meta.iconUrl ? (
                            <img
                              src={meta.iconUrl}
                              alt={meta.name}
                              className="w-3.5 h-3.5 object-contain"
                            />
                          ) : (
                            <Globe className="w-3.5 h-3.5" style={{ color: meta.brandColor }} />
                          ),
                        };
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
                                  className="px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 shadow-2xs border"
                                  style={badge.style}
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
                                  onClick={() => handleDeleteOAuthChannel(channel)}
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
                                  <span className="flex items-center gap-1">
                                    <span>客户端标识 (Client ID / App ID)</span>
                                    {channel.enabled && <span className="text-rose-500 font-bold">*</span>}
                                  </span>
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
                                  <span className="flex items-center gap-1">
                                    <span>客户端密钥 (Client Secret / App Secret)</span>
                                    {channel.enabled && <span className="text-rose-500 font-bold">*</span>}
                                  </span>
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
                                  授权回调地址 (Redirect URI):
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
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      保存第三方登录设置
                    </button>
                  </div>
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
                      管理全站底部定位标语、社交媒体二维码、公安网安备案以及 4 大分类导航链接。所有配置修改并保存后即时在全站生效。
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">全站品牌定位标语</label>
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
                        <h4 className="text-xs font-bold text-slate-800">2. 社交平台交互二维码（支持图片上传与外链）</h4>
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

                  {/* 4 大分类导航配置：前台分类导航配置工作台 */}
                  <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4">
                    {/* 工作台顶部控制栏 */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-nowrap">
                          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                            <Compass className="w-4 h-4 text-[#3182ce] shrink-0" />
                            <h4 className="text-xs font-black text-slate-800 whitespace-nowrap">
                              4. 前台分类导航与链接配置工作台
                            </h4>
                          </div>
                          <span className="text-[10px] font-bold text-[#3182ce] bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <Layers className="w-3 h-3" />
                            共 {navColumns.length} 个分类 · {navColumns.reduce((acc, c) => acc + (c.links?.length || 0), 0)} 个功能链接
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          分类与子链接支持灵活新增、修改、排序与删除，支持常用路由一键快速填入，配备前台页脚实时所见即所得预览。
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
                                      <div className="flex-2 min-w-[280px]">
                                        <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                                          <span className="flex items-center gap-1">
                                            <span>跳转目标路径</span>
                                            <span className="text-slate-400 font-normal">(相对路由或完整网址)</span>
                                          </span>
                                          {/* 路径类型徽章指示 */}
                                          <span className="flex items-center gap-1">
                                            {link.url.startsWith("http://") || link.url.startsWith("https://") ? (
                                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200">
                                                ● 外部链接
                                              </span>
                                            ) : link.url.startsWith("/") ? (
                                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                ● 站内路由
                                              </span>
                                            ) : link.url.trim() ? (
                                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                ▲ 建议前缀 /
                                              </span>
                                            ) : (
                                              <span className="px-1.5 py-0.2 rounded text-[9px] font-normal text-slate-400">
                                                未填写
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                        <div className="relative flex items-center">
                                          <input
                                            type="text"
                                            value={link.url}
                                            onChange={(e) =>
                                              handleUpdateNavLink(currentIdx, linkIdx, "url", e.target.value)
                                            }
                                            onBlur={() => handleNormalizeNavUrl(currentIdx, linkIdx, link.url)}
                                            className="w-full pl-7 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all"
                                            placeholder="例如: /capabilities 或 https://..."
                                          />
                                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                          {link.url.trim() && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const target = link.url.startsWith("http")
                                                  ? link.url
                                                  : link.url.startsWith("/")
                                                    ? link.url
                                                    : `/${link.url}`;
                                                window.open(target, "_blank");
                                              }}
                                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#3182ce] p-0.5 rounded transition-colors cursor-pointer"
                                              title="在新窗口预览测试此跳转链接"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                        {/* 智能站内路由快捷选取组件：知阁风格，支持动态感知、搜索过滤、绝不溢出 */}
                                        <div className="mt-1.5 w-full">
                                          <SiteRoutePicker
                                            currentUrl={link.url}
                                            onSelect={(targetUrl, targetLabel) =>
                                              handleSelectPresetRoute(currentIdx, linkIdx, targetUrl, targetLabel)
                                            }
                                          />
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
                                      {navPresets.map((preset, pIdx) => {
                                        const isCurrent = link.url === preset.url;
                                        return (
                                          <button
                                            key={pIdx}
                                            type="button"
                                            onClick={() => handleSelectPresetRoute(currentIdx, linkIdx, preset.url)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors cursor-pointer border ${
                                              isCurrent
                                                ? "bg-blue-100 text-[#2b6cb0] border-blue-300 font-bold"
                                                : "bg-white hover:bg-blue-50 hover:text-[#3182ce] border-slate-200/80 text-slate-600"
                                            }`}
                                          >
                                            {preset.label}
                                          </button>
                                        );
                                      })}
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
                            <span>前台全站页脚效果实时预览（所见即所得）</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            前台效果实时预览
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
                      className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <span>账号注销冷静期天数</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </label>
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
                      className="h-9 px-5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-[4px] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <span>登录密码连续试错上限</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <span>IP 每分钟请求速率阈值</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <span>登录态免活有效期</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <span>管理员强密码轮换周期</span>
                          <span className="text-rose-500 font-bold">*</span>
                        </label>
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
                        className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                <div className="space-y-6 w-full">
                  <div className="border-b border-slate-100 pb-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 whitespace-nowrap">
                        <HardDrive className="w-4 h-4 text-[#3182ce] shrink-0" />
                        <span>数据库运行指标与灾备中枢</span>
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5 leading-relaxed">
                        连接平台 MySQL 8.x 关系型数据库与 Prisma ORM，实时聚合各核心业务表数据体量并提供灾备快照归档。
                      </p>
                    </div>

                    {/* 操作按钮组：锁定单行不换行，杜绝掉行与折行 */}
                    <div className="flex items-center gap-2 shrink-0 flex-nowrap overflow-x-auto pb-1 xl:pb-0">
                      <button
                        type="button"
                        onClick={handlePingDb}
                        disabled={pingingDb}
                        className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-[4px] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-2xs"
                        title="即时测量与数据库实例的网络往返延迟"
                      >
                        <Activity className={`w-3.5 h-3.5 text-[#3182ce] shrink-0 ${pingingDb ? "animate-pulse" : ""}`} />
                        <span className="whitespace-nowrap">{pingingDb ? "探测中..." : "即时测延迟 (Ping)"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCreateBackup}
                        disabled={creatingBackup}
                        className="h-8 px-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        title="生成包含全量系统配置与业务统计的快照并导出备份文件"
                      >
                        {creatingBackup ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span className="whitespace-nowrap">生成备份中...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span className="whitespace-nowrap">创建备份快照并导出</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => loadSystemSettings()}
                        className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-[4px] transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                        title="重新加载最新数据库状态指标"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                        <span className="whitespace-nowrap">刷新指标</span>
                      </button>
                    </div>
                  </div>

                  {/* 数据库健康指示卡 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">实例健康状态</span>
                        <Server className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div
                        className={`text-xl font-black mt-2 ${
                          dbStats?.status === "HEALTHY" ? "text-emerald-700" : "text-amber-600"
                        }`}
                      >
                        {dbStats?.status === "HEALTHY"
                          ? "正常运行 (健康)"
                          : dbStats?.status === "DEGRADED"
                            ? "响应延迟偏高 (需关注)"
                            : "连通检测中..."}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        {dbStats?.dbEngine || "MySQL 8.x / Prisma Client"}
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
                      <div className="text-[10px] text-slate-400 mt-1 font-mono flex items-center justify-between">
                        <span>MySQL 连接池就绪</span>
                        <button
                          type="button"
                          onClick={handlePingDb}
                          disabled={pingingDb}
                          className="text-[#3182ce] hover:underline cursor-pointer"
                        >
                          重新探测
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">最近数据归档快照</span>
                        <Layers className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="text-sm font-black text-slate-800 mt-2">
                        {dbStats?.lastBackupTime
                          ? new Date(dbStats.lastBackupTime).toLocaleString("zh-CN")
                          : "暂无归档记录"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {dbStats?.lastBackupTime
                          ? dbStats.lastBackupInfo || "最近一次系统备份快照（已落库保存）"
                          : "点击上方【创建备份快照】即可生成全量备份包"}
                      </div>
                    </div>
                  </div>

                  {/* 核心业务表记录体量 */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-700">核心业务表存量统计</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        系统实时汇总统计
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">全网注册用户 (users)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.users.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">空间项目总数 (workspaces)</div>
                        <div className="text-lg font-black text-slate-800 mt-1">
                          {dbStats?.tableCounts.workspaces.toLocaleString() ?? 0}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-[11px] text-slate-400 font-bold">平台组件目录库 (components)</div>
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
                        <div className="text-[11px] text-slate-400 font-bold">安全申诉工单 (account_appeals)</div>
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

      {/* 1. 发送测试邮件模态框（统一知阁设计规范，Portal 至顶层全视口挂载） */}
      {mounted && typeof document !== "undefined" && showEmailTestModal && createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="p-5 pb-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">发送测试邮件</h3>
                    <p className="text-[11px] text-slate-400 font-medium">验证当前 SMTP 连通性与投递状态</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmailTestModal(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5">
                <EmailInput
                  label={<span>测试收件邮箱地址</span>}
                  required
                  size="sm"
                  value={testEmailAddress}
                  onChange={(val) => {
                    setTestEmailAddress(val);
                    if (testEmailAddressTouched || (val.includes("@") && val.includes("."))) {
                      setTestEmailAddressTouched(true);
                      setTestEmailAddressError(validateTestEmailAddress(val));
                    } else if (testEmailAddressError) {
                      setTestEmailAddressError(validateTestEmailAddress(val));
                    }
                  }}
                  onBlur={() => {
                    setTestEmailAddressTouched(true);
                    setTestEmailAddressError(validateTestEmailAddress(testEmailAddress));
                  }}
                  error={testEmailAddressError}
                  placeholder="请输入可接收邮件的管理员邮箱"
                  autoFocus
                />
                {testEmailAddress && !testEmailAddressError && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress) ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600 font-medium animate-in fade-in duration-150">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span>测试收件邮箱格式校验通过</span>
                  </div>
                ) : null}

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between">
                    <span className="text-slate-400">当前测试主机：</span>
                    <span className="font-mono text-slate-700 font-bold">{configs.smtpHost || "未填写"} : {configs.smtpPort || "587"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">发件人账号：</span>
                    <span className="font-mono text-slate-700">{configs.smtpUser || "匿名发信"}</span>
                  </div>
                </div>

                {testEmailResult && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <div
                      className={`p-3 rounded-xl border text-xs font-medium ${
                        testEmailResult.success
                          ? "bg-emerald-50/80 border-emerald-200 text-emerald-800"
                          : "bg-rose-50/80 border-rose-200 text-rose-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold mb-0.5">
                        {testEmailResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{testEmailResult.success ? "发送验证成功" : "发送失败"}</span>
                        {testEmailResult.latency !== undefined && (
                          <span className="text-[10px] font-mono opacity-70">({testEmailResult.latency}ms)</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5 leading-relaxed">{testEmailResult.message}</p>
                    </div>

                    {/* 失败时：结构化排查与解决方案指引 */}
                    {!testEmailResult.success && (
                      <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200 text-slate-700 space-y-2.5 text-left">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                          <HelpCircle className="w-4 h-4 text-[#3182ce] shrink-0" />
                          <span>如何排查与解决？</span>
                        </div>
                        <div className="space-y-1.5 text-[11px] text-slate-600 leading-relaxed">
                          {(testEmailResult.troubleshooting && testEmailResult.troubleshooting.length > 0
                            ? testEmailResult.troubleshooting
                            : [
                                "确认 SMTP 主机地址拼写无误（如 smtp.qq.com），不要包含协议前缀（如 smtp://）或多余空格。",
                                "核对端口与协议匹配：465 端口请开启 SSL/TLS；587 端口使用 STARTTLS；切勿使用 25 端口（云服务器默认封禁出站）。",
                                "主流邮箱（QQ 邮箱、163 邮箱、企业微信邮箱）必须使用专用独立【SMTP 授权码】，严禁使用网页登录密码。",
                                "确认发件人邮箱 (senderEmail) 与发信账号 (smtpUser) 完全一致，多数邮件商校验两者必须相同才允许投递。",
                                "检查服务器防火墙安全组：确认出站规则 (Outbound) 允许向外部 465 或 587 端口发起 TCP 流量。"
                              ]
                          ).map((step, idx) => (
                            <div key={idx} className="flex items-start gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-blue-100 text-[#3182ce] text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="text-slate-700 font-medium">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmailTestModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-[4px] border border-slate-200 transition-colors cursor-pointer"
              >
                关闭
              </button>
              <button
                type="button"
                disabled={sendingTestEmail}
                onClick={handleSendTestEmail}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-[4px] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {sendingTestEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sendingTestEmail ? "正在发送..." : "立即发送测试"}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 2. 发送测试短信模态框（统一知阁设计规范，Portal 至顶层全视口挂载） */}
      {mounted && typeof document !== "undefined" && showSmsTestModal && createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left animate-in zoom-in-95 duration-150">
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">测试短信网关</h3>
                    <p className="text-[11px] text-slate-400 font-medium">校验运营商服务商签名与模板下发</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSmsTestModal(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <span>测试接收手机号码</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={testSmsPhone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                      setTestSmsPhone(val);
                      if (testSmsPhoneTouched || val.length === 11) {
                        setTestSmsPhoneTouched(true);
                        setTestSmsPhoneError(validateTestSmsPhone(val));
                      } else if (testSmsPhoneError) {
                        setTestSmsPhoneError(validateTestSmsPhone(val));
                      }
                    }}
                    onBlur={() => {
                      setTestSmsPhoneTouched(true);
                      setTestSmsPhoneError(validateTestSmsPhone(testSmsPhone));
                    }}
                    placeholder="请输入 11 位国内手机号码"
                    className={`w-full px-3.5 h-10 border rounded-xl outline-none text-xs font-medium transition-all ${
                      testSmsPhoneError
                        ? "border-rose-400 bg-rose-50/20 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-400/20"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20"
                    }`}
                  />
                  {testSmsPhoneError ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium animate-in fade-in slide-in-from-top-1 duration-150">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                      <span>{testSmsPhoneError}</span>
                    </div>
                  ) : testSmsPhone && !testSmsPhoneError && /^1[3-9]\d{9}$/.test(testSmsPhone) ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600 font-medium animate-in fade-in duration-150">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      <span>手机号码格式校验通过</span>
                    </div>
                  ) : null}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between">
                    <span className="text-slate-400">服务商通道：</span>
                    <span className="text-slate-700 font-bold">
                      {smsProviders.find((p) => p.value === configs.smsProvider)?.label ||
                        "未选择"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">短信签名：</span>
                    <span className="font-mono text-slate-700 font-bold">【{configs.smsSignName || "知阁科技"}】</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">模板代码：</span>
                    <span className="font-mono text-slate-700">{configs.smsTemplateCode || "未配置"}</span>
                  </div>
                </div>

                {testSmsResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
                      testSmsResult.success
                        ? "bg-emerald-50/80 border-emerald-200 text-emerald-800"
                        : "bg-rose-50/80 border-rose-200 text-rose-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold mb-0.5">
                      {testSmsResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{testSmsResult.success ? "通信测试通过" : "测试失败"}</span>
                      {testSmsResult.latency !== undefined && (
                        <span className="text-[10px] font-mono opacity-70">({testSmsResult.latency}ms)</span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 leading-relaxed">{testSmsResult.message}</p>

                    {/* 错误提示与精准排查建议（知阁高可用排障标准） */}
                    {!testSmsResult.success && testSmsResult.troubleshooting && testSmsResult.troubleshooting.length > 0 && (
                      <div className="mt-3 p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-left space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                          <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>💡 故障排查与调整方案指引：</span>
                        </div>
                        <div className="space-y-1.5 text-[11px] text-amber-900/90 pl-1">
                          {testSmsResult.troubleshooting.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 leading-relaxed">
                              <span className="font-bold text-amber-700 select-none">{idx + 1}.</span>
                              <span className="text-slate-700 font-medium">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSmsTestModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-[4px] border border-slate-200 transition-colors cursor-pointer"
              >
                关闭
              </button>
              <button
                type="button"
                disabled={sendingTestSms}
                onClick={handleSendTestSms}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-[4px] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {sendingTestSms ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sendingTestSms ? "正在测试..." : "发送测试短信"}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 3. 添加自定义短信服务商模态框（统一知阁设计规范，Portal 至顶层全视口挂载） */}
      {mounted && typeof document !== "undefined" && showAddSmsProviderModal && createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-left animate-in zoom-in-95 duration-150">
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">添加短信服务商</h3>
                    <p className="text-[11px] text-slate-400 font-medium">扩充主流第三方云短信或企业私有短信通道</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddSmsProviderModal(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <span>服务商标识代号 (Provider Key)</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={newSmsProvider.value}
                    onChange={(e) => setNewSmsProvider((prev) => ({ ...prev, value: e.target.value }))}
                    placeholder="如: baidu_cloud, submail, chuanglan"
                    className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">仅支持英文字母、数字或下划线，作为通道系统唯一识别码</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <span>服务商显示名称 (Provider Label)</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={newSmsProvider.label}
                    onChange={(e) => setNewSmsProvider((prev) => ({ ...prev, label: e.target.value }))}
                    placeholder="如: 百度智能云短信 (Baidu SMS)"
                    className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddSmsProviderModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-[4px] border border-slate-200 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={addingSmsProvider}
                onClick={handleAddSmsProvider}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-[4px] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {addingSmsProvider ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{addingSmsProvider ? "正在保存..." : "确认添加"}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


