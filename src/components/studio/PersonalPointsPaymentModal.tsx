"use client";

import { AlertCircle } from "lucide-react";

interface PersonalPointsPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  componentName: string;
  taskName: string;
  /** 本次任务需要的算力点数 */
  requiredPoints: number;
  /** 你个人钱包当前可用算力点数 */
  availablePoints: number;
}

/**
 * 个人点支付确认框。
 * 场景：企业空间共享算力点不够扣本次任务，但你个人钱包里还有点。
 * 必须由你本人手动确认，才会用你私人的算力点买单；绝不自动跨界扣你的个人资产。
 * 这是一次性个人支付，支付后不会事后补扣、也不会自动归还。
 */
export default function PersonalPointsPaymentModal({
  open,
  onClose,
  onConfirm,
  componentName,
  taskName,
  requiredPoints,
  availablePoints,
}: PersonalPointsPaymentModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <span>企业空间算力点不足，是否用个人算力点支付？</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          当前企业空间的共享算力点不够运行组件 <strong>[{componentName}]</strong>
          {taskName ? `（任务 [${taskName}]）` : ""}（本次需要约 <strong>{requiredPoints}</strong> 点）。
          你个人账户里还有 <strong>{availablePoints}</strong> 点，是否用<strong>你个人的算力点</strong>来支付本次任务？
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          说明：这会用你自己的点直接买单，属于一次性个人支付，不会事后从企业空间补扣，也不会自动归还。
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer"
          >
            用个人点支付
          </button>
        </div>
      </div>
    </div>
  );
}
