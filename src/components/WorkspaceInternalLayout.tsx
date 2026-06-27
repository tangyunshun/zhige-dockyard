"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Search, Settings, ChevronDown, ChevronUp, Menu, Plus, ExternalLink, FileText, Layers, Database, Layout, Server, ShieldAlert, Briefcase, BookOpen, Zap, CheckCircle2, AlertCircle, Code, FolderOpen, Wrench, Sliders, Users, ShieldCheck, Check } from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import SearchInput from "@/components/common/SearchInput";
import WorkspaceUpgradeModal from "./WorkspaceUpgradeModal";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory, DEFAULT_ALLOWED_COMPONENT_IDS } from "@/constants/components";
import { usePathname } from "next/navigation";
import ComponentExecution from "./studio/ComponentExecution";
import ComponentDetail from "./studio/ComponentDetail";
import UsageStats from "./studio/UsageStats";
import { useAppContext } from "@/contexts/AppContext";

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
  membershipLevel?: string;
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
  BACKEND_CORE: "💻",
  DATABASE_ENG: "🗄️",
  FRONTEND_DEV: "📐",
  TEST_QA: "✅",
  DEVOPS: "🐳",
  SECURITY: "🔒",
  PROJ_MGMT: "👥",
  KNOWLEDGE: "📚",
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

const stageMetaData: Record<number, { icon: any; iconText: string; code: string; flowText: string }> = {
  1: { icon: FileText, iconText: "📄", code: "BID", flowText: "商机打单" },
  2: { icon: Layers, iconText: "🧩", code: "REQ", flowText: "需求定义" },
  3: { icon: Code, iconText: "💻", code: "API", flowText: "后端开发" },
  4: { icon: Database, iconText: "🗄️", code: "DB", flowText: "数据工程" },
  5: { icon: Layout, iconText: "📐", code: "UI", flowText: "大前端" },
  6: { icon: CheckCircle2, iconText: "✅", code: "QA", flowText: "测试质量" },
  7: { icon: Server, iconText: "🐳", code: "OPS", flowText: "持续运维" },
  8: { icon: ShieldCheck, iconText: "🔒", code: "SEC", flowText: "安全防护" },
  9: { icon: Users, iconText: "👥", code: "PM", flowText: "项目管理" },
  10: { icon: FolderOpen, iconText: "📚", code: "KM", flowText: "知识资产" },
};

function getComponentFlowText(componentId: string): string {
  const comp = COMPONENTS.find(c => c.id === componentId);
  if (!comp) return "";
  
  const customFlows: Record<string, string> = {
    C01: "招标 PDF ➔ RFP 偏离表",
    C02: "技术方案 ➔ 合规风险表",
    C03: "竞品文档 ➔ 对比矩阵图",
    C04: "方案原文 ➔ 话术适配板",
    C05: "功能规模 ➔ 成本预算表",
    C06: "开发成本 ➔ 价值 ROI 报告",
    C07: "PRD 文档 ➔ 结构化脑图",
    C08: "线框图像 ➔ 主题风格 CSS",
    C09: "原型逻辑 ➔ 实体流向图",
    C10: "交互定义 ➔ 界面原型",
    C11: "API PRD ➔ OpenAPI 契约",
    C12: "JSON 数据 ➔ RESTful API",
    C13: "API 样本 ➔ SDK/客户端",
    C14: "业务逻辑 ➔ Serverless路由",
    C21: "布局原型 ➔ React 组件",
    C22: "页面规范 ➔ UI 组件库",
    C26: "接口定义 ➔ Jest单元测试",
    C31: "构建要求 ➔ Dockerfile文件",
    C36: "代码仓库 ➔ 安全扫描报告",
  };
  
  if (customFlows[componentId]) {
    return customFlows[componentId];
  }
  
  const inputClean = comp.previewData?.inputMock?.replace(/上传|选择|输入/g, "")?.slice(0, 7) || "输入";
  const outputClean = comp.previewData?.outputMock?.replace(/输出|生成/g, "")?.slice(0, 7) || "输出";
  return `${inputClean} ➔ ${outputClean}`;
}

interface WorkspaceInternalLayoutProps {
  children?: React.ReactNode;
}

export default function WorkspaceInternalLayout({ children }: WorkspaceInternalLayoutProps) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const toast = useToast();
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [userRole, setUserRole] = useState<"Owner" | "Admin" | "Member" | "Viewer">("Owner");
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentComponentId, setCurrentComponentId] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<number[]>([1, 2]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 初始化为空，避免硬编码的 ['C01', 'C07'] 闪烁
  const [authData, setAuthData] = useState<CurrentAuth | null>(null);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<number>(0);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);

  // 订阅共享 Context 状态
  const {
    boundComponentIds,
    refreshBoundComponents,
    addRecentUsed,
    userState,
    setUserState
  } = useAppContext();

  const [showSpaceManagementDropdown, setShowSpaceManagementDropdown] = useState(false);
  const spaceManagementDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        spaceManagementDropdownRef.current &&
        !spaceManagementDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSpaceManagementDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitchWorkspace = async (targetWorkspaceId: string) => {
    if (targetWorkspaceId === workspaceId) {
      setShowSpaceManagementDropdown(false);
      return;
    }

    try {
      toast.info("正在切换空间...");
      
      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userId) {
        headers["Authorization"] = `Bearer ${userId}`;
      }

      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId: targetWorkspaceId }),
        credentials: "include",
      });

      if (res.ok) {
        toast.success("空间切换成功，正在加载数据...");
        setUserState((prev) => ({
          ...prev,
          currentWorkspaceId: targetWorkspaceId,
          workspaces: prev.workspaces.map((ws) => ({
            ...ws,
            isCurrent: ws.id === targetWorkspaceId,
          })),
        }));
        setShowSpaceManagementDropdown(false);
        // 强制刷新并直达新空间首页，干净清空 React 状态，100% 切换成功
        window.location.href = `/workspace/${targetWorkspaceId}`;
      } else {
        const err = await res.json();
        throw new Error(err.message || err.error || "切换空间失败");
      }
    } catch (error: any) {
      console.error("Switch workspace error:", error);
      toast.error(error.message || "切换空间失败，请重试");
    }
  };

  // 动态派生当前空间下的组件允许权限，不写死在本地 authData 里的允许 ID 数组中，实现即时无刷新同步
  const allowedComponentIds = authData
    ? (authData.workspaceType === "PERSONAL"
        ? (authData.membershipLevel === "FREE"
            ? COMPONENTS.filter(c => !c.isPremium).map(c => c.id)
            : COMPONENTS.map(c => c.id))
        : Array.from(new Set([...DEFAULT_ALLOWED_COMPONENT_IDS, ...boundComponentIds])))
    : [];

  // 侦听路由变化实现淡入 Loading 缓冲
  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [pathname]);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setAuthData(null); // 首行置空消除切换空间时的残留闪烁
      
      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = {};
      if (userId) {
        headers["Authorization"] = `Bearer ${userId}`;
      }

      const res = await fetch("/api/workspace/list", {
        headers,
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const workspace = data.workspaces.find((w: any) => w.id === id);
        if (workspace) {
          setWorkspaceName(workspace.name);
          setWorkspaceType(workspace.type);
          setUserRole(workspace.role || "Owner");

          // 动态拉取当前用户会员等级，以区分个人免费/付费组件限制
          let membershipLevel = "FREE";
          try {
            const profileRes = await fetch("/api/user/profile", {
              headers: userId ? { Authorization: `Bearer ${userId}` } : {},
            });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              if (profileData.success && profileData.data) {
                membershipLevel = profileData.data.membershipLevel || "FREE";
              }
            }
          } catch (err) {
            console.error("拉取用户会员等级失败:", err);
          }

          // 物理同步当前空间绑定的组件到 AppContext
          await refreshBoundComponents(id);

          // 拉取当前空间的岗位受限组件列表
          try {
            const res = await fetch(`/api/studio?action=restricted&workspaceId=${id}`, {
              headers: userId ? { Authorization: `Bearer ${userId}` } : {},
            });
            if (res.ok) {
              const resData = await res.json();
              if (resData.success) {
                setRestrictedComponentIds(resData.data || []);
              }
            }
          } catch (e) {
            console.error("加载受限组件失败:", e);
          }

          // 加载当前空间的算力配额
          try {
            const res = await fetch("/api/user/workspace-hub/quota", {
              headers: userId ? { Authorization: `Bearer ${userId}` } : {},
            });
            if (res.ok) {
              const resData = await res.json();
              const wsData = resData.data?.workspaces?.find((w: any) => w.id === id);
              if (wsData?.quota) {
                setWorkspaceToken(Number(wsData.quota.tokenBalance));
              }
            }
          } catch (e) {
            console.error("加载 Token 失败:", e);
          }

          setAuthData({
            workspaceType: workspace.type,
            userRole: workspace.role || "Owner",
            membershipLevel,
            allowedComponentIds: [] // 实际权限已通过派生 allowedComponentIds 进行管理
          });
          setWorkspaceId(id);
          setLoading(false);
        } else {
          toast.error("未找到该工作空间，正在跳转至空间中枢...");
          router.push("/workspace-hub");
        }
      } else {
        toast.error("加载空间失败，鉴权失效请重新登录");
        router.push("/auth/login");
      }
    } catch (e) {
      console.error(e);
      toast.error("加载工作空间出现异常");
      setLoading(false);
    }
  }, [refreshBoundComponents, router, toast]);

  useEffect(() => {
    if (params.id) {
      const idStr = Array.isArray(params.id) ? params.id[0] : params.id;
      setWorkspaceId(idStr);
      loadWorkspace(idStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleGoBack = () => {
    if (currentComponentId) {
      setCurrentComponentId(null);
      // 清除 url 的组件 query
      router.replace(`/workspace/${workspaceId}`, { scroll: false });
      return;
    }
    
    // 如果当前 pathname 恰好是 /workspace/[id]，说明在空间首页本身，应该返回中枢列表
    if (pathname === `/workspace/${workspaceId}`) {
      router.push("/workspace-hub");
    } else {
      // 否则说明在 settings, members, stats 等子路径，应当返回当前工作区主页
      router.push(`/workspace/${workspaceId}`);
    }
  };

  const toggleStage = (stageId: number) => {
    setExpandedStages(prev => 
      prev.includes(stageId) 
        ? prev.filter(id => id !== stageId) 
        : [...prev, stageId]
    );
  };

  const hasComponentPermission = useCallback((componentId: string): boolean => {
    return allowedComponentIds.includes(componentId);
  }, [allowedComponentIds]);

  const handleComponentClick = (component: ZhiGeComponent) => {
    if (!hasComponentPermission(component.id)) {
      if (authData?.workspaceType === "PERSONAL") {
        toast.error("该组件为高级收费功能，请升级空间解锁全量组件");
        setShowUpgradeModal(true);
      } else {
        toast.error("您没有权限使用此组件，请联系空间管理员开通组件权限");
      }
      return;
    }
    setCurrentComponentId(component.id);
    setIsSidebarOpen(false);
    
    // 调用共享 Context 方法，自动记录最近使用并持久化任务审计
    addRecentUsed(component.id, workspaceId);
  };

  const handleUpgradeClick = () => {
    setIsSidebarOpen(false);
    setShowUpgradeModal(true);
  };

  const handleSettingsClick = () => {
    setIsSidebarOpen(false);
    router.push(`/workspace/${workspaceId}/settings`);
  };

  // 根据权限和搜索条件过滤组件
  const getFilteredComponentsByStage = (stageId: number): ZhiGeComponent[] => {
    let components = allComponents.filter(c => c.stageId === stageId);
    
    // 搜索过滤
    if (searchQuery) {
      components = components.filter(c => 
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return components;
  };

  if (loading || !authData) {
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
            onClick={handleGoBack}
            className="group flex items-center gap-1.5 text-slate-600 hover:text-[#2b6cb0] transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="font-bold text-sm sm:text-base hidden xs:inline">返回</span>
          </button>
          
          <div className="h-6 w-px bg-slate-300 flex-shrink-0" />
          
          {/* 左侧空间面包屑 (仅纯展示，避免触发下拉) */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center flex-shrink-0 shadow-[0_2px_4px_rgba(43,108,176,0.15)]">
              <span className="text-white text-sm">🏢</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-extrabold text-slate-800 text-sm sm:text-base truncate">{workspaceName}</span>
                {workspaceType === "PERSONAL" ? (
                  <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded-[4px] flex-shrink-0 font-extrabold border border-blue-100/50">
                    个人自主空间
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-[#d97706] rounded-[4px] flex-shrink-0 font-extrabold border border-amber-100/50">
                    企业协同空间
                  </span>
                )}
                <span className="text-xs text-slate-400 font-bold">/</span>
                <span className="text-xs text-slate-500 font-bold">工作台</span>
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

          {/* 高视觉空间控制台与快速切换下拉 */}
          <div className="relative" ref={spaceManagementDropdownRef}>
            <button
              onClick={() => setShowSpaceManagementDropdown(!showSpaceManagementDropdown)}
              className="inline-flex items-center gap-2.5 h-9 px-4 rounded-[4px] bg-gradient-to-b from-white to-slate-50 hover:from-white hover:to-white border border-slate-200/90 hover:border-[#3182ce]/50 text-slate-700 hover:text-[#3182ce] text-sm font-extrabold transition-all duration-200 cursor-pointer shadow-[0_1.5px_3px_rgba(0,0,0,0.04)] hover:shadow-md active:scale-[0.98] flex-shrink-0"
              title="工作空间管理与快速切换"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3182ce] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3182ce]"></span>
              </span>
              <span>空间控制台</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-250 ${showSpaceManagementDropdown ? 'rotate-180 text-[#3182ce]' : ''}`} />
            </button>
            
            {showSpaceManagementDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-[0_10px_25px_-5px_rgba(15,23,42,0.12),0_4px_12px_-4px_rgba(15,23,42,0.08)] border border-slate-100 py-1.5 z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-200">
                {/* 1. 当前空间管理 */}
                <div className="px-3.5 py-2 border-b border-slate-100/80">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      当前空间设置
                    </p>
                    {workspaceType === "PERSONAL" ? (
                      <span className="text-[9px] px-1.5 py-0.2 bg-blue-50 text-[#3182ce] rounded font-bold border border-blue-100/40">个人版</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 bg-amber-50 text-[#d97706] rounded font-bold border border-amber-100/40">企业版</span>
                    )}
                  </div>
                  
                  {workspaceType === "ENTERPRISE" ? (
                    <div className="space-y-1">
                      {(userRole === "Owner" || userRole === "Admin") && (
                        <>
                          <button
                            onClick={() => {
                              router.push(`/workspace/${workspaceId}/members`);
                              setShowSpaceManagementDropdown(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-all text-left cursor-pointer"
                          >
                            <span className="text-xs">👥</span>
                            <span>成员管理</span>
                          </button>
                          <button
                            onClick={() => {
                              router.push(`/workspace/${workspaceId}/stats`);
                              setShowSpaceManagementDropdown(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-all text-left cursor-pointer"
                          >
                            <span className="text-xs">📊</span>
                            <span>使用统计</span>
                          </button>
                          <button
                            onClick={() => {
                              router.push(`/workspace/${workspaceId}/settings/permissions`);
                              setShowSpaceManagementDropdown(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-all text-left cursor-pointer"
                          >
                            <span className="text-xs">🔐</span>
                            <span>权限矩阵</span>
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          router.push(`/workspace/${workspaceId}/settings`);
                          setShowSpaceManagementDropdown(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-all text-left cursor-pointer"
                      >
                        <span className="text-xs">⚙️</span>
                        <span>空间设置</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          router.push(`/workspace/${workspaceId}/settings`);
                          setShowSpaceManagementDropdown(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-all text-left cursor-pointer"
                      >
                        <span className="text-xs">⚙️</span>
                        <span>空间设置</span>
                      </button>
                      {authData?.membershipLevel === "FREE" && (
                        <button
                          onClick={() => {
                            handleUpgradeClick();
                            setShowSpaceManagementDropdown(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] bg-amber-50/40 hover:bg-amber-50 text-[#d97706] hover:text-[#b45309] text-xs font-bold transition-all text-left cursor-pointer border border-amber-100/30"
                        >
                          <span className="text-xs">🚀</span>
                          <span>升级企业协作版</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. 快速切换工作空间 */}
                {userState?.workspaces && userState.workspaces.length > 0 && (
                  <div className="px-3.5 py-2.5 bg-slate-50/40">
                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                      快速切换空间
                    </p>
                    <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                      {userState.workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => handleSwitchWorkspace(workspace.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] hover:bg-white hover:shadow-sm border transition-all text-left cursor-pointer ${
                            workspace.id === workspaceId 
                              ? "bg-blue-50/60 border-blue-100/50" 
                              : "bg-white border-transparent hover:border-slate-100"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`text-xs truncate font-bold ${workspace.id === workspaceId ? 'text-[#3182ce]' : 'text-slate-700'}`}>
                              {workspace.name}
                            </span>
                            {workspace.type === "PERSONAL" ? (
                              <span className="text-[8px] px-1 bg-slate-100 text-slate-500 rounded shrink-0 font-extrabold">
                                个人
                              </span>
                            ) : (
                              <span className="text-[8px] px-1 bg-amber-50 text-amber-600 rounded shrink-0 font-extrabold">
                                企业
                              </span>
                            )}
                          </div>
                          {workspace.id === workspaceId && (
                            <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Avatar 下拉菜单 */}
          <AvatarDropdown 
            workspaceId={workspaceId}
            workspaceType={workspaceType}
            userRole={userRole}
            onUpgradeClick={handleUpgradeClick}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 主内容区域 */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-[#f0f8ff] relative">
          {isNavigating && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f0f8ff]/80 backdrop-blur-sm z-10">
              <div className="w-10 h-10 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
            </div>
          )}

          <div className={`transition-opacity duration-200 ${isNavigating ? 'opacity-0' : 'opacity-100'}`}>
            {children || (
              currentComponentId ? (
                <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
                  <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md">
                        {(() => {
                          const comp = COMPONENTS.find(c => c.id === currentComponentId);
                          if (!comp) return "⚙️";
                          const stageId = categoryToStageId[comp.category];
                          const meta = stageMetaData[stageId];
                          if (!meta) return "⚙️";
                          const Icon = meta.icon;
                          return <Icon className="w-6 h-6" />;
                        })()}
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-slate-800">
                          {COMPONENTS.find(c => c.id === currentComponentId)?.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          {COMPONENTS.find(c => c.id === currentComponentId)?.description}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentComponentId(null)}
                      className="zg-btn zg-btn-default flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>{workspaceType === "PERSONAL" ? "返回个人空间" : "返回协作空间"}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-8 space-y-6">
                      <ComponentExecution
                        componentId={currentComponentId}
                        workspaceId={workspaceId}
                        workspaceName={workspaceName}
                        restrictedComponentIds={restrictedComponentIds}
                        workspaceToken={workspaceToken}
                        onTokenUpdate={(newToken) => setWorkspaceToken(newToken)}
                      />
                      <ComponentDetail componentId={currentComponentId} />
                    </div>
                    <div className="lg:col-span-4">
                      <UsageStats componentId={currentComponentId} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-6xl mx-auto animate-in fade-in duration-300 space-y-6">
                  {/* 1. 欢迎卡片 */}
                  <div className="relative bg-gradient-to-br from-[#f0f8ff] via-[#e6f0fa] to-[#d9e8f5] rounded-2xl p-6 shadow-sm border border-blue-100 overflow-hidden text-left">
                    <div className="absolute right-0 top-0 w-64 h-64 bg-blue-300/10 rounded-full filter blur-2xl pointer-events-none" />
                    <div className="relative z-10 space-y-2">
                      <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#3182ce] animate-pulse" />
                        工作空间：<span className="text-[#3182ce]">{workspaceName}</span>
                      </h2>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        {workspaceType === "ENTERPRISE" 
                           ? "企业协作空间已就绪。10 大研发生命周期阶段组件已装配。数据契约在线路节点间全自动流转、逆向对齐与双向追溯。"
                          : "个人自主空间已就绪。您可随时前往组件大厅按需装配，提供完全隔离的本地沙盒数据流处理与契约转换服务。"}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm space-y-3 text-left">
                    <div className="flex justify-between items-center pb-1">
                      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-[#3182ce]" /> 研发生命周期阶段流转轴 (Stage Timeline)
                      </h3>
                      {(() => {
                        const bound = allComponents.filter(c => 
                          allowedComponentIds.includes(c.id) && 
                          boundComponentIds.includes(c.id)
                        );
                        const totalStages = new Set(bound.map(c => c.stageId)).size;
                        return (
                          <span className="text-xs font-bold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                            已覆盖 {totalStages} / 10 阶段
                          </span>
                        );
                      })()}
                    </div>
                    
                    {(() => {
                      const bound = allComponents.filter(c => 
                        allowedComponentIds.includes(c.id) && 
                        boundComponentIds.includes(c.id)
                      );

                      return (
                        <div className="relative pt-2 pb-1 overflow-x-auto scrollbar-thin">
                          {/* 贯穿的渐变线条 */}
                          <div className="absolute top-[24px] left-[5%] right-[5%] h-0.5 bg-slate-100 -z-10 min-w-[768px] sm:min-w-0" />
                          <div className="flex justify-between items-center w-full relative min-w-[768px] sm:min-w-0 px-2">
                            {stages.map(stage => {
                              const stageComps = bound.filter(c => c.stageId === stage.id);
                              const hasComps = stageComps.length > 0;
                              const meta = stageMetaData[stage.id];
                              const isSelected = selectedStageId === stage.id;

                              return (
                                <div
                                  key={stage.id}
                                  onClick={() => {
                                    setSelectedStageId(selectedStageId === stage.id ? null : stage.id);
                                  }}
                                  className="relative flex flex-col items-center gap-1.5 focus:outline-none group cursor-pointer"
                                  title={hasComps ? `已装配 ${stageComps.length} 个组件，点击过滤` : `未装配，点击过滤查看`}
                                >
                                  {/* 圆圈节点 */}
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300 relative ${
                                      isSelected
                                        ? "text-white shadow-lg ring-2 ring-offset-1"
                                        : hasComps
                                          ? "bg-white shadow-md ring-2 ring-offset-1"
                                          : "bg-slate-50 text-slate-400 border-dashed border-slate-300 hover:border-slate-400"
                                    }`}
                                    style={{
                                      backgroundColor: isSelected ? stage.color : "transparent",
                                      borderColor: isSelected ? stage.color : (hasComps ? stage.color : "#cbd5e1"),
                                      color: isSelected ? "#ffffff" : (hasComps ? stage.color : "#94a3b8"),
                                      boxShadow: isSelected ? `0 0 12px ${stage.color}40` : (hasComps ? `0 0 8px ${stage.color}25` : "none"),
                                      // @ts-ignore
                                      "--tw-ring-color": isSelected ? `${stage.color}40` : (hasComps ? `${stage.color}25` : "transparent")
                                    }}
                                  >
                                    {meta ? <meta.icon className="w-3.5 h-3.5" /> : "•"}
                                    
                                    {/* 已装配组件数量角标 */}
                                    {stageComps.length > 0 && (
                                      <span
                                        className={`absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[11px] font-black text-white ring-2 ring-white z-10 transition-all duration-300 ${
                                          isSelected ? "bg-amber-500 scale-110" : "bg-[#3182ce]"
                                        }`}
                                      >
                                        {stageComps.length}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* 中文全称标签 */}
                                  <span className={`text-[11px] font-bold tracking-wider transition-colors duration-200 text-center w-16 line-clamp-2 leading-tight ${
                                    isSelected
                                      ? "text-[#3182ce] font-extrabold"
                                      : hasComps
                                        ? "text-slate-800 font-extrabold"
                                        : "text-slate-400 font-bold"
                                  }`}>
                                    {stage.name}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );

                    })()}
                  </div>

                  {/* 2. Bento 双栏大布局 */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                    
                    {/* 左侧：已装配效能组件通道 */}
                    <div className="lg:col-span-8 bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm space-y-4">
                      {(() => {
                        const currentStageName = selectedStageId !== null ? stages.find(s => s.id === selectedStageId)?.name : null;
                        return (
                          <h3 className="text-base font-extrabold text-slate-800 flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span>🧩</span>
                              <span>
                                已装配效能组件快捷通道
                                {currentStageName && (
                                  <span className="text-[#3182ce] ml-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100/50 text-xs font-bold">· {currentStageName}</span>
                                )}
                              </span>
                            </div>
                            {(selectedStageId !== null || searchQuery) && (
                              <button
                                onClick={() => {
                                  setSelectedStageId(null);
                                  setSearchQuery("");
                                }}
                                className="text-[11px] text-slate-500 hover:text-[#3182ce] font-extrabold flex items-center gap-0.5 transition-colors cursor-pointer"
                              >
                                重置所有过滤
                              </button>
                            )}
                          </h3>
                        );
                      })()}
                      {(() => {
                        const bound = allComponents.filter(c => 
                          allowedComponentIds.includes(c.id) && 
                          boundComponentIds.includes(c.id)
                        );

                        if (bound.length === 0) {
                          return (
                            <div className="py-12 flex flex-col items-center justify-center text-center">
                              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 mb-3">
                                <Plus className="w-6 h-6 animate-pulse" />
                              </div>
                              <p className="text-xs text-slate-750 font-black">该工作空间尚未装配任何效能组件</p>
                              <button
                                onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
                                className="mt-4 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black rounded-[4px] shadow-sm hover:shadow transition-all cursor-pointer"
                              >
                                🔑 前往大厅挑选效能组件装配 ➔
                              </button>
                            </div>
                          );
                        }

                        const displayedBound = bound.filter(c => {
                          const matchStage = selectedStageId === null ? true : c.stageId === selectedStageId;
                          const matchSearch = !searchQuery || 
                            c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.id.toLowerCase().includes(searchQuery.toLowerCase());
                          return matchStage && matchSearch;
                        });

                        if (displayedBound.length === 0) {
                          const currentStageName = selectedStageId !== null ? stages.find(s => s.id === selectedStageId)?.name : null;
                          const isStageEmpty = selectedStageId !== null && bound.filter(c => c.stageId === selectedStageId).length === 0;

                          return (
                            <div className="py-10 text-center bg-slate-50/50 border border-slate-200 border-dashed rounded-xl px-4">
                              {isStageEmpty ? (
                                <>
                                  <p className="text-xs text-slate-550 font-black">当前阶段（{currentStageName}）下尚未装配任何效能组件</p>
                                  <button
                                    onClick={() => router.push(`/studio?workspaceId=${workspaceId}&stageId=${selectedStageId}`)}
                                    className="mt-3 px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm hover:shadow"
                                  >
                                    🔑 前往挑选并装配该阶段组件 ➔
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-slate-500 font-bold">没有找到符合条件的已装配组件</p>
                                  <button
                                    onClick={() => {
                                      setSelectedStageId(null);
                                      setSearchQuery("");
                                    }}
                                    className="mt-2 text-xs text-[#3182ce] font-extrabold hover:underline cursor-pointer"
                                  >
                                    清除所有筛选条件
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        }

                        return (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {displayedBound.map((component) => {
                              const meta = stageMetaData[component.stageId];
                              return (
                                <button
                                  key={component.id}
                                  onClick={() => handleComponentClick(component)}
                                  className="p-4 rounded-xl border border-slate-200 hover:border-[#3182ce]/30 bg-slate-50/20 hover:bg-white flex flex-col justify-between h-[120px] transition-all group cursor-pointer hover:shadow-md text-left"
                                >
                                  <div className="flex items-start gap-2.5 w-full min-w-0">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs flex-shrink-0" style={{ backgroundColor: `${stageMetaData[component.stageId]?.color || "#3182ce"}15`, color: stageMetaData[component.stageId]?.color || "#3182ce" }}>
                                      {meta ? <meta.icon className="w-4 h-4" /> : "⚡"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 w-full">
                                        <span className="font-bold text-slate-800 text-sm truncate group-hover:text-[#3182ce]">{component.title}</span>
                                        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded font-mono flex-shrink-0">{component.id}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 leading-relaxed">
                                        {COMPONENTS.find(c => c.id === component.id)?.description}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center w-full pt-2 border-t border-slate-100/50 mt-1">
                                    <span className="text-[11px] font-bold text-slate-655 bg-[#3182ce]/5 px-1.5 py-0.5 rounded truncate max-w-[130px]" title={getComponentFlowText(component.id)}>
                                      {getComponentFlowText(component.id)}
                                    </span>
                                    <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 animate-pulse">
                                      运行中
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* 渲染未覆盖的研发生命周期胶囊平铺在网格底部 */}
                          {(() => {
                            const boundStageIds = new Set(bound.map(c => c.stageId));
                            const unmappedStages = stages.filter(s => !boundStageIds.has(s.id));

                            if (unmappedStages.length === 0) return null;

                            return (
                              <div className="pt-4 border-t border-slate-100 mt-4 text-left">
                                <span className="text-[11px] font-black tracking-wider text-slate-400 uppercase block mb-2">
                                  未装配研发生命周期 ({unmappedStages.length})
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {unmappedStages.map((stage) => {
                                    const meta = stageMetaData[stage.id];
                                    return (
                                      <button
                                        key={stage.id}
                                        onClick={() => router.push(`/studio?workspaceId=${workspaceId}&stageId=${stage.id}`)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-[#2b6cb0] border border-slate-200/60 hover:border-[#2b6cb0]/20 text-[11px] font-bold transition-all cursor-pointer animate-in fade-in duration-200"
                                        title={`前往大厅装配 ${stage.name}`}
                                      >
                                        <span>{meta?.iconText || "📂"}</span>
                                        <span>{stage.name}</span>
                                        <Plus className="w-2.5 h-2.5 opacity-60" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                      })()}
                    </div>

                    {/* 右侧：算力监控 Bento */}
                    <div className="lg:col-span-4 space-y-6">
                      <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm space-y-4">
                        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                          <Zap className="w-4 h-4 text-[#3182ce]" /> 算力配额与空间监控
                        </h3>
                        <div className="space-y-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">空间版型</span>
                            <span className={`text-xs px-2 py-0.5 rounded border font-bold ${
                              workspaceType === "ENTERPRISE" 
                                ? "bg-amber-50 text-amber-700 border-amber-200" 
                                : "bg-blue-50 text-blue-750 border-blue-150"
                            }`}>
                              {workspaceType === "ENTERPRISE" ? "🏢 企业协作版" : "👤 个人自主版"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">我的角色</span>
                            <span className="text-xs font-bold text-slate-700 pr-1">
                              {workspaceType === "PERSONAL" ? (
                                <span>👑 所有者 (Owner)</span>
                              ) : (
                                <>
                                  {userRole === "Owner" && <span>👑 所有者</span>}
                                  {userRole === "Admin" && <span>🔧 管理员</span>}
                                  {userRole !== "Owner" && userRole !== "Admin" && <span>👤 协同成员</span>}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="space-y-1.5 pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                              <span>算力 Token 余额</span>
                              <span className="text-xs text-slate-755 font-mono font-black">
                                {workspaceType === "PERSONAL" ? "无限制 (免消耗)" : workspaceToken.toLocaleString()}
                              </span>
                            </div>
                            <div className="h-5 bg-slate-50 border border-slate-200/50 px-2 py-1 rounded-lg flex items-center shadow-inner">
                              <div className="flex-1 bg-slate-250 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-[#3182ce] to-[#38a169] h-full rounded-full transition-all duration-500 shadow-sm"
                                  style={{
                                    width: workspaceType === "PERSONAL" ? "100%" : `${Math.min(100, Math.round((workspaceToken / 100000) * 100))}%`
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 中下部 Bento：最近仿真审计活动流与三步路径并排 */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                    {/* 审计日志活动流 */}
                    <div className="lg:col-span-6 bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm space-y-4">
                      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <CheckCircle2 className="w-4 h-4 text-[#38a169]" /> 空间数据提效审计日志 (Activity Audit)
                      </h3>
                      <div className="space-y-3">
                        {[
                          { time: "刚刚", comp: "C01 RFP标书解析", action: "解析 48KB 标书 PDF 文件", result: "生成偏离对比矩阵 12 条", effect: "提效 3.5 倍", color: "#2b6cb0" },
                          { time: "20分钟前", comp: "C07 脑图结构生成", action: "对齐 PRD.md 功能点契约", result: "分析实体映射关系 94.6%", effect: "节省人工 1.5h", color: "#319795" },
                          { time: "2小时前", comp: "C11 API契约生成", action: "分析后端数据库 schema", result: "输出 15 项标准 OpenAPI 契约", effect: "防漏洞 100%", color: "#805ad5" },
                        ].map((log, index) => (
                          <div key={index} className="flex gap-3 items-start text-xs leading-relaxed">
                            <div className="flex flex-col items-center flex-shrink-0 pt-1">
                              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: log.color }} />
                              {index < 2 && <div className="w-px h-10 bg-slate-250/40 mt-1" />}
                            </div>
                            <div className="flex-1 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/40 relative">
                              <div className="flex justify-between items-center text-[11px] text-slate-400 font-black">
                                <span>{log.time} · {log.comp}</span>
                                <span className="text-[#38a169] bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-100 text-[11px]">{log.effect}</span>
                              </div>
                              <div className="text-sm text-slate-800 font-extrabold mt-1">{log.action}</div>
                              <div className="text-xs text-slate-500 font-semibold mt-0.5">{log.result}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 三步极速提效路径 */}
                    <div className="lg:col-span-6 bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm space-y-4">
                      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <AlertCircle className="w-4 h-4 text-amber-500" /> 🧭 提效三步极速开发路径
                      </h3>
                      <div className="space-y-4 pt-1">
                        <div className="flex items-start gap-3 text-xs text-slate-500">
                          <span className="w-5 h-5 rounded bg-blue-50 text-[#3182ce] font-black flex items-center justify-center shrink-0 text-[11px]">1</span>
                          <div>
                            <span className="text-sm font-black text-slate-700 block mb-0.5">挑选装配组件</span>
                            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">前往组件大厅，将符合岗位的效能组件装配至当前空间。</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 text-xs text-slate-500">
                          <span className="w-5 h-5 rounded bg-blue-50 text-[#3182ce] font-black flex items-center justify-center shrink-0 text-[11px]">2</span>
                           <div>
                            <span className="text-sm font-black text-slate-700 block mb-0.5">执行沙盒数据流</span>
                            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">在组件内输入源文件，由仿真引擎自动编译和输出结构化契约。</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 text-xs text-slate-500">
                          <span className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 font-black flex items-center justify-center shrink-0 text-[11px]">3</span>
                          <div>
                            <span className="text-sm font-black text-slate-700 block mb-0.5">集成导出至项目</span>
                            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">将生成的契约模型和成果物载入本地代码中，提效 3.5 倍研发工期。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </main>
      </div>
      
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
