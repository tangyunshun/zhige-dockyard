"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useLogout } from "@/hooks/useLogout";
import { Logo } from "@/components/Logo";
import StepUpAuthModal from "@/components/StepUpAuthModal";
import {
  User,
  Building2,
  Box,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Settings,
  ExternalLink,
  Users,
  FileText,
  Code,
  Database,
  Target,
  Layers,
  Server,
  ChevronRight,
  BookOpen,
  Plus,
  Flame,
  Star,
  Clock,
  Zap,
  ShieldCheck,
  Palette,
  MessageSquare,
  AlertTriangle,
  Heart,
  LayoutTemplate,
  Image,
  Accessibility,
  GitMerge,
  FileCode,
  Braces,
  Plug,
  SearchCheck,
  Bug,
  TestTube2,
  Wind,
  ImageMinus,
  Wrench,
  Cloud,
  Scale,
  FileWarning,
  Package,
  Shirt,
  Phone,
  Signature,
  Smile,
  Network,
  Terminal,
  CreditCard,
  Trash2,
  FolderLock,
  MonitorPlay,
  Scissors,
  FileSpreadsheet,
  ArrowUpRight,
  Activity,
  Copy,
  RefreshCw,
  Share2,
  Lightbulb,
  CheckCircle,
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  membershipLevel?: string;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  componentCount?: number;
  memberCount?: number;
  description?: string | null;
  _count?: {
    members: number;
  } | null;
}

interface EnterpriseQuota {
  hasEnterprise: boolean;
  enterpriseCount: number;
  maxEnterprise: number;
  isMember: boolean;
}

interface UserQuota {
  isVip: boolean;
  ownedEnterpriseCount: number;
  maxEnterpriseLimit: number;
}

interface ComponentItem {
  id: string;
  name: string;
  stage: string;
  isPremium: boolean;
  icon: string;
}

interface StageComponentData {
  name: string;
  color: string;
  bgColor: string;
  components: ComponentItem[];
}

interface EnterpriseWorkspace {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  componentCount: number;
  createdAt: string;
}

interface EnterpriseData {
  workspaces: EnterpriseWorkspace[];
  statistics: {
    totalWorkspaces: number;
    totalComponents: number;
    totalMembers: number;
    totalActiveComponents?: number;
    totalCompletedComponents?: number;
    totalComponentCalls?: number;
    avgResponseTime?: number;
    successRate?: number;
    recentActivity?: number;
    activeMembers?: number;
  };
}

interface ComponentStage {
  icon: React.ReactNode;
  name: string;
  description: string;
  count: number;
  color: string;
  bgColor: string;
  components: ComponentInfo[];
  tags?: string[];
}

interface ComponentInfo {
  id: string;
  name: string;
  calls?: number;
  isHot?: boolean;
  isNew?: boolean;
  isRecommended?: boolean;
}

interface ComponentStageData {
  title: string;
  icon: any;
  color: string;
  bgColor: string;
  tags: string[];
  components: Array<{
    id: string;
    name: string;
    calls: number;
    successRate: number;
  }>;
}

// 从 studio 页面导入真实的 53 个组件数据
const componentStagesData = [
  {
    title: "第一阶段：商机捕获与售前打单",
    icon: Target,
    color: "#3182ce",
    bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
    tags: ["周热门", "推荐"] as string[],
    components: [
      {
        id: "C01",
        name: "标书智能解析",
        calls: 3421,
        successRate: 98.5,
      },
      {
        id: "C02",
        name: "方案合规审查",
        calls: 2156,
        successRate: 97.8,
      },
      {
        id: "C03",
        name: "竞品对比分析",
        calls: 1876,
        successRate: 96.5,
      },
      {
        id: "C04",
        name: "汇报话术转换",
        calls: 2543,
        successRate: 99.1,
      },
      {
        id: "C05",
        name: "项目成本测算",
        calls: 1234,
        successRate: 95.8,
      },
      {
        id: "C06",
        name: "商业价值评估",
        calls: 987,
        successRate: 94.2,
      },
    ],
  },
  {
    title: "第二阶段：需求定义与产品设计",
    icon: Layers,
    color: "#10b981",
    bgColor: "from-[#10b981]/10 to-[#059669]/10",
    tags: ["月热门"] as string[],
    components: [
      {
        id: "C07",
        name: "需求转 PRD",
        calls: 4521,
        successRate: 98.9,
      },
      {
        id: "C08",
        name: "异常场景补全",
        calls: 3245,
        successRate: 97.6,
      },
      {
        id: "C09",
        name: "客诉归因分析",
        calls: 2876,
        successRate: 96.8,
      },
      {
        id: "C10",
        name: "仿真数据生成",
        calls: 5432,
        successRate: 99.5,
      },
    ],
  },
  {
    title: "第三阶段：大前端与交互",
    icon: Palette,
    color: "#f59e0b",
    bgColor: "from-[#f59e0b]/10 to-[#d97706]/10",
    tags: ["周热门", "月热门"] as string[],
    components: [
      {
        id: "C11",
        name: "CSS 样式重构",
        calls: 2134,
        successRate: 97.2,
      },
      {
        id: "C12",
        name: "国际化词条校验",
        calls: 1765,
        successRate: 98.1,
      },
      {
        id: "C13",
        name: "页面合规检测",
        calls: 1432,
        successRate: 96.5,
      },
      {
        id: "C14",
        name: "SVG 组件转换",
        calls: 2987,
        successRate: 99.2,
      },
      {
        id: "C15",
        name: "设计稿转代码",
        calls: 3654,
        successRate: 98.7,
      },
    ],
  },
  {
    title: "第四阶段：架构设计与 DBA",
    icon: Database,
    color: "#8b5cf6",
    bgColor: "from-[#8b5cf6]/10 to-[#7c3aed]/10",
    tags: ["推荐"] as string[],
    components: [
      {
        id: "C16",
        name: "数据库逆向解析",
        calls: 4123,
        successRate: 97.9,
      },
      {
        id: "C17",
        name: "慢 SQL 优化",
        calls: 3567,
        successRate: 96.8,
      },
      {
        id: "C18",
        name: "微服务拆分建议",
        calls: 2345,
        successRate: 95.6,
      },
      {
        id: "C19",
        name: "数据迁移脚本",
        calls: 1876,
        successRate: 94.8,
      },
      {
        id: "C20",
        name: "国产库语法转换",
        calls: 1234,
        successRate: 93.5,
      },
      {
        id: "C21",
        name: "架构图代码生成",
        calls: 2987,
        successRate: 98.3,
      },
    ],
  },
  {
    title: "第五阶段：后端研发与 API",
    icon: Server,
    color: "#3182ce",
    bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
    tags: ["周热门"] as string[],
    components: [
      {
        id: "C22",
        name: "生产数据脱敏",
        calls: 3421,
        successRate: 99.1,
      },
      {
        id: "C23",
        name: "接口文档逆向",
        calls: 2654,
        successRate: 97.5,
      },
      {
        id: "C24",
        name: "JSON 转实体类",
        calls: 4532,
        successRate: 98.8,
      },
      {
        id: "C25",
        name: "接口参数映射",
        calls: 1987,
        successRate: 96.2,
      },
      {
        id: "C26",
        name: "正则表达式解析",
        calls: 1543,
        successRate: 95.8,
      },
      {
        id: "C27",
        name: "硬件错误码诊断",
        calls: 2876,
        successRate: 97.3,
      },
    ],
  },
  {
    title: "第六阶段：质量保证 QA",
    icon: TestTube2,
    color: "#10b981",
    bgColor: "from-[#10b981]/10 to-[#059669]/10",
    tags: ["月热门"] as string[],
    components: [
      {
        id: "C28",
        name: "测试用例生成",
        calls: 3765,
        successRate: 98.6,
      },
      {
        id: "C29",
        name: "漏洞 Payload 构造",
        calls: 2134,
        successRate: 96.9,
      },
      {
        id: "C30",
        name: "缺陷单自动完善",
        calls: 2987,
        successRate: 97.8,
      },
      {
        id: "C31",
        name: "压测脚本与分析",
        calls: 1876,
        successRate: 95.5,
      },
      {
        id: "C32",
        name: "UI 自动化修复",
        calls: 2345,
        successRate: 96.7,
      },
    ],
  },
  {
    title: "第七阶段：DevOps 与运维",
    icon: Cloud,
    color: "#f59e0b",
    bgColor: "from-[#f59e0b]/10 to-[#d97706]/10",
    tags: ["周热门", "推荐"] as string[],
    components: [
      {
        id: "C33",
        name: "报错日志根因分析",
        calls: 4321,
        successRate: 98.9,
      },
      {
        id: "C34",
        name: "云资源降本优化",
        calls: 1654,
        successRate: 94.8,
      },
      {
        id: "C35",
        name: "开源合规审计",
        calls: 2123,
        successRate: 97.2,
      },
      {
        id: "C36",
        name: "漏扫报告转化",
        calls: 2876,
        successRate: 96.5,
      },
      {
        id: "C37",
        name: "配置文件检查",
        calls: 1987,
        successRate: 95.8,
      },
      {
        id: "C38",
        name: "容器镜像瘦身",
        calls: 3245,
        successRate: 98.3,
      },
    ],
  },
  {
    title: "第八阶段：交付实施与协同",
    icon: Shirt,
    color: "#8b5cf6",
    bgColor: "from-[#8b5cf6]/10 to-[#7c3aed]/10",
    tags: [] as string[],
    components: [
      {
        id: "C39",
        name: "项目汇报美化",
        calls: 2654,
        successRate: 97.6,
      },
      {
        id: "C40",
        name: "硬件日志诊断",
        calls: 1876,
        successRate: 96.2,
      },
      {
        id: "C41",
        name: "验收单据生成",
        calls: 1234,
        successRate: 95.5,
      },
      {
        id: "C42",
        name: "操作手册生成",
        calls: 3421,
        successRate: 98.7,
      },
      {
        id: "C43",
        name: "敏捷回顾总结",
        calls: 2134,
        successRate: 96.8,
      },
      {
        id: "C44",
        name: "研发效能分析",
        calls: 1543,
        successRate: 94.9,
      },
      {
        id: "C45",
        name: "团队知识库问答",
        calls: 2987,
        successRate: 97.5,
      },
    ],
  },
  {
    title: "第九阶段：系统扩展底座",
    icon: Server,
    color: "#3182ce",
    bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
    tags: ["月热门", "推荐"] as string[],
    components: [
      {
        id: "C46",
        name: "多模型路由网关",
        calls: 5432,
        successRate: 99.2,
      },
      {
        id: "C47",
        name: "全局视觉内核",
        calls: 4321,
        successRate: 98.9,
      },
      {
        id: "C48",
        name: "工作流编排器",
        calls: 3654,
        successRate: 97.8,
      },
      {
        id: "C49",
        name: "脚本 UI 化工具",
        calls: 2876,
        successRate: 96.5,
      },
      {
        id: "C50",
        name: "本地向量数据库",
        calls: 2134,
        successRate: 98.1,
      },
      {
        id: "C51",
        name: "授权与计费中心",
        calls: 1765,
        successRate: 95.8,
      },
      {
        id: "C52",
        name: "沙箱隔离环境",
        calls: 2345,
        successRate: 97.2,
      },
    ],
  },
  {
    title: "第十阶段：交付与可视化",
    icon: MonitorPlay,
    color: "#10b981",
    bgColor: "from-[#10b981]/10 to-[#059669]/10",
    tags: ["周热门"] as string[],
    components: [
      {
        id: "C53",
        name: "架构可视化渲染",
        calls: 3987,
        successRate: 98.6,
      },
    ],
  },
];

// 组件市场数据（用于新UI）
const componentMarketData: StageComponentData[] = [
  {
    name: "商机与售前",
    color: "#3182ce",
    bgColor: "from-[#3182ce] to-[#2b6cb0]",
    components: [
      { id: "C01", name: "标书智能解析", stage: "商机与售前", isPremium: false, icon: "📄" },
      { id: "C02", name: "方案合规审查", stage: "商机与售前", isPremium: true, icon: "✓" },
      { id: "C03", name: "竞品对比分析", stage: "商机与售前", isPremium: true, icon: "📊" },
      { id: "C04", name: "汇报话术转换", stage: "商机与售前", isPremium: true, icon: "💬" },
    ],
  },
  {
    name: "需求定义",
    color: "#10b981",
    bgColor: "from-[#10b981] to-[#059669]",
    components: [
      { id: "C07", name: "需求转 PRD", stage: "需求定义", isPremium: false, icon: "📝" },
      { id: "C08", name: "用户故事生成", stage: "需求定义", isPremium: true, icon: "👤" },
      { id: "C09", name: "原型设计建议", stage: "需求定义", isPremium: true, icon: "🎨" },
      { id: "C10", name: "验收标准细化", stage: "需求定义", isPremium: true, icon: "✅" },
    ],
  },
];

// 转换为组件阶段数据
const componentStages: ComponentStage[] = componentStagesData.map(
  (stage: ComponentStageData) => ({
    icon: <stage.icon className="w-5 h-5" />,
    name: stage.title.split("：")[1] || stage.title,
    description: "",
    count: stage.components.length,
    color: stage.color,
    bgColor: stage.bgColor,
    tags: stage.tags,
    components: stage.components.map((comp) => ({
      id: comp.id,
      name: comp.name,
      calls: comp.calls,
      isHot: Boolean(comp.calls && comp.calls > 3000),
      isNew: Boolean(
        comp.id.startsWith("C") && parseInt(comp.id.substring(1)) > 40,
      ),
      isRecommended: Boolean(comp.successRate && comp.successRate > 98),
    })),
  }),
);

export default function WorkspaceHub() {
  const router = useRouter();
  const toast = useToast();
  const handleLogout = useLogout();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [personalWorkspace, setPersonalWorkspace] = useState<Workspace | null>(
    null,
  );
  const [enterpriseWorkspace, setEnterpriseWorkspace] =
    useState<Workspace | null>(null);
  const [quota, setQuota] = useState<EnterpriseQuota | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<EnterpriseData | null>(
    null,
  );
  const [usageStats, setUsageStats] = useState<any>(null);
  const [personalWorkspaceDeleted, setPersonalWorkspaceDeleted] =
    useState(false);
  const [personalWorkspaceUpgraded, setPersonalWorkspaceUpgraded] =
    useState(false);
  const [upgradeMode, setUpgradeMode] = useState<
    "parallel" | "replace" | "migrate" | null
  >(null);
  const [isLoading, setIsLoading] = useState(true); // 添加加载状态
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(
    null,
  );
  const [deleteCheckResult, setDeleteCheckResult] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(
    null,
  );
  const [checkingDelete, setCheckingDelete] = useState(false); // 检测中的状态
  const [deleteConfirmText, setDeleteConfirmText] = useState(""); // 注销确认输入
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationInfo, setInvitationInfo] = useState<any>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [joiningCode, setJoiningCode] = useState(false);
  // 分享空间相关状态
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  
  // 新添加的状态
  const [userQuota, setUserQuota] = useState<UserQuota | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [adminReviewingId, setAdminReviewingId] = useState<string | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const stepUpCallbackRef = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    // 首先检查用户是否已登录
    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.warn("用户未登录，即将重定向到登录页面...");
      setRedirecting(true);
      // 直接跳转，不使用 setTimeout
      window.location.href = "/auth/login";
      return;
    }

    // 已登录，继续加载页面
    // 检查 URL 参数中的邀请码
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("invitationCode");
    if (codeFromUrl) {
      setInvitationCode(codeFromUrl);
      setShowJoinModal(true);
      verifyInvitation(codeFromUrl);
    }
    // 从 localStorage 读取升级方式
    const mode = localStorage.getItem("upgradeMode");
    if (mode && ["parallel", "replace", "migrate"].includes(mode)) {
      setUpgradeMode(mode as "parallel" | "replace" | "migrate");
    }
    // 从 localStorage 读取个人空间删除状态
    const deleted = localStorage.getItem("personalWorkspaceDeleted");
    if (deleted === "true") {
      setPersonalWorkspaceDeleted(true);
      // 如果是删除状态，确保升级状态为 false
      setPersonalWorkspaceUpgraded(false);
      localStorage.setItem("personalWorkspaceUpgraded", "false");
    } else {
      // 从 localStorage 读取个人空间升级状态
      const upgraded = localStorage.getItem("personalWorkspaceUpgraded");
      if (upgraded === "true") {
        setPersonalWorkspaceUpgraded(true);
      }
    }

    // 加载用户信息
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        console.warn("User ID not found in localStorage, redirecting to login...");
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/user/workspace-hub/dashboard", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          console.warn("用户认证失效，请重新登录");
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          router.push("/auth/login");
        }
        return;
      }

      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        setDashboardData(d);
        setUser(d.user);

        // 如果个人空间实际存在，重置 personalWorkspaceDeleted 状态
        if (d.personalWorkspace) {
          setPersonalWorkspace(d.personalWorkspace);
          setPersonalWorkspaceDeleted(false);
          localStorage.setItem("personalWorkspaceDeleted", "false");
        } else {
          setPersonalWorkspace(null);
        }

        // 默认取第一个企业空间兼容单空间逻辑
        setEnterpriseWorkspace(d.enterpriseWorkspaces[0] || null);

        // 兼容原有的配额与限制状态
        setQuota({
          hasEnterprise: d.userQuota.ownedEnterpriseCount > 0,
          enterpriseCount: d.userQuota.ownedEnterpriseCount,
          maxEnterprise: d.userQuota.maxEnterpriseLimit,
          isMember: d.userQuota.isVip,
        });

        setUserQuota({
          isVip: d.userQuota.isVip,
          ownedEnterpriseCount: d.userQuota.ownedEnterpriseCount,
          maxEnterpriseLimit: d.userQuota.maxEnterpriseLimit,
        });

        // 兼容原有的企业列表状态
        setEnterpriseData({
          workspaces: d.enterpriseWorkspaces,
          statistics: {
            totalWorkspaces: d.userQuota.ownedEnterpriseCount,
            totalComponents: d.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.componentCount || 0), 0),
            totalMembers: d.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.memberCount || 0), 0),
          },
        });

        // 兼容原有的使用统计状态，包含 Token 与活跃组件
        setUsageStats({
          totalComponentCalls: Math.round(d.userQuota.quotas.tokenBalance.historyTotalUsed / 120),
          activeComponents: d.personalWorkspace?.componentCount || 0,
          successRate: 98.5,
          avgResponseTime: 120,
          personalSpaceCount: d.personalWorkspace ? 1 : 0,
          enterpriseSpaceCount: d.userQuota.ownedEnterpriseCount,
          totalMembers: d.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.memberCount || 0), 0) + (d.personalWorkspace ? 1 : 0),
          totalComponents: d.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.componentCount || 0), 0) + (d.personalWorkspace?.componentCount || 0),
        });
      }
    } catch (error) {
      console.error("加载用户信息与 Dashboard 聚合数据失败:", error);
      setPersonalWorkspace(null);
      setEnterpriseWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterWorkspace = async (workspace: Workspace | null) => {
    toast.info("正在加载空间信息...", 1000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (workspace) {
      router.push(`/workspace/${workspace.id}`);
    } else {
      router.push("/workspace-hub/create");
    }
  };

  const handleGoToCreateEnterprise = () => {
    if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
      toast.error(`您当前最多可创建${quota.maxEnterprise}个企业空间`);
      return;
    }
    router.push("/workspace-hub/create");
  };

  const handleExpandEnterprise = (workspaceId: string) => {
    router.push(
      `/workspace-hub/create?action=expand&workspaceId=${workspaceId}`,
    );
  };

  /**
   * 统一的用户认证失效处理
   * 当 API 返回用户不存在或 404 错误时，显示友好提示并跳转到登录页
   */
  const handleAuthError = (errorMessage: string, statusCode?: number) => {
    // 检查是否是用户不存在的错误
    if (errorMessage.includes("用户不存在") || statusCode === 404) {
      toast.error("会话已过期，请重新登录");
      // 清除本地存储
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      // 延迟跳转到登录页
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
      return true;
    }
    return false;
  };

  /**
   * 检查用户 ID 是否有效，无效则显示提示并跳转登录
   */
  const checkUserId = () => {
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : "";
    if (!userId) {
      toast.error("会话已过期，请重新登录");
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      router.push("/auth/login");
      return null;
    }
    return userId;
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      // 开始检测，显示检测中提示
      setCheckingDelete(true);
      setWorkspaceToDelete(workspaceId);

      // 调用检测 API
      const res = await fetch(
        `/api/workspace/check-delete?workspaceId=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${userId}`,
          },
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.message || "检查失败";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, res.status)) {
          return;
        }

        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        throw new Error(errorMsg);
      }

      const checkData = await res.json();
      setDeleteCheckResult(checkData);

      // 如果有阻止删除的问题，显示详细错误
      if (checkData.issues && checkData.issues.length > 0) {
        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        const errorMessage = checkData.issues.length > 0
          ? `❌ 无法注销：${checkData.issues.join('；')}`
          : "❌ 无法注销，存在未知问题";
        toast.error(errorMessage);
        return;
      }

      // 检测通过，显示注销确认弹窗
      setCheckingDelete(false);
      setShowDeleteModal(true);
    } catch (error) {
      console.warn("Check delete workspace error:", error);
      setCheckingDelete(false);
      setWorkspaceToDelete(null);
      toast.error(error instanceof Error ? error.message : "检查失败");
    }
  };

  const handleCreatePersonal = async () => {
    try {
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        setPersonalWorkspace(createData.workspace);
        toast.success("个人空间创建成功");
        // 跳转到个人空间页面
        setTimeout(() => {
          router.push(`/workspace/${createData.workspace.id}`);
        }, 500);
      } else {
        const errorData = await createRes.json();
        const errorMsg = errorData.error || errorData.message || "创建失败";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, createRes.status)) {
          return;
        }

        throw new Error(errorMsg);
      }
    } catch (error) {
      console.warn("Create personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  // 新添加的业务逻辑函数
  const handleCreateEnterprise = () => {
    if (!userQuota) return;
    
    if (!userQuota.isVip) {
      toast.error("您当前为免费社区版，无法创建企业协作空间。请开通 VIP 获取企业空间额度。");
      return;
    }
    
    if (userQuota.ownedEnterpriseCount >= userQuota.maxEnterpriseLimit) {
      toast.error(`您的企业空间额度已达上限 (${userQuota.maxEnterpriseLimit}个)，请升级至更高版本。`);
      return;
    }
    
    // 符合条件，跳转到创建企业空间页面
    router.push("/workspace-hub/create");
  };

  const handleComponentClick = (component: ComponentItem) => {
    if (component.isPremium) {
      setShowPremiumModal(true);
      return;
    }
    toast.info("请先进入工作空间后使用组件");
  };

  const handleDeleteUpgradedPersonal = () => {
    setShowDeleteConfirmModal(true);
    setDeleteConfirmText("");
  };

  const confirmDeleteUpgradedPersonal = async (token?: string) => {
    console.log("开始确认注销个人空间...");
    console.log("deleteConfirmText:", deleteConfirmText);
    console.log("personalWorkspace:", personalWorkspace);

    if (deleteConfirmText !== "注销") {
      toast.error('请输入"注销"以确认操作');
      return;
    }

    if (!personalWorkspace) {
      console.error("personalWorkspace 不存在");
      toast.error("个人空间不存在");
      return;
    }

    if (!token) {
      stepUpCallbackRef.current = confirmDeleteUpgradedPersonal;
      setShowStepUpModal(true);
      return;
    }

    try {
      setDeleting(true);
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      console.log("开始调用删除 API，workspaceId:", personalWorkspace.id);
      const deleteRes = await fetch(
        `/api/workspace/delete?workspaceId=${personalWorkspace.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({
            workspaceId: personalWorkspace.id,
            action: "DELETE",
            verifyToken: token,
          }),
        },
      );

      console.log("删除 API 响应状态:", deleteRes.status);

      if (deleteRes.ok) {
        setPersonalWorkspace(null);
        // 关键修复：注销已升级的个人空间时，保持 personalWorkspaceUpgraded 为 true
        // 因为用户之前已经升级过，只是现在注销了个人空间而已
        setPersonalWorkspaceDeleted(true);
        localStorage.setItem("personalWorkspaceDeleted", "true");
        // personalWorkspaceUpgraded 保持为 true，不要设置为 false
        // localStorage.setItem("personalWorkspaceUpgraded", "false"); // 删除这行
        // localStorage.removeItem("upgradeMode"); // 删除这行，保持 upgradeMode
        setShowDeleteConfirmModal(false);
        setDeleteConfirmText("");
        toast.success("个人空间已注销");
      } else {
        const errorData = await deleteRes.json();
        const errorMsg = errorData.error || errorData.message || "注销失败";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, deleteRes.status)) {
          return;
        }

        console.error("删除失败:", errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Delete upgraded personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "注销失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleRecreatePersonal = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("请先登录");
        setTimeout(() => {
          router.push("/auth/login");
        }, 1500);
        return;
      }

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        console.log("重新创建个人空间成功:", createData.workspace);
        setPersonalWorkspace(createData.workspace);
        setPersonalWorkspaceDeleted(false);
        setPersonalWorkspaceUpgraded(false);
        setUpgradeMode(null);
        localStorage.setItem("personalWorkspaceDeleted", "false");
        localStorage.setItem("personalWorkspaceUpgraded", "false");
        localStorage.removeItem("upgradeMode");
        console.log(
          "状态已更新：personalWorkspaceDeleted=false, personalWorkspaceUpgraded=false, upgradeMode=null",
        );
        toast.success("个人空间创建成功");
      } else {
        const errorData = await createRes.json();
        const errorMessage = errorData.error || errorData.message || "创建失败";

        // 如果是用户不存在，显示友好提示并跳转到登录页
        if (errorMessage.includes("用户不存在") || createRes.status === 404) {
          toast.error("会话已过期，请重新登录");
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          setTimeout(() => {
            router.push("/auth/login");
          }, 1500);
        } else {
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      console.warn("Recreate personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  const confirmDeleteWorkspace = async (token?: string) => {
    if (!workspaceToDelete) return;

    if (!token) {
      stepUpCallbackRef.current = confirmDeleteWorkspace;
      setShowStepUpModal(true);
      return;
    }

    try {
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      // 执行注销操作（物理删除）
      setDeletingWorkspaceId(workspaceToDelete);
      const deleteRes = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: workspaceToDelete,
          action: "DELETE", // 物理删除
          verifyToken: token,
        }),
      });

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        const errorMsg = errorData.error || errorData.message || "注销失败";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, deleteRes.status)) {
          return;
        }

        throw new Error(errorMsg);
      }

      toast.success("空间已注销");
      setShowDeleteModal(false);
      setWorkspaceToDelete(null);
      setDeleteCheckResult(null);
      setDeleteConfirmText(""); // 重置确认输入

      // 重新加载数据
      await loadUserInfo();
    } catch (error) {
      console.error("Delete workspace error:", error);
      toast.error(error instanceof Error ? error.message : "注销失败");
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const cancelDeleteWorkspace = () => {
    setShowDeleteModal(false);
    setWorkspaceToDelete(null);
    setDeleteCheckResult(null);
    setDeleteConfirmText(""); // 重置确认输入
  };

  const handleUpgradeWorkspace = () => {
    if (!personalWorkspace) {
      toast.error("请先创建个人空间");
      return;
    }
    if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
      toast.error(`您当前最多可拥有${quota.maxEnterprise}个企业空间`);
      return;
    }
    router.push(`/workspace/upgrade?workspaceId=${personalWorkspace.id}`);
  };

  const handleGoToPersonalSettings = () => {
    toast.info("正在加载个人空间设置...", 1000);
    setTimeout(() => {
      router.push("/workspace-hub/settings");
    }, 1000);
  };

  const handleGoToStudio = () => {
    toast.info("正在打开组件库...", 1000);
    const wsId = localStorage.getItem("currentWorkspaceId") || personalWorkspace?.id || enterpriseWorkspace?.id || "";
    setTimeout(() => {
      router.push(`/studio${wsId ? `?workspaceId=${wsId}` : ""}`);
    }, 1000);
  };

  const handleGoToStage = (stageIndex: number) => {
    toast.info(`正在加载${componentStages[stageIndex].name}...`, 1000);
    const wsId = localStorage.getItem("currentWorkspaceId") || personalWorkspace?.id || enterpriseWorkspace?.id || "";
    setTimeout(() => {
      router.push(`/studio?stage=${stageIndex}${wsId ? `&workspaceId=${wsId}` : ""}`);
    }, 1000);
  };

  const handleGoToComponent = (stageIndex: number, componentId: string) => {
    const wsId = localStorage.getItem("currentWorkspaceId") || personalWorkspace?.id || enterpriseWorkspace?.id || "";
    router.push(`/studio?workspaceId=${wsId}&componentId=${componentId}`);
  };

  const handleGoToGuide = () => {
    toast.info("正在打开组件库操作手册...", 1000);
    setTimeout(() => {
      router.push("/studio/guide");
    }, 1000);
  };

  const verifyInvitation = async (code: string) => {
    try {
      setVerifyingCode(true);
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      const res = await fetch(`/api/workspace/invitation/verify?code=${code}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setInvitationInfo(data.invitation);
      } else {
        const errorMsg = data.error || data.message || "邀请码无效";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, res.status)) {
          return;
        }

        setInvitationInfo(null);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("验证邀请码失败:", error);
      toast.error("验证邀请码失败");
      setInvitationInfo(null);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleAdminReview = async (id: string, status: "APPROVED" | "REJECTED") => {
    try {
      setAdminReviewingId(id);
      const res = await fetch("/api/admin/upgrade-applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
        body: JSON.stringify({ id, status }),
      });

      if (!res.ok) throw new Error("审核失败");

      toast.success(status === "APPROVED" ? "企业升级申请已通过" : "企业升级申请已驳回");
      
      // 重新加载数据
      await loadUserInfo();
    } catch (error) {
      console.error("Admin review error:", error);
      toast.error("操作失败，请重试");
    } finally {
      setAdminReviewingId(null);
    }
  };

  const handleJoinWorkspace = async () => {
    if (!invitationCode) {
      toast.error("请输入邀请码");
      return;
    }

    if (!invitationInfo) {
      toast.error("请先验证邀请码");
      return;
    }

    try {
      setJoiningCode(true);
      const userId = checkUserId();
      if (!userId) {
        return;
      }

      const res = await fetch("/api/workspace/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          invitationCode,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`已成功加入空间 "${data.workspace.name}"`);
        setShowJoinModal(false);
        setInvitationCode("");
        setInvitationInfo(null);
        // 重新加载用户信息
        await loadUserInfo();
        // 跳转到新加入的空间
        router.push(`/workspace/${data.workspace.id}`);
      } else {
        const errorMsg = data.error || data.message || "加入空间失败";

        // 检查是否是认证错误
        if (handleAuthError(errorMsg, res.status)) {
          return;
        }

        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("加入空间失败:", error);
      toast.error("加入空间失败");
    } finally {
      setJoiningCode(false);
    }
  };

  const handleOpenJoinModal = () => {
    setShowJoinModal(true);
    setInvitationCode("");
    setInvitationInfo(null);
  };

  const handleCloseJoinModal = () => {
    setShowJoinModal(false);
    setInvitationCode("");
    setInvitationInfo(null);
  };

  // 分享空间相关函数
  const loadShareableWorkspaces = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        return;
      }

      const res = await fetch("/api/workspace/shareable-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) {
        throw new Error("加载失败");
      }

      const data = await res.json();
      const workspacesList = data.success ? data.data : (data.workspaces || []);
      const invitationsList = data.invitations || [];

      // 统一格式化为 Workspace 接口类型
      const formattedWorkspaces = workspacesList.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        type: ws.type || "ENTERPRISE",
        memberCount: ws.memberCount ?? (ws._count?.workspacemember || 0),
        description: ws.description || null,
      }));

      setWorkspaces(formattedWorkspaces);
      setInvitations(invitationsList);

      if (formattedWorkspaces.length > 0) {
        setSelectedWorkspace(formattedWorkspaces[0].id);
      }
    } catch (error) {
      console.error("加载可分享空间失败:", error);
      toast.error("加载失败");
    }
  };

  const handleOpenShareModal = async () => {
    setShowShareModal(true);
    await loadShareableWorkspaces();
  };

  const handleGenerateInvitation = async () => {
    if (!selectedWorkspace) {
      toast.error("请选择要分享的空间");
      return;
    }

    try {
      setGenerating(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          email: showAdvanced ? inviteEmail : null,
          expiresInDays: showAdvanced ? expiresInDays : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }

      toast.success("邀请码生成成功");
      await loadShareableWorkspaces();
    } catch (error) {
      console.warn("生成邀请码失败:", error);
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("邀请码已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/workspace-hub?invitationCode=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("链接已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyInvitation = (code: string, invitationUrl: string) => {
    const text = `邀请您加入工作空间！\n\n邀请码：${code}\n\n点击链接加入：${invitationUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // 如果正在加载，显示加载界面
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f8ff]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">正在加载工作空间...</p>
        </div>
      </div>
    );
  }

  // 如果正在重定向，不渲染任何内容
  if (redirecting) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f8ff]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">正在跳转到登录页面...</p>
        </div>
      </div>
    );
  }

  // 计算 SVG 配额进度
  const tokenQuota = dashboardData?.userQuota?.quotas?.tokenBalance;
  const tokenUsed = tokenQuota?.used || 0;
  const tokenTotal = tokenQuota?.total || 10000;
  const tokenUsedPercent = Math.min(100, Math.round((tokenUsed / tokenTotal) * 100));
  
  // SVG 环参数
  const strokeWidth = 8;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (tokenUsedPercent / 100) * circumference;

  // 根据会员等级决定环渐变色与徽章
  const membership = user?.membershipLevel || "FREE";
  let gradientStart = "#10b981"; // 绿色
  let gradientEnd = "#3b82f6";   // 蓝色
  let levelText = "社区免费极客";
  let levelBg = "bg-gradient-to-r from-emerald-500/10 to-blue-500/10 text-emerald-600 border border-emerald-500/20";
  let levelIcon = "🌱";
  
  if (membership === "GOLD") {
    gradientStart = "#fbbf24";
    gradientEnd = "#d97706";
    levelText = "黄金 VIP 会员";
    levelBg = "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 border border-amber-500/20";
    levelIcon = "👑";
  } else if (membership === "DIAMOND" || membership === "ENTERPRISE") {
    gradientStart = "#8b5cf6";
    gradientEnd = "#6366f1";
    levelText = "至尊钻石极客";
    levelBg = "bg-gradient-to-r from-violet-500/15 to-indigo-500/15 text-indigo-700 border border-violet-500/20";
    levelIcon = "💎";
  }

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff] overflow-y-auto">
      {/* 背景：渐变效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.06] rounded-full blur-[120px]" />
      </div>

      {/* 核心区 */}
      <main className="relative z-10 px-6 py-8 max-w-7xl mx-auto">
        {/* 欢迎与面包屑导航 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800 mb-2 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 bg-clip-text text-transparent flex items-center gap-2">
              工作空间中枢
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              协同您的个人独立研发环境和企业级高阶团队工作室
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-500 rounded-xl bg-white/60 backdrop-blur-sm shadow-sm transition-all duration-300 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <span>注销退出</span>
          </button>
        </div>

        {/* 核心 Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
          
          {/* Card 1: 用户欢迎与个人空间 Bento 块 (占 4 列) */}
          <div className="md:col-span-4 relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-blue-500/20 transition-all duration-300">
            {/* 卡片装饰 */}
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full blur-2xl group-hover:scale-125 transition-all duration-500" />
            
            {/* 用户身份与头像 */}
            <div className="flex items-center gap-4 mb-6 relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/25 relative overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name || "Avatar"} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-white" />
                )}
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight leading-none mb-2">
                  {user?.name || "极客研发者"}
                </h3>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide ${levelBg}`}>
                  <span>{levelIcon}</span>
                  <span>{levelText}</span>
                </span>
              </div>
            </div>

            {/* 个人工作空间状态 */}
            <div className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-2xl relative mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-700">个人主空间</span>
                {personalWorkspaceDeleted && upgradeMode === "replace" ? (
                  <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-black rounded-full border border-red-100">
                    已替换注销
                  </span>
                ) : personalWorkspaceDeleted ? (
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-black rounded-full border border-slate-300">
                    已注销
                  </span>
                ) : upgradeMode === "migrate" && !personalWorkspace ? (
                  <span className="px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-black rounded-full border border-[#f59e0b]/20">
                    已迁移升级
                  </span>
                ) : personalWorkspaceUpgraded && personalWorkspace ? (
                  <span className="px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-black rounded-full border border-[#f59e0b]/20">
                    已并行升级
                  </span>
                ) : personalWorkspace ? (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full border border-emerald-100">
                    已激活
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded-full">
                    未创建
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                {personalWorkspaceDeleted && upgradeMode === "replace"
                  ? "个人空间已被物理注销，对应的数据已清理完毕。您可以选择重新创建干净的个人空间。"
                  : personalWorkspaceDeleted
                    ? "个人空间已注销。所有本地资产已清空，如需使用请点击重新创建按钮。"
                    : upgradeMode === "migrate" && !personalWorkspace
                      ? "您的个人资产已完全平移升级为企业空间，所有组件和项目已迁移。请直接前往企业空间继续工作。"
                      : personalWorkspace ? `适合独立开发、常用轻量级任务，提供专属调用接口。当前已绑定 ${(personalWorkspace.componentCount || 0)} 个组件。`
                      : "适合独立开发者与个人项目使用，提供基础的组件调用和资产管理。"}
              </p>

              {/* 升级提示 */}
              {personalWorkspace && quota && quota.enterpriseCount < quota.maxEnterprise && !personalWorkspaceUpgraded && (
                <div className="mb-3 p-2 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-600">可升级为企业空间</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpgradeWorkspace();
                    }}
                    className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black rounded-lg shadow-sm transition-all flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>升级</span>
                    <ArrowUpRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>

            {/* 个人空间操作按钮组 */}
            <div className="flex items-center gap-2">
              {upgradeMode === "migrate" && !personalWorkspace ? (
                // 平移升级后个人空间不操作
                <div className="text-xs text-slate-400 italic text-center w-full py-1">空间已全量迁移至企业</div>
              ) : !personalWorkspace && (personalWorkspaceDeleted || personalWorkspaceUpgraded) ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRecreatePersonal();
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-black rounded-xl hover:shadow-md hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重新创建个人空间</span>
                </button>
              ) : personalWorkspace ? (
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterWorkspace(personalWorkspace);
                    }}
                    className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-black rounded-xl hover:shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>进入个人空间</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUpgradedPersonal();
                    }}
                    className="px-3 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="注销个人空间"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreatePersonal();
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-black rounded-xl hover:shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>创建个人空间</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Card 2: 超级管理员监控与审批 Bento 看板 (若是管理员, 占 8 列) */}
          {isAdmin && (
            <div className="md:col-span-8 relative overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-red-500/20 transition-all duration-300">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-red-500/5 to-transparent rounded-bl-full -mr-8 -mt-8" />
              
              {/* 标题 */}
              <div className="flex items-center justify-between mb-4 relative">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <ShieldCheck className="w-4 h-4 text-red-500" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    系统超级管理中枢
                  </h3>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  管理中枢正常运行
                </span>
              </div>

              {/* 宏观监控指标气泡网格 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 relative">
                <div className="p-3 bg-red-50/30 border border-red-100/50 rounded-2xl text-left">
                  <div className="text-[10px] text-slate-500 font-bold mb-1">全站总用户</div>
                  <div className="text-lg font-black text-slate-800">
                    {dashboardData?.systemStats?.totalUsers?.toLocaleString() || "-"}
                  </div>
                </div>
                <div className="p-3 bg-red-50/30 border border-red-100/50 rounded-2xl text-left">
                  <div className="text-[10px] text-slate-500 font-bold mb-1">总工作空间</div>
                  <div className="text-lg font-black text-slate-800">
                    {dashboardData?.systemStats?.totalWorkspaces?.toLocaleString() || "-"}
                  </div>
                </div>
                <div className="p-3 bg-red-50/30 border border-red-100/50 rounded-2xl text-left">
                  <div className="text-[10px] text-slate-500 font-bold mb-1">已开发组件</div>
                  <div className="text-lg font-black text-slate-800">
                    {dashboardData?.systemStats?.totalComponents?.toLocaleString() || "-"}
                  </div>
                </div>
                <div className="p-3 bg-red-50/30 border border-red-100/50 rounded-2xl text-left">
                  <div className="text-[10px] text-slate-500 font-bold mb-1">全站月 Token</div>
                  <div className="text-lg font-black text-red-600">
                    {dashboardData?.systemStats?.monthTokens?.toLocaleString() || "-"}
                  </div>
                </div>
              </div>

              {/* 滚动审批待办面板 */}
              <div className="relative">
                <div className="text-xs font-black text-slate-700 mb-2">待审核企业升级申请 ({dashboardData?.pendingApplications?.length || 0})</div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {dashboardData?.pendingApplications && dashboardData.pendingApplications.length > 0 ? (
                    dashboardData.pendingApplications.map((app: any) => (
                      <div key={app.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 hover:border-red-200/50 transition-all">
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-black text-slate-800 truncate">{app.companyName}</span>
                            <span className="text-[9px] text-slate-400 font-bold">({app.contactName})</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            申请升级空间：{app.workspaceName}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleAdminReview(app.id, "APPROVED")}
                            disabled={adminReviewingId === app.id}
                            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-black rounded-lg transition-all cursor-pointer"
                          >
                            {adminReviewingId === app.id ? "处理中" : "通过"}
                          </button>
                          <button
                            onClick={() => handleAdminReview(app.id, "REJECTED")}
                            disabled={adminReviewingId === app.id}
                            className="px-2.5 py-1 border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-500 text-[10px] font-black rounded-lg transition-all cursor-pointer"
                          >
                            拒绝
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                      <span className="text-xs text-slate-500 font-bold">✨ 暂无待审批的申请，系统健康平稳</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Card 3: 企业协作空间列表 Bento 板 (若非管理员，在第一行占 8 列；若是管理员，在第二行占 8 列) */}
          <div className={`${isAdmin ? "md:col-span-8" : "md:col-span-8"} relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-emerald-500/20 transition-all duration-300`}>
            {/* 顶栏 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Building2 className="w-4 h-4 text-emerald-500" />
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  企业协作工作空间
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleGoToCreateEnterprise}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-black rounded-xl hover:shadow-md transition-all flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新建协作空间</span>
                </button>
                <button
                  onClick={handleOpenShareModal}
                  className="px-3 py-1.5 border border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 text-[10px] font-black rounded-xl transition-all flex items-center gap-0.5 cursor-pointer"
                >
                  <Users className="w-3 h-3" />
                  <span>分享空间</span>
                </button>
              </div>
            </div>

            {/* 企业空间内容区 */}
            {enterpriseData && enterpriseData.workspaces.length > 0 ? (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {enterpriseData.workspaces.map((ws, index) => (
                  <div
                    key={ws.id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white hover:bg-slate-50/50 rounded-2xl border border-slate-200/80 hover:border-emerald-500/30 transition-all duration-300 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-black text-white">{index + 1}</span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 truncate">{ws.name}</h4>
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded-full border border-emerald-100">
                          已激活
                        </span>
                      </div>
                      
                      {/* 企业空间专属算力进度条 */}
                      <div className="w-full md:max-w-xs mb-1">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-1 font-bold">
                          <span>专属算力 Quota</span>
                          <span>75% 剩余</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
                            style={{ width: "75%" }}
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {ws.memberCount || 1} 名协同成员 · {ws.componentCount || 0} 个绑定组件
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleEnterWorkspace({ ...ws, type: "ENTERPRISE" })}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded-lg shadow-sm transition-all flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>进入空间</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => handleExpandEnterprise(ws.id)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all flex items-center gap-0.5 cursor-pointer"
                        title="扩容额度"
                      >
                        <TrendingUp className="w-2.5 h-2.5 text-slate-500" />
                        <span>扩容</span>
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(ws.id)}
                        disabled={deletingWorkspaceId === ws.id || checkingDelete}
                        className="px-2.5 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                      >
                        {checkingDelete && workspaceToDelete === ws.id ? "检测中" : "注销"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 rounded-2xl text-left">
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  企业协作工作空间是面向工作室或研发团队的协作环境。支持多人协同开发（产品、设计、开发、测试），共享算力配额，并开启细粒度安全合规管理和组件级岗位过滤。
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-white/60 border border-slate-200/50 rounded-xl">
                    <div className="text-[10px] font-black text-slate-700 mb-0.5">👥 多角色协同</div>
                    <div className="text-[9px] text-slate-500">一键分享空间邀请码</div>
                  </div>
                  <div className="p-3 bg-white/60 border border-slate-200/50 rounded-xl">
                    <div className="text-[10px] font-black text-slate-700 mb-0.5">📈 共享算力配额</div>
                    <div className="text-[9px] text-slate-500">统一管控月度 Token</div>
                  </div>
                </div>
                <button
                  onClick={handleGoToCreateEnterprise}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-black rounded-xl hover:shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>立即开通企业空间</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Card 4: SVG 圆环配额进度仪表盘与 VIP 升级卡片 (占 4 列) */}
          <div className="md:col-span-4 relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-violet-500/20 transition-all duration-300 flex flex-col justify-between">
            <div>
              {/* 标题 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                    <Activity className="w-4 h-4 text-violet-500" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    算力消耗与 Quota
                  </h3>
                </div>
              </div>

              {/* SVG 圆环仪表盘 */}
              <div className="relative flex items-center justify-center py-4 mb-4">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-32 h-32 transform -rotate-90">
                    {/* 背景环 */}
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      stroke="#f1f5f9"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                    />
                    {/* 进度环 */}
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      stroke="url(#progressGradient)"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={gradientStart} />
                        <stop offset="100%" stopColor={gradientEnd} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-800 tracking-tighter leading-none mb-1">
                      {tokenUsedPercent}%
                    </span>
                    <span className="text-[9px] text-slate-400 font-extrabold tracking-wider uppercase">已使用</span>
                  </div>
                </div>
              </div>

              {/* 本月详细 Token 数额 */}
              <div className="grid grid-cols-2 gap-2 text-center p-3 bg-slate-50 rounded-2xl border border-slate-200/50 mb-4">
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-0.5">本月已用 Token</div>
                  <div className="text-sm font-black text-slate-800">
                    {tokenUsed.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-0.5">可用 Token 上限</div>
                  <div className="text-sm font-black text-slate-800">
                    {tokenTotal.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* VIP 升级或特权展示 */}
            {membership === "FREE" ? (
              <div className="p-3.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/25 rounded-2xl relative">
                <div className="text-[10px] font-black text-amber-800 mb-1 flex items-center gap-1">
                  <span>👑</span>
                  <span>开通黄金/钻石 VIP 尊享特权</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed mb-3">
                  立享 50,000+ 算力，解锁 53 个高阶研发组件并允许最多创建 3 个企业协同空间。
                </p>
                <button
                  onClick={() => router.push("/pricing")}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[10px] font-black rounded-lg shadow-sm hover:shadow-lg transition-all text-center flex items-center justify-center gap-0.5 cursor-pointer"
                >
                  <span>立即升级 VIP</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/25 rounded-2xl">
                <div className="text-[10px] font-black text-indigo-800 mb-1 flex items-center gap-1">
                  <span>🚀</span>
                  <span>您已尊享 VIP 专业级特权</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  享有多空间协同配额及全站高阶工坊组件，感谢您支持极客生态。
                </p>
              </div>
            )}
          </div>

          {/* Card 5: 个人空间设置 Bento 卡片 (占 4 列) */}
          <div className="md:col-span-4 relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-slate-400/20 transition-all duration-300">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-200/80 flex items-center justify-center flex-shrink-0 shadow-sm border border-slate-300/30">
                <Settings className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
                  个人空间设置
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  研发偏好及第三方配置
                </p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed line-clamp-2">
              配置个人编辑器快捷键、数据备份与导出、API-Key 第三方应用授权及云服务器部署。
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-left">
                <span className="text-[10px] font-bold text-slate-700 block mb-0.5">偏好配置</span>
                <span className="text-[9px] text-slate-400">主题、快捷键</span>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-left">
                <span className="text-[10px] font-bold text-slate-700 block mb-0.5">集成管理</span>
                <span className="text-[9px] text-slate-400">Git 与 Webhook</span>
              </div>
            </div>

            <button
              onClick={handleGoToPersonalSettings}
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-500 transition-all cursor-pointer"
            >
              <span>直达个人设置</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Card 6: 加入已有空间 Bento 卡片 (占 4 列) */}
          <div className="md:col-span-4 relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-emerald-500/20 transition-all duration-300">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-emerald-500/20">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
                  加入已有工作空间
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  通过邀请码加入团队
                </p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed line-clamp-2">
              使用同事分享的 8 位大写邀请码或安全链接，直接加入企业组织，开启团队无缝协作。
            </p>

            <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-500/15 text-left mb-4">
              <span className="text-[9px] text-emerald-700 font-bold block mb-0.5">快捷指南：</span>
              <span className="text-[9px] text-slate-500 block leading-tight">1. 输入 8 位码 ➔ 2. 自动校验 ➔ 3. 一键加入</span>
            </div>

            <button
              onClick={handleOpenJoinModal}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-all cursor-pointer"
            >
              <span>立即输入加入</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Card 7: 极客后台管理/组件库导航 Bento 快捷卡片 (占 4 列) */}
          <div className="md:col-span-4 relative group overflow-hidden bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-violet-500/20 transition-all duration-300">
            {isAdmin ? (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-red-500/20">
                    <ShieldCheck className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
                      系统超级后台
                    </h3>
                    <p className="text-[10px] text-red-500 font-bold mt-1">
                      超管级运维入口
                    </p>
                  </div>
                </div>
                
                <p className="text-xs text-slate-600 mb-4 leading-relaxed line-clamp-2">
                  进行系统全局监控、安全合规审计、申诉仲裁待办处理以及进行全局核心配额调整。
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <a href="/admin/workspaces" className="p-2 bg-slate-50 hover:bg-red-50 rounded-xl border border-slate-200 text-left block">
                    <span className="text-[10px] font-bold text-slate-700 block">审批管理</span>
                    <span className="text-[8px] text-slate-400">企业升级</span>
                  </a>
                  <a href="/admin/appeals" className="p-2 bg-slate-50 hover:bg-red-50 rounded-xl border border-slate-200 text-left block">
                    <span className="text-[10px] font-bold text-slate-700 block">申诉处理</span>
                    <span className="text-[8px] text-slate-400">账号解封</span>
                  </a>
                </div>

                <a
                  href="/admin"
                  className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600 transition-all cursor-pointer"
                >
                  <span>进入后台管理系统</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </>
            ) : (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-blue-500/20">
                    <Terminal className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
                      组件开发 Studio
                    </h3>
                    <p className="text-[10px] text-blue-500 mt-1">
                      组件工坊直达通道
                    </p>
                  </div>
                </div>
                
                <p className="text-xs text-slate-600 mb-4 leading-relaxed line-clamp-2">
                  直接进入组件研发工坊，浏览全套 53 个高阶云端极客组件，支持低代码及生成。
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button onClick={handleGoToStudio} className="p-2 bg-slate-50 hover:bg-blue-50 rounded-xl border border-slate-200 text-left block">
                    <span className="text-[10px] font-bold text-slate-700 block">组件工坊</span>
                    <span className="text-[8px] text-slate-400">组件设计器</span>
                  </button>
                  <button onClick={handleGoToGuide} className="p-2 bg-slate-50 hover:bg-blue-50 rounded-xl border border-slate-200 text-left block">
                    <span className="text-[10px] font-bold text-slate-700 block">说明手册</span>
                    <span className="text-[8px] text-slate-400">开发指南</span>
                  </button>
                </div>

                <button
                  onClick={handleGoToStudio}
                  className="flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-600 transition-all cursor-pointer"
                >
                  <span>立即启动组件工坊</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}
          </div>

          {/* Card 8: 舟坊空间组件库大看板 (占 12 列) */}
          <div className="md:col-span-12 relative overflow-hidden bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-indigo-500/10 rounded-3xl p-6 border border-violet-500/20 shadow-md">
            {/* 头部 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">
                    舟坊研发高阶组件库
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    提供覆盖软件全生命周期（设计、开发、测试、运维）的 53 个云端高阶极客组件
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGoToGuide}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-black rounded-xl hover:shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>操作手册</span>
                </button>
                <button
                  onClick={handleGoToStudio}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-black rounded-xl hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>浏览全量组件</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 阶段组件展示 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {componentStages.slice(0, 3).map((stage, index) => (
                <div
                  key={stage.name}
                  onClick={() => handleGoToStage(index)}
                  className="group cursor-pointer bg-white/90 rounded-2xl p-4 border border-slate-200/60 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                  style={{ borderColor: `${stage.color}25` }}
                >
                  {/* 阶段头部 */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stage.bgColor} flex items-center justify-center flex-shrink-0 shadow-sm`}
                    >
                      <div style={{ color: stage.color }}>{stage.icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="text-xs font-black text-slate-800 truncate">
                          {stage.name}
                        </h4>
                        <span
                          className="px-1.5 py-0.5 text-[9px] font-black rounded-full"
                          style={{
                            backgroundColor: `${stage.color}15`,
                            color: stage.color,
                          }}
                        >
                          {stage.count}
                        </span>
                      </div>
                      
                      {/* 热门标签 */}
                      {stage.tags && stage.tags.length > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          {stage.tags.includes("周热门") && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-gradient-to-r from-red-400 to-red-500 text-white text-[8px] font-black rounded shadow-sm">
                              <Flame className="w-2 h-2" />
                              周热门
                            </span>
                          )}
                          {stage.tags.includes("月热门") && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[8px] font-black rounded shadow-sm">
                              <TrendingUp className="w-2 h-2" />
                              月热门
                            </span>
                          )}
                          {stage.tags.includes("推荐") && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-gradient-to-r from-blue-400 to-blue-500 text-white text-[8px] font-black rounded shadow-sm">
                              <Star className="w-2 h-2" />
                              推荐
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 组件列表 */}
                  <div className="space-y-1.5 mt-2">
                    {stage.components.slice(0, 4).map((component, idx) => (
                      <div
                        key={`${stage.name}-${component.name}-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGoToComponent(index, component.id);
                        }}
                        className="group/component flex items-center justify-between p-2 hover:bg-violet-500/5 rounded-xl transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-slate-700 truncate">
                            {component.name}
                          </span>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {component.isHot && (
                              <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-gradient-to-br from-red-400 to-red-500 rounded-full text-[7px]" title="热门组件">
                                <Flame className="w-2 h-2 text-white" />
                              </span>
                            )}
                            {component.isNew && (
                              <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full text-[7px]" title="新上架">
                                <Zap className="w-2 h-2 text-white" />
                              </span>
                            )}
                            {component.isRecommended && (
                              <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full text-[7px]" title="推荐">
                                <Star className="w-2 h-2 text-white" />
                              </span>
                            )}
                          </div>
                        </div>
                        {/* 调用次数 */}
                        {component.calls && (
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <span className="text-xs font-bold text-slate-500">
                              {component.calls.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-400">次</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {stage.components.length > 5 && (
                      <div className="flex items-center justify-center p-2 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <span className="text-xs font-medium text-slate-500">
                          +{stage.components.length - 5} 更多组件
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 第三行：使用统计 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-[#e2e8f0]/80">
          <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#f59e0b]" />
            我的使用统计
          </h3>

          {/* 第一行：核心指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-xs text-slate-600 mb-1">累计组件调用</div>
              <div className="text-2xl font-black text-slate-800">
                {usageStats
                  ? (usageStats.totalComponentCalls || 0).toLocaleString()
                  : "-"}
              </div>
              <div className="text-xs text-slate-500">次</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">活跃组件</div>
              <div className="text-2xl font-black text-[#3182ce]">
                {usageStats ? usageStats.activeComponents || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">个</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">成功率</div>
              <div className="text-2xl font-black text-[#10b981]">
                {usageStats ? usageStats.successRate || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">%</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">平均响应时间</div>
              <div className="text-2xl font-black text-slate-800">
                {usageStats ? usageStats.avgResponseTime || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">毫秒</div>
            </div>
          </div>

          {/* 第二行：空间和组件统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-50 rounded-xl">
            <div>
              <div className="text-xs text-slate-600 mb-1">个人空间</div>
              <div className="text-xl font-black text-[#3182ce]">
                {usageStats ? usageStats.personalSpaceCount || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">个</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">企业空间</div>
              <div className="text-xl font-black text-[#f59e0b]">
                {usageStats ? usageStats.enterpriseSpaceCount || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">个</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">协作成员</div>
              <div className="text-xl font-black text-[#10b981]">
                {usageStats ? usageStats.totalMembers || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">人</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">总组件数</div>
              <div className="text-xl font-black text-[#8b5cf6]">
                {usageStats ? usageStats.totalComponents || 0 : "-"}
              </div>
              <div className="text-xs text-slate-500">个</div>
            </div>
          </div>

          {/* 第三行：Token 消耗和最近活动 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gradient-to-br from-[#f59e0b]/5 to-[#d97706]/5 rounded-xl border border-[#f59e0b]/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <div className="text-sm font-black text-slate-800">
                  Token 消耗统计
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1">本月消耗</div>
                  <div className="text-lg font-black text-[#f59e0b]">
                    {usageStats
                      ? (usageStats.monthlyTokens || 0).toLocaleString()
                      : "-"}
                  </div>
                  <div className="text-xs text-slate-400">tokens</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">总计消耗</div>
                  <div className="text-lg font-black text-slate-800">
                    {usageStats
                      ? (usageStats.totalTokens || 0).toLocaleString()
                      : "-"}
                  </div>
                  <div className="text-xs text-slate-400">tokens</div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-br from-[#10b981]/5 to-[#059669]/5 rounded-xl border border-[#10b981]/20">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                  <Activity className="w-3 h-3 text-white" />
                </div>
                <div className="text-sm font-black text-slate-800">
                  最近活动
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1">近 7 天任务</div>
                  <div className="text-lg font-black text-[#10b981]">
                    {usageStats ? usageStats.recentActivity || 0 : "-"}
                  </div>
                  <div className="text-xs text-slate-400">个任务</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">完成率</div>
                  <div className="text-lg font-black text-slate-800">
                    {usageStats ? usageStats.completionRate || 0 : "-"}
                  </div>
                  <div className="text-xs text-slate-400">%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 加入空间模态框 */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in duration-200">
            {/* 关闭按钮 */}
            <button
              onClick={handleCloseJoinModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all"
            >
              <span className="text-slate-500 text-xl">×</span>
            </button>

            {/* 标题 */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-black text-slate-800">
                  加入已有空间
                </h2>
              </div>
              <p className="text-sm text-slate-600">
                请输入同事分享的邀请码，或点击分享链接自动填充
              </p>
            </div>

            {/* 邀请码输入 */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                邀请码
              </label>
              <input
                type="text"
                value={invitationCode}
                onChange={(e) => {
                  const code = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "");
                  setInvitationCode(code);
                  if (code.length === 8) {
                    verifyInvitation(code);
                  } else {
                    setInvitationInfo(null);
                  }
                }}
                placeholder="请输入 8 位邀请码"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 outline-none transition-all text-center text-lg font-mono tracking-widest uppercase"
                maxLength={8}
                disabled={verifyingCode || joiningCode}
              />
              {verifyingCode && (
                <div className="mt-2 text-sm text-slate-500 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
                  <span>正在验证邀请码...</span>
                </div>
              )}
            </div>

            {/* 邀请信息展示 */}
            {invitationInfo && (
              <div className="mb-6 p-4 bg-[#10b981]/5 rounded-xl border border-[#10b981]/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800">
                      {invitationInfo.workspace.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {invitationInfo.workspace.memberCount} 名成员 ·{" "}
                      {invitationInfo.role === "ADMIN" ? "管理员" : "成员"}
                    </div>
                  </div>
                </div>
                {invitationInfo.expiresAt && (
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      有效期至{" "}
                      {new Date(invitationInfo.expiresAt).toLocaleDateString(
                        "zh-CN",
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloseJoinModal}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all"
                disabled={joiningCode}
              >
                取消
              </button>
              <button
                onClick={handleJoinWorkspace}
                disabled={!invitationInfo || joiningCode}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {joiningCode ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>正在加入...</span>
                  </>
                ) : (
                  <>
                    <span>确认加入</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享空间模态框 */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            {/* 头部 */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    分享空间
                  </h2>
                  <p className="text-xs text-slate-500">
                    生成邀请码或分享链接，邀请同事加入您的空间
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all"
              >
                <span className="text-slate-500 text-xl">×</span>
              </button>
            </div>

            {/* 内容区域 */}
            <div className="p-6 space-y-6">
              {/* 空间选择 */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#3182ce]" />
                  选择要分享的空间
                </h3>
                <div className="space-y-2">
                  {workspaces.map((workspace) => (
                    <label
                      key={workspace.id}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedWorkspace === workspace.id
                          ? "border-[#10b981] bg-[#10b981]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="radio"
                          name="workspace"
                          value={workspace.id}
                          checked={selectedWorkspace === workspace.id}
                          onChange={(e) => setSelectedWorkspace(e.target.value)}
                          className="w-4 h-4 text-[#10b981] focus:ring-[#10b981]"
                        />
                        <div className="flex-1">
                          <div className="font-bold text-slate-800">
                            {workspace.name || "未命名空间"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {workspace.description || "暂无描述"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">成员：</span>
                        <span className="font-bold text-[#10b981]">
                          {workspace._count?.members || 0}人
                        </span>
                      </div>
                    </label>
                  ))}
                  {workspaces.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无可分享的空间</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 高级选项 */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#3182ce] transition-all"
                >
                  <Settings className="w-4 h-4" />
                  <span>高级选项</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      showAdvanced ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        指定成员邮箱（可选）
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="example@company.com"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        邀请角色
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setInviteRole("MEMBER")}
                          className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border-2 transition-all ${
                            inviteRole === "MEMBER"
                              ? "border-[#10b981] bg-[#10b981]/10 text-[#10b981]"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          普通成员
                        </button>
                        <button
                          onClick={() => setInviteRole("ADMIN")}
                          className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border-2 transition-all ${
                            inviteRole === "ADMIN"
                              ? "border-[#3182ce] bg-[#3182ce]/10 text-[#3182ce]"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          管理员
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        有效期
                      </label>
                      <select
                        value={expiresInDays}
                        onChange={(e) =>
                          setExpiresInDays(Number(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] outline-none text-sm"
                      >
                        <option value={1}>1 天</option>
                        <option value={3}>3 天</option>
                        <option value={7}>7 天</option>
                        <option value={15}>15 天</option>
                        <option value={30}>30 天</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* 生成按钮 */}
              <button
                onClick={handleGenerateInvitation}
                disabled={generating || workspaces.length === 0}
                className="w-full px-4 py-3 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    <span>生成邀请码</span>
                  </>
                )}
              </button>

              {/* 邀请码列表 */}
              {invitations.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#3182ce]" />
                    已生成的邀请码
                  </h3>
                  <div className="space-y-2">
                    {invitations.map((invitation: any) => (
                      <div
                        key={invitation.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg font-mono font-bold text-[#10b981]">
                                {invitation.code}
                              </span>
                              {copiedCode === invitation.code && (
                                <span className="text-xs text-[#10b981] font-bold">
                                  已复制
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              空间：{invitation.workspace?.name || "未知空间"}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div>
                              角色：
                              <span className="font-bold text-slate-700">
                                {invitation.role === "ADMIN"
                                  ? "管理员"
                                  : "普通成员"}
                              </span>
                            </div>
                            <div>
                              过期时间：
                              <span
                                className={`font-bold ${
                                  invitation.expiresAt &&
                                  new Date(invitation.expiresAt) < new Date()
                                    ? "text-red-600"
                                    : "text-slate-700"
                                }`}
                              >
                                {invitation.expiresAt
                                  ? new Date(
                                      invitation.expiresAt,
                                    ).toLocaleDateString()
                                  : "永久有效"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 复制按钮组 */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyCode(invitation.code)}
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>复制邀请码</span>
                          </button>
                          <button
                            onClick={() => handleCopyLink(invitation.code)}
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>复制链接</span>
                          </button>
                          <button
                            onClick={() =>
                              handleCopyInvitation(
                                invitation.code,
                                `${window.location.origin}/workspace-hub?invitationCode=${invitation.code}`,
                              )
                            }
                            className="flex-1 px-3 py-2 bg-[#10b981] text-white text-xs font-bold rounded-lg hover:bg-[#059669] transition-all flex items-center justify-center gap-1"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>复制全部</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 注销空间确认模态框 */}
      {showDeleteModal && deleteCheckResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            {/* 头部 */}
            <div className="p-6 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    注销空间确认
                  </h2>
                  <p className="text-xs text-slate-500">请仔细阅读以下信息</p>
                </div>
              </div>
            </div>

            {/* 内容区域 - 可滚动 */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* 检测结果提示 */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-green-800 mb-1">
                      ✅ 系统检测完成
                    </h3>
                    <p className="text-xs text-green-700">
                      该空间符合注销条件，您可以继续进行注销操作
                    </p>
                  </div>
                </div>
              </div>

              {/* 警告信息 */}
              {deleteCheckResult.warnings &&
                deleteCheckResult.warnings.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-red-800 mb-2">
                          ⚠️ 注销后将产生以下影响：
                        </h3>
                        <ul className="space-y-1">
                          {deleteCheckResult.warnings.map(
                            (warning: string, index: number) => (
                              <li
                                key={index}
                                className="text-sm text-red-700 flex items-start gap-1.5"
                              >
                                <span className="text-red-600 mt-0.5">•</span>
                                <span>{warning}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

              {/* 空间信息 */}
              {deleteCheckResult.workspace && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 className="w-5 h-5 text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">
                      即将注销的空间：
                    </span>
                  </div>
                  <div className="ml-8">
                    <div className="text-base font-black text-slate-800 mb-1">
                      {deleteCheckResult.workspace.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      成员数：{deleteCheckResult.workspace.memberCount || 0}人 |
                      组件数： {deleteCheckResult.workspace.componentCount || 0}
                      个
                    </div>
                  </div>
                </div>
              )}

              {/* 确认提示 */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-800 mb-1">
                      重要提示：
                    </h3>
                    <p className="text-sm text-amber-700">
                      注销操作
                      <span className="font-black">不可恢复</span>
                      ，所有空间数据将被清空。请确保您已备份重要信息！
                    </p>
                  </div>
                </div>
              </div>

              {/* 确认输入 */}
              <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  请输入"确认注销"以继续：
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="确认注销"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm font-mono"
                  autoComplete="off"
                />
                {deleteConfirmText && deleteConfirmText !== "确认注销" && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>请输入正确的确认文字</span>
                  </div>
                )}
                {deleteConfirmText === "确认注销" && (
                  <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>可以继续进行注销操作</span>
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮 - 固定在底部 */}
            <div className="p-6 border-t border-slate-200 flex items-center gap-3 bg-slate-50 rounded-b-2xl flex-shrink-0">
              <button
                onClick={cancelDeleteWorkspace}
                className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button
                onClick={() => confirmDeleteWorkspace()}
                disabled={
                  deletingWorkspaceId !== null ||
                  deleteConfirmText !== "确认注销"
                }
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletingWorkspaceId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>注销中...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>确认注销</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 注销已升级个人空间确认模态框 */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            {/* 头部 */}
            <div className="p-6 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    注销个人空间确认
                  </h2>
                  <p className="text-xs text-slate-500">请仔细阅读以下信息</p>
                </div>
              </div>
            </div>

            {/* 内容区域 - 可滚动 */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* 警告信息 */}
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-red-800 mb-2">
                      ⚠️ 注销后将产生以下影响：
                    </h3>
                    <ul className="space-y-1">
                      <li className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="text-red-600 mt-0.5">•</span>
                        <span>个人空间将被永久注销，所有数据将无法恢复</span>
                      </li>
                      <li className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="text-red-600 mt-0.5">•</span>
                        <span>个人空间内的所有组件、项目等资源将被清空</span>
                      </li>
                      <li className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="text-red-600 mt-0.5">•</span>
                        <span>企业空间不会受到影响，可以继续使用</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 空间信息 */}
              {personalWorkspace && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <User className="w-5 h-5 text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">
                      即将注销的个人空间：
                    </span>
                  </div>
                  <div className="ml-8">
                    <div className="text-base font-black text-slate-800 mb-1">
                      {personalWorkspace.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      组件数：{personalWorkspace.componentCount || 0}个
                    </div>
                  </div>
                </div>
              )}

              {/* 确认提示 */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-800 mb-1">
                      重要提示：
                    </h3>
                    <p className="text-sm text-amber-700">
                      注销操作
                      <span className="font-black">不可恢复</span>
                      ，所有个人空间数据将被清空。请确保您已备份重要信息！
                    </p>
                  </div>
                </div>
              </div>

              {/* 确认输入 */}
              <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  请输入"注销"以继续：
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="注销"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm font-mono"
                  autoComplete="off"
                />
                {deleteConfirmText && deleteConfirmText !== "注销" && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>请输入正确的确认文字</span>
                  </div>
                )}
                {deleteConfirmText === "注销" && (
                  <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>可以继续进行注销操作</span>
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮 - 固定在底部 */}
            <div className="p-6 border-t border-slate-200 flex items-center gap-3 bg-slate-50 rounded-b-2xl flex-shrink-0">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setDeleteConfirmText("");
                }}
                className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button
                onClick={() => confirmDeleteUpgradedPersonal()}
                disabled={deleting || deleteConfirmText !== "注销"}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>注销中...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>确认注销</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增：高级组件拦截弹窗 */}
      {showPremiumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[8px] shadow-lg shadow-slate-200/50 max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative">
            {/* 关闭按钮 */}
            <button
              onClick={() => setShowPremiumModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all"
            >
              <span className="text-slate-500 text-xl">×</span>
            </button>

            {/* 图标 */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔒</span>
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">
                高级组件
              </h2>
              <p className="text-sm text-slate-600">
                请升级至岗位专业版或联系管理员解锁
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowPremiumModal(false);
                  // 可以在这里添加跳转到升级页面的逻辑
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all"
              >
                立即升级
              </button>
              <button
                onClick={() => setShowPremiumModal(false)}
                className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all"
              >
                稍后再说
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 新增：二次验证弹窗 */}
      <StepUpAuthModal
        isOpen={showStepUpModal}
        title="敏感操作验证"
        message="此高危操作需要进行二次身份验证，以确认是您本人操作。"
        action="delete_workspace"
        onConfirm={(token) => {
          setShowStepUpModal(false);
          if (stepUpCallbackRef.current) {
            stepUpCallbackRef.current(token);
            stepUpCallbackRef.current = null;
          }
        }}
        onCancel={() => {
          setShowStepUpModal(false);
          stepUpCallbackRef.current = null;
        }}
      />
    </div>
  );
}
