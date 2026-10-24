"use client";

/**
 * ClearConfirmModal —— 工作空间「清空空间数据」高危确认弹窗（展示层）
 *
 * 来源区块：WorkspaceInternalLayoutV3.tsx 的 {showClearConfirm && (...)} 整段 JSX
 * 拆分日期：2026-10-25（V3 拆分第 4 步）
 *
 * 本组件只做展示：确认输入状态（clearConfirmText / setClearConfirmText）、清空动作
 * （handleClearSettingsData / clearing）由父组件 V3 通过 props 传入；关闭动作统一走
 * onClose（父组件在 onClose 中同时复位 showClearConfirm 与 clearConfirmText，保持原行为）。
 */

import { AlertTriangle } from "lucide-react";

export interface ClearConfirmModalProps {
  onClose: () => void;
  clearConfirmText: string;
  setClearConfirmText: (v: string) => void;
  clearing: boolean;
  handleClearSettingsData: () => void;
}

export default function ClearConfirmModal(props: ClearConfirmModalProps) {
  const { onClose, clearConfirmText, setClearConfirmText, clearing, handleClearSettingsData } = props;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 text-left space-y-5 relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 顶部危险高亮微边线 */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-red-500 to-red-600 absolute top-0 left-0 right-0" />

        {/* Header 图标与标题 */}
        <div className="flex items-start gap-3.5 pt-1">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shadow-xs shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              确认清空空间数据？
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
              高危数据清理警示：此操作不可逆！
            </p>
          </div>
        </div>

        {/* 警告原因及后果详情卡片 */}
        <div className="bg-red-50/60 border border-red-100/80 p-3.5 rounded-xl space-y-1.5 text-left">
          <p className="text-xs text-red-800 font-bold leading-relaxed">
            ⚠️ 此操作会清空该空间的所有任务历史、处理结果、资料和知识库文档。
          </p>
          <p className="text-[11px] text-red-500 font-extrabold">
            清空后数据无法恢复，请谨慎操作。
          </p>
        </div>

        {/* 校验输入框区 */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-black text-slate-700 block">
            请输入 <span className="text-red-500 font-mono bg-red-50 px-1.5 py-0.5 rounded border border-red-200">确认重置</span> 以确认此高危操作：
          </label>
          <input
            type="text"
            placeholder="在此输入“确认重置”"
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            className="w-full h-10 px-3.5 text-xs font-black bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 font-mono text-slate-800"
          />
        </div>

        {/* 操作按钮组 */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-9 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200/60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleClearSettingsData}
            disabled={clearing || clearConfirmText !== "确认重置"}
            className="px-5 h-9 bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-amber-500 text-xs font-black rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            {clearing ? "正在清空..." : "确认清空"}
          </button>
        </div>
      </div>
    </div>
  );
}
