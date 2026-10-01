"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { confirm } from "@/components/GlobalConfirmProvider";
import { getAuthToken } from "@/utils/auth";
import { mergeTaskDetailIntoListItem } from "@/lib/task-detail-merge";
import { useAppContext } from "@/contexts/AppContext";
import AvatarDropdown from "@/components/AvatarDropdown";
import Pagination from "@/components/Pagination";
import Footer from "@/components/Footer";
import { ResultViewer } from "@/components/studio/ResultViewer";
import { formatYuanFromPoints, POINT_RATE_TEXT } from "@/lib/point-rate";

import {
  CheckCircle2 as CheckIcon, Search as SearchIcon, RefreshCw as RefreshIcon,
  Layers as LayersIcon, Clock as ClockIcon, AlertTriangle as AlertIcon,
  Building2 as BuildingIcon, Plus as PlusIcon, FileText as FileIcon,
  ChevronRight as ArrowIcon, Zap as ZapIcon, BarChart2 as ChartIcon,
  List as ListIcon, User as UserIcon, X as XIcon, Loader2 as LoaderIcon,
  MousePointerClick as MouseClickIcon, FileCheck2 as FileCheckIcon, ShieldCheck, Inbox as InboxIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  FileUp as FileUpIcon, Upload as UploadIcon
} from "lucide-react";



type TaskStatus = "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";

interface UserTaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  pointsCost: number;
  status: TaskStatus;
  time: string;
  createdAt: number;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "PERSONAL" | "ENTERPRISE";
  /** 成果数据：历史结构可能为字符串（Markdown 正文），新结构为安全对象 */
  outputData?: string | TaskOutputDataView | null;
  // 真实/模拟/未知执行状态（由后端 execution 字段透传，禁止前端猜测；缺失不得显示为模拟）
  executionMode?: "REAL_MODEL" | "SIMULATED" | "UNKNOWN" | null;
  metaMissing?: boolean;
  anomaly?: string | null;
  legacy?: boolean;
  provider?: { id?: string; modelId?: string } | null;
  model?: string | null;
  usage?: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null } | null;
  billingMode?: string | null;
  estimatedPoints?: number | null;
  actualPoints?: number | null;
  contractVersion?: string | null;
  refundStatus?: "NO_CHARGE" | "REFUNDED" | "REFUND_PENDING" | "RECONCILIATION_REQUIRED" | "UNKNOWN";
  refundedPoints?: number | null;
  /** 三态：false=明确未扣费，true=明确发生扣费尝试，null=无法判断（缺失严禁推断） */
  chargeAttempted?: boolean | null;
  resultSummary?: string | null;
  errorCode?: string | null;
  /** 详情接口返回的安全成果物数组（不含 storagePath / 原始输入 / prompt / 密钥） */
  artifacts?: TaskArtifactView[];
  hasArtifact?: boolean;
  /** 历史合同安全视图：由任务自身 contractSnapshot 派生，无快照为 null，严禁按 componentId 补写业务标签 */
  contractView?: TaskContractView | null;
  execution?: TaskExecutionView | null;
}

/** 成果数据安全视图（严禁含原始输入 / prompt / storagePath / 密钥） */
export interface TaskOutputDataView {
  summary?: string;
  code?: string;
  error?: string;
  message?: string;
  artifacts?: TaskArtifactView[];
}

/** 详情接口返回的安全成果物 */
export interface TaskArtifactView {
  id: string | null;
  type: string | null;
  title: string | null;
  mimeType: string | null;
  rendererType: string | null;
  content: string | Record<string, unknown> | null;
  previewable: boolean;
  downloadable: boolean;
}

/** 历史合同安全视图（严格由任务自身快照派生） */
export interface TaskContractView {
  contractVersion: string | null;
  outputKind: string | null;
  artifactMime: string | null;
  rendererType: string | null;
  qualityHints: string[];
  disclaimer: string | null;
  requireHumanReview: boolean;
}

/** 详情专用安全执行元数据（严禁含 artifacts / 原始输入 / prompt / 完整 config） */
export interface TaskExecutionView {
  executionMode: "REAL_MODEL" | "SIMULATED" | "UNKNOWN";
  anomaly: string | null;
  legacy: boolean;
  provider: { id: string; modelId?: string } | null;
  model: string | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  billingMode: string | null;
  estimatedPoints: number | null;
  actualPoints: number | null;
  contractVersion: string | null;
  hasContractSnapshot: boolean;
  qualityHints: string[];
  isRealExecution?: boolean;
}

// 服务端状态归一化：completed/pending 等变体状态统一映射，避免误判
const normalizeTaskStatus = (raw?: string): TaskStatus => {
  const s = (raw || "").toUpperCase();
  if (["SUCCESS", "COMPLETED", "DONE", "SUCCEEDED"].includes(s)) return "SUCCESS";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMEOUT", "REJECTED"].includes(s)) return "FAILED";
  if (["RUNNING", "PENDING", "QUEUED", "PROCESSING", "READY"].includes(s)) return "RUNNING";
  return "UNKNOWN";
};

/** 执行状态展示：缺失元数据不得显示为“模拟执行” */
function taskExecLabel(t: UserTaskRecord): { text: string; cls: string; title: string } {
  if (t.executionMode === "REAL_MODEL") {
    if (t.anomaly === "REAL_MODEL_META_INCOMPLETE") {
      return { text: "真实模型 · 数据异常", cls: "text-red-600", title: "缺少 provider / usage / 合同版本" };
    }
    return { text: "真实模型", cls: "text-emerald-600", title: "真实模型执行" };
  }
  if (t.executionMode === "SIMULATED") return { text: "模拟执行", cls: "text-amber-600", title: "模拟执行（非真实模型）" };
  if (t.legacy) return { text: "历史数据缺失", cls: "text-slate-500", title: "执行元数据引入前的旧任务" };
  return { text: "执行信息缺失", cls: "text-red-600", title: "缺少 executionMode，禁止默认按模拟执行" };
}

const STATUS_META: Record<TaskStatus, { label: string; cls: string; dot?: string }> = {
  SUCCESS: { label: "成功", cls: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  RUNNING: { label: "进行中", cls: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500 animate-pulse" },
  FAILED: { label: "失败", cls: "text-red-600 bg-red-50 border-red-200" },
  UNKNOWN: { label: "未知", cls: "text-slate-500 bg-slate-100 border-slate-200" },
};

export default function PersonalTasksManagementPage() {
  const router = useRouter();
  const toast = useToast();

  interface ComponentCategoryMeta {
    key?: string;
    name?: string;
  }
  interface ExecutionMeta {
    executionMode?: string | null;
    metaMissing?: boolean;
    anomaly?: string | null;
    legacy?: boolean;
    provider?: { id?: string; modelId?: string } | null;
    model?: string | null;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
    billingMode?: string | null;
    estimatedPoints?: number | null;
    actualPoints?: number | null;
    contractVersion?: string | null;
    [key: string]: unknown;
  }
  interface RawTaskResponse {
    id?: string;
    name?: string;
    type?: string;
    componentName?: string;
    status?: string;
    createdAt?: string | number | Date;
    workspaceId?: string | number;
    workspaceName?: unknown;
    workspaceType?: unknown;
    execution?: ExecutionMeta;
    refundStatus?: unknown;
    refundedPoints?: unknown;
    chargeAttempted?: unknown;
    resultSummary?: unknown;
    errorCode?: unknown;
    [key: string]: unknown;
  }
  interface WorkspaceMeta {
    id: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  }
  // 组件信息来自数据库（component_catalog / component_category 表），代码中不再硬编码组件名称/描述
  const { componentCatalog, internalComponentCatalog, componentCategories } = useAppContext();

  // 数据库中文分类名称动态反查映射（100% 数据库驱动，绝不写死任何本地 fallbackMap）
  const getCategoryChineseName = (catKey?: string) => {
    if (!catKey) return "";
    const keyUpper = catKey.trim().toUpperCase();
    if (componentCategories) {
      // 遍历 AppContext 中从数据库 componentcategory 表查出的真实分类数据
      const cats = componentCategories as Record<string, ComponentCategoryMeta>;
      const catList = Object.values(cats);
      const found = catList.find(
        (c) => (c.key || "").trim().toUpperCase() === keyUpper || (c.name && c.name === catKey)
      );
      if (found?.name) {
        return found.name;
      }
      if (cats[catKey]?.name) {
        return cats[catKey].name;
      }
    }
    return catKey;
  };

  // 支持同时查询用户组件与系统内部引擎（AI_ENGINE 等，均从数据库读取）
  const getComponentMeta = (id: string) => {
    const key = (id || "").trim().toUpperCase();
    return (
      componentCatalog.find((c) => c.id.toUpperCase() === key) ||
      internalComponentCatalog.find((c) => c.id.toUpperCase() === key)
    );
  };

  // 100% 数据库驱动的组件/分类名称智能解析
  const getUnifiedComponentLabel = (id: string, rawName?: string): { name: string; code: string; fullLabel: string } => {
    const code = (id || "").trim();
    const meta = getComponentMeta(code); // 1. 优先尝试匹配数据库 componentcatalog 表（如 id: "C11"）

    if (meta) {
      return {
        name: meta.name,
        code: meta.id,
        fullLabel: `${meta.id} · ${meta.name}`,
      };
    }

    // 2. 尝试从数据库 componentcatalog 查找属于该 category 分类的第一个真实组件 (如 C11)
    const compInCat = componentCatalog.find(
      (c) => (c.category || "").trim().toUpperCase() === code.toUpperCase()
    );
    if (compInCat) {
      return {
        name: compInCat.name,
        code: compInCat.id,
        fullLabel: `${compInCat.id} · ${compInCat.name}`,
      };
    }

    // 3. 从数据库 componentcategory 分类表匹配 (如 key: "BACKEND_CORE", name: "后端开发与接口")
    const catMetaName = componentCategories
      ? (componentCategories as Record<string, ComponentCategoryMeta>)[code]?.name
      : undefined;
    const catName = catMetaName || (rawName && rawName.trim().toUpperCase() !== code.toUpperCase() ? rawName.trim() : "");
    const finalName = catName || code;

    // 分类 Key (BACKEND_CORE) 并非组件编号，绝不拼接粗暴英文前缀，直接呈现数据库中文名称
    return { name: finalName, code, fullLabel: finalName };
  };

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UserTaskRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 筛选控制
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("table");

  // 分页控制 (明细列表每页 10 条，看板各模块每页 5 条)
  const [currentPage, setCurrentPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [runningPage, setRunningPage] = useState(1);
  const [failedPage, setFailedPage] = useState(1);

  // 当筛选或视角改变时重置各视图页码为第 1 页
  useEffect(() => {
    setCurrentPage(1);
    setSuccessPage(1);
    setRunningPage(1);
    setFailedPage(1);
  }, [selectedWorkspaceId, statusFilter, searchQuery, viewMode]);

  // 查看成果 Modal
  const [previewTask, setPreviewTask] = useState<UserTaskRecord | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // 详情加载状态机：loading / ready / forbidden(403) / notfound(404) / error(500 或网络失败)
  const [previewState, setPreviewState] = useState<"ready" | "loading" | "forbidden" | "notfound" | "error">("ready");
  const [previewErrorMsg, setPreviewErrorMsg] = useState<string | null>(null);




  const formatTask = (t: RawTaskResponse, ws: WorkspaceMeta): UserTaskRecord => {
    const cMeta = getComponentMeta(t.type ?? "");
    const dbName = t.componentName && t.componentName !== t.type ? t.componentName : undefined;
    const record = {
      id: t.id ?? "",
      name: t.name ? String(t.name) : `任务 #${String(t.id ?? "").substring(0, 6)}`,
      componentId: t.type ?? "",
      componentName: cMeta?.name || dbName || (typeof t.componentName === "string" ? t.componentName : "") || (t.type ?? ""),
      // 列表严禁读取完整 config：只消费后端统一安全字段 execution.estimatedPoints（算力点）
      pointsCost: typeof t.execution?.estimatedPoints === "number" ? t.execution.estimatedPoints : 0,
      status: normalizeTaskStatus(typeof t.status === "string" ? t.status : undefined),
      time: t.createdAt ? new Date(t.createdAt).toLocaleString("zh-CN", { hour12: false }) : "近期执行",
      createdAt: t.createdAt ? new Date(t.createdAt).getTime() : 0,
      workspaceId: ws.id,
      workspaceName: ws.name ?? "",
      workspaceType: ws.type === "ENTERPRISE" ? "ENTERPRISE" : "PERSONAL",
      // 列表严禁携带 outputData / 成果物内容，成果物仅由详情接口（task_detail）返回
      outputData: null,
      // 执行状态一律取后端 execution 字段；缺失时为 UNKNOWN，绝不默认为模拟
      executionMode: (t.execution?.executionMode as UserTaskRecord["executionMode"]) ?? "UNKNOWN",
      metaMissing: t.execution?.metaMissing ?? true,
      anomaly: t.execution?.anomaly ?? null,
      legacy: t.execution?.legacy ?? false,
      provider: t.execution?.provider ?? null,
      model: t.execution?.model ?? null,
      usage: t.execution?.usage ?? null,
      billingMode: t.execution?.billingMode ?? null,
      estimatedPoints: t.execution?.estimatedPoints ?? null,
      actualPoints: t.execution?.actualPoints ?? null,
      contractVersion: t.execution?.contractVersion ?? null,
      refundStatus: (typeof t.refundStatus === "string" ? (t.refundStatus as UserTaskRecord["refundStatus"]) : "UNKNOWN"),
      refundedPoints: typeof t.refundedPoints === "number" ? t.refundedPoints : null,
      // 三态：缺失一律保留 null，严禁推断为「已发生扣费」
      chargeAttempted: typeof t.chargeAttempted === "boolean" ? t.chargeAttempted : null,
      resultSummary: typeof t.resultSummary === "string" ? t.resultSummary : null,
      errorCode: typeof t.errorCode === "string" ? t.errorCode : null,
      execution: (t.execution ?? null) as TaskExecutionView | null,
    };
    return record as unknown as UserTaskRecord;
  };

  // 按空间拉取任务（后端逐空间校验成员身份）
  const fetchTasksForWorkspace = async (ws: WorkspaceMeta): Promise<UserTaskRecord[]> => {
    const token = getAuthToken();
    const res = await fetch(`/api/studio?action=tasks&workspaceId=${encodeURIComponent(ws.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return (data.data as RawTaskResponse[]).map((t) => formatTask(t, ws));
  };

  // 加载全部空间并聚合任务档案 (优先调用服务端 /api/tasks 聚合接口，失败时降级逐空间拉取)
  const fetchUserTasks = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      // 1. 获取空间列表（下拉菜单与新建任务弹窗用）
      const wsRes = await fetch("/api/workspace/list", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      let wsList: WorkspaceMeta[] = [];
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        if (Array.isArray(wsData.workspaces)) {
          wsList = wsData.workspaces as WorkspaceMeta[];
        }
      }
      setWorkspaces(wsList);

      // 2. 优先尝试服务端一次性聚合接口 GET /api/tasks
      try {
        const tasksRes = await fetch("/api/tasks", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData?.success && Array.isArray(tasksData.data)) {
            const formattedAll = (tasksData.data as RawTaskResponse[]).map((t) =>
              formatTask(t, { id: String(t.workspaceId ?? ""), name: typeof t.workspaceName === "string" ? t.workspaceName : undefined, type: typeof t.workspaceType === "string" ? t.workspaceType : undefined })
            );
            formattedAll.sort((a: UserTaskRecord, b: UserTaskRecord) => b.createdAt - a.createdAt);
            setTasks(formattedAll);
            setLoading(false);
            return;
          }
        }
      } catch (aggErr) {
        console.warn("[fetchUserTasks] /api/tasks 接口调用失败，自动降级为逐空间数据拉取:", aggErr);
      }

      // 3. 服务端聚合不可用时的降级处理：逐空间拉取
      if (wsList.length === 0) {
        setTasks([]);
        return;
      }
      const settled = await Promise.allSettled(wsList.map((ws) => fetchTasksForWorkspace(ws)));
      const all: UserTaskRecord[] = [];
      settled.forEach((r) => {
        if (r.status === "fulfilled") all.push(...r.value);
      });
      all.sort((a, b) => b.createdAt - a.createdAt);
      setTasks(all);
    } catch (err) {
      console.error("[TasksManagementPage] Error loading tasks:", err);
      setLoadError("加载任务列表失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserTasks();
  }, []);


  // 新建任务：引导前往组件工坊由标准合同与调度器正规执行，隔离生产页面对直接 simulate 的暴露
  const handleOpenCreateTaskModal = () => {
    const targetWsId =
      selectedWorkspaceId !== "ALL"
        ? selectedWorkspaceId
        : (workspaces[0]?.id || "");
    toast.info("任务需在组件工坊依据已发布合同标准执行，正在为您前往工坊...");
    router.push(`/studio?workspaceId=${targetWsId}&tab=components`);
  };

  // 按需鉴权加载单条任务成果物详情（真实状态机，严禁把列表对象伪装成详情成功结果）
  const handleOpenPreviewModal = async (t: UserTaskRecord) => {
    setPreviewTask(t);
    setShowPreviewModal(true);
    setPreviewState("loading");
    setPreviewErrorMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studio?action=task_detail&taskId=${encodeURIComponent(t.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      // 403：无权限（绝不降级为「暂无内容」）
      if (res.status === 403) {
        setPreviewState("forbidden");
        setPreviewErrorMsg("无权限查看该任务结果");
        return;
      }
      // 404：结果不存在（绝不渲染为成功空态）
      if (res.status === 404) {
        setPreviewState("notfound");
        setPreviewErrorMsg("结果不存在");
        return;
      }
      // 500 / 其它服务端错误：展示真实错误，不统一显示「加载失败」
      if (!res.ok) {
        let serverMsg: string | null = null;
        try {
          const errJson = await res.json();
          serverMsg =
            (typeof errJson?.error === "string" && errJson.error) ||
            (typeof errJson?.message === "string" && errJson.message) ||
            null;
        } catch {
          serverMsg = null;
        }
        setPreviewState("error");
        setPreviewErrorMsg(serverMsg || `服务端错误（HTTP ${res.status}）`);
        return;
      }

      const json = await res.json();
      if (!json?.success || !json?.data) {
        setPreviewState("error");
        setPreviewErrorMsg(
          (typeof json?.error === "string" && json.error) || "详情接口返回异常，未取得任务数据",
        );
        return;
      }

      // 成功后只使用详情响应（task_detail 安全 DTO）覆盖任务对象。
      // 详情 DTO 是唯一真源：null 必须覆盖旧列表值，严禁回退未认证顶层字段或旧对象。
      setPreviewTask((prev) => {
        if (!prev || prev.id !== t.id) return prev;
        return mergeTaskDetailIntoListItem(prev, json.data);
      });
      setPreviewState("ready");
    } catch (e) {
      setPreviewState("error");
      setPreviewErrorMsg(e instanceof Error ? e.message : "网络请求失败，无法加载任务详情");
    }
  };

  // 关闭弹窗：清除 loading、error 与 detail state
  const handleClosePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewTask(null);
    setPreviewState("ready");
    setPreviewErrorMsg(null);
  };

  // 多维过滤
  const filteredTasks = tasks.filter((t) => {
    const matchesWs = selectedWorkspaceId === "ALL" || t.workspaceId === selectedWorkspaceId;
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q ||
      t.name.toLowerCase().includes(q) ||
      t.componentName.toLowerCase().includes(q) ||
      t.workspaceName.toLowerCase().includes(q);
    return matchesWs && matchesStatus && matchesQuery;
  });

  // 分页计算: 每页显示 10 条数据
  const pageSize = 10;
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedTasks = filteredTasks.slice(startIndex, startIndex + pageSize);

  // 统计
  const successTasks = filteredTasks.filter((t) => t.status === "SUCCESS");
  const runningTasks = filteredTasks.filter((t) => t.status === "RUNNING");
  const failedTasks = filteredTasks.filter((t) => t.status === "FAILED" || t.status === "UNKNOWN");
  // 真实模型成功任务统计（排查隔离 SIMULATED，绝不把模拟执行计入真实模型统计）
  const realSuccessCount = tasks.filter(
    (t) => t.status === "SUCCESS" && t.execution?.isRealExecution === true,
  ).length;
  const totalPoints = tasks.reduce((sum, t) => sum + (t.pointsCost || 0), 0);

  // 看板模块独立分页 (每页 5 条)
  const kanbanPageSize = 5;

  const totalSuccessPages = Math.ceil(successTasks.length / kanbanPageSize) || 1;
  const safeSuccessPage = Math.min(successPage, totalSuccessPages);
  const successStart = (safeSuccessPage - 1) * kanbanPageSize;
  const paginatedSuccessTasks = successTasks.slice(successStart, successStart + kanbanPageSize);

  const totalRunningPages = Math.ceil(runningTasks.length / kanbanPageSize) || 1;
  const safeRunningPage = Math.min(runningPage, totalRunningPages);
  const runningStart = (safeRunningPage - 1) * kanbanPageSize;
  const paginatedRunningTasks = runningTasks.slice(runningStart, runningStart + kanbanPageSize);

  const totalFailedPages = Math.ceil(failedTasks.length / kanbanPageSize) || 1;
  const safeFailedPage = Math.min(failedPage, totalFailedPages);
  const failedStart = (safeFailedPage - 1) * kanbanPageSize;
  const paginatedFailedTasks = failedTasks.slice(failedStart, failedStart + kanbanPageSize);
  const enterpriseCount = tasks.filter((t) => t.workspaceType === "ENTERPRISE").length;
  const personalCount = tasks.filter((t) => t.workspaceType === "PERSONAL").length;

  // 保存任务成果到知识库
  const handleSaveToKnowledge = async (task: UserTaskRecord) => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "save_knowledge",
          workspaceId: task.workspaceId,
          title: `[任务成果] ${task.name}`,
          sourceTaskId: task.id,
          componentId: task.componentId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(`任务成果已保存到【${task.workspaceName}】知识库`);
      } else {
        toast.error(data?.error || "保存失败，请重试");
      }
    } catch (e) {
      toast.error("网络请求异常，请稍后重试");
    }
  };

  // 任务归档替代原有的物理擦除 (调用 POST /api/studio, action: archive_task)
  const handleArchiveTask = async (task: UserTaskRecord) => {
    if (!task || !task.id || !task.workspaceId) return;
    try {
      const token = getAuthToken();
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "archive_task",
          workspaceId: task.workspaceId,
          taskId: task.id,
        }),
      });
      const data = await res.json().catch(() => ({ success: false, error: "接口响应异常" }));
      if (res.ok && data.success) {
        toast.success("任务已归档，记录保留可审计");
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      } else {
        throw new Error(data.error || data.message || "任务归档失败");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "任务归档失败，请稍后重试");
    }
  };



  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] flex flex-col font-sans relative">
      {/* 背景效果（全系统统一浅蓝灰底） */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#f0f8ff] via-[#f1f5f9] to-[#ffffff]" />
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: `radial-gradient(#94a3b8 1px, transparent 1px)`,
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-[#3182ce]/[0.05] rounded-full blur-[140px]" />
      </div>

      {/* 主内容区 */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-6 relative z-10 flex-1 space-y-6 text-left">
        {/* 产品 Header 宣介与主操作 Banner (与组件大厅保持 100% 架构一致的顶通流光 Banner) */}
        <section className="bg-gradient-to-br from-[#f0f8ff] via-[#ebf8ff] to-[#ffffff] rounded-2xl p-6 shadow-xs border border-blue-100 relative overflow-hidden text-left">
          {/* 装饰背景流光 */}
          <div className="absolute right-0 top-0 w-96 h-96 bg-[#63b3ed]/10 rounded-full filter blur-3xl pointer-events-none scale-150 transform translate-x-20 -translate-y-20" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#3182ce]/10 text-[#2b6cb0] rounded-full text-xs font-black tracking-wider border border-[#3182ce]/20 uppercase">
                <ZapIcon className="w-3.5 h-3.5 text-[#2b6cb0]" />
                <span>知阁舟坊 · 自动化任务调度中心</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-800">
                我的任务中心 <span className="text-xs font-bold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 ml-2">个人与团队空间通用</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                统一管理您在各个工作空间创建的自动化分析任务：实时查看处理进度、提取执行结果报告，或到对应空间一键重新处理中断失败的任务。
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleOpenCreateTaskModal}
                className="h-10 px-5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/30"
              >
                <PlusIcon className="w-4 h-4 stroke-[3]" />
                <span>新建自动化任务</span>
              </button>
            </div>
          </div>
        </section>

        {/* 统计指标卡 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4.5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">我的任务总数</span>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {loading ? "···" : tasks.length} <span className="text-xs font-bold text-slate-400">项</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">各空间任务记录汇总</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center shadow-xs">
              <FileIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4.5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">真实模型成功</span>
              <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                {loading ? "···" : realSuccessCount} <span className="text-xs font-bold text-slate-400">项</span>
              </div>
              <p className="text-[10px] text-emerald-600/80 font-medium">真实模型调用生成结果</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
              <CheckIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4.5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">累计消耗点数</span>
              <div className="text-2xl font-black text-[#3182ce] font-mono tracking-tight">
                {loading ? "···" : totalPoints} <span className="text-xs font-bold text-slate-400">点</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                折算 {loading ? "···" : formatYuanFromPoints(totalPoints)}（{POINT_RATE_TEXT}）
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center shadow-xs">
              <ZapIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4.5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">所属空间分布</span>
              <div className="text-xs font-black text-slate-800 space-y-0.5 mt-1">
                <div className="flex items-center gap-1">
                  <BuildingIcon className="w-3 h-3 text-[#3182ce]" />
                  团队空间: <span className="font-mono text-[#3182ce]">{loading ? "···" : enterpriseCount}</span> 项
                </div>
                <div className="flex items-center gap-1">
                  <UserIcon className="w-3 h-3 text-slate-500" />
                  个人空间: <span className="font-mono text-slate-600">{loading ? "···" : personalCount}</span> 项
                </div>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shadow-xs">
              <BuildingIcon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 筛选与控制栏 */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-4 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* 视图模式切换 */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-bold shrink-0">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "table"
                    ? "bg-white text-[#3182ce] shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" /> 明细列表
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "kanban"
                    ? "bg-white text-[#3182ce] shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <ChartIcon className="w-3.5 h-3.5" /> 状态看板
              </button>
            </div>

            {/* 空间筛选：展示当前用户全部空间 */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full sm:w-auto h-9 px-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all text-slate-800"
              >
                <option value="ALL">全部工作空间 ({workspaces.length} 个)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.type === "ENTERPRISE" ? "团队" : "个人"} | {ws.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 关键字搜索 */}
            <div className="relative w-full sm:w-64">
              <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索任务名称、组件或空间..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-9 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* 状态筛选 + 刷新（看板视图下状态已按列分组，仅在列表视图显示状态筛选） */}
          {viewMode === "table" && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/60 shrink-0 self-end md:self-auto">
              {[
                { key: "ALL", label: "全部" },
                { key: "SUCCESS", label: "成功", dotCls: "bg-emerald-500" },
                { key: "RUNNING", label: "进行中", dotCls: "bg-amber-500" },
                { key: "FAILED", label: "失败", dotCls: "bg-red-500" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                    statusFilter === tab.key
                      ? "bg-white text-slate-900 shadow-xs font-black scale-[1.02]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.dotCls && <span className={`w-2 h-2 rounded-full ${tab.dotCls}`} />}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={fetchUserTasks}
            className="p-2 text-slate-500 hover:text-[#3182ce] rounded-xl hover:bg-slate-100 transition-all cursor-pointer shrink-0 self-end md:self-auto"
            title="刷新任务列表"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* 错误兜底 */}
        {loadError && (
          <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-red-600 flex items-center gap-2">
              <AlertIcon className="w-4 h-4" /> {loadError}
            </span>
            <button
              onClick={fetchUserTasks}
              className="px-3 py-1.5 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
            >
              重新加载
            </button>
          </div>
        )}

        {/* 全量空状态 (仅在明细列表 table 模式且全无任务时展示) */}
        {!loading && !loadError && tasks.length === 0 && viewMode === "table" && (
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-12 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <InboxIcon className="w-7 h-7 text-[#3182ce]" />
            </div>
            <p className="text-sm font-black text-slate-800">还没有任务记录</p>
            <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
              选择工作空间并装配组件后，即可创建第一个自动化任务，执行结果会自动汇总在这里。
            </p>
            <button
              onClick={handleOpenCreateTaskModal}
              className="mt-2 px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md cursor-pointer inline-flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" /> 创建第一个任务
            </button>
          </div>
        )}

        {/* 任务明细表视图 */}
        {!loading && tasks.length > 0 && viewMode === "table" && (
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-500 border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-xs font-extrabold">
                    <th className="py-3.5 px-4">任务名称 & 编号</th>
                    <th className="py-3.5 px-3">归属工作空间</th>
                    <th className="py-3.5 px-3">使用组件</th>
                    <th className="py-3.5 px-3">点数消耗</th>
                    <th className="py-3.5 px-3">运行状态</th>
                    <th className="py-3.5 px-3">完成时间</th>
                    <th className="py-3.5 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <SearchIcon className="w-7 h-7 text-slate-300" />
                          <p className="text-xs font-bold text-slate-400">没有符合条件的任务记录</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTasks.map((t) => (
                      <tr key={t.id} data-task-id={t.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div className="truncate max-w-[220px]" title={t.name}>{t.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">ID: {t.id}</div>
                        </td>

                        <td className="py-3.5 px-3">
                          <button
                            onClick={() => router.push(`/workspace/${t.workspaceId}`)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold transition-all cursor-pointer"
                          >
                            <BuildingIcon className="w-3 h-3 text-[#3182ce]" />
                            <span className="truncate max-w-[130px]">{t.workspaceName}</span>
                            <ArrowIcon className="w-3 h-3 text-slate-400" />
                          </button>
                        </td>

                        <td className="py-3.5 px-3 font-bold text-slate-700">
                          {(() => {
                            const compInfo = getUnifiedComponentLabel(t.componentId, t.componentName);
                            const isStandardCode = /^[A-Za-z]{1,3}\d{1,4}$/.test(compInfo.code);
                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-100/80">
                                <LayersIcon className="w-3 h-3 shrink-0" />
                                {isStandardCode && <span className="font-mono font-bold text-xs">{compInfo.code}</span>}
                                <span className="font-bold text-xs">{compInfo.name}</span>
                              </span>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-3 font-mono font-black text-slate-800">
                          {t.pointsCost} <span className="text-[10px] text-slate-400 font-normal">点</span>
                          <div className="text-[10px] text-slate-400 font-normal">{formatYuanFromPoints(t.pointsCost)}</div>
                          <div className="text-[10px] font-bold mt-0.5">
                            <span className={taskExecLabel(t).cls} title={taskExecLabel(t).title}>
                              {taskExecLabel(t).text}
                            </span>
                            {t.contractVersion ? (
                              <span className="ml-1 text-[9px] text-slate-400 font-mono font-normal">
                                v{t.contractVersion}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-black inline-flex items-center gap-1.5 ${STATUS_META[t.status].cls}`}>
                            {STATUS_META[t.status].dot && <span className={`w-2 h-2 rounded-full ${STATUS_META[t.status].dot}`} />}
                            {STATUS_META[t.status].label}
                          </span>
                          {t.status === "FAILED" && (
                            <div className="space-y-0.5 mt-1">
                              {(() => {
                                const codeText = t.errorCode;
                                if (!codeText) return null;
                                return (
                                  <div className="text-[9.5px] font-mono text-rose-600 font-bold truncate max-w-[150px]" title={codeText}>
                                    错误: {codeText}
                                  </div>
                                );
                              })()}
                              {t.refundStatus ? (
                                <div className="text-[9.5px] font-semibold text-slate-500">
                                  退款: {t.refundStatus === "REFUNDED" ? `退款成功 (${t.refundedPoints ?? 0}点)` : t.refundStatus === "NO_CHARGE" ? "未发生扣费" : t.refundStatus === "REFUND_PENDING" ? "退款处理中" : t.refundStatus === "RECONCILIATION_REQUIRED" ? "退款待对账" : "退款状态待系统确认"}
                                </div>
                              ) : (
                                <div className="text-[9.5px] text-slate-400">退款: 退款状态待系统确认</div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 font-mono text-slate-400 text-[11px]">
                          <div className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            <span>{t.time}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-black text-xs space-x-2">
                          {t.status === "SUCCESS" ? (
                            <>
                              <button
                                type="button"
                                data-task-id={t.id}
                                onClick={() => handleOpenPreviewModal(t)}
                                className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer"
                              >
                                查看结果
                              </button>
                              <span className="text-slate-200">|</span>
                              <button
                                type="button"
                                onClick={() => handleSaveToKnowledge(t)}
                                className="text-amber-600 hover:opacity-70 hover:underline cursor-pointer"
                              >
                                存入知识库
                              </button>
                            </>
                          ) : t.status === "FAILED" ? (
                            <>
                              <button
                                type="button"
                                data-task-id={t.id}
                                onClick={() => handleOpenPreviewModal(t)}
                                className="text-rose-600 hover:text-rose-800 hover:underline cursor-pointer font-bold"
                              >
                                失败详情
                              </button>
                              <span className="text-slate-200">|</span>
                              <button
                                type="button"
                                onClick={() => router.push(`/workspace/${t.workspaceId}`)}
                                className="text-slate-600 hover:text-slate-800 hover:underline cursor-pointer"
                              >
                                前往空间
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${t.workspaceId}`)}
                              className="text-slate-600 hover:text-slate-800 hover:underline cursor-pointer"
                            >
                              前往空间
                            </button>
                          )}
                          <span className="text-slate-200">|</span>
                          <button
                            type="button"
                            onClick={() => handleArchiveTask(t)}
                            className="text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                          >
                            归档
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 明细列表视图下的全局动态分页控制组件 (每页 10 条) */}
        {!loading && tasks.length > 0 && viewMode === "table" && (
          <Pagination
            currentPage={safeCurrentPage}
            totalItems={filteredTasks.length}
            pageSize={pageSize}
            onPageChange={(page) => setCurrentPage(page)}
            itemLabel="条任务"
          />
        )}

        {/* 状态看板视图 (极简清晰 3 列业务看板，每列底部独占 5 条/页 独立分页器) */}
        {!loading && viewMode === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-in fade-in duration-300">
            {/* 1. 已完成 (SUCCESS) 列 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col gap-3 min-h-[520px] text-left">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 tracking-tight">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    已完成任务 ({successTasks.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                  已完成
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[620px] pr-1 no-scrollbar flex-1 flex flex-col justify-start">
                {successTasks.length === 0 ? (
                  <div className="my-auto text-center py-10 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/80 space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 border border-emerald-100/80 flex items-center justify-center">
                      <CheckIcon className="w-6 h-6 text-emerald-500 stroke-[2.5]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-800">暂无已完成的任务</p>
                      <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                        您在工作空间发起的任务运行完成后，生成的报告会自动汇总在此
                      </p>
                    </div>
                    <button
                      onClick={handleOpenCreateTaskModal}
                      className="mt-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" /> 发起新任务
                    </button>
                  </div>
                ) : (
                  paginatedSuccessTasks.map((t) => (
                    <div key={t.id} className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2.5 text-left shadow-2xs hover:shadow-md transition-all group relative overflow-hidden">
                      <div className="h-1 w-full bg-emerald-500 absolute top-0 left-0" />
                      <h4 className="font-extrabold text-slate-900 text-xs leading-snug line-clamp-2 pt-1 group-hover:text-[#3182ce] transition-colors">{t.name}</h4>
                      <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1">
                        <span className="truncate max-w-[140px] font-bold text-slate-700">{t.workspaceName}</span>
                        <span className="font-mono text-slate-400 shrink-0 text-[10px]">{t.time}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                        {(() => {
                          const compInfo = getUnifiedComponentLabel(t.componentId, t.componentName);
                          return (
                            <span
                              className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded truncate max-w-[170px] shrink min-w-0"
                              title={compInfo.fullLabel}
                            >
                              {compInfo.fullLabel}
                            </span>
                          );
                        })()}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            data-task-id={t.id}
                            onClick={() => handleOpenPreviewModal(t)}
                            className="px-2.5 py-1 bg-blue-50 text-[#3182ce] hover:bg-blue-100 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                          >
                            查看结果
                          </button>
                          <button
                            onClick={() => handleSaveToKnowledge(t)}
                            className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                            title="归档沉淀至知识库"
                          >
                            存知识库
                          </button>
                          <button
                            onClick={() => handleArchiveTask(t)}
                            className="px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                            title="归档任务记录"
                          >
                            归档
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 模块底部独占独立 5 条/页 极简紧凑分页控制组件 */}
              {successTasks.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mt-auto shrink-0">
                  <Pagination
                    currentPage={safeSuccessPage}
                    totalItems={successTasks.length}
                    pageSize={kanbanPageSize}
                    onPageChange={(page) => setSuccessPage(page)}
                    compact={true}
                  />
                </div>
              )}
            </div>

            {/* 2. 正在处理中 (RUNNING) 列 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col gap-3 min-h-[520px] text-left">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <LoaderIcon className="w-4 h-4 text-[#3182ce] animate-spin" />
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 tracking-tight">
                    正在处理中 ({runningTasks.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold bg-blue-50 text-[#3182ce] px-2.5 py-0.5 rounded-full border border-blue-200/80">
                  处理中
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[620px] pr-1 no-scrollbar flex-1 flex flex-col justify-start">
                {runningTasks.length === 0 ? (
                  <div className="my-auto text-center py-10 px-4 bg-blue-50/20 rounded-2xl border border-dashed border-blue-200/60 space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <ClockIcon className="w-6 h-6 text-[#3182ce]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-800">当前没有正在处理的任务</p>
                      <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                        您可以随时点击右上角【+ 新建自动化任务】发起新的处理
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-[#3182ce] rounded-full text-[10px] font-bold border border-blue-100">
                      系统就绪
                    </span>
                  </div>
                ) : (
                  paginatedRunningTasks.map((t) => (
                    <div key={t.id} className="p-4 bg-gradient-to-r from-blue-50/50 via-white to-blue-50/30 border border-blue-200/80 rounded-xl space-y-2.5 text-left shadow-2xs relative overflow-hidden">
                      <div className="h-1 w-full bg-[#3182ce] absolute top-0 left-0 animate-pulse" />
                      <div className="flex items-center justify-between pt-1">
                        <h4 className="font-extrabold text-slate-900 text-xs leading-snug truncate">{t.name}</h4>
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">{t.workspaceName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <LoaderIcon className="w-3 h-3 animate-spin text-[#3182ce]" />
                        <span>正在分析处理中...</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 模块底部独占独立 5 条/页 极简紧凑分页控制组件 */}
              {runningTasks.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mt-auto shrink-0">
                  <Pagination
                    currentPage={safeRunningPage}
                    totalItems={runningTasks.length}
                    pageSize={kanbanPageSize}
                    onPageChange={(page) => setRunningPage(page)}
                    compact={true}
                  />
                </div>
              )}
            </div>

            {/* 3. 运行失败 (FAILED) 列 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col gap-3 min-h-[520px] text-left">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 tracking-tight">
                    <AlertIcon className="w-4 h-4 text-rose-600" />
                    运行失败 ({failedTasks.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200/80">
                  运行失败
                </span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[620px] pr-1 no-scrollbar flex-1 flex flex-col justify-start">
                {failedTasks.length === 0 ? (
                  <div className="my-auto text-center py-10 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/80 space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-emerald-600 stroke-[2.5]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-800">当前没有失败的任务</p>
                      <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                        如果有任务因报错或异常中断，会在此处提醒您重新处理
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-200/60">
                      🛡️ 100% 链路防护中
                    </span>
                  </div>
                ) : (
                  paginatedFailedTasks.map((t) => (
                    <div key={t.id} className="p-4 bg-rose-50/40 border border-rose-200/80 rounded-xl space-y-2.5 text-left shadow-2xs relative overflow-hidden">
                      <div className="h-1 w-full bg-rose-500 absolute top-0 left-0" />
                      <h4 className="font-extrabold text-slate-900 text-xs leading-snug line-clamp-2 pt-1">{t.name}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">{t.workspaceName}</p>
                      {(() => {
                        // 列表只消费服务端安全字段 errorCode；失败详情文本由 task_detail 的 errorMessage 提供
                        const errCode = t.errorCode;
                        if (!errCode) return null;
                        return (
                          <p className="text-[10.5px] text-rose-700 bg-rose-100/70 p-2 rounded-lg font-medium leading-relaxed">
                            <strong className="font-mono">[{errCode}] </strong>
                            详情请查看失败详情
                          </p>
                        );
                      })()}
                      <div className="flex items-center justify-between pt-2 border-t border-rose-100">
                        <button
                          type="button"
                          data-task-id={t.id}
                          onClick={() => handleOpenPreviewModal(t)}
                          className="px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-100/80 hover:bg-rose-200 rounded-lg transition-colors cursor-pointer"
                        >
                          查看失败详情
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/workspace/${t.workspaceId}`)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] cursor-pointer shadow-2xs transition-colors"
                        >
                          前往空间重试
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 模块底部独占独立 5 条/页 极简紧凑分页控制组件 */}
              {failedTasks.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mt-auto shrink-0">
                  <Pagination
                    currentPage={safeFailedPage}
                    totalItems={failedTasks.length}
                    pageSize={kanbanPageSize}
                    onPageChange={(page) => setFailedPage(page)}
                    compact={true}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 加载骨架 */}
        {loading && (
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-10 w-1/4 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-10 w-1/5 bg-slate-50 rounded-lg animate-pulse" />
                <div className="h-10 w-1/6 bg-slate-50 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        )}
      </main>



      {/* 查看结果 Modal (共享 ResultViewer 组件) */}
      {showPreviewModal && previewState !== "ready" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center space-y-3 shadow-xl">
            {previewState === "loading" ? (
              <>
                <div className="text-sm font-bold text-slate-700">正在加载任务详情…</div>
                <div className="text-xs text-slate-400">请稍候</div>
              </>
            ) : previewState === "forbidden" ? (
              <>
                <div className="text-sm font-bold text-red-600">权限拒绝</div>
                <div className="text-xs text-slate-500">{previewErrorMsg || "无权限查看该任务结果"}</div>
              </>
            ) : previewState === "notfound" ? (
              <>
                <div className="text-sm font-bold text-slate-700">结果不存在</div>
                <div className="text-xs text-slate-500">{previewErrorMsg || "该任务结果不存在或已被清理"}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-red-600">加载失败</div>
                <div className="text-xs text-slate-500">{previewErrorMsg || "无法加载任务详情"}</div>
              </>
            )}
            <button
              type="button"
              onClick={handleClosePreviewModal}
              className="mt-2 rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      ) : (
        <ResultViewer task={previewTask} open={showPreviewModal} onClose={handleClosePreviewModal} />
      )}

      <Footer />
    </div>
  );
}
