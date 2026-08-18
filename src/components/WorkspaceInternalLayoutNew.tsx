"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { 
  ArrowLeft, Search, Settings, ChevronDown, ChevronUp, Plus, 
  ExternalLink, FileText, Layers, Database, Layout, Server, ShieldAlert, 
  Briefcase, BookOpen, Zap, CheckCircle2, AlertCircle, Code, FolderOpen, 
  Wrench, Sliders, Users, ShieldCheck, Check, Trash2, Eye, ShieldX, 
  ArrowRight, FileSpreadsheet, Sparkles, Copy, Calendar, Clock,
  CheckSquare, FileUp, FileDown, ShieldQuestion, BarChart2, Activity,
  KeyRound, TrendingUp
} from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import SearchInput from "@/components/common/SearchInput";
import WorkspaceUpgradeModal from "./WorkspaceUpgradeModal";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory, DEFAULT_ALLOWED_COMPONENT_IDS } from "@/constants/components";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/contexts/AppContext";

// 53个组件 of ZhiGe
interface ZhiGeComponent {
  id: string; // C01-C53
  title: string;
  stageId: number; // 1-10 阶段
  path: string;
  icon: string;
  isPremium?: boolean;
}

// 用户在当前空间的权限快照
interface CurrentAuth {
  workspaceType: "PERSONAL" | "ENTERPRISE";
  userRole: "Owner" | "Admin" | "Member" | "Viewer" | "ComponentManager" | "KnowledgeManager";
  allowedComponentIds: string[];
  membershipLevel?: string;
}

interface Stage {
  id: number;
  name: string;
  color: string;
  bgColor: string;
}

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

const allComponents: ZhiGeComponent[] = COMPONENTS.map(c => ({
  id: c.id,
  title: c.name,
  stageId: categoryToStageId[c.category] || 1,
  path: `/workspace/component/${c.id}`,
  icon: categoryEmojis[c.category] || "⚙️",
  isPremium: c.isPremium
}));

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
  const pathname = usePathname();
  const toast = useToast();

  // 基础状态机
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [userRole, setUserRole] = useState<"Owner" | "Admin" | "Member" | "Viewer" | "ComponentManager" | "KnowledgeManager">("Owner");
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentComponentId, setCurrentComponentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 核心认证快照
  const [authData, setAuthData] = useState<CurrentAuth | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<number>(0);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);

  // ------------------ 重构新增：标签页与子视图 ------------------
  // 个人版：overview, quick, components, tasks, assets, results, knowledge, settings
  // 企业版：overview, quick, components, tasks, assets, results, knowledge, members, permissions, stats, settings
  const [activeTab, setActiveTab] = useState<string>("overview");

  // 数据实体
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [tasksFilterTab, setTasksFilterTab] = useState<string>("ALL");

  // 快速任务分步流程状态 (选择、材料、消耗确认)
  const [quickSubStep, setQuickSubStep] = useState<"select" | "material" | "confirm">("select");
  const [quickSelectedCompId, setQuickSelectedCompId] = useState("");
  const [quickInputMaterial, setQuickInputMaterial] = useState("");
  
  // AI 推荐与材料输入
  const [aiQuery, setAiQuery] = useState("");
  const [aiMatchedComponent, setAiMatchedComponent] = useState<ZhiGeComponent | null>(null);

  // 组件子 Tab：installed, recommended, marketplace
  const [compSubTab, setCompSubTab] = useState<"installed" | "recommended" | "marketplace">("installed");

  // 仿真预估与执行确认 Modal
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simTargetComp, setSimTargetComp] = useState<ZhiGeComponent | null>(null);
  const [simInput, setSimInput] = useState("");
  const [simIsExecuting, setSimIsExecuting] = useState(false);

  // 结构化成果物预览 Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    id?: string;
    title: string;
    content: string;
    task?: any;
    summary?: string;
    conclusions?: string[];
    risks?: string[];
    suggestions?: string[];
  } | null>(null);

  // 知识沉淀配置 Modal
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [knowledgeTask, setKnowledgeTask] = useState<any | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: "",
    category: "SOP",
    access: "all"
  });
  const [knowledgeIsSubmitting, setKnowledgeIsSubmitting] = useState(false);

  // 导入输入资产 Modal
  const [showImportAssetModal, setShowImportAssetModal] = useState(false);
  const [importAssetForm, setImportAssetForm] = useState({
    title: "",
    content: "",
    type: "input"
  });
  const [importIsSubmitting, setImportIsSubmitting] = useState(false);

  // 共享 Context 绑定
  const {
    boundComponentIds,
    refreshBoundComponents,
    addRecentUsed,
    userState,
    setUserState
  } = useAppContext();

  const [showSpaceManagementDropdown, setShowSpaceManagementDropdown] = useState(false);
  const spaceManagementDropdownRef = useRef<HTMLDivElement>(null);

  // 动态派生组件允许权限
  const allowedComponentIds = authData
    ? (authData.workspaceType === "PERSONAL"
        ? (authData.membershipLevel === "FREE"
            ? COMPONENTS.filter(c => !c.isPremium).map(c => c.id)
            : COMPONENTS.map(c => c.id))
        : Array.from(new Set([...DEFAULT_ALLOWED_COMPONENT_IDS, ...boundComponentIds])))
    : [];

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

  // 挂载安全哨兵
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleGoBack = () => {
    if (currentComponentId) {
      setCurrentComponentId(null);
      router.replace(`/workspace/${workspaceId}`, { scroll: false });
      return;
    }
    if (pathname === `/workspace/${workspaceId}`) {
      router.push("/workspace-hub");
    } else {
      router.push(`/workspace/${workspaceId}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("协议成果物 Markdown 数据已成功复制到剪贴板！");
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
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
    // 装填至快速任务步骤
    setQuickSelectedCompId(component.id);
    setActiveTab("quick");
    setQuickSubStep("material");
    toast.success(`组件 [${component.title}] 已成功选中，请输入源材料以执行仿真！`);
  };

  // 数据加载
  const fetchTasks = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/studio?action=tasks&workspaceId=${id}`);
      if (res.ok) {
        const resData = await res.json();
        if (resData.success) {
          setRecentTasks(resData.data || []);
        }
      }
    } catch (e) {
      console.error("加载任务失败:", e);
    }
  }, []);

  const fetchDocuments = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/studio?action=documents&workspaceId=${id}`);
      if (res.ok) {
        const resData = await res.json();
        if (resData.success) {
          setDocuments(resData.data || []);
        }
      }
    } catch (e) {
      console.error("加载文档失败:", e);
    }
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setAuthData(null);
      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = {};
      if (userId) headers["Authorization"] = `Bearer ${userId}`;

      const res = await fetch("/api/workspace/list", { headers, credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const workspace = data.workspaces.find((w: any) => w.id === id);
        if (workspace) {
          setWorkspaceName(workspace.name);
          setWorkspaceType(workspace.type);
          
          let role: any = workspace.role || "Owner";
          if (workspace.type === "ENTERPRISE" && role === "Admin") {
            const seed = id.charCodeAt(0) % 3;
            if (seed === 0) role = "Admin";
            else if (seed === 1) role = "ComponentManager";
            else role = "KnowledgeManager";
          }
          setUserRole(role);

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

          await refreshBoundComponents(id);

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

          await fetchTasks(id);
          await fetchDocuments(id);

          setAuthData({
            workspaceType: workspace.type,
            userRole: role,
            membershipLevel,
            allowedComponentIds: []
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
      toast.error("加载工作空间异常");
      setLoading(false);
    }
  }, [refreshBoundComponents, router, toast, fetchTasks, fetchDocuments]);

  useEffect(() => {
    if (params.id) {
      const idStr = Array.isArray(params.id) ? params.id[0] : params.id;
      setWorkspaceId(idStr);
      loadWorkspace(idStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleSwitchWorkspace = async (targetWorkspaceId: string) => {
    if (targetWorkspaceId === workspaceId) {
      setShowSpaceManagementDropdown(false);
      return;
    }
    try {
      toast.info("正在切换空间...");
      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["Authorization"] = `Bearer ${userId}`;

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
        window.location.href = `/workspace/${targetWorkspaceId}`;
      }
    } catch (error: any) {
      toast.error("切换空间失败，请重试");
    }
  };

  const getEstimatedStorageUsed = () => {
    let bytes = 0;
    documents.forEach(doc => {
      bytes += doc.title.length * 2;
      if (doc.content) bytes += doc.content.length * 2;
    });
    return Math.round(bytes / 1024);
  };

  // AI 识别组件
  const handleAIAssist = () => {
    if (!aiQuery.trim()) {
      toast.error("请输入您的研发任务描述诉求");
      return;
    }
    const query = aiQuery.trim().toLowerCase();
    let recommendedId = "";
    if (query.includes("偏离") || query.includes("招标") || query.includes("rfp") || query.includes("标书")) {
      recommendedId = "C01";
    } else if (query.includes("合规") || query.includes("风险")) {
      recommendedId = "C02";
    } else if (query.includes("竞品") || query.includes("对比")) {
      recommendedId = "C03";
    } else if (query.includes("话术") || query.includes("应对")) {
      recommendedId = "C04";
    } else if (query.includes("成本") || query.includes("估算") || query.includes("预算")) {
      recommendedId = "C05";
    } else if (query.includes("roi") || query.includes("效益") || query.includes("回报")) {
      recommendedId = "C06";
    } else if (query.includes("prd") || query.includes("脑图") || query.includes("结构化")) {
      recommendedId = "C07";
    } else if (query.includes("线框") || query.includes("原型") || query.includes("css") || query.includes("样式") || query.includes("主题")) {
      recommendedId = "C08";
    } else if (query.includes("设计") || query.includes("实体") || query.includes("数据流")) {
      recommendedId = "C09";
    } else if (query.includes("api") || query.includes("接口") || query.includes("契约") || query.includes("openapi") || query.includes("swagger")) {
      recommendedId = "C11";
    } else if (query.includes("docker") || query.includes("构建") || query.includes("容器")) {
      recommendedId = "C31";
    }

    if (!recommendedId) {
      const bound = allComponents.filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id));
      if (bound.length > 0) recommendedId = bound[0].id;
    }

    const comp = allComponents.find(c => c.id === recommendedId);
    if (comp) {
      setAiMatchedComponent(comp);
      toast.success(`AI 智能识别推荐完成！`);
    } else {
      toast.error("未能匹配到合适的已装配组件");
    }
  };

  const handleQuickStartSubmit = () => {
    if (!quickSelectedCompId) return;
    const comp = allComponents.find(c => c.id === quickSelectedCompId);
    if (!comp) return;

    setSimTargetComp(comp);
    setSimInput(quickInputMaterial);
    setShowSimulationModal(true);
  };

  // 执行仿真逻辑
  const executeSimulation = async () => {
    if (!simTargetComp) return;
    
    if (restrictedComponentIds.includes(simTargetComp.id)) {
      toast.error(`[权限不足] 您当前的岗位在当前企业空间下无此组件的执行权限，请联系管理员！`);
      setShowSimulationModal(false);
      return;
    }

    const deductTokens = simTargetComp.isPremium ? 15 : 5;
    if (workspaceType === "ENTERPRISE" && workspaceToken < deductTokens) {
      toast.error("当前工作空间算力 Token 余额不足，请联系管理员充值！");
      setShowSimulationModal(false);
      return;
    }

    setSimIsExecuting(true);
    try {
      let outputData = "结构化仿真契约生成完毕。";
      let taskName = `${simTargetComp.title} 仿真验证`;

      if (simTargetComp.id === "C01") {
        taskName = "RFP标书偏离智能审查任务";
        outputData = `## [成果摘要]
已自动解析投标文件，通过标准化 RFP 契约框架实现逐项合规扫描，输出高精度条款对照表。

## [关键结论]
- **合规度**: 94.6% 自动对齐
- **异常结论**: 条款 [4.2 安全运维规范] 存在偏离，缺少 7x24 驻场运维描述。

## [明细偏离项表]
| 标书章节 | 招标要求 | 偏离状态 | 偏离原因说明 |
| :--- | :--- | :--- | :--- |
| L3.1 | 系统可用性 99.99% | 无偏离 | 方案完全满足 |
| L4.2 | 7x24 驻场运维 | 负偏离 | 方案仅提供远程支持及工作日驻场 |

## [风险/问题清单]
- 负偏离项存在打单淘汰性一票否决风险。

## [后续整改建议]
- 建议将服务方案中第 12 页“支持保障”条款调整为包含 24 小时本地响应的高级方案。`;
      } else if (simTargetComp.id === "C07") {
        taskName = "PRD需求契约结构化脑图生成";
        outputData = `## [成果摘要]
已将 PRD 原始 markdown 文件逆向编译为结构化脑图大纲，完成业务规则对齐与缺失完整度扫描。

## [关键结论]
- 梳理出 **5 个核心业务域**，**32 个交互子功能节点**。

## [交互缺失漏洞]
- 结算模块页面在支付网络中断时，缺乏“3次指数级超时重试”的容错降级机制，容易造成资金对账不一致。

## [后续集成建议]
- 已生成可导出的 JSON 脑图配置，可直接载入大厅装配组件。`;
      } else if (simTargetComp.id === "C11") {
        taskName = "API 契约生成与规范一致性检测";
        outputData = `## [成果摘要]
对齐当前数据库 schema.prisma 进行逆向编译，生成标准 OpenAPI 3.0 API 协议契约。

## [关键结论]
- **分析接口数**: 12 个
- **一致性分数**: 98%
- **安全性缺陷**: 接口 /api/studio/upload_doc 缺少 headers 认证授权声明，存在越权上传风险。

## [推荐修复步骤]
- 在路由拦截器中，显式声明 Bearer Token 强制校验，并输出 OpenAPI schema 映射。`;
      } else {
        outputData = `## [成果摘要]
组件 ${simTargetComp.title} 执行完毕，生成沙盒成果。

## [关键结论]
- 转化率: 100%
- 人工研发提效比率: 350%

## [明细内容]
数据流转顺畅，生成契约成果物状态为 active。`;
      }

      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["Authorization"] = `Bearer ${userId}`;

      const res = await fetch("/api/studio", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "simulate",
          workspaceId,
          componentId: simTargetComp.id,
          taskName,
          inputMaterial: simInput.slice(0, 150),
          outputData,
          tokens: deductTokens,
          status: "SUCCESS"
        })
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.success) {
          toast.success(`仿真任务执行成功！扣减 ${deductTokens} 算力。`);
          if (resData.tokenBalance !== undefined) setWorkspaceToken(resData.tokenBalance);
          await fetchTasks(workspaceId);
          await fetchDocuments(workspaceId);

          setQuickInputMaterial("");
          setAiQuery("");
          setAiMatchedComponent(null);
          
          // 执行成功后，自动跳转到“结果”Tab 以让用户查看成果，而不是在当前表单静默
          setActiveTab("results");
        }
      }
    } catch (e) {
      toast.error("仿真失败");
    } finally {
      setSimIsExecuting(false);
      setShowSimulationModal(false);
      setSimTargetComp(null);
    }
  };

  const handleImportAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importAssetForm.title.trim()) {
      toast.error("请输入资产文件名称");
      return;
    }
    setImportIsSubmitting(true);
    try {
      const userId = localStorage.getItem("userId");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) headers["Authorization"] = `Bearer ${userId}`;

      const res = await fetch("/api/studio", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "upload_doc",
          workspaceId,
          title: importAssetForm.title,
          content: importAssetForm.content,
          type: importAssetForm.type
        })
      });
      if (res.ok) {
        toast.success("空间资料导入成功！");
        await fetchDocuments(workspaceId);
        setShowImportAssetModal(false);
        setImportAssetForm({ title: "", content: "", type: "input" });
      }
    } catch (e) {
      toast.error("资产导入失败");
    } finally {
      setImportIsSubmitting(false);
    }
  };

  const handleKnowledgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!knowledgeForm.title.trim()) {
      toast.error("请为沉淀的资产命名");
      return;
    }
    setKnowledgeIsSubmitting(true);
    try {
      const resultObj = knowledgeTask?.result;
      const contentText = resultObj?.outputData || "成果为空。";

      if (workspaceType === "PERSONAL") {
        const userId = localStorage.getItem("userId");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (userId) headers["Authorization"] = `Bearer ${userId}`;

        const res = await fetch("/api/studio", {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "upload_doc",
            workspaceId,
            title: `[知识沉淀] ${knowledgeForm.title}`,
            content: contentText,
            type: "knowledge"
          })
        });
        if (res.ok) {
          toast.success("成果物已成功沉淀至个人知识库！");
          await fetchDocuments(workspaceId);
          setShowKnowledgeModal(false);
          setKnowledgeTask(null);
        }
      } else {
        toast.success(`企业知识归档审批流发起成功！待审核单号: ZHIGE-KM-${Math.floor(Math.random() * 900000 + 100000)}`);
        setShowKnowledgeModal(false);
        setKnowledgeTask(null);
      }
    } catch (e) {
      toast.error("沉淀失败");
    } finally {
      setKnowledgeIsSubmitting(false);
    }
  };

  const openStructurePreview = (task: any) => {
    const output = task.result?.outputData || "无仿真生成成果。";
    let summary = "";
    let conclusions: string[] = [];
    let risks: string[] = [];
    let suggestions: string[] = [];

    const summaryMatch = output.match(/## \[成果摘要\]\n([\s\S]*?)(?=\n##|$)/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    const conclusionMatch = output.match(/## \[关键结论\]\n([\s\S]*?)(?=\n##|$)/);
    if (conclusionMatch) {
      conclusions = conclusionMatch[1].split("\n").map(l => l.replace(/^[-\*\d\.\s]+/, "").trim()).filter(Boolean);
    }

    const riskMatch = output.match(/## \[风险\/问题清单\]\n([\s\S]*?)(?=\n##|$)/);
    if (riskMatch) {
      risks = riskMatch[1].split("\n").map(l => l.replace(/^[-\*\d\.\s]+/, "").trim()).filter(Boolean);
    }

    const suggestionMatch = output.match(/## \[后续整改建议\]\n([\s\S]*?)(?=\n##|$)/);
    if (suggestionMatch) {
      suggestions = suggestionMatch[1].split("\n").map(l => l.replace(/^[-\*\d\.\s]+/, "").trim()).filter(Boolean);
    }

    if (!summary) summary = `任务成果物概要说明。关联组件 ID: ${task.type}`;
    if (conclusions.length === 0) conclusions = ["任务 100% 编译通过并成功生成契约结果", "工期比对人工研发提效约 3.5 倍"];
    if (risks.length === 0) risks = ["无高危风险缺陷报告，数据未向公网流出"];
    if (suggestions.length === 0) suggestions = ["建议直接将生成的契约集成至本地工程，提高组件稳定性"];

    setPreviewData({
      id: task.id,
      title: task.name,
      content: output,
      task,
      summary,
      conclusions,
      risks,
      suggestions
    });
    setShowPreviewModal(true);
  };

  const handleExport = (type: "word" | "pdf" | "excel") => {
    if (!previewData) return;
    toast.info(`正在生成并编译导出 ${type.toUpperCase()} 数据包...`);
    setTimeout(() => {
      toast.success(`${previewData.title}.${type === "word" ? "docx" : type === "excel" ? "xlsx" : "pdf"} 导出成功！`);
    }, 1000);
  };

  // ------------------ 各 Tabs 下的右侧辅助栏模块动态渲染 ------------------
  const renderRightPanel = () => {
    switch (activeTab) {
      case "overview":
        return (
          <>
            {/* 资源额度 */}
            <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3.5">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100 flex items-center justify-between">
                <span>当前空间额度摘要</span>
                <Zap className="w-3.5 h-3.5 text-[#3182ce]" />
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-450">算力 Token 剩余</span>
                  <span className="font-black text-slate-800 font-mono">
                    {workspaceType === "PERSONAL" ? "无限制" : `${workspaceToken.toLocaleString()} Token`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#3182ce] to-[#38a169]"
                    style={{ width: workspaceType === "PERSONAL" ? "100%" : `${Math.min(100, (workspaceToken / 100000) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-450">存储空间进度</span>
                  <span className="font-black text-slate-800 font-mono">{getEstimatedStorageUsed()} KB / 100 MB</span>
                </div>
                {workspaceType === "ENTERPRISE" && workspaceToken < 100 && (
                  <div className="text-[9px] font-black text-rose-600 bg-rose-50 p-1.5 rounded border border-rose-100 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>额度即将见底，请升级空间算力！</span>
                  </div>
                )}
              </div>
              {((workspaceType === "ENTERPRISE" && workspaceToken < 100) || authData?.membershipLevel === "FREE") && (
                <button onClick={handleUpgradeClick} className="w-full py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 text-[10px] font-black rounded border border-amber-200 transition-all cursor-pointer">
                  🚀 升级空间算力配额 ➔
                </button>
              )}
            </div>

            {/* 快捷工具 */}
            <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
                快捷工具
              </h4>
              <div className="space-y-1.5 text-xs font-bold text-slate-600">
                {workspaceType === "PERSONAL" ? (
                  <>
                    <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full text-left p-1.5 rounded hover:bg-slate-50 hover:text-[#3182ce] flex items-center gap-1.5 cursor-pointer">
                      <span>📥</span><span>上传空间开发资料</span>
                    </button>
                    <button onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="w-full text-left p-1.5 rounded hover:bg-slate-50 hover:text-[#3182ce] flex items-center gap-1.5 cursor-pointer">
                      <span>⚡</span><span>创建高精度仿真任务</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => router.push(`/workspace/${workspaceId}/members`)} className="w-full text-left p-1.5 rounded hover:bg-slate-50 hover:text-[#3182ce] flex items-center gap-1.5 cursor-pointer">
                      <span>👥</span><span>邀请团队协同成员</span>
                    </button>
                    <button onClick={() => router.push(`/workspace/${workspaceId}/settings/permissions`)} className="w-full text-left p-1.5 rounded hover:bg-slate-50 hover:text-[#3182ce] flex items-center gap-1.5 cursor-pointer">
                      <span>🔐</span><span>授权组件安全岗位</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 待办提醒 */}
            <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
                待办提醒
              </h4>
              {(() => {
                const pendingCount = recentTasks.filter(t => t.status === "PENDING").length;
                const runningCount = recentTasks.filter(t => t.status === "RUNNING").length;
                if (pendingCount === 0 && runningCount === 0) {
                  return <p className="text-[10px] text-slate-400 font-bold text-center py-2 bg-slate-50/50 rounded">暂无未决执行待办任务。</p>;
                }
                return (
                  <div className="space-y-1.5 text-[11px] font-extrabold text-slate-650">
                    {runningCount > 0 && <div className="p-1.5 bg-blue-50 border border-blue-100 rounded text-blue-700">🕒 有 {runningCount} 项仿真任务正在运行中</div>}
                    {pendingCount > 0 && <div className="p-1.5 bg-amber-50 border border-amber-100 rounded text-amber-700">⚠️ 有 {pendingCount} 项仿真结果待您确认</div>}
                  </div>
                );
              })()}
            </div>
          </>
        );

      case "quick":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-4">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              当前执行条件检查
            </h4>
            <div className="space-y-3.5 text-xs font-bold">
              <div className="flex justify-between items-center">
                <span className="text-slate-450">已选中组件</span>
                <span className={quickSelectedCompId ? "text-[#3182ce]" : "text-rose-500"}>
                  {quickSelectedCompId ? `[${quickSelectedCompId}] 已锁定` : "✕ 未选择"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-450">输入源材料</span>
                <span className={quickInputMaterial.trim() ? "text-emerald-600" : "text-rose-500"}>
                  {quickInputMaterial.trim() ? "✔ 已装填" : "✕ 未配置"}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                <span className="text-slate-450">预计算力消耗</span>
                <span className="text-[#3182ce]">
                  {quickSelectedCompId && allComponents.find(c => c.id === quickSelectedCompId)?.isPremium ? "15 Token" : "5 Token"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-450">支持材料格式</span>
                <span className="text-slate-500">PDF / MD / Word / JSON</span>
              </div>
            </div>
            <div className="bg-blue-50/50 p-3 rounded text-[10px] text-slate-500 font-semibold leading-relaxed border">
              <p className="font-extrabold text-[#3182ce] mb-1">💡 步骤流程说明：</p>
              1. 先选择要运行的组件 ➔ 2. 在配置文本框里贴入材料 ➔ 3. 确认预估算力 ➔ 4. 一键执行并转入结果列表进行查看。
            </div>
          </div>
        );

      case "components":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              组件状态统计
            </h4>
            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between">
                <span className="text-slate-450">已装配组件数</span>
                <span className="text-[#3182ce] font-mono">{allowedComponentIds.filter(id => boundComponentIds.includes(id)).length} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">无权限受限组件</span>
                <span className="text-rose-500 font-mono">{restrictedComponentIds.length} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">待配置组件</span>
                <span className="text-amber-500 font-mono">1 个 (标书合规)</span>
              </div>
            </div>
            <button onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)} className="w-full py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[10px] font-black rounded shadow transition-all cursor-pointer">
              进入组件大厅装配更多组件
            </button>
          </div>
        );

      case "tasks":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              任务执行看板统计
            </h4>
            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between">
                <span className="text-slate-450">全量仿真次数</span>
                <span className="text-slate-800 font-mono">{recentTasks.length} 次</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">成功率</span>
                <span className="text-emerald-600 font-mono">
                  {recentTasks.length ? `${Math.round((recentTasks.filter(t => t.status === "SUCCESS").length / recentTasks.length) * 100)}%` : "100%"}
                </span>
              </div>
              {recentTasks.filter(t => t.status === "FAILED").length > 0 && (
                <div className="text-[10px] font-black text-rose-600 bg-rose-50 p-2 rounded border border-rose-100">
                  ⚠️ 有 {recentTasks.filter(t => t.status === "FAILED").length} 项任务仿真编译失败，请点击列表右侧重试！
                </div>
              )}
            </div>
          </div>
        );

      case "assets":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              原始文件存储使用
            </h4>
            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between">
                <span className="text-slate-450">占用大小</span>
                <span className="text-[#3182ce] font-mono">{getEstimatedStorageUsed()} KB / 100 MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">已上传原始资产</span>
                <span className="text-slate-800 font-mono">{documents.filter(d => d.type === "input" || d.title.includes("输入")).length} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">主要格式</span>
                <span className="text-slate-500">PDF, Markdown</span>
              </div>
            </div>
            <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[10px] font-black rounded shadow cursor-pointer">
              📥 导入外部输入资产
            </button>
          </div>
        );

      case "results":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              仿真成果摘要
            </h4>
            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between">
                <span className="text-slate-450">可导出成果物</span>
                <span className="text-emerald-600 font-mono">{recentTasks.filter(t => t.status === "SUCCESS").length} 项</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450">已归档为知识</span>
                <span className="text-slate-800 font-mono">{documents.filter(d => d.type === "knowledge" || d.title.includes("知识")).length} 条</span>
              </div>
            </div>
          </div>
        );

      case "knowledge":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3.5">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              知识数量统计
            </h4>
            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between">
                <span className="text-slate-450">已沉淀知识</span>
                <span className="text-amber-600 font-mono">{documents.filter(d => d.type === "knowledge" || d.title.includes("知识")).length} 条</span>
              </div>
              {workspaceType === "ENTERPRISE" && (
                <div className="flex justify-between">
                  <span className="text-slate-450">待审核沉淀申请</span>
                  <span className="text-amber-600 font-mono">0 个</span>
                </div>
              )}
            </div>
            <div className="bg-amber-50/50 p-2.5 rounded text-[10px] text-amber-800 font-semibold leading-relaxed border border-amber-100">
              📚 知识库用于为后续任务执行提供上下文模板和标准化 SOP。
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest pb-1.5 border-b border-slate-100">
              当前权限大纲
            </h4>
            <div className="text-xs font-bold text-slate-700 space-y-2 leading-relaxed">
              <p>我的角色是：<span className="text-[#3182ce]">{userRole}</span></p>
              <div className="text-[10px] text-slate-400 font-semibold space-y-1">
                <p>• Owner 具备全量设置的覆盖更新权限；</p>
                <p>• Admin 具备团队、资产及审计控制权限；</p>
                <p>• 普通成员仅可操作个人面板和任务仿真。</p>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm text-left text-xs text-slate-400 font-bold">
            协同管理详情已加载完毕
          </div>
        );
    }
  };

  // ------------------ 标签页内容区域的分支渲染 ------------------
  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* 新手引导/当前操作指引 */}
            <div className="bg-gradient-to-r from-blue-50/60 to-purple-50/40 p-4 rounded-xl border border-blue-100/50 text-left">
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-[#3182ce]" /> 舟坊操作台新手建议与行动指南
              </h4>
              <div className="mt-2.5 text-xs text-slate-650 font-bold leading-relaxed space-y-1.5">
                {boundComponentIds.length === 0 ? (
                  <p>💡 <span className="text-slate-800">建议第一步</span>：当前工作空间尚未装配任何组件，请点击 <button onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)} className="text-[#3182ce] underline font-black cursor-pointer">进入挑选大厅</button> 装配所需组件。</p>
                ) : recentTasks.length === 0 ? (
                  <p>⚡ <span className="text-slate-800">建议第一步</span>：空间已装配基础研发组件。您可以通过 <button onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="text-[#3182ce] underline font-black cursor-pointer">快速开始任务</button> 提交材料发起仿真。</p>
                ) : recentTasks.filter(t => t.status === "FAILED").length > 0 ? (
                  <p>⚠️ <span className="text-slate-800">继续工作</span>：检测到最近有任务编译失败，请在下方“最近仿真”中点击重试或查看失败原因。</p>
                ) : documents.filter(d => d.type === "input").length > 0 ? (
                  <p>📂 <span className="text-slate-800">快速创建</span>：检测到您上传了原始文档资料，点击上方“开始新任务”可以直接基于已备资料创建仿真。</p>
                ) : (
                  <p>✔ 空间当前状态良好。您可以在核心标签页中自由切换以操作组件、查阅文档以及知识归档。</p>
                )}
              </div>
            </div>

            {/* 三个主操作卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm text-left flex flex-col justify-between h-36">
                <div>
                  <span className="text-base">🧠</span>
                  <h4 className="font-extrabold text-slate-800 text-xs mt-2">材料智能推荐组件</h4>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">上传原始文件或输入需求，系统识别类型后推荐匹配的组件。</p>
                </div>
                <button onClick={() => { setActiveTab("quick"); setQuickSubStep("material"); }} className="text-[10px] text-[#3182ce] hover:underline font-black text-left flex items-center gap-0.5 mt-2.5 cursor-pointer">
                  <span>去智能识别</span> <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm text-left flex flex-col justify-between h-36">
                <div>
                  <span className="text-base">⚡</span>
                  <h4 className="font-extrabold text-slate-800 text-xs mt-2">选择组件，开始任务</h4>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">从已装配的研发效能列表中任意选择核心组件，立即处理源文件。</p>
                </div>
                <button onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="text-[10px] text-[#3182ce] hover:underline font-black text-left flex items-center gap-0.5 mt-2.5 cursor-pointer">
                  <span>选择组件开始</span> <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm text-left flex flex-col justify-between h-36">
                <div>
                  <span className="text-base">🕒</span>
                  <h4 className="font-extrabold text-slate-800 text-xs mt-2">继续未完成任务</h4>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">一键承接上一次未完成或编译失败的任务草稿，无缝继续开发。</p>
                </div>
                <button onClick={() => { setActiveTab("tasks"); }} className="text-[10px] text-[#3182ce] hover:underline font-black text-left flex items-center gap-0.5 mt-2.5 cursor-pointer">
                  <span>进入任务看板</span> <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 空间能力大数字摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "已装配组件数", count: allowedComponentIds.filter(id => boundComponentIds.includes(id)).length, color: "text-[#3182ce]" },
                { label: "执行中任务数", count: recentTasks.filter(t => t.status === "RUNNING").length, color: "text-[#38a169]" },
                { label: "已生成报告数", count: recentTasks.filter(t => t.status === "SUCCESS").length, color: "text-amber-500" },
                { label: "沉淀知识库数", count: documents.filter(d => d.type === "knowledge" || d.title.includes("知识")).length, color: "text-purple-500" }
              ].map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="text-[10px] font-bold text-slate-400 block tracking-wider">{item.label}</span>
                  <span className={`text-xl font-black font-mono block mt-1.5 ${item.color}`}>{item.count}</span>
                </div>
              ))}
            </div>

            {/* 最近任务摘要 (只展3条) */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1">
                  <CheckSquare className="w-4 h-4 text-[#38a169]" /> 最近仿真任务记录 (最近 3 条)
                </h4>
                <button onClick={() => setActiveTab("tasks")} className="text-[11px] text-[#3182ce] hover:underline font-extrabold cursor-pointer">
                  查看全部任务 ➔
                </button>
              </div>
              {recentTasks.slice(0, 3).length === 0 ? (
                <p className="text-[10px] text-slate-400 font-bold py-6 text-center">暂无仿真运行记录。</p>
              ) : (
                <div className="space-y-2">
                  {recentTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="p-2.5 bg-slate-50/50 border border-slate-200 rounded flex justify-between items-center text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] bg-slate-200 text-slate-500 px-1 py-0.2 rounded font-mono shrink-0">{task.type}</span>
                          <span className="font-extrabold text-slate-700 truncate">{task.name}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${task.status === "SUCCESS" ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-rose-700 bg-rose-50 border-rose-100"}`}>{task.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 常用组件摘要 (只展3个) */}
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1">
                  <Layers className="w-4 h-4 text-[#3182ce]" /> 常用效能组件 (最近使用)
                </h4>
                <button onClick={() => setActiveTab("components")} className="text-[11px] text-[#3182ce] hover:underline font-extrabold cursor-pointer">
                  查看全部组件 ➔
                </button>
              </div>
              {allComponents.filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id)).slice(0, 3).length === 0 ? (
                <p className="text-[10px] text-slate-400 font-bold py-6 text-center">当前空间没有装配组件，请去大厅挑选。</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {allComponents.filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id)).slice(0, 3).map(c => (
                    <div onClick={() => handleComponentClick(c)} key={c.id} className="p-3 bg-slate-50/50 hover:bg-white border border-slate-200 rounded-lg text-left cursor-pointer transition-all hover:shadow">
                      <span className="text-lg">{c.icon}</span>
                      <h5 className="font-extrabold text-slate-800 text-xs mt-1.5 truncate">{c.title}</h5>
                      <span className="text-[9px] text-[#3182ce] font-bold block mt-1.5">开始使用 ➔</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case "quick":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Sliders className="w-4 h-4 text-[#3182ce]" /> 发起研发仿真任务 (Quick Start)
            </h3>
            
            {/* 快速任务子步骤选项卡 */}
            <div className="flex gap-2 border-b border-slate-100 pb-2">
              {[
                { key: "select", label: "路径 A: 选择组件开始" },
                { key: "material", label: "路径 B: 上传智能推荐" }
              ].map(step => (
                <button
                  key={step.key}
                  onClick={() => setQuickSubStep(step.key as any)}
                  className={`px-3 py-1 text-xs font-black rounded transition-all cursor-pointer ${quickSubStep === step.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {step.label}
                </button>
              ))}
            </div>

            {quickSubStep === "select" ? (
              // 路径A
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 uppercase block mb-1">选择已装配的可用组件</label>
                  <select
                    value={quickSelectedCompId}
                    onChange={(e) => setQuickSelectedCompId(e.target.value)}
                    className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#3182ce]/50 outline-none"
                  >
                    <option value="">-- 请选择要执行的组件 --</option>
                    {allComponents
                      .filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.id}] {c.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 uppercase block mb-1">输入或粘贴源材料内容</label>
                  <textarea
                    value={quickInputMaterial}
                    onChange={(e) => setQuickInputMaterial(e.target.value)}
                    placeholder="在此输入招标文件、系统 PRD、接口样例或代码进行分析..."
                    className="w-full h-32 text-xs font-semibold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#3182ce]/50 outline-none resize-none"
                  />
                </div>

                {/* 校验与禁用说明 */}
                {(() => {
                  let disableReason = "";
                  if (!quickSelectedCompId) {
                    disableReason = "请先选择需要执行的效能组件";
                  } else if (!quickInputMaterial.trim()) {
                    disableReason = "请输入待处理的研发源材料";
                  } else if (restrictedComponentIds.includes(quickSelectedCompId)) {
                    disableReason = "当前企业岗位无权限执行此受限组件";
                  } else if (workspaceType === "ENTERPRISE" && workspaceToken < (allComponents.find(c => c.id === quickSelectedCompId)?.isPremium ? 15 : 5)) {
                    disableReason = "当前空间算力配额不足，请升级或联系管理员";
                  }

                  return (
                    <div className="space-y-3">
                      {disableReason && (
                        <div className="text-[10px] font-bold text-rose-600 bg-rose-50 p-2 rounded border border-rose-100 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>无法执行原因：{disableReason}</span>
                        </div>
                      )}
                      <button
                        onClick={handleQuickStartSubmit}
                        disabled={!!disableReason}
                        className="w-full h-9 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-xs font-black rounded shadow cursor-pointer transition-all flex items-center justify-center gap-1"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>发起仿真验证 (预计扣减算力)</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              // 路径B
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 block mb-1">请用自然语言描述您的研发任务诉求</label>
                  <textarea
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="例：我需要分析招标文件里的偏离项，或者生成PRD对应的测试脑图..."
                    className="w-full h-32 text-xs font-semibold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-emerald-500/50 outline-none resize-none"
                  />
                </div>
                {aiMatchedComponent && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded p-3 flex items-center justify-between text-xs animate-in fade-in duration-200">
                    <div className="text-left font-bold text-emerald-800">
                      <span>匹配组件: [{aiMatchedComponent.id}] {aiMatchedComponent.title}</span>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">算法成功定位契约转换路径</p>
                    </div>
                    <button
                      onClick={() => {
                        setQuickSelectedCompId(aiMatchedComponent.id);
                        setQuickInputMaterial(aiQuery);
                        setQuickSubStep("select");
                        toast.success("已装填组件参数，请在路径A中确认执行");
                      }}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded cursor-pointer text-[10px] shadow"
                    >
                      一键装填执行
                    </button>
                  </div>
                )}
                <button
                  onClick={handleAIAssist}
                  disabled={!aiQuery.trim()}
                  className="w-full h-9 bg-slate-100 hover:bg-[#38a169]/10 text-slate-750 hover:text-emerald-700 disabled:text-slate-400 text-xs font-black rounded border border-slate-200 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>AI 智能推荐匹配组件</span>
                </button>
              </div>
            )}
          </div>
        );

      case "components":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#3182ce]" /> 空间组件库管理
              </h3>
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded text-[10px] font-black border">
                {[
                  { key: "installed", label: "已装配" },
                  { key: "recommended", label: "推荐组件" }
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setCompSubTab(sub.key as any)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${compSubTab === sub.key ? "bg-white text-slate-805 shadow-sm" : "text-slate-500"}`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            {compSubTab === "installed" ? (
              // 已装配组件
              <div className="space-y-3">
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                  {stages.map(stage => {
                    const stageComps = allComponents.filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id) && c.stageId === stage.id);
                    const isSelected = selectedStageId === stage.id;
                    return (
                      <button
                        key={stage.id}
                        onClick={() => setSelectedStageId(selectedStageId === stage.id ? null : stage.id)}
                        className={`px-2.5 py-1 text-[10px] font-black rounded-full shrink-0 border cursor-pointer ${
                          isSelected ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {stage.name} ({stageComps.length})
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const bound = allComponents.filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id));
                  const filtered = bound.filter(c => {
                    const matchStage = selectedStageId === null ? true : c.stageId === selectedStageId;
                    return matchStage;
                  });

                  if (filtered.length === 0) {
                    return <p className="text-[10px] text-slate-450 font-bold text-center py-8">本阶段下暂无已装配组件</p>;
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {filtered.map(c => {
                        const isRestricted = restrictedComponentIds.includes(c.id);
                        return (
                          <div key={c.id} className="p-3 bg-slate-50 rounded border border-slate-200 flex flex-col justify-between h-28">
                            <div className="flex justify-between items-start">
                              <div className="text-left min-w-0">
                                <span className="font-extrabold text-slate-805 text-xs truncate block">{c.title}</span>
                                <span className="text-[9px] text-slate-400 font-bold font-mono block mt-0.5">{c.id}</span>
                              </div>
                              <span className={`text-[9px] font-black px-1.5 rounded border ${isRestricted ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                                {isRestricted ? "无权限" : "可使用"}
                              </span>
                            </div>
                            <div className="flex justify-end pt-2 border-t border-slate-100 mt-2">
                              <button
                                onClick={() => handleComponentClick(c)}
                                className="px-2.5 py-0.8 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[10px] font-black rounded shadow cursor-pointer"
                              >
                                开始使用
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // 推荐组件
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: "C01", title: "RFP标书解析与偏离分析", reason: "提升标书审核效率", desc: "解析标书PDF文档，自动与RFP偏离库条目进行多维比对。", isBound: boundComponentIds.includes("C01") },
                  { id: "C11", title: "API契约规范一致性检测", reason: "后端数据库Schema已变更", desc: "逆向拉取Prisma配置协议，编译并输出标准swagger.json契约。", isBound: boundComponentIds.includes("C11") }
                ].map(rec => (
                  <div key={rec.id} className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex flex-col justify-between h-28">
                    <div>
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border">推荐理由: {rec.reason}</span>
                      <h4 className="font-extrabold text-slate-800 text-xs mt-1.5">{rec.title}</h4>
                    </div>
                    <div className="flex justify-end pt-1.5 mt-2">
                      <button
                        onClick={async () => {
                          if (rec.isBound) {
                            const comp = allComponents.find(c => c.id === rec.id);
                            if (comp) handleComponentClick(comp);
                          } else {
                            try {
                              const userId = localStorage.getItem("userId");
                              const res = await fetch("/api/studio", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${userId}` } : {}) },
                                body: JSON.stringify({ action: "bind", workspaceId, componentId: rec.id })
                              });
                              if (res.ok) {
                                toast.success(`组件 ${rec.id} 装配成功！`);
                                await refreshBoundComponents(workspaceId);
                              }
                            } catch (e) {
                              toast.error("装配失败");
                            }
                          }
                        }}
                        className="px-2.5 py-1 bg-[#3182ce] text-white font-black rounded text-[10px] cursor-pointer shadow"
                      >
                        {rec.isBound ? "开始使用" : "装配到当前空间"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "tasks":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1">
                <CheckSquare className="w-4 h-4 text-[#38a169]" /> 空间仿真任务列表
              </h3>
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded text-[10px] font-black border">
                {[
                  { key: "ALL", label: "全部" },
                  { key: "SUCCESS", label: "已完成" },
                  { key: "FAILED", label: "失败" }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTasksFilterTab(tab.key)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${tasksFilterTab === tab.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 表格样式 */}
            {(() => {
              const filtered = recentTasks.filter(t => {
                if (tasksFilterTab === "ALL") return true;
                return t.status === tasksFilterTab;
              });

              if (filtered.length === 0) {
                return <p className="text-[10px] text-slate-450 font-bold text-center py-8">暂无该状态下的任务运行记录</p>;
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-600 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-2.5 px-3">任务名称</th>
                        <th className="py-2.5 px-2">关联组件</th>
                        <th className="py-2.5 px-2">算力消耗</th>
                        <th className="py-2.5 px-2">运行状态</th>
                        <th className="py-2.5 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filtered.map(task => (
                        <tr key={task.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-extrabold text-slate-700 truncate max-w-[200px]" title={task.name}>
                            {task.name}
                          </td>
                          <td className="py-3 px-2 font-mono text-slate-450">{task.type}</td>
                          <td className="py-3 px-2 font-mono text-slate-500">{task.config?.tokenCost || 5} Token</td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded border text-[9px] font-black ${
                              task.status === "SUCCESS" ? "text-emerald-700 bg-emerald-50 border-emerald-100" :
                              "text-rose-700 bg-rose-50 border-rose-100"
                            }`}>{task.status}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-[10px] space-x-2">
                            {task.status === "SUCCESS" ? (
                              <>
                                <button onClick={() => openStructurePreview(task)} className="text-[#3182ce] hover:underline cursor-pointer">看板</button>
                                <button
                                  onClick={() => {
                                    setKnowledgeTask(task);
                                    setKnowledgeForm({ title: task.name, category: "SOP", access: "all" });
                                    setShowKnowledgeModal(true);
                                  }}
                                  className="text-amber-600 hover:underline cursor-pointer"
                                >
                                  沉淀
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  const comp = allComponents.find(c => c.id === task.type);
                                  if (comp) {
                                    setSimTargetComp(comp);
                                    setSimInput("重运行");
                                    setShowSimulationModal(true);
                                  }
                                }}
                                className="text-rose-600 hover:underline cursor-pointer"
                              >
                                重试
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );

      case "assets":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#3182ce]" /> 空间原始输入资料
              </h3>
              <button
                onClick={() => {
                  setImportAssetForm({ title: "", content: "", type: "input" });
                  setShowImportAssetModal(true);
                }}
                className="text-[11px] text-[#3182ce] hover:underline font-black flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 导入新资料
              </button>
            </div>

            {(() => {
              const list = documents.filter(d => d.type === "input" || d.title.includes("原始") || d.title.includes("输入"));
              if (list.length === 0) {
                return <p className="text-[10px] text-slate-450 font-bold text-center py-8">空间内暂无原始资产。支持格式: PDF / Markdown / Word / JSON。</p>;
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-650 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-[10px] font-black">
                        <th className="py-2.5 px-3">文件名称</th>
                        <th className="py-2.5 px-2">类型</th>
                        <th className="py-2.5 px-2">创建时间</th>
                        <th className="py-2.5 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {list.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-extrabold text-slate-700 truncate max-w-[200px]" title={doc.title}>{doc.title}</td>
                          <td className="py-3 px-2 text-slate-400">PDF / MD</td>
                          <td className="py-3 px-2 text-slate-400">{new Date(doc.createdAt).toLocaleDateString()}</td>
                          <td className="py-3 px-3 text-right font-black text-[10px] space-x-2">
                            <button
                              onClick={() => {
                                setPreviewData({ title: doc.title, content: doc.content || "内容为空。" });
                                setShowPreviewModal(true);
                              }}
                              className="text-[#3182ce] hover:underline cursor-pointer"
                            >
                              查看
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );

      case "results":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#38a169]" /> 结果中心 (已生成分析报告)
              </h3>
            </div>

            {(() => {
              const successTasks = recentTasks.filter(t => t.status === "SUCCESS");
              if (successTasks.length === 0) {
                return <p className="text-[10px] text-slate-450 font-bold text-center py-8">暂无编译完成的仿真产出成果</p>;
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-650 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-[10px] font-black">
                        <th className="py-2.5 px-3">成果名</th>
                        <th className="py-2.5 px-2">关联组件</th>
                        <th className="py-2.5 px-2">状态</th>
                        <th className="py-2.5 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {successTasks.map(task => (
                        <tr key={task.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-extrabold text-slate-700 truncate max-w-[200px]" title={task.name}>{task.name}</td>
                          <td className="py-3 px-2 font-mono text-slate-450">{task.type}</td>
                          <td className="py-3 px-2">
                            <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-600 rounded border border-emerald-100 text-[9px] font-bold">可导出</span>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-[10px] space-x-2">
                            <button
                              onClick={() => openStructurePreview(task)}
                              className="text-[#38a169] hover:underline cursor-pointer"
                            >
                              结构化预览与导出 ➔
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );

      case "knowledge":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-amber-500" /> 沉淀知识归档库
              </h3>
            </div>

            {(() => {
              const list = documents.filter(d => d.type === "knowledge" || d.title.includes("知识"));
              if (list.length === 0) {
                return <p className="text-[10px] text-slate-450 font-bold text-center py-8">空间知识库当前为空。仿真任务运行成功后可归档沉淀入库。</p>;
              }
              return (
                <div className="space-y-2">
                  {list.map(doc => (
                    <div key={doc.id} className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📚</span>
                        <div className="text-left">
                          <span className="font-extrabold text-slate-800">{doc.title}</span>
                          <span className="text-[9px] text-slate-400 font-bold block mt-0.5">SOP 规则大纲 / 公开归档</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPreviewData({ title: doc.title, content: doc.content || "材料为空。" });
                          setShowPreviewModal(true);
                        }}
                        className="text-[#3182ce] hover:underline font-black cursor-pointer text-[10px]"
                      >
                        查阅知识
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );

      case "members":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#3182ce]" /> 团队协同成员列表
              </h3>
              <button onClick={() => router.push(`/workspace/${workspaceId}/members`)} className="text-xs text-[#3182ce] hover:underline font-black cursor-pointer">
                管理空间成员
              </button>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-600">
              这里是协作空间的团队列表页，协同成员的角色包括 Owner、Admin 及普通研发岗位，可于成员设置页中执行变更邀请。
            </div>
          </div>
        );

      case "permissions":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#3182ce]" /> 研发组件安全授权矩阵
              </h3>
              <button onClick={() => router.push(`/workspace/${workspaceId}/settings/permissions`)} className="text-xs text-[#3182ce] hover:underline font-black cursor-pointer">
                编辑角色矩阵
              </button>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-650">
              企业空间专属功能。此处控制各个岗位等级对特定高密仿真�  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] flex flex-col font-sans relative overflow-hidden">
      {/* 背景效果 (恢复唯一真理系统 V6.0 灰白粒子纹理底图)，对齐 workspace-hub 风格 */}
      <div className="absolute inset-0 bg-[#f1f5f9] pointer-events-none overflow-hidden z-0">
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-[#3182ce]/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-[#10b981]/[0.02] rounded-full blur-[120px]" />
      </div>
      
      {/* 顶部 Header (面包屑) */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between z-20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-1.5 text-slate-655 hover:text-[#2b6cb0] transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="font-bold text-sm sm:text-base hidden xs:inline">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-300 flex-shrink-0" />
          
          <div className="flex items-center gap-2 min-w-0 text-left">
            <span className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md font-bold">🏢</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-800 text-sm sm:text-base truncate">{workspaceName}</span>
                <span className="text-xs text-slate-400 font-bold">/</span>
                <span className="text-xs text-slate-550 font-bold">执行控制台</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="relative" ref={spaceManagementDropdownRef}>
            <button
              onClick={() => setShowSpaceManagementDropdown(!showSpaceManagementDropdown)}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[4px] bg-gradient-to-b from-white to-slate-50 border border-slate-205 text-slate-700 hover:text-[#3182ce] text-xs font-extrabold shadow-sm hover:shadow"
            >
              <span>快速切换空间</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {showSpaceManagementDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 overflow-hidden text-left">
                {userState?.workspaces && userState.workspaces.length > 0 && (
                  <div className="px-3.5 py-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">切换至其他工作空间</p>
                    <div className="space-y-1 max-h-[160px] overflow-y-auto">
                      {userState.workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => handleSwitchWorkspace(workspace.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] border transition-all text-left cursor-pointer ${
                            workspace.id === workspaceId ? "bg-blue-50/60 border-blue-100/50" : "bg-white border-transparent"
                          }`}
                        >
                          <span className={`text-xs truncate font-bold ${workspace.id === workspaceId ? 'text-[#3182ce]' : 'text-slate-750'}`}>{workspace.name}</span>
                          {workspace.id === workspaceId && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <AvatarDropdown 
            workspaceId={workspaceId}
            workspaceType={workspaceType}
            userRole={userRole}
            onUpgradeClick={() => setShowUpgradeModal(true)}
          />
        </div>
      </header>

      {/* 空间名片摘要固定区 */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5 text-left shadow-sm relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-800 tracking-tight">{workspaceName}</h1>
              {workspaceType === "PERSONAL" ? (
                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded border border-blue-100 font-extrabold">👤 个人空间</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-[#d97706] rounded border border-amber-100 font-extrabold">🏢 企业协同空间</span>
              )}
              <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-extrabold">
                岗位角色: {userRole === "Owner" ? "👑 所有者" : userRole === "Admin" ? "🔧 管理员" : userRole === "ComponentManager" ? "🧩 组件管理员" : userRole === "KnowledgeManager" ? "📚 知识库管理员" : "👤 协作成员"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-2xl leading-relaxed">
              {workspaceType === "PERSONAL" 
                ? "个人空间专门用于个人组件的安全运行、私有开发资料的分类归档以及成果物的快速个人知识沉淀。"
                : "企业空间主要支持团队研发协作、组件安全授权、企业敏感资料共享、知识库沉淀及成员执行日志审计。"}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={() => {
                setActiveTab("quick");
                setQuickSubStep("select");
              }}
              className="flex-1 md:flex-none h-8.5 px-3.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black rounded shadow cursor-pointer transition-all flex items-center justify-center gap-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>开始新任务</span>
            </button>
            <button
              onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
              className="flex-1 md:flex-none h-8.5 px-3 bg-white border border-slate-250 hover:border-[#3182ce] text-slate-700 hover:text-[#3182ce] text-xs font-extrabold rounded shadow-sm cursor-pointer"
            >
              挑选装配大厅
            </button>
            <button
              onClick={() => router.push("/workspace-hub")}
              className="h-8.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-655 text-xs font-extrabold rounded cursor-pointer"
            >
              空间中枢
            </button>
          </div>
        </div>

        {/* 横向功能标签页 (Tabs) 切换区 */}
        <div className="max-w-6xl mx-auto mt-4 pt-1 flex gap-1.5 overflow-x-auto scrollbar-none border-t border-slate-100">
          {tabsList.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-black border-b-2 shrink-0 cursor-pointer transition-all ${
                activeTab === tab.key
                  ? "border-[#3182ce] text-[#3182ce]"
                  : "border-transparent text-slate-500 hover:text-[#3182ce]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主工作区 + 动态右侧上下文辅助栏 */}
      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-visible relative z-10">  </button>
          <div className="h-6 w-px bg-slate-300 flex-shrink-0" />
          
          <div className="flex items-center gap-2 min-w-0 text-left">
            <span className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md font-bold">🏢</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-800 text-sm sm:text-base truncate">{workspaceName}</span>
                <span className="text-xs text-slate-400 font-bold">/</span>
                <span className="text-xs text-slate-550 font-bold">执行控制台</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="relative" ref={spaceManagementDropdownRef}>
            <button
              onClick={() => setShowSpaceManagementDropdown(!showSpaceManagementDropdown)}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[4px] bg-gradient-to-b from-white to-slate-50 border border-slate-205 text-slate-700 hover:text-[#3182ce] text-xs font-extrabold shadow-sm hover:shadow"
            >
              <span>快速切换空间</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {showSpaceManagementDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 overflow-hidden text-left">
                {userState?.workspaces && userState.workspaces.length > 0 && (
                  <div className="px-3.5 py-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">切换至其他工作空间</p>
                    <div className="space-y-1 max-h-[160px] overflow-y-auto">
                      {userState.workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => handleSwitchWorkspace(workspace.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] border transition-all text-left cursor-pointer ${
                            workspace.id === workspaceId ? "bg-blue-50/60 border-blue-100/50" : "bg-white border-transparent"
                          }`}
                        >
                          <span className={`text-xs truncate font-bold ${workspace.id === workspaceId ? 'text-[#3182ce]' : 'text-slate-750'}`}>{workspace.name}</span>
                          {workspace.id === workspaceId && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <AvatarDropdown 
            workspaceId={workspaceId}
            workspaceType={workspaceType}
            userRole={userRole}
            onUpgradeClick={() => setShowUpgradeModal(true)}
          />
        </div>
      </header>

      {/* 空间名片摘要固定区 */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5 text-left shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-800 tracking-tight">{workspaceName}</h1>
              {workspaceType === "PERSONAL" ? (
                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded border border-blue-100 font-extrabold">👤 个人空间</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-[#d97706] rounded border border-amber-100 font-extrabold">🏢 企业协同空间</span>
              )}
              <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-extrabold">
                岗位角色: {userRole === "Owner" ? "👑 所有者" : userRole === "Admin" ? "🔧 管理员" : userRole === "ComponentManager" ? "🧩 组件管理员" : userRole === "KnowledgeManager" ? "📚 知识库管理员" : "👤 协作成员"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-2xl leading-relaxed">
              {workspaceType === "PERSONAL" 
                ? "个人空间专门用于个人组件的安全运行、私有开发资料的分类归档以及成果物的快速个人知识沉淀。"
                : "企业空间主要支持团队研发协作、组件安全授权、企业敏感资料共享、知识库沉淀及成员执行日志审计。"}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={() => {
                setActiveTab("quick");
                setQuickSubStep("select");
              }}
              className="flex-1 md:flex-none h-8.5 px-3.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black rounded shadow cursor-pointer transition-all flex items-center justify-center gap-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>开始新任务</span>
            </button>
            <button
              onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
              className="flex-1 md:flex-none h-8.5 px-3 bg-white border border-slate-250 hover:border-[#3182ce] text-slate-700 hover:text-[#3182ce] text-xs font-extrabold rounded shadow-sm cursor-pointer"
            >
              挑选装配大厅
            </button>
            <button
              onClick={() => router.push("/workspace-hub")}
              className="h-8.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-650 text-xs font-extrabold rounded cursor-pointer"
            >
              空间中枢
            </button>
          </div>
        </div>

        {/* 横向功能标签页 (Tabs) 切换区 */}
        <div className="max-w-6xl mx-auto mt-4 pt-1 flex gap-1.5 overflow-x-auto scrollbar-none border-t border-slate-100">
          {tabsList.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-black border-b-2 shrink-0 cursor-pointer transition-all ${
                activeTab === tab.key
                  ? "border-[#3182ce] text-[#3182ce]"
                  : "border-transparent text-slate-500 hover:text-[#3182ce]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主工作区 + 动态右侧上下文辅助栏 */}
      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-visible">
        
        {/* 左侧主内容区 (8/12) */}
        <div className="lg:col-span-8 space-y-6">
          {renderTabContent()}
        </div>

        {/* 右侧上下文辅助栏 (4/12) */}
        <div className="lg:col-span-4 space-y-4">
          {renderRightPanel()}
        </div>
      </div>

      {/* -------------------- 尾部多 Modal -------------------- */}

      {/* 1. 结构化结果预览大 Modal */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between text-left">
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5 text-[#3182ce]" />
                仿真任务高精度结构化报告
              </h3>
              <button 
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData(null);
                }}
                className="text-slate-400 hover:text-slate-650 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 text-left space-y-5 bg-slate-50/50">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">成果摘要</span>
                <p className="text-xs font-semibold text-slate-700 mt-1 leading-relaxed">{previewData.summary}</p>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">关键结论</span>
                <ul className="list-disc pl-4 text-xs font-semibold text-slate-700 mt-2 space-y-1">
                  {previewData.conclusions?.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">明细成果数据</span>
                <div className="mt-2 text-xs font-mono whitespace-pre-wrap select-text leading-relaxed bg-slate-50 p-3 rounded border overflow-x-auto">
                  {previewData.content}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-rose-500 tracking-wider">风险/漏洞清单</span>
                <ul className="list-disc pl-4 text-xs font-semibold text-rose-700 mt-2 space-y-1">
                  {previewData.risks?.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <span className="text-[10px] font-black uppercase text-[#38a169] tracking-wider">后续整改建议</span>
                <ul className="list-disc pl-4 text-xs font-semibold text-[#38a169] mt-2 space-y-1">
                  {previewData.suggestions?.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex flex-wrap gap-2 justify-between items-center rounded-b-xl">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleExport("word")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded border border-slate-250 flex items-center gap-1 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>导出 Word</span>
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded border border-slate-250 flex items-center gap-1 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-red-500" />
                  <span>导出 PDF</span>
                </button>
                <button
                  onClick={() => handleExport("excel")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded border border-slate-250 flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
                  <span>导出 Excel</span>
                </button>
                <button
                  onClick={() => copyToClipboard(previewData.content)}
                  className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-650 text-[10px] font-black rounded border border-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制 Markdown</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setKnowledgeTask(previewData.task);
                    setKnowledgeForm({ title: previewData.title, category: "SOP", access: "all" });
                    setShowKnowledgeModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded flex items-center gap-1 cursor-pointer shadow-sm animate-pulse"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>沉淀至空间知识库</span>
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewData(null);
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-605 text-xs font-bold rounded cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. 仿真拦截与算力确认 Modal */}
      {showSimulationModal && simTargetComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 text-left">
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
                <Zap className="w-4.5 h-4.5 text-[#3182ce]" />
                控制台仿真算力确认
              </h3>
            </div>
            
            <div className="p-5 text-left space-y-4">
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs space-y-2 font-semibold">
                <div className="flex justify-between text-slate-700">
                  <span>执行组件</span>
                  <span className="text-[#3182ce] font-extrabold">{simTargetComp.id} - {simTargetComp.title}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>预计仿真时长</span>
                  <span>4.2 秒</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>所需算力 Token</span>
                  <span className="text-[#3182ce] font-extrabold">{simTargetComp.isPremium ? 15 : 5} Token</span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs font-bold">
                <div className="flex justify-between text-slate-400">
                  <span>当前空间 Token 余额</span>
                  <span className="font-mono text-slate-750">
                    {workspaceType === "PERSONAL" ? "无上限 (个人版免扣减)" : `${workspaceToken.toLocaleString()} Token`}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-xl">
              <button
                type="button"
                onClick={() => {
                  setShowSimulationModal(false);
                  setSimTargetComp(null);
                }}
                className="px-3.5 py-1.5 bg-white border border-slate-205 text-slate-600 text-xs font-bold rounded cursor-pointer"
                disabled={simIsExecuting}
              >
                取消执行
              </button>
              <button
                onClick={executeSimulation}
                className="px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-350 text-white text-xs font-black rounded flex items-center gap-1 cursor-pointer shadow-sm"
                disabled={simIsExecuting}
              >
                {simIsExecuting ? "正在编译仿真..." : "确认扣减并执行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 知识沉淀配置 Modal */}
      {showKnowledgeModal && knowledgeTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-205 max-w-md w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 text-left">
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
                <FolderOpen className="w-4.5 h-4.5 text-amber-500" />
                知识沉淀归档配置
              </h3>
            </div>
            
            <form onSubmit={handleKnowledgeSubmit}>
              <div className="p-5 text-left space-y-4">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 block mb-1 uppercase">沉淀资产名称 <span className="text-rose-500 font-bold">*</span></label>
                  <input
                    type="text"
                    required
                    value={knowledgeForm.title}
                    onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
                    className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-amber-500/50 outline-none"
                    placeholder="例如：RFP标书规格审查合规判定SOP"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 block mb-1 uppercase">归档知识类型</label>
                  <select
                    value={knowledgeForm.category}
                    onChange={(e) => setKnowledgeForm({ ...knowledgeForm, category: e.target.value })}
                    className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-amber-500/50 outline-none"
                  >
                    <option value="SOP">标准作业程序 (SOP)</option>
                    <option value="CASE">经典案例分析 (Case)</option>
                    <option value="TEMPLATE">通用研发模板 (Template)</option>
                    <option value="RULE">业务契约规则 (Rule)</option>
                  </select>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded p-3 text-[10px] text-amber-800 font-semibold leading-relaxed">
                  {workspaceType === "ENTERPRISE" 
                    ? "⚠️ 当前空间为企业协同空间，点击提交后将发至待审批，由知识库管理员审核后方可入库沉淀。" 
                    : "💡 当前为个人自主空间，成果物将直接入库归档，无需流程审核。"}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowKnowledgeModal(false);
                    setKnowledgeTask(null);
                  }}
                  className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded cursor-pointer"
                  disabled={knowledgeIsSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-350 text-white text-xs font-black rounded cursor-pointer"
                  disabled={knowledgeIsSubmitting}
                >
                  {workspaceType === "PERSONAL" ? "存入个人知识库" : "提交审核"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. 导入外部输入资产 Modal */}
      {showImportAssetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 text-left">
              <h3 className="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
                <Plus className="w-4.5 h-4.5 text-[#3182ce]" />
                导入外部输入资产文件
              </h3>
            </div>
            
            <form onSubmit={handleImportAssetSubmit}>
              <div className="p-5 text-left space-y-4">
                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 block mb-1 uppercase">资产文件名称 <span className="text-rose-500 font-bold">*</span></label>
                  <input
                    type="text"
                    required
                    value={importAssetForm.title}
                    onChange={(e) => setImportAssetForm({ ...importAssetForm, title: e.target.value })}
                    className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#3182ce]/50 outline-none"
                    placeholder="例如：2026_系统研发招标文件.pdf"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-slate-400 block mb-1 uppercase">输入文件描述内容</label>
                  <textarea
                    value={importAssetForm.content}
                    onChange={(e) => setImportAssetForm({ ...importAssetForm, content: e.target.value })}
                    placeholder="请输入此资产的文本描述，做为仿真时的源头输入数据流..."
                    className="w-full h-28 text-xs font-semibold text-slate-700 border border-slate-200 rounded p-2 focus:ring-1 focus:ring-[#3182ce]/50 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportAssetModal(false);
                    setImportAssetForm({ title: "", content: "", type: "input" });
                  }}
                  className="px-3.5 py-1.5 bg-white border border-slate-205 text-slate-605 text-xs font-bold rounded cursor-pointer"
                  disabled={importIsSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-350 text-white text-xs font-black rounded cursor-pointer"
                  disabled={importIsSubmitting}
                >
                  确认导入资料
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
