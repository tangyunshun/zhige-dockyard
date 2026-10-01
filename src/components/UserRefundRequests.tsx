"use client";

/**
 * 「我的退款申请」（用户自助）
 *
 * 用途：当任务扣了算力点、但结果不可用（解析错误 / 输出不符合预期）时，给用户一个正规申诉入口。
 * 说明：这里退的是「算力点」，不是真钱；提交后需管理员审批，同意才会真正退回并生成退款流水。
 */
import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { RotateCcw, Inbox } from "lucide-react";

interface Candidate {
  taskId: string;
  points: number;
  componentId: string | null;
  componentName: string | null;
  workspaceId: string | null;
  chargedAt: string;
}

interface RefundRequest {
  id: string;
  taskId: string;
  points: number;
  componentId: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminRemark: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const STATUS_META: Record<string, { text: string; cls: string; hint: string }> = {
  PENDING: { text: "待管理员审批", cls: "text-amber-700 bg-amber-50 border-amber-200", hint: "已提交，等待管理员处理" },
  APPROVED: { text: "已退款", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", hint: "点数已退回你的钱包，可在上方流水查看「退回」记录" },
  REJECTED: { text: "已驳回", cls: "text-slate-600 bg-slate-50 border-slate-200", hint: "管理员未通过该申请，请看下方处理意见" },
};

export default function UserRefundRequests() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await authFetch("/api/user/refund-requests");
      setRequests(res?.data?.requests || []);
      setCandidates(res?.data?.candidates || []);
    } catch (e) {
      setError((e as Error)?.message || "加载退款信息失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyRefund = async (c: Candidate) => {
    const reason = window.prompt(
      `为「${c.componentName || c.componentId || "该任务"}」申请退还 ${c.points} 算力点。\n请说明原因（至少 5 个字，例如：解析出的需求内容与原文档不符）：`,
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("退款原因需至少 5 个字");
      return;
    }
    setBusy(true);
    try {
      await authFetch("/api/user/refund-requests", {
        method: "POST",
        body: JSON.stringify({ taskId: c.taskId, reason: trimmed }),
      });
      await load();
    } catch (e) {
      setError((e as Error)?.message || "提交退款申请失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200/70 space-y-4">
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-slate-500" />
        <h3 className="text-base font-black text-slate-800">退款申请</h3>
        <span className="text-[11px] text-slate-400">
          任务扣了算力点但结果不可用时可申请退回；仅退还算力点，需管理员审批
        </span>
        <button
          className="ml-auto px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>

      {error && <div className="text-xs text-red-600 font-bold">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">加载中…</div>
      ) : (
        <>
          {/* 可申请退款的任务 */}
          <div className="space-y-2">
            <div className="text-xs font-black text-slate-500">可申请退款的任务（已扣费且尚未申请）</div>
            {candidates.length === 0 ? (
              <div className="text-xs text-slate-400 py-2">暂无可申请的任务</div>
            ) : (
              candidates.slice(0, 8).map((c) => (
                <div
                  key={c.taskId}
                  className="flex items-center gap-2 border border-slate-100 rounded-lg p-2.5 bg-slate-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {c.componentName || c.componentId || "组件任务"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      扣点 {c.points} 点 · {new Date(c.chargedAt).toLocaleDateString("zh-CN")} · 任务编号 {c.taskId.slice(0, 8)}
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black hover:bg-indigo-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void applyRefund(c)}
                  >
                    申请退款
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 我的申请记录 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-black text-slate-500">我的申请记录</div>
            {requests.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Inbox className="w-3.5 h-3.5" />
                你还没有提交过退款申请
              </div>
            ) : (
              requests.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.PENDING;
                return (
                  <div key={r.id} className="border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${meta.cls}`}>{meta.text}</span>
                      <span className="text-xs font-bold text-slate-800">{r.componentId || "组件任务"}</span>
                      <span className="ml-auto text-xs font-black text-slate-700">{r.points} 点</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      提交于 {new Date(r.createdAt).toLocaleString("zh-CN")} · {meta.hint}
                    </div>
                    <div className="text-[11px] text-slate-500">我的原因：{r.reason}</div>
                    {r.adminRemark && (
                      <div className="text-[11px] text-amber-700">管理员意见：{r.adminRemark}</div>
                    )}
                    {r.refundLedgerId && (
                      <div className="text-[11px] text-emerald-700">退款流水号：{r.refundLedgerId}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
