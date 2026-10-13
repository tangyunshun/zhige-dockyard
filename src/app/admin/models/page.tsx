"use client";

/**
 * 模型注册表管理（Phase 1）
 * 所有列表均来自后端 API，前端不硬编码任何供应商 / 模型清单。
 * 密钥不在此处展示，仅展示环境变量名。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Server,
  Boxes,
  Star,
  Plus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Coins,
  SlidersHorizontal,
  Layers,
  Settings,
  X,
  ExternalLink,
  Shield,
  Activity,
  Check,
  Loader2,
  Sliders,
  DollarSign,
  Zap,
  Trash2,
  TestTube,
  MoreHorizontal,
  Info,
  FileCheck,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { GlobalMarkupSync } from "./global-markup-sync";
import { formatPeriodSchedule } from "@/lib/period-schedule-text";

/** 加价率双模式折算：表单统一存「整数基点 bp」（1bp = 0.01%，1% = 100bp），显示层按所选模式折算 */
const bpsToPercentStr = (bps: string) => {
  const s = (bps ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(n / 100) : "";
};
const percentToBpsStr = (pct: string) => {
  const s = (pct ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(Math.round(n * 100)) : "";
};

/** 加价率模式分段单选（继承全局 / 百分比 / 基点 互斥）：值统一以整数基点落库，仅显示层折算 */
export type MarkupMode3 = "inherit" | "percent" | "bps";
function MarkupModeSwitch({
  mode,
  onModeChange,
  disabled,
}: {
  mode: MarkupMode3;
  onModeChange: (m: MarkupMode3) => void;
  disabled?: boolean;
}) {
  const opts: Array<[MarkupMode3, string]> = [
    ["inherit", "继承全局"],
    ["percent", "按百分比 (%)"],
    ["bps", "按基点 (bps)"],
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-white p-0.5 border border-slate-200 shadow-2xs">
      {opts.map(([m, label]) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => onModeChange(m)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            mode === m ? "bg-[#3182ce] text-white shadow" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface ModelProvider {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string;
  apiKeyEnv: string;
  enabled: boolean;
  sortOrder: number;
  /** 运行时密钥配置状态：apiKeyEnv 为空时恒为 true（无需密钥）；非空时取决于 process.env 是否设置 */
  apiKeyConfigured?: boolean;
  /** 后台是否已录入密文钥匙（apiKeyCipher 非空） */
  hasApiKey?: boolean;
  /** 后端下发的脱敏钥匙串（前 6 + 后 4 局部明文，中间掩码），完整明文永不下发 */
  apiKeyMasked?: string | null;
  /** 连通性健康状态：healthy 健康 | error 异常 | unknown 未探测（由「测试连接」更新） */
  health?: string;
  /** 最近一次测试连接时间（ISO 字符串） */
  lastTestedAt?: string | null;
}

interface ModelDeployment {
  id: string;
  providerId: string;
  modelId: string;
  upstreamModel: string;
  displayName: string;
  contextLimit: number;
  /** 数据库声明的抽象能力（唯一真源为数据库，前端不维护任何固定能力表） */
  capabilities?: string[] | null;
  /** 价格唯一真源为 modelpricing（由部署列表接口一并返回） */
  pricing?: {
    currency: string;
    priceStatus: string;
    priceSource: string;
    priceVersion: number;
    costInputMicrosPerMillion: number | null;
    costOutputMicrosPerMillion: number | null;
    costCacheReadMicrosPerMillion: number | null;
    costCacheWriteMicrosPerMillion: number | null;
    priceInputMicrosPerMillion: number | null;
    priceOutputMicrosPerMillion: number | null;
    priceCacheReadMicrosPerMillion: number | null;
    priceCacheWriteMicrosPerMillion: number | null;
    /** 平台加价率（基点）；非空且无直配售价时，生效价 = 成本 × (1 + 加价率/10000) */
    markupRateBps?: number | null;
    /** 通用规则容器（多币种参考价、订阅积分抵扣系数、缓存存储标记等任意厂商特殊规则） */
    rules?: Record<string, unknown> | null;
  } | null;
  enabled: boolean;
}

/**
 * 判断某部署能否执行「通道测试」，并返回不可测的原因（null 表示可测）。
 * 规则与执行路径一致：供应商或模型任一被禁用，均不得发起测试性调用。
 */
function testBlockReason(d: ModelDeployment, providers: ModelProvider[]): string | null {
  const p = providers.find((pr) => pr.name === d.providerId);
  if (!p) return "所属供应商不存在，无法测试";
  if (!p.enabled) return `供应商通道「${p.name}」已禁用，无法执行通道测试（请先在供应商列表启用该通道）`;
  if (!d.enabled) return `模型部署「${d.providerId}/${d.modelId}」已禁用，无法执行通道测试（请先启用该模型）`;
  if (!p.baseUrl || !d.upstreamModel) return "缺少 Base URL 或上游模型名，无法测试";
  if (p.apiKeyEnv && !p.apiKeyConfigured) return "供应商 API Key 未配置，无法测试";
  return null;
}
function canTestDeployment(d: ModelDeployment, providers: ModelProvider[]): boolean {
  return testBlockReason(d, providers) === null;
}

/** 价格状态 → 中文标签（界面不暴露英文状态码） */
function priceStatusLabel(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "已生效";
    case "CONFIRMED":
      return "已确认生效";
    case "OBSERVED_ONLY":
      return "仅观测";
    case "UNCONFIGURED":
      return "未配置";
    case "FREE":
      return "免费";
    default:
      return status || "未配置";
  }
}

/** 缓存存储标记 → 中文 */
function cacheStorageLabel(v: unknown): string {
  if (typeof v !== "string") return "—";
  if (v === "FREE_PROMOTIONAL") return "限时免费";
  if (v === "FREE") return "免费";
  if (v === "PAID") return "按量计费";
  return v;
}

/** 列表用的规则小结：用一组小标签概括已配置的规则，避免把原始 JSON 直接铺在列表里 */
function RulesSummaryChips({ rules }: { rules: Record<string, unknown> | null | undefined }) {
  if (!rules || typeof rules !== "object" || Object.keys(rules).length === 0) return null;
  const chips: string[] = [];
  if (rules.usd && typeof rules.usd === "object") chips.push("官网$价");
  if (typeof rules.cacheStorage === "string") chips.push(`缓存${cacheStorageLabel(rules.cacheStorage)}`);
  if (typeof rules.billingFormula === "string" && (rules.billingFormula as string).trim() !== "")
    chips.push("计费公式");
  if (rules.subscriptionPointDeduction) chips.push("积分抵扣");
  if (typeof rules.evidenceUrl === "string" && rules.evidenceUrl) chips.push("凭据已归档");
  const known = new Set(["usd", "usdRate", "cacheStorage", "billingFormula", "evidenceUrl", "subscriptionPointDeduction"]);
  const extra = Object.keys(rules).filter((k) => !known.has(k));
  if (extra.length) chips.push(extra.length === 1 ? `其他·${extra[0]}` : `其他规则×${extra.length}`);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((c) => (
        <span
          key={c}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-medium border border-slate-200"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/** 缓存价（元/百万）→ 展示串「缓存读 X / 写 Y」，无任何缓存价时返回 null */
function cacheCostText(
  cacheRead: number | null | undefined,
  cacheWrite: number | null | undefined,
): string | null {
  const hasRead = cacheRead != null;
  const hasWrite = cacheWrite != null;
  if (!hasRead && !hasWrite) return null;
  const r = hasRead ? `¥${(cacheRead! / 1_000_000).toFixed(2)}` : "—";
  const w = hasWrite ? `¥${(cacheWrite! / 1_000_000).toFixed(2)}` : "—";
  return `缓存读 ${r} / 写 ${w}`;
}

const inputCls =
  "w-full px-3 py-2 bg-white border border-slate-200/90 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all shadow-2xs";
const getInputCls = (hasError?: boolean, extra?: string) =>
  `w-full px-3 py-2 rounded text-xs font-medium text-slate-800 outline-none transition-all shadow-2xs ${
    hasError
      ? "bg-white border border-rose-300 placeholder:text-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
      : "bg-white border border-slate-200/90 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
  } ${extra || ""}`;
const btnCls =
  "px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

/** 价格规则(rules)结构化表单（覆盖 GLM 类常见字段；其余任意键走「自定义规则」键—值） */
interface RulesForm {
  usdInput: string;
  usdCacheRead: string;
  usdOutput: string;
  /** 汇率：1 USD = ¥?（参考用，配合 USD 参考价做对比） */
  usdRate: string;
  cacheStorage: string; // "" | FREE_PROMOTIONAL | FREE | PAID
  billingFormula: string;
  subAppliesTo: string;
  subPeakInput: string;
  subPeakOutput: string;
  subPeakCacheRead: string;
  subIdleInput: string;
  subIdleOutput: string;
  subIdleCacheRead: string;
  subNote: string;
  /** 官方价目凭据归档：官方定价页 / 公告截图的链接（审计可追溯） */
  evidenceUrl: string;
  /** 其他自定义规则（任意键—值），用于未来模型扩展，无需手写 JSON */
  customRules: { key: string; value: string }[];
}
const emptyRulesForm: RulesForm = {
  usdInput: "",
  usdCacheRead: "",
  usdOutput: "",
  usdRate: "",
  cacheStorage: "",
  billingFormula: "",
  subAppliesTo: "",
  subPeakInput: "",
  subPeakOutput: "",
  subPeakCacheRead: "",
  subIdleInput: "",
  subIdleOutput: "",
  subIdleCacheRead: "",
  subNote: "",
  evidenceUrl: "",
  customRules: [],
};
const CACHE_STORAGE_OPTIONS: [string, string][] = [
  ["", "（不设置）"],
  ["FREE_PROMOTIONAL", "限时免费"],
  ["FREE", "免费"],
  ["PAID", "按量计费"],
];
/** 计费公式：用下拉选择，避免让用户手写难以理解的公式文本 */
const BILLING_FORMULA_OPTIONS: [string, string][] = [
  ["", "（不设置）"],
  ["standard_tokens", "标准 Token：输入 + 缓存命中 + 输出"],
  ["with_cache_storage", "含缓存存储：输入 + 缓存命中 + 输出 + 缓存存储费"],
  ["io_only", "仅输入 + 输出"],
  ["custom", "其他（自定义）"],
];
const r2s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** 将 rules 对象拆成结构化表单（已知键入结构化字段，未知键入 raw） */
function rulesToForm(rules: unknown): RulesForm {
  const f: RulesForm = { ...emptyRulesForm };
  if (!rules || typeof rules !== "object") return f;
  const r = rules as Record<string, unknown>;
  const usd = r.usd as Record<string, number> | undefined;
  if (usd && typeof usd === "object") {
    f.usdInput = r2s(usd.input);
    f.usdCacheRead = r2s(usd.cacheRead);
    f.usdOutput = r2s(usd.output);
  }
  if (typeof r.usdRate === "number" || typeof r.usdRate === "string") f.usdRate = r2s(r.usdRate);
  if (typeof r.cacheStorage === "string") f.cacheStorage = r.cacheStorage;
  if (typeof r.billingFormula === "string") f.billingFormula = r.billingFormula;
  if (typeof r.evidenceUrl === "string") f.evidenceUrl = r.evidenceUrl;
  const sub = r.subscriptionPointDeduction as Record<string, unknown> | undefined;
  if (sub && typeof sub === "object") {
    if (typeof sub.appliesTo === "string") f.subAppliesTo = sub.appliesTo;
    const peak = sub.peak as Record<string, number> | undefined;
    if (peak && typeof peak === "object") {
      f.subPeakInput = r2s(peak.input);
      f.subPeakOutput = r2s(peak.output);
      f.subPeakCacheRead = r2s(peak.cacheRead);
    }
    const idle = sub.idle as Record<string, number> | undefined;
    if (idle && typeof idle === "object") {
      f.subIdleInput = r2s(idle.input);
      f.subIdleOutput = r2s(idle.output);
      f.subIdleCacheRead = r2s(idle.cacheRead);
    }
    if (typeof sub.note === "string") f.subNote = sub.note;
  }
  const known = new Set(["usd", "usdRate", "cacheStorage", "billingFormula", "evidenceUrl", "subscriptionPointDeduction"]);
  f.customRules = Object.keys(r)
    .filter((k) => !known.has(k))
    .map((k) => ({ key: k, value: r2s(r[k]) }));
  return f;
}

/** 由结构化表单组装 rules 对象；校验非法数字，返回错误 */
function buildRulesFromForm(form: RulesForm): { ok: boolean; rules: Record<string, unknown> | null; error?: string } {
  let errMsg: string | undefined;
  const num = (v: string, label: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) {
      errMsg = `${label} 不是合法数字`;
      return null;
    }
    return n;
  };
  const usdInput = num(form.usdInput, "USD 输入");
  const usdCacheRead = num(form.usdCacheRead, "USD 缓存命中");
  const usdOutput = num(form.usdOutput, "USD 输出");
  const usdRate = num(form.usdRate, "汇率");
  const subPeakInput = num(form.subPeakInput, "高峰积分抵扣·输入");
  const subPeakOutput = num(form.subPeakOutput, "高峰积分抵扣·输出");
  const subPeakCacheRead = num(form.subPeakCacheRead, "高峰积分抵扣·缓存命中");
  const subIdleInput = num(form.subIdleInput, "空闲积分抵扣·输入");
  const subIdleOutput = num(form.subIdleOutput, "空闲积分抵扣·输出");
  const subIdleCacheRead = num(form.subIdleCacheRead, "空闲积分抵扣·缓存命中");
  if (errMsg) return { ok: false, rules: null, error: errMsg };

  // 解析自定义规则（键—值）：值自动识别为数字 / 布尔 / JSON 对象，否则按字符串
  const extra: Record<string, unknown> = {};
  for (const item of form.customRules) {
    const key = item.key.trim();
    const val = item.value.trim();
    if (!key || !val) continue;
    if (/^[-+]?\d+(\.\d+)?$/.test(val)) {
      extra[key] = Number(val);
    } else if (val === "true" || val === "false") {
      extra[key] = val === "true";
    } else if ((val.startsWith("{") && val.endsWith("}")) || (val.startsWith("[") && val.endsWith("]"))) {
      try {
        extra[key] = JSON.parse(val);
      } catch {
        extra[key] = val;
      }
    } else {
      extra[key] = val;
    }
  }

  const rules: Record<string, unknown> = { ...extra };
  if (usdInput != null || usdCacheRead != null || usdOutput != null) {
    rules.usd = { input: usdInput ?? 0, cacheRead: usdCacheRead ?? 0, output: usdOutput ?? 0 };
  }
  if (form.cacheStorage) rules.cacheStorage = form.cacheStorage;
  if (form.billingFormula.trim()) rules.billingFormula = form.billingFormula.trim();
  if (form.evidenceUrl.trim()) rules.evidenceUrl = form.evidenceUrl.trim();
  if (usdRate != null) rules.usdRate = usdRate;
  const subBlock: Record<string, unknown> = {};
  if (form.subAppliesTo.trim()) subBlock.appliesTo = form.subAppliesTo.trim();
  if (subPeakInput != null || subPeakOutput != null || subPeakCacheRead != null) {
    subBlock.peak = { input: subPeakInput ?? 0, output: subPeakOutput ?? 0, cacheRead: subPeakCacheRead ?? 0 };
  }
  if (subIdleInput != null || subIdleOutput != null || subIdleCacheRead != null) {
    subBlock.idle = { input: subIdleInput ?? 0, output: subIdleOutput ?? 0, cacheRead: subIdleCacheRead ?? 0 };
  }
  if (form.subNote.trim()) subBlock.note = form.subNote.trim();
  if (Object.keys(subBlock).length) rules.subscriptionPointDeduction = subBlock;
  // 全部为空时写入 null（清空规则），避免落库空对象 {}
  return { ok: true, rules: Object.keys(rules).length ? rules : null };
}

export default function AdminModelsPage() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [deployments, setDeployments] = useState<ModelDeployment[]>([]);
  // Part4：价格凭证确认记录 + 每日对账起点（仅展示，不含任何密钥）
  const [priceVoucherNote, setPriceVoucherNote] = useState<string | null>(null);
  const [reconciliationStartDate, setReconciliationStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // 部署行「⋯」更多操作菜单：fixed 定位锚定触发按钮视口坐标，避免被表格 overflow 裁剪
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    latencyMs: number;
    errorType?: string;
    label?: string;
    message?: string;
    troubleshooting?: string[];
    sampleReply?: string;
  } | null>(null);
  const toast = useToast();

  const testDeployment = async (d: ModelDeployment) => {
    setTestingId(d.id);
    setTestResult(null);
    try {
      const data = await authFetch(`/api/admin/model-deployments/${d.id}/test`, { method: "POST" });
      setTestResult({
        id: d.id,
        ok: data.success,
        latencyMs: data.latencyMs ?? 0,
        errorType: data.errorType,
        message: data.message || (data.success ? "连通正常" : "连通失败"),
        troubleshooting: data.troubleshooting,
        sampleReply: data.sampleReply,
      });
      requestAnimationFrame(() =>
        deploymentResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch {
      // 静默：结果以横幅展示，不弹 toast
    } finally {
      setTestingId(null);
    }
  };
  const testProvider = async (p: ModelProvider) => {
    setTestingId(p.id);
    setTestResult(null);
    try {
      const data = await authFetch(`/api/admin/model-providers/${p.id}/test`, { method: "POST" });
      setTestResult({
        id: p.id,
        ok: data.success,
        latencyMs: data.latencyMs ?? 0,
        errorType: data.errorType,
        message: data.message || (data.success ? "连通正常" : "连通失败"),
        troubleshooting: data.troubleshooting,
        sampleReply: data.sampleReply,
      });
      // 刷新供应商列表以同步 health / lastTestedAt
      void load();
      requestAnimationFrame(() =>
        providerResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch {
      // 静默：结果以横幅展示，不弹 toast
    } finally {
      setTestingId(null);
    }
  };

  // 测试结果横幅（供应商测试与部署测试共用 state，按结果 id 归属分别渲染在各自区块）
  const testResultBanner = testResult && (
    <div
      className={
        "mt-4 rounded border p-4 space-y-2 " +
        (testResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")
      }
    >
      <div className="flex items-center gap-2">
        {testResult.ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
        )}
        <span className={"text-xs font-black " + (testResult.ok ? "text-emerald-700" : "text-rose-700")}>
          {testResult.ok
            ? `测试通道连通成功（耗时 ${testResult.latencyMs}ms）`
            : `测试通道连通失败${testResult.label ? `（${testResult.label}）` : testResult.errorType ? `（${testResult.errorType}）` : ""}`}
        </span>
        {!testResult.ok && testResult.latencyMs != null && (
          <span className="text-[11px] text-rose-400 font-mono">耗时 {testResult.latencyMs}ms</span>
        )}
      </div>
      {testResult.ok && testResult.sampleReply && (
        <div className="text-[11px] text-slate-500 font-mono bg-white/70 rounded border border-emerald-100 px-2 py-1.5 break-words">
          模型回执：{testResult.sampleReply}
        </div>
      )}
      {!testResult.ok && testResult.message && (
        <div className="text-[11px] text-rose-600 font-medium break-words">
          <span className="font-black">错误详情：</span>
          {testResult.message}
        </div>
      )}
      {!testResult.ok && testResult.troubleshooting?.length ? (
        <div className="text-[11px] text-rose-600/90">
          <div className="font-black mb-1">如何修复：</div>
          <ul className="list-disc pl-4 space-y-1">
            {testResult.troubleshooting.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  // 测试结果横幅定位锚点（点击测试后平滑滚动到对应列表上方）
  const providerResultRef = useRef<HTMLDivElement>(null);
  const deploymentResultRef = useRef<HTMLDivElement>(null);

  // 平台默认模型（配置读取自数据库，前端不硬编码任何供应商/模型）
  const [platformDefault, setPlatformDefault] = useState<{
    deploymentId: string | null;
    deployment: { id: string; providerId: string; modelId: string } | null;
  } | null>(null);
  const [selectedDefault, setSelectedDefault] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);

  // 页面主工作台 Tab 切换（按业务顺位：policy: 平台默认与策略 | providers: 供应商通道 | deployments: 模型部署中枢）
  const [mainTab, setMainTab] = useState<"policy" | "providers" | "deployments">("policy");
  // 控制新增表单折叠与展开，避免直接占满首屏视口
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddDeployment, setShowAddDeployment] = useState(false);
  // 价格弹窗内部 Tab（base: 核心定价与加价 | periods: 分时定价策略 | rules: 官方参考与规则）
  const [priceModalTab, setPriceModalTab] = useState<"base" | "periods" | "rules">("base");
  // 部署列表过滤条件
  const [deploymentSearch, setDeploymentSearch] = useState("");
  const [deploymentProviderFilter, setDeploymentProviderFilter] = useState("ALL");
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState("ALL");

  // 供应商与部署列表分页状态（每页固定展示 5 条数据）
  const PAGE_SIZE = 5;
  const [providerPage, setProviderPage] = useState(1);
  const [deploymentPage, setDeploymentPage] = useState(1);

  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      if (deploymentProviderFilter !== "ALL" && d.providerId !== deploymentProviderFilter) return false;
      if (deploymentStatusFilter === "ENABLED" && !d.enabled) return false;
      if (deploymentStatusFilter === "DISABLED" && d.enabled) return false;
      if (deploymentSearch.trim()) {
        const q = deploymentSearch.trim().toLowerCase();
        const matchName = (d.displayName || "").toLowerCase().includes(q);
        const matchModel = (d.modelId || "").toLowerCase().includes(q);
        const matchUpstream = (d.upstreamModel || "").toLowerCase().includes(q);
        const matchProvider = (d.providerId || "").toLowerCase().includes(q);
        if (!matchName && !matchModel && !matchUpstream && !matchProvider) return false;
      }
      return true;
    });
  }, [deployments, deploymentProviderFilter, deploymentStatusFilter, deploymentSearch]);

  const pagedProviders = useMemo(() => {
    const start = (providerPage - 1) * PAGE_SIZE;
    return providers.slice(start, start + PAGE_SIZE);
  }, [providers, providerPage]);

  const pagedDeployments = useMemo(() => {
    const start = (deploymentPage - 1) * PAGE_SIZE;
    return filteredDeployments.slice(start, start + PAGE_SIZE);
  }, [filteredDeployments, deploymentPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(providers.length / PAGE_SIZE));
    if (providerPage > maxPage) setProviderPage(maxPage);
  }, [providers.length, providerPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredDeployments.length / PAGE_SIZE));
    if (deploymentPage > maxPage) setDeploymentPage(maxPage);
  }, [filteredDeployments.length, deploymentPage]);

  // Part4：拉取价格凭证确认记录与对账起点（用于「第 X 天 / 7 天」进度展示）
  useEffect(() => {
    authFetch("/api/admin/systemconfig-values")
      .then((r) => {
        const d = (r as { pricingPriceVoucherNote?: string; reconciliationStartDate?: string }) ?? {};
        setPriceVoucherNote(d.pricingPriceVoucherNote ?? null);
        setReconciliationStartDate(d.reconciliationStartDate ?? null);
      })
      .catch(() => {});
  }, []);

  // 「⋯」菜单打开期间：任意滚动（含表格容器内滚动）/窗口缩放时关闭，避免 fixed 锚点错位
  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [actionMenu]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(deployments.length / PAGE_SIZE));
    if (deploymentPage > maxPage) setDeploymentPage(maxPage);
  }, [deployments.length, deploymentPage]);

  // 全局二次确认弹窗状态（对齐全站其它管理页面规范，彻底替换原生 alert/confirm）
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    onConfirm: () => void | Promise<void>;
    type?: "danger" | "warning" | "info";
    confirmText?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "danger",
    confirmText: "确认删除",
  });

  // 供应商创建完成后的系统引导状态（提示下一步配置模型，支持一键直达或稍后配置）
  const [createdProviderGuidance, setCreatedProviderGuidance] = useState<{
    isOpen: boolean;
    providerName: string;
  }>({
    isOpen: false,
    providerName: "",
  });

  // 快捷从供应商直达模型部署并自动预填通道
  const goToDeployModelForProvider = useCallback((providerName: string) => {
    setCreatedProviderGuidance({ isOpen: false, providerName: "" });
    setMainTab("deployments");
    setShowAddDeployment(true);
    setDForm((prev) => ({
      ...prev,
      providerId: providerName,
    }));
    setTimeout(() => {
      const el = document.getElementById("deployment-input-modelId");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 120);
  }, []);

  const [pForm, setPForm] = useState({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "MODEL_API_KEY", apiKey: "" });
  const [pErrors, setPErrors] = useState<{ name?: string; baseUrl?: string; apiKeyEnv?: string }>({});

  const [dForm, setDForm] = useState({
    providerId: "",
    modelId: "",
    upstreamModel: "",
    displayName: "",
    contextLimit: "32000",
    capabilities: [] as string[],
  });
  const [dErrors, setDErrors] = useState<{ providerId?: string; modelId?: string; contextLimit?: string; capabilities?: string }>({});

  // 供应商编辑（name 为稳定标识，后端禁止改名；仅可改协议 / Base URL / 密钥环境变量）
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderName, setEditProviderName] = useState("");
  const [pEditForm, setPEditForm] = useState({ protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "", apiKey: "" });
  const [pEditErrors, setPEditErrors] = useState<{ baseUrl?: string; apiKeyEnv?: string }>({});
  // 供应商钥匙连通测试（复用模型注册表测试通道，真实发一次最小上游调用，明文密钥不出服务端）
  const [providerTest, setProviderTest] = useState<{ ok: boolean; latencyMs?: number; label?: string; message?: string } | null>(null);
  const [providerTesting, setProviderTesting] = useState(false);
  // 钥匙脱敏查看：眼睛开关（展示脱敏串 vs 圆点）；更换密钥模式
  const [showMaskedKey, setShowMaskedKey] = useState(false);
  const [replaceKeyMode, setReplaceKeyMode] = useState(false);
  const editingProvider = useMemo(
    () => providers.find((p) => p.id === editProviderId) ?? null,
    [providers, editProviderId],
  );

  // 部署编辑（providerId / modelId 为稳定标识，后端禁止改名；仅可改上游名 / 展示名 / 上下文）
  const [editDeploymentId, setEditDeploymentId] = useState<string | null>(null);
  const [editDeploymentMeta, setEditDeploymentMeta] = useState({ providerId: "", modelId: "" });
  const [dEditForm, setDEditForm] = useState({ upstreamModel: "", displayName: "", contextLimit: "32000" });
  const [dEditErrors, setDEditErrors] = useState<{ contextLimit?: string }>({});

  // 模型能力编辑：可选项全部由后端下发（唯一真源为后端能力白名单），前端不维护任何固定能力表。
  // 能力决定组件能否执行：部署声明的能力必须覆盖组件合同要求的全部能力，否则按钮显示「能力不满足（不可执行）」。
  const [capabilityOptions, setCapabilityOptions] = useState<
    { value: string; label: string; description: string }[]
  >([]);
  const [capabilityPanelId, setCapabilityPanelId] = useState<string | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<string[]>([]);
  const [capError, setCapError] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  // 上下文窗口：从权威公开模型目录实时获取，命中即写入并锁定只读，避免手工写错；未命中才允许手写
  const [ctxInfo, setCtxInfo] = useState<{
    loading: boolean;
    tried: boolean;
    found: boolean;
    contextLimit?: number;
    outputLimit?: number;
    source?: string;
    matchedKey?: string;
  }>({ loading: false, tried: false, found: false });

  const autoFetchContext = useCallback(
    async (modelId: string, upstreamModel?: string) => {
      const mid = (modelId || "").trim();
      const up = (upstreamModel || "").trim();
      if (!mid && !up) return;
      setCtxInfo((s) => ({ ...s, loading: true }));
      try {
        const qs = new URLSearchParams();
        qs.set("model", mid);
        if (up) qs.set("upstream", up);
        const body = await authFetch(`/api/admin/model-context?${qs.toString()}`);
        const d = (body?.data ?? {}) as {
          contextLimit?: number;
          outputLimit?: number;
          source?: string;
          matchedKey?: string;
        };
        const found = typeof d.contextLimit === "number";
        setCtxInfo({
          loading: false,
          tried: true,
          found,
          contextLimit: d.contextLimit,
          outputLimit: d.outputLimit,
          source: d.source,
          matchedKey: d.matchedKey,
        });
        if (found && d.contextLimit) {
          setDForm((f) => ({ ...f, contextLimit: String(d.contextLimit) }));
          setDErrors((prev) => ({ ...prev, contextLimit: undefined }));
        }
      } catch {
        setCtxInfo({ loading: false, tried: true, found: false });
      }
    },
    [authFetch],
  );

  // 编辑部署时同样的自动获取（独立状态，避免与新建表单互相干扰）
  const [ctxEditInfo, setCtxEditInfo] = useState<{
    loading: boolean;
    tried: boolean;
    found: boolean;
    contextLimit?: number;
    outputLimit?: number;
    source?: string;
    matchedKey?: string;
  }>({ loading: false, tried: false, found: false });

  const autoFetchEditContext = useCallback(async () => {
    const mid = (editDeploymentMeta.modelId || "").trim();
    const up = (dEditForm.upstreamModel || "").trim();
    if (!mid && !up) return;
    setCtxEditInfo((s) => ({ ...s, loading: true }));
    try {
      const qs = new URLSearchParams();
      qs.set("model", mid);
      if (up) qs.set("upstream", up);
      const body = await authFetch(`/api/admin/model-context?${qs.toString()}`);
      const d = (body?.data ?? {}) as { contextLimit?: number; outputLimit?: number; source?: string; matchedKey?: string };
      const found = typeof d.contextLimit === "number";
      setCtxEditInfo({
        loading: false,
        tried: true,
        found,
        contextLimit: d.contextLimit,
        outputLimit: d.outputLimit,
        source: d.source,
        matchedKey: d.matchedKey,
      });
      if (found && d.contextLimit) {
        setDEditForm((f) => ({ ...f, contextLimit: String(d.contextLimit) }));
        setDEditErrors({});
      }
    } catch {
      setCtxEditInfo({ loading: false, tried: true, found: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFetch, editDeploymentMeta.modelId, dEditForm.upstreamModel]);

  const applyPlatformDefault = useCallback((def: { deploymentId?: string | null; deployment?: unknown }) => {
    setPlatformDefault({
      deploymentId: def?.deploymentId ?? null,
      deployment: (def?.deployment as { id: string; providerId: string; modelId: string } | null) ?? null,
    });
    setSelectedDefault(def?.deploymentId ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 能力清单拉取失败（如无该权限）不得阻断整页加载，降级为空列表即可
      const [p, d, def, caps] = await Promise.all([
        authFetch("/api/admin/model-providers"),
        authFetch("/api/admin/model-deployments"),
        authFetch("/api/admin/model-deployments/default"),
        authFetch("/api/admin/model-capabilities").catch(() => ({ data: [] })),
      ]);
      setProviders(p.data || []);
      setDeployments(d.data || []);
      applyPlatformDefault(def);
      setCapabilityOptions(caps.data || []);
    } catch (e) {
      toast.error((e as Error)?.message || "加载模型注册表失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, applyPlatformDefault]);

  /** 保存成功后：只刷新「模型部署列表 + 平台默认模型状态」，不重复拉取供应商列表 */
  const refreshDeploymentsAndDefault = useCallback(async () => {
    const [d, def] = await Promise.all([
      authFetch("/api/admin/model-deployments"),
      authFetch("/api/admin/model-deployments/default"),
    ]);
    setDeployments(d.data || []);
    applyPlatformDefault(def);
  }, [authFetch, applyPlatformDefault]);

  /** 保存 / 清除平台默认模型；后端 403/409/400 的具体错误由 authFetch 原样抛出并展示 */
  const savePlatformDefault = async (deploymentId: string | null) => {
    setSavingDefault(true);
    try {
      await authFetch("/api/admin/model-deployments/default", {
        method: "PUT",
        body: JSON.stringify({ deploymentId }),
      });
      toast.success(deploymentId ? "平台默认模型已更新" : "平台默认模型已清除");
      await refreshDeploymentsAndDefault();
    } catch (e) {
      toast.error((e as Error)?.message || "保存平台默认模型失败");
    } finally {
      setSavingDefault(false);
    }
  };

  // 全局默认加价率（百分比），用于「继承全局」态的展示
  const [globalMarkupPercent, setGlobalMarkupPercent] = useState<number | null>(null);
  const loadGlobalMarkup = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/model-pricing/global-markup");
      if (res?.success) setGlobalMarkupPercent(res.data?.percent ?? null);
    } catch {
      // 静默忽略
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
    void loadGlobalMarkup();
  }, [load, loadGlobalMarkup]);

  const toggleProvider = (row: ModelProvider) => {
    if (row.enabled) {
      const activeCount = deployments.filter((d) => d.providerId === row.name && d.enabled).length;
      setConfirmDialog({
        isOpen: true,
        title: "禁用供应商通道",
        message: `确认禁用供应商通道「${row.name}」？`,
        warnings: [
          `禁用后，该通道下关联的 ${activeCount} 个已启用模型部署将立即全部失效，全站组件将无法使用这些模型。`,
          "已配置该供应商模型为默认策略的工作空间，任务执行将直接报错中断。",
        ],
        type: "warning",
        confirmText: "确认禁用",
        onConfirm: async () => {
          setBusy(`p:${row.id}`);
          try {
            await authFetch(`/api/admin/model-providers/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ enabled: false }),
            });
            // 局部无感更新，避免整页菊花白屏
            setProviders((prev) =>
              prev.map((p) => (p.id === row.id ? { ...p, enabled: false } : p))
            );
          } catch (e) {
            toast.error((e as Error)?.message || "操作失败");
          } finally {
            setBusy(null);
          }
        },
      });
    } else {
      void (async () => {
        setBusy(`p:${row.id}`);
        try {
          await authFetch(`/api/admin/model-providers/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: true }),
          });
          // 局部无感更新
          setProviders((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, enabled: true } : p))
          );
        } catch (e) {
          toast.error((e as Error)?.message || "操作失败");
        } finally {
          setBusy(null);
        }
      })();
    }
  };

  const toggleDeployment = (row: ModelDeployment) => {
    if (row.enabled) {
      setConfirmDialog({
        isOpen: true,
        title: "禁用模型部署",
        message: `确认禁用模型部署「${row.providerId}/${row.modelId}」？`,
        warnings: [
          "禁用后，全站所有依赖该模型的组件将立即拒绝执行，且系统不会自动回落环境变量。",
          platformDefault?.deploymentId === row.id
            ? "⚠️ 特别提醒：该模型当前被设为【平台默认模型】，禁用后没有单独设置模型的工作空间将无法执行模型任务！"
            : "若有工作空间模型策略将此模型设为默认，相关空间的执行任务也将受到影响。",
        ],
        type: "warning",
        confirmText: "确认禁用",
        onConfirm: async () => {
          setBusy(`d:${row.id}`);
          try {
            await authFetch(`/api/admin/model-deployments/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ enabled: false }),
            });
            // 局部无感更新，杜绝全屏菊花遮罩闪烁
            setDeployments((prev) =>
              prev.map((d) => (d.id === row.id ? { ...d, enabled: false } : d))
            );
          } catch (e) {
            toast.error((e as Error)?.message || "操作失败");
          } finally {
            setBusy(null);
          }
        },
      });
    } else {
      void (async () => {
        setBusy(`d:${row.id}`);
        try {
          await authFetch(`/api/admin/model-deployments/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: true }),
          });
          // 局部无感更新
          setDeployments((prev) =>
            prev.map((d) => (d.id === row.id ? { ...d, enabled: true } : d))
          );
        } catch (e) {
          toast.error((e as Error)?.message || "操作失败");
        } finally {
          setBusy(null);
        }
      })();
    }
  };

  // ---------- 供应商编辑 / 删除（接已有的 PATCH / DELETE 接口） ----------
  const openProviderEdit = (p: ModelProvider) => {
    setEditProviderId(p.id);
    setEditProviderName(p.name);
    setPEditForm({ protocol: p.protocol, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv, apiKey: "" });
    setPEditErrors({});
    setShowMaskedKey(false);
    setReplaceKeyMode(false);
    setProviderTest(null);
  };
  const saveProviderEdit = async () => {
    if (!editProviderId) return;
    const errors: { baseUrl?: string; apiKeyEnv?: string } = {};
    if (!pEditForm.baseUrl.trim()) {
      errors.baseUrl = "请输入 Base URL";
    } else if (!/^https?:\/\/.+/i.test(pEditForm.baseUrl.trim())) {
      errors.baseUrl = "Base URL 必须以 http:// 或 https:// 开头";
    }
    if (pEditForm.apiKeyEnv.trim() && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pEditForm.apiKeyEnv.trim())) {
      errors.apiKeyEnv = "环境变量名格式不正确（如 MODEL_API_KEY）";
    }
    if (Object.keys(errors).length > 0) {
      setPEditErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["baseUrl", "apiKeyEnv"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`edit-provider-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy(`p:edit:${editProviderId}`);
    try {
      await authFetch(`/api/admin/model-providers/${editProviderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          protocol: pEditForm.protocol.trim().toUpperCase(),
          baseUrl: pEditForm.baseUrl.trim(),
          apiKeyEnv: pEditForm.apiKeyEnv.trim(),
          apiKey: pEditForm.apiKey,
        }),
      });
      toast.success("供应商已更新");
      setEditProviderId(null);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "更新供应商失败");
    } finally {
      setBusy(null);
    }
  };
  /** 测试当前供应商钥匙连通性：取该供应商下一个已启用部署，复用模型注册表测试通道真实调用上游 */
  const testProviderKey = async () => {
    if (!editProviderId) return;
    const target = deployments.find((d) => d.providerId === editProviderName && d.enabled);
    if (!target) {
      setProviderTest({ ok: false, label: "无可用部署", message: "该供应商下没有已启用的模型部署，无法发起测试调用" });
      return;
    }
    setProviderTesting(true);
    setProviderTest(null);
    try {
      const res = await authFetch(`/api/admin/model-deployments/${target.id}/test`, { method: "POST" });
      const data = (res as { ok?: boolean; latencyMs?: number; label?: string; message?: string }) ?? {};
      setProviderTest({ ok: !!data.ok, latencyMs: data.latencyMs, label: data.label, message: data.message });
    } catch (e) {
      setProviderTest({ ok: false, label: "测试异常", message: (e as Error)?.message || "测试通道调用失败" });
    } finally {
      setProviderTesting(false);
    }
  };
  const deleteProvider = (p: ModelProvider) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除模型供应商",
      message: `确认删除供应商「${p.name}」？此操作不可恢复。`,
      warnings: ["注意：若其下仍有关联的模型部署，或正被设为平台默认模型，后端将拒绝删除。"],
      type: "danger",
      confirmText: "确认删除",
      onConfirm: async () => {
        setBusy(`p:del:${p.id}`);
        try {
          await authFetch(`/api/admin/model-providers/${p.id}`, { method: "DELETE" });
          toast.success(`供应商「${p.name}」已成功删除`);
          await load();
        } catch (e) {
          toast.error((e as Error)?.message || "删除供应商失败");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  // ---------- 部署编辑 / 删除（接已有的 PATCH / DELETE 接口） ----------
  const openDeploymentEdit = (d: ModelDeployment) => {
    setEditDeploymentId(d.id);
    setEditDeploymentMeta({ providerId: d.providerId, modelId: d.modelId });
    setDEditForm({
      upstreamModel: d.upstreamModel || "",
      displayName: d.displayName || "",
      contextLimit: String(d.contextLimit || 32000),
    });
    setDEditErrors({});
    setCtxEditInfo({ loading: false, tried: false, found: false });
  };
  const saveDeploymentEdit = async () => {
    if (!editDeploymentId) return;
    const errors: { contextLimit?: string } = {};
    const limitNum = Number(dEditForm.contextLimit);
    if (!dEditForm.contextLimit.trim()) {
      errors.contextLimit = "请输入上下文窗口上限";
    } else if (isNaN(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) {
      errors.contextLimit = "上下文窗口上限必须为大于 0 的有效正整数";
    }
    if (Object.keys(errors).length > 0) {
      setDEditErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      setTimeout(() => {
        const el = document.getElementById("edit-deployment-input-contextLimit");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 50);
      return;
    }

    setBusy(`d:edit:${editDeploymentId}`);
    try {
      await authFetch(`/api/admin/model-deployments/${editDeploymentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          upstreamModel: dEditForm.upstreamModel.trim(),
          displayName: dEditForm.displayName.trim(),
          contextLimit: Number(dEditForm.contextLimit) || 32000,
        }),
      });
      toast.success("模型部署已更新");
      setEditDeploymentId(null);
      setCtxEditInfo({ loading: false, tried: false, found: false });
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "更新模型部署失败");
    } finally {
      setBusy(null);
    }
  };
  const deleteDeployment = (d: ModelDeployment) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除模型部署",
      message: `确认删除模型部署「${d.providerId}/${d.modelId}」？此操作不可恢复。`,
      warnings: ["注意：若该模型正被设为平台默认模型或被空间模型策略引用，后端将拒绝删除。"],
      type: "danger",
      confirmText: "确认删除",
      onConfirm: async () => {
        setBusy(`d:del:${d.id}`);
        try {
          await authFetch(`/api/admin/model-deployments/${d.id}`, { method: "DELETE" });
          toast.success(`模型部署「${d.modelId}」已成功删除`);
          await load();
        } catch (e) {
          toast.error((e as Error)?.message || "删除模型部署失败");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  /** 打开能力编辑面板：勾选项来自后端下发清单，草稿初始化为该部署当前已声明的能力 */
  const openCapabilityPanel = (row: ModelDeployment) => {
    setCapabilityPanelId(row.id);
    setCapabilityDraft(Array.isArray(row.capabilities) ? [...row.capabilities] : []);
    setCapError(null);
  };

  /** 保存模型能力：写回部署后，组件「能力是否满足」判定立即按新能力生效 */
  const saveCapabilities = async (row: ModelDeployment) => {
    if (capabilityDraft.length === 0) {
      setCapError("模型必须至少声明一项基础能力（如文本生成），否则全站组件将无法使用该模型");
      setTimeout(() => {
        const el = document.getElementById("capability-options-grid");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setBusy(`cap:${row.id}`);
    try {
      await authFetch(`/api/admin/model-deployments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capabilities: capabilityDraft }),
      });
      toast.success(`${row.providerId}/${row.modelId} 的模型能力已保存`);
      setCapabilityPanelId(null);
      await refreshDeploymentsAndDefault();
    } catch (e) {
      toast.error((e as Error)?.message || "保存模型能力失败");
    } finally {
      setBusy(null);
    }
  };

  const createProvider = async () => {
    const errors: { name?: string; baseUrl?: string; apiKeyEnv?: string } = {};
    if (!pForm.name.trim()) {
      errors.name = "请输入供应商标识";
    } else if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(pForm.name.trim())) {
      errors.name = "供应商标识支持中文、英文字母、数字、下划线及中划线，不可含空格或特殊符号";
    } else if (pForm.name.trim().length > 64) {
      errors.name = "供应商标识最长 64 个字符";
    }
    if (!pForm.baseUrl.trim()) {
      errors.baseUrl = "请输入 Base URL";
    } else if (!/^https?:\/\/.+/i.test(pForm.baseUrl.trim())) {
      errors.baseUrl = "Base URL 必须以 http:// 或 https:// 开头";
    }
    if (pForm.apiKeyEnv.trim() && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pForm.apiKeyEnv.trim())) {
      errors.apiKeyEnv = "环境变量名格式不正确（如 MODEL_API_KEY）";
    }

    if (Object.keys(errors).length > 0) {
      setPErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["name", "baseUrl", "apiKeyEnv"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`provider-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy("p:create");
    try {
      const createdName = pForm.name.trim();
      await authFetch("/api/admin/model-providers", { method: "POST", body: JSON.stringify(pForm) });
      toast.success("供应商已创建");
      setPForm({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "MODEL_API_KEY", apiKey: "" });
      setPErrors({});
      setShowAddProvider(false);
      await load();
      // 触发系统建议引导：通道创建后需绑定具体模型部署，引导管理员立即配置或稍后配置
      setCreatedProviderGuidance({
        isOpen: true,
        providerName: createdName,
      });
    } catch (e) {
      toast.error((e as Error)?.message || "创建失败");
    } finally {
      setBusy(null);
    }
  };

  const createDeployment = async () => {
    const errors: { providerId?: string; modelId?: string; contextLimit?: string; capabilities?: string } = {};
    if (!dForm.providerId) {
      errors.providerId = "请选择所属供应商通道";
    }
    if (!dForm.modelId.trim()) {
      errors.modelId = "请输入模型代号标识";
    }
    const limitNum = Number(dForm.contextLimit);
    if (!dForm.contextLimit.trim()) {
      errors.contextLimit = "请输入上下文窗口上限";
    } else if (isNaN(limitNum) || limitNum <= 0 || !Number.isInteger(limitNum)) {
      errors.contextLimit = "上下文窗口上限必须为大于 0 的有效正整数";
    }
    if ((dForm.capabilities as string[]).length === 0) {
      errors.capabilities = "请至少勾选一项能力（如「文本生成」），否则组件将无法使用该模型";
    }

    if (Object.keys(errors).length > 0) {
      setDErrors(errors);
      // 准确定位到第一个未填或格式错误的输入框，平滑滚动居中并获得焦点高亮，不显示多余的 toast
      const firstKey = (["providerId", "modelId", "contextLimit", "capabilities"] as const).find((k) => errors[k]);
      if (firstKey) {
        setTimeout(() => {
          const el = document.getElementById(`deployment-input-${firstKey}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 50);
      }
      return;
    }

    setBusy("d:create");
    try {
      await authFetch("/api/admin/model-deployments", {
        method: "POST",
        body: JSON.stringify({
          ...dForm,
          upstreamModel: dForm.upstreamModel.trim() || dForm.modelId.trim(),
          contextLimit: Number(dForm.contextLimit) || 32000,
        }),
      });
      toast.success("模型部署已创建");
      setDForm({
        providerId: dForm.providerId,
        modelId: "",
        upstreamModel: "",
        displayName: "",
        contextLimit: "32000",
        capabilities: [],
      });
      setDErrors({});
      setCtxInfo({ loading: false, tried: false, found: false });
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "创建失败");
    } finally {
      setBusy(null);
    }
  };

  // ---------- 价格编辑（供应商成本与用户售价分离；单位：元/100万 Token，后台按微元保存） ----------
  const [pricePanelId, setPricePanelId] = useState<string | null>(null);
  const [priceInfo, setPriceInfo] = useState<{ priceVersion: number; priceStatus: string; priceSource: string } | null>(null);
  const [priceErrors, setPriceErrors] = useState<Record<string, string | undefined>>({});
  const [priceForm, setPriceForm] = useState({
    currency: "CNY",
    priceSource: "UNVERIFIED",
    markupRateBps: "",
    effectiveFrom: "",
    costInput: "",
    costOutput: "",
    costCacheRead: "",
    costCacheWrite: "",
    priceInput: "",
    priceOutput: "",
    priceCacheRead: "",
    priceCacheWrite: "",
  });
  /** 价格规则(rules)结构化表单（USD 参考价 / 缓存存储 / 计费公式 / 订阅抵扣 / 自定义键—值），不再暴露裸 JSON */
  const [rulesForm, setRulesForm] = useState<RulesForm>({ ...emptyRulesForm });

  const yuanToMicros = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1_000_000);
  };
  const microsToYuan = (v: number | null): string => (v === null || v === undefined ? "" : String(v / 1_000_000));

  // 两种定价模式互斥：加价率与用户端售价二选一（填一方则置灰另一方并提示）
  const priceUserFilled = [priceForm.priceInput, priceForm.priceOutput, priceForm.priceCacheRead, priceForm.priceCacheWrite].some(
    (v) => (v ?? "").trim() !== "",
  );
  const priceMarkupFilled = (priceForm.markupRateBps ?? "").trim() !== "";

  // —— 时段价格（覆盖主流价）——
  type PricePeriodRow = {
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    priority: number;
    weekdays: string | null;
    startTime: string | null;
    endTime: string | null;
    startDate: string | null;
    endDate: string | null;
    costInputMicrosPerMillion: number | null;
    costOutputMicrosPerMillion: number | null;
    costCacheReadMicrosPerMillion: number | null;
    costCacheWriteMicrosPerMillion: number | null;
    priceInputMicrosPerMillion: number | null;
    priceOutputMicrosPerMillion: number | null;
    priceCacheReadMicrosPerMillion: number | null;
    priceCacheWriteMicrosPerMillion: number | null;
    priceSource: string;
    priceStatus: string;
    markupRateBps: number | null;
  };
  const [pricePeriods, setPricePeriods] = useState<PricePeriodRow[]>([]);
  const [periodPanel, setPeriodPanel] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [periodForm, setPeriodForm] = useState({
    name: "",
    kind: "CUSTOM",
    enabled: true,
    priority: "0",
    weekdays: "",
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
    costInput: "",
    costOutput: "",
    costCacheRead: "",
    costCacheWrite: "",
    priceInput: "",
    priceOutput: "",
    priceCacheRead: "",
    priceCacheWrite: "",
    priceSource: "UNVERIFIED",
    markupRateBps: "",
  });
  const [periodErrors, setPeriodErrors] = useState<Record<string, string | undefined>>({});
  const periodUserFilled = [periodForm.priceInput, periodForm.priceOutput, periodForm.priceCacheRead, periodForm.priceCacheWrite].some(
    (v) => (v ?? "").trim() !== "",
  );
  const periodMarkupFilled = (periodForm.markupRateBps ?? "").trim() !== "";

  // 加价率输入状态：三态（继承全局 / 百分比 / 基点）；inherit=true 时落库 markupRateBps=null（结算回落全局默认）
  const [priceMarkupMode, setPriceMarkupMode] = useState<"percent" | "bps">("percent");
  const [priceMarkupInput, setPriceMarkupInput] = useState("");
  const [priceMarkupInherit, setPriceMarkupInherit] = useState(false);
  const [periodMarkupMode, setPeriodMarkupMode] = useState<"percent" | "bps">("percent");
  const [periodMarkupInput, setPeriodMarkupInput] = useState("");
  const [periodMarkupInherit, setPeriodMarkupInherit] = useState(false);
  // 加价率 → 用户售价实时推算（纯展示，不写回表单），让调整加价率时可以立刻看到售价变化
  const derivePrice = (cost: string | undefined, bpsRaw: string | undefined): number | null => {
    const c = Number(cost ?? "");
    const bp = Number(bpsRaw ?? "");
    if ((cost ?? "").trim() === "" || !Number.isFinite(c)) return null;
    if ((bpsRaw ?? "").trim() === "" || !Number.isFinite(bp)) return null;
    return Number((c * (1 + bp / 10_000)).toFixed(6));
  };
  const priceDerived = priceMarkupFilled
    ? {
        priceInput: derivePrice(priceForm.costInput, priceForm.markupRateBps),
        priceOutput: derivePrice(priceForm.costOutput, priceForm.markupRateBps),
        priceCacheRead: derivePrice(priceForm.costCacheRead, priceForm.markupRateBps),
        priceCacheWrite: derivePrice(priceForm.costCacheWrite, priceForm.markupRateBps),
      }
    : null;
  const periodDerivedPrices = periodMarkupFilled
    ? {
        priceInput: derivePrice(periodForm.costInput, periodForm.markupRateBps),
        priceOutput: derivePrice(periodForm.costOutput, periodForm.markupRateBps),
        priceCacheRead: derivePrice(periodForm.costCacheRead, periodForm.markupRateBps),
        priceCacheWrite: derivePrice(periodForm.costCacheWrite, periodForm.markupRateBps),
      }
    : null;
  const WD_OPTIONS: [string, string][] = [
    ["1", "周一"],
    ["2", "周二"],
    ["3", "周三"],
    ["4", "周四"],
    ["5", "周五"],
    ["6", "周六"],
    ["7", "周日"],
  ];

  const loadPricePeriods = async (deploymentId: string) => {
    try {
      const res = await authFetch(`/api/admin/model-pricing/${deploymentId}/periods`);
      setPricePeriods((res?.data as PricePeriodRow[]) ?? []);
    } catch {
      setPricePeriods([]);
    }
  };

  const periodScheduleText = (p: PricePeriodRow): string => formatPeriodSchedule(p);

  const openPeriodEditor = (p?: PricePeriodRow) => {
    if (p) {
      setPeriodForm({
        name: p.name,
        kind: p.kind,
        enabled: p.enabled,
        priority: String(p.priority ?? 0),
        weekdays: p.weekdays ?? "",
        startTime: p.startTime ?? "",
        endTime: p.endTime ?? "",
        startDate: p.startDate ? String(p.startDate).slice(0, 10) : "",
        endDate: p.endDate ? String(p.endDate).slice(0, 10) : "",
        costInput: microsToYuan(p.costInputMicrosPerMillion),
        costOutput: microsToYuan(p.costOutputMicrosPerMillion),
        costCacheRead: microsToYuan(p.costCacheReadMicrosPerMillion),
        costCacheWrite: microsToYuan(p.costCacheWriteMicrosPerMillion),
        priceInput: microsToYuan(p.priceInputMicrosPerMillion),
        priceOutput: microsToYuan(p.priceOutputMicrosPerMillion),
        priceCacheRead: microsToYuan(p.priceCacheReadMicrosPerMillion),
        priceCacheWrite: microsToYuan(p.priceCacheWriteMicrosPerMillion),
        priceSource: p.priceSource,
        markupRateBps: p.markupRateBps === null || p.markupRateBps === undefined ? "" : String(p.markupRateBps),
      });
      setPeriodMarkupMode("percent");
      setPeriodMarkupInherit(p.markupRateBps == null);
      setPeriodMarkupInput(bpsToPercentStr(p.markupRateBps == null ? "" : String(p.markupRateBps)));
      setPeriodPanel({ open: true, editingId: p.id });
    } else {
      setPeriodForm({
        name: "",
        kind: "CUSTOM",
        enabled: true,
        priority: "0",
        weekdays: "",
        startTime: "",
        endTime: "",
        startDate: "",
        endDate: "",
        costInput: "",
        costOutput: "",
        costCacheRead: "",
        costCacheWrite: "",
        priceInput: "",
        priceOutput: "",
        priceCacheRead: "",
        priceCacheWrite: "",
        priceSource: "UNVERIFIED",
        markupRateBps: "",
      });
      setPeriodMarkupMode("percent");
      setPeriodMarkupInherit(true);
      setPeriodMarkupInput("");
      setPeriodPanel({ open: true, editingId: null });
    }
    setPeriodErrors({});
  };

  const savePeriod = async () => {
    if (!pricePanelId) return;
    const errs: Record<string, string> = {};
    if (!periodForm.name.trim()) errs.name = "时段名称不能为空";
    setPeriodErrors(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, unknown> = {
      name: periodForm.name.trim(),
      kind: periodForm.kind,
      enabled: periodForm.enabled,
      priority: Number(periodForm.priority) || 0,
      weekdays: periodForm.weekdays.trim(),
      startTime: periodForm.startTime.trim(),
      endTime: periodForm.endTime.trim(),
      startDate: periodForm.startDate.trim(),
      endDate: periodForm.endDate.trim(),
      costInput: periodForm.costInput,
      costOutput: periodForm.costOutput,
      costCacheRead: periodForm.costCacheRead,
      costCacheWrite: periodForm.costCacheWrite,
      priceInput: periodForm.priceInput,
      priceOutput: periodForm.priceOutput,
      priceCacheRead: periodForm.priceCacheRead,
      priceCacheWrite: periodForm.priceCacheWrite,
      priceSource: periodForm.priceSource,
      markupRateBps: periodForm.markupRateBps.trim() === "" ? null : Number(periodForm.markupRateBps),
    };
    setBusy(`period:${pricePanelId}`);
    try {
      const url = periodPanel.editingId
        ? `/api/admin/model-pricing/${pricePanelId}/periods/${periodPanel.editingId}`
        : `/api/admin/model-pricing/${pricePanelId}/periods`;
      const res = await authFetch(url, { method: periodPanel.editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (res?.success) {
        toast.success(periodPanel.editingId ? "时段价格已更新" : "时段价格已新增");
        setPeriodPanel({ open: false, editingId: null });
        await loadPricePeriods(pricePanelId);
      } else {
        toast.error((res as { error?: string })?.error || "保存时段价格失败");
      }
    } catch (e) {
      toast.error((e as Error)?.message || "保存时段价格失败");
    } finally {
      setBusy(null);
    }
  };

  /** 关闭价格弹窗前检查：时段正在编辑时阻止误关，避免未保存的时段改动被丢弃 */
  const tryClosePricePanel = () => {
    if (periodPanel.open) {
      toast.error("时段正在编辑中：请先点「更新时段」保存该时段，或点「取消」放弃本次时段修改");
      return;
    }
    setPricePanelId(null);
  };

  const deletePeriod = async (id: string) => {
    if (!pricePanelId) return;
    if (!window.confirm("确认删除该时段价格？删除后该时段将回退为使用主流价。")) return;
    setBusy(`period-del:${id}`);
    try {
      const res = await authFetch(`/api/admin/model-pricing/${pricePanelId}/periods/${id}`, { method: "DELETE" });
      if (res?.success) {
        toast.success("时段价格已删除");
        await loadPricePeriods(pricePanelId);
      } else {
        toast.error((res as { error?: string })?.error || "删除失败");
      }
    } catch (e) {
      toast.error((e as Error)?.message || "删除失败");
    } finally {
      setBusy(null);
    }
  };

  const togglePeriod = async (p: PricePeriodRow) => {
    if (!pricePanelId) return;
    setBusy(`period-toggle:${p.id}`);
    try {
      const res = await authFetch(`/api/admin/model-pricing/${pricePanelId}/periods/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (res?.success) await loadPricePeriods(pricePanelId);
      else toast.error((res as { error?: string })?.error || "操作失败");
    } catch (e) {
      toast.error((e as Error)?.message || "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const openPrice = async (d: ModelDeployment) => {
    setBusy(`price:${d.id}`);
    setPriceErrors({});
    try {
      const res = await authFetch(`/api/admin/model-pricing/${d.id}`);
      const p = res.data?.pricing;
      setPricePanelId(d.id);
      setPriceInfo(p ? { priceVersion: p.priceVersion, priceStatus: p.priceStatus, priceSource: p.priceSource } : null);
      setPriceForm({
        currency: p?.currency ?? "CNY",
        priceSource: p?.priceSource ?? "UNVERIFIED",
        markupRateBps: p?.markupRateBps === null || p?.markupRateBps === undefined ? "" : String(p.markupRateBps),
        effectiveFrom: p?.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : "",
        costInput: microsToYuan(p?.supplierCost?.costInputMicrosPerMillion ?? null),
        costOutput: microsToYuan(p?.supplierCost?.costOutputMicrosPerMillion ?? null),
        costCacheRead: microsToYuan(p?.supplierCost?.costCacheReadMicrosPerMillion ?? null),
        costCacheWrite: microsToYuan(p?.supplierCost?.costCacheWriteMicrosPerMillion ?? null),
        priceInput: microsToYuan(p?.userPrice?.priceInputMicrosPerMillion ?? null),
        priceOutput: microsToYuan(p?.userPrice?.priceOutputMicrosPerMillion ?? null),
        priceCacheRead: microsToYuan(p?.userPrice?.priceCacheReadMicrosPerMillion ?? null),
        priceCacheWrite: microsToYuan(p?.userPrice?.priceCacheWriteMicrosPerMillion ?? null),
      });
      setPriceMarkupMode("percent");
      setPriceMarkupInherit(p?.markupRateBps == null);
      setPriceMarkupInput(bpsToPercentStr(p?.markupRateBps == null ? "" : String(p.markupRateBps)));
      setRulesForm(rulesToForm(p?.rules));
      setPriceModalTab("base");
      setPricePeriods([]);
      setPeriodPanel({ open: false, editingId: null });
      await loadPricePeriods(d.id);
    } catch (e) {
      toast.error((e as Error)?.message || "读取价格失败");
    } finally {
      setBusy(null);
    }
  };

  /** 价格表单 UI 层校验（仅校验当前 priceForm 的填写值），返回字段级错误 */
  const validatePrice = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!priceForm.currency.trim()) {
      errors.currency = "请输入结算币种（如 CNY）";
    }
    const priceKeys = [
      "costInput",
      "costOutput",
      "costCacheRead",
      "costCacheWrite",
      "priceInput",
      "priceOutput",
      "priceCacheRead",
      "priceCacheWrite",
    ] as const;
    for (const key of priceKeys) {
      const val = (priceForm as Record<string, string>)[key].trim();
      if (val !== "") {
        const n = Number(val);
        if (isNaN(n) || n < 0) {
          errors[key] = "金额必须为大于或等于 0 的有效数字";
        }
      }
    }
    if (priceForm.markupRateBps.trim() !== "") {
      const bp = Number(priceForm.markupRateBps.trim());
      if (isNaN(bp) || !Number.isInteger(bp) || bp < 0) {
        errors.markupRateBps = "加价率必须为大于或等于 0 的有效整数基点";
      }
    }
    return errors;
  };

  /** 展示并定位第一个价格校验错误 */
  const revealPriceErrors = (errors: Record<string, string>) => {
    setPriceErrors(errors);
    const order = ["currency", "costInput", "costOutput", "costCacheRead", "costCacheWrite", "priceInput", "priceOutput", "priceCacheRead", "priceCacheWrite", "markupRateBps"];
    const firstKey = order.find((k) => errors[k]);
    if (firstKey) {
      setTimeout(() => {
        const el = document.getElementById(`price-input-${firstKey}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus();
        }
      }, 50);
    }
  };

  /** 组装并写入价格；成功返回 true（调用方负责关闭弹窗、提示与刷新） */
  const commitPrice = async (d: ModelDeployment): Promise<boolean> => {
    const built = buildRulesFromForm(rulesForm);
    if (!built.ok) {
      toast.error(`规则(rules) 校验失败：${built.error}`);
      return false;
    }
    const body = {
      currency: priceForm.currency,
      priceSource: priceForm.priceSource,
      markupRateBps: priceForm.markupRateBps === "" ? null : Number(priceForm.markupRateBps),
      effectiveFrom: priceForm.effectiveFrom ? `${priceForm.effectiveFrom}T00:00:00.000Z` : null,
      costInputMicrosPerMillion: yuanToMicros(priceForm.costInput),
      costOutputMicrosPerMillion: yuanToMicros(priceForm.costOutput),
      costCacheReadMicrosPerMillion: yuanToMicros(priceForm.costCacheRead),
      costCacheWriteMicrosPerMillion: yuanToMicros(priceForm.costCacheWrite),
      priceInputMicrosPerMillion: yuanToMicros(priceForm.priceInput),
      priceOutputMicrosPerMillion: yuanToMicros(priceForm.priceOutput),
      priceCacheReadMicrosPerMillion: yuanToMicros(priceForm.priceCacheRead),
      priceCacheWriteMicrosPerMillion: yuanToMicros(priceForm.priceCacheWrite),
      rules: built.rules,
    };
    try {
      await authFetch(`/api/admin/model-pricing/${d.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return true;
    } catch (e) {
      toast.error((e as Error)?.message || "保存价格失败");
      return false;
    }
  };

  /** 仅保存价格（不改动模型启用状态） */
  const savePrice = async (d: ModelDeployment) => {
    const errors = validatePrice();
    if (Object.keys(errors).length > 0) {
      revealPriceErrors(errors);
      return;
    }
    setBusy(`price:${d.id}`);
    try {
      const ok = await commitPrice(d);
      if (!ok) return;
      toast.success("价格已保存（历史任务快照不变）");
      setPricePanelId(null);
      setPriceErrors({});
      await load();
    } finally {
      setBusy(null);
    }
  };

  /**
   * 停用 → 改价 → 重新启用 的一键闭环：
   * 启用态模型后端会拒绝改价，因此推荐「先停用、改价、再启用」。
   * 当模型已处于停用状态时，本按钮在保存价格后自动重新启用，省去手动切回。
   */
  const savePriceAndEnable = async (d: ModelDeployment) => {
    const errors = validatePrice();
    if (Object.keys(errors).length > 0) {
      revealPriceErrors(errors);
      return;
    }
    setBusy(`price:${d.id}`);
    try {
      const okSave = await commitPrice(d);
      if (!okSave) return;
      try {
        await authFetch(`/api/admin/model-deployments/${d.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
        });
        setDeployments((prev) => prev.map((x) => (x.id === d.id ? { ...x, enabled: true } : x)));
      } catch (e) {
        toast.error(`价格已保存，但重新启用模型失败：${(e as Error)?.message || "操作失败"}（请到列表手动启用）`);
        setPricePanelId(null);
        setPriceErrors({});
        await load();
        return;
      }
      toast.success("价格已保存并已重新启用模型");
      setPricePanelId(null);
      setPriceErrors({});
      await load();
    } finally {
      setBusy(null);
    }
  };

  // 弹窗标题用可读的 providerId/modelId（避免裸 UUID 撑破 header 导致溢出错乱）
  const priceDep = pricePanelId ? deployments.find((x) => x.id === pricePanelId) ?? null : null;
  const capDep = capabilityPanelId ? deployments.find((x) => x.id === capabilityPanelId) ?? null : null;

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题（与后台其他管理页规格严格一致） */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
              <Layers className="w-5 h-5" />
            </span>
            <span>模型注册表</span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            管理模型供应商与模型部署：配置接口地址、模型能力、价格与平台默认模型。禁用后组件立即拒绝执行，且不会回落环境变量；密钥不入库，仅保存环境变量名。
          </p>
        </div>

        {/* 顶部快捷跳转与刷新按钮 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href="/admin/workspaces/model-policy"
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="前往按空间配置默认模型与可用白名单"
          >
            <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>空间模型策略</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
            title="刷新模型注册表数据"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 统计指标卡片（与全站管理后台标准指标卡片规格保持 100% 一致） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 卡片 1：供应商总数 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">供应商总数</div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-800">{providers.length}</div>
          </div>
          <div className="w-10 h-10 rounded bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Server className="w-5 h-5" />
          </div>
        </div>

        {/* 卡片 2：模型部署总数 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">模型部署总数</div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-800">{deployments.length}</div>
          </div>
          <div className="w-10 h-10 rounded bg-purple-50 border border-purple-100/80 text-[#805ad5] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* 卡片 3：已启用部署 */}
        <div className="bg-white p-4.5 rounded-lg border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-sm transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">已启用部署</div>
            <div className="text-2xl font-black font-mono tracking-tight text-emerald-600">
              {deployments.filter((d) => d.enabled).length}
            </div>
          </div>
          <div className="w-10 h-10 rounded bg-emerald-50 border border-emerald-100/80 text-emerald-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* 全局加价率：单一真源，一键应用到全部主表 + 全部时段 */}
      <GlobalMarkupSync
        onApplied={() => {
          void load();
          void loadGlobalMarkup();
        }}
      />

      {/* Part4：价格凭证确认 + 每日对账进度（Day X/7） */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-4.5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <FileCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-800">价格凭证 / 每日对账</div>
            <div className="text-[11px] text-slate-400">官方价经负责人确认；对账 cron 每日 08:00 自动扫描（dry-run）</div>
          </div>
        </div>
        {priceVoucherNote ? (
          <div className="flex items-start gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{priceVoucherNote}</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">暂无价格凭证记录</div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            {reconciliationStartDate ? (
              (() => {
                const start = new Date(`${reconciliationStartDate}T00:00:00`);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                start.setHours(0, 0, 0, 0);
                const days = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
                const day = Math.min(7, Math.max(1, days));
                return <>对账观察进度：<b className="text-slate-700">第 {day} 天 / 7 天</b></>;
              })()
            ) : (
              "对账观察进度：未设定起点"
            )}
          </div>
          <a
            href="/admin/finance/settlements"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3182ce] hover:underline shrink-0"
          >
            查看最近对账结果 <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">正在加载模型注册表数据...</span>
        </div>
      ) : (
        <>
          {/* 页面主工作台 Tab 导航栏：大厂高信息密度设计，聚焦当前工作流 */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200/90 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setMainTab("policy")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  mainTab === "policy"
                    ? "bg-[#3182ce] text-white shadow-sm ring-2 ring-[#3182ce]/20"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 shadow-2xs"
                }`}
              >
                <Star className="w-4 h-4" />
                <span>平台默认与策略</span>
                {platformDefault?.deployment && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      mainTab === "policy"
                        ? "bg-white/20 text-white"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    已就绪
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMainTab("providers")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  mainTab === "providers"
                    ? "bg-[#3182ce] text-white shadow-sm ring-2 ring-[#3182ce]/20"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 shadow-2xs"
                }`}
              >
                <Server className="w-4 h-4" />
                <span>供应商通道</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    mainTab === "providers"
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {providers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMainTab("deployments")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  mainTab === "deployments"
                    ? "bg-[#3182ce] text-white shadow-sm ring-2 ring-[#3182ce]/20"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 shadow-2xs"
                }`}
              >
                <Boxes className="w-4 h-4" />
                <span>模型部署中枢</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    mainTab === "deployments"
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {deployments.length}
                </span>
              </button>
            </div>
          </div>

          {/* 平台默认模型：仅在策略选项卡显示 */}
          {mainTab === "policy" && (
            <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border-b border-blue-100/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-[#3182ce] text-white flex items-center justify-center shadow-xs">
                    <Star className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 tracking-tight">平台默认模型</h2>
                    <p className="text-xs text-slate-500 font-medium">
                      工作空间如果没有单独设置专属模型，组件任务将自动采用此处指定的模型
                    </p>
                  </div>
                </div>

                {/* 当前默认模型状态展示 */}
                <div>
                  {platformDefault?.deployment ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span>
                        当前默认：{platformDefault.deployment.providerId} / {platformDefault.deployment.modelId}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>尚未配置平台默认模型</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    当工作空间没有单独设置专属模型时，组件任务会自动使用此处设定的全站默认部署；若两者都没设置，该空间的组件任务将无法执行。下拉备选项实时取自数据库中已启用的部署。
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <select
                    className={`${inputCls} sm:max-w-md py-2.5 font-bold cursor-pointer`}
                    value={selectedDefault}
                    onChange={(e) => setSelectedDefault(e.target.value)}
                  >
                    <option value="">（不设置 / 清除平台默认）</option>
                    {deployments.map((d) => (
                      <option key={d.id} value={d.id} disabled={!d.enabled}>
                        {d.providerId} / {d.modelId} · {d.displayName || d.modelId}
                        {d.enabled ? "" : "（已禁用，不可作为默认模型）"}
                        {platformDefault?.deploymentId === d.id ? " [当前默认]" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`${btnCls} flex items-center gap-1.5`}
                      disabled={savingDefault || deployments.find((d) => d.id === selectedDefault)?.enabled !== true}
                      onClick={() => savePlatformDefault(selectedDefault || null)}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{savingDefault ? "保存中..." : "保存平台默认"}</span>
                    </button>

                    <button
                      type="button"
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-95"
                      disabled={savingDefault || !platformDefault?.deploymentId}
                      onClick={() => savePlatformDefault(null)}
                    >
                      清除默认
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 模型供应商列表与新增：仅在供应商选项卡显示 */}
          {mainTab === "providers" && (
            <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 tracking-tight">模型供应商 (Providers)</h2>
                    <p className="text-xs text-slate-500 font-medium">
                      管理对接的厂商通道、接口协议与密钥环境变量索引
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                    {providers.length} 个供应商
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddProvider(!showAddProvider)}
                    className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddProvider ? "收起表单" : "新增供应商"}</span>
                    {showAddProvider ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 新增供应商 Bento 表单（受控折叠） */}
              {showAddProvider && (
                <div className="m-6 p-5 rounded-lg border border-blue-200/80 bg-blue-50/20 shadow-2xs space-y-4 animate-in fade-in-50 duration-200">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <Plus className="w-4 h-4 text-[#3182ce]" />
                    <span>新增供应商通道</span>
                  </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">供应商标识 (providerId) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="provider-input-name"
                    className={getInputCls(!!pErrors.name)}
                    maxLength={64}
                    placeholder="如 deepseek、openai、智谱-bigmodel（创建后不可修改）"
                    value={pForm.name}
                    onChange={(e) => {
                      setPForm({ ...pForm, name: e.target.value });
                      if (pErrors.name) setPErrors({ ...pErrors, name: undefined });
                    }}
                  />
                  {pErrors.name && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.name}</span>
                    </p>
                  )}
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">接口协议</span>
                  <select
                    className={inputCls}
                    value={pForm.protocol}
                    onChange={(e) => setPForm({ ...pForm, protocol: e.target.value })}
                  >
                    <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / vLLM 等兼容网关）</option>
                    <option value="ANTHROPIC">ANTHROPIC（Claude）</option>
                    <option value="GEMINI">GEMINI（Google Gemini）</option>
                  </select>
                  <span className="block text-[11px] text-slate-400">选择与模型服务匹配的协议，适配器按此分发请求格式</span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">Base URL（必须为 https 地址） <span className="text-red-500 font-bold ml-0.5">*</span></span>
                  <input
                    id="provider-input-baseUrl"
                    className={getInputCls(!!pErrors.baseUrl)}
                    placeholder="https://api.deepseek.com/v1"
                    value={pForm.baseUrl}
                    onChange={(e) => {
                      setPForm({ ...pForm, baseUrl: e.target.value });
                      if (pErrors.baseUrl) setPErrors({ ...pErrors, baseUrl: undefined });
                    }}
                  />
                  {pErrors.baseUrl && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.baseUrl}</span>
                    </p>
                  )}
                  <span className="block text-[11px] text-slate-400">
                    平台会自动拼接 <code>/chat/completions</code>；明文 http 地址仅在本地调试且开启 <code>MODEL_ALLOW_INSECURE_LOCAL</code> 时可用
                  </span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">密钥环境变量名 <span className="text-slate-400 font-normal">（可选，本地/自托管模型可留空）</span></span>
                  <input
                    id="provider-input-apiKeyEnv"
                    className={getInputCls(!!pErrors.apiKeyEnv)}
                    maxLength={128}
                    placeholder="MODEL_API_KEY 或 DEEPSEEK_API_KEY"
                    value={pForm.apiKeyEnv}
                    onChange={(e) => {
                      setPForm({ ...pForm, apiKeyEnv: e.target.value });
                      if (pErrors.apiKeyEnv) setPErrors({ ...pErrors, apiKeyEnv: undefined });
                    }}
                  />
                  {pErrors.apiKeyEnv && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pErrors.apiKeyEnv}</span>
                    </p>
                  )}
                  <span className="block text-[11px] text-slate-400">
                    安全红线：密钥严禁直接入库。此处仅保存服务器环境变量键名，实际执行时由服务端进程读取；留空表示模型无需密钥（如 Ollama、vLLM 等本地/自托管模型）
                  </span>
                </label>

                <label className="block sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold text-slate-600">API Key 直接录入 <span className="text-slate-400 font-normal">（可选，留空则改用上方环境变量名）</span></span>
                  <input
                    id="provider-input-apiKey"
                    type="password"
                    autoComplete="new-password"
                    className={getInputCls(false)}
                    placeholder="sk-... 明文录入后由服务端加密存储，不进数据库明文"
                    value={pForm.apiKey}
                    onChange={(e) => setPForm({ ...pForm, apiKey: e.target.value })}
                  />
                  <span className="block text-[11px] text-slate-400">
                    录入后密钥以 AES-256-GCM 密文落库；与「密钥环境变量名」二选一，密文优先。无需密钥的本地模型两项均可留空
                  </span>
                </label>
              </div>

              <div className="pt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  disabled={busy === "p:create"}
                  onClick={() => {
                    setPForm({ name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", apiKeyEnv: "", apiKey: "" });
                    setPErrors({});
                  }}
                  title="清空当前输入的所有供应商通道信息"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>清除</span>
                </button>
                <button
                  type="button"
                  className={`${btnCls} flex items-center gap-1.5`}
                  disabled={busy === "p:create"}
                  onClick={createProvider}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{busy === "p:create" ? "正在创建..." : "确认新增供应商"}</span>
                </button>
              </div>
            </div>
          )}

            {/* 供应商「测试连接」结果反馈：定位到列表上方 */}
            <div ref={providerResultRef}>
              {testResult && providers.some((p) => p.id === testResult.id) && testResultBanner}
            </div>

            {/* 供应商列表表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px] table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-y border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">名称标识</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">协议格式</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Base URL</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">环境变量名</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">状态</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">健康</th>
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedProviders.map((p) => (
                    <tr key={p.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">{p.name}</td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs whitespace-nowrap">{p.protocol}</td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs font-mono whitespace-nowrap">{p.baseUrl}</td>
                      <td className="px-6 py-3.5 font-mono text-slate-500 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                            {p.apiKeyEnv || "（无需密钥）"}
                          </span>
                          {!p.apiKeyEnv ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                              免鉴权
                            </span>
                          ) : p.apiKeyConfigured ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              密钥就绪
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap"
                              title="服务端运行时未找到该环境变量，组件执行将报 MODEL_NOT_CONFIGURED"
                            >
                              密钥未配置
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                              p.enabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {p.enabled ? "已启用" : "已禁用"}
                          </span>
                          {(() => {
                            const count = deployments.filter((d) => d.providerId === p.name).length;
                            if (count === 0) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => goToDeployModelForProvider(p.name)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors shadow-2xs active:scale-95"
                                  title="系统建议：该通道暂未配置任何模型部署，点击立即去配置"
                                >
                                  <span>待配置模型</span>
                                  <Plus className="w-3 h-3 text-amber-600" />
                                </button>
                              );
                            }
                            return (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200"
                                title={`该供应商已接入 ${count} 款模型部署`}
                              >
                                {count} 款模型
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                            p.health === "healthy"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : p.health === "error"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {p.health === "healthy" ? "健康" : p.health === "error" ? "异常" : "未探测"}
                        </span>
                        {p.lastTestedAt ? (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(p.lastTestedAt).toLocaleString("zh-CN", { hour12: false })}
                          </div>
                        ) : null}
                      </td>
                      <td className="sticky right-0 bg-white group-hover:bg-blue-50/50 backdrop-blur-xs z-10 px-6 py-3.5 text-right whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex items-center justify-end gap-2">
                          {/* 测试连接：验证 Base URL / API Key / 鉴权，结果写入 health 与 lastTestedAt */}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                            disabled={testingId === p.id}
                            onClick={() => testProvider(p)}
                            title="测试该供应商连通性（验证 Base URL、API Key 与鉴权）"
                          >
                            {testingId === p.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>测试中...</span>
                              </>
                            ) : (
                              <>
                                <Activity className="w-3.5 h-3.5" />
                                <span>测试连接</span>
                              </>
                            )}
                          </button>

                          {/* 启用/禁用通道切换 */}
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold transition-all duration-200 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 ${
                              p.enabled
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                            }`}
                            disabled={busy === `p:${p.id}`}
                            onClick={() => toggleProvider(p)}
                            title={p.enabled ? "停用该供应商通道" : "启用该供应商通道"}
                          >
                            {p.enabled ? (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                <span>禁用通道</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>启用通道</span>
                              </>
                            )}
                          </button>

                          {/* 严格状态互锁：已启用供应商严禁编辑，仅在已禁用状态下允许编辑通道配置 */}
                          {!p.enabled && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                              onClick={() => openProviderEdit(p)}
                              title="编辑供应商通道（标识不可修改，需在禁用状态下维护）"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              <span>编辑</span>
                            </button>
                          )}

                          {/* 严格状态互锁：仅在已禁用状态下允许删除通道 */}
                          {!p.enabled && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                              disabled={busy === `p:del:${p.id}`}
                              onClick={() => deleteProvider(p)}
                              title="删除供应商通道（需先停用该通道）"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{busy === `p:del:${p.id}` ? "删除中..." : "删除"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {providers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <Server className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <span className="text-xs font-bold text-slate-500">暂无供应商通道</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 供应商列表分页 */}
            {providers.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={providerPage}
                  totalItems={providers.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setProviderPage(p)}
                  itemLabel="个供应商"
                />
              </div>
            )}
          </section>
        )}

          {/* 模型部署列表与新增：仅在部署选项卡显示 */}
          {mainTab === "deployments" && (
            <section className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-purple-50 border border-purple-100 text-[#805ad5] flex items-center justify-center font-bold shadow-2xs">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 tracking-tight">模型部署 (Deployments)</h2>
                    <p className="text-xs text-slate-500 font-medium">
                      管理具体模型代号、上下文上限、组件能力声明及 Token 计费单价
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                    {deployments.length} 款模型
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddDeployment(!showAddDeployment)}
                    className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddDeployment ? "收起表单" : "新增模型部署"}</span>
                    {showAddDeployment ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 新增模型部署表单（受控折叠，大厂高扩展性设计，通俗易懂） */}
              {showAddDeployment && (
                <div className="m-6 p-5 rounded-lg border border-purple-200/80 bg-purple-50/20 shadow-2xs space-y-4 animate-in fade-in-50 duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-3">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <Plus className="w-4 h-4 text-[#3182ce]" />
                      <span>新增模型部署（支持任意上游模型与通用通道接入）</span>
                    </div>

                    {/* 快捷参考模版：大厂一键预设填入，不限制手动自由修改，通用开放架构 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-500">快速填入模版：</span>
                      {[
                        {
                          name: "DeepSeek",
                          modelId: "deepseek-chat",
                          upstream: "deepseek-chat",
                          display: "DeepSeek V3",
                          context: "64000",
                          caps: ["chat", "code", "long-context"],
                        },
                        {
                          name: "通义千问",
                          modelId: "qwen-plus",
                          upstream: "qwen-plus",
                          display: "通义千问 Plus",
                          context: "131072",
                          caps: ["chat", "code", "function-calling"],
                        },
                        {
                          name: "Claude",
                          modelId: "claude-3-5-sonnet",
                          upstream: "claude-3-5-sonnet-20241022",
                          display: "Claude 3.5 Sonnet",
                          context: "200000",
                          caps: ["chat", "code", "vision", "long-context"],
                        },
                        {
                          name: "OpenAI",
                          modelId: "gpt-4o",
                          upstream: "gpt-4o",
                          display: "GPT-4o (Omni)",
                          context: "128000",
                          caps: ["chat", "code", "vision", "function-calling"],
                        },
                        {
                          name: "通用开源/私有",
                          modelId: "custom-model",
                          upstream: "custom-model",
                          display: "通用开源大模型",
                          context: "32000",
                          caps: ["chat"],
                        },
                      ].map((tpl) => (
                        <button
                          key={tpl.name}
                          type="button"
                          onClick={() => {
                            setDForm((prev) => ({
                              ...prev,
                              providerId: prev.providerId || providers[0]?.name || "",
                              modelId: tpl.modelId,
                              upstreamModel: tpl.upstream,
                              displayName: tpl.display,
                              contextLimit: tpl.context,
                              capabilities: tpl.caps.filter((c) => capabilityOptions.some((o) => o.value === c)),
                            }));
                            setDErrors({});
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-slate-600 hover:text-[#3182ce] hover:bg-blue-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer active:scale-95"
                          title={`点击填入 ${tpl.name} 推荐参数`}
                        >
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 1. 所属供应商通道 */}
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-slate-700">所属供应商通道 <span className="text-red-500 font-bold ml-0.5">*</span></span>
                      <select
                        id="deployment-input-providerId"
                        className={getInputCls(!!dErrors.providerId, "font-bold cursor-pointer")}
                        value={dForm.providerId}
                        onChange={(e) => {
                          setDForm({ ...dForm, providerId: e.target.value });
                          if (dErrors.providerId) setDErrors({ ...dErrors, providerId: undefined });
                        }}
                      >
                        <option value="">请选择供应商通道</option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name} {p.enabled ? "（已启用）" : "（已禁用）"}
                          </option>
                        ))}
                      </select>
                      <span className="block text-[11px] text-slate-400">
                        {providers.length === 0 ? "暂无通道，请先在供应商通道标签页新增" : "选择承载该模型的厂商网关或私有服务"}
                      </span>
                      {dErrors.providerId && (
                        <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{dErrors.providerId}</span>
                        </p>
                      )}
                    </label>

                    {/* 2. 平台内部模型标识 */}
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-slate-700">平台模型代号 (modelId) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                      <input
                        id="deployment-input-modelId"
                        className={getInputCls(!!dErrors.modelId)}
                        maxLength={128}
                        placeholder="如 deepseek-chat、qwen-plus"
                        value={dForm.modelId}
                        onChange={(e) => {
                          setDForm({ ...dForm, modelId: e.target.value });
                          if (dErrors.modelId) setDErrors({ ...dErrors, modelId: undefined });
                        }}
                        onBlur={(e) => autoFetchContext(e.target.value, dForm.upstreamModel)}
                      />
                      <span className="block text-[11px] text-slate-400">系统内部调度与组件绑定的唯一标识</span>
                      {dErrors.modelId && (
                        <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{dErrors.modelId}</span>
                        </p>
                      )}
                    </label>

                    {/* 3. 上游厂商模型真实名称 */}
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-slate-700">上游厂商模型名 (upstreamModel)</span>
                      <input
                        className={inputCls}
                        maxLength={128}
                        placeholder="如厂商要求的真实参数名；若与代号相同可留空"
                        value={dForm.upstreamModel}
                        onChange={(e) => setDForm({ ...dForm, upstreamModel: e.target.value })}
                        onBlur={(e) => autoFetchContext(dForm.modelId, e.target.value)}
                      />
                      <span className="block text-[11px] text-slate-400">向厂商接口实际下发的 model 参数；留空默认使用代号</span>
                    </label>

                    {/* 4. 用户端友好展示名称 */}
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-slate-700">界面直观展示名 (displayName)</span>
                      <input
                        className={inputCls}
                        maxLength={64}
                        placeholder="如 DeepSeek V3 官方版、通义千问 Plus"
                        value={dForm.displayName}
                        onChange={(e) => setDForm({ ...dForm, displayName: e.target.value })}
                      />
                      <span className="block text-[11px] text-slate-400">在工作台模型下拉框中呈现给普通用户的友好名称</span>
                    </label>

                    {/* 5. 上下文窗口上限 */}
                    <label className="block space-y-1 sm:col-span-2">
                      <span className="text-xs font-bold text-slate-700">上下文窗口上限 (Token) <span className="text-red-500 font-bold ml-0.5">*</span></span>
                      <div className="relative">
                        <input
                          id="deployment-input-contextLimit"
                          className={`${getInputCls(!!dErrors.contextLimit)} ${
                            ctxInfo.found ? "pr-24 bg-slate-50 text-slate-600 cursor-not-allowed" : ""
                          }`}
                          placeholder={ctxInfo.loading ? "正在从官方目录获取..." : "如 32000、64000、128000"}
                          value={dForm.contextLimit}
                          readOnly={ctxInfo.found}
                          onChange={(e) => {
                            setDForm({ ...dForm, contextLimit: e.target.value });
                            if (dErrors.contextLimit) setDErrors({ ...dErrors, contextLimit: undefined });
                          }}
                        />
                        {ctxInfo.found && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#2b6cb0] border border-blue-200">
                            官方目录自动匹配
                          </span>
                        )}
                      </div>

                      {/* 常用规格快捷胶囊 */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[11px] text-slate-400">常用规格：</span>
                        {[
                          { label: "32K (3.2万)", val: "32000" },
                          { label: "64K (6.4万)", val: "64000" },
                          { label: "128K (12.8万)", val: "128000" },
                          { label: "200K (20万)", val: "200000" },
                          { label: "1M (百万Token)", val: "1000000" },
                        ].map((spec) => (
                          <button
                            key={spec.label}
                            type="button"
                            onClick={() => {
                              setDForm((f) => ({ ...f, contextLimit: spec.val }));
                              if (dErrors.contextLimit) setDErrors((prev) => ({ ...prev, contextLimit: undefined }));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                              dForm.contextLimit === spec.val
                                ? "bg-[#3182ce] text-white border-[#3182ce]"
                                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-[#3182ce]"
                            }`}
                          >
                            {spec.label}
                          </button>
                        ))}
                      </div>

                      {ctxInfo.found ? (
                        <span className="block text-[11px] text-emerald-600 font-bold">
                          来源：{ctxInfo.source}
                          {ctxInfo.matchedKey ? `（${ctxInfo.matchedKey}）` : ""}
                          {ctxInfo.outputLimit ? `，输出上限 ${ctxInfo.outputLimit}` : ""}
                        </span>
                      ) : ctxInfo.tried && !ctxInfo.loading ? (
                        <span className="block text-[11px] text-amber-600 font-bold">
                          未在公开目录匹配到该模型，支持手工直接输入或点击上方常用规格
                        </span>
                      ) : (
                        <span className="block text-[11px] text-slate-400">
                          输入模型代号后系统会自动尝试匹配官方规格，亦可手动自定
                        </span>
                      )}
                      {dErrors.contextLimit && (
                        <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{dErrors.contextLimit}</span>
                        </p>
                      )}
                    </label>

                    {/* 6. 支持的功能特性（模型能力标签） */}
                    <div className="space-y-1.5 sm:col-span-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          支持的功能特性 (模型能力标签) <span className="text-red-500 font-bold ml-0.5">*</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDForm((prev) => ({
                                ...prev,
                                capabilities: capabilityOptions.map((o) => o.value),
                              }))
                            }
                            className="text-[11px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                          >
                            全选
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setDForm((prev) => ({ ...prev, capabilities: [] }))}
                            className="text-[11px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                          >
                            清空
                          </button>
                        </div>
                      </div>

                      <div id="create-capability-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                        {capabilityOptions.map((opt) => {
                          const checked = (dForm.capabilities as string[]).includes(opt.value);
                          return (
                            <button
                              type="button"
                              key={opt.value}
                              onClick={() =>
                                setDForm({
                                  ...dForm,
                                  capabilities: checked
                                    ? (dForm.capabilities as string[]).filter((v) => v !== opt.value)
                                    : [...(dForm.capabilities as string[]), opt.value],
                                })
                              }
                              className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                checked
                                  ? "bg-blue-50/80 text-[#2b6cb0] border-[#3182ce] shadow-2xs ring-1 ring-[#3182ce]/20"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                              }`}
                            >
                              <span
                                className={`w-4 h-4 mt-0.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                                  checked ? "bg-[#3182ce] border-[#3182ce] text-white" : "border-slate-300 bg-white"
                                }`}
                              >
                                {checked && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-xs font-black leading-tight">{opt.label}</div>
                                {opt.description && (
                                  <div className="text-[11px] text-slate-500 font-normal leading-normal">
                                    {opt.description}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {dErrors.capabilities && (
                        <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{dErrors.capabilities}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 快速指引卡片：通俗易懂大白话 */}
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed">
                    💡 <b>快速指引</b>：模型部署创建完成后默认为【已禁用】维护状态；请在列表操作列点击【配置价格】设定 Token 计费单价，确认无误后再点击【启用】，全站组件即可正常调用该模型。
                  </div>

                  <div className="pt-1 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      disabled={busy === "d:create"}
                      onClick={() => {
                        setDForm({
                          providerId: "",
                          modelId: "",
                          upstreamModel: "",
                          displayName: "",
                          contextLimit: "32000",
                          capabilities: [],
                        });
                        setDErrors({});
                        setCtxInfo({ loading: false, tried: false, found: false });
                      }}
                      title="清空当前输入的所有模型部署信息与勾选能力"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                      <span>清空重填</span>
                    </button>
                    <button
                      type="button"
                      className={`${btnCls} flex items-center gap-1.5`}
                      disabled={busy === "d:create"}
                      onClick={createDeployment}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{busy === "d:create" ? "正在创建..." : "确认新增模型部署"}</span>
                    </button>
                  </div>
                </div>
              )}

          {/* 模型部署「测试模型」结果反馈：定位到列表上方 */}
          <div ref={deploymentResultRef}>
            {testResult && deployments.some((d) => d.id === testResult.id) && testResultBanner}
          </div>

          {/* 部署筛选与快捷操作栏 */}
          <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  className="w-full pl-8.5 pr-8 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]"
                  placeholder="按模型代号、展示名或上游代号搜索..."
                  value={deploymentSearch}
                  onChange={(e) => {
                    setDeploymentSearch(e.target.value);
                    setDeploymentPage(1);
                  }}
                />
                {deploymentSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeploymentSearch("");
                      setDeploymentPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-bold focus:outline-none focus:border-[#3182ce] cursor-pointer"
                value={deploymentProviderFilter}
                onChange={(e) => {
                  setDeploymentProviderFilter(e.target.value);
                  setDeploymentPage(1);
                }}
              >
                <option value="ALL">全部供应商 ({providers.length})</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-bold focus:outline-none focus:border-[#3182ce] cursor-pointer"
                value={deploymentStatusFilter}
                onChange={(e) => {
                  setDeploymentStatusFilter(e.target.value);
                  setDeploymentPage(1);
                }}
              >
                <option value="ALL">全部状态</option>
                <option value="ENABLED">仅已启用</option>
                <option value="DISABLED">仅已禁用</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>共找到 <b className="text-slate-800 font-mono">{filteredDeployments.length}</b> 款部署</span>
              {(deploymentSearch || deploymentProviderFilter !== "ALL" || deploymentStatusFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setDeploymentSearch("");
                    setDeploymentProviderFilter("ALL");
                    setDeploymentStatusFilter("ALL");
                    setDeploymentPage(1);
                  }}
                  className="text-[11px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                >
                  重置筛选
                </button>
              )}
            </div>
          </div>

          {/* 模型部署列表表格 */}
          <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px] table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-y border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">供应商</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">模型标识</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">展示名 / 上游名称</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">上下文</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">声明能力</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">计费单价(百万TOKEN)</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">状态</th>
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedDeployments.map((d) => (
                    <tr key={d.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-700 font-bold whitespace-nowrap">{d.providerId}</td>
                      <td className="px-6 py-3.5 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
                        <span className="text-[#3182ce]">{d.modelId}</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="font-bold text-slate-800">{d.displayName || d.modelId}</span>
                          {d.upstreamModel && d.upstreamModel !== (d.displayName || d.modelId) && (
                            <span className="text-[11px] font-mono text-slate-400">({d.upstreamModel})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {d.contextLimit ? `${(d.contextLimit / 1000).toFixed(0)}K` : "32K"}
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
                          {Array.isArray(d.capabilities) && d.capabilities.length > 0 ? (
                            d.capabilities.map((c) => (
                              <span
                                key={c}
                                className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/80 whitespace-nowrap"
                              >
                                {capabilityOptions.find((o) => o.value === c)?.label ?? c}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                              未声明能力
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 align-top">
                        {d.pricing ? (
                          <div className="flex flex-col gap-1">
                            {(() => {
                              // 当前生效价 + 归属：有直配售价走「直配」；否则按 成本×(1+加价率/10000) 派生（成本×加成）
                              const hasDirect =
                                d.pricing!.priceInputMicrosPerMillion !== null && d.pricing!.priceOutputMicrosPerMillion !== null;
                              const derivedIn =
                                d.pricing!.costInputMicrosPerMillion != null && d.pricing!.markupRateBps != null
                                  ? d.pricing!.costInputMicrosPerMillion * (1 + d.pricing!.markupRateBps / 10000)
                                  : null;
                              const derivedOut =
                                d.pricing!.costOutputMicrosPerMillion != null && d.pricing!.markupRateBps != null
                                  ? d.pricing!.costOutputMicrosPerMillion * (1 + d.pricing!.markupRateBps / 10000)
                                  : null;
                              const effIn = hasDirect ? d.pricing!.priceInputMicrosPerMillion : derivedIn;
                              const effOut = hasDirect ? d.pricing!.priceOutputMicrosPerMillion : derivedOut;
                              return (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs text-slate-800 font-bold whitespace-nowrap">
                                    生效价 入: {effIn === null || effIn === undefined ? "—" : `¥${(effIn / 1_000_000).toFixed(2)}`} / 出: {effOut === null || effOut === undefined ? "—" : `¥${(effOut / 1_000_000).toFixed(2)}`}
                                  </span>
                                  {hasDirect ? (
                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                                      归属：直配
                                    </span>
                                  ) : derivedIn != null ? (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 whitespace-nowrap">
                                      归属：成本×加成 +{(d.pricing!.markupRateBps! / 100).toFixed(2)}%
                                    </span>
                                  ) : null}
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                                    v{d.pricing!.priceVersion} · {priceStatusLabel(d.pricing!.priceStatus)}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                              成本 入 {d.pricing.costInputMicrosPerMillion === null ? "—" : `¥${(d.pricing.costInputMicrosPerMillion / 1_000_000).toFixed(2)}`} / 出 {d.pricing.costOutputMicrosPerMillion === null ? "—" : `¥${(d.pricing.costOutputMicrosPerMillion / 1_000_000).toFixed(2)}`}
                              {(() => {
                                const c = cacheCostText(d.pricing.costCacheReadMicrosPerMillion, d.pricing.costCacheWriteMicrosPerMillion);
                                return c ? ` · ${c}` : "";
                              })()}
                            </div>
                            <RulesSummaryChips rules={d.pricing.rules} />
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs whitespace-nowrap">未配置价格</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${
                              !d.enabled
                                ? "bg-slate-100 text-slate-500 border-slate-200"
                                : providers.find((p) => p.name === d.providerId)?.enabled === false
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {!d.enabled
                              ? "已禁用"
                              : providers.find((p) => p.name === d.providerId)?.enabled === false
                                ? "通道已禁用"
                                : "已启用"}
                          </span>
                          {platformDefault?.deploymentId === d.id && (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#2b6cb0] border border-blue-200 text-[10px] font-black">
                              平台默认
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="sticky right-0 bg-white group-hover:bg-blue-50/50 backdrop-blur-xs z-10 px-6 py-3 text-right whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. 测试通道：探针连通性测试（无论启禁用均可测试健康连通性） */}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white border border-cyan-200/80 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                            disabled={testingId === d.id || !canTestDeployment(d, providers)}
                            onClick={() => testDeployment(d)}
                            title={
                              !canTestDeployment(d, providers)
                                ? testBlockReason(d, providers) ?? "无法执行通道测试"
                                : "用该部署所属供应商端点与密钥真实发一次最小调用，验证模型连通性"
                            }
                          >
                            {testingId === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <TestTube className="w-3.5 h-3.5" />
                            )}
                            <span>测试通道</span>
                          </button>

                          {/* 2. 状态切换：启用 / 禁用 */}
                          {providers.find((p) => p.name === d.providerId)?.enabled === false ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded font-bold text-xs cursor-not-allowed"
                              title="该部署所属供应商通道已禁用，此模型当前无法被组件执行；请先在供应商通道列表启用该通道"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>通道已停用</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 ${
                                d.enabled
                                  ? "bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white border border-amber-200/80"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200/80"
                              }`}
                              disabled={busy === `d:${d.id}`}
                              onClick={() => toggleDeployment(d)}
                              title={d.enabled ? "禁用该模型部署" : "启用该模型部署"}
                            >
                              {d.enabled ? (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>禁用</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>启用</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* 3. 严格状态互锁：仅在【已禁用】状态下，才允许配置价格、能力以及更多操作（编辑部署/删除部署）；已启用在线服务期间严禁篡改 */}
                          {!d.enabled && (
                            <>
                              {/* 配置价格按钮（外置核心操作） */}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-[#2b6cb0] hover:bg-[#3182ce] hover:text-white border border-blue-200/80 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
                                onClick={() => openPrice(d)}
                                title="配置价格（成本底价、用户售价、分时段策略与规则）"
                              >
                                <Coins className="w-3.5 h-3.5" />
                                <span>配置价格</span>
                              </button>

                              {/* 能力快捷声明（外置核心操作） */}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200/80 rounded font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
                                onClick={() => openCapabilityPanel(d)}
                                title="配置该模型声明的组件能力"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>能力</span>
                              </button>

                              {/* 更多操作菜单按钮：仅提供编辑部署与删除部署，杜绝重复项 */}
                              <button
                                type="button"
                                className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 border ${
                                  actionMenu?.id === d.id
                                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                                    : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 border-slate-200"
                                }`}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setActionMenu((prev) =>
                                    prev?.id === d.id
                                      ? null
                                      : { id: d.id, top: rect.bottom + 6, right: window.innerWidth - rect.right }
                                  );
                                }}
                                title="更多操作（编辑部署 / 删除部署）"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredDeployments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <span className="text-xs font-bold text-slate-500">
                          {deploymentSearch || deploymentProviderFilter !== "ALL" || deploymentStatusFilter !== "ALL"
                            ? "未找到符合筛选条件的模型部署"
                            : "暂无模型部署"}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 模型部署列表分页 */}
            {filteredDeployments.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={deploymentPage}
                  totalItems={filteredDeployments.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setDeploymentPage(p)}
                  itemLabel="个模型部署"
                />
              </div>
            )}
          </section>
        )}

          {/* 部署行「⋯」更多操作下拉菜单：仅在已禁用态下供维护，且仅包含编辑部署与删除部署，杜绝重复项 */}
          {actionMenu &&
            (() => {
              const menuDep = deployments.find((x) => x.id === actionMenu.id);
              if (!menuDep || menuDep.enabled) return null;
              const menuItems: {
                label: string;
                icon: ReactNode;
                cls: string;
                action: () => void;
              }[] = [
                {
                  label: "编辑部署",
                  icon: <Settings className="w-3.5 h-3.5" />,
                  cls: "text-slate-700 hover:bg-slate-100",
                  action: () => openDeploymentEdit(menuDep),
                },
                {
                  label: "删除部署",
                  icon: <Trash2 className="w-3.5 h-3.5" />,
                  cls: "text-rose-600 hover:bg-rose-50",
                  action: () => deleteDeployment(menuDep),
                },
              ];
              return (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setActionMenu(null)} />
                  <div
                    className="fixed z-[60] w-36 bg-white rounded-lg border border-slate-200 shadow-xl py-1 animate-in fade-in-50 zoom-in-95 duration-150"
                    style={{ top: actionMenu.top, right: actionMenu.right }}
                  >
                    {menuItems.map((it) => (
                      <button
                        key={it.label}
                        type="button"
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${it.cls}`}
                        onClick={() => {
                          setActionMenu(null);
                          it.action();
                        }}
                      >
                        {it.icon}
                        <span>{it.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

          {/* 价格配置模态弹窗 (遵循知阁·舟坊设计系统与系统级 Modal 规范) */}
          {pricePanelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-4xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                {/* 弹窗头部 Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Coins className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-slate-800 tracking-tight">
                          价格配置 · {priceDep ? `${priceDep.providerId}/${priceDep.modelId}` : pricePanelId}
                        </h3>
                        {priceInfo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
                            v{priceInfo.priceVersion} · {priceStatusLabel(priceInfo.priceStatus)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        配置该模型的供应商成本底价与平台用户端划扣单价，单位：元 / 100万 Token
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={tryClosePricePanel}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 价格弹窗三选项卡导航 */}
                <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200/90 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPriceModalTab("base")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        priceModalTab === "base"
                          ? "bg-white text-[#3182ce] shadow-xs border border-blue-200"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                      }`}
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>核心定价与加价</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPriceModalTab("periods")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        priceModalTab === "periods"
                          ? "bg-white text-purple-700 shadow-xs border border-purple-200"
                          : "text-slate-600 hover:text-purple-900 hover:bg-slate-200/60"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>分时定价策略</span>
                      {pricePeriods.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700 font-mono font-bold">
                          {pricePeriods.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPriceModalTab("rules")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        priceModalTab === "rules"
                          ? "bg-white text-teal-700 shadow-xs border border-teal-200"
                          : "text-slate-600 hover:text-teal-900 hover:bg-slate-200/60"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>官方参考与规则</span>
                      {(rulesForm.usdInput || rulesForm.evidenceUrl || rulesForm.subAppliesTo || rulesForm.customRules.length > 0) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      )}
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                    1元 = 1,000,000 微元
                  </span>
                </div>

                {/* 弹窗主体 Body */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
                  {priceModalTab === "base" && (
                    <>
                  {/* 说明提示条 */}
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                    <div>
                      平台采用<b>微元</b>（1 元 = 1,000,000 微元）进行纳秒级精确算力核算。修改价格保存后仅对新任务生效，历史已生成账单快照严格锁定不变。
                      <br />
                      <b>两处加价率的分工：</b>结算时先按当前时间匹配时段——<b>命中时段</b>就完全按该时段自己的定价（它的直接售价，或它的成本 × (1 + 该时段加价率/10000)）；
                      <b>未命中任何时段</b>才回退主流价（主流价的直接售价，或主流价成本 × (1 + 主流价加价率/10000)）。两层互不叠加、互不继承。
                    </div>
                  </div>

                  {/* 启用态冻结提示 */}
                  {priceDep?.enabled ? (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded text-xs text-amber-800 leading-relaxed flex items-start gap-2.5">
                      <span className="text-base leading-none shrink-0 mt-0.5">🔒</span>
                      <div>
                        <b>该模型当前处于「启用」状态：保存将被拒绝。</b>
                        <br />
                        启用中的模型禁止改价（防止运行中的任务计费口径被偷改）。请先在列表中<b>停用</b>该模型 → 保存价格 → 再<b>启用</b>。
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded text-xs text-emerald-800 leading-relaxed flex items-start gap-2.5">
                      <span className="text-base leading-none shrink-0 mt-0.5">✅</span>
                      <div>
                        模型已停用，可直接改价。填好后点底部<b>「保存并重新启用模型」</b>可保存价格并一键恢复启用，无需手动切回。
                      </div>
                    </div>
                  )}

                  {/* 板块 1：结算规则与状态 */}
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-[#3182ce] before:rounded-full">
                      结算规则与生效期
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold flex items-center gap-0.5">
                          币种 <span className="text-red-500 font-bold">*</span>
                        </span>
                        <input
                          id="price-input-currency"
                          className={getInputCls(!!priceErrors.currency)}
                          placeholder="如 CNY / USD"
                          value={priceForm.currency}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, currency: e.target.value });
                            if (priceErrors.currency) setPriceErrors({ ...priceErrors, currency: undefined });
                          }}
                        />
                        {priceErrors.currency && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.currency}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">价格来源状态</span>
                        <select
                          className={inputCls}
                          value={priceForm.priceSource}
                          onChange={(e) => setPriceForm({ ...priceForm, priceSource: e.target.value })}
                        >
                          <option value="UNVERIFIED">未验证</option>
                          <option value="OBSERVED_ONLY">仅观测</option>
                          <option value="VERIFIED">已验证</option>
                        </select>
                        <p
                          className={
                            "text-[11px] leading-relaxed mt-1 " +
                            (priceForm.priceSource === "VERIFIED"
                              ? "text-emerald-600"
                              : priceForm.priceSource === "OBSERVED_ONLY"
                                ? "text-amber-600"
                                : "text-slate-400")
                          }
                        >
                          {priceForm.priceSource === "VERIFIED"
                            ? "已验证：抄自供应商官网/合同的真实价格。提交后系统自动判定为「已生效」，计费会正式采信这组价格。"
                            : priceForm.priceSource === "OBSERVED_ONLY"
                              ? "仅观测：只记录真实调用观测到的成本，不能当成确认售价，结算不予采信（不可用于扣费）。"
                              : "未验证：仅作占位/草稿。哪怕填了数字，系统也按「未配置」处理，计费不采信（不会真扣）。"}
                        </p>
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold">平台加价率</span>
                          <MarkupModeSwitch
                            mode={priceMarkupInherit ? "inherit" : priceMarkupMode}
                            onModeChange={(m) => {
                              if (m === "inherit") {
                                setPriceMarkupInherit(true);
                                setPriceMarkupInput("");
                                setPriceForm({ ...priceForm, markupRateBps: "" });
                              } else {
                                setPriceMarkupInherit(false);
                                setPriceMarkupMode(m);
                                // 切换模式时自动折算显示串（落库基点值不变）
                                setPriceMarkupInput(m === "percent" ? bpsToPercentStr(priceForm.markupRateBps) : priceForm.markupRateBps);
                              }
                            }}
                            disabled={priceUserFilled}
                          />
                        </div>
                        {priceMarkupInherit ? (
                          <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1 leading-relaxed">
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              已选「继承全局默认」：本模型不单独设加价率，结算按平台全局
                              {globalMarkupPercent != null ? ` +${globalMarkupPercent}%` : ""}
                              派生（在顶部卡片「设为默认」调整即对本模型生效）。
                            </span>
                          </p>
                        ) : (
                          <>
                            <input
                              id="price-input-markupRateBps"
                              type="number"
                              min={0}
                              step={priceMarkupMode === "percent" ? 0.01 : 1}
                              className={`${getInputCls(!!priceErrors.markupRateBps)} ${priceUserFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                              placeholder={priceMarkupMode === "percent" ? "如 20 = 加价 20%" : "如 2000 = 加价 20%"}
                              value={priceMarkupInput}
                              disabled={priceUserFilled}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setPriceMarkupInput(raw);
                                setPriceForm({ ...priceForm, markupRateBps: priceMarkupMode === "percent" ? percentToBpsStr(raw) : raw });
                                if (priceErrors.markupRateBps) setPriceErrors({ ...priceErrors, markupRateBps: undefined });
                              }}
                            />
                            <span className="block text-[10px] text-slate-400 font-mono">
                              落库值：{priceForm.markupRateBps.trim() === "" ? "（未填）" : `${priceForm.markupRateBps} bp`}
                            </span>
                          </>
                        )}
                        {priceErrors.markupRateBps && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.markupRateBps}</span>
                          </p>
                        )}
                        {/* 两种定价模式互斥：实时提示，避免保存时才被接口拒绝 */}
                        {(() => {
                          if (priceUserFilled) {
                            return (
                              <p className="text-[11px] text-sky-600 font-medium mt-1 flex items-center gap-1 leading-relaxed">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                <span>已选「直接定价」：你已填写用户端售价，本项「平台加价率」已自动置灰（二选一）。如需改用成本加成模式，请先清空上面的用户端售价。</span>
                              </p>
                            );
                          }
                          if (priceMarkupFilled) {
                            return (
                              <p className="text-[11px] text-sky-600 font-medium mt-1 flex items-center gap-1 leading-relaxed">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                <span>已选「成本加成」：本项已填，用户端售价 4 个输入框已自动置灰；实际售价由系统按「售价 = 供应商成本 × (1 + 加价率/10000)」自动算出（需同时填写供应商成本）。换算：1% = 100 基点（1bp = 0.01%）。注意：顶部「全局加价率 → 一键同步」会把全部价格（含本行）统一覆盖。</span>
                              </p>
                            );
                          }
                          return (
                            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                              定价模式二选一（系统按填写自动判定）：① 本项留空 + 填「用户端售价」= 直接定价，用户被扣多少就按你填的售价；
                              ② 本项填值 + 「用户端售价」全留空 + 填「供应商成本」= 成本加成，售价由系统自动算：售价 = 成本 × (1 + bp/10000)。
                            </p>
                          );
                        })()}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">生效时间</span>
                        <input
                          type="date"
                          className={inputCls}
                          value={priceForm.effectiveFrom}
                          onChange={(e) => setPriceForm({ ...priceForm, effectiveFrom: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 板块 2：供应商成本底价（元 / 100万 Token） */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-slate-500 before:rounded-full">
                        供应商上游成本底价
                      </h4>
                      <span className="text-[11px] text-slate-400 font-mono">单位: 元 / 100万 Token</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输入 Token 成本</span>
                        <input
                          id="price-input-costInput"
                          className={getInputCls(!!priceErrors.costInput)}
                          placeholder="如 2.50"
                          value={priceForm.costInput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costInput: e.target.value });
                            if (priceErrors.costInput) setPriceErrors({ ...priceErrors, costInput: undefined });
                          }}
                        />
                        {priceErrors.costInput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costInput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输出 Token 成本</span>
                        <input
                          id="price-input-costOutput"
                          className={getInputCls(!!priceErrors.costOutput)}
                          placeholder="如 10.00"
                          value={priceForm.costOutput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costOutput: e.target.value });
                            if (priceErrors.costOutput) setPriceErrors({ ...priceErrors, costOutput: undefined });
                          }}
                        />
                        {priceErrors.costOutput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costOutput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存命中读取成本</span>
                        <input
                          id="price-input-costCacheRead"
                          className={getInputCls(!!priceErrors.costCacheRead)}
                          placeholder="如 0.50"
                          value={priceForm.costCacheRead}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costCacheRead: e.target.value });
                            if (priceErrors.costCacheRead) setPriceErrors({ ...priceErrors, costCacheRead: undefined });
                          }}
                        />
                        {priceErrors.costCacheRead && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costCacheRead}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存写入成本</span>
                        <input
                          id="price-input-costCacheWrite"
                          className={getInputCls(!!priceErrors.costCacheWrite)}
                          placeholder="如 2.50"
                          value={priceForm.costCacheWrite}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, costCacheWrite: e.target.value });
                            if (priceErrors.costCacheWrite) setPriceErrors({ ...priceErrors, costCacheWrite: undefined });
                          }}
                        />
                        {priceErrors.costCacheWrite && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.costCacheWrite}</span>
                          </p>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 板块 3：用户端售价定价（元 / 100万 Token） */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-[#3182ce] before:rounded-full">
                        用户端划扣售价
                      </h4>
                      <span className="text-[11px] text-[#3182ce] font-bold">实际扣费依据 · 单位: 元 / 100万 Token</span>
                    </div>
                    {priceMarkupFilled && (
                      <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-700 font-bold leading-relaxed">
                        当前为「成本加成」模式：加价率 {priceForm.markupRateBps} bp（+
                        {Number(priceForm.markupRateBps || 0) / 100}%），下面售价由系统按「成本 × (1 + bp/10000)」
                        实时算出，会随你修改加价率或成本立即变化。
                        {priceDerived && (
                          <span className="ml-1 font-mono">
                            推算结果：输入 {priceDerived.priceInput ?? "—"} / 输出 {priceDerived.priceOutput ?? "—"}
                            {priceDerived.priceCacheRead != null ? ` / 缓存读 ${priceDerived.priceCacheRead}` : ""}
                            {priceDerived.priceCacheWrite != null ? ` / 缓存写 ${priceDerived.priceCacheWrite}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输入 Token 售价</span>
                        <input
                          id="price-input-priceInput"
                          className={`${getInputCls(!!priceErrors.priceInput)} ${priceMarkupFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                          disabled={priceMarkupFilled}
                          placeholder="如 3.00"
                          value={priceMarkupFilled ? (priceDerived?.priceInput != null ? String(priceDerived.priceInput) : "") : priceForm.priceInput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceInput: e.target.value });
                            if (priceErrors.priceInput) setPriceErrors({ ...priceErrors, priceInput: undefined });
                          }}
                        />
                        {priceErrors.priceInput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceInput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">输出 Token 售价</span>
                        <input
                          id="price-input-priceOutput"
                          className={`${getInputCls(!!priceErrors.priceOutput)} ${priceMarkupFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                          disabled={priceMarkupFilled}
                          placeholder="如 12.00"
                          value={priceMarkupFilled ? (priceDerived?.priceOutput != null ? String(priceDerived.priceOutput) : "") : priceForm.priceOutput}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceOutput: e.target.value });
                            if (priceErrors.priceOutput) setPriceErrors({ ...priceErrors, priceOutput: undefined });
                          }}
                        />
                        {priceErrors.priceOutput && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceOutput}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存命中读取售价</span>
                        <input
                          id="price-input-priceCacheRead"
                          className={`${getInputCls(!!priceErrors.priceCacheRead)} ${priceMarkupFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                          disabled={priceMarkupFilled}
                          placeholder="如 0.60"
                          value={priceMarkupFilled ? (priceDerived?.priceCacheRead != null ? String(priceDerived.priceCacheRead) : "") : priceForm.priceCacheRead}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceCacheRead: e.target.value });
                            if (priceErrors.priceCacheRead) setPriceErrors({ ...priceErrors, priceCacheRead: undefined });
                          }}
                        />
                        {priceErrors.priceCacheRead && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceCacheRead}</span>
                          </p>
                        )}
                      </label>

                      <label className="text-xs text-slate-700 space-y-1 block">
                        <span className="font-bold">缓存写入售价</span>
                        <input
                          id="price-input-priceCacheWrite"
                          className={`${getInputCls(!!priceErrors.priceCacheWrite)} ${priceMarkupFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                          disabled={priceMarkupFilled}
                          placeholder="如 3.00"
                          value={priceMarkupFilled ? (priceDerived?.priceCacheWrite != null ? String(priceDerived.priceCacheWrite) : "") : priceForm.priceCacheWrite}
                          onChange={(e) => {
                            setPriceForm({ ...priceForm, priceCacheWrite: e.target.value });
                            if (priceErrors.priceCacheWrite) setPriceErrors({ ...priceErrors, priceCacheWrite: undefined });
                          }}
                        />
                        {priceErrors.priceCacheWrite && (
                          <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{priceErrors.priceCacheWrite}</span>
                          </p>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 算力毛利实时推演卡片 (Simulation Strip) */}
                  {(() => {
                    const cIn = Number(priceForm.costInput) || 0;
                    const cOut = Number(priceForm.costOutput) || 0;
                    const pIn = priceMarkupFilled
                      ? (Number(priceDerived?.priceInput) || 0)
                      : (Number(priceForm.priceInput) || 0);
                    const pOut = priceMarkupFilled
                      ? (Number(priceDerived?.priceOutput) || 0)
                      : (Number(priceForm.priceOutput) || 0);

                    if (!cIn && !cOut && !pIn && !pOut) return null;

                    const simInTokens = 0.7;
                    const simOutTokens = 0.3;
                    const simCost = (cIn * simInTokens) + (cOut * simOutTokens);
                    const simRevenue = (pIn * simInTokens) + (pOut * simOutTokens);
                    const simMargin = simRevenue - simCost;
                    const simMarginPct = simRevenue > 0 ? (simMargin / simRevenue) * 100 : 0;

                    return (
                      <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-slate-50 border border-blue-200/80 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-[#3182ce]" />
                            <span>工况沙盘推演（标准工况：70万输入 + 30万输出 = 100万 Token）</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {priceMarkupFilled ? `成本加成 +${(Number(priceForm.markupRateBps || 0) / 100).toFixed(2)}%` : "直接零售定价"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className="bg-white/80 rounded-lg p-2 border border-slate-200/70">
                            <div className="text-[10px] text-slate-500 font-bold">预估综合成本</div>
                            <div className="font-mono font-bold text-slate-800 text-sm mt-0.5">
                              ¥{simCost.toFixed(3)}
                            </div>
                          </div>
                          <div className="bg-white/80 rounded-lg p-2 border border-slate-200/70">
                            <div className="text-[10px] text-slate-500 font-bold">预估用户扣费</div>
                            <div className="font-mono font-bold text-[#3182ce] text-sm mt-0.5">
                              ¥{simRevenue.toFixed(3)}
                            </div>
                          </div>
                          <div className="bg-white/80 rounded-lg p-2 border border-slate-200/70">
                            <div className="text-[10px] text-slate-500 font-bold">预估单次毛利</div>
                            <div className={`font-mono font-bold text-sm mt-0.5 ${simMargin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {simMargin >= 0 ? `+¥${simMargin.toFixed(3)}` : `-¥${Math.abs(simMargin).toFixed(3)}`}
                            </div>
                          </div>
                          <div className="bg-white/80 rounded-lg p-2 border border-slate-200/70">
                            <div className="text-[10px] text-slate-500 font-bold">综合毛利率</div>
                            <div className={`font-mono font-bold text-sm mt-0.5 ${simMarginPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {simRevenue > 0 ? `${simMarginPct.toFixed(1)}%` : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* 板块：官方参考价与特殊规则（仅在官方规则选项卡显示） */}
              {priceModalTab === "rules" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-teal-500 before:rounded-full">
                      官方参考价与特殊规则
                    </h4>
                      <span className="text-[11px] text-slate-400 font-medium">以下均为「参考/标记」信息，可留空；不影响实际计费</span>
                    </div>

                    {/* USD 官网参考价 + 实时对比 */}
                    <div className="space-y-2 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                      <div className="text-[11px] font-bold text-slate-700">厂商官网美元参考价（USD / 百万 Token）</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">输入</span>
                          <input id="rules-usd-input" className={inputCls} placeholder="如 1.40" value={rulesForm.usdInput} onChange={(e) => setRulesForm({ ...rulesForm, usdInput: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">缓存命中</span>
                          <input id="rules-usd-cacheRead" className={inputCls} placeholder="如 0.26" value={rulesForm.usdCacheRead} onChange={(e) => setRulesForm({ ...rulesForm, usdCacheRead: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">输出</span>
                          <input id="rules-usd-output" className={inputCls} placeholder="如 4.40" value={rulesForm.usdOutput} onChange={(e) => setRulesForm({ ...rulesForm, usdOutput: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">汇率 1 USD = ¥</span>
                          <input id="rules-usd-rate" className={inputCls} placeholder="如 7.2" value={rulesForm.usdRate} onChange={(e) => setRulesForm({ ...rulesForm, usdRate: e.target.value })} />
                        </label>
                      </div>
                      {(() => {
                        const usdIn = Number(rulesForm.usdInput);
                        const rate = Number(rulesForm.usdRate);
                        const cnyIn = Number(priceForm.priceInput);
                        const offCny = usdIn > 0 && rate > 0 ? usdIn * rate : 0;
                        if (!offCny && !(cnyIn > 0)) return null;
                        return (
                          <div className="rounded bg-white/70 border border-slate-200 px-2 py-1 space-y-0.5 text-[10px] text-slate-600">
                            {offCny > 0 && (
                              <div>
                                官网输入 ${usdIn.toFixed(2)} ≈ <b>¥{offCny.toFixed(2)}</b> / 百万 Token
                                {cnyIn > 0 && (
                                  <span className={cnyIn >= offCny ? "text-rose-500" : "text-emerald-600"}>
                                    {" "}
                                    · 你的售价 ¥{cnyIn.toFixed(2)}（{cnyIn >= offCny ? "溢价" : "折扣"} {Math.abs(((cnyIn - offCny) / offCny) * 100).toFixed(1)}%）
                                  </span>
                                )}
                              </div>
                            )}
                            {!offCny && cnyIn > 0 && (
                              <div>填写「官网美元价 + 汇率」可自动算出你的售价相对官网的溢价 / 折扣。</div>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-[10px] text-slate-400 leading-relaxed">仅用于对比展示，不参与实际扣费；留空则不计算对比。</p>
                    </div>

                    {/* 缓存存储 + 计费公式 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-xs text-slate-600 space-y-1 block">
                        <span className="font-bold">缓存存储如何计费</span>
                        <select id="rules-cacheStorage" className={inputCls} value={rulesForm.cacheStorage} onChange={(e) => setRulesForm({ ...rulesForm, cacheStorage: e.target.value })}>
                          {CACHE_STORAGE_OPTIONS.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-600 space-y-1 block">
                        <span className="font-bold">计费公式（计费口径）</span>
                        <select
                          id="rules-billingFormula"
                          className={inputCls}
                          value={rulesForm.billingFormula}
                          onChange={(e) => setRulesForm({ ...rulesForm, billingFormula: e.target.value })}
                        >
                          {BILLING_FORMULA_OPTIONS.map(([, l]) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                          {rulesForm.billingFormula !== "" && !BILLING_FORMULA_OPTIONS.some(([, l]) => l === rulesForm.billingFormula) && (
                            <option value={rulesForm.billingFormula}>{rulesForm.billingFormula}</option>
                          )}
                        </select>
                        {rulesForm.billingFormula !== "" && !BILLING_FORMULA_OPTIONS.some(([, l]) => l === rulesForm.billingFormula) ? (
                          <input
                            className={`${inputCls} mt-1`}
                            placeholder="自定义计费说明，如：按字符数计费"
                            value={rulesForm.billingFormula}
                            onChange={(e) => setRulesForm({ ...rulesForm, billingFormula: e.target.value })}
                          />
                        ) : null}
                      </label>
                    </div>

                    {/* 官方价目凭据归档（evidenceUrl）：定价依据可追溯 */}
                    <label className="text-xs text-slate-600 space-y-1 block">
                      <span className="font-bold flex items-center gap-1">
                        官方价目凭据归档（evidenceUrl）
                        {rulesForm.evidenceUrl.trim() !== "" && (
                          <a
                            href={rulesForm.evidenceUrl.trim()}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-bold text-[#3182ce] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            查看凭据 ↗
                          </a>
                        )}
                      </span>
                      <input
                        id="rules-evidenceUrl"
                        className={inputCls}
                        placeholder="官方定价页 / 价目公告截图链接，如 https://…"
                        value={rulesForm.evidenceUrl}
                        onChange={(e) => setRulesForm({ ...rulesForm, evidenceUrl: e.target.value })}
                      />
                      <span className="text-[10px] text-slate-400 leading-relaxed block">归档本次录价的官方依据（GLM-5.3 等已录官方价必须补归档），便于审计追溯。</span>
                    </label>

                    {/* 订阅套餐积分抵扣系数（GLM 类特有，默认折叠） */}
                    <details className="group rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                      <summary className="cursor-pointer select-none text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="text-slate-400 group-open:hidden">▸</span>
                        <span className="hidden group-open:inline text-slate-400">▾</span>
                        订阅套餐积分抵扣系数（仅 GLM 类需要，点开填写）
                      </summary>
                      <div className="space-y-3 pt-3">
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">适用模型</span>
                          <input id="rules-sub-appliesTo" className={inputCls} placeholder="如 GLM-5.3-Flash" value={rulesForm.subAppliesTo} onChange={(e) => setRulesForm({ ...rulesForm, subAppliesTo: e.target.value })} />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5 rounded border border-amber-200/70 bg-amber-50/30 p-2">
                            <div className="text-[11px] font-bold text-amber-700">高峰时段</div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">输入</span>
                                <input id="rules-sub-peak-input" className={inputCls} placeholder="如 23.438" value={rulesForm.subPeakInput} onChange={(e) => setRulesForm({ ...rulesForm, subPeakInput: e.target.value })} />
                              </label>
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">缓存</span>
                                <input id="rules-sub-peak-cacheRead" className={inputCls} placeholder="如 4.688" value={rulesForm.subPeakCacheRead} onChange={(e) => setRulesForm({ ...rulesForm, subPeakCacheRead: e.target.value })} />
                              </label>
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">输出</span>
                                <input id="rules-sub-peak-output" className={inputCls} placeholder="如 78.125" value={rulesForm.subPeakOutput} onChange={(e) => setRulesForm({ ...rulesForm, subPeakOutput: e.target.value })} />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1.5 rounded border border-sky-200/70 bg-sky-50/30 p-2">
                            <div className="text-[11px] font-bold text-sky-700">空闲时段（留空=高峰×50%）</div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">输入</span>
                                <input id="rules-sub-idle-input" className={inputCls} placeholder="如 11.719" value={rulesForm.subIdleInput} onChange={(e) => setRulesForm({ ...rulesForm, subIdleInput: e.target.value })} />
                              </label>
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">缓存</span>
                                <input id="rules-sub-idle-cacheRead" className={inputCls} placeholder="如 2.344" value={rulesForm.subIdleCacheRead} onChange={(e) => setRulesForm({ ...rulesForm, subIdleCacheRead: e.target.value })} />
                              </label>
                              <label className="text-[10px] text-slate-600 space-y-1 block">
                                <span className="font-bold">输出</span>
                                <input id="rules-sub-idle-output" className={inputCls} placeholder="如 39.0625" value={rulesForm.subIdleOutput} onChange={(e) => setRulesForm({ ...rulesForm, subIdleOutput: e.target.value })} />
                              </label>
                            </div>
                          </div>
                        </div>
                        <label className="text-xs text-slate-600 space-y-1 block">
                          <span className="font-bold">备注</span>
                          <input id="rules-sub-note" className={inputCls} placeholder="如 空闲=高峰×50%" value={rulesForm.subNote} onChange={(e) => setRulesForm({ ...rulesForm, subNote: e.target.value })} />
                        </label>
                      </div>
                    </details>

                    {/* 其他自定义规则（键—值，默认折叠，未来任何模型扩展都在此添加） */}
                    <details className="group rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                      <summary className="cursor-pointer select-none text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="text-slate-400 group-open:hidden">▸</span>
                        <span className="hidden group-open:inline text-slate-400">▾</span>
                        其他自定义规则（新增模型规则点此添加，无需写代码）
                      </summary>
                      <div className="space-y-2 pt-3">
                        {rulesForm.customRules.length === 0 && (
                          <div className="text-[11px] text-slate-400">暂无自定义规则。下方可添加任意「键—值」，例如 最小起订量 minOrder=1。</div>
                        )}
                        {rulesForm.customRules.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              className={`${inputCls} flex-1`}
                              placeholder="规则键名（英文，如 minOrder）"
                              value={item.key}
                              onChange={(e) => setRulesForm({ ...rulesForm, customRules: rulesForm.customRules.map((c, i) => (i === idx ? { ...c, key: e.target.value } : c)) })}
                            />
                            <input
                              className={`${inputCls} flex-1`}
                              placeholder="值（数字 / true / 文本）"
                              value={item.value}
                              onChange={(e) => setRulesForm({ ...rulesForm, customRules: rulesForm.customRules.map((c, i) => (i === idx ? { ...c, value: e.target.value } : c)) })}
                            />
                            <button
                              type="button"
                              className="px-2 py-1.5 rounded bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
                              onClick={() => setRulesForm({ ...rulesForm, customRules: rulesForm.customRules.filter((_, i) => i !== idx) })}
                            >
                              删除
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setRulesForm({ ...rulesForm, customRules: [...rulesForm.customRules, { key: "", value: "" }] })}
                        >
                          + 添加一条规则
                        </button>
                      </div>
                    </details>
                  </div>
                )}

                {/* 板块 4：时段价格（仅在分时定价策略选项卡显示） */}
                {priceModalTab === "periods" && (
                  <>
                    <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 before:content-[''] before:w-1 before:h-3.5 before:bg-purple-500 before:rounded-full">
                        时段价格策略（覆盖主流价）
                      </h4>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-bold hover:bg-purple-100 transition-colors cursor-pointer"
                        onClick={() => openPeriodEditor()}
                      >
                        + 新增时段
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      为闲时 / 高峰 / 节假日等自定义时段设置不同单价；结算时按当前时钟+日期自动选用命中的时段价，无命中则回退上面的主流价。每条可启用 / 禁用 / 编辑 / 删除。
                    </p>
                    {pricePeriods.length === 0 ? (
                      <div className="text-[11px] text-slate-400 bg-slate-50/60 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                        暂无时段价格，当前仅使用主流价。
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pricePeriods.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 bg-slate-50/60 border border-slate-200/80 rounded-lg p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-800">{p.name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                                  {p.kind === "IDLE" ? "闲时" : p.kind === "PEAK" ? "高峰" : p.kind === "HOLIDAY" ? "节假日" : "自定义"}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    p.enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                                  }`}
                                >
                                  {p.enabled ? "已启用" : "已禁用"}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{periodScheduleText(p)}</div>
                              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span>
                                  <span className="text-slate-400">用户售价</span> 输入 {microsToYuan(p.priceInputMicrosPerMillion)} / 输出{" "}
                                  {microsToYuan(p.priceOutputMicrosPerMillion)} <span className="text-slate-400">元/百万</span>
                                </span>
                                {p.costInputMicrosPerMillion != null && (
                                  <span>
                                    <span className="text-slate-400">平台成本</span> 输入 {microsToYuan(p.costInputMicrosPerMillion)} / 输出{" "}
                                    {microsToYuan(p.costOutputMicrosPerMillion)} <span className="text-slate-400">元/百万</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                              <input type="checkbox" className="sr-only peer" checked={p.enabled} onChange={() => togglePeriod(p)} />
                              <div className="w-9 h-5 bg-slate-200 peer-checked:bg-[#3182ce] rounded-full transition-colors" />
                              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                            </label>
                            <button
                              type="button"
                              className="text-[11px] text-slate-500 hover:text-[#3182ce] font-bold cursor-pointer shrink-0"
                              onClick={() => openPeriodEditor(p)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer shrink-0"
                              onClick={() => deletePeriod(p.id)}
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 时段价格编辑子面板 */}
                  {periodPanel.open && (
                    <div className="space-y-3 border border-purple-200/70 rounded-xl p-3.5 bg-purple-50/30">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-purple-700">{periodPanel.editingId ? "编辑时段价格" : "新增时段价格"}</h5>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                          onClick={() => setPeriodPanel({ open: false, editingId: null })}
                        >
                          收起
                        </button>
                      </div>
                      {/* 覆盖警示：时段价优先于主流价；直配售价会覆盖加价率派生 */}
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <b>覆盖警示：</b>命中该时段时<b>完全按时段定价</b>，主流价不参与、不叠加。推荐只填<b>成本 + 加价率</b>（售价由系统按 成本 × (1 + 加价率/10000) 派生，跟随全局调价）；
                          若同时填了<b>直配售价</b>，将以直配售价为准，加价率派生被覆盖。
                          {priceDep?.enabled ? (
                            <>
                              <br />
                              <b>注意：该模型启用中，保存时段将被拒绝</b>（需先停用 → 修改 → 再启用）。
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">
                            时段名称 <span className="text-red-500">*</span>
                          </span>
                          <input
                            className={getInputCls(!!periodErrors.name)}
                            placeholder="如 闲时"
                            value={periodForm.name}
                            onChange={(e) => {
                              setPeriodForm({ ...periodForm, name: e.target.value });
                              if (periodErrors.name) setPeriodErrors({ ...periodErrors, name: undefined });
                            }}
                          />
                          {periodErrors.name && <p className="text-[11px] text-red-500">{periodErrors.name}</p>}
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">类型</span>
                          <select className={inputCls} value={periodForm.kind} onChange={(e) => setPeriodForm({ ...periodForm, kind: e.target.value })}>
                            <option value="IDLE">闲时</option>
                            <option value="PEAK">高峰</option>
                            <option value="HOLIDAY">节假日</option>
                            <option value="CUSTOM">自定义</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">优先级</span>
                          <input className={inputCls} placeholder="0" value={periodForm.priority} onChange={(e) => setPeriodForm({ ...periodForm, priority: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 flex items-center gap-2">
                          <input type="checkbox" checked={periodForm.enabled} onChange={(e) => setPeriodForm({ ...periodForm, enabled: e.target.checked })} />
                          <span className="font-bold">启用该时段</span>
                        </label>
                        <div className="text-xs text-slate-700 space-y-1 sm:col-span-2">
                          <span className="font-bold">适用星期</span>
                          <div className="flex flex-wrap gap-1.5">
                            {WD_OPTIONS.map(([v, label]) => {
                              const checked = (periodForm.weekdays || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .includes(v);
                              const disabled = periodForm.kind === "HOLIDAY";
                              return (
                                <label
                                  key={v}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                                    disabled
                                      ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200"
                                      : checked
                                        ? "bg-[#3182ce] text-white border-[#3182ce]"
                                        : "bg-white border-slate-200 hover:border-[#3182ce]/50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => {
                                      const set = new Set(
                                        (periodForm.weekdays || "")
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      );
                                      if (set.has(v)) set.delete(v);
                                      else set.add(v);
                                      setPeriodForm({ ...periodForm, weekdays: Array.from(set).sort().join(",") });
                                    }}
                                  />
                                  {label}
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                            {periodForm.kind === "HOLIDAY"
                              ? "节假日时段按国务院官方日历自动匹配，无需选择星期。"
                              : "不选 = 每天生效；高峰通常勾选周一~周五（1-5）。"}
                          </p>
                        </div>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">开始时间</span>
                          <input type="time" className={inputCls} value={periodForm.startTime} onChange={(e) => setPeriodForm({ ...periodForm, startTime: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">结束时间</span>
                          <input type="time" className={inputCls} value={periodForm.endTime} onChange={(e) => setPeriodForm({ ...periodForm, endTime: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">起始日期</span>
                          <input type="date" className={inputCls} value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">结束日期</span>
                          <input type="date" className={inputCls} value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <span className="font-bold">价格来源状态</span>
                          <select className={inputCls} value={periodForm.priceSource} onChange={(e) => setPeriodForm({ ...periodForm, priceSource: e.target.value })}>
                            <option value="UNVERIFIED">未验证</option>
                            <option value="OBSERVED_ONLY">仅观测</option>
                            <option value="VERIFIED">已验证</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-700 space-y-1 block">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold">平台加价率</span>
                            <MarkupModeSwitch
                              mode={periodMarkupInherit ? "inherit" : periodMarkupMode}
                              onModeChange={(m) => {
                                if (m === "inherit") {
                                  setPeriodMarkupInherit(true);
                                  setPeriodMarkupInput("");
                                  setPeriodForm({ ...periodForm, markupRateBps: "" });
                                } else {
                                  setPeriodMarkupInherit(false);
                                  setPeriodMarkupMode(m);
                                  setPeriodMarkupInput(m === "percent" ? bpsToPercentStr(periodForm.markupRateBps) : periodForm.markupRateBps);
                                }
                              }}
                              disabled={periodUserFilled}
                            />
                          </div>
                          {periodMarkupInherit ? (
                            <p className="text-[11px] text-emerald-600 leading-relaxed">
                              已选「继承全局默认」：本时段不单独设加价率，按平台全局
                              {globalMarkupPercent != null ? ` +${globalMarkupPercent}%` : ""}
                              派生。
                            </p>
                          ) : (
                            <>
                              <input
                                type="number"
                                min={0}
                                step={periodMarkupMode === "percent" ? 0.01 : 1}
                                className={`${inputCls} ${periodUserFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                                placeholder={periodMarkupMode === "percent" ? "如 20 = 20%，留空走直接定价" : "如 2000=20%，留空走直接定价"}
                                value={periodMarkupInput}
                                disabled={periodUserFilled}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPeriodMarkupInput(raw);
                                  setPeriodForm({ ...periodForm, markupRateBps: periodMarkupMode === "percent" ? percentToBpsStr(raw) : raw });
                                }}
                              />
                              <span className="block text-[10px] text-slate-400 font-mono">
                                落库值：{periodForm.markupRateBps.trim() === "" ? "（未填）" : `${periodForm.markupRateBps} bp`}
                              </span>
                            </>
                          )}
                          {periodUserFilled ? (
                            <p className="text-[11px] text-sky-600 leading-relaxed">已填用户端售价，本项自动置灰（二选一）。</p>
                          ) : periodMarkupFilled ? (
                            <p className="text-[11px] text-sky-600 leading-relaxed">已选成本加成：售价 = 成本 × (1 + bp/10000)，用户端售价自动置灰。1% = 100 基点；顶部「全局同步」会覆盖本值。</p>
                          ) : null}
                        </label>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-600 mb-1">供应商成本（元 / 100万 Token）</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            ["costInput", "输入"],
                            ["costOutput", "输出"],
                            ["costCacheRead", "缓存命中读取"],
                            ["costCacheWrite", "缓存写入"],
                          ].map(([k, label]) => (
                            <label key={k} className="text-xs text-slate-700 space-y-1 block">
                              <span className="font-bold">{label}</span>
                              <input
                                className={inputCls}
                                placeholder="0"
                                value={(periodForm as unknown as Record<string, string>)[k]}
                                onChange={(e) => setPeriodForm({ ...periodForm, [k]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-600 mb-1">用户端售价（元 / 100万 Token）</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            ["priceInput", "输入"],
                            ["priceOutput", "输出"],
                            ["priceCacheRead", "缓存命中读取"],
                            ["priceCacheWrite", "缓存写入"],
                          ].map(([k, label]) => (
                            <label key={k} className="text-xs text-slate-700 space-y-1 block">
                              <span className="font-bold">{label}</span>
                              <input
                                className={`${inputCls} ${periodMarkupFilled ? "opacity-50 cursor-not-allowed bg-slate-100" : ""}`}
                                placeholder="0"
                                value={(periodForm as unknown as Record<string, string>)[k]}
                                disabled={periodMarkupFilled}
                                onChange={(e) => setPeriodForm({ ...periodForm, [k]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded text-[11px] font-bold hover:bg-slate-50 cursor-pointer"
                          onClick={() => setPeriodPanel({ open: false, editingId: null })}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-[#3182ce] text-white rounded text-[11px] font-bold hover:bg-[#2b6cb0] cursor-pointer disabled:opacity-50"
                          disabled={busy === `period:${pricePanelId}`}
                          onClick={savePeriod}
                        >
                          {periodPanel.editingId ? "更新时段" : "新增时段"}
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </div>

                {/* 弹窗底部 Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={tryClosePricePanel}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `price:${pricePanelId}`}
                    onClick={() => {
                      if (periodPanel.open) {
                        toast.error("时段正在编辑中：请先点「更新时段」保存该时段，或点「取消」放弃修改。时段与主流价各自独立保存。");
                        return;
                      }
                      const dep = deployments.find((x) => x.id === pricePanelId);
                      if (dep) void savePrice(dep);
                    }}
                  >
                    {busy === `price:${pricePanelId}` ? "正在保存..." : "保存主流价（时段各自单独保存）"}
                  </button>
                  {/* 模型已停用（启用态禁止改价）：保存后一键重新启用，闭环「停用→改价→启用」 */}
                  {priceDep?.enabled === false && (
                    <button
                      type="button"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={busy === `price:${pricePanelId}`}
                      onClick={() => {
                        if (periodPanel.open) {
                          toast.error("时段正在编辑中：请先点「更新时段」保存该时段，或点「取消」放弃修改。时段与主流价各自独立保存。");
                          return;
                        }
                        const dep = deployments.find((x) => x.id === pricePanelId);
                        if (dep) void savePriceAndEnable(dep);
                      }}
                      title="该模型已停用，保存价格后自动重新启用"
                    >
                      {busy === `price:${pricePanelId}` ? "正在保存..." : "保存并重新启用模型"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 能力配置模态弹窗 (遵循知阁·舟坊设计系统与系统级 Modal 规范) */}
          {capabilityPanelId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-3xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <SlidersHorizontal className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight min-w-0 truncate flex items-center gap-1.5">
                        <span>模型能力声明 · {capDep ? `${capDep.providerId}/${capDep.modelId}` : capabilityPanelId}</span>
                        <span className="text-red-500 font-bold ml-0.5">*</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        声明该模型具备的能力（必填，至少勾选一项），决定组件能否正常使用它运行
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCapabilityPanelId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body 内容 */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                    <div>
                      组件的「执行合同」会声明其依赖的能力。只有当模型勾选的能力<b>完全覆盖</b>该组件所需的能力时，用户点击运行才不会报错「能力不满足」。例如带文档/附件的组件依赖「文本生成」与「长上下文」，视觉组件依赖「图片理解」。
                    </div>
                  </div>

                  {capError && (
                    <div className="p-3 bg-red-50/90 border border-red-300 text-xs text-red-600 font-bold rounded flex items-center gap-2 animate-in fade-in-50 duration-200">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{capError}</span>
                    </div>
                  )}

                  {capabilityOptions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-amber-700 font-bold bg-amber-50 rounded border border-amber-200">
                      未能加载可选能力清单（可能为权限不足），请刷新重试或联系超级管理员。
                    </div>
                  ) : (
                    <div id="capability-options-grid" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {capabilityOptions.map((opt) => {
                        const isChecked = capabilityDraft.includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-start gap-3 border rounded-xl p-3.5 cursor-pointer transition-all ${
                              isChecked
                                ? "border-[#3182ce] bg-blue-50/60 shadow-xs ring-1 ring-[#3182ce]/20"
                                : "border-slate-200/90 bg-white hover:border-blue-200 hover:bg-slate-50/60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer accent-[#3182ce]"
                              checked={isChecked}
                              onChange={(e) => {
                                setCapabilityDraft(
                                  e.target.checked
                                    ? [...capabilityDraft, opt.value]
                                    : capabilityDraft.filter((v) => v !== opt.value)
                                );
                                if (capError) setCapError(null);
                              }}
                            />
                            <div className="text-xs min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-black ${isChecked ? "text-[#2b6cb0]" : "text-slate-800"}`}>
                                  {opt.label}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                  {opt.value}
                                </span>
                              </div>
                              <span className="block text-slate-500 text-[11px] leading-relaxed">
                                {opt.description}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {capabilityOptions.length > 0 && capabilityDraft.length === 0 && !capError && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 text-xs text-amber-700 font-bold rounded flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>提示：当前未勾选任何能力，所有声明了能力要求的组件都将被系统判定不可执行。</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setCapabilityPanelId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `cap:${capabilityPanelId}` || capabilityOptions.length === 0}
                    onClick={() => {
                      const dep = deployments.find((x) => x.id === capabilityPanelId);
                      if (dep) void saveCapabilities(dep);
                    }}
                  >
                    {busy === `cap:${capabilityPanelId}` ? "正在保存..." : "确认保存模型能力"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 供应商编辑模态弹窗（name 为稳定标识不可改，仅改协议 / Base URL / 密钥环境变量） */}
          {editProviderId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-2xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Settings className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight">编辑供应商通道</h3>
                      <p className="text-xs text-slate-500 font-medium font-mono truncate mt-0.5">
                        {editProviderName}（系统稳定标识不可修改）
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditProviderId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">接口协议</span>
                    <select
                      className={inputCls}
                      value={pEditForm.protocol}
                      onChange={(e) => setPEditForm({ ...pEditForm, protocol: e.target.value })}
                    >
                      <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE（OpenAI / DeepSeek / Ollama / vLLM 等兼容网关）</option>
                      <option value="ANTHROPIC">ANTHROPIC（Claude）</option>
                      <option value="GEMINI">GEMINI（Google Gemini）</option>
                    </select>
                    <span className="block text-[11px] text-slate-400">目前平台统一按 OpenAI 兼容格式分发</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">
                      Base URL（必须为 https 地址） <span className="text-red-500 font-bold ml-0.5">*</span>
                    </span>
                    <input
                      id="edit-provider-input-baseUrl"
                      className={getInputCls(!!pEditErrors.baseUrl)}
                      value={pEditForm.baseUrl}
                      onChange={(e) => {
                        setPEditForm({ ...pEditForm, baseUrl: e.target.value });
                        if (pEditErrors.baseUrl) setPEditErrors({ ...pEditErrors, baseUrl: undefined });
                      }}
                    />
                    {pEditErrors.baseUrl && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{pEditErrors.baseUrl}</span>
                      </p>
                    )}
                    <span className="block text-[11px] text-slate-400">平台会自动拼接 /chat/completions</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">
                      密钥环境变量名 <span className="text-slate-400 font-normal">（可选，本地/自托管模型可留空）</span>
                    </span>
                    <input
                      id="edit-provider-input-apiKeyEnv"
                      className={getInputCls(!!pEditErrors.apiKeyEnv)}
                      maxLength={128}
                      value={pEditForm.apiKeyEnv}
                      onChange={(e) => {
                        setPEditForm({ ...pEditForm, apiKeyEnv: e.target.value });
                        if (pEditErrors.apiKeyEnv) setPEditErrors({ ...pEditErrors, apiKeyEnv: undefined });
                      }}
                    />
                    {pEditErrors.apiKeyEnv && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{pEditErrors.apiKeyEnv}</span>
                      </p>
                    )}
                    <span className="block text-[11px] text-slate-400">仅保存环境变量键名，密钥不入库；留空表示模型无需密钥（本地/自托管模型）</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      API Key
                      {editingProvider?.hasApiKey ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          已配置（密文落库，明文不展示）
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">（可选，留空则不修改现有密钥）</span>
                      )}
                    </span>

                    {/* 已配置且未进入更换模式：脱敏展示 + 眼睛切换 + 更换密钥 */}
                    {editingProvider?.hasApiKey && !replaceKeyMode ? (
                      <div className="flex items-center gap-2">
                        <input
                          type={showMaskedKey ? "text" : "password"}
                          readOnly
                          value={showMaskedKey ? (editingProvider?.apiKeyMasked || "••••••••") : "••••••••"}
                          className={getInputCls(false) + " bg-slate-50 text-slate-500"}
                        />
                        <button
                          type="button"
                          className="shrink-0 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                          onClick={() => setShowMaskedKey((v) => !v)}
                          title="显示/隐藏脱敏明文（仅前 6 + 后 4 位，非完整明文）"
                        >
                          {showMaskedKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
                          onClick={() => {
                            setReplaceKeyMode(true);
                            setShowMaskedKey(false);
                            setPEditForm((f) => ({ ...f, apiKey: "" }));
                          }}
                        >
                          更换密钥
                        </button>
                        <button
                          type="button"
                          className="shrink-0 px-3 py-2 rounded-lg border border-[#3182ce]/30 bg-[#3182ce]/5 text-[#3182ce] text-xs font-bold hover:bg-[#3182ce]/10 transition-colors cursor-pointer disabled:opacity-50"
                          disabled={providerTesting}
                          onClick={testProviderKey}
                          title="用该供应商下已启用部署真实调用一次上游，验证钥匙是否可用（明文密钥不出服务端）"
                        >
                          {providerTesting ? "测试中..." : "测试连通"}
                        </button>
                      </div>
                    ) : (
                      /* 未配置 或 更换中：直接录入新钥匙 */
                      <div className="flex items-center gap-2">
                        <input
                          id="edit-provider-input-apiKey"
                          type={showMaskedKey ? "text" : "password"}
                          autoComplete="new-password"
                          className={getInputCls(false)}
                          placeholder={editingProvider?.hasApiKey ? "输入新钥匙（留空则保留现有密钥）" : "sk-... 录入后由服务端加密存储"}
                          value={pEditForm.apiKey}
                          onChange={(e) => setPEditForm({ ...pEditForm, apiKey: e.target.value })}
                        />
                        <button
                          type="button"
                          className="shrink-0 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                          onClick={() => setShowMaskedKey((v) => !v)}
                          title="显示/隐藏输入内容"
                        >
                          {showMaskedKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {replaceKeyMode && (
                          <button
                            type="button"
                            className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                            onClick={() => {
                              setReplaceKeyMode(false);
                              setPEditForm((f) => ({ ...f, apiKey: "" }));
                            }}
                          >
                            取消更换
                          </button>
                        )}
                        <button
                          type="button"
                          className="shrink-0 px-3 py-2 rounded-lg border border-[#3182ce]/30 bg-[#3182ce]/5 text-[#3182ce] text-xs font-bold hover:bg-[#3182ce]/10 transition-colors cursor-pointer disabled:opacity-50"
                          disabled={providerTesting}
                          onClick={testProviderKey}
                          title="用该供应商下已启用部署真实调用一次上游，验证钥匙是否可用（明文密钥不出服务端）"
                        >
                          {providerTesting ? "测试中..." : "测试连通"}
                        </button>
                      </div>
                    )}

                    <span className="block text-[11px] text-slate-400">
                      与「密钥环境变量名」二选一，密文优先；明文不在数据库落地。点击眼睛仅可查看脱敏后的部分明文（前 6 + 后 4 位），完整明文不会下发到浏览器。系统取钥匙顺序：后台密文 → 环境变量兜底。
                    </span>
                    {providerTest && (
                      <span
                        className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${providerTest.ok ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {providerTest.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>
                          {providerTest.ok
                            ? `连通成功（耗时 ${providerTest.latencyMs ?? "?"}ms）`
                            : `${providerTest.label ?? "不通"}：${providerTest.message ?? ""}`}
                        </span>
                      </span>
                    )}
                  </label>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setEditProviderId(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `p:edit:${editProviderId}`}
                    onClick={saveProviderEdit}
                  >
                    {busy === `p:edit:${editProviderId}` ? "正在保存..." : "确认保存"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 部署编辑模态弹窗（providerId / modelId 为稳定标识不可改，仅改上游名 / 展示名 / 上下文） */}
          {editDeploymentId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-2xl overflow-hidden border border-slate-200/90 flex flex-col max-h-[90vh]">
                {/* 顶部品牌光泽装饰线 */}
                <div className="h-1 w-full bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#63b3ed] shrink-0" />

                <div className="px-6 py-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-xs shrink-0 ring-4 ring-blue-500/10">
                      <Settings className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-800 tracking-tight">编辑模型部署</h3>
                      <p className="text-xs text-slate-500 font-medium font-mono truncate mt-0.5">
                        {editDeploymentMeta.providerId}/{editDeploymentMeta.modelId}（系统稳定标识不可修改）
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditDeploymentId(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">上游模型真实名称</span>
                    <input
                      className={inputCls}
                      placeholder="真正下发厂商的 model（留空则以下方代号下发）"
                      value={dEditForm.upstreamModel}
                      onChange={(e) => setDEditForm({ ...dEditForm, upstreamModel: e.target.value })}
                      onBlur={() => autoFetchEditContext()}
                    />
                    <span className="block text-[11px] text-slate-400">留空则默认下发模型标识</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-700">用户端展示名称</span>
                    <input
                      className={inputCls}
                      placeholder="如 DeepSeek V3 极速版"
                      value={dEditForm.displayName}
                      onChange={(e) => setDEditForm({ ...dEditForm, displayName: e.target.value })}
                    />
                    <span className="block text-[11px] text-slate-400">在工作区与调用模型选择器中展示给普通用户的易读名称</span>
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        上下文窗口上限 (Token) <span className="text-red-500 font-bold">*</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => autoFetchEditContext()}
                          disabled={ctxEditInfo.loading}
                          className="px-2 py-0.5 rounded-[8px] text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {ctxEditInfo.loading ? "获取中..." : "从官方目录获取"}
                        </button>
                        <span className="text-[10px] text-slate-400 font-medium">快捷填入:</span>
                        {[
                          { label: "32K", val: "32000" },
                          { label: "64K", val: "64000" },
                          { label: "128K", val: "128000" },
                          { label: "200K", val: "200000" },
                          { label: "1M", val: "1000000" },
                        ].map((preset) => (
                          <button
                            type="button"
                            key={preset.label}
                            onClick={() => {
                              setDEditForm({ ...dEditForm, contextLimit: preset.val });
                              if (dEditErrors.contextLimit) setDEditErrors({ ...dEditErrors, contextLimit: undefined });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                              dEditForm.contextLimit === preset.val
                                ? "bg-blue-50 text-[#3182ce] border-blue-200"
                                : "bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:text-[#3182ce]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      id="edit-deployment-input-contextLimit"
                      className={`${getInputCls(!!dEditErrors.contextLimit)} ${
                        ctxEditInfo.found ? "bg-slate-50 text-slate-600 cursor-not-allowed" : ""
                      }`}
                      placeholder={ctxEditInfo.loading ? "正在从官方目录获取..." : "如 32000、64000、128000"}
                      value={dEditForm.contextLimit}
                      readOnly={ctxEditInfo.found}
                      onChange={(e) => {
                        setDEditForm({ ...dEditForm, contextLimit: e.target.value });
                        if (dEditErrors.contextLimit) setDEditErrors({ ...dEditErrors, contextLimit: undefined });
                      }}
                    />
                    {ctxEditInfo.found ? (
                      <span className="block text-[11px] text-emerald-600 font-bold">
                        来源：{ctxEditInfo.source}
                        {ctxEditInfo.matchedKey ? `（${ctxEditInfo.matchedKey}）` : ""}
                        {ctxEditInfo.outputLimit ? `，输出上限 ${ctxEditInfo.outputLimit}` : ""}
                      </span>
                    ) : ctxEditInfo.tried && !ctxEditInfo.loading ? (
                      <span className="block text-[11px] text-amber-600 font-bold">未匹配到，可手写核实后保存</span>
                    ) : null}
                    {dEditErrors.contextLimit && (
                      <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{dEditErrors.contextLimit}</span>
                      </p>
                    )}
                  </label>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/70 shrink-0">
                  <button
                    type="button"
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                    onClick={() => {
                      setEditDeploymentId(null);
                      setCtxEditInfo({ loading: false, tried: false, found: false });
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={btnCls}
                    disabled={busy === `d:edit:${editDeploymentId}`}
                    onClick={saveDeploymentEdit}
                  >
                    {busy === `d:edit:${editDeploymentId}` ? "正在保存..." : "确认保存"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {/* 全局二次确认弹窗（对齐全站其它管理页面规范，彻底替换原生 alert/confirm） */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        warnings={confirmDialog.warnings}
        confirmText={confirmDialog.confirmText || "确认"}
        type={confirmDialog.type || "danger"}
        onConfirm={async () => {
          // 先立即关闭弹窗，删除请求转为后台执行，避免弹窗卡在请求完成（约 2 秒）后才关闭
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          await confirmDialog.onConfirm();
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 供应商创建成功后的系统建议引导弹窗（严格遵循设计系统规范） */}
      {createdProviderGuidance.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-800">
                  供应商通道创建成功
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  已成功接入通道 <span className="font-mono font-bold text-[#3182ce] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">{createdProviderGuidance.providerName}</span>。
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded text-xs text-amber-800 space-y-1.5 leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>系统建议：立即配置配套模型</span>
              </div>
              <p>
                仅配置供应商通道时，全站组件由于尚未绑定具体模型，仍无法调度该通道。系统建议您立即为该通道添加第一款模型部署，以便顺利开始对话与任务。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCreatedProviderGuidance({ isOpen: false, providerName: "" })}
                className="px-4 py-2 rounded text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer shadow-2xs active:scale-95"
              >
                稍后配置
              </button>
              <button
                type="button"
                onClick={() => goToDeployModelForProvider(createdProviderGuidance.providerName)}
                className="px-4 py-2 rounded text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>立即配置模型部署</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
