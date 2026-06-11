"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Search, Settings, ChevronDown, ChevronUp } from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import SearchInput from "@/components/common/SearchInput";
import WorkspaceUpgradeModal from "./WorkspaceUpgradeModal";

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

// 完整的组件市场数据（与 batch2 保持一致）
const allComponents: ZhiGeComponent[] = [
  // 第一阶段：商机捕获与售前打单
  { id: "C01", title: "标书智能解析", stageId: 1, path: "/workspace/component/C01", icon: "📄" },
  { id: "C02", title: "方案合规审查", stageId: 1, path: "/workspace/component/C02", icon: "✓" },
  { id: "C03", title: "竞品对比分析", stageId: 1, path: "/workspace/component/C03", icon: "📊" },
  { id: "C04", title: "汇报话术转换", stageId: 1, path: "/workspace/component/C04", icon: "💬" },
  { id: "C05", title: "项目成本测算", stageId: 1, path: "/workspace/component/C05", icon: "💰" },
  { id: "C06", title: "商业价值评估", stageId: 1, path: "/workspace/component/C06", icon: "📈" },
  
  // 第二阶段：需求定义
  { id: "C07", title: "需求转 PRD", stageId: 2, path: "/workspace/component/C07", icon: "📝" },
  { id: "C08", title: "用户故事生成", stageId: 2, path: "/workspace/component/C08", icon: "👤" },
  { id: "C09", title: "原型设计建议", stageId: 2, path: "/workspace/component/C09", icon: "🎨" },
  { id: "C10", title: "验收标准细化", stageId: 2, path: "/workspace/component/C10", icon: "✅" },
  
  // 其他阶段（省略，仅为示例）
];

const stages: Stage[] = [
  { id: 1, name: "商机捕获与售前打单", color: "#3182ce", bgColor: "from-[#3182ce] to-[#2b6cb0]" },
  { id: 2, name: "需求定义", color: "#10b981", bgColor: "from-[#10b981] to-[#059669]" },
  // 省略其他 8 个阶段
];

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
          setAuthData({
            workspaceType: workspace.type,
            userRole: workspace.role || "Owner",
            allowedComponentIds: workspace.type === "PERSONAL" 
              ? allComponents.map(c => c.id) // 个人空间默认所有组件都可用
              : ["C01", "C02", "C07"] // 企业空间根据角色限制
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
    // router.push(component.path);
    toast.info(`即将进入 ${component.title}`);
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
  };

  const handleSettingsClick = () => {
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
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-2 text-slate-600 hover:text-[#2b6cb0] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold">返回</span>
          </button>
          
          <div className="h-6 w-px bg-slate-300" />
          
          {/* 面包屑路径 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
              <span className="text-white text-sm">🏢</span>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-slate-800">{workspaceName}</span>
                {workspaceType === "PERSONAL" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">个人</span>
                )}
                {workspaceType === "ENTERPRISE" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] rounded">企业</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                {currentComponentId ? (
                  <>
                    <span>当前阶段</span>
                    <span>/</span>
                    <span>{allComponents.find(c => c.id === currentComponentId)?.title || '组件'}</span>
                  </>
                ) : (
                  <span>选择组件开始工作</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 全局搜索 */}
          <div className="w-64">
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
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-[4px] transition-all"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          
          {/* Avatar 下拉菜单 */}
          <AvatarDropdown />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 动态侧边栏 (Sidebar - 核心防线) */}
        <aside className="w-60 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto transition-all duration-300 ease-out">
          <div className="p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4">组件库</h2>
            
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
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-[8px]"
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
                            className={`w-full text-left px-3 py-2 rounded-[4px] flex items-center gap-2 text-sm transition-all duration-200 ease-out ${
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
                className="w-full px-4 py-3 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all"
              >
                🚀 升级为企业协作版
              </button>
            )}
            
            {/* 企业空间：管理员显示设置入口 */}
            {workspaceType === "ENTERPRISE" && (userRole === "Owner" || userRole === "Admin") && (
              <button
                onClick={handleSettingsClick}
                className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                <span>🏢 企业空间设置</span>
              </button>
            )}
          </div>
        </aside>

        {/* 主内容区域 */}
        <main className="flex-1 overflow-auto p-6 bg-[#f0f8ff]">
          {children || (
            <div className="max-w-4xl mx-auto">
              <div className="text-center py-12">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">💼</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-3">
                  欢迎来到 {workspaceName}
                </h2>
                <p className="text-slate-600 mb-8">
                  从左侧选择一个组件开始您的工作
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  {allComponents.slice(0, 3).map((component) => (
                    <button
                      key={component.id}
                      onClick={() => handleComponentClick(component)}
                      className="bg-white border border-slate-200 rounded-[8px] p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-out"
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
