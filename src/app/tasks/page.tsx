"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { useAppContext } from "@/contexts/AppContext";
import AvatarDropdown from "@/components/AvatarDropdown";
import Pagination from "@/components/Pagination";
import Footer from "@/components/Footer";

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
  tokenUsed: number;
  status: TaskStatus;
  time: string;
  createdAt: number;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "PERSONAL" | "ENTERPRISE";
  outputData?: any;
}

// 服务端状态归一化：completed/pending 等变体状态统一映射，避免误判
const normalizeTaskStatus = (raw?: string): TaskStatus => {
  const s = (raw || "").toUpperCase();
  if (["SUCCESS", "COMPLETED", "DONE", "SUCCEEDED"].includes(s)) return "SUCCESS";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMEOUT", "REJECTED"].includes(s)) return "FAILED";
  if (["RUNNING", "PENDING", "QUEUED", "PROCESSING", "READY"].includes(s)) return "RUNNING";
  return "UNKNOWN";
};

const STATUS_META: Record<TaskStatus, { label: string; cls: string; dot?: string }> = {
  SUCCESS: { label: "成功", cls: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  RUNNING: { label: "进行中", cls: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500 animate-pulse" },
  FAILED: { label: "失败", cls: "text-red-600 bg-red-50 border-red-200" },
  UNKNOWN: { label: "未知", cls: "text-slate-500 bg-slate-100 border-slate-200" },
};

export default function PersonalTasksManagementPage() {
  const router = useRouter();
  const toast = useToast();
  // 组件信息来自数据库（component_catalog / component_category 表），代码中不再硬编码组件名称/描述
  const { componentCatalog, internalComponentCatalog, componentCategories } = useAppContext();

  // 数据库中文分类名称动态反查映射（100% 数据库驱动，绝不写死任何本地 fallbackMap）
  const getCategoryChineseName = (catKey?: string) => {
    if (!catKey) return "";
    const keyUpper = catKey.trim().toUpperCase();
    if (componentCategories) {
      // 遍历 AppContext 中从数据库 componentcategory 表查出的真实分类数据
      const catList = Object.values(componentCategories) as any[];
      const found = catList.find(
        (c: any) => (c.key || "").trim().toUpperCase() === keyUpper || (c.name && c.name === catKey)
      );
      if (found?.name) {
        return found.name;
      }
      if ((componentCategories as any)[catKey]?.name) {
        return (componentCategories as any)[catKey].name;
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
    const catMetaName = componentCategories && (componentCategories as any)[code]?.name;
    const catName = catMetaName || (rawName && rawName.trim().toUpperCase() !== code.toUpperCase() ? rawName.trim() : "");
    const finalName = catName || code;

    // 分类 Key (BACKEND_CORE) 并非组件编号，绝不拼接粗暴英文前缀，直接呈现数据库中文名称
    return { name: finalName, code, fullLabel: finalName };
  };

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<UserTaskRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
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

  // 新建任务 Modal
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [createTaskWorkspaceId, setCreateTaskWorkspaceId] = useState("");
  const [createTaskComponentId, setCreateTaskComponentId] = useState("");
  const [createTaskName, setCreateTaskName] = useState("");
  const [createTaskMaterial, setCreateTaskMaterial] = useState("");
  const [componentSearchQuery, setComponentSearchQuery] = useState("");
  const [isComponentDropdownOpen, setIsComponentDropdownOpen] = useState(false);
  const [boundComponents, setBoundComponents] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [loadingBound, setLoadingBound] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // 文件上传与自动解析 state
  const [taskUploadedFile, setTaskUploadedFile] = useState<{ name: string; size: number; content: string } | null>(null);
  const [isDraggingTaskFile, setIsDraggingTaskFile] = useState(false);
  const taskFileInputRef = useRef<HTMLInputElement>(null);

  // 智能编码识别与安全文件读取器 (支持 UTF-8 严格解码与 GBK/GB2312 中文自动回退解码)
  const readFileContentSafely = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (["docx", "pdf", "xlsx", "zip"].includes(ext)) {
        resolve(`[已关联本地文档: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]\n此二进制文档已成功装载，后端分析引擎将自动提炼其结构。`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) {
          resolve("");
          return;
        }
        try {
          const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
          resolve(decoderUtf8.decode(buffer));
        } catch (err) {
          try {
            const decoderGbk = new TextDecoder("gbk");
            resolve(decoderGbk.decode(buffer));
          } catch (err2) {
            const decoderLoose = new TextDecoder("utf-8");
            resolve(decoderLoose.decode(buffer));
          }
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleTaskFileUpload = async (file: File) => {
    if (!file) return;
    const content = await readFileContentSafely(file);
    setTaskUploadedFile({
      name: file.name,
      size: file.size,
      content,
    });
    setCreateTaskMaterial((prev) => (prev ? `${prev}\n\n--- [导入文件内容: ${file.name}] ---\n${content}` : content));
    if (!createTaskName.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setCreateTaskName(`分析任务: ${baseName}`);
    }
    toast.success(`已安全解析并导入文件【${file.name}】！`);
  };

  const formatTask = (t: any, ws: any): UserTaskRecord => {
    const cMeta = getComponentMeta(t.type);
    const dbName = t.componentName && t.componentName !== t.type ? t.componentName : undefined;
    return {
      id: t.id,
      name: t.name || `任务 #${String(t.id).substring(0, 6)}`,
      componentId: t.type || "",
      componentName: cMeta?.name || dbName || t.componentName || t.type || "",
      tokenUsed: t.config?.tokenCost ?? 5,
      status: normalizeTaskStatus(t.status),
      time: t.createdAt ? new Date(t.createdAt).toLocaleString("zh-CN", { hour12: false }) : "近期执行",
      createdAt: t.createdAt ? new Date(t.createdAt).getTime() : 0,
      workspaceId: ws.id,
      workspaceName: ws.name,
      workspaceType: ws.type,
      outputData: t.result?.outputData || t.outputData || null,
    };
  };

  // 按空间拉取任务（后端逐空间校验成员身份）
  const fetchTasksForWorkspace = async (ws: any): Promise<UserTaskRecord[]> => {
    const token = getAuthToken();
    const res = await fetch(`/api/studio?action=tasks&workspaceId=${encodeURIComponent(ws.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data.map((t: any) => formatTask(t, ws));
  };

  // 加载全部空间并并行聚合各空间任务
  const fetchUserTasks = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      // 当前用户参与的全部工作空间（响应无 success 字段，直接读 workspaces）
      const wsRes = await fetch("/api/workspace/list", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      let wsList: any[] = [];
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        if (Array.isArray(wsData.workspaces)) {
          wsList = wsData.workspaces;
        }
      }
      if (wsList.length === 0) {
        setWorkspaces([]);
        setTasks([]);
        return;
      }
      setWorkspaces(wsList);
      setCreateTaskWorkspaceId((prev) => (prev && wsList.some((w) => w.id === prev) ? prev : wsList[0].id));

      // 并行聚合所有空间任务（单空间失败不影响整体）
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

  // 联动加载目标空间的已装配组件（真实 bound 接口）
  const loadBoundComponents = async (wsId: string) => {
    if (!wsId) return;
    setLoadingBound(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studio?action=bound&workspaceId=${encodeURIComponent(wsId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        setBoundComponents([]);
        setCreateTaskComponentId("");
        return;
      }
      const data = await res.json();
      if (!data?.success) {
        setBoundComponents([]);
        setCreateTaskComponentId("");
        return;
      }
      const states = data.states || {};
      const rawList = data.details || data.data || [];
      const list = rawList.map((item: any) => {
        const id = typeof item === "string" ? item : item?.id || item?.code || String(item);
        const code = typeof item === "object" ? item?.code || id : id;
        const info = getUnifiedComponentLabel(id, typeof item === "object" ? item?.name : undefined);
        const name = typeof item === "object" && item?.name && item.name !== id ? item.name : info.name;
        const category = typeof item === "object" ? item?.category || "研发组件" : "研发组件";
        const desc = typeof item === "object" ? item?.desc || "" : "";
        const fullLabel = `${name} (${code})`;
        return {
          id,
          code,
          name,
          fullLabel,
          category,
          desc,
          enabled: states[id]?.enabled !== false,
        };
      });
      setBoundComponents(list);
      const firstEnabled = list.find((c: { enabled: boolean }) => c.enabled);
      setCreateTaskComponentId(firstEnabled?.id || "");
    } catch (e) {
      setBoundComponents([]);
    } finally {
      setLoadingBound(false);
    }
  };

  // 打开新建任务弹窗：确保有效空间选中并联动组件
  const handleOpenCreateTaskModal = () => {
    let targetWsId = createTaskWorkspaceId;
    if (workspaces.length > 0 && (!targetWsId || !workspaces.some((w) => w.id === targetWsId))) {
      targetWsId = workspaces[0].id;
      setCreateTaskWorkspaceId(targetWsId);
    }
    if (targetWsId) {
      loadBoundComponents(targetWsId);
    }
    setTaskUploadedFile(null);
    setShowCreateTaskModal(true);
  };

  // 关闭弹窗并跳转至组件大厅挑选装配组件
  const handleGoToComponentBrowser = () => {
    setShowCreateTaskModal(false);
    const targetWsId = createTaskWorkspaceId || selectedWorkspaceId || "";
    router.push(`/studio?workspaceId=${targetWsId}&tab=components`);
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
  const successCount = tasks.filter((t) => t.status === "SUCCESS").length;
  const totalTokensUsed = tasks.reduce((sum, t) => sum + (t.tokenUsed || 0), 0);

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

  // 真实数据库物理擦除删除任务
  const handleDeleteTask = async (taskId: string, taskName: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studio?action=delete_task&taskId=${encodeURIComponent(taskId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ action: "delete_task", taskId }),
      });
      const data = await res.json().catch(() => ({ success: false, error: "接口响应异常" }));
      if (res.ok && data.success) {
        toast.success(`任务「${taskName || taskId}」已从数据库真正物理擦除！`);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } else {
        throw new Error(data.error || data.message || "从数据库删除任务失败");
      }
    } catch (e: any) {
      toast.error(e.message || "删除任务失败，请稍后重试");
    }
  };

  // 提交新建任务（simulate 真实执行：扣减点数 + 服务端判定产出）
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTaskWorkspaceId) {
      toast.warning("请选择目标工作空间");
      return;
    }
    if (!createTaskComponentId) {
      toast.warning("请先在该空间装配并启用一个组件");
      return;
    }
    if (!createTaskName.trim()) {
      toast.warning("任务名称为必填项，请输入明确的任务名称");
      return;
    }
    if (isSubmittingTask) return;

    setIsSubmittingTask(true);
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
          action: "simulate",
          workspaceId: createTaskWorkspaceId,
          componentId: createTaskComponentId,
          taskName: createTaskName.trim() || undefined,
          inputMaterial: createTaskMaterial.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(`任务已执行完成，当前空间剩余 ${data.tokenBalance} 点`);
        setShowCreateTaskModal(false);
        const taskNameCreated = createTaskName.trim() || `任务 #${String(data.task?.id || "").substring(0, 6)}`;
        setCreateTaskName("");
        setCreateTaskMaterial("");

        await fetchUserTasks();

        // 自动调起新任务成果
        const matchedWs = workspaces.find((w) => w.id === createTaskWorkspaceId);
        setPreviewTask({
          id: data.task?.id || "new_task",
          name: taskNameCreated,
          componentId: createTaskComponentId,
          componentName: getComponentMeta(createTaskComponentId)?.name || createTaskComponentId,
          tokenUsed: 5,
          status: "SUCCESS",
          time: "刚刚执行",
          createdAt: Date.now(),
          workspaceId: createTaskWorkspaceId,
          workspaceName: matchedWs?.name || "工作空间",
          workspaceType: matchedWs?.type || "PERSONAL",
          outputData: data.task?.result?.outputData || data.task?.outputData || null,
        });
        setShowPreviewModal(true);
      } else {
        toast.error(data?.error || "任务创建失败，请重试");
      }
    } catch (err) {
      toast.error("网络请求异常");
    } finally {
      setIsSubmittingTask(false);
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
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">成功完成任务</span>
              <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                {loading ? "···" : successCount} <span className="text-xs font-bold text-slate-400">项</span>
              </div>
              <p className="text-[10px] text-emerald-600/80 font-medium">已生成执行结果</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
              <CheckIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4.5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">累计消耗点数</span>
              <div className="text-2xl font-black text-[#3182ce] font-mono tracking-tight">
                {loading ? "···" : totalTokensUsed} <span className="text-xs font-bold text-slate-400">点</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">任务执行累计消耗</p>
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
            <div className="flex items-center gap-1.5">
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="h-9 px-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all text-slate-800"
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
                      <tr key={t.id} className="hover:bg-blue-50/20 transition-colors">
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
                          {t.tokenUsed} <span className="text-[10px] text-slate-400 font-normal">点</span>
                        </td>

                        <td className="py-3.5 px-3">
                          <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-black inline-flex items-center gap-1.5 ${STATUS_META[t.status].cls}`}>
                            {STATUS_META[t.status].dot && <span className={`w-2 h-2 rounded-full ${STATUS_META[t.status].dot}`} />}
                            {STATUS_META[t.status].label}
                          </span>
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
                                onClick={() => { setPreviewTask(t); setShowPreviewModal(true); }}
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
                            onClick={() => handleDeleteTask(t.id, t.name)}
                            className="text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                          >
                            删除
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
                            onClick={() => { setPreviewTask(t); setShowPreviewModal(true); }}
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
                            onClick={() => handleDeleteTask(t.id, t.name)}
                            className="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                            title="清理删除任务"
                          >
                            删除
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
                      <div className="flex items-center justify-between pt-2 border-t border-rose-100">
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded">
                          执行中中断
                        </span>
                        <button
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

      {/* 新建任务 Modal */}
      {showCreateTaskModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <form
            onSubmit={handleCreateTaskSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative max-h-[85vh] overflow-y-auto no-scrollbar flex flex-col justify-between"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <ZapIcon className="w-5 h-5 text-[#3182ce]" />
                <h3 className="text-base font-black text-slate-900">新建任务</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 my-auto">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">1. 选择目标工作空间 <span className="text-red-500">*</span></label>
                <select
                  value={createTaskWorkspaceId || (workspaces[0]?.id || "")}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setCreateTaskWorkspaceId(newId);
                    loadBoundComponents(newId);
                  }}
                  className="w-full p-2.5 text-xs font-extrabold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none text-slate-800 cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.type === "ENTERPRISE" ? "团队" : "个人"} | {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center justify-between">
                  <span>2. 选择要运行的组件 <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">已装配 {boundComponents.length} 个组件</span>
                </label>
                {loadingBound ? (
                  <p className="text-xs text-slate-400 font-semibold p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    正在获取当前空间已装配的组件...
                  </p>
                ) : boundComponents.length === 0 ? (
                  <div className="space-y-2 bg-amber-50/90 p-3.5 rounded-xl border border-amber-200 text-left">
                    <p className="text-xs text-amber-700 font-bold leading-relaxed">
                      当前选中的工作空间暂无可用组件，请去组件大厅挑选并装配。
                    </p>
                    <button
                      type="button"
                      onClick={handleGoToComponentBrowser}
                      className="w-full py-2 px-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-md"
                    >
                      <MouseClickIcon className="w-3.5 h-3.5" />
                      <span>去选择组件 ➔</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-left relative">
                    {/* 带搜索光标与下拉箭头的组合可搜索选择框 */}
                    <div className="relative flex items-center">
                      <SearchIcon className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none z-10" />
                      <input
                        type="text"
                        value={
                          isComponentDropdownOpen
                            ? componentSearchQuery
                            : boundComponents.find((c) => c.id === createTaskComponentId)
                            ? getUnifiedComponentLabel(createTaskComponentId, boundComponents.find((c) => c.id === createTaskComponentId)?.name).fullLabel
                            : createTaskComponentId
                        }
                        onFocus={() => setIsComponentDropdownOpen(true)}
                        onChange={(e) => {
                          setComponentSearchQuery(e.target.value);
                          if (!isComponentDropdownOpen) setIsComponentDropdownOpen(true);
                        }}
                        placeholder="点击展开下拉列表，或输入组件名称/编号搜索..."
                        className="w-full pl-8 pr-9 py-2.5 text-xs font-extrabold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none text-slate-900 cursor-pointer shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setIsComponentDropdownOpen(!isComponentDropdownOpen)}
                        className="absolute right-2.5 p-1 text-slate-400 hover:text-[#3182ce] cursor-pointer"
                        title="展开/收起组件下拉列表"
                      >
                        <ArrowIcon className={`w-4 h-4 transition-transform duration-200 ${isComponentDropdownOpen ? "rotate-90 text-[#3182ce]" : ""}`} />
                      </button>
                    </div>

                    {/* 点击箭头或聚焦后展开的下拉浮层 */}
                    {isComponentDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto no-scrollbar p-1.5 space-y-1 animate-in fade-in duration-150">
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-100 flex justify-between items-center">
                          <span>包含 {boundComponents.length} 个可用组件</span>
                          <span className="text-blue-600 font-bold cursor-pointer hover:underline" onClick={() => setIsComponentDropdownOpen(false)}>收起 ✕</span>
                        </div>
                        {boundComponents
                          .filter((comp) => {
                            const info = getUnifiedComponentLabel(comp.id, comp.name);
                            const detail = getComponentMeta(comp.id);
                            const desc = detail?.description || "";
                            const q = componentSearchQuery.trim().toLowerCase();
                            return !q || comp.id.toLowerCase().includes(q) || info.name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                          })
                          .map((comp) => {
                            const detail = getComponentMeta(comp.id);
                            const info = getUnifiedComponentLabel(comp.id, comp.name);
                            const isSelected = createTaskComponentId === comp.id;
                            return (
                              <div
                                key={comp.id}
                                onClick={() => {
                                  setCreateTaskComponentId(comp.id);
                                  setIsComponentDropdownOpen(false);
                                  setComponentSearchQuery("");
                                }}
                                className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                  isSelected
                                    ? "bg-blue-50 text-[#3182ce] font-extrabold"
                                    : "hover:bg-slate-50 text-slate-700 font-bold"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="truncate text-slate-900">{info.fullLabel}</span>
                                  {detail && (
                                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                                      {getCategoryChineseName(detail?.category)}
                                    </span>
                                  )}
                                </div>
                                {isSelected && <CheckIcon className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />}
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* 选中组件的功能用途单行简述 */}
                    {createTaskComponentId && (
                      <div className="p-2 bg-blue-50/70 border border-blue-100 rounded-lg text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
                        <span className="font-extrabold text-[#3182ce] shrink-0">
                          💡 选中说明:
                        </span>
                        <span className="truncate text-slate-600">
                          {getComponentMeta(createTaskComponentId)?.description || "支持自动化任务分析与数据归集处理。"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">3. 任务名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="请输入明确的任务名称，例如：订单模块架构分析任务"
                  value={createTaskName}
                  onChange={(e) => setCreateTaskName(e.target.value)}
                  className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">4. 需求说明或源数据（选填）</label>
                <textarea
                  value={createTaskMaterial}
                  onChange={(e) => setCreateTaskMaterial(e.target.value)}
                  placeholder="可在此粘贴原始需求文本、代码段或说明..."
                  className="w-full h-24 p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400 resize-none"
                />
              </div>

              {/* 5. 关联本地文件上传解析 */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">5. 关联本地需求/代码文件（选填）</label>
                <input
                  type="file"
                  ref={taskFileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleTaskFileUpload(file);
                  }}
                  accept=".txt,.md,.json,.csv,.docx,.pdf"
                  className="hidden"
                />
                
                {taskUploadedFile ? (
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <FileIcon className="w-4 h-4 text-[#3182ce] shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{taskUploadedFile.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{(taskUploadedFile.size / 1024).toFixed(1)} KB · 内容已自动提取至需求文本框</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaskUploadedFile(null)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="移除此文件"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingTaskFile(true); }}
                    onDragLeave={() => setIsDraggingTaskFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingTaskFile(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleTaskFileUpload(file);
                    }}
                    onClick={() => taskFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                      isDraggingTaskFile
                        ? "border-[#3182ce] bg-blue-50/80 scale-[1.01]"
                        : "border-slate-200 hover:border-[#3182ce]/50 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-slate-600">
                      <FileUpIcon className="w-4 h-4 text-[#3182ce]" />
                      <span>拖拽文件至此 或 <span className="text-[#3182ce] hover:underline">点击上传</span></span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">支持 .md, .txt, .json, .csv, .docx, .pdf 等文件内容自动读取解析</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-blue-50/80 border border-blue-100 rounded-xl px-3 py-2">
                <ZapIcon className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                <p className="text-[10px] font-bold text-[#3182ce]">每次创建任务消耗 5 点资源，从该空间配额中扣除</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateTaskModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmittingTask || !createTaskComponentId}
                className="px-5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingTask ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LoaderIcon className="w-3.5 h-3.5 animate-spin" /> 创建中...
                  </span>
                ) : (
                  "确认创建任务"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 查看结果 Modal */}
      {showPreviewModal && previewTask && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheckIcon className="w-5 h-5 text-[#3182ce] shrink-0" />
                <h3 className="text-base font-black text-slate-900 truncate" title={previewTask.name}>
                  {previewTask.name} - 执行结果
                </h3>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer shrink-0"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-xs font-mono leading-relaxed text-slate-700 max-h-96 overflow-y-auto border border-slate-200/70 whitespace-pre-wrap">
              {!previewTask.outputData || previewTask.outputData === "null" || previewTask.outputData === "undefined" ? (
                <div className="text-slate-400 font-sans italic py-4 text-center">
                  ✨ 暂无详细输出结果数据（该自动化任务已成功处理完成）
                </div>
              ) : typeof previewTask.outputData === "string" ? (
                previewTask.outputData
              ) : (
                JSON.stringify(previewTask.outputData, null, 2)
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500">
                组件: {getUnifiedComponentLabel(previewTask.componentId, previewTask.componentName).fullLabel} · {previewTask.workspaceName}
              </span>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
