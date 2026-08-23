"use client";

import { Wrench, ArrowLeft, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MaintenancePage() {
  const router = useRouter();

  return (
    <div className="p-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Wrench className="w-8 h-8 text-amber-500" />
            维护模式设置
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            开关平台的全局停机维护模式。维护期间，非管理员访问将被拦截并展示维护页。
          </p>
        </div>
        <button
          onClick={() => router.push("/admin")}
          className="h-10 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          返回大盘
        </button>
      </div>

      {/* 维护模式状态卡片 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-xl text-left space-y-6">
        <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-500 leading-relaxed font-semibold">
            <span className="text-slate-800 font-bold block mb-1">高危操作提示</span>
            开启维护模式后，系统将自动拒绝所有常规用户的前台调用请求，并断开与模拟沙箱的任务接口。请确认系统升级或部署工作已就绪再执行该操作。
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-6">
          <div>
            <span className="text-sm font-extrabold text-slate-800 block">当前维护状态</span>
            <span className="text-xs text-slate-400 font-semibold mt-0.5 block">系统目前正处于健康运行中</span>
          </div>
          <span className="px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black rounded-full text-xs">
            运行中 (正常)
          </span>
        </div>

        <button className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center">
          ⚡ 开启全局停机维护模式
        </button>
      </div>
    </div>
  );
}
