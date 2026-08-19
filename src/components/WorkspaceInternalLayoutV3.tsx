"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { 
  ArrowLeft, Settings, ChevronDown, Plus, FileText, Layers, Database, Layout, 
  Server, ShieldCheck, Check, ArrowRight, BookOpen, AlertCircle, 
  CheckCircle2, Play, Users, BarChart2, ShieldAlert, FileDown, Clipboard, Trash2, Edit2, HelpCircle, Info,
  Upload, Save, AlertTriangle, Copy, KeyRound, ExternalLink, Share2, Ban, Clock
} from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory, DEFAULT_ALLOWED_COMPONENT_IDS } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";
import UpgradeModal from "@/components/studio/UpgradeModal";
import ImportAssetModal from "@/components/studio/ImportAssetModal";
import ConfirmRunModal from "@/components/studio/ConfirmRunModal";
import ComponentsTab from "@/components/studio/ComponentsTab";
import TasksTab from "@/components/studio/TasksTab";
import OverviewTab from "@/components/studio/OverviewTab";
import SafeUninstallModal from "@/components/studio/SafeUninstallModal";

// 组件与阶段类型定义
interface ZhiGeComponent {
  id: string;
  title: string;
  stageId: number;
  path: string;
  icon: string;
  isPremium?: boolean;
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
  icon: categoryEmojis[c.category] || "⚙️"
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

function getComponentFlowText(componentId: string): string {
  const comp = COMPONENTS.find(c => c.id === componentId);
  if (!comp) return "";
  const customFlows: Record<string, string> = {
    C01: "招标 PDF ➔ RFP 偏离表",
    C02: "技术方案 ➔ 合规风险表",
    C03: "竞品文档 ➔ 对比矩阵图",
    C07: "PRD 文档 ➔ 结构化脑图",
    C11: "API PRD ➔ OpenAPI 契约",
    C21: "布局原型 ➔ React 组件",
    C36: "代码仓库 ➔ 安全扫描报告",
  };
  if (customFlows[componentId]) return customFlows[componentId];
  const inputClean = comp.previewData?.inputMock?.replace(/上传|选择|输入/g, "")?.slice(0, 7) || "输入";
  const outputClean = comp.previewData?.outputMock?.replace(/输出|生成/g, "")?.slice(0, 7) || "输出";
  return `${inputClean} ➔ ${outputClean}`;
}

// 历史自动化任务
interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  time: string;
  outputData?: any;
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
  const { boundComponentIds, refreshBoundComponents, addRecentUsed, userState, setUserState } = useAppContext();

  const newBoundComponentId = searchParams.get("newBoundComponentId");

  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceType, setWorkspaceType] = useState<"PERSONAL" | "ENTERPRISE">("PERSONAL");
  const [userRole, setUserRole] = useState<"Owner" | "Admin" | "Member" | "Viewer" | "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | "ComponentManager" | "KnowledgeManager">("Owner");
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [authData, setAuthData] = useState<CurrentAuth | null>(null);

  // 新装配通知 Banner 状态
  const [showNewBoundBanner, setShowNewBoundBanner] = useState(false);
  const [newBoundComp, setNewBoundComp] = useState<any>(null);
  const bannerTimeoutRef = useRef<any>(null);

  // 状态管理
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [workspaceToken, setWorkspaceToken] = useState<number>(12580);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);
  const [showSpaceManagementDropdown, setShowSpaceManagementDropdown] = useState(false);
  const spaceManagementDropdownRef = useRef<HTMLDivElement>(null);

  // 快速自动化执行状态
  const [quickSelectedCompId, setQuickSelectedCompId] = useState<string>("");
  const [quickInputMaterial, setQuickInputMaterial] = useState<string>("");
  const [quickSubStep, setQuickSubStep] = useState<"select" | "material">("select");
  const [isExecutingTask, setIsExecutingTask] = useState(false);

  // 子选项
  const [compSubTab, setCompSubTab] = useState<"bound" | "recommend" | "all">("bound");
  const [taskFilter, setTaskFilter] = useState<"all" | "success" | "failed">("all");

  // 数据源
  // TODO: 后续应调用 /api/studio?action=tasks 从后端获取真实任务记录
  const [recentTasks, setRecentTasks] = useState<TaskRecord[]>([]);

  // TODO: 后续应调用 /api/studio?action=documents 从后端获取真实资料文档
  const [assets, setAssets] = useState<AssetRecord[]>([]);

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
          const blockedLog = `❌ 安全拦截：检测到该组件存在 ${hasTaskData ? "任务运行历史、" : ""}${hasResultData ? "成果数据文件、" : ""}${hasKnowledgeData ? "沉淀知识资产" : ""}等数据依存关系，强行阻断！`;
          setCheckLogs(prev => [...prev, blockedLog, "⚠️ 诊断失败：根据安全合规生命周期规范，必须清空历史数据后才可卸载。"]);
          setUninstallStep("blocked");
        } else {
          setCheckLogs(prev => [...prev, "✔ 诊断通过：组件没有任何历史任务数据与存储挂载占用！"]);
          setUninstallStep("confirm");
        }
      }
    }, 300);
  };

  // 一键清理当前组件在此空间的关联历史记录以接触安全拦截
  const handleClearComponentData = () => {
    setTimeout(() => {
      setRecentTasks(prev => prev.filter(t => t.componentId !== uninstallingComponentId));
      setResults(prev => prev.filter(r => r.componentId !== uninstallingComponentId));
      setKnowledges(prev => prev.filter(k => !k.sourceComponent.includes(uninstallingComponentId!)));
      toast.success("数据清理完成，诊断安全系数已重设！");
      setUninstallStep("confirm"); // 清理完成后状态直接进入确认卸载
    }, 800);
  };

  // 调用 API 解绑卸载组件
  const handleConfirmUninstall = async () => {
    try {
      setUninstallStep("idle");
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "unbind",
          workspaceId,
          componentId: uninstallingComponentId,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success("组件卸载成功，已切断本地授权！");
          
          // 同步清除该组件在此空间下的所有任务、成果和知识沉淀，以做完整卸载状态同步
          setRecentTasks(prev => prev.filter(t => t.componentId !== uninstallingComponentId));
          setResults(prev => prev.filter(r => r.componentId !== uninstallingComponentId));
          setKnowledges(prev => prev.filter(k => !k.sourceComponent.includes(uninstallingComponentId!)));
          
          // 刷新本地全局绑定组件状态
          await refreshBoundComponents(workspaceId);
        } else {
          throw new Error(data.message || "解绑组件失败");
        }
      } else {
        throw new Error("卸载请求失败，接口未响应");
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
      const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`);
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
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
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
        const myUserId = localStorage.getItem("userId") || "usr_owner";
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

      const authToken = localStorage.getItem("auth_token");
      const res = await fetch(`/api/workspace/members?workspaceId=${workspaceId}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        let list = data.members || [];
        
        // 找出当前用户的角色
        const myUserId = localStorage.getItem("userId");
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

  const handleTabGenerateCode = async () => {
    try {
      setGeneratingCode(true);
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
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
      const authToken = localStorage.getItem("auth_token");
      const res = await fetch("/api/workspace/clear-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ workspaceId, confirmText: "确认重置" }),
      });

      if (res.ok) {
        toast.success("空间数据已清空重置");
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
      const authToken = localStorage.getItem("auth_token");
      const res = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ workspaceId, action: "DEACTIVATE" }),
      });

      if (res.ok) {
        toast.success("工作空间已成功停用，正在返回中枢...");
        setShowDeleteConfirm(false);
        setDeleteConfirmText("");
        router.push("/workspace-hub");
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

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setAuthData(null);

      const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/workspace/list", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        const workspace = data.workspaces.find((w: any) => w.id === id);
        if (workspace) {
          setWorkspaceId(id);
          setWorkspaceName(workspace.name);
          setWorkspaceType(workspace.type);
          // 对角色进行格式归一化处理，兼容后端返回的全大写 (如 OWNER, ADMIN, COMPONENT_MANAGER)
          const getNormalizedRole = (
            role: string
          ): "Owner" | "Admin" | "ComponentManager" | "KnowledgeManager" | "Member" => {
            if (!role) return "Owner";
            const upper = role.toUpperCase().replace(/_/g, "");
            if (upper === "OWNER") return "Owner";
            if (upper === "ADMIN") return "Admin";
            if (upper === "COMPONENTMANAGER" || upper === "COMPONENTADMIN") return "ComponentManager";
            if (upper === "KNOWLEDGEMANAGER" || upper === "KNOWLEDGEADMIN") return "KnowledgeManager";
            return "Member";
          };
          setUserRole(getNormalizedRole(workspace.role));
          
          // 同步更新全局 Context 的当前活跃空间 ID，彻底消除多重并发覆盖漏洞
          setUserState(prev => ({ ...prev, currentWorkspaceId: id }));

          let membershipLevel = "FREE";
          try {
            const profileRes = await fetch("/api/user/profile");
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              if (profileData.success && profileData.data) {
                membershipLevel = profileData.data.membershipLevel || "FREE";
              }
            }
          } catch (err) {
            console.error("加载会员失败", err);
          }

          await refreshBoundComponents(id);

          try {
            const rRes = await fetch(`/api/studio?action=restricted&workspaceId=${id}`);
            if (rRes.ok) {
              const rData = await rRes.json();
              if (rData.success) setRestrictedComponentIds(rData.data || []);
            }
          } catch (e) {
            console.error("加载受限组件失败", e);
          }

          try {
            const qRes = await fetch("/api/user/workspace-hub/quota");
            if (qRes.ok) {
              const qData = await qRes.json();
              const wsData = qData.data?.workspaces?.find((w: any) => w.id === id);
              if (wsData?.quota) setWorkspaceToken(Number(wsData.quota.tokenBalance));
            }
          } catch (e) {
            console.error("加载调用配额失败", e);
          }

          setAuthData({
            workspaceType: workspace.type,
            userRole: workspace.role || "Owner",
            membershipLevel,
            allowedComponentIds: []
          });
          setWorkspaceId(id);
          setLoading(false);
        } else {
          toast.error("工作空间不存在，正在返回中枢...");
          router.push("/workspace-hub");
        }
      } else {
        const errorText = await res.text();
        console.error(`[loadWorkspace] /api/workspace/list 失败, status: ${res.status}, body: ${errorText}`);
        if (res.status === 401) {
          router.push("/auth/login");
        } else {
          toast.error(`加载工作空间列表失败 (${res.status})，请尝试刷新页面`);
          setLoading(false);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("加载工作空间时发生异常");
      setLoading(false);
    }
  }, [refreshBoundComponents, router, toast]);

  useEffect(() => {
    if (params.id) {
      const idStr = Array.isArray(params.id) ? params.id[0] : params.id;
      setWorkspaceId(idStr);
      loadWorkspace(idStr);
    }
  }, [params.id]);

  useEffect(() => {
    if (workspaceId) {
      loadComponentStates();
    }
  }, [workspaceId]);

  // 监听新绑定的组件参数以弹出 Banner 提示和自聚焦
  useEffect(() => {
    const newBoundId = searchParams.get("newBoundComponentId");
    if (newBoundId) {
      const comp = COMPONENTS.find(c => c.id === newBoundId);
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
    setUserState((prev) => ({
      ...prev,
      currentWorkspaceId: targetId,
      workspaces: prev.workspaces.map((ws) => ({ ...ws, isCurrent: ws.id === targetId })),
    }));
    setShowSpaceManagementDropdown(false);
    window.location.href = `/workspace/${targetId}`;
  };

  const allowedComponentIds = authData
    ? (authData.workspaceType === "PERSONAL"
        ? (authData.membershipLevel === "FREE"
            // FREE 用户：允许非 Premium 组件 + 强制包含 3 个默认推荐组件（保障中枢与工作台 100% 一致）
            ? Array.from(new Set([...COMPONENTS.filter(c => !c.isPremium).map(c => c.id), "C01", "C02", "C03"]))
            : COMPONENTS.map(c => c.id))
        : Array.from(new Set([...DEFAULT_ALLOWED_COMPONENT_IDS, ...boundComponentIds, ...(newBoundComponentId ? [newBoundComponentId] : [])])))
    : [];

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
    const isPremium = COMPONENTS.find(c => c.id === quickSelectedCompId)?.isPremium;
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

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 处理成功，生成结构化数据
    const taskName = `${COMPONENTS.find(c => c.id === quickSelectedCompId)?.name}自动化任务`;
    const newTask: TaskRecord = {
      id: `T-${Date.now().toString().slice(-4)}`,
      name: taskName,
      componentId: quickSelectedCompId,
      componentName: COMPONENTS.find(c => c.id === quickSelectedCompId)?.name || "",
      tokenUsed: isPremium ? 15 : 5,
      status: "SUCCESS",
      time: "刚刚",
      outputData: {
        summary: "系统已自动解析研发材料内容，提取并生成了规范结构化数据偏离比对表。",
        conclusions: ["经格式比对，检测到共 3 处可能偏离团队标准的描述条款，已进行了高亮和重整。", "前后端接口协议对齐一致度 98.5%。"],
        deviations: [
          { item: "交付工期说明", rfp: "要求 90 天内交付", actual: "评估拟定 120 天，发生轻微偏离", risk: "偏离警告，建议调整交付排期" }
        ],
        risks: ["由于历史代码耦合，存在调用溢出风险，请遵循最新 SOP 设计"],
        advices: ["建议后续在此接口中引入自愈缓存", "在与合作方商议时使用本推荐条款模板"]
      }
    };

    setRecentTasks(prev => [newTask, ...prev]);
    setWorkspaceToken(prev => Math.max(0, prev - newTask.tokenUsed));
    setSelectedTask(newTask);
    setIsExecutingTask(false);
    toast.success("数据自动化处理完毕！分析结果已生成。");
  };

  const handleImportAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importAssetForm.title.trim() || !importAssetForm.content.trim()) {
      toast.error("请填入完整的信息");
      return;
    }
    const newAsset: AssetRecord = {
      id: `A-${Date.now().toString().slice(-4)}`,
      title: importAssetForm.title,
      size: `${Math.round(importAssetForm.content.length * 1.5 / 1024 * 10) / 10} KB`,
      type: importAssetForm.type.toUpperCase(),
      time: "刚刚",
      content: importAssetForm.content
    };
    setAssets(prev => [newAsset, ...prev]);
    setShowImportAssetModal(false);
    toast.success("原始文件已成功作为输入材料导入空间资料库！");
  };

  const handleSaveToKnowledge = (task: TaskRecord) => {
    const isExist = knowledges.find(k => k.title.includes(task.componentName));
    if (isExist) {
      toast.info("该自动化分析成果已存入规范库，请勿重复操作");
      return;
    }
    const newKnowledge: KnowledgeRecord = {
      id: `K-${Date.now().toString().slice(-4)}`,
      title: `${task.componentName}标准化研发规范及偏离防范SOP`,
      sourceComponent: `${task.componentId} ${task.componentName}`,
      time: "刚刚",
      status: workspaceType === "PERSONAL" ? "APPROVED" : "PENDING"
    };
    setKnowledges(prev => [newKnowledge, ...prev]);
    if (workspaceType === "PERSONAL") {
      toast.success("规范库沉淀归档成功！已直接更新。");
    } else {
      toast.success("提交成功！已向规范库管理员发起归档审批流申请。");
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
    const matched = COMPONENTS.find(c => 
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
      toast.success("已成功智能定位并匹配效能组件！");
    } else {
      setAiMatchedComponent(null);
      toast.info("未能自动识别到高度匹配的组件，建议手动选择。");
    }
  };

  // ------------------ 动态右侧侧栏联动求值 ------------------
  const renderRightPanel = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* 计费/点数配额卡片 */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>服务调用配额</span>
                <span className="text-xs text-slate-400 font-medium">实时更新</span>
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">当前可用调用点数</span>
                  <span className="text-slate-800 font-mono font-bold">
                    {workspaceType === "PERSONAL" ? "无配额限制" : `${workspaceToken.toLocaleString()} 点`}
                  </span>
                </div>
                {workspaceType === "ENTERPRISE" && (
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, (workspaceToken / 20000) * 100)}%` }} />
                  </div>
                )}
                {workspaceType === "ENTERPRISE" && workspaceToken < 1000 && (
                  <p className="text-xs text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-100">⚠️ 可用额度不足 1,000 点，请联系管理员及时充值</p>
                )}
              </div>
              <button onClick={handleUpgradeClick} className="w-full h-10 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5">
                <span>💎 升级套餐 / 购买点数额度</span>
              </button>
            </div>

            {/* 常规工作入口 */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100">
                常规工作入口
              </h4>
              <div className="space-y-2 text-xs">
                <button onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-blue-100 hover:bg-blue-50/20 flex justify-between items-center text-slate-600 hover:text-[#3182ce] transition-all cursor-pointer">
                  <span className="font-bold">⚡ 快速发起处理任务</span> <span>➔</span>
                </button>
                <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:border-blue-100 hover:bg-blue-50/20 flex justify-between items-center text-slate-600 hover:text-[#3182ce] transition-all cursor-pointer">
                  <span className="font-bold">📥 导入本地原始文档</span> <span>➔</span>
                </button>
              </div>
            </div>
          </div>
        );

      case "quick":
        const selectedComp = COMPONENTS.find(c => c.id === quickSelectedCompId);
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100">
              数据处理前置条件检查
            </h4>
            <div className="space-y-3.5 text-xs font-medium text-slate-600">
              <div className="flex justify-between items-center">
                <span>解析组件状态</span>
                <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${quickSelectedCompId ? "text-blue-700 bg-blue-50 border border-blue-100" : "text-rose-700 bg-rose-50 border border-rose-100"}`}>
                  {quickSelectedCompId ? `[已选 ${quickSelectedCompId}]` : "✕ 未选择"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>待处理材料</span>
                <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${quickInputMaterial.trim() ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-rose-700 bg-rose-50 border border-rose-100"}`}>
                  {quickInputMaterial.trim() ? "✔ 已就绪" : "✕ 未配置"}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-3.5">
                <span>预计消耗点数</span>
                <span className="text-[#3182ce] font-mono text-xs font-bold">
                  {quickSelectedCompId && selectedComp?.isPremium ? "15 点" : "5 点"}
                </span>
              </div>
            </div>
            {quickSelectedCompId && (
              <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100/50 text-xs font-semibold text-slate-500 leading-relaxed space-y-1 text-left">
                <p>💡 <span className="text-slate-700 font-bold">输入要求</span>: {selectedComp?.previewData?.inputMock || "上传或粘贴文本文档"}</p>
                <p>📋 <span className="text-slate-700 font-bold">典型成果</span>: {selectedComp?.previewData?.outputMock || "导出偏离报告或契约数据"}</p>
              </div>
            )}
          </div>
        );

      case "components":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100">
              组件使用说明
            </h4>
            <div className="text-xs font-medium text-slate-500 space-y-3 leading-relaxed">
              <p>• <span className="text-slate-700 font-bold">已装配组件</span> 代表当前工作空间已关联并可随时调用的自动化工具大纲。</p>
              <p>• <span className="text-slate-700 font-bold">企业空间</span> 下组件的可用性遵循岗位安全授权矩阵，普通角色需申请分配后方可调用。</p>
            </div>
            <button onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)} className="w-full h-10 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <span>🧩 挑选并装配新组件</span>
            </button>
          </div>
        );

      case "tasks":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100">
              任务日志统计
            </h4>
            <div className="space-y-3.5 text-xs font-medium text-slate-600">
              <div className="flex justify-between items-center">
                <span>累计执行次数</span>
                <span className="text-slate-800 font-mono font-bold">{recentTasks.length} 次</span>
              </div>
              <div className="flex justify-between items-center">
                <span>处理成功率</span>
                <span className="text-emerald-600 font-mono font-bold">
                  {recentTasks.length ? `${Math.round((recentTasks.filter(t => t.status === "SUCCESS").length / recentTasks.length) * 100)}%` : "0%"}
                </span>
              </div>
            </div>
          </div>
        );

      case "assets":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100">
              存储指标说明
            </h4>
            <div className="space-y-3.5 text-xs font-medium text-slate-600">
              <div className="flex justify-between items-center">
                <span>当前已用空间</span>
                <span className="text-slate-800 font-mono font-bold">1.6 MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span>支持文件格式</span>
                <span className="text-slate-800 font-bold">PDF, TXT, MD, DOCX</span>
              </div>
            </div>
            <button onClick={() => { setImportAssetForm({ title: "", content: "", type: "input" }); setShowImportAssetModal(true); }} className="w-full h-10 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <span>📥 导入新资产文件</span>
            </button>
          </div>
        );

      case "results":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
                成果预览与下载中心
              </h3>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">本列表保存了历次自动化工具运行成功后生成的标准报告，支持一键预览与导出离线归档。</p>
            </div>
            {results.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold py-4 text-center">暂无成果报告可导出。</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {results.map(res => (
                  <div key={res.id} className="p-3 bg-slate-50/50 rounded-xl border border-slate-200/60 flex justify-between items-center text-xs font-medium">
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-slate-700 truncate block">[{res.componentId}] {res.title}</span>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">{res.time}</span>
                    </div>
                    <button onClick={() => {
                      const targetTask = recentTasks.find(t => t.componentId === res.componentId);
                      if (targetTask) setSelectedTask(targetTask);
                    }} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-bold shrink-0">
                      预览导出
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "knowledge":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
                团队 SOP 避坑规范归档
              </h3>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">在任务成果中心可以将标准规范经验一键入库，并自动沉淀至团队规范标签页下。</p>
            </div>
            <div className="p-3 bg-slate-50/40 rounded-xl border border-slate-200/60 text-xs font-semibold text-slate-500 leading-relaxed text-left">
              通过沉淀的规约 SOP，可以让大团队形成统一的开发和审核标准，减少重复踩坑。
            </div>
          </div>
        );

      case "members":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
              协同成员管理指南
            </h3>
            <div className="p-3 bg-slate-50/40 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-500 leading-relaxed">
              个人空间不支持多用户协同。升级为企业版空间后，可以在主页面“管理成员”里一键邀请其他研发与测试岗位。
            </div>
          </div>
        );

      case "permissions":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
              研发矩阵与安全设置
            </h3>
            <div className="p-3 bg-slate-50/40 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-500 leading-relaxed">
              矩阵安全策略控制了组件在工作区间的执行等级权限，可在空间配置中根据企业规范自由组合。
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm text-left space-y-4 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100 uppercase tracking-wider">
              空间调用分析仪表盘
            </h3>
            <div className="p-3 bg-slate-50/40 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-500 leading-relaxed">
              这里是调用分析快速统计面板。更完整的费用扣减细明细和效能转化漏斗请点击大标题前往独立大盘页。
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

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            workspaceId={workspaceId}
            boundComponentIds={boundComponentIds}
            recentTasks={recentTasks}
            assets={assets}
            knowledges={knowledges}
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
                { key: "material", label: "路径 B: 智能匹配组件" }
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
                      .filter(c => allowedComponentIds.includes(c.id) && boundComponentIds.includes(c.id))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.id}] {c.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">输入或粘贴源材料内容</label>
                  <textarea
                    value={quickInputMaterial}
                    onChange={(e) => setQuickInputMaterial(e.target.value)}
                    placeholder="在此输入招标文件、系统 PRD、接口样例或代码进行分析..."
                    className="w-full h-36 p-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none resize-none transition-all font-sans leading-relaxed"
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
                    disableReason = "当前空间服务调用点数不足，请升级或联系管理员";
                  }

                  return (
                    <div className="space-y-3 pt-1">
                      {disableReason && (
                        <div className="text-xs font-semibold text-rose-600 bg-rose-50/80 p-2.5 rounded-lg border border-rose-100 flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
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
                  <label className="text-[11px] font-bold text-slate-400 block tracking-wider uppercase">请用自然语言描述您的研发任务诉求</label>
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
                          className="px-2.5 py-1 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#3b8ad6] hover:to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-[10px] font-black rounded shadow-sm hover:shadow hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                        >
                          {isRefiningAi ? (
                            <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>✨ 智能润色</span>
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
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow-sm hover:shadow transition-all whitespace-nowrap"
                    >
                      一键装填执行
                    </button>
                  </div>
                )}
                <button
                  onClick={handleAIAssist}
                  disabled={!aiQuery.trim()}
                  className="w-full h-10 bg-slate-50 hover:bg-emerald-50/30 text-slate-600 hover:text-emerald-700 disabled:text-slate-400 text-xs font-bold rounded-lg border border-slate-200/80 hover:border-emerald-200/50 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                >
                  <HelpCircle className="w-4 h-4 text-emerald-500" />
                  <span>智能匹配推荐组件</span>
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
            boundComponentIds={boundComponentIds}
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
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Database className="w-4 h-4 text-[#3182ce]" /> 空间原始输入资料
              </h3>
              <button
                onClick={() => {
                  setImportAssetForm({ title: "", content: "", type: "input" });
                  setShowImportAssetModal(true);
                }}
                className="text-xs text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 导入新资料
              </button>
            </div>

            {assets.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-8">空间内暂无原始资产。支持格式: PDF / Markdown / Word / JSON。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-500 border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-xs font-bold">
                      <th className="py-3 px-4">文件名称</th>
                      <th className="py-3 px-3">大小</th>
                      <th className="py-3 px-3">创建时间</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white/40">
                    {assets.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-700 truncate max-w-[200px]" title={doc.title}>{doc.title}</td>
                        <td className="py-3.5 px-3 text-slate-400 font-mono">{doc.size}</td>
                        <td className="py-3.5 px-3 text-slate-400 font-mono">{doc.time}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-xs">
                          <button
                            onClick={() => {
                              setPreviewData({ title: doc.title, content: doc.content || "内容为空。" });
                              setShowPreviewModal(true);
                            }}
                            className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer"
                          >
                            查看
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case "results":
        return (
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
            <div className="pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-[#38a169]" /> 结果中心 (已生成 analysis 报告)
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
                          <td className="py-3.5 px-3 font-mono text-slate-400">{task.componentId}</td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 bg-emerald-50/80 text-emerald-600 rounded-lg border border-emerald-100/50 text-[10px] font-bold">可导出</span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-xs">
                            <button
                              onClick={() => openStructurePreview(task)}
                              className="text-[#38a169] hover:text-[#2e7d32] hover:underline cursor-pointer"
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
          <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
            <div className="pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <BookOpen className="w-4 h-4 text-amber-500" /> 团队规范库
              </h3>
            </div>

            {knowledges.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-8">空间团队规范库当前为空。任务处理成功后可归档沉淀入库。</p>
            ) : (
              <div className="space-y-3">
                {knowledges.map(doc => (
                  <div key={doc.id} className="p-4 bg-slate-50/50 hover:bg-white border border-slate-200/70 rounded-2xl flex items-center justify-between text-xs font-semibold hover:shadow-sm transition-all duration-300">
                    <div className="flex items-center gap-3 text-left min-w-0 pr-4">
                      <span className="text-xl shrink-0">📚</span>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 truncate block">{doc.title}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-1 truncate">SOP 规则大纲 / 关联组件: {doc.sourceComponent}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const matchedTask = recentTasks.find(t => `${t.componentId} ${t.componentName}` === doc.sourceComponent || doc.title.includes(t.componentName));
                        setPreviewData({
                          title: doc.title,
                          content: matchedTask?.outputData?.summary || `标准化规范已正式归档。详情请参考关联任务：${doc.sourceComponent}。`
                        });
                        setShowPreviewModal(true);
                      }}
                      className="text-xs text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-bold cursor-pointer transition-colors whitespace-nowrap"
                    >
                      查阅规范
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            {/* 1. 顶部标题栏 */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                  <Users className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">
                    {canTabManage ? "成员与协作管理" : "空间协同作者"}
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold">
                    {canTabManage ? "直观管理您的空间协作成员与获取专属邀请链接" : "实时查看当前工作空间下的研发协同伙伴与开发岗位"}
                  </p>
                </div>
              </div>
              
              {workspaceType === "PERSONAL" ? (
                <span className="text-[10px] px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded font-bold">
                  个人自主空间
                </span>
              ) : (
                <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded font-bold">
                  企业版协作空间
                </span>
              )}
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
                      const myUserId = localStorage.getItem("userId");
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
                        ? "bg-purple-400"
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

                            {/* 角色切换下拉框 / 真实角色标签徽章 */}
                            {canChangeTargetRole ? (
                              <select
                                value={m.role}
                                onChange={(e) => handleTabChangeRole(m.userId, e.target.value)}
                                className="px-2.5 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded-lg focus:outline-none font-bold cursor-pointer text-slate-700 hover:border-[#3182ce]/50 transition-colors"
                              >
                                <option value="MEMBER">👤 协同成员</option>
                                <option value="ADMIN">🔧 管理员</option>
                                <option value="OWNER">👑 所有者</option>
                              </select>
                            ) : (
                              <span className={`text-[11px] px-2.5 py-1 rounded-lg font-extrabold select-none border ${roleBadgeCls}`}>
                                {isTargetOwner
                                  ? "👑 空间所有者"
                                  : isTargetAdmin
                                  ? "🔧 空间管理员"
                                  : "👤 协同成员"}
                              </span>
                            )}

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
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm">
                          ✉️
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span>{inv.email || "公开链接邀请中"}</span>
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] rounded font-bold">等待激活 (Pending)</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">邀请码: {inv.code} · 受邀伙伴尚未激活登录</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-[10px] text-slate-400 font-semibold hidden lg:inline">
                          到期时间: {new Date(inv.expiresAt).toLocaleDateString("zh-CN")}
                        </div>
                        <span className="text-[11px] px-2.5 py-1 bg-amber-50/60 border border-amber-200 rounded-lg text-amber-700 font-extrabold select-none">
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
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-inner space-y-3 animate-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 text-amber-705">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
                  <h4 className="text-xs font-black">个人版空间协作受限提示</h4>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  当前处于个人版工作空间，系统不支持多用户协同参与自动化研发设计。升级为企业协同空间后，您可以一键分配开发岗位，并按照安全矩阵执行算力管控。
                </p>
                <button
                  onClick={handleUpgradeClick}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg text-xs font-bold shadow hover:shadow-md transition-all cursor-pointer"
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
                    className="h-10 px-4.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#3b8ad6] hover:to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow cursor-pointer transition-all shrink-0 flex items-center justify-center gap-1"
                  >
                    {generatingCode ? "正在生成..." : "🔑 生成专属邀请码"}
                  </button>

                  {invitationCode && (
                    <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 bg-slate-50 border rounded-lg px-3 py-2 text-xs font-mono text-slate-700 flex items-center justify-between gap-3 border-slate-200">
                        <span className="truncate">邀请码: <strong className="text-indigo-600 font-extrabold">{invitationCode}</strong> (有效期 {inviteExpiresInDays} 天)</span>
                        <button
                          onClick={() => {
                            const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitationCode}\n🔗 一键快捷加入通道：${window.location.origin}/workspace-hub?inviteCode=${invitationCode}\n\n—— 知阁·舟坊：高效、智能的现代化一站式全栈架构与协同开发平台`;
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
                          const promoLinkText = `【知阁·舟坊】项目协同邀请函 ✉️\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n🚀 专属快捷加入链接（点击即入）：${joinUrl}\n\n—— 知阁·舟坊：高效、智能的团队研发协同中枢，让开发化繁为简。`;
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
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-600">已过期</span>
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
                                  const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitation.code}\n🔗 一键快捷加入通道：${joinUrl}\n\n—— 知阁·舟坊：高效、智能的现代化一站式全栈架构与协同开发平台`;
                                  navigator.clipboard.writeText(promoText);
                                  toast.success("已成功复制全部邀请卡片信息！");
                                }}
                                className={`px-2 py-2 border text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                                  isInvalid
                                    ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                    : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
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
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left animate-in fade-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#3182ce]" /> 研发组件安全授权矩阵
              </h3>
              <button onClick={() => setActiveTab("settings")} className="text-xs text-[#3182ce] hover:underline font-black cursor-pointer">
                管理安全矩阵
              </button>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-600 leading-relaxed">
              这里是研发组件安全授权矩阵。支持按岗位职责限制特定的自动化流程组件被越权运行，规范空间服务点数消耗。
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4 text-left animate-in fade-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-[#3182ce]" /> 空间服务调用频率与效能统计
              </h3>
              <button onClick={() => router.push(`/workspace/${workspaceId}/stats`)} className="text-xs text-[#3182ce] hover:underline font-black cursor-pointer">
                查看效能大盘
              </button>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-semibold text-slate-600 leading-relaxed">
              企业空间专属模块。提供每个组件在周期内的调用频次、抵扣明细和项目工期优化趋势分析。
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
                  <span className="text-xs font-bold text-green-600 mt-1.5 block flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
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

                  {/* 底部保存按钮 */}
                  <div className="border-t border-slate-100 pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="zg-btn zg-btn-primary flex items-center gap-1.5 shadow-md shadow-[#3182ce]/20 px-5"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingSettings ? "正在保存..." : "保存空间修改"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 危险操作区 Danger Zone */}
            {!settingsLoading && (
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
                        className="px-3.5 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-bold cursor-pointer shrink-0 self-start sm:self-center shadow-sm"
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
  };

  // SSR与CSR水合拦截哨兵
  if (!hasMounted || loading || !authData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#f1f5f9] via-[#e2e8f0] to-[#cbd5e1]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-bold text-xs">正在加载空间数据中...</p>
        </div>
      </div>
    );
  }

  // 派生 Tabs 列表
  let tabsList: { key: string; label: string }[] = [];
  if (workspaceType === "PERSONAL") {
    tabsList = [
      { key: "overview", label: "总览" },
      { key: "quick", label: "快速任务" },
      { key: "components", label: "组件" },
      { key: "tasks", label: "任务" },
      { key: "assets", label: "资料" },
      { key: "results", label: "结果" },
      { key: "knowledge", label: "知识库" },
      { key: "settings", label: "设置" }
    ];
  } else {
    // 企业空间 (让所有协同成员默认有权只读查看成员列表)
    tabsList = [
      { key: "overview", label: "总览" },
      { key: "quick", label: "快速任务" },
      { key: "components", label: "组件" },
      { key: "tasks", label: "任务" },
      { key: "assets", label: "资料" },
      { key: "results", label: "结果" },
      { key: "knowledge", label: "知识库" },
      { key: "members", label: "成员" }
    ];

    if (userRole === "Owner" || userRole === "Admin") {
      tabsList.push(
        { key: "permissions", label: "权限" },
        { key: "stats", label: "统计" },
        { key: "logs", label: "日志" },
        { key: "settings", label: "设置" }
      );
    } else if (userRole === "ComponentManager") {
      tabsList.push(
        { key: "permissions", label: "组件授权" },
        { key: "settings", label: "组件配置" }
      );
    } else if (userRole === "KnowledgeManager") {
      tabsList.push(
        { key: "settings", label: "知识审核" }
      );
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] flex flex-col font-sans relative">
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
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between z-40 shadow-[0_1px_3px_rgba(0,0,0,0.02)] relative">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-1.5 text-slate-600 hover:text-[#2b6cb0] transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="font-bold text-xs sm:text-xs hidden xs:inline">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-300 flex-shrink-0" />
          
          <div className="flex items-center gap-2 min-w-0 text-left">
            <span className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md font-bold">🏢</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-800 text-xs sm:text-xs truncate">{workspaceName}</span>
                <span className="text-xs text-slate-400 font-bold">/</span>
                <span className="text-xs text-slate-500 font-bold">工作控制台</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="relative" ref={spaceManagementDropdownRef}>
            <button
              onClick={() => setShowSpaceManagementDropdown(!showSpaceManagementDropdown)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#3182ce] hover:border-[#3182ce]/30 text-xs font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
            >
              <span>快速切换空间</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {showSpaceManagementDropdown && (() => {
              // 动态计算按钮位置，将下拉框用 fixed 定位挂载到视口层级，彻底避免任何父容器遮挡
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
              return (
                <div
                  style={dropdownStyle}
                  className="w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-100 py-1.5 text-left animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  {userState?.workspaces && userState.workspaces.length > 0 && (
                    <div className="px-3.5 py-2">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">切换至其他工作空间</p>
                      <div className="space-y-1 max-h-[160px] overflow-y-auto">
                        {userState.workspaces.map((workspace) => (
                          <button
                            key={workspace.id}
                            onClick={() => handleSwitchWorkspace(workspace.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] border transition-all text-left cursor-pointer ${
                              workspace.id === workspaceId ? "bg-blue-50/60 border-blue-100/50" : "bg-white border-transparent"
                            }`}
                          >
                            <span className={`text-xs truncate font-bold ${workspace.id === workspaceId ? 'text-[#3182ce]' : 'text-slate-700'}`}>{workspace.name}</span>
                            {workspace.id === workspaceId && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* 空间名片摘要固定区 */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5 text-left shadow-sm relative z-10">
        {/* 新装配组件通知 Banner */}
        {showNewBoundBanner && newBoundComp && (
          <div className="max-w-6xl mx-auto mb-4 bg-blue-50/90 border border-blue-200/80 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* 左侧的小叉关闭按钮 */}
              <button
                onClick={() => setShowNewBoundBanner(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100/50 transition-colors cursor-pointer shrink-0 flex items-center justify-center w-6 h-6 border-none bg-transparent"
                title="关闭提示"
              >
                <span className="text-xs font-black">✕</span>
              </button>
              <p className="text-xs text-slate-700 font-semibold leading-normal truncate">
                🚀 您刚刚装配了 <span className="text-blue-700 font-black">[{newBoundComp.name}]</span> 效能组件，现在即可
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

        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-800 tracking-tight">{workspaceName}</h1>
              {workspaceType === "PERSONAL" ? (
                <span className="text-xs px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded border border-blue-100 font-extrabold">👤 个人空间</span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-[#d97706] rounded border border-amber-100 font-extrabold">🏢 企业协同空间</span>
              )}
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-extrabold">
                岗位角色: {userRole === "Owner" ? "👑 所有者" : userRole === "Admin" ? "🔧 管理员" : userRole === "ComponentManager" ? "🧩 组件管理员" : userRole === "KnowledgeManager" ? "📚 规范库管理员" : "👤 协作成员"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-2xl leading-relaxed">
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
              className="flex-1 md:flex-none h-9 px-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 fill-current" />
              <span>开始新任务</span>
            </button>
            <button
              onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)}
              className="flex-1 md:flex-none h-9 px-4 bg-white border border-[#3182ce]/35 text-[#3182ce] hover:bg-blue-50/30 text-xs font-bold rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              挑选装配大厅
            </button>
          </div>
        </div>

        {/* 横向功能标签页 (Tabs) 切换区 */}
        <div className="max-w-6xl mx-auto mt-4 pt-1 flex gap-1.5 overflow-x-auto scrollbar-none border-t border-slate-100">
          {tabsList.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-bold border-b-2 shrink-0 cursor-pointer transition-all ${
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
      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-visible relative z-10">
        
        {children ? (
          <div className="lg:col-span-12 space-y-6">
            {children}
          </div>
        ) : (
          <>
            {/* 左侧主内容区 */}
            <div className={`${(activeTab === "components" || activeTab === "settings" || activeTab === "members") ? "lg:col-span-12" : "lg:col-span-8"} space-y-6`}>
              {renderTabContent()}
            </div>

            {/* 右侧上下文辅助栏 */}
            {(activeTab !== "components" && activeTab !== "settings" && activeTab !== "members") && (
              <div className="lg:col-span-4 space-y-4">
                {renderRightPanel()}
              </div>
            )}
          </>
        )}
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
          const newAsset = {
            id: `A-${Date.now()}`,
            title: data.title,
            size: `${Math.ceil(data.content.length / 1024)} KB`,
            type: data.type,
            time: new Date().toISOString().replace('T', ' ').substring(0, 16),
            content: data.content
          };
          setAssets(prev => [newAsset, ...prev]);
          toast.success("原始文件资产已导入！");
        }}
      />

      <ConfirmRunModal
        open={showConfirmRunModal}
        onClose={() => setShowConfirmRunModal(false)}
        onConfirm={handleExecuteSimulation}
        componentName={quickSelectedCompId}
        taskName={quickInputMaterial}
      />

      {/* 4. 任务成果预览与沉淀 Modal */}
      {selectedTask && selectedTask.outputData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-left border border-slate-100 my-8 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  📄 自动化解析报告预览: {selectedTask.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">任务 ID: {selectedTask.id} · 解析组件: [{selectedTask.componentId}] {selectedTask.componentName}</p>
              </div>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 text-sm font-black p-1 cursor-pointer">✕</button>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 text-xs font-bold text-slate-700 leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-800">成果物摘要：</h4>
                <p className="bg-slate-50 p-2.5 rounded border text-slate-600 font-semibold">{selectedTask.outputData.summary}</p>
              </div>

              {selectedTask.outputData.conclusions && selectedTask.outputData.conclusions.length > 0 && (
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-800">关键结论明细：</h4>
                  <ul className="list-disc pl-5 text-slate-600 space-y-0.5 font-semibold">
                    {selectedTask.outputData.conclusions.map((c: string, idx: number) => <li key={idx}>{c}</li>)}
                  </ul>
                </div>
              )}

              {selectedTask.outputData.deviations && selectedTask.outputData.deviations.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-extrabold text-slate-800">条款偏离分析表：</h4>
                  <table className="w-full text-xs border border-slate-200 text-left font-semibold">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 uppercase font-bold border-b">
                        <th className="p-2 border-r">条款项</th>
                        <th className="p-2 border-r">标准规范要求</th>
                        <th className="p-2 border-r">应答比对方案</th>
                        <th className="p-2">偏离提示</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-600">
                      {selectedTask.outputData.deviations.map((d: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/40">
                          <td className="p-2 border-r font-extrabold">{d.item}</td>
                          <td className="p-2 border-r">{d.rfp}</td>
                          <td className="p-2 border-r">{d.actual}</td>
                          <td className="p-2 text-rose-500 font-extrabold">{d.risk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTask.outputData.risks && selectedTask.outputData.risks.length > 0 && (
                <div className="space-y-1">
                  <h4 className="font-extrabold text-rose-500">偏离风险排查清单：</h4>
                  <ul className="list-disc pl-5 text-rose-600 space-y-0.5 font-extrabold">
                    {selectedTask.outputData.risks.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                  </ul>
                </div>
              )}

              {selectedTask.outputData.advices && selectedTask.outputData.advices.length > 0 && (
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-800">整改及设计建议：</h4>
                  <ul className="list-disc pl-5 text-slate-600 space-y-0.5 font-semibold">
                    {selectedTask.outputData.advices.map((a: string, idx: number) => <li key={idx}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t flex justify-between items-center">
              <button 
                onClick={() => handleSaveToKnowledge(selectedTask)}
                className="px-3.5 py-1.5 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-bold rounded-lg shadow cursor-pointer transition-all flex items-center gap-1"
              >
                <span>📚 归档至团队规范</span>
              </button>

              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const mdText = `# ${selectedTask.name} 规范偏离比对报告\n\n## 成果摘要\n${selectedTask.outputData.summary}`;
                    copyToClipboard(mdText);
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>复制 Markdown</span>
                </button>
                <button 
                  onClick={() => { toast.success("正在生成 Word 文档..."); }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-500" />
                  <span>导出 Word</span>
                </button>
                <button 
                  onClick={() => setSelectedTask(null)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 原始资料/规范预览 Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                📚 查阅: {previewData.title}
              </h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-black p-1 cursor-pointer">✕</button>
            </div>
            <div className="bg-slate-50 p-4 rounded border text-xs font-semibold text-slate-600 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {previewData.content}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-1.5 bg-slate-200 hover:bg-slate-400 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">
                关闭
              </button>
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
                        const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitationCode}\n🔗 一键快捷加入通道：${window.location.origin}/workspace-hub?inviteCode=${invitationCode}\n\n—— 知阁·舟坊：高效、智能的现代化一站式全栈架构与协同开发平台`;
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
                        const promoLinkText = `【知阁·舟坊】项目协同邀请函 ✉️\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n🚀 专属快捷加入链接（点击即入）：${joinUrl}\n\n—— 知阁·舟坊：高效、智能的团队研发协同中枢，让开发化繁为简。`;
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

      {/* 确认清空模态框 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 text-left space-y-4">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              确认清空空间数据？
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              此操作将物理清空该空间下的所有组件执行历史、分析报告和归档知识规范。清空后，所有数据将无法恢复。
            </p>
            <div className="space-y-2">
              <p className="text-xs text-slate-700 font-bold">请输入 <strong className="text-rose-600">确认重置</strong> 以确认此操作：</p>
              <input
                type="text"
                placeholder="在此输入“确认重置”"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                className="zg-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearConfirmText("");
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearSettingsData}
                disabled={clearing || clearConfirmText !== "确认重置"}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                {clearing ? "正在重置..." : "确认清空"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认停用模态框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 text-left space-y-4">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              确认停用此工作空间？
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              此操作将物理停用该协作空间，并踢出所有成员。解散后，所有成员将无法访问此空间，该操作不可逆！
            </p>
            <div className="space-y-2">
              <p className="text-xs text-slate-700 font-bold">请输入 <strong className="text-red-600">确认停用</strong> 以确认此操作：</p>
              <input
                type="text"
                placeholder="在此输入“确认停用”"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="zg-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeactivateSettingsWorkspace}
                disabled={deletingSettings || deleteConfirmText !== "确认停用"}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                {deletingSettings ? "正在停用..." : "确认停用"}
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
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
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
                    : "bg-red-600 hover:bg-red-700"
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
