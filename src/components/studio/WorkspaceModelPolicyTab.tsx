"use client";

/**
 * 空间「模型」Tab（WorkspaceInternalLayoutV3 内嵌页签）
 *
 * 三个子页签：
 *  ① 系统分配模型：只读展示平台管理员分配给本空间的模型；空间所有者/管理员可「设为空间默认」；
 *     全体成员可在已分配模型中「选用」（与组件工坊运行抽屉同源，工坊运行时默认生效）。
 *  ② 自建调用模型(自带私有模型)：展示本空间配置的自带私有模型，可跳转完整管理页。
 *  ③ 模型调用详细情况：按模型聚合 + 任务级调用明细（来源：tokensettlement.pricingSnapshot）。
 */
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { MODEL_CAPABILITY_LABELS } from "@/lib/model-capability-labels";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import ModelPricingRules from "@/components/ModelPricingRules";
import {
  Cpu,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  Info,
  Loader2,
  RefreshCw,
  Check,
  Building2,
  Wand2,
  Lock,
  Star,
  BarChart3,
  Clock3,
  Table2,
  ListTree,
  Server,
  Users,
  User,
  FileSignature,
  Send,
  ThumbsUp,
  ThumbsDown,
  X,
} from "lucide-react";

/* ---------------- 类型（与现有接口同口径） ---------------- */

interface PoolModel {
  id: string;
  providerId?: string;
  providerName?: string;
  providerCode?: string;
  modelId?: string;
  modelCode?: string;
  name?: string;
  displayName?: string;
  upstreamModel?: string;
  capabilities: string[];
  contextLimit?: number;
  pricing?: {
    inputPricePerK?: number;
    outputPricePerK?: number;
    priceInputMicrosPerMillion?: number | null;
    priceOutputMicrosPerMillion?: number | null;
    priceCacheReadMicrosPerMillion?: number | null;
    priceCacheWriteMicrosPerMillion?: number | null;
  } | null;
  isSpaceDefault?: boolean;
  /** 当前用户对该模型的申请状态（PENDING/APPROVED/REJECTED/null），由 available-models 下发 */
  myApplicationStatus?: string | null;
}

interface ModelApplication {
  id: string;
  workspaceId: string;
  applicantId: string;
  applicantName?: string | null;
  deploymentId: string;
  modelLabel?: string | null;
  providerName?: string | null;
  reason?: string | null;
  status: string; // PENDING | APPROVED | REJECTED
  reviewerId?: string | null;
  reviewerName?: string | null;
  rejectReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface ByoSummary {
  id: string;
  sourceWorkspaceId?: string;
  /** 中央模型库定义 id（用于“绑定到本空间”与跨空间去重） */
  defId?: string | null;
  /** 是否已绑定到当前空间（sourceWorkspaceId === 当前 workspaceId） */
  boundToCurrentSpace?: boolean;
  scope?: "SPACE" | "PERSONAL_MEMBER";
  label?: string;
  protocol?: string;
  baseUrl?: string;
  endpointHost?: string;
  enabled?: boolean;
  shareWithMembers?: boolean;
  capabilities?: string[];
  canUse?: boolean;
  reason?: string | null;
}

interface AvailableModelsData {
  workspaceId: string;
  policyConfigured?: boolean;
  defaultDeploymentId?: string | null;
  defaultTarget?: { source?: string; targetDeploymentId?: string; label?: string } | null;
  models?: PoolModel[];
  systemModels?: PoolModel[];
  byo?: ByoSummary | null;
  byoModel?: ByoSummary | null;
  byoModels?: ByoSummary[];
  /** 当前用户在本空间获批的默认模型 id（按 用户×空间 持久化） */
  myApprovedDefaultDeploymentId?: string | null;
}

interface UsageItem {
  key: string;
  providerId: string;
  modelId: string;
  source: "PLATFORM" | "BYO";
  totalCalls: number;
  settledCalls: number;
  holdCalls: number;
  releasedCalls: number;
  reviewCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  holdPoints: number;
  actualPricePoints: number;
  releasedPoints: number;
  supplementPoints: number;
  costMicros: number;
  userPriceMicros: number;
  firstCalledAt: string;
  lastCalledAt: string;
  billingMode?: string;
  priceStatus?: string;
  pricingMode?: string;
  markupRateBps: number | null;
}

interface UsageDetail {
  taskId: string;
  status: string;
  errorCode: string | null;
  createdAt: string;
  holdPoints: number;
  actualPricePoints: number;
  releasedPoints: number;
  supplementPoints: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number | null;
  userPriceMicros: number | null;
  billingMode?: string;
  priceStatus?: string;
  pricingMode?: string;
  markupRateBps: number | null;
}

interface WorkspaceModelPolicyTabProps {
  workspaceId: string;
  userRole?: string;
  workspaceType?: string;
}

type SectionKey = "allocated" | "byo" | "usage";

const POOL_CAP_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  CHAT: { label: "文本对话", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  CODE: { label: "代码开发", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  EMBEDDING: { label: "向量检索", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  VISION: { label: "视觉多模态", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  FUNCTION_CALL: { label: "函数调用", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  TEXT_GENERATION: { label: "文本生成", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  STRUCTURED_OUTPUT: { label: "结构化输出", bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  LONG_CONTEXT: { label: "长上下文", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  FILE_ANALYSIS: { label: "文件分析", bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
};

// 能力展示名全站唯一真源（数据库 systemsetting.model_capability_labels 为准，此处为内置兜底）
const CAP_LABELS: Record<string, string> = MODEL_CAPABILITY_LABELS;

const PRICE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "价格已确认", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  OBSERVED_ONLY: { label: "仅观测", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  UNCONFIGURED: { label: "未配置价格", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  FREE: { label: "免费", cls: "bg-blue-50 text-[#3182ce] border-blue-200" },
};

const BILLING_MODE_LABELS: Record<string, string> = {
  ESTIMATED_COMPATIBILITY: "固定点数扣费",
  REAL_SETTLEMENT: "真实结算",
};

const PRICING_MODE_LABELS: Record<string, string> = {
  DIRECT_PRICE: "直价",
  COST_PLUS_MARKUP: "成本加价",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  SETTLED: { label: "已结算", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  HOLD: { label: "处理中", cls: "bg-blue-50 text-[#3182ce] border-blue-200" },
  RELEASED: { label: "已释放", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  REQUIRES_REVIEW: { label: "待复核", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

/** 运行抽屉同款记忆 key（ComponentDispatcherPanelNew.tsx），保证选用后工坊运行时默认生效 */
const lastSelectedKey = (wsId: string) => `zhige_last_selected_model_${wsId}`;

/** 调用统计每页条数 */
const USAGE_PAGE_SIZE = 10;

function fmtPrice(micros: number | null | undefined): string {
  return micros != null ? `¥${(micros / 1000000).toFixed(2)}` : "--";
}

function fmtYuanFromMicros(m: number): string {
  return `¥${(m / 1_000_000).toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 系统分配模型的统计匹配 key：与 model-usage 接口聚合口径一致（providerId::modelId） */
const platformUsageKey = (m: PoolModel) => `${m.providerId || m.providerCode || m.providerName || ""}::${m.modelId || m.upstreamModel || m.id}`;
/** 自带模型的统计匹配 key：providerId = `BYO:${sourceWorkspaceId}`，modelId = label */
const byoUsageKey = (b: ByoSummary) => `BYO:${b.sourceWorkspaceId || ""}::${b.label || ""}`;

export default function WorkspaceModelPolicyTab({ workspaceId, userRole, workspaceType }: WorkspaceModelPolicyTabProps) {
  const router = useRouter();
  const toast = useToast();

  const isPrivileged =
    userRole === "Owner" ||
    userRole === "Admin" ||
    userRole === "OWNER" ||
    userRole === "ADMIN";

  // 个人空间无成员与团队概念：不出现「空间默认（全员生效）」，只保留个人默认模型；
  // 企业空间才有空间级默认 + 个人选用的双分区。
  const isPersonal = workspaceType === "PERSONAL";
  const isEnterprise = workspaceType === "ENTERPRISE";
  const showSpaceLevel = isEnterprise && isPrivileged;

  // 仅空间所有者可审批模型使用申请（空间管理员 ADMIN 无审批权）
  const isOwnerRole = userRole === "Owner" || userRole === "OWNER";
  // 普通协同成员：仅可发起「申请使用」，不可直接设定默认
  const isMemberOnly = !isPrivileged;

  /* ---------- 子页签 ---------- */
  const [section, setSection] = useState<SectionKey>("allocated");

  /* ---------- 数据状态 ---------- */
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<AvailableModelsData | null>(null);
  const [capFilter, setCapFilter] = useState<string>("ALL");

  /* 调用统计（子页签三） */
  const [usageDays, setUsageDays] = useState<number>(30);
  const [usageItems, setUsageItems] = useState<UsageItem[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usagePage, setUsagePage] = useState(1);

  /* 任务级调用明细（展开行） */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UsageDetail[]>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);

  /* 空间策略（仅所有者/管理员可读；用于「设为空间默认」时原样带回白名单） */
  const [policy, setPolicy] = useState<{ defaultDeploymentId: string | null; allowedDeploymentIds: string[]; configured: boolean } | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  /* 用户选用（运行偏好，localStorage，与工坊运行抽屉同源） */
  const [chosenId, setChosenId] = useState<string>("auto");

  /* 待确认切换的默认模型（已存在默认时二次确认） */
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);

  /* 模型使用申请（普通成员发起 → 空间所有者审批） */
  const [applications, setApplications] = useState<ModelApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [applyModal, setApplyModal] = useState<PoolModel | null>(null);
  const [applyReason, setApplyReason] = useState("");
  const [appSubmitting, setAppSubmitting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ModelApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` });

  /* ---------- 数据加载 ---------- */

  const loadPool = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/available-models?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: headers(),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) setPool(json.data || null);
      else toast.error(json?.error || "加载模型分配失败");
    } catch {
      toast.error("加载模型分配失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  const loadUsage = useCallback(async () => {
    if (!workspaceId) return;
    setUsageLoading(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-usage?days=${usageDays}`, {
        headers: headers(),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) setUsageItems(json.data?.items || []);
    } catch {
      /* 统计失败不阻塞主流程，表格显示空态 */
    } finally {
      setUsageLoading(false);
    }
  }, [workspaceId, usageDays, toast]);

  const loadDetails = useCallback(async (key: string) => {
    if (!workspaceId) return;
    setDetailsLoading(key);
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(workspaceId)}/model-usage?days=${usageDays}&key=${encodeURIComponent(key)}`,
        { headers: headers() },
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setDetails((prev) => ({ ...prev, [key]: json.data?.items || [] }));
      } else {
        toast.error(json?.error || "加载调用明细失败");
      }
    } catch {
      toast.error("加载调用明细失败");
    } finally {
      setDetailsLoading(null);
    }
  }, [workspaceId, usageDays, toast]);

  const loadPolicy = useCallback(async () => {
    if (!workspaceId || !isPrivileged) return;
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-policy`, { headers: headers() });
      if (res.status === 401 || res.status === 403) return;
      const json = await res.json().catch(() => ({}));
      if (json?.success) {
        setPolicy({
          defaultDeploymentId: json.data?.policy?.defaultDeploymentId ?? null,
          allowedDeploymentIds: json.data?.policy?.allowedDeploymentIds ?? [],
          configured: json.data?.policy?.configured === true,
        });
      }
    } catch {
      /* 策略读取失败时仅禁用「设为默认」，不影响其他展示 */
    }
  }, [workspaceId, isPrivileged, toast]);

  useEffect(() => {
    void loadPool();
  }, [loadPool]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  /* 模型使用申请列表：所有者看全部，普通成员看自己的 */
  const loadApplications = useCallback(async () => {
    if (!workspaceId || (!isOwnerRole && !isMemberOnly)) return;
    setAppsLoading(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-application`, {
        headers: headers(),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) setApplications(json.data || []);
    } catch {
      /* 申请列表失败不阻塞主流程 */
    } finally {
      setAppsLoading(false);
    }
  }, [workspaceId, isOwnerRole, isMemberOnly]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  // 切换时间范围时清空已缓存的展开明细并重置分页，避免展示旧窗口数据
  useEffect(() => {
    setExpandedKey(null);
    setDetails({});
    setUsagePage(1);
  }, [usageDays]);

  /* ---------- 派生数据 ---------- */

  const allocatedModels: PoolModel[] = useMemo(() => {
    if (!pool) return [];
    if (Array.isArray(pool.systemModels)) return pool.systemModels;
    if (Array.isArray(pool.models)) return pool.models;
    return [];
  }, [pool]);

  const hasAllocated = allocatedModels.length > 0;

  const myApprovedDefaultDeploymentId = pool?.myApprovedDefaultDeploymentId ?? null;

  const spaceDefaultModel = useMemo(
    () => allocatedModels.find((m) => m.isSpaceDefault) || null,
    [allocatedModels]
  );

  // 实际生效的默认模型：仅以空间所有者/管理员显式「设为空间默认」为准
  const effectiveDefaultModel = spaceDefaultModel;

  const byoModels: ByoSummary[] = useMemo(() => {
    if (Array.isArray(pool?.byoModels)) return pool.byoModels as ByoSummary[];
    if (pool?.byoModel) return [pool.byoModel as ByoSummary];
    if (pool?.byo) return [pool.byo as ByoSummary];
    return [];
  }, [pool]);

  // BYO 平台服务费率（后台可配，单一真源 billing.byokServiceRateBps）；未加载到位时回退 15% 展示
  const byoServiceRatePct = useMemo(() => {
    const bps = pool?.byoServiceRateBps ?? byoModels?.[0]?.pricing?.byokServiceRateBps ?? 1500;
    return Math.round(bps / 100);
  }, [pool, byoModels]);

  // 可作为默认的自带模型：必须已绑定当前空间且启用，否则不能作为默认（避免“未绑定却显示默认”）
  const usableByoDefault = useMemo(
    () => byoModels.find((b) => b.boundToCurrentSpace !== false && b.enabled !== false) || null,
    [byoModels]
  );

  // 实际生效的默认模型 id：与任务执行链路 resolveDefaultDeployment 口径一致（空间显式配置的默认，不自动选）。
  // 个人空间：未显式配置默认时回落到空间策略中已落库的 defaultDeploymentId / BYO（即 defaultTarget）。
  const effectiveDefaultId = useMemo<string | null>(() => {
    if (!isPersonal) return effectiveDefaultModel?.id || null;
    if (chosenId && chosenId !== "auto") {
      if (chosenId === "byo") return null; // BYO 在「自建调用模型」卡片单独体现
      return chosenId;
    }
    return pool?.defaultTarget?.targetDeploymentId || null;
  }, [isPersonal, chosenId, pool, effectiveDefaultModel]);

  const poolCapabilities = useMemo(() => {
    const caps = new Set<string>();
    allocatedModels.forEach((m) => (m.capabilities || []).forEach((c) => caps.add(c)));
    return Array.from(caps);
  }, [allocatedModels]);

  const filteredModels = useMemo(() => {
    if (capFilter === "ALL") return allocatedModels;
    return allocatedModels.filter((m) => (m.capabilities || []).includes(capFilter));
  }, [allocatedModels, capFilter]);

  const usageByKey = useMemo(() => {
    const map = new Map<string, UsageItem>();
    usageItems.forEach((u) => map.set(u.key, u));
    return map;
  }, [usageItems]);

  /* 调用统计分页（每页 10 条） */
  const usageTotalPages = Math.max(1, Math.ceil(usageItems.length / USAGE_PAGE_SIZE));
  const pagedUsageItems = useMemo(
    () => usageItems.slice((usagePage - 1) * USAGE_PAGE_SIZE, usagePage * USAGE_PAGE_SIZE),
    [usageItems, usagePage]
  );

  /* ---------- 选用逻辑 ---------- */

  // 初始化：读取 localStorage；若历史上选用的模型已被收回/未绑定，则回落智能调度
  useEffect(() => {
    // 模型池未加载完成前不做校验：此时 usableByoDefault 必为空，
    // 若贸然校验会把合法的 "byo" 误判为失效并清掉本地记录（切页签回来后选中态丢失的根因）
    if (!pool) return;
    try {
      let saved = localStorage.getItem(lastSelectedKey(workspaceId));
      if (!saved && myApprovedDefaultDeploymentId) {
        // 本地无记录时回退服务端已持久化的个人偏好（清缓存/换设备后仍能回显选中态）
        saved =
          myApprovedDefaultDeploymentId === `byo:${workspaceId}`
            ? "byo"
            : myApprovedDefaultDeploymentId;
      }
      if (!saved) return;
      const valid =
        saved === "auto" ||
        (saved === "byo" && !!usableByoDefault) ||
        allocatedModels.some((m) => m.id === saved);
      if (valid) setChosenId(saved);
      else {
        localStorage.removeItem(lastSelectedKey(workspaceId));
        setChosenId("auto");
      }
    } catch {
      /* localStorage 不可用时静默保持 auto */
    }
  }, [workspaceId, allocatedModels, usableByoDefault, pool, myApprovedDefaultDeploymentId]);

  // 纠正：当前选中的是自带模型，但该模型已未绑定/停用时，静默回落智能调度（不弹提示）
  useEffect(() => {
    if (chosenId === "byo" && !usableByoDefault) {
      setChosenId("auto");
      try {
        localStorage.removeItem(lastSelectedKey(workspaceId));
      } catch {
        /* 忽略 */
      }
    }
  }, [chosenId, usableByoDefault, workspaceId]);

  const applyChoice = (val: string) => {
    setChosenId(val);
    try {
      if (val === "auto") localStorage.removeItem(lastSelectedKey(workspaceId));
      else localStorage.setItem(lastSelectedKey(workspaceId), val);
    } catch {
      /* localStorage 不可用时仅本次会话生效 */
    }
    // 落库「仅我使用」偏好：供快速任务等依赖后端 resolveDefaultDeployment 的路径读取（最高优先级，仅本人生效）
    void (async () => {
      try {
        const payload =
          val === "auto"
            ? { isAuto: true, deploymentId: null }
            // 自带模型在组件内以字面量 "byo" 表示，落库须规范化为后端裁决可识别的 byo:<workspaceId>
            : { isAuto: false, deploymentId: val === "byo" ? `byo:${workspaceId}` : val };
        const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-preference`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.error(j?.error || "保存「仅我」偏好失败，但本次会话已生效");
        }
      } catch {
        /* 网络异常时不阻断：localStorage 仍兜底工坊运行抽屉 */
      }
    })();
    toast.success(val === "auto" ? "已经取消此默认模型，恢复为使用空间默认模型" : isPersonal ? "已设为默认模型，组件工坊运行时将默认使用该模型" : "已设为默认使用模型（仅我生效），组件工坊运行时将默认使用该模型");
  };

  /* 当前个人已默认模型的可读名称（用于二次确认文案） */
  const currentDefaultLabel = useMemo(() => {
    if (!chosenId || chosenId === "auto") return null;
    if (chosenId === "byo") {
      const b = usableByoDefault;
      return b?.label || (byoModels.length ? "自带私有模型" : "自带模型");
    }
    const m = allocatedModels.find((x) => x.id === chosenId);
    return m?.displayName || m?.name || m?.modelId || null;
  }, [chosenId, byoModels, allocatedModels]);

  /* 个人选用入口：若已存在个人默认且目标不同，或目标已是空间默认（全员已默认），先二次确认，避免误覆盖 */
  const requestChoice = (targetId: string) => {
    const hasCurrent = !!chosenId && chosenId !== "auto" && chosenId !== targetId;
    // “已是空间默认(全员)”二次确认仅企业空间适用；个人空间无空间默认概念
    const targetIsSpaceDefault =
      isEnterprise && allocatedModels.some((m) => m.id === targetId && m.isSpaceDefault === true);
    if ((hasCurrent && currentDefaultLabel) || targetIsSpaceDefault) {
      setPendingChoice(targetId);
      return;
    }
    applyChoice(targetId);
  };

  /* 待确认项是否为空间默认（全员生效），用于区分确认文案 */
  const pendingIsSpaceDefault = useMemo(
    () =>
      isEnterprise &&
      !!pendingChoice &&
      allocatedModels.some((m) => m.id === pendingChoice && m.isSpaceDefault === true),
    [pendingChoice, allocatedModels, isEnterprise]
  );

  /* 待确认项可读名称（用于确认文案） */
  const pendingLabel = useMemo(() => {
    if (!pendingChoice) return null;
    if (pendingChoice === "byo") {
      const b = byoModels.find((x) => x.enabled) || byoModels[0];
      return b?.label || (byoModels.length ? "自带私有模型" : "自带模型");
    }
    const m = allocatedModels.find((x) => x.id === pendingChoice);
    return m?.displayName || m?.name || m?.modelId || null;
  }, [pendingChoice, byoModels, allocatedModels]);

  /* ---------- 模型使用申请：普通成员发起 ---------- */

  const submitApplication = async () => {
    const model = applyModal;
    if (!model) return;
    const reason = applyReason.trim();
    if (reason.length < 5) {
      toast.error("请至少输入 5 个字说明申请事由");
      return;
    }
    setAppSubmitting(true);
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-application`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ deploymentId: model.id, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        toast.success("申请已提交，等待空间所有者审批");
        setApplyModal(null);
        setApplyReason("");
        await Promise.all([loadPool(), loadApplications()]);
      } else {
        toast.error(json?.error || "提交申请失败");
      }
    } catch {
      toast.error("提交申请失败");
    } finally {
      setAppSubmitting(false);
    }
  };

  /* ---------- 模型使用申请审批：仅空间所有者 ---------- */

  const reviewApplication = async (appId: string, action: "APPROVE" | "REJECT") => {
    let rejectReasonVal: string | undefined;
    if (action === "REJECT") {
      rejectReasonVal = rejectReason.trim();
      if (rejectReasonVal.length < 2) {
        toast.error("拒绝必须填写原因");
        return;
      }
    }
    setReviewing(true);
    try {
      const res = await fetch(
        `/api/workspace/${encodeURIComponent(workspaceId)}/model-application/${appId}/review`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ action, rejectReason: rejectReasonVal }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        toast.success(action === "APPROVE" ? "已通过，已设为该成员默认模型" : "已驳回该申请");
        setRejectTarget(null);
        setRejectReason("");
        await Promise.all([loadApplications(), loadPool()]);
      } else {
        toast.error(json?.error || "审批失败");
      }
    } catch {
      toast.error("审批失败");
    } finally {
      setReviewing(false);
    }
  };

  /* ---------- 设为空间默认（仅空间所有者/管理员） ---------- */

  /* 自建模型默认：自带模型必须先在「工作台·我的模型」绑定到本空间，才能在此设为/取消默认 */
  const handleByoDefault = (b: ByoSummary) => {
    // 已是默认 → 取消默认（恢复智能调度 / 空间默认）
    if (chosenId === "byo") {
      applyChoice("auto");
      return;
    }
    // 未绑本空间 → 引导去工作台绑定（空间页不做绑定）
    if (b.boundToCurrentSpace === false) {
      toast.error("请先在工作台「我的模型」中把该模型绑定到本空间，再设为默认");
      return;
    }
    // 已绑本空间 → 设为默认（切换时二次确认）
    requestChoice("byo");
  };

  const setSpaceDefault = async (depId: string | null) => {
    // 白名单必须原样带回：PUT 为整体覆盖语义，缺失会把管理员分配的模型清空
    if (!policy?.configured || policy.allowedDeploymentIds.length === 0) {
      toast.error("当前空间未配置模型策略，请联系平台管理员分配");
      return;
    }
    setSettingDefault(depId ?? "__unset__");
    try {
      const res = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/model-policy`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          defaultDeploymentId: depId,
          allowedDeploymentIds: policy.allowedDeploymentIds,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        toast.success(
          depId
            ? isPersonal
              ? "已设为默认模型"
              : "已设为空间默认模型"
            : isPersonal
              ? "已取消默认模型"
              : "已取消空间默认模型",
        );
        // 局部刷新：只更新「哪个是默认」这一小块，不重拉整个模型列表（避免整页闪烁）
        setPolicy((prev) => (prev ? { ...prev, defaultDeploymentId: depId } : prev));
        setPool((prev) => {
          if (!prev) return prev;
          const patch = (arr?: PoolModel[]) =>
            arr?.map((m) => ({ ...m, isSpaceDefault: m.id === depId }));
          const nextSystem = patch(prev.systemModels);
          const nextModels = patch(prev.models);
          const target = (nextSystem || nextModels || []).find((m) => m.id === depId);
          return {
            ...prev,
            systemModels: nextSystem,
            models: nextModels,
            defaultDeploymentId: depId,
            defaultTarget: depId
              ? { source: "SPACE_DEFAULT", targetDeploymentId: depId, label: target?.displayName || target?.name || target?.modelId || "" }
              : { source: "NONE", targetDeploymentId: null, label: null },
          };
        });
        // 轻量确认空间策略（不触发整页 loading）
        await loadPolicy();
      } else {
        toast.error(json?.error || "设置失败");
      }
    } catch {
      toast.error("设置失败");
    } finally {
      setSettingDefault(null);
    }
  };

  const toggleDetails = (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (!details[key]) void loadDetails(key);
  };

  /* ---------- 渲染 ---------- */

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-16 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
        <div className="w-9 h-9 border-3 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
        <span className="text-xs font-bold text-slate-400">正在加载本空间模型分配...</span>
      </div>
    );
  }

  const sectionTabs: { key: SectionKey; label: string; count?: number }[] = [
    { key: "allocated", label: "系统分配模型", count: allocatedModels.length },
    { key: "byo", label: "自建调用模型(自带私有模型)", count: byoModels.length },
    { key: "usage", label: "模型调用详细情况" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-200 font-sans text-left">
      {/* 顶部口径说明 */}
      <div className="bg-blue-50/50 rounded-lg border border-blue-100 p-4 text-xs text-slate-600 space-y-1.5">
        <div className="font-bold text-[#2b6cb0] flex items-center gap-1.5">
          <Info className="w-4 h-4 text-[#3182ce]" />
          <span>{isPersonal ? "这是你的个人工作空间" : "本空间模型由平台管理员统一分配"}</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
          {isPersonal ? (
            <>
              <li><strong>系统分配的模型</strong>：平台已分配给本空间、默认可用，可直接<strong>设为默认</strong>或<strong>取消默认</strong>。</li>
              <li><strong>自建模型</strong>：需先在工作台「我的模型」中<strong>绑定到本空间</strong>，才能在此<strong>设为默认</strong>。</li>
            </>
          ) : (
            <>
              <li><strong>系统分配的模型</strong>：平台已分配、默认可用；所有者可<strong>设为空间默认</strong>（全员生效），成员可<strong>我选用</strong>（仅本人）。企业空间至少保留一个默认。</li>
              <li><strong>自建模型</strong>：需先在工作台「我的模型」中<strong>绑定到本空间</strong>，才能在此选用/设为默认。</li>
            </>
          )}
        </ul>
      </div>

      {/* 顶部三联概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 卡片 1：系统分配的模型池 */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-600" />
                系统分配模型
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                {allocatedModels.length} 款已分配
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {allocatedModels.length}
              <span className="text-xs font-normal text-slate-500 ml-1.5">个授权部署</span>
            </div>
            <p className="text-xs text-slate-500">仅展示系统为本空间分配的模型；未分配的模型不可见也不可调用。</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {workspaceId}
            </span>
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 后台受控
            </span>
          </div>
        </div>

        {/* 卡片 2：默认模型（系统设定 / 所有者可改） */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                {isPersonal ? "我的默认模型" : "空间默认模型"}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center gap-0.5">
                {isPersonal ? (
                  <>我的默认</>
                ) : (
                  <>
                    <Users className="w-2.5 h-2.5" />
                    {isPrivileged ? "空间级 · 所有者可调整" : "空间级 · 只读"}
                  </>
                )}
              </span>
            </div>
            <div className="text-base font-black text-slate-900 tracking-tight break-words">
              {isPersonal ? (
                pool?.defaultTarget?.targetDeploymentId ? (
                  <>{pool.defaultTarget.label || "默认模型"}</>
                ) : hasAllocated || byoModels.length > 0 ? (
                  <span className="text-slate-500 font-bold">未配置默认模型</span>
                ) : (
                  <span className="text-slate-400">尚未分配模型</span>
                )
              ) : effectiveDefaultModel ? (
                effectiveDefaultModel.displayName || effectiveDefaultModel.name || effectiveDefaultModel.modelId
              ) : hasAllocated ? (
                <span className="text-slate-500 font-bold">未设置</span>
              ) : (
                <span className="text-slate-400">尚未分配</span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono leading-relaxed break-words">
              {isPersonal
                ? pool?.defaultTarget?.targetDeploymentId
                  ? `已配置默认模型：${pool.defaultTarget.label || ""} · 任务将自动使用此模型，如需更换可在下方卡片「设为默认」`
                  : hasAllocated || byoModels.length > 0
                    ? "未配置默认模型，请先配置默认模型再执行任务。"
                    : "尚未分配模型"
                : effectiveDefaultModel
                ? `供应商: ${effectiveDefaultModel.providerName || effectiveDefaultModel.providerCode} · 上游模型: ${effectiveDefaultModel.upstreamModel || effectiveDefaultModel.modelCode || effectiveDefaultModel.modelId}`
                : hasAllocated
                ? "尚未设置默认模型：请在下方卡片点击「设为空间默认」，否则任务无法自动执行。"
                : "管理员尚未为本空间分配模型"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              {pool?.defaultTarget?.source === "WORKSPACE_BYO" ? (
                <>
                  <KeyRound className="w-3 h-3" /> 自建调用模型
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" /> 系统分配
                </>
              )}
            </span>
          </div>
        </div>

        {/* 卡片 3：自建调用模型（自带私有模型） */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                自建调用模型(自带私有模型)
              </span>
              {byoModels.length > 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {byoModels.length} 个已创建
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">未创建</span>
              )}
            </div>
            {byoModels.length === 0 ? (
              <>
                <div className="text-base font-black text-slate-900 tracking-tight">暂未创建自带模型</div>
                <p className="text-xs text-slate-500 font-mono truncate">支持接入自备 OpenAI / Ollama 等私有端点，密钥 AES-256 加密落库</p>
              </>
            ) : (
              <div className="space-y-2">
                {byoModels.slice(0, 2).map((b) => (
                  <div key={b.id} className="rounded-lg border border-amber-100 bg-amber-50/30 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-900 truncate">{b.label || "自带私有模型"}</span>
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${
                          b.enabled
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {b.enabled ? "已绑定" : "停用维护"}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 truncate mt-1">
                      端点: {b.baseUrl || b.endpointHost || "未填写"}
                    </div>
                  </div>
                ))}
                {byoModels.length > 2 && (
                  <div className="text-[10px] text-slate-400">另有 {byoModels.length - 2} 个未展示...</div>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
            <span
              className="text-slate-400 truncate whitespace-nowrap min-w-0"
              title={`自带私有模型：调用直连你的私有端点，平台另收 ${byoServiceRatePct}% 服务费`}
            >
              自带私有模型：直连你的私有端点，另收 {byoServiceRatePct}% 服务费
            </span>
            <button
              type="button"
              onClick={() => setSection("byo")}
              className="text-amber-600 hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>查看全部</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 子页签栏 */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {sectionTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSection(t.key)}
            className={`px-4 py-2 text-xs font-bold cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              section === t.key
                ? "border-[#3182ce] text-[#3182ce]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.key === "allocated" ? <Server className="w-3.5 h-3.5" /> : t.key === "byo" ? <KeyRound className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            <span>{t.label}</span>
            {t.count != null && <span className="text-[10px] font-mono text-slate-400">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* ============ 子页签一：系统分配模型 ============ */}
      {section === "allocated" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#3182ce]" />
                系统分配模型
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {hasAllocated ? `已分配 ${allocatedModels.length} 款` : "未分配"}
                </span>
              </div>
             
            </div>
            {hasAllocated && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCapFilter("ALL")}
                className={`px-2.5 py-1 text-[11px] rounded font-bold cursor-pointer transition-all border whitespace-nowrap ${
                  capFilter === "ALL"
                    ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                全部能力
              </button>
              {poolCapabilities.map((cap) => {
                const meta = POOL_CAP_STYLE[cap] || { label: cap };
                const isSelected = capFilter === cap;
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setCapFilter(cap)}
                    className={`px-2.5 py-1 text-[11px] rounded font-bold cursor-pointer transition-all border whitespace-nowrap ${
                      isSelected
                        ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            所有者可「设为空间默认」（<strong className="text-slate-600">全员生效</strong>）；普通成员点「我选用」仅<strong className="text-slate-600">本人生效</strong>，不会覆盖空间默认、也不影响其他成员。
          </p>

          {/* 空间所有者：模型使用申请审批面板（仅企业空间；个人空间无成员/审批概念） */}
          {isOwnerRole && isEnterprise && (
            <div className="bg-white rounded-lg border border-amber-200/80 shadow-2xs p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <FileSignature className="w-3.5 h-3.5 text-amber-500" />
                  模型使用申请审批
                  {applications.some((a) => a.status === "PENDING") && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                      待处理 {applications.filter((a) => a.status === "PENDING").length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void loadApplications()}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                  title="刷新申请列表"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${appsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {appsLoading ? (
                <div className="text-xs text-slate-400 py-3 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中…
                </div>
              ) : applications.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">暂无成员提交的模型使用申请。</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className={`border rounded-lg p-2.5 text-xs ${
                        app.status === "PENDING" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800">
                            {app.applicantName || app.applicantId} 申请使用 {app.modelLabel || app.deploymentId}
                            {app.providerName ? `（${app.providerName}）` : ""}
                          </div>
                          <div className="text-slate-500 mt-0.5 leading-relaxed">事由：{app.reason || "—"}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(app.createdAt).toLocaleString("zh-CN")}
                          </div>
                          {app.status === "REJECTED" && app.rejectReason && (
                            <div className="text-[10px] text-rose-600 mt-0.5">驳回原因：{app.rejectReason}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {app.status === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void reviewApplication(app.id, "APPROVE")}
                                disabled={reviewing}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-500 cursor-pointer flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ThumbsUp className="w-3 h-3" /> 通过
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRejectTarget(app); setRejectReason(""); }}
                                disabled={reviewing}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 cursor-pointer flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ThumbsDown className="w-3 h-3" /> 驳回
                              </button>
                            </>
                          ) : (
                            <span
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                                app.status === "APPROVED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {app.status === "APPROVED" ? "已通过" : "已驳回"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 普通成员：我的申请历史记录 */}
          {isMemberOnly && isEnterprise && (
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <FileSignature className="w-3.5 h-3.5 text-[#3182ce]" />
                  我的申请记录
                  {applications.some((a) => a.status === "PENDING") && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                      审批中 {applications.filter((a) => a.status === "PENDING").length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void loadApplications()}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                  title="刷新申请记录"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${appsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {appsLoading ? (
                <div className="text-xs text-slate-400 py-3 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中…
                </div>
              ) : applications.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">你还没有提交过模型使用申请。在下方非空间默认的模型卡片点击「申请使用」即可发起。</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className={`border rounded-lg p-2.5 text-xs ${
                        app.status === "PENDING"
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-slate-200 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800">
                            申请使用 {app.modelLabel || app.deploymentId}
                            {app.providerName ? `（${app.providerName}）` : ""}
                          </div>
                          <div className="text-slate-500 mt-0.5 leading-relaxed">事由：{app.reason || "—"}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(app.createdAt).toLocaleString("zh-CN")}
                          </div>
                          {app.status === "REJECTED" && app.rejectReason && (
                            <div className="text-[10px] text-rose-600 mt-0.5">驳回原因：{app.rejectReason}</div>
                          )}
                          {app.status === "APPROVED" && (
                            <div className="text-[10px] text-emerald-600 mt-0.5">
                              已通过，已设为你本空间的默认模型
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${
                            app.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : app.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {app.status === "APPROVED" ? "已通过" : app.status === "PENDING" ? "审批中" : "已驳回"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!hasAllocated ? (
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
                <Server className="w-6 h-6 text-slate-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-800">系统尚未为本空间分配模型</h4>
                <p className="text-xs text-slate-500">
                  请联系平台管理员为本空间分配可用模型
                </p>
              </div>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
                <Cpu className="w-6 h-6 text-slate-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-800">没有符合当前能力筛选的模型</h4>
                <p className="text-xs text-slate-500">请尝试切换其他能力标签。</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredModels.map((m) => {
                const isSpaceDefault = m.isSpaceDefault === true;
                // 实际生效默认：个人空间以落库的空间默认为准；企业空间边框高亮保留「空间默认」语义
                const isDefault = isPersonal ? effectiveDefaultId === m.id : isSpaceDefault;
                const modelName = m.displayName || m.name || m.modelId || "未命名模型";
                const modelCode = m.upstreamModel || m.modelCode || m.modelId || m.id;
                const providerName = m.providerName || m.providerCode || m.providerId || "系统供应商";
                const usage = usageByKey.get(platformUsageKey(m));
                const successRate = usage && usage.totalCalls > 0
                  ? Math.round((usage.settledCalls / usage.totalCalls) * 100)
                  : null;
                return (
                  <div
                    key={m.id}
                    className={`bg-white rounded-lg border p-5 transition-all shadow-2xs flex flex-col justify-between hover:shadow-sm ${
                      isDefault ? "border-[#3182ce] ring-1 ring-[#3182ce]/20 bg-blue-50/10" : "border-slate-200/80"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              {providerName}
                            </span>
                            <span className="text-sm font-black text-slate-900 truncate">{modelName}</span>
                            {isPersonal ? (
                              effectiveDefaultId === m.id ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#3182ce] border border-blue-100 shrink-0 flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5" /> 默认模型
                                </span>
                              ) : null
                            ) : (
                              <>
                                {isSpaceDefault && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#3182ce] border border-blue-100 shrink-0 flex items-center gap-0.5">
                                    <Users className="w-2.5 h-2.5" /> 空间默认
                                  </span>
                                )}
                                {chosenId === m.id &&
                                  (isSpaceDefault ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0 flex items-center gap-0.5" title="同时作为空间默认（全员）与你的个人默认生效">
                                      <Users className="w-2.5 h-2.5" /> 全员（含所有者）默认使用中
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0 flex items-center gap-0.5">
                                      <User className="w-2.5 h-2.5" /> 默认使用中
                                    </span>
                                  ))}
                                {myApprovedDefaultDeploymentId === m.id && (
                                  <span
                                    className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-0.5"
                                    title="经空间所有者审批通过，已设为您在本空间的默认模型"
                                  >
                                    <User className="w-2.5 h-2.5" /> 我的默认（审批）
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">上游标识: {modelCode}</div>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0 flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> 已分配
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">支持能力</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(m.capabilities || []).map((c) => {
                            const style = POOL_CAP_STYLE[c] || {
                              label: c,
                              bg: "bg-slate-50",
                              text: "text-slate-600",
                              border: "border-slate-200",
                            };
                            return (
                              <span
                                key={c}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}
                              >
                                {style.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="bg-slate-50/80 rounded border border-slate-200/60 p-2.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-mono text-[11px] text-slate-600">
                          <span>输入 / 输出单价:</span>
                          <span className="font-bold text-slate-900">
                            {m.pricing?.priceInputMicrosPerMillion != null
                              ? `${fmtPrice(m.pricing.priceInputMicrosPerMillion)} / ${fmtPrice(m.pricing.priceOutputMicrosPerMillion)}`
                              : m.pricing?.inputPricePerK != null
                              ? `${m.pricing.inputPricePerK} / ${m.pricing.outputPricePerK} 点`
                              : "--"}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">元/百万</span>
                          </span>
                        </div>
                        {m.pricing?.priceCacheReadMicrosPerMillion != null && (
                          <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-500">
                            <span>命中缓存读取:</span>
                            <span className="font-bold text-slate-800">{fmtPrice(m.pricing.priceCacheReadMicrosPerMillion)}</span>
                          </div>
                        )}
                        <ModelPricingRules periods={(m as any).pricingPeriods} />
                      </div>

                      {/* 调用统计徽标 */}
                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-600">
                          <BarChart3 className="w-3 h-3 text-[#3182ce]" />
                          近 {usageDays} 天调用 {usage?.totalCalls ?? 0} 次
                        </span>
                        {usage && usage.totalCalls > 0 && (
                          <>
                            <span className="font-bold text-emerald-600">成功率 {successRate}%</span>
                            <span className="text-slate-400 font-mono">消耗 {usage.actualPricePoints} 点</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 底部操作：企业空间双分区（空间默认+个人选用）；个人空间单分区（默认模型） */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      {showSpaceLevel ? (
                        <div className="flex items-stretch gap-3">
                          {/* 分区一：空间级 —— 对本空间所有成员生效 */}
                          <div className="flex flex-col items-start gap-1.5 flex-1 min-w-0">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Users className="w-2.5 h-2.5 text-[#3182ce]" />
                              空间级 · 全员生效
                            </span>
                            <button
                              type="button"
                              onClick={() => void (isSpaceDefault ? setSpaceDefault(null) : setSpaceDefault(m.id))}
                              disabled={!policy?.configured || settingDefault === m.id}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                isSpaceDefault
                                  ? "bg-[#3182ce] text-white border border-[#3182ce] shadow-2xs"
                                  : "bg-white hover:bg-blue-50 text-[#3182ce] border border-blue-200"
                              }`}
                              title={
                                isSpaceDefault
                                  ? "已设为空间默认模型（点击取消默认；取消后本空间未配置默认模型，成员执行任务将被拦截提示去配置）"
                                  : policy?.configured
                                  ? "设为空间默认模型：对本空间所有成员的任务缺省生效"
                                  : "需平台管理员先分配模型"
                              }
                            >
                              {settingDefault === m.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isSpaceDefault ? (
                                <X className="w-3 h-3" />
                              ) : (
                                <Star className="w-3 h-3" />
                              )}
                              {isSpaceDefault
                                ? "取消默认"
                                : "设为空间默认"}
                            </button>
                          </div>

                          {/* 分区二：个人偏好 —— 仅本机/本人在工坊运行时生效 */}
                          <div className="flex flex-col items-start gap-1.5 flex-1 min-w-0 border-l border-slate-100 pl-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <User className="w-2.5 h-2.5 text-emerald-500" />
                              仅我 · 本机生效
                            </span>
                            <button
                              type="button"
                              onClick={() => (chosenId === m.id ? applyChoice("auto") : requestChoice(m.id))}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1 transition-all ${
                                chosenId === m.id
                                  ? "bg-emerald-500 text-white border border-emerald-500 shadow-2xs"
                                  : "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                              title={
                                chosenId === m.id
                                  ? "取消我的默认：恢复为空间默认（沿用空间默认模型）"
                                  : "仅你在组件工坊运行时的默认选择，不影响其他成员"
                              }
                            >
                              {chosenId === m.id ? (
                                <>
                                  <X className="w-3 h-3" /> 取消默认
                                </>
                              ) : (
                                <>
                                  <Wand2 className="w-3 h-3" /> 我选用
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : isMemberOnly && isEnterprise ? (
                        /* 普通成员：对非空间默认的系统模型发起使用申请，由空间所有者审批 */
                        <div className="flex flex-col items-start gap-1.5">
                          {isSpaceDefault ? (
                            <span className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 text-center">
                              空间默认 · 全员可用
                            </span>
                          ) : myApprovedDefaultDeploymentId === m.id ? (
                            <span className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-1">
                              <Check className="w-3 h-3" /> 我的默认（审批通过）
                            </span>
                          ) : m.myApplicationStatus === "PENDING" ? (
                            <span className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 flex items-center justify-center gap-1">
                              <Clock3 className="w-3 h-3" /> 审批中…
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setApplyModal(m);
                                setApplyReason("");
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1 transition-all bg-white hover:bg-amber-50 text-amber-700 border border-amber-200"
                              title="向空间所有者申请将该模型设为你的默认模型"
                            >
                              <Send className="w-3 h-3" /> 申请使用
                            </button>
                          )}
                        </div>
                      ) : (
                        /* 个人空间：单用户，唯一默认模型（系统模型 / BYO 二选一，统一走选用） */
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 text-[#3182ce]" />
                            默认模型
                          </span>
                          <button
                            type="button"
                            onClick={() => void (policy?.defaultDeploymentId === m.id ? setSpaceDefault(null) : setSpaceDefault(m.id))}
                            disabled={!policy?.configured || settingDefault === m.id}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                              policy?.defaultDeploymentId === m.id
                                ? "bg-[#3182ce] text-white border border-[#3182ce] shadow-2xs"
                                : "bg-white hover:bg-blue-50 text-[#3182ce] border border-blue-200"
                            }`}
                            title={policy?.defaultDeploymentId === m.id ? "已设为默认模型（点击「取消默认」；取消后未配置默认模型将无法执行任务）" : "设为默认模型：组件工坊运行任务时默认使用"}
                          >
                            {policy?.defaultDeploymentId === m.id ? (
                              <>
                                <X className="w-3 h-3" /> 取消默认
                              </>
                            ) : (
                              <>
                                <Star className="w-3 h-3" /> 设为默认
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ 子页签二：自建调用模型(自带私有模型) ============ */}
      {section === "byo" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                自建调用模型(自带私有模型)
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {byoModels.length} 个已创建
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">工作台配置的自备私有端点（OpenAI / Ollama 等），密钥 AES-256 加密落库</p>
            </div>
            {/* 已有自建模型时才在标题栏显示管理入口；空态由卡片内大按钮承接，避免重复入口 */}
            {byoModels.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/user/byo-model?workspaceId=${encodeURIComponent(workspaceId)}`)}
                className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs"
              >
                <span>管理自有配置</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 反向提示：与工作台「我的模型库」分配面板里的「系统已分配」只读提示双向对齐 */}
          <div className="text-[11px] text-[#2b6cb0] bg-blue-50 rounded p-2.5 border border-blue-200 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#3182ce] shrink-0 mt-0.5" />
            <span>
              {byoModels.length === 0 ? (
                <>本空间尚未绑定任何自带模型；请先到工作台「我的模型」创建自备私有端点，并把它绑定到本空间后，即可在此设为默认。</>
              ) : (
                <>本空间已有 <strong>{byoModels.length}</strong> 款自带模型。绑定仅代表可用，不等于默认：要作为任务默认，请点「设为默认」。自带模型调用直连你自己的私有端点，平台另收 <strong>{byoServiceRatePct}%</strong> 服务费。</>
              )}
            </span>
          </div>

          {byoModels.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-400 flex items-center justify-center mx-auto border border-amber-100">
                <KeyRound className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-800">尚未在工作台创建自带模型</h4>
                <p className="text-xs text-slate-500">
                  可接入自备私有端点作为本空间的执行模型，享受自有网关专属算力。
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/user/byo-model?workspaceId=${encodeURIComponent(workspaceId)}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100 hover:bg-amber-100 transition-all cursor-pointer"
              >
                <span>去配置接入</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {byoModels.map((b) => {
                const usage = usageByKey.get(byoUsageKey(b));
                const successRate = usage && usage.totalCalls > 0
                  ? Math.round((usage.settledCalls / usage.totalCalls) * 100)
                  : null;
                return (
                  <div
                    key={b.id}
                    className="bg-white rounded-lg border border-amber-100/80 p-5 shadow-2xs flex flex-col justify-between hover:shadow-sm transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {b.boundToCurrentSpace ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> 已绑定本空间
                              </span>
                            ) : b.scope === "PERSONAL_MEMBER" ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                仅本人可见
                              </span>
                            ) : null}
                            <span className="text-sm font-black text-slate-900 truncate">{b.label || "自带私有模型"}</span>
                            {chosenId === "byo" && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0 flex items-center gap-0.5">
                                <User className="w-2.5 h-2.5" /> 默认使用中
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">
                            端点: {b.baseUrl || b.endpointHost || "未填写"}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">协议: {b.protocol || "OPENAI_COMPATIBLE"}</div>
                        </div>
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 ${
                            b.enabled
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {b.enabled ? "已绑定" : "停用维护"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {(b.capabilities || []).map((c) => (
                          <span
                            key={c}
                            className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {CAP_LABELS[c] || c}
                          </span>
                        ))}
                      </div>

                      {/* 调用统计徽标 */}
                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-600">
                          <BarChart3 className="w-3 h-3 text-amber-500" />
                          近 {usageDays} 天调用 {usage?.totalCalls ?? 0} 次
                        </span>
                        {usage && usage.totalCalls > 0 && (
                          <>
                            <span className="font-bold text-emerald-600">成功率 {successRate}%</span>
                            <span className="text-slate-400 font-mono">消耗 {usage.actualPricePoints} 点</span>
                          </>
                        )}
                      </div>

                      {b.canUse === false && (
                        <div className="text-[10px] text-amber-600">{b.reason || "当前不可调用"}</div>
                      )}
                    </div>

                    {/* 底部操作：个人空间=默认模型；企业空间=仅我选用 */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">密钥加密落库，平台按服务费计费</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-0.5">
                          {isPersonal ? (
                            <Star className="w-2.5 h-2.5 text-[#3182ce]" />
                          ) : (
                            <User className="w-2.5 h-2.5 text-emerald-500" />
                          )}
                          {isPersonal ? "默认模型" : "仅我"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleByoDefault(b)}
                          disabled={b.boundToCurrentSpace === false}
                          className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all shrink-0 ${
                            b.boundToCurrentSpace === false
                              ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                              : chosenId === "byo"
                              ? isPersonal
                                ? "bg-[#3182ce] text-white border border-[#3182ce] shadow-2xs cursor-pointer"
                                : "bg-emerald-500 text-white border border-emerald-500 shadow-2xs cursor-pointer"
                              : isPersonal
                              ? "bg-white hover:bg-blue-50 text-[#3182ce] border border-blue-200 cursor-pointer"
                              : "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
                          }`}
                          title={
                            b.boundToCurrentSpace === false
                              ? "未绑定本空间：请先在工作台「我的模型」中把该模型绑定到本空间"
                              : chosenId === "byo"
                              ? isPersonal
                                ? "取消默认：恢复为不单独指定（沿用空间默认）"
                                : "取消我的默认：恢复为空间默认"
                              : isPersonal
                              ? "设为默认模型：组件工坊运行任务时默认使用"
                              : "仅你在组件工坊运行时的默认选择，不影响其他成员"
                          }
                        >
                          {b.boundToCurrentSpace === false ? (
                            <>未绑定本空间</>
                          ) : chosenId === "byo" ? (
                            <>
                              <X className="w-3 h-3" /> 取消默认
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3" /> {isPersonal ? "设为默认" : "我选用"}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/user/byo-model?workspaceId=${encodeURIComponent(workspaceId)}`)}
                          className="px-2.5 py-1 rounded text-xs font-bold cursor-pointer flex items-center gap-1 transition-all shrink-0 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200"
                        >
                          <span>管理</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ 子页签三：模型调用详细情况 ============ */}
      {section === "usage" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Table2 className="w-3.5 h-3.5 text-[#3182ce]" />
                模型调用详细情况
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">按模型聚合本空间的任务调用统计（含系统分配模型与自建调用模型），可以查看调用明细记录</p>
            </div>
            <div className="flex items-center gap-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setUsageDays(d)}
                  className={`px-2.5 py-1 text-[11px] rounded font-bold cursor-pointer transition-all border ${
                    usageDays === d
                      ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {d >= 365 ? "近 1 年" : `近 ${d} 天`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void loadUsage()}
                disabled={usageLoading}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded text-[11px] font-bold cursor-pointer flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${usageLoading ? "animate-spin text-[#3182ce]" : ""}`} />
                刷新
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
            {usageLoading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
                <span className="text-xs font-bold text-slate-400">正在加载调用统计...</span>
              </div>
            ) : usageItems.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
                  <BarChart3 className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-sm font-black text-slate-800">近 {usageDays} 天暂无模型调用记录</h4>
                <p className="text-xs text-slate-500">执行任务后，此处将按模型展示调用次数、状态分布、Token 与计费明细。</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1180px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <th className="text-left px-4 py-4 whitespace-nowrap">来源</th>
                      <th className="text-left px-4 py-4 whitespace-nowrap">模型</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">调用次数</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">成功 / 成功率</th>
                      <th className="text-left px-4 py-4 whitespace-nowrap">状态分布</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">输入</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">输出</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">缓存读</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">缓存写</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">预扣 / 实扣点数</th>
                      <th className="text-right px-4 py-4 whitespace-nowrap">成本 / 售价</th>
                      <th className="text-left px-4 py-4 whitespace-nowrap">首次 / 最近调用</th>
                      <th className="text-left px-4 py-4 whitespace-nowrap">计价口径</th>
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 px-4 py-4 text-center whitespace-nowrap border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">明细</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsageItems.map((u) => {
                      const expanded = expandedKey === u.key;
                      const priceMeta = PRICE_STATUS_LABELS[u.priceStatus || ""] || null;
                      return (
                        <Fragment key={u.key}>
                          <tr className="group border-b border-slate-100 hover:bg-blue-50/30 transition-colors align-top">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  u.source === "BYO"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-blue-50 text-[#3182ce] border-blue-200"
                                }`}
                              >
                                {u.source === "BYO" ? "自建调用" : "系统分配"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="font-bold text-slate-800 truncate max-w-[200px]" title={`${u.providerId} / ${u.modelId}`}>
                                {u.modelId}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">{u.providerId}</div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono font-bold text-slate-900">{u.totalCalls.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600 whitespace-nowrap">
                              {u.settledCalls.toLocaleString()}
                              <span className="text-slate-400 ml-1">
                                ({u.totalCalls > 0 ? Math.round((u.settledCalls / u.totalCalls) * 100) : 0}%)
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-[10px] text-slate-500 font-mono">
                              {u.holdCalls > 0 && <span className="mr-1.5">处理中 {u.holdCalls}</span>}
                              {u.releasedCalls > 0 && <span className="mr-1.5">已释放 {u.releasedCalls}</span>}
                              {u.reviewCalls > 0 && <span className="mr-1.5 text-amber-600">待复核 {u.reviewCalls}</span>}
                              {u.holdCalls === 0 && u.releasedCalls === 0 && u.reviewCalls === 0 && (
                                <span className="text-slate-400">全部已结算</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600">{fmtTokens(u.inputTokens)}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600">{fmtTokens(u.outputTokens)}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600">{fmtTokens(u.cacheReadTokens)}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600">{fmtTokens(u.cacheWriteTokens)}</td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600 whitespace-nowrap">
                              <div>预扣 {u.holdPoints.toLocaleString()}</div>
                              <div className="text-slate-400">实扣 {u.actualPricePoints.toLocaleString()}</div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-slate-600 whitespace-nowrap">
                              <div>{fmtYuanFromMicros(u.costMicros)}</div>
                              <div className="text-slate-400">{fmtYuanFromMicros(u.userPriceMicros)}</div>
                            </td>
                            <td className="px-4 py-4 font-mono text-slate-500 whitespace-nowrap">
                              <div>{fmtTime(u.firstCalledAt)}</div>
                              <div className="text-slate-400">{fmtTime(u.lastCalledAt)}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  {BILLING_MODE_LABELS[u.billingMode || ""] || u.billingMode || "--"}
                                </span>
                                {priceMeta && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${priceMeta.cls}`}>
                                    {priceMeta.label}
                                  </span>
                                )}
                                {u.pricingMode && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {PRICING_MODE_LABELS[u.pricingMode] || u.pricingMode}
                                    {u.markupRateBps != null ? ` +${(u.markupRateBps / 100).toFixed(0)}%` : ""}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="sticky right-0 bg-white group-hover:bg-blue-50/50 backdrop-blur-xs z-10 px-4 py-4 text-center whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                              <button
                                type="button"
                                onClick={() => toggleDetails(u.key)}
                                className="px-2 py-1 rounded bg-white hover:bg-blue-50 text-[#3182ce] border border-blue-200 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                              >
                                <ListTree className="w-3 h-3" />
                                {expanded ? "收起" : "明细"}
                              </button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-100">
                              <td colSpan={14} className="px-3 py-3">
                                {detailsLoading === u.key ? (
                                  <div className="py-6 flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
                                    <span className="text-[11px] font-bold text-slate-400">正在加载任务级调用明细...</span>
                                  </div>
                                ) : (details[u.key] || []).length === 0 ? (
                                  <div className="py-6 text-center text-[11px] text-slate-400">暂无任务级调用记录</div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs min-w-[1080px]">
                                      <thead>
                                        <tr className="text-slate-500 font-bold border-b border-slate-200">
                                          <th className="text-left px-3 py-2.5 whitespace-nowrap">调用时间</th>
                                          <th className="text-left px-3 py-2.5 whitespace-nowrap">任务</th>
                                          <th className="text-left px-3 py-2.5 whitespace-nowrap">状态</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">输入</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">输出</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">缓存读</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">缓存写</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">预扣 / 实扣</th>
                                          <th className="text-right px-3 py-2.5 whitespace-nowrap">成本 / 售价</th>
                                          <th className="text-left px-3 py-2.5 whitespace-nowrap">计价口径</th>
                                          <th className="text-left px-3 py-2.5 whitespace-nowrap">错误码</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(details[u.key] || []).map((d) => {
                                          const st = STATUS_LABELS[d.status] || { label: d.status, cls: "bg-slate-100 text-slate-500 border-slate-200" };
                                          return (
                                            <tr key={d.taskId} className="border-b border-slate-100 last:border-b-0">
                                              <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{fmtTime(d.createdAt)}</td>
                                              <td className="px-3 py-2.5 font-mono text-slate-400 truncate max-w-[140px]" title={d.taskId}>{d.taskId.slice(0, 12)}...</td>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmtTokens(d.inputTokens)}</td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmtTokens(d.outputTokens)}</td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmtTokens(d.cacheReadTokens)}</td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmtTokens(d.cacheWriteTokens)}</td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                                {d.holdPoints.toLocaleString()} / {d.actualPricePoints.toLocaleString()}
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                                {d.costMicros != null ? fmtYuanFromMicros(d.costMicros) : "--"} / {d.userPriceMicros != null ? fmtYuanFromMicros(d.userPriceMicros) : "--"}
                                              </td>
                                              <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                                                {BILLING_MODE_LABELS[d.billingMode || ""] || d.billingMode || "--"}
                                              </td>
                                              <td className="px-3 py-2.5 font-mono text-amber-600 whitespace-nowrap">{d.errorCode || "--"}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    <div className="text-[10px] text-slate-400 mt-2">仅展示最近 {(details[u.key] || []).length} 条任务级记录</div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingChoice !== null}
        type={pendingIsSpaceDefault ? "info" : "warning"}
        title={pendingIsSpaceDefault ? "设为个人默认" : "切换默认模型"}
        message={
          pendingIsSpaceDefault
            ? `「${pendingLabel}」已是空间默认，全员都在用。是否也设为你的个人默认？`
            : currentDefaultLabel
            ? `您已拥有「${currentDefaultLabel}」默认模型，是否更改为当前模型？`
            : "是否设为当前默认模型？"
        }
        confirmText={pendingIsSpaceDefault ? "设为我的默认" : "更改为当前模型"}
        cancelText={pendingIsSpaceDefault ? "取消" : "保留当前"}
        onCancel={() => setPendingChoice(null)}
        onConfirm={() => {
          const id = pendingChoice;
          setPendingChoice(null);
          if (id) applyChoice(id);
        }}
      />

      {/* 申请使用：填写申请事由（普通成员 → 空间所有者） */}
      <ConfirmDialog
        isOpen={applyModal !== null}
        type="info"
        title="申请使用模型"
        message={
          applyModal
            ? `你正在申请使用「${applyModal.displayName || applyModal.name || applyModal.modelId}」，提交后由空间所有者审批；通过后将设为你在本空间的默认模型。请填写申请事由。`
            : ""
        }
        confirmText="提交申请"
        cancelText="取消"
        input={{
          label: "申请事由",
          placeholder: "请说明为何需要使用该模型（至少 5 个字）",
          required: true,
          value: applyReason,
          onChange: (v) => setApplyReason(v),
        }}
        onCancel={() => {
          setApplyModal(null);
          setApplyReason("");
        }}
        onConfirm={() => void submitApplication()}
      />

      {/* 驳回申请：必须填写拒绝原因 */}
      <ConfirmDialog
        isOpen={rejectTarget !== null}
        type="warning"
        title="驳回模型使用申请"
        message={
          rejectTarget
            ? `驳回「${rejectTarget.applicantName || rejectTarget.applicantId}」对「${rejectTarget.modelLabel || rejectTarget.deploymentId}」的使用申请，必须填写拒绝原因。`
            : ""
        }
        confirmText="确认驳回"
        cancelText="取消"
        input={{
          label: "拒绝原因",
          placeholder: "请填写拒绝原因（至少 2 个字）",
          required: true,
          value: rejectReason,
          onChange: (v) => setRejectReason(v),
        }}
        onCancel={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        onConfirm={() => {
          const target = rejectTarget;
          if (target) void reviewApplication(target.id, "REJECT");
        }}
      />
    </div>
  );
}
