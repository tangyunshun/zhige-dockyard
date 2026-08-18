"use client";

import { HeartPulse, ArrowLeft, RefreshCw, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SystemStatusPage() {
  const router = useRouter();

  return (
    <div className="p-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <HeartPulse className="w-8 h-8 text-[#e53e3e]" />
            系统运行状态
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            监控和诊断系统底层微服务与关键中间件的实时健康程度与响应时间。
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

      {/* 服务健康状况 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { name: "主数据库连接", delay: "2ms", status: "运行正常" },
          { name: "模拟执行器集群", delay: "12ms", status: "运行正常" },
          { name: "系统文件对象存储", delay: "22ms", status: "运行正常" },
          { name: "全局缓存服务器", delay: "1ms", status: "运行正常" }
        ].map((srv, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left space-y-3 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{srv.name}</span>
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 font-black rounded text-[9px] select-none">
                {srv.status}
              </span>
            </div>
            <div className="flex items-baseline gap-1 pt-1.5">
              <span className="text-2xl font-black font-mono text-slate-800">{srv.delay}</span>
              <span className="text-xs text-slate-400 font-bold">响应延时</span>
            </div>
          </div>
        ))}
      </div>

      {/* 大厂风格系统诊断图表占位 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-left space-y-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          系统总体服务健康度评价 (HEALTHY)
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed font-semibold">
          各业务模块工作正常，未检测到崩溃日志或数据库慢查询，整体服务可用性达到 99.99%。
        </p>
      </div>
    </div>
  );
}
