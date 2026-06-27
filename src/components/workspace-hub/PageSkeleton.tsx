"use client";

import React from "react";

export default function PageSkeleton() {
  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff] overflow-hidden pb-12">
      {/* 顶栏骨架 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-200 animate-pulse" />
          <div className="space-y-1.5">
            <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
            <div className="w-36 h-2.5 bg-slate-200/60 rounded animate-pulse" />
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
      </header>

      {/* 核心区骨架 */}
      <main className="relative z-10 max-w-[1440px] mx-auto px-6 py-8 space-y-6">
        {/* 用户欢迎条骨架 */}
        <div className="p-6 bg-white/70 border border-slate-200 shadow-md rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-48 h-6 bg-slate-200 rounded animate-pulse" />
              <div className="w-16 h-4 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="w-full max-w-xl h-3 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="w-28 h-10 bg-slate-200 rounded-xl animate-pulse" />
        </div>

        {/* Bento 网格布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-6">
          {/* 左侧区域：占 8 列 */}
          <div className="lg:col-span-8 space-y-6">
            {/* 个人空间卡片骨架 */}
            <div className="bg-white/70 border border-slate-200 shadow-md rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                <div className="w-1.5 h-4 bg-slate-200 rounded-full animate-pulse" />
                <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
              </div>
              <div className="p-5 bg-white/60 border border-slate-200/80 rounded-xl flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-slate-200 animate-pulse" />
                    <div className="w-32 h-5 bg-slate-200 rounded animate-pulse" />
                    <div className="w-12 h-4 bg-slate-200 rounded animate-pulse" />
                  </div>
                  <div className="w-64 h-3.5 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="w-24 h-9 bg-slate-200 rounded-lg animate-pulse" />
              </div>
            </div>

            {/* 企业空间网格骨架 */}
            <div className="bg-white/70 border border-slate-200 shadow-md rounded-2xl p-6 space-y-4 min-h-[300px]">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-4 bg-slate-200 rounded-full animate-pulse" />
                  <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="w-28 h-8 bg-slate-200 rounded-lg animate-pulse" />
                  <div className="w-24 h-8 bg-slate-200 rounded-lg animate-pulse" />
                </div>
              </div>

              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 bg-white/60 border border-slate-200/80 rounded-xl flex justify-between items-center">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-8 h-8 rounded bg-slate-200 animate-pulse" />
                      <div className="space-y-2 flex-1">
                        <div className="w-40 h-4 bg-slate-200 rounded animate-pulse" />
                        <div className="w-24 h-3 bg-slate-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-16 h-8 bg-slate-200 rounded-lg animate-pulse" />
                      <div className="w-12 h-8 bg-slate-200 rounded-lg animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧边栏：占 4 列 */}
          <div className="lg:col-span-4 space-y-6">
            {/* 特权资源仪表盘骨架 */}
            <div className="bg-white/70 border border-slate-200 shadow-md rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="w-1.5 h-4 bg-slate-200 rounded-full animate-pulse" />
                <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
              </div>
              <div className="flex items-center gap-4 py-3">
                <div className="w-20 h-20 rounded-full bg-slate-200 animate-pulse" />
                <div className="space-y-2 flex-1">
                  <div className="w-28 h-5 bg-slate-200 rounded animate-pulse" />
                  <div className="w-36 h-3 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="space-y-3 pt-2">
                {[1, 2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="w-16 h-3 bg-slate-200 rounded animate-pulse" />
                      <div className="w-12 h-3 bg-slate-200 rounded animate-pulse" />
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>

            {/* 快捷操作骨架 */}
            <div className="bg-white/70 border border-slate-200 shadow-md rounded-2xl p-6 space-y-3">
              <div className="w-full h-10 bg-slate-200 rounded-xl animate-pulse" />
              <div className="w-full h-10 bg-slate-200 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
