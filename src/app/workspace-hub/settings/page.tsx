"use client";

import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Settings, ArrowLeft, Bell, Palette, User, Shield } from "lucide-react";

export default function PersonalWorkspaceSettings() {
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#059669] shadow-2xl shadow-[#10b981]/30 mb-6">
            <Settings className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-3 tracking-tight">
            个人空间设置
          </h1>
          <p className="text-lg text-slate-600 font-medium max-w-2xl mb-8">
            此功能正在开发中，敬请期待
          </p>

          {/* 功能预告 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mt-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#3182ce]/20">
                <User className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                空间配置
              </h3>
              <p className="text-xs text-slate-600">
                设置空间名称、描述和基本信息
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#f59e0b]/20">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                个性化 UI
              </h3>
              <p className="text-xs text-slate-600">
                自定义主题色和界面风格
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#10b981]/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                通知偏好
              </h3>
              <p className="text-xs text-slate-600">
                管理通知设置和提醒方式
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center mb-3 mx-auto shadow-lg shadow-[#8b5cf6]/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                隐私设置
              </h3>
              <p className="text-xs text-slate-600">
                控制数据可见性和隐私权限
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
