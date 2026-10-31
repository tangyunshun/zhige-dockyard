"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Coins,
  Wallet,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Clock3,
  RefreshCw,
  AlertCircle,
  Inbox,
  FileText,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { formatYuanFromPoints } from "@/lib/point-rate";
import EnterprisePoolManager from "@/components/EnterprisePoolManager";
import UserRefundRequests from "@/components/UserRefundRequests";

interface PointsData {
  walletBalance: number;
  expiringPoints: number;
  expiringAt: string | null;
  workspaces: Array<{ id: string; name: string; type: string; balance: number; unlimited: boolean }>;
  stats: {
    totalRecharged: number;
    totalGift: number;
    totalConsumed: number;
    totalExpired: number;
    walletBalance: number;
  };
  records: Array<{
    id: string;
    direction: "IN" | "OUT";
    type: string;
    scope: string;
    title: string;
    points: number;
    amountCents: number;
    operator: string;
    componentName: string | null;
    workspaceId: string | null;
    balanceAfter: number;
    orderNo: string | null;
    paymentMethod: string | null;
    createdAt: string;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "recharge", label: "充值" },
  { key: "consume", label: "消耗" },
  { key: "gift", label: "赠送" },
  { key: "expire", label: "到期清零" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  GIFT_REGISTER: "注册赠送",
  GIFT_EXPIRE: "到期清零",
  RECHARGE: "在线充值",
  OFFLINE_RECHARGE: "线下入账",
  MEMBERSHIP_GRANT: "会员额度",
  CONSUME: "组件消耗",
  REFUND: "退回",
  MANUAL_ADJUST: "人工调整",
};

const PAYMENT_LABEL: Record<string, string> = {
  WECHAT_PAY: "微信支付",
  ALIPAY: "支付宝",
  ONLINE_PAY: "在线支付",
  OFFLINE_BANK: "对公转账",
  CONTRACT: "合同结算",
  SYSTEM: "系统发放",
  MANUAL: "人工入账",
  // 模拟支付入账（开发联调）：诚实标注，不冒充真实支付渠道
  MOCK_WECHAT_PAY: "模拟支付（微信通道·联调）",
  MOCK_ALIPAY: "模拟支付（支付宝通道·联调）",
};

export default function MyPointsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PointsData | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = getAuthToken();
      const sp = new URLSearchParams({ type: typeFilter, page: String(page), pageSize: "15" });
      const res = await fetch(`/api/user/points?${sp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "加载失败");
        return;
      }
      setData(json.data);
    } catch (e: any) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const stats = data?.stats;

  return (
    <div className="space-y-6 font-sans">
      {/* 头部标题与操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-sm shadow-amber-500/20">
              <Coins className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">我的算力中心</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/60">
              跨空间通用
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            个人钱包算力点可在所有空间通用；企业空间算力点仅限对应企业空间内使用。
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-10 sm:ml-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5"
            title="刷新算力数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/user/pay")}
            className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold"
          >
            <Coins className="w-3.5 h-3.5" />
            <span>立即充值算力</span>
          </button>
        </div>
      </div>

      {/* 4 维指标统计网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 通用余额 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-[#3182ce]/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">跨空间通用余额</span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center group-hover:scale-105 transition-transform">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-[#3182ce] tracking-tight">
              {(data?.walletBalance ?? 0).toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">点</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1 flex items-center justify-between gap-2 flex-wrap">
              <span>折合约 ¥{((data?.walletBalance ?? 0) / 100).toFixed(2)} 元可用额度</span>
              {data?.expiringPoints ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                  <Clock3 className="w-3 h-3" />
                  {data.expiringPoints.toLocaleString()} 点近期到期
                </span>
              ) : null}
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-[#3182ce]/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>

        {/* 累计充值 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">累计充值 / 线下入账</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-emerald-600 tracking-tight">
              {(stats?.totalRecharged ?? 0).toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">点</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">包含自购与对公协议汇款</div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-emerald-500/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>

        {/* 累计赠送 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">累计获赠点数</span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center group-hover:scale-105 transition-transform">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-[#3182ce] tracking-tight">
              {(stats?.totalGift ?? 0).toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">点</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">新户注册、活动礼券与福利</div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-[#3182ce]/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>

        {/* 累计消耗 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">累计使用消耗</span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-amber-600 tracking-tight">
              {(stats?.totalConsumed ?? 0).toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">点</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">模型调用与组件运行消耗</div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-amber-500/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>
      </div>

      {/* 空间算力池分布 */}
      <div className="zg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
            <h2 className="text-sm font-bold text-slate-800">各空间算力池分配</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            共绑定 {data?.workspaces.length ?? 0} 个研发工作空间
          </span>
        </div>

        {data && data.workspaces.length === 0 ? (
          <div className="text-xs text-slate-400 font-medium py-6 text-center">暂未加入任何工作空间</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data?.workspaces.map((w) => (
              <div
                key={w.id}
                onClick={() => router.push(`/workspace/${w.id}`)}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/70 hover:bg-white border border-slate-200/80 hover:border-[#3182ce]/50 hover:shadow-xs transition-all cursor-pointer group"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                    {w.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        w.type === "ENTERPRISE"
                          ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                          : "bg-slate-100 text-slate-500 border border-slate-200/60"
                      }`}
                    >
                      {w.type === "ENTERPRISE" ? "企业共享池" : "个人专属"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-black font-mono text-slate-800">
                    {w.unlimited ? "无限配额" : w.balance.toLocaleString()}
                  </div>
                  {!w.unlimited && <div className="text-[10px] font-bold text-slate-400">点</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 企业池管理：所有者在此直接回收共享池算力点 / 设置低余额预警阈值 */}
      <EnterprisePoolManager onChanged={load} />

      {/* 跨空间流水账目明细 */}
      <div className="zg-card p-0 overflow-hidden">
        {/* Tab 筛选栏 */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 flex-wrap bg-slate-50/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  typeFilter === t.key
                    ? "bg-[#3182ce] text-white shadow-xs"
                    : "bg-white text-slate-600 hover:text-[#3182ce] hover:bg-slate-100/70 border border-slate-200/70"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-bold text-slate-400 ml-auto">
            共 {data?.pagination.total ?? 0} 条流水
          </span>
        </div>

        {/* 状态与表格内容 */}
        {loading ? (
          <div className="p-12 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 zg-skeleton rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="p-14 text-center text-xs font-bold text-red-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
            {error}
          </div>
        ) : !data || data.records.length === 0 ? (
          <div className="p-14 text-center text-xs font-medium text-slate-400">
            <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            暂无匹配的算力流水记录
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">流水事由 / 业务归属</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">类型分类</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">发生时间</th>
                    <th className="px-4 py-3.5 whitespace-nowrap text-right">算力点变动</th>
                    <th className="px-4 py-3.5 whitespace-nowrap text-right">折算参考</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">支付 / 入账通道</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.records.map((r) => {
                    const isIn = r.direction === "IN";
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 truncate max-w-[280px]">{r.title}</div>
                          {r.componentName && (
                            <div className="text-[10px] text-slate-400 mt-0.5">关联组件：{r.componentName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isIn
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {TYPE_LABEL[r.type] || r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-mono font-black whitespace-nowrap ${
                            isIn ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {isIn ? "+" : ""}
                          {r.points.toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-600 whitespace-nowrap">
                          ¥{(Number(r.amountCents || 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-[11px] font-medium text-slate-600">
                          {r.paymentMethod ? (PAYMENT_LABEL[r.paymentMethod] || r.paymentMethod) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 分页控制器 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/40">
              <span className="text-[11px] font-medium text-slate-500">
                共 {data.pagination.total} 条 · 第 {data.pagination.page} / {data.pagination.totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="zg-btn zg-btn-default text-xs h-8 px-3 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="zg-btn zg-btn-default text-xs h-8 px-3 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 算力点退款申请入口：保留完整业务逻辑 */}
      <UserRefundRequests onChanged={load} />

      {/* 口径备注 */}
      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 px-1">
        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>结算口径：100 算力点 = 1 元（仅作参考）；实际计费与消费均以流水明细为准。</span>
      </div>
    </div>
  );
}
