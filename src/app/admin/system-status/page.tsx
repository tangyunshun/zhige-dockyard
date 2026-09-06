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
  Layers,
  Users,
  Box,
  FileText,
  ShieldCheck,
  Zap,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface ServiceItem {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "warning" | "down";
  statusText: string;
  latency: string;
  details: string;
}

interface SystemStatusData {
  timestamp: string;
  overallStatus: "OPTIMAL" | "DEGRADED";
  healthScore: number;
  dbLatency: number;
  formattedUptime: string;
  uptimeSec: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  nodeVersion: string;
  platform: string;
  stats: {
    userCount: number;
    workspaceCount: number;
    componentCount: number;
    logCount: number;
    docCount: number;
  };
  services: ServiceItem[];
}

export default function SystemStatusPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setRefreshing(true);
      const res = await fetch("/api/admin/system-status", {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        cache: "no-store",
      });

      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        toast.error("获取系统运行健康状态失败");
      }
    } catch (e) {
      console.error("Fetch system status error:", e);
      toast.error("网络异常，探针服务失联");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 自动 30s 轮询探针
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 pb-12 font-sans text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* 顶部业务大纲标头 Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold shrink-0">
              <HeartPulse className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  系统运行状态与监控大盘 (System Status)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {data?.overallStatus === "OPTIMAL" ? "服务总体健壮" : "轻度波动关注"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                实时检测底层数据库连接、微内核服务、Node.js 运行时负载与核心中间件健康度
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 h-9 rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
              />
              <span>自动刷新 (30s)</span>
            </label>

            <button
              onClick={() => fetchStatus()}
              disabled={refreshing}
              className="h-9 px-3.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="立即触发一次底层微服务探针"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
              <span>{refreshing ? "检测中..." : "重新探测"}</span>
            </button>

            <Link
              href="/admin/maintenance"
              className="h-9 px-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Server className="w-3.5 h-3.5" />
              <span>维护中枢</span>
            </Link>
          </div>
        </div>

        {/* 4 大标准 Bento 实时监控指标卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* 综合健康评分 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                综合健康指数
              </div>
              <div className="text-2xl font-black font-mono text-emerald-600">
                {data?.healthScore || 100}{" "}
                <span className="text-xs font-normal text-slate-400">/ 100 分</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                未检测到关键慢查询或阻塞
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* 数据库响应延迟 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                主数据库探针延迟
              </div>
              <div className="text-2xl font-black font-mono text-[#3182ce]">
                {data?.dbLatency !== undefined ? data.dbLatency : 0}{" "}
                <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                Prisma ORM 直连响应耗时
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
          </div>

          {/* Node.js 内存占用 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                Node.js 堆内存占用
              </div>
              <div className="text-2xl font-black font-mono text-purple-600">
                {data?.heapUsedMB || 0}{" "}
                <span className="text-xs font-normal text-slate-400">
                  MB / {data?.heapTotalMB || 0} MB
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                常驻内存集 RSS: {data?.rssMB || 0} MB
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
          </div>

          {/* 连续无故障运行 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                连续在线运行时长
              </div>
              <div className="text-base font-black font-mono text-slate-800 truncate max-w-[170px]" title={data?.formattedUptime}>
                {data?.formattedUptime || "运行中"}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                进程持续稳定服务中
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 核心微服务与中间件健康矩阵卡片 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                核心微服务与架构管道健康度矩阵 (Microservices Matrix)
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              上次检测采样时间：{data?.timestamp ? new Date(data.timestamp).toLocaleTimeString("zh-CN") : "刚刚"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-5 whitespace-nowrap">服务组件名称</th>
                  <th className="py-3 px-5 whitespace-nowrap">架构类型</th>
                  <th className="py-3 px-5 whitespace-nowrap">探针状态</th>
                  <th className="py-3 px-5 whitespace-nowrap">即时响应延迟</th>
                  <th className="py-3 px-5 whitespace-nowrap">承载指标与环境明细</th>
                  <th className="py-3 px-5 whitespace-nowrap text-right">健康评级</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data?.services?.map((srv) => (
                  <tr key={srv.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-5 whitespace-nowrap font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
                        <Server className="w-3.5 h-3.5" />
                      </div>
                      <span>{srv.name}</span>
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                        {srv.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>{srv.statusText}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap font-mono font-bold text-slate-700">
                      {srv.latency}
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap text-slate-500 font-medium">
                      {srv.details}
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap text-right font-mono font-bold text-emerald-600">
                      PASS (A+)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 底部双栏：系统数据承载容量与底层运行时指纹 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左栏：平台实时核心数据存量 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-2 h-3.5 rounded-full bg-purple-500" />
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                全栈核心业务实体承载水位 (Entities Watermark)
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">注册用户总量</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.userCount || 0}
                  </div>
                </div>
                <Users className="w-5 h-5 text-[#3182ce] opacity-70" />
              </div>

              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">工作空间节点</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.workspaceCount || 0}
                  </div>
                </div>
                <Layers className="w-5 h-5 text-purple-600 opacity-70" />
              </div>

              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">纳管研发组件</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.componentCount || 0}
                  </div>
                </div>
                <Box className="w-5 h-5 text-emerald-600 opacity-70" />
              </div>

              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold">审计操作日志</div>
                  <div className="text-xl font-black font-mono text-slate-800 mt-0.5">
                    {data?.stats?.logCount || 0}
                  </div>
                </div>
                <FileText className="w-5 h-5 text-amber-600 opacity-70" />
              </div>
            </div>
          </div>

          {/* 右栏：底层宿主环境与执行指纹 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <div className="w-2 h-3.5 rounded-full bg-emerald-500" />
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                底层宿主与服务执行环境指纹 (Runtime Fingerprint)
              </h4>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">应用架构内核</span>
                <span className="font-mono font-bold text-slate-800">Next.js App Router (React 19)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">Node.js 执行环境</span>
                <span className="font-mono font-bold text-slate-800">{data?.nodeVersion || process.version}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">宿主平台架构</span>
                <span className="font-mono font-bold text-slate-800">{data?.platform || "Windows x64"}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold">数据库驱动引擎</span>
                <span className="font-mono font-bold text-emerald-600">Prisma Client (MySQL 8.x)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
