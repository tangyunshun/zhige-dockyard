"use client";

import React, { useState, useRef, useEffect } from "react";
import { Clipboard, FileDown, ChevronDown, BookOpen, Layers, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useToast } from "@/components/Toast";

export interface ResultViewerTask {
  id?: string;
  name: string;
  componentId?: string;
  componentName?: string;
  // 真实/模拟/未知执行状态仅来自嵌套 task.execution（渲染单轨取值，禁止顶层字段回退）
  // 注意：本 DTO 不再声明 tokenUsed / tokens 等跨单位含混字段；算力点只取自 execution.actualPoints / estimatedPoints
  refundStatus?: "NO_CHARGE" | "REFUNDED" | "REFUND_PENDING" | "RECONCILIATION_REQUIRED" | "UNKNOWN" | null;
  refundedPoints?: number | null;
  /** 三态：false=明确未扣费，true=明确发生扣费尝试，null/undefined=无法判断（严禁推断） */
  chargeAttempted?: boolean | null;
  /** 服务端真实错误码（详情接口返回，绝不前端臆造） */
  errorCode?: string | null;
  /** 服务端安全错误信息（详情接口返回，绝不返回内部堆栈/原始响应） */
  errorMessage?: string | null;
  /** 详情接口（task_detail）返回的顶层安全成果物，不含 storagePath / 原始输入 / prompt / 密钥 */
  artifacts?: Array<{
    id?: string | null;
    type?: string | null;
    title?: string | null;
    mimeType?: string | null;
    rendererType?: string | null;
    content?: string | Record<string, unknown> | null;
    previewable?: boolean;
    downloadable?: boolean;
  }> | null;
  /** 详情接口（task_detail）返回的单个主要成果物 */
  artifact?: RawArtifact | null;
  hasArtifact?: boolean;
  /** 历史合同安全视图：严格由任务自身 contractSnapshot 派生，无快照为 null，严禁按 componentId 补写业务标签 */
  contractView?: {
    contractVersion?: string | null;
    outputKind?: string | null;
    artifactMime?: string | null;
    rendererType?: string | null;
    qualityHints?: string[];
    disclaimer?: string | null;
    requireHumanReview?: boolean;
  } | null;
  execution?: {
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
    artifacts?: unknown[] | null;
    contractVersion?: string | null;
    qualityHints?: string[];
    hasContractSnapshot?: boolean;
    refundStatus?: "NO_CHARGE" | "REFUNDED" | "REFUND_PENDING" | "RECONCILIATION_REQUIRED" | "UNKNOWN" | null;
    refundedPoints?: number | null;
    chargeAttempted?: boolean;
    disclaimer?: string | null;
    requireHumanReview?: boolean;
  } | null;
  disclaimer?: string | null;
  requireHumanReview?: boolean;
  outputKind?: string | null;
  contract?: {
    disclaimer?: string | null;
    requireHumanReview?: boolean;
    outputKind?: string | null;
  } | null;
  notFound?: boolean;
  authError?: boolean;
  error?: string;
  status?: string;
  createdAt?: string | Date | number;
  time?: string;
  /** 详情接口返回的安全成果数据（历史结构可能为字符串/对象）；组件内部统一经 getEnhancedOutputData 收窄，禁止 any */
  outputData?: unknown;
}

export interface ResultViewerProps {
  task: ResultViewerTask | null;
  open?: boolean;
  onClose?: () => void;
  onSaveToKnowledge?: (task: ResultViewerTask) => void;
  embedded?: boolean; // 为 true 时作为主画布卡片嵌入，为 false 时作为 Modal 弹窗展示
}

const categoryCNMap: Record<string, string> = {
  BID_PREP: "商机售前",
  REQ_DESIGN: "需求与设计",
  BACKEND_CORE: "后端核心",
  DATABASE_ENG: "数据库工程",
  FRONTEND_DEV: "前端与交互",
  TEST_QA: "测试与质量",
  DEVOPS: "DevOps构建",
  SECURITY: "安全合规",
  PROJ_MGMT: "效能管理",
  KNOWLEDGE: "知识沉淀",
  REQUIREMENTS: "需求分析",
  DATA_BI: "数据工程",
  DOCUMENTATION: "研报文档",
  AI_AGENTS: "AI智能算力",
  COMMON: "通用研发",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 执行状态展示：缺失元数据不得显示为“模拟执行”；统一只读取 task.execution（嵌套安全 DTO），禁止两套字段混用 */
interface ExecLabelView {
  executionMode?: "REAL_MODEL" | "SIMULATED" | "UNKNOWN" | null;
  anomaly?: string | null;
  legacy?: boolean;
}
function execModeLabel(exec: ExecLabelView): { text: string; cls: string; title: string } {
  if (exec.executionMode === "REAL_MODEL") {
    if (exec.anomaly === "REAL_MODEL_META_INCOMPLETE") {
      return {
        text: "真实模型 · 数据异常",
        cls: "text-red-600",
        title: "真实模型执行但缺少 provider / usage / 合同版本，已进入审计",
      };
    }
    return { text: "真实模型", cls: "text-emerald-600", title: "真实模型执行" };
  }
  if (exec.executionMode === "SIMULATED") {
    return { text: "模拟执行", cls: "text-amber-600", title: "模拟执行（非真实模型）" };
  }
  if (exec.legacy) {
    return { text: "历史数据缺失", cls: "text-slate-500", title: "执行元数据引入前的旧任务，无执行模式记录" };
  }
  return { text: "执行信息缺失", cls: "text-red-600", title: "缺少 executionMode，禁止默认按模拟执行" };
}

interface RawArtifact {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  mimeType?: string | null;
  schemaVersion?: string | null;
  content?: string | Record<string, unknown> | null;
  previewable?: boolean;
  downloadable?: boolean;
  rendererType?: string | null;
}

/** 文本型（可整体以 Markdown 呈现）成果物类型，内部统一大写归一化比较 */
export const TEXT_ARTIFACT_TYPES = new Set(["DOCUMENT", "REPORT"]);
/** artifact.type 大小写归一化（内部比较必须大小写一致，不得因大小写差异误判类型） */
export function normArtifactType(t?: string | null): string | null {
  return typeof t === "string" && t.trim().length > 0 ? t.trim().toUpperCase() : null;
}

function listArtifacts(task: ResultViewerTask): RawArtifact[] {
  // 严格只消费详情接口顶层安全成果物（task_detail 返回），彻底停用 outputData.artifacts 回退
  const artifacts = task.artifacts;
  if (Array.isArray(artifacts) && artifacts.length > 0) return artifacts as RawArtifact[];
  if (task.artifact && typeof task.artifact === "object") return [task.artifact as RawArtifact];
  return [];
}

/**
 * 失败任务退款状态诚实化解析：
 * 100% 只消费服务端真实字段（refundStatus、refundedPoints、chargeAttempted），
 * 绝不根据任何错误码推断 NO_CHARGE 或 REFUNDED，缺失时一律显示待系统确认。
 */
export function getFailedTaskRefundInfo(task: ResultViewerTask): {
  statusText: string;
  badgeClass: string;
  detailText: string;
} {
  const refundStatus = task.refundStatus;
  const refundedPoints = task.refundedPoints;
  const chargeAttempted = task.chargeAttempted;

  if (refundStatus === "NO_CHARGE") {
    return {
      statusText: "未发生扣费",
      badgeClass: "text-slate-600 bg-slate-100 border-slate-300",
      detailText: chargeAttempted === false
        ? "服务端记录未触发计费尝试，未扣除算力点，未产生费用。"
        : "服务端记录未发生扣费，未产生费用。",
    };
  }

  if (refundStatus === "REFUNDED") {
    const pointsText = typeof refundedPoints === "number" && refundedPoints > 0
      ? `已原路退还 ${refundedPoints} 算力点。`
      : "已全额原路退还算力点。";
    return {
      statusText: "退款成功",
      badgeClass: "text-emerald-700 bg-emerald-50 border-emerald-300",
      detailText: `模型执行或质量校验未通过，${pointsText}`,
    };
  }

  if (refundStatus === "REFUND_PENDING") {
    return {
      statusText: "退款处理中",
      badgeClass: "text-amber-700 bg-amber-50 border-amber-300",
      detailText: "任务执行未通过，算力点退款正在处理中，已进入系统恢复队列。",
    };
  }

  if (refundStatus === "RECONCILIATION_REQUIRED") {
    return {
      statusText: "退款待对账",
      badgeClass: "text-rose-700 bg-rose-50 border-rose-300",
      detailText: "任务执行失败且自动退款异常，已记录待恢复账目，请联系管理员核对任务对账。",
    };
  }

  return {
    statusText: "退款状态待系统确认",
    badgeClass: "text-slate-600 bg-slate-100 border-slate-300",
    detailText: "失败任务已记录，未生成有效成果物。退款状态待系统确认，请稍后在账单流水查看或联系管理员。",
  };
}

/**
 * 防伪横幅与免责声明：
 * 严格只消费详情 DTO 认证字段 task.contractView.disclaimer / task.contractView.requireHumanReview；
 * 严禁回退 task.disclaimer / task.contract / task.outputData.disclaimer 等未经详情 DTO 认证的字段；
 * 严禁按 componentId / 组件名称 / 任务名称拼接业务专属文案；
 * 无可追溯合同视图时仅展示中性“合同不可追溯”提示，绝不臆造人工复核或业务专属免责声明。
 */
export function getDisclaimerBanner(task: ResultViewerTask): {
  title: string;
  content: string;
} {
  // 防伪声明严格只消费详情 DTO 认证字段 task.contractView.disclaimer / task.contractView.requireHumanReview；
  // 严禁回退 task.disclaimer / task.contract / task.outputData.disclaimer 等未经详情 DTO 认证的字段，绝不按 componentId 拼接业务文案。
  const serverDisclaimer = task.contractView?.disclaimer ?? null;
  const requireHumanReview = task.contractView?.requireHumanReview ?? false;
  const hasContractView = task.contractView != null;

  // 1) 合同视图存在且提供免责声明正文：原样展示该合同免责声明（标题按合同是否要求人工复核区分）
  if (hasContractView && serverDisclaimer && typeof serverDisclaimer === "string" && serverDisclaimer.trim()) {
    return {
      title: requireHumanReview ? "🛡️ 【AI 生成成果 · 待人工复核】" : "🛡️ 【AI 成果声明】",
      content: serverDisclaimer.trim(),
    };
  }

  // 2) 合同视图存在，但未下发免责声明正文：仅按合同是否要求人工复核给出中性提示，不臆造业务文案
  if (hasContractView) {
    if (requireHumanReview) {
      return {
        title: "🛡️ 【AI 生成结果 · 需人工复核】",
        content: "该任务绑定合同要求人工复核；合同未提供进一步免责声明文本。",
      };
    }
    return {
      title: "🛡️ 【AI 成果声明】",
      content: "该任务绑定合同未下发专用免责声明文本。",
    };
  }

  // 3) 无可追溯合同视图：仅展示合同不可追溯的中性提示，严禁出现人工复核或业务专属免责声明
  return {
    title: "🛡️ 【AI 生成结果】",
    content: "该任务未绑定可追溯合同视图，相关成果、免责与复核状态以服务端返回为准。",
  };
}

function toPretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 从结构化成果物内容中提取条目数组（兼容 items/entries/timeline/events/rows/... 包裹） */
function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["items", "entries", "timeline", "events", "rows", "scores", "records", "sections"]) {
      const v = (value as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v as unknown[];
    }
  }
  return null;
}

export function getDocumentArtifactContent(task: ResultViewerTask): string | null {
  const artifact = listArtifacts(task).find(
    (item) =>
      !!item?.type &&
      TEXT_ARTIFACT_TYPES.has(normArtifactType(item.type) ?? "") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0,
  );
  return artifact ? String(artifact.content) : null;
}

/** 按成果物真实类型渲染预览（SCORE / TIMELINE / TABLE / JSON / DOCUMENT_PACKAGE / FILE ...）。 */
function renderArtifactBody(artifact: RawArtifact): React.ReactNode {
  const content = artifact.content;
  // 结构化类型统一大小写归一化后再进入 renderer，避免 DOCUMENT/document 等同类型因大小写差异重复分支
  switch (normArtifactType(artifact.type) ?? "") {
    case "SCORE": {
      if (content && typeof content === "object" && !Array.isArray(content)) {
        const entries = Object.entries(content as Record<string, unknown>).filter(
          ([, v]) => typeof v === "number" || typeof v === "string",
        );
        if (entries.length > 0) {
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {entries.map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl bg-amber-50 border border-amber-200/80">
                  <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider break-all">{k}</div>
                  <div className="text-lg font-black text-amber-900 break-all">{String(v)}</div>
                </div>
              ))}
            </div>
          );
        }
      }
      return <pre className="whitespace-pre-wrap break-words text-xs bg-slate-50 rounded-xl p-3">{toPretty(content)}</pre>;
    }
    case "TIMELINE": {
      const items = asArray(content);
      if (items && items.length > 0) {
        return (
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {it && typeof it === "object" ? (
                    <>
                      <div className="font-bold text-slate-800 break-words">
                        {String((it as Record<string, unknown>).label ?? (it as Record<string, unknown>).title ?? (it as Record<string, unknown>).time ?? "")}
                      </div>
                      <div className="text-slate-600 whitespace-pre-wrap break-words">
                        {String((it as Record<string, unknown>).description ?? (it as Record<string, unknown>).detail ?? (it as Record<string, unknown>).text ?? toPretty(it))}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-700">{String(it)}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        );
      }
      return <pre className="whitespace-pre-wrap break-words text-xs bg-slate-50 rounded-xl p-3">{toPretty(content)}</pre>;
    }
    case "TABLE": {
      const rows = asArray(content);
      if (rows && rows.length > 0 && rows[0] && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
        const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
        return (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <span>📋 结构化表格数据（规则由 Schema 强约束校验；性能与命中率未经实际压测，不构成性能保证）</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                    {cols.map((c) => (
                      <th key={c} className="py-2.5 px-3.5">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium">
                  {rows.map((r: unknown, i: number) => (
                    <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                      {cols.map((c) => (
                        <td key={c} className="py-2.5 px-3.5 text-slate-600 break-words">
                          {String((r as Record<string, unknown>)[c] ?? "")}
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
      return (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-slate-500">
            原始结果（非结构化表格，按服务端返回原样展示，未伪装为成功结构化结果）
          </div>
          <pre className="whitespace-pre-wrap break-words text-xs bg-slate-50 rounded-xl p-3">{toPretty(content)}</pre>
        </div>
      );
    }
    case "DOCUMENT_PACKAGE":
    case "BUNDLE": {
      const items = asArray(content);
      if (items && items.length > 0) {
        return (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="font-bold text-slate-800 break-words">
                  {String(
                    it && typeof it === "object"
                      ? (it as Record<string, unknown>).name ?? (it as Record<string, unknown>).title ?? `条目 ${i + 1}`
                      : it,
                  )}
                </span>
              </li>
            ))}
          </ul>
        );
      }
      return <pre className="whitespace-pre-wrap break-words text-xs bg-slate-50 rounded-xl p-3">{toPretty(content)}</pre>;
    }
    default:
      return <pre className="whitespace-pre-wrap break-words text-xs bg-slate-50 rounded-xl p-3">{toPretty(content)}</pre>;
  }
}

/** 历史结构化结果中可能出现的偏离条目字段（仅展示用，不强约束业务键） */
export interface DeviationRow {
  item?: string;
  rfp?: string;
  actual?: string;
  risk?: string;
  [key: string]: unknown;
}

/** 兼容历史模拟任务的结构化结果读取；不再使用固定业务内容兜底。 */
export interface EnhancedOutputData {
  summary: string;
  conclusions: string[];
  deviations: DeviationRow[];
  risks: string[];
  advices: string[];
}

function getEnhancedOutputData(task: ResultViewerTask): EnhancedOutputData {
  const raw = (task.outputData ?? {}) as Record<string, unknown>;
  const asStringArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x): x is string => typeof x === "string") as string[]) : [];
  const asDeviationArr = (v: unknown): DeviationRow[] =>
    Array.isArray(v) ? (v.filter((x): x is DeviationRow => typeof x === "object" && x !== null) as DeviationRow[]) : [];
  return {
    summary: typeof raw.summary === "string" ? raw.summary : "暂无成果摘要。",
    conclusions: asStringArr(raw.conclusions),
    deviations: asDeviationArr(raw.deviations),
    risks: asStringArr(raw.risks),
    advices: asStringArr(raw.advices),
  };
}

export function ResultViewer({
  task,
  open = true,
  onClose,
  onSaveToKnowledge,
  embedded = false,
}: ResultViewerProps) {
  const toast = useToast();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!task || (!open && !embedded)) {
    return null;
  }

  const documentContent = getDocumentArtifactContent(task);
  const outputData = getEnhancedOutputData(task);
  // 结构化成果物（SCORE / TIMELINE / TABLE / JSON / DOCUMENT_PACKAGE / FILE ...）按真实类型渲染
  const structuredArtifacts = listArtifacts(task).filter(
    (a) => normArtifactType(a?.type) != null && !TEXT_ARTIFACT_TYPES.has(normArtifactType(a.type)!) && a.content != null,
  );
  // 输出类型判定：严格只采用任务自身历史合同快照安全视图 contractView.outputKind；
  // 没有 contractView.outputKind 时不得用 task.outputKind、componentId 或组件名称猜测输出类型。
  const hasContractView = !!task.contractView;
  const effectiveOutputKind = task.contractView?.outputKind ?? null;
  const isDocumentKind = effectiveOutputKind === "DOCUMENT";
  // 无 contractView 时不得渲染任何结构化/文档成功态（只显示“历史合同不可追溯”）
  const hasValidArtifact = hasContractView && (documentContent !== null || (!isDocumentKind && structuredArtifacts.length > 0));
  // 复制/导出/知识沉淀的唯一可导出判断（disabled 与点击处理器共用同一判断，禁止重复派生）：
  // 必须 SUCCESS + contractView 有效 + 合法非空成果物 + 非 403/404/500；否则绝不生成 Blob/复制/沉淀。
  const canUseArtifactActions = (): boolean =>
    task.status === "SUCCESS" &&
    hasContractView &&
    !task.notFound &&
    !task.authError &&
    hasValidArtifact;
  const structuredSection =
    structuredArtifacts.length > 0 ? (
      <div className="space-y-3">
        {structuredArtifacts.map((a, idx) => (
          <div key={a.id || idx} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-black uppercase">
                {a.type}
              </span>
              <span className="text-xs font-bold text-slate-800">{a.title || "成果物"}</span>
              {a.mimeType ? <span className="text-[10px] text-slate-400 font-mono">{a.mimeType}</span> : null}
              {a.schemaVersion ? (
                <span className="text-[10px] text-slate-400 font-mono">schema {a.schemaVersion}</span>
              ) : null}
            </div>
            {renderArtifactBody(a)}
          </div>
        ))}
      </div>
    ) : null;
  // 执行信息唯一数据源：详情 DTO 嵌套 execution。缺失时严格为空对象（不读任何顶层兼容字段，
  // 不推断真实或模拟）；execModeLabel 据此显示「执行信息缺失」。严禁 task.executionMode /
  // task.provider / task.usage / task.billingMode / task.estimatedPoints / task.actualPoints /
  // task.contractVersion / task.qualityHints 等顶层字段回退。
  const EMPTY_EXECUTION = {
    executionMode: "UNKNOWN" as const,
    anomaly: null,
    legacy: false,
    provider: null,
    model: null,
    usage: null,
    billingMode: null,
    estimatedPoints: null,
    actualPoints: null,
    contractVersion: null,
    qualityHints: [] as string[],
  };
  const exec = task.execution ?? EMPTY_EXECUTION;
  // 点数严格只读 task.execution（actualPoints / estimatedPoints），绝不回退任何顶层跨单位字段
  const pointsCost = exec.actualPoints ?? exec.estimatedPoints ?? 0;

  const rawCompId = (task.componentId || "").trim().toUpperCase();
  const displayBadgeTag = categoryCNMap[rawCompId] || (rawCompId.includes("_") ? "" : rawCompId);
  const displayCompName = task.componentName || categoryCNMap[rawCompId] || task.name;

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      toast.success("Markdown 内容已成功复制到剪贴板");
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Markdown 内容已成功复制到剪贴板");
    }
  };

  // 生成标准的 Markdown 内容
  const generateMarkdownContent = () => {
    if (documentContent !== null) return documentContent;

    const lines = [
      `# ${task.name} 结构化分析与决策报告`,
      `> 调度组件：${displayBadgeTag ? `[${displayBadgeTag}] ` : ""}${displayCompName}`,
      `> 执行算力消耗：${pointsCost} 算力点（ESTIMATED_COMPATIBILITY：按预估算力点扣减，未按真实 Token 精确结算）`,
      `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
      `\n## 💡 成果物摘要\n${outputData.summary}`,
    ];

    if (outputData.conclusions?.length) {
      lines.push(`\n## 📌 关键结论明细\n${outputData.conclusions.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}`);
    }

    if (outputData.deviations?.length) {
      lines.push(`\n## 📊 条款偏离分析与规范比对表\n| 条款项 | 标准规范要求 | 应答比对方案 | 偏离风险提示 |`);
      lines.push(`|---|---|---|---|`);
      outputData.deviations.forEach((d) => {
        lines.push(`| ${d.item} | ${d.rfp || ""} | ${d.actual || ""} | ${d.risk || ""} |`);
      });
    }

    if (outputData.risks?.length) {
      lines.push(`\n## 🚨 偏离风险排查清单\n${outputData.risks.map((r: string) => `- ⚠️ ${r}`).join("\n")}`);
    }

    if (outputData.advices?.length) {
      lines.push(`\n## 整改及设计优化建议\n${outputData.advices.map((a: string) => `- 💡 ${a}`).join("\n")}`);
    }

    return lines.join("\n");
  };

  // 1. 导出 Word (.doc / .docx)
  const handleExportWord = () => {
    try {
      setShowExportMenu(false);
      if (!canUseArtifactActions()) return;
      if (documentContent !== null) {
        const rawDocContent = `
          <html><head><meta charset='utf-8'><title>${escapeHtml(task.name)}</title></head>
          <body style="font-family: Microsoft YaHei, Arial, sans-serif; padding: 25px; line-height: 1.6;">
            <pre style="white-space: pre-wrap; font-family: Microsoft YaHei, Arial, sans-serif;">${escapeHtml(documentContent)}</pre>
          </body></html>
        `;
        const blob = new Blob([rawDocContent], { type: "application/msword;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${task.name}_成果文档.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`已成功导出成果文档：${task.name}_成果文档.doc`);
        return;
      }
      const docContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${task.name}</title></head>
        <body style="font-family: Microsoft YaHei, Arial, sans-serif; padding: 25px; line-height: 1.6;">
          <h2 style="color: #2b6cb0; border-bottom: 2px solid #3182ce; padding-bottom: 8px;">${task.name} - 结构化决策分析报告</h2>
          <p style="color: #4a5568;"><strong>调度组件：</strong>${displayBadgeTag ? `[${displayBadgeTag}] ` : ""}${displayCompName} &nbsp;|&nbsp; <strong>算力消耗：</strong>${pointsCost} 算力点</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;"/>
          
          <h3 style="color: #2d3748; background-color: #ebf8ff; padding: 8px 12px; border-left: 4px solid #3182ce;">💡 成果物摘要</h3>
          <p style="font-size: 14px; color: #2d3748;">${outputData.summary}</p>
          
          ${outputData.conclusions?.length ? `
            <h3 style="color: #2d3748;">📌 关键结论明细</h3>
            <ol style="font-size: 13px; color: #4a5568;">
              ${outputData.conclusions.map((c: string) => `<li>${c}</li>`).join("")}
            </ol>
          ` : ""}

          ${outputData.deviations?.length ? `
            <h3 style="color: #2d3748;">📊 条款偏离分析与规范比对表</h3>
            <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; font-size: 13px; border-color: #cbd5e0;">
              <tr style="background-color: #ebf8ff; color: #2b6cb0; text-align: left;">
                <th>条款项</th><th>标准规范要求</th><th>应答比对方案</th><th>偏离风险提示</th>
              </tr>
              ${outputData.deviations.map((d) => `
                <tr>
                  <td><strong>${d.item}</strong></td><td>${d.rfp || ""}</td><td>${d.actual || ""}</td><td style="color: #e53e3e; font-weight: bold;">${d.risk || ""}</td>
                </tr>
              `).join("")}
            </table>
          ` : ""}

          ${outputData.risks?.length ? `
            <h3 style="color: #c53030;">🚨 偏离风险排查清单</h3>
            <ul style="font-size: 13px; color: #9b2c2c;">
              ${outputData.risks.map((r: string) => `<li>⚠️ ${r}</li>`).join("")}
            </ul>
          ` : ""}

          ${outputData.advices?.length ? `
            <h3 style="color: #22543d;">整改及设计优化建议</h3>
            <ul style="font-size: 13px; color: #276749;">
              ${outputData.advices.map((a: string) => `<li>💡 ${a}</li>`).join("")}
            </ul>
          ` : ""}
        </body>
        </html>
      `;
      const blob = new Blob([docContent], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_结构化分析报告.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出可编辑 Word 文档报告：${task.name}_结构化分析报告.doc`);
    } catch (e) {
      toast.error("生成 Word 文档时发生异常");
    }
  };

  // 2. 导出 Excel 表格 (.xlsx / .csv)
  const handleExportExcel = () => {
    try {
      setShowExportMenu(false);
      if (!canUseArtifactActions()) return;
      let csvContent = "\uFEFF条款项,标准规范要求,应答比对方案,偏离风险提示\n";
      outputData.deviations.forEach((d) => {
        const item = `"${(d.item || "").replace(/"/g, '""')}"`;
        const rfp = `"${(d.rfp || "").replace(/"/g, '""')}"`;
        const actual = `"${(d.actual || "").replace(/"/g, '""')}"`;
        const risk = `"${(d.risk || "").replace(/"/g, '""')}"`;
        csvContent += `${item},${rfp},${actual},${risk}\n`;
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_偏离对照分析表.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出 Excel 表格文件：${task.name}_偏离对照分析表.csv`);
    } catch (e) {
      toast.error("生成 Excel 表格时发生异常");
    }
  };

  // 3. 导出 Markdown (.md)
  const handleExportMarkdownFile = () => {
    try {
      setShowExportMenu(false);
      if (!canUseArtifactActions()) return;
      const mdText = generateMarkdownContent();
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_分析报告.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出 Markdown 文件：${task.name}_分析报告.md`);
    } catch (e) {
      toast.error("导出 Markdown 文件异常");
    }
  };

  // 4. 导出 PDF 格式 (矢量打印预览)
  const handleExportPDF = () => {
    setShowExportMenu(false);
    if (!canUseArtifactActions()) return;
    toast.info("已调起标准 PDF 打印视窗，请选择“另存为 PDF”格式导出");
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // 复制 Markdown 全文本
  const handleCopyMarkdown = () => {
    if (!canUseArtifactActions()) return;
    copyToClipboard(generateMarkdownContent());
  };

  // 核心内容区渲染
  const renderViewerBody = () => (
    <div className="bg-white rounded-3xl w-full h-full shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden font-sans text-left">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-50 via-blue-50/30 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
            📄
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              {!hasValidArtifact && task.status === "SUCCESS" ? "任务成果物核查: " : "自动化解析报告: "}{task.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium flex-wrap">
              <span className="bg-blue-50 text-[#2b6cb0] font-mono font-black px-2 py-0.5 rounded border border-blue-100/80 inline-flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#3182ce]" />
                {displayBadgeTag || "分析组件"}
              </span>
              <span>·</span>
              <span className="font-bold text-slate-800">
                {displayCompName}
              </span>
              <span>·</span>
              {task.status && task.status !== "SUCCESS" ? (
                <span className="text-rose-600 font-bold" title={`结果状态：${task.status}`}>
                  ⚠️ 结果状态：{task.status}
                </span>
              ) : !hasValidArtifact ? (
                <span className="text-amber-600 font-bold" title="任务已完成但没有可查看的成果物">
                  ⚠️ 成果物缺失
                </span>
              ) : (
                <span className="text-emerald-600 font-bold">🟢 运行成功</span>
              )}
              <span>·</span>
              {exec.billingMode === "ESTIMATED_COMPATIBILITY" ? (
                <span className="text-amber-600 font-bold" title="按预估成本扣点，未按真实 Token 精确结算">
                  按预估成本扣点，未按真实 Token 精确结算
                </span>
              ) : (
                <span className="text-slate-400 font-mono">耗时算力: {pointsCost} 算力点</span>
              )}
              <span>·</span>
              <span className={`font-bold ${execModeLabel(exec).cls}`} title={execModeLabel(exec).title}>
                {execModeLabel(exec).text}
              </span>
              {exec.contractVersion ? (
                <>
                  <span>·</span>
                  <span className="font-mono text-slate-500" title="任务绑定的合同版本（后端唯一契约口径）">
                    合同 v{exec.contractVersion}
                  </span>
                </>
              ) : null}
              {exec.provider?.modelId ? (
                <>
                  <span>·</span>
                  <span className="font-mono text-slate-500" title="执行模型（REAL_MODEL 元数据）">
                    {exec.provider.modelId}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
            title="关闭"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs leading-relaxed text-slate-700 custom-scrollbar">
        {/* AI 生成建议与合规防伪醒目提示横幅：依真实组件业务分别展示专属防伪横幅 */}
        {(() => {
          const disclaimer = getDisclaimerBanner(task);
          return (
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3.5 shadow-xs text-amber-950 space-y-1">
              <div className="flex items-center gap-1.5 font-black text-xs text-amber-900">
                <span>{disclaimer.title}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                {disclaimer.content}
              </p>
            </div>
          );
        })()}

        {/* 消费历史任务实际绑定的服务端质量与限制提示（防拿最新目录覆盖历史） */}
        {(() => {
          const hints: string[] = exec.qualityHints ?? [];
          const isLegacy: boolean = exec.legacy ?? false;

          if (hints.length > 0) {
            return (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs text-blue-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900">
                  <span>💡 任务实际合同版本质量与使用限制</span>
                  {exec.contractVersion && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-800">
                      v{exec.contractVersion}
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-[11px] leading-relaxed text-blue-800">
                  {hints.map((hint, hIdx) => (
                    <p key={hIdx}>• {hint}</p>
                  ))}
                </div>
              </div>
            );
          }

          // 任务历史未记录不可变快照，展示标准追溯提示，不自行按组件 ID 补写兜底提示，也不使用当前目录数据覆盖
          return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-xs text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-700">
                <span>📋 历史执行版本提示状态</span>
              </div>
              <p className="text-[10.5px] leading-relaxed text-slate-500">
                该历史任务没有可追溯的合同质量提示
              </p>
            </div>
          );
        })()}

        {/* 核心产物呈现区：严格区分结果不存在、无权限、任务失败、成果存在、成果缺失 6 种明确状态 */}
        {task.notFound ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠️
            </div>
            <h4 className="text-sm font-black text-amber-900">结果不存在</h4>
            <p className="text-xs text-amber-700 max-w-md mx-auto leading-relaxed">
              未找到指定的任务执行结果记录，该任务可能已归档或尚未生成结果。
            </p>
          </div>
        ) : task.authError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
              🚫
            </div>
            <h4 className="text-sm font-black text-rose-900">暂无查看权限</h4>
            <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
              您当前没有权限查看该任务的成果物详情，需具备对应工作空间的成员或管理权限。
            </p>
          </div>
        ) : task.status === "FAILED" ? (
          (() => {
            const refundInfo = getFailedTaskRefundInfo(task);
            return (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
                  ✕
                </div>
                <h4 className="text-sm font-black text-red-900">任务执行失败，未生成有效成果物</h4>
                <p className="text-xs text-red-700 max-w-md mx-auto leading-relaxed">
                  {task.errorMessage || "模型执行或输出质量校验未通过，未生成有效成果物。"}
                </p>
                {/* 诚实化退款与账务反馈（100% 服务端真实字段） */}
                <div className="max-w-md mx-auto p-3 rounded-xl bg-white/90 border border-red-200/90 text-left space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700">退款/账务处理状态</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${refundInfo.badgeClass}`}>
                      {refundInfo.statusText}
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-slate-600">
                    {refundInfo.detailText}
                  </p>
                </div>
                <div className="text-[11px] font-mono text-red-500 bg-white/80 border border-red-200 rounded-lg p-2 max-w-sm mx-auto">
                  任务状态: 失败 (FAILED) · 错误码: {task.errorCode || "UNKNOWN"} · 执行模式: {exec.executionMode || "UNKNOWN"}
                </div>
              </div>
            );
          })()
        ) : !hasContractView ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto text-xl font-bold">📋</div>
            <h4 className="text-sm font-black text-slate-700">历史合同不可追溯</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              该任务没有可追溯的历史合同快照，无法安全确认输出类型与成果物，暂不渲染结构化或文档成功态。
            </p>
          </div>
        ) : documentContent !== null ? (
          <>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-4 border-b border-slate-100 pb-3 text-xs font-bold text-slate-500 flex items-center justify-between">
                {/* 服务端未提供安全业务标签时统一显示通用文档标题，严禁按 componentId 拼接业务专属标题 */}
                <span>DOCUMENT / Markdown 成果文档</span>
                <span className="text-[10px] text-slate-400 font-mono">DOCUMENT</span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-800">
                {documentContent}
              </pre>
            </article>
            {/* DOCUMENT 输出不渲染任何结构化提取卡片或 TABLE/JSON（依据 outputKind，非组件 ID） */}
            {!isDocumentKind && structuredSection}
          </>
        ) : !isDocumentKind && structuredSection ? (
          structuredSection
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-2">
            <div className="text-2xl">📦</div>
            <div className="text-xs font-bold text-slate-700">任务已完成但没有可查看的成果物，请联系管理员核查</div>
            <div className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
              任务已完成但没有可查看的成果物，请联系管理员核查。服务端未包含可查看的成果物文档或结构化产物数据，不得显示成功报告。
            </div>
          </div>
        )}
      </div>

      {/* Footer (沉淀到知识沉淀规范库、复制 Markdown、下拉选框导出) */}
      <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
        {(() => {
          // 复制/导出/知识沉淀禁用与点击共用同一判断 canUseArtifactActions()
          const artifactActionsEnabled = canUseArtifactActions();

          return (
            <>
              {onSaveToKnowledge ? (
                <button
                  type="button"
                  disabled={!artifactActionsEnabled}
                  onClick={() => {
                    if (canUseArtifactActions()) onSaveToKnowledge(task);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5"
                  title={!artifactActionsEnabled ? "任务失败或成果物缺失，无法沉淀至知识库" : "将本次分析决策成果一键沉淀存入【知识沉淀规范库】"}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>📖 沉淀至【知识沉淀规范库】</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {/* 复制 Markdown */}
                <button
                  type="button"
                  disabled={!artifactActionsEnabled}
                  onClick={handleCopyMarkdown}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-2xs"
                  title={!artifactActionsEnabled ? "任务失败或成果物缺失，无法复制" : "复制完整的全景 Markdown 文档"}
                >
                  <Clipboard className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>复制 Markdown</span>
                </button>

                {/* 下拉选择导出格式 Dropdown */}
                <div className="relative inline-block text-left" ref={dropdownRef}>
                  <button
                    type="button"
                    disabled={!artifactActionsEnabled}
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-4 py-2 bg-white hover:bg-blue-50/40 disabled:bg-slate-100 disabled:text-slate-400 text-[#3182ce] border border-blue-200 disabled:border-slate-200 text-xs font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-2xs"
                    title={!artifactActionsEnabled ? "任务失败或成果物缺失，无法导出" : "选择导出的文件格式"}
                  >
                    <FileDown className="w-4 h-4 text-[#3182ce]" />
                    <span>📥 导出报告</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#3182ce]" />
                  </button>

            {showExportMenu && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 z-[9999] animate-in zoom-in-95 duration-150 font-sans text-xs">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  选择导出的文件格式
                </div>
                
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="w-full text-left px-3.5 py-2 hover:bg-blue-50/60 text-slate-700 hover:text-[#2b6cb0] font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="block">导出 Word 文档 (.doc)</span>
                    <span className="text-[10px] text-slate-400 font-normal">支持在 Word 中自由二次编辑</span>
                  </div>
                </button>

                {documentContent === null && <button
                  type="button"
                  onClick={handleExportExcel}
                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-700 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block">导出 Excel 表格 (.csv)</span>
                    <span className="text-[10px] text-slate-400 font-normal">提取条款对照表格数据</span>
                  </div>
                </button>}

                <button
                  type="button"
                  onClick={handleExportMarkdownFile}
                  className="w-full text-left px-3.5 py-2 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Clipboard className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block">导出 Markdown (.md)</span>
                    <span className="text-[10px] text-slate-400 font-normal">标准 Markdown 格式纯文本</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-50/60 text-slate-700 hover:text-red-700 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Printer className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <span className="block">导出 PDF 矢量格式</span>
                    <span className="text-[10px] text-slate-400 font-normal">高清晰矢量格式可直接打印/保存</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  })()}

          {onClose && !embedded && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
            >
              关闭
            </button>
          )}
        </div>
      </div>
  );

  if (embedded) {
    return <div className="w-full h-full min-h-0 flex flex-col">{renderViewerBody()}</div>;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
      <div className="max-w-4xl w-full max-h-[85vh] h-full flex flex-col animate-in zoom-in-95 duration-200">
        {renderViewerBody()}
      </div>
    </div>
  );
}

export default ResultViewer;
