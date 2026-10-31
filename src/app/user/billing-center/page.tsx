"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Layers,
  Box,
  TrendingUp,
  Building2,
  ArrowRight,
  HardDrive,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance } from "@/utils/quota";
import { formatDiscountLabel } from "@/lib/point-rate";
import { getMembershipLevelIcon } from "@/utils/membership-icon";
import WorkspacePlanSection from "@/components/pricing/WorkspacePlanSection";

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
  features?: string[];
  sortOrder: number;
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
    totalUsedTokens: 0,
  });
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

  /** 全量加载：用户/会员等级/使用统计/账号配额（并行非阻塞） */
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
          setWorkspaceQuota({
            membershipLevel: qData.membershipLevel || "FREE",
            membershipLevelName:
              qData.membershipLevelName || qData.membershipLevel || "免费体验版",
            tokenBalance: Number(qData.tokenBalance) > 0 ? Number(qData.tokenBalance) : 0,
            totalUsedTokens: qData.totalUsedTokens || 0,
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

    } catch (err) {
      console.error("加载套餐与计费数据失败:", err);
      toast.error("加载套餐与计费数据失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
                    <span className="text-white/80">当前可用算力余额</span>
                    <span className="font-black">
                      {formatTokenBalance(workspaceQuota.tokenBalance)} 点
                    </span>
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
              onUpgraded={() => {}}
            />
          </section>


        </>
      )}

    </div>
  );
}
