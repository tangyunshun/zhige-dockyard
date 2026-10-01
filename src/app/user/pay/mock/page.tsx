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
import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

interface OrderInfo {
  orderNo: string;
  title: string;
  amountCents: number;
  points: number;
  status: string;
  channel: string;
  paymentMode: "MOCK" | "REAL";
  discountPercent: number;
  discountLabel: string;
  workspaceId: string;
}

function MockCashierInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNo = params.get("orderNo") || "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setOrder(res.data);
        if (res.data.status !== "PENDING") setResult("该订单已完成支付并入账");
      } catch (e) {
        setError((e as Error)?.message || "加载订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNo, authFetch]);

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      const res = await authFetch("/api/payments/mock/confirm", {
        method: "POST",
        body: JSON.stringify({ orderNo }),
      });
      setResult(res.message || "模拟收款成功");
      setOrder((prev) => (prev ? { ...prev, status: "SUCCESS" } : prev));
    } catch (e) {
      setError((e as Error)?.message || "模拟支付失败");
    } finally {
      setPaying(false);
    }
  };

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
            <div className="text-base font-black text-slate-900">知阁·舟坊 · 算力充值</div>
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
                  对应 {order.points.toLocaleString()} 算力点
                  {order.discountLabel ? ` · 会员${order.discountLabel}优惠` : ""}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
                <div>商品：{order.title}</div>
                <div>订单号：{order.orderNo}</div>
                <div>支付方式：{order.channel === "ALIPAY" ? "支付宝" : "微信支付"}（模拟）</div>
                <div>
                  状态：
                  <span className={order.status === "SUCCESS" ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                    {order.status === "SUCCESS" ? "已支付并入账" : "等待支付"}
                  </span>
                </div>
              </div>

              {result ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 justify-center text-sm text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    {result}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/user/billing-center"
                      className="flex-1 text-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-black hover:bg-indigo-700"
                    >
                      查看我的算力账单
                    </Link>
                    <Link
                      href="/user/points"
                      className="flex-1 text-center px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-black hover:bg-slate-50"
                    >
                      前往算力中心
                    </Link>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={paying || order.status !== "PENDING"}
                  onClick={() => void pay()}
                >
                  {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {paying ? "处理中…" : "模拟支付成功"}
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
