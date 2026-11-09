"use client";

/**
 * 微信 Native 扫码收银台页（真实支付）
 *
 * 流程：读取订单（含 code_url）→ 本地渲染支付二维码 → 每 3s 轮询订单状态 →
 *       支付成功（回调验签入账后）显示到账结果并引导前往账务中心。
 * 诚实口径：本页只展示官方 code_url 生成的二维码，不做任何"点击即到账"的模拟动作。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import {
  resolveCashierStatusView,
  resolveCashierSuccessView,
  isQrReady,
} from "@/lib/payment-cashier-display";

interface OrderInfo {
  orderNo: string;
  title: string;
  type: string;
  amountCents: number;
  points: number;
  seats: number;
  status: string;
  channel: string;
  expiresAt: string | null;
  codeUrl: string | null;
}

export default function PayQrPage() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNo = params.get("orderNo") || "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = useCallback(async (): Promise<OrderInfo | null> => {
    const res = await fetch(`/api/payments/order?orderNo=${encodeURIComponent(orderNo)}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `查询订单失败(${res.status})`);
    return body?.data ?? null;
  }, [orderNo]);

  useEffect(() => {
    if (!orderNo) {
      setError("缺少订单号");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const data = await fetchOrder();
        setOrder(data);
        if (data?.codeUrl) {
          const url = await QRCode.toDataURL(data.codeUrl, { width: 240, margin: 2 });
          setQrDataUrl(url);
        }
      } catch (e) {
        setError((e as Error)?.message || "加载订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNo, fetchOrder]);

  // 支付状态轮询：PENDING 时每 3s 查询一次
  useEffect(() => {
    if (!orderNo || order?.status !== "PENDING") return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchOrder();
        if (data) setOrder(data);
      } catch {
        /* 轮询失败忽略，下个周期重试 */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [orderNo, order?.status, fetchOrder]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">正在加载订单…</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-rose-100 p-6 max-w-sm w-full text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm font-bold text-slate-700">{error || "订单加载失败"}</p>
          <button
            onClick={() => router.push("/user/pay")}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
          >
            返回收银台
          </button>
        </div>
      </div>
    );
  }

  const paid = order.status === "SUCCESS";
  // [R0-B1 F4] 真实状态视图：仅 SUCCESS 为完成；EXPIRED/FAILED/REFUNDED/未知分别诚实呈现
  const statusView = resolveCashierStatusView(order.status);
  const expiredPending =
    order.status === "PENDING" && order?.expiresAt && new Date(order.expiresAt) < new Date();
  // 二维码可用性：PENDING 且有载体才展示；缺载体明确报错，不无限加载
  const qrReady = isQrReady(order);

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#0ea35b] to-[#07874c] p-5 text-white flex items-center gap-3">
          <CreditCard className="w-5 h-5" />
          <div>
            <p className="text-sm font-black">微信扫码支付</p>
            <p className="text-[10px] opacity-80 mt-0.5">请使用微信「扫一扫」识别下方二维码完成支付</p>
          </div>
        </div>

        <div className="p-6 text-center space-y-4">
          <div>
            <p className="text-[11px] text-slate-400 font-bold">{order.title}</p>
            <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">
              ¥{(order.amountCents / 100).toFixed(2)}
            </p>
          </div>

          {paid ? (
            (() => {
              // [R0-B1 F4] 按商品类型展示完成结果：席位/算力/套餐各自文案与入口，未知类型中性
              const successView = resolveCashierSuccessView(order.type, order.seats);
              return (
                <div className="space-y-3 py-4">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                  <p className="text-sm font-black text-emerald-600">{successView.message}</p>
                  <div className="flex flex-col gap-2 items-center">
                    {successView.entries.map((e) => (
                      <button
                        key={e.href}
                        onClick={() => router.push(e.href)}
                        className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : statusView.kind === "expired" || expiredPending ? (
            <div className="space-y-3 py-4">
              <AlertTriangle className="w-14 h-14 text-amber-400 mx-auto" />
              <p className="text-sm font-black text-slate-700">订单已超时关闭</p>
              <p className="text-[11px] text-slate-400">未完成支付；如已付款请凭订单号联系客服核实，请勿重复支付</p>
              <button
                onClick={() => router.push("/user/pay")}
                className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                返回收银台
              </button>
            </div>
          ) : statusView.kind === "failed" ? (
            <div className="space-y-3 py-4">
              <AlertTriangle className="w-14 h-14 text-rose-500 mx-auto" />
              <p className="text-sm font-black text-rose-600">订单支付失败</p>
              <p className="text-[11px] text-slate-400">未完成入账；如已扣款请凭订单号联系客服核实，请勿重复支付</p>
              <button
                onClick={() => router.push("/user/pay")}
                className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                返回收银台
              </button>
            </div>
          ) : statusView.kind === "refunded" ? (
            <div className="space-y-3 py-4">
              <AlertTriangle className="w-14 h-14 text-rose-500 mx-auto" />
              <p className="text-sm font-black text-rose-600">订单已退款</p>
              <p className="text-[11px] text-slate-400">对应权益未生效；如有疑问请凭订单号联系客服</p>
              <button
                onClick={() => router.push("/user/pay")}
                className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                返回收银台
              </button>
            </div>
          ) : statusView.kind === "unknown" ? (
            <div className="space-y-3 py-4">
              <AlertTriangle className="w-14 h-14 text-slate-400 mx-auto" />
              <p className="text-sm font-black text-slate-700">{statusView.statusLabel}</p>
              <p className="text-[11px] text-slate-400">{statusView.resultMessage}</p>
              <button
                onClick={() => router.push("/user/pay")}
                className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                返回收银台
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {qrReady ? (
                <div className="inline-block p-3 bg-white border-2 border-slate-100 rounded-2xl shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl ?? ""} alt="微信支付二维码" className="w-[220px] h-[220px]" />
                </div>
              ) : (
                // [R0-B1 F4] 缺二维码载体：明确报错与出口，不无限加载
                <div className="h-[244px] flex flex-col items-center justify-center gap-2 px-4">
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                  <p className="text-xs font-bold text-slate-600">未能获取支付二维码</p>
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    支付渠道未返回二维码载体，本次支付无法继续；未支付不会扣款
                  </p>
                  <button
                    onClick={() => router.push("/user/pay")}
                    className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    返回收银台
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                正在等待支付结果确认…
              </p>
              {order.expiresAt && (
                <p className="text-[10px] text-rose-400 font-bold">
                  支付截止：{new Date(order.expiresAt).toLocaleString("zh-CN")}（超时订单自动关闭）
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-100 px-5 py-3">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            本页二维码由微信支付官方下单接口生成（code_url），支付结果以微信支付服务器的异步通知为准；
            平台在收到验签通过的通知后才按订单类型入账（席位/算力/套餐以订单为准）。
          </p>
        </div>
      </div>
    </div>
  );
}
