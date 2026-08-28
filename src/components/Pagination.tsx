"use client";

import React, { useState } from "react";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronsLeft as ChevronsLeftIcon,
  ChevronsRight as ChevronsRightIcon,
} from "lucide-react";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  compact?: boolean;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
  itemLabel = "条数据",
  compact = false,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  // 快捷跳页
  const [jumperInput, setJumperInput] = useState("");

  const handleJumperSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPage = parseInt(jumperInput, 10);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      onPageChange(targetPage);
      setJumperInput("");
    }
  };

  // 智能计算包含省略号的页码数组
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) {
        pages.push("...");
      }
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) {
        pages.push("....");
      }
      pages.push(totalPages);
    }
    return pages;
  };

  // 紧凑模式（看板/小卡片底部专属极简一排化 UI）
  if (compact) {
    return (
      <div
        className={`bg-slate-50/90 border border-slate-200/70 rounded-xl p-2 flex items-center justify-between gap-1 text-xs select-none ${className}`}
      >
        {/* 左侧极简切片统计 */}
        <div className="text-[11px] text-slate-500 font-medium truncate font-mono">
          <span className="font-bold text-slate-800">{totalItems > 0 ? startIndex + 1 : 0}-{endIndex}</span>
          <span className="text-slate-400"> / </span>
          <span className="font-bold text-[#3182ce]">{totalItems}</span>
          <span className="text-[10px] text-slate-400 font-sans ml-1">条</span>
        </div>

        {/* 右侧极简按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={safeCurrentPage === 1}
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            className="w-6 h-6 rounded-md border border-slate-200/80 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center shadow-2xs"
            title="上一页"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono font-extrabold text-slate-700 px-1">
            {safeCurrentPage} / {totalPages}
          </span>

          <button
            type="button"
            disabled={safeCurrentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
            className="w-6 h-6 rounded-md border border-slate-200/80 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center shadow-2xs"
            title="下一页"
          >
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-medium ${className}`}
    >
      {/* 左侧：数据范围与切片统计 */}
      <div className="text-slate-500 font-semibold flex flex-wrap items-center gap-2">
        <span>
          显示第 <span className="font-mono font-black text-slate-800">{totalItems > 0 ? startIndex + 1 : 0}</span> -{" "}
          <span className="font-mono font-black text-slate-800">{endIndex}</span> 条，共{" "}
          <span className="font-mono font-black text-[#3182ce]">{totalItems}</span> {itemLabel}
        </span>
        <span className="text-[10px] text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-md font-mono border border-slate-200/50">
          每页 {pageSize} 条 | 第 {safeCurrentPage} / {totalPages} 页
        </span>
      </div>

      {/* 右侧：全功能操作控制 */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* 首页 */}
        <button
          type="button"
          disabled={safeCurrentPage === 1}
          onClick={() => onPageChange(1)}
          className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shrink-0"
          title="首页"
        >
          <ChevronsLeftIcon className="w-3.5 h-3.5" />
        </button>

        {/* 上一页 */}
        <button
          type="button"
          disabled={safeCurrentPage === 1}
          onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-extrabold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1 shrink-0"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
          <span>上一页</span>
        </button>

        {/* 页码按钮 */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (typeof page === "string") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold select-none">
                  •••
                </span>
              );
            }
            const isSelected = page === safeCurrentPage;
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`w-8 h-8 rounded-xl font-mono font-black text-xs transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#3182ce] text-white shadow-xs scale-105"
                    : "bg-slate-50 border border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* 下一页 */}
        <button
          type="button"
          disabled={safeCurrentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-extrabold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1 shrink-0"
        >
          <span>下一页</span>
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>

        {/* 尾页 */}
        <button
          type="button"
          disabled={safeCurrentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shrink-0"
          title="尾页"
        >
          <ChevronsRightIcon className="w-3.5 h-3.5" />
        </button>

        {/* 页码跳转 Jumper */}
        {totalPages > 3 && (
          <form onSubmit={handleJumperSubmit} className="flex items-center gap-1.5 pl-1">
            <span className="text-slate-400 text-[11px] font-bold">跳至</span>
            <input
              type="text"
              value={jumperInput}
              onChange={(e) => setJumperInput(e.target.value)}
              placeholder={`${safeCurrentPage}`}
              className="w-10 h-7 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-[#3182ce]"
            />
            <span className="text-slate-400 text-[11px] font-bold">页</span>
          </form>
        )}
      </div>
    </div>
  );
}
