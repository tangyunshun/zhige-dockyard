"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, ArrowRight, X, Check, ShieldCheck, Tag } from "lucide-react";
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

interface SystemUpdateSettings {
  autoCheckUpdate: boolean;
  notifyModalEnabled: boolean;
  forceUpdate: boolean;
  minSupportedVersion: string;
  releaseChannel: "STABLE" | "BETA";
  customDownloadUrl: string;
  popupTitle: string;
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
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [latestRelease, setLatestRelease] = useState<ReleaseNote | null>(null);
  const [currentVersion, setCurrentVersion] = useState("v1.0.0");
  const [updateSettings, setUpdateSettings] = useState<SystemUpdateSettings | null>(null);

  // 后台管理、维护拦截页、公示页不自动弹窗
  const isExcludedPage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/releases");

  const checkVersionUpdate = useCallback(
    async (manual: boolean = false) => {
      try {
        const res = await fetch(`/api/system/maintenance?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        const releases: ReleaseNote[] = data.releases || [];
        const settings: SystemUpdateSettings = data.updateSettings;
        const curVer: string = data.currentVersion || "v1.0.0";

        setCurrentVersion(curVer);
        setUpdateSettings(settings);

        const published = releases.filter((r) => r.isPublished);
        const topRelease = published.length > 0 ? published[0] : null;

        if (!topRelease) {
          if (manual) {
            toast.success(`当前已是最新运行版本 (${curVer})，系统服务稳定运行`);
          }
          return;
        }

        setLatestRelease(topRelease);

        const lastAck = typeof window !== "undefined" ? localStorage.getItem("zg_ack_release") : null;

        if (manual) {
          // 手动检查更新模式：若已是最新版，给予正向反馈；若有更新，主动弹出
          if (lastAck === topRelease.version) {
            toast.success(`当前已是最新版本 (${topRelease.version})，暂无待升级项目`);
          } else {
            setIsOpen(true);
          }
        } else {
          // 自动检测模式：仅在配置了弹窗广播且未确认过时弹出
          if (settings && !settings.notifyModalEnabled) {
            return;
          }
          if (lastAck !== topRelease.version && !isExcludedPage) {
            // 稍作延迟展示，避免与页面初次渲染争抢焦点
            const timer = setTimeout(() => {
              setIsOpen(true);
            }, 1200);
            return () => clearTimeout(timer);
          }
        }
      } catch {
        if (manual) {
          toast.error("检查更新失败，请稍后重试");
        }
      }
    },
    [isExcludedPage, toast]
  );

  useEffect(() => {
    checkVersionUpdate(false);

    // 监听手动检查更新自定义事件
    const handleManualCheck = () => {
      checkVersionUpdate(true);
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

  const handleViewAllReleases = () => {
    if (latestRelease) {
      localStorage.setItem("zg_ack_release", latestRelease.version);
    }
    setIsOpen(false);
    router.push("/releases?tab=releases");
  };

  if (!isOpen || !latestRelease) {
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
        {/* 顶部标题横幅 */}
        <div className="p-5 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white border-b border-blue-100/70 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* 系统 3D 棱镜立体 Logo */}
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
                  {updateSettings?.popupTitle || "知阁·舟坊新版本发布公告"}
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

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span className="flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>全量资产经过自动化校验与回归测试</span>
            </span>
            <button
              type="button"
              onClick={handleViewAllReleases}
              className="text-[#3182ce] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
            >
              <span>查看更新日志</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleViewAllReleases}
            className="h-8 px-3 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-[4px] transition-colors cursor-pointer"
          >
            完整发版公告
          </button>
          <button
            type="button"
            onClick={handleAcknowledge}
            className="h-8 px-4 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            <span>我知道了</span>
          </button>
        </div>
      </div>
    </div>
  );
}
