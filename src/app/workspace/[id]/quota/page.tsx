"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import {
  Coins,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

/**
 * 空间算力点页（用户端）：
 *  - 展示当前空间算力点余额与充值入口；
 *  - 提交「额度提升申请」（期望额度 + 理由）；
 *  - 展示本空间的历史申请与审批状态。
 */

interface ApplyRow {
  id: string;
  workspaceId: string;
  applyPoints: number;
  approvedPoints: number | null;
  reason: string | null;
  status: string;
  adminRemark: string | null;
  createdAt: string;
}

interface QuotaInfo {
  tokenBalance?: number | string;
  balance?: number | string;
  poolLowThreshold?: number | string;
  lowBalance?: boolean;
  data?: {
    tokenBalance?: number | string;
    poolLowThreshold?: number | string;
    lowBalance?: boolean;
  };
}

const authFetch = async (url: string, init?: RequestInit) => {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.json().catch(() => ({}));
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  PENDING: { label: "待审批", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  APPROVED: { label: "已通过", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  REJECTED: { label: "已拒绝", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
};

export default function WorkspaceQuotaPage() {
  const params = useParams();
  const workspaceId = String(params?.id || "");
  const toast = useToast();

  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [applies, setApplies] = useState<ApplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [applyPoints, setApplyPoints] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [quotaRes, applyRes] = await Promise.all([
        authFetch(`/api/workspace/quota?workspaceId=${encodeURIComponent(workspaceId)}`),
        authFetch("/api/quota-apply"),
      ]);
      setQuota(quotaRes?.data ?? quotaRes ?? null);
      setApplies(Array.isArray(applyRes?.data) ? applyRes.data : []);
    } catch (e) {
      toast.error((e as Error)?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [toast, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const points = Number(applyPoints);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("请填写有效的申请额度");
      return;
    }
    if (points > 1_000_000) {
      toast.error("单次申请额度不能超过 1,000,000 算力点");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/quota-apply", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          applyPoints: points,
          reason: reason.trim(),
        }),
      });
      if (!res?.success) {
        toast.error(res?.error || "提交失败");
        return;
      }
      toast.success(res.message || "申请已提交");
      setApplyPoints("");
      setReason("");
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 接口把余额同时放在顶层与 data 下，阈值仅在有 workspaceId 查询时返回；两者都兼容读取
  const balance = Number(
    quota?.data?.tokenBalance ?? quota?.tokenBalance ?? quota?.balance ?? 0,
  );
  const threshold = Number(quota?.data?.poolLowThreshold ?? quota?.poolLowThreshold ?? 0);
  const lowBalance = threshold > 0 && balance < threshold;
  const hasPending = applies.some((a) => a.status === "PENDING");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin mx-auto mb-3" />
          <p className="text-slate-600 font-medium text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 max-w-3xl">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
          <span className="w-8.5 h-8.5 rounded-xl bg-amber-50 border border-amber-100/80 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
            <Coins className="w-4.5 h-4.5" />
          </span>
          <span>空间算力点</span>
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">查看余额、消耗情况，额度不足时可申请提升</p>
      </div>

      {/* 余额卡片 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-slate-400">当前可用算力点</div>
          <div
            className={`text-3xl font-black font-mono mt-1 tracking-tight ${
              lowBalance ? "text-amber-600" : "text-slate-800"
            }`}
          >
            {Number.isFinite(balance) ? balance.toLocaleString() : "--"}
          </div>
          {lowBalance && (
            <div className="text-[11px] text-amber-600 font-bold mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              余额低于预警阈值（{threshold.toLocaleString()}），建议尽快补充
            </div>
          )}
        </div>
        <Link
          href={`/user/pay?workspaceId=${encodeURIComponent(workspaceId)}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
        >
          <span>充值算力点</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 申请表单 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-sm font-black text-slate-800">申请提升额度</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            提交后由平台管理员审批，通过后额度自动入账到本空间
          </p>
        </div>

        {hasPending && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 font-bold">
            本空间已有待审批的申请，请等待处理后再提交新的申请。
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700">期望额度（算力点）</label>
            <input
              type="number"
              min={1}
              max={1000000}
              value={applyPoints}
              onChange={(e) => setApplyPoints(e.target.value)}
              placeholder="例如 5000"
              disabled={hasPending}
              className="mt-1.5 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700">申请理由（选填）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="简要说明用途"
              disabled={hasPending}
              className="mt-1.5 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 disabled:opacity-50"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || hasPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>{submitting ? "提交中..." : "提交申请"}</span>
        </button>
      </div>

      {/* 申请记录 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-800">我的申请记录</h2>
        </div>
        {applies.length === 0 ? (
          <div className="py-12 text-center">
            <Coins className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">暂无申请记录</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {applies.map((a) => {
              const meta = STATUS_META[a.status] || STATUS_META.PENDING;
              const StatusIcon = meta.icon;
              return (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800">
                      申请 {a.applyPoints.toLocaleString()} 算力点
                      {a.approvedPoints != null && (
                        <span className="text-emerald-600 ml-2">批准 {a.approvedPoints.toLocaleString()}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(a.createdAt).toLocaleString("zh-CN")}
                      {a.adminRemark ? ` · ${a.adminRemark}` : ""}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 shrink-0 ${meta.cls}`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
