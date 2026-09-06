"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ShieldAlert, AlertCircle, Send, Paperclip, FileText, Trash2 } from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface AppealAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface WorkspaceAppealModalProps {
  isOpen: boolean;
  workspace: {
    id: string;
    name: string;
    disabledUntil?: string | null;
    disabledReason?: string | null;
    disabledDuration?: string | null;
    appealStatus?: string;
    appealCount?: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WorkspaceAppealModal({
  isOpen,
  workspace,
  onClose,
  onSuccess,
}: WorkspaceAppealModalProps) {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [attachments, setAttachments] = useState<AppealAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 弹窗打开时锁死背景页面滚动，关闭时恢复
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !workspace || !mounted) return null;

  // 处理附件选择（最多 3 个材料）
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 3 - attachments.length;
    if (remainingSlots <= 0) {
      toast.error("最多仅支持上传 3 个证明材料");
      e.target.value = "";
      return;
    }

    if (files.length > remainingSlots) {
      toast.info(`最多支持上传 3 个材料，已自动选取前 ${remainingSlots} 个`);
    }

    const selectedFiles = files.slice(0, remainingSlots);

    selectedFiles.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`文件「${file.name}」超过 10MB 大小限制，已跳过`);
        return;
      }

      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => {
            if (prev.length >= 3) return prev;
            return [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                name: file.name,
                size: file.size,
                type: file.type || "image/png",
                // 仅保留适量长度的图片预览数据
                url: typeof reader.result === "string" ? reader.result.substring(0, 150000) : "",
              },
            ];
          });
        };
        reader.readAsDataURL(file);
      } else {
        // 非图片文档（Word, Excel, PDF 等）无需读取大体积 Base64，直接记录元数据
        setAttachments((prev) => {
          if (prev.length >= 3) return prev;
          return [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: file.name,
              size: file.size,
              type: file.type || "application/octet-stream",
              url: "",
            },
          ];
        });
      }
    });

    e.target.value = "";
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    if (submitting) return;

    const trimmed = appealReason.trim();
    if (!trimmed) {
      toast.error("请填写申诉理由与整改说明");
      return;
    }
    if (trimmed.length < 5) {
      toast.error(`申诉理由不能少于 5 个字（当前已输入 ${trimmed.length} 字）`);
      return;
    }
    if (trimmed.length > 100) {
      toast.error(`申诉理由超出限制，最多允许输入 100 个字（当前已输入 ${trimmed.length} 字）`);
      return;
    }

    try {
      setSubmitting(true);
      const token = getAuthToken();
      const res = await fetch("/api/workspace/appeal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          workspaceId: workspace.id,
          appealReason: trimmed,
          contactInfo: contactInfo.trim() || undefined,
          attachments: attachments.length > 0 ? attachments.map((a) => ({
            name: a.name,
            size: a.size,
            type: a.type,
            url: a.url || "",
          })) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({ success: false, error: "服务器响应格式异常" }));
      if (!res.ok || !data.success) {
        toast.error(data.error || "申诉提交失败，请稍后重试");
        return;
      }

      toast.success("解封申诉已成功提交至风控与审核中心，请耐心等待审查结果！");
      onSuccess();
      onClose();
    } catch (err) {
      console.error("提交申诉出错:", err);
      toast.error("网络请求失败，请检查网络连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[min(620px,88vh)] overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150 text-left relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：精致紧凑 */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50/80 to-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
              <ShieldAlert className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 leading-tight">工作空间解封申诉</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">工单将直达平台风控合规团队人工审核</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容：全视口完整呈现，支持小屏自适应平滑滚动 */}
        <form noValidate onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
            {/* 空间受限信息卡片（精致紧凑排版） */}
            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 font-bold shrink-0">目标空间:</span>
                  <span className="font-black text-slate-900 truncate">{workspace.name}</span>
                </div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded shrink-0">
                  严格限 1 次申诉
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold shrink-0">管控原因:</span>
                <span className="font-bold text-red-600 truncate max-w-[280px]">
                  {workspace.disabledReason || "违反平台运营与合规规范"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold shrink-0">管控期限:</span>
                <span className="font-mono font-bold text-amber-700">
                  {workspace.disabledUntil
                    ? `至 ${new Date(workspace.disabledUntil).toLocaleString("zh-CN", { hour12: false })} 止`
                    : "永久管控（需人工审核解封）"}
                </span>
              </div>
            </div>

            {/* 规则提示 */}
            <div className="px-2.5 py-1.5 rounded-lg bg-amber-50/90 border border-amber-200/70 text-[11px] text-amber-900 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>请如实陈述申诉理由与整改措施，经风控团队人工核验驳回后将无法再次提交。</span>
            </div>

            {/* 申诉理由输入框 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-black text-slate-700">
                  申诉理由与整改说明 <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    appealReason.trim().length > 100
                      ? "text-red-500"
                      : appealReason.length > 0 && appealReason.trim().length < 5
                      ? "text-amber-600"
                      : "text-slate-400"
                  }`}
                >
                  {appealReason.length}/100 字 (最少 5 字)
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={100}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="请详细说明触发管控的背景原因、误判理由或您已采取的整改措施（最少5字，最多100字）..."
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white resize-none transition-all placeholder:text-slate-400 leading-relaxed"
              />
              {appealReason.length > 0 && appealReason.trim().length < 5 && (
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                  还需输入至少 {5 - appealReason.trim().length} 个字
                </p>
              )}
            </div>

            {/* 证明材料与附件（选填，最多 3 个） */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-black text-slate-700">
                  证明材料与附件（选填，最多 3 个）
                </label>
                <span className="text-[11px] font-mono font-bold text-slate-400">
                  {attachments.length}/3
                </span>
              </div>

              {attachments.length < 3 && (
                <label className="flex items-center justify-center gap-2 px-3 py-1.5 border border-dashed border-slate-300 hover:border-[#3182ce] bg-slate-50/80 hover:bg-blue-50/40 rounded-xl cursor-pointer transition-all">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium">
                    点击添加证明材料（截图、Word、表格等，单文件≤10MB）
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={handleFilesSelected}
                    className="hidden"
                  />
                </label>
              )}

              {attachments.length > 0 && (
                <div className="space-y-1 mt-1.5 max-h-24 overflow-y-auto pr-0.5">
                  {attachments.map((file, idx) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {file.type.startsWith("image/") && file.url ? (
                          <img
                            src={file.url}
                            alt={file.name}
                            className="w-5 h-5 object-cover rounded shrink-0 border border-slate-200"
                          />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                        )}
                        <span className="font-bold text-slate-700 truncate max-w-[220px]" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                        title="移除该材料"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 联系方式 */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">
                申诉人联系电话 / 邮箱（选填）
              </label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="便于风控专员核验时直接与您沟通（留空则使用注册联系方式）"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* 底部按钮栏：始终常驻可视区底部，显式响应点击 */}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/95 shrink-0 z-10">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e)}
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:brightness-105 active:scale-95 rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {submitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>提交审核工单</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
