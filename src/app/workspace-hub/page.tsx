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
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  componentCount?: number;
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
      const res = await fetch("/api/auth/me");

      if (!res.ok) {
        // 检查是否是用户不存在或会话过期
        if (res.status === 404 || res.status === 401) {
          const errorData = await res.json();
          console.log("[loadUserInfo] 用户认证失效:", errorData);

          // 清除本地存储
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("personalWorkspaceDeleted");
          localStorage.removeItem("personalWorkspaceUpgraded");
          localStorage.removeItem("upgradeMode");

          // 显示友好提示并跳转
          toast.error("会话已过期，请重新登录");
          setTimeout(() => {
            router.push("/auth/login");
          }, 1000);
        }
        return;
      }

      const data = await res.json();
      setUser(data.user);

      // 初始化用户配额（模拟数据，实际应该从API获取）
      setUserQuota({
        isVip: false, // 默认为免费用户
        ownedEnterpriseCount: 0,
        maxEnterpriseLimit: 3,
      });

      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${data.user.id}`,
        },
      });

      if (workspacesRes.ok) {
        const workspacesData = await workspacesRes.json();

        const personal = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "PERSONAL",
        );
        const enterprise = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "ENTERPRISE",
        );

        console.log("个人空间:", personal);
        console.log("企业空间:", enterprise);

        // 如果个人空间实际存在，重置 personalWorkspaceDeleted 状态
        if (personal) {
          setPersonalWorkspace(personal);
          // 关键修复：如果个人空间实际存在，强制清除 localStorage 中的删除状态
          // 无论之前是什么状态，都重置为 false
          setPersonalWorkspaceDeleted(false);
          localStorage.setItem("personalWorkspaceDeleted", "false");
          console.log("个人空间存在，已重置 personalWorkspaceDeleted 为 false");
        } else if (!personal && user?.id) {
          // 检查是否是因为删除了个人空间
          if (personalWorkspaceDeleted) {
            setPersonalWorkspace(null);
          } else if (
            personalWorkspaceUpgraded &&
            (upgradeMode === "replace" || upgradeMode === "migrate")
          ) {
            // 替换升级或平移升级：个人空间已不存在
            setPersonalWorkspace(null);
          } else if (personalWorkspaceUpgraded && upgradeMode === "parallel") {
            // 并行创建：个人空间应该存在，但从数据库没查到，说明数据不一致
            // 这种情况下，保持 personalWorkspaceUpgraded 状态，但不创建新空间
            setPersonalWorkspace(null);
          } else {
            const createRes = await fetch("/api/workspace/create-personal", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${user.id}`,
              },
            });

            if (createRes.ok) {
              const createData = await createRes.json();
              setPersonalWorkspace(createData.workspace);
            } else {
              const errorText = await createRes.text();
              setPersonalWorkspace(null);
            }
          }
        } else {
          setPersonalWorkspace(personal || null);
        }

        setEnterpriseWorkspace(enterprise || null);

        if (enterprise && !personal) {
          if (personalWorkspaceDeleted) {
            // 选项 B：删除个人空间，创建企业空间
          } else if (personalWorkspaceUpgraded) {
            // 选项 C：个人空间已升级为企业空间
          } else {
            // 没有设置任何状态，可能是新用户的第一个企业空间
          }
        }
      } else {
        console.error("获取工作空间列表失败:", await workspacesRes.text());
      }

      // 加载配额信息
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        console.warn(
          "User ID not found in localStorage, redirecting to login...",
        );
        router.push("/auth/login");
        return;
      }

      const quotaRes = await fetch("/api/user/workspace-hub/quota", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        // API 返回格式：{ success: true, data: { quotas: {...} } }
        if (quotaData.success && quotaData.data) {
          const quotas = quotaData.data.quotas;
          // 转换为页面需要的格式
          setQuota({
            hasEnterprise: quotas.enterpriseSlots.used > 0,
            enterpriseCount: quotas.enterpriseSlots.used,
            maxEnterprise: quotas.enterpriseSlots.total,
            isMember: quotas.enterpriseSlots.total > 1, // 如果最大企业空间数>1，说明是会员
          });
        }
      } else {
        const errorText = await quotaRes.text();
        console.warn("加载配额信息失败:", errorText);

        // 如果是 401 或 404 错误，说明用户未授权或不存在，需要重新登录
        if (quotaRes.status === 401 || quotaRes.status === 404) {
          console.warn("用户认证失效，请重新登录");
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          router.push("/auth/login");
          return;
        }
      }

      // 加载企业空间列表
      const enterpriseRes = await fetch("/api/workspace/enterprise-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (enterpriseRes.ok) {
        const data = await enterpriseRes.json();
        setEnterpriseData(data);
      } else {
        const errorText = await enterpriseRes.text();
        console.error("加载企业空间列表失败:", errorText);
      }

      // 加载使用统计
      const statsRes = await fetch("/api/workspace/usage-stats", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setUsageStats(statsData.statistics);
      } else {
        const errorText = await statsRes.text();
        console.error("加载使用统计失败:", errorText);
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
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
      setWorkspaces(data.workspaces);
      setInvitations(data.invitations);

      if (data.workspaces.length > 0) {
        setSelectedWorkspace(data.workspaces[0].id);
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

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff] overflow-y-auto">
      {/* 背景：渐变效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
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
      <main className="relative z-10 px-6 py-8">
        {/* 欢迎区 */}
        <div className="mb-10">
          <h1 className="text-3xl font-black text-slate-800 mb-3">
            工作空间管理
          </h1>
          <p className="text-slate-600 text-base leading-relaxed">
            管理您的个人空间和企业空间
          </p>
        </div>

        {/* 工作空间选择（个人空间 + 企业空间） */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* 个人空间 - 占 1/3 */}
          <div
            className={`group relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ${
              personalWorkspaceDeleted
                ? "border-red-200"
                : "border-[#3182ce]/20 hover:border-[#3182ce]/40 hover:shadow-[#3182ce]/15"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#3182ce]/30">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-black text-slate-800">
                    个人空间
                  </h3>
                  {personalWorkspaceDeleted && upgradeMode === "replace" ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                      已替换
                    </span>
                  ) : personalWorkspaceDeleted ? (
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-full">
                      已注销
                    </span>
                  ) : upgradeMode === "migrate" && !personalWorkspace ? (
                    <span className="px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-bold rounded-full">
                      已升级
                    </span>
                  ) : personalWorkspaceUpgraded && personalWorkspace ? (
                    <span className="px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-bold rounded-full">
                      已升级
                    </span>
                  ) : personalWorkspace ? (
                    <span className="px-2 py-0.5 bg-[#10b981]/10 text-[#10b981] text-xs font-bold rounded-full">
                      已激活
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                      未创建
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                  {personalWorkspaceDeleted && upgradeMode === "replace"
                    ? "原个人空间已注销，已创建全新企业空间。点击重新创建按钮可创建新的个人空间"
                    : personalWorkspaceDeleted
                      ? "个人空间已被注销。点击重新创建按钮可创建新的个人空间"
                      : upgradeMode === "migrate" && !personalWorkspace
                        ? "您的个人空间已成功平移升级为企业空间，所有数据、组件和项目已完整迁移至企业空间。个人空间已完成历史使命，不再支持任何操作。请直接前往企业空间继续您的工作。"
                        : upgradeMode === "migrate" &&
                            !personalWorkspace &&
                            enterpriseWorkspace
                          ? `个人空间已升级为企业空间，所有数据已保留。点击"进入企业空间"按钮可继续工作`
                          : upgradeMode === "migrate" && !personalWorkspace
                            ? "个人空间已升级为企业空间。如需使用个人空间，可以点击重新创建按钮创建新的个人空间"
                            : personalWorkspaceUpgraded && !personalWorkspace
                              ? "个人空间已升级为企业空间。如需使用个人空间，可以点击重新创建按钮创建新的个人空间"
                              : personalWorkspaceUpgraded &&
                                  personalWorkspace &&
                                  upgradeMode === "parallel"
                                ? "个人空间已升级为企业空间，原个人空间已保留。您可以继续使用该个人空间，企业空间的注销不影响个人空间状态"
                                : personalWorkspaceUpgraded && personalWorkspace
                                  ? "个人空间已升级。您可以继续使用该个人空间，或选择注销"
                                  : "适合独立开发者、自由职业者或个人项目使用，提供基础的组件调用和项目管理功能"}
                </p>
                {/* 平移升级特别提示 */}
                {upgradeMode === "migrate" && !personalWorkspace && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-[#f59e0b]/5 to-[#10b981]/5 border-l-4 border-[#f59e0b] rounded-r-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-[#10b981]" />
                          <span className="text-xs font-bold text-slate-700">
                            升级完成
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 leading-relaxed space-y-1">
                          <p>✓ 所有个人数据已完整迁移至企业空间</p>
                          <p>✓ 原有组件和项目已自动同步</p>
                          <p>✓ 企业空间已继承所有权限配置</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <p className="text-[11px] text-slate-500">
                            💡
                            提示：您可以从右侧企业空间卡片进入企业空间继续工作
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {personalWorkspace && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Box className="w-3 h-3" />
                    <span>
                      已用 {personalWorkspace.componentCount || 0} 个组件
                    </span>
                  </div>
                )}
                {/* 升级提示 */}
                {personalWorkspace &&
                  quota &&
                  quota.enterpriseCount < quota.maxEnterprise &&
                  !personalWorkspaceUpgraded && (
                    <div className="mb-2 p-2 bg-gradient-to-r from-[#10b981]/10 to-[#059669]/10 border border-[#10b981]/30 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="text-[11px] font-bold text-[#10b981] mb-0.5">
                            可升级为企业空间
                          </div>
                          <div className="text-[10px] text-slate-600 leading-relaxed">
                            <span className="block mb-0.5">
                              产品经理：需求评审、产品规划协作
                            </span>
                            <span className="block mb-0.5">
                              设计师：设计稿共享、组件样式统一
                            </span>
                            <span className="block">
                              开发者/测试：团队开发、代码审查、测试管理
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpgradeWorkspace();
                          }}
                          className="px-2 py-1 bg-[#10b981] text-white text-[10px] font-bold rounded hover:bg-[#059669] transition-all flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>升级</span>
                          <ArrowUpRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  )}
                {/* 已升级提示（选项 A：保留个人空间） */}
                {personalWorkspace &&
                  personalWorkspaceUpgraded &&
                  upgradeMode === "parallel" && (
                    <div className="mb-2 p-2 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 border border-[#f59e0b]/30 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="text-[11px] font-bold text-[#f59e0b] mb-0.5">
                            已升级为企业空间
                          </div>
                          <div className="text-[10px] text-slate-600 leading-relaxed">
                            {enterpriseWorkspace
                              ? "您的个人空间已成功升级为企业空间，原个人空间已保留。您可以选择注销这个个人空间，或者继续使用。"
                              : "您的个人空间之前已升级为企业空间（并行创建模式），原个人空间已保留。企业空间已被删除，但个人空间状态不受影响。您可以继续使用这个个人空间，或者选择注销。"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                {/* 操作按钮 */}
                {upgradeMode === "migrate" &&
                !personalWorkspace ? null : !personalWorkspace && // 平移升级后个人空间已不存在：不显示任何按钮，只显示友好提示
                  personalWorkspaceUpgraded &&
                  upgradeMode === "parallel" &&
                  personalWorkspaceDeleted ? (
                  // 并行创建后已注销：显示"重新创建"按钮
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRecreatePersonal();
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>重新创建</span>
                  </button>
                ) : !personalWorkspace &&
                  enterpriseWorkspace &&
                  personalWorkspaceUpgraded ? (
                  // 选项 A：个人空间和企业空间都存在，且个人空间已升级，显示"进入空间"和"注销"按钮
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterWorkspace(personalWorkspace);
                      }}
                      className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2563eb] transition-colors cursor-pointer"
                    >
                      <span>进入空间</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUpgradedPersonal();
                      }}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>注销</span>
                    </button>
                  </div>
                ) : personalWorkspaceUpgraded &&
                  personalWorkspace &&
                  upgradeMode !== "migrate" ? (
                  // 个人空间已升级（企业空间可能被删除了），仍然显示"进入空间"和"注销"按钮
                  // 但平移升级除外（upgradeMode === "migrate"），平移升级后不显示任何按钮
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterWorkspace(personalWorkspace);
                      }}
                      className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2563eb] transition-colors cursor-pointer"
                    >
                      <span>进入空间</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUpgradedPersonal();
                      }}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>注销</span>
                    </button>
                  </div>
                ) : personalWorkspace && enterpriseWorkspace ? (
                  // 个人空间和企业空间都存在：显示"进入空间"和"注销"按钮
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterWorkspace(personalWorkspace);
                      }}
                      className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2563eb] transition-colors cursor-pointer"
                    >
                      <span>进入空间</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUpgradedPersonal();
                      }}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>注销</span>
                    </button>
                  </div>
                ) : personalWorkspace ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterWorkspace(personalWorkspace);
                    }}
                    className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2563eb] transition-colors cursor-pointer"
                  >
                    <span>进入空间</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : upgradeMode === "migrate" &&
                  enterpriseWorkspace ? (
                  // 平移升级且企业空间存在：显示"进入企业空间"按钮
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterWorkspace(enterpriseWorkspace);
                    }}
                    className="flex items-center gap-1 text-sm font-bold text-[#10b981] hover:text-[#059669] transition-colors cursor-pointer"
                  >
                    <span>进入企业空间</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : upgradeMode === "migrate" &&
                  !personalWorkspace ? null : personalWorkspaceDeleted || // 平移升级后个人空间已不存在：不显示任何按钮，只显示友好提示
                  personalWorkspaceUpgraded ? (
                  // 个人空间已删除/已升级/平移升级但企业空间不存在：显示"重新创建"按钮
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRecreatePersonal();
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>重新创建</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreatePersonal();
                    }}
                    className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2563eb] transition-colors cursor-pointer"
                  >
                    <span>创建空间</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 企业或组织空间 - 占 2/3 */}
          <div className="lg:col-span-2 group relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#f59e0b]/30 hover:border-[#f59e0b]/50 hover:shadow-2xl hover:shadow-[#f59e0b]/20 transition-all duration-300 hover:-translate-y-1">
            <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-[10px] font-black rounded-full shadow-lg">
              推荐
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#f59e0b]/30">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-black text-slate-800">
                    升级并创建企业组织空间
                  </h3>
                  {enterpriseData &&
                  enterpriseData.statistics.totalWorkspaces > 0 ? (
                    <span className="px-2 py-0.5 bg-[#10b981]/10 text-[#10b981] text-xs font-bold rounded-full">
                      已开通 {enterpriseData.statistics.totalWorkspaces} 个
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                      未开通
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  面向企业、创业团队、工作室的专业协作平台，支持多角色协同工作（产品、设计、开发、测试），
                  提供成员权限管理、项目资源共享、全量高阶组件库和完整的业务流程管理。
                </p>

                {/* 主要内容区：左右两列布局 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  {/* 左列：会员权益 + 统计数据 */}
                  <div className="space-y-3">
                    {/* 会员权益提示 */}
                    {quota && quota.isMember ? (
                      <div className="p-2.5 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 border border-[#f59e0b]/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                            <span className="text-[10px] font-black text-white">
                              VIP
                            </span>
                          </div>
                          <span className="text-xs font-bold text-[#f59e0b]">
                            会员专属权益
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <p className="mb-1">
                            <span className="font-bold text-[#f59e0b]">
                              尊享特权：
                            </span>
                            会员用户最多可拥有{" "}
                            <span className="font-black text-[#f59e0b]">
                              3 个
                            </span>{" "}
                            企业空间
                          </p>
                          <p className="text-slate-600">
                            当前已开通{" "}
                            <span className="font-black text-[#10b981]">
                              {enterpriseData?.statistics.totalWorkspaces || 0}
                            </span>{" "}
                            个， 还可创建{" "}
                            <span className="font-black text-[#10b981]">
                              {quota.maxEnterprise - quota.enterpriseCount}
                            </span>{" "}
                            个
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 border border-[#f59e0b]/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                            <span className="text-[10px] font-black text-white">
                              VIP
                            </span>
                          </div>
                          <span className="text-xs font-bold text-[#f59e0b]">
                            会员专属权益
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed mb-2">
                          <p className="mb-1">
                            <span className="font-bold text-[#f59e0b]">
                              尊享特权：
                            </span>
                            会员用户最多可拥有{" "}
                            <span className="font-black text-[#f59e0b]">
                              3 个
                            </span>{" "}
                            企业空间
                          </p>
                          <p className="text-slate-600">
                            当前为免费用户，仅可创建{" "}
                            <span className="font-black text-slate-700">
                              1 个
                            </span>{" "}
                            企业空间
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push("/pricing");
                          }}
                          className="w-full px-2 py-1.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>立即开通会员</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* 空间和成员统计 */}
                    {enterpriseData && (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-slate-500 mb-0.5">空间数</div>
                            <div className="text-base font-black text-slate-800">
                              {enterpriseData.statistics.totalWorkspaces || 0}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-0.5">组件数</div>
                            <div className="text-base font-black text-[#3182ce]">
                              {enterpriseData.statistics.totalComponents || 0}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-0.5">成员数</div>
                            <div className="text-base font-black text-[#10b981]">
                              {enterpriseData.statistics.totalMembers || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 配额信息 */}
                    {quota && (
                      <div className="text-xs">
                        <div className="flex items-center justify-between gap-1 text-slate-500 mb-1">
                          <span>
                            可创建：{quota.enterpriseCount}/
                            {quota.maxEnterprise}
                          </span>
                          {!quota.isMember && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                              免费用户
                            </span>
                          )}
                          {quota.isMember && (
                            <span className="px-1.5 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] rounded text-[10px] font-bold">
                              会员用户
                            </span>
                          )}
                        </div>
                        {quota.enterpriseCount < quota.maxEnterprise && (
                          <div className="text-[#10b981] font-bold text-[11px]">
                            还可创建{" "}
                            {quota.maxEnterprise - quota.enterpriseCount} 个
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 右列：空间列表 + 操作按钮 */}
                  <div className="space-y-3">
                    {/* 空间列表 */}
                    {enterpriseData && enterpriseData.workspaces.length > 0 && (
                      <div className="space-y-1.5">
                        {enterpriseData.workspaces.map((ws, index) => (
                          <div
                            key={ws.id}
                            className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 hover:border-[#f59e0b]/40 transition-all"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-6 h-6 rounded bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-black text-white">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">
                                  {ws.name}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {ws.memberCount} 名成员 · {ws.componentCount}{" "}
                                  个组件
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/workspace/${ws.id}`);
                                }}
                                className="px-2 py-1 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-bold rounded hover:bg-[#f59e0b]/20 transition-all cursor-pointer"
                                title="进入空间"
                              >
                                进入
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExpandEnterprise(ws.id);
                                }}
                                className="px-2 py-1 bg-[#10b981]/10 text-[#10b981] text-[10px] font-bold rounded hover:bg-[#10b981]/20 transition-all flex items-center gap-0.5 cursor-pointer"
                                title="扩容"
                              >
                                <TrendingUp className="w-2.5 h-2.5" />
                                扩容
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWorkspace(ws.id);
                                }}
                                disabled={
                                  deletingWorkspaceId === ws.id ||
                                  checkingDelete
                                }
                                className="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[50px] cursor-pointer"
                                title="注销空间"
                              >
                                {checkingDelete ? (
                                  <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                ) : deletingWorkspaceId === ws.id ? (
                                  "..."
                                ) : (
                                  "注销"
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="space-y-2">
                      {enterpriseData &&
                      enterpriseData.statistics.totalWorkspaces > 0 ? (
                        <>
                          {quota &&
                            quota.enterpriseCount < quota.maxEnterprise && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGoToCreateEnterprise();
                                }}
                                className="w-full px-3 py-1.5 bg-white border-2 border-[#f59e0b] text-[#f59e0b] text-xs font-bold rounded-lg hover:bg-[#f59e0b]/10 transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>新建空间</span>
                              </button>
                            )}
                          {quota &&
                            quota.enterpriseCount >= quota.maxEnterprise && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGoToCreateEnterprise();
                                }}
                                disabled
                                className="w-full px-3 py-1.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-lg cursor-not-allowed text-center"
                              >
                                已达上限
                              </button>
                            )}
                          {/* 分享空间按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenShareModal();
                            }}
                            className="w-full px-3 py-1.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Users className="w-3 h-3" />
                            <span>分享空间</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGoToCreateEnterprise();
                          }}
                          className="w-full px-3 py-1.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>立即创建</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* 提示信息 - 当没有企业空间时显示 */}
                      {enterpriseData &&
                      enterpriseData.statistics.totalWorkspaces === 0 ? (
                        <div className="p-3 bg-gradient-to-br from-[#f59e0b]/10 to-[#d97706]/10 border border-[#f59e0b]/20 rounded-xl">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-slate-700">
                              <p className="font-bold text-[#f59e0b] mb-1">
                                为什么需要企业空间？
                              </p>
                              <ul className="space-y-0.5 text-slate-600">
                                <li>
                                  •
                                  团队协作：支持产品、设计、开发、测试多角色协同
                                </li>
                                <li>
                                  • 权限管理：细粒度的成员权限控制，保障数据安全
                                </li>
                                <li>
                                  • 资源共享：团队组件库、项目资源统一管理和复用
                                </li>
                                <li>• 流程规范：完整的业务流程和审批机制</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* 提示信息 */}
                    {quota && quota.enterpriseCount >= quota.maxEnterprise && (
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-[#f59e0b]" />
                        <span>已达空间数量上限，如需更多请联系客服</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 第二行：个人空间设置 + 加入已有空间 + 管理中枢快捷通道 */}
        <div className={`grid grid-cols-1 ${user?.role === "admin" || user?.role === "super_admin" ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-4 mb-6`}>
          {/* 个人空间设置 */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border border-[#e2e8f0]/80 hover:border-[#3182ce]/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 shadow-lg">
                <Settings className="w-6 h-6 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-black text-slate-800">
                    个人空间设置
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                  配置个人研发偏好、管理第三方集成、查看使用记录和导出数据，打造个性化的工作环境
                </p>

                {/* 功能列表 */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        偏好配置
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      主题、快捷键、编辑器
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        集成管理
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      Git、API、云服务
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        使用统计
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      调用记录、分析报告
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        数据管理
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      导出、备份、恢复
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleGoToPersonalSettings}
                  className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer"
                >
                  <span>管理设置</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* 加入已有空间 */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#10b981]/30 hover:border-[#10b981]/50 hover:shadow-2xl hover:shadow-[#10b981]/20 transition-all duration-300 hover:-translate-y-1">
            <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-[10px] font-black rounded-full shadow-lg">
              团队协作
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#10b981]/30">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-black text-slate-800">
                    加入已有空间
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                  通过同事分享的邀请码或链接，加入企业或组织空间，开始团队协作
                </p>

                {/* 使用场景说明 */}
                <div className="mb-3 p-2.5 bg-[#10b981]/5 rounded-lg border border-[#10b981]/20">
                  <div className="text-[10px] text-slate-600 leading-relaxed mb-2">
                    <span className="font-bold text-[#10b981]">适用场景：</span>
                  </div>
                  <ul className="space-y-1">
                    <li className="flex items-start gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                      <span className="text-[9px] text-slate-500">
                        同事发送空间分享链接，点击即可加入
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                      <span className="text-[9px] text-slate-500">
                        管理员生成邀请码，输入后快速加入团队
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                      <span className="text-[9px] text-slate-500">
                        新成员注册后，通过邀请码加入已有项目空间
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                      <span className="text-[9px] text-slate-500">
                        支持跨部门协作，一人可加入多个企业空间
                      </span>
                    </li>
                  </ul>
                </div>

                {/* 功能说明 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 bg-[#10b981]/5 rounded-lg border border-[#10b981]/20">
                    <div className="flex items-center gap-1 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        邀请码
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">输入 8 位码</p>
                  </div>
                  <div className="p-2 bg-[#10b981]/5 rounded-lg border border-[#10b981]/20">
                    <div className="flex items-center gap-1 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        链接
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">点击链接</p>
                  </div>
                  <div className="p-2 bg-[#10b981]/5 rounded-lg border border-[#10b981]/20">
                    <div className="flex items-center gap-1 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
                      <span className="text-[10px] font-bold text-slate-700">
                        验证
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500">自动验证</p>
                  </div>
                </div>

                <button
                  onClick={handleOpenJoinModal}
                  className="flex items-center gap-1 text-sm font-bold text-[#10b981] hover:text-[#059669] transition-colors cursor-pointer"
                >
                  <span>立即加入</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* 管理中枢快捷通道 Bento 卡片 */}
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <div className="group relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-red-500/30 hover:border-red-500/50 hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-300 hover:-translate-y-1">
              <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-black rounded-full shadow-lg animate-pulse">
                管理中枢
              </div>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/30">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-black text-slate-800">
                      超级管理控制台
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    系统超级管理员专属入口。可进行系统全局监控、审批待创建企业空间、处理用户安全申诉与配额调整。
                  </p>

                  {/* 快捷宏观指标看板 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <a
                      href="/admin/workspaces"
                      className="p-2 bg-red-50/50 hover:bg-red-50 rounded-lg border border-red-100 hover:border-red-200 block text-left group/btn"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-slate-700">
                          待审空间
                        </span>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                      </div>
                      <p className="text-[9px] text-slate-500">审批企业申请</p>
                    </a>
                    <a
                      href="/admin/appeals"
                      className="p-2 bg-red-50/50 hover:bg-red-50 rounded-lg border border-[#f87171]/20 hover:border-red-200 block text-left group/btn"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-slate-700">
                          待处申诉
                        </span>
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-extrabold rounded-full scale-90">
                          3
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500">安全合规与纠纷</p>
                    </a>
                  </div>

                  <a
                    href="/admin"
                    className="flex items-center gap-1 text-sm font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                  >
                    <span>直达后台</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 第三行：Studio 组件库（核心功能） */}
        <div className="mb-6">
          <div className="h-full bg-gradient-to-br from-[#8b5cf6]/10 to-[#7c3aed]/10 backdrop-blur-xl rounded-2xl p-6 border-2 border-[#8b5cf6]/20">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-xl">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    舟坊空间组件库
                  </h2>
                  <p className="text-sm text-slate-600">
                    53 个高阶组件，覆盖软件开发全流程
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGoToGuide}
                  className="px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-[#e2e8f0] text-slate-700 text-sm font-bold rounded-xl hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>操作手册</span>
                </button>
                <button
                  onClick={handleGoToStudio}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-xl hover:shadow-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>浏览全部组件</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 组件阶段展示 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {componentStages.slice(0, 3).map((stage, index) => (
                <div
                  key={stage.name}
                  onClick={() => handleGoToStage(index)}
                  className="group cursor-pointer bg-white/80 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                  style={{
                    borderColor: `${stage.color}30`,
                  }}
                >
                  {/* 阶段头部 */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stage.bgColor} flex items-center justify-center flex-shrink-0 shadow-md`}
                    >
                      <div style={{ color: stage.color }}>{stage.icon}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-black text-slate-800">
                          {stage.name}
                        </h3>
                        <span
                          className="px-2 py-0.5 text-xs font-bold rounded-full"
                          style={{
                            backgroundColor: `${stage.color}10`,
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
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-[#ff6b6b] to-[#ff8787] text-white text-[9px] font-black rounded-md shadow-sm">
                              <Flame className="w-2.5 h-2.5" />
                              周热门
                            </span>
                          )}
                          {stage.tags.includes("月热门") && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-[9px] font-black rounded-md shadow-sm">
                              <TrendingUp className="w-2.5 h-2.5" />
                              月热门
                            </span>
                          )}
                          {stage.tags.includes("推荐") && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white text-[9px] font-black rounded-md shadow-sm">
                              <Star className="w-2.5 h-2.5" />
                              推荐
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {stage.description}
                      </p>
                    </div>
                  </div>

                  {/* 组件列表 */}
                  <div className="space-y-2 mt-3">
                    {stage.components.slice(0, 5).map((component, idx) => (
                      <div
                        key={`${stage.name}-${component.name}-${idx}`}
                        className="group/component relative flex items-center justify-between p-2.5 hover:bg-white/60 rounded-lg transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* 组件名称 */}
                          <span className="text-xs font-medium text-slate-700 truncate">
                            {component.name}
                          </span>
                          {/* 组件标识 */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {component.isHot && (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 bg-gradient-to-br from-[#ff6b6b] to-[#ff8787] rounded-full shadow-sm"
                                title="热门组件"
                              >
                                <Flame className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                            {component.isNew && (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 bg-gradient-to-br from-[#10b981] to-[#059669] rounded-full shadow-sm"
                                title="新上架"
                              >
                                <Zap className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                            {component.isRecommended && (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 bg-gradient-to-br from-[#3182ce] to-[#2563eb] rounded-full shadow-sm"
                                title="推荐"
                              >
                                <Star className="w-2.5 h-2.5 text-white" />
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
