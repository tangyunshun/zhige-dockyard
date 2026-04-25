"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import {
  X,
  Building2,
  Users,
  QrCode,
  Copy,
  Check,
  Link as LinkIcon,
  Mail,
  Clock,
  UserPlus,
  Shield,
  CheckCircle,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  memberCount: number;
  members: Array<{
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    role: string;
  }>;
  isOwner: boolean;
}

interface Invitation {
  id: string;
  code: string;
  workspaceId: string;
  workspaceName: string;
  email?: string;
  role: string;
  expiresAt?: string;
  createdAt: string;
}

interface ShareWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareWorkspaceModal({ isOpen, onClose }: ShareWorkspaceModalProps) {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);

  useEffect(() => {
    if (isOpen) {
      loadShareableWorkspaces();
    }
  }, [isOpen]);

  const loadShareableWorkspaces = async () => {
    try {
      // 先获取用户信息
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        toast.error("请先登录");
        return;
      }

      const userData = await res.json();
      const userId = userData.user.id;
      
      const workspacesRes = await fetch("/api/workspace/shareable-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!workspacesRes.ok) {
        throw new Error(workspacesRes.statusText || "加载失败");
      }

      const data = await workspacesRes.json();
      setWorkspaces(data.workspaces);
      setInvitations(data.invitations);

      if (data.workspaces.length > 0) {
        setSelectedWorkspace(data.workspaces[0].id);
      }
    } catch (error) {
      console.error("加载可分享空间失败:", error);
      toast.error("加载失败");
    }
  };

  const handleGenerateInvitation = async () => {
    if (!selectedWorkspace) {
      toast.error("请选择要分享的空间");
      return;
    }

    try {
      setGenerating(true);
      
      // 获取用户 ID
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        toast.error("请先登录");
        return;
      }
      const userData = await res.json();
      const userId = userData.user.id;

      const generateRes = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          email: showAdvanced ? inviteEmail : null,
          expiresInDays: showAdvanced ? expiresInDays : null,
        }),
      });

      const data = await generateRes.json();
      if (!generateRes.ok) {
        throw new Error(data.error || "生成失败");
      }

      toast.success("邀请码生成成功");
      await loadShareableWorkspaces();
    } catch (error) {
      console.error("生成邀请码失败:", error);
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyInvitation = (code: string, invitationUrl: string) => {
    const text = `邀请您加入工作空间！\n\n邀请码：${code}\n\n点击链接加入：${invitationUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("邀请码已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/workspace-hub?invitationCode=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("链接已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all z-10"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>

        {/* 标题 */}
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            分享工作空间
          </h2>
          <p className="text-slate-600">
            生成邀请码或分享链接，邀请同事加入您的工作空间
          </p>
        </div>

        {/* 内容区 */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：选择空间并生成邀请码 */}
          <div className="space-y-6">
            {/* 选择空间 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#3182ce]" />
                选择要分享的空间
              </h3>

              {workspaces.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>暂无可分享的空间</p>
                  <p className="text-sm mt-1">请先创建企业空间或成为管理员</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      onClick={() => setSelectedWorkspace(ws.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedWorkspace === ws.id
                          ? "border-[#3182ce] bg-[#3182ce]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-800">
                              {ws.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {ws.memberCount} 名成员 · {ws.isOwner ? "所有者" : "管理员"}
                            </div>
                          </div>
                        </div>
                        {selectedWorkspace === ws.id && (
                          <div className="w-6 h-6 rounded-full bg-[#3182ce] flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 高级选项 */}
              {workspaces.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm font-bold text-[#3182ce] hover:text-[#2563eb] flex items-center gap-1"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{showAdvanced ? "隐藏" : "显示"}高级选项</span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-4 p-4 bg-white rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          指定成员邮箱（可选）
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="example@company.com"
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          填写后仅该邮箱的用户可使用此邀请码
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          邀请角色
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setInviteRole("MEMBER")}
                            className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                              inviteRole === "MEMBER"
                                ? "border-[#3182ce] bg-[#3182ce]/10 text-[#3182ce]"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            普通成员
                          </button>
                          <button
                            onClick={() => setInviteRole("ADMIN")}
                            className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                              inviteRole === "ADMIN"
                                ? "border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            管理员
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          有效期
                        </label>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <select
                            value={expiresInDays}
                            onChange={(e) =>
                              setExpiresInDays(Number(e.target.value))
                            }
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
                          >
                            <option value={1}>1 天</option>
                            <option value={3}>3 天</option>
                            <option value={7}>7 天</option>
                            <option value={15}>15 天</option>
                            <option value={30}>30 天</option>
                            <option value={0}>永久有效</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 生成按钮 */}
              {workspaces.length > 0 && (
                <button
                  onClick={handleGenerateInvitation}
                  disabled={generating}
                  className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>生成邀请码</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 右侧：已生成的邀请码列表 */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#10b981]" />
              已生成的邀请码
            </h3>

            {invitations.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <QrCode className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>暂无邀请码</p>
                <p className="text-sm mt-1">点击左侧生成邀请码</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {invitations.map((inv) => {
                  const invitationUrl = `${window.location.origin}/workspace-hub?invitationCode=${inv.code}`;
                  return (
                    <div
                      key={inv.id}
                      className="p-4 bg-white rounded-xl border border-slate-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-lg font-black text-slate-800 font-mono tracking-widest">
                            {inv.code}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            空间：{inv.workspaceName}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                              inv.role === "ADMIN"
                                ? "bg-[#f59e0b]/10 text-[#f59e0b]"
                                : "bg-[#3182ce]/10 text-[#3182ce]"
                            }`}
                          >
                            {inv.role === "ADMIN" ? "管理员" : "成员"}
                          </span>
                        </div>
                      </div>

                      {inv.email && (
                        <div className="mb-3 text-xs text-slate-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>指定用户：{inv.email}</span>
                        </div>
                      )}

                      {inv.expiresAt && (
                        <div className="mb-3 text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            有效期至{" "}
                            {new Date(inv.expiresAt).toLocaleDateString(
                              "zh-CN",
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyCode(inv.code)}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedCode === inv.code ? "已复制" : "复制邀请码"}
                        </button>
                        <button
                          onClick={() => handleCopyLink(inv.code)}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-1"
                        >
                          <LinkIcon className="w-3 h-3" />
                          {copiedCode === inv.code ? "已复制" : "复制链接"}
                        </button>
                        <button
                          onClick={() =>
                            handleCopyInvitation(inv.code, invitationUrl)
                          }
                          className="flex-1 px-3 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-bold rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          复制全部
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
