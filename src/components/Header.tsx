"use client";

import { Hexagon, ChevronDown, Search } from "lucide-react";

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 bg-[#2b6cb0] flex items-center justify-center rounded-8 shadow-sm">
            <Hexagon className="text-white w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            知阁·舟坊 <span className="text-[#2b6cb0]">ZhiGe Dockyard</span>
          </span>
        </div>

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#2b6cb0]">
            产品能力 <ChevronDown className="w-4 h-4" />
          </div>
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#2b6cb0]">
            解决方案 <ChevronDown className="w-4 h-4" />
          </div>
          <a href="#" className="hover:text-[#2b6cb0]">
            私有化与安全
          </a>
          <a href="#" className="hover:text-[#2b6cb0]">
            价格方案
          </a>
          <a href="#" className="hover:text-[#2b6cb0]">
            开发者文档
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:text-[#2b6cb0]">
            <Search className="w-5 h-5" />
          </button>
          <button className="text-sm font-medium px-4 py-2 text-slate-600 hover:text-slate-900">
            登录
          </button>
          <button className="text-sm font-semibold bg-[#2b6cb0] text-white px-5 py-2.5 rounded-4 hover:bg-[#2c5282] transition-colors shadow-sm">
            进入造物工坊
          </button>
        </div>
      </div>
    </header>
  );
}
