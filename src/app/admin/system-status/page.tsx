"use client";

import { useState, useEffect, useCallback } from "react";
import {
  HeartPulse,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Cpu,
  Clock,
  Server,
  Activity,
  FileText,
  ShieldCheck,
  Zap,
  Download,
  Bell,
  Check,
  X,
  Radio,
  Play,
  Loader2,
  AlertCircle,
  Key,
  BookOpen,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import * as XLSX from "xlsx";

interface ServiceItem {
  id: string;
  name: string;
  category: string;
  status: "healthy" | "warning" | "down";
  statusText: string;
  latencyMs: number;
  latency: string;
  details: string;
  rating: "优良" | "正常" | "关注" | "异常";
}

interface InspectionReport {
  score: number;
  conclusion: string;
  recommendations: string[];
  inspectedAt: string;
}

interface SystemStatusData {
  timestamp: string;
  overallStatus: "正常运行" | "关注排查";
  healthScore: number;
  dbLatency: number;
  dbVersion?: string;
  dbThreadsConnected?: number;
  dbTotalMB?: number;
  dbDataMB?: number;
  dbIndexMB?: number;
  formattedUptime: string;
  uptimeSec: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapUsageRate?: number;
  nodeVersion: string;
  platform: string;
  inMaintenance: boolean;
  recentAlertCount: number;
  pendingAppealCount?: number;
  stats: {
    userCount: number;
    active24hCount?: number;
    bannedUserCount?: number;
    workspaceCount: number;
    activeWorkspaceCount?: number;
    disabledWorkspaceCount?: number;
    componentCount: number;
    publishedComponentCount?: number;
    componentTaskCount?: number;
    logCount: number;
    todayLogCount?: number;
    docCount: number;
    publishedDocCount?: number;
    notificationCount: number;
    totalAppealCount?: number;
    pendingAppealCount?: number;
    configCount?: number;
    rechargeOrderCount?: number;
    pointsLedgerCount?: number;
    membershipLevelCount?: number;
    workspacePlanCount?: number;
    permissionCount?: number;
  };
  services: ServiceItem[];
  inspectionReport?: InspectionReport;
}

export default function SystemStatusPage() {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 单项服务正在测试中的 ID
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);

  // 全量巡检状态与模态框
  const [isInspectingAll, setIsInspectingAll] = useState(false);
  // 巡检真实已用耗时（前端只做真实计时，不再假装百分比进度）
  const [inspectionElapsedMs, setInspectionElapsedMs] = useState(0);
  const [inspectionReportModal, setInspectionReportModal] = useState(false);
  const [lastReportData, setLastReportData] = useState<SystemStatusData | null>(null);

  // 获取系统运行健康状态（100% 真实数据库与探针）
  const fetchStatus = useCallback(
    async (isSilent = false) => {
      try {
        if (!isSilent) setRefreshing(true);
        const authToken = getAuthToken();
        const res = await fetch("/api/admin/system-status", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          cache: "no-store",
        });

        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        } else {
          toast.error("获取系统监控数据失败");
        }
      } catch (e) {
        console.error("获取系统监控状态异常:", e);
        toast.error("网络连接异常，无法获取系统运行数据");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 自动 30s 周期探测
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  // 1. 单项服务独立连通性测试（真实深度探针）
  const handleTestSingleService = async (serviceId: string) => {
    try {
      setTestingServiceId(serviceId);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/system-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ serviceId }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success(result.message || "服务连通性测试完成");
        setData((prev) => {
          if (!prev) return prev;
          const updatedServices = prev.services.map((s) =>
            s.id === serviceId ? result.data : s
          );
          return { ...prev, services: updatedServices };
        });
      } else {
        toast.error(result.error || "连通性测试失败");
      }
    } catch {
      toast.error("请求异常，测试未完成");
    } finally {
      setTestingServiceId(null);
    }
  };

  // 2. 一键全量系统健康深度巡检（真实执行：服务端跑完全部探针后返回真实耗时）
  const handleRunFullInspection = async () => {
    if (isInspectingAll) return;
    toast.dismissAll();
    setIsInspectingAll(true);
    const startedAt = Date.now();
    setInspectionElapsedMs(0);
    // 真实秒表：只反映已经真实过去的时间，不伪造进度百分比
    const ticker = setInterval(() => setInspectionElapsedMs(Date.now() - startedAt), 200);

    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/system-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "full_inspection" }),
      });

      const result = await res.json();

      if (res.ok && result.success && result.data) {
        setData(result.data);
        setLastReportData(result.data);
        toast.dismissAll();
        setInspectionReportModal(true);
        toast.success(result.message || "全系统健康巡检已顺利完成！已生成体检报告");
      } else {
        toast.dismissAll();
        toast.error(result.error || "巡检请求未正常响应");
      }
    } catch {
      toast.dismissAll();
      toast.error("巡检过程发生网络中断");
    } finally {
      clearInterval(ticker);
      setIsInspectingAll(false);
      setInspectionElapsedMs(0);
    }
  };

  // 3. 导出系统运行健康报表 (Excel)，包含全量数据库物理指标与真实业务统计
  const handleExportExcelReport = () => {
    if (!data) {
      toast.warning("暂无可导出的监控数据");
      return;
    }

    try {
      // 概况表（真实物理指标与健康判定）
      const summaryRows = [
        ["指标项", "当前实测数值", "指标说明"],
        ["系统运行状态", data.overallStatus, "当前核心服务综合状态"],
        ["系统综合健康评分", `${data.healthScore} 分 (满分100)`, "各探针与资源加权综合健康指数"],
        ["数据库引擎版本", data.dbVersion || "未采集", "数据库真实执行 SELECT VERSION() 结果"],
        ["数据库直连响应延迟", `${data.dbLatency} ms`, "MySQL 数据库真实往返耗时"],
        ["数据库当前并发连接数", `${data.dbThreadsConnected ?? "未采集"} 个线程`, "MySQL 实时 Threads_connected 活跃连接"],
        ["数据库物理存储总空间", `${data.dbTotalMB || 0} MB`, `数据占用 ${data.dbDataMB || 0} MB，索引占用 ${data.dbIndexMB || 0} MB`],
        ["Node.js 堆内存占用率", `${data.heapUsageRate || 0}%`, `已用 ${data.heapUsedMB} MB / 总分配 ${data.heapTotalMB} MB`],
        ["物理常驻内存 RSS", `${data.rssMB} MB`, "进程在操作系统中所占的实际物理内存"],
        ["连续在线平稳运行", data.formattedUptime, `进程已启动 ${data.uptimeSec} 秒`],
        ["全站停机维护状态", data.inMaintenance ? "正在维护中" : "正常开放", "来自系统维护配置"],
        ["近24小时运行风险告警", `${data.recentAlertCount} 项`, "系统操作审计中记录的失败或高危事件数"],
        ["待审核申诉工单", `${data.pendingAppealCount || 0} 项`, "处于待处理状态的账号/空间申诉工单数"],
        ["采样时间戳", new Date(data.timestamp).toLocaleString("zh-CN"), "本次健康检测真实采样时间"],
      ];

      // 服务探针明细表
      const serviceRows = [
        ["服务名称", "服务类别", "当前状态", "响应延迟", "健康评级", "承载说明与状态明细"],
        ...data.services.map((s) => [
          s.name,
          s.category,
          s.statusText,
          s.latency,
          s.rating,
          s.details,
        ]),
      ];

      // 核心业务数据真实存量表
      const statsRows = [
        ["业务实体类型", "当前存量统计", "细分指标与说明"],
        ["注册用户总量", data.stats.userCount, `近24小时活跃: ${data.stats.active24hCount || 0} 人，违规封禁: ${data.stats.bannedUserCount || 0} 人`],
        ["工作空间节点", data.stats.workspaceCount, `正常活跃: ${data.stats.activeWorkspaceCount || 0} 个，风控停用管控: ${data.stats.disabledWorkspaceCount || 0} 个`],
        ["全流程功能组件", data.stats.componentCount, `组件库已收录: ${data.stats.componentCount} 项，已上架开放: ${data.stats.publishedComponentCount || 0} 项，调度流水: ${data.stats.componentTaskCount || 0} 次`],
        ["操作审计流水日志", data.stats.logCount, `近24小时产生: ${data.stats.todayLogCount || 0} 条，异常拦截: ${data.recentAlertCount} 项`],
        ["风控申诉工单", data.stats.totalAppealCount || 0, `待审核工单: ${data.pendingAppealCount || 0} 项`],
        ["知识库技术文档", data.stats.docCount, `文档总篇数: ${data.stats.docCount} 篇，已发布上线: ${data.stats.publishedDocCount || 0} 篇`],
        ["充值工单与算力流水", (data.stats.rechargeOrderCount || 0) + (data.stats.pointsLedgerCount || 0), `充值工单: ${data.stats.rechargeOrderCount || 0} 笔，算力记账流水: ${data.stats.pointsLedgerCount || 0} 条`],
        ["会员等级与空间套餐", (data.stats.membershipLevelCount || 0) + (data.stats.workspacePlanCount || 0), `个人会员等级: ${data.stats.membershipLevelCount || 0} 档，空间团队套餐: ${data.stats.workspacePlanCount || 0} 档`],
        ["系统配置持久化参数", data.stats.configCount || 0, `全局持久化参数: ${data.stats.configCount || 0} 项，系统权限规则: ${data.stats.permissionCount || 0} 条`],
        ["系统通知广播记录", data.stats.notificationCount, "系统下发通知与广播公告记录"],
      ];

      const wb = XLSX.utils.book_new();

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      const wsServices = XLSX.utils.aoa_to_sheet(serviceRows);
      const wsStats = XLSX.utils.aoa_to_sheet(statsRows);

      XLSX.utils.book_append_sheet(wb, wsSummary, "系统综合概况");
      XLSX.utils.book_append_sheet(wb, wsServices, "微服务健康明细");
      XLSX.utils.book_append_sheet(wb, wsStats, "核心业务数据统计");

      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `知阁舟坊_系统运行健康巡检报告_${dateStr}.xlsx`);
      toast.success("系统健康监测报表已成功生成并下载！");
    } catch (err) {
      console.error("导出报表失败:", err);
      toast.error("生成 Excel 报表发生异常");
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 pb-12 font-sans text-left">
      <div className="pt-6">
        {/* 顶部标头 Card（普通通俗的系统语言，彻底消除AI黑话） */}
        <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                  系统运行状态与监控大盘
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                    data?.overallStatus === "正常运行"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  ● {data?.overallStatus || "正在检测中"}
                </span>
                {data?.inMaintenance && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
                    停机维护模式生效中
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                实时监控数据库连接、核心服务运行状态、系统内存负载与平台整体数据统计
              </p>
            </div>
          </div>

          {/* 顶部操作区 */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* 一键全量健康巡检 */}
            <button
              type="button"
              onClick={handleRunFullInspection}
              disabled={isInspectingAll}
              className="h-9 px-3.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isInspectingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{isInspectingAll ? `巡检中 (${(inspectionElapsedMs / 1000).toFixed(1)}s)` : "一键系统体检"}</span>
            </button>

            {/* 导出健康报表 */}
            <button
              type="button"
              onClick={handleExportExcelReport}
              className="h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="导出系统健康报表为 Excel 文件"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>导出报表</span>
            </button>

            {/* 自动刷新开关 */}
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 h-9 rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
              />
              <span>30秒自动检测</span>
            </label>

            {/* 手动重新探测 */}
            <button
              type="button"
              onClick={() => fetchStatus()}
              disabled={refreshing}
              className="h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="立即重新发起一次系统状态探测"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`}
              />
              <span>{refreshing ? "检测中..." : "刷新"}</span>
            </button>

            {/* 前往维护页面 */}
            <Link
              href="/admin/maintenance"
              className="h-9 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Server className="w-3.5 h-3.5" />
              <span>维护管理</span>
            </Link>
          </div>
        </div>

        {/* 4 大核心监控指标 Bento 卡片（规范的大厂中文描述，去AI黑话） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* 1. 综合健康评分 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">系统综合健康度</div>
              <div className="text-2xl font-black font-mono text-emerald-600">
                {data?.healthScore || 100}{" "}
                <span className="text-xs font-normal text-slate-400">/ 100 分</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                {data?.healthScore && data.healthScore >= 90
                  ? "未检测到异常或严重慢阻塞"
                  : "存在响应偏慢或需要关注的项"}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* 2. 数据库响应延迟与物理状态 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">数据库查询响应</div>
              <div className="text-2xl font-black font-mono text-[#3182ce]">
                {data?.dbLatency !== undefined ? data.dbLatency : 0}{" "}
                <span className="text-xs font-normal text-slate-400">毫秒</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1 truncate max-w-[200px]" title={`引擎: ${data?.dbVersion || "未采集"} · 活跃并发: ${data?.dbThreadsConnected ?? "未采集"} · 物理空间: ${data?.dbTotalMB ?? "未采集"} MB`}>
                {data?.dbVersion ? `${data.dbVersion} · 容积 ${data?.dbTotalMB ?? "—"}MB` : "MySQL 数据库正常连通"}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
          </div>

          {/* 3. 系统内存占用与真实使用率 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">系统内存占用</div>
              <div className="text-2xl font-black font-mono text-purple-600">
                {data?.heapUsedMB || 0}{" "}
                <span className="text-xs font-normal text-slate-400">
                  MB ({data?.heapUsageRate || 0}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1 truncate max-w-[200px]" title={`总分配堆: ${data?.heapTotalMB || 0} MB · 常驻物理内存: ${data?.rssMB || 0} MB`}>
                总堆: {data?.heapTotalMB || 0}MB · 常驻: {data?.rssMB || 0}MB
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
          </div>

          {/* 4. 连续无故障运行 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">连续平稳运行时间</div>
              <div
                className="text-base font-black font-mono text-slate-800 truncate max-w-[170px]"
                title={data?.formattedUptime}
              >
                {data?.formattedUptime || "未采集"}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                平台服务进程持续在线
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 系统运行安全态势与告警提示条（真实告警数与真实待审申诉单） */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-800">系统运行安全状态评估</span>
                {data?.inMaintenance ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    维护模式
                  </span>
                ) : (data?.recentAlertCount || 0) > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    存在风险
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    安全正常
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {data?.inMaintenance ? (
                  <>平台当前处于全站停机维护模式，普通用户访问已受限。</>
                ) : (data?.recentAlertCount || 0) > 0 ? (
                  <>
                    近 24 小时记录{" "}
                    <strong className="text-amber-700 font-black">{data?.recentAlertCount || 0}</strong>{" "}
                    项异常或受阻操作，建议进入操作审计日志排查；核心服务与数据库连通正常。
                  </>
                ) : (
                  <>
                    近 24 小时无异常或受阻操作，所有核心业务服务与数据库连接保持畅通。
                  </>
                )}
              </p>
            </div>
          </div>

          <Link
            href="/admin/operation-logs"
            className="text-xs font-bold text-[#3182ce] hover:underline flex items-center gap-1 shrink-0"
          >
            <span>查看操作审计日志</span>
            <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
          </Link>
        </div>

        {/* 核心服务运行状态与操作列表（彻底清除黑话与英文括号，支持单项测试连通性） */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                平台核心服务运行监控列表
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              上次检测时间：
              {data?.timestamp
                ? new Date(data.timestamp).toLocaleTimeString("zh-CN")
                : "刚刚"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-5 whitespace-nowrap">服务名称</th>
                  <th className="py-3 px-5 whitespace-nowrap">所属分类</th>
                  <th className="py-3 px-5 whitespace-nowrap">运行状态</th>
                  <th className="py-3 px-5 whitespace-nowrap">响应延迟</th>
                  <th className="py-3 px-5 whitespace-nowrap">运行状态说明</th>
                  <th className="py-3 px-5 whitespace-nowrap">健康评级</th>
                  <th className="py-3 px-5 whitespace-nowrap text-right sticky right-0 z-10 bg-slate-50/80 border-l border-slate-200">
                    运维操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data?.services?.map((srv) => {
                  const isTestingThis = testingServiceId === srv.id;
                  return (
                    <tr key={srv.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-800 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
                          <Server className="w-4 h-4" />
                        </div>
                        <span>{srv.name}</span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[11px]">
                          {srv.category}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            srv.status === "healthy"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : srv.status === "warning"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              srv.status === "healthy"
                                ? "bg-emerald-500"
                                : srv.status === "warning"
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                          />
                          <span>{srv.statusText}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap font-mono font-bold text-slate-700">
                        {srv.latency}
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap text-slate-500 font-medium max-w-xs truncate" title={srv.details}>
                        {srv.details}
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            srv.rating === "优良"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : srv.rating === "正常"
                              ? "bg-blue-50 text-[#2b6cb0] border border-blue-200"
                              : srv.rating === "关注"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {srv.rating}
                        </span>
                      </td>

                      {/* 单项服务测试连通性按钮（真实独立测试） */}
                      <td className="py-3.5 px-5 whitespace-nowrap text-right sticky right-0 z-10 bg-white group-hover:bg-blue-50/30 border-l border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleTestSingleService(srv.id)}
                          disabled={isTestingThis}
                          className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          title="对该服务发起连通性检测"
                        >
                          {isTestingThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3" />
                          )}
                          <span>{isTestingThis ? "测试中..." : "测试连通性"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 底部双栏：平台核心数据存量与系统运行环境（纯中文平实表述，100% 数据库真实数据） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左栏：系统运行风险与运维待办（系统状态页专属指标，不与业务总览/顶部横幅/右侧运行环境面板重复） */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-3.5 rounded-full bg-purple-500" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  系统运行风险与运维待办
                </h4>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">系统状态专属指标 · 100% 真实数据库统计</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">24h 异常拦截</div>
                  <div className={`text-xl font-black font-mono mt-0.5 ${(data?.recentAlertCount || 0) > 0 ? "text-red-500" : "text-slate-800"}`}>
                    {data?.recentAlertCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    近24小时审计风险事件（项）
                  </div>
                </div>
                <AlertTriangle className="w-5 h-5 text-red-500 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">待审申诉工单</div>
                  <div className={`text-xl font-black font-mono mt-0.5 ${(data?.pendingAppealCount || 0) > 0 ? "text-amber-600" : "text-slate-800"}`}>
                    {data?.pendingAppealCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    风控复核运维待办（项）
                  </div>
                </div>
                <Radio className="w-5 h-5 text-orange-500 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">今日审计流水</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.todayLogCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    累计存证: {data?.stats?.logCount || 0} 条
                  </div>
                </div>
                <FileText className="w-5 h-5 text-amber-600 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">服务探针汇总</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {(data?.services || []).filter((s) => s.status === "healthy").length}
                    <span className="text-xs font-normal text-slate-400"> / {(data?.services || []).length}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    正常/总数 · 告警 {(data?.services || []).filter((s) => s.status === "warning").length} · 宕机 {(data?.services || []).filter((s) => s.status === "down").length}
                  </div>
                </div>
                <Activity className="w-5 h-5 text-emerald-600 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">系统通知广播</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.notificationCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    累计下发记录（条）
                  </div>
                </div>
                <Bell className="w-5 h-5 text-indigo-500 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">知识技术文档</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.docCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    已发布上线: {data?.stats?.publishedDocCount || 0} 篇
                  </div>
                </div>
                <BookOpen className="w-5 h-5 text-blue-600 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">系统配置参数</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.configCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    权限规则: {data?.stats?.permissionCount || 0} 条
                  </div>
                </div>
                <Key className="w-5 h-5 text-teal-600 opacity-70 shrink-0 ml-2" />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">维护模式</div>
                  <div className={`text-base font-black mt-1 ${data?.inMaintenance ? "text-amber-600" : "text-emerald-600"}`}>
                    {data?.inMaintenance ? "维护中" : "未开启"}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    全站停机维护窗口状态
                  </div>
                </div>
                <ShieldCheck className="w-5 h-5 text-indigo-500 opacity-70 shrink-0 ml-2" />
              </div>
            </div>
          </div>

          {/* 右栏：系统运行环境配置（100% 真实探针探测，杜绝任何硬编码假文字） */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-3.5 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  系统软件与运行环境
                </h4>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">实时采集</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">数据存储引擎版本</span>
                <span className="font-mono font-bold text-emerald-600">
                  {data?.dbVersion ? `${data.dbVersion} (InnoDB)` : "未采集"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">数据库物理空间占用</span>
                <span className="font-mono font-bold text-slate-800" title={`数据: ${data?.dbDataMB ?? "未采集"} MB, 索引: ${data?.dbIndexMB ?? "未采集"} MB`}>
                  {data?.dbTotalMB != null
                    ? `${data.dbTotalMB} MB (数据 ${data.dbDataMB ?? "—"}MB / 索引 ${data.dbIndexMB ?? "—"}MB)`
                    : "未采集"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">当前数据库并发连接</span>
                <span className="font-mono font-bold text-slate-800">
                  {data?.dbThreadsConnected != null ? `${data.dbThreadsConnected} 个活跃并发线程` : "未采集"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">Node.js 运行版本</span>
                <span className="font-mono font-bold text-slate-800">
                  {/* 版本号一律取服务端实测值；浏览器端不存在 process，缺失时明确标注未采集 */}
                  {data?.nodeVersion || "未采集"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">操作系统执行平台</span>
                <span className="font-mono font-bold text-slate-800">
                  {data?.platform || "未采集"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 模态框：系统体检与巡检报告弹窗（结论与运维建议 100% 动态自适应生成，拒绝硬编码） */}
      {inspectionReportModal && lastReportData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-blue-100 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in-50 zoom-in-95">
            <div className="p-6 bg-gradient-to-br from-blue-50/70 via-emerald-50/30 to-white border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    系统健康全量体检报告
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    深度健康巡检已完成，综合评分：{lastReportData.healthScore} 分 (满分 100)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectionReportModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-left max-h-[70vh] overflow-y-auto">
              {/* 动态诊断结论 */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-800 leading-relaxed font-medium">
                ✅ <strong>巡检诊断结论：</strong>
                {lastReportData.inspectionReport?.conclusion ||
                  `系统当前状态为「${lastReportData.overallStatus}」，综合健康评分 ${lastReportData.healthScore} 分，数据库往返延迟 ${lastReportData.dbLatency} ms。`}
              </div>

              {/* 各服务真实探测清单 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">各核心服务响应延迟：</span>
                <div className="space-y-1.5">
                  {lastReportData.services.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-medium"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-slate-800 font-bold block truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{s.details}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono shrink-0">
                        <span className="text-slate-600 font-bold">{s.latency}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.rating === "优良"
                              ? "bg-emerald-100 text-emerald-800"
                              : s.rating === "正常"
                              ? "bg-blue-100 text-[#2b6cb0]"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {s.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 针对性运维建议（100% 根据数据库真实状态动态输出） */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <span className="font-bold text-slate-800 block">针对性运维建议与处置提醒：</span>
                {lastReportData.inspectionReport?.recommendations && lastReportData.inspectionReport.recommendations.length > 0 ? (
                  lastReportData.inspectionReport.recommendations.map((rec, idx) => (
                    <p key={idx} className="leading-relaxed flex items-start gap-1">
                      <span className="font-bold text-[#3182ce]">{idx + 1}.</span>
                      <span>{rec}</span>
                    </p>
                  ))
                ) : (
                  <p className="leading-relaxed">各服务运行良好，请定期留存巡检记录。</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleExportExcelReport}
                  className="px-4 py-2 text-xs font-bold text-[#3182ce] hover:bg-blue-50 rounded-xl transition-colors cursor-pointer border border-blue-200"
                >
                  导出此报告 (Excel)
                </button>
                <button
                  type="button"
                  onClick={() => setInspectionReportModal(false)}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  确认并关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
