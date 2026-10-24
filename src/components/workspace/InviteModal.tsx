"use client";

/**
 * InviteModal —— 工作空间「生成专属邀请码 / 邀请链接」弹窗（展示层）
 *
 * 来源区块：WorkspaceInternalLayoutV3.tsx 的 {showGenerateInviteModal && (...)} 整段 JSX
 * 拆分日期：2026-10-25（V3 拆分第 3 步）
 *
 * 本组件只做展示：邀请有效期/角色状态（inviteExpiresInDays / inviteRole 及其 setter）、
 * 生成动作（handleTabGenerateCode / generatingCode）、生成结果（invitationCode /
 * invitationExpires）均由父组件 V3 通过 props 传入；关闭动作统一走 onClose；
 * 复制提示用的 toast 与图标在子组件内 re-import（非空间状态）。
 */

import { KeyRound, Copy } from "lucide-react";
import { useToast } from "@/components/Toast";

export interface InviteModalProps {
  onClose: () => void;
  inviteExpiresInDays: number;
  setInviteExpiresInDays: (v: number) => void;
  inviteRole: "MEMBER" | "ADMIN";
  setInviteRole: (v: "MEMBER" | "ADMIN") => void;
  generatingCode: boolean;
  handleTabGenerateCode: () => void;
  invitationCode: string;
  invitationExpires: string;
}

export default function InviteModal(props: InviteModalProps) {
  const {
    onClose,
    inviteExpiresInDays,
    setInviteExpiresInDays,
    inviteRole,
    setInviteRole,
    generatingCode,
    handleTabGenerateCode,
    invitationCode,
    invitationExpires,
  } = props;
  const toast = useToast();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">生成专属邀请码</h2>
              <p className="text-xs text-slate-500">生成邀请码或分享链接，邀请同事加入当前工作空间</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">邀请有效期</label>
            <select
              value={inviteExpiresInDays}
              onChange={(e) => setInviteExpiresInDays(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] outline-none text-xs bg-white"
            >
              <option value={1}>1 天</option>
              <option value={3}>3 天</option>
              <option value={7}>7 天</option>
              <option value={15}>15 天</option>
              <option value={30}>30 天</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">邀请角色</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInviteRole("MEMBER")}
                className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                  inviteRole === "MEMBER"
                    ? "border-[#3182ce] bg-[#3182ce]/10 text-[#3182ce]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                普通成员
              </button>
              <button
                type="button"
                onClick={() => setInviteRole("ADMIN")}
                className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                  inviteRole === "ADMIN"
                    ? "border-[#2b6cb0] bg-[#2b6cb0]/10 text-[#2b6cb0]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                管理员
              </button>
            </div>
          </div>

          <button
            onClick={handleTabGenerateCode}
            disabled={generatingCode}
            className="w-full py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none cursor-pointer"
          >
            {generatingCode ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>正在生成邀请码...</span>
              </>
            ) : (
              <span>生成邀请码</span>
            )}
          </button>

          {/* 生成结果 */}
          {invitationCode && (
            <div
              id="modal-tab-invite-result"
              className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 space-y-3 ring-2 ring-indigo-400/40 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 scroll-mt-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-semibold">邀请码</span>
                <span className="text-base font-mono font-extrabold text-indigo-600">{invitationCode}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-semibold">有效期至 {invitationExpires || `${inviteExpiresInDays} 天后`}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const promoText = `【知阁·舟坊】项目协同邀请 🚢\n\n您已被邀请加入当前的项目工作空间参与协同研发！\n\n🔑 专属协同邀请码：${invitationCode}\n🔗 一键快捷加入通道：${window.location.origin}/workspace-hub?inviteCode=${invitationCode}\n\n—— 知阁·舟坊：高效、自动化的现代化一站式全栈架构与协同开发平台`;
                    navigator.clipboard.writeText(promoText);
                    toast.success("邀请码已成功复制，请转发给团队成员");
                  }}
                  className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold cursor-pointer text-xs"
                >
                  复制邀请码
                </button>
                <button
                  onClick={() => {
                    const joinUrl = `${window.location.origin}/workspace-hub?inviteCode=${invitationCode}`;
                    const promoLinkText = `【知阁·舟坊】项目协同邀请函\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n专属快捷加入链接（点击即入）：${joinUrl}\n\n—— 知阁·舟坊：高效、自动化的团队研发协同中枢，让开发化繁为简。`;
                    navigator.clipboard.writeText(promoLinkText);
                    toast.success("邀请链接已成功复制，请转发给团队成员");
                  }}
                  className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg font-bold cursor-pointer text-xs flex items-center justify-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制链接</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer border-none transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
