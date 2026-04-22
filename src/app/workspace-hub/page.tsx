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

  useEffect(() => {
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

      const workspacesRes = await fetch("/api/workspace/list");
      if (workspacesRes.ok) {
        const workspacesData = await workspacesRes.json();
        const personal = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "PERSONAL",
        );
        const enterprise = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "ENTERPRISE",
        );
        setPersonalWorkspace(personal || null);
        setEnterpriseWorkspace(enterprise || null);
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

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
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
            选择工作空间开始协作，浏览按项目阶段组织的全量组件库，或管理个人空间设置
          </p>
        </div>

        {/* 第一行：工作空间选择 + 个人空间设置 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* 个人空间 */}
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
                  个人专属工作区，适合独立开发者
                </p>
                {personalWorkspace && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Box className="w-3 h-3" />
                    <span>已用 12 个组件</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm font-bold text-[#3182ce]">
                  <span>{personalWorkspace ? "进入空间" : "创建空间"}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 企业或组织空间 */}
          <div
            onClick={() => handleEnterWorkspace(enterpriseWorkspace)}
            className="group cursor-pointer relative overflow-hidden bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#f59e0b]/30 hover:border-[#f59e0b]/50 hover:shadow-2xl hover:shadow-[#f59e0b]/20 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-[10px] font-black rounded-full shadow-lg shadow-[#f59e0b]/40 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              推荐
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#f59e0b]/30">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-black text-slate-800">
                    企业或组织空间
                  </h3>
                  {enterpriseWorkspace ? (
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
                  团队协作工作区，支持成员管理、资源共享，解锁全量 16
                  个高阶组件与完整业务流程
                </p>
                {enterpriseWorkspace && (
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                    <div className="flex items-center gap-1">
                      <Box className="w-3 h-3" />
                      <span>已用 28 个组件</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>5 名成员</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1 text-sm font-bold text-[#f59e0b]">
                  <span>{enterpriseWorkspace ? "进入空间" : "创建空间"}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

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
                <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                  研发偏好、集成配置、数据管理
                </p>
                <div className="flex items-center gap-1 text-sm font-bold text-slate-600">
                  <span>管理设置</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 第二行：Studio 组件库（核心功能） */}
        <div className="mb-6">
          <div className="h-full bg-gradient-to-br from-[#8b5cf6]/10 to-[#7c3aed]/10 backdrop-blur-xl rounded-2xl p-6 border-2 border-[#8b5cf6]/20">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-xl shadow-[#8b5cf6]/30">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    舟坊空间组件库
                  </h2>
                  <p className="text-sm text-slate-600">
                    按项目阶段组织的 53 个高阶组件，覆盖软件开发全流程
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
                  className="px-5 py-2.5 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-xl hover:shadow-xl hover:shadow-[#8b5cf6]/30 transition-all flex items-center gap-2"
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
                      style={{
                        boxShadow: `0 4px 12px ${stage.color}30`,
                      }}
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
        <div className="bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-[#e2e8f0]/80">
          <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#f59e0b]" />
            我的使用统计
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-600 mb-1">累计组件调用</div>
              <div className="text-2xl font-black text-slate-800">12,450</div>
              <div className="text-xs text-slate-500">次</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">平均响应时间</div>
              <div className="text-2xl font-black text-slate-800">125</div>
              <div className="text-xs text-slate-500">毫秒</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">活跃组件</div>
              <div className="text-2xl font-black text-slate-800">12</div>
              <div className="text-xs text-slate-500">个</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">成功率</div>
              <div className="text-2xl font-black text-[#10b981]">98.5</div>
              <div className="text-xs text-slate-500">%</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
