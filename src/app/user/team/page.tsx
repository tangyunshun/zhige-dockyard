"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Crown,
  Shield,
  User as UserIcon,
  Copy,
  Ban,
  Trash2,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  ChevronDown,
  RefreshCw,
  Inbox,
  KeyRound,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

const ROLE_META: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  OWNER: { label: "所有者", badge: "bg-amber-50 text-amber-700 border border-amber-200", icon: <Crown className="w-3.5 h-3.5" /> },
  ADMIN: { label: "管理员", badge: "bg-blue-50 text-[#2b6cb0] border border-blue-200", icon: <Shield className="w-3.5 h-3.5" /> },
  MEMBER: { label: "成员", badge: "bg-slate-100 text-slate-600 border border-slate-200", icon: <UserIcon className="w-3.5 h-3.5" /> },
};

function roleMeta(role?: string) {
  return ROLE_META[role || "MEMBER"] || ROLE_META.MEMBER;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isInvitationValid(inv: any) {
  if (inv.status === "REVOKED") return false;
  if (!inv.expiresAt) return true;
  return new Date(inv.expiresAt).getTime() > Date.now();
}

export default function TeamManagementPage() {
  const toastCtx = useToast();
  const toast = (msg: string, type: "error" | "success" | "info" | "warning" = "info") => {
    if (type === "error") toastCtx.error(msg);
    else if (type === "success") toastCtx.success(msg);
    else if (type === "warning") toastCtx.warning(msg);
    else toastCtx.info(msg);
  };
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>("");
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>("MEMBER");

  // 邀请弹窗
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviteDays, setInviteDays] = useState(7);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string>("");

  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";
  const canChangeRole = currentRole === "OWNER";

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/list", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "获取工作空间失败", "error");
        setWorkspaces([]);
        return;
      }
      const enterpriseWs = (data.workspaces || []).filter((w: any) => w.type === "ENTERPRISE");
      setWorkspaces(enterpriseWs);
      if (enterpriseWs.length > 0) {
        const preferred = enterpriseWs.find((w: any) => w.role === "OWNER") || enterpriseWs[0];
        setSelectedWsId(preferred.id);
      } else {
        setSelectedWsId("");
      }
    } catch (e) {
      toast("网络错误，无法加载企业空间", "error");
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadMembers = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setMembersLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/workspace/members?workspaceId=${encodeURIComponent(wsId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "获取成员列表失败", "error");
        setMembers([]);
        setInvitations([]);
        return;
      }
      setMembers(data.members || []);
      setInvitations(data.activeInvitations || []);
    } catch (e) {
      toast("网络错误，无法加载成员", "error");
    } finally {
      setMembersLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (selectedWsId) {
      const ws = workspaces.find((w) => w.id === selectedWsId);
      setCurrentRole(ws?.role || "MEMBER");
      loadMembers(selectedWsId);
    } else {
      setMembers([]);
      setInvitations([]);
    }
  }, [selectedWsId, workspaces, loadMembers]);

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);

  const handleChangeRole = async (member: any, newRole: string) => {
    if (!canChangeRole) return;
    if (member.userId === selectedWs?.ownerId || member.role === "OWNER") {
      if (!window.confirm("确认将该成员设为「所有者」？这将转移空间所有权。")) return;
    } else if (!window.confirm(`确认将 ${member.name} 的角色调整为「${roleMeta(newRole).label}」？`)) {
      return;
    }
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: selectedWsId,
          targetUserId: member.userId,
          newRoles: [newRole],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "修改角色失败", "error");
        return;
      }
      toast("角色已更新", "success");
      loadMembers(selectedWsId);
    } catch (e) {
      toast("网络错误，操作失败", "error");
    }
  };

  const handleRemoveMember = async (member: any) => {
    if (!canManage) return;
    if (member.userId === selectedWs?.ownerId) {
      toast("不能移出空间所有者", "error");
      return;
    }
    if (!window.confirm(`确认将 ${member.name} 移出「${selectedWs?.name}」？该操作不可撤销。`)) return;
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/workspace/members?workspaceId=${encodeURIComponent(selectedWsId)}&targetUserId=${encodeURIComponent(member.userId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "移出成员失败", "error");
        return;
      }
      toast("成员已移出", "success");
      loadMembers(selectedWsId);
    } catch (e) {
      toast("网络错误，操作失败", "error");
    }
  };

  const handleGenerateInvite = async () => {
    if (!canManage) return;
    setInviteSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: selectedWsId,
          email: inviteEmail.trim() || null,
          expiresInDays: inviteDays,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "生成邀请码失败", "error");
        return;
      }
      toast("邀请码已生成", "success");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("MEMBER");
      setInviteDays(7);
      loadMembers(selectedWsId);
    } catch (e) {
      toast("网络错误，操作失败", "error");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleManageInvite = async (inv: any, action: "revoke" | "delete") => {
    if (!canManage) return;
    const verb = action === "revoke" ? "作废" : "删除";
    if (!window.confirm(`确认${verb}该邀请记录？${action === "revoke" ? "作废后邀请码立即失效。" : ""}`)) return;
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/invitation/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invitationId: inv.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "操作失败", "error");
        return;
      }
      toast(`邀请记录已${verb}`, "success");
      loadMembers(selectedWsId);
    } catch (e) {
      toast("网络错误，操作失败", "error");
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast("邀请码已复制", "success");
      setTimeout(() => setCopiedCode(""), 2000);
    } catch (e) {
      toast("复制失败，请手动选择", "error");
    }
  };

  const stats = {
    total: members.length,
    owners: members.filter((m) => m.role === "OWNER").length,
    admins: members.filter((m) => m.role === "ADMIN").length,
    pending: invitations.filter(isInvitationValid).length,
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>加载团队管理…</span>
        </div>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="团队管理"
          subtitle="管理企业工作空间的成员、角色与协作邀请"
          icon={<Users className="w-6 h-6" />}
        />
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">暂无企业工作空间</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            团队管理用于管理企业工作空间的成员与邀请。你当前尚未加入或创建任何企业工作空间。
            如需使用团队协作功能，请前往「工作空间」创建一个企业版空间。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="团队管理"
        subtitle="管理企业工作空间的成员、角色与协作邀请"
        icon={<Users className="w-6 h-6" />}
        action={
          <button
            onClick={() => { loadWorkspaces(); if (selectedWsId) loadMembers(selectedWsId); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 bg-white/70 border border-slate-200 hover:bg-white transition"
          >
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        }
      />

      {/* 空间选择 + 概览 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
            <Building2 className="w-4 h-4 text-[#3182ce]" /> 当前企业空间
          </div>
          {workspaces.length > 1 ? (
            <div className="relative flex-1 max-w-md">
              <select
                value={selectedWsId}
                onChange={(e) => setSelectedWsId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-800 focus:ring-2 focus:ring-[#3182ce]/30 focus:border-[#3182ce] outline-none"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}（{roleMeta(w.role).label}）
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <div className="text-base font-bold text-slate-800">{selectedWs?.name}</div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatCard label="成员总数" value={stats.total} icon={<Users className="w-4 h-4" />} />
          <StatCard label="所有者" value={stats.owners} icon={<Crown className="w-4 h-4" />} tone="amber" />
          <StatCard label="管理员" value={stats.admins} icon={<Shield className="w-4 h-4" />} tone="blue" />
          <StatCard label="待接受邀请" value={stats.pending} icon={<Mail className="w-4 h-4" />} tone="green" />
        </div>
      </div>

      {/* 成员列表 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#3182ce]" /> 空间成员
            <span className="text-xs font-normal text-slate-400">（{members.length}）</span>
          </h2>
        </div>

        {membersLoading ? (
          <div className="py-10 text-center text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中…
          </div>
        ) : members.length === 0 ? (
          <EmptyHint icon={<Inbox className="w-8 h-8" />} text="该空间暂无成员记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 px-3 font-medium">成员</th>
                  <th className="py-2.5 px-3 font-medium">邮箱</th>
                  <th className="py-2.5 px-3 font-medium">角色</th>
                  <th className="py-2.5 px-3 font-medium">加入时间</th>
                  {canManage && <th className="py-2.5 px-3 font-medium text-right">操作</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const meta = roleMeta(m.role);
                  const isSelf = m.userId === selectedWs?.ownerId;
                  return (
                    <tr key={m.userId} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {(m.name || "U").slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 flex items-center gap-2">
                              {m.name}
                              {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">空间创建者</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{m.email}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{formatDate(m.joinedAt)}</td>
                      {canManage && (
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-2">
                            {canChangeRole && !isSelf ? (
                              <div className="relative">
                                <select
                                  value={m.role}
                                  onChange={(e) => handleChangeRole(m, e.target.value)}
                                  className="appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-7 text-xs text-slate-700 focus:ring-2 focus:ring-[#3182ce]/30 focus:border-[#3182ce] outline-none"
                                >
                                  <option value="MEMBER">成员</option>
                                  <option value="ADMIN">管理员</option>
                                  <option value="OWNER">所有者</option>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                            {!isSelf && (
                              <button
                                onClick={() => handleRemoveMember(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-600 bg-red-50 hover:bg-red-100 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 移出
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 邀请管理 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#3182ce]" /> 协作邀请
            <span className="text-xs font-normal text-slate-400">（{invitations.length}）</span>
          </h2>
          {canManage && (
            <button
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:opacity-90 transition shadow-sm"
            >
              <UserPlus className="w-4 h-4" /> 生成邀请码
            </button>
          )}
        </div>

        {!canManage && (
          <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" /> 你当前为该空间的「成员」角色，仅可查看成员与邀请，无管理权限。
          </div>
        )}

        {invitations.length === 0 ? (
          <EmptyHint icon={<Mail className="w-8 h-8" />} text="暂无邀请记录，点击右上角生成邀请码邀请协作成员" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {invitations.map((inv) => {
              const valid = isInvitationValid(inv);
              const role = roleMeta(inv.role);
              return (
                <div key={inv.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${role.badge}`}>
                        {role.icon} {role.label}
                      </span>
                      {valid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="w-3.5 h-3.5" /> 有效
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                          <XCircle className="w-3.5 h-3.5" /> {inv.status === "REVOKED" ? "已作废" : "已过期"}
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyCode(inv.code)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                          title="复制邀请码"
                        >
                          {copiedCode === inv.code ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          复制
                        </button>
                        {valid ? (
                          <button
                            onClick={() => handleManageInvite(inv, "revoke")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 transition"
                            title="作废邀请"
                          >
                            <Ban className="w-3.5 h-3.5" /> 作废
                          </button>
                        ) : (
                          <button
                            onClick={() => handleManageInvite(inv, "delete")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-600 bg-red-50 hover:bg-red-100 transition"
                            title="删除记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 删除
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="px-2 py-1 rounded bg-slate-100 text-sm font-mono text-slate-700 tracking-wider">{inv.code}</code>
                    {inv.email && <span className="text-xs text-slate-500">限定邮箱：{inv.email}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 过期：{formatDate(inv.expiresAt)}</span>
                    <span>已加入 {inv.joinedCount || 0} 人</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 生成邀请弹窗 */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInviteOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">生成协作邀请码</h3>
            <p className="text-sm text-slate-500 mb-5">邀请码可用于让其他用户加入「{selectedWs?.name}」。</p>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">邀请邮箱（可选）</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="留空则任何人可凭码加入"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#3182ce]/30 focus:border-[#3182ce] outline-none mb-4"
            />

            <label className="block text-sm font-medium text-slate-700 mb-1.5">赋予角色</label>
            <div className="flex gap-2 mb-4">
              {(["MEMBER", "ADMIN"] as const).map((r) => {
                const meta = roleMeta(r);
                const active = inviteRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
                      active ? `${meta.badge} ring-2 ring-offset-1 ring-[#3182ce]/30` : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                    }`}
                  >
                    {meta.icon} {meta.label}
                  </button>
                );
              })}
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">有效天数</label>
            <div className="flex gap-2 mb-6">
              {[3, 7, 15, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setInviteDays(d)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${
                    inviteDays === d ? "border-[#3182ce] bg-[#3182ce]/10 text-[#2b6cb0] font-medium" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                  }`}
                >
                  {d} 天
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInviteOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleGenerateInvite}
                disabled={inviteSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:opacity-90 disabled:opacity-60 transition shadow-sm"
              >
                {inviteSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                生成邀请码
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageHeader({ title, subtitle, icon, action }: { title: string; subtitle: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-lg shrink-0">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, icon, tone = "slate" }: { label: string; value: number; icon: React.ReactNode; tone?: "slate" | "amber" | "blue" | "green" }) {
  const toneCls = {
    slate: "bg-slate-50 text-slate-500",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-[#2b6cb0]",
    green: "bg-green-50 text-green-600",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneCls}`}>{icon}</span>
      </div>
      <div className="text-2xl font-black text-slate-800 mt-1.5">{value}</div>
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center text-slate-400">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3 text-slate-400">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
