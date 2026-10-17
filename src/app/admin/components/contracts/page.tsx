"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileCode,
  Layers,
  Plus,
  Search,
  ChevronDown,
  GitCompare,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Archive,
  Trash2,
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
  Info,
  BarChart3,
  AlertTriangle,
  ExternalLink,
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
import { MODEL_CAPABILITY_LABELS } from "@/lib/model-capability-labels";
import { describeAcceptedMimes, describeMimeType } from "@/lib/fileConstraintsFormat";

interface ComponentItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  estimatedModelTokens: number | null;
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
  publishedByName: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  contractSummary: ContractSummary;
}

// 全局合同健康度总览数据类型（与后端 /api/admin/components/contracts/overview 对齐）
type ContractOverviewCategory = "PUBLISHED" | "DRAFT_ONLY" | "ARCHIVED_ONLY" | "NONE";
interface OverviewItem {
  componentId: string;
  componentName: string;
  category: ContractOverviewCategory;
  hasPublished: boolean;
  hasDraft: boolean;
  hasArchived: boolean;
  isActivePublished: boolean;
  publishedVersion: string | null;
  activeContractId: string | null;
}
type OverviewFilter = "ALL" | ContractOverviewCategory | "PUBLISHED_INACTIVE" | "EXECUTABLE";

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
      ruleDescription: "按组件实际执行算力点综合核算，不低于底线服务点数。",
    },
  };
}

/** 版本对比：单条字段差异 */
interface DiffChange {
  path: string;
  type: "added" | "removed" | "changed";
  oldValue?: string;
  newValue?: string;
}
function fmtVal(v: unknown): string {
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** 递归逐字段对比两个合同对象，产出新增/删除/修改清单 */
function diffObjects(a: unknown, b: unknown, path = "", out: DiffChange[] = []): DiffChange[] {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) out.push({ path: p, type: "added", newValue: fmtVal(b[k]) });
      else if (!(k in b)) out.push({ path: p, type: "removed", oldValue: fmtVal(a[k]) });
      else diffObjects(a[k], b[k], p, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`;
      if (i >= a.length) out.push({ path: p, type: "added", newValue: fmtVal(b[i]) });
      else if (i >= b.length) out.push({ path: p, type: "removed", oldValue: fmtVal(a[i]) });
      else diffObjects(a[i], b[i], p, out);
    }
    return out;
  }
  if (a !== b) out.push({ path, type: "changed", oldValue: fmtVal(a), newValue: fmtVal(b) });
  return out;
}

/** 语义化版本号倒序比较（用于版本时间线按版本号从新到旧排列，避免 1.0.10 被 1.0.2 压制） */
function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 合同枚举值 → 中文展示名（这些字段本就是枚举，不该把原始 code 直接甩给用户） */
const INPUT_KIND_LABELS: Record<string, string> = {
  TEXT: "文本",
  FILE: "单文件",
  MULTI_FILE: "多文件",
  TEXT_AND_FILES: "文本 + 文件",
  STRUCTURED_FORM: "结构化表单",
  UPSTREAM_ARTIFACT: "上游成果物",
};
const OUTPUT_KIND_LABELS: Record<string, string> = {
  DOCUMENT: "文档",
  TABLE: "表格",
  SCORE: "评分",
  TIMELINE: "时间线",
  JSON: "JSON 数据",
  FILE: "文件",
  DOCUMENT_PACKAGE: "文档包",
};
const RENDERER_LABELS: Record<string, string> = {
  MARKDOWN_DOCUMENT: "Markdown 文档",
  STRUCTURED_TABLE: "结构化表格",
  SCORE_CARD: "评分卡",
  TIMELINE_VIEW: "时间线视图",
  JSON_VIEWER: "JSON 查看器",
  FILE_DOWNLOAD: "文件下载",
  MULTI_TAB_PACKAGE: "多标签页文档包",
};
const BILLING_MODE_LABELS: Record<string, string> = {
  ESTIMATED_COMPATIBILITY: "估算兼容（按量预估）",
  REAL_SETTLEMENT_ELIGIBLE: "真实结算",
};
/** 取枚举中文名，未命中则原样返回（避免把没见过的值藏起来） */
function enumLabel(map: Record<string, string>, v?: string | null): string {
  if (!v) return "—";
  return map[v] || v;
}

/** 版本对比：把字段路径翻译成中文（数组下标保留），未命中保留原段 */
const DIFF_PATH_LABELS: Record<string, string> = {
  input: "输入",
  output: "输出",
  executionPlan: "执行计划",
  materialPipeline: "材料流水线",
  qualityPolicy: "质量策略",
  billingPolicy: "计费策略",
  steps: "步骤",
  kind: "类型",
  textConstraints: "文本约束",
  fileConstraints: "文件约束",
  rendererType: "渲染器",
  artifactMime: "MIME 类型",
  mode: "模式",
  minServiceFeePoints: "执行扣点（算力点）",
  requiredSections: "必填章节",
  requiredCapabilities: "所需能力",
  promptTemplate: "Prompt 模板",
  name: "名称",
  required: "是否必填",
  minLength: "最小长度",
  maxLength: "最大长度",
  previewable: "是否可预览",
  downloadable: "是否可下载",
};
function humanizePath(path: string): string {
  return path
    .split(".")
    .map((seg) => DIFF_PATH_LABELS[seg] ?? seg)
    .join(" › ");
}

/** 草稿可视化表单控件统一样式 */
const FIELD_LABEL_CLS = "text-slate-400 block text-[10px] font-bold mb-1";
const FIELD_INPUT_CLS =
  "w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-[#3182ce]";
const FIELD_SELECT_CLS = FIELD_INPUT_CLS + " cursor-pointer";

/** 材料处理步骤类型 → 中文 */
const MATERIAL_STEP_TYPE_LABELS: Record<string, string> = {
  TEXT_NORMALIZE: "文本规范化",
  DOCUMENT_PARSE: "文档解析",
  OCR: "OCR 识别",
  TABLE_EXTRACT: "表格提取",
  MATERIAL_MERGE: "材料合并",
  UPSTREAM_ARTIFACT_LOAD: "上游成果物加载",
};

/** 可增删改的字符串列表编辑器（用于必填章节、禁用词等） */
function StringListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v}
            onChange={(e) => onChange(values.map((x, xi) => (xi === i ? e.target.value : x)))}
            className={FIELD_INPUT_CLS}
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, xi) => xi !== i))}
            className="shrink-0 px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer"
          >
            移除
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder || "输入后回车 / 点添加"}
          className={FIELD_INPUT_CLS}
        />
        <button
          type="button"
          onClick={commit}
          className="shrink-0 px-2.5 py-1.5 text-[11px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
        >
          添加
        </button>
      </div>
    </div>
  );
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

  // 全局合同健康度总览状态
  const [overviewItems, setOverviewItems] = useState<OverviewItem[]>([]);
  const [overviewSummary, setOverviewSummary] = useState<{
    total: number;
    published: number;
    executable: number;
    draftOnly: number;
    archivedOnly: number;
    none: number;
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>("ALL");
  const [overviewListOpen, setOverviewListOpen] = useState(false);
  // 目标组件可搜索下拉、Prompt 全文展开、草稿弹窗内联报错
  const [compSearchOpen, setCompSearchOpen] = useState(false);
  const [compSearchQuery, setCompSearchQuery] = useState("");
  const [openPrompts, setOpenPrompts] = useState<Record<string, boolean>>({});
  const [draftFormError, setDraftFormError] = useState("");
  const compBoxRef = useRef<HTMLDivElement>(null);
  // 版本对比状态
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<DiffChange[] | null>(null);
  const [compareError, setCompareError] = useState("");
  // 批量发布 / 归档
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  // 0. 加载全局合同健康度总览（一次聚合全部组件状态）
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch("/api/admin/components/contracts/overview", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setPermissionError("获取合同总览失败：您缺少 [component:read] 管理员权限！");
        }
        throw new Error(`加载合同总览失败 (${res.status})`);
      }
      const json = await res.json();
      setOverviewItems(json.data?.items || []);
      setOverviewSummary(json.data?.summary || null);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "加载合同总览异常");
    } finally {
      setLoadingOverview(false);
    }
  }, [getAuthHeaders]);

  // 2. 加载选定组件的合同版本列表
  const fetchContracts = useCallback(async (compId: string) => {
    if (!compId) return;
    setLoadingContracts(true);
    // 立即清空旧组件的版本选择，杜绝「新组件 + 旧版本」的瞬时错配
    setSelectedVersion("");
    setCurrentContract(null);
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
      // 按语义化版本号倒序排列，保证时间线与“默认选中的最新版”始终正确
      const sorted = [...list].sort((a, b) => compareSemverDesc(a.contractVersion, b.contractVersion));
      setContracts(sorted);

      // 默认选中版本号最大的版本（最新版本）
      if (sorted.length > 0) {
        setSelectedVersion(sorted[0].contractVersion);
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

  // 0.5 进入页面即拉取全局合同健康度总览
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // 0.6 点击组件搜索下拉外部时自动收起
  useEffect(() => {
    if (!compSearchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (compBoxRef.current && !compBoxRef.current.contains(e.target as Node)) {
        setCompSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [compSearchOpen]);

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
    if (!selectedComponentId || !selectedVersion) return;
    // 防竞态守卫：仅当 (组件, 版本) 组合确实存在于已加载的合同列表时才拉取详情。
    // 否则切换组件瞬间会用「新组件 + 旧版本」发出 404 请求（曾弹出「合同版本 [1.0.2] 不存在」）
    const belongsToComponent = contracts.some(
      (c) => c.componentId === selectedComponentId && c.contractVersion === selectedVersion
    );
    if (belongsToComponent) {
      fetchContractDetail(selectedComponentId, selectedVersion);
    }
  }, [selectedComponentId, selectedVersion, contracts, fetchContractDetail]);

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
        return;
      }

      validateComponentContract(parsed);
      setValidationSuccess(true);
    } catch (err) {
      if (err instanceof ComponentContractError) {
        setValidationErrors([`[${err.code}] ${err.message}`]);
      } else {
        setValidationErrors([(err as Error).message]);
      }
    }
  };

  // 创建新草稿提交（校验/失败提示均在弹窗内联展示，不弹 toast）
  const handleCreateDraftSubmit = async () => {
    const version = newVersionInput.trim();
    setDraftFormError("");
    if (!version) {
      setDraftFormError("请输入语义化版本号（如 1.0.0）");
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      setDraftFormError("版本号必须符合语义化规范（例如 1.0.0、1.1.0）");
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
          setDraftFormError(msg);
          return;
        }
        setDraftFormError(json.error || `创建草稿失败 (${res.status})`);
        return;
      }

      showToast("success", json.message || "新版本草稿创建成功！");
      setShowNewDraftModal(false);
      setNewVersionInput("");
      setNewDescriptionInput("");
      setDraftFormError("");
      // 重新加载版本列表并选中新版本
      await fetchContracts(selectedComponentId);
      setSelectedVersion(version);
    } catch (err) {
      setDraftFormError(err instanceof Error ? err.message : "创建草稿异常");
    } finally {
      setSubmittingDraft(false);
    }
  };

  // 可视化表单 → 写回合同 JSON（复用同一 contractJsonText 真源，"保存草稿修改"按钮无需改动）
  const updateDraftContract = (mutator: (draft: ComponentContract) => void) => {
    let draft: ComponentContract | null = null;
    try {
      draft = JSON.parse(contractJsonText) as ComponentContract;
    } catch {
      draft = currentContract
        ? (JSON.parse(JSON.stringify(currentContract)) as ComponentContract)
        : null;
    }
    if (!draft) return;
    mutator(draft);
    setCurrentContract(draft);
    setContractJsonText(JSON.stringify(draft, null, 2));
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

  // 删除草稿（仅草稿可删，二次确认）
  const handleDeleteDraftClick = () => {
    if (!isDraft) {
      showToast("warning", "只有草稿版本可以删除！");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: `确认删除草稿版本 [${selectedVersion}]？`,
      message:
        "删除后该草稿版本将被永久移除，无法恢复。已发布 / 已归档版本不可删除。是否继续？",
      type: "danger",
      confirmButtonClass: "bg-red-600 hover:bg-red-700 shadow-red-500/25",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await executeDeleteDraft();
      },
    });
  };

  const executeDeleteDraft = async () => {
    setPermissionError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${selectedComponentId}/contracts/${selectedVersion}/delete`,
        { method: "POST", headers: getAuthHeaders() }
      );
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "删除被拦截：当前账户缺乏 [system:manage] 平台管理权限！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `删除失败 (${res.status})`);
      }
      showToast("success", json.message || "草稿版本已删除！");
      await fetchContracts(selectedComponentId);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "删除草稿异常");
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

  // 切换激活：将选中的「已发布」版本设为组件当前生效的执行合同
  const handleActivate = async () => {
    if (!isPublished) {
      showToast("warning", "只有已发布版本可以被激活为生效合同！");
      return;
    }
    setPermissionError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${selectedComponentId}/contracts/${selectedVersion}/activate`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          const msg = "激活被拦截：当前账户缺乏 [system:manage] 平台管理权限！";
          setPermissionError(msg);
          throw new Error(msg);
        }
        throw new Error(json.error || `激活失败 (${res.status})`);
      }
      showToast("success", json.message || "已切换为当前生效合同版本！");
      // 刷新列表/总览，并保持当前激活的版本仍处于选中态
      await fetchContracts(selectedComponentId);
      setSelectedVersion(selectedVersion);
      await fetchOverview();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "激活合同异常");
    }
  };

  // 批量选择切换
  const toggleBulkSelect = (ver: string) => {
    setBulkSelected((prev) => (prev.includes(ver) ? prev.filter((v) => v !== ver) : [...prev, ver]));
  };

  // 选中版本的档案信息，以及各动作「真正可执行」的部分（避免对已归档版本点归档、对已发布版本点发布）
  const selectedVersionRecords = contracts.filter((c) => bulkSelected.includes(c.contractVersion));
  const bulkPublishable = selectedVersionRecords.filter((c) => c.lifecycle === "DRAFT");
  // 归档是给「已发布版本退役」用的：草稿应删除而非归档，生效中的版本禁止归档
  const bulkArchivable = selectedVersionRecords.filter((c) => c.lifecycle === "PUBLISHED" && !c.isActive);

  // 批量执行发布/归档（仅执行符合条件的版本，逐次调用既有单版本接口，汇总成败与跳过数）
  const runBulk = async (action: "publish" | "archive", versions: string[]) => {
    if (versions.length === 0) return;
    setBulkBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const ver of versions) {
      try {
        const res = await fetch(
          `/api/admin/components/${selectedComponentId}/contracts/${ver}/${action}`,
          { method: "POST", headers: getAuthHeaders() }
        );
        if (res.ok) ok++;
        else failures.push(ver);
      } catch {
        failures.push(ver);
      }
    }
    const skipped = bulkSelected.length - versions.length;
    setBulkBusy(false);
    setBulkSelected([]);
    await fetchContracts(selectedComponentId);
    await fetchOverview();
    const label = action === "publish" ? "发布" : "归档";
    if (failures.length === 0) {
      const skipText = skipped > 0 ? `，${skipped} 个不符合条件已跳过` : "";
      showToast("success", `批量${label}完成：${ok} 个版本成功${skipText}`);
    } else {
      showToast("warning", `批量${label}：${ok} 成功，${failures.length} 失败（${failures.join("、")}）`);
    }
  };

  // 批量操作二次确认（只确认并执行符合条件的版本，弹窗内说明跳过原因）
  const confirmBulk = (action: "publish" | "archive") => {
    const eligible = action === "publish" ? bulkPublishable : bulkArchivable;
    if (eligible.length === 0) return;
    const label = action === "publish" ? "发布" : "归档";
    const skipped = bulkSelected.length - eligible.length;
    const skipHint =
      skipped > 0
        ? action === "publish"
          ? `\n\n其中 ${skipped} 个不是草稿版本（已发布/已归档不可再发布），将自动跳过。`
          : `\n\n其中 ${skipped} 个不是已发布状态（草稿 / 已归档 / 生效中不可归档），将自动跳过。`
        : "";
    setConfirmDialog({
      isOpen: true,
      title: `确认批量${label} ${eligible.length} 个版本？`,
      message:
        (action === "publish"
          ? "将逐次发布所选草稿版本；每次发布都会激活该版本，最终仅最后一个保持“生效中”。是否继续？"
          : "将逐次归档所选版本；归档后不再作为执行快照被调用，历史审计记录保留。是否继续？") + skipHint,
      type: action === "publish" ? "info" : "danger",
      confirmButtonClass:
        action === "publish" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await runBulk(
          action,
          eligible.map((c) => c.contractVersion)
        );
      },
    });
  };

  // 打开版本对比弹窗（默认：上一版 vs 最新版）
  const openCompareModal = () => {
    setCompareError("");
    setCompareResult(null);
    if (contracts.length >= 2) {
      setCompareA(contracts[1].contractVersion);
      setCompareB(contracts[0].contractVersion);
    } else if (contracts.length === 1) {
      setCompareA(contracts[0].contractVersion);
      setCompareB(contracts[0].contractVersion);
    }
    setShowCompareModal(true);
  };

  // 执行版本对比：拉取两份完整合同并逐字段 diff
  const runCompare = async () => {
    if (!compareA || !compareB || compareA === compareB) return;
    setCompareLoading(true);
    setCompareError("");
    setCompareResult(null);
    try {
      const [ra, rb] = await Promise.all([
        fetch(`/api/admin/components/${selectedComponentId}/contracts/${compareA}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`/api/admin/components/${selectedComponentId}/contracts/${compareB}`, {
          headers: getAuthHeaders(),
        }),
      ]);
      if (!ra.ok || !rb.ok) throw new Error("获取版本详情失败，无法对比");
      const [ja, jb] = await Promise.all([ra.json(), rb.json()]);
      const ca = ja.data?.contract;
      const cb = jb.data?.contract;
      if (!ca || !cb) throw new Error("版本合同数据缺失");
      // 剔除版本号、生命周期、发布时间/发布人等元信息，仅聚焦业务字段差异
      const strip = (obj: Record<string, unknown>) => {
        const copy = { ...obj };
        delete copy.contractVersion;
        delete copy.lifecycle;
        delete copy.publishedAt;
        delete copy.publishedBy;
        return copy;
      };
      setCompareResult(
        diffObjects(strip(ca as Record<string, unknown>), strip(cb as Record<string, unknown>))
      );
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "对比异常");
    } finally {
      setCompareLoading(false);
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

  // 真实执行扣点（算力点）：以组件目录 estimatedModelTokens 为权威真源，回退到合同声明值
  const execPoints: number | null =
    currentComponentObj?.estimatedModelTokens ??
    currentContract?.billingPolicy?.minServiceFeePoints ??
    null;

  // 目标组件搜索下拉的过滤结果（按 ID / 名称模糊匹配）
  const compQuery = compSearchQuery.trim().toLowerCase();
  const filteredComponents = compQuery
    ? components.filter(
        (c) => c.id.toLowerCase().includes(compQuery) || c.name.toLowerCase().includes(compQuery)
      )
    : components;

  // 总览筛选与配色映射（供下方全局总览区块复用）
  const filteredOverview =
    overviewFilter === "ALL"
      ? overviewItems
      : overviewFilter === "PUBLISHED_INACTIVE"
      ? overviewItems.filter((i) => i.category === "PUBLISHED" && !i.isActivePublished)
      : overviewFilter === "EXECUTABLE"
      ? overviewItems.filter((i) => i.isActivePublished)
      : overviewItems.filter((i) => i.category === overviewFilter);

  const toneMap: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
    blue: { bg: "bg-blue-50", text: "text-[#3182ce]", border: "border-blue-200", dot: "bg-[#3182ce]" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
    slate: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-6 text-slate-800">
      {/* 1. 顶部导航与总控条 */}
      <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/90 backdrop-blur-md border border-slate-200/80 p-5 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
              组件合同工作台中枢
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] font-bold border border-blue-100">
                不可变版本化持久层
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              组件业务输入 · 步骤编排 · 模型抽象能力需求 · 渲染与输出契约 · 真实数据库生命周期闭环
            </p>
          </div>
        </div>

        {/* 组件动态切换下拉与新建草稿按钮 */}
        <div className="flex items-center flex-wrap gap-2.5">
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
              setDraftFormError("");
              setShowNewDraftModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            创建新版本草稿
          </button>
        </div>
      </div>

      {/* 1.5 全局合同健康度总览 */}
      <div className={`mb-5 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-2xs relative ${compSearchOpen ? "z-30" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <BarChart3 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">组件合同健康度总览</h2>
              <p className="text-[10.5px] font-bold text-slate-500 mt-0.5">
                全部 {overviewSummary?.total ?? components.length} 个组件的合同配置状态 · 点击卡片筛选 · 点击组件直达下方配置
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOverviewListOpen((v) => !v)}
              className="px-2.5 py-1.5 text-[10px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              {overviewListOpen ? "收起组件列表" : `展开组件列表 (${overviewSummary?.total ?? components.length})`}
            </button>
            <button
              onClick={() => fetchOverview()}
              className="p-2 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
              title="刷新总览"
            >
              <RefreshCw className={`w-4 h-4 ${loadingOverview ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {loadingOverview && overviewItems.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-[11px] font-bold flex flex-col items-center">
            <RefreshCw className="w-5 h-5 animate-spin mb-2 text-[#3182ce]" />
            正在聚合全量组件合同状态...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {(() => {
                const s = overviewSummary || { total: 0, published: 0, executable: 0, draftOnly: 0, archivedOnly: 0, none: 0 };
                const cards = [
                  { key: "EXECUTABLE", label: "可执行", value: s.executable, desc: "已发布并激活生效", tone: "emerald" },
                  { key: "PUBLISHED_INACTIVE", label: "待激活", value: s.published - s.executable, desc: "有发布版未激活", tone: "blue" },
                  { key: "DRAFT_ONLY", label: "仅草稿", value: s.draftOnly, desc: "尚未发布·不可跑", tone: "amber" },
                  { key: "NONE", label: "无合同", value: s.none, desc: "高危·无法执行", tone: "rose" },
                  { key: "ARCHIVED_ONLY", label: "仅归档", value: s.archivedOnly, desc: "已失效退役", tone: "slate" },
                ] as const;
                return cards.map((c) => {
                  const t = toneMap[c.tone];
                  const active = overviewFilter === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setOverviewFilter((prev) => (prev === c.key ? "ALL" : c.key))}
                      className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        active ? `${t.border} ${t.bg} shadow-md` : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-black ${t.text}`}>{c.label}</span>
                        <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                      </div>
                      <div className={`text-2xl font-black mt-1 ${t.text}`}>{c.value}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-0.5 leading-tight">{c.desc}</div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* 目标组件选择区：可搜索下拉，替代一屏放不下的原生 select */}
            <div className="mt-4 pt-4 border-t border-slate-100 relative" ref={compBoxRef}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-slate-500">目标组件</span>
                <span className="text-[10px] font-bold text-slate-400">共 {components.length} 个 · 可按 ID / 名称搜索</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompSearchOpen((v) => !v);
                  setCompSearchQuery("");
                }}
                className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:border-[#3182ce]/50 transition-all cursor-pointer"
              >
                <span className="min-w-0 truncate text-left">
                  {currentComponentObj ? `[${currentComponentObj.id}] ${currentComponentObj.name}` : "请选择目标组件"}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${compSearchOpen ? "rotate-180" : ""}`} />
              </button>

              {compSearchOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-30">
                  <div className="p-2 border-b border-slate-100 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      autoFocus
                      value={compSearchQuery}
                      onChange={(e) => setCompSearchQuery(e.target.value)}
                      placeholder="搜索组件 ID 或名称..."
                      className="w-full text-xs text-slate-800 focus:outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <div className="max-h-[240px] overflow-y-auto p-1.5 space-y-0.5">
                    {filteredComponents.length === 0 ? (
                      <div className="py-6 text-center text-[11px] font-bold text-slate-400">无匹配组件</div>
                    ) : (
                      filteredComponents.map((comp) => {
                        const active = comp.id === selectedComponentId;
                        return (
                          <button
                            key={comp.id}
                            type="button"
                            onClick={() => {
                              setSelectedComponentId(comp.id);
                              setCompSearchOpen(false);
                              setCompSearchQuery("");
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer ${
                              active ? "bg-blue-50 text-[#3182ce]" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">[{comp.id}]</span>
                            <span className="min-w-0 truncate">{comp.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {overviewListOpen && (<>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                {overviewFilter === "ALL" ? `全部组件 (${filteredOverview.length})` : `筛选结果 (${filteredOverview.length})`}
              </span>
              {overviewFilter !== "ALL" && (
                <button
                  onClick={() => setOverviewFilter("ALL")}
                  className="text-[10px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                >
                  清除筛选
                </button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1.5">
              {filteredOverview.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-[11px] font-bold">该分类下暂无组件</div>
              ) : (
                filteredOverview.map((item) => {
                  const isActive = item.componentId === selectedComponentId;
                  const badge = item.isActivePublished
                    ? { label: "可执行", tone: "emerald" }
                    : item.category === "PUBLISHED"
                    ? { label: "待激活", tone: "blue" }
                    : item.category === "DRAFT_ONLY"
                    ? { label: "仅草稿", tone: "amber" }
                    : item.category === "NONE"
                    ? { label: "无合同", tone: "rose" }
                    : { label: "仅归档", tone: "slate" };
                  const bt = toneMap[badge.tone];
                  return (
                    <div
                      key={item.componentId}
                      onClick={() => setSelectedComponentId(item.componentId)}
                      className={`group flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? "border-[#3182ce] bg-blue-50/60 ring-1 ring-[#3182ce]/20"
                          : "border-slate-200 bg-white hover:border-[#3182ce]/40 hover:bg-blue-50/30"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${bt.dot}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">[{item.componentId}] {item.componentName}</div>
                          <div className="text-[9.5px] font-bold text-slate-400 truncate">
                            {item.isActivePublished
                              ? `已激活 v${item.publishedVersion}`
                              : item.category === "PUBLISHED"
                              ? `已发布 v${item.publishedVersion} · 待激活`
                              : item.category === "DRAFT_ONLY"
                              ? "仅有草稿版本"
                              : item.category === "NONE"
                              ? "尚未创建任何合同"
                              : "仅存归档版本"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${bt.bg} ${bt.text} ${bt.border}`}>
                          {badge.label}
                        </span>
                        <ExternalLink className={`w-3.5 h-3.5 ${isActive ? "text-[#3182ce]" : "text-slate-300 group-hover:text-[#3182ce]"}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </>)}
          </>
        )}
      </div>

      {/* 2. 权限拦截醒目警报（403 明确展示） */}
      {permissionError && (
        <div className="mb-5 bg-rose-50/90 border border-rose-200/80 p-4 rounded-2xl flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-4.5 h-4.5 text-rose-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-xs font-black text-rose-800">平台安全权限阻断 (403 Forbidden)</h3>
            <p className="text-[11px] font-bold text-rose-700 mt-1">{permissionError}</p>
            <p className="text-[10px] font-bold text-rose-400 mt-1">
              说明：依据 RBAC 架构规范，所有合同创建、修改、发布和归档操作必须具备 <code>system:manage</code> 权限。
            </p>
          </div>
        </div>
      )}

      {/* 3. 主工作区：左栏版本时间线吸顶，右栏详情自然铺开显示完整长内容 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左栏：版本时光机 (4/12) */}
        <div className="lg:col-span-4 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-2xs lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
            <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
              历史版本时间线 ({contracts.length})
            </h2>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <button
                onClick={openCompareModal}
                disabled={contracts.length < 2}
                className="px-2 py-1 text-[10px] font-black text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                title={contracts.length < 2 ? "至少需要两个版本才能对比" : "对比两个版本的合同差异"}
              >
                <GitCompare className="w-3 h-3" />
                版本对比
              </button>
              <button
                onClick={() => fetchContracts(selectedComponentId)}
                className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                title="刷新版本"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingContracts ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {bulkSelected.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 whitespace-nowrap overflow-x-auto">
              <span className="text-[11px] font-black text-amber-800 shrink-0">
                {bulkBusy ? "处理中..." : `已选 ${bulkSelected.length} 个`}
              </span>
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <button
                  type="button"
                  disabled={bulkBusy || bulkPublishable.length === 0}
                  onClick={() => confirmBulk("publish")}
                  title={
                    bulkPublishable.length === 0
                      ? "选中的版本里没有草稿（只有草稿可以发布）"
                      : `发布 ${bulkPublishable.length} 个草稿版本`
                  }
                  className="px-2.5 py-1 text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  批量发布{bulkPublishable.length > 0 ? ` (${bulkPublishable.length})` : ""}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy || bulkArchivable.length === 0}
                  onClick={() => confirmBulk("archive")}
                  title={
                    bulkArchivable.length === 0
                      ? "选中的版本里没有可归档的（仅已发布且非生效中的版本可归档）"
                      : `归档 ${bulkArchivable.length} 个已发布版本（草稿 / 生效中会自动跳过）`
                  }
                  className="px-2.5 py-1 text-[10px] font-black text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                >
                  <Archive className="w-3 h-3" />
                  批量归档{bulkArchivable.length > 0 ? ` (${bulkArchivable.length})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSelected([])}
                  className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-white rounded-lg cursor-pointer shrink-0"
                >
                  清空选择
                </button>
              </div>
            </div>
          )}

          {loadingContracts ? (
            <div className="py-12 text-center text-slate-400 text-[11px] font-bold flex flex-col items-center">
              <RefreshCw className="w-5 h-5 animate-spin mb-2 text-[#3182ce]" />
              正在从数据库拉取版本...
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-[11px] font-bold">
              该组件暂无合同版本记录
              <div className="mt-3">
                <button
                  onClick={() => {
                    setDraftFormError("");
                    setShowNewDraftModal(true);
                  }}
                  className="px-3 py-1.5 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-xl text-[11px] font-bold border border-blue-100 transition-all cursor-pointer"
                >
                  立即创建首个草稿
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] lg:max-h-none overflow-y-auto pr-1">
              {contracts.map((item) => {
                const isSelected = item.contractVersion === selectedVersion;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedVersion(item.contractVersion)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      bulkSelected.includes(item.contractVersion)
                        ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-300"
                        : isSelected
                        ? "border-[#3182ce] bg-gradient-to-br from-blue-50/80 to-white shadow-md shadow-blue-500/10 ring-1 ring-[#3182ce]/20"
                        : "border-slate-200 bg-white hover:border-[#3182ce]/40 hover:bg-blue-50/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <input
                          type="checkbox"
                          checked={bulkSelected.includes(item.contractVersion)}
                          onChange={() => toggleBulkSelect(item.contractVersion)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 text-amber-500 rounded border-slate-300 shrink-0 cursor-pointer"
                        />
                        <span className={`font-mono text-xs font-black ${isSelected ? "text-[#3182ce]" : "text-slate-800"}`}>
                          v{item.contractVersion}
                        </span>
                        {item.lifecycle === "PUBLISHED" && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5 whitespace-nowrap">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            已发布 · 锁定
                          </span>
                        )}
                        {item.lifecycle === "DRAFT" && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5 whitespace-nowrap">
                            <Sliders className="w-2.5 h-2.5" />
                            草稿可编辑
                          </span>
                        )}
                        {item.lifecycle === "ARCHIVED" && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-0.5 whitespace-nowrap">
                            <Archive className="w-2.5 h-2.5" />
                            已归档
                          </span>
                        )}
                        {item.isActive && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-[#3182ce]/10 text-[#3182ce] border border-[#3182ce]/30 flex items-center gap-0.5 whitespace-nowrap">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            生效中
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-[10.5px] font-medium text-slate-500 line-clamp-1 mb-2">
                      {item.description || "无变更描述说明"}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1 text-[9.5px] font-bold text-slate-500 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                      <div className="min-w-0 break-all">输入: <span className="text-slate-700">{enumLabel(INPUT_KIND_LABELS, item.contractSummary.inputKind)}</span></div>
                      <div className="min-w-0 break-all">产物: <span className="text-slate-700">{enumLabel(OUTPUT_KIND_LABELS, item.contractSummary.outputKind)}</span></div>
                      <div className="min-w-0 break-all">步骤: <span className="text-slate-700">{item.contractSummary.executionStepCount} 步</span></div>
                      <div className="min-w-0 break-all">计费: <span className="text-slate-700" title={`计费模式: ${item.contractSummary.billingMode}`}>{enumLabel(BILLING_MODE_LABELS, item.contractSummary.billingMode)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右栏：合同配置与操作中枢 (8/12) */}
        <div className="lg:col-span-8 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          {!selectedVersion || !currentContract ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              请从左侧选择一个版本进行查看或编辑，或点击上方创建新版本。
            </div>
          ) : (
            <div>
              {/* 版本操作条 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-black text-slate-900">
                      版本 v{selectedVersion}
                    </h2>
                    {isPublished && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        已发布锁定 · 快照保护中
                      </span>
                    )}
                    {currentVersionMeta?.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#3182ce]/10 text-[#3182ce] border border-[#3182ce]/30 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        当前生效中
                      </span>
                    )}
                    {isDraft && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                        草稿状态 · 允许编辑与校验
                      </span>
                    )}
                    {isArchived && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                        已归档 · 仅供历史溯源
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] font-bold text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="whitespace-nowrap">
                      所属组件：[{currentComponentObj?.id}] {currentComponentObj?.name}
                    </span>
                    {currentVersionMeta?.publishedAt && (
                      <span className="whitespace-nowrap">
                        发布时间：{new Date(currentVersionMeta.publishedAt).toLocaleString("zh-CN", { hour12: false })}
                      </span>
                    )}
                    {currentVersionMeta?.publishedByName && (
                      <span className="whitespace-nowrap">发布人：{currentVersionMeta.publishedByName}</span>
                    )}
                  </div>
                </div>

                {/* 操作动作集合 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleValidateLocally}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-[#3182ce]" />
                    格式校验
                  </button>

                  {isDraft && (
                    <>
                      <button
                        onClick={handleSaveDraft}
                        className="px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#3182ce] text-white rounded-xl text-[11px] font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95"
                      >
                        保存草稿修改
                      </button>
                      <button
                        onClick={handlePublishClick}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        校验并发布上线
                      </button>
                    </>
                  )}

                  {isPublished && (
                    <button
                      onClick={handleViewSnapshot}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      查看不可变快照
                    </button>
                  )}

                  {isPublished && !currentVersionMeta?.isActive && (
                    <button
                      onClick={handleActivate}
                      className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-[11px] font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      激活为生效版本
                    </button>
                  )}

                  {isDraft && (
                    <button
                      onClick={handleDeleteDraftClick}
                      title="删除该草稿版本（仅草稿可删，删除后不可恢复）"
                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除草稿
                    </button>
                  )}

                  {isPublished && !currentVersionMeta?.isActive && (
                    <button
                      onClick={handleArchiveClick}
                      title="将该已发布版本标记为归档，停止作为执行快照被调用"
                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      归档此版本
                    </button>
                  )}
                </div>
              </div>

              {/* 校验与诊断反馈条目 */}
              {validationSuccess && (
                <div className="mb-4 bg-emerald-50/90 border border-emerald-200/80 text-emerald-800 p-3 rounded-xl text-[11px] font-bold flex items-center gap-2 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>本地领域校验 100% 通过：合同结构与约束合法，无模型硬编码绑定。</span>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="mb-4 bg-amber-50/90 border border-amber-200/80 text-amber-900 p-3 rounded-xl text-[11px] shadow-2xs">
                  <div className="flex items-center gap-1.5 font-black text-amber-800 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    校验未通过（{validationErrors.length} 处，已定位到字段）：
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600 font-bold pl-1 max-h-40 overflow-y-auto">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="break-all">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 编辑与视图切换 Tab */}
              <div className="flex items-center border-b border-slate-100 mb-4 gap-4">
                <button
                  onClick={() => setActiveTab("visual")}
                  className={`pb-2 text-[11px] font-black transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                    activeTab === "visual"
                      ? "border-[#3182ce] text-[#3182ce]"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  结构化配置{isDraft ? "（可编辑）" : "概览"}
                </button>
                <button
                  onClick={() => setActiveTab("json")}
                  className={`pb-2 text-[11px] font-black transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                    activeTab === "json"
                      ? "border-[#3182ce] text-[#3182ce]"
                      : "border-transparent text-slate-400 hover:text-slate-700"
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
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                      1. 输入合同约束
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        <span className={FIELD_LABEL_CLS}>输入模式</span>
                        {isDraft ? (
                          <select
                            value={currentContract.input.kind}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.input.kind = e.target.value as ComponentContract["input"]["kind"];
                              })
                            }
                            className={FIELD_SELECT_CLS}
                          >
                            {Object.keys(INPUT_KIND_LABELS).map((k) => (
                              <option key={k} value={k}>
                                {INPUT_KIND_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {enumLabel(INPUT_KIND_LABELS, currentContract.input.kind)}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        <span className={FIELD_LABEL_CLS}>是否必填</span>
                        {isDraft ? (
                          <label className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!currentContract.input.textConstraints?.required}
                              onChange={(e) =>
                                updateDraftContract((d) => {
                                  d.input.textConstraints = {
                                    ...(d.input.textConstraints || {}),
                                    required: e.target.checked,
                                  };
                                })
                              }
                              className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                            />
                            必填
                          </label>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {currentContract.input.textConstraints?.required ? "是" : "否"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>字符长度区间</span>
                        {isDraft ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={currentContract.input.textConstraints?.minLength ?? 0}
                              onChange={(e) =>
                                updateDraftContract((d) => {
                                  d.input.textConstraints = {
                                    ...(d.input.textConstraints || { required: false }),
                                    minLength: parseInt(e.target.value) || 0,
                                  };
                                })
                              }
                              className={`${FIELD_INPUT_CLS} flex-1 min-w-0`}
                            />
                            <span className="text-slate-400">~</span>
                            <input
                              type="number"
                              value={currentContract.input.textConstraints?.maxLength ?? 0}
                              onChange={(e) =>
                                updateDraftContract((d) => {
                                  d.input.textConstraints = {
                                    ...(d.input.textConstraints || { required: false }),
                                    maxLength: parseInt(e.target.value) || 0,
                                  };
                                })
                              }
                              className={`${FIELD_INPUT_CLS} flex-1 min-w-0`}
                            />
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {currentContract.input.textConstraints?.minLength ?? 0} ~{" "}
                            {currentContract.input.textConstraints?.maxLength ?? "不限"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0 md:col-span-4">
                        <span className={FIELD_LABEL_CLS}>文件接收格式</span>
                        {isDraft ? (
                          <input
                            value={(currentContract.input.fileConstraints?.acceptedMimes || []).join(", ")}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                const list = e.target.value
                                  .split(/[,，、]/)
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                d.input.fileConstraints = {
                                  ...(d.input.fileConstraints || {
                                    required: false,
                                    maxCount: 10,
                                    maxSingleFileBytes: 10485760,
                                    maxTotalBytes: 52428800,
                                  }),
                                  acceptedMimes: list,
                                };
                              })
                            }
                            placeholder="如：.pdf, .docx, text/plain"
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 break-all block">
                            {describeAcceptedMimes(currentContract.input.fileConstraints?.acceptedMimes) ||
                              "未启用文件"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 执行计划卡片 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      2. 执行计划与模型能力要求
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    <div className="space-y-2">
                      {currentContract.executionPlan.steps.map((step, idx) => (
                        <div
                          key={step.stepId || idx}
                          className="bg-white p-3 rounded-lg border border-slate-200/80 text-[11px] shadow-2xs space-y-2"
                        >
                          {isDraft ? (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-2">
                                  <span className={FIELD_LABEL_CLS}>步骤名称（#{idx + 1}）</span>
                                  <input
                                    value={step.name}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        d.executionPlan.steps[idx].name = e.target.value;
                                      })
                                    }
                                    className={FIELD_INPUT_CLS}
                                  />
                                </div>
                                <div>
                                  <span className={FIELD_LABEL_CLS}>超时（ms）</span>
                                  <input
                                    type="number"
                                    value={step.timeoutMs}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        d.executionPlan.steps[idx].timeoutMs = parseInt(e.target.value) || 0;
                                      })
                                    }
                                    className={FIELD_INPUT_CLS}
                                  />
                                </div>
                              </div>
                              <div>
                                <span className={FIELD_LABEL_CLS}>所需抽象能力（逗号分隔）</span>
                                <input
                                  value={step.requiredCapabilities.join(", ")}
                                  onChange={(e) =>
                                    updateDraftContract((d) => {
                                      d.executionPlan.steps[idx].requiredCapabilities = e.target.value
                                        .split(/[,，、]/)
                                        .map((s) => s.trim())
                                        .filter(Boolean) as ComponentContract["executionPlan"]["steps"][number]["requiredCapabilities"];
                                    })
                                  }
                                  placeholder="如：TEXT_GENERATION, STRUCTURED_OUTPUT"
                                  className={FIELD_INPUT_CLS}
                                />
                              </div>
                              <div>
                                <span className={FIELD_LABEL_CLS}>Prompt 模板</span>
                                <textarea
                                  rows={8}
                                  value={step.promptTemplate}
                                  onChange={(e) =>
                                    updateDraftContract((d) => {
                                      d.executionPlan.steps[idx].promptTemplate = e.target.value;
                                    })
                                  }
                                  className={`${FIELD_INPUT_CLS} font-mono whitespace-pre-wrap`}
                                />
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    updateDraftContract((d) => {
                                      const arr = d.executionPlan.steps;
                                      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                    })
                                  }
                                  className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  上移
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentContract.executionPlan.steps.length - 1}
                                  onClick={() =>
                                    updateDraftContract((d) => {
                                      const arr = d.executionPlan.steps;
                                      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                                    })
                                  }
                                  className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  下移
                                </button>
                                <button
                                  type="button"
                                  disabled={currentContract.executionPlan.steps.length <= 1}
                                  onClick={() =>
                                    updateDraftContract((d) => {
                                      d.executionPlan.steps.splice(idx, 1);
                                    })
                                  }
                                  className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  删除步骤
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-bold text-slate-800" title={`步骤标识：${step.stepId}`}>
                                  #{idx + 1} {step.name}
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
                                    className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200"
                                  >
                                    {MODEL_CAPABILITY_LABELS[cap] || cap}
                                  </span>
                                ))}
                              </div>
                              <div
                                className={`bg-slate-50 p-2 rounded-lg font-mono text-[10.5px] text-slate-600 border border-slate-100 whitespace-pre-wrap break-all ${
                                  openPrompts[step.stepId || String(idx)] ? "" : "line-clamp-3"
                                }`}
                              >
                                {step.promptTemplate}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenPrompts((prev) => {
                                    const key = step.stepId || String(idx);
                                    return { ...prev, [key]: !prev[key] };
                                  })
                                }
                                className="mt-1 text-[10px] font-black text-[#3182ce] hover:underline cursor-pointer"
                              >
                                {openPrompts[step.stepId || String(idx)] ? "收起全文" : "展开全文"}
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() =>
                          updateDraftContract((d) => {
                            d.executionPlan.steps.push({
                              stepId: `step_${Date.now()}`,
                              name: "新步骤",
                              promptTemplateVersion: "v1",
                              promptTemplate: "",
                              inputMapping: {},
                              outputKey: "output",
                              contextBudgetTokens: 8000,
                              maxOutputTokens: 4000,
                              timeoutMs: 60000,
                              requiredCapabilities: [],
                            });
                          })
                        }
                        className="w-full py-2 text-[11px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer"
                      >
                        + 新增执行步骤
                      </button>
                    )}
                  </div>

                  {/* 输出规范卡片 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600" />
                      3. 输出规范与渲染引擎
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>产物形态</span>
                        {isDraft ? (
                          <select
                            value={currentContract.output.kind}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.output.kind = e.target.value as ComponentContract["output"]["kind"];
                              })
                            }
                            className={FIELD_SELECT_CLS}
                          >
                            {Object.keys(OUTPUT_KIND_LABELS).map((k) => (
                              <option key={k} value={k}>
                                {OUTPUT_KIND_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {enumLabel(OUTPUT_KIND_LABELS, currentContract.output.kind)}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0 md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>渲染器类型</span>
                        {isDraft ? (
                          <select
                            value={currentContract.output.rendererType}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.output.rendererType = e.target.value as ComponentContract["output"]["rendererType"];
                              })
                            }
                            className={FIELD_SELECT_CLS}
                          >
                            {Object.keys(RENDERER_LABELS).map((k) => (
                              <option key={k} value={k}>
                                {RENDERER_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800 block break-all" title={currentContract.output.rendererType}>
                            {enumLabel(RENDERER_LABELS, currentContract.output.rendererType)}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0 md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>MIME 类型</span>
                        {isDraft ? (
                          <input
                            value={currentContract.output.artifactMime}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.output.artifactMime = e.target.value;
                              })
                            }
                            placeholder="如：text/markdown"
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className="font-semibold text-slate-800" title={currentContract.output.artifactMime}>
                            {describeMimeType(currentContract.output.artifactMime)}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>支持预览 / 下载</span>
                        {isDraft ? (
                          <div className="flex flex-col gap-1 font-bold text-slate-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentContract.output.previewable}
                                onChange={(e) =>
                                  updateDraftContract((d) => {
                                    d.output.previewable = e.target.checked;
                                  })
                                }
                                className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                              />
                              可预览
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentContract.output.downloadable}
                                onChange={(e) =>
                                  updateDraftContract((d) => {
                                    d.output.downloadable = e.target.checked;
                                  })
                                }
                                className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                              />
                              可下载
                            </label>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {currentContract.output.previewable ? "可预览" : "不可预览"} ·{" "}
                            {currentContract.output.downloadable ? "可下载" : "不可下载"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 计费声明 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      4. 计费声明策略
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0">
                        <span className={FIELD_LABEL_CLS}>计费模式声明</span>
                        {isDraft ? (
                          <select
                            value={currentContract.billingPolicy.mode}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.billingPolicy.mode = e.target.value as ComponentContract["billingPolicy"]["mode"];
                              })
                            }
                            className={FIELD_SELECT_CLS}
                          >
                            {Object.keys(BILLING_MODE_LABELS).map((k) => (
                              <option key={k} value={k}>
                                {BILLING_MODE_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800 block break-all" title={currentContract.billingPolicy.mode}>
                            {enumLabel(BILLING_MODE_LABELS, currentContract.billingPolicy.mode)}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        <span className={FIELD_LABEL_CLS}>执行扣点（算力点）</span>
                        {isDraft ? (
                          <input
                            type="number"
                            min={0}
                            value={currentContract.billingPolicy.minServiceFeePoints ?? ""}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                const n = parseInt(e.target.value);
                                d.billingPolicy.minServiceFeePoints = Number.isNaN(n) ? undefined : n;
                              })
                            }
                            placeholder="如：120"
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className={`font-semibold ${execPoints ? "text-slate-800" : "text-amber-600"}`}>
                            {execPoints ? `${execPoints} 算力点 / 次` : "未配置"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0 md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>计费规则说明</span>
                        {isDraft ? (
                          <input
                            value={currentContract.billingPolicy.ruleDescription ?? ""}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                d.billingPolicy.ruleDescription = e.target.value;
                              })
                            }
                            placeholder="如：按组件目录固定扣点结算"
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 block break-all">
                            {currentContract.billingPolicy.minServiceFeePoints && currentContract.billingPolicy.ruleDescription
                              ? currentContract.billingPolicy.ruleDescription
                              : "按组件目录配置的固定扣点执行结算（算力点），未开启真实结算。"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 5. 材料处理流水线 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-600" />
                      5. 材料处理流水线
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    <div className="space-y-2">
                      {currentContract.materialPipeline.steps.map((ms, mi) => (
                        <div key={mi} className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                          {isDraft ? (
                            <div className="flex items-end gap-2">
                              <div className="flex-1 min-w-0">
                                <span className={FIELD_LABEL_CLS}>步骤名称</span>
                                <input
                                  value={ms.name}
                                  onChange={(e) =>
                                    updateDraftContract((d) => {
                                      d.materialPipeline.steps[mi].name = e.target.value;
                                    })
                                  }
                                  className={FIELD_INPUT_CLS}
                                />
                              </div>
                              <div className="w-44">
                                <span className={FIELD_LABEL_CLS}>处理类型</span>
                                <select
                                  value={ms.type}
                                  onChange={(e) =>
                                    updateDraftContract((d) => {
                                      d.materialPipeline.steps[mi].type = e.target.value as ComponentContract["materialPipeline"]["steps"][number]["type"];
                                    })
                                  }
                                  className={FIELD_SELECT_CLS}
                                >
                                  {Object.keys(MATERIAL_STEP_TYPE_LABELS).map((k) => (
                                    <option key={k} value={k}>
                                      {MATERIAL_STEP_TYPE_LABELS[k]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraftContract((d) => {
                                    d.materialPipeline.steps.splice(mi, 1);
                                  })
                                }
                                className="shrink-0 px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer"
                              >
                                移除
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="font-bold text-slate-800">{ms.name}</span>
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-bold">
                                {MATERIAL_STEP_TYPE_LABELS[ms.type] || ms.type}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      {isDraft && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftContract((d) => {
                              d.materialPipeline.steps.push({ name: "新处理步骤", type: "TEXT_NORMALIZE" });
                            })
                          }
                          className="w-full py-2 text-[11px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer"
                        >
                          + 新增材料处理步骤
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 6. 质量策略 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-600" />
                      6. 质量策略
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0">
                        <span className={FIELD_LABEL_CLS}>必填章节</span>
                        {isDraft ? (
                          <StringListEditor
                            values={currentContract.qualityPolicy.requiredSections || []}
                            onChange={(next) =>
                              updateDraftContract((d) => {
                                d.qualityPolicy.requiredSections = next;
                              })
                            }
                            placeholder="如：API 清单"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 break-all">
                            {(currentContract.qualityPolicy.requiredSections || []).join("、") || "无"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs min-w-0">
                        <span className={FIELD_LABEL_CLS}>禁用词 / 虚假承诺</span>
                        {isDraft ? (
                          <StringListEditor
                            values={currentContract.qualityPolicy.forbiddenPhrases || []}
                            onChange={(next) =>
                              updateDraftContract((d) => {
                                d.qualityPolicy.forbiddenPhrases = next;
                              })
                            }
                            placeholder="如：保过、100% 成功"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 break-all">
                            {(currentContract.qualityPolicy.forbiddenPhrases || []).join("、") || "无"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        <span className={FIELD_LABEL_CLS}>最小输出长度</span>
                        {isDraft ? (
                          <input
                            type="number"
                            min={0}
                            value={currentContract.qualityPolicy.minOutputLength ?? 0}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                const n = parseInt(e.target.value);
                                d.qualityPolicy.minOutputLength = Number.isNaN(n) ? undefined : n;
                              })
                            }
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {currentContract.qualityPolicy.minOutputLength ?? "不限"}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        <span className={FIELD_LABEL_CLS}>最大重试次数</span>
                        {isDraft ? (
                          <input
                            type="number"
                            min={0}
                            value={currentContract.qualityPolicy.maxRetryCount ?? 0}
                            onChange={(e) =>
                              updateDraftContract((d) => {
                                const n = parseInt(e.target.value);
                                d.qualityPolicy.maxRetryCount = Number.isNaN(n) ? undefined : n;
                              })
                            }
                            className={FIELD_INPUT_CLS}
                          />
                        ) : (
                          <span className="font-semibold text-slate-800">
                            {currentContract.qualityPolicy.maxRetryCount ?? 0}
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs md:col-span-2">
                        <span className={FIELD_LABEL_CLS}>审核开关</span>
                        {isDraft ? (
                          <div className="flex flex-wrap gap-4 font-bold text-slate-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentContract.qualityPolicy.allowAutoRetry}
                                onChange={(e) =>
                                  updateDraftContract((d) => {
                                    d.qualityPolicy.allowAutoRetry = e.target.checked;
                                  })
                                }
                                className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                              />
                              允许自动重试
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!currentContract.qualityPolicy.requireCitations}
                                onChange={(e) =>
                                  updateDraftContract((d) => {
                                    d.qualityPolicy.requireCitations = e.target.checked;
                                  })
                                }
                                className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                              />
                              要求引用来源
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={currentContract.qualityPolicy.requireHumanReview}
                                onChange={(e) =>
                                  updateDraftContract((d) => {
                                    d.qualityPolicy.requireHumanReview = e.target.checked;
                                  })
                                }
                                className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                              />
                              需人工复核
                            </label>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-800">
                            自动重试：{currentContract.qualityPolicy.allowAutoRetry ? "开" : "关"} · 引用：
                            {currentContract.qualityPolicy.requireCitations ? "要求" : "不要求"} · 人工复核：
                            {currentContract.qualityPolicy.requireHumanReview ? "需要" : "不需要"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 7. 结构化表单字段 */}
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                      7. 结构化表单字段
                      {isDraft && <span className="text-[9px] font-bold text-emerald-600 normal-case">（可编辑）</span>}
                    </h3>
                    {!currentContract.input.formConstraints ||
                    currentContract.input.formConstraints.fields.length === 0 ? (
                      isDraft ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraftContract((d) => {
                              d.input.formConstraints = {
                                fields: [
                                  { name: "field_1", label: "字段一", type: "string", required: false },
                                ],
                              };
                            })
                          }
                          className="w-full py-2 text-[11px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer"
                        >
                          + 新增第一个表单字段
                        </button>
                      ) : (
                        <div className="text-[11px] font-bold text-slate-400">未定义结构化表单字段</div>
                      )
                    ) : (
                      <div className="space-y-2">
                        {(currentContract.input.formConstraints?.fields || []).map((f, fi) => (
                          <div key={fi} className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                            {isDraft ? (
                              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                                <div className="sm:col-span-3">
                                  <span className={FIELD_LABEL_CLS}>字段名</span>
                                  <input
                                    value={f.name}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        if (d.input.formConstraints) d.input.formConstraints.fields[fi].name = e.target.value;
                                      })
                                    }
                                    className={FIELD_INPUT_CLS}
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <span className={FIELD_LABEL_CLS}>标签</span>
                                  <input
                                    value={f.label}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        if (d.input.formConstraints) d.input.formConstraints.fields[fi].label = e.target.value;
                                      })
                                    }
                                    className={FIELD_INPUT_CLS}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <span className={FIELD_LABEL_CLS}>类型</span>
                                  <select
                                    value={f.type}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        if (d.input.formConstraints)
                                          d.input.formConstraints.fields[fi].type = e.target.value as
                                            | "string"
                                            | "number"
                                            | "boolean"
                                            | "select"
                                            | "multiselect";
                                      })
                                    }
                                    className={FIELD_SELECT_CLS}
                                  >
                                    {["string", "number", "boolean", "select", "multiselect"].map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-2 flex items-center gap-1.5 pb-1.5">
                                  <input
                                    type="checkbox"
                                    checked={f.required}
                                    onChange={(e) =>
                                      updateDraftContract((d) => {
                                        if (d.input.formConstraints) d.input.formConstraints.fields[fi].required = e.target.checked;
                                      })
                                    }
                                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300"
                                  />
                                  <span className="text-[11px] font-bold text-slate-700">必填</span>
                                </div>
                                <div className="sm:col-span-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDraftContract((d) => {
                                        if (d.input.formConstraints) d.input.formConstraints.fields.splice(fi, 1);
                                      })
                                    }
                                    className="w-full px-2 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer"
                                  >
                                    删除字段
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                                <span className="font-bold text-slate-800">{f.label}</span>
                                <span className="font-mono text-slate-400">({f.name})</span>
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                                  {f.type}
                                </span>
                                {f.required && <span className="text-rose-500 font-bold">必填</span>}
                              </div>
                            )}
                          </div>
                        ))}
                        {isDraft && (
                          <button
                            type="button"
                            onClick={() =>
                              updateDraftContract((d) => {
                                d.input.formConstraints = d.input.formConstraints || { fields: [] };
                                d.input.formConstraints.fields.push({
                                  name: `field_${Date.now()}`,
                                  label: "新字段",
                                  type: "string",
                                  required: false,
                                });
                              })
                            }
                            className="w-full py-2 text-[11px] font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer"
                          >
                            + 新增表单字段
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* JSON 源码直接编辑 */}
              {activeTab === "json" && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-2">
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
                      className="text-[#3182ce] hover:bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
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
                    className={`w-full font-mono text-[11px] p-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#3182ce]/25 leading-relaxed transition-all ${
                      isDraft
                        ? "bg-white border-slate-200 text-slate-800 focus:border-[#3182ce]"
                        : "bg-slate-50/70 border-slate-200 text-slate-500 cursor-not-allowed"
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
          <div className="bg-white border border-slate-200/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              创建组件合同新版本草稿
            </h3>
            <p className="text-[11px] font-bold text-slate-500 mb-4">
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
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-[#3182ce]"
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
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-[#3182ce]"
                />
              </div>

              {contracts.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    id="cloneCheckbox"
                    checked={cloneFromLatest}
                    onChange={(e) => setCloneFromLatest(e.target.checked)}
                    className="rounded text-[#3182ce] focus:ring-0"
                  />
                  <label htmlFor="cloneCheckbox">基于当前选定版本内容进行克隆初始化</label>
                </div>
              )}
            </div>

            {draftFormError && (
              <div className="mt-3 mb-1 flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0">{draftFormError}</span>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewDraftModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:bg-slate-50 transition-all cursor-pointer active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateDraftSubmit}
                disabled={submittingDraft}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-[11px] font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
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
          <div className="bg-white border border-slate-200/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </span>
                <h3 className="text-base font-black text-slate-900">不可变合同快照明细</h3>
              </div>
              <button
                onClick={() => setSnapshotModalData(null)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>

            <div className="text-xs font-bold text-slate-600 mb-2">
              适用范围：[{currentComponentObj?.id ?? selectedComponentId}] {currentComponentObj?.name ?? "未知组件"} · 版本 v{selectedVersion}
            </div>
            <div className="text-xs text-slate-500 mb-3">
              快照 ID: <span className="font-mono text-slate-800">{snapshotModalData.snapshotId}</span> · 生成时间:{" "}
              {snapshotModalData.snapshotCreatedAt
                ? new Date(snapshotModalData.snapshotCreatedAt).toLocaleString("zh-CN", { hour12: false })
                : "—"}
            </div>

            {snapshotModalData.contract && !snapshotModalData.contract.executionPlan && (
              <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200/80 text-amber-800 rounded-xl px-3 py-2 text-[11px] font-bold">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  您当前看到的是<b>脱敏快照</b>（仅含公开的输入 / 输出元数据）。Prompt、材料流水线、质量策略、计费等内部字段需具备{" "}
                  <code className="font-mono">system:manage</code> 权限方可查看。
                </span>
              </div>
            )}

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

      {/* 6. 版本对比模态弹窗 */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <GitCompare className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">版本对比</h3>
                  <p className="text-[10px] font-bold text-slate-400">
                    [{currentComponentObj?.id}] {currentComponentObj?.name} · 仅对比业务字段，版本号/状态等元信息不参与
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>

            {/* 版本选择 */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">基准版本（旧）</label>
                <select
                  value={compareA}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompareA(v);
                    if (v === compareB) {
                      const fallback = contracts.map((c) => c.contractVersion).find((ver) => ver !== v);
                      if (fallback) setCompareB(fallback);
                    }
                  }}
                  className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:border-[#3182ce] cursor-pointer"
                >
                  {contracts
                    .filter((c) => c.contractVersion !== compareB)
                    .map((c) => (
                      <option key={c.id} value={c.contractVersion}>
                        v{c.contractVersion}
                        {c.isActive ? "（生效中）" : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="hidden sm:flex items-center justify-center text-slate-300 pb-2">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">对比版本（新）</label>
                <select
                  value={compareB}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompareB(v);
                    if (v === compareA) {
                      const fallback = contracts.map((c) => c.contractVersion).find((ver) => ver !== v);
                      if (fallback) setCompareA(fallback);
                    }
                  }}
                  className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl text-slate-800 bg-white focus:outline-none focus:border-[#3182ce] cursor-pointer"
                >
                  {contracts
                    .filter((c) => c.contractVersion !== compareA)
                    .map((c) => (
                      <option key={c.id} value={c.contractVersion}>
                        v{c.contractVersion}
                        {c.isActive ? "（生效中）" : ""}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={runCompare}
                disabled={compareLoading || compareA === compareB}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-[11px] font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 justify-center"
              >
                <GitCompare className="w-3.5 h-3.5" />
                {compareLoading ? "对比中..." : "开始对比"}
              </button>
            </div>

            {compareA === compareB && (
              <div className="mb-3 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                请选择两个不同的版本进行对比。
              </div>
            )}

            {/* 差异结果 */}
            <div className="flex-1 overflow-y-auto">
              {compareError && (
                <div className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {compareError}
                </div>
              )}
              {!compareError && compareLoading && (
                <div className="py-12 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#3182ce]" />
                  正在逐字段比对...
                </div>
              )}
              {!compareError && !compareLoading && compareResult && (
                compareResult.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    两个版本的合同内容完全一致，无差异。
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] font-black text-slate-500 mb-2">
                      共 <span className="text-[#3182ce]">{compareResult.length}</span> 处差异
                    </div>
                    <div className="space-y-1.5">
                      {compareResult.map((d, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-lg border text-[11px] ${
                            d.type === "added"
                              ? "bg-emerald-50/70 border-emerald-200"
                              : d.type === "removed"
                              ? "bg-rose-50/70 border-rose-200"
                              : "bg-amber-50/70 border-amber-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                d.type === "added"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : d.type === "removed"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {d.type === "added" ? "新增" : d.type === "removed" ? "删除" : "修改"}
                            </span>
                            <span className="font-bold text-slate-700 break-all" title={`字段路径：${d.path}`}>
                              {humanizePath(d.path)}
                            </span>
                          </div>
                          {(d.type === "changed" || d.type === "removed") && (
                            <div className="flex items-start gap-2 mb-1">
                              <span className="shrink-0 text-[9px] font-black text-rose-600 bg-rose-100 border border-rose-200 rounded px-1.5 py-0.5 leading-tight">
                                {d.type === "removed" ? "旧版本有" : "旧版本"}
                              </span>
                              <span className="text-rose-700 font-bold break-all min-w-0">{d.oldValue}</span>
                            </div>
                          )}
                          {(d.type === "changed" || d.type === "added") && (
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-[9px] font-black text-emerald-600 bg-emerald-100 border border-emerald-200 rounded px-1.5 py-0.5 leading-tight">
                                {d.type === "added" ? "新版本新增" : "新版本"}
                              </span>
                              <span className="text-emerald-700 font-bold break-all min-w-0">{d.newValue}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
              {!compareError && !compareLoading && !compareResult && (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">
                  选择版本后点击“开始对比”。
                </div>
              )}
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
