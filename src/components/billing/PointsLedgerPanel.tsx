"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Download } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";
import { useExportMaxRows } from "@/lib/use-export-max-rows";
// 算力点类型中文优先来自数据库字典（system_config.billing_display_dict），缺失时回退前端兜底表
import { lookupBillingValueLabel, setBillingDicts } from "@/lib/billing-display-dict";
import Pagination from "@/components/Pagination";

/** 算力点流水行（pointledger，经 /api/user/points） */
interface PointLedgerRow {
  id: string;
  type: string;
  direction: string;
  points: number;
  title: string;
  createdAt: string;
  balanceAfter: number;
}

/** 算力点类型中文兜底（数据库字典未收录时使用） */
const POINT_TYPE_LABELS: Record<string, string> = {
  CONSUME: "组件执行扣点",
  REFUND: "退款",
  RECHARGE: "充值",
  OFFLINE_RECHARGE: "线下充值",
  GIFT_REGISTER: "注册赠送",
  GIFT_EXPIRE: "赠送过期",
  MEMBERSHIP_GRANT: "会员发放",
  MANUAL_ADJUST: "手动调整",
  PILOT_FUND: "试点发放",
};

// 字典接口模块级缓存：多组件同页挂载时只拉一次
let dictFetchStarted = false;

function getPointTypeLabel(type: string): string {
  return lookupBillingValueLabel(type) || POINT_TYPE_LABELS[type] || type || "其他";
}

const PAGE_SIZE = 20;

/**
 * 算力点流水面板（自包含共享组件）：
 * 展示组件执行的押金/实扣/退款/赠送等真实流水，支持开始/结束时间筛选与服务端分页。
 * 数据仅本人可见（接口按登录态过滤）；导出留痕落入用户端审计。
 */
export default function PointsLedgerPanel() {
  const toast = useToast();
  const maxRows = useExportMaxRows();
  const [pointsLedger, setPointsLedger] = useState<PointLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 加载账单显示字典（与账单/发票面板共用一套数据库字典；模块级缓存避免重复请求）
  useEffect(() => {
    if (dictFetchStarted) return;
    dictFetchStarted = true;
    (async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/user/billing-dict", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.success && d.data) setBillingDicts(d.data);
      } catch {
        // 字典缺失时回退兜底表展示，绝不阻塞主流程
      }
    })();
  }, []);

  const loadLedger = useCallback(
    async (targetPage = 1, sDate = "", eDate = "") => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          type: "all",
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (sDate) params.set("startDate", sDate);
        if (eDate) params.set("endDate", eDate);
        const authToken = getAuthToken();
        const res = await fetch(`/api/user/points?${params.toString()}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (res.ok) {
          const pData = await res.json();
          // /api/user/points 返回 { data: { records, pagination } }
          const list = Array.isArray(pData?.data?.records) ? pData.data.records : [];
          const pg = pData?.data?.pagination || {};
          setPointsLedger(
            list.map((r: any) => ({
              id: String(r.id ?? ""),
              type: String(r.type ?? ""),
              direction: String(r.direction ?? ""),
              points: Number(r.points ?? 0),
              title: String(r.title ?? r.sourceType ?? "算力点流水"),
              createdAt: String(r.createdAt ?? ""),
              balanceAfter: Number(r.balanceAfter ?? 0),
            })),
          );
          setTotal(Number(pg.total ?? list.length));
          setTotalPages(Number(pg.totalPages ?? 1));
          setPage(Number(pg.page ?? targetPage));
        }
      } catch (e) {
        console.error("加载算力点流水失败:", e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadLedger(1, startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 开始时间变化：若已选结束时间且开始晚于结束，自动清空结束时间
  const handleStartChange = (val: string) => {
    if (val && endDate && val > endDate) {
      toast.warning("开始时间不能晚于结束时间，已为您清空结束时间");
      setEndDate("");
      setStartDate(val);
      void loadLedger(1, val, "");
      return;
    }
    setStartDate(val);
    void loadLedger(1, val, endDate);
  };

  // 结束时间变化：不能早于开始时间
  const handleEndChange = (val: string) => {
    if (val && startDate && val < startDate) {
      toast.warning("结束时间不能早于开始时间，请重新选择");
      return;
    }
    setEndDate(val);
    void loadLedger(1, startDate, val);
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    void loadLedger(1, "", "");
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    void loadLedger(p, startDate, endDate);
  };

  // 导出「我的算力点流水」：仅本人数据（接口按登录态过滤），留痕落入用户端审计
  const handleExportPointsLedger = useCallback(async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({ type: "all", pageSize: String(maxRows) });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/points?${params.toString()}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const pData = await res.json().catch(() => ({}));
      const list: any[] = Array.isArray(pData?.data?.records)
        ? pData.data.records
        : Array.isArray(pData?.list)
          ? pData.list
          : Array.isArray(pData?.data?.list)
            ? pData.data.list
            : [];
      if (list.length === 0) {
        toast.warning("当前筛选条件下暂无算力点流水可导出");
        return;
      }
      exportToExcel({
        filename: "我的算力点流水",
        sheetName: "我的算力点流水",
        maxRows: maxRows,
        // 筛选条件文案由 Excel 工具按数据库字典自动生成（type → 类型 / all → 全部），前端不内置映射
        trace: {
          exportType: "我的算力点流水",
          filters: { type: "all", startDate: startDate || undefined, endDate: endDate || undefined },
          rowCount: list.length,
          page: "/user/pay",
        },
        columns: [
          { header: "时间", key: "createdAt", width: 22, formatter: formatExcelDateTime },
          // 算力点类型中文来自数据库字典（billing_display_dict.values），无字典时回退前端兜底表
          { header: "类型", key: "type", width: 16, formatter: (v: string) => getPointTypeLabel(v) },
          { header: "说明", key: "title", width: 30 },
          { header: "点数变动", key: "points", width: 14, formatter: (v: number) => (Number(v) > 0 ? `+${v}` : String(v)) },
          { header: "变动后余额", key: "balanceAfter", width: 14 },
        ],
        data: list,
      });
      toast.success(`已导出 ${list.length} 笔算力点流水`);
    } catch (e: any) {
      toast.error(e?.message || "导出失败");
    } finally {
      setExporting(false);
    }
  }, [maxRows, startDate, endDate, toast]);

  const hasFilter = !!(startDate || endDate);

  return (
    <section id="points-ledger" className="mt-6 scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#3182ce]" />
          算力点流水
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 font-bold">
            组件执行的押金、实扣、退款等每笔流水
          </span>
          <button
            onClick={handleExportPointsLedger}
            disabled={exporting}
            className="px-2.5 py-1.5 rounded-lg text-xs font-black border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> {exporting ? "导出中…" : "导出我的流水"}
          </button>
        </div>
      </div>

      {/* 筛选条：开始/结束时间 + 重置（平铺一行） */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <span className="text-xs font-bold text-slate-500">开始时间</span>
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => handleStartChange(e.target.value)}
          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
        />
        <span className="text-xs font-bold text-slate-500">结束时间</span>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => handleEndChange(e.target.value)}
          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
        />
        <button
          type="button"
          onClick={handleReset}
          className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
        >
          重置筛选
        </button>
      </div>

      <div className="bg-white/90 rounded-2xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-left text-xs table-auto">
          <thead>
            <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 font-bold">
              <th className="py-3 px-4 rounded-l-lg whitespace-nowrap">发生时间</th>
              <th className="py-3 px-4 whitespace-nowrap">类型</th>
              <th className="py-3 px-4 whitespace-nowrap">说明</th>
              <th className="py-3 px-4 whitespace-nowrap">点数变动</th>
              <th className="py-3 px-4 rounded-r-lg whitespace-nowrap">变动后余额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400 text-xs font-semibold">
                  正在加载算力点流水...
                </td>
              </tr>
            ) : pointsLedger.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400 text-xs font-semibold">
                  暂无算力点流水，执行组件或充值后将在此展示每笔明细
                </td>
              </tr>
            ) : (
              pointsLedger.map((p) => {
                const isIn = p.direction === "IN" || p.points >= 0;
                return (
                  <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">
                      {p.createdAt ? new Date(p.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"}`}>
                        {getPointTypeLabel(p.type)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[280px] truncate" title={p.title}>
                      {p.title}
                    </td>
                    <td className={`py-3 px-4 whitespace-nowrap font-mono font-black ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                      {isIn ? "+" : "-"}
                      {Math.abs(p.points).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                      {p.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="mt-3">
          <Pagination
            currentPage={page}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            itemLabel="笔流水"
          />
        </div>
      )}
    </section>
  );
}
