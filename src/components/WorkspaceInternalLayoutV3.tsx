"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { 
  ArrowLeft, Settings, ChevronDown, Plus, FileText, Layers, Database, Layout, 
  Server, ShieldCheck, Check, ArrowRight, BookOpen, AlertCircle, 
  CheckCircle2, Play, Users, BarChart2, ShieldAlert, FileDown, Clipboard, Trash2, Edit2, HelpCircle, Info,
  Upload, Save, AlertTriangle, Copy, KeyRound, ExternalLink, Share2, Ban, Clock, Zap, PenLine, Eye
} from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import type { ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";
import UpgradeModal from "@/components/studio/UpgradeModal";
import ImportAssetModal from "@/components/studio/ImportAssetModal";
import ConfirmRunModal from "@/components/studio/ConfirmRunModal";
import ComponentsTab from "@/components/studio/ComponentsTab";
import TasksTab from "@/components/studio/TasksTab";
import OverviewTab from "@/components/studio/OverviewTab";
import PositionsConfigTab from "@/components/studio/PositionsConfigTab";
import KnowledgeTab from "@/components/studio/KnowledgeTab";
import SafeUninstallModal from "@/components/studio/SafeUninstallModal";
import type { PositionDefinition } from "@/constants/positions";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";

// 组件与阶段类型定义
interface ZhiGeComponent {
  id: string;
  title: string;
  stageId: number;
  path: string;
  icon: string;
  isPremium?: boolean;
}

// 标准化与格式化时间字符串 (展现为标准 YYYY-MM-DD HH:mm:ss)
function formatTaskTime(rawTime?: string): string {
  if (!rawTime) return "近期";
  try {
    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return rawTime;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return rawTime;
  }
}

interface CurrentAuth {
  workspaceType: "PERSONAL" | "ENTERPRISE";
  userRole: "Owner" | "Admin" | "Member" | "Viewer" | "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | "ComponentManager" | "KnowledgeManager";
  allowedComponentIds: string[];
  membershipLevel?: string;
}

interface Stage {
  id: number;
  name: string;
  color: string;
  bgColor: string;
}

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

const stageMetaData: Record<number, { icon: any; iconText: string; code: string; flowText: string }> = {
  1: { icon: FileText, iconText: "📄", code: "BID", flowText: "商机打单" },
  2: { icon: Layers, iconText: "🧩", code: "REQ", flowText: "需求定义" },
  3: { icon: Play, iconText: "💻", code: "API", flowText: "后端开发" },
  4: { icon: Database, iconText: "🗄️", code: "DB", flowText: "数据工程" },
  5: { icon: Layout, iconText: "📐", code: "UI", flowText: "大前端" },
  6: { icon: CheckCircle2, iconText: "✅", code: "QA", flowText: "测试质量" },
  7: { icon: Server, iconText: "🐳", code: "OPS", flowText: "持续运维" },
  8: { icon: ShieldCheck, iconText: "🔒", code: "SEC", flowText: "安全防护" },
  9: { icon: Users, iconText: "👥", code: "PM", flowText: "项目管理" },
  10: { icon: BookOpen, iconText: "📚", code: "KM", flowText: "知识资产" },
};

// 历史自动化任务（status 支持明确未知态，避免后端新状态被误判）
interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";
  time: string;
  outputData?: any;
}

// 任务状态归一化：把后端各类任务状态显式映射到前端四种展示状态，
// 杜绝"未识别状态一律当作成功"的误判；未知状态归入 UNKNOWN 并明确展示。
function normalizeTaskStatus(rawStatus?: string | null): TaskRecord["status"] {
  const s = (rawStatus || "").trim().toUpperCase();
  if (s === "SUCCESS" || s === "COMPLETED" || s === "DONE") return "SUCCESS";
  if (s === "FAILED" || s === "ERROR" || s === "CANCELLED" || s === "CANCELED") return "FAILED";
  if (s === "RUNNING" || s === "PENDING" || s === "READY" || s === "PROCESSING" || s === "DRAFT" || s === "NEEDS_REVIEW") {
    return "RUNNING";
  }
  return "UNKNOWN";
}

// 空间资料
interface AssetRecord {
  id: string;
  title: string;
  size: string;
  type: string;
  time: string;
  content: string;
}

// 自动生成结果
interface ResultRecord {
  id: string;
  title: string;
  componentId: string;
  taskName: string;
  time: string;
  isSavedToKnowledge: boolean;
}

// 团队规范沉淀
interface KnowledgeRecord {
  id: string;
  title: string;
  sourceComponent: string;
  sourceTaskId?: string;
  sourceTaskName?: string;
  componentId?: string;
  componentName?: string;
  componentCategory?: string;
  time: string;
  status: "APPROVED" | "PENDING";
}

interface WorkspaceInternalLayoutProps {
  children?: React.ReactNode;
}

export default function WorkspaceInternalLayout({ children }: WorkspaceInternalLayoutProps) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const toast = useToast();
  const searchParams = useSearchParams();

  // AppContext
  const { boundComponentIds, boundComponentsWorkspaceId, refreshBoundComponents, addRecentUsed, userState, setUserState, componentCatalog, componentCategories, presetPositions, resetWorkspaceData } = useAppContext();

  // 分类 → 阶段号映射（由数据库 component_category.sortOrder 驱动，不再硬编码）
  const categoryToStageId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(componentCategories || {}).forEach(([key, value]) => {
      map[key] = value.sortOrder && value.sortOrder > 0 ? value.sortOrder : 1;
    });
    return map;
  }, [componentCategories]);

  // 组件信息来自数据库（component_catalog 表），动态构造侧边栏组件树
  const allComponents: ZhiGeComponent[] = componentCatalog.map(c => ({
    id: c.id,
    title: c.name,
    stageId: categoryToStageId[c.category as ComponentCategory] || 1,
    path: `/workspace/component/${c.id}`,
    icon: categoryEmojis[c.category as ComponentCategory] || "⚙️",
  }));

  const newBoundComponentId = searchParams.get("newBoundComponentId");

  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [userRole, setUserRole] = useState<"Owner" | "Admin" | "Member" | "Viewer" | "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | "ComponentManager" | "KnowledgeManager">("Member");
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [hasMounted, setHasMounted] = useState(false);
  const [authData, setAuthData] = useState<CurrentAuth | null>(null);

  // 新装配通知 Banner 状态
  const [showNewBoundBanner, setShowNewBoundBanner] = useState(false);
  const [newBoundComp, setNewBoundComp] = useState<any>(null);
  const bannerTimeoutRef = useRef<any>(null);

  // 挂载周期初始化防重复守卫
  const initializedWsIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef<boolean>(false);

  // 状态管理
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [workspaceToken, setWorkspaceToken] = useState<number>(12580);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);
  const [customPositions, setCustomPositions] = useState<PositionDefinition[]>([]);
  const [showSpaceManagementDropdown, setShowSpaceManagementDropdown] = useState(false);
  const spaceManagementDropdownRef = useRef<HTMLDivElement>(null);

  // 快速自动化执行状态
  const [quickSelectedCompId, setQuickSelectedCompId] = useState<string>("");
  const [quickInputMaterial, setQuickInputMaterial] = useState<string>("");
  const [quickSubStep, setQuickSubStep] = useState<"select" | "material">("select");
  const [isExecutingTask, setIsExecutingTask] = useState(false);
  const [materialInputMode, setMaterialInputMode] = useState<"text" | "file" | "asset">("text");
  const [uploadedFileMeta, setUploadedFileMeta] = useState<{ name: string; size: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(file.size / 1024)} KB`;
    setUploadedFileMeta({ name: file.name, size: sizeStr });

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setQuickInputMaterial(content);
        toast.success(`文件 [${file.name}] 已成功挂载读入源材料！`);
      }
    };
    reader.onerror = () => {
      toast.error("读取文件失败，请重试");
    };
    reader.readAsText(file);
  };

  // 子选项
  const [compSubTab, setCompSubTab] = useState<"bound" | "recommend" | "all">("bound");
  const [taskFilter, setTaskFilter] = useState<"all" | "success" | "failed">("all");

  // 数据源
  // TODO: 后续应调用 /api/studio?action=tasks 从后端获取真实任务记录
  const [recentTasks, setRecentTasks] = useState<TaskRecord[]>([]);

  // 空间资料：加载状态与错误状态（不再静默伪造空数据）
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState("");
  const [assetTabCurrentPage, setAssetTabCurrentPage] = useState<number>(1);

  // 后端空间文档（父布局作为唯一数据源加载，子 Tab 通过 props 获取）
  const [apiDocuments, setApiDocuments] = useState<any[] | null>(null);

  // TODO: 后续应从后端结果接口拉取真实结果
  const [results, setResults] = useState<ResultRecord[]>([]);

  // TODO: 后续应从后端空间知识库接口获取真实规范
  const [knowledges, setKnowledges] = useState<KnowledgeRecord[]>([]);

  // Modals 控制
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showImportAssetModal, setShowImportAssetModal] = useState(false);
  const [importAssetForm, setImportAssetForm] = useState({ title: "", content: "", type: "input" });
  const [showConfirmRunModal, setShowConfirmRunModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);

  // 组件生命周期安全卸载诊断中心状态
  const [uninstallingComponentId, setUninstallingComponentId] = useState<string | null>(null);
  const [uninstallingComponentName, setUninstallingComponentName] = useState<string>("");
  const [uninstallStep, setUninstallStep] = useState<"idle" | "checking" | "confirm" | "blocked">("idle");
  const [checkLogs, setCheckLogs] = useState<string[]>([]);

  // 请求安全卸载组件，启动微诊断流程检查有无历史数据依赖
  const handleRequestUninstall = (compId: string, compName: string) => {
    // 强行拦截：如果是企业空间，且当前组件为启用状态，则禁止卸载
    if (workspaceType === "ENTERPRISE") {
      const isEnabled = componentStates?.[compId]?.enabled !== false;
      if (isEnabled) {
        toast.error(`组件 [${compName}] 处于开启启用状态，强行阻断卸载！请先禁用该组件以切断服务。`);
        return;
      }
    }

    setUninstallingComponentId(compId);
    setUninstallingComponentName(compName);
    setUninstallStep("checking");
    setCheckLogs([]);
    
    const logs = [
      "⚙️ 正在初始化安全卸载引导区...",
      "⚙️ 正在建立空间本地文件依赖校验...",
      `⚙️ 正在拉取组件 [${compName}] 的历史数据指标...`,
      "⚙️ 正在检索当前空间的任务执行历史记录...",
      "⚙️ 正在校验资产完整性与底层数据依存冲突..."
    ];
    
    let currentLogIdx = 0;
    const timer = setInterval(() => {
      if (currentLogIdx < logs.length) {
        setCheckLogs(prev => [...prev, logs[currentLogIdx]]);
        currentLogIdx++;
      } else {
        clearInterval(timer);
        // 执行真实任务及结果数据依附性排查诊断
        const hasTaskData = recentTasks.some(t => t.componentId === compId);
        const hasResultData = results.some(r => r.componentId === compId);
        const hasKnowledgeData = knowledges.some(k => k.sourceComponent.includes(compId));
        
        if (hasTaskData || hasResultData || hasKnowledgeData) {
          const blockedLog = `ℹ️ 检测到该组件存在 ${hasTaskData ? "任务运行历史、" : ""}${hasResultData ? "成果数据文件、" : ""}${hasKnowledgeData ? "沉淀知识资产" : ""}等数据依存关系。`;
          setCheckLogs(prev => [...prev, blockedLog, "✔ 解绑仅移除组件绑定关系，任务/结果/知识库数据资产将完整保留，可直接继续。"]);
          setUninstallStep("confirm");
        } else {
          setCheckLogs(prev => [...prev, "✔ 诊断通过：组件没有任何历史任务数据与存储挂载占用！"]);
          setUninstallStep("confirm");
        }
      }
    }, 300);
  };

  // 解绑前置引导：解绑只移除组件绑定关系，任务历史 / 结果 / 知识库沉淀属于数据资产，
  // 一律完整保留，绝不从 recentTasks / results / knowledges 中物理移除（避免误删或误隐藏）。
  const handleClearComponentData = () => {
    toast.success("解绑不会删除任务历史、结果与知识库数据，可直接继续");
    setUninstallStep("confirm");
  };

  // 调用 API 解绑卸载组件
  const handleConfirmUninstall = async () => {
    try {
      setUninstallStep("idle");
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: "unbind",
          workspaceId,
          componentId: uninstallingComponentId,
        }),
      });
      
      const data = await res.json().catch(() => ({ success: false, error: "服务器响应异常" }));
      if (res.ok && data.success) {
        toast.success("组件卸载成功，已切断本地授权！");
        
        // 解绑仅移除组件绑定关系；任务历史 / 结果 / 知识库沉淀属于数据资产，
        // 一律保留，绝不从 recentTasks / results / knowledges 中物理移除。
        
        // 刷新本地全局绑定组件状态并广播全网
        await refreshBoundComponents(workspaceId);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_workspace_components_updated", { detail: { workspaceId, componentId: uninstallingComponentId, action: "unbind" } }));
        }
      } else {
        throw new Error(data.error || data.message || "解绑组件失败，请稍后重试");
      }
    } catch (e: any) {
      toast.error(e.message || "解绑组件失败，请稍后重试");
    } finally {
      setUninstallingComponentId(null);
    }
  };

  // 维护组件开启/禁用状态
  const [componentStates, setComponentStates] = useState<Record<string, { enabled: boolean }>>({});

  const loadComponentStates = async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`, {
        headers: {
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.states) {
          setComponentStates(data.states);
        }
      }
    } catch (e) {
      console.error("加载组件状态失败:", e);
    }
  };

  // 切换装配组件的启用/禁用状态
  const handleToggleComponentActive = async (comp: any, enabled: boolean) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "toggle-active",
          workspaceId,
          componentId: comp.id,
          enabled,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(enabled ? `组件 ${comp.name} 已启用` : `组件 ${comp.name} 已禁用`);
        // 重新加载绑定状态与启用状态
        await loadComponentStates();
      } else {
        throw new Error(data.error || data.message || "切换状态失败");
      }
    } catch (error: any) {
      console.error("切换组件启用状态失败:", error);
      toast.error(error.message || "操作失败，请联系空间管理员");
    }
  };

  // AI 智能推荐、阶段与任务过滤等新追加状态
  const [aiQuery, setAiQuery] = useState("");
  
  // 智能 AI 诉求润色状态与扩增算法
  const [originalAiQuery, setOriginalAiQuery] = useState("");
  const [refinedAiQuery, setRefinedAiQuery] = useState("");
  const [isRefiningAi, setIsRefiningAi] = useState(false);
  const [showRefineAiPanel, setShowRefineAiPanel] = useState(false);

  const getRefinedAiText = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return "";
    
    const lower = trimmed.toLowerCase();
    if (lower.includes("标书") || lower.includes("rfp") || lower.includes("投标") || lower.includes("合同")) {
      return "我需要对上传的 RFP 招标 PDF 材料及技术偏离文件进行格式自检，通过深度文本适配自动提取偏离差异条款，并快速生成规范的可视化风险比对报告。";
    }
    if (lower.includes("api") || lower.includes("接口") || lower.includes("后端") || lower.includes("swagger")) {
      return "我需要对给定的 RESTful API 协议契约进行分析，逆向生成对应的 Spring Boot/Next.js 后端接口模板与业务控制器框架，并自动对齐契约定义。";
    }
    if (lower.includes("测试") || lower.includes("单测") || lower.includes("jest") || lower.includes("junit")) {
      return "我需要对项目核心业务代码自动生成覆盖率达标的单元测试用例，并配套构建 Docker 自动化部署镜像及流水线配置文件。";
    }
    if (lower.includes("react") || lower.includes("vue") || lower.includes("前端") || lower.includes("页面")) {
      return "我希望将手写或导出的交互原型 schema 自动转换生成为符合现代化设计系统规范的响应式 React 大前端组件代码。";
    }
    if (lower.includes("数据库") || lower.includes("er") || lower.includes("sql") || lower.includes("建表")) {
      return "我需要对现有的 DDL 建表 SQL 脚本进行实体逆向映射，生成直观清晰的 ER 拓扑图模型，并导出为标准数据字典。";
    }
    
    return `我需要在当前工作空间中，基于“${trimmed}”的具体研发场景，通过配置化效能组件进行数据流自适应处理，自动生成规范成果，并沉淀为团队 SOP 避坑规约。`;
  };

  const [aiMatchedComponent, setAiMatchedComponent] = useState<ZhiGeComponent | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [tasksFilterTab, setTasksFilterTab] = useState<string>("ALL");
  const [activeCompSubTab, setActiveCompSubTab] = useState<"installed" | "recommended">("installed");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ title: string; content: string }>({ title: "", content: "" });

  // ================= 空间设置 Tab 的状态变量与事件 =================
  const [workspaceInfo, setWorkspaceInfo] = useState<any>({
    id: "",
    name: "",
    type: "PERSONAL",
    description: "",
    teamSize: "",
    industry: "",
    contactEmail: "",
    contactPhone: "",
    logo: "",
    createdAt: "",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [settingsErrors, setSettingsErrors] = useState<any>({
    name: false,
    contactEmail: false,
    contactPhone: false,
  });

  // Danger Zone 控制状态
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingSettings, setDeletingSettings] = useState(false);

  // ================= 空间成员 Tab 的状态变量与事件 =================
  const [membersList, setMembersList] = useState<any[]>([]);
  const [activeInvitations, setActiveInvitations] = useState<any[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("ALL");
  const [memberTimeSort, setMemberTimeSort] = useState("asc"); // asc: 最早加入, desc: 最新加入
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentMemberRole, setCurrentMemberRole] = useState<string>("MEMBER");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationExpires, setInvitationExpires] = useState("");
  const [showGenerateInviteModal, setShowGenerateInviteModal] = useState(false);
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(7);
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  
  // 成员与协作部分的二次确认模态框状态
  const [showMemberRemoveConfirm, setShowMemberRemoveConfirm] = useState(false);
  const [targetRemoveMember, setTargetRemoveMember] = useState<{ id: string; name: string } | null>(null);
  const [showInvitationActionConfirm, setShowInvitationActionConfirm] = useState(false);
  const [targetInvitationAction, setTargetInvitationAction] = useState<{ id: string; action: "revoke" | "delete" } | null>(null);
  const [processingInvitationAction, setProcessingInvitationAction] = useState(false);

  const loadTabMembers = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setMembersLoading(true);
      
      // 个人空间直接本地免网络请求生成当前 Owner 的独占列表
      if (workspaceType === "PERSONAL") {
        const myUserId = getCurrentUserId() || "usr_owner";
        setMembersList([{
          userId: myUserId,
          name: userState?.userInfo?.name || "空间所有者",
          email: userState?.userInfo?.email || "owner@zhige.com",
          avatar: null,
          role: "OWNER",
          joinedAt: new Date().toISOString()
        }]);
        setCurrentMemberRole("OWNER");
        setActiveInvitations([]);
        return;
      }

      const res = await fetch(`/api/workspace/members?workspaceId=${workspaceId}`, {
        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        let list = data.members || [];
        
        // 找出当前用户的角色
        const myUserId = getCurrentUserId();
        const me = list.find((m: any) => m.userId === myUserId);
        if (me) {
          setCurrentMemberRole(me.role);
        }

        // 防御型自愈：如果列表中未带入当前操作管理员，手动在此补齐展示，保证界面始终有管理员自身记录
        const hasMe = list.some((m: any) => m.userId === myUserId);
        if (!hasMe && myUserId) {
          list.push({
            userId: myUserId,
            name: userState?.userInfo?.name || "管理员",
            email: userState?.userInfo?.email || "未绑定邮箱",
            avatar: null,
            role: currentMemberRole || "MEMBER",
            joinedAt: new Date().toISOString()
          });
        }
        
        setMembersList(list);
        // 按邀请码去重，确保每个邀请码在列表中仅显示一次（保留最新生成的一条），修复重复记录问题
        const rawInvitations = data.activeInvitations || [];
        const seenCodes = new Set<string>();
        const dedupedInvitations = rawInvitations.filter((inv: any) => {
          if (seenCodes.has(inv.code)) return false;
          seenCodes.add(inv.code);
          return true;
        });
        // 排序：有效(0) → 作废(1) → 已过期(2)；同状态组内按生成时间(createdAt)升序排列
        const statusRank = (inv: any): number => {
          if (inv.status === "REVOKED") return 1;
          if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) return 2;
          return 0;
        };
        const timeValue = (inv: any): number => {
          const t = inv.createdAt ? new Date(inv.createdAt).getTime() : (inv.expiresAt ? new Date(inv.expiresAt).getTime() : 0);
          return t;
        };
        const sortedInvitations = [...dedupedInvitations].sort(
          (a: any, b: any) => statusRank(a) - statusRank(b) || timeValue(a) - timeValue(b)
        );
        setActiveInvitations(sortedInvitations);
      }
    } catch (error) {
      console.error("加载成员失败", error);
    } finally {
      setMembersLoading(false);
    }
  }, [workspaceId, workspaceType, userState, currentMemberRole]);

  useEffect(() => {
    if (activeTab === "members" && workspaceId) {
      loadTabMembers();
    }
  }, [activeTab, workspaceId, loadTabMembers]);

  // 岗位配置加载闭环：权限 Tab 打开且当前用户为空间 OWNER / ADMIN 时，从后端拉取已保存的自定义岗位
  // 注意：useToast 返回的 toast 对象随 ToastProvider 重渲染而不稳定，不可作为 useCallback 依赖，
  // 否则 toast 弹窗会导致 loadPositions 反复触发、覆盖用户正在编辑的岗位配置。
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  const loadPositions = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/studio?action=positions&workspaceId=${workspaceId}`, {
        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
        credentials: "include",
      });
      const data = await res.json().catch(() => ({ success: false, error: "服务器响应解析失败" }));
      if (!res.ok || data.success === false) {
        toastRef.current.error(data.error || `岗位配置加载失败（HTTP ${res.status}）`);
        return;
      }
      // 后端从未保存过时 positions 为 null，此时保持默认预置岗位，不清空已有配置
      if (Array.isArray(data.positions)) {
        setCustomPositions(data.positions);
      }
    } catch (error) {
      console.error("加载岗位配置失败", error);
      toastRef.current.error("岗位配置加载失败，请检查网络后重试");
    }
  }, [workspaceId]);

  useEffect(() => {
    // 仅空间 OWNER / ADMIN 触发岗位配置加载（普通 MEMBER 即使通过 URL 直达权限 Tab 也不加载）
    const effOwner = userRole === "Owner" || userRole === "OWNER" || membersList.some(m => m.userId === getCurrentUserId() && (m.role === "OWNER" || m.role === "Owner"));
    const effAdmin = userRole === "Admin" || userRole === "ADMIN" || membersList.some(m => m.userId === getCurrentUserId() && (m.role === "ADMIN" || m.role === "Admin"));
    if (activeTab === "permissions" && workspaceId && (effOwner || effAdmin)) {
      loadPositions();
    }
  }, [activeTab, workspaceId, loadPositions, userRole, membersList]);

  // 岗位配置保存闭环：持久化当前 customPositions 到后端（后端 checkWorkspaceManager 强校验 OWNER/ADMIN）
  const handleSavePositions = useCallback(async (positions: PositionDefinition[]) => {
    const res = await fetch("/api/studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ action: "save-positions", workspaceId, positions }),
    });
    const data = await res.json().catch(() => ({ success: false, error: "服务器响应解析失败" }));
    if (!res.ok || data.success === false) {
      // 抛出后端具体错误（如 403 越权），由 PositionsConfigTab 提示，不伪报成功
      throw new Error(data.error || `岗位配置保存失败（HTTP ${res.status}）`);
    }
    return data;
  }, [workspaceId]);

  const handleTabGenerateCode = async () => {
    try {
      setGeneratingCode(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        body: JSON.stringify({
          workspaceId,
          role: inviteRole,
          expiresInDays: inviteExpiresInDays,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInvitationCode(data.invitationCode);
        if (data.expiresAt) {
          setInvitationExpires(new Date(data.expiresAt).toLocaleDateString("zh-CN"));
        }
        toast.success("专属邀请链接已生成，可复制发给团队成员！");
        loadTabMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }
    } catch (error: any) {
      toast.error(error.message || "生成邀请码失败，只有所有者或管理员有权操作");
    } finally {
      setGeneratingCode(false);
    }
  };
  
  const handleTabDeleteInvitation = (invitationId: string, action: "revoke" | "delete" = "delete") => {
    setTargetInvitationAction({ id: invitationId, action });
    setShowInvitationActionConfirm(true);
  };

  const submitTabDeleteInvitation = async () => {
    if (!targetInvitationAction) return;
    const { id: invitationId, action } = targetInvitationAction;
    setProcessingInvitationAction(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/invitation/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        body: JSON.stringify({ invitationId, action }),
      });

      if (res.ok) {
        toast.success(action === "revoke" ? "邀请链接已成功作废！" : "邀请记录已成功物理删除！");
        loadTabMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "操作失败");
      }
    } catch (error: any) {
      toast.error(error.message || "操作邀请链接失败");
    } finally {
      setProcessingInvitationAction(false);
      setShowInvitationActionConfirm(false);
      setTargetInvitationAction(null);
    }
  };

  const handleTabRemoveMember = (targetUserId: string, targetName: string) => {
    setTargetRemoveMember({ id: targetUserId, name: targetName });
    setShowMemberRemoveConfirm(true);
  };

  const submitTabRemoveMember = async () => {
    if (!targetRemoveMember) return;
    try {
      const authToken = getAuthToken();
      const res = await fetch(
        `/api/workspace/members?workspaceId=${workspaceId}&targetUserId=${targetRemoveMember.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : "",
          },
        }
      );

      if (res.ok) {
        toast.success("已成功将该成员移出工作空间");
        loadTabMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "移出失败");
      }
    } catch (error: any) {
      toast.error(error.message || "移出失败，请稍后重试");
    } finally {
      setShowMemberRemoveConfirm(false);
      setTargetRemoveMember(null);
    }
  };

  const handleTabChangeRole = async (targetUserId: string, newRole: string) => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        body: JSON.stringify({
          workspaceId,
          targetUserId,
          newRole,
        }),
      });

      if (res.ok) {
        toast.success("成员角色调整成功");
        loadTabMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "调整角色失败");
      }
    } catch (error: any) {
      toast.error(error.message || "操作失败，只有所有者有权调整成员角色");
    }
  };

  const loadSettingsWorkspaceInfo = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setSettingsLoading(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/update?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspaceInfo(data.workspace);
        }
      }
    } catch (error) {
      console.error("加载设置失败", error);
    } finally {
      setSettingsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (activeTab === "settings" && workspaceId) {
      loadSettingsWorkspaceInfo();
    }
  }, [activeTab, workspaceId, loadSettingsWorkspaceInfo]);

  const handleSettingsInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setWorkspaceInfo((prev: any) => ({ ...prev, [name]: value }));
    if (settingsErrors[name] !== undefined) {
      setSettingsErrors((prev: any) => ({ ...prev, [name]: false }));
    }
  };

  const handleSettingsLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    try {
      setLogoUploading(true);
      const authToken = getAuthToken();
      const formData = new FormData();
      formData.append("icon", file);

      const res = await fetch("/api/workspace/upload-icon", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.iconUrl) {
          setWorkspaceInfo((prev: any) => ({ ...prev, logo: data.iconUrl }));
          toast.success("空间图标上传成功，请点击下方 “保存空间修改” 按钮生效");
        }
      } else {
        const err = await res.json();
        throw new Error(err.message || "上传图标失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "上传图标失败，请重试");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const nameValid = !!workspaceInfo.name?.trim();
    const emailValid = !workspaceInfo.contactEmail?.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workspaceInfo.contactEmail.trim());
    const phoneValid = !workspaceInfo.contactPhone?.trim() || /^1[3-9]\d{9}$/.test(workspaceInfo.contactPhone.trim());

    setSettingsErrors({
      name: !nameValid,
      contactEmail: !emailValid,
      contactPhone: !phoneValid,
    });

    if (!nameValid) {
      toast.error("空间名称为必填项");
      return;
    }
    if (!emailValid) {
      toast.error("请输入正确的电子邮箱格式");
      return;
    }
    if (!phoneValid) {
      toast.error("请输入正确的 11 位手机号码");
      return;
    }

    try {
      setSavingSettings(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/update?workspaceId=${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(workspaceInfo),
      });

      if (res.ok) {
        toast.success("空间设置保存成功");
        setWorkspaceName(workspaceInfo.name); // 同步刷新头部空间名
        setUserState((prev) => ({
          ...prev,
          workspaces: prev.workspaces.map((ws) =>
            ws.id === workspaceId ? { ...ws, name: workspaceInfo.name } : ws
          ),
        }));
      } else {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }
    } catch (error: any) {
      console.error("保存失败:", error);
      toast.error(error.message || "保存失败，请重试");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearSettingsData = async () => {
    if (clearConfirmText !== "确认重置") {
      toast.error("请输入 '确认重置' 以确认操作");
      return;
    }

    try {
      setClearing(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/clear-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ workspaceId, confirmText: "确认重置" }),
      });

      if (res.ok) {
        toast.success("空间核心数据、任务历史与归档文档已全量重置");
        // 清理本地渲染的运行时内存 State
        setRecentTasks([]);
        setAssets([]);
        setKnowledges([]);
        setShowClearConfirm(false);
        setClearConfirmText("");
        setActiveTab("overview"); // 自动回到总览
      } else {
        const err = await res.json();
        throw new Error(err.error || "重置数据失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "清空数据失败，请重试");
    } finally {
      setClearing(false);
    }
  };

  const handleDeactivateSettingsWorkspace = async () => {
    if (deleteConfirmText !== "确认停用") {
      toast.error("请输入 '确认停用' 以确认操作");
      return;
    }

    try {
      setDeletingSettings(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ workspaceId, action: "DEACTIVATE" }),
      });

      if (res.ok) {
        toast.success("工作空间已成功注销停用，正在返回空间中枢...");
        setShowDeleteConfirm(false);
        setDeleteConfirmText("");
        setTimeout(() => {
          router.push("/workspace-hub");
        }, 1000);
      } else {
        const err = await res.json();
        throw new Error(err.error || "停用空间失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "停用空间失败，请重试");
    } finally {
      setDeletingSettings(false);
    }
  };

  useEffect(() => {
    setHasMounted(true);
    const handleClickOutside = (event: MouseEvent) => {
      if (spaceManagementDropdownRef.current && !spaceManagementDropdownRef.current.contains(event.target as Node)) {
        setShowSpaceManagementDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 提取稳定原始 paramId 字符串
  const paramIdRaw = params?.id;
  const currentWorkspaceParamId = Array.isArray(paramIdRaw)
    ? paramIdRaw[0]
    : (paramIdRaw as string | undefined);

  const loadWorkspace = useCallback(async (id: string) => {
    if (!id) return;
    if (initializedWsIdRef.current === id || isInitializingRef.current) {
      console.log(`[WorkspaceLayout] 空间 ${id} 已处于挂载或正在初始化状态，跳过重复触发`);
      return;
    }
    isInitializingRef.current = true;
    const startTime = Date.now();
    console.log(`[WorkspaceLayout] 开始请求初始化空间: ${id}`);

    // 加载超时兜底：防止 /api/workspace/list 等请求挂起时 isInitializingRef 永久为 true，
    // 导致后续所有加载被守卫拦截、页面永远卡在 loading 转圈（"卡住无法进入空间"）。
    const initTimeout = setTimeout(() => {
      if (isInitializingRef.current) {
        console.warn(`[WorkspaceLayout] 空间 ${id} 加载超时（12s），强制解除阻塞并提示重试`);
        isInitializingRef.current = false;
        setLoadState("error");
        setLoading(false);
        setErrorMessage("工作空间加载超时，可能是网络波动或鉴权链路较慢。请点击下方按钮重新重试。");
      }
    }, 12000);

    try {
      setLoadState("loading");
      setLoading(true);
      setErrorMessage("");
      setAuthData(null);

      // 切换/重新加载空间时立即重置所有空间级展示数据，杜绝旧空间数据残留：
      // 任务列表采用"合并"写入（setRecentTasks(prev => [...new, ...prev])），
      // 若不清空，SPA 导航复用组件实例时旧空间任务会与新空间任务混在一起；
      // 其余数据同样先清空再重新加载，避免新数据返回前误展示旧空间内容。
      resetWorkspaceData(); // 同步清空全局空间装配数据（浏览器前进/后退场景 currentWorkspaceId 不变，仅靠 AppContext effect 不会清空）
      setRecentTasks([]);
      setResults([]);
      setAssets([]);
      setAssetsLoading(true);
      setAssetsError("");
      setApiDocuments(null);
      setKnowledges([]);
      setWorkspaceToken(0);
      setRestrictedComponentIds([]);
      setComponentStates({});
      setCustomPositions([]);
      setNewBoundComp(null);
      setShowNewBoundBanner(false);
      setQuickSelectedCompId("");
      setQuickSubStep("select");
      setQuickInputMaterial("");

      const authToken = getAuthToken();
      // 携带 workspaceId 供服务端记录"最近访问空间"，使 refreshUserState 返回的 currentWorkspaceId
      // 与用户实际所在空间一致（避免进入空间后 lastWorkspaceId 停留在过期空间导致 bound 数据被覆盖）
      const res = await fetch(`/api/workspace/list?workspaceId=${encodeURIComponent(id)}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include"
      });

      console.log(`[WorkspaceLayout] /api/workspace/list 响应 status: ${res.status}, 耗时: ${Date.now() - startTime}ms`);

      if (res.status === 401) {
        console.warn("[WorkspaceLayout] 鉴权失败 (401)，触发向登录页重定向");
        setLoadState("redirecting");
        setLoading(false);
        setAuthData(null);
        toast.error("登录状态已失效，正在返回登录页...", 2000);

        const redirectUrl = `/auth/login?redirect=${encodeURIComponent(`/workspace/${id}`)}`;
        router.replace(redirectUrl);
        return;
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[WorkspaceLayout] /api/workspace/list 请求失败 (${res.status}):`, errorText);
        setLoadState("error");
        setLoading(false);
        setErrorMessage(
          res.status === 403
            ? "您没有访问该工作空间的权限"
            : res.status === 404
            ? "目标工作空间不存在"
            : `加载工作空间失败 (${res.status})`
        );
        return;
      }

      const data = await res.json();
      const workspace = data.workspaces?.find((w: any) => w.id === id);

      if (!workspace) {
        console.warn(`[WorkspaceLayout] 在用户空间列表中未搜寻到空间 ${id}`);
        setLoadState("error");
        setLoading(false);
        setErrorMessage("目标工作空间不存在，或您已被管理员从成员列表中移除");
        return;
      }

      // 核心基础数据填充
      setWorkspaceId(id);
      setWorkspaceName(workspace.name);
      setWorkspaceType(workspace.type);

      const getNormalizedRole = (role: string): "Owner" | "Admin" | "ComponentManager" | "KnowledgeManager" | "Member" => {
        if (!role) return "Member";
        const upper = role.toUpperCase().replace(/_/g, "");
        if (upper === "OWNER") return "Owner";
        if (upper === "ADMIN") return "Admin";
        if (upper === "COMPONENTMANAGER" || upper === "COMPONENTADMIN") return "ComponentManager";
        if (upper === "KNOWLEDGEMANAGER" || upper === "KNOWLEDGEADMIN") return "KnowledgeManager";
        return "Member";
      };
      setUserRole(getNormalizedRole(workspace.role));

      setUserState(prev => ({ ...prev, currentWorkspaceId: id }));

      setAuthData({
        workspaceType: workspace.type,
        userRole: workspace.role || "MEMBER",
        membershipLevel: "FREE",
        allowedComponentIds: []
      });

      initializedWsIdRef.current = id;

      // 核心工作台解锁！立即把状态切为 ready，解封全局遮罩！
      setLoadState("ready");
      setLoading(false);
      console.log(`[WorkspaceLayout] 核心空间契约已成功 Ready，解封主操作台，耗时: ${Date.now() - startTime}ms`);

      // 辅助请求全面采用 Promise.allSettled 独立非阻塞异步并发加载
      (async () => {
        const auxStartTime = Date.now();
        setAssetsLoading(true);
        await Promise.allSettled([
          // 辅助 1: 用户 Profile
          fetch("/api/user/profile", {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include",
          }).then(async r => {
            if (r.ok) {
              const pData = await r.json();
              if (pData.success && pData.data?.membershipLevel) {
                setAuthData(prev => prev ? { ...prev, membershipLevel: pData.data.membershipLevel } : null);
              }
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取会员等级失败", e)),

          // 辅助 2: 静默组件绑定刷新 (带 8s 超时防死锁)
          refreshBoundComponents(id).catch(e => console.warn("[WorkspaceLayout] 静默组件绑定刷新失败", e)),

          // 辅助 3: 静默受限组件列表
          fetch(`/api/studio?action=restricted&workspaceId=${id}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include",
          }).then(async r => {
            if (r.ok) {
              const rData = await r.json();
              if (rData.success) setRestrictedComponentIds(rData.data || []);
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取受限组件失败", e)),

          // 辅助 4: 配额余额
          fetch("/api/user/workspace-hub/quota", {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (r.ok) {
              const qData = await r.json();
              const wsData = qData.data?.workspaces?.find((w: any) => w.id === id);
              if (wsData?.quota) setWorkspaceToken(Number(wsData.quota.tokenBalance));
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取空间配额失败", e)),

          // 辅助 5: 历史任务
          fetch(`/api/studio?action=tasks&workspaceId=${id}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (r.ok) {
              const tasksJson = await r.json();
              const rawTaskList = tasksJson.data || tasksJson.tasks || [];
              const backendTasks: TaskRecord[] = rawTaskList.map((t: any) => {
                // componenttask 原始字段：name（任务名）、type（组件ID）、config.tokenCost（真实消耗）、result.outputData（结果数据）
                const catalogComp = allComponents.find((c: any) => c.id === t.type);
                return {
                  id: t.id,
                  name: t.name || t.taskName || "未命名任务",
                  componentId: t.type || "",
                  componentName: t.componentName || catalogComp?.title || "",
                  tokenUsed: t.config && t.config.tokenCost ? Number(t.config.tokenCost) : t.tokens || 0,
                  status: normalizeTaskStatus(t.status),
                  time: t.createdAt,
                  outputData: t.result?.outputData
                };
              });
              setRecentTasks(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const merged = [...backendTasks.filter(b => !existingIds.has(b.id)), ...prev];
                return merged;
              });
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取历史任务失败", e)),

          // 辅助 6: 空间文档（父布局作为唯一数据源，子 Tab 通过 props 获取）
          // 加载成功后转换为资料列表展示，失败时进入显式错误态，绝不伪造空数据
          fetch(`/api/studio?action=documents&workspaceId=${id}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (!r.ok) {
              setAssetsError("资料加载失败，请稍后刷新重试");
              return;
            }
            const dJson = await r.json();
            if (dJson.success && Array.isArray(dJson.data)) {
              setApiDocuments(dJson.data);
              setAssets(dJson.data.map((doc: any) => ({
                id: doc.id,
                title: doc.title,
                size: `${Math.max(1, Math.ceil(((doc.content || "").length || 1) / 1024))} KB`,
                type: (doc.type || "doc").toUpperCase(),
                time: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—",
                content: doc.content || "",
              })));
              setAssetsError("");
            } else {
              setAssetsError("资料加载失败：返回数据格式异常");
            }
          }).catch(e => {
            console.warn("[WorkspaceLayout] 拉取空间文档失败", e);
            setAssetsError("资料加载失败，请检查网络后重试");
          }).finally(() => setAssetsLoading(false)),

          // 辅助 7: 空间知识库（含待审核状态，管理角色可见）
          fetch(`/api/studio?action=knowledges&workspaceId=${id}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (r.ok) {
              const kJson = await r.json();
              if (kJson.success && Array.isArray(kJson.data)) {
                setKnowledges(kJson.data.map((k: any) => ({
                  id: k.id,
                  title: k.title,
                  sourceComponent: k.componentId && k.componentName
                    ? `${k.componentId} ${k.componentName}`
                    : (k.sourceTaskId || k.title),
                  sourceTaskId: k.sourceTaskId || undefined,
                  sourceTaskName: k.sourceTaskName || undefined,
                  componentId: k.componentId || undefined,
                  componentName: k.componentName || undefined,
                  componentCategory: k.componentCategory || undefined,
                  time: k.createdAt ? new Date(k.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—",
                  status: k.status === "APPROVED" ? "APPROVED" : "PENDING",
                })));
              }
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取空间知识库失败", e))
        ]);
        console.log(`[WorkspaceLayout] 空间 ${id} 辅助非阻塞任务静默完毕，耗时: ${Date.now() - auxStartTime}ms`);
      })();

    } catch (e: any) {
      console.error("[WorkspaceLayout] 初始化过程出现致命异常:", e);
      setLoadState("error");
      setLoading(false);
      setErrorMessage(e.message || "加载工作空间时发生网络或逻辑异常");
    } finally {
      if (initTimeout) clearTimeout(initTimeout);
      isInitializingRef.current = false;
    }
  }, [refreshBoundComponents, resetWorkspaceData, router, toast, setUserState]);

  useEffect(() => {
    let targetId = currentWorkspaceParamId || "";
    if (!targetId && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith("/workspace/")) {
        const parts = currentPath.split("/");
        if (parts[2]) {
          targetId = parts[2].split("?")[0];
        }
      }
    }

    if (targetId) {
      // 哨兵防线：已完成或正在初始化当前 ID 空间时，坚决切断重复触发，彻底解决死循环请求
      if (initializedWsIdRef.current === targetId || isInitializingRef.current) {
        return;
      }
      setWorkspaceId(targetId);
      loadWorkspace(targetId);
    } else {
      const timer = setTimeout(() => {
        setLoading(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentWorkspaceParamId, loadWorkspace]);

  useEffect(() => {
    if (workspaceId) {
      loadComponentStates();
    }
    const handleWsCompUpdate = (e: any) => {
      const targetWsId = e?.detail?.workspaceId;
      if (!targetWsId || targetWsId === workspaceId) {
        console.log("[WorkspaceLayout] 捕获全网组件绑定变更广播，自动刷新当前空间绑定契约...");
        refreshBoundComponents(workspaceId);
        loadComponentStates();
      }
    };
    window.addEventListener("zhige_workspace_components_updated", handleWsCompUpdate);
    return () => {
      window.removeEventListener("zhige_workspace_components_updated", handleWsCompUpdate);
    };
  }, [workspaceId, refreshBoundComponents]);

  // 监听新绑定的组件参数以弹出 Banner 提示和自聚焦
  useEffect(() => {
    const newBoundId = searchParams.get("newBoundComponentId");
    if (newBoundId) {
      const comp = componentCatalog.find(c => c.id === newBoundId);
      if (comp) {
        setNewBoundComp(comp);
        setShowNewBoundBanner(true);

        // 自动定位到“组件” Tab
        setActiveTab("components");
        const stageId = categoryToStageId[comp.category];
        if (stageId) {
          setSelectedStageId(stageId);
        }

        // 启动一分钟自动消失的定时器
        if (bannerTimeoutRef.current) {
          clearTimeout(bannerTimeoutRef.current);
        }
        bannerTimeoutRef.current = setTimeout(() => {
          setShowNewBoundBanner(false);
        }, 60000);
      }
    }
    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
    };
  }, [searchParams]);

  // 监听路由参数中的 tab 字段以自动聚焦特定选项卡 (如从空间中枢直达设置 Tab)
  useEffect(() => {
    const targetTab = searchParams.get("tab");
    if (targetTab) {
      setActiveTab(targetTab);
    }
  }, [searchParams]);

  // 立即使用交互逻辑
  const handleUseNewBoundComp = () => {
    if (!newBoundComp) return;
    setShowNewBoundBanner(false);
    
    // 自动切换 Tab 到快速自动化，并把对应组件载入
    addRecentUsed(newBoundComp.id, workspaceId);
    setActiveTab("quick");
    setQuickSelectedCompId(newBoundComp.id);
    setQuickSubStep("material");
    toast.success(`已成功装载组件 [${newBoundComp.name}] 到快速通道！`);
  };

  const handleGoBack = () => {
    if (pathname === `/workspace/${workspaceId}`) {
      router.push("/workspace-hub");
    } else {
      router.push(`/workspace/${workspaceId}`);
    }
  };

  const handleSwitchWorkspace = (targetId: string) => {
    if (targetId === workspaceId) {
      setShowSpaceManagementDropdown(false);
      return;
    }
    toast.info("正在切换工作空间...");
    // 同步清空旧空间的所有空间级全局数据（已装配组件列表等），
    // 与 setUserState 同一批更新：整页跳转完成前旧页面立即不再展示旧空间数据
    resetWorkspaceData();
    setUserState((prev) => ({
      ...prev,
      currentWorkspaceId: targetId,
      workspaces: prev.workspaces.map((ws) => ({ ...ws, isCurrent: ws.id === targetId })),
    }));
    setShowSpaceManagementDropdown(false);
    window.location.href = `/workspace/${targetId}`;
  };

  // 空间归属校验：全局 boundComponentIds 仅当属于当前工作空间时才使用，否则一律视为空。
  // 切换空间瞬间旧空间的装配数据可能仍残留于全局状态，归属不匹配时按空处理，
  // 杜绝总览"已装配组件数"先显示旧空间数据、再跳变到新空间数据的闪烁问题。
  const effectiveBoundComponentIds = boundComponentsWorkspaceId === workspaceId ? boundComponentIds : [];

  // 严格以当前工作空间在数据库中真实装配的组件为基准（保证空间枢纽与工作台内 100% 同步隔离）
  const allowedComponentIds = Array.from(new Set([...effectiveBoundComponentIds, ...(newBoundComponentId ? [newBoundComponentId] : [])]));

  const hasComponentPermission = (componentId: string) => allowedComponentIds.includes(componentId);

  const handleComponentClick = (comp: ZhiGeComponent) => {
    if (!hasComponentPermission(comp.id)) {
      if (authData?.workspaceType === "PERSONAL") {
        toast.error("该组件为高阶功能，请升级当前空间包以解锁使用");
        setShowUpgradeModal(true);
      } else {
        toast.error("越权警告：您的角色权限不支持此组件的执行授权");
      }
      return;
    }
    addRecentUsed(comp.id, workspaceId);
    setActiveTab("quick");
    setQuickSelectedCompId(comp.id);
    setQuickSubStep("material");
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已成功复制处理成果 Markdown 到剪贴板！");
  };

  // 自动化执行处理 (校验状态机)
  const handleExecuteSimulation = async () => {
    if (!quickSelectedCompId) {
      toast.error("请先在列表中选定要调用的效能组件！");
      return;
    }
    if (!quickInputMaterial.trim()) {
      toast.error("请输入要进行格式分析的原始研发文本材料！");
      return;
    }
    const isPremium = componentCatalog.find(c => c.id === quickSelectedCompId)?.isPremium;
    if (workspaceType === "ENTERPRISE" && isPremium && restrictedComponentIds.includes(quickSelectedCompId)) {
      toast.error("执行拦截：当前用户岗位受矩阵规则限制，无法执行该受保护组件！");
      return;
    }
    if (workspaceType === "ENTERPRISE" && workspaceToken < 15) {
      toast.error("执行拦截：当前空间剩余服务调用额度不足，请联系空间管理员！");
      return;
    }

    setIsExecutingTask(true);
    setShowConfirmRunModal(false);
    toast.info("正在处理数据，启动自动化流水线...", 2000);

    const selectedComp = componentCatalog.find(c => c.id === quickSelectedCompId);
    const taskName = `${selectedComp?.name || "效能组件"}自动化任务`;

    // 先请求后端真实执行（扣费 / 写入任务历史 / 审计闭环），成功后才更新本地状态
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "simulate",
          workspaceId,
          componentId: quickSelectedCompId,
          taskName,
          inputMaterial: quickInputMaterial,
          tokens: isPremium ? 15 : 5,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "任务执行失败，请稍后重试");
      }

      // 后端执行成功，任务 ID / 状态 / 产出结果一律使用服务端返回的真实数据。
      // 若 success=true 但缺少真实 task.id，视为接口契约错误：
      // 不插入 recentTasks、不显示任务成功，记录接口响应结构并给出明确错误提示。
      const backendTask = data.task;
      if (!backendTask || !backendTask.id) {
        console.error("[WorkspaceLayout] simulate 接口契约错误：success=true 但缺少真实 task.id，接口响应结构:", JSON.stringify(data));
        setIsExecutingTask(false);
        toast.error("任务执行成功但接口未返回任务记录（契约异常），请刷新后到结果中心查看");
        return;
      }
      const backendOutput = backendTask.outputData || backendTask.result?.outputData || null;
      const newTask: TaskRecord = {
        id: backendTask.id,
        name: backendTask.name || taskName,
        componentId: quickSelectedCompId,
        componentName: selectedComp?.name || "",
        tokenUsed: typeof backendTask.tokens === "number" ? backendTask.tokens : (isPremium ? 15 : 5),
        status: normalizeTaskStatus(backendTask.status || "SUCCESS"),
        time: backendTask.createdAt ? new Date(backendTask.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
        outputData: backendOutput,
      };

      setRecentTasks(prev => [newTask, ...prev]);
      if (typeof data.tokenBalance === "number") {
        setWorkspaceToken(data.tokenBalance);
      } else {
        setWorkspaceToken(prev => Math.max(0, prev - newTask.tokenUsed));
      }
      setSelectedTask(newTask);
      setIsExecutingTask(false);
      toast.success("数据自动化处理完毕！分析结果已生成。");
    } catch (error: any) {
      console.error("执行自动化任务失败:", error);
      setIsExecutingTask(false);
      toast.error(error.message || "任务执行失败，请联系空间管理员");
    }
  };

  // 资料导入：必须真实持久化到后端，成功后才更新本地 assets
  const handlePersistAsset = async (data: { title: string; content: string; type: string }) => {
    if (!data.title.trim() || !data.content.trim()) {
      toast.error("请填入完整的信息");
      return;
    }
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: "upload_doc",
          workspaceId,
          title: data.title,
          content: data.content,
          type: data.type,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || body.message || "资料导入失败，请稍后重试");
      }
      const doc = body.data;
      const newAsset: AssetRecord = {
        id: doc.id,
        title: doc.title,
        size: `${Math.max(1, Math.ceil(((doc.content || "").length || 1) / 1024))} KB`,
        type: (doc.type || data.type).toUpperCase(),
        time: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
        content: doc.content || "",
      };
      setAssets(prev => [newAsset, ...prev]);
      setShowImportAssetModal(false);
      toast.success("原始文件已成功作为输入材料导入空间资料库！");
    } catch (error: any) {
      console.error("资料导入失败:", error);
      toast.error(error.message || "资料导入失败，请稍后重试");
    }
  };

  const handleImportAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePersistAsset(importAssetForm);
  };

  // 知识库沉淀：真实持久化到后端（企业空间普通成员进入待审核，管理角色直接发布）
  const handleSaveToKnowledge = async (task: TaskRecord) => {
    const isExist = knowledges.find(k => k.sourceTaskId === task.id || k.title.includes(task.componentName));
    if (isExist) {
      toast.info("该自动化分析成果已提交/存入规范库，请勿重复操作");
      return;
    }
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: "save_knowledge",
          workspaceId,
          title: `${task.componentName}标准化研发规范及偏离防范SOP`,
          content: task.outputData?.summary || task.name || "",
          sourceTaskId: task.id,
          componentId: task.componentId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "知识沉淀失败，请稍后重试");
      }
      const kd = data.data;
      const resolvedComponentId = kd.componentId || task.componentId;
      const resolvedComponentName = kd.componentName || task.componentName;
      const newKnowledge: KnowledgeRecord = {
        id: kd.id,
        title: kd.title || `${task.componentName}标准化研发规范及偏离防范SOP`,
        sourceComponent: `${resolvedComponentId} ${resolvedComponentName}`,
        sourceTaskId: kd.sourceTaskId || task.id,
        sourceTaskName: kd.sourceTaskName || task.name,
        componentId: resolvedComponentId,
        componentName: resolvedComponentName,
        componentCategory: kd.componentCategory,
        time: kd.createdAt ? new Date(kd.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
        status: kd.status === "APPROVED" ? "APPROVED" : "PENDING"
      };
      setKnowledges(prev => [newKnowledge, ...prev]);
      if (kd.status === "APPROVED") {
        toast.success("规范库沉淀归档成功！已直接更新。");
      } else {
        toast.success("提交成功！已向规范库管理员发起归档审批流申请。");
      }
    } catch (error: any) {
      console.error("知识沉淀失败:", error);
      toast.error(error.message || "知识沉淀失败，请联系空间管理员");
    }
  };

  // 知识库审核：仅 KNOWLEDGE_MANAGER / ADMIN / OWNER 可通过或驳回待审核沉淀
  const handleReviewKnowledge = async (knowledgeId: string, approve: boolean) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "review_knowledge", workspaceId, knowledgeId, approve }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "审核操作失败，请稍后重试");
      }
      const rd = data.data;
      if (approve) {
        setKnowledges(prev => prev.map(k => k.id === rd.id ? { ...k, status: "APPROVED" } : k));
      } else {
        setKnowledges(prev => prev.filter(k => k.id !== rd.id));
      }
      toast.success(approve ? "已通过该知识沉淀审核并发布至规范库！" : "已驳回该知识沉淀申请。");
    } catch (error: any) {
      console.error("知识审核失败:", error);
      toast.error(error.message || "审核操作失败，请联系空间管理员");
    }
  };

  // 补齐结果预览与 AI 助手相关的方法
  const openStructurePreview = (task: TaskRecord) => {
    setSelectedTask(task);
  };

  const handleQuickStartSubmit = () => {
    handleExecuteSimulation();
  };

  const handleAIAssist = () => {
    if (!aiQuery.trim()) {
      toast.error("请输入您的任务诉求！");
      return;
    }
    const query = aiQuery.toLowerCase();
    const matched = componentCatalog.find(c => 
      c.name.toLowerCase().includes(query) || 
      c.description.toLowerCase().includes(query)
    );
    if (matched) {
      setAiMatchedComponent({
        id: matched.id,
        title: matched.name,
        stageId: categoryToStageId[matched.category],
        path: `/workspace/${workspaceId}/studio?compId=${matched.id}`,
        icon: "⚙️"
      });
      toast.success("已成功自动定位并匹配效能组件！");
    } else {
      setAiMatchedComponent(null);
      toast.info("未能自动识别到高度匹配的组件，建议手动选择。");
    }
  };

  // ------------------ 动态右侧侧栏联动求值 (全局统筹美化) ------------------
  const renderRightPanel = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 计费/点数配额卡片 */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-[#3182ce]" /> 服务调用配额</span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">实时更新</span>
              </h4>
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold">当前可用点数</span>
                  <span className="text-slate-900 font-mono font-black">
                    {workspaceType === "PERSONAL" ? "无配额限制" : `${workspaceToken.toLocaleString()} 点`}
                  </span>
                </div>
                {workspaceType === "ENTERPRISE" && (
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-[#3182ce] to-[#10b981] h-full transition-all duration-500" style={{ width: `${Math.min(100, (workspaceToken / 20000) * 100)}%` }} />
                  </div>
                )}
                {workspaceType === "ENTERPRISE" && workspaceToken < 1000 && (
                  <p className="text-[11px] text-red-500 font-bold bg-red-50 p-2 rounded-lg border border-red-100">⚠️ 可用额度不足 1,000 点，请及时补充</p>
                )}
              </div>
              <button onClick={handleUpgradeClick} className="w-full h-9 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-xs font-black rounded-lg shadow-xs hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1.5">
                <span>💎 升级套餐 / 购买配额</span>
              </button>
            </div>

            {/* 常规快捷工作入口 */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> 快捷功能入口
              </h4>
              <div className="space-y-2 text-xs font-bold">
                <button onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="w-full text-left p-2.5 rounded-lg border border-slate-200/80 hover:border-[#3182ce]/40 hover:bg-blue-50/30 flex justify-between items-center text-slate-700 hover:text-[#3182ce] transition-all cursor-pointer">
                  <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-blue-500" /> 快速发起处理任务</span> <span>➔</span>
                </button>
                <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full text-left p-2.5 rounded-lg border border-slate-200/80 hover:border-[#3182ce]/40 hover:bg-blue-50/30 flex justify-between items-center text-slate-700 hover:text-[#3182ce] transition-all cursor-pointer">
                  <span className="flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-emerald-500" /> 导入原始文档资料</span> <span>➔</span>
                </button>
              </div>
            </div>
          </div>
        );

      case "quick":
        const selectedComp = componentCatalog.find(c => c.id === quickSelectedCompId);
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" /> 任务前置条件校验
            </h4>
            <div className="space-y-3 text-xs font-bold text-slate-600">
              <div className="flex justify-between items-center">
                <span>目标组件选择</span>
                <span className={`font-mono text-[11px] px-2 py-0.5 rounded ${quickSelectedCompId ? "text-[#2b6cb0] bg-blue-50 border border-blue-100" : "text-red-600 bg-red-50 border border-red-100"}`}>
                  {quickSelectedCompId ? `[已选 ${quickSelectedCompId}]` : "✕ 未选择"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>源材料输入 <span className="text-red-500">*</span></span>
                <span className={`font-bold text-[11px] px-2 py-0.5 rounded ${quickInputMaterial.trim() ? "text-emerald-600 bg-emerald-50 border border-emerald-100" : "text-red-600 bg-red-50 border border-red-100"}`}>
                  {quickInputMaterial.trim() ? "✔ 已就绪" : "✕ 未输入"}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-2.5">
                <span>预估扣减点数</span>
                <span className="text-[#3182ce] font-mono text-xs font-black">
                  {quickSelectedCompId && selectedComp?.isPremium ? "15 点" : "5 点"}
                </span>
              </div>
            </div>
            {quickSelectedCompId && (
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed space-y-1 text-left">
                <p>💡 <span className="text-slate-800 font-bold">输入规格</span>: {selectedComp?.previewData?.inputMock || "粘贴对应研发文本"}</p>
                <p>📋 <span className="text-slate-800 font-bold">产出说明</span>: {selectedComp?.previewData?.outputMock || "导出架构偏离报告或代码"}</p>
              </div>
            )}
          </div>
        );

      case "components":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#3182ce]" /> 组件装配说明
            </h4>
            <div className="text-xs font-medium text-slate-600 space-y-2.5 leading-relaxed">
              <p>• <span className="text-slate-900 font-bold">已装配组件</span> 即当前工作空间拥有的自动化工具链线。</p>
              <p>• <span className="text-slate-900 font-bold">授权保护</span> 企业空间遵循岗位安全授权矩阵，不同角色对应不同的运行权限。</p>
            </div>
            <button onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)} className="w-full h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-lg shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <span>🧩 挑选并装配新组件</span>
            </button>
          </div>
        );

      case "tasks":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 任务流水概览
            </h4>
            <div className="space-y-3 text-xs font-bold text-slate-600">
              <div className="flex justify-between items-center">
                <span>历史执行总数</span>
                <span className="text-slate-900 font-mono font-black">{recentTasks.length} 次</span>
              </div>
              <div className="flex justify-between items-center">
                <span>处理成功率</span>
                <span className="text-emerald-600 font-mono font-black">
                  {recentTasks.length ? `${Math.round((recentTasks.filter(t => t.status === "SUCCESS").length / recentTasks.length) * 100)}%` : "0%"}
                </span>
              </div>
            </div>
          </div>
        );

      case "assets":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-600" /> 资料容量说明
            </h4>
            <div className="space-y-3 text-xs font-bold text-slate-600">
              <div className="flex justify-between items-center">
                <span>已用沙箱存储</span>
                <span className="text-slate-900 font-mono font-black">1.6 MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span>支持文件格式</span>
                <span className="text-slate-800 font-bold">PDF, TXT, MD, DOCX</span>
              </div>
            </div>
            <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-lg shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <span>📥 导入新资产文件</span>
            </button>
          </div>
        );

      case "results":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <div>
              <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" /> 成果导出中心
              </h3>
              <p className="text-[11px] text-slate-500 mt-2 font-semibold leading-relaxed">此处保存了历次自动化工具运行成功生成的报告与代码规范，支持预览与下载。</p>
            </div>
            {results.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold py-3 text-center">暂无成果报告可导出。</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {results.map(res => {
                  const resCompName = recentTasks.find(t => t.componentId === res.componentId)?.componentName || "";
                  return (
                    <div key={res.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60 flex justify-between items-center text-xs font-bold">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 truncate block text-xs">[{res.componentId}] {resCompName && `${resCompName} · `}{res.title}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">{res.time}</span>
                      </div>
                      <button onClick={() => {
                        const targetTask = recentTasks.find(t => t.componentId === res.componentId);
                        if (targetTask) setSelectedTask(targetTask);
                      }} className="text-xs text-[#3182ce] hover:underline font-black shrink-0">
                        预览
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "knowledge":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> 团队 SOP 规范归档
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed text-left">
              在任务成果中心可将规范标准一键沉淀至知识库中，形成规范体系。
            </div>
          </div>
        );

      case "members":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-600" /> 协同成员管理指南
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed">
              企业空间支持多角色研发协同（所有者、管理员、开发者等），可自由分配职责。
            </div>
          </div>
        );

      case "permissions":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-red-500" /> 授权矩阵安全策略
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed">
              基于岗位定义组件执行权限，可防止非授权角色误触发高算力消耗组件。
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs text-left space-y-3.5 animate-in fade-in duration-200">
            <h3 className="text-xs font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-blue-600" /> 空间算力大盘指南
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed">
              这里是调用分析快速统计面板，详细费用与转化明细可切换大盘页。
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
              空间日常运维说明
            </h3>
            <div className="space-y-2.5 text-xs font-medium text-slate-600">
              <div className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors">
                <span className="font-bold">更改显示名称</span>
                <button onClick={() => router.push(`/workspace/${workspaceId}/settings`)} className="text-[#3182ce] hover:underline font-bold">前往 ➔</button>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors">
                <span className="font-bold">配置关联组件</span>
                <button onClick={() => router.push(`/workspace/${workspaceId}/settings`)} className="text-[#3182ce] hover:underline font-bold">配置 ➔</button>
              </div>
              {workspaceType === "PERSONAL" && (
                <div className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 border-t border-slate-100 text-slate-700 pt-3">
                  <span className="text-amber-600 font-bold">👑 升级为企业协同空间</span>
                  <button onClick={handleUpgradeClick} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer">立即升级</button>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // 12 个子页面的核心业务价值与作用说明字典
  const TAB_HERO_META: Record<string, { title: string; subtitle: string; icon: React.ReactNode; tagText: string }> = {
    overview: {
      title: "工作空间全景总览",
      subtitle: "聚合当前空间的自动化任务流水、可用算力配额、已装配工具与多维指标，提供全流程研发效能的总控视角。",
      icon: <Layout className="w-4 h-4 text-[#3182ce]" />,
      tagText: "全景仪表盘"
    },
    quick: {
      title: "快速自动化任务中心",
      subtitle: "支持上传本地文档（PDF/Word/JSON等）、粘贴源码或自然语言识别，一键提交源材料并快速发起自动化处理与架构检测。",
      icon: <Play className="w-4 h-4 text-amber-500" />,
      tagText: "核心操作流"
    },
    components: {
      title: "研发效能组件大厅",
      subtitle: "管理当前工作空间已装配的自动化组件大纲，提供组件的离线卸载、岗位运行权限保护与新组件的挑选装配。",
      icon: <Layers className="w-4 h-4 text-[#3182ce]" />,
      tagText: "工具链管理"
    },
    stats: {
      title: "结构与研发效能大盘",
      subtitle: "分析空间内全流程 10 大阶段工具覆盖分布结构、计算自动化节省的研发工时，并实时监控项目执行成功率。",
      icon: <BarChart2 className="w-4 h-4 text-blue-600" />,
      tagText: "效能量化"
    },
    tasks: {
      title: "自动化任务流水看板",
      subtitle: "全量监控历次任务的运行状态、执行耗时与处理进度，提供失败重试、日志排查与一键导出任务报告能力。",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
      tagText: "任务监控"
    },
    assets: {
      title: "空间原始资料与文档库",
      subtitle: "安全存储用于自动化处理的原始招标文件、需求 PRD、接口 JSON 与源码文件，作为工具处理的标准化输入源。",
      icon: <Database className="w-4 h-4 text-blue-600" />,
      tagText: "源材料归档"
    },
    results: {
      title: "成果预览与导出中心",
      subtitle: "归档历次自动化工具处理成功后生成的偏离报告、架构契约与代码产物，支持在线实时预览、离线下载与 SOP 入库。",
      icon: <FileText className="w-4 h-4 text-emerald-600" />,
      tagText: "产物下发"
    },
    knowledge: {
      title: "团队 SOP 与规约知识库",
      subtitle: "沉淀团队架构规范、代码避坑指南与研发 SOP，让大团队形成统一的开发审核标准，大幅减少重复踩坑。",
      icon: <BookOpen className="w-4 h-4 text-indigo-600" />,
      tagText: "规约沉淀"
    },
    members: {
      title: "团队协同与角色管理",
      subtitle: "管理工作空间协同成员、分配岗位角色（所有者/管理员/开发者），建立企业级敏捷团队安全协同防线。",
      icon: <Users className="w-4 h-4 text-emerald-600" />,
      tagText: "团队权限"
    },
    permissions: {
      title: "岗位组件权限配置矩阵",
      subtitle: "按岗位职责（如项目经理、架构师、前端/后端、测试）精细化控制各组件的调度使用权限，保障敏捷开发协同安全。",
      icon: <ShieldCheck className="w-4 h-4 text-red-500" />,
      tagText: "团队安全"
    },
    logs: {
      title: "空间操作审计与变更日志",
      subtitle: "本模块透明化记录工作空间内的每一次组件装配、成员角色变更、配置修改与资产操作。所有关键行为均具备明确的时间戳与操作人记录，保障企业级研发数据合规与追溯。",
      icon: <FileText className="w-4 h-4 text-slate-700" />,
      tagText: "数据合规追溯"
    },
    settings: {
      title: "工作空间基本与高级配置",
      subtitle: "本模块管理工作空间的基本名称、项目描述与空间 Logo 徽章图标。同时提供数据自愈与高危空间注销等全生命周期管理功能。",
      icon: <Settings className="w-4 h-4 text-slate-700" />,
      tagText: "全生命周期设置"
    }
  };

  const renderTabContent = () => {
    const heroMeta = TAB_HERO_META[activeTab];
    const renderHeroBanner = () => {
      // 拥有内层专属融合 Header 的 Tab 决不在外层二次重复渲染
      const tabsWithCustomHeader = ["overview", "quick", "stats", "members", "permissions", "logs"];
      if (!heroMeta || tabsWithCustomHeader.includes(activeTab)) return null;
      return (
        <div className="bg-gradient-to-r from-blue-50/80 via-slate-50/50 to-white p-4.5 rounded-xl border border-blue-100/70 shadow-2xs text-left mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs shrink-0 mt-0.5 sm:mt-0">
              {heroMeta.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">{heroMeta.title}</h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100/80">{heroMeta.tagText}</span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">{heroMeta.subtitle}</p>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        {renderHeroBanner()}
        {(() => {
          switch (activeTab) {
            case "overview":
        return (
          <OverviewTab
            workspaceId={workspaceId}
            boundComponentIds={effectiveBoundComponentIds}
            recentTasks={recentTasks}
            assets={assets}
            knowledges={knowledges}
            documents={apiDocuments}
            allowedComponentIds={allowedComponentIds}
            allComponents={allComponents}
            setActiveTab={setActiveTab}
            setQuickSubStep={setQuickSubStep}
            handleComponentClick={handleComponentClick}
            router={router}
          />
        );

      case "quick":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 pb-2.5 border-b border-slate-100 uppercase tracking-wider">
              <Layout className="w-4 h-4 text-[#3182ce]" /> 发起自动化任务处理
            </h3>
            
            {/* 快速任务子步骤选项卡 */}
            <div className="flex gap-2 border-b border-slate-100 pb-3">
              {[
                { key: "select", label: "路径 A: 选择组件开始" },
                { key: "material", label: "路径 B: 自动匹配组件" }
              ].map(step => (
                <button
                  key={step.key}
                  onClick={() => setQuickSubStep(step.key as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${quickSubStep === step.key ? "bg-slate-800 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200/60"}`}
                >
                  {step.label}
                </button>
              ))}
            </div>

            {quickSubStep === "select" ? (
              // 路径 A (提升表单输入框高度与呼吸感)
              <div className="space-y-4 pt-1.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">选择已装配的可用组件</label>
                  <select
                    value={quickSelectedCompId}
                    onChange={(e) => setQuickSelectedCompId(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none cursor-pointer transition-all"
                  >
                    <option value="">-- 请选择要执行的组件 --</option>
                    {allComponents
                      .filter(c => currentUserAllowedCompIds.includes(c.id) && effectiveBoundComponentIds.includes(c.id))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.id}] {c.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">提供研发源材料内容</label>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                      {[
                        { key: "text", label: "📝 文本粘贴" },
                        { key: "file", label: "📄 文件上传" },
                        { key: "asset", label: "📦 空间资料" },
                      ].map(mode => (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => setMaterialInputMode(mode.key as any)}
                          className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                            materialInputMode === mode.key
                              ? "bg-white text-[#3182ce] shadow-2xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {materialInputMode === "text" && (
                    <textarea
                      value={quickInputMaterial}
                      onChange={(e) => setQuickInputMaterial(e.target.value)}
                      placeholder="在此直接输入或粘贴招标文件、PRD需求、接口JSON或代码进行分析..."
                      className="w-full h-36 p-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none resize-none transition-all font-sans leading-relaxed"
                    />
                  )}

                  {materialInputMode === "file" && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUploadChange}
                        accept=".txt,.md,.json,.js,.ts,.py,.sql,.docx,.pdf"
                        className="hidden"
                      />
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-36 border-2 border-dashed border-slate-200 hover:border-[#3182ce] bg-slate-50/60 hover:bg-blue-50/20 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                      >
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-[#3182ce] mb-2 group-hover:scale-110 transition-all" />
                        <p className="text-xs font-black text-slate-700 group-hover:text-[#3182ce]">点击或拖拽上传本地研发文件</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">支持 .txt, .md, .json, .js, .ts, .py, .docx, .pdf 格式文件读入</p>
                      </div>
                      {uploadedFileMeta && (
                        <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg flex items-center justify-between text-xs">
                          <span className="font-bold text-[#3182ce] truncate flex items-center gap-1.5">
                            📄 挂载文件：{uploadedFileMeta.name} <span className="font-mono text-[10px] text-slate-400">({uploadedFileMeta.size})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedFileMeta(null);
                              setQuickInputMaterial("");
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="text-xs text-red-500 hover:underline font-bold cursor-pointer"
                          >
                            移除文件
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {materialInputMode === "asset" && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 min-h-[144px]">
                      {assets.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                          当前空间暂无导入资料，可先前往“资料”页上传，或使用文本与文件模式。
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                          {assets.map(asset => (
                            <div
                              key={asset.id}
                              onClick={() => {
                                setQuickInputMaterial(asset.content || asset.title);
                                toast.success(`已选择资料：[${asset.title}]`);
                              }}
                              className="p-2 bg-white border border-slate-200/80 hover:border-[#3182ce] rounded-lg text-xs font-bold text-slate-700 flex justify-between items-center cursor-pointer transition-all"
                            >
                              <span className="truncate">📄 {asset.title}</span>
                              <span className="text-[10px] text-[#3182ce] shrink-0 font-black">点击选择 ➔</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                    disableReason = "当前空间服务调用点数不足，请升级或联系管理员";
                  }

                  return (
                    <div className="space-y-3 pt-1">
                      {disableReason && (
                        <div className="text-xs font-semibold text-red-500 bg-red-50/80 p-2.5 rounded-lg border border-red-100 flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                          <span>无法执行原因：{disableReason}</span>
                        </div>
                      )}
                      <button
                        onClick={handleQuickStartSubmit}
                        disabled={!!disableReason}
                        className="w-full h-10 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm hover:shadow-md disabled:shadow-none cursor-pointer transition-all flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>发起自动化任务处理 (扣减相应调用点数)</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              // 路径 B (AI 智能匹配，优化整体间距和圆角)
              <div className="space-y-4 pt-1.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block tracking-wider uppercase">请描述您的研发任务诉求 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <textarea
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="例：我需要分析招标文件里的偏离项，或者生成PRD对应的测试脑图..."
                      className="w-full h-36 p-3 pr-20 pb-10 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-all font-sans leading-relaxed"
                    />
                    
                    {/* 工作台智能润色悬浮按钮面板 */}
                    <div className="absolute right-3 bottom-3 flex items-center gap-1.5 z-10">
                      {showRefineAiPanel ? (
                        <div className="flex gap-1.5 bg-white/95 backdrop-blur-sm p-1 rounded-lg border border-slate-200/80 shadow-md animate-in zoom-in-95 duration-150">
                          <button
                            type="button"
                            onClick={() => {
                              setAiQuery(refinedAiQuery);
                              setShowRefineAiPanel(false);
                            }}
                            className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded cursor-pointer transition-colors shadow-sm"
                          >
                            ✔ 采纳
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAiQuery(originalAiQuery);
                              setShowRefineAiPanel(false);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-black rounded cursor-pointer transition-colors"
                          >
                            ✕ 撤销
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isRefiningAi || !aiQuery.trim()}
                          onClick={async () => {
                            setIsRefiningAi(true);
                            setOriginalAiQuery(aiQuery);
                            await new Promise(resolve => setTimeout(resolve, 600)); // 智能润色模拟运算微延迟
                            const resText = getRefinedAiText(aiQuery);
                            setRefinedAiQuery(resText);
                            setAiQuery(resText);
                            setIsRefiningAi(false);
                            setShowRefineAiPanel(true);
                          }}
                          className="px-2.5 py-1 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-[10px] font-black rounded shadow-sm hover:shadow hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                        >
                          {isRefiningAi ? (
                            <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span className="inline-flex items-center gap-1"><PenLine className="w-3 h-3" /> 自动润色</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {aiMatchedComponent && (
                  <div className="bg-emerald-50/60 border border-emerald-100/50 rounded-xl p-3.5 flex items-center justify-between text-xs animate-in fade-in zoom-in-95 duration-200 text-left">
                    <div className="pr-4">
                      <span className="font-bold text-emerald-800 block text-xs">匹配成功: [{aiMatchedComponent.id}] {aiMatchedComponent.title}</span>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">算法成功定位契约转换路径</p>
                    </div>
                    <button
                      onClick={() => {
                        setQuickSelectedCompId(aiMatchedComponent.id);
                        setQuickInputMaterial(aiQuery);
                        setQuickSubStep("select");
                        toast.success("已装填组件参数，请在路径A中确认执行");
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-600 text-white font-bold rounded-lg cursor-pointer text-xs shadow-sm hover:shadow transition-all whitespace-nowrap"
                    >
                      一键装填执行
                    </button>
                  </div>
                )}
                <button
                  onClick={handleAIAssist}
                  disabled={!aiQuery.trim()}
                  className="w-full h-10 bg-slate-50 hover:bg-emerald-50/30 text-slate-600 hover:text-emerald-600 disabled:text-slate-400 text-xs font-bold rounded-lg border border-slate-200/80 hover:border-emerald-200/50 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                >
                  <HelpCircle className="w-4 h-4 text-emerald-500" />
                  <span>自动匹配推荐组件</span>
                </button>
              </div>
            )}
          </div>
        );

      case "components":
        return (
          <ComponentsTab
            workspaceId={workspaceId}
            userRole={userRole}
            workspaceType={workspaceType}
            boundComponentIds={effectiveBoundComponentIds}
            restrictedComponentIds={restrictedComponentIds}
            componentStates={componentStates}
            newBoundComponentId={newBoundComponentId}
            handleRequestUninstall={handleRequestUninstall}
            handleComponentClick={handleComponentClick}
            handleToggleComponentActive={handleToggleComponentActive}
            onNavigateToStudio={() => router.push(`/studio?workspaceId=${workspaceId}`)}
          />
        );
                          
      case "tasks":
        return (
          <TasksTab
            recentTasks={recentTasks}
            tasksFilterTab={tasksFilterTab}
            setTasksFilterTab={setTasksFilterTab}
            openStructurePreview={openStructurePreview}
            handleSaveToKnowledge={handleSaveToKnowledge}
            allComponents={allComponents}
            handleComponentClick={handleComponentClick}
            workspaceId={workspaceId}
          />
        );

      case "assets":
        const assetPageSize = 5;
        const totalAssetPages = Math.ceil(assets.length / assetPageSize) || 1;
        const currentAssetPage = Math.min(assetTabCurrentPage || 1, totalAssetPages);
        const paginatedAssets = assets.slice((currentAssetPage - 1) * assetPageSize, currentAssetPage * assetPageSize);

        return (
          <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200 font-sans">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    空间原始输入资料与文档库
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    安全存储用于自动化处理的原始招标文件、需求 PRD、接口 JSON 与源码文件，作为工具处理的标准输入源。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setImportAssetForm({ title: "", content: "", type: "input" });
                  setShowImportAssetModal(true);
                }}
                className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>导入新资料</span>
              </button>
            </div>

            {assetsLoading ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-10 animate-pulse">正在加载空间资料...</p>
            ) : assetsError ? (
              <p className="text-xs text-red-500 font-semibold text-center py-10">{assetsError}</p>
            ) : assets.length === 0 ? (
              <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-600">空间内暂无原始资料</p>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">支持格式: PDF / Markdown / Word / JSON / 代码文件。</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                  <table className="w-full text-xs text-left text-slate-500 border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-xs font-extrabold">
                        <th className="py-3.5 px-4 w-[45%]">文件名称</th>
                        <th className="py-3.5 px-3 w-[15%]">大小</th>
                        <th className="py-3.5 px-3 w-[25%]">创建时间</th>
                        <th className="py-3.5 px-4 w-[15%] text-right whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                      {paginatedAssets.map(doc => (
                        <tr key={doc.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900 truncate" title={doc.title}>{doc.title}</td>
                          <td className="py-3.5 px-3 text-slate-500 font-mono font-bold">{doc.size || "1 KB"}</td>
                          <td className="py-3.5 px-3 text-slate-600 font-mono text-[11px] font-semibold">
                            {formatTaskTime ? formatTaskTime(doc.time) : (doc.time || "近期")}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-xs whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewData({ title: doc.title, content: doc.content || "内容为空。" });
                                setShowPreviewModal(true);
                              }}
                              className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> 查阅
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 5 条/页 分页 Bar */}
                <div className="pt-3 border-t border-slate-100 px-1 shrink-0 flex items-center justify-between h-9">
                  <span className="text-[11px] text-slate-400 font-bold">
                    第 {currentAssetPage} / {totalAssetPages} 页 (共 {assets.length} 份资料，每页 5 条)
                  </span>
                  {totalAssetPages > 1 ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={currentAssetPage === 1}
                        onClick={() => setAssetTabCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        ◀ 上一页
                      </button>
                      <button
                        type="button"
                        disabled={currentAssetPage === totalAssetPages}
                        onClick={() => setAssetTabCurrentPage((p) => Math.min(totalAssetPages, p + 1))}
                        className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        下一页 ▶
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-300 font-medium font-mono">1/1 单页全量</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case "results":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
            <div className="pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-[#059669]" /> 结果中心 (已生成 analysis 报告)
              </h3>
            </div>

            {(() => {
              const successTasks = recentTasks.filter(t => t.status === "SUCCESS");
              if (successTasks.length === 0) {
                return <p className="text-xs text-slate-400 font-semibold text-center py-8">暂无任务处理的产出报告</p>;
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-500 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-xs font-bold">
                        <th className="py-3 px-4">成果物</th>
                        <th className="py-3 px-3">关联组件</th>
                        <th className="py-3 px-3">状态</th>
                        <th className="py-3 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white/40">
                      {successTasks.map(task => (
                        <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-700 truncate max-w-[200px]" title={task.name}>{task.name}</td>
                          <td className="py-3.5 px-3 text-slate-600">
                            <span className="font-mono text-slate-400">{task.componentId}</span>
                            {task.componentName && <span className="ml-1.5 font-bold text-slate-600">{task.componentName}</span>}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 bg-emerald-50/80 text-emerald-600 rounded-lg border border-emerald-100/50 text-[10px] font-bold">可导出</span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-xs">
                            <button
                              onClick={() => openStructurePreview(task)}
                              className="text-[#059669] hover:text-[#059669] hover:underline cursor-pointer"
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
          <KnowledgeTab
            knowledges={knowledges}
            workspaceType={workspaceType}
            userRole={userRole}
            handleReviewKnowledge={handleReviewKnowledge}
            openPreviewModal={(title, content) => {
              setPreviewData({ title, content });
              setShowPreviewModal(true);
            }}
            onOpenCreateModal={() => {
              setImportAssetForm({ title: "", content: "", type: "SOP" });
              setShowImportAssetModal(true);
            }}
          />
        );

      case "members":
        const isTabOwner = currentMemberRole === "OWNER" || currentMemberRole === "Owner";
        const isTabAdmin = currentMemberRole === "ADMIN" || currentMemberRole === "Admin";
        const canTabManage = isTabOwner || isTabAdmin;

        // 本地计算邀请码到期剩余时间的优雅函数
        const getRemainingTimeStr = (expiresAtStr: string) => {
          const diffMs = new Date(expiresAtStr).getTime() - Date.now();
          if (diffMs <= 0) return "已过期";
          
          const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
          const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
          
          if (diffDays > 0) {
            return `(还剩 ${diffDays} 天 ${diffHours} 小时)`;
          }
          return `(还剩 ${diffHours} 小时)`;
        };

        // 计算排序和过滤后的协同成员
        const filteredMembers = membersList
          .filter(m => {
            const nameMatch = (m.name || "").toLowerCase().includes(memberSearchTerm.toLowerCase());
            const emailMatch = (m.email || "").toLowerCase().includes(memberSearchTerm.toLowerCase());
            const roleMatch = memberRoleFilter === "ALL" || (m.role || "").toUpperCase() === memberRoleFilter.toUpperCase();
            return (nameMatch || emailMatch) && roleMatch;
          })
          .sort((a, b) => {
            const timeA = new Date(a.joinedAt).getTime();
            const timeB = new Date(b.joinedAt).getTime();
            return memberTimeSort === "asc" ? timeA - timeB : timeB - timeA;
          });

        return (
          <div className="space-y-6 animate-in fade-in duration-200 text-left">
            {/* 1. 成员与协作管理 - 单一深度融合 Header */}
            <div className="bg-gradient-to-r from-blue-50/80 via-slate-50/50 to-white p-4.5 rounded-xl border border-blue-100/70 shadow-2xs text-left flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs text-[#3182ce] shrink-0 mt-0.5 sm:mt-0">
                  <Users className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      {canTabManage ? "团队协同与角色管理" : "空间协同作者"}
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100/80">
                      {workspaceType === "PERSONAL" ? "个人自主空间" : "企业协同空间"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    {canTabManage
                      ? "管理工作空间协同成员、分配岗位角色（所有者/管理员/开发者），建立企业级敏捷研发团队安全协同防线。"
                      : "实时查看当前工作空间下的研发协同伙伴、开发岗位与成员授权情况。"}
                  </p>
                </div>
              </div>
            </div>

            {/* 5. 成员列表看板 (已调至上方) */}
            {membersLoading ? (
              <div className="bg-white/80 rounded-2xl p-10 text-center text-xs text-slate-400 font-bold border border-slate-200/80 animate-pulse">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                正在拉取空间协作者列表...
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* 5.1 标题头 */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs font-black text-slate-800">当前空间协同协作者 ({filteredMembers.length} 人)</span>
                  {workspaceType === "ENTERPRISE" && (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded border border-blue-100 font-bold">
                      我的角色：{isTabOwner ? "👑 所有者" : isTabAdmin ? "🔧 管理员" : "👤 协同成员"}
                    </span>
                  )}
                </div>

                {/* 5.2 局部搜索与双维度筛选器 */}
                {workspaceType === "ENTERPRISE" && (
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="w-full sm:w-64 relative">
                      <input
                        type="text"
                        placeholder="输入名字、电子邮箱进行搜索..."
                        value={memberSearchTerm}
                        onChange={(e) => setMemberSearchTerm(e.target.value)}
                        className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3182ce]"
                      />
                    </div>
                    <div className="flex items-center gap-3.5 w-full sm:w-auto shrink-0 justify-end flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold">岗位筛选:</span>
                        <select
                          value={memberRoleFilter}
                          onChange={(e) => setMemberRoleFilter(e.target.value)}
                          className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-600 cursor-pointer focus:outline-none focus:border-[#3182ce]"
                        >
                          <option value="ALL">全部角色</option>
                          <option value="OWNER">👑 Owner (所有者)</option>
                          <option value="ADMIN">🔧 Admin (管理员)</option>
                          <option value="MEMBER">👤 Member (普通成员)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold">加入时间排序:</span>
                        <select
                          value={memberTimeSort}
                          onChange={(e) => setMemberTimeSort(e.target.value)}
                          className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-[#3182ce] cursor-pointer focus:outline-none focus:border-[#3182ce]"
                        >
                          <option value="asc">最早加入 ( Joined First )</option>
                          <option value="desc">最新加入 ( Joined Last )</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5.3 成员循环列表 */}
                <div className="divide-y divide-slate-100">
                  {membersList.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold text-center py-10">当前空间暂无协同成员</p>
                  ) : filteredMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold text-center py-10">未搜索到匹配的协同成员</p>
                  ) : (
                    filteredMembers.map((m) => {
                      const isTargetOwner = m.role === "OWNER" || m.role === "Owner";
                      const isTargetAdmin = m.role === "ADMIN" || m.role === "Admin";
                      
                      // 只有 OWNER 可以调整别人角色
                      const canChangeTargetRole = isTabOwner && !isTargetOwner;
                      
                      // 控制删除按钮的启用
                      const myUserId = getCurrentUserId();
                      const isSelf = myUserId === m.userId;
                      const joinedStr = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("zh-CN") : "—";
                      const roleBadgeCls = isTargetOwner
                        ? "bg-amber-50 text-amber-600 border-amber-200"
                        : isTargetAdmin
                        ? "bg-purple-50 text-purple-600 border-purple-200"
                        : "bg-slate-100 text-slate-500 border-slate-200";
                      const roleDotCls = isTargetOwner
                        ? "bg-amber-400"
                        : isTargetAdmin
                        ? "bg-[#805ad5]"
                        : "bg-slate-400";
                      const canRemoveTarget = canTabManage && !isTargetOwner && 
                        !(isTabAdmin && isTargetAdmin) && 
                        (myUserId !== m.userId);

                      return (
                        <div key={m.userId} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 hover:bg-slate-50/30 transition-colors">
                          
                          {/* 成员头像与基本信息 */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* 头像：优先真实头像，失败时回退首字母；右下角色色点强化身份 */}
                            <div className="relative flex-shrink-0">
                              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-[#3182ce] flex items-center justify-center text-white text-sm font-black shadow-sm overflow-hidden">
                                {m.avatar ? (
                                  <img
                                    src={m.avatar}
                                    alt={m.name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  (m.name || "G").charAt(0).toUpperCase()
                                )}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${roleDotCls}`} />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-black text-slate-800 truncate max-w-[140px] sm:max-w-[200px]">{m.name}</span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-600 border border-emerald-100">我</span>
                                )}
                                <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold border ${roleBadgeCls}`}>
                                  {isTargetOwner ? "Owner" : isTargetAdmin ? "Admin" : "Member"}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{m.email || "未绑定邮箱"}</p>
                            </div>
                          </div>

                          {/* 操作控制区 */}
                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <div className="text-[10px] text-slate-400 font-semibold whitespace-nowrap hidden sm:inline">
                              加入于 {joinedStr}
                            </div>

                            {/* 角色切换下拉框 / 动态岗位真实标签徽章 (与【权限】配置矩阵 100% 贯通关联 & code 唯一去重) */}
                            {(() => {
                              const posMap = new Map<string, PositionDefinition>();
                              (presetPositions || []).forEach(p => posMap.set(p.code, p));
                              customPositions.forEach(p => posMap.set(p.code, p));
                              const allPositionsList = Array.from(posMap.values());

                              const matchedPos = allPositionsList.find(p => p.code === m.role || p.code === (m as any).positionCode);

                              return canChangeTargetRole ? (
                                <select
                                  value={(m as any).positionCode || m.role}
                                  onChange={(e) => handleTabChangeRole(m.userId, e.target.value)}
                                  className="px-2.5 py-1 text-[11px] bg-white border border-slate-300 rounded-lg focus:outline-none font-bold cursor-pointer text-slate-800 hover:border-[#3182ce] transition-colors shadow-2xs"
                                >
                                  {allPositionsList.map(pos => (
                                    <option key={pos.code} value={pos.code}>
                                      {pos.icon} {pos.name} ({pos.badge})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`text-[11px] px-2.5 py-1 rounded-lg font-extrabold select-none border shadow-2xs ${matchedPos?.colorCls || roleBadgeCls}`}>
                                  {matchedPos
                                    ? `${matchedPos.icon} ${matchedPos.name}`
                                    : isTargetOwner
                                    ? "👑 空间所有者"
                                    : isTargetAdmin
                                    ? "🔧 空间管理员"
                                    : "👤 协同成员"}
                                </span>
                              );
                            })()}

                            {/* 移出空间按钮 */}
                            {canRemoveTarget ? (
                              <button
                                onClick={() => handleTabRemoveMember(m.userId, m.name)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg cursor-pointer transition-colors"
                                title="移出此空间"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="w-7 h-7" /> // 占位
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {/* 混排待激活（短路了） */}
                  {false && workspaceType === "ENTERPRISE" && canTabManage && activeInvitations.filter(inv => inv.status === "PENDING" && new Date(inv.expiresAt).getTime() > Date.now()).map((inv) => (
                    <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50/15 hover:bg-amber-50/25 transition-colors border-l-4 border-amber-400">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-[#d97706] flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm">
                          ✉️
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span>{inv.email || "公开链接邀请中"}</span>
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] rounded font-bold">等待激活 (Pending)</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">邀请码: {inv.code} · 受邀伙伴尚未激活登录</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-[10px] text-slate-400 font-semibold hidden lg:inline">
                          到期时间: {new Date(inv.expiresAt).toLocaleDateString("zh-CN")}
                        </div>
                        <span className="text-[11px] px-2.5 py-1 bg-amber-50/60 border border-amber-200 rounded-lg text-amber-600 font-extrabold select-none">
                          拟分配: {inv.role === "ADMIN" ? "🔧 空间管理员" : "👤 协同成员"}
                        </span>
                        <button
                          onClick={() => handleTabDeleteInvitation(inv.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg cursor-pointer transition-colors"
                          title="作废并撤回此邀请令牌"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. 引导升级面板（当是个人空间时） */}
            {workspaceType === "PERSONAL" && (
              <div className="bg-gradient-to-r from-amber-50 to-amber-50 border border-amber-200 rounded-2xl p-5 shadow-inner space-y-3 animate-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 text-amber-705">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
                  <h4 className="text-xs font-black">个人版空间协作受限提示</h4>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  当前处于个人版工作空间，系统不支持多用户协同参与自动化研发设计。升级为企业协同空间后，您可以一键分配开发岗位，并按照安全矩阵执行算力管控。
                </p>
                <button
                  onClick={handleUpgradeClick}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-500 hover:from-amber-600 hover:to-amber-600 text-white rounded-lg text-xs font-bold shadow hover:shadow-md transition-all cursor-pointer"
                >
                  👑 升级为企业版空间，体验协同研发
                </button>
              </div>
            )}

            {/* 4. 邀请板块 (已调至下方) */}
            {workspaceType === "ENTERPRISE" && canTabManage && (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 pb-2 border-b border-slate-100 uppercase tracking-wider">
                  <KeyRound className="w-4 h-4 text-indigo-500" />
                  <span>引进新协同岗位</span>
                </h3>

                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  您可以一键生成专属的协同邀请令牌。将链接发送在微信、钉钉或飞书的开发团队群内，新伙伴点击后即可安全加入本空间共同协作。
                </p>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <button
                    onClick={() => setShowGenerateInviteModal(true)}
                    disabled={generatingCode}
                    className="h-10 px-4.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow cursor-pointer transition-all shrink-0 flex items-center justify-center gap-1"
                  >
                    {generatingCode ? "正在生成..." : "🔑 生成专属邀请码"}
                  </button>

                  {invitationCode && (
                    <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 bg-slate-50 border rounded-lg px-3 py-2 text-xs font-mono text-slate-700 flex items-center justify-between gap-3 border-slate-200">
                        <span className="truncate">邀请码: <strong className="text-indigo-600 font-extrabold">{invitationCode}</strong> (有效期 {inviteExpiresInDays} 天)</span>
                        <button
                          onClick={() => {
                            const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitationCode}\n🔗 一键快捷加入通道：${window.location.origin}/workspace-hub?inviteCode=${invitationCode}\n\n—— 知阁·舟坊：高效、自动化的现代化一站式全栈架构与协同开发平台`;
                            navigator.clipboard.writeText(promoText);
                            toast.success("邀请码已成功复制，请转发给团队成员");
                          }}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer"
                        >
                          复制邀请码
                        </button>
                      </div>
                      
                      <button
                        onClick={() => {
                          const joinUrl = `${window.location.origin}/workspace-hub?inviteCode=${invitationCode}`;
                          const promoLinkText = `【知阁·舟坊】项目协同邀请函 ✉️\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n🚀 专属快捷加入链接（点击即入）：${joinUrl}\n\n—— 知阁·舟坊：高效、自动化的团队研发协同中枢，让开发化繁为简。`;
                          navigator.clipboard.writeText(promoLinkText);
                          toast.success("邀请链接已成功复制，请转发给团队成员");
                        }}
                        className="bg-white px-3.5 py-2 h-10 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制链接</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 新增：高保真待加入邀请码历史列表，同步空间中枢体验 */}
                {activeInvitations.length > 0 && (
                  <div className="border-t border-slate-100 pt-5 space-y-3.5 text-left">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span>已生成的邀请码 ({activeInvitations.length})</span>
                    </h4>
                    
                    <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                      {activeInvitations.map((invitation) => {
                        const isExpired = invitation.expiresAt ? new Date(invitation.expiresAt).getTime() < Date.now() : false;
                        const isRevoked = invitation.status === "REVOKED";
                        const isInvalid = isExpired || isRevoked;
                        const joinUrl = `${window.location.origin}/workspace-hub?inviteCode=${invitation.code}`;
                        return (
                          <div key={invitation.code} className="border border-slate-200 rounded-lg p-2.5 bg-white hover:shadow-sm transition-shadow space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-base font-extrabold text-slate-800 tracking-tight break-all">{invitation.code}</span>
                                  {isExpired && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-600">已过期</span>
                                  )}
                                  {isRevoked && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-500">已作废</span>
                                  )}
                                  {!isInvalid && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500 text-white shadow-sm">有效</span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                                  <span className={`flex items-center gap-1 ${isExpired ? "line-through opacity-70" : ""}`}>
                                    <Clock className="w-3 h-3" />
                                    有效期：
                                    {invitation.expiresAt
                                      ? new Date(invitation.expiresAt).toLocaleDateString("zh-CN")
                                      : "永久有效"}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    已邀请 {invitation.joinedCount || 0} 人
                                  </span>
                                </div>
                              </div>

                              {/* 顶部操作：作废 / 删除（图标与文字一并显示） */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!isInvalid && (
                                  <button
                                    type="button"
                                    title="作废该邀请码"
                                    onClick={() => handleTabDeleteInvitation(invitation.id, "revoke")}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>作废</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="删除该邀请码"
                                  onClick={() => handleTabDeleteInvitation(invitation.id, "delete")}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>删除</span>
                                </button>
                              </div>
                            </div>

                            {/* 复制按钮组：有效态为鲜艳绿色，失效态置灰禁用 */}
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                disabled={isInvalid}
                                onClick={() => {
                                  navigator.clipboard.writeText(invitation.code);
                                  toast.success("已成功复制邀请码到剪贴板！");
                                }}
                                className={`px-2 py-2 border text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm ${
                                  isInvalid
                                    ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                }`}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>复制邀请码</span>
                              </button>
                              <button
                                disabled={isInvalid}
                                onClick={() => {
                                  navigator.clipboard.writeText(joinUrl);
                                  toast.success("已成功复制加入链接到剪贴板！");
                                }}
                                className={`px-2 py-2 border text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm ${
                                  isInvalid
                                    ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                }`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>复制链接</span>
                              </button>
                              <button
                                disabled={isInvalid}
                                onClick={() => {
                                  const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitation.code}\n🔗 一键快捷加入通道：${joinUrl}\n\n—— 知阁·舟坊：高效、自动化的现代化一站式全栈架构与协同开发平台`;
                                  navigator.clipboard.writeText(promoText);
                                  toast.success("已成功复制全部邀请卡片信息！");
                                }}
                                className={`px-2 py-2 border text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                                  isInvalid
                                    ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                    : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-600 cursor-pointer"
                                }`}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>复制全部</span>
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case "permissions":
        return (
          <PositionsConfigTab
            workspaceId={workspaceId}
            boundComponentIds={effectiveBoundComponentIds}
            customPositions={customPositions}
            setCustomPositions={setCustomPositions}
            onSaveToServer={handleSavePositions}
          />
        );

      case "stats":
        const totalTokenUsed = recentTasks.reduce((acc, t) => acc + (t.tokenUsed || 5), 0);
        const hoursSaved = (recentTasks.length * 1.8).toFixed(1);
        const successRate = recentTasks.length
          ? Math.round((recentTasks.filter(t => t.status === "SUCCESS").length / recentTasks.length) * 100)
          : 100;
        const boundComps = effectiveBoundComponentIds.length === 0 ? [] : componentCatalog.filter(c => effectiveBoundComponentIds.some(id => id.trim().toUpperCase() === c.id.trim().toUpperCase()));

        return (
          <div className="space-y-5 animate-in fade-in duration-200 text-left">
            {/* 顶部标题与数据概览 */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-3 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-[#3182ce]" /> 空间工具链结构与研发效能大盘
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-1">分析空间内自动化组件的分布结构、算力扣减明细与工期节省效果。</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/workspace/${workspaceId}/stats`)}
                  className="zg-btn zg-btn-primary h-8 px-3 text-xs font-black shrink-0 shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>查看全量分析图表 ➔</span>
                </button>
              </div>

              {/* 核心效能 KPIs 4 宫格 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 bg-blue-50/50 border border-blue-100/60 rounded-lg">
                  <span className="text-[11px] font-bold text-slate-500 block">累计节省研发工期</span>
                  <span className="text-xl font-black font-mono text-[#3182ce] block mt-1">{hoursSaved} <span className="text-xs font-normal">小时</span></span>
                </div>
                <div className="p-3 bg-emerald-50/50 border border-emerald-100/60 rounded-lg">
                  <span className="text-[11px] font-bold text-slate-500 block">自动化任务成功率</span>
                  <span className="text-xl font-black font-mono text-emerald-600 block mt-1">{successRate}%</span>
                </div>
                <div className="p-3 bg-purple-50/50 border border-purple-100/60 rounded-lg">
                  <span className="text-[11px] font-bold text-slate-500 block">已装配涵盖阶段</span>
                  <span className="text-xl font-black font-mono text-purple-600 block mt-1">{new Set(boundComps.map(c => c.category)).size} / 10 <span className="text-xs font-normal">阶段</span></span>
                </div>
                <div className="p-3 bg-amber-50/50 border border-amber-100/60 rounded-lg">
                  <span className="text-[11px] font-bold text-slate-500 block">抵扣算力点数消耗</span>
                  <span className="text-xl font-black font-mono text-amber-600 block mt-1">{totalTokenUsed} <span className="text-xs font-normal">点</span></span>
                </div>
              </div>
            </div>

            {/* 研发流程 10 大阶段工具链覆盖结构图表 */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs space-y-4">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>研发全流程阶段覆盖结构分布</span>
                <span className="text-xs text-slate-400 font-medium">已装配 {boundComps.length} 个组件</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(componentCategories).map(([catKey, category]) => {
                  const stageComps = boundComps.filter(c => c.category === catKey);
                  const isCovered = stageComps.length > 0;
                  return (
                    <div key={catKey} className={`p-3 rounded-lg border text-xs flex justify-between items-center transition-all ${
                      isCovered ? "bg-slate-50/80 border-slate-200/80" : "bg-slate-50/30 border-dashed border-slate-200 text-slate-400"
                    }`}>
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 block text-xs truncate">{category.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                          {isCovered ? `已装配 ${stageComps.map(c => `${c.name}(${c.id})`).join(", ")}` : "未装配该阶段自动化组件"}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                        isCovered ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-200 text-slate-500"
                      }`}>
                        {isCovered ? `已覆盖 (${stageComps.length})` : "待补充"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 空间元数据概览卡片 */}
            {!settingsLoading && (
              <div className="bg-slate-50/50 rounded-xl border border-slate-200/60 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-left animate-in fade-in duration-300">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">工作空间 ID</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs font-mono font-bold text-slate-800 truncate max-w-[120px]" title={workspaceId}>
                      {workspaceId}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(workspaceId);
                        toast.success("空间 ID 已复制到剪贴板");
                      }}
                      className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">空间类型</span>
                  <span className="text-xs font-bold text-slate-800 mt-1.5 block">
                    {workspaceInfo.type === "PERSONAL" ? "个人自主空间" : "企业协作空间"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">创建时间</span>
                  <span className="text-xs font-mono font-bold text-slate-900 mt-1.5 block">
                    {workspaceInfo.createdAt ? new Date(workspaceInfo.createdAt).toLocaleDateString("zh-CN") : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">当前状态</span>
                  <span className="text-xs font-bold text-emerald-600 mt-1.5 block flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    正常运行中
                  </span>
                </div>
              </div>
            )}

            {/* 空间图标上传区 */}
            {!settingsLoading && (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col md:flex-row items-center gap-6 text-left">
                <div className="relative group shrink-0">
                  {workspaceInfo.logo ? (
                    <img
                      src={workspaceInfo.logo}
                      alt="空间Logo"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-inner"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 border border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 shadow-inner">
                      <span className="text-xl">🏢</span>
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/45 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-[10px] font-bold gap-0.5">
                    <Upload className="w-3 h-3" />
                    <span>更换</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSettingsLogoUpload}
                      disabled={logoUploading}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="space-y-1 text-center md:text-left flex-1">
                  <h3 className="text-sm font-extrabold text-slate-800">空间标志 (Logo)</h3>
                  <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                    支持 JPG、PNG 格式，大小不能超过 2MB。上传新图标后，点击下方 “保存修改” 按钮生效。
                  </p>
                  {logoUploading && (
                    <div className="text-xs text-[#3182ce] font-extrabold animate-pulse mt-1">
                      正在上传图片...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 设置表单 */}
            {settingsLoading ? (
              <div className="bg-white/80 rounded-2xl p-8 text-center text-xs text-slate-400 font-bold border border-slate-200/80">
                <div className="w-6 h-6 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                正在拉取配置信息...
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <form onSubmit={handleSaveSettings} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    {/* 空间名称 */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-slate-700 block zg-required mb-1">
                        空间名称
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder="请输入空间名称（如：研发一组空间）"
                        value={workspaceInfo.name || ""}
                        onChange={handleSettingsInputChange}
                        className={`zg-input ${settingsErrors.name ? "is-error" : ""}`}
                      />
                    </div>

                    {/* 空间说明 */}
                    <div className="space-y-1.5 md:col-span-2">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700 block">空间描述说明</label>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {(workspaceInfo.description || "").length}/200
                        </span>
                      </div>
                      <textarea
                        name="description"
                        rows={3}
                        maxLength={200}
                        placeholder="请输入空间的主要业务用途或团队描述..."
                        value={workspaceInfo.description || ""}
                        onChange={handleSettingsInputChange}
                        className="zg-input h-auto py-2"
                      />
                    </div>

                    {/* 联系邮箱 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block mb-1">联系人邮箱</label>
                      <input
                        type="email"
                        name="contactEmail"
                        placeholder="请输入您的电子邮箱（如：user@example.com）"
                        value={workspaceInfo.contactEmail || ""}
                        onChange={handleSettingsInputChange}
                        className={`zg-input ${settingsErrors.contactEmail ? "is-error" : ""}`}
                      />
                    </div>

                    {/* 联系电话 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block mb-1">联系电话</label>
                      <input
                        type="text"
                        name="contactPhone"
                        placeholder="请输入您的 11 位联系手机"
                        value={workspaceInfo.contactPhone || ""}
                        onChange={handleSettingsInputChange}
                        className={`zg-input ${settingsErrors.contactPhone ? "is-error" : ""}`}
                      />
                    </div>

                    {/* 所属行业 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block mb-1">所属主要行业</label>
                      <select
                        name="industry"
                        value={workspaceInfo.industry || ""}
                        onChange={handleSettingsInputChange}
                        className="zg-input cursor-pointer"
                      >
                        <option value="">请选择所属行业</option>
                        <option value="金融科技">金融科技</option>
                        <option value="跨境电商">跨境电商</option>
                        <option value="高新技术研发">高新技术研发</option>
                        <option value="传统制造业">传统制造业</option>
                        <option value="教育与科研">教育与科研</option>
                        <option value="文化与传媒">文化与传媒</option>
                        <option value="其它行业">其它行业</option>
                      </select>
                    </div>

                    {/* 团队规模 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block mb-1">预估团队规模</label>
                      <select
                        name="teamSize"
                        value={workspaceInfo.teamSize || ""}
                        onChange={handleSettingsInputChange}
                        className="zg-input cursor-pointer"
                      >
                        <option value="">请选择团队规模</option>
                        <option value="少于 10 人">少于 10 人</option>
                        <option value="10 - 50 人">10 - 50 人</option>
                        <option value="50 - 100 人">50 - 100 人</option>
                        <option value="100 人以上">100 人以上</option>
                      </select>
                    </div>
                  </div>

                  {/* 底部保存按钮：仅空间 OWNER / ADMIN 可修改，普通成员只读 */}
                  <div className="border-t border-slate-100 pt-4 flex justify-end">
                    {isCurrentUserSuperPrivileged ? (
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="zg-btn zg-btn-primary flex items-center gap-1.5 shadow-md shadow-[#3182ce]/20 px-5"
                      >
                        <Save className="w-4 h-4" />
                        <span>{savingSettings ? "正在保存..." : "保存空间修改"}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        当前为只读模式：仅空间 OWNER / ADMIN 可修改空间配置
                      </span>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* 危险操作区 Danger Zone：仅空间 OWNER / ADMIN 可见 */}
            {!settingsLoading && isCurrentUserSuperPrivileged && (
              <div className="bg-red-50/10 border border-red-200/50 rounded-2xl p-6 shadow-sm text-left space-y-4">
                <h3 className="text-sm font-extrabold text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
                  <span>高危风险管理区域 (Danger Zone)</span>
                </h3>
                <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                  此区域的操作具有高风险性且不可逆，请在仔细阅读说明并确认无误后再执行。
                </p>
                
                <div className="divide-y divide-red-100/30">
                  {/* 操作1：重置空间数据 */}
                  <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5 pr-2">
                      <h4 className="text-xs font-black text-slate-800">重置清空当前空间效能数据</h4>
                      <p className="text-[11px] text-slate-400 font-bold leading-normal">
                        清空当前空间下绑定的所有岗位契约配置和仿真审计日志。该操作仅清空计算记录，不影响账号本身。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="px-3.5 py-2 text-xs border border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50/50 rounded-lg transition-all font-bold cursor-pointer shrink-0 self-start sm:self-center"
                    >
                      重置空间数据
                    </button>
                  </div>

                  {/* 操作2：解散工作空间 (企业协作版专享) */}
                  {workspaceType === "ENTERPRISE" && (
                    <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-0.5 pr-2">
                        <h4 className="text-xs font-black text-slate-800">解散并停用该企业协作空间</h4>
                        <p className="text-[11px] text-slate-400 font-bold leading-normal">
                          将工作空间状态标记为停用，移出所有协同成员，并禁用相关的组件调用权限。该操作将永久影响该空间的协作。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3.5 py-2 text-xs bg-red-600 hover:bg-red-600 text-white rounded-lg transition-all font-bold cursor-pointer shrink-0 self-start sm:self-center shadow-sm"
                      >
                        停用此工作空间
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case "logs":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left animate-in fade-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-700" /> 空间审计日志
              </h3>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-600 leading-relaxed">
              这里是空间操作与审计日志。记录了空间内协同成员的每一次组件装配、任务执行与配置变更。
            </div>
          </div>
        );



      default:
        return null;
    }
  })()}
</div>
);
};

  // 1. SSR / 核心数据挂载中
  if (!hasMounted || loadState === "loading") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#f0f8ff] via-[#f1f5f9] to-[#ffffff]">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-[3px] border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(49,130,206,0.15)]" />
          <div>
            <p className="text-slate-700 font-bold text-sm">正在连接并加载工作空间数据</p>
            <p className="text-slate-400 font-medium text-xs mt-1">同步组件、任务与空间资料中...</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. 鉴权失败重定向状态 (401 凭证失效)
  if (loadState === "redirecting") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-sm w-full mx-4 space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 border border-amber-200 rounded-full flex items-center justify-center mx-auto text-xl font-bold animate-pulse">
            🔒
          </div>
          <h3 className="text-base font-extrabold text-slate-900">登录状态已失效</h3>
          <p className="text-xs text-slate-500 font-medium">您的会话可能已过期，正在自动为您跳转至登录页...</p>
          <button
            type="button"
            onClick={() => router.replace(`/auth/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "")}`)}
            className="w-full py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            立即返回登录页
          </button>
        </div>
      </div>
    );
  }

  // 3. 错误状态 (403 / 404 / 500 / 抓取无果)
  if (loadState === "error" || !authData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md w-full mx-4 space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-500 border border-red-200 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
<div className="pt-2 flex gap-[#3182ce] justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/workspace-hub")}
              className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              返回空间中枢
            </button>
            <button
              type="button"
              onClick={() => {
                initializedWsIdRef.current = null;
                if (currentWorkspaceParamId) loadWorkspace(currentWorkspaceParamId);
              }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer"
            >
              重新重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. 获取当前登录用户的实际岗位与成员记录，计算 RBAC 动态约束
  //    空间角色以 /api/workspace/list 返回的 workspace.role 为准（getLogicalWorkspaceRolesBatch 已计算，
  //    平台全局角色不会混入）；成员表记录仅作补充依据。
  const currentUserIdStr = getCurrentUserId();
  const currentUserRecord = membersList.find(m => m.userId === currentUserIdStr || m.email === userState?.userInfo?.email);
  const isSpaceOwner = userRole === "Owner" || userRole === "OWNER" || currentUserRecord?.role === "OWNER" || currentUserRecord?.role === "Owner";
  const isSpaceAdmin = userRole === "Admin" || userRole === "ADMIN" || currentUserRecord?.role === "ADMIN" || currentUserRecord?.role === "Admin";
  const currentUserRoleStr = currentUserRecord?.role || userRole || "MEMBER";
  // 当前用户岗位：优先取成员挂载岗位 code；未挂载时不做硬编码兜底（null → 按全量授权放行）
  const currentUserPosCode = (currentUserRecord as any)?.positionCode || null;

  // 2. 判定当前登录者是否具备空间管理特权（仅空间 OWNER / ADMIN，平台角色不自动升级空间权限）
  const isCurrentUserSuperPrivileged = isSpaceOwner || isSpaceAdmin;

  // 3. 动态算当前用户挂载岗位实际允许调度的组件 ID 集合 (普通成员被岗位受限的组件全网死锁)
  const posMapForCalc = new Map<string, PositionDefinition>();
  (presetPositions || []).forEach(p => posMapForCalc.set(p.code, p));
  customPositions.forEach(p => posMapForCalc.set(p.code, p));
  const currentUserPosDef = currentUserPosCode ? posMapForCalc.get(currentUserPosCode) : undefined;

  const currentUserAllowedCompIds = isCurrentUserSuperPrivileged
    ? effectiveBoundComponentIds
    : (currentUserPosDef?.defaultAllowedComponentIds || effectiveBoundComponentIds);

  // 派生 Tabs 列表 (按用户指定严格顺序排列：1.总览 2.快速任务 3.组件 4.任务与成果 5.资料 6.知识库 7.统计 [8.成员 9.权限 10.日志] 11.设置)
  let tabsList: { key: string; label: string }[] = [
    { key: "overview", label: "总览" },
    { key: "quick", label: "快速任务" },
    { key: "components", label: "组件装配" },
    { key: "tasks", label: "任务与成果" },
    { key: "assets", label: "资料" },
    { key: "knowledge", label: "知识库" },
    { key: "stats", label: "统计" },
  ];

  // 管理类 Tab（成员 / 权限 / 日志）仅企业空间的 OWNER / ADMIN 可见，个人空间不显示任何企业空间管理入口
  if (isCurrentUserSuperPrivileged && workspaceType === "ENTERPRISE") {
    tabsList.push({ key: "members", label: "成员" });
    tabsList.push({ key: "permissions", label: "权限" });
    tabsList.push({ key: "logs", label: "日志" });
  }

  // 设置页签始终放置在最后
  tabsList.push({ key: "settings", label: "设置" });

  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] flex flex-col font-sans relative">
      {/* 背景效果 (恢复唯一真理系统 V6.0 灰白粒子纹理底图)，对齐 workspace-hub 风格 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#f0f8ff] via-[#f1f5f9] to-[#ffffff]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `radial-gradient(#94a3b8 1px, transparent 1px)`,
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute top-[-12%] left-[-8%] w-[40%] h-[40%] bg-[#3182ce]/[0.07] rounded-full blur-[150px]" />
        <div className="absolute top-[25%] right-[-12%] w-[32%] h-[32%] bg-[#805ad5]/[0.06] rounded-full blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[18%] w-[46%] h-[38%] bg-[#10b981]/[0.05] rounded-full blur-[160px]" />
      </div>

      {/* 顶部 Header (面包屑) */}
      <header className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl border-b border-slate-200/70 px-4 sm:px-6 py-3 flex items-center justify-between shadow-[0_1px_10px_rgba(15,23,42,0.05)] relative">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-slate-600 hover:text-[#2b6cb0] hover:bg-slate-100/80 transition-all flex-shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-xs hidden xs:inline">返回</span>
          </button>
          <div className="h-5 w-px bg-slate-300/70 flex-shrink-0" />
          
          <div className="flex items-center gap-2 min-w-0 text-left">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md shadow-[#3182ce]/25 font-bold">🏢</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-800 text-sm truncate">{workspaceName}</span>
                <span className="text-xs text-slate-300 font-bold">/</span>
                <span className="text-xs text-slate-500 font-bold">工作控制台</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* 优化升级后的“快速切换空间”高级下拉框 (融合灵动绿点与知性蓝高质感外观) */}
          <div className="relative" ref={spaceManagementDropdownRef}>
            <button
              type="button"
              onClick={() => setShowSpaceManagementDropdown(!showSpaceManagementDropdown)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-white border border-slate-200/90 text-slate-700 hover:text-[#3182ce] hover:border-[#3182ce]/40 text-xs font-black shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-black text-slate-800">快速切换空间</span>
              <span className="text-slate-300 font-bold">|</span>
              <span className="max-w-[110px] truncate text-[#3182ce] font-black">{workspaceName}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-[#3182ce] transition-transform duration-200 ${showSpaceManagementDropdown ? "rotate-180 text-[#3182ce]" : ""}`} />
            </button>
            {showSpaceManagementDropdown && (() => {
              const btnRect = spaceManagementDropdownRef.current?.querySelector('button')?.getBoundingClientRect();
              const dropdownStyle: React.CSSProperties = btnRect ? {
                position: 'fixed' as const,
                top: btnRect.bottom + 8,
                right: window.innerWidth - btnRect.right,
                zIndex: 9999,
              } : {
                position: 'absolute' as const,
                right: 0,
                marginTop: 8,
                zIndex: 9999,
              };

              const allWs = userState?.workspaces || [];
              const personalWs = allWs.filter(w => w.type === "PERSONAL" || w.id.includes("personal") || w.name.includes("个人"));
              const enterpriseWs = allWs.filter(w => !personalWs.includes(w));

              return (
                <div
                  style={dropdownStyle}
                  className="w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-2 text-left animate-in fade-in slide-in-from-top-2 duration-150 space-y-2"
                >
                  <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-[#3182ce]" /> 快捷空间切换
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">共 {allWs.length} 个空间</span>
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto px-1 scrollbar-none">
                    {/* 1. 个人空间列表 */}
                    {personalWs.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 block px-1">👤 个人自主空间</span>
                        {personalWs.map(ws => (
                          <button
                            key={ws.id}
                            onClick={() => {
                              setShowSpaceManagementDropdown(false);
                              handleSwitchWorkspace(ws.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all text-left cursor-pointer ${
                              ws.id === workspaceId ? "bg-blue-50/80 border-blue-200 text-[#3182ce]" : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="text-xs font-bold truncate flex-1 pr-2">{ws.name}</span>
                            {ws.id === workspaceId && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 2. 企业空间列表 */}
                    {enterpriseWs.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] font-black text-slate-400 block px-1">🏢 企业协同空间</span>
                        {enterpriseWs.map(ws => (
                          <button
                            key={ws.id}
                            onClick={() => {
                              setShowSpaceManagementDropdown(false);
                              handleSwitchWorkspace(ws.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all text-left cursor-pointer ${
                              ws.id === workspaceId ? "bg-blue-50/80 border-blue-200 text-[#3182ce]" : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="text-xs font-bold truncate flex-1 pr-2">{ws.name}</span>
                            {ws.id === workspaceId && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 底部 Action 链接 */}
                  <div className="border-t border-slate-100 pt-2 px-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => router.push("/workspace-hub")}
                      className="w-full text-center py-1.5 bg-slate-50 hover:bg-slate-100 text-[#3182ce] text-xs font-black rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>前往工作空间中枢 ➔</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
          <AvatarDropdown 
            workspaceId={workspaceId}
            workspaceType={workspaceType}
            userRole={
              userRole === "ADMIN"
                ? "Admin"
                : userRole === "OWNER"
                  ? "Owner"
                  : userRole === "COMPONENT_MANAGER" || userRole === "ComponentManager"
                    ? "ComponentAdmin"
                    : userRole === "KNOWLEDGE_MANAGER" || userRole === "KnowledgeManager"
                      ? "KnowledgeAdmin"
                      : userRole === "MEMBER"
                        ? "Member"
                        : userRole === "VIEWER"
                          ? "Viewer"
                          : userRole
            }
            onUpgradeClick={() => setShowUpgradeModal(true)}
          />
        </div>
      </header>

      {/* 空间名片摘要 - 悬浮玻璃卡片 */}
      <div className="px-4 sm:px-6 py-4 text-left relative z-10">
        <div className="max-w-[1400px] mx-auto bg-white/85 backdrop-blur-xl border border-white/90 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.12)] rounded-2xl px-5 sm:px-7 pt-5 sm:pt-6 pb-1">
        {/* 新装配组件通知 Banner */}
        {showNewBoundBanner && newBoundComp && (
          <div className="mb-5 bg-gradient-to-r from-blue-50/90 to-blue-50/60 border border-blue-200/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* 左侧的小叉关闭按钮 */}
              <button
                onClick={() => setShowNewBoundBanner(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-white/70 transition-colors cursor-pointer shrink-0 flex items-center justify-center w-6 h-6 border-none bg-transparent"
                title="关闭提示"
              >
                <span className="text-xs font-black">✕</span>
              </button>
              <p className="text-xs text-slate-700 font-semibold leading-normal truncate">
                🚀 您刚刚装配了 <span className="text-[#2b6cb0] font-black">[{newBoundComp.name}]</span> 效能组件，现在即可
                <button
                  onClick={handleUseNewBoundComp}
                  className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-black cursor-pointer bg-transparent border-none p-0 inline ml-1 font-sans text-xs"
                >
                  立即使用 ➔
                </button>
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{workspaceName}</h1>
              {workspaceType === "PERSONAL" ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-blue-50 text-[#3182ce] rounded-full border border-blue-100 font-bold">👤 个人空间</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-amber-50 text-[#d97706] rounded-full border border-amber-100 font-bold">🏢 企业协同空间</span>
              )}
              {workspaceType === "ENTERPRISE" && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 font-bold">
                  岗位角色: {userRole === "Owner" ? "👑 所有者" : userRole === "Admin" ? "🔧 管理员" : userRole === "ComponentManager" ? "🧩 组件管理员" : userRole === "KnowledgeManager" ? "📚 规范库管理员" : "👤 协作成员"}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl leading-relaxed">
              {workspaceType === "PERSONAL" 
                ? "个人空间用于个人组件的安全运行、私有开发资料的分类归档以及处理结果的标准化规范沉淀。"
                : "企业空间支持团队研发协作、组件安全授权、企业文档共享、开发标准 SOP 归档及操作日志审计。"}
            </p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
            <button
              onClick={() => {
                setActiveTab("quick");
                setQuickSubStep("select");
              }}
              className="flex-1 md:flex-none h-10 px-5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-md shadow-[#3182ce]/20 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 fill-current" />
              <span>开始新任务</span>
            </button>
            <button
              onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
              className="flex-1 md:flex-none h-10 px-5 bg-white border border-[#3182ce]/35 text-[#3182ce] hover:bg-blue-50/50 hover:border-[#3182ce]/50 text-xs font-bold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              前往组件大厅
            </button>
          </div>
        </div>

        {/* 横向功能标签页 (Tabs) 切换区 (完全强行切断一切原生纵向/横向多余滑动条与上下小箭头) */}
        <div className="mt-5 pt-3 flex gap-1 overflow-x-auto overflow-y-hidden no-scrollbar scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0 border-t border-slate-100 items-center select-none py-1">
          {tabsList.map(tab => {
            const isActive = activeTab === tab.key;
            const iconMap: Record<string, React.ReactNode> = {
              overview: <Layout className="w-3.5 h-3.5" />,
              quick: <Play className="w-3.5 h-3.5" />,
              components: <Layers className="w-3.5 h-3.5" />,
              stats: <BarChart2 className="w-3.5 h-3.5" />,
              tasks: <CheckCircle2 className="w-3.5 h-3.5" />,
              assets: <Database className="w-3.5 h-3.5" />,
              results: <FileText className="w-3.5 h-3.5" />,
              knowledge: <BookOpen className="w-3.5 h-3.5" />,
              members: <Users className="w-3.5 h-3.5" />,
              permissions: <ShieldCheck className="w-3.5 h-3.5" />,
              logs: <FileText className="w-3.5 h-3.5" />,
              settings: <Settings className="w-3.5 h-3.5" />,
            };
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 text-xs font-bold shrink-0 cursor-pointer transition-all duration-200 rounded-lg flex items-center gap-1.5 border ${
                  isActive
                    ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-md shadow-[#3182ce]/25 font-black border-transparent scale-[1.02]"
                    : "text-slate-600 hover:text-[#3182ce] hover:bg-slate-100/80 font-semibold border-transparent"
                }`}
              >
                {iconMap[tab.key] || <Layers className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* 主工作区 (升级为 max-w-[1400px] 大厂黄金广角布局，收紧两侧过多留白) */}
      <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 pt-5 pb-10 flex-1 overflow-visible relative z-10">
        <div className="w-full space-y-6">
          {children || renderTabContent()}
        </div>
      </div>

      {/* ------------------ MODALS 声明式挂载 ------------------ */}
      
      <UpgradeModal 
        open={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        workspaceType={workspaceType} 
      />

      <ImportAssetModal
        open={showImportAssetModal}
        onClose={() => setShowImportAssetModal(false)}
        onImport={(data) => {
          // 复用真实持久化导入逻辑（后端成功后才更新本地资料）
          handlePersistAsset({ title: data.title, content: data.content, type: data.type });
        }}
      />

      <ConfirmRunModal
        open={showConfirmRunModal}
        onClose={() => setShowConfirmRunModal(false)}
        onConfirm={handleExecuteSimulation}
        componentName={quickSelectedCompId}
        taskName={quickInputMaterial}
      />

      {/* 4. 任务成果预览与沉淀 Modal (大厂级现代化 UI + 100% 完整闭环，支持 Word 文件真实下载与 Markdown 复制) */}
      {selectedTask && selectedTask.outputData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 via-blue-50/30 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
                  📄
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    自动化解析报告: {selectedTask.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
                    <span className="bg-blue-50 text-[#3182ce] font-mono font-black px-2 py-0.5 rounded border border-blue-100">
                      {selectedTask.componentId}
                    </span>
                    <span>·</span>
                    <span className="font-bold text-slate-700">
                      {selectedTask.componentName && selectedTask.componentName.toUpperCase() !== selectedTask.componentId.toUpperCase()
                        ? selectedTask.componentName
                        : `自动化效能工具 [${selectedTask.componentId}]`}
                    </span>
                    <span>·</span>
                    <span className="text-emerald-600 font-bold">🟢 运行成功</span>
                    <span>·</span>
                    <span className="text-slate-400 font-mono">耗时算力: {selectedTask.tokenUsed || 5} 算力点</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Scroll Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs leading-relaxed text-slate-700 custom-scrollbar">
              {/* 成果物摘要卡片 */}
              <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white p-4.5 rounded-2xl border-l-4 border-[#3182ce] border border-blue-100/80 shadow-xs space-y-1.5">
                <h4 className="font-black text-xs text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                  💡 成果物摘要
                </h4>
                <p className="text-slate-700 font-semibold leading-relaxed">
                  {selectedTask.outputData.summary || "系统已完成该业务模块的条款拆解与规范比对，产出结构化决策结果。"}
                </p>
              </div>

              {/* 关键结论明细 */}
              {selectedTask.outputData.conclusions && selectedTask.outputData.conclusions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    📌 关键结论明细
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedTask.outputData.conclusions.map((c: string, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2 font-medium text-slate-700">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-[#3182ce] font-mono font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 条款偏离分析表格 (现代 Web 表格样式) */}
              {selectedTask.outputData.deviations && selectedTask.outputData.deviations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    📊 条款偏离分析对照表
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                          <th className="py-2.5 px-3.5 w-[20%]">条款项</th>
                          <th className="py-2.5 px-3.5 w-[30%]">标准规范要求</th>
                          <th className="py-2.5 px-3.5 w-[30%]">应答比对方案</th>
                          <th className="py-2.5 px-3.5 w-[20%]">偏离风险提示</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white font-medium">
                        {selectedTask.outputData.deviations.map((d: any, idx: number) => (
                          <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                            <td className="py-2.5 px-3.5 font-bold text-slate-900">{d.item}</td>
                            <td className="py-2.5 px-3.5 text-slate-600">{d.rfp}</td>
                            <td className="py-2.5 px-3.5 text-slate-600">{d.actual}</td>
                            <td className="py-2.5 px-3.5">
                              <span className="inline-block px-2.5 py-1 text-[11px] font-black rounded-lg bg-red-50 text-red-600 border border-red-200/80">
                                ⚠️ {d.risk}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 偏离风险排查清单 */}
              {selectedTask.outputData.risks && selectedTask.outputData.risks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-red-600 flex items-center gap-1.5">
                    🚨 偏离风险排查清单
                  </h4>
                  <div className="space-y-1.5">
                    {selectedTask.outputData.risks.map((r: string, idx: number) => (
                      <div key={idx} className="p-3 bg-red-50/50 border border-red-200/80 rounded-xl text-red-700 font-semibold flex items-center gap-2">
                        <span className="text-red-500 font-black">⚠️</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 整改及设计建议 */}
              {selectedTask.outputData.advices && selectedTask.outputData.advices.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    ✨ 整改及设计优化建议
                  </h4>
                  <div className="space-y-1.5">
                    {selectedTask.outputData.advices.map((a: string, idx: number) => (
                      <div key={idx} className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                        <span className="text-emerald-600 font-black">💡</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (四大功能 100% 完整闭环实现) */}
            <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleSaveToKnowledge(selectedTask);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>📚 归档至团队规范</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {/* 1. 复制 Markdown 闭环 */}
                <button
                  type="button"
                  onClick={() => {
                    const lines = [
                      `# ${selectedTask.name} 结构化解析报告`,
                      `\n## 成果物摘要\n${selectedTask.outputData.summary || "无"}`,
                    ];
                    if (selectedTask.outputData.conclusions?.length) {
                      lines.push(`\n## 关键结论明细\n${selectedTask.outputData.conclusions.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}`);
                    }
                    if (selectedTask.outputData.deviations?.length) {
                      lines.push(`\n## 条款偏离分析\n| 条款项 | 标准规范要求 | 应答比对方案 | 偏离风险提示 |`);
                      lines.push(`|---|---|---|---|`);
                      selectedTask.outputData.deviations.forEach((d: any) => {
                        lines.push(`| ${d.item} | ${d.rfp} | ${d.actual} | ${d.risk} |`);
                      });
                    }
                    if (selectedTask.outputData.risks?.length) {
                      lines.push(`\n## 偏离风险清单\n${selectedTask.outputData.risks.map((r: string) => `- ⚠️ ${r}`).join("\n")}`);
                    }
                    copyToClipboard(lines.join("\n"));
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <Clipboard className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>复制 Markdown</span>
                </button>

                {/* 2. 导出 Word 文档文件真实下载闭环 */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const docContent = `
                        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                        <head><meta charset='utf-8'><title>${selectedTask.name}</title></head>
                        <body style="font-family: Arial, sans-serif; padding: 20px;">
                          <h2 style="color: #3182ce;">${selectedTask.name} - 结构化解析报告</h2>
                          <p><strong>组件标识：</strong>${selectedTask.componentId}</p>
                          <hr/>
                          <h3>成果物摘要</h3>
                          <p>${selectedTask.outputData.summary || ""}</p>
                          ${selectedTask.outputData.deviations ? `
                            <h3>条款偏离分析表</h3>
                            <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%;">
                              <tr style="background-color: #f0f8ff;">
                                <th>条款项</th><th>标准规范要求</th><th>应答比对方案</th><th>偏离提示</th>
                              </tr>
                              ${selectedTask.outputData.deviations.map((d: any) => `
                                <tr>
                                  <td>${d.item}</td><td>${d.rfp}</td><td>${d.actual}</td><td style="color: red;">${d.risk}</td>
                                </tr>
                              `).join("")}
                            </table>
                          ` : ""}
                        </body>
                        </html>
                      `;
                      const blob = new Blob([docContent], { type: "application/msword;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedTask.name}_解析报告.doc`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success(`已生成并下载 Word 文档报告: ${selectedTask.name}_解析报告.doc`);
                    } catch (e) {
                      toast.error("生成 Word 文档时异常");
                    }
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>导出 Word</span>
                </button>

                {/* 3. 关闭 */}
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 知识与资料详情查阅 Modal (锁定主系统知性蓝 UI + 复制全文/文件下载 100% 闭环) */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header (锁定主系统知性蓝) */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50/60 via-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
                  📚
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    知识与资料详情: {previewData.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                    <span className="bg-blue-50 text-[#3182ce] font-bold px-2 py-0.5 rounded border border-blue-200/70 text-[11px]">
                      🔒 物理安全加密
                    </span>
                    <span>·</span>
                    <span className="text-slate-400 font-mono">空间团队研发知识与沉淀</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80 text-xs font-mono font-medium text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto custom-scrollbar select-text">
                {previewData.content && previewData.content.trim() !== "内容为空。" 
                  ? previewData.content 
                  : `# ${previewData.title}\n\n当前资料/规范文件内容为空，可由空间所有者/管理员重新导入挂载或通过任务输出结果自动沉淀积累。`}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold">
                提示：选中文本可直接进行复制与二次引用
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {/* 复制全文 */}
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(previewData.content || previewData.title);
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <Clipboard className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>复制全文</span>
                </button>

                {/* 导出文件真实下载 */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const blob = new Blob([previewData.content || previewData.title], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${previewData.title}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success(`已导出资料文件: ${previewData.title}.txt`);
                    } catch (e) {
                      toast.error("导出文件时异常");
                    }
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>导出文本文件</span>
                </button>

                {/* 关闭 */}
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 组件生命周期安全卸载诊断弹窗 */}
      <SafeUninstallModal
        open={!!uninstallingComponentId && uninstallStep !== "idle"}
        uninstallingComponentId={uninstallingComponentId}
        uninstallingComponentName={uninstallingComponentName}
        uninstallStep={uninstallStep}
        checkLogs={checkLogs}
        onClose={() => {
          setUninstallingComponentId(null);
          setUninstallStep("idle");
        }}
        onClearData={handleClearComponentData}
        onConfirmUninstall={handleConfirmUninstall}
      />

      {/* 生成专属邀请码弹窗（与空间中枢分享弹窗交互一致） */}
      {showGenerateInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* 头部 */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">生成专属邀请码</h2>
                  <p className="text-xs text-slate-500">生成邀请码或分享链接，邀请同事加入当前工作空间</p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateInviteModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold"
              >
                ×
              </button>
            </div>

            {/* 内容区域 */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">邀请有效期</label>
                <select
                  value={inviteExpiresInDays}
                  onChange={(e) => setInviteExpiresInDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] outline-none text-xs bg-white"
                >
                  <option value={1}>1 天</option>
                  <option value={3}>3 天</option>
                  <option value={7}>7 天</option>
                  <option value={15}>15 天</option>
                  <option value={30}>30 天</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">邀请角色</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole("MEMBER")}
                    className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                      inviteRole === "MEMBER"
                        ? "border-[#3182ce] bg-[#3182ce]/10 text-[#3182ce]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    普通成员
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole("ADMIN")}
                    className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                      inviteRole === "ADMIN"
                        ? "border-[#2b6cb0] bg-[#2b6cb0]/10 text-[#2b6cb0]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    管理员
                  </button>
                </div>
              </div>

              <button
                onClick={handleTabGenerateCode}
                disabled={generatingCode}
                className="w-full py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none cursor-pointer"
              >
                {generatingCode ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>正在生成邀请码...</span>
                  </>
                ) : (
                  <span>生成邀请码</span>
                )}
              </button>

              {/* 生成结果 */}
              {invitationCode && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-semibold">邀请码</span>
                    <span className="text-base font-mono font-extrabold text-indigo-600">{invitationCode}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-semibold">有效期至 {invitationExpires || `${inviteExpiresInDays} 天后`}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitationCode}\n🔗 一键快捷加入通道：${window.location.origin}/workspace-hub?inviteCode=${invitationCode}\n\n—— 知阁·舟坊：高效、自动化的现代化一站式全栈架构与协同开发平台`;
                        navigator.clipboard.writeText(promoText);
                        toast.success("邀请码已成功复制，请转发给团队成员");
                      }}
                      className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold cursor-pointer text-xs"
                    >
                      复制邀请码
                    </button>
                    <button
                      onClick={() => {
                        const joinUrl = `${window.location.origin}/workspace-hub?inviteCode=${invitationCode}`;
                        const promoLinkText = `【知阁·舟坊】项目协同邀请函 ✉️\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n🚀 专属快捷加入链接（点击即入）：${joinUrl}\n\n—— 知阁·舟坊：高效、自动化的团队研发协同中枢，让开发化繁为简。`;
                        navigator.clipboard.writeText(promoLinkText);
                        toast.success("邀请链接已成功复制，请转发给团队成员");
                      }}
                      className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold cursor-pointer text-xs flex items-center justify-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制链接</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setShowGenerateInviteModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer border-none transition-all"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 确认清空模态框 (知阁 Design System 顶级高质感玻璃磨砂危险 Alert 弹窗) */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 text-left space-y-5 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 顶部危险高亮微边线 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-red-500 to-red-600 absolute top-0 left-0 right-0" />

            {/* Header 图标与标题 */}
            <div className="flex items-start gap-3.5 pt-1">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shadow-xs shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  确认清空空间数据？
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
                  高危数据清理警示：此操作不可逆！
                </p>
              </div>
            </div>

            {/* 警告原因及后果详情卡片 */}
            <div className="bg-red-50/60 border border-red-100/80 p-3.5 rounded-xl space-y-1.5 text-left">
              <p className="text-xs text-red-800 font-bold leading-relaxed">
                ⚠️ 此操作将物理清空该空间下的所有组件执行历史、分析报告、资料文档和归档知识规约。
              </p>
              <p className="text-[11px] text-red-500 font-extrabold">
                清空后，所有数据资产将彻底消失且无法恢复，请谨慎操作。
              </p>
            </div>

            {/* 校验输入框区 */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-black text-slate-700 block">
                请输入 <span className="text-red-500 font-mono bg-red-50 px-1.5 py-0.5 rounded border border-red-200">确认重置</span> 以确认此高危操作：
              </label>
              <input
                type="text"
                placeholder="在此输入“确认重置”"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                className="w-full h-10 px-3.5 text-xs font-black bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 font-mono text-slate-800"
              />
            </div>

            {/* 操作按钮组 */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearConfirmText("");
                }}
                className="px-5 h-9 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200/60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleClearSettingsData}
                disabled={clearing || clearConfirmText !== "确认重置"}
                className="px-5 h-9 bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-amber-500 text-xs font-black rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {clearing ? "正在重置数据..." : "确认物理清空"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认停用模态框 (知阁 Design System 顶级高质感危险极停用 Alert 弹窗) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 text-left space-y-5 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 顶部极强危险红色微边线 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-red-600 to-red-600 absolute top-0 left-0 right-0" />

            {/* Header 图标与标题 */}
            <div className="flex items-start gap-3.5 pt-1">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/70 flex items-center justify-center text-red-500 shadow-xs shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  确认注销停用此工作空间？
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
                  高危空间注销警示：极度不可逆操作！
                </p>
              </div>
            </div>

            {/* 警告原因及后果详情卡片 */}
            <div className="bg-red-50/70 border border-red-200/80 p-3.5 rounded-xl space-y-1.5 text-left">
              <p className="text-xs text-red-800 font-bold leading-relaxed">
                🚨 此操作将物理停用该协作工作空间，强制踢出所有协同团队成员。
              </p>
              <p className="text-[11px] text-red-500 font-extrabold">
                空间解散后，所有协作者将永久无法访问此空间及历史产物，该过程完全不可逆！
              </p>
            </div>

            {/* 校验输入框区 */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-black text-slate-700 block">
                请输入 <span className="text-red-500 font-mono bg-red-50 px-1.5 py-0.5 rounded border border-red-200">确认停用</span> 以确认此高危操作：
              </label>
              <input
                type="text"
                placeholder="在此输入“确认停用”"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full h-10 px-3.5 text-xs font-black bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 font-mono text-slate-800"
              />
            </div>

            {/* 操作按钮组 */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="px-5 h-9 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200/60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeactivateSettingsWorkspace}
                disabled={deletingSettings || deleteConfirmText !== "确认停用"}
                className="px-5 h-9 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-red-500 text-xs font-black rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {deletingSettings ? "正在注销空间..." : "确认注销停用"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移出协同成员二次确认模态框 */}
      {showMemberRemoveConfirm && targetRemoveMember && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 text-left space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              确认将该协作者移出空间？
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              确认要将协作者 <strong className="text-slate-700 font-extrabold">"{targetRemoveMember.name}"</strong> 移出当前的工作空间吗？移出后他将立即失去对该空间的全部访问和协同权限。
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setShowMemberRemoveConfirm(false);
                  setTargetRemoveMember(null);
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={submitTabRemoveMember}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                确认移出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 邀请令牌作废/删除二次确认模态框 */}
      {showInvitationActionConfirm && targetInvitationAction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 text-left space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {targetInvitationAction.action === "revoke" ? "确认作废此邀请码？" : "确认物理删除此邀请记录？"}
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              {targetInvitationAction.action === "revoke"
                ? "作废后该邀请链接将立即失效，无法被受邀人用于加入本工作空间。作废后，该卡片支持彻底的物理删除。"
                : "此操作将物理删除此已失效的邀请码记录。物理删除后该记录卡片将彻底从列表中移去且无法复原。"}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setShowInvitationActionConfirm(false);
                  setTargetInvitationAction(null);
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={submitTabDeleteInvitation}
                disabled={processingInvitationAction}
                className={`px-3.5 py-1.5 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                  targetInvitationAction.action === "revoke"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-600 hover:bg-red-600"
                } ${processingInvitationAction ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {processingInvitationAction
                  ? "处理中…"
                  : targetInvitationAction.action === "revoke"
                  ? "确认作废"
                  : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
