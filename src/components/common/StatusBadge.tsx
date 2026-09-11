"use client";

/**
 * 状态徽章（只读）
 *
 * 规范：状态就是状态，不承载任何操作。
 * - 徽章一律 `cursor-default select-none`，不可点击、不可选中；
 * - 文案描述「当前是什么」：启用中 / 已停用 / 待审核 / 已封禁…；
 * - 需要对该状态做变更时，一律走操作列的「动词按钮」（见 ActionButton）。
 *
 * 这样做的原因：把操作藏在状态里会产生「状态-动作歧义」
 * ——用户点的是「已启用」，发生的却是「停用」，在密集表格里极易误触且难以发现功能。
 */
import React from "react";

export type StatusTone =
  | "active" // 启用中 / 正常（绿）
  | "inactive" // 已停用 / 已禁用（灰）
  | "pending" // 待审核 / 处理中（蓝）
  | "warn" // 受限 / 临期待处理（琥珀）
  | "danger" // 封禁 / 异常（红）
  | "neutral"; // 中性（石板灰）

interface ToneStyle {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

const TONE_STYLES: Record<StatusTone, ToneStyle> = {
  active: {
    bg: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-white",
    dot: "bg-white",
  },
  inactive: {
    bg: "bg-slate-200",
    border: "border-slate-300",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  pending: {
    bg: "bg-[#3182ce]",
    border: "border-[#3182ce]",
    text: "text-white",
    dot: "bg-white",
  },
  warn: {
    bg: "bg-amber-500",
    border: "border-amber-500",
    text: "text-white",
    dot: "bg-white",
  },
  danger: {
    bg: "bg-red-600",
    border: "border-red-600",
    text: "text-white",
    dot: "bg-white",
  },
  neutral: {
    bg: "bg-slate-100",
    border: "border-slate-200",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
};

export interface StatusBadgeProps {
  /** 语义色调，决定配色 */
  tone: StatusTone;
  /** 状态文案（描述当前状态，不要用动词，如「启用中」而非「启用」） */
  children: React.ReactNode;
  /** 左侧图标（可选，如 CheckCircle2 / XCircle） */
  icon?: React.ReactNode;
  /** 状态点是否呼吸闪烁，用于「进行中」类状态，默认关闭 */
  pulse?: boolean;
  /** 补充说明（hover tooltip） */
  title?: string;
  /** 紧凑尺寸：用于卡片等空间受限场景 */
  compact?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone,
  children,
  icon,
  pulse = false,
  title,
  compact = false,
  className = "",
}) => {
  const s = TONE_STYLES[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 border shadow-2xs cursor-default select-none whitespace-nowrap font-black ${
        compact ? "px-2 py-0.5 text-[10px] rounded-lg" : "px-3 py-1.5 text-xs rounded-xl"
      } ${s.bg} ${s.border} ${s.text} ${className}`}
    >
      <span className="relative flex items-center justify-center w-1.5 h-1.5 shrink-0">
        {pulse && (
          <span
            className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${s.dot}`}
          />
        )}
        <span className={`inline-flex w-1.5 h-1.5 rounded-full ${s.dot}`} />
      </span>
      {icon}
      {children}
    </span>
  );
};

/** 常用状态文案预设，避免各页面自行发明同义文案 */
export const STATUS_TEXT = {
  enabled: "启用中",
  disabled: "已停用",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  banned: "已封禁",
  normal: "正常",
} as const;

export default StatusBadge;
