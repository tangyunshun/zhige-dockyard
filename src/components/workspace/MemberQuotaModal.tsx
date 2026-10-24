"use client";

/**
 * MemberQuotaModal —— 工作空间「成员个人月度算力额度设置」弹窗（展示层）
 *
 * 来源区块：WorkspaceInternalLayoutV3.tsx 的 {editingQuotaMember && (...)} 整段 JSX
 * 拆分日期：2026-10-25（V3 拆分第 2 步）
 *
 * 本组件只做展示：成员数据（editingQuotaMember）、额度输入框状态（inputQuotaValue /
 * setInputQuotaValue）、保存动作（handleSaveQuotaInLayout）、关闭（onClose）均由父组件 V3
 * 通过 props 传入；本组件不持有 state、不发请求。
 */

import { Zap, X } from "lucide-react";
import { isUnlimitedToken, formatTokenBalance } from "@/utils/quota";

interface EditingMember {
  name?: string;
  userName?: string;
  userId?: string;
  tokenBalance?: number;
}

interface WorkspaceQuotaInfo {
  tokenBalance: number;
  levelName: string;
  levelTokenLimit: number;
  totalAllocatedToMembers: number;
  unallocatedBalance: number;
}

export interface MemberQuotaModalProps {
  onClose: () => void;
  editingQuotaMember: EditingMember | null;
  workspaceQuotaInfo: WorkspaceQuotaInfo;
  inputQuotaValue: string;
  setInputQuotaValue: (v: string) => void;
  savingQuota: boolean;
  handleSaveQuotaInLayout: (isClear: boolean) => void;
}

export default function MemberQuotaModal(props: MemberQuotaModalProps) {
  const {
    onClose,
    editingQuotaMember,
    workspaceQuotaInfo,
    inputQuotaValue,
    setInputQuotaValue,
    savingQuota,
    handleSaveQuotaInLayout,
  } = props;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-left font-sans space-y-4">
        <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-sm">配置成员个人月度算力额度</h3>
              <p className="text-[11px] text-blue-100">把该成员的算力余额调整到所设上限（差额从空间共享池分配或回收）</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>目标成员: <strong className="text-slate-900">{editingQuotaMember?.name || editingQuotaMember?.userName || "协同成员"}</strong></span>
              <span className="text-[11px] text-slate-500 font-mono">ID: {(editingQuotaMember?.userId || "").slice(0, 8)}...</span>
            </div>
            <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-center justify-between gap-2 font-medium flex-wrap">
              <span>⚡ 空间可用算力池：<strong className="text-amber-600 font-bold font-mono">{isUnlimitedToken(workspaceQuotaInfo.tokenBalance) ? "无限" : `${workspaceQuotaInfo.tokenBalance} 算力点`}</strong></span>
              <span>该成员独立余额：<strong className="text-amber-600 font-bold font-mono">{Number(editingQuotaMember?.tokenBalance || 0).toLocaleString()} 算力点</strong></span>
              <span>📊 未锁定余量：<strong className="text-emerald-600 font-bold font-mono">{formatTokenBalance(workspaceQuotaInfo.unallocatedBalance)} 算力点</strong></span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700">
              本月算力上限 (算力点)
            </label>
            <div className="relative">
              <input
                type="number"
                value={inputQuotaValue}
                onChange={(e) => setInputQuotaValue(e.target.value)}
                placeholder="留空/0 表示清空该成员独立余额（回收至共享池）"
                className="w-full h-11 px-3.5 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">算力点</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              💡 提示：设置的具体数值即该成员的「独立算力余额」。保存时与当前余额的差额会从空间共享池自动转出（分配）或转回（回收），并写入归属该成员的流水。成员执行组件任务时仅消耗自身独立余额，不足时由系统提示其向管理员申请分配。自然月首日重置「已用点数」。
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleSaveQuotaInLayout(true)}
              disabled={savingQuota}
              className="px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              清空/不设限制
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleSaveQuotaInLayout(false)}
                disabled={savingQuota}
                className="px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {savingQuota ? "保存中..." : "确认保存配额"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
