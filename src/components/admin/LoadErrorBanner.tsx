"use client";

import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * 列表/页面加载失败统一错误横幅（自查清单指令一 1f）
 * 错误态必须与空态互斥渲染：loadError 非空时不得渲染"暂无数据"空态。
 */
export default function LoadErrorBanner({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-red-600 flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate" title={message}>{message || "数据加载失败"}</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black transition-colors cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
        重试
      </button>
    </div>
  );
}
