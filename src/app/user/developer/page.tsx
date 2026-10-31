"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Code2,
  Plus,
  Copy,
  Trash2,
  Key,
  ShieldCheck,
  AlertTriangle,
  X,
  Calendar,
  Clock,
  RefreshCw,
  Terminal,
  Check,
  AlertCircle,
  Activity,
  Search,
  Edit3,
  Play,
  Wallet,
  Layers,
  ArrowRight,
  FileCode2,
  CheckCircle2,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckSquare,
  Square,
  FileSpreadsheet,
  FileJson,
  Box,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";
import { exportToExcel, buildExportFileName } from "@/utils/excel-export";
import { useExportMaxRows } from "@/lib/use-export-max-rows";

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  lastPath?: string | null;
  lastEndpointTitle?: string | null;
}

interface RecentCallLog {
  id: string;
  keyId: string;
  keyName: string;
  keyPrefix?: string | null;
  path: string;
  endpointTitle?: string;
  ipAddress: string;
  createdAt: string;
}

interface KeySummary {
  totalKeys: number;
  activeKeys: number;
  unusedKeys: number;
  totalCalls: number;
  lastCallAt: string | null;
}

interface WorkspaceOption {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  typeLabel?: string;
  tokenBalance?: number;
}

interface ComponentOption {
  id: string;
  name: string;
  description: string;
  categoryKey: string;
  categoryName: string;
  estimatedModelTokens: number;
}

interface RecentTaskOption {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  status: string;
  statusLabel: string;
  workspaceId: string | null;
  workspaceName: string;
  createdAt: string;
}

interface OpenEndpointItem {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  categoryLabel: string;
}

interface StatusCodeGuideItem {
  code: string;
  desc: string;
  tone: "emerald" | "amber" | "red" | "slate";
}

type CodeLang = "curl" | "node" | "python";
type KeyFilter = "ALL" | "ACTIVE" | "UNUSED";
type KeySort = "NEWEST" | "CALLS_DESC" | "RECENT_USED" | "NAME_ASC";

const QUICK_KEY_PRESETS = [
  { name: "生产环境后端服务", desc: "用于核心业务服务端调用开放接口执行组件与同步结果" },
  { name: "自动化流水线脚本", desc: "用于定时任务或自动化流程批量触发组件任务" },
  { name: "内部数据中台集成", desc: "用于企业内部系统对接工作空间与任务状态轮询" },
  { name: "本地联调测试凭证", desc: "用于本地开发环境验证开放接口连通性与参数格式" },
];

export default function DeveloperCenterPage() {
  const toast = useToast();
  const maxExportRows = useExportMaxRows();
  const [mounted, setMounted] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentCallLog[]>([]);
  const [summary, setSummary] = useState<KeySummary>({
    totalKeys: 0,
    activeKeys: 0,
    unusedKeys: 0,
    totalCalls: 0,
    lastCallAt: null,
  });
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTaskOption[]>([]);
  const [openEndpoints, setOpenEndpoints] = useState<OpenEndpointItem[]>([]);
  const [statusCodeGuides, setStatusCodeGuides] = useState<StatusCodeGuideItem[]>([]);
  const [rateLimitPerMin, setRateLimitPerMin] = useState<number>(30);

  // 真实在线调试参数（全部由数据库查询的真实实体驱动）
  const [selectedWsId, setSelectedWsId] = useState<string>("");
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [tasksLimit, setTasksLimit] = useState<number>(20);
  const [execTaskName, setExecTaskName] = useState<string>("开放接口在线实测任务");
  const [execInputMaterial, setExecInputMaterial] = useState<string>(
    "请围绕当前所选业务组件契约，生成结构化分析方案与可执行清单。",
  );
  // 调试鉴权模式：支持直接选用数据库已签发密钥（无需明文）或粘贴明文 sk-... 密钥
  const [selectedDebugKeyId, setSelectedDebugKeyId] = useState<string>("");
  const [sandboxKey, setSandboxKey] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [origin, setOrigin] = useState("");

  // 密钥筛选、排序与分页
  const [searchQuery, setSearchQuery] = useState("");
  const [keyFilter, setKeyFilter] = useState<KeyFilter>("ALL");
  const [keySort, setKeySort] = useState<KeySort>("NEWEST");
  const [keyPage, setKeyPage] = useState(1);
  const [keyPageSize, setKeyPageSize] = useState<5 | 10 | 20 | 50>(5);

  // 调用审计明细检索、分页、多选、删除与导出状态（对齐管理员后台 /admin/operation-logs）
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState<5 | 10 | 20 | 50>(10);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [viewingLog, setViewingLog] = useState<RecentCallLog | null>(null);
  const [logDeleteConfirm, setLogDeleteConfirm] = useState<{
    kind: "single" | "batch";
    ids: string[];
    title: string;
    message: string;
  } | null>(null);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);

  // 代码生成与调试工作台状态
  const [activeEndpointId, setActiveEndpointId] = useState<string>("me");
  const [codeLang, setCodeLang] = useState<CodeLang>("curl");
  const [testingApi, setTestingApi] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    ok: boolean;
    durationMs: number;
    body: string;
  } | null>(null);

  // 创建弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 编辑弹窗
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // 创建成功后一次性展示完整 key
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // 删除密钥确认
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadKeys = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const keyList: ApiKey[] = Array.isArray(data.apiKeys) ? data.apiKeys : [];
        const logsList: RecentCallLog[] = Array.isArray(data.recentLogs) ? data.recentLogs : [];
        setKeys(keyList);
        setRecentLogs(logsList);
        setSelectedLogIds((prev) => prev.filter((id) => logsList.some((l) => l.id === id)));

        if (keyList.length > 0) {
          setSelectedDebugKeyId((prev) =>
            prev && keyList.some((k) => k.id === prev) ? prev : keyList[0].id,
          );
        } else {
          setSelectedDebugKeyId("");
        }

        if (data.summary) {
          setSummary(data.summary);
        } else {
          const totalCalls = logsList.length;
          const activeKeys = keyList.filter((k) => (k.usageCount || 0) > 0 || k.lastUsedAt).length;
          setSummary({
            totalKeys: keyList.length,
            activeKeys,
            unusedKeys: keyList.length - activeKeys,
            totalCalls,
            lastCallAt: logsList[0]?.createdAt || null,
          });
        }

        if (typeof data.tokenBalance === "number") {
          setTokenBalance(data.tokenBalance);
        }

        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          setSelectedWsId((prev) =>
            prev && data.workspaces.some((w: WorkspaceOption) => w.id === prev)
              ? prev
              : data.workspaces[0].id,
          );
        }

        if (Array.isArray(data.components) && data.components.length > 0) {
          setComponents(data.components);
          setSelectedCompId((prev) =>
            prev && data.components.some((c: ComponentOption) => c.id === prev)
              ? prev
              : data.components[0].id,
          );
        }

        if (Array.isArray(data.recentTasks)) {
          setRecentTasks(data.recentTasks);
          if (data.recentTasks.length > 0) {
            setSelectedTaskId((prev) => prev || data.recentTasks[0].id);
          }
        }

        if (Array.isArray(data.openEndpoints) && data.openEndpoints.length > 0) {
          setOpenEndpoints(data.openEndpoints);
        }
        if (Array.isArray(data.statusCodeGuides) && data.statusCodeGuides.length > 0) {
          setStatusCodeGuides(data.statusCodeGuides);
        }
        if (typeof data.rateLimitPerMin === "number" && data.rateLimitPerMin > 0) {
          setRateLimitPerMin(data.rateLimitPerMin);
        }

        if (isManual) toast.success("开发者凭证与开放接口数据已从数据库刷新");
      } else if (res.status === 401) {
        toast.error("登录状态已失效，请重新登录");
      } else {
        toast.error("加载开发者中心数据失败");
      }
    } catch (e) {
      console.error("加载 API Key 错误:", e);
      toast.error("加载开发者中心数据失败");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    void loadKeys(false);
    setOrigin(window.location.origin);
  }, []);

  // 打开任一弹窗时锁定背景滚动
  const hasOpenModal = !!(showCreate || editingKey || revealedKey || deleteId || logDeleteConfirm || viewingLog);
  useEffect(() => {
    if (!hasOpenModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [hasOpenModal]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setNameError("请填写访问密钥名称");
      return;
    }
    setCreating(true);
    setNameError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRevealedKey(data.apiKey.key);
        setSandboxKey(data.apiKey.key);
        setSelectedDebugKeyId(data.apiKey.id);
        setNewName("");
        setNewDesc("");
        setNameError(null);
        setShowCreate(false);
        void loadKeys();
        toast.success("访问密钥创建成功，请立即复制保存完整密钥");
      } else {
        const err = data.error || "创建失败";
        if (err.includes("名称") || err.includes("同名") || err.includes("重名")) {
          setNameError(err);
        } else {
          toast.error(err);
        }
      }
    } catch (e) {
      console.error("创建 API Key 错误:", e);
      toast.error("网络异常，创建失败");
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (k: ApiKey) => {
    setEditingKey(k);
    setEditName(k.name);
    setEditDesc(k.description || "");
    setEditError(null);
  };

  const handleUpdate = async () => {
    if (!editingKey) return;
    if (!editName.trim()) {
      setEditError("请填写访问密钥名称");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          id: editingKey.id,
          name: editName.trim(),
          description: editDesc.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingKey(null);
        void loadKeys();
        toast.success("密钥名称与备注已更新（原密钥凭证保持不变）");
      } else {
        const err = data.error || "更新失败";
        if (err.includes("名称") || err.includes("同名")) {
          setEditError(err);
        } else {
          toast.error(err);
        }
      }
    } catch (e) {
      console.error("更新 API Key 错误:", e);
      toast.error("网络异常，更新失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: deleteId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKeys((prev) => prev.filter((k) => k.id !== deleteId));
        void loadKeys();
        toast.success("访问密钥已安全吊销并删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (e) {
      console.error("删除 API Key 错误:", e);
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const copy = (text: string, label = "已复制到剪贴板") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const fmtDate = (s?: string | null) =>
    s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "—";

  const filteredKeys = useMemo(() => {
    const list = keys.filter((k) => {
      const isAct = (k.usageCount || 0) > 0 || !!k.lastUsedAt;
      if (keyFilter === "ACTIVE" && !isAct) return false;
      if (keyFilter === "UNUSED" && isAct) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        k.name.toLowerCase().includes(q) ||
        k.keyPrefix.toLowerCase().includes(q) ||
        (k.description || "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (keySort === "CALLS_DESC") {
        return (b.usageCount || 0) - (a.usageCount || 0);
      }
      if (keySort === "RECENT_USED") {
        const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return tb - ta;
      }
      if (keySort === "NAME_ASC") {
        return a.name.localeCompare(b.name, "zh-CN");
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [keys, keyFilter, searchQuery, keySort]);

  const keyTotalPages = Math.max(1, Math.ceil(filteredKeys.length / keyPageSize));
  const safeKeyPage = Math.min(keyPage, keyTotalPages);
  const pagedKeys = useMemo(() => {
    const start = (safeKeyPage - 1) * keyPageSize;
    return filteredKeys.slice(start, start + keyPageSize);
  }, [filteredKeys, safeKeyPage, keyPageSize]);

  useEffect(() => {
    setKeyPage(1);
  }, [keyFilter, searchQuery, keySort, keyPageSize]);

  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return recentLogs;
    const q = logSearch.trim().toLowerCase();
    return recentLogs.filter(
      (log) =>
        log.keyName.toLowerCase().includes(q) ||
        (log.endpointTitle || "").toLowerCase().includes(q) ||
        log.path.toLowerCase().includes(q) ||
        log.ipAddress.toLowerCase().includes(q),
    );
  }, [recentLogs, logSearch]);

  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
  const safeLogPage = Math.min(logPage, logTotalPages);
  const pagedLogs = useMemo(() => {
    const start = (safeLogPage - 1) * logPageSize;
    return filteredLogs.slice(start, start + logPageSize);
  }, [filteredLogs, safeLogPage, logPageSize]);

  useEffect(() => {
    setLogPage(1);
  }, [logSearch, logPageSize]);

  // 审计明细多选、单条删除、批量删除与导出（与 /admin/operation-logs 保持 100% 一致）
  const allPageLogsSelected =
    pagedLogs.length > 0 && pagedLogs.every((r) => selectedLogIds.includes(r.id));

  const toggleSelectLog = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAllPageLogs = () => {
    if (allPageLogsSelected) {
      setSelectedLogIds((prev) => prev.filter((id) => !pagedLogs.some((r) => r.id === id)));
    } else {
      setSelectedLogIds((prev) =>
        Array.from(new Set([...prev, ...pagedLogs.map((r) => r.id)])),
      );
    }
  };

  const executeDeleteLogs = async () => {
    if (!logDeleteConfirm) return;
    setDeletingLogs(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          target: "logs",
          logIds: logDeleteConfirm.ids,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "删除调用审计记录失败");
      }
      toast.success(data.message || "调用审计记录已成功删除");
      setLogDeleteConfirm(null);
      setSelectedLogIds([]);
      void loadKeys(false);
    } catch (err: any) {
      toast.error(err?.message || "删除调用审计记录失败");
    } finally {
      setDeletingLogs(false);
    }
  };

  const exportLogScope: "selected" | "filtered" =
    selectedLogIds.length > 0 ? "selected" : "filtered";

  const handleExportLogs = async (format: "excel" | "json", scope: "selected" | "filtered") => {
    setExportingLogs(true);
    try {
      const rows =
        scope === "selected"
          ? filteredLogs.filter((l) => selectedLogIds.includes(l.id))
          : filteredLogs;

      if (rows.length === 0) {
        toast.warning(
          scope === "selected"
            ? "请先勾选要导出的调用审计记录"
            : "当前筛选条件下暂无调用审计记录可导出",
        );
        return;
      }

      if (format === "excel") {
        exportToExcel({
          filename: "开放接口调用审计明细",
          sheetName: "开放接口调用审计明细",
          columns: [
            { header: "调用时间", formatter: (_, r) => fmtDate(r.createdAt), width: 22 },
            { header: "使用凭证名称", formatter: (_, r) => r.keyName, width: 24 },
            { header: "密钥前缀", formatter: (_, r) => r.keyPrefix || "已归档凭证", width: 16 },
            {
              header: "请求开放接口",
              formatter: (_, r) => r.endpointTitle || "开放平台接口",
              width: 24,
            },
            { header: "接口端点路径", formatter: (_, r) => r.path, width: 28 },
            { header: "来源网络地址", formatter: (_, r) => r.ipAddress, width: 24 },
            { header: "鉴权状态", formatter: () => "鉴权通过", width: 14 },
          ],
          data: rows,
          maxRows: maxExportRows,
          trace: {
            exportType: "开放接口调用审计明细",
            rowCount: rows.length,
            page: "/user/developer",
          },
        });
      } else {
        const jsonContent = JSON.stringify(
          rows.map((r) => ({
            调用时间: fmtDate(r.createdAt),
            使用凭证名称: r.keyName,
            密钥前缀: r.keyPrefix || "已归档凭证",
            请求开放接口: r.endpointTitle || "开放平台接口",
            接口端点路径: r.path,
            来源网络地址: r.ipAddress,
            鉴权状态: "鉴权通过",
          })),
          null,
          2,
        );
        const blob = new Blob([jsonContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = buildExportFileName("开放接口调用审计明细", { ext: "json" });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast.success(
        `已成功导出 ${rows.length} 条调用审计记录（${
          format === "excel" ? "Excel 表格" : "JSON 文件"
        }）`,
      );
    } catch (err: any) {
      toast.error(err?.message || "导出调用审计记录失败");
    } finally {
      setExportingLogs(false);
    }
  };

  const activeEndpoint = useMemo(
    () =>
      openEndpoints.find((e) => e.id === activeEndpointId) ||
      openEndpoints[0] || {
        id: "me",
        method: "GET" as const,
        path: "/api/open/v1/me",
        title: "获取账号概要与算力余额",
        desc: "校验访问密钥有效性，实时从数据库返回当前账号信息、会员等级与个人空间可用算力余额。",
        categoryLabel: "账户与配额",
      },
    [openEndpoints, activeEndpointId],
  );

  const deletingKeyObj = useMemo(
    () => keys.find((k) => k.id === deleteId) || null,
    [keys, deleteId],
  );

  const selectedDebugKeyObj = useMemo(
    () => keys.find((k) => k.id === selectedDebugKeyId) || null,
    [keys, selectedDebugKeyId],
  );

  // 根据当前选中的开放端点、语言与数据库真实上下文（工作空间、组件、任务）动态生成集成代码
  const generatedCode = useMemo(() => {
    const baseUrl = origin || "http://localhost:3000";
    const keyPlaceholder =
      sandboxKey.trim() ||
      (selectedDebugKeyObj ? `${selectedDebugKeyObj.keyPrefix}<您的完整密钥>` : "sk-<您的访问密钥>");
    const wsId = selectedWsId || workspaces[0]?.id || "";
    const compId = selectedCompId || components[0]?.id || "";
    const taskIdVal = selectedTaskId || recentTasks[0]?.id || "";

    let epPath = activeEndpoint.path;
    if (activeEndpoint.id === "tasks") {
      epPath = `/api/open/v1/tasks?limit=${tasksLimit}`;
    } else if (activeEndpoint.id === "taskDetail") {
      epPath = `/api/open/v1/tasks/${taskIdVal || "<任务编号>"}`;
    }
    const url = `${baseUrl}${epPath}`;

    if (activeEndpoint.method === "POST") {
      const payload = {
        workspaceId: wsId,
        componentId: compId,
        taskName: execTaskName.trim() || "开放接口在线实测任务",
        inputMaterial:
          execInputMaterial.trim() ||
          "请围绕当前所选业务组件契约，生成结构化分析方案与可执行清单。",
        inputSource: { sourceType: "text" },
      };
      const jsonStr = JSON.stringify(payload, null, 2);

      if (codeLang === "curl") {
        return `curl -X POST "${url}" \\\n  -H "Authorization: Bearer ${keyPlaceholder}" \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonStr}'`;
      }
      if (codeLang === "node") {
        return `const response = await fetch("${url}", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer ${keyPlaceholder}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${jsonStr.replace(/\n/g, "\n  ")}),\n});\n\nconst result = await response.json();\nconsole.log("执行任务结果:", result);`;
      }
      return `import requests\n\nurl = "${url}"\nheaders = {\n    "Authorization": "Bearer ${keyPlaceholder}",\n    "Content-Type": "application/json",\n}\npayload = ${jsonStr}\n\nresp = requests.post(url, headers=headers, json=payload, timeout=60)\nprint("响应状态码:", resp.status_code)\nprint("执行任务结果:", resp.json())`;
    }

    if (codeLang === "curl") {
      return `curl -X GET "${url}" \\\n  -H "Authorization: Bearer ${keyPlaceholder}"`;
    }
    if (codeLang === "node") {
      return `const response = await fetch("${url}", {\n  method: "GET",\n  headers: {\n    "Authorization": "Bearer ${keyPlaceholder}",\n  },\n});\n\nconst data = await response.json();\nconsole.log("接口响应数据:", data);`;
    }
    return `import requests\n\nurl = "${url}"\nheaders = {\n    "Authorization": "Bearer ${keyPlaceholder}",\n}\n\nresp = requests.get(url, headers=headers, timeout=30)\nprint("响应状态码:", resp.status_code)\nprint("接口响应数据:", resp.json())`;
  }, [
    origin,
    sandboxKey,
    selectedDebugKeyObj,
    selectedWsId,
    selectedCompId,
    selectedTaskId,
    tasksLimit,
    execTaskName,
    execInputMaterial,
    workspaces,
    components,
    recentTasks,
    activeEndpoint,
    codeLang,
  ]);

  // 在线连通性调试台（全 6 个端点 100% 真实调用数据库与执行核心，拒绝任何虚拟/禁用状态）
  const handleRunLiveTest = async () => {
    if (!sandboxKey.trim() && !selectedDebugKeyId) {
      toast.warning("请先在上方创建一枚访问密钥，或粘贴完整访问密钥后再发起实测");
      return;
    }
    if (activeEndpoint.id === "taskDetail" && !selectedTaskId.trim()) {
      toast.warning("请先从数据库任务列表中选择或输入要查询的任务编号");
      return;
    }
    if (activeEndpoint.id === "execute" && (!selectedWsId || !selectedCompId)) {
      toast.warning("请先选择目标工作空间与要执行的已上架组件");
      return;
    }

    setTestingApi(true);
    setTestResponse(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          action: "debug-request",
          keyId: selectedDebugKeyId || undefined,
          plainKey: sandboxKey.trim() || undefined,
          endpointId: activeEndpoint.id,
          workspaceId: selectedWsId,
          componentId: selectedCompId,
          taskId: selectedTaskId.trim(),
          limit: tasksLimit,
          taskName: execTaskName.trim(),
          inputMaterial: execInputMaterial.trim(),
        }),
      });
      const elapsed = Math.round(performance.now() - start);
      const raw = await res.json().catch(() => ({}));
      setTestResponse({
        status: res.status,
        ok: res.ok,
        durationMs: elapsed,
        body: JSON.stringify(raw, null, 2),
      });
      if (res.ok) {
        if (activeEndpoint.id === "execute" && raw?.taskId) {
          setSelectedTaskId(String(raw.taskId));
        }
        toast.success(`开放接口「${activeEndpoint.title}」实测通过 (状态码 ${res.status} · ${elapsed}ms)`);
        void loadKeys(false);
      } else {
        toast.error(raw?.message || `接口返回状态码 ${res.status}`);
      }
    } catch (e: any) {
      setTestResponse({
        status: 0,
        ok: false,
        durationMs: Math.round(performance.now() - start),
        body: JSON.stringify({ error: e?.message || "网络请求失败" }, null, 2),
      });
      toast.error("实测请求发送失败");
    } finally {
      setTestingApi(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-left">
      {/* 顶部标准页头 */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
              <Code2 className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight whitespace-nowrap">
              开发者与开放接口中心
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/60 whitespace-nowrap">
              开放接口 v1 · 服务端集成
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            统一管理访问密钥、在线实测开放接口连通性、生成多语言真实集成代码并追踪接口调用审计明细。
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto ml-10 sm:ml-0 shrink-0">
          <button
            type="button"
            onClick={() => void loadKeys(true)}
            disabled={refreshing}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5 font-bold whitespace-nowrap"
            title="刷新密钥列表与调用统计"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>{refreshing ? "刷新中…" : "刷新数据"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNameError(null);
              setShowCreate(true);
            }}
            className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>创建访问密钥</span>
          </button>
        </div>
      </div>

      {/* 核心指标与安全准则 Bento 矩阵（无折行、紧凑单行标题） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡 1：密钥凭证资产 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-[#3182ce]/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">已签发访问密钥</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
              <Key className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-2xl font-black font-mono text-slate-800">{summary.totalKeys}</span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">枚凭证</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold mt-2 pt-2 border-t border-slate-100 whitespace-nowrap">
            <span className="text-emerald-600">活跃 {summary.activeKeys}</span>
            <span className="text-slate-300">·</span>
            <span className="text-amber-600">待调用 {summary.unusedKeys}</span>
          </div>
        </div>

        {/* 卡 2：累计开放接口调用 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-500/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">开放接口累计调用</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-[#38a169] flex items-center justify-center shrink-0">
              <Activity className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-2xl font-black font-mono text-[#38a169]">
              {summary.totalCalls.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">次请求</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-2 pt-2 border-t border-slate-100 truncate">
            最近调用：{summary.lastCallAt ? fmtDate(summary.lastCallAt) : "尚无调用记录"}
          </div>
        </div>

        {/* 卡 3：关联算力余额 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-500/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">接口关联算力余额</span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-[#dd6b20] flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 my-1">
            <span className="text-2xl font-black font-mono text-[#2b6cb0]">
              {tokenBalance == null
                ? "—"
                : isUnlimitedToken(tokenBalance)
                  ? "∞ 无限"
                  : formatTokenBalance(tokenBalance)}
            </span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">算力点</span>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 whitespace-nowrap">
            <span className="text-slate-400 font-medium">与工作台同口径结算</span>
            <Link
              href="/user/pay"
              className="font-bold text-[#3182ce] hover:underline inline-flex items-center gap-0.5"
            >
              <span>充值</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 卡 4：凭证安全规范（单行不换行优化） */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-[#3182ce]/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap shrink-0">
              凭证安全规范
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60 whitespace-nowrap shrink-0">
              高强度加密存储
            </span>
          </div>
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed line-clamp-2">
            密钥等同于账号权限，仅在创建时明文展示一次；请配置于服务端环境变量，勿在前端暴露。
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-100 whitespace-nowrap overflow-hidden">
            <ShieldCheck className="w-3.5 h-3.5 text-[#38a169] shrink-0" />
            <span className="truncate">支持双请求头鉴权 · 限流 {rateLimitPerMin} 次/分</span>
          </div>
        </div>
      </div>

      {/* ============ 区块一：访问密钥生命周期管理 ============ */}
      <div className="zg-card p-0 overflow-hidden">
        {/* 卡片头部与筛选搜索栏（单行紧凑防折行优化） */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full shrink-0" />
            <h2 className="text-sm font-black text-slate-800 whitespace-nowrap">访问密钥列表</h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200/60 whitespace-nowrap shrink-0">
              共 {filteredKeys.length} / {keys.length} 枚
            </span>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 overflow-x-auto">
            {/* 状态过滤胶囊 */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/60 text-xs shrink-0">
              {(
                [
                  { key: "ALL", label: `全部 (${keys.length})` },
                  { key: "ACTIVE", label: `活跃调用 (${summary.activeKeys})` },
                  { key: "UNUSED", label: `待首次调用 (${summary.unusedKeys})` },
                ] as { key: KeyFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setKeyFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    keyFilter === tab.key
                      ? "bg-white text-[#2b6cb0] shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 排序切换 */}
            <div className="inline-flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={keySort}
                onChange={(e) => setKeySort(e.target.value as KeySort)}
                className="zg-input !h-8 !w-auto !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap"
                title="切换密钥排序维度"
              >
                <option value="NEWEST">按最新签发排序</option>
                <option value="CALLS_DESC">按调用次数最多</option>
                <option value="RECENT_USED">按最近调用时间</option>
                <option value="NAME_ASC">按密钥名称排序</option>
              </select>
            </div>

            {/* 搜索框 */}
            <div className="relative w-full sm:w-52 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索密钥名称、前缀或备注…"
                className="zg-input !h-8 !pl-8 !pr-7 !text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 列表主体（带高度上限保护，防止大量密钥拉长页面） */}
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 zg-skeleton rounded-xl" />
            ))}
          </div>
        ) : filteredKeys.length > 0 ? (
          <>
            <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
              {pagedKeys.map((k) => {
                const isAct = (k.usageCount || 0) > 0 || !!k.lastUsedAt;
                return (
                  <div
                    key={k.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-blue-50/20 transition-colors"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isAct
                            ? "bg-blue-50 text-[#3182ce] border-blue-200/70"
                            : "bg-slate-50 text-slate-400 border-slate-200/70"
                        }`}
                      >
                        <Key className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-slate-800 truncate">
                            {k.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                              isAct
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                : "bg-amber-50 text-amber-700 border-amber-200/80"
                            }`}
                          >
                            {isAct ? "已激活 · 活跃" : "待首次调用"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copy(
                                k.keyPrefix,
                                `已复制密钥前缀 ${k.keyPrefix}（完整密钥仅在创建时展示一次）`,
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#2b6cb0] font-mono text-[11px] font-bold border border-slate-200/80 transition-colors cursor-pointer"
                            title="点击复制密钥可识别前缀"
                          >
                            <span>{k.keyPrefix}••••••••••••</span>
                            <Copy className="w-3 h-3 opacity-70" />
                          </button>
                        </div>

                        {k.description ? (
                          <p className="text-xs text-slate-500 font-medium truncate max-w-2xl">
                            备注用途：{k.description}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">
                            未填写备注说明（可点击右侧「编辑」补充用途说明）
                          </p>
                        )}

                        <div className="flex items-center gap-4 flex-wrap pt-0.5 text-[11px] text-slate-400 font-medium">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>创建于 {fmtDate(k.createdAt)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>最近调用：{fmtDate(k.lastUsedAt)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-600 font-bold whitespace-nowrap">
                            <Activity className="w-3 h-3 text-[#3182ce]" />
                            <span>累计调用 {(k.usageCount ?? 0).toLocaleString()} 次</span>
                          </span>
                          {k.lastPath && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50/70 text-[#2b6cb0] whitespace-nowrap">
                              最近端点：{k.lastPath}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 右侧操作按钮组 */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() =>
                          copy(
                            k.keyPrefix,
                            `已复制密钥前缀 ${k.keyPrefix}`,
                          )
                        }
                        className="zg-btn zg-btn-default !h-8 !px-3 !text-xs gap-1 font-bold whitespace-nowrap"
                        title="复制密钥前缀"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>复制前缀</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(k)}
                        className="zg-btn !bg-blue-50/80 hover:!bg-blue-100/80 !text-[#2b6cb0] !border-blue-200/80 !h-8 !px-3 !text-xs gap-1 font-bold whitespace-nowrap"
                        title="修改密钥名称与用途备注（不改变密钥本身）"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>编辑</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(k.id)}
                        className="zg-btn !bg-red-50/80 hover:!bg-red-100/80 !text-[#e53e3e] !border-red-200/80 !h-8 !px-3 !text-xs gap-1 font-bold whitespace-nowrap"
                        title="吊销并删除该密钥"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部常驻分页与每页条数控制栏 */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  共 <strong className="font-black text-slate-700">{filteredKeys.length}</strong> 枚密钥 · 当前显示第{" "}
                  <strong className="font-mono text-slate-700">
                    {(safeKeyPage - 1) * keyPageSize + 1}–
                    {Math.min(safeKeyPage * keyPageSize, filteredKeys.length)}
                  </strong>{" "}
                  枚
                </span>
                <span className="text-slate-300">|</span>
                <label className="inline-flex items-center gap-1.5">
                  <span>每页显示</span>
                  <select
                    value={keyPageSize}
                    onChange={(e) => {
                      setKeyPageSize(Number(e.target.value) as 5 | 10 | 20 | 50);
                      setKeyPage(1);
                    }}
                    className="zg-input !h-7 !w-auto !py-0 !px-2 !text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <option value={5}>5 枚</option>
                    <option value={10}>10 枚</option>
                    <option value={20}>20 枚</option>
                    <option value={50}>50 枚</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={safeKeyPage <= 1}
                  onClick={() => setKeyPage(1)}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>首页</span>
                </button>
                <button
                  type="button"
                  disabled={safeKeyPage <= 1}
                  onClick={() => setKeyPage((p) => Math.max(1, p - 1))}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>
                <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200/80 font-mono text-[11px] font-bold text-slate-700">
                  第 {safeKeyPage} / {keyTotalPages} 页
                </span>
                <button
                  type="button"
                  disabled={safeKeyPage >= keyTotalPages}
                  onClick={() => setKeyPage((p) => Math.min(keyTotalPages, p + 1))}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeKeyPage >= keyTotalPages}
                  onClick={() => setKeyPage(keyTotalPages)}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>末页</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-14 px-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#3182ce] border border-blue-200/60 flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-800 mb-1">
              {keys.length === 0 ? "当前尚未创建任何访问密钥" : "未找到匹配的访问密钥"}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              {keys.length === 0
                ? "创建专属访问密钥后，即可在您的后端服务、自动化脚本或内部系统中安全调用知阁·舟坊开放接口。"
                : "请尝试调整搜索关键词或切换上方的状态筛选条件。"}
            </p>
            {keys.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>立即创建第一枚访问密钥</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setKeyFilter("ALL");
                }}
                className="zg-btn zg-btn-default text-xs h-8 px-3.5 font-bold"
              >
                重置筛选条件
              </button>
            )}
          </div>
        )}
      </div>

      {/* ============ 区块二：开放接口集成指南与在线连通性调试台（100% 真实数据库驱动与全端点实测） ============ */}
      <div className="zg-card p-6 space-y-5 overflow-hidden">
        <div className="space-y-3 pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Terminal className="w-4 h-4 text-[#3182ce]" />
              <h2 className="text-sm font-black text-slate-800 whitespace-nowrap">
                开放接口集成指南与在线连通性调试台
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap">
                6 大端点全量支持真实数据库联调
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            以下接口目录、状态码字典、工作空间、上架组件及任务列表均从数据库实时加载；可选择任意已签发密钥或输入完整密钥直接向后端发起真实请求。
          </p>

          {/* 真实数据库参数上下文联动栏（自适应防溢出，两栏弹性卡槽） */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-slate-700 font-bold min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#3182ce] shrink-0" />
                <span className="truncate">联调上下文参数联动（参数自动同步至调用代码与在线实测入参）：</span>
              </div>
              <span className="text-[10px] font-bold text-[#3182ce] bg-blue-50/80 border border-blue-200/60 px-2 py-0.5 rounded shrink-0">
                实时参数热同步
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/50">
              {workspaces.length > 0 && (
                <div className="flex items-center gap-2 min-w-0 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 shadow-2xs">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>目标空间：</span>
                  </span>
                  <select
                    value={selectedWsId}
                    onChange={(e) => setSelectedWsId(e.target.value)}
                    className="w-full min-w-0 bg-transparent text-xs font-bold text-slate-700 cursor-pointer outline-none truncate"
                    title="选择联调目标工作空间"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.typeLabel || (w.type === "ENTERPRISE" ? "企业空间" : "个人空间")} · 余额 {w.tokenBalance ?? 0} 点)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {components.length > 0 && (
                <div className="flex items-center gap-2 min-w-0 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 shadow-2xs">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Box className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>调用组件：</span>
                  </span>
                  <select
                    value={selectedCompId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setSelectedCompId(cid);
                      const found = components.find((c) => c.id === cid);
                      if (found) {
                        setExecTaskName(`开放接口实测：${found.name}`);
                      }
                    }}
                    className="w-full min-w-0 bg-transparent text-xs font-bold text-slate-700 cursor-pointer outline-none truncate"
                    title="选择联调业务组件"
                  >
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.categoryName}] {c.name} (单次任务消耗 {c.estimatedModelTokens} 算力点)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 左右分栏：左侧端点目录 + 右侧真实参数配置、多语言代码与在线实测 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 左侧：数据库驱动的 6 大开放接口列表 */}
          <div className="lg:col-span-5 space-y-2">
            <div className="text-xs font-bold text-slate-600 mb-2 flex items-center justify-between">
              <span>开放接口端点目录 ({openEndpoints.length})</span>
              <span className="text-[10px] text-slate-400 font-normal">点击切换右侧代码与在线调试参数</span>
            </div>
            {openEndpoints.map((ep) => {
              const active = ep.id === activeEndpointId;
              const isPost = ep.method === "POST";
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setActiveEndpointId(ep.id);
                    setTestResponse(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? "bg-blue-50/50 border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]/20"
                      : "bg-white/80 border-slate-200/80 hover:border-[#3182ce]/40 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded border shrink-0 ${
                          isPost
                            ? "bg-blue-50 text-[#2b6cb0] border-blue-200/80"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                        }`}
                      >
                        {ep.method}
                      </span>
                      <code className="text-xs font-mono font-bold text-slate-800 truncate">
                        {ep.path}
                      </code>
                    </div>
                    <span className="text-[10px] font-bold text-[#38a169] shrink-0 whitespace-nowrap">
                      支持在线实测
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-700 mt-1.5">{ep.title}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{ep.desc}</p>
                </button>
              );
            })}
          </div>

          {/* 右侧：动态参数设置 + 多语言代码示例（亮色主题）+ 真实在线连通性实测 */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            {/* 针对需要参数的端点展示真实业务参数配置面板 */}
            {(activeEndpoint.id === "execute" ||
              activeEndpoint.id === "taskDetail" ||
              activeEndpoint.id === "tasks") && (
              <div className="rounded-xl border border-blue-200/70 bg-blue-50/25 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>当前接口真实请求参数配置（实时同步至下方代码与在线实测）</span>
                  </span>
                  <span className="text-[10px] font-bold text-[#2b6cb0] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                    真实数据库关联
                  </span>
                </div>

                {activeEndpoint.id === "tasks" && (
                  <div className="flex items-center gap-3 text-xs">
                    <label className="font-bold text-slate-700 whitespace-nowrap">
                      返回任务条数上限 (limit)：
                    </label>
                    <select
                      value={tasksLimit}
                      onChange={(e) => setTasksLimit(Number(e.target.value))}
                      className="zg-input !h-8 !w-36 !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer bg-white"
                    >
                      <option value={5}>最近 5 条</option>
                      <option value={10}>最近 10 条</option>
                      <option value={20}>最近 20 条</option>
                      <option value={50}>最近 50 条</option>
                    </select>
                  </div>
                )}

                {activeEndpoint.id === "taskDetail" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        从数据库已有任务中选择：
                      </label>
                      <select
                        value={selectedTaskId}
                        onChange={(e) => setSelectedTaskId(e.target.value)}
                        className="zg-input !h-8 !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer bg-white"
                      >
                        {recentTasks.length === 0 ? (
                          <option value="">当前暂无历史任务，请先执行一次组件</option>
                        ) : (
                          recentTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.id.slice(0, 8)}… · {t.statusLabel || t.status})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        或直接输入任务编号：
                      </label>
                      <input
                        type="text"
                        value={selectedTaskId}
                        onChange={(e) => setSelectedTaskId(e.target.value)}
                        placeholder="输入真实任务编号"
                        className="zg-input !h-8 !text-xs font-mono bg-white"
                      />
                    </div>
                  </div>
                )}

                {activeEndpoint.id === "execute" && (
                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          执行工作空间 (workspaceId)
                        </label>
                        <select
                          value={selectedWsId}
                          onChange={(e) => setSelectedWsId(e.target.value)}
                          className="zg-input !h-8 !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer bg-white"
                        >
                          {workspaces.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} (余额 {w.tokenBalance ?? 0} 点)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          目标上架组件 (componentId)
                        </label>
                        <select
                          value={selectedCompId}
                          onChange={(e) => {
                            const cid = e.target.value;
                            setSelectedCompId(cid);
                            const found = components.find((c) => c.id === cid);
                            if (found) setExecTaskName(`开放接口实测：${found.name}`);
                          }}
                          className="zg-input !h-8 !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer bg-white"
                        >
                          {components.map((c) => (
                            <option key={c.id} value={c.id}>
                              [{c.categoryName}] {c.name} (单次任务消耗 {c.estimatedModelTokens} 算力点)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          任务记录名称 (taskName)
                        </label>
                        <input
                          type="text"
                          value={execTaskName}
                          onChange={(e) => setExecTaskName(e.target.value)}
                          placeholder="请输入任务名称"
                          className="zg-input !h-8 !text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          业务输入材料内容 (inputMaterial)
                        </label>
                        <input
                          type="text"
                          value={execInputMaterial}
                          onChange={(e) => setExecInputMaterial(e.target.value)}
                          placeholder="请输入需要组件处理的业务材料文本"
                          className="zg-input !h-8 !text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 代码生成面板（严格遵循浅色亮色系规范，拒绝暗黑背景） */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 overflow-hidden">
              <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-[#3182ce]" />
                  <span className="text-xs font-bold text-slate-800">
                    {activeEndpoint.method} {activeEndpoint.path}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    · {activeEndpoint.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* 语言切换 */}
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/70">
                    {(
                      [
                        { id: "curl", label: "命令行 cURL" },
                        { id: "node", label: "Node.js" },
                        { id: "python", label: "Python" },
                      ] as { id: CodeLang; label: string }[]
                    ).map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => setCodeLang(lang.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          codeLang === lang.id
                            ? "bg-[#3182ce] text-white shadow-2xs"
                            : "text-slate-600 hover:text-[#3182ce]"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      copy(generatedCode, "调用示例代码已复制到剪贴板");
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="zg-btn zg-btn-default !h-7 !px-2.5 !text-[11px] gap-1 font-bold"
                  >
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-[#38a169]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#3182ce]" />
                    )}
                    <span>{copiedCode ? "已复制" : "复制代码"}</span>
                  </button>
                </div>
              </div>

              <pre className="text-xs font-mono text-slate-800 bg-[#f8fafc] p-4 overflow-x-auto leading-relaxed select-all">
                {generatedCode}
              </pre>
            </div>

            {/* 在线接口连通性实测（支持直接选用已签发密钥或输入完整密钥，100% 真实请求） */}
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/30 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#3182ce]" />
                  <span className="text-xs font-black text-slate-800">
                    在线接口连通性真实调试
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  可直接选用下方已签发密钥或粘贴完整密钥，向数据库发起真实请求并写入审计日志
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      选择已签发密钥联调：
                    </label>
                    <select
                      value={selectedDebugKeyId}
                      onChange={(e) => setSelectedDebugKeyId(e.target.value)}
                      className="zg-input !h-9 !py-0 !px-2.5 !text-xs font-bold text-slate-700 bg-white cursor-pointer w-full truncate"
                      title="选择当前账号已签发的密钥进行联调"
                    >
                      <option value="">-- 选择已签发密钥联调 ({keys.length} 枚) --</option>
                      {keys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} ({k.keyPrefix}••••)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      或直接输入完整明文密钥：
                    </label>
                    <input
                      type="password"
                      value={sandboxKey}
                      onChange={(e) => setSandboxKey(e.target.value)}
                      placeholder="粘贴完整 sk-... 明文凭证"
                      className="zg-input !h-9 !text-xs font-mono bg-white w-full"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-blue-200/50">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38a169] shrink-0" />
                    <span className="truncate">优先使用选中的已签发密钥；输入明文则以明文为准发起真实请求</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRunLiveTest()}
                    disabled={testingApi}
                    className="zg-btn zg-btn-primary !h-9 !px-4 !text-xs gap-1.5 font-bold shrink-0 justify-center whitespace-nowrap shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {testingApi
                        ? "正在发起真实请求…"
                        : `发送真实请求 (${activeEndpoint.method})`}
                    </span>
                  </button>
                </div>
              </div>

              {testResponse && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between text-xs bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                          testResponse.ok
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-600 border-red-200"
                        }`}
                      >
                        状态码 {testResponse.status} ({testResponse.ok ? "请求成功" : "请求异常"})
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        真实响应耗时 {testResponse.durationMs} 毫秒
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(testResponse.body, "响应数据已复制到剪贴板")}
                      className="text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                    >
                      复制响应结果
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono text-slate-700 bg-[#f8fafc] max-h-56 overflow-auto leading-relaxed">
                    {testResponse.body}
                  </pre>
                </div>
              )}
            </div>

            {/* 数据库配置驱动的常见状态码速查表（全中文） */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="text-xs font-black text-slate-800 mb-2.5 flex items-center justify-between flex-wrap gap-2">
                <span>开放接口标准状态码与结算规范（数据库字典实时同步）</span>
                <span className="text-[11px] font-normal text-slate-500">
                  调用留痕标识：开放接口渠道 · 单密钥限流 {rateLimitPerMin} 次/分钟
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {statusCodeGuides.map((item) => {
                  const toneMap: Record<string, string> = {
                    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
                    amber: "bg-amber-50 text-amber-700 border-amber-200/70",
                    red: "bg-red-50 text-red-600 border-red-200/70",
                    slate: "bg-slate-100 text-slate-700 border-slate-200",
                  };
                  return (
                    <div
                      key={item.code}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/70 border border-slate-100"
                    >
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 whitespace-nowrap ${
                          toneMap[item.tone] || toneMap.slate
                        }`}
                      >
                        {item.code}
                      </span>
                      <span className="text-[11px] text-slate-600 truncate" title={item.desc}>
                        {item.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 区块三：最近开放接口调用审计明细（支持单条删除、批量删除、导出 Excel / JSON） ============ */}
      <div className="zg-card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-[#3182ce]" />
            <h3 className="text-sm font-black text-slate-800 whitespace-nowrap">
              最近开放接口调用审计明细
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200/60 whitespace-nowrap">
              共 {filteredLogs.length} 笔记录
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 搜索框 */}
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="筛选凭证名称、接口名称、路径或 IP…"
                className="zg-input !h-8 !pl-8 !pr-7 !text-xs"
              />
              {logSearch && (
                <button
                  type="button"
                  onClick={() => setLogSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 与管理员后台一致的导出 Excel / 导出 JSON 按钮 */}
            <button
              type="button"
              onClick={() => void handleExportLogs("excel", exportLogScope)}
              disabled={filteredLogs.length === 0 || exportingLogs}
              className="zg-btn zg-btn-default !h-8 !px-3 !text-xs gap-1.5 font-bold whitespace-nowrap disabled:opacity-40"
              title={`导出调用审计明细为 Excel（单次上限 ${maxExportRows} 条）`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#38a169]" />
              <span>
                {selectedLogIds.length > 0
                  ? `导出选中 Excel (${selectedLogIds.length})`
                  : "导出 Excel"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportLogs("json", exportLogScope)}
              disabled={filteredLogs.length === 0 || exportingLogs}
              className="zg-btn zg-btn-default !h-8 !px-3 !text-xs gap-1.5 font-bold whitespace-nowrap disabled:opacity-40"
              title={`导出调用审计明细为 JSON（单次上限 ${maxExportRows} 条）`}
            >
              <FileJson className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>
                {selectedLogIds.length > 0
                  ? `导出选中 JSON (${selectedLogIds.length})`
                  : "导出 JSON"}
              </span>
            </button>
          </div>
        </div>

        {/* 批量勾选操作栏（与管理员后台一致） */}
        {selectedLogIds.length > 0 && (
          <div className="px-4 py-2.5 bg-blue-50/80 border-b border-blue-200/70 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
              <CheckSquare className="w-4 h-4 text-[#3182ce]" />
              <span>已勾选 {selectedLogIds.length} 条接口调用审计记录</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setLogDeleteConfirm({
                    kind: "batch",
                    ids: selectedLogIds,
                    title: `已勾选的 ${selectedLogIds.length} 条调用记录`,
                    message: `确认批量删除已勾选的 ${selectedLogIds.length} 条接口调用审计记录吗？`,
                  })
                }
                className="zg-btn !bg-red-50 hover:!bg-red-100 !text-[#e53e3e] !border-red-200 !h-7 !px-3 !text-xs gap-1 font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>批量删除 ({selectedLogIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedLogIds([])}
                className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs font-bold"
              >
                取消选择
              </button>
            </div>
          </div>
        )}

        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-xs table-auto min-w-[960px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
              <tr className="border-b border-slate-200/80 text-[11px] text-slate-500 font-bold tracking-wider">
                <th className="py-3 px-4 w-10 min-w-[40px]">
                  <button
                    type="button"
                    onClick={toggleSelectAllPageLogs}
                    disabled={pagedLogs.length === 0}
                    className="flex items-center justify-center text-slate-400 hover:text-[#3182ce] disabled:opacity-40 cursor-pointer"
                    title="全选/取消本页记录"
                  >
                    {allPageLogsSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[150px]">调用时间</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[160px]">使用凭证名称</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[240px]">请求开放接口</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">来源 IP 地址</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[100px]">鉴权状态</th>
                <th className="sticky right-0 z-20 bg-slate-50/95 backdrop-blur-xs px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px] shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {pagedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                    {recentLogs.length === 0
                      ? "暂无开放接口调用记录，使用访问密钥调用接口或点击上方「发送真实请求」后将在此实时留痕"
                      : "未找到匹配的调用审计记录，请调整筛选关键词"}
                  </td>
                </tr>
              ) : (
                pagedLogs.map((log) => {
                  const checked = selectedLogIds.includes(log.id);
                  return (
                    <tr
                      key={log.id}
                      className={`group hover:bg-slate-50/60 transition-colors ${
                        checked ? "bg-blue-50/30" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectLog(log.id)}
                          className="flex items-center justify-center text-slate-400 hover:text-[#3182ce] cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-600">
                        {fmtDate(log.createdAt)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">{log.keyName}</span>
                          {log.keyPrefix && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/70">
                              {log.keyPrefix}•••
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">
                            {log.endpointTitle || "开放平台接口"}
                          </span>
                          <code className="px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200/60 font-mono text-[11px] font-bold">
                            {log.path}
                          </code>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-600">
                        {log.ipAddress}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>鉴权通过</span>
                        </span>
                      </td>
                      <td
                        className={`sticky right-0 z-10 px-4 py-2.5 text-right min-w-[130px] shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80 whitespace-nowrap transition-colors ${
                          checked ? "bg-blue-50/95" : "bg-white/95 group-hover:bg-slate-50/95"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <button
                            type="button"
                            onClick={() => setViewingLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 text-[#3182ce] bg-blue-50 hover:bg-[#3182ce] hover:text-white transition-all duration-200 cursor-pointer shadow-2xs"
                            title="查看该笔接口调用审计详情"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>查看</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLogDeleteConfirm({
                                kind: "single",
                                ids: [log.id],
                                title: `${log.keyName} · ${log.endpointTitle || log.path}`,
                                message: "确认删除该条开放接口调用审计记录吗？此操作不可恢复。",
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 text-[#e53e3e] bg-red-50 hover:bg-[#e53e3e] hover:text-white transition-all duration-200 cursor-pointer shadow-2xs"
                            title="删除该条调用审计记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>删除</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 审计明细常驻分页栏 */}
        {filteredLogs.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                共 <strong className="font-black text-slate-700">{filteredLogs.length}</strong> 笔调用记录 · 当前第{" "}
                <strong className="font-mono text-slate-700">
                  {(safeLogPage - 1) * logPageSize + 1}–
                  {Math.min(safeLogPage * logPageSize, filteredLogs.length)}
                </strong>{" "}
                笔
              </span>
              <span className="text-slate-300">|</span>
              <label className="inline-flex items-center gap-1.5">
                <span>每页显示</span>
                <select
                  value={logPageSize}
                  onChange={(e) => {
                    setLogPageSize(Number(e.target.value) as 5 | 10 | 20 | 50);
                    setLogPage(1);
                  }}
                  className="zg-input !h-7 !w-auto !py-0 !px-2 !text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <option value={5}>5 笔</option>
                  <option value={10}>10 笔</option>
                  <option value={20}>20 笔</option>
                  <option value={50}>50 笔</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={safeLogPage <= 1}
                onClick={() => setLogPage(1)}
                className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
              >
                <span>首页</span>
              </button>
              <button
                type="button"
                disabled={safeLogPage <= 1}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>上一页</span>
              </button>
              <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200/80 font-mono text-[11px] font-bold text-slate-700">
                第 {safeLogPage} / {logTotalPages} 页
              </span>
              <button
                type="button"
                disabled={safeLogPage >= logTotalPages}
                onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))}
                className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
              >
                <span>下一页</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeLogPage >= logTotalPages}
                onClick={() => setLogPage(logTotalPages)}
                className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
              >
                <span>末页</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============ 弹窗 1：创建访问密钥（Portal 挂载至 document.body） ============ */}
      {mounted &&
        showCreate &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full p-6 relative border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">创建新的访问密钥</h3>
                  <p className="text-[11px] text-slate-500">为服务端应用或自动化脚本签发访问密钥</p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* 快捷场景预设胶囊 */}
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                    快捷场景模板（点击一键填入）：
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_KEY_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setNewName(preset.name);
                          setNewDesc(preset.desc);
                          if (nameError) setNameError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#2b6cb0] border border-slate-200/80 hover:border-blue-200 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 zg-required">
                    密钥名称
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    placeholder="如：生产环境后端服务 / 自动化同步脚本"
                    className={`zg-input text-xs ${nameError ? "is-error" : ""}`}
                  />
                  {nameError && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-1 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{nameError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    用途备注描述（推荐填写，便于团队审计识别）
                  </label>
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="备注该密钥所属系统、负责人或调用场景"
                    className="zg-input text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="zg-btn zg-btn-default text-xs h-8 px-4"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="zg-btn zg-btn-primary text-xs h-8 px-4 font-bold"
                >
                  {creating ? "正在签发密钥…" : "确认创建密钥"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ 弹窗 2：编辑访问密钥名称与备注（Portal 挂载至 document.body） ============ */}
      {mounted &&
        editingKey &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full p-6 relative border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setEditingKey(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">编辑访问密钥信息</h3>
                  <p className="text-[11px] text-slate-500">
                    前缀 <code className="font-mono text-[#2b6cb0]">{editingKey.keyPrefix}</code> · 修改名称与备注不会改变原密钥凭证
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 zg-required">
                    密钥名称
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (editError) setEditError(null);
                    }}
                    placeholder="请输入密钥名称"
                    className={`zg-input text-xs ${editError ? "is-error" : ""}`}
                  />
                  {editError && (
                    <p className="text-[11px] text-red-600 flex items-center gap-1 mt-1 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{editError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    用途备注描述
                  </label>
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="补充或更新该密钥的用途说明"
                    className="zg-input text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  className="zg-btn zg-btn-default text-xs h-8 px-4"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleUpdate()}
                  disabled={savingEdit}
                  className="zg-btn zg-btn-primary text-xs h-8 px-4 font-bold"
                >
                  {savingEdit ? "保存中…" : "保存修改"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ 弹窗 3：一次性展示完整访问密钥（Portal 挂载至 document.body） ============ */}
      {mounted &&
        revealedKey &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-lg w-full p-6 relative border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#38a169]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">访问密钥已成功签发</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    出于安全合规要求，完整密钥仅在此展示一次，关闭后无法再次找回明文
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-xl">
                <code className="flex-1 text-[#2b6cb0] font-mono text-xs font-bold break-all select-all">
                  {revealedKey}
                </code>
                <button
                  type="button"
                  onClick={() => copy(revealedKey, "完整访问密钥已复制到剪贴板")}
                  className="zg-btn zg-btn-primary !h-8 !px-3 !text-xs gap-1 font-bold shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制密钥</span>
                </button>
              </div>

              <p className="text-[11px] text-emerald-700 font-semibold mt-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#38a169] shrink-0" />
                <span>已自动为您同步填入页面下方「在线接口连通性真实调试」，关闭弹窗后可直接点击发送真实请求。</span>
              </p>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRevealedKey(null)}
                  className="zg-btn zg-btn-primary text-xs h-9 px-5 font-bold w-full sm:w-auto"
                >
                  我已妥善保存，关闭窗口
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ 弹窗 4：删除密钥确认（Portal 挂载至 document.body） ============ */}
      {mounted &&
        deleteId &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/80 flex items-center justify-center text-[#e53e3e] shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">确认吊销并删除密钥</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">此操作不可撤销，关联服务将立即停止鉴权</p>
                </div>
              </div>

              {deletingKeyObj && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1 mb-4">
                  <div className="font-bold text-slate-800">{deletingKeyObj.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    前缀：{deletingKeyObj.keyPrefix}•••• · 累计已调用 {deletingKeyObj.usageCount ?? 0} 次
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="zg-btn zg-btn-default text-xs h-8 px-4"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="zg-btn zg-btn-danger text-xs h-8 px-4 font-bold"
                >
                  {deleting ? "正在吊销…" : "确认吊销删除"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ 弹窗 5：删除/批量删除调用审计日志确认（Portal 挂载至 document.body） ============ */}
      {mounted &&
        logDeleteConfirm &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/80 flex items-center justify-center text-[#e53e3e] shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    {logDeleteConfirm.kind === "batch"
                      ? "确认批量删除调用审计明细"
                      : "确认删除调用审计明细"}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {logDeleteConfirm.message || "删除后该记录将从数据库审计明细表中移除，不可恢复"}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1 mb-4">
                <div className="font-bold text-slate-800">{logDeleteConfirm.title}</div>
                <div className="text-[11px] text-slate-500">
                  共涉及 <strong className="font-mono text-[#e53e3e]">{logDeleteConfirm.ids.length}</strong> 条接口调用记录
                </div>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setLogDeleteConfirm(null)}
                  disabled={deletingLogs}
                  className="zg-btn zg-btn-default text-xs h-8 px-4"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void executeDeleteLogs()}
                  disabled={deletingLogs}
                  className="zg-btn zg-btn-danger text-xs h-8 px-4 font-bold"
                >
                  {deletingLogs ? "正在删除…" : "确认删除记录"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ============ 弹窗 6：查看开放接口调用审计详情（Portal 挂载至 document.body） ============ */}
      {mounted &&
        viewingLog &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-lg w-full p-6 relative border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setViewingLog(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>

              <div className="flex items-center gap-3 mb-5 pb-3.5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] border border-blue-200/70 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    开放接口调用审计详情
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    记录编号：<span className="font-mono text-slate-700">{viewingLog.id}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
                      调用时间
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {fmtDate(viewingLog.createdAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
                      鉴权状态
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>鉴权通过</span>
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 font-bold whitespace-nowrap">使用凭证</span>
                    <div className="text-right">
                      <span className="font-bold text-slate-800">{viewingLog.keyName}</span>
                      {viewingLog.keyPrefix && (
                        <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/70">
                          {viewingLog.keyPrefix}•••
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 font-bold whitespace-nowrap">请求接口</span>
                    <div className="text-right">
                      <div className="font-bold text-slate-800">
                        {viewingLog.endpointTitle || "开放平台接口"}
                      </div>
                      <code className="text-[11px] font-mono font-bold text-[#2b6cb0] bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60 inline-block mt-0.5">
                        {viewingLog.path}
                      </code>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-bold whitespace-nowrap">来源网络 IP</span>
                    <span className="font-mono font-bold text-slate-800">
                      {viewingLog.ipAddress}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-bold whitespace-nowrap">网关协议规范</span>
                    <span className="text-[11px] font-medium text-slate-600">
                      HTTP RESTful · JSON · UTF-8
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2.5 mt-6 pt-3.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    copy(
                      JSON.stringify(viewingLog, null, 2),
                      "完整调用审计详情 (JSON) 已复制到剪贴板",
                    )
                  }
                  className="zg-btn zg-btn-default text-xs h-8 px-3.5 gap-1.5 font-bold"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>复制 JSON 详情</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingLog(null)}
                  className="zg-btn zg-btn-primary text-xs h-8 px-5 font-bold"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
