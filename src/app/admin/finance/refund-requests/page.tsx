"use client";

/**
 * 退款申请审批（管理员 / 超级管理员）
 *
 * 职责：处理用户对「已扣点但不满意」任务提交的退款申请。
 * 「同意退款」会调用账务层真实退点并写入 REFUND 流水，申请单上会留下流水号可追溯；
 * 「驳回」必须填写理由并原样展示给申请人。
 * 本页只退「算力点」，不涉及任何真实资金退款。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { formatYuanFromPoints } from "@/lib/point-rate";
import { Check, X, Search, RefreshCw, Copy, Loader2, AlertTriangle, Inbox } from "lucide-react";

interface AdminUser {
  email: string;
  name: string | null;
}

interface RefundRequestRow {
  id: string;
  taskId: string;
  userId: string;
  workspaceId: string | null;
  componentId: string | null;
  componentName?: string | null;
  points: number;
  reason: string;
  status: string;
  adminRemark: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  taskName: string | null;
  taskStatus: string | null;
  applicant: { email: string; name: string | null } | null;
  admin: AdminUser | null;
}

type StatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
type SortOrder = "oldest" | "newest";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "待审批", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  APPROVED: { text: "已退款", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  REJECTED: { text: "已驳回", cls: "text-slate-600 bg-slate-50 border-slate-200" },
};

const TASK_STATUS_LABEL: Record<string, string> = {
  SUCCESS: "成功",
  FAILED: "失败",
  RUNNING: "运行中",
  PENDING: "排队中",
  CANCELLED: "已取消",
};

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString("zh-CN") : "—");

export default function AdminRefundRequestsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortOrder>("oldest");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ type: "approve" | "reject"; row: RefundRequestRow } | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 始终取全部状态，前端做统计 / 筛选 / 搜索，保证各状态计数准确
      const res = await authFetch(`/api/admin/refund-requests?status=ALL`);
      setRows(res.data || []);
    } catch (e) {
      toast.error((e as Error)?.message || "加载退款申请失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    let pendingPoints = 0;
    let approvedPoints = 0;
    for (const r of rows) {
      if (r.status === "PENDING") {
        c.PENDING += 1;
        pendingPoints += r.points;
      } else if (r.status === "APPROVED") {
        c.APPROVED += 1;
        approvedPoints += r.points;
      } else if (r.status === "REJECTED") c.REJECTED += 1;
    }
    return { ...c, pendingPoints, approvedPoints };
  }, [rows]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = rows.filter((r) => (filter === "ALL" ? true : r.status === filter));
    if (kw) {
      list = list.filter(
        (r) =>
          (r.applicant?.email || "").toLowerCase().includes(kw) ||
          (r.applicant?.name || "").toLowerCase().includes(kw) ||
          (r.taskName || "").toLowerCase().includes(kw) ||
          (r.taskId || "").toLowerCase().includes(kw) ||
          (r.reason || "").toLowerCase().includes(kw) ||
          (r.componentName || "").toLowerCase().includes(kw),
      );
    }
    list = [...list].sort((a, b) =>
      sort === "oldest"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return list;
  }, [rows, filter, keyword, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage, PAGE_SIZE],
  );

  const resolve = async (row: RefundRequestRow, action: "APPROVE" | "REJECT", remark: string) => {
    setBusyId(row.id);
    try {
      await authFetch(`/api/admin/refund-requests/${row.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, remark: remark || undefined }),
      });
      toast.success(
        action === "APPROVE"
          ? `已同意退款，${row.points} 算力点（${formatYuanFromPoints(row.points)}）已退回用户钱包`
          : "已驳回该退款申请",
      );
      setModal(null);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "裁决失败");
    } finally {
      setBusyId(null);
    }
  };

  const copyLedger = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("流水号已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">退款申请审批</h1>
        <p className="text-sm text-slate-500 mt-1">
          处理用户提交的算力点退款申请。同意退款会真实退点并写入退款流水；驳回需填写理由。本流程只涉及「算力点」，不涉及任何真实资金。
        </p>
      </div>

      {/* 汇总统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="待审批" value={counts.PENDING} sub={`${counts.pendingPoints} 点待退`} tone="amber" />
        <StatCard label="已退款" value={counts.APPROVED} sub={`${counts.approvedPoints} 点已退`} tone="emerald" />
        <StatCard label="已驳回" value={counts.REJECTED} sub="已完成" tone="slate" />
        <StatCard label="全部申请" value={rows.length} sub="含各状态" tone="indigo" />
      </div>

      {/* 工具条：筛选 + 搜索 + 排序 + 刷新 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((f) => (
            <button
              key={f}
              className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
                filter === f
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
            >
              {f === "PENDING" ? `待审批(${counts.PENDING})` : f === "APPROVED" ? "已退款" : f === "REJECTED" ? "已驳回" : "全部"}
            </button>
          ))}
        </div>

        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="搜索申请人 / 任务 / 原因"
            className="h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 w-56"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortOrder);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 px-2 outline-none focus:border-indigo-500"
        >
          <option value="oldest">最早优先</option>
          <option value="newest">最新优先</option>
        </select>

        <button
          className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center flex flex-col items-center gap-2">
          <Inbox className="w-8 h-8 text-slate-300" />
          <div className="text-sm text-slate-400">
            {keyword
              ? "没有匹配当前筛选与搜索条件的退款申请"
              : filter === "PENDING"
                ? "当前没有待审批的退款申请"
                : "暂无退款申请记录"}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paged.map((r) => {
            const st = STATUS_LABEL[r.status] || STATUS_LABEL.PENDING;
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${st.cls}`}>{st.text}</span>
                  <span className="text-sm font-bold text-slate-800">{r.componentName || r.componentId || "组件任务"}</span>
                  <span className="text-xs text-slate-500">任务：{r.taskName || r.taskId}</span>
                  {r.taskStatus && (
                    <span className="text-[11px] text-slate-400">
                      （任务状态：{TASK_STATUS_LABEL[r.taskStatus] || r.taskStatus}）
                    </span>
                  )}
                  <span className="ml-auto text-sm font-black text-indigo-700 tabular-nums">
                    {r.points} 点
                    <span className="text-[11px] text-slate-400 font-semibold ml-1">
                      （{formatYuanFromPoints(r.points)}）
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    申请人：{r.applicant?.email || r.userId}
                    {r.applicant?.name ? `（${r.applicant.name}）` : ""}
                  </span>
                  {r.workspaceId && <span>空间：{r.workspaceId}</span>}
                  <span>提交：{fmtTime(r.createdAt)}</span>
                  {r.resolvedAt && <span>处理：{fmtTime(r.resolvedAt)}</span>}
                  {r.admin && <span>审批人：{r.admin.email}</span>}
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <div className="text-[11px] font-black text-slate-500">用户退款原因</div>
                  <div className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{r.reason}</div>
                </div>

                {r.adminRemark && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                    <div className="text-[11px] font-black text-amber-700">
                      管理员处理意见（{r.status === "REJECTED" ? "驳回理由" : "备注"}）
                    </div>
                    <div className="text-xs text-amber-900 mt-1 whitespace-pre-wrap">{r.adminRemark}</div>
                  </div>
                )}

                {r.refundLedgerId && (
                  <button
                    type="button"
                    onClick={() => void copyLedger(r.refundLedgerId!)}
                    className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                    title="点击复制流水号"
                  >
                    已生成退款流水：{r.refundLedgerId}
                    <Copy className="w-3 h-3" />
                  </button>
                )}

                {r.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      disabled={busyId === r.id}
                      onClick={() => setModal({ type: "approve", row: r })}
                    >
                      {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      同意退款
                    </button>
                    <button
                      className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-black hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                      disabled={busyId === r.id}
                      onClick={() => setModal({ type: "reject", row: r })}
                    >
                      <X className="w-3.5 h-3.5" />
                      驳回
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-400">
            共 {filtered.length} 条 · 第 {currentPage}/{totalPages} 页
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center gap-1.5">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-slate-300 text-xs">…</span>}
                  <button
                    className={`w-8 h-8 rounded-lg text-xs font-black border ${
                      p === currentPage
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {modal && <ResolveModal row={modal.row} type={modal.type} busy={busyId === modal.row.id} onClose={() => setModal(null)} onConfirm={resolve} />}
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "amber" | "emerald" | "slate" | "indigo" }) {
  const toneCls: Record<string, string> = {
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    slate: "text-slate-600",
    indigo: "text-indigo-700",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-[11px] font-bold text-slate-400">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${toneCls[tone]}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function ResolveModal({
  row,
  type,
  busy,
  onClose,
  onConfirm,
}: {
  row: RefundRequestRow;
  type: "approve" | "reject";
  busy: boolean;
  onClose: () => void;
  onConfirm: (row: RefundRequestRow, action: "APPROVE" | "REJECT", remark: string) => void;
}) {
  const [remark, setRemark] = useState("");
  const isApprove = type === "approve";
  const rejectInvalid = !isApprove && remark.trim().length < 5;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {isApprove ? (
            <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-600" />
            </span>
          ) : (
            <span className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </span>
          )}
          <h2 className="text-base font-black text-slate-800">{isApprove ? "确认同意退款" : "驳回退款申请"}</h2>
        </div>

        <div className="text-xs text-slate-500 space-y-1 rounded-lg bg-slate-50 border border-slate-100 p-3">
          <div>组件：{row.componentName || row.componentId || "组件任务"}</div>
          <div>任务：{row.taskName || row.taskId}</div>
          <div>申请人：{row.applicant?.email || row.userId}</div>
          <div className="font-bold text-slate-700">
            退款金额：<span className="text-indigo-700">{row.points} 算力点</span>（{formatYuanFromPoints(row.points)}）
          </div>
        </div>

        {isApprove ? (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            确认后平台将真实退点并写入一条 REFUND 流水，流水号会回写至此申请单，可在算力总账按该流水号追溯。该操作不可撤销。
          </p>
        ) : (
          <div>
            <label className="text-[11px] font-black text-slate-500">
              驳回理由（必填，至少 5 个字，将原样展示给申请人）
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              autoFocus
              placeholder="请说明驳回原因，例如：经核实该任务已正常输出结果，不符合退款条件。"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white text-xs text-slate-800 p-2 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 resize-none"
            />
            <div className="text-right text-[10px] text-slate-400 mt-0.5">{remark.trim().length} / 5</div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-1.5 rounded-lg text-xs font-black border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className={`px-4 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-50 flex items-center gap-1 ${
              isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
            disabled={busy || rejectInvalid}
            onClick={() => onConfirm(row, isApprove ? "APPROVE" : "REJECT", remark)}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isApprove ? "确认退款" : "确认驳回"}
          </button>
        </div>
      </div>
    </div>
  );
}
