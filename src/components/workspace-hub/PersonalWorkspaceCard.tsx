"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Folder, 
  ArrowRight, 
  MoreVertical, 
  Edit3, 
  RefreshCw, 
  ArrowUpRight, 
  Eye,
  Plus
} from "lucide-react";
import { Workspace, PersonalState } from "@/hooks/useWorkspaceHubData";

interface PersonalWorkspaceCardProps {
  state: PersonalState;
  workspace: Workspace | null;
  onEnter: (workspace: Workspace) => void;
  onCreate: () => void;
  onRecreate: () => void;
  onRename: (id: string, name: string, desc: string) => void;
  onReset: () => void;
  onUpgrade: () => void;
  onViewEnterprise: () => void;
  showUpgradeLink: boolean;
  onDelete: (id: string) => void;
}

export default function PersonalWorkspaceCard({
  state,
  workspace,
  onEnter,
  onCreate,
  onRecreate,
  onRename,
  onReset,
  onUpgrade,
  onViewEnterprise,
  showUpgradeLink,
  onDelete,
}: PersonalWorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 ⋮ 菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 获取状态的标签徽章 (彻底去掉 border 边框线，避免突兀黑框)
  const getStatusBadge = () => {
    switch (state) {
      case "NORMAL":
        return (
          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded border-none flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>正常运行</span>
          </span>
        );
      case "PARALLEL":
        return (
          <span className="px-2.5 py-0.5 bg-amber-50 text-amber-600 text-xs font-bold rounded border-none flex items-center gap-1 shrink-0">
            <span>并行升级中</span>
          </span>
        );
      case "REPLACE":
        return (
          <span className="px-2.5 py-0.5 bg-red-50 text-red-600 text-xs font-bold rounded border-none flex items-center gap-1 shrink-0">
            <span>替换中</span>
          </span>
        );
      case "MIGRATE":
        return (
          <span className="px-2.5 py-0.5 bg-red-50 text-red-600 text-xs font-bold rounded border-none flex items-center gap-1 shrink-0">
            <span>已迁移</span>
          </span>
        );
      case "DELETED":
        return (
          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded border-none flex items-center gap-1 shrink-0">
            <span>已注销</span>
          </span>
        );
      default:
        return null;
    }
  };

  // 根据状态展示卡片内容
  const renderCardContent = () => {
    if (state === "NONE" || state === "DELETED") {
      return (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
          {/* 去除 border */}
          <div className="w-11 h-11 bg-blue-50/50 rounded-full flex items-center justify-center mb-3 border-none shadow-sm">
            <Folder className="w-5 h-5 text-[#3182ce]" />
          </div>
          <h4 className="text-sm font-bold text-slate-700 mb-1">
            {state === "DELETED" ? "个人开发环境已物理注销" : "暂无激活的个人空间"}
          </h4>
          <p className="text-xs text-slate-500 mb-4 max-w-xs leading-relaxed font-semibold">
            {state === "DELETED" 
              ? "您可以重新创建一个干净的个人沙箱空间以开启独立研发" 
              : "您可以创建一个独立的个人空间以开启独立研发"}
          </p>
          <button
            onClick={state === "DELETED" ? onRecreate : onCreate}
            className="zg-btn zg-btn-primary px-4.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>创建个人空间</span>
          </button>
        </div>
      );
    }

    if (state === "REPLACE" || state === "MIGRATE") {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/40 border border-slate-200/50 rounded-lg relative">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 去除 border */}
              <div className="w-7.5 h-7.5 rounded bg-blue-50/50 flex items-center justify-center flex-shrink-0 border-none">
                <Folder className="w-4 h-4 text-[#3182ce]" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">个人空间</h4>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md font-semibold">
              {state === "REPLACE" 
                ? "因个人空间已选择“替换升级”为企业空间，原有数据已迁移且不再独立存在。" 
                : "个人空间数据已平滑“迁移”至企业空间，在此您可重新开辟一块独立的开发沙箱。"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              onClick={onRecreate}
              className="zg-btn zg-btn-primary px-3.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1 hover:-translate-y-0.5 transition-all cursor-pointer bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white shadow-sm"
            >
              <span>重新创建</span>
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* ⋮ 下拉菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded border border-slate-200 transition-all cursor-pointer flex items-center justify-center w-[38px] h-[38px]"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1.5 animate-in fade-in duration-150 text-left">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onViewEnterprise();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>查看相关企业空间</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // A: NORMAL 正常使用 或 B: PARALLEL 并行升级
    return (
      <div className="space-y-4 text-left">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-200/50 bg-white/60 rounded-lg hover:border-[#3182ce]/25 transition-all duration-300">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              {/* 图标框去除 border */}
              <div className="w-7.5 h-7.5 rounded bg-blue-50 flex items-center justify-center flex-shrink-0 border-none shadow-sm">
                <Folder className="w-4 h-4 text-[#3182ce]" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 truncate leading-none">
                {workspace?.name || "个人空间"}
              </h4>
              {getStatusBadge()}
              <span className="px-2 py-0.5 bg-blue-50 text-[#2b6cb0] border border-blue-100/50 text-xs font-bold rounded">
                独立沙箱
              </span>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              个人开发专属环境 · 已绑定 {workspace?.componentCount || 0} 个组件
              {workspace?.createdAt && (
                <span> · 创建于 {new Date(workspace.createdAt).toLocaleDateString("zh-CN")}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (workspace) {
                  onEnter(workspace);
                }
              }}
              className="zg-btn zg-btn-primary px-4.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1.5 hover:-translate-y-0.5 transition-all cursor-pointer bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white shadow-sm shrink-0"
            >
              <span>进入空间</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* ⋮ 下拉菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded border border-slate-200 transition-all cursor-pointer flex items-center justify-center w-[38px] h-[38px] shrink-0"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1.5 animate-in fade-in duration-150 text-left">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (workspace) onRename(workspace.id, workspace.name, workspace.description || "");
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                    <span>空间设置</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onReset();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>重置空间数据</span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (workspace) onDelete(workspace.id);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 hover:text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-red-600" />
                    <span>注销个人空间</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showUpgradeLink && state === "NORMAL" && (
          <div className="p-3.5 bg-gradient-to-r from-blue-50/40 via-indigo-50/20 to-white border border-blue-100/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 leading-normal">
              需要团队协作时，可将个人空间升级为企业空间，保留已有组件与数据。
            </span>
            <button
              onClick={onUpgrade}
              className="zg-btn zg-btn-default bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1 cursor-pointer self-start sm:self-auto hover:-translate-y-0.5 transition-all shadow-sm shrink-0"
            >
              <span>升级为企业空间</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-[20px] p-6 border border-white/90 shadow-sm hover:shadow-md transition-all duration-300 relative z-20">
      {/* 渐变指示条 */}
      <div className="flex items-start gap-2.5 mb-5 pb-3 border-b border-slate-200/60">
        <div className="w-1.5 h-4.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h3 className="text-base font-extrabold text-slate-800">个人空间</h3>
          <p className="text-xs text-slate-400 font-semibold leading-normal">仅自己可见，用于个人组件执行、草稿和私有资料。</p>
        </div>
      </div>
      
      {renderCardContent()}
    </div>
  );
}
