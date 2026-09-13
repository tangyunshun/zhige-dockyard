"use client";

import { useState, useEffect } from "react";
import {
  History,
  Tag,
  ArrowLeft,
  Calendar,
  Check,
  Layers,
  RefreshCw,
  ArrowRight,
  Clock,
  ShieldCheck,
  Server,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  FileText,
  X,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { triggerCheckUpdate } from "@/components/WhatsNewModal";

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

interface MaintenanceSchedule {
  id: string;
  title: string;
  type: "UPGRADE" | "DATABASE" | "HARDWARE" | "INSPECT";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startTime: string;
  endTime: string;
  manager: string;
  scope: string;
  description: string;
  actualResult?: string;
  isDowntime?: boolean;
}

export default function ReleasesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [currentVersion, setCurrentVersion] = useState("v1.0.0");
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<"schedules" | "releases">("schedules");
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<MaintenanceSchedule | null>(null);

  // 分页控制（每页固定 5 条，支持分页）
  const PAGE_SIZE = 5;
  const [schedulePage, setSchedulePage] = useState(1);
  const [releasePage, setReleasePage] = useState(1);

  const totalSchedulePages = Math.max(1, Math.ceil(schedules.length / PAGE_SIZE));
  const currentSchedulePage = Math.min(schedulePage, totalSchedulePages);
  const paginatedSchedules = schedules.slice(
    (currentSchedulePage - 1) * PAGE_SIZE,
    currentSchedulePage * PAGE_SIZE
  );

  const totalReleasePages = Math.max(1, Math.ceil(releases.length / PAGE_SIZE));
  const currentReleasePage = Math.min(releasePage, totalReleasePages);
  const paginatedReleases = releases.slice(
    (currentReleasePage - 1) * PAGE_SIZE,
    currentReleasePage * PAGE_SIZE
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "releases") {
      setActiveTab("releases");
    } else if (tab === "schedules") {
      setActiveTab("schedules");
    }
  }, [searchParams]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/system/maintenance?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.currentVersion) setCurrentVersion(data.currentVersion);
        // 前台仅展示全网公示中的发版公告
        const publishedOnly = (data.releases || []).filter((r: ReleaseNote) => r.isPublished);
        setReleases(publishedOnly);
        // 同步拉取并公示计划维护任务
        setSchedules(data.schedules || []);

        // 若无计划维护任务但有发版，默认切换至发版日志
        if ((!data.schedules || data.schedules.length === 0) && publishedOnly.length > 0 && !searchParams.get("tab")) {
          setActiveTab("releases");
        }
      }
    } catch {
      // 保持空数据
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, []);

  function getScheduleTypeBadge(type: MaintenanceSchedule["type"]) {
    switch (type) {
      case "UPGRADE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200 whitespace-nowrap shrink-0">系统升级</span>;
      case "DATABASE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap shrink-0">数据库维护</span>;
      case "HARDWARE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap shrink-0">硬件扩容</span>;
      case "INSPECT":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap shrink-0">巡检优化</span>;
      default:
        return null;
    }
  }

  function getScheduleStatusBadge(status: MaintenanceSchedule["status"]) {
    switch (status) {
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
            <span>正在维护中</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[11px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200 shadow-2xs whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] shrink-0" />
            <span>计划排期中</span>
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>已顺利完成</span>
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap shrink-0">
            已取消
          </span>
        );
      default:
        return null;
    }
  }

  function formatDateTime(dtStr: string) {
    if (!dtStr) return "-";
    try {
      const d = new Date(dtStr);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dtStr;
    }
  }

  function getReleaseTypeBadge(type: ReleaseNote["type"]) {
    switch (type) {
      case "FEATURE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200 whitespace-nowrap shrink-0">功能上线</span>;
      case "OPTIMIZE":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">体验优化</span>;
      case "BUGFIX":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap shrink-0">缺陷修复</span>;
      case "SECURITY":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap shrink-0">安全加固</span>;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 font-sans pb-16">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-8 h-8 rounded-[4px] bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              title="返回上一页"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              {/* 系统统一的品牌 3D 立体矢量飞船图形 */}
              <div className="w-7 h-7 flex-shrink-0">
                <svg className="w-full h-full" viewBox="20 20 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="relLogoGradPrimary" x1="0" y1="0" x2="200" y2="200">
                      <stop offset="0%" stopColor="#3182ce" />
                      <stop offset="100%" stopColor="#1a365d" />
                    </linearGradient>
                    <linearGradient id="relLogoGradLight" x1="200" y1="0" x2="0" y2="200">
                      <stop offset="0%" stopColor="#63b3ed" />
                      <stop offset="100%" stopColor="#3182ce" />
                    </linearGradient>
                  </defs>
                  <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#relLogoGradPrimary)" />
                  <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#2b6cb0" opacity={0.8} />
                  <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#relLogoGradLight)" />
                  <circle cx="100" cy="105" r="14" fill="#ebf8ff" />
                  <circle cx="100" cy="105" r="6" fill="#ffffff" />
                </svg>
              </div>
              <span className="text-sm font-black text-slate-800">服务动态与版本公告</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-500 font-medium">当前运行基准:</span>
            <span className="px-2 py-0.5 rounded-[4px] text-xs font-black bg-blue-50 text-[#2b6cb0] border border-blue-200 font-mono">
              {currentVersion}
            </span>
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* 顶部说明横幅 */}
        <div className="bg-white rounded-[8px] border border-slate-200/90 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3182ce] shrink-0" />
              <h1 className="text-lg font-black text-slate-800 tracking-tight whitespace-nowrap">
                知阁·舟坊 平台运行与服务动态
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              实时公示系统例行维护排期与各版本更新日志，保障服务稳定运行与业务顺畅交付。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start md:self-auto whitespace-nowrap">
            <button
              type="button"
              onClick={triggerCheckUpdate}
              className="h-8 px-3 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200 text-xs font-bold rounded-[4px] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            >
              <Tag className="w-3.5 h-3.5 shrink-0" />
              <span>检查最新版本</span>
            </button>
            <button
              type="button"
              onClick={fetchReleases}
              disabled={loading}
              className="h-8 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-[4px] transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
              <span>刷新数据</span>
            </button>
          </div>
        </div>

        {/* 双 Tab 选项卡导航 */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("schedules")}
            className={`h-9 px-4 rounded-t-[6px] text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
              activeTab === "schedules"
                ? "border-[#3182ce] text-[#3182ce] bg-blue-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>计划中的维护任务</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "schedules"
                  ? "bg-[#3182ce] text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {schedules.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("releases")}
            className={`h-9 px-4 rounded-t-[6px] text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
              activeTab === "releases"
                ? "border-[#3182ce] text-[#3182ce] bg-blue-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>版本更新日志</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "releases"
                  ? "bg-[#3182ce] text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {releases.length}
            </span>
          </button>
        </div>

        {/* Tab 1：计划中的维护任务 */}
        {activeTab === "schedules" && (
          <div>
            {loading ? (
              <div className="bg-white rounded-[8px] border border-slate-200 p-12 text-center text-xs text-slate-400 font-medium">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#3182ce] mb-2" />
                正在从数据库加载最新维护排期...
              </div>
            ) : schedules.length === 0 ? (
              <div className="bg-white rounded-[8px] border border-dashed border-slate-200 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-[8px] bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs border border-emerald-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-xs font-black text-slate-800">全站服务正常运行 · 暂无维护排期</h3>
                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    当前底层服务与各业务模块运行平稳。如有升级或维护排期将提前在此公示。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="bg-white rounded-[8px] border border-slate-200/90 p-6 shadow-xs space-y-4 hover:border-blue-200 transition-colors relative overflow-hidden"
                  >
                    {/* 左侧状态色条 */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        sch.status === "IN_PROGRESS"
                          ? "bg-amber-500"
                          : sch.status === "SCHEDULED"
                          ? "bg-[#3182ce]"
                          : sch.status === "COMPLETED"
                          ? "bg-emerald-500"
                          : "bg-slate-300"
                      }`}
                    />

                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 pl-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        {getScheduleStatusBadge(sch.status)}
                        <h2 className="text-sm font-black text-slate-800 truncate whitespace-nowrap" title={sch.title}>
                          {sch.title}
                        </h2>
                        {getScheduleTypeBadge(sch.type)}
                        {sch.isDowntime ?? (sch.type === "UPGRADE" || sch.type === "DATABASE") ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-red-50 text-red-700 border border-red-200/80 whitespace-nowrap shrink-0">
                            全站停机维护
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 whitespace-nowrap shrink-0">
                            在线平滑维护
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium font-mono whitespace-nowrap shrink-0">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="whitespace-nowrap">
                            {formatDateTime(sch.startTime)} ~ {formatDateTime(sch.endTime)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedScheduleDetail(sch)}
                          className="h-7 px-2.5 bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border border-blue-200 text-xs font-bold rounded-[4px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95 whitespace-nowrap shrink-0"
                          title="查看该维护计划详细说明"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>查看详情</span>
                        </button>
                      </div>
                    </div>

                    {/* 影响范围与说明 */}
                    <div className="space-y-2.5 pl-1">
                      <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-[4px] min-w-0">
                        <Server className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-bold shrink-0 whitespace-nowrap">影响范围:</span>
                        <span className="font-medium text-slate-600 truncate whitespace-nowrap" title={sch.scope || "常规维护 · 部分接口可能瞬时重试"}>
                          {sch.scope || "常规维护 · 部分接口可能瞬时重试"}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block whitespace-nowrap">
                          维护详细说明：
                        </span>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed bg-white p-3 rounded-[4px] border border-slate-100">
                          {sch.description || "例行系统维护与巡检。"}
                        </p>
                      </div>

                      {sch.actualResult && (
                        <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-[4px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                          <div className="space-y-0.5">
                            <span className="font-bold whitespace-nowrap">实际执行结果：</span>
                            <p className="font-medium">{sch.actualResult}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 维护任务分页条 */}
                {schedules.length > 0 && (
                  <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-3 text-xs whitespace-nowrap overflow-x-auto">
                    <div className="text-slate-500 font-medium shrink-0 whitespace-nowrap">
                      共 <span className="font-bold text-slate-800 font-mono">{schedules.length}</span> 项维护排期，
                      每页 <span className="font-bold text-slate-800 font-mono">{PAGE_SIZE}</span> 条，
                      当前第 <span className="font-bold text-[#3182ce] font-mono">{currentSchedulePage}</span> / <span className="font-mono">{totalSchedulePages}</span> 页
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSchedulePage((prev) => Math.max(1, prev - 1))}
                        disabled={currentSchedulePage <= 1}
                        className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer whitespace-nowrap"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一页</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalSchedulePages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setSchedulePage(p)}
                            className={`w-8 h-8 rounded-[4px] text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap ${
                              p === currentSchedulePage
                                ? "bg-[#3182ce] text-white shadow-2xs font-black"
                                : "bg-white border border-slate-200 text-slate-600 hover:border-blue-200 hover:text-[#3182ce]"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSchedulePage((prev) => Math.min(totalSchedulePages, prev + 1))}
                        disabled={currentSchedulePage >= totalSchedulePages}
                        className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer whitespace-nowrap"
                      >
                        <span>下一页</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2：版本更新日志 */}
        {activeTab === "releases" && (
          <div>
            {loading ? (
              <div className="bg-white rounded-[8px] border border-slate-200 p-12 text-center text-xs text-slate-400 font-medium">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#3182ce] mb-2" />
                正在从数据库加载最新发版公告...
              </div>
            ) : releases.length === 0 ? (
              <div className="bg-white rounded-[8px] border border-dashed border-slate-200 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-[8px] bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto shadow-2xs">
                  <History className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-xs font-black text-slate-700">暂无待公示的发版记录</h3>
                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    当前系统运行基准版本为 {currentVersion}。新版本发布后将在此公示更新详情。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedReleases.map((rel) => (
                  <div
                    key={rel.id}
                    className="bg-white rounded-[8px] border border-slate-200/90 p-6 shadow-xs space-y-4 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <span className="px-2 py-0.5 rounded-[4px] text-xs font-black bg-[#3182ce] text-white font-mono shadow-2xs whitespace-nowrap shrink-0">
                          {rel.version}
                        </span>
                        <h2 className="text-sm font-black text-slate-800 truncate whitespace-nowrap" title={rel.title}>
                          {rel.title}
                        </h2>
                        {getReleaseTypeBadge(rel.type)}
                      </div>

                      <div className="flex items-center gap-2.5 text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{rel.publishDate}</span>
                        </span>
                        <span>·</span>
                        <span className="whitespace-nowrap">{rel.author}</span>
                      </div>
                    </div>

                    {/* 更新要点 */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 block whitespace-nowrap">版本更新要点：</span>
                      <div className="space-y-1.5 pl-2 border-l-2 border-blue-200">
                        {rel.items.map((it, idx) => (
                          <div key={idx} className="text-xs text-slate-600 font-medium flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] shrink-0" />
                            <span className="truncate whitespace-nowrap" title={it}>{it}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 底部直接体验入口 */}
                    <div className="pt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <span>进入工作台</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* 发版日志分页条 */}
                {releases.length > 0 && (
                  <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-3 text-xs whitespace-nowrap overflow-x-auto">
                    <div className="text-slate-500 font-medium shrink-0 whitespace-nowrap">
                      共 <span className="font-bold text-slate-800 font-mono">{releases.length}</span> 条发版公告，
                      每页 <span className="font-bold text-slate-800 font-mono">{PAGE_SIZE}</span> 条，
                      当前第 <span className="font-bold text-[#3182ce] font-mono">{currentReleasePage}</span> / <span className="font-mono">{totalReleasePages}</span> 页
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setReleasePage((prev) => Math.max(1, prev - 1))}
                        disabled={currentReleasePage <= 1}
                        className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer whitespace-nowrap"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一页</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalReleasePages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setReleasePage(p)}
                            className={`w-8 h-8 rounded-[4px] text-xs font-bold font-mono transition-all cursor-pointer whitespace-nowrap ${
                              p === currentReleasePage
                                ? "bg-[#3182ce] text-white shadow-2xs font-black"
                                : "bg-white border border-slate-200 text-slate-600 hover:border-blue-200 hover:text-[#3182ce]"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setReleasePage((prev) => Math.min(totalReleasePages, prev + 1))}
                        disabled={currentReleasePage >= totalReleasePages}
                        className="h-8 px-2.5 rounded-[4px] border border-slate-200 bg-white text-slate-600 hover:text-[#3182ce] hover:border-blue-200 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-bold cursor-pointer whitespace-nowrap"
                      >
                        <span>下一页</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 弹窗：查看计划维护任务详情模态框（大厂规范三段式防截断设计） */}
      {selectedScheduleDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-left">
            {/* Header 头部固定置顶 */}
            <div className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/60 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-base font-black text-slate-800 tracking-tight truncate" title={selectedScheduleDetail.title}>
                      {selectedScheduleDetail.title}
                    </h3>
                    {getScheduleStatusBadge(selectedScheduleDetail.status)}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 whitespace-nowrap">
                    任务排期编号: {selectedScheduleDetail.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScheduleDetail(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
                title="关闭详情"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body 内容自适应滚动区 */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-left">
              {/* 核心属性网格卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">运行控制策略</span>
                  <div className="flex items-center gap-2">
                    {(selectedScheduleDetail.isDowntime ?? (selectedScheduleDetail.type === "UPGRADE" || selectedScheduleDetail.type === "DATABASE")) ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-black bg-red-50 text-red-700 border border-red-200">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        全站停机维护 (暂停外网访问)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200">
                        <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                        在线平滑维护 (平稳运行)
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">任务分类</span>
                  <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    {getScheduleTypeBadge(selectedScheduleDetail.type)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">影响业务范围</span>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedScheduleDetail.scope || "全站系统服务"}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block">运维责任团队</span>
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedScheduleDetail.manager || "平台运维保障组"}</span>
                  </div>
                </div>
              </div>

              {/* 维护时间窗口卡片 */}
              <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100 space-y-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#3182ce]" />
                  <span>维护计划时间窗口</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 block">计划开始时间</span>
                    <span className="font-mono font-bold text-slate-800">{selectedScheduleDetail.startTime}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 block">预计结束时间</span>
                    <span className="font-mono font-bold text-slate-800">{selectedScheduleDetail.endTime || "待定"}</span>
                  </div>
                </div>
              </div>

              {/* 维护内容与操作说明 */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">维护内容与说明</span>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed font-medium whitespace-pre-line border-l-4 border-l-[#3182ce]">
                  {selectedScheduleDetail.description || "暂无详细操作说明"}
                </div>
              </div>

              {/* 实际执行反馈（若存在） */}
              {selectedScheduleDetail.actualResult && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>实际执行反馈与复盘</span>
                  </span>
                  <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                    {selectedScheduleDetail.actualResult}
                  </p>
                </div>
              )}
            </div>

            {/* Footer 底部固定操作栏 */}
            <div className="shrink-0 p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedScheduleDetail(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                关闭详情
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
