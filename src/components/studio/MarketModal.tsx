"use client";

import React, { useState } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import SearchInput from "@/components/common/SearchInput";
import {
  ShoppingBag,
  Search,
  Check,
  Plus,
  Zap,
  Filter,
  X,
} from "lucide-react";
import {
  COMPONENTS,
  COMPONENT_CATEGORIES,
  ComponentCategory,
  ComponentDefinition,
} from "@/constants/components";

interface MarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
}

export default function MarketModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
}: MarketModalProps) {
  const toast = useToast();
  const { boundComponentIds, bindComponent, unbindComponent } = useAppContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ComponentCategory | "ALL">("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (!isOpen) return null;

  // 过滤组件
  const filteredComponents = COMPONENTS.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === "ALL" || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleToggleBind = async (comp: ComponentDefinition) => {
    const isBound = boundComponentIds.includes(comp.id);
    setProcessingId(comp.id);
    try {
      if (isBound) {
        // 执行解绑
        const success = await unbindComponent(comp.id, workspaceId);
        if (success) {
          toast.success(`组件 ${comp.name} 已成功从空间 [${workspaceName}] 解除绑定`);
        } else {
          toast.error("解绑失败，请重试");
        }
      } else {
        // 执行绑定
        const success = await bindComponent(comp.id, workspaceId);
        if (success) {
          toast.success(`组件 ${comp.name} 已成功绑定安装至空间 [${workspaceName}]`);
        } else {
          toast.error("绑定失败，请重试");
        }
      }
    } catch (err) {
      console.error("操作绑定失败:", err);
      toast.error("系统繁忙，请稍后重试");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl w-full max-w-6xl h-[85vh] border border-slate-200 shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 Header */}
        <header className="relative z-20 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-md">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                知阁 · 组件采购大厅
              </h2>
              <p className="text-[11px] text-slate-500 font-bold">
                正在为空间 <span className="text-[#3182ce] font-extrabold">[{workspaceName}]</span> 引进或解绑效能组件
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer border border-slate-200/40 shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* 主要内容区 */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-[#f0f8ff]">
          {/* 左侧分类导航 */}
          <aside className="w-64 bg-white border-r border-slate-200/60 flex-shrink-0 overflow-y-auto p-4 hidden md:block">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 pb-2.5 border-b border-slate-100 mb-3">
              <Filter className="w-4 h-4 text-slate-400" />
              分类筛选大厅
            </h3>
            
            <nav className="space-y-1">
              <button
                onClick={() => setActiveCategory("ALL")}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-between cursor-pointer ${
                  activeCategory === "ALL"
                    ? "bg-[#2b6cb0] text-white shadow-sm font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>📦 全部分类</span>
                <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold ${
                  activeCategory === "ALL" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>{COMPONENTS.length}</span>
              </button>

              {Object.entries(COMPONENT_CATEGORIES).map(([key, details]) => {
                const cat = key as ComponentCategory;
                const count = COMPONENTS.filter((c) => c.category === cat).length;
                const isSelected = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-[#2b6cb0] text-white shadow-sm font-bold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{details.name}</span>
                    <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}>{count}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* 右侧列表 */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* 模糊搜索栏 */}
            <div className="bg-white px-6 py-4 border-b border-slate-200/60 flex-shrink-0 flex items-center justify-between gap-4">
              <div className="w-full sm:max-w-md">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="输入组件名称、标签或描述搜索..."
                />
              </div>
              <div className="text-xs text-slate-500 font-bold shrink-0 hidden sm:block">
                当前分类下共找到 <strong className="text-[#2b6cb0] font-black">{filteredComponents.length}</strong> 个组件
              </div>
            </div>

            {/* 组件矩阵网格 */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredComponents.length === 0 ? (
                <div className="bg-white/60 border border-slate-200 border-dashed rounded-2xl p-16 text-center my-10 max-w-lg mx-auto">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">没有找到匹配的组件</h4>
                  <p className="text-xs text-slate-400 mt-1 font-semibold">请更换关键词或选择左侧其他分类</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredComponents.map((comp) => {
                    const categoryInfo = COMPONENT_CATEGORIES[comp.category];
                    const isBound = boundComponentIds.includes(comp.id);
                    const isProcessing = processingId === comp.id;

                    return (
                      <div
                        key={comp.id}
                        className={`group bg-white border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 flex flex-col justify-between ${
                          isBound ? "border-[#2b6cb0] shadow-sm bg-blue-50/5" : "border-slate-200/80"
                        }`}
                      >
                        <div>
                          {/* 头部：分类 + 徽章 */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold border"
                              style={{
                                backgroundColor: `${categoryInfo?.color}10`,
                                borderColor: `${categoryInfo?.color}20`,
                                color: categoryInfo?.color,
                              }}
                            >
                              {categoryInfo?.name || "未知"}
                            </span>
                            
                            {comp.isPremium && (
                              <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded text-[9px] font-black tracking-wide shadow-sm flex items-center gap-0.5">
                                <Zap className="w-2.5 h-2.5" />
                                <span>PREMIUM</span>
                              </span>
                            )}
                          </div>

                          {/* 标题 */}
                          <h3 className="text-sm font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                            <span className="text-lg">⚙️</span>
                            <span className="group-hover:text-[#2b6cb0] transition-colors">{comp.name}</span>
                          </h3>

                          {/* 描述 */}
                          <p className="text-xs text-slate-500 font-semibold leading-relaxed mb-4 min-h-[32px] line-clamp-2">
                            {comp.description}
                          </p>

                          {/* ROI 说明 */}
                          {comp.previewData?.roiText && (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-500 font-bold leading-normal mb-4 flex items-start gap-1">
                              <span className="text-emerald-500 flex-shrink-0">📈</span>
                              <span className="line-clamp-2">{comp.previewData.roiText}</span>
                            </div>
                          )}

                          {/* 标签列表 */}
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {comp.tags.slice(0, 2).map((tag, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* 按钮动作 */}
                        <button
                          onClick={() => handleToggleBind(comp)}
                          disabled={isProcessing}
                          className={`w-full h-8 text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            isBound
                              ? "border border-red-200 text-red-500 hover:bg-red-50"
                              : "border border-[#2b6cb0] text-[#2b6cb0] hover:bg-[#2b6cb0] hover:text-white"
                          }`}
                        >
                          {isProcessing ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                          ) : isBound ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>解除空间绑定</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>引进绑定组件</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
