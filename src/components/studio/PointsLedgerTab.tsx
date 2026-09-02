"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import {
  Zap,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  AlertCircle,
  Inbox,
} from "lucide-react";
import {
  POINT_RATE_TEXT,
  POINT_RATE_HINT,
  formatYuanFromPoints,
} from "@/lib/point-rate";

interface LedgerRecord {
  id: string;
  direction: "IN" | "OUT";
  title: string;
  points: number; // 带符号：充值为正，消耗为负
  amountCents: number;
  status: string;
  operator: string;
  componentName: string | null;
  estimated?: boolean;
  paymentMethod?: string | null; // 充值时记录支付方式（WECHAT_PAY/ALIPAY/SYSTEM 等）
  createdAt: string;
}

interface PointsLedgerTabProps {
  workspaceId: string;
  /** 是否具备充值权限（空间 OWNER / ADMIN）；充值入口已从成员页迁移至此 */
  canRecharge?: boolean;
  /** 调起充值弹窗 */
  onOpenRecharge?: () => void;
  /** 充值成功信号：数值变化后自动刷新流水 */
  refreshSignal?: number;
}

const TYPE_TABS = [
  { key: "all", label: "全部流水" },
  { key: "recharge", label: "充值明细" },
  { key: "consume", label: "消耗明细" },
] as const;

export default function PointsLedgerTab({
  workspaceId,
  canRecharge = true,
  onOpenRecharge,
  refreshSignal = 0,
}: PointsLedgerTabProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [balance, setBalance] = useState(0);
  const [totalRecharged, setTotalRecharged] = useState(0);
  const [totalConsumed, setTotalConsumed] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "recharge" | "consume">("all");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

  const loadLedger = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError("");
      const token = getAuthToken();
      const res = await fetch(
        `/api/workspace/quota/points-ledger?workspaceId=${encodeURIComponent(
          workspaceId
        )}&type=${typeFilter}&t=${Date.now()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError("登录状态已失效，请重新登录后查看算力点流水");
          toast.error("登录状态已失效，请重新登录", 2000);
        } else {
          setError(err.error || "获取算力点流水失败");
        }
        setRecords([]);
        return;
      }

      const data = await res.json();
      const d = data.data || {};
      setRecords(Array.isArray(d.records) ? d.records : []);
      setBalance(Number(d.balance) || 0);
      setTotalRecharged(Number(d.totalRecharged) || 0);
      setTotalConsumed(Number(d.totalConsumed) || 0);
      setPage(1);
    } catch (e: any) {
      console.error("加载算力点明细失败:", e);
      setError(e?.message || "加载失败，请稍后重试");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, typeFilter]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // 充值成功后由父级递增 refreshSignal，自动重拉流水（>0 时才触发，避免挂载时重复请求）
  useEffect(() => {
    if (refreshSignal > 0) {
      loadLedger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = records.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const statCards = [
    {
      label: "当前算力点余额",
      value: balance,
      icon: <Zap className="w-5 h-5" />,
      tone: "text-[#3182ce]",
      bg: "bg-blue-50 text-[#3182ce]",
    },
    {
      label: "累计充值 (入账)",
      value: totalRecharged,
      icon: <ArrowUpRight className="w-5 h-5" />,
      tone: "text-emerald-600",
      bg: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "累计消耗 (出账)",
      value: totalConsumed,
      icon: <ArrowDownRight className="w-5 h-5" />,
      tone: "text-amber-600",
      bg: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-200 text-left font-sans">
      {/* 标题与操作区 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center border border-amber-200/60 shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">算力点</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              统一管理本空间算力点的充值、入账与出账流水
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canRecharge && (
            <button
              onClick={onOpenRecharge}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>算力充值</span>
            </button>
          )}
          <button
            onClick={loadLedger}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新明细</span>
          </button>
        </div>
      </div>

      {/* 统一定价规则 */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <Zap className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
          {POINT_RATE_HINT}
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between"
          >
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">{c.label}</div>
              <div className={`text-2xl font-black font-mono ${c.tone}`}>
                {loading ? "···" : c.value.toLocaleString()}
                <span className="text-xs font-normal text-slate-400 ml-1">点</span>
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                折算 {loading ? "···" : formatYuanFromPoints(c.value)}
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.bg}`}>
              {c.icon}
            </div>
          </div>
        ))}
      </div>

      {/* 流水明细 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* 类型筛选 */}
        <div className="flex items-center gap-2 p-4 border-b border-slate-100">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                typeFilter === t.key
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-sm font-black"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/60"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-bold text-slate-400">
            共 {records.length} 条
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
            正在读取算力点流水...
          </div>
        ) : error ? (
          <div className="p-16 text-center text-xs font-bold text-red-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            {error}
          </div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center text-xs font-bold text-slate-400">
            <Inbox className="w-6 h-6 mx-auto mb-2" />
            暂无流水记录
            <div className="text-[11px] font-medium text-slate-400 mt-1">
              充值算力加油包或执行组件任务后，流水会实时出现在这里
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3 min-w-[240px]">流水信息</th>
                    <th className="px-5 py-3 whitespace-nowrap">类型</th>
                    <th className="px-5 py-3 whitespace-nowrap">时间</th>
                    <th className="px-5 py-3 whitespace-nowrap text-right">算力点</th>
                    <th className="px-5 py-3 whitespace-nowrap text-right">折算金额</th>
                    <th className="px-5 py-3 whitespace-nowrap">支付方式</th>
                    <th className="px-5 py-3 whitespace-nowrap">操作人</th>
                    <th className="px-5 py-3 whitespace-nowrap">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paged.map((r) => {
                    const isIn = r.direction === "IN";
                    return (
                      <tr key={`${r.direction}-${r.id}`} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 truncate max-w-[320px]">{r.title}</div>
                          {r.componentName && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              组件：{r.componentName}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            单号：{String(r.id).slice(0, 18)}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border ${
                              isIn
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                          >
                            {isIn ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {isIn ? "充值" : "消耗"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
                        </td>
                        <td
                          className={`px-5 py-3.5 text-right font-mono font-black whitespace-nowrap ${
                            isIn ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {isIn ? "+" : ""}
                          {r.points.toLocaleString()}
                          {r.estimated && (
                            <div className="text-[9px] font-bold text-slate-400">按标准成本估算</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                          ¥{(Number(r.amountCents || 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {(() => {
                            const pm = r.paymentMethod;
                            if (!pm) return <span className="text-slate-400 font-medium">-</span>;
                            const pmMap: Record<string, { label: string; style: string }> = {
                              WECHAT_PAY: { label: "微信支付", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              ALIPAY: { label: "支付宝", style: "bg-blue-50 text-blue-600 border-blue-200" },
                              ONLINE_PAY: { label: "在线支付", style: "bg-indigo-50 text-indigo-600 border-indigo-200" },
                              SYSTEM: { label: "系统抵扣", style: "bg-slate-100 text-slate-600 border-slate-200" },
                            };
                            const info = pmMap[pm] || { label: pm, style: "bg-slate-100 text-slate-600 border-slate-200" };
                            return (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${info.style}`}>
                                {info.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {r.operator}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {(() => {
                            const statusMap: Record<string, { label: string; style: string }> = {
                              SUCCESS: { label: "交易成功", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              COMPLETED: { label: "交易成功", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              DONE: { label: "已完成", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              PENDING: { label: "处理中", style: "bg-blue-50 text-blue-600 border-blue-200" },
                              PROCESSING: { label: "处理中", style: "bg-blue-50 text-blue-600 border-blue-200" },
                              RUNNING: { label: "运行中", style: "bg-blue-50 text-blue-600 border-blue-200" },
                              FAILED: { label: "交易失败", style: "bg-red-50 text-red-600 border-red-200" },
                              CANCELLED: { label: "已取消", style: "bg-slate-100 text-slate-500 border-slate-200" },
                              REFUNDED: { label: "已退款", style: "bg-purple-50 text-purple-600 border-purple-200" },
                            };
                            const statusInfo = statusMap[r.status] || { label: r.status, style: "bg-slate-100 text-slate-600 border-slate-200" };
                            return (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${statusInfo.style}`}>
                                {statusInfo.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 分页：固定每页 10 条 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400">
                共 {records.length} 条 · 每页 {PAGE_SIZE} 条
                {records.length > 0 && (
                  <>
                    {" "}
                    · 当前显示第 {(safePage - 1) * PAGE_SIZE + 1}-
                    {Math.min(safePage * PAGE_SIZE, records.length)} 条
                  </>
                )}
              </span>

              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    上一页
                  </button>
                  <span className="text-[11px] font-bold text-slate-400 font-mono">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    下一页
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-bold text-slate-400 font-mono">1 / 1</span>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 text-[10px] font-bold text-slate-400">
              折算口径：{POINT_RATE_TEXT}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
