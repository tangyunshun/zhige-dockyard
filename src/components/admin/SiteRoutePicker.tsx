"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Compass,
  Search,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Radar,
  Layers,
  X,
  Boxes,
  Briefcase,
  FileText,
  ShieldCheck,
  User,
  Component,
} from "lucide-react";

export interface SiteRouteItem {
  label: string;
  url: string;
  description: string;
  category: string;
  badge?: string;
  icon?: string;
  isDynamic?: boolean;
}

export interface SiteRouteGroup {
  category: string;
  icon: string;
  routes: SiteRouteItem[];
}

interface SiteRoutePickerProps {
  currentUrl: string;
  onSelect: (url: string, label: string) => void;
  disabled?: boolean;
}

// 向上寻找最近的纵向可滚动父容器（如后台管理系统的 main overflow-y-auto 容器）
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (typeof window === "undefined") return null;
  let current = node?.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export default function SiteRoutePicker({
  currentUrl,
  onSelect,
  disabled = false,
}: SiteRoutePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [groups, setGroups] = useState<SiteRouteGroup[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 弹窗弹出方位（下方空间不足时智能转为向上弹出）
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  // 动态自适应最大高度
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number>(390);

  // 检测分类栏横向滚动位置，控制《》左右推动按钮的显隐与禁用态
  const updateScrollButtons = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  // 点击《或》左右平滑推动分类栏
  const handleScrollCategories = (direction: "left" | "right") => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const distance = 160;
    el.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 300);
  };

  /**
   * 智能方向判断与自动向上推页面：
   * 1. 展开前先检测下方可用空间。若下方空间不足以展示舒适列表且上方更宽裕，则自动采用向上展开 (Dropup)；
   * 2. 若向下展开，检测下拉框底部是否探出视口或滚动父容器；若探出，自动将页面精准向上推移，
   *    确保下拉菜单底部的每一像素（包含分组、卡片、快捷键提示条）完整露出，彻底告别手动滚动！
   */
  const handleToggleOpen = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollParent = findScrollParent(containerRef.current);
      const boundaryBottom = scrollParent
        ? Math.min(window.innerHeight, scrollParent.getBoundingClientRect().bottom)
        : window.innerHeight;
      const boundaryTop = scrollParent
        ? Math.max(0, scrollParent.getBoundingClientRect().top)
        : 0;

      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;

      // 如果下方空间严重不足（< 320px）且上方空间更宽敞，优先向上弹出
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setPlacement("top");
        setDropdownMaxHeight(Math.min(390, Math.max(260, spaceAbove - 24)));
      } else {
        setPlacement("bottom");
        setDropdownMaxHeight(Math.min(390, Math.max(260, spaceBelow - 24)));
      }
    }

    setIsOpen(true);
  };

  // 展开后自动将页面整体向上推，保证下拉面板 100% 完整呈现在视口内
  useEffect(() => {
    if (!isOpen) return;

    let timer1: ReturnType<typeof setTimeout>;
    let timer2: ReturnType<typeof setTimeout>;

    const adjustScrollPosition = () => {
      if (!dropdownRef.current || !containerRef.current) return;

      const dropdownEl = dropdownRef.current;
      const scrollParent = findScrollParent(containerRef.current);
      const dropdownRect = dropdownEl.getBoundingClientRect();

      if (placement === "bottom") {
        // 向下展开时：同时检测 window 视口与父容器底界的溢出情况
        const winOverflow = dropdownRect.bottom - (window.innerHeight - 28);
        const parentOverflow = scrollParent
          ? dropdownRect.bottom - (scrollParent.getBoundingClientRect().bottom - 28)
          : 0;
        const maxOverflow = Math.max(winOverflow, parentOverflow);

        if (maxOverflow > 0) {
          if (scrollParent && parentOverflow > 0) {
            scrollParent.scrollBy({ top: maxOverflow, behavior: "smooth" });
          }
          if (winOverflow > 0) {
            window.scrollBy({ top: winOverflow, behavior: "smooth" });
          }
        }

        try {
          dropdownEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch {
          // 优雅降级
        }
      } else {
        // 向上展开时：同时检测 window 视口与父容器顶界的溢出情况
        const winOverflowTop = 24 - dropdownRect.top;
        const parentOverflowTop = scrollParent
          ? (scrollParent.getBoundingClientRect().top + 24) - dropdownRect.top
          : 0;
        const maxOverflowTop = Math.max(winOverflowTop, parentOverflowTop);

        if (maxOverflowTop > 0) {
          if (scrollParent && parentOverflowTop > 0) {
            scrollParent.scrollBy({ top: -maxOverflowTop, behavior: "smooth" });
          }
          if (winOverflowTop > 0) {
            window.scrollBy({ top: -winOverflowTop, behavior: "smooth" });
          }
        }

        try {
          dropdownEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch {
          // 优雅降级
        }
      }

      updateScrollButtons();
    };

    // DOM 挂载初次调整
    timer1 = setTimeout(adjustScrollPosition, 60);
    // 动画完成与数据渲染后二次复核，确保无论如何都不受内容高度延迟影响
    timer2 = setTimeout(adjustScrollPosition, 200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, placement, updateScrollButtons]);

  // 加载系统路由元数据（包含物理自动扫描与数据库组件）
  const fetchRoutes = async (isManualRefresh = false) => {
    try {
      setLoading(true);
      const res = await fetch("/api/system/site-routes");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.groups)) {
          setGroups(data.groups);
          setTotalCount(data.total || 0);
        }
      }
    } catch (err) {
      console.error("加载系统功能路由失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // 点击外部自动关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // 展开时自动聚焦搜索框
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // ESC 键关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // 全量扁平化列表
  const allRoutes = useMemo(() => {
    return groups.flatMap((g) => g.routes);
  }, [groups]);

  // 当前匹配的预置项
  const currentMatched = useMemo(() => {
    if (!currentUrl) return null;
    return allRoutes.find((r) => r.url === currentUrl) || null;
  }, [allRoutes, currentUrl]);

  // 过滤后的列表
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return groups
      .map((group) => {
        if (selectedCategory !== "ALL" && group.category !== selectedCategory) {
          return null;
        }

        const filteredRoutes = group.routes.filter((route) => {
          if (!q) return true;
          return (
            route.label.toLowerCase().includes(q) ||
            route.url.toLowerCase().includes(q) ||
            (route.description && route.description.toLowerCase().includes(q)) ||
            (route.badge && route.badge.toLowerCase().includes(q))
          );
        });

        if (filteredRoutes.length === 0) return null;
        return {
          ...group,
          routes: filteredRoutes,
        };
      })
      .filter(Boolean) as SiteRouteGroup[];
  }, [groups, searchQuery, selectedCategory]);

  // 获取分类图标组件
  const getCategoryIcon = (catName: string) => {
    if (catName.includes("核心")) return <Boxes className="w-3.5 h-3.5 text-[#3182ce]" />;
    if (catName.includes("行业")) return <Briefcase className="w-3.5 h-3.5 text-amber-600" />;
    if (catName.includes("开发")) return <FileText className="w-3.5 h-3.5 text-emerald-600" />;
    if (catName.includes("安全")) return <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />;
    if (catName.includes("用户")) return <User className="w-3.5 h-3.5 text-sky-600" />;
    if (catName.includes("自动感知") || catName.includes("新增")) return <Radar className="w-3.5 h-3.5 text-purple-600" />;
    if (catName.includes("组件")) return <Component className="w-3.5 h-3.5 text-cyan-600" />;
    return <Layers className="w-3.5 h-3.5 text-slate-500" />;
  };

  const handleSelectRoute = (route: SiteRouteItem) => {
    onSelect(route.url, route.label);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* 触发条按钮：知阁规范设计，清晰优雅 */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggleOpen}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all border outline-none text-left cursor-pointer ${
          isOpen
            ? "bg-blue-50/90 border-[#3182ce] text-[#2b6cb0] ring-1 ring-[#3182ce]/30 shadow-sm"
            : currentMatched
              ? "bg-blue-50/40 hover:bg-blue-50/80 border-blue-200/90 text-[#2b6cb0]"
              : "bg-slate-50/70 hover:bg-slate-100/90 border-slate-200/80 text-slate-600 hover:text-slate-800"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title="点击展开站内全量功能与页面快速选取面板"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Compass className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
          {currentMatched ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-slate-800 truncate">{currentMatched.label}</span>
              <span className="font-mono text-[10px] text-blue-700 bg-blue-100/70 px-1 py-0.2 rounded shrink-0">
                {currentMatched.url}
              </span>
              {currentMatched.badge && (
                <span className="text-[9px] px-1 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 rounded font-normal shrink-0">
                  {currentMatched.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate text-slate-500">
              快捷选取站内页面 (已智能感知收录 {totalCount || allRoutes.length || "30+"} 项功能)...
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#3182ce]" : ""
          }`}
        />
      </button>

      {/* 弹层选择面板：自适应上下方位与最大高度，带分类过滤与搜索，杜绝截断 */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute left-0 w-full md:w-[480px] max-w-[95vw] bg-white rounded-xl border border-slate-200/90 shadow-2xl z-50 overflow-hidden flex flex-col transition-all animate-in fade-in zoom-in-95 duration-150 ${
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
          style={{ maxHeight: `${dropdownMaxHeight}px` }}
        >
          {/* 顶栏：搜索过滤与动态同步刷新 */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索页面名称、路由路径或关键词..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 自动同步最新系统功能路由按钮 */}
            <button
              type="button"
              disabled={loading}
              onClick={() => fetchRoutes(true)}
              className="p-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-[#3182ce] border border-slate-200 hover:border-blue-200 rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="自动从系统代码库与数据库感知最新新增功能与路由"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
              <span className="text-[11px] hidden sm:inline">自动同步</span>
            </button>
          </div>

          {/* 分类过滤胶囊条：带左右推动按钮《 》与平滑滚动，彻底解决右侧截断问题 */}
          <div className="relative border-b border-slate-100 bg-white flex items-center px-1">
            {/* 左侧推动按钮《 */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScrollCategories("left")}
                className="absolute left-1 z-10 p-1 bg-white/95 hover:bg-blue-50 text-slate-600 hover:text-[#3182ce] border border-slate-200 rounded-full shadow-md transition-all cursor-pointer flex items-center justify-center"
                title="向左滚动查看更多分类"
              >
                <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}

            {/* 胶囊容器 */}
            <div
              ref={categoryScrollRef}
              onScroll={updateScrollButtons}
              onWheel={(e) => {
                if (e.deltaY !== 0 && categoryScrollRef.current) {
                  categoryScrollRef.current.scrollLeft += e.deltaY;
                }
              }}
              className="px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full scroll-smooth"
            >
              <button
                type="button"
                onClick={() => setSelectedCategory("ALL")}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 transition-colors cursor-pointer border ${
                  selectedCategory === "ALL"
                    ? "bg-[#3182ce] text-white border-[#3182ce] shadow-xs font-bold"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                全部 ({totalCount || allRoutes.length})
              </button>
              {groups.map((group, idx) => {
                const isActive = selectedCategory === group.category;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCategory(group.category)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 transition-colors cursor-pointer border ${
                      isActive
                        ? "bg-blue-100 text-[#2b6cb0] border-blue-300 font-bold shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-[#3182ce]"
                    }`}
                  >
                    {group.category.split(" ")[1] || group.category} ({group.routes.length})
                  </button>
                );
              })}
            </div>

            {/* 右侧推动按钮》 */}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScrollCategories("right")}
                className="absolute right-1 z-10 p-1 bg-white/95 hover:bg-blue-50 text-slate-600 hover:text-[#3182ce] border border-slate-200 rounded-full shadow-md transition-all cursor-pointer flex items-center justify-center"
                title="向右滚动查看更多分类"
              >
                <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* 选项卡片滚动列表：高度限制 280px，支持流畅滚动 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3 divide-y divide-slate-100/60">
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs space-y-1">
                <Compass className="w-6 h-6 mx-auto text-slate-300 stroke-1" />
                <p>未找到匹配的站内功能页面</p>
                <p className="text-[10px] text-slate-400">可尝试更换搜索词或点击右上角「自动同步」</p>
              </div>
            ) : (
              filteredGroups.map((group, gIdx) => (
                <div key={gIdx} className={gIdx > 0 ? "pt-2.5" : ""}>
                  {/* 分组标题 */}
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-slate-500 tracking-wide">
                    {getCategoryIcon(group.category)}
                    <span>{group.category}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({group.routes.length})</span>
                  </div>

                  {/* 分组项列表 */}
                  <div className="mt-1 space-y-1">
                    {group.routes.map((route, rIdx) => {
                      const isSelected = route.url === currentUrl;
                      return (
                        <div
                          key={rIdx}
                          onClick={() => handleSelectRoute(route)}
                          className={`group flex items-start justify-between gap-2.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-blue-50/80 border-[#3182ce] text-[#2b6cb0] shadow-xs"
                              : "bg-white hover:bg-slate-50/80 border-transparent hover:border-slate-200 text-slate-700"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-xs font-semibold ${
                                  isSelected ? "text-[#2b6cb0]" : "text-slate-800 group-hover:text-[#3182ce]"
                                }`}
                              >
                                {route.label}
                              </span>
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200/60">
                                {route.url}
                              </span>
                              {route.badge && (
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                    route.badge.includes("新功能") || route.badge.includes("感知")
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : route.badge.includes("组件")
                                        ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
                                        : "bg-blue-50 text-blue-700 border border-blue-200"
                                  }`}
                                >
                                  {route.badge}
                                </span>
                              )}
                            </div>
                            {route.description && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5 group-hover:text-slate-500">
                                {route.description}
                              </p>
                            )}
                          </div>

                          {/* 选中指示 / 悬浮填入指示 */}
                          <div className="shrink-0 flex items-center self-center">
                            {isSelected ? (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-[#3182ce]">
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>当前</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 text-[#3182ce] transition-opacity">
                                选取 ↵
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部指示栏 */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1">
              <Radar className="w-3 h-3 text-amber-500" />
              <span>新功能发布后自动感知，无需手动修改代码</span>
            </span>
            <span>按 ESC 关闭</span>
          </div>
        </div>
      )}
    </div>
  );
}
