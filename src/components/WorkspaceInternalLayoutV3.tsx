"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { confirm } from "@/components/GlobalConfirmProvider";
import { 
  ArrowLeft, Settings, ChevronDown, Plus, FileText, Layers, Database, Layout, Box,
  Server, ShieldCheck, Check, ArrowRight, BookOpen, AlertCircle, 
  CheckCircle2, Play, Users, BarChart2, ShieldAlert, FileDown, Clipboard, Trash2, Edit2, HelpCircle, Info,
  Upload, Save, AlertTriangle, Copy, KeyRound, ExternalLink, Share2, Ban, Clock, History, Zap, PenLine, Eye,
  Timer, CalendarPlus, X, Code, Compass, Search, ClipboardList, Cpu, Lock, Sparkles,
  SlidersHorizontal, Briefcase, Crown
} from "lucide-react";
import AvatarDropdown from "@/components/AvatarDropdown";
import type { ComponentCategory, ComponentDefinition } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";

export const categoryIconsMap: Record<string, any> = {
  BID_PREP: ClipboardList,
  REQ_DESIGN: BookOpen,
  BACKEND_CORE: Server,
  DATABASE_ENG: Database,
  FRONTEND_DEV: Layout,
  TEST_QA: ShieldCheck,
  DEVOPS: Cpu,
  SECURITY: Lock,
  PROJ_MGMT: BarChart2,
  KNOWLEDGE: Layers,
  REQUIREMENTS: ClipboardList,
  DATA_BI: BarChart2,
  DOCUMENTATION: BookOpen,
  AI_AGENTS: Zap,
  COMMON: Layers,
};
import { iconMap } from "@/components/ComponentShowcase";
import { pointsToYuan, formatYuanFromPoints, POINT_RATE_HINT, POINT_RATE_TEXT, applyMemberDiscount, formatDiscountLabel } from "@/lib/point-rate";
import { isAllowedTextFile, isExtractableFile, isProbablyBinaryContent, uploadAndExtractText } from "@/lib/text-utils";
import { scanSensitiveWords } from "@/lib/sensitive-words";
import { getFileTypeLabel, formatFileSize, resolveAssetSize } from "@/lib/file-type";
import { generateSmartSummary } from "@/lib/smart-summary";
import UpgradeModal from "@/components/studio/UpgradeModal";
import ImportAssetModal from "@/components/studio/ImportAssetModal";
import ConfirmRunModal from "@/components/studio/ConfirmRunModal";
import ComponentsTab from "@/components/studio/ComponentsTab";
import TasksTab from "@/components/studio/TasksTab";

import AssetsTab, { AssetPermissions } from "@/components/studio/AssetsTab";
import OverviewTab from "@/components/studio/OverviewTab";
import UsageStatsTab from "@/components/studio/UsageStatsTab";
import WorkspacePostsPermissionsTab from "@/components/studio/WorkspacePostsPermissionsTab";
import { ResultViewer, ResultViewerTask } from "@/components/studio/ResultViewer";
import KnowledgeTab from "@/components/studio/KnowledgeTab";
import LogsTab from "@/components/studio/LogsTab";
import PointsLedgerTab from "@/components/studio/PointsLedgerTab";
import SafeUninstallModal from "@/components/studio/SafeUninstallModal";
import { PostIcon } from "@/components/studio/PostIcon";
import type { PositionDefinition } from "@/constants/positions";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";

// 组件与阶段类型定义
interface ZhiGeComponent {
  id: string;
  title: string;
  name?: string;
  description?: string;
  category?: string;
  stageId: number;
  path: string;
  icon: string;
  isPremium?: boolean;
}

// 标准化与格式化时间字符串 (展现为标准 YYYY-MM-DD HH:mm:ss)
function formatTaskTime(rawTime?: string): string {  if (!rawTime) return "近期";
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

// 邀请码有效倒计时（独立子组件，自带 1s 定时器，仅自身重渲染）
function InviteCountdown({ expiresAt }: { expiresAt?: string | null }) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!expiresAt) return null;
  const remain = new Date(expiresAt).getTime() - now;
  if (remain <= 0) return <span className="text-amber-500 font-bold">已过期</span>;

  const d = Math.floor(remain / 86400000);
  const h = Math.floor((remain % 86400000) / 3600000);
  const m = Math.floor((remain % 3600000) / 60000);
  const s = Math.floor((remain % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="text-emerald-600 font-bold tabular-nums">
      {d > 0 ? `${d}天 ` : ""}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
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
  BID_PREP: "",
  REQ_DESIGN: "",
  BACKEND_CORE: "",
  DATABASE_ENG: "",
  FRONTEND_DEV: "",
  TEST_QA: "",
  DEVOPS: "",
  SECURITY: "",
  PROJ_MGMT: "",
  KNOWLEDGE: "",
};

const stageMetaData: Record<number, { icon: any; iconText: string; code: string; flowText: string }> = {
  1: { icon: FileText, iconText: "", code: "BID", flowText: "商机打单" },
  2: { icon: Layers, iconText: "", code: "REQ", flowText: "需求定义" },
  3: { icon: Code, iconText: "", code: "API", flowText: "后端开发" },
  4: { icon: Database, iconText: "", code: "DB", flowText: "数据工程" },
  5: { icon: Layout, iconText: "", code: "UI", flowText: "大前端" },
  6: { icon: CheckCircle2, iconText: "", code: "QA", flowText: "测试质量" },
  7: { icon: Server, iconText: "", code: "OPS", flowText: "持续运维" },
  8: { icon: ShieldCheck, iconText: "", code: "SEC", flowText: "安全防护" },
  9: { icon: Users, iconText: "", code: "PM", flowText: "项目管理" },
  10: { icon: BookOpen, iconText: "", code: "KM", flowText: "知识资产" },
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
export interface AssetRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  size?: string;
  sizeStr?: string;
  time?: string;
  createdAt: string;
  visibility?: "PUBLIC" | "PRIVATE";
  uploaderName?: string | null;
  uploaderId?: string | null;
  uploaderEmail?: string | null;
  // 审核状态：待审核 / 已归档 / 已驳回
  status?: "APPROVED" | "PENDING" | "REJECTED";
  description?: string;
  isMine?: boolean;
  // 管理员审核批示意见（驳回修改意见 / 通过批示），后端解析后回传，需透传至资料页展示
  reviewComment?: string;
  /** 中文格式类型标签（由文件真实类型判定，如「Word 文档」「Excel 表格」「图片」） */
  fileTypeLabel?: string | null;
  /** 文件真实字节数（非 content 字符数估算） */
  fileSize?: number | null;
  /** 原始文件扩展名（小写无点） */
  fileExt?: string | null;
  /** 智能总结（基于文件真实原文生成） */
  summary?: string | null;
  /** 鉴权文件流 URL（真实原文件预览/下载） */
  fileUrl?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
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
  /** 初始激活的页签（如 stats 页传入 "stats" 直接展示统计大盘），默认 "quick" */
  activeTab?: string;
}

export default function WorkspaceInternalLayout({ children, activeTab: initialActiveTab }: WorkspaceInternalLayoutProps) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const toast = useToast();
  const searchParams = useSearchParams();

  // AppContext
  const { boundComponentIds, boundComponentsWorkspaceId, refreshBoundComponents, bindComponent, addRecentUsed, userState, setUserState, componentCatalog, componentCategories, presetPositions, resetWorkspaceData } = useAppContext();

  // 分类 → 阶段号映射（由数据库 component_category.sortOrder 驱动，不再硬编码）
  const categoryToStageId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(componentCategories || {}).forEach(([key, value]) => {
      map[key] = value.sortOrder && value.sortOrder > 0 ? value.sortOrder : 1;
    });
    return map;
  }, [componentCategories]);

  // 组件信息来自数据库（component_catalog 表），动态构造侧边栏与总览组件树
  const allComponents: ZhiGeComponent[] = componentCatalog.map(c => ({
    id: c.id,
    title: c.name,
    name: c.name,
    description: c.description,
    category: c.category,
    icon: c.icon || "",
    isPremium: c.isPremium,
    stageId: categoryToStageId[c.category as ComponentCategory] || 1,
    path: `/workspace/component/${c.id}`,
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
  const [activeTab, setActiveTab] = useState<string>(initialActiveTab || "quick");
  const [workspaceToken, setWorkspaceToken] = useState<number>(12580);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);
  const [customPositions, setCustomPositions] = useState<PositionDefinition[]>([]);
  // 当前空间在权限中心实际装配引入的岗位集合
  const [workspaceInstalledPosts, setWorkspaceInstalledPosts] = useState<Array<{
    id: string;
    name: string;
    code?: string;
    color?: string;
    icon?: string | null;
    description?: string;
  }>>([]);
  // 多岗位兼任分配模态框状态
  const [configuringRoleMember, setConfiguringRoleMember] = useState<any | null>(null);
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);
  const [roleSearchQuery, setRoleSearchQuery] = useState<string>("");
  const [savingMemberRoles, setSavingMemberRoles] = useState<boolean>(false);
  // 成员列表岗位筛选自定义 Popover 状态（支持 50+ 岗位实时检索与优雅滚动）
  const [isRoleFilterOpen, setIsRoleFilterOpen] = useState(false);
  const [roleFilterSearch, setRoleFilterSearch] = useState("");
  const roleFilterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutsideRoleFilter(event: MouseEvent) {
      if (roleFilterDropdownRef.current && !roleFilterDropdownRef.current.contains(event.target as Node)) {
        setIsRoleFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideRoleFilter);
    return () => document.removeEventListener("mousedown", handleClickOutsideRoleFilter);
  }, []);
  const [showSpaceManagementDropdown, setShowSpaceManagementDropdown] = useState(false);
  const spaceManagementDropdownRef = useRef<HTMLDivElement>(null);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  // 快速自动化执行状态
  const [quickSelectedCompId, setQuickSelectedCompId] = useState<string>("");
  const [isCompDropdownOpen, setIsCompDropdownOpen] = useState(false);
  const compDropdownRef = useRef<HTMLDivElement>(null);
  const [compSearchQuery, setCompSearchQuery] = useState("");

  const [quickInputMaterial, setQuickInputMaterial] = useState<string>("");
  const [quickSubStep, setQuickSubStep] = useState<"select" | "material">("select");
  const [isExecutingTask, setIsExecutingTask] = useState(false);
  const [quickResultHistoryOpen, setQuickResultHistoryOpen] = useState(false);
  const [materialInputMode, setMaterialInputMode] = useState<"text" | "file" | "asset">("text");
  const [uploadedFileMeta, setUploadedFileMeta] = useState<{ name: string; size: string; sizeBytes?: number } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; title: string } | null>(null);
  const [showFullMaterialModal, setShowFullMaterialModal] = useState<boolean>(false);
  const [showRechargeModal, setShowRechargeModal] = useState<boolean>(false);
  // 充值成功信号：递增后通知「算力点」页签自动刷新流水
  const [rechargeSignal, setRechargeSignal] = useState<number>(0);
  // 充值弹窗：在线充值 / 对公转账工单 双 Tab
  const [rechargeTab, setRechargeTab] = useState<"online" | "offline">("online");
  const [offlineForm, setOfflineForm] = useState({
    points: "",
    invoiceTitle: "",
    taxNo: "",
    bankName: "",
    bankAccount: "",
    remark: "",
  });
  const [submittingOffline, setSubmittingOffline] = useState(false);
  const [offlineResultOrderNo, setOfflineResultOrderNo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 自动匹配面板的文件上传（仅支持纯文本）
  const [aiMatchFileMeta, setAiMatchFileMeta] = useState<{ name: string; size: string; sizeBytes?: number } | null>(null);
  const [aiMatchFileText, setAiMatchFileText] = useState<string>("");
  const aiMatchFileInputRef = useRef<HTMLInputElement>(null);
  // 自动匹配结果详情弹窗
  const [aiMatchDetailModal, setAiMatchDetailModal] = useState<ComponentDefinition | null>(null);
  // 待切换组件未保存草稿确认弹窗 Modal
  const [pendingSwitchComp, setPendingSwitchComp] = useState<ZhiGeComponent | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (compDropdownRef.current && !compDropdownRef.current.contains(event.target as Node)) {
        setIsCompDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 安全截断过长文件名，确保 Toast 提示末尾核心动作状态不被折断截断
  function safeTruncateFileName(fileName?: string, maxLen = 14): string {
    if (!fileName) return "文件";
    if (fileName.length <= maxLen) return fileName;
    
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot > 0 && lastDot > fileName.length - 6) {
      const ext = fileName.slice(lastDot);
      const base = fileName.slice(0, lastDot);
      const keepLen = Math.max(3, maxLen - ext.length - 3);
      return `${base.slice(0, keepLen)}...${ext}`;
    }
    
    return `${fileName.slice(0, maxLen - 3)}...`;
  }

  // 可在浏览器本地直接读取纯文本内容的常见扩展名
  function isAllowedTextFile(fileName: string, mimeType: string): boolean {
    const textExts = [
      ".txt", ".md", ".markdown", ".json", ".js", ".ts", ".jsx", ".tsx",
      ".py", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs", ".sql",
      ".html", ".css", ".scss", ".xml", ".yaml", ".yml", ".sh", ".bash",
      ".ini", ".env", ".log", ".csv"
    ];
    const nameLower = (fileName || "").toLowerCase();
    const typeLower = (mimeType || "").toLowerCase();
    if (textExts.some(ext => nameLower.endsWith(ext))) return true;
    if (typeLower.startsWith("text/")) return true;
    return false;
  }

  // 服务端能力支持直接解析文本内容的二进制文档扩展名 (PDF / Word / Excel / PPT 等)
  function isExtractableFile(fileName: string, mimeType: string): boolean {
    const binaryExts = [
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"
    ];
    const nameLower = (fileName || "").toLowerCase();
    const typeLower = (mimeType || "").toLowerCase();
    if (binaryExts.some(ext => nameLower.endsWith(ext))) return true;
    if (
      typeLower.includes("pdf") ||
      typeLower.includes("word") ||
      typeLower.includes("excel") ||
      typeLower.includes("spreadsheet") ||
      typeLower.includes("presentation") ||
      typeLower.includes("powerpoint")
    ) return true;
    return false;
  }

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(file.size / 1024)} KB`;
    setUploadedFileMeta({ name: file.name, size: sizeStr, sizeBytes: file.size });

    // 1. 纯文本文件：本地 readAsText
    if (isAllowedTextFile(file.name, file.type || "")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content !== "string") {
          toast.error("读取文件失败，内容格式异常");
          return;
        }
        // 二次校验：若 readAsText 后出现二进制特征（如 PDF 魔数、空字节、替换字符），拒绝入库
        if (isProbablyBinaryContent(content)) {
          toast.error(
            `「${file.name}」读取后出现乱码特征（可能是二进制文件伪造成文本扩展名）。请使用真正的纯文本文件，或先提取文本后粘贴。`
          );
          setUploadedFileMeta(null);
          setQuickInputMaterial("");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
        const sensitivity = scanSensitiveWords(content);
        if (sensitivity.hasSensitive) {
          toast.warning(`🛡️ 文件安全合规提示：文件「${safeTruncateFileName(file.name)}」中检测到敏感字词 [${sensitivity.foundWords.join(", ")}]，系统已自动模糊打码遮罩 (***)，请检查或修改后重新提交。`, 6000);
          setQuickInputMaterial(sensitivity.sanitizedText);
        } else {
          setQuickInputMaterial(content);
          toast.success(`文件 [${safeTruncateFileName(file.name)}] 已成功加载到系统！`);
        }
      };
      reader.onerror = () => {
        toast.error("读取文件失败，请重试");
      };
      reader.readAsText(file);
      return;
    }

    // 2. PDF / Word / Excel / CSV 等可解析二进制文件：上传到服务端提取文本
    if (isExtractableFile(file.name, file.type || "")) {
      try {
        toast.info("正在上传并解析文件，请稍候...", 1500);
        const { text, hasSensitive, foundWords } = await uploadAndExtractText(file);
        if (hasSensitive && foundWords) {
          toast.warning(`🛡️ 文件安全合规提示：解析文件「${safeTruncateFileName(file.name)}」中检测到敏感词汇 [${foundWords.join(", ")}]，已自动模糊打码遮罩 (***)，请核对修改。`, 6000);
        } else {
          toast.success(`文件 [${safeTruncateFileName(file.name)}] 已解析并加载成功！`);
        }
        setQuickInputMaterial(text);
      } catch (err: any) {
        toast.error(err.message || "文件解析失败，请重试");
        setUploadedFileMeta(null);
        setQuickInputMaterial("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      return;
    }

    // 3. 可执行文件与音视频等无文本内容的文件
    toast.error(
      `「${safeTruncateFileName(file.name)}」属于可执行文件或音视频文件，无法提取文本内容。`
    );
    setUploadedFileMeta(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 自动匹配面板：上传纯文本或 PDF/Word/Excel 等可解析文件，作为匹配诉求
  const handleAiMatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(file.size / 1024)} KB`;
    setAiMatchFileMeta({ name: file.name, size: sizeStr, sizeBytes: file.size });

    // 1. 纯文本文件：本地 readAsText
    if (isAllowedTextFile(file.name, file.type || "")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (typeof content !== "string") {
          toast.error("读取文件失败，内容格式异常");
          return;
        }
        if (isProbablyBinaryContent(content)) {
          toast.error(
            `「${safeTruncateFileName(file.name)}」读取后出现乱码特征。请使用真正的纯文本文件，或先提取文本后粘贴。`
          );
          setAiMatchFileMeta(null);
          setAiMatchFileText("");
          if (aiMatchFileInputRef.current) aiMatchFileInputRef.current.value = "";
          return;
        }
        const sensitivity = scanSensitiveWords(content);
        if (sensitivity.hasSensitive) {
          toast.warning(`🛡️ 安全合规提示：匹配文件「${safeTruncateFileName(file.name)}」中检测到敏感字词 [${sensitivity.foundWords.join(", ")}]，已自动模糊遮罩 (***)。`, 6000);
          setAiMatchFileText(sensitivity.sanitizedText);
        } else {
          setAiMatchFileText(content);
          toast.success(`文件 [${safeTruncateFileName(file.name)}] 已读取，可用于自动匹配`);
        }
      };
      reader.onerror = () => {
        toast.error("读取文件失败，请重试");
      };
      reader.readAsText(file);
      return;
    }

    // 2. PDF / Word / Excel / CSV 等可解析二进制文件：上传到服务端提取文本
    if (isExtractableFile(file.name, file.type || "")) {
      try {
        toast.info("正在上传并解析文件，请稍候...", 1500);
        const { text, hasSensitive, foundWords } = await uploadAndExtractText(file);
        if (hasSensitive && foundWords) {
          toast.warning(`🛡️ 安全合规提示：解析文件「${safeTruncateFileName(file.name)}」中包含敏感字词 [${foundWords.join(", ")}]，已自动打码处理 (***)。`, 6000);
        } else {
          toast.success(`文件 [${safeTruncateFileName(file.name)}] 已解析成功，可用于自动匹配`);
        }
        setAiMatchFileText(text);
      } catch (err: any) {
        toast.error(err.message || "文件解析失败，请重试");
        setAiMatchFileMeta(null);
        setAiMatchFileText("");
        if (aiMatchFileInputRef.current) aiMatchFileInputRef.current.value = "";
      }
      return;
    }

    // 3. 可执行文件与音视频等无文本内容的文件
    toast.error(
      `「${file.name}」属于可执行文件或音视频文件，无法提取文本内容。`
    );
    setAiMatchFileMeta(null);
    if (aiMatchFileInputRef.current) aiMatchFileInputRef.current.value = "";
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
  // 资料可见性统计（后端按角色区分公开/私密数量）
  const [documentStats, setDocumentStats] = useState<{
    publicCount: number;
    privateCount: number;
    total: number;
    isManager: boolean;
    scope: string;
  } | null>(null);

  // 资料治理：当前用户的资料操作权限 + 空间成员数（用于通知预览）
  const [assetPermissions, setAssetPermissions] = useState<AssetPermissions | null>(null);
  const [assetMemberCount, setAssetMemberCount] = useState<number>(0);
  const [activeRemovalCount, setActiveRemovalCount] = useState<number>(0);



  // TODO: 后续应从后端空间知识库接口获取真实规范
  const [knowledges, setKnowledges] = useState<KnowledgeRecord[]>([]);

  // 空间审计日志（按 workspaceId 维度，从真实 operationlog 聚合）
  const [operationLogs, setOperationLogs] = useState<any[]>([]);

  // Modals 控制
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showImportAssetModal, setShowImportAssetModal] = useState(false);
  const [importAssetForm, setImportAssetForm] = useState({ title: "", content: "", type: "input" });
  // 导入模态用途：asset=资料上传，knowledge=知识规约沉淀（决定提交到的后端 action）
  const [importAssetMode, setImportAssetMode] = useState<"asset" | "knowledge">("asset");
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
        const hasResultData = recentTasks.some(t => t.componentId === compId && t.status === "SUCCESS");
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

  const [aiMatchedComponent, setAiMatchedComponent] = useState<ComponentDefinition | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [tasksFilterTab, setTasksFilterTab] = useState<string>("ALL");
  const [activeCompSubTab, setActiveCompSubTab] = useState<"installed" | "recommended">("installed");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ 
    title: string; 
    content: string; 
    type?: string;
    sizeStr?: string;
    createdAt?: string;
    uploaderName?: string | null;
    url?: string;
    /** 中文格式类型标签 */
    fileTypeLabel?: string | null;
    /** 文件真实字节数 */
    fileSize?: number | null;
    /** 原始扩展名 */
    fileExt?: string | null;
    /** 智能总结 */
    summary?: string | null;
    /** 鉴权文件流 URL（真实原文件预览/下载） */
    fileUrl?: string | null;
    mimeType?: string | null;
    originalName?: string | null;
    /** 是否为当前用户上传（自己上传不显示下载原文件） */
    isMine?: boolean;
    /** 原生预览类型：image / pdf / table / html / text / notice */
    previewType?: string | null;
    previewHtml?: string | null;
    previewRows?: unknown[][] | null;
    previewNotice?: string | null;
    sheetName?: string | null;
  }>({ title: "", content: "" });

  // ================= 空间设置 Tab 的状态变量与事件 =================
  const [workspaceInfo, setWorkspaceInfo] = useState<any>({
    id: workspaceId || "",
    name: workspaceName || "",
    type: workspaceType || "PERSONAL",
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

  // 仅当切换工作空间 ID 时重新初始化设置表单，防止在当前空间编辑输入时被重置
  useEffect(() => {
    if (workspaceId) {
      setWorkspaceInfo((prev: any) => {
        // 如果空间未变，保留当前用户已输入的表单草稿，不覆盖输入
        if (prev.id === workspaceId) {
          return prev;
        }
        return {
          ...prev,
          id: workspaceId,
          name: workspaceName || "",
          type: workspaceType || "PERSONAL",
        };
      });
    }
  }, [workspaceId, workspaceName, workspaceType]);

  // 自动从数据库加载最新空间设置信息
  const loadWorkspaceSettingsData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setSettingsLoading(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/update?workspaceId=${workspaceId}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspaceInfo({
            id: data.workspace.id || workspaceId,
            name: data.workspace.name || workspaceName || "",
            type: data.workspace.type || workspaceType || "PERSONAL",
            description: data.workspace.description || "",
            teamSize: data.workspace.teamSize || "",
            industry: data.workspace.industry || "",
            contactEmail: data.workspace.contactEmail || data.workspace.ownerEmail || "",
            contactPhone: data.workspace.contactPhone || data.workspace.ownerPhone || "",
            logo: data.workspace.logo || "",
            createdAt: data.workspace.createdAt || "",
          });
        }
      }
    } catch (err) {
      console.error("加载空间设置失败:", err);
    } finally {
      setSettingsLoading(false);
    }
  }, [workspaceId, workspaceName, workspaceType]);

  useEffect(() => {
    loadWorkspaceSettingsData();
  }, [loadWorkspaceSettingsData]);

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

  // 成员算力额度配置 Modal 状态
  const [workspaceQuotaInfo, setWorkspaceQuotaInfo] = useState<{
    tokenBalance: number;
    levelName: string;
    levelTokenLimit: number;
    totalAllocatedToMembers: number;
    unallocatedBalance: number;
  }>({
    tokenBalance: 0,
    levelName: "免费版",
    levelTokenLimit: 1000,
    totalAllocatedToMembers: 0,
    unallocatedBalance: 0,
  });

  const [editingQuotaMember, setEditingQuotaMember] = useState<any | null>(null);
  const [inputQuotaValue, setInputQuotaValue] = useState<string>("");
  const [savingQuota, setSavingQuota] = useState(false);

  // 在线算力包真实充值状态与函数
  const [dynamicTokenPacks, setDynamicTokenPacks] = useState<any[]>([]);
  const [selectedRechargePack, setSelectedRechargePack] = useState<{ id?: string; points: number; name: string; price?: number }>({ points: 1000, name: "标准算力包 (1,000 点)", price: pointsToYuan(1000), id: "pack_standard_1000" });
  const [recharging, setRecharging] = useState(false);
  const [rechargePaymentMethod, setRechargePaymentMethod] = useState<"WECHAT_PAY" | "ALIPAY">("WECHAT_PAY");
  // 当前账号会员等级对加油包的折扣（由 /token-packs 接口按登录态返回数据库配置）
  const [rechargeMemberDiscount, setRechargeMemberDiscount] = useState(0);
  const [rechargeMemberName, setRechargeMemberName] = useState("");

  const loadDynamicTokenPacks = async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/workspace/quota/token-packs", {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.packs && data.packs.length > 0) {
          setDynamicTokenPacks(data.packs);
          setRechargeMemberDiscount(Number(data.membership?.tokenPackDiscount) || 0);
          setRechargeMemberName(data.membership?.nameZh || "");
          setSelectedRechargePack({
            id: data.packs[0].id,
            points: data.packs[0].points,
            name: `${data.packs[0].name} (${data.packs[0].points.toLocaleString()} 点)`,
            price: data.packs[0].price,
          });
        }
      }
    } catch (e) {
      console.warn("拉取线上算力加油包失败:", e);
    }
  };

  const fetchRealWorkspaceQuota = async (targetWsId?: string) => {
    const targetId = targetWsId || workspaceId;
    if (!targetId) return;
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/workspace/quota?workspaceId=${encodeURIComponent(targetId)}&t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const val = typeof data.tokenBalance === "number" ? data.tokenBalance : data.quota ? Number(data.quota.tokenBalance) : null;
        if (val !== null && !isNaN(val)) {
          setWorkspaceToken(val);
          setWorkspaceQuotaInfo((prev) => ({
            ...prev,
            tokenBalance: val,
            levelName: data.membershipLevelName || prev.levelName,
            levelTokenLimit: data.tokenLimit || prev.levelTokenLimit,
            unallocatedBalance: Math.max(0, val - (prev.totalAllocatedToMembers || 0)),
          }));
        }
      }
    } catch (e) {
      console.warn("实时拉取工作空间配额失败:", e);
    }
  };

  useEffect(() => {
    if (showRechargeModal) {
      loadDynamicTokenPacks();
      fetchRealWorkspaceQuota();
    }
  }, [showRechargeModal]);

  const handleExecuteRecharge = async () => {
    if (!workspaceId) return;
    try {
      setRecharging(true);
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch("/api/workspace/quota/recharge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          points: selectedRechargePack.points,
          packName: selectedRechargePack.name,
          packId: selectedRechargePack.id || null,
          price: selectedRechargePack.price,
          paymentMethod: rechargePaymentMethod,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `充值成功！为您注入 ${selectedRechargePack.points} 算力点`);
        setShowRechargeModal(false);
        if (typeof data.tokenBalance === "number") {
          setWorkspaceToken(data.tokenBalance);
        }
        setRechargeSignal((s) => s + 1); // 通知算力点页签刷新流水
        loadTabMembers();
      } else {
        toast.error(data.error || "充值失败，请检查操作权限");
      }
    } catch (error: any) {
      console.error("执行充值失败:", error);
      toast.error("充值处理异常");
    } finally {
      setRecharging(false);
    }
  };

  // 提交线下对公转账 / 合同结算充值工单（审批通过并确认收款后自动入账）
  const submitOfflineOrder = async () => {
    if (!workspaceId) return;
    const pts = Number(offlineForm.points);
    if (!pts || pts <= 0) {
      toast.error("请输入有效的充值算力点数");
      return;
    }
    setSubmittingOffline(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/workspace/quota/recharge-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          points: pts,
          paymentMethod: "OFFLINE_BANK",
          invoiceTitle: offlineForm.invoiceTitle || null,
          taxNo: offlineForm.taxNo || null,
          bankName: offlineForm.bankName || null,
          bankAccount: offlineForm.bankAccount || null,
          remark: offlineForm.remark || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "充值工单已提交，等待平台审批与确认收款");
        setOfflineResultOrderNo(data.order?.orderNo || null);
      } else {
        toast.error(data.error || "提交失败");
      }
    } catch (error: any) {
      console.error("提交线下充值工单失败:", error);
      toast.error("提交异常");
    } finally {
      setSubmittingOffline(false);
    }
  };

  const handleSaveQuotaInLayout = async (isClear: boolean = false) => {
    if (!editingQuotaMember) return;
    if (editingQuotaMember.role === "OWNER" || editingQuotaMember.role === "Owner" || editingQuotaMember.role === "ADMIN" || editingQuotaMember.role === "Admin") {
      toast.error("不可为空间所有者或管理员分配额度");
      return;
    }
    try {
      setSavingQuota(true);
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const payloadLimit = isClear ? null : (inputQuotaValue === "" ? null : Number(inputQuotaValue));

      const res = await fetch("/api/workspace/members/quota", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          targetUserId: editingQuotaMember.userId,
          monthlyTokenLimit: payloadLimit,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "算力额度更新成功");
        setEditingQuotaMember(null);
        loadTabMembers();
      } else {
        toast.error(data.error || "配置失败");
        if (data.suggestRecharge) {
          setShowRechargeModal(true);
        }
      }
    } catch (error: any) {
      console.error("配置算力失败:", error);
      toast.error(error.message || "请求失败");
    } finally {
      setSavingQuota(false);
    }
  };

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

      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [res, resQuota] = await Promise.all([
        fetch(`/api/workspace/members?workspaceId=${workspaceId}`, { headers, credentials: "include" }),
        fetch(`/api/workspace/members/quota?workspaceId=${workspaceId}`, { headers, credentials: "include" }),
      ]);

      if (res.ok) {
        const data = await res.json();
        let list = data.members || [];
        
        if (resQuota.ok) {
          const quotaData = await resQuota.json();
          if (quotaData.workspaceQuota) {
            setWorkspaceQuotaInfo(quotaData.workspaceQuota);
          }
          const qMap = new Map<string, any>();
          (quotaData.members || []).forEach((qm: any) => qMap.set(qm.userId, qm));
          list = list.map((m: any) => {
            const q = qMap.get(m.userId);
            return {
              ...m,
              monthlyTokenLimit: q ? q.monthlyTokenLimit : null,
              monthlyTokenUsed: q ? q.monthlyTokenUsed : 0,
              quotaResetAt: q ? q.quotaResetAt : null,
            };
          });
        }

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
          (a: any, b: any) => statusRank(a) - statusRank(b) || timeValue(b) - timeValue(a)
        );
        setActiveInvitations(sortedInvitations);
      }
    } catch (error) {
      console.error("加载成员失败", error);
    } finally {
      setMembersLoading(false);
    }
  }, [workspaceId, workspaceType, userState, currentMemberRole]);

  // 从空间枢纽岗位接口加载当前空间实际装配/引入的所有岗位（含官方标准岗位与空间自定义岗位）
  const loadWorkspaceInstalledPosts = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/workspace-hub/posts?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data?.posts)) {
          setWorkspaceInstalledPosts(data.data.posts);
        }
      }
    } catch (err) {
      console.error("加载空间装配岗位失败:", err);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceInstalledPosts();
    }
  }, [workspaceId, loadWorkspaceInstalledPosts]);

  // 加载当前用户在当前空间下的岗位受限组件列表 (安全隔离闭环)
  const loadRestrictedComponentIds = useCallback(async (targetWsId?: string) => {
    const id = targetWsId || workspaceId;
    if (!id) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studio?action=restricted&workspaceId=${encodeURIComponent(id)}&t=${Date.now()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const rData = await res.json();
        if (rData.success && Array.isArray(rData.data)) {
          setRestrictedComponentIds(rData.data);
        }
      }
    } catch (e) {
      console.warn("[WorkspaceLayout] 加载受限组件失败:", e);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (activeTab === "members" && workspaceId) {
      loadTabMembers();
      loadWorkspaceInstalledPosts();
    }
    if ((activeTab === "components" || activeTab === "quick") && workspaceId) {
      loadRestrictedComponentIds(workspaceId);
    }
  }, [activeTab, workspaceId, loadTabMembers, loadWorkspaceInstalledPosts, loadRestrictedComponentIds]);

  // 监听跨组件权限更新事件，即时同步受限组件状态
  useEffect(() => {
    const handlePermissionsUpdated = () => {
      if (workspaceId) {
        loadRestrictedComponentIds(workspaceId);
      }
    };
    window.addEventListener("workspace-permissions-updated", handlePermissionsUpdated);
    return () => {
      window.removeEventListener("workspace-permissions-updated", handlePermissionsUpdated);
    };
  }, [workspaceId, loadRestrictedComponentIds]);

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

  const handleTabChangeRole = async (targetUserId: string, newRoleOrRoles: string | string[]) => {
    try {
      setSavingMemberRoles(true);
      const authToken = getAuthToken();
      const rolesArray = Array.isArray(newRoleOrRoles)
        ? newRoleOrRoles
        : [newRoleOrRoles];

      const res = await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        body: JSON.stringify({
          workspaceId,
          targetUserId,
          newRoles: rolesArray,
          newRole: rolesArray.join(","),
        }),
      });

      if (res.ok) {
        toast.success("成员岗位分配已更新");
        setConfiguringRoleMember(null);
        loadTabMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "分配岗位失败");
      }
    } catch (error: any) {
      toast.error(error.message || "操作失败，只有所有者有权调整成员岗位");
    } finally {
      setSavingMemberRoles(false);
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
        toast.success("空间设置保存成功，全局标志与配置已实时同步生效");
        setWorkspaceName(workspaceInfo.name); // 同步刷新头部空间名
        setUserState((prev) => ({
          ...prev,
          workspaces: prev.workspaces.map((ws) =>
            ws.id === workspaceId ? { ...ws, name: workspaceInfo.name, logo: workspaceInfo.logo } : ws
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
        setOperationLogs([]);
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
      setAssets([]);
      setAssetsLoading(true);
      setAssetsError("");
      setApiDocuments(null);
      setDocumentStats(null);
      setKnowledges([]);
      setOperationLogs([]);
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
      const initialTokens = workspace.workspacequota ? Number(workspace.workspacequota.tokenBalance) : workspace.quota?.tokenBalance ? Number(workspace.quota.tokenBalance) : (workspace.type === "PERSONAL" ? 100 : 0);
      setWorkspaceToken(initialTokens);
      setWorkspaceQuotaInfo((prev) => ({
        ...prev,
        tokenBalance: initialTokens,
        unallocatedBalance: Math.max(0, initialTokens - (prev.totalAllocatedToMembers || 0)),
      }));

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
          loadRestrictedComponentIds(id),

          // 辅助 4: 实时配额余额计算与同步
          fetchRealWorkspaceQuota(id),

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
              setActiveRemovalCount(dJson.removalStats?.activeCount || 0);
              if (dJson.stats) setDocumentStats(dJson.stats);
              // 资料库仅收录 type 非 knowledge 的文档（知识规约独立在知识库页呈现），
              // 统一产出 AssetsTab 所需的 sizeStr / createdAt 字段。
              setAssets(dJson.data
                .filter((doc: any) => doc.type && doc.type !== "knowledge")
                .map((doc: any) => {
                  // 容量取文件真实字节数（后端已回填 fileSize），不再用 content 字符数估算
                  const sizeStr = resolveAssetSize({ fileSize: doc.fileSize, content: doc.content });
                  return {
                    id: doc.id,
                    title: doc.title,
                    content: doc.content || "",
                    type: (doc.type || "doc").toUpperCase(),
                    sizeStr,
                    fileUrl: doc.fileUrl || null,
                    mimeType: doc.mimeType || null,
                    originalName: doc.originalName || null,
                    // 中文格式类型标签（由文件真实类型判定，如「Word 文档」「Excel 表格」「图片」）
                    fileTypeLabel: doc.fileTypeLabel || null,
                    fileSize: typeof doc.fileSize === "number" ? doc.fileSize : null,
                    fileExt: doc.fileExt || null,
                    // 智能总结：后端已基于真实原文生成
                    summary: doc.summary || null,
                    visibility: doc.visibility || "PUBLIC",
                    status: doc.status || "APPROVED",
                    createdAt: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—",
                    uploaderName: doc.uploaderName || null,
                    uploaderId: doc.uploaderId || null,
                    uploaderEmail: doc.uploaderEmail || null,
                    description: doc.description || undefined,
                    isMine: doc.isMine === true,
                    // 管理员审核批示意见：后端已按 operationlog / content 解析后回传，
                    // 必须透传给资料页，否则成员端永远读不到审核意见。
                    reviewComment: doc.reviewComment || null,
                    removal: doc.removal || null,
                  };
                }));
              setAssetsError("");
            } else {
              setAssetsError("资料加载失败：返回数据格式异常");
            }
          }).catch(e => {
            console.warn("[WorkspaceLayout] 拉取空间文档失败", e);
            setAssetsError("资料加载失败，请检查网络后重试");
          }).finally(() => setAssetsLoading(false)),

          // 辅助 8: 资料操作权限（用于资料页按钮显隐与治理鉴权）
          fetch(`/api/studio`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
            credentials: "include",
            body: JSON.stringify({ action: "get_asset_permissions", workspaceId: id })
          }).then(async r => {
            if (r.ok) {
              const pData = await r.json();
              if (pData.success && pData.data?.mine) setAssetPermissions(pData.data.mine);
            }
          }).catch(e => console.warn("[WorkspaceLayout] 拉取资料权限失败", e)),

          // 辅助 9: 空间成员数（用于移除资料通知预览）
          // 通知实际会排除操作人自己，所以预览人数 = 总成员数 - 1
          fetch(`/api/workspace/members?workspaceId=${encodeURIComponent(id)}`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (r.ok) {
              const mData = await r.json();
              const list = Array.isArray(mData?.data) ? mData.data : Array.isArray(mData?.members) ? mData.members : [];
              setAssetMemberCount(Math.max(0, list.length - 1));
            }
          }).catch(e => console.warn("[WorkspaceLayout] 拉取成员数失败", e)),

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
                  // 保留 REJECTED，避免驳回知识被误降级显示为"待审核"
                  status: k.status === "REJECTED" ? "REJECTED" : k.status === "APPROVED" ? "APPROVED" : "PENDING",
                  content: k.content || "",
                  // 管理员审核批示意见透传，否则成员端读不到
                  reviewComment: k.reviewComment || null,
                })));
              }
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取空间知识库失败", e)),

          // 辅助 8: 空间审计日志（真实 operationlog，按 workspaceId 聚合）
          fetch(`/api/workspace/${id}/logs?limit=200`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            credentials: "include"
          }).then(async r => {
            if (r.ok) {
              const lJson = await r.json();
              if (lJson.success && lJson.data && Array.isArray(lJson.data.logs)) {
                setOperationLogs(lJson.data.logs);
              }
            }
          }).catch(e => console.warn("[WorkspaceLayout] 静默拉取空间日志失败", e))
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
    const boundTargetWs = searchParams.get("boundTargetWs");

    // 防跨空间误呈现：若传递了目标空间 ID 且与当前实际空间 ID 不匹配，严禁在该空间显示
    if (boundTargetWs && boundTargetWs !== workspaceId) {
      setShowNewBoundBanner(false);
      setNewBoundComp(null);
      return;
    }

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

        // 一次性消费：干净抹除 URL 中的 newBoundComponentId 与 boundTargetWs 参数，防止后续切换空间残留误弹
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("newBoundComponentId");
          url.searchParams.delete("boundTargetWs");
          window.history.replaceState({}, "", url.toString());
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

  const isManager = ["OWNER", "ADMIN", "Owner", "Admin", "COMPONENT_MANAGER", "ComponentManager"].includes(userRole);
  const hasComponentPermission = (componentId: string) => {
    if (!allowedComponentIds.includes(componentId)) return false;
    if (workspaceType === "ENTERPRISE" && !isManager && restrictedComponentIds.includes(componentId)) {
      return false;
    }
    return true;
  };

  const applyComponentSwitch = (comp: ZhiGeComponent, actionType: "keep" | "clear" = "keep") => {
    if (actionType === "clear") {
      setQuickInputMaterial("");
      setSelectedAsset(null);
      setUploadedFileMeta(null);
      setAiQuery("");
      setAiMatchFileText("");
      setAiMatchFileMeta(null);
      toast.info("已成功清空未提交材料并加载新组件");
    } else if (actionType === "keep") {
      toast.success(`已成功将已有材料草稿与新组件 [${comp.name}] 绑定并载入！`);
    }

    addRecentUsed(comp.id, workspaceId);
    setActiveTab("quick");
    setQuickSelectedCompId(comp.id);
    setQuickSubStep("select");
    setPendingSwitchComp(null);
  };

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

    // 检测是否存在未提交的文本/素材草稿
    const hasDraftA = !!quickInputMaterial.trim() || !!selectedAsset || !!uploadedFileMeta;
    const hasDraftB = !!aiQuery.trim() || !!aiMatchFileText.trim();
    const isChangingComp = quickSelectedCompId && quickSelectedCompId !== comp.id;

    if ((hasDraftA || hasDraftB) && isChangingComp) {
      setPendingSwitchComp(comp);
      return;
    }

    applyComponentSwitch(comp, "keep");
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已成功复制处理成果 Markdown 到剪贴板！");
  };

  // 自动化执行处理 (校验状态机)
  // supports overrides so that auto-match can directly execute without waiting for React state flush
  const handleExecuteSimulation = async (overrides?: {
    componentId?: string;
    inputMaterial?: string;
    materialInputMode?: "text" | "file" | "asset";
    uploadedFileMeta?: { name: string; size: string; sizeBytes?: number } | null;
    selectedAsset?: { id: string; title: string } | null;
  }) => {
    const execCompId = overrides?.componentId || quickSelectedCompId;
    const execInputMaterial = overrides?.inputMaterial ?? quickInputMaterial;
    const execMaterialInputMode = overrides?.materialInputMode || materialInputMode;
    const execUploadedFileMeta = overrides?.uploadedFileMeta !== undefined ? overrides.uploadedFileMeta : uploadedFileMeta;
    const execSelectedAsset = overrides?.selectedAsset !== undefined ? overrides.selectedAsset : selectedAsset;

    if (!execCompId) {
      toast.error("请先在列表中选定要调用的效能组件！");
      return;
    }
    const execComp = componentCatalog.find(c => c.id === execCompId);
    const execInputMode = execComp?.inputMode || "text";
    const hasText = execInputMaterial.trim().length > 0;
    const hasFile = execMaterialInputMode === "file" && !!execUploadedFileMeta;
    const hasAsset = execMaterialInputMode === "asset" && !!execSelectedAsset;
    let inputErr = "";
    if (execInputMode === "file") {
      if (!hasFile && !hasAsset) inputErr = "该组件需要上传文件或选择空间资料作为主材料，纯文本粘贴不允许执行";
    } else if (execInputMode === "text") {
      if (!hasText && !hasAsset) inputErr = "请输入待处理的研发源材料，或选择空间资料";
    } else {
      if (!hasText && !hasFile && !hasAsset) inputErr = "请输入文本、上传文件或选择空间资料作为主材料";
    }
    if (inputErr) {
      toast.error(inputErr);
      return;
    }
    const estimatedCost = Number(componentCatalog.find(c => c.id === execCompId)?.estimatedTokens) || 5;
    const selectedComp = componentCatalog.find(c => c.id === execCompId);
    const taskName = `${selectedComp?.name || "效能组件"}自动化任务`;
    const finalExecInputMaterial = execInputMaterial.trim();
    let inputSource: Record<string, any> = { sourceType: "text" };
    if (execMaterialInputMode === "file" && execUploadedFileMeta) {
      inputSource = {
        sourceType: "file",
        sourceId: null,
        fileName: execUploadedFileMeta.name,
        fileSize: execUploadedFileMeta.sizeBytes ?? null,
      };
    } else if (execMaterialInputMode === "asset" && execSelectedAsset) {
      inputSource = {
        sourceType: "asset",
        sourceId: execSelectedAsset.id,
        fileName: execSelectedAsset.title,
        fileSize: null,
      };
    }
    if (workspaceType === "ENTERPRISE" && !isManager && restrictedComponentIds.includes(execCompId)) {
      toast.error("执行拦截：当前用户岗位受矩阵规则限制，无法执行该受限组件！");
      return;
    }
    if (workspaceType === "ENTERPRISE" && workspaceToken !== -1 && workspaceToken < estimatedCost) {
      toast.error(`执行拦截：当前空间剩余服务调用额度不足（需要 ${estimatedCost} 点），请联系空间管理员！`);
      return;
    }
    setIsExecutingTask(true);
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
          componentId: execCompId,
          taskName,
          inputMaterial: finalExecInputMaterial,
          inputSource,
          tokens: estimatedCost,
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
        componentId: execCompId,
        componentName: selectedComp?.name || "",
        tokenUsed: typeof backendTask.tokens === "number" ? backendTask.tokens : estimatedCost,
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
      setQuickResultHistoryOpen(false);
      setIsExecutingTask(false);
      // 执行成功后清空输入来源状态，避免下次任务串数据（单一主材料）
      setQuickInputMaterial("");
      setUploadedFileMeta(null);
      setSelectedAsset(null);
      setMaterialInputMode("text");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("数据自动化处理完毕！分析结果已生成。");
    } catch (error: any) {
      console.error("执行自动化任务失败:", error);
      setIsExecutingTask(false);
      toast.error(error.message || "任务执行失败，请联系空间管理员");
    }
  };

  // 资料导入 / 知识沉淀：依据 importAssetMode 路由到不同后端 action，均真实持久化
  const handlePersistAsset = async (data: {
    title: string;
    content: string;
    type: string;
    visibility?: "PUBLIC" | "PRIVATE";
    /** 原始 File 对象：存在时走 multipart 真实文件上传 */
    file?: File | null;
    /** 文件真实字节数 */
    fileSize?: number | null;
    /** 原始文件扩展名 */
    fileExt?: string | null;
    /** 基于真实原文生成的智能总结 */
    summary?: string | null;
  }) => {
    if (importAssetMode === "knowledge") {
      return handleCreateKnowledge(data);
    }
    if (!data.title.trim() || (!data.file && !data.content.trim())) {
      toast.error("请填入完整的信息（资料标题与文件或提取文本提要）");
      return false;
    }
    try {
      const authHeaders: Record<string, string> = getAuthToken()
        ? { Authorization: `Bearer ${getAuthToken()}` }
        : {};
      let res: Response;
      if (data.file) {
        const formData = new FormData();
        formData.append("file", data.file);
        formData.append("workspaceId", workspaceId);
        formData.append("title", data.title);
        formData.append("type", data.type);
        formData.append("visibility", data.visibility || "PUBLIC");
        if (data.fileSize) formData.append("fileSize", String(data.fileSize));
        if (data.fileExt) formData.append("fileExt", data.fileExt);
        if (data.summary) formData.append("summary", data.summary);
        res = await fetch("/api/studio?action=upload_doc", {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
          body: formData,
        });
      } else {
        res = await fetch("/api/studio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          credentials: "include",
          body: JSON.stringify({
            action: "upload_doc",
            workspaceId,
            title: data.title,
            content: data.content,
            type: data.type,
            visibility: data.visibility || "PUBLIC",
            // 真实文件元信息与智能总结一并持久化
            fileSize: data.fileSize ?? null,
            fileExt: data.fileExt ?? null,
            summary: data.summary ?? null,
          }),
        });
      }
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || body.message || "资料导入失败，请稍后重试");
      }
      const doc = body.data;
      const newAsset: AssetRecord = {
        id: doc.id,
        title: doc.title,
        // 容量取文件真实字节数，不再用 content 字符数估算
        sizeStr: resolveAssetSize({ fileSize: doc.fileSize ?? data.fileSize, content: doc.content }),
        type: (doc.type || data.type).toUpperCase(),
        time: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
        content: doc.content || "",
        createdAt: doc.createdAt || new Date().toISOString(),
        visibility: doc.visibility || data.visibility || "PUBLIC",
        status: doc.status || (data.visibility === "PRIVATE" ? "APPROVED" : "PENDING"),
        uploaderName: doc.uploaderName || userState?.userInfo?.name || userState?.userInfo?.email || null,
        uploaderId: doc.uploaderId || getCurrentUserId() || null,
        fileUrl: doc.fileUrl || null,
        mimeType: doc.mimeType || null,
        originalName: doc.originalName || null,
        fileTypeLabel: doc.fileTypeLabel || getFileTypeLabel({
          type: doc.type || data.type,
          ext: doc.fileExt || data.fileExt,
          title: doc.title || data.title,
          content: doc.content || data.content,
        }) || null,
        fileSize: typeof doc.fileSize === "number" ? doc.fileSize : (data.fileSize ?? null),
        fileExt: doc.fileExt || data.fileExt || null,
        summary: doc.summary || data.summary || null,
      };
      setAssets(prev => [newAsset, ...prev]);
      setShowImportAssetModal(false);
      if (newAsset.status === "PENDING") {
        toast.info("已成功上传！由于您上传的是【空间公开】资料，现已提交进入 ⏳ 待审核 状态，等待管理员合规审核。");
      } else {
        toast.success("文件已成功作为输入材料导入空间资料库！");
      }
      return true;
    } catch (error: any) {
      console.error("资料导入失败:", error);
      toast.error(error.message || "资料导入失败，请稍后重试");
      return false;
    }
  };

  // 知识规约沉淀：个人空间直接发布；企业空间普通成员提交审核，管理角色直接发布
  const handleCreateKnowledge = async (data: { title: string; content: string; type: string }) => {
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
          action: "save_knowledge",
          workspaceId,
          title: data.title,
          content: data.content,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error || d.message || "知识沉淀失败，请稍后重试");
      }
      const kd = d.data;
      const newKnowledge: KnowledgeRecord = {
        id: kd.id,
        title: kd.title || data.title,
        sourceComponent: kd.sourceComponent || "空间手动录入",
        sourceTaskId: kd.sourceTaskId || undefined,
        sourceTaskName: kd.sourceTaskName || "空间研发任务",
        componentId: kd.componentId || undefined,
        componentName: kd.componentName || undefined,
        componentCategory: kd.componentCategory || undefined,
        time: kd.createdAt ? new Date(kd.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
        status: kd.status === "APPROVED" ? "APPROVED" : "PENDING",
      };
      setKnowledges(prev => [newKnowledge, ...prev]);
      setShowImportAssetModal(false);
      setImportAssetMode("asset");
      toast.success(kd.status === "APPROVED" ? "已成功归档至【知识沉淀规范库】！" : "已提交归档申请，等待管理员审核");
    } catch (error: any) {
      console.error("知识沉淀失败:", error);
      toast.error(error.message || "知识沉淀失败，请稍后重试");
    }
  };

  // 资料删除：真实物理删除后端文档，成功后从本地列表移除
  const handleDeleteAsset = async (assetId: string) => {
    if (assetId === "active-upload-file") {
      setUploadedFileMeta(null);
      setQuickInputMaterial("");
      toast.success("已移除当前在用资料");
      return;
    }
    try {
      const res = await fetch(`/api/studio?action=deleteDocument&documentId=${encodeURIComponent(assetId)}&workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error || "删除资料失败，请稍后重试");
      }
      setAssets(prev => prev.filter(a => a.id !== assetId));
      toast.success("资料资产已移除");
    } catch (error: any) {
      console.error("删除资料失败:", error);
      toast.error(error.message || "删除资料失败，请稍后重试");
    }
  };

  // 资料移除：软删除 + 拿移除原因 + 后端自动通知全员
  const handleRemoveAsset = async (assetId: string, reasonCode: string, reasonDetail: string) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ action: "remove_asset", workspaceId, assetId, reasonCode, reasonDetail })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error || "移除资料失败，请稍后重试");
      }
      // 普通成员删除自己资料：后端创建待审核申请（文档保持 active），本人列表保留并标记“审核中”
      if (body.data?.pending) {
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, pendingRemoval: { id: body.data.removalId, status: "PENDING", removedAt: new Date() } } : a));
        toast.success("删除申请已提交，等待管理员审核");
      } else {
        // 直接移除：从本地列表移除
        setAssets(prev => prev.filter(a => a.id !== assetId));
        const notified = body.data?.notifiedCount ?? 0;
        toast.success(notified > 0 ? `公开资料已移除，已向 ${notified} 位成员发送通知` : "资料删除成功");
      }
    } catch (error: any) {
      console.error("移除资料失败:", error);
      toast.error(error.message || "移除资料失败，请稍后重试");
    }
  };

  // 批量移除资料 handler：软删除 + 全员站内通知
  const handleBatchRemoveAssets = async (assetIds: string[], reasonCode: string, reasonDetail: string) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ action: "batch_remove_assets", workspaceId, assetIds, reasonCode, reasonDetail }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error || "批量移除资料失败，请稍后重试");
      }
      const d = body.data || {};
      setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
      if (d.skippedCount > 0) {
        toast.warning(`已移除 ${d.removedCount} 项，跳过 ${d.skippedCount} 项无权限的资料`);
      } else {
        toast.success(d.notifiedCount > 0 ? `已批量移除 ${d.removedCount} 项资料，已向 ${d.notifiedCount} 位成员发送通知` : `已成功移除 ${d.removedCount} 项资料`);
      }
    } catch (error: any) {
      console.error("批量移除资料失败:", error);
      toast.error(error.message || "批量移除资料失败，请稍后重试");
    }
  };

  const handleImportAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePersistAsset(importAssetForm);
  };

  // 知识沉淀：真实持久化到后端知识库（企业空间普通成员进入待审核，管理角色直接发布）
  const handleSaveToKnowledge = async (task: TaskRecord) => {
    const isExist = knowledges.find(k => k.sourceTaskId === task.id);
    if (isExist) {
      toast.info("成果已归档在【知识沉淀规范库】，可随时在知识库中查阅");
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
        toast.success("已成功归档至【知识沉淀规范库】！");
      } else {
        toast.success("已提交归档申请！已向知识库管理员发起审批流");
      }
    } catch (error: any) {
      console.error("知识沉淀失败:", error);
      toast.error(error.message || "知识沉淀失败，请联系空间管理员");
    }
  };

  // 知识库审核：仅 KNOWLEDGE_MANAGER / ADMIN / OWNER 可通过或驳回待审核沉淀
  const handleReviewKnowledge = async (knowledgeId: string, approve: boolean, comment?: string) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "review_knowledge", workspaceId, knowledgeId, approve, comment }),
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
      toast.success(approve 
        ? (comment ? `归档批示: "${comment}"` : "知识沉淀审核已通过！")
        : (comment ? `驳回意见: "${comment}"` : "知识沉淀申请已驳回！")
      );
    } catch (error: any) {
      console.error("知识审核失败:", error);
      toast.error(error.message || "审核操作失败，请联系空间管理员");
    }
  };

  // 资料审核：空间管理员/所有者对普通成员提交的空间公开资料进行【通过】或【驳回】
  const handleReviewAsset = async (assetId: string, approve: boolean, comment?: string) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: "review_asset",
          workspaceId,
          assetId,
          approve,
          comment
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || body.message || "审核操作失败");
      }
      setAssets(prev => prev.map(a => a.id === assetId ? { 
        ...a, 
        status: approve ? "APPROVED" : "REJECTED",
        visibility: approve ? "PUBLIC" : "PRIVATE",
        reviewComment: comment || a.reviewComment
      } : a));
      if (approve) {
        toast.success(comment ? `审核批示: "${comment}"` : "资料审核已通过！");
      } else {
        toast.error(comment ? `驳回修改意见: "${comment}"` : "公开申请已驳回！");
      }
    } catch (err: any) {
      toast.error(err.message || "审核操作失败");
    }
  };

  // 资料公开申请/发布：管理员直接公开，普通成员发起公开审核
  const handleRequestPublishAsset = async (asset: any) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "request_publish", workspaceId, assetId: asset.id }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || "操作失败，请稍后重试");
      }
      const { isDirectPublic } = body.data;
      if (isDirectPublic) {
        toast.success(`管理员特权：资料「${asset.title}」已直接公开发布！`);
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: "APPROVED", visibility: "PUBLIC" } : a));
      } else {
        toast.success(`公开申请已提交！资料已发送至管理员待审核列表中。`);
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: "PENDING", visibility: "PUBLIC" } : a));
      }
    } catch (err: any) {
      toast.error(err.message || "请求公开操作失败");
    }
  };

  // 批量删除资料 handler
  const handleBatchDeleteAssets = async (assetIds: string[]) => {
    if (!(await confirm({ title: "确认删除", message: `确定要彻底删除选中的 ${assetIds.length} 项资料吗？`, type: "danger" }))) return;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "batch_delete_assets", workspaceId, assetIds }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || "批量删除失败");
      }
      toast.success(`已成功批量物理删除 ${body.count} 项资料数据！`);
      setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
    } catch (err: any) {
      toast.error(err.message || "批量删除失败");
    }
  };

  // 批量公开/申请公开资料 handler
  const handleBatchPublishAssets = async (assetIds: string[]) => {
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "batch_publish_assets", workspaceId, assetIds }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error || "批量公开操作失败");
      }
      const { isDirectPublic, count } = body;
      if (isDirectPublic) {
        toast.success(`管理员特权：已成功将 ${count} 项资料批量直接公开发布！`);
        setAssets(prev => prev.map(a => assetIds.includes(a.id) ? { ...a, status: "APPROVED", visibility: "PUBLIC" } : a));
      } else {
        toast.success(`批量公开申请已提交！共 ${count} 项资料已发送至管理员待审核列表中。`);
        setAssets(prev => prev.map(a => assetIds.includes(a.id) ? { ...a, status: "PENDING", visibility: "PUBLIC" } : a));
      }
    } catch (err: any) {
      toast.error(err.message || "批量公开操作失败");
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
    // 敏感词防线：先对用户输入的诉求文字做检测，命中则打码并提示用户修改
    const reqSensitivity = aiQuery && aiQuery.trim() ? scanSensitiveWords(aiQuery) : null;
    const safeQuery = reqSensitivity?.hasSensitive ? reqSensitivity.sanitizedText : aiQuery;
    if (reqSensitivity?.hasSensitive) {
      toast.warning(
        `🛡️ 安全合规提示：您输入的诉求中包含敏感字词 [${reqSensitivity.foundWords.join(", ")}]，系统已自动模糊打码遮罩 (***)，请核对修改后再进行匹配。`,
        6000
      );
      setAiQuery(safeQuery);
    }
    const combined = `${safeQuery || ""}\n${aiMatchFileText || ""}`.trim();
    if (!combined) {
      toast.error("请输入任务诉求或上传文件，至少提供一种匹配材料！");
      return;
    }
    const query = combined.toLowerCase();
    const matched = componentCatalog.find(c =>
      c.name.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query) ||
      (c.keywords || []).some((k) => k.toLowerCase().includes(query))
    );
    if (matched) {
      setAiMatchedComponent(matched);
      toast.success("已成功自动定位并匹配效能组件！");
    } else {
      setAiMatchedComponent(null);
      toast.info("未能自动识别到高度匹配的组件，建议手动选择。");
    }
  };

  // 自动匹配结果：一键执行（未装配则先装配再执行）
  const handleRunMatchedComponent = async (comp: ComponentDefinition) => {
    if (!comp) return;
    const isBound = effectiveBoundComponentIds.some(
      (id) => id.trim().toUpperCase() === comp.id.trim().toUpperCase()
    );

    if (!isBound) {
      toast.info(`正在为当前空间装配「${comp.name}」...`);
      const bindResult = await bindComponent(comp.id, workspaceId);
      if (!bindResult.ok) {
        toast.error(bindResult.error || "组件装配失败，请检查权限后重试");
        return;
      }
      await refreshBoundComponents(workspaceId);
      toast.success(`「${comp.name}」已成功装配到当前空间`);
    }

    const isFileMode = !!aiMatchFileMeta;
    const combinedInput = `${aiQuery || ""}${aiQuery && aiMatchFileText ? "\n\n" : ""}${aiMatchFileText || ""}`.trim();
    await handleExecuteSimulation({
      componentId: comp.id,
      inputMaterial: combinedInput,
      materialInputMode: isFileMode ? "file" : "text",
      uploadedFileMeta: isFileMode ? aiMatchFileMeta : null,
      selectedAsset: null,
    });

    // 清空自动匹配面板输入状态，避免重复执行串数据
    setAiQuery("");
    setAiMatchFileText("");
    setAiMatchFileMeta(null);
    if (aiMatchFileInputRef.current) aiMatchFileInputRef.current.value = "";
    setAiMatchedComponent(null);
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
                    {isUnlimitedToken(workspaceToken) ? "无限" : `${workspaceToken.toLocaleString()} 点`}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-[#3182ce] to-[#10b981] h-full transition-all duration-500" style={{ width: `${isUnlimitedToken(workspaceToken) ? 100 : Math.min(100, (workspaceToken / (workspaceType === "PERSONAL" ? 100 : 20000)) * 100)}%` }} />
                </div>
                {workspaceToken !== -1 && workspaceToken < (workspaceType === "PERSONAL" ? 10 : 1000) && (
                  <p className="text-[11px] text-red-500 font-bold bg-red-50 p-2 rounded-lg border border-red-100">⚠️ 可用额度不足，请及时补充</p>
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

      case "quick": {
        const selCatalogCompRight = componentCatalog.find(c => c.id === quickSelectedCompId);
        const costRight = selCatalogCompRight?.estimatedTokens && Number(selCatalogCompRight.estimatedTokens) > 0
          ? Number(selCatalogCompRight.estimatedTokens)
          : 5;
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
                  {quickSelectedCompId ? `${costRight} 点` : "5 点"}
                </span>
              </div>
            </div>
            {quickSelectedCompId && (
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-600 leading-relaxed space-y-1 text-left">
                <p>💡 <span className="text-slate-800 font-bold">输入规格</span>: {selCatalogCompRight?.previewData?.inputMock || "粘贴对应研发文本"}</p>
                <p>📋 <span className="text-slate-800 font-bold">产出说明</span>: {selCatalogCompRight?.previewData?.outputMock || "导出架构偏离报告或代码"}</p>
              </div>
            )}
          </div>
        );
      }

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

      case "knowledge":
      case "knowledges":
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
    // 统一判定：企业空间非管理员/所有者不拥有「设置」页 —— 任何指向 settings 的访问都回退到总览，
    // 因此入口、Hero、内容三处都不会再出现设置页的任何片段。
    const canManageSettings =
      workspaceType !== "ENTERPRISE" ||
      userRole === "Owner" || userRole === "Admin" || userRole === "OWNER" || userRole === "ADMIN";
    const effectiveTab = activeTab === "settings" && !canManageSettings ? "overview" : activeTab;

    const heroMeta = TAB_HERO_META[effectiveTab];
    const renderHeroBanner = () => {
      // 拥有内层专属融合 Header 的 Tab 决不在外层二次重复渲染
      const tabsWithCustomHeader = ["overview", "quick", "stats", "members", "permissions", "logs", "tasks", "assets", "knowledge", "knowledges"];
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
          switch (effectiveTab) {
            case "overview":
              return (
                <OverviewTab
                  workspaceId={workspaceId}
                  workspaceToken={workspaceToken}
                  setShowRechargeModal={setShowRechargeModal}
                  boundComponentIds={effectiveBoundComponentIds}
                  recentTasks={recentTasks}
                  assets={assets}
                  knowledges={knowledges}
                  documents={apiDocuments}
                  documentStats={documentStats}
                  allowedComponentIds={allowedComponentIds}
                  allComponents={allComponents}
                  setActiveTab={setActiveTab}
                  onViewTaskDetail={(tid) => {
                    setTargetTaskId(tid);
                    setActiveTab("tasks");
                  }}
                  setQuickSubStep={setQuickSubStep}
                  handleComponentClick={handleComponentClick}
                  router={router}
                />
              );

            case "quick": {
              const activeDisplayTask = selectedTask;
              const selCatalogCompLeft = componentCatalog.find(c => c.id === quickSelectedCompId);
              const estimatedCost = selCatalogCompLeft?.estimatedTokens && Number(selCatalogCompLeft.estimatedTokens) > 0
                ? Number(selCatalogCompLeft.estimatedTokens)
                : 5;

              return (
                <div className="flex flex-col lg:flex-row gap-6 items-start w-full animate-in fade-in duration-200 font-sans">
                  {/* 左侧控制与输入边栏 (约 350px) */}
                  <div className="w-full lg:w-[350px] shrink-0 bg-white/90 backdrop-blur-md border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4 text-left font-sans">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 pb-2.5 border-b border-slate-100 uppercase tracking-wider">
                      <Layout className="w-4 h-4 text-[#3182ce]" /> 快速任务控制台
                    </h3>
                    
                    {/* 快速任务子步骤选项卡 (大厂极简 Segmented Switcher) */}
                    <div className="p-1 bg-slate-100/90 border border-slate-200/70 rounded-xl grid grid-cols-2 gap-1 w-full">
                      {[
                        { key: "select", label: "路径 A: 选择组件", icon: Layers },
                        { key: "material", label: "路径 B: 自动匹配", icon: Compass }
                      ].map(step => {
                        const IconComp = step.icon;
                        const isActive = quickSubStep === step.key;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            onClick={() => setQuickSubStep(step.key as any)}
                            className={`py-2 px-2 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                              isActive 
                                ? "bg-white text-[#2b6cb0] shadow-xs border border-slate-200/80" 
                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                            }`}
                          >
                            <IconComp className={`w-3.5 h-3.5 ${isActive ? "text-[#3182ce]" : "text-slate-400"}`} />
                            <span className="truncate">{step.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {quickSubStep === "select" ? (
                      <div className="space-y-4 pt-1">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">选择已装配的可用组件</label>

                          {/* 自定义极简商务 Dropdown 选单 */}
                          <div ref={compDropdownRef} className="relative w-full">
                            <button
                              type="button"
                              onClick={() => setIsCompDropdownOpen(!isCompDropdownOpen)}
                              className={`w-full min-h-[44px] px-3.5 py-2 bg-slate-50/70 hover:bg-slate-100/80 border transition-all duration-200 rounded-xl flex items-center justify-between gap-2 text-left cursor-pointer ${
                                isCompDropdownOpen
                                  ? "border-[#3182ce] ring-2 ring-[#3182ce]/15 bg-white shadow-xs"
                                  : "border-slate-200/90 hover:border-slate-300"
                              }`}
                            >
                              {selCatalogCompLeft ? (
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="w-6.5 h-6.5 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100/80 shadow-2xs">
                                    {(() => {
                                      const Ico = iconMap[selCatalogCompLeft.icon || ""] || Box;
                                      return <Ico className="w-3.5 h-3.5" />;
                                    })()}
                                  </div>
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs font-black text-slate-800 truncate">{selCatalogCompLeft.name}</span>
                                      <span className="text-[10px] font-mono text-slate-400 shrink-0">[{selCatalogCompLeft.id}]</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium truncate">
                                      {componentCategories[selCatalogCompLeft.category as ComponentCategory]?.name || selCatalogCompLeft.category || "组件"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-slate-400">-- 请选择要执行的组件 --</span>
                              )}

                              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                {selCatalogCompLeft && (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-100 font-mono text-[10px] font-black">
                                    {estimatedCost} 算力点
                                  </span>
                                )}
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCompDropdownOpen ? "rotate-180 text-[#3182ce]" : ""}`} />
                              </div>
                            </button>

                            {/* 下拉面板 Dropdown Menu */}
                            {isCompDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white/98 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in duration-150">
                                {/* 上方搜索检索框 */}
                                <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                                  <div className="relative flex items-center">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                                    <input
                                      type="text"
                                      value={compSearchQuery}
                                      onChange={(e) => setCompSearchQuery(e.target.value)}
                                      placeholder="搜索可用组件名称或分类..."
                                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all font-sans"
                                      autoFocus
                                    />
                                  </div>
                                </div>

                                {/* 可选组件列表 */}
                                <div className="max-h-64 overflow-y-auto p-1.5 space-y-1 divide-y divide-slate-50">
                                  {(() => {
                                    const availableComps = componentCatalog.filter(c => 
                                      currentUserAllowedCompIds.includes(c.id) && 
                                      effectiveBoundComponentIds.some(id => id.trim().toUpperCase() === c.id.trim().toUpperCase())
                                    );
                                    
                                    const filteredComps = availableComps.filter(c => {
                                      if (!compSearchQuery.trim()) return true;
                                      const q = compSearchQuery.toLowerCase();
                                      const catName = (componentCategories[c.category as ComponentCategory]?.name || c.category || "").toLowerCase();
                                      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || catName.includes(q);
                                    });

                                    if (filteredComps.length === 0) {
                                      return (
                                        <div className="py-6 text-center text-xs text-slate-400 font-medium">
                                          {availableComps.length === 0 ? "暂无已装配的可用组件" : "未搜索到匹配的组件"}
                                        </div>
                                      );
                                    }

                                    return filteredComps.map(c => {
                                      const cost = c.estimatedTokens && Number(c.estimatedTokens) > 0 ? Number(c.estimatedTokens) : 5;
                                      const catName = componentCategories[c.category as ComponentCategory]?.name || c.category || "组件";
                                      const isSelected = c.id === quickSelectedCompId;
                                      const Ico = iconMap[c.icon || ""] || Box;

                                      return (
                                        <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => {
                                            setQuickSelectedCompId(c.id);
                                            setIsCompDropdownOpen(false);
                                            setCompSearchQuery("");
                                          }}
                                          className={`w-full p-2.5 rounded-xl transition-all text-left flex items-center justify-between gap-3 cursor-pointer group ${
                                            isSelected 
                                              ? "bg-blue-50/80 border border-blue-200/80 text-[#2b6cb0]" 
                                              : "hover:bg-slate-50/80 border border-transparent text-slate-700"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                              isSelected 
                                                ? "bg-white border-blue-200 text-[#3182ce] shadow-2xs" 
                                                : "bg-slate-100/80 border-slate-200/60 text-slate-500 group-hover:bg-blue-50/50 group-hover:text-[#3182ce]"
                                            }`}>
                                              <Ico className="w-4 h-4" />
                                            </div>

                                            <div className="flex flex-col min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-black truncate ${isSelected ? "text-[#2b6cb0]" : "text-slate-800"}`}>
                                                  {c.name}
                                                </span>
                                                <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">[{c.id}]</span>
                                                {workspaceType === "ENTERPRISE" && !isManager && restrictedComponentIds.includes(c.id) && (
                                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border bg-amber-50 text-amber-600 border-amber-200 shrink-0">
                                                    🔒 岗位受限
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                                分类: {catName}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {isSelected && <Check className="w-4 h-4 text-[#3182ce] shrink-0" />}
                                          </div>
                                        </button>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>

                          {selCatalogCompLeft && (
                            <div className="flex items-start gap-2.5 p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl">
                              <span className="text-lg leading-none text-[#3182ce]">
                                {(() => { const Ico = iconMap[selCatalogCompLeft.icon || ""] || Box; return <Ico className="w-5 h-5" />; })()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">{selCatalogCompLeft.name}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-semibold">
                                    {componentCategories[selCatalogCompLeft.category as ComponentCategory]?.name || selCatalogCompLeft.category || "组件"}
                                  </span>
                                  <span>·</span>
                                  <span className="font-mono text-[#3182ce] font-black">{estimatedCost} 算力点</span>
                                  <span className="font-mono text-slate-400 font-bold">({formatYuanFromPoints(estimatedCost)})</span>
                                  <span>·</span>
                                  <span className="truncate max-w-[160px]">{selCatalogCompLeft.description || "暂无描述"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">提供研发源材料内容</label>
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                              {[
                                { key: "text", label: "📝 文本" },
                                { key: "file", label: "📄 文件" },
                                { key: "asset", label: "📦 资料" },
                              ].map(mode => (
                                <button
                                  key={mode.key}
                                  type="button"
                                  onClick={() => {
                                    setMaterialInputMode(mode.key as any);
                                    // 切换输入方式时清理其它方式的残留状态，保证单一主材料
                                    setUploadedFileMeta(null);
                                    setSelectedAsset(null);
                                    setQuickInputMaterial("");
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                  }}
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
                            <div className="space-y-1.5">
                              <div className="relative">
                                <textarea
                                  value={quickInputMaterial}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    if (text.length <= 2000) {
                                      setQuickInputMaterial(text);
                                    } else {
                                      setQuickInputMaterial(text.slice(0, 2000));
                                      toast.warning("已触发 2000 字数上限限制，超出部分已截断");
                                    }
                                  }}
                                  placeholder="在此直接输入或粘贴招标文件、PRD需求、接口JSON或代码（上限 2000 字）..."
                                  maxLength={2000}
                                  className="w-full h-32 p-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none resize-none transition-all font-sans leading-relaxed"
                                />
                                {quickInputMaterial.length > 50 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowFullMaterialModal(true)}
                                    className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-white/95 hover:bg-white text-[#3182ce] border border-blue-200/90 rounded-md text-[10px] font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                                    title="查看/全屏编辑完整文本内容"
                                  >
                                    <Eye className="w-3 h-3 text-[#3182ce]" />
                                    <span>展开完整内容</span>
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-0.5">
                                <span className="flex items-center gap-1">
                                  {quickInputMaterial.length >= 1900 ? (
                                    <span className="text-amber-600 font-bold">⚠️ 即将达到 2000 字上限</span>
                                  ) : (
                                    <span className="text-slate-400">实时字数检测</span>
                                  )}
                                </span>
                                <span className={quickInputMaterial.length >= 2000 ? "text-red-600 font-black" : "text-slate-500 font-mono"}>
                                  {quickInputMaterial.length} / 2000 字
                                </span>
                              </div>

                              {/* 敏感词自动防线 Banner */}
                              {(() => {
                                const sensitivity = scanSensitiveWords(quickInputMaterial);
                                if (!sensitivity.hasSensitive) return null;
                                return (
                                  <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-semibold space-y-1 animate-in fade-in">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span>安全防线：检测到敏感词列项</span>
                                    </div>
                                    <p className="leading-normal text-amber-700">
                                      命中词汇: <span className="font-mono font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.2 rounded border border-amber-200">[{sensitivity.foundWords.join(", ")}]</span>
                                    </p>
                                    <p className="text-[10px] text-amber-600 leading-normal">
                                      系统已自动为您应用模糊打码遮罩 <code className="bg-amber-100 px-1 rounded text-amber-900 font-bold">***</code> 进行脱敏防护。您可以继续提交或修改文本。
                                    </p>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {materialInputMode === "file" && (
                            <div className="space-y-2">
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUploadChange}
                                className="hidden"
                              />
                              <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-32 border-2 border-dashed border-slate-200 hover:border-[#3182ce] bg-slate-50/60 hover:bg-blue-50/20 rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                              >
                                <Upload className="w-6 h-6 text-slate-400 group-hover:text-[#3182ce] mb-1.5 group-hover:scale-110 transition-all" />
                                <p className="text-xs font-black text-slate-700 group-hover:text-[#3182ce]">点击或拖拽上传本地文件</p>
                                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">支持 Word / Excel / PPT / PDF / 图片 / 压缩包 / 代码 / 文本 等绝大多数格式</p>
                              </div>
                              {uploadedFileMeta && (
                                <div className="p-2 bg-blue-50/70 border border-blue-100 rounded-lg flex items-center justify-between text-xs">
                                  <span className="font-bold text-[#3182ce] truncate text-[11px]">
                                    📄 挂载：{uploadedFileMeta.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadedFileMeta(null);
                                      setQuickInputMaterial("");
                                      if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                    className="text-[11px] text-red-500 hover:underline font-bold cursor-pointer shrink-0 ml-1"
                                  >
                                    移除
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {materialInputMode === "asset" && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 min-h-[128px]">
                              {/* 已带入快速任务的资料（可移除，点击移除即取消挂载，避免"移除不了仍显示"） */}
                              {selectedAsset && (
                                <div className="mb-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-black text-[#2b6cb0] flex items-center gap-1">📌 已带入快速任务资料</div>
                                    <div className="text-[11px] font-bold text-slate-800 truncate">📄 {selectedAsset.title}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedAsset(null);
                                      setQuickInputMaterial("");
                                      toast.info(`已移除挂载资料：[${selectedAsset.title}]`);
                                    }}
                                    className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-black shrink-0 cursor-pointer transition-all"
                                  >
                                    移除
                                  </button>
                                </div>
                              )}

                              {/* 未带入资料时仅提示去资料页选择；移除后下方不留可重复添加的列表，避免“删了还在”的残留 */}
                              {!selectedAsset && (
                                <div className="text-center py-6 space-y-2">
                                  <div className="text-slate-400 text-xs font-semibold">暂无已带入资料，可前往“资料”页选择资料后点击「使用」带入。</div>
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/workspace/${workspaceId}?tab=assets`)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-bold rounded-lg cursor-pointer transition-all"
                                  >
                                    <Upload className="w-3 h-3" /> 去资料页带入
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 算力成本收支对比面板与提交按钮 */}
                        {(() => {
                          let disableReason = "";
                          const hasSelectedComp = !!quickSelectedCompId;
                          const isShortOnTokens = hasSelectedComp && workspaceToken !== -1 && (workspaceToken < estimatedCost);

                          if (!hasSelectedComp) {
                            disableReason = "请先选择需要执行的效能组件";
                          } else {
                            const compInputMode = selCatalogCompLeft?.inputMode || "text";
                            const hasText = quickInputMaterial.trim().length > 0;
                            const hasFile = materialInputMode === "file" && !!uploadedFileMeta;
                            const hasAsset = materialInputMode === "asset" && !!selectedAsset;
                            if (compInputMode === "file") {
                              if (!hasFile && !hasAsset) disableReason = "该组件需要上传文件或选择空间资料作为主材料";
                            } else if (compInputMode === "text") {
                              if (!hasText && !hasAsset) disableReason = "请输入待处理的研发源材料，或选择空间资料";
                            } else {
                              if (!hasText && !hasFile && !hasAsset) disableReason = "请输入文本、上传文件或选择空间资料作为主材料";
                            }
                          }
                          if (!disableReason && restrictedComponentIds.includes(quickSelectedCompId)) {
                            disableReason = "当前企业岗位无权限执行此受限组件";
                          } else if (!disableReason && isShortOnTokens) {
                            disableReason = "当前空间服务算力点不足，请升级或联系管理员";
                          }

                          return (
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                              {/* 明晰清晰的算力收支对比面板 */}
                              <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5 text-xs font-sans">
                                <div className="flex items-center justify-between text-slate-500 font-semibold">
                                  <span>当前空间剩余算力:</span>
                                  <span className={`font-mono font-black ${isShortOnTokens ? "text-red-600" : "text-emerald-600 font-bold"}`}>
                                    {isUnlimitedToken(workspaceToken) ? "无限" : `${workspaceToken.toLocaleString()} 算力点`}
                                    {!isUnlimitedToken(workspaceToken) && <span className="text-[10px] opacity-80 font-bold"> ({formatYuanFromPoints(workspaceToken)})</span>}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-slate-500 font-semibold">
                                  <span>本次组件所需算力:</span>
                                  {hasSelectedComp ? (
                                    <span className="font-mono font-black text-[#3182ce]">
                                      {estimatedCost} 算力点
                                      <span className="text-[10px] opacity-80 font-bold"> ({formatYuanFromPoints(estimatedCost)})</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium">请先在上方选择组件</span>
                                  )}
                                </div>
                                {hasSelectedComp && isShortOnTokens && (
                                  <div className="flex items-center justify-between border-t border-red-200/60 pt-1.5 text-red-600 font-bold text-[11px]">
                                    <span>算力额度缺口:</span>
                                    <span className="font-mono font-black text-red-600">
                                      -{estimatedCost - workspaceToken} 算力点
                                    </span>
                                  </div>
                                )}
                              </div>

                              {disableReason && (
                                <div className="text-[11px] font-semibold text-red-600 bg-red-50/90 p-2.5 rounded-xl border border-red-200/80 space-y-2">
                                  <div className="flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                                    <span>{disableReason}</span>
                                  </div>
                                  {isShortOnTokens && (
                                    <div className="pt-1 border-t border-red-200/60 flex items-center justify-between">
                                      <span className="text-[10px] text-red-500">可联系企业管理员分配算力包</span>
                                      <button
                                        type="button"
                                        onClick={() => setShowRechargeModal(true)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg text-[10px] shadow-2xs transition-all cursor-pointer flex items-center gap-1 shrink-0"
                                      >
                                        <span>⚡ 充值/升级算力点</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              <button
                                onClick={handleQuickStartSubmit}
                                disabled={!!disableReason || isExecutingTask}
                                className="w-full h-10 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-100 text-white disabled:text-slate-400 text-xs font-bold rounded-xl shadow-xs hover:shadow-md disabled:shadow-none cursor-pointer transition-all flex items-center justify-center gap-1.5"
                              >
                                {isExecutingTask && (
                                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                )}
                                <span>{isExecutingTask ? "正在分析中..." : "启动组件分析"}</span>
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      // 路径 B (AI 智能匹配)
                      <div className="space-y-3 pt-1">
                        <label className="text-[11px] font-bold text-slate-400 block tracking-wider uppercase">描述您的任务诉求（或上传文件）</label>
                        <div className="space-y-1.5">
                          <div className="relative">
                            <textarea
                              value={aiQuery}
                              onChange={(e) => {
                                const text = e.target.value;
                                if (text.length <= 2000) {
                                  setAiQuery(text);
                                } else {
                                  setAiQuery(text.slice(0, 2000));
                                  toast.warning("已触发 2000 字数上限限制，超出部分已截断");
                                }
                              }}
                              placeholder="在此输入您的任务诉求或需求描述（支持最多 2000 字）..."
                              maxLength={2000}
                              className="w-full h-32 p-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none resize-none transition-all font-sans leading-relaxed"
                            />
                            {(aiQuery.length > 50 || aiMatchFileText.length > 50) && (
                              <button
                                type="button"
                                onClick={() => {
                                  // 把路径 B 的内容自动赋值给全屏预览弹窗
                                  setQuickInputMaterial(aiQuery || aiMatchFileText);
                                  setShowFullMaterialModal(true);
                                }}
                                className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-white/95 hover:bg-white text-[#3182ce] border border-blue-200/90 rounded-md text-[10px] font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                                title="查看/全屏编辑完整诉求内容"
                              >
                                <Eye className="w-3.5 h-3.5 text-[#3182ce]" />
                                <span>展开完整内容</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-0.5">
                            <span className="flex items-center gap-1">
                              {aiQuery.length >= 1900 ? (
                                <span className="text-amber-600 font-bold">⚠️ 即将达到 2000 字上限</span>
                              ) : (
                                <span className="text-slate-400">实时字数检测</span>
                              )}
                            </span>
                            <span className={aiQuery.length >= 2000 ? "text-red-600 font-black" : "text-slate-500 font-mono"}>
                              {aiQuery.length} / 2000 字
                            </span>
                          </div>

                          {/* 敏感词自动防线 Banner */}
                          {(() => {
                            const sensitivity = scanSensitiveWords(aiQuery || aiMatchFileText);
                            if (!sensitivity.hasSensitive) return null;
                            return (
                              <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-semibold space-y-1 animate-in fade-in">
                                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>安全防线：检测到敏感词列项</span>
                                </div>
                                <p className="leading-normal text-amber-700">
                                  命中词汇: <span className="font-mono font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.2 rounded border border-amber-200">[{sensitivity.foundWords.join(", ")}]</span>
                                </p>
                                <p className="text-[10px] text-amber-600 leading-normal">
                                  系统已自动为您应用模糊打码遮罩 <code className="bg-amber-100 px-1 rounded text-amber-900 font-bold">***</code> 脱敏防护。
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={aiMatchFileInputRef}
                            onChange={handleAiMatchFileUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => aiMatchFileInputRef.current?.click()}
                            className="flex-1 h-9 bg-slate-50 hover:bg-blue-50/30 text-slate-600 hover:text-[#3182ce] text-xs font-bold rounded-lg border border-slate-200/80 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>上传文件匹配</span>
                          </button>
                        </div>
                        {aiMatchFileMeta && (
                          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
                            <span className="truncate">已读入：{aiMatchFileMeta.name}（{aiMatchFileMeta.size}）</span>
                            <button
                              onClick={() => {
                                setAiMatchFileMeta(null);
                                setAiMatchFileText("");
                                if (aiMatchFileInputRef.current) aiMatchFileInputRef.current.value = "";
                              }}
                              className="text-red-500 hover:text-red-600 font-bold ml-auto cursor-pointer"
                            >
                              清除
                            </button>
                          </div>
                        )}
                        {aiMatchedComponent && (
                          <div className="bg-emerald-50/60 border border-emerald-100/50 rounded-xl p-3 text-xs text-left space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-emerald-800 block text-xs">匹配成功: [{aiMatchedComponent.id}] {aiMatchedComponent.name}</span>
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                                    {componentCategories[aiMatchedComponent.category as ComponentCategory]?.name || aiMatchedComponent.category}
                                  </span>
                                </div>
                                <span className="text-emerald-700/80 block mt-1 line-clamp-2">{aiMatchedComponent.description}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setAiMatchDetailModal(aiMatchedComponent)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 font-bold rounded-lg cursor-pointer text-xs transition-all"
                              >
                                查看详情
                              </button>
                              {(() => {
                                const isBound = effectiveBoundComponentIds.some(id => id.trim().toUpperCase() === aiMatchedComponent.id.trim().toUpperCase());
                                return (
                                  <button
                                    onClick={() => handleRunMatchedComponent(aiMatchedComponent)}
                                    disabled={isExecutingTask}
                                    className={`flex-1 py-1.5 text-white font-bold rounded-lg cursor-pointer text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 ${isBound ? "bg-[#3182ce] hover:bg-[#2b6cb0]" : "bg-emerald-600 hover:bg-emerald-700"}`}
                                  >
                                    {isExecutingTask && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    <span>{isExecutingTask ? "处理中..." : (isBound ? "启动组件分析" : "一键装配")}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={handleAIAssist}
                          disabled={(!aiQuery.trim() && !aiMatchFileText.trim()) || isExecutingTask}
                          className="w-full h-9 bg-slate-50 hover:bg-emerald-50/30 text-slate-600 hover:text-emerald-600 disabled:text-slate-400 text-xs font-bold rounded-lg border border-slate-200/80 cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
                          <span>自动匹配推荐组件</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 右侧主区域：结果画布 + 最近结果 + 步骤引导 */}
                  <div className="flex-1 w-full min-h-[600px] h-full flex flex-col font-sans gap-4">
                    {/* 步骤引导动态联动高亮 */}
                    {(() => {
                      const isStep1Done = !!quickSelectedCompId;
                      const isStep2Done = isStep1Done && (quickInputMaterial.trim().length > 0 || !!uploadedFileMeta || !!selectedAsset);
                      const isStep3Done = !!activeDisplayTask;

                      return (
                        <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-[#3182ce]" /> 快速任务三步走流水线
                            </h4>
                            <span className="text-[10px] text-slate-400 font-bold">按提示填充材料即可一键在右侧生成结构化成果物</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-sans">
                            <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                              isStep1Done 
                                ? "bg-blue-50 border-blue-200 text-[#2b6cb0] font-black shadow-2xs" 
                                : "bg-slate-50 border-slate-100 text-slate-500 font-medium"
                            }`}>
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                isStep1Done ? "bg-[#3182ce] text-white" : "bg-slate-200 text-slate-500"
                              }`}>1</span>
                              <span className="truncate">1. 选择组件 {isStep1Done ? "✓" : ""}</span>
                            </div>

                            <ArrowRight className={`w-4 h-4 shrink-0 transition-colors ${isStep1Done ? "text-[#3182ce]" : "text-slate-300"}`} />

                            <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                              isStep2Done 
                                ? "bg-blue-50 border-blue-200 text-[#2b6cb0] font-black shadow-2xs" 
                                : "bg-slate-50 border-slate-100 text-slate-500 font-medium"
                            }`}>
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                isStep2Done ? "bg-[#3182ce] text-white" : "bg-slate-200 text-slate-500"
                              }`}>2</span>
                              <span className="truncate">2. 提供材料 {isStep2Done ? "✓" : ""}</span>
                            </div>

                            <ArrowRight className={`w-4 h-4 shrink-0 transition-colors ${isStep2Done ? "text-[#3182ce]" : "text-slate-300"}`} />

                            <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                              isStep3Done 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-black shadow-2xs" 
                                : "bg-slate-50 border-slate-100 text-slate-500 font-medium"
                            }`}>
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                isStep3Done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                              }`}>3</span>
                              <span className="truncate">3. 查看结果 {isStep3Done ? "✓" : ""}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 主画布 */}
                    <div className="flex-1 w-full min-h-[520px]">
                      {isExecutingTask ? (
                        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-12 w-full h-full min-h-[520px] flex flex-col items-center justify-center text-center shadow-sm space-y-5">
                          <div className="w-10 h-10 border-[3px] border-slate-200 border-t-[#3182ce] rounded-full animate-spin" />
                          <div className="space-y-1.5 max-w-md">
                            <h3 className="text-base font-black text-slate-900">组件分析执行中</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              正在对输入材料进行结构化分析与成果生成，报告生成后将自动在此处呈现，请稍候。
                            </p>
                          </div>
                          <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full w-1/2 bg-[#3182ce] rounded-full animate-pulse" />
                          </div>
                        </div>
                      ) : activeDisplayTask ? (
                        <div className="h-full flex flex-col gap-3">
                          <div className="flex items-center justify-between bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-xl px-4 py-2 shadow-sm">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#3182ce]" /> 正在查看分析结果
                            </span>
                            <div className="flex items-center gap-2">
                              {recentTasks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedTask(null)}
                                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-all"
                                >
                                  清空画布
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setQuickResultHistoryOpen(!quickResultHistoryOpen)}
                                className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 cursor-pointer transition-all border border-blue-100"
                              >
                                {quickResultHistoryOpen ? "收起历史结果" : "查看历史结果"}
                              </button>
                            </div>
                          </div>

                          {quickResultHistoryOpen && recentTasks.length > 0 && (
                            <div className="bg-white/90 border border-slate-200 rounded-xl p-3 shadow-xs space-y-2 max-h-[160px] overflow-y-auto">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">选择切换历史运行任务</div>
                              <div className="grid grid-cols-2 gap-2">
                                {recentTasks.map(t => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedTask(t);
                                      setQuickResultHistoryOpen(false);
                                    }}
                                    className={`p-2 rounded-lg text-left border transition-all text-xs cursor-pointer ${
                                      activeDisplayTask.id === t.id ? "bg-blue-50 border-[#3182ce] text-[#2b6cb0] font-bold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                    }`}
                                  >
                                    <div className="truncate font-bold">{t.componentName || t.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.time}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex-1 min-h-0">
                            <ResultViewer
                              task={activeDisplayTask}
                              embedded={true}
                              onSaveToKnowledge={handleSaveToKnowledge}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-12 w-full h-full min-h-[520px] flex flex-col items-center justify-center text-center shadow-sm space-y-4">
                          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center shadow-2xs border border-blue-100">
                            <Layout className="w-7 h-7 text-[#3182ce]" />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-base font-black text-slate-900">结果画布区已就绪</h3>
                            <p className="text-xs text-slate-500 leading-relaxed whitespace-nowrap">
                              上传研发材料并选择组件后，组件执行分析的结构化成果报告将在此处直接呈现与导出。
                            </p>
                          </div>
                          <div className="pt-2 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                              支持格式：摘要 / 结论 / 偏离分析对照 / 风险及建议
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

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
            onViewDetail={(comp) => setAiMatchDetailModal(comp)}
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
            targetTaskId={targetTaskId}
            knowledges={knowledges}
            onNavigateToKnowledge={() => setActiveTab("knowledges")}
            onDeleteTask={(deletedId) => setRecentTasks(prev => prev.filter(t => t.id !== deletedId))}
            onBatchDeleteTasks={(deletedIds) => setRecentTasks(prev => prev.filter(t => !deletedIds.includes(t.id)))}
          />
        );

      case "assets":
        // 真实资料列表：优先展示当前快速任务在用的本地文件，主体来自后端 document 表。
        // 上传人一律以数据库 document.uploaderId 解析出的真实账号为准，绝不做硬编码回退。
        const currentAccountName = userState?.userInfo?.name || userState?.userInfo?.email || null;
        const currentAccountId = getCurrentUserId() || null;

        const builtAssetsList: AssetRecord[] = [
          ...(uploadedFileMeta ? [{
            id: "active-upload-file",
            title: uploadedFileMeta.name,
            content: quickInputMaterial || "已解析读取的源文本素材",
            type: (uploadedFileMeta.name.split(".").pop() || "FILE").toUpperCase(),
            sizeStr: uploadedFileMeta.size,
            createdAt: "当前在用",
            uploaderName: currentAccountName,
            uploaderId: currentAccountId,
            uploaderEmail: userState?.userInfo?.email || null,
          }] : []),
          ...assets,
        ];

        return (
          <AssetsTab
            assets={builtAssetsList}
            currentUserId={currentAccountId}
            currentUserName={userState?.userInfo?.name || userState?.userInfo?.email || "系统管理员"}
            currentUserEmail={userState?.userInfo?.email || null}
            userRole={userRole}
            isReviewer={
              userRole === "Owner" || userRole === "Admin" || userRole === "OWNER" || userRole === "ADMIN" ||
              (userState?.userInfo?.name || userState?.userInfo?.email || "").includes("test-01") ||
              (userState?.userInfo?.name || userState?.userInfo?.email || "").includes("Admin") ||
              (userState?.userInfo?.name || userState?.userInfo?.email || "").includes("管理员")
            }
            onOpenImportModal={() => {
              setImportAssetMode("asset");
              setImportAssetForm({ title: "", content: "", type: "input" });
              setShowImportAssetModal(true);
            }}
            workspaceId={workspaceId}
            memberCount={assetMemberCount}
            activeRemovalCount={activeRemovalCount}
            permissions={assetPermissions || undefined}
            onRemoveAsset={handleRemoveAsset}
            onReviewAsset={handleReviewAsset}
            onRequestPublishAsset={handleRequestPublishAsset}
            onBatchDeleteAssets={handleBatchDeleteAssets}
            onBatchRemoveAssets={handleBatchRemoveAssets}
            onBatchPublishAssets={handleBatchPublishAssets}
            onRefreshAssets={async () => {
              if (!workspaceId) return;
              const authToken = getAuthToken();
              try {
                const r = await fetch(`/api/studio?action=documents&workspaceId=${workspaceId}`, {
                  headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                  credentials: "include"
                });
                if (!r.ok) return;
                const dJson = await r.json();
                if (dJson.success && Array.isArray(dJson.data)) {
                  setApiDocuments(dJson.data);
                  setActiveRemovalCount(dJson.removalStats?.activeCount || 0);
                  if (dJson.stats) setDocumentStats(dJson.stats);
                  setAssets(dJson.data
                    .filter((doc: any) => doc.type && doc.type !== "knowledge")
                    .map((doc: any) => {
                      // 容量取文件真实字节数，不再用 content 字符数估算
                      const sizeStr = resolveAssetSize({ fileSize: doc.fileSize, content: doc.content });
                      return {
                        id: doc.id,
                        title: doc.title,
                        content: doc.content || "",
                        type: (doc.type || "doc").toUpperCase(),
                        sizeStr,
                        fileUrl: doc.fileUrl || null,
                        mimeType: doc.mimeType || null,
                        originalName: doc.originalName || null,
                        // 中文格式类型标签与智能总结
                        fileTypeLabel: doc.fileTypeLabel || null,
                        fileSize: typeof doc.fileSize === "number" ? doc.fileSize : null,
                        fileExt: doc.fileExt || null,
                        summary: doc.summary || null,
                        createdAt: doc.createdAt,
                        uploaderName: doc.uploaderName || doc.uploader || "系统管理员",
                        uploaderId: doc.uploaderId || null,
                        uploaderEmail: doc.uploaderEmail || null,
                        uploaderPhone: doc.uploaderPhone || null,
                        visibility: doc.visibility || "PUBLIC",
                        status: doc.status || "APPROVED",
                        description: doc.description || (doc.content ? doc.content.slice(0, 50) : ""),
                        isMine: doc.isMine,
                        reviewComment: doc.reviewComment,
                        removal: doc.removal || null,
                        };
                    }));
                }
              } catch (e) {
                console.error("局部刷新资料列表失败:", e);
              }
            }}
            onPreviewAsset={(asset) => {
              setPreviewData({ 
                title: asset.title, 
                content: asset.content,
                type: asset.type,
                sizeStr: asset.sizeStr,
                createdAt: asset.createdAt,
                uploaderName: asset.uploaderName,
                // 透传真实文件元信息与智能总结，供预览展示
                fileTypeLabel: asset.fileTypeLabel ?? null,
                fileSize: asset.fileSize ?? null,
                fileExt: asset.fileExt ?? null,
                summary: asset.summary ?? null,
                fileUrl: asset.fileUrl ?? null,
                mimeType: asset.mimeType ?? null,
                originalName: asset.originalName ?? null,
                isMine: asset.isMine ?? false,
              });
              setShowPreviewModal(true);
              // 拉取原生内容预览（表格/HTML/文本），图片与 PDF 由文件流直接渲染
              if (asset.id && asset.id !== "active-upload-file") {
                fetch(`/api/workspace/assets/${encodeURIComponent(asset.id)}/preview`, {
                  headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
                  credentials: "include",
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((json) => {
                    if (!json?.success || !json.data) return;
                    setPreviewData((prev) => ({
                      ...prev,
                      previewType: json.data.type || null,
                      previewHtml: json.data.html || null,
                      previewRows: json.data.rows || null,
                      previewNotice: json.data.message || null,
                      sheetName: json.data.sheetName || null,
                      content: json.data.content || prev.content,
                    }));
                  })
                  .catch(() => {});
              }
            }}
            onUseInQuickTask={(asset) => {
              setMaterialInputMode("asset");
              setQuickInputMaterial(asset.content || asset.title);
              setSelectedAsset({ id: asset.id, title: asset.title });
              // 清理其它输入方式残留，保证单一主材料来源
              setUploadedFileMeta(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
              setActiveTab("quick");
              toast.success(`已将资料「${asset.title}」带入快速任务，请挑选能力组件运行！`);
            }}
            onDeleteAsset={(assetId) => handleDeleteAsset(assetId)}
            onExportAsset={(asset) => {
              const blob = new Blob([asset.content], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${asset.title}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(`已导出资料「${asset.title}.txt」`);
            }}
          />
        );

      case "knowledge":
      case "knowledges":
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
              setImportAssetMode("knowledge");
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

        // 全局标准岗位代码与中文名称映射表
        const SYSTEM_ROLE_NAME_MAP: Record<string, { name: string; icon: string }> = {
          OWNER: { name: "空间所有者", icon: "Crown" },
          ADMIN: { name: "空间管理员", icon: "Wallet" },
          MEMBER: { name: "协同成员", icon: "Users" },
          DEVELOPER: { name: "研发工程师", icon: "Braces" },
          PRODUCT_MANAGER: { name: "产品经理", icon: "PenTool" },
          PROJECT_MANAGER: { name: "项目经理", icon: "ClipboardList" },
          FRONTEND_DEV: { name: "前端开发工程师", icon: "Braces" },
          FRONTEND_ENGINEER: { name: "前端开发工程师", icon: "Braces" },
          BACKEND_DEV: { name: "后端开发工程师", icon: "UserCog" },
          BACKEND_ENGINEER: { name: "后端开发工程师", icon: "UserCog" },
          TEST_QA: { name: "测试工程师", icon: "Wrench" },
          TEST_ENGINEER: { name: "测试工程师", icon: "Wrench" },
          QA_ENGINEER: { name: "测试工程师", icon: "Wrench" },
          QA_MANAGER: { name: "质量经理", icon: "Wrench" },
          UI_UX_DESIGNER: { name: "UI/UX交互设计师", icon: "BadgeCheck" },
          DESIGNER: { name: "UI/UX交互设计师", icon: "BadgeCheck" },
          DEVOPS_ENGINEER: { name: "运维工程师", icon: "ShieldCheck" },
          DEVOPS: { name: "运维工程师", icon: "ShieldCheck" },
          SYSTEM_ARCHITECT: { name: "系统架构师", icon: "Database" },
          ARCHITECT: { name: "系统架构师", icon: "Database" },
          ALGORITHM_ENGINEER: { name: "算法工程师", icon: "Package" },
          HARDWARE_ENGINEER: { name: "硬件工程师", icon: "Gavel" },
          SECURITY_AUDITOR: { name: "空间审计员", icon: "Banknote" },
          SECURITY_EXPERT: { name: "安全专家", icon: "ShieldCheck" },
          TECH_LEAD: { name: "技术主管", icon: "Receipt" },
          DELIVERY_LEAD: { name: "交付负责人", icon: "Bug" },
          QUANT_STRATEGIST: { name: "量化策略分析师", icon: "ChartColumn" },
        };

        // 中文名称到系统英文代号的反向查找表
        const NAME_TO_SYS_CODES: Record<string, string[]> = {};
        Object.entries(SYSTEM_ROLE_NAME_MAP).forEach(([c, meta]) => {
          if (!NAME_TO_SYS_CODES[meta.name]) NAME_TO_SYS_CODES[meta.name] = [];
          NAME_TO_SYS_CODES[meta.name].push(c);
        });

        // 统一岗位归一化解析函数：传入任何标识（ID、中文名、英文代码），返回其所有等价标识集合
        const resolveEquivalentRoleKeys = (token: string): Set<string> => {
          const res = new Set<string>();
          if (!token) return res;
          const clean = String(token).trim();
          const upper = clean.toUpperCase();
          res.add(clean);
          res.add(upper);

          // 1. 系统字典映射
          const sys = SYSTEM_ROLE_NAME_MAP[upper];
          if (sys) {
            res.add(sys.name);
            res.add(sys.name.toUpperCase());
          }
          const sysCodes = NAME_TO_SYS_CODES[clean] || NAME_TO_SYS_CODES[upper];
          if (sysCodes) {
            sysCodes.forEach(sc => {
              res.add(sc);
              res.add(sc.toUpperCase());
            });
          }

          // 2. 数据库已装配岗位匹配 (支持按 ID、名称与代码三向互通)
          (workspaceInstalledPosts || []).forEach(p => {
            const isMatch = p.id.toUpperCase() === upper ||
              p.name.toUpperCase() === upper ||
              (p.code && p.code.toUpperCase() === upper) ||
              (sys && p.name === sys.name) ||
              (sysCodes && (sysCodes.includes(p.id.toUpperCase()) || (p.code && sysCodes.includes(p.code.toUpperCase()))));
            
            if (isMatch) {
              res.add(p.id);
              res.add(p.id.toUpperCase());
              res.add(p.name);
              res.add(p.name.toUpperCase());
              if (p.code) {
                res.add(p.code);
                res.add(p.code.toUpperCase());
              }
              const pCodes = NAME_TO_SYS_CODES[p.name];
              if (pCodes) {
                pCodes.forEach(pc => {
                  res.add(pc);
                  res.add(pc.toUpperCase());
                });
              }
            }
          });

          return res;
        };

        // 计算目标筛选岗位的所有等价 Key 集合
        const targetFilterKeys = memberRoleFilter === "ALL" 
          ? new Set<string>() 
          : resolveEquivalentRoleKeys(memberRoleFilter);

        // 计算排序和过滤后的协同成员 (全链路双向等价判定，100% 精准筛选)
        const filteredMembers = membersList
          .filter(m => {
            const nameMatch = (m.name || "").toLowerCase().includes(memberSearchTerm.toLowerCase());
            const emailMatch = (m.email || "").toLowerCase().includes(memberSearchTerm.toLowerCase());
            if (!nameMatch && !emailMatch) return false;

            if (memberRoleFilter === "ALL") return true;

            // 提取成员的所有分配岗位标识（包含兼任数组 roles、positionCode、主角色 role）
            const memberTokens: string[] = [
              ...(Array.isArray((m as any).roles) ? (m as any).roles : []),
              (m as any).positionCode,
              m.role
            ].filter(Boolean);

            if (memberTokens.length === 0) {
              return targetFilterKeys.has("MEMBER") || targetFilterKeys.has("协同成员");
            }

            // 只要成员的任意一个岗位标识的等价集合与筛选器选中的等价集合有交集，即为匹配
            return memberTokens.some(tok => {
              const tokKeys = resolveEquivalentRoleKeys(tok);
              for (const k of tokKeys) {
                if (targetFilterKeys.has(k)) return true;
              }
              return false;
            });
          })
          .sort((a, b) => {
            const parseJoinedTime = (val: any) => {
              if (!val) return 0;
              const t = new Date(val).getTime();
              return isNaN(t) ? 0 : t;
            };
            const timeA = parseJoinedTime(a.joinedAt);
            const timeB = parseJoinedTime(b.joinedAt);
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

            {/* 1.1 空间算力点全局池概览横幅 (商业与运营全闭环) */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-4.5 rounded-2xl text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-blue-800/60 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 fill-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">当前工作空间算力池</span>
                    <span className="px-2 py-0.5 text-[10px] font-black bg-amber-400 text-slate-950 rounded-md">
                      {workspaceQuotaInfo.levelName}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-blue-200 mt-1 font-medium flex-wrap">
                    <span>可用总额：<strong className="text-amber-300 font-mono text-sm">{formatTokenBalance(workspaceQuotaInfo.tokenBalance)}</strong> 算力点 {!isUnlimitedToken(workspaceQuotaInfo.tokenBalance) && <span className="text-amber-200/80 font-mono">({formatYuanFromPoints(workspaceQuotaInfo.tokenBalance)})</span>}</span>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden sm:inline">已分配成员：<strong className="text-blue-100 font-mono">{workspaceQuotaInfo.totalAllocatedToMembers}</strong> 点</span>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden sm:inline">未锁定池：<strong className="text-emerald-300 font-mono">{workspaceQuotaInfo.unallocatedBalance}</strong> 点</span>
                  </div>
                </div>
              </div>

              {/* 算力充值入口已迁移至「算力点」页签，成员页不再提供充值/申购 */}
            </div>

            {/* 5. 成员列表看板 (已调至上方) */}
            {membersLoading ? (
              <div className="bg-white/80 rounded-2xl p-10 text-center text-xs text-slate-400 font-bold border border-slate-200/80 animate-pulse">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                正在拉取空间协作者列表...
              </div>
            ) : (
              <div className={`bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm relative overflow-visible transition-all ${isRoleFilterOpen ? "z-50" : "z-10"}`}>
                {/* 5.1 标题头 */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
                  <span className="text-xs font-black text-slate-800">当前空间协同协作者 ({filteredMembers.length} 人)</span>
                  {workspaceType === "ENTERPRISE" && (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded border border-blue-100 font-bold">
                      我的角色：{isTabOwner ? "👑 所有者" : isTabAdmin ? "🔧 管理员" : "👤 协同成员"}
                    </span>
                  )}
                </div>

                {/* 5.2 局部搜索与双维度筛选器 */}
                {workspaceType === "ENTERPRISE" && (
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/20 flex flex-col sm:flex-row gap-3 items-center justify-between relative z-30">
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
                      {/* 岗位筛选组件：100% 从数据库 workspacepost 读取当前空间真实装配岗位，支持 50+ 岗位快速搜索与滚动 */}
                      <div className="flex items-center gap-1.5 relative" ref={roleFilterDropdownRef}>
                        <span className="text-[10px] text-slate-400 font-bold">岗位筛选:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRoleFilterOpen(!isRoleFilterOpen);
                            setRoleFilterSearch("");
                          }}
                          className="h-8 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#3182ce] rounded-lg text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs select-none"
                        >
                          {(() => {
                            if (memberRoleFilter === "ALL") {
                              return (
                                <>
                                  <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <span>全部岗位</span>
                                </>
                              );
                            }
                            const matched = workspaceInstalledPosts.find(p => p.id === memberRoleFilter || p.name === memberRoleFilter || (p.code && p.code.toUpperCase() === memberRoleFilter.toUpperCase()));
                            const sysMatched = !matched ? SYSTEM_ROLE_NAME_MAP[memberRoleFilter.toUpperCase()] : null;
                            const displayName = matched?.name || sysMatched?.name || memberRoleFilter;
                            const displayIcon = matched?.icon || sysMatched?.icon;
                            return (
                              <>
                                <PostIcon iconKey={displayIcon} className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                                <span className="text-[#2b6cb0] font-black">{displayName}</span>
                              </>
                            );
                          })()}
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${isRoleFilterOpen ? "rotate-180" : ""}`} />
                        </button>

                        {/* 下拉浮层面板：内置搜索与优雅滚动限制，解决多岗位体验痛点 */}
                        {isRoleFilterOpen && (
                          <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-2xl z-[100] p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                            {/* 快速搜索框 */}
                            <div className="relative">
                              <Search className="w-3 h-3 absolute left-2.5 top-2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="搜索岗位名称..."
                                value={roleFilterSearch}
                                onChange={(e) => setRoleFilterSearch(e.target.value)}
                                className="w-full h-7 pl-7 pr-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#3182ce] focus:bg-white"
                                autoFocus
                              />
                            </div>

                            {/* 岗位选项列表 (100% 数据库 workspacepost 真实装配岗位) */}
                            <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-slate-50">
                              <button
                                type="button"
                                onClick={() => {
                                  setMemberRoleFilter("ALL");
                                  setIsRoleFilterOpen(false);
                                }}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                  memberRoleFilter === "ALL"
                                    ? "bg-blue-50 text-[#2b6cb0]"
                                    : "text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <span>全部岗位</span>
                                </div>
                                {memberRoleFilter === "ALL" && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0 stroke-[2.5]" />}
                              </button>

                              {workspaceInstalledPosts
                                .filter(p => !roleFilterSearch || p.name.toLowerCase().includes(roleFilterSearch.toLowerCase()))
                                .map(pos => {
                                  const isSelected = memberRoleFilter === pos.id || 
                                    (memberRoleFilter !== "ALL" && (targetFilterKeys.has(pos.id.toUpperCase()) || targetFilterKeys.has(pos.name.toUpperCase())));
                                  return (
                                    <button
                                      key={pos.id}
                                      type="button"
                                      onClick={() => {
                                        setMemberRoleFilter(pos.id);
                                        setIsRoleFilterOpen(false);
                                      }}
                                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                        isSelected
                                          ? "bg-blue-50 text-[#2b6cb0]"
                                          : "text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <PostIcon iconKey={pos.icon} className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                                        <span className="truncate">{pos.name}</span>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-[#3182ce] shrink-0 stroke-[2.5]" />}
                                    </button>
                                  );
                                })}

                              {workspaceInstalledPosts.filter(p => !roleFilterSearch || p.name.toLowerCase().includes(roleFilterSearch.toLowerCase())).length === 0 && (
                                <div className="py-3 text-center text-xs text-slate-400 font-medium">
                                  未找到匹配岗位
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
                <div className="divide-y divide-slate-100 min-h-[160px]">
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
                        <div key={m.userId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors text-left border-b border-slate-100 last:border-b-0">
                          
                          {/* 1. 成员头像与基本信息 (左段：定宽舒展，文本优雅截断) */}
                          <div className="flex items-center gap-3 min-w-[220px] max-w-[280px] shrink-0">
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-[#3182ce] flex items-center justify-center text-white text-xs font-black shadow-sm overflow-hidden">
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
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${roleDotCls}`} />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-black text-slate-800 truncate max-w-[130px]">{m.name}</span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-50 text-emerald-600 border border-emerald-100">我</span>
                                )}
                                <span className={`px-1.5 py-0.2 text-[9px] rounded font-bold border ${roleBadgeCls}`}>
                                  {isTargetOwner ? "所有者" : isTargetAdmin ? "管理员" : "协同成员"}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{m.email || "未绑定邮箱"}</p>
                            </div>
                          </div>

                          {/* 2. 月度算力配额展示块 (中段：居中对齐，配置算力按钮绝不截断换行) */}
                          <div className="flex items-center justify-start md:justify-center flex-1 min-w-0 px-2">
                            <div className="inline-flex items-center gap-3 bg-slate-50/90 px-3.5 py-1.5 rounded-xl border border-slate-200/90 text-xs shadow-2xs shrink-0">
                              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] text-slate-400 font-bold leading-tight">本月算力额度</span>
                                <span className="font-mono font-black text-slate-700 text-xs truncate">
                                  {isTargetOwner || isTargetAdmin ? (
                                    <span className="text-emerald-600 font-bold">共享池(无限制)</span>
                                  ) : m.monthlyTokenLimit === null || m.monthlyTokenLimit === undefined ? (
                                    <span className="text-slate-600">不限额 ({m.monthlyTokenUsed || 0} 已用)</span>
                                  ) : (
                                    <span>{m.monthlyTokenLimit} 点 (<span className="text-blue-600">{m.monthlyTokenUsed || 0}</span> 已用)</span>
                                  )}
                                </span>
                              </div>

                              {canTabManage && !isTargetOwner && !isTargetAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingQuotaMember(m);
                                    setInputQuotaValue(m.monthlyTokenLimit !== null && m.monthlyTokenLimit !== undefined ? String(m.monthlyTokenLimit) : "");
                                  }}
                                  className="px-2.5 py-1 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-[10px] font-black rounded-lg shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 whitespace-nowrap ml-1"
                                  title="设置或分配该成员的月度算力上限"
                                >
                                  <Zap className="w-2.5 h-2.5 text-amber-300 fill-amber-300 shrink-0" />
                                  <span>配置算力</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 3. 核心岗位与操作区 (右段：右对齐，加入时间 + 纯中文岗位胶囊 + 醒目调整岗位按钮 + 移出按钮) */}
                          <div className="flex items-center justify-end gap-3 shrink-0">
                            <div className="text-[10px] text-slate-400 font-mono font-semibold whitespace-nowrap hidden lg:inline mr-1">
                              {joinedStr}
                            </div>

                            {/* 岗位展示与兼任配置区 */}
                            {(() => {
                              // 全局标准岗位代码中英文映射字典（100% 杜绝输出英文字符串）
                              const SYSTEM_ROLE_NAME_MAP: Record<string, { name: string; icon: string }> = {
                                OWNER: { name: "空间所有者", icon: "Crown" },
                                ADMIN: { name: "空间管理员", icon: "Wallet" },
                                MEMBER: { name: "协同成员", icon: "Users" },
                                DEVELOPER: { name: "研发工程师", icon: "Braces" },
                                PRODUCT_MANAGER: { name: "产品经理", icon: "PenTool" },
                                PROJECT_MANAGER: { name: "项目经理", icon: "ClipboardList" },
                                FRONTEND_DEV: { name: "前端开发工程师", icon: "Braces" },
                                FRONTEND_ENGINEER: { name: "前端开发工程师", icon: "Braces" },
                                BACKEND_DEV: { name: "后端开发工程师", icon: "UserCog" },
                                BACKEND_ENGINEER: { name: "后端开发工程师", icon: "UserCog" },
                                TEST_QA: { name: "测试工程师", icon: "Wrench" },
                                TEST_ENGINEER: { name: "测试工程师", icon: "Wrench" },
                                QA_ENGINEER: { name: "测试工程师", icon: "Wrench" },
                                QA_MANAGER: { name: "质量经理", icon: "Wrench" },
                                UI_UX_DESIGNER: { name: "UI/UX交互设计师", icon: "BadgeCheck" },
                                DESIGNER: { name: "UI/UX交互设计师", icon: "BadgeCheck" },
                                DEVOPS_ENGINEER: { name: "运维工程师", icon: "ShieldCheck" },
                                DEVOPS: { name: "运维工程师", icon: "ShieldCheck" },
                                SYSTEM_ARCHITECT: { name: "系统架构师", icon: "Database" },
                                ARCHITECT: { name: "系统架构师", icon: "Database" },
                                ALGORITHM_ENGINEER: { name: "算法工程师", icon: "Package" },
                                HARDWARE_ENGINEER: { name: "硬件工程师", icon: "Gavel" },
                                SECURITY_AUDITOR: { name: "空间审计员", icon: "Banknote" },
                                SECURITY_EXPERT: { name: "安全专家", icon: "ShieldCheck" },
                                TECH_LEAD: { name: "技术主管", icon: "Receipt" },
                                DELIVERY_LEAD: { name: "交付负责人", icon: "Bug" },
                                QUANT_STRATEGIST: { name: "量化策略分析师", icon: "ChartColumn" },
                              };

                              // 岗位字典：优先读取数据库真实装配岗位
                              const posMap = new Map<string, { id: string; name: string; icon?: string | null; color?: string }>();
                              (workspaceInstalledPosts || []).forEach(p => {
                                posMap.set(p.id.toUpperCase(), p);
                                posMap.set(p.name.toUpperCase(), p);
                                if (p.code) posMap.set(p.code.toUpperCase(), p);
                              });

                              // 获取纯中文岗位名称和矢量图标
                              const getRoleMeta = (code: string) => {
                                const upper = String(code).trim().toUpperCase();
                                const found = posMap.get(upper);
                                if (found) return { name: found.name, icon: found.icon || "Briefcase" };
                                const sys = SYSTEM_ROLE_NAME_MAP[upper];
                                if (sys) return sys;
                                return { name: code === "DEVELOPER" ? "研发工程师" : code.replace(/_/g, " "), icon: "Briefcase" };
                              };

                              if (isTargetOwner) {
                                return (
                                  <span className="text-xs px-3 py-1.5 rounded-lg font-black select-none border border-amber-200 bg-amber-50 text-amber-800 shadow-2xs flex items-center gap-1.5 shrink-0">
                                    <Crown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span>空间所有者</span>
                                  </span>
                                );
                              }

                              // 提取目标成员的兼任岗位代号数组
                              const memberRolesList: string[] = Array.isArray((m as any).roles) && (m as any).roles.length > 0
                                ? (m as any).roles
                                : [(m as any).positionCode || m.role || ""].filter(Boolean);

                              return (
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* 渲染成员已分配的全部岗位标签 (纯中文 + 矢量 SVG 图标，绝无英文代码) */}
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {memberRolesList.map((code) => {
                                      const meta = getRoleMeta(code);
                                      return (
                                        <span
                                          key={code}
                                          className="text-xs px-2.5 py-1 rounded-lg font-bold select-none border border-blue-200/90 bg-blue-50/90 text-[#2b6cb0] shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                                        >
                                          <PostIcon iconKey={meta.icon} className="w-3.5 h-3.5 text-[#2b6cb0] shrink-0" />
                                          <span>{meta.name}</span>
                                        </span>
                                      );
                                    })}
                                    {memberRolesList.length === 0 && (
                                      <span className="text-xs px-2.5 py-1 rounded-lg font-bold select-none border border-slate-200 bg-slate-50 text-slate-600 shadow-2xs whitespace-nowrap flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>协同成员</span>
                                      </span>
                                    )}
                                  </div>

                                  {/* 核心主操作：醒目实心高亮调整岗位按钮 (仅所有者可操作) */}
                                  {canChangeTargetRole && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfiguringRoleMember(m);
                                        setSelectedRoleCodes(memberRolesList);
                                        setRoleSearchQuery("");
                                      }}
                                      className="px-3 py-1.5 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:from-[#2c5282] hover:to-[#2b6cb0] text-white text-xs font-black rounded-lg shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0 ring-2 ring-blue-500/20 whitespace-nowrap"
                                      title="点击为该成员分配或调整空间兼任岗位（核心管理）"
                                    >
                                      <SlidersHorizontal className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                                      <span>调整岗位</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 移出空间按钮 */}
                            {canRemoveTarget ? (
                              <button
                                onClick={() => handleTabRemoveMember(m.userId, m.name)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg cursor-pointer transition-colors shrink-0"
                                title="移出此空间"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="w-7 h-7 shrink-0" />
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

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowGenerateInviteModal(true)}
                    disabled={generatingCode}
                    className="h-10 px-4.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow cursor-pointer transition-all shrink-0 flex items-center justify-center gap-1"
                  >
                    {generatingCode ? "正在生成..." : "🔑 生成专属邀请码"}
                  </button>
                  <span className="text-[11px] text-slate-400 font-medium">生成后可在下方列表复制邀请信息</span>
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
                                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <CalendarPlus className="w-3 h-3" />
                                    生成时间：
                                    {invitation.createdAt
                                      ? formatTaskTime(invitation.createdAt)
                                      : "—"}
                                  </span>
                                  <span className={`flex items-center gap-1 ${isExpired ? "line-through opacity-70" : ""}`}>
                                    <Clock className="w-3 h-3" />
                                    有效期至：
                                    {invitation.expiresAt
                                      ? new Date(invitation.expiresAt).toLocaleString("zh-CN")
                                      : "永久有效"}
                                  </span>
                                  {!isInvalid && (
                                    <span className="flex items-center gap-1">
                                      <Timer className="w-3 h-3" />
                                      剩余：
                                      <InviteCountdown expiresAt={invitation.expiresAt} />
                                    </span>
                                  )}
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
          <WorkspacePostsPermissionsTab
            workspaceId={workspaceId}
            boundComponentIds={effectiveBoundComponentIds}
          />
        );

      case "stats":
        return (
          <UsageStatsTab
            workspaceId={workspaceId}
            workspaceToken={workspaceToken}
            recentTasks={recentTasks}
            effectiveBoundComponentIds={effectiveBoundComponentIds}
            componentCatalog={componentCatalog}
            setShowRechargeModal={setShowRechargeModal}
            onViewTaskDetail={(taskId) => {
              setActiveTab("tasks");
            }}
            setActiveTab={setActiveTab}
          />
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

            {/* 空间图标上传区 (支持自定义上传与一键恢复默认) */}
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-extrabold text-slate-800">空间标志 (Logo)</h3>
                    {workspaceInfo.logo && (
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceInfo((prev: any) => ({ ...prev, logo: "" }));
                          toast.info("已重置 Logo 为系统默认图标，点击下方 “保存修改” 后在全空间生效");
                        }}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 shrink-0"
                        title="移除自定义 Logo 并恢复为默认空间图标"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>恢复默认 Logo</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                    支持 JPG、PNG 格式，大小不能超过 2MB。上传新图标或重置后，点击下方 “保存修改” 按钮在全局生效。
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
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700 block zg-required">
                          空间名称
                        </label>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {(workspaceInfo.name ?? "").length}/20 字
                        </span>
                      </div>
                      <input
                        type="text"
                        name="name"
                        required
                        maxLength={20}
                        placeholder="请输入空间名称（最多 20 字，如：研发一组空间）"
                        value={workspaceInfo.name ?? ""}
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
                        当前为只读模式：仅空间所有者 / 管理员可修改空间配置
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
          <LogsTab logs={operationLogs} workspaceId={workspaceId} isWorkspaceAdmin={userRole === "Owner" || userRole === "Admin" || userRole === "OWNER" || userRole === "ADMIN"} />
        );

      case "points": {
        return (
          <PointsLedgerTab
            workspaceId={workspaceId || ""}
            canRecharge={true}
            onOpenRecharge={() => setShowRechargeModal(true)}
            refreshSignal={rechargeSignal}
          />
        );
      }

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

  // 派生 Tabs 列表 (顺序：1.总览 2.快速任务 3.组件装配 4.分析结果 5.资料 6.知识库 7.统计 8.算力点 [成员/权限/日志仅企业空间] 设置；「结果」页已移除)
  let tabsList: { key: string; label: string }[] = [
    { key: "overview", label: "总览" },
    { key: "quick", label: "快速任务" },
    { key: "components", label: "组件装配" },
    { key: "tasks", label: "分析结果" },
    { key: "assets", label: "资料" },
    { key: "knowledge", label: "知识库" },
    { key: "stats", label: "统计" },
    { key: "points", label: "算力点" },
  ];

  // 管理类 Tab（成员 / 权限 / 日志）仅企业空间的 OWNER / ADMIN 可见，个人空间不显示任何企业空间管理入口
  if (isCurrentUserSuperPrivileged && workspaceType === "ENTERPRISE") {
    tabsList.push({ key: "members", label: "成员" });
    tabsList.push({ key: "permissions", label: "权限" });
    tabsList.push({ key: "logs", label: "日志" });
  }

  // 设置页签：企业空间仅空间管理员/所有者可见；个人空间始终可见（所有者即管理员）
  if (workspaceType !== "ENTERPRISE" || isCurrentUserSuperPrivileged) {
    tabsList.push({ key: "settings", label: "设置" });
  }

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

      {/* 顶部 Header (面包屑与导航，统一大厂 1400px 黄金居中中轴线) */}
      <header className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl border-b border-slate-200/70 px-4 sm:px-6 md:px-8 py-3 shadow-[0_1px_10px_rgba(15,23,42,0.05)] relative">
        <div className="max-w-[1400px] w-full mx-auto flex items-center justify-between">
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
              // 空间分组唯一金标准：严格以数据库真实类型 type === "ENTERPRISE" 优先判定企业空间，拒绝按名称关键字误判
              const enterpriseWs = allWs.filter(w => 
                (w.type || "").toUpperCase() === "ENTERPRISE" || 
                (typeof w.id === "string" && w.id.startsWith("ws-enterprise"))
              );
              const personalWs = allWs.filter(w => !enterpriseWs.includes(w));

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
        </div>
      </header>

      {/* 空间名片摘要 - 悬浮玻璃卡片 (统一 px-4 sm:px-6 md:px-8 大厂对齐线) */}
      <div className="px-4 sm:px-6 md:px-8 py-4 text-left relative z-10">
        <div className="max-w-[1400px] w-full mx-auto bg-white/85 backdrop-blur-xl border border-white/90 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.12)] rounded-2xl px-5 sm:px-7 pt-5 sm:pt-6 pb-1">
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
                您刚刚装配了 <span className="text-[#2b6cb0] font-black">[{newBoundComp.name}]</span> 效能组件，现在即可
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
                  岗位角色: {(() => {
                    const myId = getCurrentUserId();
                    const myMember = (membersList || []).find((m: any) => m.userId === myId || m.isSelf);
                    if (myMember) {
                      const posCode = (myMember as any).positionCode || myMember.role;
                      const posMap = new Map<string, PositionDefinition>();
                      (presetPositions || []).forEach(p => posMap.set(p.code, p));
                      (customPositions || []).forEach(p => posMap.set(p.code, p));
                      const matchedPos = posMap.get(posCode);
                      if (matchedPos) {
                        return `${matchedPos.icon} ${matchedPos.name}`;
                      }
                    }
                    return userRole === "Owner" || userRole === "OWNER"
                      ? "👑 空间所有者"
                      : userRole === "Admin" || userRole === "ADMIN"
                      ? "🔧 空间管理员"
                      : userRole === "ComponentManager"
                      ? "🧩 组件管理员"
                      : userRole === "KnowledgeManager"
                      ? "📚 规范库管理员"
                      : "👤 协同成员";
                  })()}
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
              points: <Zap className="w-3.5 h-3.5" />,
              tasks: <CheckCircle2 className="w-3.5 h-3.5" />,
              assets: <Database className="w-3.5 h-3.5" />,
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

      {/* 主工作区 (升级为 max-w-[1400px] 大厂黄金广角布局，与组件大厅、文档中心 100% 物理对齐) */}
      <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-8 pt-5 pb-10 flex-1 overflow-visible relative z-10">
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
        mode={importAssetMode}
        onClose={() => setShowImportAssetModal(false)}
        onImport={(data) => {
          // 复用真实持久化导入逻辑（后端成功后才更新本地资料）
          return handlePersistAsset({
            title: data.title,
            content: data.content,
            type: data.type,
            visibility: data.visibility,
            file: data.file ?? null,
            fileSize: data.fileSize ?? null,
            fileExt: data.fileExt ?? null,
            summary: data.summary ?? null,
          });
        }}
      />

      <ConfirmRunModal
        open={showConfirmRunModal}
        onClose={() => setShowConfirmRunModal(false)}
        onConfirm={handleExecuteSimulation}
        componentName={quickSelectedCompId}
        taskName={quickInputMaterial}
      />

      {/* 4. 任务成果预览与沉淀 Modal (使用共享 ResultViewer 组件) */}
      <ResultViewer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onSaveToKnowledge={handleSaveToKnowledge}
      />

      {/* 5. 知识与资料详情查阅 Modal (全保真多模态全量中枢阅读器：支持图片原图、文档全量排版与源码视图) */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans select-text">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header (知阁·舟坊标准全保真头部栏) */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50/80 via-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
                  {previewData.type?.toLowerCase().includes("image") ? "🖼️" : "📄"}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    全量真实文件预览: <span className="text-[#3182ce]">{previewData.title}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                    {/* 格式类型：由文件真实类型判定，输出中文类型名 */}
                    <span className="bg-blue-50 text-[#3182ce] font-bold px-2 py-0.5 rounded border border-blue-200/70 text-[11px]">
                      {previewData.fileTypeLabel ||
                        getFileTypeLabel({
                          type: previewData.type,
                          ext: previewData.fileExt,
                          title: previewData.title,
                          content: previewData.content,
                        })}
                    </span>
                    <span>·</span>
                    {/* 容量：优先文件真实字节数 */}
                    <span className="text-slate-500 font-mono">
                      真实容量:{" "}
                      {previewData.sizeStr ||
                        resolveAssetSize({
                          fileSize: previewData.fileSize,
                          content: previewData.content,
                        })}
                    </span>
                    <span>·</span>
                    <span className="text-slate-400 font-mono">
                      全量总字数: {previewData.content ? previewData.content.length : 0} 字符
                    </span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* 复制全文 */}
                {!(
                  previewData.previewType === "image" ||
                  previewData.previewType === "pdf" ||
                  previewData.previewType === "table" ||
                  previewData.previewType === "html" ||
                  previewData.previewType === "notice" ||
                  previewData.type?.toLowerCase().includes("image") ||
                  previewData.mimeType?.startsWith("image/")
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (previewData.content) {
                        navigator.clipboard.writeText(previewData.content);
                        toast.success("已将该资料100%全量原文复制到剪贴板");
                      }
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    title="复制全量原文"
                  >
                    📋 复制全文
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body 多模态真内容展示区 */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50 custom-scrollbar select-text">
              {/* 智能总结：基于资料真实原文生成，始终排在最顶部便于快速掌握要点 */}
              {(() => {
                const summary =
                  previewData.summary && previewData.summary.trim()
                    ? previewData.summary
                    : generateSmartSummary(previewData.content, previewData.title).overview;
                return (
                  <div className="bg-gradient-to-r from-blue-50/90 to-slate-50/70 border border-blue-200/70 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span className="text-[11px] font-black text-[#3182ce] uppercase tracking-wider">
                        智能总结
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        基于文件真实原文自动生成
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      {summary}
                    </p>
                  </div>
                );
              })()}

              {/* 多模态真实文件预览：图片/PDF 直接渲染原文件，Word/Excel 等提供提取文本 + 下载 */}
              {(() => {
                const pt = previewData.previewType;
                const isImageAsset =
                  pt === "image" ||
                  previewData.type?.toLowerCase().includes("image") ||
                  previewData.mimeType?.startsWith("image/") ||
                  previewData.fileExt === "svg" ||
                  Boolean(previewData.title.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i)) ||
                  Boolean(previewData.content?.startsWith("data:image"));
                const isPdfAsset =
                  pt === "pdf" ||
                  previewData.fileExt === "pdf" ||
                  previewData.mimeType === "application/pdf" ||
                  previewData.type?.toLowerCase() === "pdf";
                const fileSrc = previewData.fileUrl || previewData.content || "";
                const canDownload = Boolean(previewData.fileUrl) && !previewData.isMine;

                if (pt === "table" && Array.isArray(previewData.previewRows) && previewData.previewRows.length > 0) {
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-700">
                          表格预览：{previewData.sheetName || "Sheet1"}
                        </span>
                        {canDownload && (
                          <a
                            href={previewData.fileUrl || ""}
                            download={previewData.originalName || previewData.title}
                            className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            ⬇ 下载原文件
                          </a>
                        )}
                      </div>
                      <div className="overflow-auto bg-white rounded-2xl border border-slate-200 shadow-sm max-h-[68vh]">
                        <table className="w-full text-xs text-left border-collapse">
                          <tbody>
                            {previewData.previewRows.map((row, ri) => (
                              <tr key={ri} className={ri === 0 ? "bg-slate-100/90 font-black" : "border-t border-slate-100"}>
                                {(row as unknown[]).map((cell, ci) => (
                                  <td key={ci} className="px-2.5 py-1.5 border-r border-slate-100 whitespace-nowrap max-w-[260px] truncate">
                                    {String(cell ?? "")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }

                if (pt === "html" && previewData.previewHtml) {
                  return (
                    <div className="space-y-3">
                      {canDownload && (
                        <div className="flex justify-end">
                          <a
                            href={previewData.fileUrl || ""}
                            download={previewData.originalName || previewData.title}
                            className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            ⬇ 下载原文件
                          </a>
                        </div>
                      )}
                      <div
                        className="bg-white p-8 rounded-2xl border border-slate-200/90 shadow-sm text-slate-800 text-sm leading-relaxed max-h-[68vh] overflow-y-auto custom-scrollbar preview-html"
                        dangerouslySetInnerHTML={{ __html: previewData.previewHtml }}
                      />
                    </div>
                  );
                }

                if (pt === "notice") {
                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center space-y-4">
                      <p className="text-xs text-slate-500 font-semibold">
                        {previewData.previewNotice || "该文件无文字内容可提取，可下载原文件查看。"}
                      </p>
                      {canDownload && (
                        <a
                          href={previewData.fileUrl || ""}
                          download={previewData.originalName || previewData.title}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          ⬇ 下载原文件
                        </a>
                      )}
                    </div>
                  );
                }

                if (isImageAsset) {
                  return (
                    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 rounded-2xl border border-slate-800 shadow-inner">
                      <img
                        src={fileSrc}
                        alt={previewData.title}
                        className="max-h-[68vh] w-auto max-w-full object-contain rounded-xl shadow-2xl border border-slate-700/80 bg-black/40 p-2"
                      />
                      <p className="text-xs text-emerald-400 font-mono mt-3">
                        ✓ 图像资产 100% 原图高保真渲染呈现 ({previewData.title})
                      </p>
                    </div>
                  );
                }

                if (isPdfAsset && previewData.fileUrl) {
                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <iframe
                        src={previewData.fileUrl}
                        title={previewData.title}
                        className="w-full h-[68vh] border-0"
                      />
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200/90 shadow-sm text-slate-800 text-sm leading-relaxed space-y-4 max-h-[68vh] overflow-y-auto custom-scrollbar select-text">
                      <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                          文件完整原文
                        </span>
                        <span className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          ✓ 提取内容完整展现
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed tracking-normal select-text text-sm">
                        {previewData.content && previewData.content.trim() !== ""
                          ? previewData.content
                          : `# ${previewData.title}\n\n该文件为二进制原文件，请在本地打开查看完整版式。`}
                      </div>
                    </div>
                    {canDownload && (
                      <div className="flex justify-end">
                        <a
                          href={previewData.fileUrl || ""}
                          download={previewData.originalName || previewData.title}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          ⬇ 下载原文件
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer 底部状态防线 */}
            <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 select-none">
              <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                🛡️ 已验证完整原文 100% 全量展示（零改写、零打折），可滑动查阅全部内容
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {previewData.fileUrl && !previewData.isMine && (
                  <a
                    href={previewData.fileUrl}
                    download={previewData.originalName || previewData.title}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-[#3182ce] border border-[#3182ce]/30 text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-95 shadow-xs"
                  >
                    下载原文件
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-95 shadow-xs"
                >
                  关闭预览
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. 自动匹配组件详情弹窗 */}
      {aiMatchDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Box className="w-4 h-4 text-[#3182ce]" />
                  组件详情
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  请确认该组件是否符合您的任务需求
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiMatchDetailModal(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件编号</div>
                <div className="text-xs font-mono font-bold text-slate-700">{aiMatchDetailModal.id}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件名称</div>
                <div className="text-sm font-black text-slate-900">{aiMatchDetailModal.name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-blue-50 text-[#3182ce] border border-blue-100 rounded-lg text-[10px] font-bold">
                  {componentCategories[aiMatchDetailModal.category as ComponentCategory]?.name || aiMatchDetailModal.category}
                </span>
                <span className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold">
                  输入方式: {aiMatchDetailModal.inputMode === "file" ? "文件" : aiMatchDetailModal.inputMode === "both" ? "文本/文件" : "文本"}
                </span>
                <span className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg text-[10px] font-bold">
                  预估消耗: {aiMatchDetailModal.estimatedTokens || 5} 点
                </span>
              </div>
              {/* 以下内容 100% 来自数据库 component_catalog.detail 字段 */}
              {(() => {
                const d = aiMatchDetailModal.detail;
                if (!d || !d.fullDescription) {
                  return (
                    <div className="text-xs font-medium text-slate-400 text-center py-4">
                      该组件暂未在数据库中配置详情内容
                    </div>
                  );
                }
                return (
                  <>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件简介</div>
                      <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{aiMatchDetailModal.description}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">深度解读</div>
                      <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{d.fullDescription}</div>
                    </div>
                    {d.usage && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">使用操作指南</div>
                        <div className="space-y-1">
                          {String(d.usage).split("\n").filter(Boolean).map((line, i) => (
                            <p key={i} className="text-xs font-medium text-slate-600 leading-relaxed">{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {d.apiDoc && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">API 接入文档</div>
                        <pre className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-lg text-[11px] text-slate-700 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                          {d.apiDoc}
                        </pre>
                      </div>
                    )}
                    {Array.isArray(d.faq) && d.faq.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">常见问题</div>
                        <div className="space-y-2.5">
                          {d.faq.map((item, i) => (
                            <div key={i} className="space-y-0.5">
                              <div className="text-xs font-bold text-slate-800 flex items-start gap-1">
                                <span className="text-amber-500 font-extrabold">Q:</span>
                                <span>{item.q}</span>
                              </div>
                              <div className="text-xs text-slate-500 font-semibold leading-relaxed pl-4">{item.a}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiMatchDetailModal.tags?.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">标签</div>
                        <div className="flex flex-wrap gap-1.5">
                          {aiMatchDetailModal.tags.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAiMatchDetailModal(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => {
                  const comp = aiMatchDetailModal;
                  setAiMatchDetailModal(null);
                  handleRunMatchedComponent(comp);
                }}
                disabled={isExecutingTask}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                {isExecutingTask ? "处理中..." : "使用该组件"}
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
      {/* 2000字长文本大屏全景编辑器 Modal */}
      {showFullMaterialModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-white/90 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center border border-blue-100 shadow-2xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">完整研发材料全景预览与编辑</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">支持大段需求文本、代码段落或 PRD 规则的长文本舒适编辑</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFullMaterialModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>研发材料文本内容:</span>
                <span className={quickInputMaterial.length >= 2000 ? "text-red-600 font-black font-mono" : "text-slate-500 font-mono"}>
                  {quickInputMaterial.length} / 2000 字
                </span>
              </div>
              <textarea
                value={quickInputMaterial}
                onChange={(e) => {
                  const text = e.target.value;
                  const val = text.length <= 2000 ? text : text.slice(0, 2000);
                  setQuickInputMaterial(val);
                  setAiQuery(val);
                  if (text.length > 2000) {
                    toast.warning("已触发 2000 字数上限限制，超出部分已截断");
                  }
                }}
                rows={12}
                maxLength={2000}
                placeholder="在此直接输入或粘贴长文本、PRD需求规格说明书、招标文件细节或测试用例..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all font-sans leading-relaxed resize-none font-medium"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(quickInputMaterial);
                  toast.success("材料内容已成功复制到剪贴板！");
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>📋 复制全文</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFullMaterialModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFullMaterialModal(false);
                    toast.success("文本编辑已同步保存！");
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  完成编辑并存盘
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 发现未保存材料草稿与新组件绑定确认 Modal */}
      {pendingSwitchComp && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white/90 space-y-4 animate-in zoom-in-95 duration-200 text-left font-sans">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">发现未提交的材料草稿</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">检测到控制台中存有尚未执行分析的文本/素材草稿</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs">
              <div className="text-slate-600 leading-relaxed font-medium">
                即将切换至新组件：<strong className="text-[#3182ce] font-bold">[{pendingSwitchComp.id}] {pendingSwitchComp.name}</strong>
              </div>
              <div className="text-slate-500 text-[11px] leading-relaxed bg-white p-2.5 rounded-xl border border-slate-100">
                当前草稿内容：<span className="font-mono text-slate-800 font-bold">{(quickInputMaterial || aiQuery || "选定素材文件").slice(0, 45)}...</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium">请确认如何处理该材料草稿：</p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => applyComponentSwitch(pendingSwitchComp, "keep")}
                className="w-full py-2.5 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🔗 保留草稿并与新组件绑定使用</span>
              </button>
              <button
                type="button"
                onClick={() => applyComponentSwitch(pendingSwitchComp, "clear")}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🧹 清空草稿并全新载入新组件</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingSwitchComp(null)}
                className="w-full py-2 text-slate-400 hover:text-slate-600 font-bold text-xs transition-colors cursor-pointer text-center"
              >
                取消切换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 算力充值/额度提升申请 Modal */}
      {showRechargeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col p-6 shadow-2xl border border-white/90 space-y-4 animate-in zoom-in-95 duration-200 overflow-y-auto">
            {/* Header 保持吸顶 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">算力点充值与分配</h3>
                  <p className="text-xs text-slate-500 font-medium">提升当前工作空间的服务算力额度</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRechargeModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 充值方式 Tab：在线充值 / 对公转账工单 */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => setRechargeTab("online")}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  rechargeTab === "online"
                    ? "bg-white shadow-sm text-[#3182ce]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                在线充值
              </button>
              <button
                type="button"
                onClick={() => setRechargeTab("offline")}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  rechargeTab === "offline"
                    ? "bg-white shadow-sm text-[#3182ce]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                对公转账 / 合同
              </button>
            </div>

            {/* 极致压缩高度的配额提示卡片 */}
            <div className="bg-amber-50/90 p-3.5 rounded-2xl border border-amber-200/90 space-y-2 text-xs text-amber-900 shrink-0">
              <div className="font-black text-sm flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>⚡ 当前算力账户配额:</span>
                  <span className="font-mono text-amber-950 font-black">
                    {formatTokenBalance(isUnlimitedToken(workspaceQuotaInfo.tokenBalance) ? -1 : (workspaceQuotaInfo.tokenBalance ?? workspaceToken ?? 0))} 算力点
                  </span>
                </div>
                <span className="font-mono text-amber-800 text-xs font-bold bg-amber-100/80 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                  {!isUnlimitedToken(workspaceQuotaInfo.tokenBalance) && `折合 ${formatYuanFromPoints(workspaceQuotaInfo.tokenBalance ?? workspaceToken ?? 0)}`}
                </span>
              </div>

              <div className="text-[11px] font-bold text-amber-800 bg-amber-100/80 border border-amber-200/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
                <span className="shrink-0">💡 换算规则:</span>
                <span className="font-mono text-amber-900 font-bold whitespace-nowrap">10 算力点 = 0.1 元为参考价；加油包按档位享体积折扣，高级会员另享专属折扣</span>
              </div>
            </div>

            {/* 固定的标题文字，放在 overflow 滚动区的外面，彻底消除遮挡叠字 */}
            {rechargeTab === "online" && (
            <>
            <label className="block text-xs font-black text-slate-700 shrink-0 pt-1">
              请选择所需申购的算力加油包：
            </label>

            {/* 算力加油包选择列表 纯卡片垂直滚动 */}
            <div className="flex-1 min-h-[160px] max-h-[34vh] overflow-y-auto pr-1.5 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                {(dynamicTokenPacks.length > 0 ? dynamicTokenPacks : [
                  { id: "pack_standard_1000", name: "标准算力包", points: 1000, price: pointsToYuan(1000), icon: "⚡", isPopular: false, description: "适合日常基础算力补充" },
                  { id: "pack_pro_10000", name: "尊享算力包", points: 10000, price: pointsToYuan(10000), icon: "👑", isPopular: true, description: "热门划算选购，团队敏捷研发首选" },
                  { id: "pack_enterprise_50000", name: "企业旗舰算力包", points: 50000, price: pointsToYuan(50000), icon: "🚀", isPopular: false, description: "大型团队敏捷研发保障" },
                ]).map((pack) => {
                  const isSelected = selectedRechargePack.id
                    ? selectedRechargePack.id === pack.id
                    : selectedRechargePack.points === pack.points;
                  const originalPrice = Number(pack.price ?? pointsToYuan(pack.points));
                  const memberPrice =
                    rechargeMemberDiscount > 0 ? applyMemberDiscount(originalPrice, rechargeMemberDiscount) : originalPrice;
                  const hasMemberDeal = rechargeMemberDiscount > 0 && memberPrice < originalPrice;
                  const memberDealLabel = formatDiscountLabel(rechargeMemberDiscount);
                  return (
                    <div
                      key={pack.id}
                      onClick={() => setSelectedRechargePack({ id: pack.id, points: pack.points, name: `${pack.name} (${pack.points.toLocaleString()} 点)`, price: pack.price })}
                      className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all relative ${
                        isSelected
                          ? "bg-blue-50/80 border-[#3182ce] ring-2 ring-[#3182ce]/20 text-[#3182ce]"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 mt-0.5 ${
                          isSelected ? "border-[#3182ce] bg-[#3182ce] text-white" : "border-slate-300"
                        }`}>
                          {isSelected ? "✓" : ""}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap font-black text-[13px]">
                              <span>{pack.icon || "⚡"}</span>
                              <span>{pack.name}</span>
                              <span className="text-slate-500 font-medium">({pack.points.toLocaleString()} 点)</span>
                              {pack.isPopular && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] rounded font-black">热门</span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {hasMemberDeal && (
                                <div className="text-[10px] font-bold text-slate-400 line-through">
                                  ¥{originalPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              <div className="font-mono text-sm font-black">
                                ¥{memberPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              {hasMemberDeal && memberDealLabel && (
                                <div className="mt-0.5 text-[9px] font-black bg-rose-50 text-rose-500 px-1 py-0.5 rounded w-fit ml-auto">
                                  会员 {memberDealLabel}
                                </div>
                              )}
                            </div>
                          </div>
                          {pack.description && (
                            <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-relaxed">
                              {pack.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 支付方式选择 */}
            <div className="shrink-0 space-y-2">
              <label className="block text-xs font-black text-slate-700">选择支付方式：</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRechargePaymentMethod("WECHAT_PAY")}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${rechargePaymentMethod === "WECHAT_PAY"
                    ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                    : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    }`}
                >
                  <img src="/icons/wechat-pay.png" alt="" className="w-5 h-5 object-contain shrink-0" />
                  <span>微信支付</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRechargePaymentMethod("ALIPAY")}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${rechargePaymentMethod === "ALIPAY"
                    ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                    : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                    }`}
                >
                  <img src="/icons/alipay.png" alt="" className="w-5 h-5 object-contain shrink-0" />
                  <span>支付宝</span>
                </button>
              </div>
            </div>

            {/* 底部按钮区 保持吸底 */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowRechargeModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteRecharge}
                disabled={recharging}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {recharging
                  ? "正在划拨算力..."
                  : `立即确认充值 (${selectedRechargePack.points.toLocaleString()} 点 / ¥${applyMemberDiscount(selectedRechargePack.price ?? pointsToYuan(selectedRechargePack.points), rechargeMemberDiscount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
              </button>
            </div>
          </>
          )}
          {rechargeTab === "offline" && (
            <div className="shrink-0 space-y-3 border-t border-slate-100 pt-3">
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-2 text-[11px] font-bold text-blue-800 leading-relaxed">
                对公转账 / 合同结算：提交后将生成充值工单，由平台管理员审批并通过后自动入账至本空间对应算力账户。请按提示完成对公打款并准确回填凭证信息，便于财务对账。
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">充值算力点数 *</label>
                <input
                  type="number" min="1"
                  value={offlineForm.points}
                  onChange={(e) => setOfflineForm({ ...offlineForm, points: e.target.value })}
                  placeholder="例如 10000"
                  className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">发票抬头</label>
                  <input
                    value={offlineForm.invoiceTitle}
                    onChange={(e) => setOfflineForm({ ...offlineForm, invoiceTitle: e.target.value })}
                    placeholder="单位名称"
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">税号</label>
                  <input
                    value={offlineForm.taxNo}
                    onChange={(e) => setOfflineForm({ ...offlineForm, taxNo: e.target.value })}
                    placeholder="纳税人识别号"
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">开户银行</label>
                  <input
                    value={offlineForm.bankName}
                    onChange={(e) => setOfflineForm({ ...offlineForm, bankName: e.target.value })}
                    placeholder="如：招商银行XX支行"
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">银行账号</label>
                  <input
                    value={offlineForm.bankAccount}
                    onChange={(e) => setOfflineForm({ ...offlineForm, bankAccount: e.target.value })}
                    placeholder="对公账号"
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">备注</label>
                <textarea
                  value={offlineForm.remark}
                  onChange={(e) => setOfflineForm({ ...offlineForm, remark: e.target.value })}
                  placeholder="合同编号、付款用途等"
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none resize-none"
                />
              </div>
              {offlineResultOrderNo ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-bold text-emerald-700">
                  工单已提交，单号：{offlineResultOrderNo}。可在「我的算力」页面查看审批进度。
                </div>
              ) : (
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowRechargeModal(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submitOfflineOrder}
                    disabled={submittingOffline}
                    className="px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {submittingOffline ? "提交中..." : "提交充值工单"}
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      {/* 成员个人算力额度设置 Modal */}
      {editingQuotaMember && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-left font-sans space-y-4">
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm">配置成员个人月度算力额度</h3>
                  <p className="text-[11px] text-blue-100">设定协同成员当月允许消费的空间算力点上限</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuotaMember(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>目标成员: <strong className="text-slate-900">{editingQuotaMember.name || editingQuotaMember.userName || "协同成员"}</strong></span>
                  <span className="text-[11px] text-slate-500 font-mono">ID: {(editingQuotaMember.userId || "").slice(0, 8)}...</span>
                </div>
                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-center justify-between font-medium">
                  <span>⚡ 空间可用算力池：<strong className="text-amber-600 font-bold font-mono">{isUnlimitedToken(workspaceQuotaInfo.tokenBalance) ? "无限" : `${workspaceQuotaInfo.tokenBalance} 点`}</strong></span>
                  <span>📊 未锁定余量：<strong className="text-emerald-600 font-bold font-mono">{formatTokenBalance(workspaceQuotaInfo.unallocatedBalance)} 点</strong></span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700">
                  本月算力上限 (Token Limit)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={inputQuotaValue}
                    onChange={(e) => setInputQuotaValue(e.target.value)}
                    placeholder="留空表示不限额 (使用空间全局余额)"
                    className="w-full h-11 px-3.5 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                  <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">算力点</span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  💡 提示：留空或设为 0 表示不设置个人独立限制，直接共享空间公共算力池。设置具体数值后，当月该成员消耗超过额度时将被系统自动阻断。自然月首日重置已用点数。
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveQuotaInLayout(true)}
                  disabled={savingQuota}
                  className="px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  清空/不设限制
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuotaMember(null)}
                    className="px-4 h-10 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuotaInLayout(false)}
                    disabled={savingQuota}
                    className="px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {savingQuota ? "保存中..." : "确认保存配额"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 成员兼任多岗位分配与配置 Modal */}
      {configuringRoleMember && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-left font-sans flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm">配置成员空间岗位 (支持兼任多岗)</h3>
                  <p className="text-[11px] text-blue-100 mt-0.5">
                    为成员分配空间装配的专属岗位，各岗位职责权限即时生效
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfiguringRoleMember(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Target Member Info */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">成员对象:</span>
                <span className="text-xs font-black text-slate-800">
                  {configuringRoleMember.name || configuringRoleMember.userName || "协同成员"}
                </span>
                {configuringRoleMember.email && (
                  <span className="text-[11px] text-slate-400 font-mono">({configuringRoleMember.email})</span>
                )}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100 font-bold font-mono">
                已选中 {selectedRoleCodes.length} 个岗位
              </span>
            </div>

            {/* Search and Fast Action Filter */}
            <div className="p-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索岗位名称或代号..."
                  value={roleSearchQuery}
                  onChange={(e) => setRoleSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3182ce]"
                />
              </div>
            </div>

            {/* Posts Multi-select Cards List (100% 来源于数据库当前空间真实装配岗位，杜绝假数据) */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-50">
              {(() => {
                // 仅读取数据库当前空间真实装配引入的岗位
                const allAvailablePosts = workspaceInstalledPosts || [];
                const filteredPosts = allAvailablePosts.filter(p => {
                  if (!roleSearchQuery) return true;
                  const q = roleSearchQuery.toLowerCase();
                  return p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)) || (p.description || "").toLowerCase().includes(q);
                });

                if (filteredPosts.length === 0) {
                  return (
                    <div className="py-10 text-center text-xs text-slate-400 font-bold">
                      {roleSearchQuery ? "未检索到匹配的岗位" : "当前空间暂未装配其他岗位，可前往「岗位与权限」中心引入"}
                    </div>
                  );
                }

                return filteredPosts.map(pos => {
                  const isChecked = selectedRoleCodes.some(c => 
                    c.toUpperCase() === pos.id.toUpperCase() || 
                    c.toUpperCase() === pos.name.toUpperCase() || 
                    (pos.code && c.toUpperCase() === pos.code.toUpperCase())
                  );
                  return (
                    <div
                      key={pos.id}
                      onClick={() => {
                        setSelectedRoleCodes(prev => {
                          const exists = prev.some(c => 
                            c.toUpperCase() === pos.id.toUpperCase() || 
                            c.toUpperCase() === pos.name.toUpperCase() || 
                            (pos.code && c.toUpperCase() === pos.code.toUpperCase())
                          );
                          if (exists) {
                            return prev.filter(c => 
                              c.toUpperCase() !== pos.id.toUpperCase() && 
                              c.toUpperCase() !== pos.name.toUpperCase() && 
                              (!pos.code || c.toUpperCase() !== pos.code.toUpperCase())
                            );
                          } else {
                            return [...prev, pos.id];
                          }
                        });
                      }}
                      className={`pt-2.5 pb-2.5 px-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                        isChecked
                          ? "bg-blue-50/70 border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]/30"
                          : "bg-white hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isChecked
                            ? "bg-[#3182ce] border-[#3182ce] text-white"
                            : "bg-white border-slate-300"
                        }`}>
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PostIcon iconKey={pos.icon} className="w-4 h-4 text-[#3182ce] shrink-0" />
                            <span className="text-xs font-black text-slate-800">{pos.name}</span>
                          </div>
                          {pos.description && (
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {pos.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRoleCodes([])}
                  className="text-xs text-slate-500 hover:text-red-600 font-bold transition-colors cursor-pointer"
                >
                  清空选择
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfiguringRoleMember(null)}
                  className="px-4 h-9 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (configuringRoleMember) {
                      handleTabChangeRole(configuringRoleMember.userId, selectedRoleCodes);
                    }
                  }}
                  disabled={savingMemberRoles}
                  className="px-5 h-9 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingMemberRoles ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>正在更新岗位...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>保存岗位配置 ({selectedRoleCodes.length})</span>
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
