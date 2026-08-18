"use client";

import { AlertCircle } from "lucide-react";

interface ConfirmRunModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  componentName: string;
  taskName: string;
}

export default function ConfirmRunModal({ open, onClose, onConfirm, componentName, taskName }: ConfirmRunModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-amber-500" /> 
          <span>确认扣除可用点数启动数据处理任务？</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          确定为组件 <strong>[{componentName}]</strong> {taskName ? `和任务 [${taskName}]` : ""} 启动自动化数据流流水线吗？本操作将从当前空间中扣除部分可用调用点数。
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">
            取消
          </button>
          <button onClick={onConfirm} className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer">
            确认启动
          </button>
        </div>
      </div>
    </div>
  );
}
