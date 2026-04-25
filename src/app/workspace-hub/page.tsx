"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  User,
  Building2,
  Box,
  ArrowRight,
  ArrowLeft,
  Sparkles,
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
  FolderLock,
  MonitorPlay,
  Scissors,
  FileSpreadsheet,
  ArrowUpRight,
  Activity,
  Copy,
  RefreshCw,
  Share2,
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
  avatar?: string;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
}

interface EnterpriseQuota {
  hasEnterprise: boolean;
  enterpriseCount: number;
  maxEnterprise: number;
  isMember: boolean;
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

  useEffect(() => {
    // 检查 URL 参数中的邀请码
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("invitationCode");
    if (codeFromUrl) {
      setInvitationCode(codeFromUrl);
      setShowJoinModal(true);
      verifyInvitation(codeFromUrl);
    }
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login");
        return;
      }

      const data = await res.json();
      setUser(data.user);
      console.log("用户信息:", data.user);

      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${data.user.id}`,
        },
      });

      console.log("工作空间列表响应状态:", workspacesRes.status);

      if (workspacesRes.ok) {
        const workspacesData = await workspacesRes.json();
        console.log("工作空间列表数据:", workspacesData);

        const personal = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "PERSONAL",
        );
        const enterprise = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "ENTERPRISE",
        );

        console.log("个人空间:", personal);
        console.log("企业空间:", enterprise);

        // 如果没有个人空间，自动创建一个
        if (!personal && user?.id) {
          console.log("未找到个人空间，正在自动创建...");
          const createRes = await fetch("/api/workspace/create-personal", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.id}`,
            },
          });

          console.log("创建个人空间响应状态:", createRes.status);

          if (createRes.ok) {
            const createData = await createRes.json();
            setPersonalWorkspace(createData.workspace);
            console.log("个人空间已自动创建:", createData.workspace);
          } else {
            const errorText = await createRes.text();
            console.error("自动创建个人空间失败:", errorText);
            setPersonalWorkspace(null);
          }
        } else {
          setPersonalWorkspace(personal || null);
          console.log("设置个人空间:", personal || null);
        }

        setEnterpriseWorkspace(enterprise || null);
      } else {
        console.error("获取工作空间列表失败:", await workspacesRes.text());
      }

      // 加载配额信息
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        console.error("User ID not found in localStorage");
        return;
      }

      const quotaRes = await fetch("/api/workspace/quota", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      console.log("配额信息响应状态:", quotaRes.status);

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        console.log("配额信息数据:", quotaData);
        setQuota(quotaData); // 直接使用 quotaData，因为 API 返回的就是配额对象
      } else {
        console.error("加载配额信息失败:", await quotaRes.text());
      }

      // 加载企业空间列表
      const enterpriseRes = await fetch("/api/workspace/enterprise-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (enterpriseRes.ok) {
        const data = await enterpriseRes.json();
        console.log("企业空间数据:", data);
        setEnterpriseData(data);
      } else {
        console.error("加载企业空间列表失败:", await enterpriseRes.text());
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
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
      setPersonalWorkspace(null);
      setEnterpriseWorkspace(null);
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

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("未授权访问");
        return;
      }

      // 开始检测，显示检测中提示
      setCheckingDelete(true);
      toast.info("正在检测空间状态，请稍候...", 2000);

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
        throw new Error(errorData.error || "检查失败");
      }

      const checkData = await res.json();
      setDeleteCheckResult(checkData);

      // 如果有阻止删除的问题，显示详细错误
      if (checkData.issues && checkData.issues.length > 0) {
        toast.error(
          <div className="space-y-1">
            <div className="font-bold">❌ 无法注销，存在以下问题：</div>
            {checkData.issues.map((issue: string, index: number) => (
              <div key={index}>• {issue}</div>
            ))}
          </div>,
        );
        setCheckingDelete(false);
        return;
      }

      // 显示注销确认弹窗（警告信息在弹窗中显示）
      setCheckingDelete(false);
      setWorkspaceToDelete(workspaceId);
      setShowDeleteModal(true);
    } catch (error) {
      console.error("Check delete workspace error:", error);
      setCheckingDelete(false);
      toast.error(error instanceof Error ? error.message : "检查失败");
    }
  };

  const confirmDeleteWorkspace = async () => {
    if (!workspaceToDelete) return;

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("未授权访问");
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
        }),
      });

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        throw new Error(errorData.error || "注销失败");
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
    setTimeout(() => {
      router.push("/studio");
    }, 1000);
  };

  const handleGoToStage = (stageIndex: number) => {
    toast.info(`正在加载${componentStages[stageIndex].name}...`, 1000);
    setTimeout(() => {
      router.push(`/studio?stage=${stageIndex}`);
    }, 1000);
  };

  const handleGoToGuide = () => {
    toast.info("正在打开组件库操作手册...", 1000);
    setTimeout(() => {
      router.push("/studio/guide");
    }, 1000);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        router.push("/");
      } else {
        toast.error("退出登录失败");
      }
    } catch (error) {
      console.error("退出登录失败:", error);
      toast.error("退出登录失败，请稍后重试");
    }
  };

  const verifyInvitation = async (code: string) => {
    try {
      setVerifyingCode(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("请先登录");
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
        setInvitationInfo(null);
        toast.error(data.error || "邀请码无效");
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
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("未授权访问");
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
        toast.error(data.error || "加入空间失败");
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
        toast.error("请先登录");
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
      console.error("生成邀请码失败:", error);
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

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">
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

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Logo variant="light" />
        <div className="flex items-center gap-4">
          {user?.avatar && (
            <img
              src={user.avatar}
              alt={user.name || "用户头像"}
              className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
            />
          )}
          <button
            onClick={handleLogout}
            className="group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          >
            <span>退出登录</span>
          </button>
        </div>
      </header>

      {/* 核心区 */}
      <main className="relative z-10 px-6 py-8">
        {/* 欢迎区 */}
        <div className="mb-10">
          <h1 className="text-3xl font-black text-slate-800 mb-3">
            欢迎回来，{user?.name || "用户"}
          </h1>
          <p className="text-slate-600 text-base leading-relaxed">
            知阁·舟坊组件化开发平台 -
            选择工作空间开始协作，浏览全量组件库，或管理个人空间设置
          </p>
        </div>

        {/* 第一行：工作空间选择（个人空间 + 企业空间） */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* 个人空间 - 占 1/3 */}
          <div
            onClick={() => handleEnterWorkspace(personalWorkspace)}
            className="group cursor-pointer relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#3182ce]/20 hover:border-[#3182ce]/40 hover:shadow-2xl hover:shadow-[#3182ce]/15 transition-all duration-300 hover:-translate-y-1"
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
                  {personalWorkspace ? (
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
                  适合独立开发者、自由职业者或个人项目使用，提供基础的组件调用和项目管理功能
                </p>
                {personalWorkspace && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Box className="w-3 h-3" />
                    <span>已用 12 个组件</span>
                  </div>
                )}
                {/* 升级提示 */}
                {personalWorkspace &&
                  quota &&
                  quota.enterpriseCount < quota.maxEnterprise && (
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
                          className="px-2 py-1 bg-[#10b981] text-white text-[10px] font-bold rounded hover:bg-[#059669] transition-all flex items-center gap-0.5"
                        >
                          <span>升级</span>
                          <ArrowUpRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  )}
                {/* 已达上限提示 */}
                {personalWorkspace &&
                  quota &&
                  quota.enterpriseCount >= quota.maxEnterprise && (
                    <div className="mb-2 p-2 bg-slate-100 border border-slate-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3 text-slate-400" />
                        <div className="text-[10px] text-slate-500">
                          <span className="font-bold">已达空间上限：</span>
                          {quota.isMember ? (
                            <span>
                              会员最多可拥有 3 个企业空间，您已拥有{" "}
                              {quota.enterpriseCount} 个
                            </span>
                          ) : (
                            <span>免费用户最多可拥有 1 个企业空间</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                <div className="flex items-center gap-1 text-sm font-bold text-[#3182ce]">
                  <span>{personalWorkspace ? "进入空间" : "创建空间"}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 企业或组织空间 - 占 2/3 */}
          <div className="lg:col-span-2 group cursor-pointer relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#f59e0b]/30 hover:border-[#f59e0b]/50 hover:shadow-2xl hover:shadow-[#f59e0b]/20 transition-all duration-300 hover:-translate-y-1">
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
                          className="w-full px-2 py-1.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1"
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
                                className="px-2 py-1 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-bold rounded hover:bg-[#f59e0b]/20 transition-all"
                                title="进入空间"
                              >
                                进入
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExpandEnterprise(ws.id);
                                }}
                                className="px-2 py-1 bg-[#10b981]/10 text-[#10b981] text-[10px] font-bold rounded hover:bg-[#10b981]/20 transition-all flex items-center gap-0.5"
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
                                className="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[50px]"
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
                                className="w-full px-3 py-1.5 bg-white border-2 border-[#f59e0b] text-[#f59e0b] text-xs font-bold rounded-lg hover:bg-[#f59e0b]/10 transition-all text-center flex items-center justify-center gap-1"
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
                            className="w-full px-3 py-1.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1"
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
                          className="w-full px-3 py-1.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all text-center flex items-center justify-center gap-1"
                        >
                          <span>立即创建</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
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

        {/* 第二行：个人空间设置 + 加入已有空间 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* 个人空间设置 */}
          <div
            onClick={handleGoToPersonalSettings}
            className="group cursor-pointer relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border border-[#e2e8f0]/80 hover:border-[#3182ce]/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
          >
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

                <div className="flex items-center gap-1 text-sm font-bold text-slate-600">
                  <span>管理设置</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 加入已有空间 */}
          <div
            onClick={handleOpenJoinModal}
            className="group cursor-pointer relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#10b981]/30 hover:border-[#10b981]/50 hover:shadow-2xl hover:shadow-[#10b981]/20 transition-all duration-300 hover:-translate-y-1"
          >
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

                <div className="flex items-center gap-1 text-sm font-bold text-[#10b981]">
                  <span>立即加入</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
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
                  className="px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-[#e2e8f0] text-slate-700 text-sm font-bold rounded-xl hover:shadow-md transition-all flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>操作手册</span>
                </button>
                <button
                  onClick={handleGoToStudio}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-xl hover:shadow-xl transition-all flex items-center gap-2"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-200">
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
                onClick={confirmDeleteWorkspace}
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
    </div>
  );
}
