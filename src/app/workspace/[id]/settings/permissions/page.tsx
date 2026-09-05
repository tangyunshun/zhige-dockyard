"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Check,
  X,
  Plus,
  ArrowLeft,
  Settings,
  Save,
  Sparkles,
  UploadCloud,
  Lock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Trash2,
  Download,
  Layers,
  Shield,
  FolderPlus,
} from "lucide-react";
import type { ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";

// 数据模型定义
interface EnterprisePost {
  id: string;
  name: string;
  code?: string;
  isDefault: boolean;
  isSystem?: boolean;
  color?: string;
  description?: string;
}

type PermissionMatrix = Record<string, string[]>; // Key: PostId, Value: ComponentId[]

export default function WorkspacePermissionsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  // 组件信息与分类来自数据库（component_catalog / component_category 表）
  const { userState, componentCatalog, componentCategories } = useAppContext();
  const COMPONENTS = componentCatalog || [];
  const COMPONENT_CATEGORIES = componentCategories || ({} as Record<ComponentCategory, { name: string; description: string }>);
  
  const workspaceId = (Array.isArray(params.id) ? params.id[0] : params.id) || "";
  
  // 状态管理
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [posts, setPosts] = useState<EnterprisePost[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'enterprise'>('personal');
  const [userRole, setUserRole] = useState<'Owner' | 'Admin' | 'Member' | 'Viewer'>('Owner');

  // 新建岗位模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostForm, setNewPostForm] = useState({
    name: "",
    code: "",
    description: "",
    color: "#3182ce",
  });

  // 从官方标准库引入岗位状态
  const [showAddStandardModal, setShowAddStandardModal] = useState(false);
  const [standardPosts, setStandardPosts] = useState<any[]>([]);
  const [loadingStandardPosts, setLoadingStandardPosts] = useState(false);
  const [addingPostId, setAddingPostId] = useState<string | null>(null);

  // 严格移除岗位模态框状态
  const [postToDelete, setPostToDelete] = useState<EnterprisePost | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showDeleteBlockedModal, setShowDeleteBlockedModal] = useState(false);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // 默认备用岗位列表（当接口未返回时使用）
  const fallbackPosts: EnterprisePost[] = [
    { id: 'post_owner', name: '空间所有者', code: 'OWNER', isDefault: true, isSystem: true, color: '#2b6cb0', description: '企业空间创建者与最高统括负责人' },
    { id: 'post_admin', name: '空间管理员', code: 'ADMIN', isDefault: true, isSystem: false, color: '#805ad5', description: '空间协管员' },
    { id: 'post_auditor', name: '空间审计员', code: 'AUDITOR', isDefault: true, isSystem: false, color: '#718096', description: '合规与安全监督审计' },
  ];

  // 加载空间真实岗位列表与数据库持久化权限
  const loadWorkspacePosts = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/workspace-hub/posts?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rawPosts = data.data?.posts || [];
        const rawPerms = data.data?.permissions || {};

        if (rawPosts.length > 0) {
          const mapped: EnterprisePost[] = rawPosts.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.code || p.id,
            isDefault: p.isDefault || false,
            isSystem: p.isSystem || false,
            color: p.color || '#3182ce',
            description: p.description || '',
          }));
          setPosts(mapped);

          // 从数据库真实映射解析勾选的组件列表（拒绝假数据）
          const realMatrix: PermissionMatrix = {};
          mapped.forEach(p => {
            const postPermMap = rawPerms[p.id] || {};
            const activeCompIds = Object.entries(postPermMap)
              .filter(([_, perm]: [string, any]) => perm?.canView || perm?.canExecute)
              .map(([compId]) => compId);

            if (activeCompIds.length > 0) {
              realMatrix[p.id] = activeCompIds;
            } else if (p.isSystem || p.name.includes("所有者")) {
              // 空间所有者初始化全量组件
              realMatrix[p.id] = (COMPONENTS || []).map(c => c.id);
            } else {
              realMatrix[p.id] = [];
            }
          });
          setPermissionMatrix(realMatrix);
          return;
        }
      }
    } catch (err) {
      console.warn("读取空间专属岗位列表失败，使用默认岗位集:", err);
    }
    // 回退到默认岗位
    setPosts(fallbackPosts);
    initPermissionMatrix(fallbackPosts);
  }, [workspaceId, COMPONENTS]);

  // 权限拦截检查
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setWorkspaceType('enterprise');
        setUserRole('Owner');
        await loadWorkspacePosts();
      } catch (error) {
        console.error("权限检查失败:", error);
        toast.error("加载失败");
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) {
      checkPermissions();
    }
  }, [workspaceId, loadWorkspacePosts]);

  // 初始化权限矩阵（用于备用或初始补齐）
  const initPermissionMatrix = (targetPosts: EnterprisePost[]) => {
    const initialMatrix: PermissionMatrix = {};
    
    targetPosts.forEach((post) => {
      if (post.id === 'post_owner' || post.isSystem || post.name.includes('所有者')) {
        initialMatrix[post.id] = (COMPONENTS || []).map(c => c.id);
      } else if (post.id === 'post_admin' || post.name.includes('管理员')) {
        initialMatrix[post.id] = (COMPONENTS || []).map(c => c.id);
      } else if (post.name.includes('审计') || post.name.includes('观察')) {
        initialMatrix[post.id] = [];
      } else {
        initialMatrix[post.id] = [];
      }
    });
    
    setPermissionMatrix(initialMatrix);
  };

  // 切换组件权限
  const toggleComponentPermission = (postId: string, componentId: string) => {
    setPermissionMatrix(prev => {
      const current = prev[postId] || [];
      const newPermissions = current.includes(componentId)
        ? current.filter(id => id !== componentId)
        : [...current, componentId];
      
      return {
        ...prev,
        [postId]: newPermissions
      };
    });
    setHasChanges(true);
  };

  // 阶段全选/取消全选
  const toggleStagePermissions = (postId: string, category: ComponentCategory) => {
    const categoryComponents = (COMPONENTS || []).filter(c => c.category === category);
    const categoryComponentIds = categoryComponents.map(c => c.id);
    
    setPermissionMatrix(prev => {
      const current = prev[postId] || [];
      const allSelected = categoryComponentIds.every(id => current.includes(id));
      
      let newPermissions;
      if (allSelected) {
        // 取消全选
        newPermissions = current.filter(id => !categoryComponentIds.includes(id));
      } else {
        // 全选
        const toAdd = categoryComponentIds.filter(id => !current.includes(id));
        newPermissions = [...current, ...toAdd];
      }
      
      return {
        ...prev,
        [postId]: newPermissions
      };
    });
    setHasChanges(true);
  };

  // 检查组件是否有权限
  const hasComponentPermission = (postId: string, componentId: string): boolean => {
    return permissionMatrix[postId]?.includes(componentId) || false;
  };

  // 检查阶段是否全部有权限
  const isStageFullyEnabled = (postId: string, category: ComponentCategory): boolean => {
    const categoryComponents = (COMPONENTS || []).filter(c => c.category === category);
    const categoryComponentIds = categoryComponents.map(c => c.id);
    const current = permissionMatrix[postId] || [];
    return categoryComponentIds.every(id => current.includes(id));
  };

  // 真实持久化保存配置到数据库
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          permissionMatrix,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "权限配置已成功持久化至数据库！");
        setHasChanges(false);
        await loadWorkspacePosts();
      } else {
        toast.error(data.error || "保存失败，请重试");
      }
    } catch (error) {
      toast.error("网络异常，保存权限失败");
    } finally {
      setSaving(false);
    }
  };

  // 放弃更改
  const handleReset = () => {
    loadWorkspacePosts();
    setHasChanges(false);
    toast.success("已重置为数据库最新配置");
  };

  // 打开【从官方标准库引入岗位】模态框
  const handleOpenAddStandardModal = async () => {
    setShowAddStandardModal(true);
    setLoadingStandardPosts(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/posts/standard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStandardPosts(data.posts || []);
      } else {
        toast.error("加载官方岗位库失败");
      }
    } catch (err) {
      console.error("加载标准岗位库错误:", err);
      toast.error("网络异常，无法获取系统标准岗位库");
    } finally {
      setLoadingStandardPosts(false);
    }
  };

  // 从官方标准库添加岗位至当前企业空间
  const handleAddStandardPostToWorkspace = async (standardPost: any) => {
    setAddingPostId(standardPost.id);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          name: standardPost.name,
          code: standardPost.code,
          description: standardPost.description,
          color: standardPost.color || "#3182ce",
          syncToSystem: false, // 本身已是官方标准岗位，无需再次向超管提报
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`官方岗位【${standardPost.name}】已成功引入当前企业空间！`);
        await loadWorkspacePosts();
      } else {
        toast.error(data.error || "引入岗位失败");
      }
    } catch (err) {
      console.error("添加标准岗位失败:", err);
      toast.error("网络异常，引入岗位失败");
    } finally {
      setAddingPostId(null);
    }
  };

  // 严格前置门禁：请求移除岗位
  const handleRequestDeletePost = (post: EnterprisePost) => {
    // 门禁 1：空间所有者永久锁定，绝对禁止移除
    if (post.isSystem || post.name.trim() === "空间所有者") {
      toast.error("【空间所有者】为空间最高权限根基岗位，系统强制锁定，不可移除！");
      return;
    }

    // 门禁 2：检查该岗位在当前矩阵中是否配置了组件权限
    const activePermsCount = permissionMatrix[post.id]?.length || 0;
    setPostToDelete(post);

    if (activePermsCount > 0) {
      // 存在组件绑定，打开阻断说明弹窗
      setShowDeleteBlockedModal(true);
    } else {
      // 完全无组件绑定，进入二次确认弹窗
      setShowDeleteConfirmModal(true);
    }
  };

  // 执行确认移除
  const handleConfirmDeletePost = async () => {
    if (!postToDelete) return;
    setIsDeletingPost(true);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/user/workspace-hub/posts/${postToDelete.id}?workspaceId=${workspaceId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `岗位【${postToDelete.name}】已成功从企业空间移除`);
        setShowDeleteConfirmModal(false);
        setPostToDelete(null);
        await loadWorkspacePosts();
      } else {
        toast.error(data.error || "移除岗位失败");
      }
    } catch (err) {
      console.error("移除岗位失败:", err);
      toast.error("网络异常，移除岗位失败");
    } finally {
      setIsDeletingPost(false);
    }
  };

  // 打开新建自定义岗位模态框
  const handleCreatePost = () => {
    setNewPostForm({
      name: "",
      code: "",
      description: "",
      color: "#3182ce",
    });
    setShowCreateModal(true);
  };

  // 提交新建岗位表单：进入是否同步确认步骤
  const handlePreSubmitPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostForm.name.trim()) {
      toast.error("请输入岗位名称");
      return;
    }
    setShowCreateModal(false);
    setShowSyncConfirmModal(true);
  };

  // 执行最终保存：用户在二次确认弹窗中选择是否同步至系统岗位集
  const handleConfirmSavePost = async (syncToSystem: boolean) => {
    setCreatingPost(true);
    try {
      const token = getAuthToken();
      const code =
        newPostForm.code.trim() ||
        `POST_${Date.now().toString().slice(-6)}`;

      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          name: newPostForm.name.trim(),
          code,
          description: newPostForm.description.trim(),
          color: newPostForm.color,
          syncToSystem,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (syncToSystem) {
          toast.success("岗位创建成功，并已同步提报至系统官方岗位集待审！");
        } else {
          toast.success("岗位创建成功（仅在当前企业空间内部生效）");
        }
        setShowSyncConfirmModal(false);
        // 重新加载并渲染当前空间岗位与权限矩阵
        await loadWorkspacePosts();
      } else {
        toast.error(data.error || "创建岗位失败");
      }
    } catch (err) {
      console.error("创建岗位失败:", err);
      toast.error("网络异常，创建岗位失败");
    } finally {
      setCreatingPost(false);
    }
  };

  // 返回工作空间
  const handleGoBack = () => {
    router.push(`/workspace/${workspaceId}`);
  };

  // 分组组件
  const componentsByCategory = (COMPONENTS || []).reduce((acc, comp) => {
    if (!acc[comp.category]) {
      acc[comp.category] = [];
    }
    acc[comp.category].push(comp);
    return acc;
  }, {} as Record<ComponentCategory, typeof COMPONENTS>);

  const categories = Object.keys(componentsByCategory) as ComponentCategory[];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载权限配置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f8ff] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-2 text-slate-600 hover:text-[#2b6cb0] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-300"></div>
          <div>
            <h1 className="text-lg font-black text-slate-800">岗位与组件权限配置</h1>
            <p className="text-xs text-slate-600">
              为不同岗位分配组件。未授权的组件将在该岗位员工的侧边栏中自动隐藏。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAddStandardModal}
            className="px-4 py-2.5 bg-gradient-to-r from-[#6b46c1] to-[#805ad5] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all flex items-center gap-2 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>+ 添加岗位 (系统库)</span>
          </button>
          <button
            onClick={handleCreatePost}
            className="px-4 py-2.5 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all flex items-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>新建自定义岗位</span>
          </button>
        </div>
      </header>

      {/* 主要内容区域 */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {/* 权限矩阵表格 */}
          <div className="bg-white border border-slate-200 rounded-[8px] overflow-hidden shadow-xs">
            {/* 表格容器 */}
            <div className="overflow-x-auto">
              <table className="w-full">
                {/* 表头 */}
                <thead>
                  <tr className="bg-white">
                    {/* 第一列 - 冻结 */}
                    <th 
                      className="sticky left-0 z-20 bg-white px-4 py-4 text-left border-b border-slate-200 border-r border-slate-200 min-w-[220px]"
                    >
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-[#3182ce]" />
                        <span>系统阶段 / 组件权限矩阵</span>
                      </div>
                    </th>
                    {/* 岗位列 */}
                    {posts.map(post => {
                      const isOwner = post.isSystem || post.name.trim() === '空间所有者';
                      const activePermsCount = permissionMatrix[post.id]?.length || 0;
                      return (
                        <th 
                          key={post.id} 
                          className="sticky top-0 z-10 bg-white px-4 py-3.5 text-center border-b border-slate-200 min-w-[160px]"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div 
                              className="px-3 py-1.5 rounded-[4px] text-white text-xs font-black shadow-xs tracking-wide"
                              style={{ backgroundColor: post.color || '#2b6cb0' }}
                            >
                              {post.name}
                            </div>
                            
                            {isOwner ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-[4px]">
                                <span>👑 空间所有者 (系统锁定)</span>
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-2 w-full pt-0.5">
                                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded-[4px]">
                                  已授 {activePermsCount} 项
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeletePost(post)}
                                  className={`px-2 py-0.5 text-[11px] font-bold rounded-[4px] border transition-all flex items-center gap-1 ${
                                    activePermsCount > 0
                                      ? "text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50/50"
                                      : "text-red-600 border-red-200 bg-red-50/70 hover:bg-red-100 hover:border-red-300 shadow-2xs"
                                  }`}
                                  title={
                                    activePermsCount > 0
                                      ? "当前岗位仍有组件权限勾选，必须先清空所有组件权限方可移除"
                                      : "点击安全移除此岗位"
                                  }
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>移除</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                
                {/* 表体 */}
                <tbody>
                  {categories.map(category => {
                    const categoryComponents = componentsByCategory[category];
                    const categoryInfo = (COMPONENT_CATEGORIES && (COMPONENT_CATEGORIES as any)[category]) || {
                      name: String(category || "通用业务阶段"),
                      range: "全阶段",
                      description: "知阁平台标准研发协同组件",
                    };
                    
                    return (
                      <React.Fragment key={category}>
                        {/* 阶段分组行 */}
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 border-r border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">
                                {categoryInfo?.name || String(category)}
                              </span>
                              <span className="text-[10px] text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                {categoryInfo?.range || "全阶段"}
                              </span>
                            </div>
                          </td>
                          {posts.map(post => {
                            const stageFullEnabled = isStageFullyEnabled(post.id, category);
                            return (
                              <td 
                                key={`stage-${post.id}`}
                                className="px-4 py-3 text-center border-t border-slate-200"
                              >
                                <button
                                  onClick={() => toggleStagePermissions(post.id, category)}
                                  className="text-[11px] font-bold text-slate-600 hover:text-[#2b6cb0] transition-colors flex items-center justify-center gap-1 mx-auto"
                                >
                                  {stageFullEnabled ? '取消全选' : '全选本阶段'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                        
                        {/* 组件行 */}
                        {categoryComponents.map((component, index) => (
                          <tr 
                            key={component.id}
                            className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-slate-50/70 transition-colors`}
                          >
                            <td className="sticky left-0 z-10 px-4 py-3 border-r border-slate-200 bg-white">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono w-10">
                                  {component.id}
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                  {component.name}
                                </span>
                              </div>
                            </td>
                            {posts.map(post => {
                              const hasPermission = hasComponentPermission(post.id, component.id);
                              return (
                                <td 
                                  key={`${post.id}-${component.id}`}
                                  className="px-4 py-3 text-center border-l border-slate-100"
                                >
                                  {/* 自定义 Checkbox */}
                                  <button
                                    onClick={() => toggleComponentPermission(post.id, component.id)}
                                    className={`w-5 h-5 rounded-[4px] border-2 transition-all flex items-center justify-center ${
                                      hasPermission
                                        ? 'bg-[#2b6cb0] border-[#2b6cb0]'
                                        : 'bg-white border-slate-300 hover:border-slate-400'
                                    }`}
                                  >
                                    {hasPermission && (
                                      <Check className="w-3.5 h-3.5 text-white" />
                                    )}
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
          </div>
        </div>
      </main>
      
      {/* 底部操作栏 - 悬浮固定 */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {hasChanges && <span className="text-amber-600 font-bold">⚠️ 有未保存的更改</span>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              disabled={saving || !hasChanges}
              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              放弃更改
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-6 py-2.5 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存配置</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ======================= MODAL 1: 新建空间自定义岗位 ======================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">新建空间自定义岗位</h3>
                  <p className="text-[11px] text-slate-400">为当前企业空间设置新岗位并配置组件权限</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePreSubmitPost} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  <span className="text-red-500 mr-1">*</span>岗位名称
                </label>
                <input
                  type="text"
                  required
                  value={newPostForm.name}
                  onChange={(e) => setNewPostForm({ ...newPostForm, name: e.target.value })}
                  placeholder="例如：量化策略分析师、算法研究员..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  岗位代号 / 英文标识
                </label>
                <input
                  type="text"
                  value={newPostForm.code}
                  onChange={(e) => setNewPostForm({ ...newPostForm, code: e.target.value })}
                  placeholder="例如：QUANT_ANALYST (留空则自动生成)"
                  className="w-full px-3.5 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-blue-100 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  岗位定位与职责描述
                </label>
                <textarea
                  rows={2}
                  value={newPostForm.description}
                  onChange={(e) => setNewPostForm({ ...newPostForm, description: e.target.value })}
                  placeholder="描述该岗位在企业内部的职能边界..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  岗位专属主题色
                </label>
                <div className="flex items-center gap-2">
                  {["#3182ce", "#2b6cb0", "#805ad5", "#38a169", "#dd6b20", "#e53e3e", "#4a5568"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewPostForm({ ...newPostForm, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        newPostForm.color === c ? "border-slate-800 scale-110 shadow-xs" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>保存并下一步</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL 2: 核心同步至系统岗位集合询问确认弹窗 ======================= */}
      {showSyncConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-6 text-left space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 shadow-2xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    同步至系统岗位库确认
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    是否将此岗位信息同步至系统岗位集合？系统检测到【<strong>{newPostForm.name}</strong>】为当前企业新增岗位
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-2 leading-relaxed">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800">选择【同意同步】：</strong>
                    <span>该岗位将在当前企业空间立即可用，同时同步提报至系统管理员后台审核池。超管审阅接收后，将作为全平台官方标准岗位推广至所有企业空间！</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-slate-200/60">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800">选择【不同意，仅当前空间使用】：</strong>
                    <span>该岗位将作为您企业的专有独立岗位，仅限本空间内部使用，不提交至全平台官方标准岗位集。</span>
                  </div>
                </div>
              </div>

              {creatingPost && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-[#3182ce]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在处理岗位创建与提交...</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={creatingPost}
                  onClick={() => setShowSyncConfirmModal(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors order-3 sm:order-1"
                >
                  返回修改
                </button>
                <button
                  type="button"
                  disabled={creatingPost}
                  onClick={() => handleConfirmSavePost(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 order-2"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>不同意，仅当前空间使用</span>
                </button>
                <button
                  type="button"
                  disabled={creatingPost}
                  onClick={() => handleConfirmSavePost(true)}
                  className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:from-[#2c5282] hover:to-[#2b6cb0] rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 order-1 sm:order-3"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>是，同步至系统集合（推荐）</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL 3: 从系统官方岗位库引入岗位 ======================= */}
      {showAddStandardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-[#805ad5] flex items-center justify-center shadow-xs">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <span>从全平台官方标准岗位库添加</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-[#6b46c1]">
                      共 {standardPosts.length} 个标准岗位
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    一键引入平台官方沉淀的标准岗位（如项目经理、空间管理员等）至当前企业空间，即可直接分配组件权限
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStandardModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {loadingStandardPosts ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-8 h-8 text-[#805ad5] animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">正在同步读取系统官方标准岗位库...</p>
                </div>
              ) : standardPosts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  暂无可用标准岗位数据
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {standardPosts.map((sp) => {
                    const alreadyAdded = posts.some(
                      (p) => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase()
                    );
                    const isAddingThis = addingPostId === sp.id;

                    return (
                      <div
                        key={sp.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                          alreadyAdded
                            ? "bg-slate-50/80 border-slate-200 opacity-80"
                            : "bg-white border-slate-200 hover:border-purple-300 hover:shadow-xs"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span
                              className="px-2.5 py-0.5 text-xs font-black text-white rounded-[4px] shadow-2xs"
                              style={{ backgroundColor: sp.color || "#3182ce" }}
                            >
                              {sp.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-[3px]">
                              {sp.code}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {sp.description || "全平台统一研发标准岗位"}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            {alreadyAdded ? "✓ 本企业空间已配置" : "官方通用标配"}
                          </span>

                          {alreadyAdded ? (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-[4px] flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>已引入</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isAddingThis}
                              onClick={() => handleAddStandardPostToWorkspace(sp)}
                              className="px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-[#6b46c1] to-[#805ad5] hover:opacity-90 rounded-[4px] shadow-xs transition-all flex items-center gap-1 disabled:opacity-50"
                            >
                              {isAddingThis ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>引入中...</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>+ 引入至空间</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                如果官方库没有您需要的岗位，可直接点击【新建自定义岗位】并提报！
              </span>
              <button
                type="button"
                onClick={() => setShowAddStandardModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL 4: 岗位仍绑定权限时的阻断说明弹窗 ======================= */}
      {showDeleteBlockedModal && postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-red-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-left space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    无法移除岗位【{postToDelete.name}】
                  </h3>
                  <p className="text-xs text-red-600 font-bold mt-1">
                    系统安全门禁拦截：该岗位仍绑定有已授权组件！
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-red-50/50 border border-red-100 text-xs text-slate-700 space-y-2 leading-relaxed">
                <p>
                  岗位【<strong>{postToDelete.name}</strong>】当前在权限矩阵中仍配置勾选了{" "}
                  <span className="font-black text-red-600 underline">
                    {permissionMatrix[postToDelete.id]?.length || 0}
                  </span>{" "}
                  项系统组件权限。
                </p>
                <p className="text-slate-500 text-[11px]">
                  <strong>业务规范说明：</strong>为保障企业研发流程的连续性与权限审计合规，知阁平台严格要求：<strong>只有在完全取消该岗位的所有组件权限勾选后，方允许执行移除操作</strong>。
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteBlockedModal(false);
                    setPostToDelete(null);
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all shadow-xs"
                >
                  我知道了，去清空该岗位勾选
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL 5: 0组件绑定时的安全移除二次确认弹窗 ======================= */}
      {showDeleteConfirmModal && postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-left space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    确认移除岗位【{postToDelete.name}】？
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    系统已确认该岗位当前未绑定任何组件权限
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
                移除后，该岗位将从当前企业空间中彻底注销，不再出现在权限配置矩阵和成员分配列表中。
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingPost}
                  onClick={() => {
                    setShowDeleteConfirmModal(false);
                    setPostToDelete(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isDeletingPost}
                  onClick={handleConfirmDeletePost}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
                >
                  {isDeletingPost ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在移除...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>确认移除岗位</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ZhiGe Enterprise Workspace Permissions Page updated successfully

