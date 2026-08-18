"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import { LayoutGrid, RefreshCw, Layers, ArrowUpRight, Search } from "lucide-react";
import SearchInput from "@/components/common/SearchInput";
import {
  COMPONENTS,
  COMPONENT_CATEGORIES,
  ComponentCategory,
  ComponentDefinition,
} from "@/constants/components";

export default function WorkspaceComponentsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [boundComponentIds, setBoundComponentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ComponentCategory | "ALL">("ALL");

  useEffect(() => {
    if (workspaceId) {
      loadBoundComponents();
    }
  }, [workspaceId]);

  const loadBoundComponents = async () => {
    try {
      setLoading(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBoundComponentIds(data.data || []);
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || "获取绑定组件失败");
      }
    } catch (error: any) {
      console.error("加载绑定组件失败:", error);
      toast.error(error.message || "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBind = async (comp: ComponentDefinition, isBound: boolean) => {
    try {
      setUpdatingId(comp.id);
      const userId = localStorage.getItem("userId");
      const action = isBound ? "unbind" : "bind";

      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          action,
          workspaceId,
          componentId: comp.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(isBound ? `组件 ${comp.name} 已解除绑定` : `组件 ${comp.name} 绑定载入成功`);
        // 更新本地状态
        setBoundComponentIds((prev) =>
          isBound ? prev.filter((id) => id !== comp.id) : [...prev, comp.id]
        );
      } else {
        throw new Error(data.error || data.message || "操作失败");
      }
    } catch (error: any) {
      console.error("切换绑定状态失败:", error);
      toast.error(error.message || "操作失败");
    } finally {
      setUpdatingId(null);
    }
  };

  // 过滤组件列表
  const filteredComponents = COMPONENTS.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === "ALL" || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <WorkspaceInternalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* 顶标题栏 */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
            <LayoutGrid className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800">空间组件管理</h2>
            <p className="text-xs text-slate-500 font-semibold">为当前工作空间授权或注销绑定的效能组件</p>
          </div>
        </div>

        {/* 顶部搜索筛选器 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索组件名称或属性要点..."
            />
          </div>
          
          {/* 分类下拉选择 */}
          <div className="flex items-center gap-2 w-full md:w-auto self-stretch md:self-auto justify-end">
            <span className="text-xs font-black text-slate-500 shrink-0">分类:</span>
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value as any)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] font-semibold cursor-pointer min-w-[160px]"
            >
              <option value="ALL">📦 全部分类</option>
              {Object.entries(COMPONENT_CATEGORIES).map(([key, details]) => (
                <option key={key} value={key}>
                  {details.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 主内容区域 */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 font-bold border">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            正在拉取组件列表及绑定状态...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-left">
            {filteredComponents.map((comp) => {
              const categoryInfo = COMPONENT_CATEGORIES[comp.category];
              const isBound = boundComponentIds.includes(comp.id);
              const isUpdating = updatingId === comp.id;

              return (
                <div
                  key={comp.id}
                  className={`group bg-white rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between ${
                    isBound
                      ? "border-blue-200 shadow-md shadow-blue-500/[0.01]"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div>
                    {/* 分类及绑定状态 */}
                    <div className="flex items-center justify-between mb-3.5">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold border"
                        style={{
                          backgroundColor: `${categoryInfo?.color}10`,
                          borderColor: `${categoryInfo?.color}20`,
                          color: categoryInfo?.color,
                        }}
                      >
                        {categoryInfo?.name || "能力"}
                      </span>

                      {/* 绑定状态状态指示 */}
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                          isBound
                            ? "bg-blue-50 text-blue-600 border border-blue-100"
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                      >
                        {isBound ? "已载入" : "未载入"}
                      </span>
                    </div>

                    {/* 标题 */}
                    <h3 className="text-sm font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                      <span className="text-lg">⚙️</span>
                      <span className={isBound ? "text-blue-700" : ""}>{comp.name}</span>
                    </h3>

                    {/* 描述 */}
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed mb-4 min-h-[32px]">
                      {comp.description}
                    </p>
                  </div>

                  {/* Switch 切换按钮 */}
                  <div className="border-t border-slate-100 pt-3.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">权限状态</span>
                    
                    <button
                      onClick={() => handleToggleBind(comp, isBound)}
                      disabled={isUpdating}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isBound ? "bg-[#2b6cb0]" : "bg-slate-200"
                      } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isBound ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </WorkspaceInternalLayout>
  );
}
