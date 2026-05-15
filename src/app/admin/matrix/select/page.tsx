"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Building2, Lock, Users, ArrowRight } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: "OWNER" | "ADMIN" | "MEMBER";
  logo: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SelectWorkspaceForMatrixPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        console.error("未找到用户 ID");
        setLoading(false);
        return;
      }
      
      const res = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        console.log("工作空间列表数据:", data);
        // 只显示企业空间且有管理权限的
        const enterpriseWorkspaces = data.workspaces.filter(
          (ws: Workspace) => 
            ws.type === "ENTERPRISE" && 
            (ws.role === "OWNER" || ws.role === "ADMIN")
        );
        console.log("过滤后的企业空间:", enterpriseWorkspaces);
        setWorkspaces(enterpriseWorkspaces);
      } else {
        const error = await res.json();
        console.error("加载工作空间失败:", error);
      }
    } catch (error) {
      console.error("Load workspaces error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 mb-2">
          选择工作空间
        </h1>
        <p className="text-sm text-slate-600">
          选择要配置权限矩阵的企业空间
        </p>
      </div>

      {/* 工作空间列表 */}
      {workspaces.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">
            暂无可配置的企业空间
          </h3>
          <p className="text-slate-600 mb-6">
            您还没有创建或管理任何企业空间，或者您不是企业空间的管理员
          </p>
          <button
            onClick={() => router.push("/admin/workspaces")}
            className="px-6 py-2.5 bg-[#3182ce] text-white rounded-lg font-bold hover:bg-[#2b6cb0] transition-colors"
          >
            创建工作空间
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => router.push(`/admin/matrix/${workspace.id}`)}
              className="bg-white rounded-2xl border border-slate-200 p-6 text-left hover:border-[#3182ce]/30 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group"
            >
              {/* 空间图标 */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-6 h-6 text-white" />
              </div>

              {/* 空间名称 */}
              <h3 className="text-lg font-black text-slate-800 mb-2 truncate group-hover:text-[#3182ce] transition-colors">
                {workspace.name}
              </h3>

              {/* 空间描述 */}
              <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                {workspace.description || "暂无描述"}
              </p>

              {/* 权限信息 */}
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                <Shield className="w-3.5 h-3.5" />
                <span>
                  {workspace.role === "OWNER" ? "所有者" : "管理员"}
                </span>
              </div>

              {/* 操作提示 */}
              <div className="flex items-center gap-2 text-sm font-bold text-[#3182ce]">
                <span>配置权限矩阵</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 辅助说明卡片 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#3182ce]" />
          权限矩阵配置说明
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-700">1. 选择空间</h4>
            <p className="text-xs text-slate-600">
              从列表中选择一个企业空间，您必须是该空间的管理员或所有者
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-700">2. 配置岗位</h4>
            <p className="text-xs text-slate-600">
              为各岗位配置 53 个组件的访问权限，支持阶段全选和权限复制
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-700">3. 保存生效</h4>
            <p className="text-xs text-slate-600">
              配置完成后点击"保存配置"按钮，权限立即生效
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
