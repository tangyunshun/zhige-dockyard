"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileCode,
  Layers,
  ArrowLeft,
  Plus,
  CheckCircle2,
  AlertCircle,
  Archive,
  Send,
  Eye,
  RefreshCw,
  Copy,
  Lock,
  FileCheck,
  ShieldAlert,
  Code2,
  HelpCircle,
  Sliders,
  Sparkles,
  Info,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";
import {
  ComponentContract,
  ContractLifecycle,
  validateComponentContract,
  ComponentContractError,
  ALLOWED_MODEL_CAPABILITIES,
  ALLOWED_INPUT_KINDS,
  ALLOWED_OUTPUT_KINDS,
  ALLOWED_RENDERER_TYPES,
} from "@/lib/component-contract";

interface ComponentItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
}

interface ContractSummary {
  inputKind: string;
  pipelineStepCount: number;
  executionStepCount: number;
  outputKind: string;
  rendererType: string;
  billingMode: string;
}

interface ContractListItem {
  id: string;
  componentId: string;
  contractVersion: string;
  lifecycle: ContractLifecycle;
  description: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  contractSummary: ContractSummary;
}

/** 初始空合同模板生成器 */
function createDefaultContractTemplate(componentId: string, version: string): ComponentContract {
  return {
    componentId,
    contractVersion: version,
    lifecycle: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    input: {
      kind: "TEXT",
      textConstraints: {
        required: true,
        minLength: 10,
        maxLength: 20000,
        placeholder: "请输入待分析的业务正文...",
      },
    },
    materialPipeline: {
      steps: [
        {
          name: "文本规范化清洗",
          type: "TEXT_NORMALIZE",
          options: { removeEmptyLines: true },
        },
      ],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step_01_core_analysis",
          name: "核心业务分析",
          promptTemplateVersion: "v1.0",
          promptTemplate:
            "你是一名资深行业专家。请根据以下业务输入完成精准研判：\n\n{{sourceText}}\n\n请输出专业、结构化且符合规范的分析报告。",
          inputMapping: {
            sourceText: "input.text",
          },
          outputKey: "core_analysis_report",
          contextBudgetTokens: 8192,
          maxOutputTokens: 4096,
          timeoutMs: 45000,
          requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "1.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
      structureConstraints: {
        requiredProperties: ["title", "summary", "sections"],
      },
    },
    qualityPolicy: {
      requiredSections: ["背景概述", "关键发现", "优化建议"],
      minOutputLength: 200,
      requireCitations: false,
      allowAutoRetry: true,
      maxRetryCount: 2,
      requireHumanReview: false,
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
      minServiceFeePoints: 10,
      estimatedTokens: 3500,
      ruleDescription: "按模型实际 Token 调用量与组件基础服务点数综合核算。",
    },
  };
}

export default function ComponentContractsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialComponentId = searchParams.get("componentId") || "";

  const { showToast } = useToast();

  // 基础状态
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string>(initialComponentId);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loadingComponents, setLoadingComponents] = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 编辑与快照状态
  const [currentContract, setCurrentContract] = useState<ComponentContract | null>(null);
  const [contractJsonText, setContractJsonText] = useState<string>("");
  const [currentDescription, setCurrentDescription] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"visual" | "json" | "snapshot">("visual");

  // 权限与安全警告
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // 校验诊断错误
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationSuccess, setValidationSuccess] = useState<boolean>(false);

  // 模态框与弹窗控制
  const [showNewDraftModal, setShowNewDraftModal] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [newDescriptionInput, setNewDescriptionInput] = useState("");
  const [cloneFromLatest, setCloneFromLatest] = useState(true);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // 二次确认弹窗
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "danger" | "warning" | "info";
    confirmButtonClass?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 快照弹窗
  const [snapshotModalData, setSnapshotModalData] = useState<any | null>(null);

  // 获取请求头（携带鉴权 Token）
  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  // 1. 加载全量组件目录（动态加载真实数据，绝不硬编码）
  useEffect(() => {
    async function fetchComponents() {
      setLoadingComponents(true);
      try {
        const res = await fetch("/api/admin/components?limit=500", {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          if (res.status === 403) {
            setPermissionError("获取组件列表失败：您缺少 [component:read] 管理员权限！");
          }
          throw new Error(`加载组件失败 (${res.status})`);
        }
        const json = await res.json();
        const list = json.data?.components || [];
        setComponents(list);

        // 如果未指定 componentId，默认选中第一个
        if (!selectedComponentId && list.length > 0) {
          setSelectedComponentId(list[0].id);
        }
      } catch (err) {
        showToast("error", err instanceof Error ? err.message : "加载组件目录异常");
      } finally {
        setLoadingComponents(false);
      }
    }
    fetchComponents();
  }, [getAuthHeaders]);

  // 2. 加载选定组件的合同版本列表
  const fetchContracts = useCallback(async (compId: string) => {
    if (!compId) return;
    setLoadingContracts(true);
    setPermissionError(null);
    setValidationErrors([]);
    setValidationSuccess(false);

    try {
      const res = await fetch(`/api/admin/components/${compId}/contracts`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setPermissionError("访问被拦截：当前账户缺乏 [component:read] 或 [system:manage] 权限！");
        }
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `获取合同版本失败 (${res.status})`);
      }
      const json = await res.json();
      const list: ContractListItem[] = json.data?.contracts || [];
      setContracts(list);

      // 默认选中第一个版本（最新版本）
      if (list.length > 0) {
        setSelectedVersion(list[0].contractVersion);
      } else {
        setSelectedVersion("");
        setCurrentContract(null);
        setContractJsonText("");
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "获取合同列表异常");
    } finally {
      setLoadingContracts(false);
    }
  }, [getAuthHeaders, showToast]);

  useEffect(() => {
    if (selectedComponentId) {
      fetchContracts(selectedComponentId);
    }
  }, [selectedComponentId, fetchContracts]);

  // 3. 加载指定版本的完整合同详情
  const fetchContractDetail = useCallback(async (compId: string, version: string) => {
    if (!compId || !version) return;
    setLoadingDetail(true);
    setValidationErrors([]);
    setValidationSuccess(false);

    try {
      const res = await fetch(`/api/admin/components/${compId}/contracts/${version}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setPermissionError("读取合同详情被拦截：当前账户缺乏权限！");
        }
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `获取合同详情失败 (${res.status})`);
      }
      const json = await res.json();
      const record = json.data;
      setCurrentContract(record.contract);
      setCurrentDescription(record.description || "");
      setContractJsonText(JSON.stringify(record.contract, null, 2));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "获取合同详情异常");
    } finally {
      setLoadingDetail(false);
    }
  }, [getAuthHeaders, showToast]);

  useEffect(() => {
    if (selectedComponentId && selectedVersion) {
      fetchContractDetail(selectedComponentId, selectedVersion);
    }
  }, [selectedComponentId, selectedVersion, fetchContractDetail]);

  // 当前选中的版本元数据
  const currentVersionMeta = contracts.find((c) => c.contractVersion === selectedVersion);
  const isDraft = currentVersionMeta?.lifecycle === "DRAFT";
  const isPublished = currentVersionMeta?.lifecycle === "PUBLISHED";
  const isArchived = currentVersionMeta?.lifecycle === "ARCHIVED";

  // 本地领域快速校验
  const handleValidateLocally = () => {
    setValidationErrors([]);
    setValidationSuccess(false);

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(contractJsonText);
      } catch (jsonErr) {
        setValidationErrors([`JSON 语法解析失败：${(jsonErr as Error).message}`]);
        showToast("error", "JSON 语法解析错误，请检查括号与逗号！");
        return;
      }

      validateComponentContract(parsed);
      setValidationSuccess(true);
      showToast("success", "本地纯领域规则校验 100% 通过！合同结构与约束合法。");
    } catch (err) {
      if (err instanceof ComponentContractError) {
        setValidationErrors([`[${err.code}] ${err.message}`]);
      } else {
        setValidationErrors([(err as Error).message]);
      }
      showToast("warning", "合同校验未通过，请查看下方诊断明细！");
    }
  };

  // 创建新草稿提交
  const handleCreateDraftSubmit = async () => {
    const version = newVersionInput.trim();
    if (!version) {
      showToast("error", "请输入语义化版本号（如 1.0.0）！");
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      showToast("error", "版本号必须符合语义化规范（例如 1.0.0, 1.1.0）！");
      return;
    }

    setSubmittingDraft(true);
    setPermissionError(null);

    try {
      // 准备草稿内容
      let draftBody: ComponentContract;
      if (cloneFromLatest && currentContract) {
        draftBody = {
          ...JSON.parse(JSON.stringify(currentContract)),
          componentId: selectedComponentId,
          contractVersion: version,
          lifecycle: "DRAFT",
          publishedAt: null,
          publishedBy: null,
        };
      } else {
        draftBody = createDefaultContractTemplate(selectedComponentId, version);
      }

      const res = await fetch(`/api/admin/components/${selectedComponentId}/contracts`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          contractVersion: version,
          contract: draftBody,
          description: newDescriptionInput.trim() || `版本 ${version} 业务草稿`,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "操作失败：当前账户缺乏 [system:manage] 平台管理权限，无法创建合同草稿！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `创建草稿失败 (${res.status})`);
      }

      showToast("success", json.message || "新版本草稿创建成功！");
      setShowNewDraftModal(false);
      setNewVersionInput("");
      setNewDescriptionInput("");
      // 重新加载版本列表并选中新版本
      await fetchContracts(selectedComponentId);
      setSelectedVersion(version);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "创建草稿异常");
    } finally {
      setSubmittingDraft(false);
    }
  };

  // 保存草稿修改 (PATCH)
  const handleSaveDraft = async () => {
    if (!isDraft) {
      showToast("error", "只有处于 DRAFT 状态的合同才允许修改！已发布版本严禁原地篡改。");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contractJsonText);
    } catch (e) {
      showToast("error", "JSON 格式有误，无法保存！");
      return;
    }

    setPermissionError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${selectedComponentId}/contracts/${selectedVersion}`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            contract: parsed,
            description: currentDescription,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "保存被拒绝：当前账户缺乏 [system:manage] 平台管理权限！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `保存草稿失败 (${res.status})`);
      }

      showToast("success", "草稿保存成功！");
      setCurrentContract(json.data.contract);
      setValidationErrors([]);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "保存草稿异常");
    }
  };

  // 触发发布确认
  const handlePublishClick = () => {
    if (!isDraft) {
      showToast("warning", "只有草稿状态的版本可以发布！");
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `确认发布合同版本 [${selectedVersion}] 上线？`,
      message:
        "【核心发布红线】：发布后该合同版本将永久进入 [PUBLISHED] 不可变锁定状态，绝不允许原地修改，后续历史任务与审计将严格以此版本快照为准。如需迭代必须创建新版本。请确认是否执行发布？",
      type: "info",
      confirmButtonClass: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await executePublish();
      },
    });
  };

  // 执行发布
  const executePublish = async () => {
    setPermissionError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${selectedComponentId}/contracts/${selectedVersion}/publish`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "发布被拦截：当前账户缺乏 [system:manage] 平台管理权限，无法发布合同！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `发布失败 (${res.status})`);
      }

      showToast("success", json.message || "合同已成功发布上线，历史快照已永久锁定！");
      await fetchContracts(selectedComponentId);
      await fetchContractDetail(selectedComponentId, selectedVersion);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "发布合同异常");
    }
  };

  // 触发归档确认
  const handleArchiveClick = () => {
    if (isArchived) {
      showToast("warning", "该版本已归档！");
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: `确认归档合同版本 [${selectedVersion}]？`,
      message:
        "【归档操作说明】：归档后该版本将标记为 [ARCHIVED]，不再可作为执行快照被 Studio 或外部任务执行，但历史审计记录将永久保留。是否确认归档？",
      type: "danger",
      confirmButtonClass: "bg-red-600 hover:bg-red-700 shadow-red-500/25",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await executeArchive();
      },
    });
  };

  // 执行归档
  const executeArchive = async () => {
    setPermissionError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${selectedComponentId}/contracts/${selectedVersion}/archive`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "归档被拦截：当前账户缺乏 [system:manage] 平台管理权限！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `归档失败 (${res.status})`);
      }

      showToast("success", json.message || "合同版本已成功归档！");
      await fetchContracts(selectedComponentId);
      await fetchContractDetail(selectedComponentId, selectedVersion);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "归档合同异常");
    }
  };

  // 查看不可变快照
  const handleViewSnapshot = async () => {
    try {
      const res = await fetch(
        `/api/components/${selectedComponentId}/contract-snapshot?version=${selectedVersion}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "获取快照失败");
      }
      setSnapshotModalData(json.data);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "查看快照异常");
    }
  };

  // 选中的组件对象
  const currentComponentObj = components.find((c) => c.id === selectedComponentId);

  return (
    <div className="min-h-screen bg-[#f0f8ff] p-4 md:p-6 text-slate-800">
      {/* 1. 顶部导航与总控条 */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-slate-200 p-5 rounded-lg shadow-sm">
        <div className="flex items-center space-x-3">
          <Link
            href="/admin/components"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
            title="返回组件目录"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 rounded-lg bg-[#2b6cb0]/10 text-[#2b6cb0] flex items-center justify-center font-bold">
            <FileCode className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              组件合同工作台中枢
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-[#2b6cb0] font-normal border border-blue-200">
                不可变版本化持久层
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              组件业务输入 · 步骤编排 · 模型抽象能力需求 · 渲染与输出契约 · 真实数据库生命周期闭环
            </p>
          </div>
        </div>

        {/* 组件动态切换下拉与新建草稿按钮 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-300 rounded px-3 py-1.5">
            <span className="text-xs text-slate-500 mr-2 whitespace-nowrap">目标组件:</span>
            <select
              value={selectedComponentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              {components.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  [{comp.id}] {comp.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              // 自动推荐下一个小版本号
              if (contracts.length > 0) {
                const latest = contracts[0].contractVersion;
                const parts = latest.split(".").map(Number);
                if (parts.length === 3 && !parts.some(isNaN)) {
                  setNewVersionInput(`${parts[0]}.${parts[1] + 1}.0`);
                } else {
                  setNewVersionInput("1.0.0");
                }
              } else {
                setNewVersionInput("1.0.0");
              }
              setShowNewDraftModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2b6cb0] hover:bg-[#2b6cb0]/90 text-white rounded text-sm font-medium shadow-sm transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            创建新版本草稿
          </button>
        </div>
      </div>

      {/* 2. 权限拦截醒目警报（403 明确展示） */}
      {permissionError && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <h3 className="font-bold text-red-800">平台安全权限阻断 (403 Forbidden)</h3>
            <p className="text-red-700 mt-1">{permissionError}</p>
            <p className="text-xs text-red-500 mt-1">
              说明：依据 RBAC 架构规范，所有合同创建、修改、发布和归档操作必须具备 <code>system:manage</code> 权限。
            </p>
          </div>
        </div>
      )}

      {/* 3. 主 Bento 双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左栏：版本时光机 (4/12) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#2b6cb0]" />
              历史版本时间线 ({contracts.length})
            </h2>
            <button
              onClick={() => fetchContracts(selectedComponentId)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
              title="刷新版本"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingContracts ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loadingContracts ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center">
              <RefreshCw className="w-6 h-6 animate-spin mb-2 text-[#2b6cb0]" />
              正在从数据库拉取版本...
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              该组件暂无合同版本记录
              <div className="mt-3">
                <button
                  onClick={() => setShowNewDraftModal(true)}
                  className="text-[#2b6cb0] hover:underline"
                >
                  立即创建首个 DRAFT 草稿
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
              {contracts.map((item) => {
                const isSelected = item.contractVersion === selectedVersion;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedVersion(item.contractVersion)}
                    className={`p-3.5 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? "border-[#2b6cb0] bg-blue-50/40 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-800">
                          v{item.contractVersion}
                        </span>
                        {item.lifecycle === "PUBLISHED" && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            已发布 (Locked)
                          </span>
                        )}
                        {item.lifecycle === "DRAFT" && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Sliders className="w-3 h-3" />
                            草稿 (Draft)
                          </span>
                        )}
                        {item.lifecycle === "ARCHIVED" && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                            <Archive className="w-3 h-3" />
                            已归档
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1 mb-2">
                      {item.description || "无变更描述说明"}
                    </p>

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                      <div>输入: {item.contractSummary.inputKind}</div>
                      <div>产物: {item.contractSummary.outputKind}</div>
                      <div>步骤数: {item.contractSummary.executionStepCount} 步</div>
                      <div>计费: {item.contractSummary.billingMode}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右栏：合同配置与操作中枢 (8/12) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          {!selectedVersion || !currentContract ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              请从左侧选择一个版本进行查看或编辑，或点击上方创建新版本。
            </div>
          ) : (
            <div>
              {/* 版本操作条 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-800">
                      版本 v{selectedVersion}
                    </h2>
                    {isPublished && (
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        已发布锁定 · 历史快照保护中
                      </span>
                    )}
                    {isDraft && (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                        草稿状态 · 允许编辑与校验
                      </span>
                    )}
                    {isArchived && (
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-300 font-semibold">
                        已归档 · 仅供历史溯源
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    所属组件：[{currentComponentObj?.id}] {currentComponentObj?.name}
                    {currentVersionMeta?.publishedAt && (
                      <span className="ml-2">
                        发布时间：{new Date(currentVersionMeta.publishedAt).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>

                {/* 操作动作集合 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleValidateLocally}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition flex items-center gap-1"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                    格式校验
                  </button>

                  {isDraft && (
                    <>
                      <button
                        onClick={handleSaveDraft}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-sm transition active:scale-[0.98]"
                      >
                        保存草稿修改
                      </button>
                      <button
                        onClick={handlePublishClick}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition flex items-center gap-1.5 active:scale-[0.98]"
                      >
                        <Send className="w-3.5 h-3.5" />
                        校验并发布上线
                      </button>
                    </>
                  )}

                  {isPublished && (
                    <button
                      onClick={handleViewSnapshot}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-medium transition flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      查看不可变快照
                    </button>
                  )}

                  {!isArchived && (
                    <button
                      onClick={handleArchiveClick}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded text-xs font-medium transition flex items-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      归档
                    </button>
                  )}
                </div>
              </div>

              {/* 校验与诊断反馈条目 */}
              {validationSuccess && (
                <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>校验通过：合同结构严谨，无模型硬编码绑定，无非法代码或敏感字段。</span>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded text-xs">
                  <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    校验诊断不通过 ({validationErrors.length} 项错误)：
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-700 pl-1">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 编辑与视图切换 Tab */}
              <div className="flex items-center border-b border-slate-200 mb-4 gap-4">
                <button
                  onClick={() => setActiveTab("visual")}
                  className={`pb-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                    activeTab === "visual"
                      ? "border-[#2b6cb0] text-[#2b6cb0]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  结构化配置概览
                </button>
                <button
                  onClick={() => setActiveTab("json")}
                  className={`pb-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                    activeTab === "json"
                      ? "border-[#2b6cb0] text-[#2b6cb0]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  JSON 契约源码编辑 {isDraft ? "(可编辑)" : "(只读)"}
                </button>
              </div>

              {/* 结构化配置视图 */}
              {activeTab === "visual" && (
                <div className="space-y-4">
                  {/* 输入模式卡片 */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#2b6cb0]" />
                      1. 输入合同约束 (Input Contract)
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">输入模式</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.input.kind}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">是否必填</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.input.textConstraints?.required ? "是" : "否"}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">字符长度区间</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.input.textConstraints?.minLength ?? 0} ~{" "}
                          {currentContract.input.textConstraints?.maxLength ?? "不限"}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">文件接收格式</span>
                        <span className="font-semibold text-slate-800 truncate block">
                          {currentContract.input.fileConstraints?.acceptedMimes?.join(", ") ||
                            "未启用文件"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 执行计划卡片 */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      2. 执行计划与模型能力要求 (Execution Plan Steps)
                    </h3>
                    <div className="space-y-2">
                      {currentContract.executionPlan.steps.map((step, idx) => (
                        <div
                          key={step.stepId || idx}
                          className="bg-white p-3 rounded border border-slate-200 text-xs"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-800">
                              #{idx + 1} {step.name} ({step.stepId})
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              模板: {step.promptTemplateVersion} · 超时: {step.timeoutMs}ms
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-2">
                            <span className="text-[11px] text-slate-500">所需抽象能力:</span>
                            {step.requiredCapabilities.map((cap) => (
                              <span
                                key={cap}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-[#2b6cb0] border border-blue-200"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                          <div className="bg-slate-50 p-2 rounded font-mono text-[11px] text-slate-700 line-clamp-3">
                            {step.promptTemplate}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 输出规范卡片 */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-600" />
                      3. 输出规范与渲染引擎 (Output & Renderer)
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">产物形态</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.output.kind}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">渲染器类型</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.output.rendererType}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">MIME 类型</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.output.artifactMime}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">支持预览 / 下载</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.output.previewable ? "可预览" : "不可预览"} ·{" "}
                          {currentContract.output.downloadable ? "可下载" : "不可下载"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 计费声明 */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      4. 计费声明策略 (Billing Policy)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">计费模式声明</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.billingPolicy.mode}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">预估 Token 数</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.billingPolicy.estimatedTokens ?? 0}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[11px]">底线服务点数</span>
                        <span className="font-semibold text-slate-800">
                          {currentContract.billingPolicy.minServiceFeePoints ?? 0} 算力点
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* JSON 源码直接编辑 */}
              {activeTab === "json" && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>
                      {isDraft
                        ? "直接编辑纯领域合同 JSON（保存前建议先点击格式校验）："
                        : "当前为已发布/已归档版本，JSON 处于完全只读保护锁定状态："}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(contractJsonText);
                        showToast("info", "合同 JSON 已复制至剪贴板");
                      }}
                      className="text-[#2b6cb0] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      复制 JSON
                    </button>
                  </div>
                  <textarea
                    rows={22}
                    value={contractJsonText}
                    readOnly={!isDraft}
                    onChange={(e) => setContractJsonText(e.target.value)}
                    className={`w-full font-mono text-xs p-3.5 rounded border focus:outline-none focus:ring-1 focus:ring-[#2b6cb0] leading-relaxed ${
                      isDraft
                        ? "bg-white border-slate-300 text-slate-800"
                        : "bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed"
                    }`}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. 创建新草稿模态弹窗 */}
      {showNewDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Plus className="w-5 h-5 text-[#2b6cb0]" />
              创建组件合同新版本草稿
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              为组件 [{currentComponentObj?.id}] {currentComponentObj?.name} 创建新的 DRAFT 版本。
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  语义化版本号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例如: 1.0.0 或 1.1.0"
                  value={newVersionInput}
                  onChange={(e) => setNewVersionInput(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#2b6cb0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  变更说明描述
                </label>
                <input
                  type="text"
                  placeholder="例如: 升级 Prompt 并扩展输出必填章节"
                  value={newDescriptionInput}
                  onChange={(e) => setNewDescriptionInput(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#2b6cb0]"
                />
              </div>

              {contracts.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    id="cloneCheckbox"
                    checked={cloneFromLatest}
                    onChange={(e) => setCloneFromLatest(e.target.checked)}
                    className="rounded text-[#2b6cb0] focus:ring-0"
                  />
                  <label htmlFor="cloneCheckbox">基于当前选定版本内容进行克隆初始化</label>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewDraftModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateDraftSubmit}
                disabled={submittingDraft}
                className="px-4 py-2 bg-[#2b6cb0] hover:bg-[#2b6cb0]/90 text-white rounded text-xs font-medium transition disabled:opacity-50"
              >
                {submittingDraft ? "正在创建..." : "确认创建草稿"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 不可变快照展示模态弹窗 */}
      {snapshotModalData && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-800">不可变合同快照明细</h3>
              </div>
              <button
                onClick={() => setSnapshotModalData(null)}
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
              >
                关闭
              </button>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              快照 ID: <span className="font-mono text-slate-800">{snapshotModalData.snapshotId}</span> · 生成时间: {snapshotModalData.snapshotCreatedAt}
            </div>

            <div className="flex-1 overflow-y-auto">
              <pre className="bg-slate-50 p-4 rounded text-[11px] font-mono text-slate-800 border border-slate-200 overflow-x-auto">
                {JSON.stringify(snapshotModalData, null, 2)}
              </pre>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSnapshotModalData(null)}
                className="px-4 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-xs"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 二次确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
