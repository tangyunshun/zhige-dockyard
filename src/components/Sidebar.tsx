"use client";

import { useState } from "react";
import { ChevronDown, Search, Settings, FileText, Code, Database, Layout } from "lucide-react";
import { Logo } from "./Logo";

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "全局视图",
    items: [
      {
        icon: <Layout className="w-4 h-4" />,
        label: "工作台 (Workspace)",
      },
    ],
  },
  {
    title: "组件矩阵",
    items: [
      {
        icon: <FileText className="w-4 h-4" />,
        label: "商机与售前打单",
        count: 6,
        active: true,
      },
      {
        icon: <Code className="w-4 h-4" />,
        label: "需求定义与设计",
        count: 4,
      },
      {
        icon: <Database className="w-4 h-4" />,
        label: "后端核心与 API",
        count: 6,
      },
    ],
  },
  {
    title: "系统底座",
    items: [
      {
        icon: <Settings className="w-4 h-4" />,
        label: "全局设置规范",
      },
    ],
  },
];

export default function Sidebar() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "全局视图": true,
    "组件矩阵": true,
    "系统底座": true,
  });

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <aside className="w-[240px] flex-shrink-0 bg-[#eaf4fc] text-[#1e293b] flex flex-col border-r border-[var(--zhige-border)] shadow-xl md:shadow-none z-30 h-screen">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-[var(--zhige-border)] flex-shrink-0">
        <Logo variant="light" />
      </div>

      {/* Tenant Selector */}
      <div className="p-4 border-b border-[var(--zhige-border)]">
        <div className="bg-white rounded-[var(--radius-btn)] p-2 px-3 flex justify-between items-center cursor-pointer border border-[var(--zhige-border)] hover:border-[var(--zhige-primary)] transition shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              A
            </div>
            <span className="text-sm font-medium">安泰集团</span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {menuSections.map((section) => (
          <div key={section.title}>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-2 px-3">
              {section.title}
            </div>
            {section.items.map((item, index) => (
              <div
                key={index}
                className={`flex items-center justify-between px-3 py-2 rounded-[var(--radius-btn)] cursor-pointer transition-all mb-1 ${
                  item.active
                    ? "bg-[var(--zhige-primary-light)] text-[var(--zhige-primary)] font-semibold"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={item.active ? "text-[var(--zhige-primary)]" : "text-slate-400"}>
                    {item.icon}
                  </span>
                  <span className="text-sm">{item.label}</span>
                </div>
                {item.count && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {item.count}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
