"use client";

/**
 * 组件进度总览（管理员）
 *
 * 数据全部来自后端实时聚合接口 GET /api/admin/components/progress-audit（数据库唯一真源）。
 * 本页面**不硬编码任何数量/比例**，不提供任何合同状态写入入口，
 * 不展示密钥（接口本身不返回 apiKey/baseUrl），权限不足时原样展示后端 403 code/message。
 */

import React, { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import {
  READINESS_FILTERS,
  deriveReadinessStatus,
  filterReadinessRows,
  summarizeReadiness,
  type ReadinessComponentRow,
  type ReadinessFilter,
} from "@/lib/component-readiness-view";
import { RefreshCw, ShieldAlert, Activity, Layers, AlertTriangle } from "lucide-react";

interface CapabilityRow {
  componentId: string;
  isPublished: boolean;
  activeContractId: string | null;
  activeContractVersion: string | null;
  activeLifecycle: string | null;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  executable: boolean;
  qualityHints: string[];
}

interface AuditData {
  generatedAt: string;
  windowDays: number;
  catalog: {
    total: number;
    published: number;
    withActiveContract: number;
    activePublished: number;
    noContract: number;
    draftOnly: number;
    invalidActiveRef: number;
    invalidActiveRefComponents: string[];
    contractCoveragePercent: number | null;
  };
  capabilities: {
    platformDefaultDeployment: {
      id: string | null;
      providerId: string | null;
      modelId: string | null;
      enabled: boolean;
      capabilities: string[];
    } | null;
    enabledDeployments: Array<{ providerId: string; modelId: string; capabilities: string[] }>;
    components: CapabilityRow[];
    capabilitySatisfiedCount: number;
    executableCount: number;
    blockedByCapabilityCount: number;
    needsReviewDeploymentCapabilities: Array<{ providerId: string; modelId: string; capability: string }>;
    contractsRequiringUnsupportedCapabilities: Array<{ componentId: string; capability: string }>;
  };
  execution: {
    recentRealModelTasks: number;
    recentSuccessfulRealExecutions: number;
    recentTotalTasks: number;
    realModelCoveragePercent: number | null;
  };
  billing: {
    settlementEnabled: boolean;
    billingMode: string;
    actualPoints: null;
    userPriceConfigured: boolean;
    markupRateBpsConfigured: boolean;
    markupRateBpsValues: number[];
    byokImplemented: boolean;
  };
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

export default function ComponentReadinessPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/components/progress-audit", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setData(null);
        setError({
          code: String(body?.code ?? `HTTP_${res.status}`),
          message: String(body?.message ?? body?.error ?? "读取组件进度失败"),
        });
        return;
      }
      setData(body.data as AuditData);
      setRefreshedAt(new Date().toLocaleString("zh-CN"));
    } catch (e) {
      setData(null);
      setError({ code: "NETWORK_ERROR", message: (e as Error)?.message || "网络异常，请稍后重试" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 组件状态一律来自后端返回的完整列表（数据库动态结构，不按组件 ID 的数字范围分组；
  // 未来新增 C61/C78/C100 或非 Cxx 组件时同样会被展示，无需改动本页）。
  const allRows: ReadinessComponentRow[] = data?.capabilities.components ?? [];
  const [statusFilter, setStatusFilter] = useState<ReadinessFilter>("ALL");
  const statusCounts = summarizeReadiness(allRows);
  const visibleRows = filterReadinessRows(allRows, statusFilter);

  const metric = (label: string, value: string, tone: "default" | "ok" | "warn" | "bad" = "default") => {
    const toneClass =
      tone === "ok"
        ? "text-emerald-600"
        : tone === "warn"
          ? "text-amber-600"
          : tone === "bad"
            ? "text-rose-600"
            : "text-slate-800";
    return (
      <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={`mt-1 text-xl font-black font-mono ${toneClass}`}>{value}</div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#3182ce]" />
            组件进度总览（数据库实时聚合）
          </h1>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            数据来源：<span className="font-mono">/api/admin/components/progress-audit</span>
            {data ? ` ｜ 统计口径：最近 ${data.windowDays} 天 ｜ 生成于 ${data.generatedAt}` : ""}
            {refreshedAt ? ` ｜ 刷新于 ${refreshedAt}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 px-3 rounded-lg bg-[#3182ce] text-white text-[11px] font-black flex items-center gap-1.5 disabled:bg-slate-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-[12px] font-bold text-slate-500 flex items-center gap-2">
          <Activity className="w-4 h-4 animate-pulse" /> 正在读取组件进度…
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-rose-700 space-y-1">
          <div className="font-black text-[13px] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> 读取失败 [{error.code}]
          </div>
          <div className="text-[12px] font-semibold">{error.message}</div>
          {error.code === "FORBIDDEN" && (
            <div className="text-[12px] font-semibold">当前账号无「组件统计审计 / 组件读取」权限，请联系平台管理员。</div>
          )}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {metric("组件总数", num(data.catalog.total))}
            {metric("已发布组件", num(data.catalog.published))}
            {metric("有激活合同", num(data.catalog.withActiveContract))}
            {metric(
              "合同覆盖率",
              data.catalog.contractCoveragePercent === null ? "—" : `${data.catalog.contractCoveragePercent}%`,
              (data.catalog.contractCoveragePercent ?? 0) >= 100 ? "ok" : "warn",
            )}
            {metric("能力满足数", num(data.capabilities.capabilitySatisfiedCount), "ok")}
            {metric("PUBLISHED 可执行", num(data.capabilities.executableCount), "ok")}
            {metric("无合同", num(data.catalog.noContract), "warn")}
            {metric("仅 DRAFT", num(data.catalog.draftOnly), data.catalog.draftOnly > 0 ? "warn" : "default")}
            {metric("能力阻断", num(data.capabilities.blockedByCapabilityCount), data.capabilities.blockedByCapabilityCount > 0 ? "bad" : "ok")}
            {metric("activeContractId 无效", num(data.catalog.invalidActiveRef), data.catalog.invalidActiveRef > 0 ? "bad" : "ok")}
            {metric(`最近真实执行（${data.windowDays}天）`, num(data.execution.recentRealModelTasks))}
            {metric("窗口内任务总数", num(data.execution.recentTotalTasks))}
            {
              metric(
                "真实模型覆盖率",
                data.execution.realModelCoveragePercent === null ? "—" : `${data.execution.realModelCoveragePercent}%`,
                data.execution.realModelCoveragePercent === 100 ? "ok" : "warn",
              )
            }
            {metric("真实 Token 结算", data.billing.settlementEnabled ? "已开启" : "未开启", data.billing.settlementEnabled ? "bad" : "ok")}
            {metric("计费口径", data.billing.billingMode)}
            {metric("BYOK", data.billing.byokImplemented ? "已实现" : "未实现")}
            {metric("用户售价", data.billing.userPriceConfigured ? "已配置" : "未配置")}
            {metric("平台加价", data.billing.markupRateBpsConfigured ? "已配置" : "未配置")}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 font-semibold space-y-1">
            <div className="text-[12px] font-black text-slate-800">口径说明（可执行 ≠ 已验收）</div>
            <div>
              · <span className="text-emerald-700">允许执行</span>：合同已发布且能力门禁允许执行（状态=可执行）。
            </div>
            <div>
              · <span className="text-sky-700">真实模型调用验收</span>：本窗口真实模型任务数 = {num(data.execution.recentRealModelTasks)}（见执行统计），逐结果验收仍待用户确认。
            </div>
            <div>
              · <span className="text-amber-700">输出质量待验证</span>：结构化结果已做服务端 schema 校验，但业务/数值准确性、代码、脱敏等仍须人工复核（见各组件「质量限制」列）。
            </div>
            <div>
              · <span className="text-rose-700">产品限制</span>：含个人信息样例须脱敏、代码须审查等，见「质量限制」列。
            </div>
            <div className="text-slate-500">
              状态为「可执行」仅表示可运行，<b>不代表结果已验收或产品质量 COMPLETE</b>；所有 AI 生成内容使用前须人工复核。
            </div>
          </div>

          {(data.capabilities.needsReviewDeploymentCapabilities.length > 0 ||
            data.capabilities.contractsRequiringUnsupportedCapabilities.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-[11px] font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div>
                存在需复核的能力声明（NEEDS_REVIEW）：部署{" "}
                {data.capabilities.needsReviewDeploymentCapabilities.map((x) => `${x.providerId}/${x.modelId}:${x.capability}`).join("、") || "无"}；
                合同要求未覆盖能力{" "}
                {data.capabilities.contractsRequiringUnsupportedCapabilities.map((x) => `${x.componentId}:${x.capability}`).join("、") || "无"}。
              </div>
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12px] font-black text-slate-800">
                全部组件状态（数据库 activeContractId 与合同 lifecycle 派生的动态列表）
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {READINESS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    className={`h-6.5 px-2 rounded text-[10px] font-black border ${
                      statusFilter === f.key
                        ? "bg-[#3182ce] text-white border-[#3182ce]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {f.label}（{statusCounts[f.key]}）
                  </button>
                ))}
              </div>
            </div>
            {visibleRows.length === 0 ? (
              <div className="px-4 py-6 text-[11px] font-semibold text-slate-500">
                当前筛选（{READINESS_FILTERS.find((f) => f.key === statusFilter)?.label ?? statusFilter}）下暂无组件。
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-black">组件</th>
                      <th className="text-left px-4 py-2 font-black">合同版本</th>
                      <th className="text-left px-4 py-2 font-black">生命周期</th>
                      <th className="text-left px-4 py-2 font-black">要求能力</th>
                      <th className="text-left px-4 py-2 font-black">能力缺口</th>
                      <th className="text-left px-4 py-2 font-black">状态</th>
                      <th className="text-left px-4 py-2 font-black">质量限制 / 待验证</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const status = deriveReadinessStatus(row);
                      return (
                        <tr key={row.componentId} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-mono font-bold text-slate-800">{row.componentId}</td>
                          <td className="px-4 py-2 font-mono">{row.activeContractVersion ?? "—"}</td>
                          <td className="px-4 py-2 font-bold">
                            {row.activeLifecycle ?? (row.activeContractId ? "非 PUBLISHED" : "—")}
                          </td>
                          <td className="px-4 py-2 font-mono text-slate-600">{row.requiredCapabilities.join(", ") || "—"}</td>
                          <td className="px-4 py-2 font-mono text-rose-600">{row.missingCapabilities.join(", ") || "无"}</td>
                          <td
                            className={`px-4 py-2 font-black ${
                              status.key === "EXECUTABLE"
                                ? "text-emerald-600"
                                : status.key === "UNCONFIGURED"
                                  ? "text-amber-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {status.label}
                          </td>
                          <td className="px-4 py-2">
                            {row.qualityHints && row.qualityHints.length > 0 ? (
                              <ul className="space-y-1">
                                {row.qualityHints.map((h, hi) => (
                                  <li
                                    key={hi}
                                    className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 rounded px-1.5 py-0.5 leading-snug"
                                  >
                                    {h}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 border-t border-slate-100 text-[10px] font-semibold text-slate-500">
              共 {statusCounts.ALL} 个组件，当前展示 {visibleRows.length} 个（筛选：
              {READINESS_FILTERS.find((f) => f.key === statusFilter)?.label ?? statusFilter}）
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 text-[11px] text-slate-600 font-semibold space-y-1">
            <div className="text-[12px] font-black text-slate-800">当前执行环境</div>
            <div>
              平台默认部署：
              {data.capabilities.platformDefaultDeployment
                ? `${data.capabilities.platformDefaultDeployment.providerId}/${data.capabilities.platformDefaultDeployment.modelId}（${data.capabilities.platformDefaultDeployment.enabled ? "已启用" : "未启用"}）｜ 声明能力 ${data.capabilities.platformDefaultDeployment.capabilities.join(", ") || "无"}`
                : "未配置"}
            </div>
            <div>启用部署数：{data.capabilities.enabledDeployments.length}</div>
            <div>本页为只读视图，不提供任何合同发布/激活/删除入口。</div>
          </section>
        </>
      )}
    </div>
  );
}
