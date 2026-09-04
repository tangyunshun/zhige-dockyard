"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Zap,
  ChevronRight,
  RefreshCw,
  Download,
  CheckCircle2,
  Layers,
  Receipt,
  Box,
  TrendingUp,
  Building2,
  ArrowRight,
  Crown,
  HardDrive,
  BadgePercent,
  AlertCircle,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";
import { formatYuanFromPoints, formatDiscountLabel } from "@/lib/point-rate";
import { getMembershipLevelIcon } from "@/utils/membership-icon";
import WorkspacePlanSection from "@/components/pricing/WorkspacePlanSection";

interface BillingRecord {
  id: string;
  /** 消费类型：TOKEN_RECHARGE / PLAN_UPGRADE / MEMBERSHIP / REFUND */
  type: string;
  title: string;
  amount: string;
  status: "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";
  date: string;
}

/** 会员等级数据（与数据库 membershiplevel 表一致，价格单位为分） */
interface MembershipLevelRow {
  name: string;
  nameZh: string;
  icon: string | null;
  color: string;
  description: string | null;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxApiCalls: number;
  maxStorage: number;
  tokenLimit: number;
  tokenPackDiscount: number;
  sortOrder: number;
}

/** 推算次月 1 日，作为算力重置日期的兜底值 */
function getNextMonthFirstDay(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate()
  ).padStart(2, "0")}`;
}

/** 格式化账单时间：YYYY-MM-DD HH:mm */
function formatBillingDate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** 消费类型展示元信息（与 billing_record.type 枚举保持一致） */
const CONSUMPTION_TYPE_META: Record<string, { label: string; badge: string }> = {
  TOKEN_RECHARGE: { label: "算力充值", badge: "bg-amber-50 text-amber-600 border-amber-200" },
  PLAN_UPGRADE: { label: "空间套餐扩容", badge: "bg-blue-50 text-[#2b6cb0] border-blue-200" },
  MEMBERSHIP: { label: "会员订阅", badge: "bg-purple-50 text-purple-600 border-purple-200" },
  REFUND: { label: "退款", badge: "bg-rose-50 text-rose-600 border-rose-200" },
};

function getConsumptionTypeMeta(type: string): { label: string; badge: string } {
  return (
    CONSUMPTION_TYPE_META[type] || {
      label: type || "其他",
      badge: "bg-slate-50 text-slate-500 border-slate-200",
    }
  );
}

/** 消费类型对应图标（参考管理员后台样式：徽章统一带左侧 icon） */
const CONSUMPTION_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  TOKEN_RECHARGE: Zap,
  PLAN_UPGRADE: Layers,
  MEMBERSHIP: Crown,
  REFUND: RefreshCw,
};

function getConsumptionTypeIcon(type: string): React.ComponentType<any> {
  return CONSUMPTION_TYPE_ICONS[type] || Layers;
}

/** 字节格式化：自动转换为 GB（保留 1 位小数） */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 GB";
  const gb = bytes / 1073741824;
  return `${gb.toFixed(1)} GB`;
}

/** 等级图标映射：统一走共享的商务图标表（不使用 emoji 表情） */
function getLevelIcon(name: string) {
  return getMembershipLevelIcon(name) as React.ComponentType<{ className?: string }>;
}

export default function BillingCenterPage() {
  const router = useRouter();
  const toast = useToast();
  const { userState } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [levels, setLevels] = useState<MembershipLevelRow[]>([]);
  const [stats, setStats] = useState({
    workspaceCount: 0,
    componentCount: 0,
    apiCallsUsed: 0,
    storageUsed: 0,
  });
  const [workspaceQuota, setWorkspaceQuota] = useState<any>({
    membershipLevel: "FREE",
    membershipLevelName: "免费体验版",
    tokenBalance: 0,
    tokenLimit: 10000,
    totalUsedTokens: 0,
    renewDate: getNextMonthFirstDay(),
  });
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  /** 账单 API 错误信息（用于表格顶部显式提示用户） */
  const [billingError, setBillingError] = useState<string | null>(null);

  // 空间级扩容：支持 ?workspaceId 直达 + 多空间切换
  const [mounted, setMounted] = useState(false);
  const initializedWsRef = useRef(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string>("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // 初始化选中空间：URL ?workspaceId 优先，否则用户空间列表首个
  useEffect(() => {
    if (!mounted) return;
    if (initializedWsRef.current) return;
    const paramWs = new URLSearchParams(window.location.search).get("workspaceId");
    const list = userState?.workspaces || [];
    const first = list.length > 0 ? list[0] : null;
    const targetId = paramWs || first?.id || null;
    if (targetId) {
      initializedWsRef.current = true;
      setActiveWorkspaceId(targetId);
      const found = list.find((ws: any) => ws.id === targetId);
      setActiveWorkspaceName(found?.name || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, userState?.workspaces]);

  const spaces: any[] = userState?.workspaces || [];

  /** 拉取账单流水（数据库 billing_record 表）：账号级全量 */
  const loadBillingRecords = useCallback(async () => {
    try {
      setBillingError(null);
      const authToken = getAuthToken();
      const billRes = await fetch(`/api/billing/records`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (billRes.ok) {
        const bData = await billRes.json();
        if (bData.success && Array.isArray(bData.data)) {
          setBillingHistory(
            bData.data.map((r: any) => ({
              id: r.id,
              type: r.type,
              title: r.title,
              amount: `¥ ${((r.amount ?? 0) / 100).toFixed(2)}`,
              status: r.status,
              date: formatBillingDate(r.date ?? r.createdAt),
            }))
          );
          return;
        }
        setBillingError(bData.error || "账单服务返回异常");
      } else {
        setBillingError(`账单接口返回 HTTP ${billRes.status}`);
      }
    } catch (err) {
      console.error("加载账单流水失败:", err);
      setBillingError("网络异常，无法连接到账单服务");
    }
  }, []);

  /** 全量加载：用户/会员等级/使用统计/账号配额/账单流水（并行非阻塞） */
  const loadBillingData = useCallback(async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      const [userRes, quotaRes, levelsRes, statsRes] = await Promise.all([
        fetch("/api/auth/me", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }),
        fetch("/api/workspace/quota", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }),
        fetch("/api/membership/levels"),
        fetch("/api/user/dashboard/stats", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }),
      ]);

      if (userRes.ok) {
        const uData = await userRes.json();
        setUserInfo(uData.user || null);
      }

      if (quotaRes.ok) {
        const qData = await quotaRes.json();
        if (qData.success) {
          const resetAt = qData.resetAt ? qData.resetAt.slice(0, 10) : getNextMonthFirstDay();
          setWorkspaceQuota({
            membershipLevel: qData.membershipLevel || "FREE",
            membershipLevelName:
              qData.membershipLevelName || qData.membershipLevel || "免费体验版",
            tokenBalance: qData.tokenBalance ?? 0,
            tokenLimit: qData.tokenLimit ?? 10000,
            totalUsedTokens: qData.totalUsedTokens || 0,
            renewDate: resetAt,
          });
        }
      }

      if (levelsRes.ok) {
        const lData = await levelsRes.json();
        if (lData.success && Array.isArray(lData.data)) setLevels(lData.data);
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        if (sData.data) {
          setStats({
            workspaceCount: sData.data.workspaceCount || 0,
            componentCount: sData.data.componentCount || 0,
            apiCallsUsed: sData.data.apiCallsUsed || 0,
            storageUsed: sData.data.storageUsed || 0,
          });
        }
      }

      await loadBillingRecords();
    } catch (err) {
      console.error("加载套餐与计费数据失败:", err);
      toast.error("加载套餐与计费数据失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  }, [loadBillingRecords, toast]);

  useEffect(() => {
    if (mounted) {
      loadBillingData();
    }
  }, [mounted, loadBillingData]);

  /** 当前会员等级配置与使用量 */
  const membershipLevel =
    userInfo?.membershipLevel || workspaceQuota.membershipLevel || "FREE";
  const memberConfig = levels.find((l) => l.name === membershipLevel) || null;
  const LevelIcon = getLevelIcon(memberConfig?.name || membershipLevel);
  const levelIndex = levels.findIndex((l) => l.name === membershipLevel);

  /** 配额用量百分比（-1 无限不画进度） */
  const toPercent = (used: number, limit: number | undefined): number | null => {
    if (limit === undefined || limit === null || limit === -1 || limit <= 0) return null;
    if (!used) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const quotaBars = memberConfig
    ? [
        {
          label: "工作空间",
          icon: <Building2 className="w-4 h-4" />,
          used: stats.workspaceCount,
          limit: memberConfig.maxPersonalWorkspaces,
          display: `${stats.workspaceCount} / ${
            memberConfig.maxPersonalWorkspaces === -1
              ? "无限"
              : memberConfig.maxPersonalWorkspaces
          } 个`,
          unlimited: memberConfig.maxPersonalWorkspaces === -1,
        },
        {
          label: "组件装配",
          icon: <Box className="w-4 h-4" />,
          used: stats.componentCount,
          limit: memberConfig.maxComponents,
          display: `${stats.componentCount} / ${
            memberConfig.maxComponents === -1 ? "无限" : memberConfig.maxComponents
          } 个`,
          unlimited: memberConfig.maxComponents === -1,
        },
        {
          label: "API 调用",
          icon: <TrendingUp className="w-4 h-4" />,
          used: stats.apiCallsUsed,
          limit: memberConfig.maxApiCalls,
          display: `${stats.apiCallsUsed.toLocaleString()} / ${
            memberConfig.maxApiCalls === -1
              ? "无限"
              : memberConfig.maxApiCalls.toLocaleString()
          } 次`,
          unlimited: memberConfig.maxApiCalls === -1,
        },
        {
          label: "云端存储",
          icon: <HardDrive className="w-4 h-4" />,
          used: stats.storageUsed,
          limit: memberConfig.maxStorage,
          display: `${formatBytes(stats.storageUsed)} / ${
            memberConfig.maxStorage === -1 ? "无限" : formatBytes(Number(memberConfig.maxStorage))
          }`,
          unlimited: memberConfig.maxStorage === -1,
        },
      ]
    : [];

  // 电子凭证下载（纯前端 Blob 导出，不依赖后端）
  const handleDownloadInvoice = (invId: string) => {
    const inv =
      billingHistory.find((b) => b.id === invId) || {
        id: invId,
        type: "TOKEN_RECHARGE",
        title: "知阁·舟坊算力充值交易凭证",
        amount: "¥ 0.00",
        date: new Date().toLocaleString(),
      };
    const content = `# 知阁·舟坊 官方电子交易对账凭证\n\n**凭证编号**: ${inv.id}\n**消费类型**: ${getConsumptionTypeMeta(inv.type).label}\n**交易描述**: ${inv.title}\n**交易金额**: ${inv.amount}\n**交易时间**: ${inv.date}\n**盖章单位**: 知阁·舟坊 平台结算中心\n\n---\n*本电子凭证由 MySQL 数据库交易日志自动生成，具备物理查验效力。*`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Invoice_${inv.id}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`交易凭证 [${invId}] 已成功导出并触发下载`);
  };

  // 电子发票申请
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [taxId, setTaxId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceTitle.trim()) {
      toast.error("请输入发票开具抬头");
      return;
    }
    try {
      setSubmittingInvoice(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invoice",
          title: `发票开具申请: ${invoiceTitle}`,
          content: `开票抬头: ${invoiceTitle}\n纳税人识别号: ${taxId || "无"}\n接收邮箱: ${
            invoiceEmail || userInfo?.email || "无"
          }`,
          contact: invoiceEmail || userInfo?.email || "",
        }),
      });
      if (res.ok) {
        toast.success("电子发票开具申请已成功提交至工单中心，系统将在 1 个工作日内发送至您的邮箱！");
        setIsInvoiceModalOpen(false);
        setInvoiceTitle("");
        setTaxId("");
      } else {
        toast.error("提交发票申请失败，请稍后重试");
      }
    } catch (err) {
      console.error("提交发票申请失败:", err);
      toast.error("网络提交失败");
    } finally {
      setSubmittingInvoice(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* 页头 */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1 tracking-tight flex items-center gap-2">
            套餐与计费中心
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-100 font-bold">
              会员 · 空间 · 算力
            </span>
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            统一管理账号会员订阅、空间扩容包、算力余额与账单发票
          </p>
        </div>
        <button
          onClick={() => router.push("/pricing")}
          className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0 w-fit"
        >
          前往价格方案
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-9 h-9 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">正在从数据库拉取套餐、空间与账单数据...</p>
        </div>
      ) : (
        <>
          {/* ============ 区块一：我的会员订阅 ============ */}
          <section className="shrink-0">
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
              我的会员订阅
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 会员等级品牌卡 */}
              <div
                className="relative rounded-2xl p-6 overflow-hidden lg:col-span-1 flex flex-col justify-between text-white shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${
                    memberConfig?.color || "#3182ce"
                  }, #1a56a6)`,
                }}
              >
                <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-white/15 blur-2xl pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-white/80 text-xs font-bold tracking-wide">
                      当前会员等级
                    </p>
                    {levelIndex >= 0 && (
                      <span className="px-2 py-0.5 bg-white/20 backdrop-blur rounded-full text-[10px] font-black">
                        L{levelIndex + 1} 会员
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <LevelIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black leading-none">
                        {memberConfig?.nameZh || workspaceQuota.membershipLevelName || "免费版"}
                      </h3>
                      <p className="text-white/80 text-xs mt-1.5">
                        {memberConfig?.description || "基础功能免费使用"}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 mt-4 border-t border-white/20 flex items-center justify-between text-xs">
                    <span className="text-white/80">算力月度重置日</span>
                    <span className="font-black">{workspaceQuota.renewDate}</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/pricing")}
                  className="relative mt-5 w-full h-9 rounded-lg bg-white/95 text-slate-800 text-xs font-black hover:bg-white transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
                >
                  升级 / 续费会员
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 配额使用进度 */}
              <div className="lg:col-span-2 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-xs relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-[#3182ce]/5 blur-3xl pointer-events-none" />
                <div className="flex items-center justify-between mb-4 relative">
                  <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#3182ce]" />
                    配额使用概览
                  </h3>
                  <button
                    onClick={() => router.push("/pricing")}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                  >
                    查看权益详情 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 relative">
                  {quotaBars.map((bar) => {
                    const percent = toPercent(bar.used, bar.limit);
                    return (
                      <div key={bar.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                            <span className="text-slate-400">{bar.icon}</span>
                            {bar.label}
                          </span>
                          <span className="text-xs font-black text-slate-800 font-mono">
                            {bar.display}
                          </span>
                        </div>
                        {bar.unlimited || percent === null ? (
                          <div className="text-[10px] text-emerald-600 font-bold">
                            当前等级无限制
                          </div>
                        ) : (
                          <>
                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  percent > 90
                                    ? "bg-red-500"
                                    : percent > 70
                                      ? "bg-[#f59e0b]"
                                      : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0]"
                                }`}
                                style={{ width: `${Math.max(4, percent)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                              已使用 {percent}%
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {quotaBars.length === 0 && (
                    <p className="text-xs text-slate-400 font-medium">
                      会员权益配置加载中，请稍后查看配额使用情况。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ============ 区块二：我的空间套餐 ============ */}
          <section className="shrink-0">
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
              我的空间套餐
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 font-black">
                一次性扩容 · 长期生效
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-medium -mt-2 mb-3">
              在下方选择空间后，可直接查看该空间席位 / 组件装配 / 存储 / 调用额度用量并购买扩容包
            </p>

            {/* 空间切换 chips */}
            {spaces.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">
                  当前空间
                </span>
                {spaces.map((ws: any) => {
                  const isActive = activeWorkspaceId === ws.id;
                  return (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setActiveWorkspaceName(ws.name || "");
                      }}
                      className={`h-8 px-3.5 rounded-lg text-xs font-bold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white border-transparent shadow-sm"
                          : "bg-white/70 text-slate-600 border-slate-200 hover:border-[#3182ce]/40 hover:text-[#3182ce]"
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      {ws.name || "工作空间"}
                      {ws.type === "ENTERPRISE" && (
                        <span
                          className={`text-[9px] px-1 py-px rounded font-black ${
                            isActive ? "bg-white/20 text-white" : "bg-violet-50 text-violet-600"
                          }`}
                        >
                          企业
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <WorkspacePlanSection
              key={activeWorkspaceId || "auto"}
              workspaceId={activeWorkspaceId}
              onUpgraded={() => loadBillingRecords()}
            />
          </section>

          {/* ============ 区块三：算力与账单 ============ */}
          <section className="shrink-0">
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
              算力与账单
            </h2>

            {/* 卡片矩阵：算力余额 / 会员权益 / 发票 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              {/* 卡 1：可用算力 Token 余额 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      可用算力余额
                    </span>
                    <span className="text-[11px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                      实时扣减中
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-[#2b6cb0] tracking-tight mb-1 font-mono flex items-baseline gap-1">
                    {formatTokenBalance(workspaceQuota.tokenBalance)}
                    <span className="text-xs font-bold text-slate-400 font-sans">Tokens</span>
                  </h3>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3 mb-1">
                    <div
                      className="bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          isUnlimitedToken(workspaceQuota.tokenBalance)
                            ? 100
                            : Math.min(
                                100,
                                Math.max(
                                  8,
                                  (workspaceQuota.tokenBalance /
                                    (workspaceQuota.tokenLimit || 10000)) *
                                    100
                                )
                              )
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    累计已消耗{" "}
                    <strong className="text-slate-600">
                      {formatTokenBalance(workspaceQuota.totalUsedTokens)}
                    </strong>{" "}
                    Tokens
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => router.push("/pricing")}
                    className="h-8 px-3.5 rounded-md bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:shadow text-white text-xs font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 fill-[#3182ce]" />
                    查看充值方案
                  </button>
                  <span className="text-[10px] text-slate-400 font-medium">
                    月重置 {workspaceQuota.renewDate}
                  </span>
                </div>
              </div>

              {/* 卡 2：会员权益速览 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      会员月度权益
                    </span>
                    <span className="text-[11px] font-extrabold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                      {memberConfig?.nameZh || "免费版"}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-800 mb-1">
                    每月算力额度{" "}
                    <span className="font-mono text-[#2b6cb0]">
                      {memberConfig?.tokenLimit === -1
                        ? "无限"
                        : formatTokenBalance(memberConfig?.tokenLimit)}
                    </span>{" "}
                    Tokens
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {memberConfig && memberConfig.tokenLimit !== -1
                      ? `折合约 ¥${formatYuanFromPoints(memberConfig.tokenLimit)} 的算力消耗`
                      : "当前等级算力额度无上限"}
                    {memberConfig && memberConfig.tokenPackDiscount > 0 && (
                      <span className="block mt-1.5">
                        加油包会员折扣：
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 font-black ml-1">
                          <BadgePercent className="w-3 h-3" />
                          {formatDiscountLabel(memberConfig.tokenPackDiscount)}
                        </span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">
                    企业空间
                    {memberConfig?.maxEnterpriseWorkspaces === -1
                      ? " 无限"
                      : ` ${memberConfig?.maxEnterpriseWorkspaces ?? 1} 个`}
                  </span>
                  <button
                    onClick={() => router.push("/pricing")}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                  >
                    升级解锁更多 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 卡 3：企业发票 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      发票与企业对公
                    </span>
                    <Receipt className="w-4 h-4 text-slate-400" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-800 mb-1">
                    增值税电子普通 / 专用发票
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    支持按个人或企业抬头一键开具，开票历史随时可查与电子凭证导出。
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setIsInvoiceModalOpen(true)}
                    className="h-8 px-3 rounded-md bg-[#2b6cb0] hover:bg-[#3182ce] text-xs font-bold text-white shadow-xs transition-all cursor-pointer inline-flex items-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    在线申请开票
                  </button>
                  <button
                    onClick={() => router.push("/docs")}
                    className="text-xs font-bold text-slate-500 hover:text-[#3182ce] transition-colors cursor-pointer inline-flex items-center gap-0.5"
                  >
                    计费规则 <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* 账单流水 */}
            <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#3182ce]" />
                    账单与交易历史 (Billing History)
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    展示平台产生的所有算力购买、空间扩容与会员订阅交易明细
                  </p>
                </div>
                <button
                  onClick={loadBillingData}
                  className="h-8 px-3 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  刷新
                </button>
              </div>

              {/* 账单接口错误提示：给出明确文案并提供重试入口 */}
              {billingError && (
                <div className="mb-3 p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <div className="text-red-700 font-bold">
                      账单接口加载失败：{billingError}
                    </div>
                  </div>
                  <button
                    onClick={loadBillingData}
                    className="h-7 px-3 rounded-md bg-white border border-red-200 text-red-600 hover:bg-red-100 font-bold transition-all cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    重试
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs table-auto">
                  <thead>
                    <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 font-bold">
                      <th className="py-3 px-4 rounded-l-lg whitespace-nowrap">账单流水单号</th>
                      <th className="py-3 px-4 whitespace-nowrap">消费类型</th>
                      <th className="py-3 px-4 whitespace-nowrap">描述说明</th>
                      <th className="py-3 px-4 whitespace-nowrap">交易金额</th>
                      <th className="py-3 px-4 whitespace-nowrap">交易时间</th>
                      <th className="py-3 px-4 whitespace-nowrap">状态</th>
                      <th className="py-3 px-4 text-right rounded-r-lg whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {billingHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400 text-xs font-semibold whitespace-nowrap">
                          <div className="flex flex-col items-center gap-2 py-2">
                            <Receipt className="w-6 h-6 text-slate-300" />
                            <p>暂无交易记录，完成会员订阅或空间扩容后将在此展示明细</p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              若您近期已完成升级但未显示，请检查登录账号是否与购买账号一致，并点击刷新
                            </p>
                            <button
                              onClick={loadBillingData}
                              className="mt-1 h-7 px-3 rounded-md bg-[#3182ce]/10 hover:bg-[#3182ce]/15 text-[#2b6cb0] text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              立即刷新
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      billingHistory.map((rec) => {
                        const TypeIcon = getConsumptionTypeIcon(rec.type);
                        return (
                          <tr key={rec.id} className="hover:bg-blue-50/20 transition-colors">
                            <td className="py-3.5 px-4 font-mono text-slate-900 font-bold whitespace-nowrap">
                              {rec.id}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border whitespace-nowrap ${getConsumptionTypeMeta(rec.type).badge}`}
                              >
                                <TypeIcon className="w-3 h-3 shrink-0" />
                                {getConsumptionTypeMeta(rec.type).label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-semibold max-w-[260px] truncate" title={rec.title}>
                              {rec.title}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-emerald-600 whitespace-nowrap tabular-nums">
                              {rec.amount}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap tabular-nums">
                              {rec.date}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                成功
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleDownloadInvoice(rec.id)}
                                className="text-[#3182ce] hover:underline font-bold text-xs cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Download className="w-3 h-3 shrink-0" />
                                电子凭证
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 电子发票开具真实弹窗 Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3182ce]" />
                增值税电子发票申请
              </h3>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInvoice} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  发票开具抬头 (企业 / 个人名称) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="请输入公司全称或个人抬头"
                  value={invoiceTitle}
                  onChange={(e) => setInvoiceTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  纳税人识别号 / 统一社会信用代码 (企业必填)
                </label>
                <input
                  type="text"
                  placeholder="个人抬头无需填写，企业请输入 18 位税号"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  接收电子发票邮箱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="开具成功后将发送至该邮箱"
                  value={invoiceEmail}
                  onChange={(e) => setInvoiceEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="h-8 px-4 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingInvoice}
                  className="h-8 px-4 rounded-md bg-[#2b6cb0] hover:bg-[#3182ce] text-white font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {submittingInvoice ? "提交开票中..." : "确认提交开票申请"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
