"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import { Users, KeyRound, Copy, Trash2, RefreshCw, Zap, X, ShieldAlert, Sliders } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface Member {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  monthlyTokenLimit?: number | null;
  monthlyTokenUsed?: number;
  quotaResetAt?: string | null;
}

export default function WorkspaceMembersPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationExpires, setInvitationExpires] = useState("");

  // 成员算力额度编辑 Modal State
  const [editingQuotaMember, setEditingQuotaMember] = useState<Member | null>(null);
  const [inputQuotaValue, setInputQuotaValue] = useState<string>("");
  const [savingQuota, setSavingQuota] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      loadMembers();
    }
  }, [workspaceId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      // 并行拉取基础成员信息与配额信息
      const [resMembers, resQuota] = await Promise.all([
        fetch(`/api/workspace/members?workspaceId=${workspaceId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`/api/workspace/members/quota?workspaceId=${workspaceId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      if (resMembers.ok) {
        const dataMembers = await resMembers.json();
        let list: Member[] = dataMembers.members || [];

        if (resQuota.ok) {
          const dataQuota = await resQuota.json();
          const quotaMap = new Map<string, any>();
          (dataQuota.members || []).forEach((qm: any) => quotaMap.set(qm.userId, qm));

          list = list.map((m) => {
            const q = quotaMap.get(m.userId);
            return {
              ...m,
              monthlyTokenLimit: q ? q.monthlyTokenLimit : null,
              monthlyTokenUsed: q ? q.monthlyTokenUsed : 0,
              quotaResetAt: q ? q.quotaResetAt : null,
            };
          });
        }

        setMembers(list);

        const me = list.find((m) => m.userId === localStorage.getItem("userId"));
        if (me) {
          setCurrentUserRole(me.role);
        }
      } else {
        const err = await resMembers.json();
        throw new Error(err.error || "获取成员列表失败");
      }
    } catch (error: any) {
      console.error("加载成员失败:", error);
      toast.error(error.message || "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 生成邀请码
  const handleGenerateCode = async () => {
    try {
      setGeneratingCode(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          workspaceId,
          expiresInDays: 7,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInvitationCode(data.invitationCode);
        if (data.expiresAt) {
          setInvitationExpires(new Date(data.expiresAt).toLocaleDateString("zh-CN"));
        }
        toast.success("邀请码生成成功，快去复制发给您的协同成员吧！");
      } else {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }
    } catch (error: any) {
      console.error("生成邀请码失败:", error);
      toast.error(error.message || "生成失败，只有所有者或管理员有权生成");
    } finally {
      setGeneratingCode(false);
    }
  };

  // 复制文本
  const handleCopyText = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  // 移出成员
  const handleRemoveMember = async (targetUserId: string, targetName: string) => {
    try {
      const authToken = getAuthToken();
      const res = await fetch(
        `/api/workspace/members?workspaceId=${workspaceId}&targetUserId=${targetUserId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (res.ok) {
        toast.success("已成功将该成员移出工作空间");
        loadMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "移出失败");
      }
    } catch (error: any) {
      console.error("移出成员失败:", error);
      toast.error(error.message || "操作失败");
    }
  };

  // 角色变更
  const handleChangeRole = async (targetUserId: string, newRole: string) => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          workspaceId,
          targetUserId,
          newRole,
        }),
      });

      if (res.ok) {
        toast.success("成员角色调整成功");
        loadMembers();
      } else {
        const err = await res.json();
        throw new Error(err.error || "调整角色失败");
      }
    } catch (error: any) {
      console.error("调整角色失败:", error);
      toast.error(error.message || "操作失败，只有所有者有权调整角色");
    }
  };

  // 提交成员算力额度变更 (POST /api/workspace/members/quota)
  const handleSaveQuota = async (isClear: boolean = false) => {
    if (!editingQuotaMember) return;

    if (editingQuotaMember.role === "OWNER" || editingQuotaMember.role === "ADMIN") {
      toast.error("不可为空间所有者或管理员分配额度");
      return;
    }

    try {
      setSavingQuota(true);
      const authToken = getAuthToken();
      const payloadLimit = isClear ? null : (inputQuotaValue === "" ? null : Number(inputQuotaValue));

      const res = await fetch("/api/workspace/members/quota", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          workspaceId,
          targetUserId: editingQuotaMember.userId,
          monthlyTokenLimit: payloadLimit,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || "算力额度更新成功");
        setEditingQuotaMember(null);
        loadMembers();
      } else {
        toast.error(data.error || "配置失败");
      }
    } catch (error: any) {
      console.error("配置算力失败:", error);
      toast.error(error.message || "请求失败");
    } finally {
      setSavingQuota(false);
    }
  };

  const isOwner = currentUserRole === "OWNER";
  const isAdmin = currentUserRole === "ADMIN";
  const canManage = isOwner || isAdmin;

  return (
    <WorkspaceInternalLayout>
      <div className="max-w-4xl mx-auto space-y-6 text-left font-sans">
        
        {/* 顶部标题栏 */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
            <Users className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800">成员与算力分配</h2>
            <p className="text-xs text-slate-500 font-semibold">管理您的空间成员、配置个人月度算力额度及生成邀请码</p>
          </div>
        </div>

        {/* 邀请板块 */}
        {canManage && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-left">
            <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <KeyRound className="w-4 h-4 text-indigo-500" />
              引进新成员
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <button
                onClick={handleGenerateCode}
                disabled={generatingCode}
                className="zg-btn zg-btn-primary px-4 py-2.5 h-10 text-xs rounded-lg cursor-pointer shrink-0 flex items-center gap-1"
              >
                {generatingCode ? "正在生成..." : "🔑 生成专属邀请码"}
              </button>

              {invitationCode && (
                <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 bg-slate-50 border rounded-lg px-3 py-2 text-xs font-mono text-slate-700 flex items-center justify-between gap-3">
                    <span className="truncate">邀请码: <strong className="text-indigo-600 font-black">{invitationCode}</strong> (有效期至 {invitationExpires})</span>
                    <button
                      onClick={() => handleCopyText(invitationCode, "邀请码已成功复制")}
                      className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer"
                    >
                      复制邀请码
                    </button>
                  </div>
                  
                  <button
                    onClick={() => {
                      const joinUrl = `${window.location.origin}/workspace-hub?inviteCode=${invitationCode}`;
                      handleCopyText(joinUrl, "邀请链接已复制到剪贴板");
                    }}
                    className="bg-white px-3.5 py-2 h-10 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制链接</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 成员列表看板 */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 font-bold border">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            正在拉取协同成员与算力额度...
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">空间内成员矩阵 ({members.length} 人)</span>
              <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 font-bold">
                您的当前权限：{isOwner ? "👑 所有者" : isAdmin ? "🔧 管理员" : "👤 协同成员"}
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-left">
              {members.map((m) => {
                const isTargetOwner = m.role === "OWNER";
                const isTargetAdmin = m.role === "ADMIN";
                const isTargetMember = m.role === "MEMBER";

                const canChangeTargetRole = isOwner && !isTargetOwner;
                const canRemoveTarget = canManage && !isTargetOwner && 
                  !(isAdmin && isTargetAdmin) && 
                  (localStorage.getItem("userId") !== m.userId);

                // 算力数据计算
                const limitVal = m.monthlyTokenLimit;
                const usedVal = m.monthlyTokenUsed || 0;
                const remainVal = limitVal !== null && limitVal !== undefined ? Math.max(0, limitVal - usedVal) : null;

                return (
                  <div key={m.userId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    
                    {/* 成员头像与邮箱 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-[#3182ce] flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span>{m.name}</span>
                          {isTargetOwner ? (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] rounded font-bold">Owner</span>
                          ) : isTargetAdmin ? (
                            <span className="px-1.5 py-0.2 bg-purple-50 text-purple-600 border border-purple-200 text-[9px] rounded font-bold">Admin</span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 border text-[9px] rounded font-bold">Member</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{m.email}</p>
                      </div>
                    </div>

                    {/* 成员月度算力名牌区块 (大厂风信息区) */}
                    <div className="flex items-center gap-3 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                      <div className="flex flex-col text-[10px]">
                        <span className="text-slate-400 font-bold">本月额度 / 已用</span>
                        <span className="font-mono font-black text-slate-700">
                          {isTargetOwner || isTargetAdmin ? (
                            <span className="text-emerald-600">无限制 (共享算力池)</span>
                          ) : limitVal === null ? (
                            <span className="text-slate-500">不限额 ({usedVal} 已用)</span>
                          ) : (
                            <span>{limitVal} / <span className="text-blue-600">{usedVal}</span></span>
                          )}
                        </span>
                      </div>

                      {isTargetMember && limitVal !== null && (
                        <div className="flex flex-col text-[10px] border-l border-slate-200 pl-3">
                          <span className="text-slate-400 font-bold">剩余算力</span>
                          <span className={`font-mono font-black ${remainVal === 0 ? "text-red-500" : "text-emerald-600"}`}>
                            {remainVal} 点
                          </span>
                        </div>
                      )}

                      {/* 配额按钮 */}
                      {canManage && isTargetMember && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuotaMember(m);
                            setInputQuotaValue(m.monthlyTokenLimit !== null && m.monthlyTokenLimit !== undefined ? String(m.monthlyTokenLimit) : "");
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 hover:border-blue-300 text-[10px] font-bold rounded-lg transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                          title="配置该成员个人月度算力额度"
                        >
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>配置算力</span>
                        </button>
                      )}
                    </div>

                    {/* 操作控制区 */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      {/* 角色切换下拉框 */}
                      <select
                        value={m.role}
                        disabled={!canChangeTargetRole}
                        onChange={(e) => handleChangeRole(m.userId, e.target.value as any)}
                        className={`px-2.5 py-1 text-[11px] bg-white border rounded-lg focus:outline-none font-bold ${
                          canChangeTargetRole ? "border-slate-300 cursor-pointer text-slate-700 hover:border-slate-400" : "border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        <option value="MEMBER">👤 协同成员</option>
                        <option value="ADMIN">🔧 管理员</option>
                        <option value="OWNER">👑 所有者</option>
                      </select>

                      {/* 移出空间按钮 */}
                      {canRemoveTarget ? (
                        <button
                          onClick={() => handleRemoveMember(m.userId, m.name)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg cursor-pointer transition-colors"
                          title="移出此空间"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="w-7 h-7" />
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* 成员个人算力额度设置 Modal */}
      {editingQuotaMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-left font-sans space-y-4">
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm">配置成员个人月度算力额度</h3>
                  <p className="text-[11px] text-blue-100">设定协同成员当月允许消费的空间算力点上限</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuotaMember(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>目标成员: <strong className="text-slate-900">{editingQuotaMember.name}</strong></span>
                <span className="text-[11px] text-slate-500 font-mono">ID: {editingQuotaMember.userId.slice(0, 8)}...</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700">
                  本月算力上限 (Token Limit)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={inputQuotaValue}
                    onChange={(e) => setInputQuotaValue(e.target.value)}
                    placeholder="留空表示不限额 (使用空间全局余额)"
                    className="w-full h-11 px-3.5 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                  <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">算力点</span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  💡 提示：留空或设为 0 表示不设置个人独立限制，直接共享空间公共算力池。设置具体数值后，当月该成员消耗超过额度时将被系统自动阻断。自然月首日重置已用点数。
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveQuota(true)}
                  disabled={savingQuota}
                  className="px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  清空/不设限制
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuotaMember(null)}
                    className="px-4 h-10 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuota(false)}
                    disabled={savingQuota}
                    className="px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {savingQuota ? "保存中..." : "确认保存配额"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkspaceInternalLayout>
  );
}
