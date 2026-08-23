"use client";

import React from "react";
import { Users, Building2, Clock, ArrowRight } from "lucide-react";

interface JoinEnterpriseModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitationCode: string;
  setInvitationCode: (code: string) => void;
  invitationInfo: any;
  setInvitationInfo: (info: any) => void;
  verifyingCode: boolean;
  joiningCode: boolean;
  verifyInvitation: (code: string) => void;
  onJoin: () => void;
}

export default function JoinEnterpriseModal({
  isOpen,
  onClose,
  invitationCode,
  setInvitationCode,
  invitationInfo,
  setInvitationInfo,
  verifyingCode,
  joiningCode,
  verifyInvitation,
  onJoin,
}: JoinEnterpriseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-200">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold"
          disabled={joiningCode}
        >
          ×
        </button>

        {/* 标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-black text-slate-800">加入已有空间</h2>
          </div>
          <p className="text-xs text-slate-500">
            请输入同事分享的邀请码，或点击分享链接自动填充
          </p>
        </div>

        {/* 邀请码输入 */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-700 mb-2">
            邀请码 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={invitationCode}
            onChange={(e) => {
              const code = e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
              setInvitationCode(code);
              if (code.length === 8) {
                verifyInvitation(code);
              } else {
                setInvitationInfo(null);
              }
            }}
            placeholder="请输入 8 位邀请码"
            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 outline-none transition-all text-center text-lg font-mono tracking-widest uppercase"
            maxLength={8}
            disabled={verifyingCode || joiningCode}
          />
          {verifyingCode && (
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
              <span>正在验证邀请码...</span>
            </div>
          )}
        </div>

        {/* 邀请信息展示 */}
        {invitationInfo && (
          <div className="mb-6 p-4 bg-[#10b981]/5 rounded-xl border border-[#10b981]/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800">
                  {invitationInfo.workspace?.name}
                </div>
                <div className="text-xs text-slate-500">
                  {invitationInfo.workspace?.memberCount} 名成员 ·{" "}
                  {invitationInfo.role === "ADMIN" ? "管理员" : "成员"}
                </div>
              </div>
            </div>
            {invitationInfo.expiresAt && (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>
                  有效期至{" "}
                  {new Date(invitationInfo.expiresAt).toLocaleDateString(
                    "zh-CN",
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all border-none cursor-pointer"
            disabled={joiningCode}
          >
            取消
          </button>
          <button
            onClick={onJoin}
            disabled={!invitationInfo || joiningCode}
            className="flex-1 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none cursor-pointer"
          >
            {joiningCode ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>正在加入...</span>
              </>
            ) : (
              <>
                <span>确认加入</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
