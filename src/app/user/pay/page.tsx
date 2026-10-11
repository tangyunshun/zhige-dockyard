"use client";

/**
 * 算力充值收银页（PAY-LINK 批次）
 *
 * 职责：把「可购加油包 → 下单 → 支付 → 到账刷新」这条本就存在的后端链路
 * 在用户侧正式补全闭环。本页只做前端编排，所有账务/入账动作均在后端完成：
 *   - GET /api/workspace/quota/token-packs  真实在售加油包 + 当前会员折扣
 *   - GET /api/workspace/quota               当前算力余额（与 /pricing 同口径）
 *   - GET /api/workspace/list                可选充值归属空间（仅本人为所有者/管理员）
 *   - POST /api/payments/create              创建待支付订单（不立即入账）
 *   - POST /api/payments/mock/confirm        模拟支付确认并入账（仅 MOCK 模式）
 *
 * 支付通道：商户真实凭证未接入前，后端恒定返回 paymentMode=MOCK，
 * 本页据此展示「模拟支付」并标注“测试环境·非真实收款”，与既有 /user/pay/mock 收银台同源。
 * 真实商户接入是后续独立批次，本页不触碰支付本身。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Coins,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Wallet,
  Zap,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";

interface TokenPack {
  id: string;
  name: string;
  points: number;
  price: number; // 原价（元）
  icon: string;
  color: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface WorkspaceOption {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: string;
}

interface CreatedOrder {
  orderNo: string;
  amountCents: number;
  points: number;
  discountPercent: number;
  paymentMode: "MOCK" | "REAL";
  realGatewayReady: boolean;
  payUrl: string | null;
  notice: string;
}

const PAYMENT_METHODS = [
  { value: "WECHAT_PAY", label: "微信支付", hint: "微信扫码支付" },
  { value: "ALIPAY", label: "支付宝", hint: "支付宝扫码支付" },
] as const;

export default function UserPayPage() {
  const router = useRouter();
  const toast = useToast();

  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [membershipDiscount, setMembershipDiscount] = useState(0); // 百分比，10=9折
  const [membershipName, setMembershipName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"WECHAT_PAY" | "ALIPAY">("WECHAT_PAY");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = getAuthToken();
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const data = await authFetch("/api/workspace/quota");
      if (data?.success) setBalance(Number(data.tokenBalance) || 0);
    } catch {
      /* 余额加载失败静默降级，不阻断选包 */
    }
  }, [authFetch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [packRes, wsRes] = await Promise.all([
        authFetch("/api/workspace/quota/token-packs"),
        authFetch("/api/workspace/list"),
      ]);

      const list: TokenPack[] = Array.isArray(packRes?.packs) ? packRes.packs : [];
      setPacks(list);
      if (packRes?.membership) {
        setMembershipDiscount(Number(packRes.membership.tokenPackDiscount) || 0);
        setMembershipName(packRes.membership.nameZh || null);
      }
      if (list.length > 0) {
        // 默认选中「推荐」包，否则第一个
        const popular = list.find((p) => p.isPopular);
        setSelectedPackId((popular || list[0]).id);
      }

      const allWs: WorkspaceOption[] = Array.isArray(wsRes?.workspaces)
        ? wsRes.workspaces
            .filter((w: any) => w.role === "OWNER" || w.role === "ADMIN")
            .map((w: any) => ({
              id: w.id,
              name: w.name,
              type: w.type,
              role: w.role,
            }))
        : [];
      setWorkspaces(allWs);
      const current = wsRes?.currentWorkspaceId as string | undefined;
      setSelectedWorkspaceId(
        current && allWs.some((w) => w.id === current)
          ? current
          : allWs[0]?.id || "",
      );

      await loadBalance();
    } catch (e) {
      setError((e as Error)?.message || "加载充值信息失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, loadBalance]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) || null,
    [packs, selectedPackId],
  );

  // 会员价（与后端 discountedCents 同口径：原价 ×(1 - 折扣%)）
  const memberPrice = useMemo(() => {
    if (!selectedPack) return null;
    if (membershipDiscount <= 0) return selectedPack.price;
    return Math.round(selectedPack.price * (1 - membershipDiscount / 100) * 100) / 100;
  }, [selectedPack, membershipDiscount]);

  const canPay = !!selectedPack && !!selectedWorkspaceId && !creating && !order;

  const startPay = async () => {
    if (!selectedPack || !selectedWorkspaceId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await authFetch("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          points: selectedPack.points,
          packId: selectedPack.id,
          paymentMethod,
        }),
      });
      setOrder({
        orderNo: data.orderNo,
        amountCents: Number(data.amountCents) || 0,
        points: Number(data.points) || selectedPack.points,
        discountPercent: Number(data.discountPercent) || 0,
        paymentMode: data.paymentMode === "REAL" ? "REAL" : "MOCK",
        realGatewayReady: !!data.realGatewayReady,
        payUrl: data.payUrl || null,
        notice: data.notice || "",
      });
      if (data.paymentMode === "REAL" && data.payUrl) {
        // 真实网关：跳转到网关收银台（本批次不接入，仅保留通道兼容）
        window.location.href = data.payUrl;
      }
    } catch (e) {
      setError((e as Error)?.message || "创建充值订单失败");
    } finally {
      setCreating(false);
    }
  };

  const confirmMock = async () => {
    if (!order) return;
    setConfirming(true);
    setError(null);
    try {
      const data = await authFetch("/api/payments/mock/confirm", {
        method: "POST",
        body: JSON.stringify({ orderNo: order.orderNo }),
      });
      setConfirmResult(data.message || "模拟收款成功，算力点已到账（非真实扣款）");
      toast.success(`充值成功，已入账 ${order.points.toLocaleString()} 算力点`);
      await loadBalance();
    } catch (e) {
      setError((e as Error)?.message || "模拟支付确认失败");
    } finally {
      setConfirming(false);
    }
  };

  const resetOrder = () => {
    setOrder(null);
    setConfirmResult(null);
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* 页头 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm">
          <Coins className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-800">算力充值</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            购买算力加油包，实时到账、随用随扣
          </p>
        </div>
      </div>

      {/* 当前余额（与 /pricing 同口径） */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#3182ce]" />
          <span className="text-xs text-slate-500 font-bold">当前算力点余额</span>
          {selectedWorkspaceId && (
            <a
              href={`/workspace/${selectedWorkspaceId}`}
              className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] underline underline-offset-2"
            >
              ← 返回空间工作台
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-slate-800 tabular-nums font-mono">
            {balance == null
              ? "—"
              : isUnlimitedToken(balance)
                ? "∞"
                : formatTokenBalance(balance)}
          </span>
          <span className="text-[11px] text-slate-400 font-bold">算力点</span>
          <button
            onClick={() => void loadBalance()}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3182ce] hover:bg-slate-100 transition-colors"
            title="刷新余额"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 测试环境标注 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2 mb-5">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-800 font-semibold leading-relaxed">
          测试环境：模拟支付。当前尚未接入真实商户号，充值流程走模拟通道，
          <b className="font-black">不会产生任何真实扣款</b>，仅用于把「下单 → 支付 → 到账」闭环跑通。真实微信/支付宝收款为后续独立批次。
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-bold mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载充值信息…
        </div>
      ) : (
        <>
          {/* 支付成功结果 */}
          {order && order.paymentMode === "MOCK" && confirmResult ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div className="text-base font-black text-emerald-700">充值成功</div>
              <p className="text-xs text-emerald-700 font-medium">{confirmResult}</p>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                <span>当前余额</span>
                <span className="font-black text-slate-800 tabular-nums font-mono">
                  {balance == null ? "—" : formatTokenBalance(balance)} 算力点
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetOrder}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all"
                >
                  再充一笔
                </button>
                <Link
                  href="/user/points"
                  className="px-4 py-2.5 rounded-xl bg-[#3182ce] text-white font-bold text-sm hover:brightness-105 transition-all"
                >
                  查看算力流水
                </Link>
              </div>
            </div>
          ) : order && order.paymentMode === "MOCK" ? (
            /* 模拟支付确认面板 */
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 space-y-5">
              <div className="flex items-center gap-2 text-slate-700">
                <CreditCard className="w-4 h-4" />
                <span className="text-sm font-black">模拟收银台</span>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>商品</span>
                  <span className="font-bold text-slate-800">
                    {selectedPack?.name}（{order.points.toLocaleString()} 算力点）
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>订单号</span>
                  <span className="font-mono">{order.orderNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>支付方式</span>
                  <span className="font-bold">
                    {paymentMethod === "ALIPAY" ? "支付宝" : "微信支付"}（模拟）
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-slate-200">
                  <span>应付金额</span>
                  <span className="text-xl font-black text-slate-900 tabular-nums">
                    ¥{(order.amountCents / 100).toFixed(2)}
                  </span>
                </div>
                {order.discountPercent > 0 && (
                  <div className="text-[11px] text-emerald-600 font-semibold">
                    会员{order.discountPercent}% 优惠已计入
                  </div>
                )}
              </div>

              <button
                onClick={() => void confirmMock()}
                disabled={confirming}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {confirming ? "确认收款中…" : "模拟支付成功（确认收款并入账）"}
              </button>
              <button
                onClick={resetOrder}
                disabled={confirming}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-600"
              >
                取消并返回
              </button>
            </div>
          ) : (
            /* 选包 + 下单 */
            <div className="space-y-5">
              {/* 充值归属空间 */}
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <label className="block text-xs font-bold text-slate-600 mb-2">
                  充值归属空间 <span className="text-slate-400 font-normal">（仅本人为所有者/管理员的空间）</span>
                </label>
                {workspaces.length === 0 ? (
                  <p className="text-xs text-slate-400">未找到可充值空间，请先创建个人或企业空间。</p>
                ) : (
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-[#3182ce]"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·钱包"}）
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  个人空间充值进入跨空间通用的个人钱包；企业空间充值进入该企业共享池，成员共用。
                </p>
              </div>

              {/* 加油包列表 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-[#3182ce]" />
                  <span className="text-sm font-black text-slate-700">选择算力加油包</span>
                  {membershipDiscount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {membershipName || "会员"}专享 {membershipDiscount}% 折扣
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {packs.map((p) => {
                    const active = p.id === selectedPackId;
                    const mp = membershipDiscount > 0
                      ? Math.round(p.price * (1 - membershipDiscount / 100) * 100) / 100
                      : p.price;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPackId(p.id)}
                        className={`relative text-left rounded-2xl border p-4 transition-all ${
                          active
                            ? "border-[#3182ce] bg-[#3182ce]/[0.04] shadow-sm ring-1 ring-[#3182ce]/30"
                            : "border-slate-200 bg-white hover:border-[#3182ce]/40"
                        }`}
                      >
                        {p.isPopular && (
                          <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100">
                            推荐
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                            style={{ background: `${p.color}1a` }}
                          >
                            {p.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-800 truncate">{p.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {p.points.toLocaleString()} 算力点
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed min-h-[32px]">
                          {p.description}
                        </p>
                        <div className="flex items-baseline gap-1.5 mt-2">
                          <span className="text-lg font-black text-slate-900 tabular-nums">
                            ¥{mp.toFixed(2)}
                          </span>
                          {membershipDiscount > 0 && (
                            <span className="text-[11px] text-slate-400 line-through">
                              ¥{p.price.toFixed(2)}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-bold">约 ¥{(mp / p.points * 1000000 / 100).toFixed(4)}/百万点</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 支付方式 */}
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <div className="text-xs font-bold text-slate-600 mb-2">支付方式</div>
                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setPaymentMethod(m.value)}
                        className={`rounded-xl border px-4 py-3 text-left transition-all ${
                          active
                            ? "border-[#3182ce] bg-[#3182ce]/[0.04] ring-1 ring-[#3182ce]/30"
                            : "border-slate-200 hover:border-[#3182ce]/40"
                        }`}
                      >
                        <div className="text-sm font-black text-slate-800">{m.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{m.hint}（模拟）</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 去支付 */}
              <button
                onClick={() => void startPay()}
                disabled={!canPay}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {creating
                  ? "正在创建订单…"
                  : selectedPack && memberPrice != null
                    ? `去支付 ¥${memberPrice.toFixed(2)}`
                    : "去支付"}
              </button>
              {!selectedWorkspaceId && workspaces.length > 0 && (
                <p className="text-center text-[11px] text-rose-500 font-medium">请先选择充值归属空间</p>
              )}
            </div>
          )}
        </>
      )}

      {/* 底部说明 */}
      <div className="mt-6 text-center">
        <Link href="/pricing" className="text-[11px] text-[#3182ce] font-bold hover:underline">
          查看会员权益与算力计费说明
        </Link>
      </div>
    </div>
  );
}
