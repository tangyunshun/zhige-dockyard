"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { X, Check, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  type: "FEATURE" | "OPTIMIZE" | "BUGFIX" | "SECURITY";
  publishDate: string;
  isPublished: boolean;
  author: string;
  items: string[];
}

export const CHECK_UPDATE_EVENT = "zhige:check-system-update";

/**
 * 供前台任意位置触发“检查系统版本更新”
 */
export function triggerCheckUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHECK_UPDATE_EVENT));
  }
}

export default function WhatsNewModal() {
  const pathname = usePathname();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [latestRelease, setLatestRelease] = useState<ReleaseNote | null>(null);
  const [currentVersion, setCurrentVersion] = useState("v1.0.0");
  const [releaseChannel, setReleaseChannel] = useState("STABLE");
  const [popupTitle, setPopupTitle] = useState("知阁·舟坊新版本发布公告");
  const [serviceLatency, setServiceLatency] = useState(0);
  const [serviceStatus, setServiceStatus] = useState<"HEALTHY" | "DEGRADED">("HEALTHY");
  const [checkedTime, setCheckedTime] = useState("");

  // 后台管理、维护拦截页、公示页不自动弹窗
  const isExcludedPage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/releases");

  const checkVersionUpdate = useCallback(
    async (manual: boolean = false) => {
      try {
        const res = await fetch(`/api/system/check-update?t=${Date.now()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (manual) {
            const friendlyMsg =
              data?.message && data.message !== "未提供身份凭证"
                ? data.message
                : "系统版本检测服务暂时不可用，请稍后重试";
            toast.error(friendlyMsg);
          }
          return;
        }

        setCurrentVersion(data.currentVersion || "v1.0.0");
        setReleaseChannel(data.releaseChannel || "STABLE");
        setPopupTitle(data.popupTitle || "知阁·舟坊新版本发布公告");
        setServiceLatency(typeof data.serviceLatencyMs === "number" ? data.serviceLatencyMs : 0);
        setServiceStatus(data.serviceStatus || "HEALTHY");
        setCheckedTime(data.checkedAt || new Date().toLocaleTimeString("zh-CN"));

        const lastAck = typeof window !== "undefined" ? localStorage.getItem("zg_ack_release") : null;

        if (data.hasUpdate && data.latestRelease) {
          setLatestRelease(data.latestRelease);
          if (manual) {
            setIsUpToDate(false);
            setIsOpen(true);
          } else {
            // 自动检测模式：仅在配置了弹窗广播且未确认过时弹出
            if (data.notifyModalEnabled && lastAck !== data.latestRelease.version && !isExcludedPage) {
              setIsUpToDate(false);
              const timer = setTimeout(() => {
                setIsOpen(true);
              }, 1200);
              return () => clearTimeout(timer);
            }
          }
        } else {
          setLatestRelease(null);
          if (manual) {
            setIsUpToDate(true);
            setIsOpen(true);
          }
        }
      } catch {
        if (manual) {
          toast.error("检查更新异常，请检查网络连接");
        }
      }
    },
    [isExcludedPage, toast]
  );

  useEffect(() => {
    checkVersionUpdate(false);

    // 监听手动检查更新自定义事件（支持接收已由真实网络请求返回的 payload）
    const handleManualCheck = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.success) {
        const detail = customEvent.detail;
        setCurrentVersion(detail.currentVersion || "v1.0.0");
        setReleaseChannel(detail.releaseChannel || "STABLE");
        setPopupTitle(detail.popupTitle || "知阁·舟坊新版本发布公告");
        setServiceLatency(typeof detail.serviceLatencyMs === "number" ? detail.serviceLatencyMs : 0);
        setServiceStatus(detail.serviceStatus || "HEALTHY");
        setCheckedTime(detail.checkedAt || new Date().toLocaleTimeString("zh-CN"));

        if (detail.hasUpdate && detail.latestRelease) {
          setLatestRelease(detail.latestRelease);
          setIsUpToDate(false);
        } else {
          setLatestRelease(null);
          setIsUpToDate(true);
        }
        setIsOpen(true);
      } else {
        checkVersionUpdate(true);
      }
    };

    window.addEventListener(CHECK_UPDATE_EVENT, handleManualCheck);
    return () => {
      window.removeEventListener(CHECK_UPDATE_EVENT, handleManualCheck);
    };
  }, [checkVersionUpdate]);

  const handleAcknowledge = () => {
    if (latestRelease) {
      localStorage.setItem("zg_ack_release", latestRelease.version);
    }
    setIsOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  const getTypeBadge = (type: ReleaseNote["type"]) => {
    switch (type) {
      case "FEATURE":
        return <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-blue-50 text-[#2b6cb0] border border-blue-200">新功能特性</span>;
      case "OPTIMIZE":
        return <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">体验优化</span>;
      case "BUGFIX":
        return <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">问题修复</span>;
      case "SECURITY":
        return <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-red-50 text-red-700 border border-red-200">安全加固</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
      <div className="bg-white rounded-[8px] border border-blue-100 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 视窗分支一：当前已是最新运行版本 */}
        {isUpToDate || !latestRelease ? (
          <>
            {/* 顶部标题横幅 */}
            <div className="p-5 bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-white border-b border-emerald-100/70 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex-shrink-0">
                  <svg className="w-full h-full" viewBox="20 20 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="wnLogoUpGrad" x1="0" y1="0" x2="200" y2="200">
                        <stop offset="0%" stopColor="#3182ce" />
                        <stop offset="100%" stopColor="#1a365d" />
                      </linearGradient>
                      <linearGradient id="wnLogoUpLight" x1="200" y1="0" x2="0" y2="200">
                        <stop offset="0%" stopColor="#63b3ed" />
                        <stop offset="100%" stopColor="#3182ce" />
                      </linearGradient>
                    </defs>
                    <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#wnLogoUpGrad)" />
                    <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#2b6cb0" opacity={0.8} />
                    <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#wnLogoUpLight)" />
                    <circle cx="100" cy="105" r="14" fill="#ebf8ff" />
                    <circle cx="100" cy="105" r="6" fill="#ffffff" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">
                      知阁·舟坊系统版本检查
                    </h3>
                    <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-emerald-600 text-white font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      最新版本
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    检查时间：{checkedTime || "刚刚"} · 发行通道：{releaseChannel === "BETA" ? "Beta 先锋" : "Stable 稳定生产"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                title="关闭"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 健康状态主体 */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3.5 p-4 rounded-[6px] bg-gradient-to-br from-emerald-50/90 to-teal-50/40 border border-emerald-200/80">
                <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 shadow-xs border border-emerald-300/40">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-black text-emerald-950">当前已是最新运行版本</div>
                  <div className="text-xs text-emerald-800 font-medium mt-0.5 leading-relaxed">
                    知阁·舟坊平台各业务模块均处于最佳稳定状态，未检测到待安装的系统更新补丁。
                  </div>
                </div>
              </div>

              {/* 核心指标元数据看板：真实后端接口返回，杜绝任何硬编码模拟 */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-[6px] border border-slate-200/70">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">系统当前版本</div>
                  <div className="text-sm font-black text-slate-800 font-mono mt-0.5">
                    {currentVersion}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-[6px] border border-slate-200/70">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">服务通信状态</div>
                  <div className="text-sm font-black text-emerald-600 flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{serviceStatus === "DEGRADED" ? "降级运行" : `正常 (${serviceLatency}ms)`}</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-[6px] border border-slate-200/70">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">发布通道</div>
                  <div className="text-xs font-black text-slate-700 mt-0.5 truncate">
                    {releaseChannel === "BETA" ? "Beta 先锋体验版" : "Stable 官方稳定版"}
                  </div>
                </div>
              </div>

              <div className="flex items-center text-[11px] text-slate-400 pt-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>系统核心安全沙箱与服务均处于健康受护状态</span>
                </span>
              </div>
            </div>

            {/* 底部操作按钮：单一关闭，不开发重复发版入口 */}
            <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-8 px-5 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>完成</span>
              </button>
            </div>
          </>
        ) : (
          /* 视窗分支二：有新版本待升级发布公告 */
          <>
            {/* 顶部标题横幅 */}
            <div className="p-5 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white border-b border-blue-100/70 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex-shrink-0">
                  <svg className="w-full h-full" viewBox="20 20 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="wnLogoGradPrimary" x1="0" y1="0" x2="200" y2="200">
                        <stop offset="0%" stopColor="#3182ce" />
                        <stop offset="100%" stopColor="#1a365d" />
                      </linearGradient>
                      <linearGradient id="wnLogoGradLight" x1="200" y1="0" x2="0" y2="200">
                        <stop offset="0%" stopColor="#63b3ed" />
                        <stop offset="100%" stopColor="#3182ce" />
                      </linearGradient>
                    </defs>
                    <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#wnLogoGradPrimary)" />
                    <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#2b6cb0" opacity={0.8} />
                    <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#wnLogoGradLight)" />
                    <circle cx="100" cy="105" r="14" fill="#ebf8ff" />
                    <circle cx="100" cy="105" r="6" fill="#ffffff" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">
                      {popupTitle || "知阁·舟坊新版本发布公告"}
                    </h3>
                    <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-[#3182ce] text-white font-mono">
                      {latestRelease.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    发版时间：{latestRelease.publishDate} · 发布人：{latestRelease.author}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAcknowledge}
                className="w-7 h-7 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                title="关闭公告"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 版本要点主体 */}
            <div className="p-5 space-y-3.5">
              <div className="flex items-center gap-2">
                {getTypeBadge(latestRelease.type)}
                <h4 className="text-xs font-black text-slate-800">{latestRelease.title}</h4>
              </div>

              <div className="bg-slate-50/80 rounded-[6px] border border-slate-200/80 p-3 space-y-2 max-h-56 overflow-y-auto">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  本次版本重点改进清单：
                </span>
                <div className="space-y-1.5 pl-1">
                  {latestRelease.items.map((item, idx) => (
                    <div key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] mt-1.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>全量资产经过自动化校验与回归测试</span>
                </span>
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={handleAcknowledge}
                className="h-8 px-5 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>我知道了</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
