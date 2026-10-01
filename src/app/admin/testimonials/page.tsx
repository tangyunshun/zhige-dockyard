"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  ImagePlus,
  Inbox,
  Pencil,
  Quote,
  RefreshCw,
  ShieldAlert,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

interface RotationState {
  mode: "auto" | "manual";
  activeGroup: number;
  lastRotatedAt: string | null;
  nextRotateAt: string | null;
}

interface GroupSummary {
  groupNo: number;
  total: number;
  active: number;
}

interface Row {
  id: string;
  groupNo: number;
  category: string;
  name: string;
  role: string | null;
  org: string | null;
  avatar: string | null;
  rating: number;
  content: string;
  tags: string[] | null;
  highlightLabel: string | null;
  highlightValue: string | null;
  sortOrder: number;
  status: string;
  /** 提交人 userId：非空 = 真实用户提交（正文受保护，后台不可改写） */
  submitterId: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
}

interface SubmitterInfo {
  name: string | null;
  email: string;
}

interface FormState {
  id?: string;
  groupNo: number;
  category: "personal" | "enterprise";
  name: string;
  role: string;
  org: string;
  avatar: string;
  rating: number;
  content: string;
  tagsText: string;
  highlightLabel: string;
  highlightValue: string;
  sortOrder: number;
  status: "active" | "hidden";
}

const emptyForm = (groupNo: number): FormState => ({
  groupNo,
  category: "personal",
  name: "",
  role: "",
  org: "",
  avatar: "",
  rating: 5,
  content: "",
  tagsText: "",
  highlightLabel: "",
  highlightValue: "",
  sortOrder: 0,
  status: "active",
});

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

export default function AdminTestimonialsPage() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupCount, setGroupCount] = useState(5);
  const [state, setState] = useState<RotationState | null>(null);
  const [summaries, setSummaries] = useState<GroupSummary[]>([]);
  const [groupNo, setGroupNo] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(1));
  /** 用户真实提交的评价：正文/评分/身份等字段在编辑时锁定（仅可维护头像/分组/排序/状态） */
  const [formLocked, setFormLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  // 待审核（用户自助提交）
  const [pendingRows, setPendingRows] = useState<Row[]>([]);
  const [rejectedRows, setRejectedRows] = useState<Row[]>([]);
  const [submitterMap, setSubmitterMap] = useState<Record<string, SubmitterInfo>>({});
  const [reviewGroup, setReviewGroup] = useState<Record<string, number>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(
    async (targetGroup?: number, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const g = targetGroup ?? groupNo;
        const res = await fetch(`/api/admin/testimonials?groupNo=${g}`, {
          headers: authHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          toast.error(data?.error || "加载用户评价失败");
          return;
        }
        setGroupCount(data.groupCount ?? 5);
        setState(data.state ?? null);
        setSummaries(data.summaries ?? []);
        setGroupNo(data.groupNo ?? g);
        setRows(data.testimonials ?? []);
      } catch (error) {
        console.error("Load testimonials error:", error);
        toast.error("网络异常，加载用户评价失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupNo, authHeaders, toast]
  );

  /** 待审核 / 已驳回列表 */
  const loadReview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/testimonials/review", {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.success) return;
      setPendingRows(data.pending ?? []);
      setRejectedRows(data.rejected ?? []);
      setSubmitterMap(data.submitterMap ?? {});
    } catch (error) {
      console.error("Load submissions error:", error);
    }
  }, [authHeaders]);

  useEffect(() => {
    load(1, true);
    loadReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 更新轮换设置（模式 / 当前展示组） */
  const saveConfig = async (payload: { mode?: "auto" | "manual"; activeGroup?: number }) => {
    setConfigSaving(true);
    try {
      const res = await fetch("/api/admin/testimonials/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "更新轮换设置失败");
        return;
      }
      setState(data.state ?? null);
      toast.success(data.message || "轮换设置已更新");
      // 若切换了展示组，重新加载当前组数据（同时刷新各组统计）
      const nextGroup = data.state?.activeGroup ?? groupNo;
      if (payload.activeGroup !== undefined && nextGroup !== groupNo) {
        await load(nextGroup, true);
      } else {
        await load(groupNo, true);
      }
    } catch (error) {
      console.error("Save config error:", error);
      toast.error("网络异常，保存失败");
    } finally {
      setConfigSaving(false);
    }
  };

  /** 审核动作：通过（并指定展示分组）/ 驳回 */
  const reviewAction = async (id: string, action: "approve" | "reject", note?: string) => {
    setReviewBusy(true);
    try {
      const res = await fetch("/api/admin/testimonials/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          id,
          action,
          groupNo: reviewGroup[id] ?? 1,
          reviewNote: note ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "操作失败");
        return;
      }
      toast.success(data.message || "操作成功");
      setRejectingId(null);
      setRejectNote("");
      await Promise.all([loadReview(), load(groupNo, true)]);
    } catch (error) {
      console.error("Review action error:", error);
      toast.error("网络异常，操作失败");
    } finally {
      setReviewBusy(false);
    }
  };

  const openEdit = (row: Row) => {
    // 用户提交的评价锁定正文；内置示例数据可全字段维护
    setFormLocked(Boolean(row.submitterId));
    setForm({
      id: row.id,
      groupNo: row.groupNo,
      category: row.category === "enterprise" ? "enterprise" : "personal",
      name: row.name,
      role: row.role || "",
      org: row.org || "",
      avatar: row.avatar || "",
      rating: row.rating,
      content: row.content,
      tagsText: (row.tags || []).join(", "),
      highlightLabel: row.highlightLabel || "",
      highlightValue: row.highlightValue || "",
      sortOrder: row.sortOrder,
      status: row.status === "hidden" ? "hidden" : "active",
    });
    setShowForm(true);
  };

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/testimonials/upload-avatar", {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "头像上传失败");
        return;
      }
      setForm((prev) => ({ ...prev, avatar: data.url }));
      toast.success("头像上传成功");
    } catch (error) {
      console.error("Upload avatar error:", error);
      toast.error("网络异常，头像上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 表单校验错误：内联展示在对应输入框下方（不使用 toast 打断填写）
  const [formErrors, setFormErrors] = useState<{ name?: string; content?: string }>({});

  const submitForm = async () => {
    const errors: { name?: string; content?: string } = {};
    if (!form.name.trim()) errors.name = "请填写评价者姓名";
    if (!form.content.trim()) errors.content = "请填写评价内容";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        id: form.id,
        groupNo: form.groupNo,
        category: form.category,
        name: form.name.trim(),
        role: form.role.trim(),
        org: form.org.trim(),
        avatar: form.avatar.trim(),
        rating: form.rating,
        content: form.content.trim(),
        tags: form.tagsText
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        highlightLabel: form.highlightLabel.trim(),
        highlightValue: form.highlightValue.trim(),
        sortOrder: form.sortOrder,
        status: form.status,
      };

      const res = await fetch("/api/admin/testimonials", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "保存失败");
        return;
      }
      toast.success(data.message || "保存成功");
      setShowForm(false);
      await load(form.groupNo, true);
    } catch (error) {
      console.error("Submit testimonial error:", error);
      toast.error("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/testimonials?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "删除失败");
        return;
      }
      toast.success("评价已删除");
      setDeleteTarget(null);
      await load(groupNo, true);
    } catch (error) {
      console.error("Delete testimonial error:", error);
      toast.error("网络异常，删除失败");
    }
  };

  const toggleStatus = async (row: Row) => {
    try {
      const res = await fetch("/api/admin/testimonials", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          ...row,
          tags: row.tags || [],
          status: row.status === "active" ? "hidden" : "active",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "操作失败");
        return;
      }
      toast.success(row.status === "active" ? "已下架该条评价" : "已上架该条评价");
      await load(groupNo, true);
    } catch (error) {
      console.error("Toggle status error:", error);
      toast.error("网络异常，操作失败");
    }
  };

  const currentSummary = summaries.find((s) => s.groupNo === groupNo);

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Quote className="w-5 h-5 text-[#3182ce]" />
            用户评价管理
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            首页展示的个人 / 企业用户评价：共 {groupCount} 组，系统默认每周自动轮换一组展示。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(groupNo, true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-[#3182ce] hover:text-[#2b6cb0] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 轮换设置 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-800">展示轮换设置</h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">
              上次轮换：{formatTime(state?.lastRotatedAt ?? null)}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              下次轮换：{state?.mode === "auto" ? formatTime(state?.nextRotateAt ?? null) : "（手动模式）"}
            </span>
          </div>
        </div>

        {/* 模式切换 */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500">轮换模式：</span>
          <div className="inline-flex items-center gap-1 bg-slate-100/80 rounded-full p-1">
            {(
              [
                { key: "auto", label: "每周自动轮换" },
                { key: "manual", label: "手动指定" },
              ] as const
            ).map((opt) => {
              const active = state?.mode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={configSaving}
                  onClick={() => saveConfig({ mode: opt.key })}
                  className={`px-4 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer disabled:opacity-50 ${
                    active ? "bg-white text-[#2b6cb0] shadow-xs" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
            <CalendarClock className="w-3.5 h-3.5" />
            {state?.mode === "auto"
              ? "系统每 7 天自动切换到下一组"
              : "仅展示下方选中的分组，不自动切换"}
          </span>
        </div>

        {/* 分组选择 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">展示分组：</span>
          {Array.from({ length: groupCount }, (_, i) => i + 1).map((g) => {
            const isActive = state?.activeGroup === g;
            const isViewing = groupNo === g;
            const summary = summaries.find((s) => s.groupNo === g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => load(g, true)}
                onDoubleClick={() => saveConfig({ activeGroup: g })}
                title="单击查看该组内容，双击设为当前展示组"
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                  isViewing
                    ? "border-[#3182ce] bg-blue-50/70 text-[#2b6cb0]"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                第 {g} 组
                <span className="ml-1 text-[10px] font-bold text-slate-400">
                  {summary ? `${summary.active}/${summary.total}` : "0/0"}
                </span>
                {isActive && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#3182ce] text-white text-[9px] font-black">
                    展示中
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            disabled={configSaving || state?.activeGroup === groupNo}
            onClick={() => saveConfig({ activeGroup: groupNo })}
            className="ml-1 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            设为当前展示组
          </button>
        </div>
        <p className="text-[11px] text-slate-400 font-medium">
          提示：切换分组时也会重置轮换计时，避免刚设好就被自动切走。每条评价还可用「上架 / 下架」控制是否对外展示。
        </p>
      </div>

      {/* 待审核评价（用户自助提交） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            待审核评价
            {pendingRows.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-black">
                {pendingRows.length}
              </span>
            )}
          </h2>
          <span className="text-[11px] font-bold text-slate-400">用户在首页自助提交，通过后需指定展示分组</span>
        </div>

        {pendingRows.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
            <Inbox className="w-6 h-6 text-slate-300" />
            <span className="text-xs font-bold">暂无待审核评价</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingRows.map((row) => (
              <div key={row.id} className="px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 text-sm font-black flex items-center justify-center shrink-0">
                    {row.name.trim().charAt(0) || "评"}
                  </div>
                  <div className="min-w-0 flex-1">
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
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1.5">{row.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      提交人：
                      {row.submitterId
                        ? submitterMap[row.submitterId]?.name ||
                          submitterMap[row.submitterId]?.email ||
                          row.submitterId
                        : "—"}
                      ｜提交时间：{formatTime(row.submittedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3 md:pl-14">
                  <span className="text-[11px] font-bold text-slate-500">归属分组：</span>
                  <select
                    value={reviewGroup[row.id] ?? 1}
                    onChange={(e) => setReviewGroup((p) => ({ ...p, [row.id]: Number(e.target.value) }))}
                    className="h-8 px-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 focus:outline-none"
                  >
                    {Array.from({ length: groupCount }, (_, i) => i + 1).map((g) => (
                      <option key={g} value={g}>
                        第 {g} 组
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onClick={() => reviewAction(row.id, "approve")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[11px] font-black shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    通过并上架
                  </button>

                  {rejectingId === row.id ? (
                    <>
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="驳回原因（可选）"
                        className="h-8 px-2 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 w-44 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                      />
                      <button
                        type="button"
                        disabled={reviewBusy}
                        onClick={() => reviewAction(row.id, "reject", rejectNote)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white text-[11px] font-black shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        确认驳回
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectNote("");
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={reviewBusy}
                      onClick={() => {
                        setRejectingId(row.id);
                        setRejectNote("");
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-red-300 hover:text-red-500 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      驳回
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {rejectedRows.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-3 bg-slate-50/60">
            <p className="text-[11px] font-black text-slate-400">已驳回（{rejectedRows.length}）</p>
            {rejectedRows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-600">{row.name}</span>
                <span className="text-[10px] text-slate-400">
                  {row.reviewNote ? `驳回原因：${row.reviewNote}` : "无备注"}
                </span>
                <button
                  type="button"
                  disabled={reviewBusy}
                  onClick={() => reviewAction(row.id, "approve")}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-600 transition-all cursor-pointer disabled:opacity-50"
                >
                  再次通过（第 {reviewGroup[row.id] ?? 1} 组）
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 评价列表 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-800">
            第 {groupNo} 组评价
            <span className="ml-2 text-[11px] font-bold text-slate-400">
              上架 {currentSummary?.active ?? 0} / 共 {currentSummary?.total ?? 0} 条
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-xs font-bold text-slate-400">该分组暂无评价</p>
            <p className="mt-2 text-[11px] text-slate-400">
              评价由用户在「我的评价」中提交，审核通过后归入分组展示
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50/60 transition-colors">
                {/* 头像 */}
                {row.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.avatar}
                    alt={row.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-sm font-black flex items-center justify-center shrink-0">
                    {row.name.trim().charAt(0) || "评"}
                  </div>
                )}

                <div className="min-w-0 flex-1">
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
                    {row.status !== "active" && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-black">
                        已下架
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        row.submitterId ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {row.submitterId ? "用户提交" : "内置示例"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1.5 line-clamp-2">{row.content}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {(row.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                    {row.highlightLabel && row.highlightValue && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ebf8ff] text-[#2b6cb0]">
                        {row.highlightLabel}：{row.highlightValue}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleStatus(row)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:border-[#3182ce] hover:text-[#2b6cb0] transition-all cursor-pointer"
                  >
                    {row.status === "active" ? "下架" : "上架"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    aria-label="编辑"
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:border-[#3182ce] hover:text-[#2b6cb0] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(row)}
                    aria-label="删除"
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增 / 编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-800">编辑评价</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formLocked
                    ? "用户提交的评价：正文与评分不可修改，仅可维护头像 / 分组 / 排序 / 状态"
                    : "内置示例数据：可维护全部字段"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="关闭"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto space-y-4">
              {/* 用户提交的评价：明确提示正文受保护 */}
              {formLocked && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                    该评价由用户本人提交，<strong>正文、评分与身份信息不可修改</strong>（避免篡改用户原话）。
                    如需修正内容，请驳回后由用户重新提交；此处仅可维护头像、所属分组、排序与展示状态。
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">所属分组</span>
                  <select
                    value={form.groupNo}
                    onChange={(e) => setForm((p) => ({ ...p, groupNo: Number(e.target.value) }))}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                  >
                    {Array.from({ length: groupCount }, (_, i) => i + 1).map((g) => (
                      <option key={g} value={g}>
                        第 {g} 组
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">人群</span>
                  <select
                    value={form.category}
                    disabled={formLocked}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, category: e.target.value as "personal" | "enterprise" }))
                    }
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="personal">个人用户</option>
                    <option value="enterprise">企业客户</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">评分（1-5 星）</span>
                  <select
                    value={form.rating}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, rating: Number(e.target.value) }))}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {"★".repeat(r)} ({r})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">
                    姓名 / 称呼 <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={form.name}
                    disabled={formLocked}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, name: e.target.value }));
                      if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
                    }}
                    placeholder="如：王立群"
                    aria-invalid={!!formErrors.name}
                    className={`mt-1 w-full h-10 px-3 rounded-xl border text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                      formErrors.name
                        ? "border-red-400 bg-red-50/40 focus:ring-red-200"
                        : "border-slate-200 focus:ring-[#3182ce]/30"
                    }`}
                  />
                  {formErrors.name && (
                    <span className="mt-1 block text-[10px] font-bold text-red-500">{formErrors.name}</span>
                  )}
                </label>
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">身份 / 岗位</span>
                  <input
                    value={form.role}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                    placeholder="如：技术总监"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">单位（企业客户填）</span>
                  <input
                    value={form.org}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, org: e.target.value }))}
                    placeholder="如：恒晟软件"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </label>
              </div>

              {/* 头像 */}
              <div>
                <span className="text-[11px] font-black text-slate-500">头像</span>
                <div className="mt-1 flex items-center gap-3">
                  {form.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.avatar}
                      alt="头像预览"
                      className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-sm font-black flex items-center justify-center shrink-0">
                      {form.name.trim().charAt(0) || "评"}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarUpload(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-[#3182ce] hover:text-[#2b6cb0] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {uploading ? "上传中..." : "上传头像"}
                  </button>
                  <input
                    value={form.avatar}
                    onChange={(e) => setForm((p) => ({ ...p, avatar: e.target.value }))}
                    placeholder="或直接填写图片地址"
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">未设置头像时，前台自动使用姓名首字的渐变头像。</p>
              </div>

              <label className="block">
                <span className="text-[11px] font-black text-slate-500">
                  评价内容 <span className="text-red-500">*</span>
                </span>
                <textarea
                  value={form.content}
                  disabled={formLocked}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, content: e.target.value }));
                    if (formErrors.content) setFormErrors((p) => ({ ...p, content: undefined }));
                  }}
                  rows={3}
                  placeholder="如：私有化部署在客户内网，研发资产不出内网……"
                  aria-invalid={!!formErrors.content}
                  className={`mt-1 w-full px-3 py-2 rounded-xl border text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 resize-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                    formErrors.content
                      ? "border-red-400 bg-red-50/40 focus:ring-red-200"
                      : "border-slate-200 focus:ring-[#3182ce]/30"
                  }`}
                />
                {formErrors.content && (
                  <span className="mt-1 block text-[10px] font-bold text-red-500">{formErrors.content}</span>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block sm:col-span-1">
                  <span className="text-[11px] font-black text-slate-500">能力标签（逗号分隔）</span>
                  <input
                    value={form.tagsText}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
                    placeholder="私有化部署, 合规审计"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">成效指标名称</span>
                  <input
                    value={form.highlightLabel}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, highlightLabel: e.target.value }))}
                    placeholder="实施返工率"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">成效指标数值</span>
                  <input
                    value={form.highlightValue}
                    disabled={formLocked}
                    onChange={(e) => setForm((p) => ({ ...p, highlightValue: e.target.value }))}
                    placeholder="-60%"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">排序权重（越小越靠前）</span>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-black text-slate-500">状态</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "active" | "hidden" }))}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30"
                  >
                    <option value="active">上架（对外展示）</option>
                    <option value="hidden">下架（不展示）</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving || uploading}
                onClick={submitForm}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-black shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? "保存中..." : formLocked ? "保存运营设置" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="删除该条评价"
        message={`确定要删除「${deleteTarget?.name ?? ""}」的评价吗？删除后不可恢复。`}
        type="danger"
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
