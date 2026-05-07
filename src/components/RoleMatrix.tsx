"use client";

import React, { useState, useEffect } from "react";
import { Check, X, Copy, Save, AlertCircle, ChevronRight } from "lucide-react";
import { COMPONENTS } from "@/constants/components";

interface WorkspacePost {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isDefault: boolean;
  isSystem: boolean;
  members?: any[];
}

interface PermissionMatrixProps {
  workspaceId?: string;
}

export default function RoleMatrix({ workspaceId }: PermissionMatrixProps) {
  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // 加载权限数据
  useEffect(() => {
    if (workspaceId) {
      loadPermissions();
    }
  }, [workspaceId]);

  const loadPermissions = async () => {
    if (!workspaceId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/permissions?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPermissions(data.permissions || {});
          if (data.posts && data.posts.length > 0) {
            setPosts(data.posts);
            setSelectedPostId(data.posts[0].id);
          }
        }
      } else {
        console.error("加载权限配置失败");
      }
    } catch (error) {
      console.error("Load permissions error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 保存权限
  const handleSave = async () => {
    if (!workspaceId) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          permissions,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success("权限配置已保存");
        } else {
          toast.error(data.error || "保存失败");
        }
      } else {
        toast.error("保存失败");
      }
    } catch (error) {
      console.error("Save permissions error:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 切换查看权限
  const togglePermission = (postId: string, componentId: string) => {
    setPermissions(prev => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [componentId]: !prev[postId]?.[componentId],
      },
    }));
  };

  // 阶段全选
  const toggleStage = (postId: string, stage: string, componentIds: string[]) => {
    const allChecked = componentIds.every(id => permissions[postId]?.[id]);
    
    setPermissions(prev => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        ...Object.fromEntries(
          componentIds.map(id => [id, !allChecked])
        ),
      },
    }));
  };

  // 复制岗位权限
  const copyPermissions = (fromPostId: string, toPostId: string) => {
    if (fromPostId === toPostId) return;
    
    setPermissions(prev => ({
      ...prev,
      [toPostId]: { ...prev[fromPostId] },
    }));
    toast.success("权限配置已复制");
  };

  // 按阶段分组组件
  const componentsByStage = COMPONENTS.reduce((acc, comp) => {
    if (!acc[comp.category]) {
      acc[comp.category] = [];
    }
    acc[comp.category].push(comp);
    return acc;
  }, {} as Record<string, typeof COMPONENTS>);

  const stages = Object.keys(componentsByStage);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12">
        <div className="flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-600 font-medium">加载权限矩阵中...</span>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">暂无岗位</h3>
        <p className="text-slate-600 mb-6">请先在岗位管理页面创建岗位</p>
        <button
          onClick={() => window.location.href = "/admin/posts"}
          className="px-6 py-2.5 bg-[#3182ce] text-white rounded-lg font-bold hover:bg-[#2b6cb0] transition-colors"
        >
          创建岗位
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div>
          <h2 className="text-lg font-black text-slate-800">企业权限配置中心</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            配置各岗位对 {COMPONENTS.length} 个组件的访问和操作权限
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#3182ce] text-white text-sm font-bold rounded-lg hover:bg-[#2b6cb0] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "保存中..." : "保存配置"}</span>
          </button>
        </div>
      </div>

      {/* 岗位选择器 */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 overflow-x-auto">
          {posts.map(post => (
            <button
              key={post.id}
              onClick={() => setSelectedPostId(post.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                selectedPostId === post.id
                  ? "bg-[#3182ce] text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              style={selectedPostId === post.id ? { backgroundColor: post.color } : {}}
            >
              {post.name}
            </button>
          ))}
        </div>
      </div>

      {/* 权限矩阵表 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left text-xs font-bold text-slate-600 border-r border-slate-200 min-w-[200px]">
                组件 / 岗位
              </th>
              {posts.map(post => (
                <th key={post.id} className="px-4 py-3 text-center min-w-[120px] border-l border-slate-200">
                  <div className="flex flex-col items-center gap-2">
                    <div 
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-black"
                      style={{ backgroundColor: post.color }}
                    >
                      {post.name}
                    </div>
                    {/* 复制权限下拉 */}
                    {selectedPostId && selectedPostId !== post.id && (
                      <button
                        onClick={() => copyPermissions(selectedPostId, post.id)}
                        className="text-[10px] text-slate-600 hover:text-[#3182ce] font-bold transition-colors flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        从此处复制
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, stageIndex) => {
              const stageComponents = componentsByStage[stage];
              const componentIds = stageComponents.map(c => c.id);
              
              return (
                <React.Fragment key={stage}>
                  {/* 阶段标题行 */}
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <td className="sticky left-0 z-10 bg-slate-100 px-4 py-3 text-xs font-black text-slate-700 border-r border-slate-200">
                      <div className="flex items-center gap-2">
                        <span>{stage}</span>
                        <span className="text-[10px] text-slate-500">({stageComponents.length}个组件)</span>
                      </div>
                    </td>
                    {posts.map(post => (
                      <td key={post.id} className="px-4 py-3 text-center border-l border-slate-200">
                        <button
                          onClick={() => toggleStage(post.id, stage, componentIds)}
                          className="text-[10px] text-slate-600 hover:text-[#3182ce] font-bold transition-colors"
                        >
                          全选
                        </button>
                      </td>
                    ))}
                  </tr>
                  
                  {/* 组件行 */}
                  {stageComponents.map((component, compIndex) => (
                    <tr 
                      key={component.id} 
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        compIndex % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 border-r border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono w-8">
                            {component.id}
                          </span>
                          <span>{component.name}</span>
                        </div>
                      </td>
                      {posts.map(post => {
                        const checked = permissions[post.id]?.[component.id] || false;
                        
                        return (
                          <td 
                            key={`${post.id}-${component.id}`} 
                            className="px-4 py-2.5 text-center border-l border-slate-200"
                          >
                            <button
                              onClick={() => togglePermission(post.id, component.id)}
                              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                                checked
                                  ? "bg-[#10b981] text-white hover:bg-[#059669]"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                              }`}
                            >
                              {checked ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 底部说明 */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
        <div className="flex items-start gap-2 text-xs text-slate-600">
          <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p>
            <strong>使用说明：</strong>点击复选框可切换岗位对组件的访问权限。使用"全选"可快速配置整个阶段的权限。点击"从此处复制"可快速复制其他岗位的权限配置。
          </p>
        </div>
      </div>
    </div>
  );
}

// Toast 辅助函数
const toast = {
  success: (message: string) => {
    console.log("✅", message);
    // 如果有全局 toast，使用全局的
    if (typeof window !== 'undefined' && (window as any).toast) {
      (window as any).toast.success(message);
    }
  },
  error: (message: string) => {
    console.error("❌", message);
    if (typeof window !== 'undefined' && (window as any).toast) {
      (window as any).toast.error(message);
    }
  },
};
