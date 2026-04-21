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
  Sparkles,
  TrendingUp,
  Settings,
  ExternalLink,
  FileText,
  Code,
  Database,
  Target,
  Layers,
  Server,
  ChevronRight,
  BookOpen,
  Plus,
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
  components: string[];
}

const componentStages: ComponentStage[] = [
  {
    icon: <Target className="w-5 h-5" />,
    name: "商机与售前打单",
    description: "从商机发现到售前方案，助力业务拓展与客户需求分析",
    count: 6,
    color: "#3182ce",
    bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
    components: [
      "PDF 解析引擎",
      "偏离表提取器",
      "招标文件分析",
      "竞品分析助手",
      "方案生成器",
      "报价计算器",
    ],
  },
  {
    icon: <Layers className="w-5 h-5" />,
    name: "需求定义与设计",
    description: "将业务需求转化为技术规格，完成系统架构与接口设计",
    count: 4,
    color: "#10b981",
    bgColor: "from-[#10b981]/10 to-[#059669]/10",
    components: [
      "PRD 文档助手",
      "ER 图生成器",
      "API 设计工具",
      "原型图生成器",
    ],
  },
  {
    icon: <Server className="w-5 h-5" />,
    name: "后端核心与 API",
    description: "构建稳健的后端服务，提供高效可靠的 API 接口与数据处理",
    count: 6,
    color: "#f59e0b",
    bgColor: "from-[#f59e0b]/10 to-[#d97706]/10",
    components: [
      "代码 Diff 评审",
      "自动化部署",
      "性能监控",
      "日志分析器",
      "安全漏洞扫描",
      "接口测试器",
    ],
  },
];

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

  const handleGoToDocs = () => {
    toast.info("正在打开帮助手册...", 1000);
    setTimeout(() => {
      router.push("/docs");
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

          {/* 企业空间 */}
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
                    企业空间
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
                  团队协作工作区，解锁全量组件
                </p>
                {enterpriseWorkspace && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Box className="w-3 h-3" />
                    <span>已用 28 个组件</span>
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
                    Studio 组件库
                  </h2>
                  <p className="text-sm text-slate-600">
                    按项目阶段组织的 16 个高阶组件，覆盖软件开发全流程
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGoToDocs}
                  className="px-4 py-2.5 bg-white/80 backdrop-blur-sm border border-[#e2e8f0] text-slate-700 text-sm font-bold rounded-xl hover:shadow-md transition-all flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>帮助手册</span>
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
              {componentStages.map((stage, index) => (
                <div
                  key={stage.name}
                  onClick={() => handleGoToStage(index)}
                  className="group cursor-pointer bg-white/80 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                  style={{
                    borderColor: `${stage.color}30`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stage.bgColor} flex items-center justify-center flex-shrink-0 shadow-md`}
                      style={{
                        boxShadow: `0 4px 12px ${stage.color}30`,
                      }}
                    >
                      <div style={{ color: stage.color }}>
                        {stage.icon}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
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
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {stage.description}
                      </p>
                    </div>
                  </div>

                  {/* 组件列表 */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {stage.components.slice(0, 4).map((component) => (
                      <span
                        key={component}
                        className="px-2 py-1 bg-slate-100 hover:bg-white text-[10px] font-medium text-slate-700 rounded-md border border-slate-200 transition-all cursor-pointer hover:shadow-sm"
                      >
                        {component}
                      </span>
                    ))}
                    {stage.components.length > 4 && (
                      <span className="px-2 py-1 text-[10px] font-medium text-slate-500">
                        +{stage.components.length - 4}
                      </span>
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
