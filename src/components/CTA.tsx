"use client";

import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

export default function CTA() {
  const router = useRouter();

  return (
    <>
      {/* Section 7: CTA */}
      <section className="py-24 bg-gradient-to-br from-white via-blue-50/30 to-white relative overflow-hidden">
        {/* Decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-100/40 to-indigo-100/30 opacity-60 blur-[120px] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-slate-900">
            开启下一代
            <span className="bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-transparent bg-clip-text">
              软件工程新纪元
            </span>
          </h2>
          <p className="text-slate-500 text-lg mb-10 font-medium leading-relaxed">
            7 天免费试用 · 专属架构师 1v1 支持
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push("/demo")}
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white font-bold rounded-lg shadow-xl shadow-[#3182ce]/30 hover:shadow-2xl hover:shadow-[#3182ce]/40 hover:scale-105 transition-all text-lg transform hover:-translate-y-0.5 cursor-pointer"
            >
              申请私有化演示
            </button>
            <button
              onClick={() => router.push("/docs")}
              className="w-full sm:w-auto px-10 py-4 border-2 border-slate-200 text-slate-600 font-bold rounded-lg hover:border-[#3182ce] hover:text-[#3182ce] hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-white transition-all text-lg flex items-center justify-center gap-2 group cursor-pointer"
            >
              查阅开发者白皮书{" "}
              <ExternalLink className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
