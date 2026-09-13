"use client";

import { useState, useEffect } from "react";
import {
  Compass,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Clock,
  ShieldCheck,
  Server,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function PublicMaintenancePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [inMaintenance, setInMaintenance] = useState(true);
  const [message, setMessage] = useState("系统正在进行例行停机维护与功能升级，稍后即可恢复正常使用。");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");
  const [version, setVersion] = useState("v1.0.0");
  const [lastCheckedTime, setLastCheckedTime] = useState("");
  const [currentTask, setCurrentTask] = useState<any>(null);

  const checkStatus = async () => {
    try {
      setChecking(true);
      const res = await fetch(`/api/system/maintenance?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setInMaintenance(Boolean(data.maintenanceMode));
        if (data.maintenanceMessage) setMessage(data.maintenanceMessage);
        if (data.estimatedMinutes) setEstimatedMinutes(data.estimatedMinutes);
        if (data.currentVersion) setVersion(data.currentVersion);
        setLastCheckedTime(new Date().toLocaleTimeString("zh-CN"));

        // 匹配当前正在进行或排期中的计划任务
        const list = data.schedules || [];
        const matched = list.find((s: any) => s.status === "IN_PROGRESS") || list.find((s: any) => s.status === "SCHEDULED") || null;
        setCurrentTask(matched);

        // 若管理员已解除维护，自动提示并带回首页
        if (!data.maintenanceMode) {
          setTimeout(() => {
            router.push("/");
          }, 1500);
        }
      }
    } catch {
      // 网络偶发异常保持展示
    } finally {
      setChecking(false);
    }
  };

  const [logoClicks, setLogoClicks] = useState(0);
  const [tipText, setTipText] = useState("");

  // 监听管理员隐蔽运维快捷键 (Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        router.push("/auth/login?admin=true");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  const handleLogoClick = () => {
    const nextClicks = logoClicks + 1;
    if (nextClicks >= 3) {
      setLogoClicks(0);
      setTipText("");
      router.push("/auth/login?admin=true");
    } else {
      setLogoClicks(nextClicks);
      if (nextClicks === 2) {
        setTipText("再点击 1 次唤起运维通道");
        setTimeout(() => setTipText(""), 2500);
      }
      setTimeout(() => setLogoClicks(0), 3000);
    }
  };

  useEffect(() => {
    checkStatus();
    // 每 20 秒自动轮询一次维护解除状态
    const timer = setInterval(checkStatus, 20000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between items-center px-4 py-8 sm:p-10 font-sans text-slate-800 selection:bg-blue-100 relative overflow-hidden"
      style={{
        backgroundColor: "#f1f5f9",
        backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 顶部背景微光氛围装饰（提升大厂高级质感，非刺眼色块） */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-300/10 rounded-full blur-3xl pointer-events-none" />

      {/* 顶部品牌标识（完全统一系统官方 Logo 与版本徽标） */}
      <header className="w-full max-w-2xl flex items-center justify-between z-10">
        <div
          className="flex items-center gap-3 cursor-pointer select-none group relative"
          onClick={handleLogoClick}
          title="知阁·舟坊（连续点击 3 次可唤起运维接入通道）"
        >
          {/* 系统统一的品牌 3D 立体矢量飞船图形 */}
          <div className="w-9 h-9 flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
            <svg
              className="w-full h-full"
              viewBox="20 20 160 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="maintLogoGradPrimary" x1="0" y1="0" x2="200" y2="200">
                  <stop offset="0%" stopColor="#3182ce" />
                  <stop offset="100%" stopColor="#1a365d" />
                </linearGradient>
                <linearGradient id="maintLogoGradLight" x1="200" y1="0" x2="0" y2="200">
                  <stop offset="0%" stopColor="#63b3ed" />
                  <stop offset="100%" stopColor="#3182ce" />
                </linearGradient>
              </defs>
              <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#maintLogoGradPrimary)" />
              <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#2b6cb0" opacity={0.8} />
              <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#maintLogoGradLight)" />
              <circle cx="100" cy="105" r="14" fill="#ebf8ff" />
              <circle cx="100" cy="105" r="6" fill="#ffffff" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">
                知阁·舟坊
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60 font-mono">
                {version}
              </span>
              {tipText && (
                <span className="animate-in fade-in zoom-in-90 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
                  {tipText}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              ZhiGe Dockyard Engineering
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium bg-white/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <span>全平台运维保障中枢</span>
        </div>
      </header>

      {/* 核心中央维护公告大卡片（遵循知阁 50+ 组件库精修标准） */}
      <main className="w-full max-w-2xl my-auto z-10 pt-4 pb-6">
        <div className="bg-white/85 backdrop-blur-2xl rounded-2xl border border-white/90 shadow-2xl shadow-slate-900/5 p-6 sm:p-10 space-y-6 relative overflow-hidden transition-all">
          {inMaintenance ? (
            <>
              {/* 核心视觉动效：罗盘与齿轮双层动态光环 */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative inline-flex items-center justify-center p-3">
                  {/* 外层微动呼吸光环 */}
                  <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-inner relative">
                    <Compass className="w-10 h-10 text-[#3182ce] animate-spin" style={{ animationDuration: "20s" }} />
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 shadow-xs" />
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>系统计划内停机维护进行中</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                    知阁·舟坊 平台服务升级公告
                  </h1>
                </div>
              </div>

              {/* 结构化公告正文卡片（左侧渐变强调条，高信息密度大厂风格） */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-5 text-left relative overflow-hidden shadow-2xs">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#3182ce] to-blue-400" />
                <div className="space-y-1.5 pl-1.5">
                  <span className="text-[11px] font-bold text-[#2b6cb0] uppercase tracking-wider block">
                    公告详细说明
                  </span>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-line">
                    {message}
                  </p>
                </div>
              </div>

              {/* 若后台有具体维护任务，结构化关联展示 */}
              {currentTask && (
                <div className="bg-blue-50/60 border border-blue-200/70 rounded-xl p-4 text-left space-y-2 relative overflow-hidden shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#3182ce] text-white shadow-2xs">
                        关联维护任务
                      </span>
                      <h3 className="text-xs font-black text-slate-800">
                        {currentTask.title}
                      </h3>
                    </div>
                    {currentTask.type && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-[#2b6cb0] border border-blue-200">
                        {currentTask.type === "UPGRADE" ? "系统升级" : currentTask.type === "DATABASE" ? "数据库维护" : currentTask.type === "HARDWARE" ? "硬件扩容" : "巡检优化"}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-600 font-medium flex items-center gap-3 flex-wrap">
                    <span>
                      起止排期：{currentTask.startTime ? new Date(currentTask.startTime).toLocaleTimeString("zh-CN", {hour: "2-digit", minute:"2-digit"}) : "-"} ~ {currentTask.endTime ? new Date(currentTask.endTime).toLocaleTimeString("zh-CN", {hour: "2-digit", minute:"2-digit"}) : "-"}
                    </span>
                    <span>·</span>
                    <span>影响范围：{currentTask.scope || "全系统例行维护"}</span>
                  </div>
                </div>
              )}

              {/* 4 维运维保障指标看板（2x2 宫格，精致小巧） */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center gap-3.5 shadow-2xs hover:border-blue-200 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">预估耗时</div>
                    <div className="text-xs font-black text-slate-800">约 {estimatedMinutes} 分钟</div>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center gap-3.5 shadow-2xs hover:border-emerald-200 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">数据安全</div>
                    <div className="text-xs font-black text-slate-800">全量冷备 · 资产无损</div>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center gap-3.5 shadow-2xs hover:border-indigo-200 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">影响范围</div>
                    <div className="text-xs font-black text-slate-800">前台暂停 · 后台维护</div>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center gap-3.5 shadow-2xs hover:border-amber-200 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">服务恢复</div>
                    <div className="text-xs font-black text-slate-800">维护完成自动开放</div>
                  </div>
                </div>
              </div>

              {/* 底部控制区：状态检测与刷新操作 */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => router.push("/releases?tab=schedules")}
                  className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>查看全平台维护排期与动态</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {lastCheckedTime ? `已于 ${lastCheckedTime} 自动自检` : "后台每隔 20 秒自动轮询检测"}
                  </span>

                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={checking}
                    className="h-9 px-4 bg-gradient-to-b from-[#3b82f6] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm shadow-blue-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                    <span>{checking ? "检测中..." : "刷新状态"}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* 维护已解除后的丝滑过渡卡片 */
            <div className="space-y-4 py-8 text-center animate-in fade-in-50 zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  系统维护已顺利完成，服务已全面恢复！
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  所有前台功能与数据已恢复正常服务，正在为您自动导航至工作台...
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="h-10 px-6 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-lg transition-all cursor-pointer inline-flex items-center gap-2 shadow-md shadow-blue-500/20 active:scale-95"
                >
                  <span>立即进入工作台</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部版权与官方运维保障标识（底栏纯净展示，不暴露任何可见入口） */}
      <footer className="w-full max-w-2xl flex items-center justify-between text-[11px] text-slate-400 font-medium z-10">
        <span>知阁·舟坊 (ZhiGe Dockyard) · 官方运维保障中心</span>
        <span className="text-slate-400 select-none">系统持续自检中</span>
      </footer>
    </div>
  );
}
