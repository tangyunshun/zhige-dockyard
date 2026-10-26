"use client";

/**
 * TaskRatingBar —— 组件执行成功后的真实评分条
 *
 * 业务闭环：执行成功（ResultViewer SUCCESS 态）→ 用户评分 → POST /api/studio { action: "rate" }
 * → 后端校验"必须真实执行过该组件"→ upsert componentrating → 重算 component_stats.averageRating
 * → 组件大厅/详情面板展示真实均分。
 * 诚实口径：均分与人数来自 component_stats 真实重算，前端不造数；未评过显示"暂无评分"。
 */

import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface TaskRatingBarProps {
  componentId: string;
  componentName?: string;
}

export default function TaskRatingBar({ componentId, componentName }: TaskRatingBarProps) {
  const toast = useToast();
  const [myRating, setMyRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 回显本人已有评分（可改评）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/studio?action=my-rating&componentId=${encodeURIComponent(componentId)}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success && d.data?.rating) {
          setMyRating(d.data.rating);
          if (d.data.comment) setComment(d.data.comment);
          setSubmitted(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [componentId]);

  const submit = async (rating: number) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ action: "rate", componentId, rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMyRating(rating);
        setSubmitted(true);
        toast.success("评分已提交，感谢反馈！");
      } else {
        toast.error(data.error || "评分提交失败，请稍后重试");
      }
    } catch {
      toast.error("网络异常，评分未提交");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const shown = hoverRating ?? myRating;

  return (
    <div className="px-6 py-2.5 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between gap-3 flex-wrap text-left">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-600">
          为本次「{componentName || "该组件"}」服务评分：
        </span>
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverRating(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={submitting}
              onMouseEnter={() => setHoverRating(n)}
              onClick={() => submit(n)}
              className="cursor-pointer transition-transform hover:scale-110 disabled:opacity-60 disabled:cursor-wait"
              title={`${n} 星`}
            >
              <Star
                className={`w-4 h-4 ${
                  shown && n <= shown ? "text-amber-400 fill-amber-400" : "text-slate-300"
                }`}
              />
            </button>
          ))}
          {submitting && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin ml-1" />}
        </div>
        {submitted && myRating && (
          <span className="text-[10px] text-emerald-600 font-bold">
            已评 {myRating} 星（可点击星星改评）
          </span>
        )}
      </div>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="补充一句使用感受（可选）"
        maxLength={100}
        className="flex-1 min-w-[180px] max-w-xs h-7 px-2.5 text-[11px] border border-amber-200/80 rounded-lg bg-white/80 focus:outline-none focus:border-amber-400 font-medium"
      />
    </div>
  );
}
