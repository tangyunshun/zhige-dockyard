"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Building2, 
  ArrowRight, 
  Settings, 
  MoreVertical, 
  Users, 
  LayoutGrid, 
  Sliders, 
  TrendingUp, 
  ArrowUpRight,
  LogOut,
  Trash2,
  FileCode,
  Zap,
  AlertCircle,
  ShieldAlert,
  Clock,
  XCircle,
} from "lucide-react";
import { Workspace } from "@/hooks/useWorkspaceHubData";
import WorkspaceAppealModal from "./WorkspaceAppealModal";

interface EnterpriseWorkspaceCardProps {
  workspace: Workspace;
  onEnter: (workspace: Workspace) => void;
  onManage: (id: string) => void;
  onInvite: (id: string) => void;
  onManageComponents: (id: string) => void;
  onEnterpriseSettings: (id: string) => void;
  onUpgradePackage: (id: string) => void;
  onViewStats: (id: string) => void;
  onDelete: (id: string) => void;
  onLeave?: (id: string) => void;
  onJoinClick?: () => void;
  onRefresh?: () => void;
}

export default function EnterpriseWorkspaceCard({
  workspace,
  onEnter,
  onManage,
  onInvite,
  onManageComponents,
  onEnterpriseSettings,
  onUpgradePackage,
  onViewStats,
  onDelete,
  onLeave,
  onJoinClick,
  onRefresh,
}: EnterpriseWorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const role = workspace.role || "MEMBER";
  const isOwner = role === "OWNER" || workspace.isOwner;
  const isAdmin = role === "ADMIN";
  const isComponentAdmin = false;
  const isMember = !isOwner && !isAdmin && !isComponentAdmin;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 获取次级功能按钮（高度 38px，字号 14px）
  const renderSecondaryAction = () => {
    if (isOwner || isAdmin) {
      return (
        <button
          onClick={() => onInvite(workspace.id)}
          className="zg-btn zg-btn-default px-4 h-[38px] text-sm font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 font-bold"
        >
          <Users className="w-4 h-4 text-slate-400" />
          <span>生成邀请码</span>
        </button>
      );
    }
    if (isComponentAdmin) {
      return (
        <button
          onClick={() => onManageComponents(workspace.id)}
          className="zg-btn zg-btn-default px-4 h-[38px] text-sm font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
        >
          <FileCode className="w-4 h-4 text-slate-400" />
          <span>组件管理</span>
        </button>
      );
    }
    // 非空间所有者/非管理员的其它情况（未加入空间）：显示“使用邀请码加入”实体按钮
    return (
      <button
        onClick={() => onJoinClick?.()}
        className="zg-btn zg-btn-default px-4 h-[38px] text-sm font-semibold rounded-lg border border-amber-200/80 bg-white hover:bg-amber-50/20 text-[#d97706] hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 font-bold"
      >
        <Users className="w-4 h-4 text-[#d97706]" />
        <span>使用邀请码加入</span>
      </button>
    );
  };

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg transition-all duration-300 gap-3 group relative overflow-visible ${
      workspace.status === "DISABLED"
        ? "bg-red-50/20 border border-red-200/80 hover:border-red-300"
        : "bg-white/60 border border-slate-200/50 hover:border-[#d97706]/25"
    }`}>
      <div className="flex items-center gap-3.5 min-w-0">
        {/* 企业专属橙色背景图标框 (停用时呈现红色警示态) */}
        <div className={`w-9 h-9 rounded border-none flex items-center justify-center flex-shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 ${
          workspace.status === "DISABLED"
            ? "bg-red-100 text-red-600"
            : "bg-amber-50 text-[#d97706]"
        }`}>
          {workspace.status === "DISABLED" ? (
            <AlertCircle className="w-4.5 h-4.5" />
          ) : (
            <Building2 className="w-4.5 h-4.5" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5 flex-wrap leading-none">
            <span>{workspace.name}</span>
            {workspace.status === "DISABLED" && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-black rounded border border-red-200 inline-flex items-center gap-1">
                ⚠️ 已停用管控
              </span>
            )}
            {isOwner ? (
              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-600 text-xs font-bold rounded border-none">👑 所有者</span>
            ) : isAdmin ? (
              <span className="px-2.5 py-0.5 bg-purple-50 text-purple-600 text-xs font-bold rounded border-none">🔧 管理员</span>
            ) : isComponentAdmin ? (
              <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded border-none">⚙️ 组件管理员</span>
            ) : (
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded border-none">👤 协同成员</span>
            )}
          </div>
          <div className="text-xs text-slate-500 font-semibold mt-2 flex items-center gap-2 flex-wrap leading-none">
            <span>{workspace.memberCount || 0} 名成员 · {workspace.componentCount || 0} 个已授权组件</span>
            <span className="inline-flex items-center gap-1 font-bold text-[#d97706] bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 text-[11px]">
              <Zap className="w-3 h-3 fill-[#d97706] text-[#d97706]" />
              <span>共享算力池: {workspace.quota?.tokenBalance !== undefined && workspace.quota?.tokenBalance !== null ? Number(workspace.quota.tokenBalance).toLocaleString() : "0"} 点</span>
            </span>
            {workspace.createdAt && (
              <span> · 创建于 {new Date(workspace.createdAt).toLocaleDateString("zh-CN")}</span>
            )}
          </div>

          {/* 停用管控详情横条（明明白白展示到期时间与自动解封节点） */}
          {workspace.status === "DISABLED" && (
            <div className="mt-2.5 p-2.5 rounded-lg bg-red-50/90 border border-red-200 text-xs text-red-800 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>
                    管控截止节点：
                    <span className="font-mono text-red-950 font-black">
                      {workspace.disabledUntil
                        ? (() => {
                            const d = new Date(workspace.disabledUntil);
                            const msLeft = d.getTime() - Date.now();
                            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                            return `${dateStr} (${daysLeft > 0 ? `剩余 ${daysLeft} 天` : "即将到期"} · 到期自动恢复)`;
                          })()
                        : "永久管控（需人工申诉审核解封）"}
                    </span>
                  </span>
                </div>
                {workspace.appealStatus === "pending" && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[10px] font-black border border-purple-200 shrink-0 flex items-center gap-1 animate-pulse">
                    <Clock className="w-3 h-3" />
                    申诉审核中 (限1次)
                  </span>
                )}
                {workspace.appealStatus === "rejected" && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-300 shrink-0 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-slate-500" />
                    申诉已驳回 (请等待到期解封)
                  </span>
                )}
              </div>
              {workspace.disabledReason && (
                <div className="text-[11px] text-red-700 font-medium truncate max-w-lg" title={workspace.disabledReason}>
                  管控原因: {workspace.disabledReason}
                </div>
              )}
              <div className="pt-1.5 border-t border-red-200/70 text-[11px] text-red-600 flex items-center gap-1">
                <span>💡 提示：管控期间空间处于冻结保护状态，所有配置与数据修改已被锁定。若有异议，空间所有者可点击「去申诉」提交解封申请。</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        {/* 主要动作：进入空间（停用时标红提示） */}
        {workspace.status === "DISABLED" ? (
          <>
            {/* 空间所有者申诉入口（限 1 次机会） */}
            {isOwner ? (
              workspace.appealStatus === "pending" ? (
                <button
                  disabled
                  className="zg-btn px-4 h-[38px] text-xs font-bold rounded-lg bg-purple-50 text-purple-700 border border-purple-200/80 flex items-center gap-1.5 cursor-not-allowed shrink-0"
                >
                  <Clock className="w-3.5 h-3.5 text-purple-600 animate-spin" />
                  <span>申诉审核中</span>
                </button>
              ) : workspace.appealStatus === "rejected" || (workspace.appealCount || 0) >= 1 ? (
                <button
                  disabled
                  className="zg-btn px-4 h-[38px] text-xs font-bold rounded-lg bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1.5 cursor-not-allowed shrink-0"
                  title="每个工作空间仅限 1 次申诉机会，当前已被驳回，请等待到期自动恢复"
                >
                  <XCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>申诉已驳回</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAppealModalOpen(true)}
                  className="zg-btn px-4.5 h-[38px] text-sm font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0 hover:scale-[1.02]"
                  title="该空间已被系统管控，点击向合规中心提交解封申诉"
                >
                  <ShieldAlert className="w-4 h-4 text-white" />
                  <span>去申诉</span>
                </button>
              )
            ) : (
              <span className="px-3.5 py-2 text-xs font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span>空间管控中</span>
              </span>
            )}
          </>
        ) : (
          <button
            onClick={() => onEnter(workspace)}
            className="zg-btn zg-btn-primary px-4.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1.5 hover:-translate-y-0.5 transition-all cursor-pointer bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white shadow-sm shrink-0"
          >
            <span>进入空间</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {/* 差异化展示的次要管理动作：若已停用则隐藏次要操作，仅留注销/退出 */}
        {workspace.status === "DISABLED" ? null : isMember ? (
          <button
            onClick={() => onLeave && onLeave(workspace.id)}
            className="zg-btn px-4 h-[38px] text-sm font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50/50 text-red-600 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 font-bold"
          >
            <LogOut className="w-4 h-4 text-red-500 shrink-0" />
            <span>退出空间</span>
          </button>
        ) : renderSecondaryAction()}

        {/* ⋮ 更多下拉菜单（仅在正常启用时对所有者和管理员展示，停用时彻底隐藏，禁止任何设置/升级/解散操作） */}
        {(isOwner || isAdmin) && workspace.status !== "DISABLED" && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-500 rounded border border-slate-200 transition-all cursor-pointer flex items-center justify-center w-[38px] h-[38px] shrink-0"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-[9999] py-1.5 animate-in fade-in duration-150 text-left">
                {/* 1. 所有者 Owner 权限菜单 */}
                {isOwner && (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEnterpriseSettings(workspace.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <Sliders className="w-4 h-4 text-slate-400" />
                      <span>企业设置</span>
                    </button>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onUpgradePackage(workspace.id);
                      }}
                      title="升级本空间的成员席位与存储等空间级配置（不影响您的账号会员等级）"
                      className="w-full text-left px-3.5 py-2 text-sm font-semibold text-[#2b6cb0] hover:text-[#3182ce] hover:bg-blue-50/20 flex items-center gap-2.5"
                    >
                      <ArrowUpRight className="w-4 h-4 text-[#2b6cb0]" />
                      <span>升级空间套餐</span>
                    </button>

                    <div className="border-t border-slate-100 my-1" />
                    
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(workspace.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-sm font-semibold text-red-600 hover:text-red-600 hover:bg-red-50/50 flex items-center gap-2.5"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span>解散企业空间</span>
                    </button>
                  </>
                )}

                {/* 2. 管理员 Admin 权限菜单 */}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEnterpriseSettings(workspace.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <Sliders className="w-4 h-4 text-slate-400" />
                      <span>企业设置</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 工作空间解封申诉模态框 */}
      <WorkspaceAppealModal
        isOpen={appealModalOpen}
        workspace={workspace}
        onClose={() => setAppealModalOpen(false)}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
