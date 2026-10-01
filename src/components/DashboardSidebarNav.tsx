"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * 侧边栏菜单项（支持按业务域分组展示）。
 * 管理员后台与个人工作台共用同一套渲染逻辑，保证两端交互与视觉完全一致。
 */
export interface SidebarNavItem {
  icon: any;
  label: string;
  href: string;
  description?: string;
  /** 所属分组名；未提供时归入「其他功能」 */
  group?: string;
}

interface DashboardSidebarNavProps {
  /** 全部菜单项（调用方需已完成权限过滤） */
  items: SidebarNavItem[];
  /** 分组展示顺序；未列入的分组按出现顺序追加到末尾 */
  groupOrder?: string[];
  /** 是否折叠态：折叠时仅展示图标，并用细分割线区分分组 */
  collapsed: boolean;
  /** 点击菜单项（导航跳转、关闭移动端抽屉等由调用方处理） */
  onNavigate: (href: string) => void;
  /** 折叠态点击图标时的附加动作（例如自动展开侧边栏） */
  onExpand?: () => void;
  /** 菜单项角标（如后台待办数量），仅对指定 href 生效 */
  badge?: { href: string; count: number };
  /** 搜索框占位文案 */
  searchPlaceholder?: string;
}

const FALLBACK_GROUP = "其他功能";

export default function DashboardSidebarNav({
  items,
  groupOrder = [],
  collapsed,
  onNavigate,
  onExpand,
  badge,
  searchPlaceholder = "搜索菜单…",
}: DashboardSidebarNavProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  /** 被手动折叠的分组（未记录的分组默认展开，避免功能被藏起来） */
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [hovered, setHovered] = useState<{
    label: string;
    description?: string;
    top: number;
    left: number;
  } | null>(null);

  // 路由变化时自动展开当前页所在分组，避免当前选中项被折叠隐藏
  useEffect(() => {
    const activeGroup = items.find((item) => item.href === pathname)?.group;
    if (!activeGroup) return;
    setClosedGroups((prev) =>
      prev[activeGroup] ? { ...prev, [activeGroup]: false } : prev
    );
  }, [pathname, items]);

  const grouped = useMemo(() => {
    const bucket = new Map<string, SidebarNavItem[]>();
    items.forEach((item) => {
      const name = item.group || FALLBACK_GROUP;
      if (!bucket.has(name)) bucket.set(name, []);
      bucket.get(name)!.push(item);
    });
    const order: string[] = [];
    groupOrder.forEach((name) => {
      if (bucket.has(name)) order.push(name);
    });
    bucket.forEach((_, name) => {
      if (!order.includes(name)) order.push(name);
    });
    return order.map((name) => ({ name, items: bucket.get(name)! }));
  }, [items, groupOrder]);

  const keyword = query.trim().toLowerCase();
  const searchResults = keyword
    ? items.filter((item) =>
        [item.label, item.description, item.href].some((v) =>
          (v || "").toLowerCase().includes(keyword)
        )
      )
    : [];

  const badgeCountOf = (href: string) =>
    badge && badge.href === href ? badge.count : 0;

  /* ---------------- 折叠态：仅图标 ---------------- */
  const renderCollapsedItem = (item: SidebarNavItem) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;
    const count = badgeCountOf(item.href);
    return (
      <button
        key={item.href}
        type="button"
        onClick={() => {
          setHovered(null);
          onExpand?.();
          onNavigate(item.href);
        }}
        onMouseEnter={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setHovered({
            label: count > 0 ? `${item.label}（${count} 项待办）` : item.label,
            description: item.description,
            top: r.top + r.height / 2,
            left: r.right,
          });
        }}
        onMouseLeave={() => setHovered(null)}
        className={`relative w-full flex items-center justify-center p-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
          isActive
            ? "bg-[#3182ce] text-white shadow-sm"
            : "text-slate-500 hover:bg-[#3182ce]/[0.07] hover:text-[#3182ce]"
        }`}
      >
        <span className="relative">
          <Icon className="w-[19px] h-[19px] shrink-0" />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 font-bold text-center ring-2 ring-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
      </button>
    );
  };

  /* ---------------- 展开态：轻量行（左侧色条标识选中） ---------------- */
  const renderExpandedItem = (item: SidebarNavItem) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;
    const count = badgeCountOf(item.href);
    return (
      <button
        key={item.href}
        type="button"
        onClick={() => onNavigate(item.href)}
        title={item.description}
        className={`group/item relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
          isActive
            ? "bg-[#3182ce] shadow-sm"
            : "hover:bg-white hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
        }`}
      >
        <Icon
          className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${
            isActive
              ? "text-white"
              : "text-slate-400 group-hover/item:text-slate-600"
          }`}
        />

        <div className="text-left min-w-0 flex-1">
          <div
            className={`text-[13px] truncate transition-colors duration-200 ${
              isActive
                ? "font-black text-white"
                : "font-semibold text-slate-600 group-hover/item:text-slate-900"
            }`}
          >
            {item.label}
          </div>
          {item.description && (
            <div
              className={`text-[11px] truncate mt-[1px] transition-colors duration-200 ${
                isActive
                  ? "text-white/80"
                  : "text-slate-400 group-hover/item:text-slate-500"
              }`}
            >
              {item.description}
            </div>
          )}
        </div>

        {count > 0 && (
          <span
            className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center shadow-sm"
            title={`${count} 项待处理事项`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <nav
        className={`flex-1 min-h-0 overflow-y-auto ${
          collapsed ? "px-2 py-4 space-y-0.5" : "px-2.5 pb-4 pt-3.5"
        }`}
      >
        {/* 菜单快速检索：功能变多后可按名称 / 描述 / 路径即时过滤 */}
        {!collapsed && (
          <div className="relative mb-2.5 px-0.5">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-9 pl-9 pr-9 rounded-lg bg-slate-100/80 border border-transparent text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition-all duration-200 focus:bg-white focus:border-[#3182ce]/40 focus:shadow-[0_0_0_4px_rgba(49,130,206,0.10)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="清空搜索"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* 折叠态：仅图标，分组之间以细分割线区分 */}
        {collapsed &&
          items.map((item, idx) => (
            <Fragment key={item.href}>
              {idx > 0 && items[idx - 1].group !== item.group && (
                <div className="h-px bg-slate-100 my-2" />
              )}
              {renderCollapsedItem(item)}
            </Fragment>
          ))}

        {/* 搜索态：扁平结果列表，命中更直接 */}
        {!collapsed && keyword !== "" && (
          <>
            {searchResults.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <Search className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">未找到匹配功能</p>
                <p className="text-[11px] text-slate-300 mt-1">
                  试试「用户」「订单」「权限」等关键词
                </p>
              </div>
            ) : (
              <>
                <div className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 tracking-wider">
                  匹配到 {searchResults.length} 项
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-1.5 space-y-0.5">
                  {searchResults.map(renderExpandedItem)}
                </div>
              </>
            )}
          </>
        )}

        {/* 分组态：吸顶分组标题 + 平滑展开收起 */}
        {!collapsed &&
          keyword === "" &&
          grouped.map((group) => {
            const isOpen = !closedGroups[group.name];
            const hasActive = group.items.some((i) => i.href === pathname);
            return (
              <div key={group.name} className="pb-2">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm pt-1.5 pb-1">
                  <button
                    type="button"
                    onClick={() =>
                      setClosedGroups((prev) => ({
                        ...prev,
                        [group.name]: !prev[group.name],
                      }))
                    }
                    className={`group/gh w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors duration-200 cursor-pointer ${
                      hasActive ? "" : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold tracking-[0.1em] transition-colors duration-200 ${
                        hasActive
                          ? "text-[#3182ce]"
                          : "text-slate-400 group-hover/gh:text-slate-600"
                      }`}
                    >
                      {group.name}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {/* 该分组下的功能数量 */}
                      <span
                        className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums transition-colors duration-200 ${
                          hasActive
                            ? "bg-[#3182ce] text-white"
                            : "bg-slate-100 text-slate-400 group-hover/gh:bg-slate-200/80 group-hover/gh:text-slate-500"
                        }`}
                      >
                        {group.items.length}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-all duration-200 ${
                          isOpen ? "" : "-rotate-90"
                        } ${
                          hasActive
                            ? "text-[#3182ce]/60"
                            : "text-slate-300 group-hover/gh:text-slate-500"
                        }`}
                      />
                    </span>
                  </button>
                </div>

                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    {/* 分组卡片容器：浅灰底 + 细描边，让每组更像一个独立模块 */}
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-1.5 space-y-0.5">
                      {group.items.map(renderExpandedItem)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </nav>

      {/* 收起态菜单名称悬停提示：portal 渲染到 body，避免被侧边栏 overflow 裁剪 */}
      {hovered &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              top: hovered.top,
              left: hovered.left + 8,
              transform: "translateY(-50%)",
            }}
          >
            <div className="bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-xl px-3 py-2 whitespace-nowrap border border-white/10">
              <div className="font-bold">{hovered.label}</div>
              {hovered.description && (
                <div className="text-slate-300 mt-0.5 text-[11px]">
                  {hovered.description}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
