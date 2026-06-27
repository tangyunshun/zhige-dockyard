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
  ShieldAlert,
  ArrowUpRight
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
}: EnterpriseWorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const role = workspace.role || "MEMBER";
  const isOwner = role === "OWNER" || workspace.isOwner;
  const isAdmin = role === "ADMIN";
  const isMember = role === "MEMBER" && !isOwner && !isAdmin;

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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/60 border border-slate-200/80 rounded-xl hover:border-[#2b6cb0]/40 hover:shadow-sm transition-all duration-300 gap-3 group relative">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-[#f59e0b] to-[#dd6b20] flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5 flex-wrap">
            <span>{workspace.name}</span>
            {isOwner ? (
              <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-bold rounded border border-orange-100">👑 所有者</span>
            ) : isAdmin ? (
              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded border border-purple-100">🔧 管理员</span>
            ) : (
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded border border-blue-100">👤 协同成员</span>
            )}
          </div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5">
            {workspace.memberCount || 0} 名成员 · {workspace.componentCount || 0} 个组件
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        {/* 主要按钮：进入空间 */}
        <button
          onClick={() => onEnter(workspace)}
          className="zg-btn zg-btn-primary px-3.5 py-1.5 h-8 text-xs font-bold rounded-lg flex items-center gap-1 hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <span>进入空间</span>
          <ArrowRight className="w-3 h-3" />
        </button>

        {/* OWNER 和 ADMIN 额外展示“管理”快捷配置按钮 */}
        {!isMember && (
          <button
            onClick={() => onManage(workspace.id)}
            className="px-3 py-1.5 h-8 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center gap-1"
          >
            <Settings className="w-3 h-3 text-slate-400" />
            <span>管理</span>
          </button>
        )}

        {/* ⋮ 更多下拉菜单 (仅管理员及所有者可见，按角色分级展现) */}
        {!isMember && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200/50 transition-all cursor-pointer flex items-center justify-center"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white/98 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                
                {/* 核心业务：组件库管理 */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onManageComponents(workspace.id);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                  <span>组件库管理</span>
                </button>

                {/* 核心业务：使用数据统计 */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onViewStats(workspace.id);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  <span>使用数据统计</span>
                </button>

                {/* 核心业务：管理成员 */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onInvite(workspace.id); // 唤起邀请弹窗
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>邀请协同成员</span>
                </button>

                {/* 管理员或所有者专属设置 */}
                {(isOwner || isAdmin) && (
                  <>
                    <div className="border-t border-slate-100 my-1" />
                    
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEnterpriseSettings(workspace.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      <span>企业设置</span>
                    </button>
                  </>
                )}

                {isOwner && (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onUpgradePackage(workspace.id);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                      <span>升级套餐</span>
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
