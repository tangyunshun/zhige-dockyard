"use client";

import React from "react";
import { Plus, Search, HelpCircle, Users, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Workspace, EnterpriseQuota } from "@/hooks/useWorkspaceHubData";
import EnterpriseWorkspaceCard from "./EnterpriseWorkspaceCard";

interface EnterpriseWorkspaceListProps {
  workspaces: Workspace[];
  quota: EnterpriseQuota | null;
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
  onUpgrade?: () => void;
}

export default function EnterpriseWorkspaceList({
  workspaces,
  quota,
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
}: EnterpriseWorkspaceListProps) {
  const router = useRouter();
  const toast = useToast();

  // 过滤空间列表
  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 统计总成员和总组件数
  const totalMembers = workspaces.reduce((acc, ws) => acc + (ws.memberCount || 0), 0);
  const totalComponents = workspaces.reduce((acc, ws) => acc + (ws.componentCount || 0), 0);

  // 配额校验是否超出限制
  const isOverQuota = quota ? quota.enterpriseCount >= quota.maxEnterprise : false;

  return (
    <div className="relative z-20 group bg-white/70 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:border-[#2b6cb0]/20 transition-all duration-300 flex flex-col justify-between min-h-[300px]">
      
      {/* 区块标题 + 新建按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-4 bg-gradient-to-b from-[#f59e0b] to-[#dd6b20] rounded-full" />
          <h3 className="text-sm font-black text-slate-800">企业协作空间</h3>
        </div>

        {/* 状态与配额 */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1.5">
            <span>
              容量配额：{quota?.enterpriseCount || 0} / {quota?.maxEnterprise || 0}
            </span>
            <div className="relative group/tooltip cursor-help">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <div className="absolute bottom-full mb-1.5 right-0 transform translate-x-1/4 scale-95 opacity-0 pointer-events-none group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 transition-all duration-200 bg-slate-800 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap z-50 font-bold">
                免费版限 1 个，升级 VIP 会员起步拥有 3 个及以上
              </div>
            </div>
          </div>

          {workspaces.length > 0 && (
            <button
              onClick={() => {
                if (isOverQuota) {
                  onUpgrade?.();
                  return;
                }
                onCreateClick();
              }}
              className={`zg-btn px-3 py-1.5 h-8 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                isOverQuota
                  ? "bg-[#fef2f2] text-red-600 border border-red-200 hover:bg-red-50 hover:-translate-y-0.5"
                  : "zg-btn-primary bg-[#2b6cb0] hover:bg-[#2563eb] text-white border-none shadow-sm hover:-translate-y-0.5"
              }`}
              title={isOverQuota ? "企业空间数量已达上限，点击升级 VIP" : "新建企业协作空间"}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isOverQuota ? "升级VIP解锁" : "新建企业空间"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 搜索过滤框 */}
      {workspaces.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索企业协作空间..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-white/80 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20 transition-all"
          />
        </div>
      )}

      {/* 内容区域：网格列表或空状态 */}
      <div className="flex-1">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-white/40 rounded-xl border border-dashed border-slate-200/80">
            <p className="text-xs text-slate-500 mb-4 font-bold">暂无激活的协作空间，建议开辟团队协同或加入项目</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (isOverQuota) {
                    toast.info("您的协作空间配额已满。正在为您跳转到升级会员服务...");
                    setTimeout(() => {
                      router.push("/settings/billing");
                    }, 1000);
                    return;
                  }
                  onCreateClick();
                }}
                className="zg-btn zg-btn-primary px-4 py-1.5 h-8 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 hover:shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建企业协作空间</span>
              </button>
              <button
                onClick={() => {
                  // 通过向外冒泡触发协作邀请码加入
                  const joinBtn = document.querySelector('[data-action="join-invitation"]') as HTMLButtonElement;
                  if (joinBtn) {
                    joinBtn.click();
                  } else {
                    // 备用触发
                    (window as any).__toggleJoinModal?.();
                  }
                }}
                className="zg-btn zg-btn-default px-4 py-1.5 h-8 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 hover:bg-slate-50 transition-all"
              >
                <span>🧩 输入邀请码加入</span>
              </button>
            </div>
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            未找到匹配 "{searchQuery}" 的企业工作空间
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
