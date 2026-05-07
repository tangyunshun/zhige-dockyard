"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import RoleMatrix from "@/components/RoleMatrix";
import { ArrowLeft, Shield, Users, Building2 } from "lucide-react";

export default function AdminMatrixPage() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  const loadWorkspace = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const res = await fetch(`/api/workspace/detail?id=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspace(data.workspace);
      }
    } catch (error) {
      console.error("Load workspace error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-bold">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f8ff]">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* 返回按钮 */}
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold">返回</span>
            </button>

            {/* 工作空间信息 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800">
                  {workspace?.name || "工作空间"}
                </h1>
                <p className="text-xs text-slate-600">岗位权限矩阵配置</p>
              </div>
            </div>

            {/* 占位 */}
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-6">
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            企业权限配置中心
          </h2>
          <p className="text-slate-600">
            配置企业内各岗位对 53 个组件的访问和操作权限，实现精细化的权限管控
          </p>
        </div>

        {/* 权限矩阵 */}
        <RoleMatrix workspaceId={workspaceId} />

        {/* 辅助说明卡片 */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-slate-800">权限隔离</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              基于 RBAC 模型，为不同岗位配置不同的组件访问权限，确保数据安全和职责分离
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-slate-800">岗位管理</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              支持自定义岗位，为每个岗位分配相应的权限模板，快速适配团队组织架构
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-slate-800">企业管控</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              企业管理员可统一管理所有岗位的权限配置，支持批量操作和权限复制
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
