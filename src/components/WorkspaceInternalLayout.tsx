"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Search, Settings, ChevronDown, ChevronUp, Menu, Plus, ExternalLink } from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import SearchInput from "@/components/common/SearchInput";
import WorkspaceUpgradeModal from "./WorkspaceUpgradeModal";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory } from "@/constants/components";

// 53个组件的定义结构
interface ZhiGeComponent {
  id: string; // C01-C53
  title: string;
  stageId: number; // 1-10 阶段
  path: string;
  icon: string;
}

// 用户在当前空间的权限快照
interface CurrentAuth {
  workspaceType: "PERSONAL" | "ENTERPRISE";
  userRole: "Owner" | "Admin" | "Member" | "Viewer";
  allowedComponentIds: string[]; // 由后端根据岗位动态下发的 ID 数组
}

// 阶段数据结构
interface Stage {
  id: number;
  name: string;
  color: string;
  bgColor: string;
}

// 建立 Category 到 1-10 阶段的转换关系
const categoryToStageId: Record<ComponentCategory, number> = {
  BID_PREP: 1,
  REQ_DESIGN: 2,
  BACKEND_CORE: 3,
  DATABASE_ENG: 4,
  FRONTEND_DEV: 5,
  TEST_QA: 6,
  DEVOPS: 7,
  SECURITY: 8,
  PROJ_MGMT: 9,
  KNOWLEDGE: 10,
};

const categoryEmojis: Record<ComponentCategory, string> = {
  BID_PREP: "📄",
  REQ_DESIGN: "🧩",
  BACKEND_CORE: "🧱",
  DATABASE_ENG: "🗄️",
  FRONTEND_DEV: "📐",
  TEST_QA: "🧪",
  DEVOPS: "🐳",
  SECURITY: "🔒",
  PROJ_MGMT: "👔",
  KNOWLEDGE: "🧠",
};

// 动态将 COMPONENTS 映射为 ZhiGeComponent 列表
const allComponents: ZhiGeComponent[] = COMPONENTS.map(c => ({
  id: c.id,
  title: c.name,
  stageId: categoryToStageId[c.category] || 1,
  path: `/workspace/component/${c.id}`,
  icon: categoryEmojis[c.category] || "⚙️"
}));

// 动态映射 10 大阶段列表
const stages: Stage[] = Object.entries(COMPONENT_CATEGORIES).map(([key, value]) => {
  const cat = key as ComponentCategory;
  return {
    id: categoryToStageId[cat] || 1,
    name: value.name,
    color: value.color,
    bgColor: `from-[${value.color}]/10 to-[${value.color}]/20`
  };
}).sort((a, b) => a.id - b.id);

interface WorkspaceInternalLayoutProps {
  children?: React.ReactNode;
}

export default function WorkspaceInternalLayout({ children }: WorkspaceInternalLayoutProps) {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [userRole, setUserRole] = useState<"Owner" | "Admin" | "Member" | "Viewer">("Owner");
  const [loading, setLoading] = useState(true);
  const [currentComponentId, setCurrentComponentId] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<number[]>([1, 2]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 模拟权限数据（实际应从后端获取）
  const [authData, setAuthData] = useState<CurrentAuth>({
    workspaceType: "PERSONAL",
    userRole: "Owner",
    allowedComponentIds: ["C01", "C07"] // 免费用户只有两个组件
  });

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/workspace/list");
      if (res.ok) {
        const data = await res.json();
        const workspace = data.workspaces.find((w: any) => w.id === id);
        if (workspace) {
          setWorkspaceName(workspace.name);
          setWorkspaceType(workspace.type);

          // 动态拉取当前工作区在 Studio 中绑定的组件 ID 列表
          let boundIds: string[] = [];
          try {
            const userId = localStorage.getItem("userId");
            const boundRes = await fetch(`/api/studio?action=bound&workspaceId=${id}`, {
              headers: userId ? { Authorization: `Bearer ${userId}` } : {},
            });
            if (boundRes.ok) {
              const boundData = await boundRes.json();
              if (boundData.success) {
                boundIds = boundData.data || [];
              }
            }
          } catch (err) {
            console.error("拉取绑定组件失败:", err);
          }

          // 合并默认的基础组件与数据库中已绑定的组件 ID
          const allowedIds = Array.from(new Set(["C01", "C02", "C07", ...boundIds]));

          setAuthData({
            workspaceType: workspace.type,
            userRole: workspace.role || "Owner",
            allowedComponentIds: workspace.type === "PERSONAL" 
              ? allComponents.map(c => c.id) // 个人空间默认所有组件都可用
              : allowedIds // 企业空间允许默认基础组件 + 数据库中已绑定的组件
          });
        } else {
          toast.error("工作空间不存在");
          router.push("/workspace-hub");
        }
      }
    } catch (error) {
      console.warn("加载工作空间失败:", error);
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (params.id) {
      const id = Array.isArray(params.id) ? params.id[0] : params.id;
      setWorkspaceId(id);
      loadWorkspace(id);
    }
  }, [params.id, loadWorkspace]);

  const handleGoBack = () => {
    router.push("/workspace-hub");
  };

  const toggleStage = (stageId: number) => {
    setExpandedStages(prev => 
      prev.includes(stageId) 
        ? prev.filter(id => id !== stageId) 
        : [...prev, stageId]
    );
  };

  const handleComponentClick = (component: ZhiGeComponent) => {
    if (authData.workspaceType === "ENTERPRISE" && !authData.allowedComponentIds.includes(component.id)) {
      toast.error("您没有权限使用此组件");
      return;
    }
    setCurrentComponentId(component.id);
    setIsSidebarOpen(false);
    // router.push(component.path);
    toast.info(`即将进入 ${component.title}`);
  };

  const handleUpgradeClick = () => {
    setIsSidebarOpen(false);
    setShowUpgradeModal(true);
  };

  const handleSettingsClick = () => {
    setIsSidebarOpen(false);
    router.push("/workspace-hub/settings");
  };

  // 根据权限和搜索条件过滤组件
  const getFilteredComponentsByStage = (stageId: number): ZhiGeComponent[] => {
    let components = allComponents.filter(c => c.stageId === stageId);
    
    // 企业空间根据权限过滤
    if (authData.workspaceType === "ENTERPRISE") {
      components = components.filter(c => authData.allowedComponentIds.includes(c.id));
    }
    
    // 搜索过滤
    if (searchQuery) {
      components = components.filter(c => 
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return components;
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
    <div className="min-h-screen w-full bg-[#f0f8ff] flex flex-col">
      {/* 顶部 Header (IDE 专用) */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-1.5 text-slate-600 hover:text-[#2b6cb0] hover:bg-slate-100 rounded-[4px] transition-all flex-shrink-0 cursor-pointer"
            aria-label="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            onClick={handleGoBack}
            className="group flex items-center gap-1.5 text-slate-600 hover:text-[#2b6cb0] transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="font-bold text-sm sm:text-base hidden xs:inline">返回</span>
          </button>
          
          <div className="h-6 w-px bg-slate-300 flex-shrink-0" />
          
          {/* 面包屑路径 */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm">🏢</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-bold text-slate-800 text-sm sm:text-base truncate">{workspaceName}</span>
                {workspaceType === "PERSONAL" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded flex-shrink-0">个人</span>
                )}
                {workspaceType === "ENTERPRISE" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] rounded flex-shrink-0">企业</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 truncate">
                {currentComponentId ? (
                  <>
                    <span className="hidden sm:inline">当前阶段</span>
                    <span className="hidden sm:inline">/</span>
                    <span className="font-medium">{allComponents.find(c => c.id === currentComponentId)?.title || '组件'}</span>
                  </>
                ) : (
                  <span>选择组件开始工作</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* 全局搜索 - 宽度自适应 */}
          <div className="w-28 xs:w-36 sm:w-48 md:w-64">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索组件..."
            />
          </div>
          
          {/* 设置按钮 */}
          {(userRole === "Owner" || userRole === "Admin") && (
            <button
              onClick={handleSettingsClick}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-[4px] transition-all cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          
          {/* Avatar 下拉菜单 */}
          <AvatarDropdown />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 移动端侧边栏遮罩 */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden transition-all duration-300"
          />
        )}

        {/* 动态侧边栏 (Sidebar - 核心防线) */}
        <aside
          className={`fixed inset-y-0 left-0 lg:static z-40 w-60 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto transition-transform duration-300 ease-out lg:translate-x-0 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-4">
            <div className="flex justify-between items-center mb-4 lg:mb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">组件库</h2>
                <button
                  onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
                  className="flex items-center gap-1 text-[11px] text-[#3182ce] bg-[#3182ce]/5 hover:bg-[#3182ce]/15 px-2 py-0.5 rounded-[4px] border border-[#3182ce]/20 font-bold transition-all cursor-pointer"
                  title="前往效能组件工坊导入更多组件"
                >
                  <Plus className="w-3 h-3" />
                  导入
                </button>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 阶段折叠面板 */}
            <div className="space-y-2">
              {stages.map((stage) => {
                const filteredComponents = getFilteredComponentsByStage(stage.id);
                
                // 极致降噪：如果该阶段没有组件，直接不渲染
                if (filteredComponents.length === 0 && !searchQuery) {
                  return null;
                }
                
                return (
                  <div key={stage.id} className="border border-slate-200 rounded-[8px] bg-white">
                    <button
                      onClick={() => toggleStage(stage.id)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-[8px] cursor-pointer"
                    >
                      <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
                      {expandedStages.includes(stage.id) ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                    
                    {expandedStages.includes(stage.id) && (
                      <div className="px-3 pb-3 space-y-1">
                        {filteredComponents.map((component) => (
                          <button
                            key={component.id}
                            onClick={() => handleComponentClick(component)}
                            className={`w-full text-left px-3 py-2 rounded-[4px] flex items-center gap-2 text-sm transition-all duration-200 ease-out cursor-pointer ${
                              currentComponentId === component.id
                                ? "bg-[#2b6cb0]/10 text-[#2b6cb0] font-medium border-l-3 border-[#2b6cb0] pl-2"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <span className="text-lg">{component.icon}</span>
                            <span className="truncate">{component.title}</span>
                            {/* 企业空间下显示权限标识 */}
                            {authData.workspaceType === "ENTERPRISE" && !authData.allowedComponentIds.includes(component.id) && (
                              <span className="ml-auto text-[10px] px-1 py-0.5 bg-red-100 text-red-600 rounded">受限</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* 侧边栏底部区域 */}
          <div className="mt-auto border-t border-slate-200 p-4">
            {/* 个人空间：显示升级按钮 */}
            {workspaceType === "PERSONAL" && (
              <button
                onClick={handleUpgradeClick}
                className="w-full px-4 py-3 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all cursor-pointer"
              >
                🚀 升级为企业协作版
              </button>
            )}
            
            {/* 企业空间：管理员显示设置入口 */}
            {workspaceType === "ENTERPRISE" && (userRole === "Owner" || userRole === "Admin") && (
              <button
                onClick={handleSettingsClick}
                className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>🏢 企业空间设置</span>
              </button>
            )}
          </div>
        </aside>

        {/* 主内容区域 */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-[#f0f8ff]">
          {children || (
            <div className="max-w-4xl mx-auto">
              <div className="text-center py-8 sm:py-12">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl sm:text-4xl">💼</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3">
                  欢迎来到 {workspaceName}
                </h2>
                <p className="text-sm sm:text-base text-slate-600 mb-8">
                  从左侧选择一个组件开始您的工作
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  {allComponents.slice(0, 3).map((component) => (
                    <button
                      key={component.id}
                      onClick={() => handleComponentClick(component)}
                      className="bg-white border border-slate-200 rounded-[8px] p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer"
                    >
                      <div className="text-3xl mb-3">{component.icon}</div>
                      <div className="font-bold text-slate-800">{component.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {stages.find(s => s.id === component.stageId)?.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* 升级 Modal */}
      {showUpgradeModal && (
        <WorkspaceUpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
        />
      )}
    </div>
  );
}
