"use client";

/**
 * 定制咨询 / 升级申请处理
 *
 * 用户在定价页（空间套餐区 / 会员定制引导）提交的「定制版方案咨询」会写入
 * upgradeapplication 表，由管理员在此跟进处理。
 *
 * 处理动作（均真实落库 + 审计 + 站内通知用户）：
 *  - 开始处理：PENDING → PROCESSING
 *  - 标记完成：PROCESSING → COMPLETED；可选「签约开通企业套餐」（指定 PRO / 旗舰版 / 定制版
 *    及月付/年付），后端会真实把该用户关联的个人空间升级为对应企业套餐。
 *  - 驳回：→ REJECTED，必须填写处理说明（用户可见）。
 */

import { useCallback, useEffect, useState } from "react";
import {
  MessagesSquare,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Building2,
  Phone,
  User,
  FileText,
  Inbox,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { describeApiError } from "@/lib/admin-error-presenter";

type ConsultStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";

interface ConsultRow {
  id: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  description: string | null;
  adminRemark: string | null;
  status: ConsultStatus;
  createdAt: string;
  handledBy: string | null;
  workspace?: { id: string; name: string; type?: string } | null;
  user?: { id: string; name?: string | null; email?: string | null; phone?: string | null } | null;
}

const STATUS_META: Record<
  ConsultStatus,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PENDING: {
    label: "待处理",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
  },
  PROCESSING: {
    label: "处理中",
    cls: "bg-blue-50 text-[#2b6cb0] border-blue-200",
    icon: Loader2,
  },
  COMPLETED: {
    label: "已完成",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "已驳回",
    cls: "bg-rose-50 text-rose-600 border-rose-200",
    icon: XCircle,
  },
};

const STATUS_FILTERS: { key: "" | ConsultStatus; label: string }[] = [
  { key: "", label: "全部" },
  { key: "PENDING", label: "待处理" },
  { key: "PROCESSING", label: "处理中" },
  { key: "COMPLETED", label: "已完成" },
  { key: "REJECTED", label: "已驳回" },
];

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function UpgradeApplicationsPage() {
  const [rows, setRows] = useState<ConsultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; troubleshooting?: string[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | ConsultStatus>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 处理弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<{ row: ConsultRow; next: ConsultStatus } | null>(null);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // 签约开通企业套餐（仅在「标记完成」时可选）
  const [openPlan, setOpenPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState<"MONTH" | "YEAR">("YEAR");

  const authFetch = useCallback(
    (input: string, init?: RequestInit) => {
      const token = getAuthToken();
      const headers = new Headers(init?.headers);
      headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    []
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await authFetch(`/api/admin/upgrade-applications${qs}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setRows(data.data?.applications || []);
      } else {
        setLoadError(describeApiError(data, "获取定制咨询列表失败"));
      }
    } catch {
      setLoadError({ message: "网络异常，获取定制咨询列表失败" });
    } finally {
      setLoading(false);
    }
  }, [authFetch, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (row: ConsultRow, next: ConsultStatus) => {
    setDialogTarget({ row, next });
    setRemark("");
    setOpenPlan("");
    setBillingCycle("YEAR");
    setDialogError(null);
    setDialogOpen(true);
  };

  const submitDialog = async () => {
    if (!dialogTarget) return;
    const { row, next } = dialogTarget;
    if (next === "REJECTED" && !remark.trim()) {
      setDialogError("驳回时必须填写处理说明，便于用户知晓原因");
      return;
    }
    try {
      setSubmitting(true);
      setDialogError(null);
      setUpdatingId(row.id);
      const res = await authFetch("/api/admin/upgrade-applications", {
        method: "PATCH",
        body: JSON.stringify({
          applicationId: row.id,
          status: next,
          adminRemark: remark.trim() || undefined,
          ...(next === "COMPLETED" && openPlan ? { openPlan, billingCycle } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDialogOpen(false);
        setDialogTarget(null);
        await load();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("admin-pending-tasks-changed"));
        }
      } else {
        const friendly = describeApiError(data, "更新处理状态失败");
        setDialogError(friendly.message);
      }
    } catch {
      setDialogError("网络异常，更新处理状态失败");
    } finally {
      setUpdatingId(null);
      setSubmitting(false);
    }
  };

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-[#3182ce]" />
            定制咨询处理
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1">
            用户在定价页提交的定制版方案咨询，请及时跟进并记录处理结果
            {pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black">
                {pendingCount} 条待处理
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* 状态筛选 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border cursor-pointer transition-colors ${
              statusFilter === f.key
                ? "bg-[#3182ce] text-white border-[#3182ce]"
                : "bg-white text-slate-600 border-slate-200 hover:border-[#3182ce]/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 错误提示 */}
      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs">
          <p className="font-black text-rose-700">{loadError.message}</p>
          {loadError.troubleshooting && loadError.troubleshooting.length > 0 && (
            <ul className="mt-1.5 list-disc list-inside text-rose-600 font-bold space-y-0.5">
              {loadError.troubleshooting.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-10 flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 flex flex-col items-center justify-center gap-2 text-center">
          <Inbox className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-black text-slate-500">暂无咨询记录</p>
          <p className="text-[11px] text-slate-400 font-bold">
            用户在定价页「申请定制方案」提交的咨询会出现在这里
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white divide-y divide-slate-100">
          {rows.map((row) => {
            const meta = STATUS_META[row.status] || STATUS_META.PENDING;
            const StatusIcon = meta.icon;
            const canProcess = row.status === "PENDING" || row.status === "PROCESSING";
            return (
              <div key={row.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800">{row.companyName}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold border flex items-center gap-1 ${meta.cls}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap text-[11px] font-bold text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {row.contactName}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {row.contactPhone}
                      </span>
                      {row.workspace?.name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          关联空间：{row.workspace.name}
                        </span>
                      )}
                      <span>{formatTime(row.createdAt)}</span>
                    </div>
                  </div>

                  {canProcess && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.status === "PENDING" && (
                        <button
                          onClick={() => openDialog(row, "PROCESSING")}
                          disabled={updatingId === row.id}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200 rounded-lg text-[11px] font-black cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          开始处理
                        </button>
                      )}
                      <button
                        onClick={() => openDialog(row, "COMPLETED")}
                        disabled={updatingId === row.id}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-black cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        标记完成
                      </button>
                      <button
                        onClick={() => openDialog(row, "REJECTED")}
                        disabled={updatingId === row.id}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-black cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        驳回
                      </button>
                    </div>
                  )}
                </div>

                {row.description && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      需求说明
                    </p>
                    <p className="text-[11px] text-slate-700 font-bold whitespace-pre-wrap leading-relaxed">
                      {row.description}
                    </p>
                  </div>
                )}

                {row.adminRemark && (
                  <div className="mt-2 p-2.5 bg-blue-50/60 rounded-lg border border-blue-100">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-0.5">
                      处理备注
                    </p>
                    <p className="text-[11px] text-blue-800 font-bold whitespace-pre-wrap leading-relaxed">
                      {row.adminRemark}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 处理弹窗 */}
      {dialogOpen && dialogTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-sm font-black text-slate-800">
                {dialogTarget.next === "PROCESSING" && "开始处理咨询"}
                {dialogTarget.next === "COMPLETED" && "标记咨询为已完成"}
                {dialogTarget.next === "REJECTED" && "驳回咨询"}
              </h3>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-black p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs font-bold text-slate-600 space-y-1">
              <p>
                企业：<span className="text-slate-800">{dialogTarget.row.companyName}</span>
              </p>
              <p>
                联系人：{dialogTarget.row.contactName} · {dialogTarget.row.contactPhone}
              </p>
            </div>

            {dialogTarget.next === "COMPLETED" && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-black text-indigo-700">签约开通企业套餐（可选）</p>
                <p className="text-[10px] text-slate-500 font-bold leading-snug">
                  选择套餐并确认后，系统将把该用户关联的个人空间升级为对应企业套餐（真实开通）。留空则仅标记完成、不开通。
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={openPlan}
                    onChange={(e) => setOpenPlan(e.target.value)}
                    className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="">不开通（仅完成）</option>
                    <option value="PRO">专业版</option>
                    <option value="ENTERPRISE">旗舰版</option>
                    <option value="CUSTOM">定制版</option>
                  </select>
                  {openPlan && (
                    <select
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value as "MONTH" | "YEAR")}
                      className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="YEAR">年付</option>
                      <option value="MONTH">月付</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-black text-slate-500 mb-1.5">
                处理备注
                {dialogTarget.next === "REJECTED" && <span className="text-rose-500"> *（驳回必填）</span>}
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={
                  dialogTarget.next === "REJECTED"
                    ? "请说明驳回原因（用户可见）"
                    : "记录本次跟进结论（可选）"
                }
                className="w-full h-20 p-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] resize-none"
              />
            </div>

            {dialogError && (
              <p className="text-[11px] font-black text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {dialogError}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitDialog}
                className={`px-5 py-2 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  dialogTarget.next === "REJECTED"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[#3182ce] hover:bg-[#2b6cb0]"
                }`}
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
