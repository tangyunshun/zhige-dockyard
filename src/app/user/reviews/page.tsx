"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareQuote,
  Send,
  Star,
  User,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";

interface MyTestimonial {
  id: string;
  category: string;
  name: string;
  role: string | null;
  org: string | null;
  rating: number;
  content: string;
  status: string;
  reviewNote: string | null;
  submittedAt: string | null;
}

const STATUS_META: Record<string, { label: string; style: string; icon: typeof Clock }> = {
  pending: { label: "待审核", style: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  active: { label: "已展示", style: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: CheckCircle2 },
  hidden: { label: "已下架", style: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
  rejected: { label: "未通过", style: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
};

const CATEGORY_LABEL: Record<string, string> = {
  personal: "个人用户",
  enterprise: "企业客户",
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function UserReviewsPage() {
  const toast = useToast();
  const { userState } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<MyTestimonial[]>([]);

  const [form, setForm] = useState({
    category: "personal" as "personal" | "enterprise",
    name: "",
    role: "",
    org: "",
    rating: 5,
    content: "",
  });

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/testimonials/mine", {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setRows(data.testimonials ?? []);
      }
    } catch (error) {
      console.error("Load my testimonials error:", error);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadMine();
    // 登录用户默认带入姓名，减少填写成本
    if (userState.userInfo?.name) {
      setForm((prev) => ({ ...prev, name: prev.name || userState.userInfo?.name || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userState.userInfo?.name]);

  const hasPending = rows.some((r) => r.status === "pending");

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("请填写您的姓名或称呼");
      return;
    }
    if (form.content.trim().length < 10) {
      toast.error("评价内容至少需要 10 个字符");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/testimonials/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          category: form.category,
          name: form.name.trim(),
          role: form.role.trim(),
          org: form.org.trim(),
          rating: form.rating,
          content: form.content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "提交失败，请稍后重试");
        return;
      }
      toast.success(data.message || "评价已提交，感谢您的反馈！");
      setForm((prev) => ({ ...prev, role: "", org: "", rating: 5, content: "" }));
      await loadMine();
    } catch (error) {
      console.error("Submit testimonial error:", error);
      toast.error("网络异常，提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div>
        <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <MessageSquareQuote className="w-5 h-5 text-[#3182ce]" />
          我的评价
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          欢迎在使用过后，分享您的真实体验。评价经平台审核通过后，会展示在首页「用户评价」区域。
        </p>
      </div>

      {/* 提交通道（已有待审核评价时暂不开放） */}
      {hasPending ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-amber-700 leading-relaxed">
            您有一条评价正在等待审核，审核完成后再提交新的评价吧。
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800">写下您的使用评价</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">提交后将进入平台审核，通过后展示在首页</p>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* 身份 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black text-slate-500">我的身份：</span>
              {(["personal", "enterprise"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, category: key }))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                    form.category === key
                      ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 hover:text-[#2b6cb0]"
                  }`}
                >
                  {key === "personal" ? <User className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                  {CATEGORY_LABEL[key]}
                </button>
              ))}
            </div>

            {/* 评分 */}
            <div>
              <span className="text-[11px] font-black text-slate-500">满意度评分</span>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-label={`${r} 星`}
                    onClick={() => setForm((p) => ({ ...p, rating: r }))}
                    className="cursor-pointer"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        r <= form.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-1 text-xs font-black text-amber-500">{form.rating}.0</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] font-black text-slate-500">姓名 / 称呼 *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="如：张三"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-black text-slate-500">身份 / 岗位</span>
                <input
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  placeholder="如：技术总监"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-black text-slate-500">单位（企业填）</span>
                <input
                  value={form.org}
                  onChange={(e) => setForm((p) => ({ ...p, org: e.target.value }))}
                  placeholder="如：某某科技"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] font-black text-slate-500">评价内容 *</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                rows={4}
                maxLength={1000}
                placeholder="说说您用知阁·舟坊做项目时的真实体验与收获……"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 resize-none"
              />
              <span className="text-[10px] text-slate-400">{form.content.trim().length} / 1000 字</span>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-black shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {submitting ? "提交中..." : "提交评价"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 我的评价记录 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">我的评价记录</h2>
          <span className="text-[11px] font-bold text-slate-400">共 {rows.length} 条</span>
        </div>

        {loading ? (
          <div className="py-14 text-center text-xs font-bold text-slate-400">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-xs font-bold text-slate-400">还没有提交过评价</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const meta = STATUS_META[row.status] ?? STATUS_META.pending;
              const StatusIcon = meta.icon;
              return (
                <div key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-800">{row.name}</span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {row.org ? `${row.org} · ${row.role}` : row.role}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        row.category === "enterprise"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-blue-50 text-[#2b6cb0]"
                      }`}
                    >
                      {CATEGORY_LABEL[row.category] || row.category}
                    </span>
                    <span className="text-[10px] font-black text-amber-500">★ {row.rating}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black ${meta.style}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1.5">{row.content}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    提交时间：{formatTime(row.submittedAt)}
                    {row.status === "rejected" && row.reviewNote ? `｜审核备注：${row.reviewNote}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
