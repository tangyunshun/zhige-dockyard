"use client";

import React from "react";
import { Plus, Search, HelpCircle, Users, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Workspace, EnterpriseQuota } from "@/hooks/useWorkspaceHubData";
import EnterpriseWorkspaceCard from "./EnterpriseWorkspaceCard";
import type { UpgradeHighlight } from "./modals/QuotaUpgradeModal";

interface EnterpriseWorkspaceListProps {
  workspaces: Workspace[];
  quota: EnterpriseQuota | null;
  statistics?: { totalMembers?: number; totalComponents?: number };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
  onEnter: (workspace: Workspace) => void;
  onManage: (id: string) => void;
  onInvite: (id: string) => void;
  onManageComponents: (id: string) => void;
  onEnterpriseSettings: (id: string) => void;
  onUpgradePackage: (id: string) => void;
  onViewStats: (id: string) => void;
  onDelete: (id: string) => void;
  /** 唤起统一升级中枢，入参用于锚定需要高亮的权益维度 */
  onUpgrade?: (highlight: UpgradeHighlight) => void;
  onJoinClick: () => void;
  onLeave?: (id: string) => void;
  onRefresh?: () => void;
}

export default function EnterpriseWorkspaceList({
  workspaces,
  quota,
  statistics,
  searchQuery,
  onSearchChange,
  onCreateClick,
  onEnter,
  onManage,
  onInvite,
  onManageComponents,
  onEnterpriseSettings,
  onUpgradePackage,
  onViewStats,
  onDelete,
  onUpgrade,
  onJoinClick,
  onLeave,
  onRefresh,
}: EnterpriseWorkspaceListProps) {
  const router = useRouter();
  const toast = useToast();

  // 过滤空间列表
  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 统计总成员和总组件数（优先使用 dashboard 提供的跨空间去重成员数，避免重复计数）
  const totalMembers =
    typeof statistics?.totalMembers === "number"
      ? statistics.totalMembers
      : workspaces.reduce((acc, ws) => acc + (ws.memberCount || 0), 0);
  const totalComponents = workspaces.reduce((acc, ws) => acc + (ws.componentCount || 0), 0);

  // 配额校验是否超出限制
  const isOverQuota = quota ? quota.enterpriseCount >= quota.maxEnterprise : false;

  return (
    <div className="bg-white/95 rounded-[20px] p-6 border border-white/90 shadow-sm hover:shadow-md transition-all duration-350 flex flex-col justify-between min-h-[300px] overflow-visible">
      
      {/* 区块标题 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5 pb-3 border-b border-slate-200/60">
        <div className="flex items-start gap-2.5">
          <div className="w-1.5 h-4.5 bg-gradient-to-b from-[#f59e0b] to-[#d97706] rounded-full shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h3 className="text-base font-extrabold text-slate-800">企业空间</h3>
            <p className="text-xs text-slate-400 font-semibold leading-normal sm:whitespace-nowrap">团队共享空间，成员、组件权限和企业知识库在这里管理。</p>
          </div>
        </div>

        {/* 状态与配额 (升级为只读型高胶囊 Badges，加指示点，打消用户点击按钮的错觉) */}
        {(() => {
          const myCreatedCount = workspaces.filter(ws => ws.role === "OWNER" || ws.isOwner).length;
          const myJoinedCount = workspaces.filter(ws => ws.role !== "OWNER" && !ws.isOwner).length;
          return (
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto flex-wrap">
              {/* 1. 创建配额胶囊 */}
              <div className="text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full flex items-center gap-1.5 border-none shadow-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] shrink-0" />
                <span>
                  创建配额：{myCreatedCount} / {quota?.maxEnterprise || 0}
                </span>
                <div className="relative group/tooltip cursor-help flex items-center">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-500 transition-colors" />
                  <div className="absolute bottom-full mb-1.5 right-0 transform translate-x-1/4 scale-95 opacity-0 pointer-events-none group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 transition-all duration-200 bg-slate-800 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap z-50 font-bold">
                    普通用户限创 1 个，升级 VIP 账户可创建至多 3 个
                  </div>
                </div>
              </div>

              {/* 2. 协同配额胶囊 */}
              <div className="text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full flex items-center gap-1.5 border-none shadow-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#63b3ed] shrink-0" />
                <span>
                  协同配额：{myJoinedCount} / 5
                </span>
                <div className="relative group/tooltip cursor-help flex items-center">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-500 transition-colors" />
                  <div className="absolute bottom-full mb-1.5 right-0 transform translate-x-1/4 scale-95 opacity-0 pointer-events-none group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 transition-all duration-200 bg-slate-800 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap z-50 font-bold">
                    所有账户最多可受邀协同加入 5 个企业空间
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {workspaces.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (isOverQuota) {
                    // 锚定「企业空间数量」维度，让用户直观看到升级后可增加的空间数
                    onUpgrade?.("workspace");
                    return;
                  }
                  onCreateClick();
                }}
                className={`zg-btn px-4.5 h-[38px] text-sm font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-sm hover:-translate-y-0.5 ${
                  isOverQuota
                    ? "bg-[#fef2f2] text-red-600 border border-red-200 hover:bg-red-50"
                    : "zg-btn-primary bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white"
                }`}
                title={isOverQuota ? "企业空间数量已达上限，点击升级会员以增加数量" : "新建企业空间"}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isOverQuota ? "增加空间数量" : "新建企业空间"}</span>
              </button>
            </div>
          )}
      </div>

      {/* 搜索过滤框 */}
      {workspaces.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="输入企业空间名称进行过滤..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-[38px] pl-9 pr-4 text-sm bg-white/80 border border-slate-200/60 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/10 transition-all font-medium"
          />
        </div>
      )}

      {/* 内容区域：网格列表或空状态 */}
      <div className="flex-1 overflow-visible">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-amber-50/10 rounded-lg border border-dashed border-amber-200/50">
            <p className="text-xs text-slate-500 mb-4 font-semibold">暂无已加入的企业协作空间，您可以自主创建或通过邀请码加入</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (isOverQuota) {
                    toast.info("您的企业空间创建配额已满，正在打开会员升级对比...");
                    onUpgrade?.("workspace");
                    return;
                  }
                  onCreateClick();
                }}
                className="zg-btn zg-btn-primary px-4.5 h-[38px] text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 hover:shadow-md transition-all bg-gradient-to-b from-[#4299e1] to-[#3182ce] hover:brightness-105 border-t border-[#63b3ed] text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建企业空间</span>
              </button>
              <button
                onClick={onJoinClick}
                className="zg-btn px-4.5 h-[38px] text-sm font-semibold text-[#d97706] bg-white hover:bg-amber-50/20 border border-amber-200/80 rounded-lg cursor-pointer flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span>🧩 输入邀请码加入</span>
              </button>
            </div>
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 font-semibold">
            未找到匹配 "{searchQuery}" 的企业协作空间
          </div>
        ) : (
          <div className="space-y-2.5 overflow-visible pr-1">
            {filteredWorkspaces.map((ws) => (
              <EnterpriseWorkspaceCard
                key={ws.id}
                workspace={ws}
                onEnter={onEnter}
                onManage={onManage}
                onInvite={onInvite}
                onManageComponents={onManageComponents}
                onEnterpriseSettings={onEnterpriseSettings}
                onUpgradePackage={onUpgradePackage}
                onViewStats={onViewStats}
                onDelete={onDelete}
                onLeave={onLeave}
                onJoinClick={onJoinClick}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部汇总统计栏 */}
      {workspaces.length > 0 && (
        <div className="mt-5 pt-3 border-t border-slate-200/50 flex flex-wrap items-center gap-6 text-xs text-slate-500 font-semibold">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>协同空间总成员：<strong className="text-slate-700">{totalMembers}</strong> 人</span>
          </div>
          <div className="flex items-center gap-1">
            <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
            <span>企业空间总组件：<strong className="text-slate-700">{totalComponents}</strong> 个</span>
          </div>
        </div>
      )}

    </div>
  );
}
