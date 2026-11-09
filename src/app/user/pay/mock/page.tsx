"use client";

/**
 * 模拟收银台（仅 PAYMENT_MODE=mock 时使用）
 *
 * 作用：在商户凭证到位前，把「下单 → 收银台 → 确认支付 → 入账」链路跑通，便于联调与验收。
 * 诚实原则：页面顶部明确标注【模拟支付】，说明不会产生真实扣款；
 * 真实模式（凭证齐全）下必须由支付网关回调入账，本页不可用。
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import {
  resolveCashierStatusView,
  resolveCashierSuccessView,
  resolveCashierCompletion,
  isConfirmedSuccessResponse,
  type CashierStatusView,
} from "@/lib/payment-cashier-display";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

interface OrderInfo {
  orderNo: string;
  title: string;
  type: string;
  amountCents: number;
  points: number;
  seats: number;
  status: string;
  channel: string;
  paymentMode: "MOCK" | "REAL";
  discountPercent: number;
  discountLabel: string;
  workspaceId: string;
  planName?: string;
}

function MockCashierInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNo = params.get("orderNo") || "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  // [R0-B1 F4] 结果区携带语气：仅明确成功显示完成；过期/失败/退款/未知分别诚实呈现
  const [result, setResult] = useState<{ message: string; tone: CashierStatusView["tone"] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeBlocked, setModeBlocked] = useState(false);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  useEffect(() => {
    if (!orderNo) {
      setError("缺少订单号");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await authFetch(`/api/payments/mock/confirm?orderNo=${encodeURIComponent(orderNo)}`);
        if (res.status === 403) {
          // KN-SEC：REAL 模式下模拟收银台被后端拒绝，页面降级为不可用且不渲染支付按钮
          setError(res.message || "当前为真实支付模式，模拟收银台不可用");
          setModeBlocked(true);
          return;
        }
        setOrder(res.data);
        // [R0-B2-3] 切换订单时清空上一单残留结果，避免跨订单污染
        setResult(null);
        // 以业务状态（SUCCESS）决定完成分支：直接打开/刷新成功订单也展示完成结果与入口；
        // 非完成终态（过期/失败/退款/未知）按状态视图呈现，不伪称成功。
        const view = resolveCashierStatusView(res.data?.status);
        if (view.isCompleted) {
          const sv = resolveCashierSuccessView(res.data?.type, res.data?.seats);
          setResult({ message: sv.message, tone: "success" });
        } else if (view.kind !== "pending") {
          setResult({ message: view.resultMessage, tone: view.tone });
        }
      } catch (e) {
        setError((e as Error)?.message || "加载订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNo, authFetch]);

  const pay = async () => {
    if (modeBlocked) return; // KN-SEC：REAL 模式双保险
    setPaying(true);
    setError(null);
    try {
      const res = await authFetch("/api/payments/mock/confirm", {
        method: "POST",
        body: JSON.stringify({ orderNo }),
      });
      // [R0-B2-3] 仅「2xx 且 success 且携带明确完成证据（席位/点数/空间/已处理）」才展示完成结果；
      // 2xx 但 success:false、缺完成证据、非2xx、网络失败，都不伪装成功，保留原订单状态并提示核查。
      const completedNow = isConfirmedSuccessResponse(res);
      if (completedNow) {
        setResult({
          message: res.message || "模拟收款成功",
          tone: res.alreadyProcessed ? "neutral" : "success",
        });
        setOrder((prev) => (prev ? { ...prev, status: "SUCCESS" } : prev));
      } else {
        setResult({
          message: res.message || "订单未完成入账，请刷新页面或凭订单号联系客服核实，请勿重复支付",
          tone: "neutral",
        });
      }
    } catch (e) {
      setError((e as Error)?.message || "模拟支付失败");
    } finally {
      setPaying(false);
    }
  };

  // [R0-B2-3] 完成分支由业务状态（SUCCESS）决定，不依赖颜色 tone；中性提示（已处理）仍属已完成订单
  const completion = resolveCashierCompletion(order?.type, order?.seats, order?.status);
  const resultView = resolveCashierStatusView(order?.status);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 模拟支付醒目标识：任何时候都不能让用户误以为这是真钱支付 */}
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 font-bold leading-relaxed">
            <div>【模拟支付】当前平台尚未接入真实支付渠道</div>
            <div className="font-medium text-amber-700 mt-0.5">
              本页不会产生任何真实扣款，仅用于把充值流程跑通。凭证到位后将切换为微信/支付宝真实收款。
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <div className="text-sm text-slate-500">收款方</div>
            <div className="text-base font-black text-slate-900">
              {order?.type === "SEAT_ADDON"
                ? "知阁·舟坊 · 席位增购"
                : order?.type === "PLAN_UPGRADE"
                  ? "知阁·舟坊 · 升级企业空间"
                  : "知阁·舟坊 · 算力充值"}
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载订单…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 text-center py-6">{error}</div>
          ) : order ? (
            <>
              <div className="text-center py-2">
                <div className="text-3xl font-black text-slate-900">
                  ¥{(order.amountCents / 100).toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {order.type === "SEAT_ADDON" ? (
                    <>增购 {order.seats} 个团队席位</>
                  ) : order.type === "PLAN_UPGRADE" ? (
                    <>升级为「{order.planName || "企业"}」企业空间</>
                  ) : (
                    <>
                      对应 {order.points.toLocaleString()} 算力点
                      {order.discountLabel ? ` · 会员${order.discountLabel}优惠` : ""}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
                <div>商品：{order.title}</div>
                <div>订单号：{order.orderNo}</div>
                <div>支付方式：{order.channel === "ALIPAY" ? "支付宝" : "微信支付"}（模拟）</div>
                <div>
                  状态：
                  <span
                    className={
                      resultView.tone === "success"
                        ? "text-emerald-600 font-bold"
                        : resultView.tone === "error"
                          ? "text-rose-600 font-bold"
                          : resultView.tone === "neutral"
                            ? "text-slate-500 font-bold"
                            : "text-amber-600 font-bold"
                    }
                  >
                    {resultView.statusLabel}
                  </span>
                </div>
              </div>

              {completion.completed ? (
                <div className="space-y-3">
                  {/* [R0-B2-3] 直接打开/刷新成功订单、正常确认、重复确认，统一进入完成分支并展示对应入口 */}
                  <div className="flex items-center gap-2 justify-center text-sm text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    {result?.message || completion.message}
                  </div>
                  <div className="flex gap-2">
                    {/* 按商品类型给对应入口：席位成功不显示算力到账/点数流水 */}
                    {resolveCashierSuccessView(order?.type, order?.seats).entries.map((e) => (
                      <Link
                        key={e.href}
                        href={e.href}
                        className="flex-1 text-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-black hover:bg-indigo-700"
                      >
                        {e.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : result ? (
                <div className="space-y-3">
                  <div
                    className={`flex items-center gap-2 justify-center text-sm font-bold ${
                      result.tone === "error"
                        ? "text-rose-600"
                        : result.tone === "neutral"
                          ? "text-slate-600"
                          : "text-amber-600"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {result.message}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/user/billing-center"
                      className="flex-1 text-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-black hover:bg-slate-50"
                    >
                      查看账单记录
                    </Link>
                    <button
                      onClick={() => router.back()}
                      className="flex-1 text-center px-4 py-2.5 bg-slate-100 rounded-lg text-sm font-black hover:bg-slate-200 cursor-pointer"
                    >
                      返回
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={paying || order.status !== "PENDING"}
                  onClick={() => void pay()}
                >
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {modeBlocked ? "模拟支付不可用" : paying ? "处理中…" : "模拟支付成功"}
                </button>
              )}
            </>
          ) : null}

          <button
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600"
            onClick={() => router.back()}
          >
            取消并返回
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MockCashierPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">加载中…</div>}>
      <MockCashierInner />
    </Suspense>
  );
}
