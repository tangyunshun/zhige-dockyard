"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import {
  Coins,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

/**
 * 算力点提升申请审批页：
 *  - 列表展示申请（空间、申请人、申请额度、理由、状态）
 *  - 通过：可修改批准额度，审批后自动入账空间共享池
 *  - 拒绝：必须填写理由
 */

interface ApplyRow {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  applyPoints: number;
  approvedPoints: number | null;
  reason: string | null;
  status: string;
  adminRemark: string | null;
  ledgerId: string | null;
  createdAt: string;
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

export default function QuotaApplyPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ApplyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 审批弹窗状态
  const [dialog, setDialog] = useState<{ open: boolean; row: ApplyRow | null; action: "APPROVE" | "REJECT" }>({
    open: false,
    row: null,
    action: "APPROVE",
  });
  const [approvePoints, setApprovePoints] = useState("");
  const [remark, setRemark] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/quota-apply?status=${encodeURIComponent(status)}&page=${page}&limit=20`);
      if (!res?.success) {
        toast.error(res?.error || "加载申请列表失败");
        return;
      }
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) {
      toast.error((e as Error)?.message || "加载申请列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = (row: ApplyRow, action: "APPROVE" | "REJECT") => {
    setDialog({ open: true, row, action });
    setApprovePoints(String(row.applyPoints));
    setRemark("");
  };

  const submit = async () => {
    const row = dialog.row;
    if (!row) return;
    if (dialog.action === "REJECT" && !remark.trim()) {
      toast.error("拒绝时必须填写理由");
      return;
    }
    if (dialog.action === "APPROVE") {
      const n = Number(approvePoints);
      if (!Number.isInteger(n) || n < 1) {
        toast.error("请输入有效的批准额度（不小于 1 的整数）");
        return;
      }
    }
    setBusyId(row.id);
    try {
      const res = await authFetch("/api/admin/quota-apply", {
        method: "POST",
        body: JSON.stringify({
          applyId: row.id,
          action: dialog.action,
          approvedPoints: dialog.action === "APPROVE" ? Number(approvePoints) : undefined,
          adminRemark: remark.trim(),
        }),
      });
      if (!res?.success) {
        toast.error(res?.error || "审批失败");
        return;
      }
      toast.success(res.message || "已处理");
      setDialog({ open: false, row: null, action: "APPROVE" });
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "审批失败");
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-5 pb-8">
      {/* 顶部标题栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-8.5 h-8.5 rounded-xl bg-amber-50 border border-amber-100/80 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <Coins className="w-4.5 h-4.5" />
            </span>
            <span>额度提升审批</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            审批用户提交的算力点提升申请，通过后自动入账到对应空间
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "PENDING", label: "待审批" },
          { key: "APPROVED", label: "已通过" },
          { key: "REJECTED", label: "已拒绝" },
          { key: "ALL", label: "全部" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setStatus(t.key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
              status === t.key
                ? "bg-[#3182ce] text-white border-[#3182ce]"
                : "bg-white text-slate-600 border-slate-200 hover:border-[#3182ce]/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Coins className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">暂无申请记录</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.PENDING;
              const StatusIcon = meta.icon;
              return (
                <div key={r.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800 truncate">{r.workspaceName}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border flex items-center gap-1 ${meta.cls}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                        {r.workspaceType === "ENTERPRISE" && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">
                            企业
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        申请人：{r.userName || r.userEmail || r.userId}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 font-bold">
                        申请额度：{r.applyPoints.toLocaleString()} 算力点
                        {r.approvedPoints != null && (
                          <span className="text-emerald-600 ml-2">实际批准：{r.approvedPoints.toLocaleString()}</span>
                        )}
                      </div>
                      {r.reason && (
                        <div className="text-[11px] text-slate-500 mt-1 leading-snug bg-slate-50 p-2 rounded-lg border border-slate-100">
                          理由：{r.reason}
                        </div>
                      )}
                      {r.adminRemark && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          审批意见：{r.adminRemark}
                        </div>
                      )}
                    </div>

                    {r.status === "PENDING" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDialog(r, "APPROVE")}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>通过</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDialog(r, "REJECT")}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>拒绝</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/60">
            <span className="text-xs text-slate-400">共 {total} 条</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 cursor-pointer"
              >
                上一页
              </button>
              <span className="text-xs font-bold text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 cursor-pointer"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 审批弹窗 */}
      {dialog.open && dialog.row && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div
              className={`p-4 text-white flex items-center justify-between ${
                dialog.action === "APPROVE" ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              <h3 className="text-sm font-black">
                {dialog.action === "APPROVE" ? "通过额度提升申请" : "拒绝额度提升申请"}
              </h3>
              <button
                type="button"
                onClick={() => setDialog({ open: false, row: null, action: "APPROVE" })}
                className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-500">
                空间：<span className="font-bold text-slate-700">{dialog.row.workspaceName}</span>
                <br />
                申请额度：<span className="font-bold text-slate-700">{dialog.row.applyPoints.toLocaleString()} 算力点</span>
              </div>

              {dialog.action === "APPROVE" && (
                <div>
                  <label className="text-xs font-bold text-slate-700">批准额度（算力点，可修改）</label>
                  <input
                    type="number"
                    min={1}
                    value={approvePoints}
                    onChange={(e) => setApprovePoints(e.target.value)}
                    className="mt-1.5 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700">
                  {dialog.action === "APPROVE" ? "审批意见（选填）" : "拒绝理由（必填）"}
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={3}
                  placeholder={dialog.action === "APPROVE" ? "可填写审批说明" : "请说明拒绝原因，将反馈给申请人"}
                  className="mt-1.5 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 resize-none"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog({ open: false, row: null, action: "APPROVE" })}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busyId === dialog.row.id}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                  dialog.action === "APPROVE" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{busyId === dialog.row.id ? "处理中..." : "确认"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
