"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, X, FileText, AlertTriangle } from "lucide-react";
import { AssetRecord } from "./AssetsTab";

interface PrivateAssetRemoveModalProps {
  isOpen: boolean;
  asset: AssetRecord | null;
  onClose: () => void;
  onConfirm: (assetId: string) => void;
}

/**
 * 个人私密资料删除确认弹窗
 * 流程：确认目标资料 → 二次确认 → 执行彻底删除
 * 说明：私密资料删除不需要管理员审核，不通知任何成员，不生成恢复记录，删除后不可恢复。
 */
export default function PrivateAssetRemoveModal({
  isOpen,
  asset,
  onClose,
  onConfirm,
}: PrivateAssetRemoveModalProps) {
  const [mounted, setMounted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 每次打开重置确认状态，避免沿用上次选择
  useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
    }
  }, [isOpen, asset?.id]);

  if (!isOpen || !asset || !mounted) return null;

  const handleConfirm = () => {
    if (!confirmed) return;
    onConfirm(asset.id);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            删除个人私密资料
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 目标资料 */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
            <div className="text-[11px] font-black text-slate-400 mb-1">目标资料</div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#3182ce] shrink-0" />
              <span className="text-sm font-bold text-slate-900 truncate" title={asset.title}>
                {asset.title}
              </span>
            </div>
          </div>

          {/* 提示 */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-2xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900 font-medium leading-relaxed">
              此资料为您的个人私密资料，删除后将直接从您的个人资料库中彻底擦除，该操作不会通知空间其他成员，亦无恢复记录。
            </div>
          </div>

          {/* 二次确认 */}
          <label className="flex items-start gap-2 p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-red-600 cursor-pointer"
            />
            <span className="text-[11px] text-amber-900 font-bold leading-relaxed">
              我已确认删除《{asset.title}》，删除后该资料将不再显示在我的资料库中。
            </span>
          </label>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!confirmed}
            onClick={handleConfirm}
            className={`px-4 py-2 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
              confirmed
                ? "bg-red-600 hover:bg-red-700 text-white shadow-red-500/20 cursor-pointer active:scale-95"
                : "bg-slate-300 text-white cursor-not-allowed shadow-transparent"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            确认删除
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
