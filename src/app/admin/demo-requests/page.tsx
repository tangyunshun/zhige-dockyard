"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Inbox } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

type DemoRequest = {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string | null;
  requirements: string | null;
  status: string;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: "待处理", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  contacted: { label: "已联系", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  closed: { label: "已关闭", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "contacted", label: "已联系" },
  { value: "closed", label: "已关闭" },
];

export default function AdminDemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        status,
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/demo-requests?${params.toString()}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRequests(data.requests || []);
        setPagination(
          data.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 }
        );
      } else {
        setError(data.error || "加载失败");
      }
    } catch (e: any) {
      setError(e?.message || "网络异常");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, status, search]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/demo-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("admin-pending-tasks-changed"));
        }
      } else {
        setError(data.error || "更新失败");
      }
    } catch (e: any) {
      setError(e?.message || "网络异常");
    } finally {
      setUpdatingId(null);
    }
  };

  const changeStatus = (value: string) => {
    setStatus(value);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">演示申请</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            查看并跟进用户在前台提交的演示申请线索，处理后请及时更新状态。
          </p>
        </div>
      </div>

      {/* 筛选与搜索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => changeStatus(f.value)}
              className={`px-3 h-8 rounded-lg text-xs font-bold transition-all ${
                status === f.value
                  ? "bg-white text-[#3182ce] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="搜索姓名 / 邮箱 / 公司 / 电话 / 需求"
          className="w-72 px-3.5 h-9 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all"
        />
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-bold px-4 py-3">提交时间</th>
              <th className="text-left font-bold px-4 py-3">姓名</th>
              <th className="text-left font-bold px-4 py-3">邮箱</th>
              <th className="text-left font-bold px-4 py-3">公司</th>
              <th className="text-left font-bold px-4 py-3">电话</th>
              <th className="text-left font-bold px-4 py-3">需求</th>
              <th className="text-left font-bold px-4 py-3">状态</th>
              <th className="text-left font-bold px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                    <Inbox className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-medium">暂无演示申请记录</p>
                    <p className="text-[11px] text-slate-300">用户在前台提交演示申请后会出现在这里</p>
                  </div>
                </td>
              </tr>
            )}
            {requests.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.pending;
              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {r.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.email}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.company}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <span className="line-clamp-2">{r.requirements || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {r.status !== "contacted" && (
                        <button
                          disabled={updatingId === r.id}
                          onClick={() => updateStatus(r.id, "contacted")}
                          className="px-2.5 h-7 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 disabled:opacity-50"
                        >
                          标记已联系
                        </button>
                      )}
                      {r.status !== "closed" && (
                        <button
                          disabled={updatingId === r.id}
                          onClick={() => updateStatus(r.id, "closed")}
                          className="px-2.5 h-7 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50"
                        >
                          关闭
                        </button>
                      )}
                      {r.status !== "pending" && (
                        <button
                          disabled={updatingId === r.id}
                          onClick={() => updateStatus(r.id, "pending")}
                          className="px-2.5 h-7 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50"
                        >
                          重置
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {loading && (
        <div className="text-center text-xs text-slate-400 py-2">加载中…</div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            disabled={pagination.page <= 1 || loading}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="px-3 h-8 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            上一页
          </button>
          <span className="text-slate-500">
            {pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）
          </span>
          <button
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="px-3 h-8 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
