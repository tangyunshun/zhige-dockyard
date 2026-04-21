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
  Clock,
  TrendingUp,
  ExternalLink,
  FileText,
  Database,
  Code,
  Shield,
  Activity,
  Zap,
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

  const handleGoToStudio = () => {
    toast.info("正在打开组件库...", 1000);
    setTimeout(() => {
      router.push("/studio");
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
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-800 mb-2">
            欢迎回来，{user?.name || "用户"}
          </h1>
          <p className="text-slate-600">
            选择工作空间或浏览组件库，开始您的工作
          </p>
        </div>

        {/* 核心功能区：左右结构 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：工作空间选择（占 1 列） */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-black text-slate-800 mb-4">
              我的工作空间
            </h2>

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
                    个人专属工作区，适合个人开发者
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
                    团队协作，解锁全量高阶组件
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

            {/* 数据统计 */}
            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-[#e2e8f0]/80 mt-6">
              <h3 className="text-sm font-black text-slate-800 mb-3">
                使用统计
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">组件调用次数</span>
                  <span className="font-bold text-slate-800">12,450</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">平均响应时间</span>
                  <span className="font-bold text-slate-800">125ms</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">活跃组件</span>
                  <span className="font-bold text-slate-800">12 个</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：Studio 组件库（核心功能，占 2 列） */}
          <div className="lg:col-span-2">
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
                      浏览与使用系统提供的全量高阶组件
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGoToStudio}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-xl hover:shadow-xl hover:shadow-[#8b5cf6]/30 transition-all flex items-center gap-2"
                >
                  <span>立即浏览</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              {/* 组件分类展示 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {/* 分析类 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#3182ce]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-[#3182ce]" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">分析类</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]" />
                      <span>PDF 解析引擎</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]" />
                      <span>偏离表提取器</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]" />
                      <span>性能监控</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]" />
                      <span>日志分析器</span>
                    </div>
                  </div>
                </div>

                {/* 生成类 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#10b981]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#10b981]" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">生成类</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                      <span>ER 图生成器</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                      <span>PRD 文档助手</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                      <span>UI 组件生成器</span>
                    </div>
                  </div>
                </div>

                {/* 工具类 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#f59e0b]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                      <Code className="w-4 h-4 text-[#f59e0b]" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">工具类</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span>代码 Diff 评审</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span>安全漏洞扫描</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span>自动化部署</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      <span>接口测试器</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 热门组件 */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#e2e8f0]/80">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-[#f59e0b]" />
                  <h3 className="text-sm font-black text-slate-800">
                    热门组件 TOP 3
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-[#f59e0b]/5 to-transparent rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-[#f59e0b] text-white text-xs font-black flex items-center justify-center">
                        1
                      </span>
                      <span className="text-sm font-bold text-slate-700">
                        代码 Diff 评审
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">3,421 次</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-[#3182ce]/5 to-transparent rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-[#3182ce] text-white text-xs font-black flex items-center justify-center">
                        2
                      </span>
                      <span className="text-sm font-bold text-slate-700">
                        日志分析器
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">3,245 次</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-[#10b981]/5 to-transparent rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-[#10b981] text-white text-xs font-black flex items-center justify-center">
                        3
                      </span>
                      <span className="text-sm font-bold text-slate-700">
                        ER 图生成器
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">2,341 次</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
