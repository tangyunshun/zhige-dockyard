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
  Wallet,
  Building2,
  Clock3,
} from "lucide-react";
import {
  POINT_RATE_TEXT,
  POINT_RATE_HINT,
  formatYuanFromPoints,
} from "@/lib/point-rate";

interface LedgerRecord {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  scope: string;
  title: string;
  points: number; // 带符号：入账为正，出账为负
  amountCents: number;
  status: string;
  operator: string;
  operatorId?: string | null;
  componentName: string | null;
  balanceAfter: number;
  orderNo?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
}

interface PointsLedgerTabProps {
  workspaceId: string;
  /** 是否具备充值权限（空间 OWNER / ADMIN） */
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
  { key: "gift", label: "赠送明细" },
  { key: "expire", label: "到期清零" },
] as const;

/** 流水类型中文与样式（与后端 pointledger.type 一一对应） */
const TYPE_META: Record<string, { label: string; style: string }> = {
  GIFT_REGISTER: { label: "注册赠送", style: "bg-purple-50 text-purple-600 border-purple-200" },
  GIFT_EXPIRE: { label: "到期清零", style: "bg-slate-100 text-slate-500 border-slate-200" },
  RECHARGE: { label: "在线充值", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  OFFLINE_RECHARGE: { label: "线下入账", style: "bg-teal-50 text-teal-600 border-teal-200" },
  MEMBERSHIP_GRANT: { label: "会员额度", style: "bg-blue-50 text-blue-600 border-blue-200" },
  CONSUME: { label: "组件消耗", style: "bg-amber-50 text-amber-600 border-amber-200" },
  REFUND: { label: "消耗退回", style: "bg-cyan-50 text-cyan-600 border-cyan-200" },
  MANUAL_ADJUST: { label: "人工调整", style: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PAYMENT_META: Record<string, { label: string; style: string }> = {
  WECHAT_PAY: { label: "微信支付", style: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  ALIPAY: { label: "支付宝", style: "bg-blue-50 text-blue-600 border-blue-200" },
  ONLINE_PAY: { label: "在线支付", style: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  OFFLINE_BANK: { label: "对公转账", style: "bg-teal-50 text-teal-600 border-teal-200" },
  CONTRACT: { label: "合同结算", style: "bg-violet-50 text-violet-600 border-violet-200" },
  SYSTEM: { label: "系统发放", style: "bg-slate-100 text-slate-600 border-slate-200" },
  MANUAL: { label: "人工入账", style: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PAGE_SIZE = 20;

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
  const [walletBalance, setWalletBalance] = useState(0);
  const [workspaceBalance, setWorkspaceBalance] = useState(0);
  const [expiringPoints, setExpiringPoints] = useState(0);
  const [expiringAt, setExpiringAt] = useState<string | null>(null);
  const [totalRecharged, setTotalRecharged] = useState(0);
  const [totalGift, setTotalGift] = useState(0);
  const [totalConsumed, setTotalConsumed] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const loadLedger = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError("");
      const token = getAuthToken();
      const params = new URLSearchParams({
        workspaceId,
        type: typeFilter,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        t: String(Date.now()),
      });
      const res = await fetch(`/api/workspace/quota/points-ledger?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });

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
      setWalletBalance(Number(d.walletBalance) || 0);
      setWorkspaceBalance(Number(d.workspaceBalance) || 0);
      setExpiringPoints(Number(d.expiringPoints) || 0);
      setExpiringAt(d.expiringAt || null);
      setTotalRecharged(Number(d.totalRecharged) || 0);
      setTotalGift(Number(d.totalGift) || 0);
      setTotalConsumed(Number(d.totalConsumed) || 0);
      setTotal(Number(d.pagination?.total) || 0);
      setTotalPages(Number(d.pagination?.totalPages) || 1);
    } catch (e: any) {
      console.error("加载算力点明细失败:", e);
      setError(e?.message || "加载失败，请稍后重试");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, typeFilter, page]);

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

  // 切换筛选时回到第一页
  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const statCards = [
    {
      label: "本空间可用算力点",
      value: balance,
      icon: <Zap className="w-5 h-5" />,
      tone: "text-[#3182ce]",
      bg: "bg-blue-50 text-[#3182ce]",
      hint: `钱包 ${walletBalance.toLocaleString()} + 空间池 ${workspaceBalance.toLocaleString()}`,
    },
    {
      label: "累计充值 / 线下入账",
      value: totalRecharged,
      icon: <ArrowUpRight className="w-5 h-5" />,
      tone: "text-emerald-600",
      bg: "bg-emerald-50 text-emerald-600",
      hint: null,
    },
    {
      label: "累计赠送",
      value: totalGift,
      icon: <Coins className="w-5 h-5" />,
      tone: "text-purple-600",
      bg: "bg-purple-50 text-purple-600",
      hint: null,
    },
    {
      label: "累计消耗 (出账)",
      value: totalConsumed,
      icon: <ArrowDownRight className="w-5 h-5" />,
      tone: "text-amber-600",
      bg: "bg-amber-50 text-amber-600",
      hint: null,
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

      {/* 到期提醒：赠送算力点 3 个月有效，临近到期时提示 */}
      {expiringPoints > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Clock3 className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-bold text-orange-800 leading-relaxed">
            您有 <strong>{expiringPoints.toLocaleString()}</strong> 算力点即将过期
            {expiringAt
              ? `（${new Date(expiringAt).toLocaleDateString("zh-CN")} 到期）`
              : ""}
            ，未使用部分到期将自动清零，请优先使用。
          </p>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold mb-1 truncate">{c.label}</div>
              <div className={`text-2xl font-black font-mono ${c.tone}`}>
                {loading ? "···" : c.value.toLocaleString()}
                <span className="text-xs font-normal text-slate-400 ml-1">点</span>
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                {c.hint ? c.hint : <>折算 {loading ? "···" : formatYuanFromPoints(c.value)}</>}
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.bg}`}>
              {c.icon}
            </div>
          </div>
        ))}
      </div>

      {/* 账户结构说明 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800">个人钱包（跨空间通用）</div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {walletBalance.toLocaleString()} 点 · 充值所得，个人空间与企业空间均可使用，永不过期
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-800">本空间算力池</div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {workspaceBalance.toLocaleString()} 点 · 含注册赠送（3 个月有效）与企业充值共享额度
            </div>
          </div>
        </div>
      </div>

      {/* 流水明细 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* 类型筛选 */}
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 flex-wrap">
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
            共 {total} 条
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
              <table className="w-full text-left border-collapse min-w-[980px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3 min-w-[240px]">流水信息</th>
                    <th className="px-5 py-3 whitespace-nowrap">类型</th>
                    <th className="px-5 py-3 whitespace-nowrap">归属</th>
                    <th className="px-5 py-3 whitespace-nowrap">时间</th>
                    <th className="px-5 py-3 whitespace-nowrap text-right">算力点</th>
                    <th className="px-5 py-3 whitespace-nowrap text-right">变动后余额</th>
                    <th className="px-5 py-3 whitespace-nowrap text-right">折算金额</th>
                    <th className="px-5 py-3 whitespace-nowrap">支付方式</th>
                    <th className="px-5 py-3 whitespace-nowrap">操作人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {records.map((r) => {
                    const isIn = r.direction === "IN";
                    const typeMeta = TYPE_META[r.type] || {
                      label: r.type,
                      style: "bg-slate-100 text-slate-600 border-slate-200",
                    };
                    const payMeta = r.paymentMethod
                      ? PAYMENT_META[r.paymentMethod] || {
                          label: r.paymentMethod,
                          style: "bg-slate-100 text-slate-600 border-slate-200",
                        }
                      : null;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 truncate max-w-[320px]">{r.title}</div>
                          {r.componentName && (
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              组件：{r.componentName}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            单号：{r.orderNo || String(r.id).slice(0, 18)}
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
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-[10px] font-bold text-slate-500">
                            {r.scope === "WALLET"
                              ? "个人钱包"
                              : r.scope === "PERSONAL_GIFT"
                              ? "个人空间赠送"
                              : "空间共享池"}
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
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-500 whitespace-nowrap">
                          {r.balanceAfter < 0 ? "无限" : r.balanceAfter.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                          ¥{(Number(r.amountCents || 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {payMeta ? (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${payMeta.style}`}>
                              {payMeta.label}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {r.operator}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 服务端分页 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400">
                共 {total} 条 · 每页 {PAGE_SIZE} 条
                {total > 0 && (
                  <>
                    {" "}
                    · 当前显示第 {(page - 1) * PAGE_SIZE + 1}-
                    {Math.min(page * PAGE_SIZE, total)} 条
                  </>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  上一页
                </button>
                <span className="text-[11px] font-bold text-slate-400 font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 text-[10px] font-bold text-slate-400">
              折算口径：{POINT_RATE_TEXT} · 消耗按「到期最早优先」从赠送点开始扣减
            </div>
          </>
        )}
      </div>
    </div>
  );
}
