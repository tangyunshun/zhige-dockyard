"use client";

import { useState, useRef, useMemo } from "react";
import { Layers, Box, Eye } from "lucide-react";
import type { ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";
import { iconMap } from "@/components/ComponentShowcase";
import { useDevice } from "@/contexts/DeviceContext";
import { categoryIconsMap } from "@/components/WorkspaceInternalLayoutV3";

// 阶段定义
interface Stage {
  id: number;
  name: string;
  color: string;
  bgColor: string;
  emoji: string;
  flowText: string;
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
  onViewDetail?: (comp: any) => void;
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
  onNavigateToStudio,
  onViewDetail
}: ComponentsTabProps) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const { isTouch, isMobile } = useDevice();
  // 组件信息与分类来自数据库（component_catalog / component_category 表）
  const { componentCatalog: COMPONENTS, componentCategories: COMPONENT_CATEGORIES } = useAppContext();

  // 分类 → 阶段号映射（由数据库 component_category.sortOrder 驱动，不再硬编码）
  const categoryToStageId = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(COMPONENT_CATEGORIES).forEach(([key, value]) => {
      map[key] = value.sortOrder && value.sortOrder > 0 ? value.sortOrder : 1;
    });
    return map;
  }, [COMPONENT_CATEGORIES]);

  // 阶段列表由数据库分类动态构造，不依赖代码写死的分类
  const stages: (Stage & { categoryKey: string })[] = useMemo(() => {
    return Object.entries(COMPONENT_CATEGORIES).map(([key, value]) => {
      const cat = key as ComponentCategory;
      return {
        id: categoryToStageId[cat] || 1,
        name: value.name,
        color: value.color,
        bgColor: `from-[${value.color}]/10 to-[${value.color}]/20`,
        emoji: "",
        categoryKey: cat,
        flowText: value.name,
      };
    }).sort((a, b) => a.id - b.id);
  }, [COMPONENT_CATEGORIES, categoryToStageId]);

  // 触屏设备：长按等效为“右键”操作，弹出组件快捷菜单
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = (cb: () => void) => {
    if (!isTouch) return;
    pressTimer.current = setTimeout(cb, 500);
  };
  const handleTouchEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // 已装配组件列表统一来自父布局 props（父布局是当前空间数据的唯一数据源），
  // 不再在子 Tab 内重复请求 /api/studio?action=bound
  const finalBoundIds = boundComponentIds;

  const filtered = COMPONENTS.filter(c => {
    const isBound = finalBoundIds.some(id => id.trim().toUpperCase() === c.id.trim().toUpperCase());
    if (!isBound) return false;
    if (selectedStageId === null) return true;
    return categoryToStageId[c.category] === selectedStageId;
  });

  return (
    <div className="bg-white/80 backdrop-blur-md border border-white/90 p-6 rounded-[20px] shadow-xl space-y-6 text-left animate-in fade-in duration-200">
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
          const stageComps = COMPONENTS.filter(c => (categoryToStageId[c.category] || 1) === stage.id);
          const boundCount = stageComps.filter(c => finalBoundIds.includes(c.id)).length;
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
                  <span className="leading-none">
                    {(() => {
                      const CatIco = categoryIconsMap[stage.categoryKey] || Layers;
                      return <CatIco className={`w-5 h-5 ${isSelected ? "text-white" : "text-[#3182ce]"}`} />;
                    })()}
                  </span>
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
                {stage.flowText || "基础生命周期"}
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
            <span className="text-xs sm:text-sm font-extrabold text-slate-700 tracking-wide">
              {selectedStageId === null ? "已装配组件列表" : `${stages.find(s => s.id === selectedStageId)?.name} 已装配`} ({filtered.length})
            </span>
            {selectedStageId !== null && (
              <button
                type="button"
                onClick={() => setSelectedStageId(null)}
                className="text-[#3182ce] hover:text-[#2b6cb0] text-xs font-black cursor-pointer bg-transparent border-none p-0 inline ml-2"
              >
                显示全部已装配 ➔
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(comp => {
              const isRestricted = restrictedComponentIds.includes(comp.id);
              const isNewlyBound = newBoundComponentId === comp.id;
              const isManager = ["OWNER", "ADMIN", "Owner", "Admin", "COMPONENT_MANAGER", "ComponentManager"].includes(userRole);
              const isEnabled = componentStates?.[comp.id]?.enabled !== false;
              const isRestrictedForCurrentUser = !isManager && isRestricted;
              
              return (
                <div
                  key={comp.id}
                  onContextMenu={(e) => { e.preventDefault(); handleComponentClick(comp); }}
                  onTouchStart={() => handleTouchStart(() => handleComponentClick(comp))}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  className={`p-5 rounded-[20px] border text-left flex flex-col justify-between min-h-[178px] hover:bg-white hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ${
                    isNewlyBound
                      ? "bg-blue-50/20 border-[#3182ce]/80 shadow-md animate-in fade-in"
                      : isEnabled
                        ? "bg-blue-50/10 border-blue-100/80 hover:border-[#63b3ed]/60"
                        : "bg-slate-50/50 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50/80 text-[#3182ce] flex items-center justify-center shrink-0">
                        {(() => { const Ico = iconMap[comp.icon || ""] || Box; return <Ico className="w-5 h-5" />; })()}
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {isNewlyBound && (
                          <span className="text-xs text-white bg-indigo-600 px-2 py-0.5 rounded font-black shrink-0 animate-pulse">最新装配</span>
                        )}
                        {isRestricted && isEnabled && (
                          <span className={`text-xs font-black px-2 py-0.5 rounded border shrink-0 ${
                            isManager
                              ? "bg-blue-50 text-[#2b6cb0] border-blue-200"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}>
                            {isManager ? "🛡️ 矩阵受限 (特权可用)" : "🔒 岗位受限"}
                          </span>
                        )}
                        {workspaceType === "ENTERPRISE" && (
                          <span 
                            className={`text-xs font-black px-2 py-0.5 rounded border ${
                              isEnabled
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            }`}
                          >
                            {isEnabled ? "● 已启用" : "○ 已禁用"}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h4 className={`text-sm sm:text-base font-black tracking-tight leading-snug mb-1.5 ${workspaceType === "PERSONAL" || isEnabled ? "text-slate-900" : "text-slate-500"}`} title={comp.name}>
                      {comp.name}
                    </h4>
                    
                    <p 
                      className={`text-xs sm:text-sm font-medium leading-relaxed line-clamp-2 mt-1 mb-3 select-none ${workspaceType === "PERSONAL" || isEnabled ? "text-slate-600" : "text-slate-400"}`}
                      title={comp.description}
                    >
                      {comp.description}
                    </p>
                    {isRestricted && (workspaceType === "PERSONAL" || isEnabled) && (
                      <p className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold leading-normal mb-2.5 animate-in fade-in duration-200 ${
                        isManager
                          ? "text-[#2b6cb0] bg-blue-50/60 border border-blue-100"
                          : "text-amber-750 bg-amber-50/60 border border-amber-100"
                      }`}>
                        {isManager
                          ? "🛡️ 特权提示：当前组件已在安全矩阵中配置限制，您作为所有者/管理员具备特权执行能力。"
                          : "🔒 受限提示：当前研发岗位未分配此组件执行权限，已禁止操作。"}
                      </p>
                    )}
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono font-bold">{comp.id}</span>
                    
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onViewDetail && onViewDetail(comp)}
                        className="h-8 px-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1"
                        title="查看该组件的核心功能契约与详细文档"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>详情</span>
                      </button>
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => handleRequestUninstall(comp.id, comp.name)}
                          disabled={workspaceType === "ENTERPRISE" && isEnabled}
                          title={workspaceType === "ENTERPRISE" && isEnabled ? "企业空间中启用中的组件禁止卸载，请先禁用组件" : "安全卸载"}
                          className={`h-8 px-3 text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-all ${
                            workspaceType === "ENTERPRISE" && isEnabled
                              ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                              : "text-red-500 bg-red-50/50 hover:bg-red-100 border border-red-100 hover:border-red-200 cursor-pointer"
                          }`}
                        >
                          卸载
                        </button>
                      )}

                      {/* 启停状态切换仅在【企业空间】下有效，个人空间独享无需启用/禁用操作 */}
                      {workspaceType === "ENTERPRISE" && (
                        isManager ? (
                          isEnabled ? (
                            <button
                              type="button"
                              onClick={() => handleToggleComponentActive(comp, false)}
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
                        )
                      )}

                      {!(workspaceType === "ENTERPRISE" && !isEnabled) && (
                        <button
                          type="button"
                          onClick={() => handleComponentClick(comp)}
                          disabled={isRestrictedForCurrentUser}
                          className={`h-8 px-3 text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-all ${
                            isRestrictedForCurrentUser
                              ? "bg-amber-50 text-amber-600 border-amber-200 cursor-not-allowed font-black"
                              : "bg-[#3182ce] hover:bg-[#2b6cb0] text-white cursor-pointer shadow-md hover:shadow-lg"
                          }`}
                        >
                          {isRestrictedForCurrentUser
                            ? "🔒 岗位受限 (不可用)"
                            : isManager && isRestricted
                              ? "⚡ 特权执行"
                              : "开始使用"}
                        </button>
                      )}
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
