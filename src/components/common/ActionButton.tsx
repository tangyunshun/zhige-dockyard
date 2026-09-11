"use client";

/**
 * 行内操作按钮（动词化）
 *
 * 规范：操作就是操作，只出现在「操作列」，文案一律用动词。
 * - primary 主操作（编辑 / 启用 / 通过）→ 主题蓝
 * - warn    有副作用但可逆（停用 / 禁用 / 驳回）→ 琥珀，且不占用「红色」
 * - danger  不可逆 / 高危（删除 / 封禁）→ 正红 #dc2626（与申诉页删除同色）
 * - neutral 中性查看（查看详情）→ 白底描边
 *
 * 危险等级只由颜色区分：红 = 不可恢复，琥珀 = 可恢复但影响面大。
 * 不可操作时必须给出原因（disabledReason）：红色禁止光标 + tooltip 说明，
 * 不能只是「变灰了事」。
 */
import React from "react";

/** 红色「禁止」鼠标指针（替换浏览器默认的黑色 not-allowed 圈） */
export const RED_NO_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%23ef4444'%20stroke-width='2'/%3E%3Cline%20x1='5'%20y1='5'%20x2='19'%20y2='19'%20stroke='%23ef4444'%20stroke-width='2'/%3E%3C/svg%3E\") 12 12, not-allowed";

export type ActionVariant = "primary" | "success" | "warn" | "danger" | "neutral";

const VARIANTS: Record<ActionVariant, string> = {
  primary: "bg-[#3182ce] border-[#3182ce] text-white hover:bg-[#2b6cb0] hover:border-[#2b6cb0]",
  success:
    "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700",
  warn: "bg-amber-500 border-amber-500 text-white hover:bg-amber-600 hover:border-amber-600",
  danger: "bg-red-600 border-red-600 text-white hover:bg-red-700 hover:border-red-700",
  neutral: "bg-white border-slate-200 text-slate-700 hover:bg-slate-100",
};

/** 禁用态：danger 保留淡红以维持语义，其余统一灰化 */
const DISABLED: Record<ActionVariant, string> = {
  primary: "bg-slate-50 border-slate-200 text-slate-300",
  success: "bg-slate-50 border-slate-200 text-slate-300",
  warn: "bg-slate-50 border-slate-200 text-slate-300",
  danger: "bg-red-100/40 border-red-200 text-red-300",
  neutral: "bg-slate-50 border-slate-200 text-slate-300",
};

export interface ActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ActionVariant;
  icon?: React.ReactNode;
  /** 操作文案（动词：编辑 / 停用 / 启用 / 删除） */
  children: React.ReactNode;
  /** 不可操作原因：传了即自动禁用，并展示红色禁止光标与 tooltip */
  disabledReason?: string;
  /** 紧凑尺寸：用于卡片等空间受限场景 */
  compact?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = "neutral",
  icon,
  children,
  disabledReason,
  compact = false,
  disabled,
  className = "",
  ...rest
}) => {
  const isDisabled = disabled || !!disabledReason;
  return (
    <button
      type="button"
      disabled={isDisabled}
      title={disabledReason || rest.title}
      style={isDisabled ? { cursor: RED_NO_CURSOR } : undefined}
      className={`${
        compact ? "px-2.5 py-1 text-[11px] rounded-lg" : "px-3.5 py-2 text-xs rounded-xl"
      } font-black border shadow-2xs transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
        isDisabled
          ? `${DISABLED[variant]} cursor-not-allowed`
          : `${VARIANTS[variant]} cursor-pointer`
      } ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
};

/** 操作列容器：统一右对齐与间距 */
export const RowActions: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`flex items-center justify-end gap-2 ${className}`}>{children}</div>
);

export default ActionButton;
