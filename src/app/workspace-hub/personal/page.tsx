"use client";

import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { User, ArrowLeft, Code } from "lucide-react";

export default function PersonalWorkspacePlaceholder() {
  const router = useRouter();

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        {/* 点阵背景 */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* 弥散光晕 */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Logo variant="light" />

        <button
          onClick={() => router.push("/workspace-hub")}
          className="group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-[#3182ce] hover:bg-[#3182ce]/5 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          返回工作区选择
        </button>
      </header>

      {/* 核心区 */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8">
        {/* 开发中标识 */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-2xl shadow-[#f59e0b]/30 mb-6">
            <Code className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-3 tracking-tight">
            此页面正在开发中
          </h1>
          <p className="text-lg text-slate-600 font-medium max-w-2xl mb-8">
            个人空间功能即将上线，敬请期待
          </p>

          {/* 功能预告 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mt-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#3182ce]/20">
                <User className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                私密空间
              </h3>
              <p className="text-xs text-slate-600">
                数据仅自己可见，安全私密
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#10b981]/20">
                <Code className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                组件体验
              </h3>
              <p className="text-xs text-slate-600">
                包含基础的研发组件功能
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#f59e0b]/20">
                <User className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                个人管理
              </h3>
              <p className="text-xs text-slate-600">
                管理您的个人信息和偏好设置
              </p>
            </div>
          </div>

          {/* 返回按钮 */}
          <button
            onClick={() => router.push("/workspace-hub")}
            className="mt-10 inline-flex items-center justify-center h-[42px] px-[22px] rounded-[10px] text-[15px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回工作区选择
          </button>
        </div>
      </main>
    </div>
  );
}
