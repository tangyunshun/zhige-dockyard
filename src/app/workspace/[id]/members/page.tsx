"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import { Users, KeyRound, Copy, Trash2, ArrowUpRight, RefreshCw, ShieldAlert } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface Member {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
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

  useEffect(() => {
    if (workspaceId) {
      loadMembers();
    }
  }, [workspaceId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/members?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        
        // 找出当前用户的角色（身份比较，保留真实的用户 ID）
        const me = data.members.find((m: Member) => m.userId === localStorage.getItem("userId"));
        if (me) {
          setCurrentUserRole(me.role);
        }
      } else {
        const err = await res.json();
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
          expiresInDays: 7, // 默认 7 天
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
    toast.info(`正在请求将成员 "${targetName}" 移出当前工作空间...`, 1500);
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
        loadMembers(); // 重新加载
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

  const isOwner = currentUserRole === "OWNER";
  const isAdmin = currentUserRole === "ADMIN";
  const canManage = isOwner || isAdmin;

  return (
    <WorkspaceInternalLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* 顶部标题栏 */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
            <Users className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800">成员与协作管理</h2>
            <p className="text-xs text-slate-500 font-semibold">管理您的空间成员及获取专属邀请码</p>
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
            正在拉取协同成员...
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">空间内成员矩阵 ({members.length} 人)</span>
              <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded border font-bold">
                您的权限：{isOwner ? "👑 所有者" : isAdmin ? "🔧 管理员" : "👤 协同成员"}
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-left">
              {members.map((m) => {
                const isTargetOwner = m.role === "OWNER";
                const isTargetAdmin = m.role === "ADMIN";
                
                // 控制权限切换下拉的启用
                // 只有 OWNER 可以调整别人角色
                const canChangeTargetRole = isOwner && !isTargetOwner;
                
                // 控制删除按钮的启用
                // 管理员和所有者可以删除普通协同成员。管理员不能删除所有者和另一个管理员，所有者不能删除自己。
                const canRemoveTarget = canManage && !isTargetOwner && 
                  !(isAdmin && isTargetAdmin) && 
                  (localStorage.getItem("userId") !== m.userId);

                return (
                  <div key={m.userId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    
                    {/* 成员头像与邮箱 */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-[#3182ce] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                          <span>{m.name}</span>
                          {isTargetOwner ? (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-100 text-[9px] rounded font-bold">Owner</span>
                          ) : isTargetAdmin ? (
                            <span className="px-1.5 py-0.2 bg-purple-50 text-purple-600 border border-purple-100 text-[9px] rounded font-bold">Admin</span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 border text-[9px] rounded font-bold">Member</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{m.email}</p>
                      </div>
                    </div>

                    {/* 操作控制区 */}
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-[10px] text-slate-400 font-bold hidden md:inline">
                        加入时间: {new Date(m.joinedAt).toLocaleDateString("zh-CN")}
                      </div>

                      {/* 角色切换下拉框 */}
                      <select
                        value={m.role}
                        disabled={!canChangeTargetRole}
                        onChange={(e) => handleChangeRole(m.userId, e.target.value)}
                        className={`px-2.5 py-1 text-[11px] bg-slate-50 border rounded-lg focus:outline-none font-bold ${
                          canChangeTargetRole ? "border-slate-300 cursor-pointer text-slate-700" : "border-slate-200 text-slate-400 cursor-not-allowed"
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
                        <div className="w-7 h-7" /> // 占位
                      )}

                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </WorkspaceInternalLayout>
  );
}
