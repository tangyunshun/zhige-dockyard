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
  FileCode
} from "lucide-react";
import { Workspace } from "@/hooks/useWorkspaceHubData";

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
}: EnterpriseWorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/60 border border-slate-200/50 rounded-lg hover:border-[#d97706]/25 transition-all duration-300 gap-3 group relative overflow-visible">
      <div className="flex items-center gap-3.5 min-w-0">
        {/* 企业专属橙色背景图标框 (去除 border) */}
        <div className="w-9 h-9 rounded bg-amber-50 text-[#d97706] border-none flex items-center justify-center flex-shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105">
          <Building2 className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5 flex-wrap leading-none">
            <span>{workspace.name}</span>
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
          <div className="text-xs text-slate-500 font-semibold mt-2 leading-none">
            {workspace.memberCount || 0} 名成员 · {workspace.componentCount || 0} 个已授权组件
            {workspace.createdAt && (
              <span> · 创建于 {new Date(workspace.createdAt).toLocaleDateString("zh-CN")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        {/* 主要动作：进入空间 */}
        <button
          onClick={() => onEnter(workspace)}
          className="zg-btn zg-btn-primary px-4.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1.5 hover:-translate-y-0.5 transition-all cursor-pointer bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white shadow-sm shrink-0"
        >
          <span>进入空间</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* 差异化展示的次要管理动作 */}
        {isMember ? (
          <button
            onClick={() => onLeave && onLeave(workspace.id)}
            className="zg-btn px-4 h-[38px] text-sm font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50/50 text-red-600 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 font-bold"
          >
            <LogOut className="w-4 h-4 text-red-500 shrink-0" />
            <span>退出空间</span>
          </button>
        ) : renderSecondaryAction()}

        {/* ⋮ 更多下拉菜单（仅对所有者和管理员展示，向下弹出，配合 z-[9999] 防止任何裁剪） */}
        {(isOwner || isAdmin) && (
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
    </div>
  );
}
