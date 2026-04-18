"use client";

import { ExternalLink } from "lucide-react";

export default function CTA() {
  return (
    <>
      {/* Section 7: CTA */}
      <section className="py-24 bg-white relative overflow-hidden">
        {/* Decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-50 opacity-40 blur-[100px] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            开启下一代
            <span className="text-[#2b6cb0]">软件工程新纪元</span>
          </h2>
          <p className="text-slate-500 text-lg mb-8 font-medium">
            7 天免费试用 · 专属架构师 1v1 支持
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="w-full sm:w-auto px-10 py-4 bg-[#2b6cb0] text-white font-bold rounded-4 shadow-xl hover:bg-[#2c5282] hover:scale-105 transition-all text-lg">
              申请私有化演示
            </button>
            <button className="w-full sm:w-auto px-10 py-4 border-2 border-slate-200 text-slate-600 font-bold rounded-4 hover:bg-slate-50 transition-all text-lg flex items-center justify-center gap-2">
              查阅开发者白皮书 <ExternalLink className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
