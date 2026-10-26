"use client";

/**
 * TransferOwnershipModal —— 企业空间「转让所有权」高危确认弹窗（自含流程）
 *
 * 流程：输入空间名确认 → 二次身份验证（StepUpAuthModal，场景 transfer_workspace）
 *      → POST /api/workspace/transfer-ownership（后端在事务内完成角色交接与成员余额清回共享池）。
 * 成功后回调 onSuccess 由父组件刷新成员列表与空间信息。
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import StepUpAuthModal from "@/components/StepUpAuthModal";

export interface TransferOwnershipModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  targetMember: { userId: string; name: string; email?: string | null } | null;
  onSuccess: () => void;
}

export default function TransferOwnershipModal({
  open,
  onClose,
  workspaceId,
  workspaceName,
  targetMember,
  onSuccess,
}: TransferOwnershipModalProps) {
  const toast = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [showStepUp, setShowStepUp] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open || !targetMember) return null;

  const reset = () => {
    setConfirmText("");
    setShowStepUp(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTransfer = async (verifyToken: string) => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/transfer-ownership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ workspaceId, targetUserId: targetMember.userId, verifyToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "空间所有权转让成功");
        reset();
        onSuccess();
        onClose();
      } else {
        toast.error(data.message || data.error || "转让失败，请稍后重试");
      }
    } catch {
      toast.error("网络异常，转让请求未完成，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <div className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 text-left space-y-5 relative overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 absolute top-0 left-0 right-0" />

          <div className="flex items-start gap-3.5 pt-1">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shadow-xs shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">转让空间所有权？</h3>
              <p className="text-xs text-slate-500 font-bold mt-1 leading-relaxed">
                将把「{workspaceName}」的所有权转让给管理员 {targetMember.name}
              </p>
            </div>
          </div>

          <div className="bg-amber-50/60 border border-amber-100/80 p-3.5 rounded-xl space-y-1.5 text-left">
            <p className="text-xs text-amber-800 font-bold leading-relaxed">转让后将发生以下变化：</p>
            <p className="text-[11px] text-amber-700 font-bold">• {targetMember.name} 将成为空间所有者，拥有全部管理权限</p>
            <p className="text-[11px] text-amber-700 font-bold">• 你将变为空间管理员，仍保留在空间内</p>
            <p className="text-[11px] text-amber-700 font-bold">• 共享算力池保留在空间内不受影响；对方名下的成员独立余额将自动退回共享池</p>
          </div>

          <div className="space-y-2 pt-1">
            <label className="text-xs font-black text-slate-700 block">
              请输入空间名称 <span className="text-red-500 font-black">{workspaceName}</span> 以确认操作
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={workspaceName}
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 font-bold"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2.5 justify-end pt-1">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              disabled={loading}
            >
              取消
            </button>
            <button
              onClick={() => {
                if (confirmText !== workspaceName) {
                  toast.error("输入的空间名称不匹配，请核对后重试");
                  return;
                }
                setShowStepUp(true);
              }}
              disabled={loading || confirmText !== workspaceName}
              className="px-4 py-2.5 text-xs font-black text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一步：身份验证
            </button>
          </div>
        </div>
      </div>

      <StepUpAuthModal
        isOpen={showStepUp}
        title="二次身份验证"
        message="转让空间所有权属于高危操作，请输入账号密码完成验证"
        action="transfer_workspace"
        onConfirm={(token) => handleTransfer(token)}
        onCancel={() => setShowStepUp(false)}
      />
    </>
  );
}
