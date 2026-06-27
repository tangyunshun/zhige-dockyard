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

  // 获取状态的标签徽章
  const getStatusBadge = () => {
    switch (state) {
      case "NORMAL":
        return (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-100 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
            ● 正常
          </span>
        );
      case "PARALLEL":
        return (
          <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-bold rounded border border-orange-100 flex items-center gap-1">
            ⬆ 并行
          </span>
        );
      case "REPLACE":
        return (
          <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-100 flex items-center gap-1">
            ⬆ 替换
          </span>
        );
      case "MIGRATE":
        return (
          <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-100 flex items-center gap-1">
            ⬆ 迁移
          </span>
        );
      case "DELETED":
        return (
          <span className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] font-bold rounded border border-slate-200 flex items-center gap-1">
            ● 已删除
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
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <Folder className="w-6 h-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-700 mb-1">
            {state === "DELETED" ? "个人开发环境已物理注销" : "暂无激活的个人空间"}
          </h4>
          <p className="text-xs text-slate-500 mb-4 max-w-xs leading-relaxed font-medium">
            {state === "DELETED" 
              ? "您可以重新创建一个干净的个人沙箱空间以开启独立研发" 
              : "您当前仅作为企业协作成员。建议创建一个独立的个人空间用于技术验证"}
          </p>
          <button
            onClick={state === "DELETED" ? onRecreate : onCreate}
            className="zg-btn zg-btn-primary px-4 py-2 text-xs rounded-lg flex items-center gap-1.5 hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>创建个人空间</span>
          </button>
        </div>
      );
    }

    if (state === "REPLACE" || state === "MIGRATE") {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white/50 border border-slate-200/60 rounded-xl relative">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Folder className="w-4 h-4 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">个人工作空间</h4>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md font-medium">
              {state === "REPLACE" 
                ? "因个人空间已选择“替换升级”为企业空间，原有数据已迁移且不再独立存在。" 
                : "个人空间数据已平滑“迁移”至企业空间，在此您可重新开辟一块独立的开发沙箱。"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              onClick={onRecreate}
              className="zg-btn zg-btn-primary px-3.5 py-1.5 h-9 text-xs rounded-lg flex items-center gap-1 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>重新创建个人空间</span>
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* ⋮ 下拉菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200/50 transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
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
        <div className="zg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-slate-200/80 bg-white/60 hover:scale-[1.005] transition-all duration-300">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="w-7 h-7 rounded bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">P</span>
              </div>
              <h4 className="text-sm font-bold text-slate-800 truncate">
                {workspace?.name || "个人工作空间"}
              </h4>
              {getStatusBadge()}
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold rounded">
                独立沙箱
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              个人开发专属环境 · 已绑定 {workspace?.componentCount || 0} 个组件
              {workspace?.createdAt && (
                <span> · 创建于 {new Date(workspace.createdAt).toLocaleDateString("zh-CN")}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button
              onClick={() => workspace && onEnter(workspace)}
              className="zg-btn zg-btn-primary px-3.5 py-1.5 h-9 text-xs rounded-lg flex items-center gap-1.5 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>进入工作空间</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* ⋮ 下拉菜单 */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200/50 transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (workspace) onRename(workspace.id, workspace.name, workspace.description || "");
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                    <span>⚙️ 空间设置</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onReset();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>🔄 重置空间数据</span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (workspace) onDelete(workspace.id);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-red-400" />
                    <span>❌ 注销个人空间</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showUpgradeLink && state === "NORMAL" && (
          <div className="p-3.5 bg-gradient-to-r from-[#2b6cb0]/5 to-indigo-600/5 border border-[#2b6cb0]/15 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#2b6cb0] flex items-center gap-1.5">
              ✨ 个人研发环境支持平滑升级至企业级空间，保留全部组件和审计资产
            </span>
            <button
              onClick={onUpgrade}
              className="zg-btn zg-btn-primary bg-[#2b6cb0] hover:bg-[#2563eb] border-none px-3.5 py-1.5 h-8 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <span>立即升级</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative group bg-white/70 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:border-[#2b6cb0]/20 transition-all duration-300">
      <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
        <div className="w-1.5 h-4 bg-gradient-to-b from-[#2b6cb0] to-indigo-50 rounded-full" />
        <h3 className="text-sm font-black text-slate-800">个人工作空间</h3>
      </div>
      
      {renderCardContent()}
    </div>
  );
}
