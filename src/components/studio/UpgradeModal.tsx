"use client";

import { useToast } from "@/components/Toast";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  workspaceType: string;
}

export default function UpgradeModal({ open, onClose, workspaceType }: UpgradeModalProps) {
  const toast = useToast();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span>👑 升级工作空间服务配额与额度限制</span>
        </h3>
        <p className="text-xs text-slate-500 font-bold leading-relaxed">
          {workspaceType === "PERSONAL" ? "个人空间" : "空间"}当前处于免费自主沙盒套餐下。升级为企业协同空间将享有以下专有服务额度：
        </p>
        <div className="space-y-2.5 text-xs text-slate-700 font-extrabold bg-slate-50 p-3 rounded border">
          <p>• 基础调用点数配额：20,000 点 / 月</p>
          <p>• 高级高级解析组件：全量解锁使用 (如 C01 RFP 条款解析等)</p>
          <p>• 团队协作上限：最大支持 30 位协作研发人员</p>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">
            取消
          </button>
          <button onClick={() => { onClose(); toast.success("空间套餐升级申请已提交成功！"); }} className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer">
            立即申请开通
          </button>
        </div>
      </div>
    </div>
  );
}
