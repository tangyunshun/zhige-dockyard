import React from "react";
import { X, ArrowRight, Building2, Server, Users, Box } from "lucide-react";
import { useRouter } from "next/navigation";

interface QuotaUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
  maxLimit: number;
}

export default function QuotaUpgradeModal({
  isOpen,
  onClose,
  currentCount,
  maxLimit,
}: QuotaUpgradeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[24px] shadow-2xl border border-white max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 z-10 animate-scale-in">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title & Badge */}
        <div className="mb-6 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200/50 rounded-full text-[11px] text-red-600 font-bold mb-3">
            🚨 创建额度已满
          </span>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight">
            升级空间额度
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 font-semibold leading-relaxed">
            您当前使用的是社区尝鲜版（L1），最多只能创建 1 个企业空间。如果需要创建更多，请升级套餐。
          </p>
        </div>

        {/* Current State Indicator */}
        <div className="bg-[#f0f8ff] border border-blue-100/50 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-inner flex-shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider mb-0.5">当前使用情况</span>
            <span className="text-sm text-slate-700 font-black">
              已创建企业空间: <span className="text-red-500 font-black">{currentCount}</span> / {maxLimit} 个
            </span>
          </div>
          <span className="bg-slate-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-sm">
            普通用户 (L1)
          </span>
        </div>

        {/* Benefits Comparison Grid */}
        <div className="mb-6 flex-shrink-0">
          <h4 className="text-xs text-slate-700 font-bold mb-3.5">升级后享有的权益：</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Benefit 1 */}
            <div className="p-3.5 bg-slate-50/60 border border-slate-200/30 rounded-xl hover:border-blue-200/50 hover:bg-blue-50/5 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-[#2b6cb0]">
                  <Building2 className="w-4 h-4" />
                </div>
                <h5 className="text-xs font-black text-slate-800">企业空间数量</h5>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mb-2.5">
                可同时创建并管理最多 3 个企业工作空间。
              </p>
              <div className="text-[10px] text-[#2b6cb0] font-extrabold font-mono bg-blue-50/50 px-2 py-0.5 rounded inline-block">
                1 个 ➔ 3 个
              </div>
            </div>

            {/* Benefit 2 */}
            <div className="p-3.5 bg-slate-50/60 border border-slate-200/30 rounded-xl hover:border-amber-200/50 hover:bg-amber-50/5 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center text-[#d97706]">
                  <Server className="w-4 h-4" />
                </div>
                <h5 className="text-xs font-black text-slate-800">每月调用额度</h5>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mb-2.5">
                提供更多的组件调用额度，避免组件运行额度不足。
              </p>
              <div className="text-[10px] text-[#d97706] font-extrabold font-mono bg-amber-50/50 px-2 py-0.5 rounded inline-block">
                1,000 ➔ 100,000 额度
              </div>
            </div>

            {/* Benefit 3 */}
            <div className="p-3.5 bg-slate-50/60 border border-slate-200/30 rounded-xl hover:border-purple-200/50 hover:bg-purple-50/5 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                  <Users className="w-4 h-4" />
                </div>
                <h5 className="text-xs font-black text-slate-800">团队协作与岗位</h5>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mb-2.5">
                支持邀请团队成员，并可为岗位分配不同的管理权限。
              </p>
              <div className="text-[10px] text-purple-600 font-extrabold font-mono bg-purple-50/50 px-2 py-0.5 rounded inline-block">
                支持多人协作与分权
              </div>
            </div>

            {/* Benefit 4 */}
            <div className="p-3.5 bg-slate-50/60 border border-slate-200/30 rounded-xl hover:border-emerald-200/50 hover:bg-emerald-50/5 hover:shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center text-[#059669]">
                  <Box className="w-4 h-4" />
                </div>
                <h5 className="text-xs font-black text-slate-800">解锁高级组件</h5>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mb-2.5">
                全量解锁全部 53 个高级分析和生产力组件。
              </p>
              <div className="text-[10px] text-[#059669] font-extrabold font-mono bg-emerald-50/50 px-2 py-0.5 rounded inline-block">
                6 个 ➔ 53 个全部组件
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="sm:w-1/3 px-4.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-500 font-black cursor-pointer transition-all text-center"
          >
            取消
          </button>
          <button
            onClick={() => {
              onClose();
              router.push("/pricing");
            }}
            className="flex-1 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:brightness-105 border-t border-[#63b3ed] text-white text-xs font-black px-6 py-2.5 rounded-lg shadow-md cursor-pointer transition-all flex items-center justify-center gap-1"
          >
            <span>去升级</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
