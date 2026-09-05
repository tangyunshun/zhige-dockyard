"use client";

import React, { useState, useEffect } from "react";
import {
  Check,
  X,
  Copy,
  Save,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Plus,
  Briefcase,
  Loader2,
  CheckSquare,
  Square,
} from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface WorkspacePost {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isDefault: boolean;
  isSystem: boolean;
  members?: any[];
}

interface SuggestedPost {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  isImported: boolean;
}

interface PermissionMatrixProps {
  workspaceId?: string;
}

export default function RoleMatrix({ workspaceId }: PermissionMatrixProps) {
  const toast = useToast();
  // 组件列表来自数据库（component_catalog 表，经 AppContext 加载）
  const { componentCatalog: COMPONENTS } = useAppContext();
  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // 一键导入建议岗位弹窗状态
  const [showImportModal, setShowImportModal] = useState(false);
  const [suggestedPosts, setSuggestedPosts] = useState<SuggestedPost[]>([]);
  const [selectedSuggestedIds, setSelectedSuggestedIds] = useState<string[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [importing, setImporting] = useState(false);

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
      const res = await fetch(`/api/admin/permissions?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
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
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
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

  // 打开导入平台建议岗位弹窗
  const handleOpenImportModal = async () => {
    if (!workspaceId) return;
    setShowImportModal(true);
    setLoadingSuggested(true);
    try {
      const res = await fetch(`/api/workspace/posts/suggested?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const list: SuggestedPost[] = data.suggestedPosts || [];
          setSuggestedPosts(list);
          // 默认选中所有尚未导入的岗位
          const unimportedIds = list.filter(p => !p.isImported).map(p => p.id);
          setSelectedSuggestedIds(unimportedIds);
        }
      } else {
        toast.error("加载平台建议岗位失败");
      }
    } catch (err) {
      console.error("Load suggested posts error:", err);
      toast.error("网络异常，无法获取建议岗位");
    } finally {
      setLoadingSuggested(false);
    }
  };

  // 执行一键导入
  const handleImportPosts = async () => {
    if (!workspaceId || selectedSuggestedIds.length === 0) {
      toast.error("请至少勾选一个建议岗位");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/workspace/posts/suggested", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          workspaceId,
          postIds: selectedSuggestedIds,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "岗位导入成功！");
        setShowImportModal(false);
        // 重新加载工作空间岗位和权限
        await loadPermissions();
      } else {
        toast.error(data.error || "导入失败");
      }
    } catch (err) {
      console.error("Import suggested posts error:", err);
      toast.error("网络异常，导入失败");
    } finally {
      setImporting(false);
    }
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
        <h3 className="text-lg font-bold text-slate-800 mb-2">暂无企业岗位</h3>
        <p className="text-slate-600 mb-6 text-xs max-w-md mx-auto">
          当前企业空间尚未配置业务岗位。您可以直接从平台官方标准岗位库一键导入，也可以前往岗位中心手动创建。
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleOpenImportModal}
            className="px-5 py-2.5 bg-[#3182ce] text-white text-xs font-bold rounded-xl hover:bg-[#2b6cb0] transition-colors flex items-center gap-2 shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>从平台标准库一键导入</span>
          </button>
          <button
            type="button"
            onClick={() => window.location.href = `/admin/posts?workspaceId=${workspaceId}`}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            手动创建岗位
          </button>
        </div>

        {/* 导入弹窗 */}
        {renderImportModal()}
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
            type="button"
            onClick={handleOpenImportModal}
            className="px-3.5 py-2 bg-blue-50 text-[#3182ce] hover:bg-blue-100 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 border border-blue-200/80 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>从平台标准库导入</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#3182ce] text-white text-xs font-bold rounded-lg hover:bg-[#2b6cb0] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
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
            <strong>使用说明：</strong>点击复选框可切换岗位对组件的访问权限。使用"全选"可快速配置整个阶段的权限。点击"从此处复制"可快速复制其他岗位的权限配置。支持从平台官方标准库一键导入预设专业研发岗位。
          </p>
        </div>
      </div>

      {/* 导入平台标准建议岗位弹窗 */}
      {renderImportModal()}
    </div>
  );

  // 渲染导入标准建议岗位弹窗
  function renderImportModal() {
    if (!showImportModal) return null;

    const availableToImport = suggestedPosts.filter((p) => !p.isImported);
    const allSelected =
      availableToImport.length > 0 &&
      availableToImport.every((p) => selectedSuggestedIds.includes(p.id));

    const toggleSelectAll = () => {
      if (allSelected) {
        setSelectedSuggestedIds([]);
      } else {
        setSelectedSuggestedIds(availableToImport.map((p) => p.id));
      }
    };

    const toggleSelectOne = (id: string) => {
      setSelectedSuggestedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200 text-left">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
          {/* 弹窗头部 */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  从平台官方标准库导入岗位
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  勾选系统预设标准岗位，一键为当前企业空间建立岗位与基础权限
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowImportModal(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 岗位列表内容区 */}
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            {loadingSuggested ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin mb-3" />
                <p className="text-xs font-bold text-slate-500">正在获取官方标准岗位库...</p>
              </div>
            ) : suggestedPosts.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                暂无平台推荐标准岗位
              </div>
            ) : (
              <>
                {/* 快速全选栏 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-600">
                  <span>选择要装配的推荐岗位 ({availableToImport.length} 个未装配)</span>
                  {availableToImport.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-[#3182ce] hover:underline cursor-pointer"
                    >
                      {allSelected ? "取消全选" : "全选未导入"}
                    </button>
                  )}
                </div>

                {/* 岗位卡片 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {suggestedPosts.map((sp) => {
                    const isSelected = selectedSuggestedIds.includes(sp.id);
                    const isImported = sp.isImported;

                    return (
                      <div
                        key={sp.id}
                        onClick={() => {
                          if (!isImported) toggleSelectOne(sp.id);
                        }}
                        className={`p-3 rounded-xl border transition-all select-none ${
                          isImported
                            ? "bg-slate-50 border-slate-200/60 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-blue-50/50 border-[#3182ce] shadow-2xs cursor-pointer ring-1 ring-[#3182ce]/20"
                            : "bg-white border-slate-200/80 hover:bg-slate-50 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: sp.color }}
                            />
                            <span className="text-xs font-black text-slate-800 truncate">
                              {sp.name}
                            </span>
                          </div>

                          {isImported ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 shrink-0">
                              已装配
                            </span>
                          ) : (
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? "bg-[#3182ce] border-[#3182ce]"
                                  : "bg-white border-slate-300"
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                          {sp.description || "全能岗位，支持组件协同治理"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 弹窗底部 */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              已选中 <strong className="text-[#3182ce]">{selectedSuggestedIds.length}</strong> 个标准岗位
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={importing || selectedSuggestedIds.length === 0}
                onClick={handleImportPosts}
                className="px-5 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>一键导入所选岗位</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
