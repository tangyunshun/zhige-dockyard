"use client";

/**
 * 退款申请审批（管理员 / 超级管理员）
 *
 * 职责：处理用户对「已扣点但不满意」任务提交的退款申请。
 * 「同意退款」会调用账务层真实退点并写入 REFUND 流水，申请单上会留下流水号可追溯；
 * 「驳回」必须填写理由并原样展示给申请人。
 * 本页只退「算力点」，不涉及任何真实资金退款。
 */
import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface RefundRequestRow {
  id: string;
  taskId: string;
  userId: string;
  points: number;
  componentId: string | null;
  componentName?: string | null;
  reason: string;
  status: string;
  adminRemark: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  taskName: string | null;
  taskStatus: string | null;
  applicant: { email: string; name: string | null } | null;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "待审批", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  APPROVED: { text: "已退款", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  REJECTED: { text: "已驳回", cls: "text-slate-600 bg-slate-50 border-slate-200" },
};

export default function AdminRefundRequestsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");

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
      const res = await authFetch(`/api/admin/refund-requests?status=${filter}`);
      setRows(res.data || []);
    } catch (e) {
      toast.error((e as Error)?.message || "加载退款申请失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, filter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (row: RefundRequestRow, action: "APPROVE" | "REJECT") => {
    let remark = "";
    if (action === "APPROVE") {
      if (!window.confirm(`确认同意退款？\n将向该用户钱包退回 ${row.points} 算力点，并生成一条退款流水。`)) return;
    } else {
      const input = window.prompt(`请输入驳回理由（将展示给申请人，至少 5 个字）：`);
      if (input === null) return;
      remark = input.trim();
      if (remark.length < 5) {
        toast.error("驳回理由需至少 5 个字");
        return;
      }
    }

    setBusyId(row.id);
    try {
      await authFetch(`/api/admin/refund-requests/${row.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, remark: remark || undefined }),
      });
      toast.success(action === "APPROVE" ? `已同意退款，${row.points} 算力点已退回用户钱包` : "已驳回该退款申请");
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || "裁决失败");
    } finally {
      setBusyId(null);
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

      <div className="flex gap-2">
        {(["PENDING", "ALL"] as const).map((f) => (
          <button
            key={f}
            className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
              filter === f
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "PENDING" ? "待审批" : "全部"}
          </button>
        ))}
        <button
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 bg-white hover:bg-slate-50"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
          {filter === "PENDING" ? "当前没有待审批的退款申请" : "暂无退款申请记录"}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = STATUS_LABEL[r.status] || STATUS_LABEL.PENDING;
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${st.cls}`}>{st.text}</span>
                  <span className="text-sm font-bold text-slate-800">
                    {r.componentName || r.componentId || "组件任务"}
                  </span>
                  <span className="text-xs text-slate-500">任务：{r.taskName || r.taskId}</span>
                  <span className="text-xs text-slate-400">（任务状态：{r.taskStatus || "未知"}）</span>
                  <span className="ml-auto text-sm font-black text-indigo-700">{r.points} 点</span>
                </div>

                <div className="text-xs text-slate-500">
                  申请人：{r.applicant?.email || r.userId}
                  {r.applicant?.name ? `（${r.applicant.name}）` : ""} · 提交时间：
                  {new Date(r.createdAt).toLocaleString("zh-CN")}
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <div className="text-[11px] font-black text-slate-500">用户退款原因</div>
                  <div className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{r.reason}</div>
                </div>

                {r.adminRemark && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                    <div className="text-[11px] font-black text-amber-700">管理员处理意见</div>
                    <div className="text-xs text-amber-900 mt-1 whitespace-pre-wrap">{r.adminRemark}</div>
                  </div>
                )}

                {r.refundLedgerId && (
                  <div className="text-[11px] text-emerald-700 font-bold">
                    已生成退款流水：{r.refundLedgerId}（可在算力总账按该流水号追溯）
                  </div>
                )}

                {r.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 disabled:opacity-50"
                      disabled={busyId === r.id}
                      onClick={() => void resolve(r, "APPROVE")}
                    >
                      同意退款（退 {r.points} 点）
                    </button>
                    <button
                      className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-black hover:bg-slate-50 disabled:opacity-50"
                      disabled={busyId === r.id}
                      onClick={() => void resolve(r, "REJECT")}
                    >
                      驳回
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
