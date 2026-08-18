"use client";

import { useState, useEffect } from "react";
import { Layers } from "lucide-react";
import { COMPONENTS, COMPONENT_CATEGORIES, ComponentCategory } from "@/constants/components";

// 阶段定义
interface Stage {
  id: number;
  name: string;
  color: string;
  bgColor: string;
}

const categoryToStageId: Record<ComponentCategory, number> = {
  BID_PREP: 1,
  REQ_DESIGN: 2,
  BACKEND_CORE: 3,
  DATABASE_ENG: 4,
  FRONTEND_DEV: 5,
  TEST_QA: 6,
  DEVOPS: 7,
  SECURITY: 8,
  PROJ_MGMT: 9,
  KNOWLEDGE: 10,
};

const categoryEmojis: Record<ComponentCategory, string> = {
  BID_PREP: "📄",
  REQ_DESIGN: "🧩",
  BACKEND_CORE: "💻",
  DATABASE_ENG: "🗄️",
  FRONTEND_DEV: "📐",
  TEST_QA: "✅",
  DEVOPS: "🐳",
  SECURITY: "🔒",
  PROJ_MGMT: "👥",
  KNOWLEDGE: "📚",
};

const stages: Stage[] = Object.entries(COMPONENT_CATEGORIES).map(([key, value]) => {
  const cat = key as ComponentCategory;
  return {
    id: categoryToStageId[cat] || 1,
    name: value.name,
    color: value.color,
    bgColor: `from-[${value.color}]/10 to-[${value.color}]/20`
  };
}).sort((a, b) => a.id - b.id);

const stageMetaData: Record<number, { iconText: string; flowText: string }> = {
  1: { iconText: "📄", flowText: "商机打单" },
  2: { iconText: "🧩", flowText: "需求定义" },
  3: { iconText: "💻", flowText: "后端开发" },
  4: { iconText: "🗄️", flowText: "数据工程" },
  5: { iconText: "📐", flowText: "大前端" },
  6: { iconText: "✅", flowText: "测试质量" },
  7: { iconText: "🐳", flowText: "持续运维" },
  8: { iconText: "🔒", flowText: "安全防护" },
  9: { iconText: "👥", flowText: "项目管理" },
  10: { iconText: "📚", flowText: "知识资产" },
};

interface ComponentsTabProps {
  workspaceId: string;
  userRole: string;
  workspaceType?: "PERSONAL" | "ENTERPRISE";
  boundComponentIds: string[];
  restrictedComponentIds: string[];
  componentStates?: Record<string, { enabled: boolean }>;
  newBoundComponentId: string | null;
  handleRequestUninstall: (id: string, name: string) => void;
  handleComponentClick: (comp: any) => void;
  handleToggleComponentActive: (comp: any, enabled: boolean) => Promise<void>;
  onNavigateToStudio: () => void;
}

export default function ComponentsTab({
  workspaceId,
  userRole,
  workspaceType,
  boundComponentIds,
  restrictedComponentIds,
  componentStates,
  newBoundComponentId,
  handleRequestUninstall,
  handleComponentClick,
  handleToggleComponentActive,
  onNavigateToStudio
}: ComponentsTabProps) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [apiBoundComponentIds, setApiBoundComponentIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (workspaceId) {
      const loadBoundComponentIds = async () => {
        try {
          const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
              setApiBoundComponentIds(data.data);
            }
          }
        } catch (e) {
          console.error("ComponentsTab load bound error:", e);
        }
      };
      loadBoundComponentIds();
    }
  }, [workspaceId, boundComponentIds.join(",")]); // 使用字符串依赖，同步开启/禁用及装配状态的刷新，且彻底杜绝无限渲染死循环

  const finalBoundIds = apiBoundComponentIds !== null ? apiBoundComponentIds : boundComponentIds;

  const filtered = COMPONENTS.filter(c => {
    const isBound = finalBoundIds.includes(c.id);
    if (!isBound) return false;
    if (selectedStageId === null) return true;
    return categoryToStageId[c.category] === selectedStageId;
  });

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-6 text-left animate-in fade-in duration-200">
      <div className="pb-3 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-[#3182ce]" /> 空间组件库管理与装配
        </h3>
        <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded border border-slate-200">
          10 大软件生命周期阶段平铺
        </span>
      </div>

      {/* 10 个阶段从左到右平铺网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
        {stages.map(stage => {
          const meta = stageMetaData[stage.id];
          const stageComps = COMPONENTS.filter(c => (categoryToStageId[c.category] || 1) === stage.id);
          const boundCount = stageComps.filter(c => boundComponentIds.includes(c.id)).length;
          const isSelected = selectedStageId === stage.id;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setSelectedStageId(selectedStageId === stage.id ? null : stage.id)}
              className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between min-h-[82px] cursor-pointer hover:shadow-md hover:border-[#3182ce]/30 group ${
                isSelected 
                  ? "bg-[#3182ce] text-white border-[#3182ce] shadow-sm" 
                  : "bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              <div className="w-full">
                <div className="flex justify-between items-center w-full">
                  <span className="text-lg leading-none">{meta?.iconText || "⚙️"}</span>
                  {boundCount > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black leading-none bg-red-600 text-white shadow-sm shrink-0">
                      {boundCount}
                    </span>
                  )}
                </div>
                <h4 className="text-[12px] font-black mt-2.5 truncate leading-none">{stage.name}</h4>
              </div>
              <span className={`text-[9px] font-bold block mt-1.5 truncate ${
                isSelected ? "text-blue-100" : "text-slate-400 group-hover:text-slate-500"
              }`}>
                {meta?.flowText || "基础生命周期"}
              </span>
            </button>
          );
        })}
      </div>

      {/* 下方联联动显示对应的组件卡片列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/20 max-w-lg mx-auto mt-6">
          <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-xs text-slate-700 font-black">当前分类暂无已装配组件</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1 mb-4">每个空间独立授权，您可以前往组件大厅挑选装配新组件</p>
          <button
            onClick={onNavigateToStudio}
            type="button"
            className="h-8 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1"
          >
            挑选并装配组件 ➔
          </button>
        </div>
      ) : (
        <div className="space-y-4 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {selectedStageId === null ? "已装配组件列表" : `${stages.find(s => s.id === selectedStageId)?.name} 已装配`} ({filtered.length})
            </span>
            {selectedStageId !== null && (
              <button
                type="button"
                onClick={() => setSelectedStageId(null)}
                className="text-[#3182ce] hover:text-[#2b6cb0] text-[10px] font-black cursor-pointer bg-transparent border-none p-0 inline"
              >
                显示全部已装配 ➔
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(comp => {
              const isRestricted = restrictedComponentIds.includes(comp.id);
              const isNewlyBound = newBoundComponentId === comp.id;
              const isManager = ["OWNER", "ADMIN", "Owner", "Admin"].includes(userRole);
              const isEnabled = componentStates?.[comp.id]?.enabled !== false;
              
              return (
                <div 
                  key={comp.id} 
                  className={`p-5 rounded-2xl border text-left flex flex-col justify-between min-h-[172px] hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${
                    isNewlyBound 
                      ? "bg-blue-50/20 border-[#3182ce]/80 shadow-md animate-in fade-in"
                      : isEnabled
                        ? "bg-blue-50/10 border-blue-100/80 hover:border-blue-300/60"
                        : "bg-slate-50/50 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100/80 flex items-center justify-center shrink-0">
                        <span className="text-base leading-none">{categoryEmojis[comp.category] || "⚙️"}</span>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {isNewlyBound && (
                          <span className="text-[9px] text-white bg-indigo-600 px-1.5 py-0.5 rounded font-black shrink-0 animate-pulse">最新装配</span>
                        )}
                        {isRestricted && isEnabled && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-750 border-amber-200/60 shrink-0">
                            ⚠️ 岗位限制
                          </span>
                        )}
                        <span 
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                            isEnabled
                              ? "bg-green-50 text-green-600 border-green-100"
                              : "bg-slate-100 text-slate-400 border-slate-200"
                          }`}
                        >
                          {isEnabled ? "● 已启用" : "○ 已禁用"}
                        </span>
                      </div>
                    </div>
                    
                    <h4 className={`text-[13px] font-black tracking-tight leading-none mb-1.5 ${isEnabled ? "text-slate-800" : "text-slate-500"}`} title={comp.name}>
                      {comp.name}
                    </h4>
                    
                    <p 
                      className={`text-[11px] font-semibold leading-relaxed line-clamp-2 mt-1 mb-3 select-none ${isEnabled ? "text-slate-500" : "text-slate-400"}`}
                      title={comp.description}
                    >
                      {comp.description}
                    </p>
                    {isRestricted && isEnabled && (
                      <p className="text-[10px] text-amber-750 bg-amber-50/50 border border-amber-100/60 px-2.5 py-1.5 rounded-lg font-semibold leading-normal mb-2.5 animate-in fade-in duration-200">
                        🔒 提示：当前开发岗位未分配此组件的执行权限，请联系管理员分配该岗位。
                      </p>
                    )}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-mono font-bold">{comp.id}</span>
                    
                    <div className="flex gap-2">
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => handleRequestUninstall(comp.id, comp.name)}
                          disabled={isEnabled && workspaceType === "ENTERPRISE"}
                          title={isEnabled && workspaceType === "ENTERPRISE" ? "启用中的组件禁止卸载，请先禁用组件" : "安全卸载"}
                          className={`h-7 px-2.5 text-xs font-bold rounded-lg shadow-sm transition-all ${
                            isEnabled && workspaceType === "ENTERPRISE"
                              ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                              : "text-red-500 bg-red-50/50 hover:bg-red-100 border border-red-100 hover:border-red-200 cursor-pointer"
                          }`}
                        >
                          卸载
                        </button>
                      )}

                      {isManager ? (
                        isEnabled ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`确定要禁用组件 [${comp.name}] 吗？禁用后普通工作空间成员将无法使用。`)) {
                                handleToggleComponentActive(comp, false);
                              }
                            }}
                            className="h-7 px-2.5 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-100 hover:border-amber-200 rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            禁用
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleComponentActive(comp, true)}
                            className="h-7 px-2.5 text-xs font-bold text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            启用
                          </button>
                        )
                      ) : (
                        !isEnabled && (
                          <span className="text-[9px] text-slate-400 font-bold self-center mr-1">管理员已禁用</span>
                        )
                      )}

                      <button
                        type="button"
                        onClick={() => handleComponentClick(comp)}
                        disabled={isRestricted || !isEnabled}
                        className={`h-7 px-3 text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer ${
                          isRestricted || !isEnabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            : "bg-[#3182ce] hover:bg-[#2b6cb0] text-white"
                        }`}
                      >
                        开始使用
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
