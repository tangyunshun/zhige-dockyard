"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, Trash2, X, AlertTriangle, Users, FileText, Link2, MessageSquare, History, Layers } from "lucide-react";
import { AssetRecord } from "./AssetsTab";
import { useToast } from "@/components/Toast";
import type { AssetUsage } from "@/lib/asset-notify";

/** 构建“被其他功能引用”的提示条目（无引用返回空数组） */
function buildUsageItems(u?: AssetUsage | null): { icon: any; label: string }[] {
  if (!u) return [];
  const items: { icon: any; label: string }[] = [];
  if (u.sharesActive > 0) items.push({ icon: Link2, label: `${u.sharesActive} 条有效分享链接` });
  if (u.comments > 0) items.push({ icon: MessageSquare, label: `${u.comments} 条评论` });
  if (u.versions > 0) items.push({ icon: History, label: `${u.versions} 个历史版本` });
  if (u.childDocs > 0) items.push({ icon: Layers, label: `${u.childDocs} 个子资料依赖它` });
  return items;
}

/** 移除原因选项（与后端 remove_asset 的 reasonCode 校验保持一致） */
export const REMOVAL_REASON_OPTIONS = [
  { code: "VIOLATION", label: "违规内容", desc: "资料内容违反平台规范或空间管理制度" },
  { code: "EXPIRED", label: "资料过期", desc: "资料已失效、过期或已被更新版本取代" },
  { code: "COPYRIGHT", label: "版权问题", desc: "资料涉嫌侵权或未取得合法授权" },
  { code: "OTHER", label: "其他原因", desc: "需填写具体说明（不少于 5 个字）" },
] as const;

interface RemoveAssetModalProps {
  isOpen: boolean;
  asset: AssetRecord | null;
  memberCount: number; // 将被通知的成员数量
  usage?: AssetUsage | null; // 资料被其他功能引用情况（移除前检测）
  isManager?: boolean; // 当前操作人是否为管理员/所有者
  onClose: () => void;
  onConfirm: (assetId: string, reasonCode: string, reasonDetail: string) => void;
}

/**
 * 管理员移除资料确认弹窗（P0）
 * 流程：确认目标资料 → 选择移除原因 → 填写补充说明 → 二次确认 → 执行
 */
export default function RemoveAssetModal({
  isOpen,
  asset,
  memberCount,
  usage,
  isManager,
  onClose,
  onConfirm,
}: RemoveAssetModalProps) {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>("VIOLATION");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 每次打开重置表单，避免残留上一次的选择
  useEffect(() => {
    if (isOpen) {
      setReasonCode("VIOLATION");
      setReasonDetail("");
      setConfirmed(false);
    }
  }, [isOpen, asset?.id]);

  if (!isOpen || !asset || !mounted) return null;

  const isOther = reasonCode === "OTHER";
  const isSelfRemoval = !isManager;
  const detailLength = reasonDetail.trim().length;
  const detailValid = !isOther || detailLength >= 5;
  const canConfirm = detailValid && confirmed;

  const handleConfirm = () => {
    if (!detailValid) {
      toast.error("选择「其他原因」时必须填写不少于 5 个字的补充说明");
      return;
    }
    if (!confirmed) {
      toast.warning("请先勾选移除确认，避免误操作");
      return;
    }
    onConfirm(asset.id, reasonCode, reasonDetail.trim());
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-red-50/50">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            {isSelfRemoval ? "提交删除申请" : "移除空间资料"}
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

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 步骤 1：目标资料 */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
            <div className="text-[11px] font-black text-slate-400 mb-1">步骤 1 · 目标资料</div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#3182ce] shrink-0" />
              <span className="text-sm font-bold text-slate-900 truncate" title={asset.title}>
                {asset.title}
              </span>
            </div>
          </div>

          {/* 引用检测提示：资料正在被其他功能使用时，分级告知操作人与影响范围 */}
          {(() => {
            const items = buildUsageItems(usage);
            if (items.length === 0) return null;
            return (
              <div className="p-3 bg-red-50/80 border border-red-300/70 rounded-2xl">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-red-700 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> 该资料仍在被其他功能引用
                </div>
                <div className="space-y-1">
                  {items.map((it, i) => {
                    const Icon = it.icon;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-red-700 font-medium">
                        <Icon className="w-3 h-3 shrink-0" /> {it.label}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-red-700/90 font-medium leading-relaxed mt-1.5">
                  {isManager
                    ? "移除后这些关联将不可用，已生成的分享链接会失效，且空间内成员将收到包含此影响的通知。"
                    : "移除后您将无法访问该资料，相关的分享链接与引用也会失效。如该资料被他人引用，对方将收到移除通知。"}
                </div>
              </div>
            );
          })()}

          {/* 步骤 2：移除原因 */}
          <div className="space-y-2">
            <div className="text-[11px] font-black text-slate-400">步骤 2 · 选择移除原因</div>
            {isSelfRemoval && (
              <div className="text-[10px] text-amber-700 font-medium leading-snug">提交后将由空间管理员审核，审核通过才会正式移除该资料。</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {REMOVAL_REASON_OPTIONS.map((opt) => {
                const active = reasonCode === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setReasonCode(opt.code)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? "bg-red-50 border-red-300 ring-2 ring-red-500/20"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`text-xs font-black ${active ? "text-red-700" : "text-slate-800"}`}>
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5 leading-snug">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder={isOther ? "⚠️ 请填写具体移除原因（不少于 5 个字，必填）" : "补充说明（选填，将一并发给成员）"}
              rows={3}
              className={`w-full p-3 text-xs border rounded-2xl focus:bg-white focus:outline-none transition-all resize-none font-medium text-slate-800 ${
                isOther && !detailValid
                  ? "bg-red-50/40 border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  : "bg-slate-50 border-slate-200 focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
              }`}
            />
            <div className="flex justify-end">
              <span
                className={`text-[10px] font-medium ${
                  isOther
                    ? detailValid
                      ? "text-emerald-600"
                      : "text-red-600"
                    : "text-slate-400"
                }`}
              >
                {isOther
                  ? detailValid
                    ? `已输入 ${detailLength} 字（满足要求）`
                    : `已输入 ${detailLength} 字，还需 ${Math.max(0, 5 - detailLength)} 字（至少 5 字）`
                  : `已输入 ${detailLength} 字（选填）`}
              </span>
            </div>
          </div>

          {/* 步骤 3：执行与通知预览 */}
          <div className="space-y-2">
            <div className="text-[11px] font-black text-slate-400">步骤 3 · 确认并执行</div>

            <div className="p-2.5 bg-blue-50/80 border border-blue-200/70 rounded-xl flex items-start gap-2">
              <Users className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-700 font-medium leading-relaxed">
                移除后将自动向空间内 <strong className="text-[#3182ce]">{memberCount} 位成员</strong> 发送通知，
                内容包含资料名称、移除原因、移除时间与联系管理员提示。
              </div>
            </div>

            <label className="flex items-start gap-2 p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-red-600 cursor-pointer"
              />
              <span className="text-[11px] text-amber-900 font-bold leading-relaxed">
                我已确认移除《{asset.title}》，并理解移除后成员将无法访问该资料（可由管理员恢复）。
              </span>
            </label>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
            <AlertTriangle className="w-3 h-3" />
            移除采用软删除：资料数据保留，可在「变更日志 → 移除记录」中恢复。
          </div>
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
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={`px-4 py-2 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
              canConfirm
                ? "bg-red-600 hover:bg-red-700 text-white shadow-red-500/20 cursor-pointer active:scale-95"
                : "bg-slate-300 text-white cursor-not-allowed shadow-transparent"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isSelfRemoval ? "提交删除申请" : "确认移除"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
