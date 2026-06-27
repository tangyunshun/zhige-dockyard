"use client";

import React from "react";
import { Users, Building2, AlertTriangle, Settings, ChevronRight, FileText, Copy, ExternalLink, Share2 } from "lucide-react";
import { Workspace } from "@/hooks/useWorkspaceHubData";

interface ShareWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  invitations: any[];
  selectedWorkspace: string;
  setSelectedWorkspace: (id: string) => void;
  generating: boolean;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: "MEMBER" | "ADMIN";
  setInviteRole: (role: "MEMBER" | "ADMIN") => void;
  expiresInDays: number;
  setExpiresInDays: (days: number) => void;
  copiedCode: string | null;
  handleGenerateInvitation: () => void;
  handleCopyCode: (code: string) => void;
  handleCopyLink: (code: string) => void;
  handleCopyInvitation: (code: string, url: string) => void;
}

export default function ShareWorkspaceModal({
  isOpen,
  onClose,
  workspaces,
  invitations,
  selectedWorkspace,
  setSelectedWorkspace,
  generating,
  showAdvanced,
  setShowAdvanced,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  expiresInDays,
  setExpiresInDays,
  copiedCode,
  handleGenerateInvitation,
  handleCopyCode,
  handleCopyLink,
  handleCopyInvitation,
}: ShareWorkspaceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">分享空间</h2>
              <p className="text-xs text-slate-500">
                生成邀请码或分享链接，邀请同事加入您的空间
              </p>
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
        <div className="p-6 space-y-6">
          {/* 空间选择 */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#3182ce]" />
              选择要分享的空间
            </h3>
            <div className="space-y-2">
              {workspaces.map((workspace) => (
                <label
                  key={workspace.id}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedWorkspace === workspace.id
                      ? "border-[#10b981] bg-[#10b981]/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="radio"
                      name="workspace"
                      value={workspace.id}
                      checked={selectedWorkspace === workspace.id}
                      onChange={(e) => setSelectedWorkspace(e.target.value)}
                      className="w-4 h-4 text-[#10b981] focus:ring-[#10b981]"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-800">
                        {workspace.name || "未命名空间"}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {workspace.description || "暂无描述"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="text-slate-500">成员：</span>
                    <span className="text-[#10b981]">
                      {workspace.memberCount || 0}人
                    </span>
                  </div>
                </label>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">暂无可分享的空间</p>
                </div>
              )}
            </div>
          </div>

          {/* 高级选项 */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#3182ce] transition-all bg-transparent border-none cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>高级选项</span>
              <ChevronRight
                className={`w-4 h-4 transition-transform ${
                  showAdvanced ? "rotate-90" : ""
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    指定成员邮箱（可选）
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="example@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] outline-none text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    邀请角色
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteRole("MEMBER")}
                      className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                        inviteRole === "MEMBER"
                          ? "border-[#10b981] bg-[#10b981]/10 text-[#10b981]"
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
                          ? "border-[#3182ce] bg-[#3182ce]/10 text-[#3182ce]"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      管理员
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    有效期
                  </label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] outline-none text-xs bg-white"
                  >
                    <option value={1}>1 天</option>
                    <option value={3}>3 天</option>
                    <option value={7}>7 天</option>
                    <option value={15}>15 天</option>
                    <option value={30}>30 天</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 生成按钮 */}
          <button
            onClick={handleGenerateInvitation}
            disabled={generating || workspaces.length === 0}
            className="w-full py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none cursor-pointer"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>正在生成邀请码...</span>
              </>
            ) : (
              <>
                <span>生成邀请码</span>
              </>
            )}
          </button>

          {/* 邀请码列表 */}
          {invitations.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3182ce]" />
                已生成的邀请码
              </h3>
              <div className="space-y-2">
                {invitations.map((invitation: any) => (
                  <div
                    key={invitation.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200"
                  >
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-mono font-bold text-[#10b981]">
                            {invitation.code}
                          </span>
                          {copiedCode === invitation.code && (
                            <span className="text-[10px] text-[#10b981] font-bold">
                              已复制
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          空间：{invitation.workspace?.name || "未知空间"}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>
                          角色：
                          <span className="font-bold text-slate-700">
                            {invitation.role === "ADMIN" ? "管理员" : "普通成员"}
                          </span>
                        </div>
                        <div>
                          过期时间：
                          <span
                            className={`font-bold ${
                              invitation.expiresAt &&
                              new Date(invitation.expiresAt) < new Date()
                                ? "text-red-600"
                                : "text-slate-700"
                            }`}
                          >
                            {invitation.expiresAt
                              ? new Date(invitation.expiresAt).toLocaleDateString()
                              : "永久有效"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 复制按钮组 */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleCopyCode(invitation.code)}
                        className="px-2 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>复制邀请码</span>
                      </button>
                      <button
                        onClick={() => handleCopyLink(invitation.code)}
                        className="px-2 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        <span>复制链接</span>
                      </button>
                      <button
                        onClick={() =>
                          handleCopyInvitation(
                            invitation.code,
                            `${window.location.origin}/workspace-hub?invitationCode=${invitation.code}`,
                          )
                        }
                        className="px-2 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 border-none cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>复制全部</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
