"use client";

import React from "react";
import { HelpCircle, Box, Eye } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { iconMap } from "@/components/ComponentShowcase";

interface FeaturedComponentsProps {
  topComponents?: any[];
  onComponentClick: (componentId: string) => void;
  boundNames?: Record<string, string[]>;
  totalMyWorkspacesCount?: number;
  onViewDetail?: (comp: any) => void;
}

const categoryEmojis: Record<string, string> = {
  BID_PREP: "",
  REQ_DESIGN: "",
  BACKEND_CORE: "",
  DATABASE_ENG: "",
  FRONTEND_DEV: "",
  TEST_QA: "",
  DEVOPS: "",
  SECURITY: "",
  PROJ_MGMT: "",
  KNOWLEDGE: "",
};

export default function FeaturedComponents({
  topComponents,
  onComponentClick,
  boundNames = {},
  totalMyWorkspacesCount = 1,
  onViewDetail
}: FeaturedComponentsProps) {

  // 映射真实历史数据（30 天调用频次与全网装载数均来自数据库聚合）
  const getDisplayComponents = () => {
    if (topComponents && topComponents.length > 0) {
      return topComponents.slice(0, 3).map((item: any, idx: number) => {
        const isSecurity = item.name?.includes("合规") || item.name?.includes("安全") || item.name?.includes("审计");
        const isData = item.name?.includes("数据") || item.name?.includes("库") || item.name?.includes("生成");
        
        let tagColor = "bg-blue-50 text-[#2b6cb0] border-none";
        let borderHover = "hover:border-[#2b6cb0]/25";

        if (isSecurity) {
          tagColor = "bg-blue-50 text-[#2b6cb0] border-none";
          borderHover = "hover:border-[#2b6cb0]/25";
        } else if (isData) {
          tagColor = "bg-emerald-50 text-emerald-600 border-none";
          borderHover = "hover:border-emerald-200";
        }

        const displayUseCount = item.callCount || 0;

        return {
          id: item.id || item.componentId,
          tag: item.isFallback
            ? displayUseCount > 0
              ? `🔥 全网热门 · 30天 ${displayUseCount} 次`
              : "🔥 全网热门推荐"
            : displayUseCount > 0
              ? `🔥 30天调用 ${displayUseCount} 次`
              : "📊 30天暂无调用",
          tagColor,
          borderHover,
          globalWorkspaceCount: item.globalWorkspaceCount || 0,
        };
      });
    }

    return [];
  };

  const { componentCatalog } = useAppContext();

  const list = getDisplayComponents();

  return (
    <div className="bg-white/80 rounded-[20px] p-6 border border-white/90 shadow-sm hover:shadow-md transition-all duration-300">
      
      {/* 头部 (Tooltip 说明智能推荐规则) */}
      <div className="flex items-start justify-between mb-5 pb-3 border-b border-slate-200/60">
        <div className="flex items-start gap-2.5">
          <div className="w-1.5 h-4.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold text-slate-800">推荐组件</h3>
              
              {/* Tooltip 规则解释气泡 */}
              <div className="relative group/rule cursor-help flex items-center justify-center">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-[#2b6cb0] transition-colors" />
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 scale-95 opacity-0 pointer-events-none group-hover/rule:scale-100 group-hover/rule:opacity-100 transition-all duration-200 bg-slate-800 text-white text-[10px] leading-relaxed p-3 rounded-lg shadow-xl w-60 z-50 font-bold">
                  📝 <strong className="text-[#63b3ed]">推荐算法规则说明</strong>：
                  <span className="block mt-1 font-semibold text-slate-300">
                    基于您及所在团队在各空间内对组件在过去 30天内触发调用的累加频次进行降序排列，降序为您推荐排行前三的最热组件。
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-semibold leading-normal">
              根据最近高频使用排序推荐，点击一键装配至特定空间。
            </p>
          </div>
        </div>
      </div>

      {/* 横向平铺排列 */}
      {list.length === 0 && (
        <div className="text-xs text-slate-400 font-semibold text-center py-8 bg-slate-50/50 rounded-xl border border-slate-200/60">
          暂无 30 天组件调用数据，快去空间里使用组件吧
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {list.map((item) => {
          const realComp = componentCatalog.find((c) => c.id === item.id);
          if (!realComp) return null;

          const names = boundNames?.[item.id] || [];
          return (
            <div 
              key={item.id}
              onClick={() => onComponentClick(item.id)}
              className={`p-4.5 bg-white hover:bg-slate-50/50 border border-slate-200/50 rounded-lg transition-all duration-300 cursor-pointer flex flex-col justify-between gap-4 group relative min-h-[140px] text-left shadow-sm ${item.borderHover}`}
            >
                <div className="space-y-2">
                  {/* 图标与推荐因由标签 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50/80 text-[#3182ce] flex items-center justify-center shrink-0">
                      {(() => { const Ico = iconMap[realComp.icon || ""] || Box; return <Ico className="w-4 h-4" />; })()}
                    </div>
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border-none ${item.tagColor} shadow-sm`}>
                      {item.tag}
                    </span>
                  </div>

                  {/* 卡片文字 */}
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-black text-slate-800 group-hover:text-[#2b6cb0] transition-colors line-clamp-1 leading-none" title={`${realComp.id} ${realComp.name}`}>
                      <span className="font-mono text-[10px] text-slate-400 font-bold mr-1.5">{realComp.id}</span>
                      {realComp.name}
                    </h4>
                    <p 
                      className="text-[11px] text-slate-500 font-semibold mt-2 leading-relaxed line-clamp-2"
                      title={realComp.description}
                    >
                      {realComp.description}
                    </p>
                  </div>
                  
                  <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                    {/* 全网徽标（真实统计：全平台有多少个不同空间使用过该组件） */}
                    <span 
                      className="px-1.5 py-0.5 bg-slate-100 text-slate-500 border border-slate-200/50 rounded text-[9px] font-black shrink-0 select-none"
                    >
                      🌍 全网 {item.globalWorkspaceCount} 空间装载
                    </span>
                    
                    {/* 我的徽标 */}
                    {names.length > 0 && (
                      <span 
                        className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100/50 rounded text-[9px] font-black shrink-0 cursor-help select-none animate-pulse-subtle"
                        title={`已装配在以下空间：\n${names.join("、")}`}
                      >
                        👤 我的：已配 {names.length} 空间
                      </span>
                    )}
                  </div>
                </div>

                {/* 装配操作与查看详情 */}
                <div className="text-xs font-bold pt-2 border-t border-slate-100 mt-1 flex items-center justify-between gap-1 transition-colors">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onViewDetail) onViewDetail(realComp);
                    }}
                    className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200/90 border border-slate-200 rounded-md transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                    title="查看该组件的契约与详细说明文档"
                  >
                    <Eye className="w-3 h-3 text-slate-500" />
                    <span>详情</span>
                  </button>

                  <div className="text-xs font-bold text-[#2b6cb0] group-hover:text-[#3182ce] flex items-center gap-0.5">
                    <span>
                      {names.length === 0 
                        ? "立即装配" 
                        : names.length < totalMyWorkspacesCount 
                          ? "装配到其他空间" 
                          : "直接前往使用"
                      } →
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
