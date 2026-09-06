"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Crown,
  Zap,
  Receipt,
  Users,
  History,
  ChevronRight,
} from "lucide-react";

interface MembershipNavHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function MembershipNavHeader({
  title,
  subtitle,
  children,
}: MembershipNavHeaderProps) {
  const pathname = usePathname();

  const navTabs = [
    {
      label: "总览大屏",
      href: "/admin/membership",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "会员等级管理",
      href: "/admin/membership/levels",
      icon: Crown,
      exact: false,
    },
    {
      label: "Token加油包",
      href: "/admin/membership/token-packs",
      icon: Zap,
      exact: false,
    },
    {
      label: "会员订单管理",
      href: "/admin/membership/orders",
      icon: Receipt,
      exact: false,
    },
    {
      label: "会员用户管理",
      href: "/admin/membership/users",
      icon: Users,
      exact: false,
    },
    {
      label: "会员变更日志",
      href: "/admin/membership/logs",
      icon: History,
      exact: false,
    },
  ];

  return (
    <div className="mb-6 space-y-4">
      {/* 顶部标题栏与面包屑 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
            <Link href="/admin" className="hover:text-[#3182ce] transition-colors">
              管理后台
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <Link href="/admin/membership" className="hover:text-[#3182ce] transition-colors">
              会员中枢
            </Link>
            {title && title !== "会员管理" && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-slate-700 font-bold">{title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-6 rounded-full bg-gradient-to-b from-[#4299e1] to-[#3182ce]" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              {title || "会员管理"}
            </h1>
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 font-medium mt-1 ml-4.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* 右侧自定义操作区域 */}
        {children && <div className="flex items-center gap-2.5">{children}</div>}
      </div>

      {/* 横向导航选项卡（大厂级精致平滑风格） */}
      <div className="bg-white/70 backdrop-blur-md rounded-xl p-1.5 border border-slate-200/80 shadow-2xs flex items-center gap-1 overflow-x-auto scrollbar-none">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-xs scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
