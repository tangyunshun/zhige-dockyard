"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Check, X, Plus, ArrowLeft, Settings, Save } from "lucide-react";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";

// 数据模型定义
interface EnterprisePost {
  id: string;
  name: string;
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
  const { userState } = useAppContext();
  
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;
  
  // 状态管理
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [posts, setPosts] = useState<EnterprisePost[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'enterprise'>('personal');
  const [userRole, setUserRole] = useState<'Owner' | 'Admin' | 'Member' | 'Viewer'>('Viewer');

  // Mock 数据 - 岗位列表
  const mockPosts: EnterprisePost[] = [
    { id: 'post_admin', name: '系统管理员', isDefault: true, isSystem: true, color: '#2b6cb0' },
    { id: 'post_sales', name: '售前与商务', isDefault: true, isSystem: false, color: '#10b981' },
    { id: 'post_fullstack', name: '全栈研发', isDefault: true, isSystem: false, color: '#8b5cf6' },
  ];

  // 权限拦截检查
  useEffect(() => {
    // 模拟获取用户角色和工作空间信息
    const checkPermissions = async () => {
      try {
        // 模拟获取工作空间信息
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 模拟设置工作空间类型和用户角色
        setWorkspaceType('enterprise');
        setUserRole('Owner');
        
        // 权限检查
        if (userRole === 'Member' || userRole === 'Viewer') {
          toast.error("无权访问企业设置");
          router.push(`/workspace/${workspaceId}`);
          return;
        }
        
        // 初始化权限矩阵
        initPermissionMatrix();
        
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
  }, [workspaceId]);

  // 初始化权限矩阵
  const initPermissionMatrix = () => {
    setPosts(mockPosts);
    
    // 初始化各岗位的权限
    const initialMatrix: PermissionMatrix = {};
    
    // Admin 默认拥有所有权限
    initialMatrix['post_admin'] = COMPONENTS.map(c => c.id);
    
    // 售前默认拥有商机相关组件
    initialMatrix['post_sales'] = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'];
    
    // 研发默认拥有技术相关组件
    initialMatrix['post_fullstack'] = COMPONENTS
      .filter(c => c.category !== 'BID_PREP')
      .map(c => c.id);
    
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
    const categoryComponents = COMPONENTS.filter(c => c.category === category);
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
    const categoryComponents = COMPONENTS.filter(c => c.category === category);
    const categoryComponentIds = categoryComponents.map(c => c.id);
    const current = permissionMatrix[postId] || [];
    return categoryComponentIds.every(id => current.includes(id));
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    try {
      // 模拟 API 调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("权限配置已保存");
      setHasChanges(false);
    } catch (error) {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 放弃更改
  const handleReset = () => {
    initPermissionMatrix();
    setHasChanges(false);
    toast.success("已重置为原始配置");
  };

  // 处理新建岗位
  const handleCreatePost = () => {
    toast.info("新建岗位功能开发中...");
  };

  // 返回工作空间
  const handleGoBack = () => {
    router.push(`/workspace/${workspaceId}`);
  };

  // 分组组件
  const componentsByCategory = COMPONENTS.reduce((acc, comp) => {
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
            onClick={handleCreatePost}
            className="px-4 py-2.5 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all flex items-center gap-2"
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
          <div className="bg-white border border-slate-200 rounded-[8px] overflow-hidden">
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
                      <div className="text-xs font-bold text-slate-700">系统阶段 / 组件</div>
                    </th>
                    {/* 岗位列 */}
                    {posts.map(post => (
                      <th 
                        key={post.id} 
                        className="sticky top-0 z-10 bg-white px-4 py-4 text-center border-b border-slate-200 min-w-[140px]"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div 
                            className="px-3 py-1.5 rounded-[4px] text-white text-xs font-black"
                            style={{ backgroundColor: post.color || '#2b6cb0' }}
                          >
                            {post.name}
                          </div>
                          {post.isSystem && (
                            <span className="text-[10px] text-slate-500">系统预设</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                
                {/* 表体 */}
                <tbody>
                  {categories.map(category => {
                    const categoryComponents = componentsByCategory[category];
                    const categoryInfo = COMPONENT_CATEGORIES[category];
                    
                    return (
                      <React.Fragment key={category}>
                        {/* 阶段分组行 */}
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 border-r border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">{categoryInfo.name}</span>
                              <span className="text-[10px] text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                {categoryInfo.range}
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
            {hasChanges && <span className="text-orange-600 font-bold">⚠️ 有未保存的更改</span>}
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
    </div>
  );
}
