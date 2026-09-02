"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  ShieldAlert, CheckCircle2, XCircle, FileText, User, Calendar, 
  Globe, AlertTriangle, Eye, X 
} from "lucide-react";
import { AssetRecord } from "./AssetsTab";
import { useToast } from "@/components/Toast";

interface ReviewAssetModalProps {
  isOpen: boolean;
  asset: AssetRecord | null;
  mode?: "approve" | "reject" | "review";
  onClose: () => void;
  onApprove: (assetId: string, comment?: string) => void;
  onReject: (assetId: string, comment?: string) => void;
}

// 将 ISO 时间格式化为 YYYY-MM-DD HH:mm 展示，避免弹窗内出现 2026-08-31T16:29:45.554Z 这种原始格式
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return dateStr;
  }
}

export default function ReviewAssetModal({
  isOpen,
  asset,
  mode = "review",
  onClose,
  onApprove,
  onReject
}: ReviewAssetModalProps) {
  const toast = useToast();
  const [reviewComment, setReviewComment] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !asset || !mounted) return null;

  const handleApproveClick = () => {
    onApprove(asset.id, reviewComment);
    setReviewComment("");
  };

  const handleRejectClick = () => {
    if (!reviewComment.trim()) {
      toast.error("驳回申请时必须输入明确的修改意见，告知提交人具体修订要求！");
      return;
    }
    onReject(asset.id, reviewComment);
    setReviewComment("");
  };

  const isRejectMode = mode === "reject";
  const isApproveMode = mode === "approve";

  const quickTemplates = isRejectMode ? [
    { label: "❌ 缺少摘要说明", text: "资料摘要与提要信息不完整，请补充详细摘要后再重新发起公开申请。" },
    { label: "❌ 格式不合规范", text: "文件格式不全或排版不符，请按团队文档规范修改后再试。" },
    { label: "❌ 包含敏感信息", text: "涉及敏感或未公开数据，暂不符合空间共享标准，已退回为个人私密。" },
  ] : [
    { label: "✅ 符合团队规范", text: "符合空间知识规范与归档标准，予以公开。" },
    { label: "✅ 内容详尽完整", text: "内容详尽完整，适合协同成员查阅学习。" },
    { label: "✅ 经过核对无误", text: "已核对资料属性与提要，允许公开共享。" },
  ];

  return createPortal(
    <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 sm:p-6 font-sans text-left animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl text-left border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 shadow-xs border ${
              isRejectMode ? "bg-red-50 border-red-200/80 text-red-600" : "bg-emerald-50 border-emerald-200/80 text-emerald-600"
            }`}>
              {isRejectMode ? <XCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                {isRejectMode ? "🔴 驳回空间公开资料申请" : isApproveMode ? "🟢 审核通过空间公开资料" : "空间公开资料审核"}
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  isRejectMode ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
                }`}>
                  {isRejectMode ? "驳回确认 (意见必填)" : "待管理员审批"}
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isRejectMode ? "驳回后资料将转为上传者的个人私密资料，必须填写具体的修改要求。" : "普通成员发起了公开资料归档申请，请审核该文件是否符合团队知识合规规范。"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 核心元信息区域 */}
        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/70 space-y-3">
          <div className="flex items-start gap-2.5">
            <FileText className="w-5 h-5 text-[#3182ce] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">资料文件名称</span>
              <p className="text-xs font-black text-slate-900 break-all leading-relaxed" title={asset.title}>
                {asset.title}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/60 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>提交申请人: <strong className="text-[#3182ce]">{asset.uploaderName || "普通成员"}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>提交时间: <strong className="text-slate-800">{formatDateDisplay(asset.createdAt)}</strong></span>
            </div>
          </div>
        </div>

        {/* 文件提要内容预览区 */}
        <div className="space-y-1.5">
          <label className="block text-xs font-extrabold text-slate-700">
            资料提要与内容预览
          </label>
          <div className="p-3.5 bg-slate-900 text-slate-100 rounded-2xl text-xs font-mono max-h-36 overflow-y-auto leading-relaxed border border-slate-800 space-y-2">
            {asset.content ? (
              <pre className="whitespace-pre-wrap font-sans text-slate-200">{asset.content.slice(0, 800)}</pre>
            ) : (
              <p className="text-slate-400 italic">二进制规范文件暂不展示提要，请点击预览查看更多...</p>
            )}
          </div>
        </div>

        {/* 审核意见与驳回修改意见输入区 */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-extrabold text-slate-800 flex items-center gap-1">
              ✍️ {isRejectMode ? "驳回修改意见" : "审核通过意见"}
              {isRejectMode ? (
                <span className="text-red-500 font-black text-xs zg-required" title="必填项目">* (必填)</span>
              ) : (
                <span className="text-slate-400 font-medium text-[11px]">(选填)</span>
              )}
            </label>
            <span className="text-[11px] text-slate-400 font-medium">
              {isRejectMode ? "必须填明确的修改要点，退回提交人" : "填入审核通过认可说明"}
            </span>
          </div>

          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder={isRejectMode ? "⚠️ 请在此处输入具体的修改要求与退回原因（必填）..." : "填写审核通过意见（选填，如：符合空间知识规范）..."}
            rows={3}
            className={`w-full p-3 text-xs border rounded-2xl focus:bg-white focus:outline-none transition-all resize-none font-medium text-slate-800 ${
              isRejectMode && !reviewComment.trim()
                ? "bg-red-50/40 border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                : "bg-slate-50 border-slate-200 focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
            }`}
          />

          {/* 常用意见快捷词 */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickTemplates.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setReviewComment(item.text)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-lg text-[11px] font-bold transition-all cursor-pointer border border-slate-200/60 active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 合规提醒 */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center gap-2 text-amber-800 text-[11px] font-bold">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{isRejectMode ? "驳回后，该修改意见将实时同步转达给提交人并退回为个人私密。" : "审核通过后，该文件将面向协同空间全体成员开放共享。"}</span>
        </div>

        {/* 底栏操作组：按模式精准隔离展示 */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            取消
          </button>

          {isRejectMode ? (
            <button
              type="button"
              onClick={handleRejectClick}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md shadow-red-600/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <XCircle className="w-4 h-4 text-white" />
              <span>确认驳回公开申请</span>
            </button>
          ) : isApproveMode ? (
            <button
              type="button"
              onClick={handleApproveClick}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>确认审核通过并公开</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRejectClick}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <XCircle className="w-4 h-4 text-red-600" />
                <span>驳回公开申请</span>
              </button>
              
              <button
                type="button"
                onClick={handleApproveClick}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>审核通过并归档公开</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
