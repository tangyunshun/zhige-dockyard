"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  LogOut,
  Building,
  Users,
  FolderKanban,
  Settings,
  Plus,
  ArrowLeft,
} from "lucide-react";

export default function WorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      const id = Array.isArray(params.id) ? params.id[0] : params.id;
      setWorkspaceId(id);
      loadWorkspace(id);
    }
  }, [params.id]);

  const loadWorkspace = async (id: string) => {
    try {
      const res = await fetch("/api/workspace/list");
      if (res.ok) {
        const data = await res.json();
        const workspace = data.workspaces.find((w: any) => w.id === id);
        if (workspace) {
          setWorkspaceName(workspace.name);
        } else {
          toast.error("工作空间不存在");
          router.push("/workspace-hub");
        }
      }
    } catch (error) {
      console.error("加载工作空间失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.push("/workspace-hub");
  };

  const handleGoToSettings = () => {
    router.push("/workspace-hub/settings");
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

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 背景装饰 */}
      <div className="absolute inset-0">
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
        <div className="flex items-center gap-4">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <button
            onClick={handleGoToSettings}
            className="group flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
          >
            <Settings className="w-5 h-5" />
            <span className="font-bold">设置</span>
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          退出登录
        </button>
      </header>

      {/* 主要内容 */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-6xl">
          {/* 工作空间标题 */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-4 tracking-tight">
              {workspaceName}
            </h1>
            <p className="text-lg text-slate-600 font-medium">
              工作空间 ID: {workspaceId}
            </p>
          </div>

          {/* 功能卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 项目管理 */}
            <div className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-white/90 hover:shadow-2xl hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center mb-6 shadow-lg shadow-[#3182ce]/20">
                <FolderKanban className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">
                项目管理
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                创建和管理您的项目，跟踪进度
              </p>
              <button className="text-sm font-bold text-[#3182ce] hover:text-[#2b6cb0] transition-colors inline-flex items-center gap-1">
                立即创建 <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 团队成员 */}
            <div className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-white/90 hover:shadow-2xl hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-6 shadow-lg shadow-[#10b981]/20">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">
                团队成员
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                邀请成员加入，协同工作
              </p>
              <button className="text-sm font-bold text-[#10b981] hover:text-[#059669] transition-colors inline-flex items-center gap-1">
                邀请成员 <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 空间设置 */}
            <div className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-white/90 hover:shadow-2xl hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-6 shadow-lg shadow-[#f59e0b]/20">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">
                空间设置
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                配置工作空间信息和权限
              </p>
              <button className="text-sm font-bold text-[#f59e0b] hover:text-[#d97706] transition-colors inline-flex items-center gap-1">
                立即设置 <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 提示 */}
          <div className="mt-12 text-center">
            <p className="text-sm text-slate-500">
              💡 工作台功能开发中，敬请期待...
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
