"use client";

import { ShieldAlert } from "lucide-react";

interface SafeUninstallModalProps {
  open: boolean;
  uninstallingComponentId: string | null;
  uninstallingComponentName: string;
  uninstallStep: "idle" | "checking" | "confirm" | "blocked";
  checkLogs: string[];
  onClose: () => void;
  onClearData: () => void;
  onConfirmUninstall: () => void;
}

export default function SafeUninstallModal({
  open,
  uninstallingComponentId,
  uninstallingComponentName,
  uninstallStep,
  checkLogs,
  onClose,
  onClearData,
  onConfirmUninstall,
}: SafeUninstallModalProps) {
  if (!open || !uninstallingComponentId || uninstallStep === "idle") return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] border border-white/90 shadow-xl max-w-md w-full p-6 text-left animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-100">
          <div className="w-6.5 h-6.5 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-extrabold text-slate-800">
            组件安全卸载诊断弹窗
          </h3>
        </div>

        {uninstallStep === "checking" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs font-black text-slate-700">正在诊断本地资产关联安全性...</span>
            </div>
            {/* 滚动诊断日志盒子 */}
            <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] space-y-1 max-h-36 overflow-y-auto leading-relaxed shadow-inner">
              {checkLogs.map((log, i) => {
                if (!log) return null;
                return (
                  <div key={i} className={log.startsWith("✔") ? "text-emerald-400" : log.startsWith("❌") ? "text-rose-400" : ""}>
                    {log}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {uninstallStep === "confirm" && (
          <div className="space-y-3.5">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 font-semibold leading-relaxed">
              ✔ <strong>安全诊断通过</strong>：系统未检测到组件 `[{uninstallingComponentId}] {uninstallingComponentName}` 在此空间存在任何历史运行数据或文件依存绑定，卸载安全系数 100%。
            </div>
            <p className="text-xs text-slate-500 font-bold leading-normal">
              您确认要将该组件从当前空间中卸载并解绑吗？解绑后本地将不再加载其运行面板。
            </p>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-4 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border-none cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirmUninstall}
                className="h-8 px-4 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white border-none cursor-pointer transition-colors"
              >
                确认卸载
              </button>
            </div>
          </div>
        )}

        {uninstallStep === "blocked" && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-lg p-3.5 text-xs text-red-800 font-semibold leading-relaxed">
              ⚠️ <strong>合规安全拦截警告</strong>：由于该组件在此空间内已有了任务运行记录或自动生成文件（如下所示），为了保证运行数据和审计链的可回溯性，**系统目前已强制阻断直接卸载**。
            </div>
            
            <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] space-y-1 max-h-24 overflow-y-auto leading-relaxed shadow-inner">
              {checkLogs.map((log, i) => {
                if (!log) return null;
                return (
                  <div key={i} className={log.startsWith("❌") ? "text-rose-400" : ""}>
                    {log}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-500 font-bold leading-normal">
              如果您依旧希望卸载它，必须先清空删除全部空间历史记录。
            </p>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClearData}
                className="h-8 px-3.5 text-xs font-black text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg cursor-pointer transition-all shadow-sm"
              >
                🔥 一键清理历史数据并卸载
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-4 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg border-none cursor-pointer transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
