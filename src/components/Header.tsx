"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Logo } from "./Logo";

export default function Header() {
  const router = useRouter();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/65 backdrop-blur-2xl border-b border-white/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <Logo className="flex items-center" variant="light" />

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#3182ce] transition-colors">
            产品能力{" "}
            <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
          </div>
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#3182ce] transition-colors">
            解决方案{" "}
            <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
          </div>
          <a
            href="#security"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#security");
            }}
          >
            私有化与安全
          </a>
          <a
            href="#pricing"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#pricing");
            }}
          >
            价格方案
          </a>
          <a
            href="#docs"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#docs");
            }}
          >
            开发者文档
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:text-[#3182ce] transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => router.push("/auth/login")}
            className="text-sm font-medium px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            登录
          </button>
          <button
            onClick={() => router.push("/workbench")}
            className="text-sm font-semibold bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white px-5 py-2.5 rounded-lg hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            进入造物工坊
          </button>
        </div>
      </div>
    </header>
  );
}
