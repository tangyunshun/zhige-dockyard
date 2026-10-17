"use client";

/**
 * 算力充值弹窗（与 /user/pay 收银页同一后端链路，仅编排为 Modal 形态）：
 *   - GET /api/workspace/quota/token-packs  真实在售算力包 + 当前会员折扣
 *   - GET /api/workspace/quota               当前算力余额
 *   - GET /api/workspace/list                可选充值归属空间（仅本人为所有者/管理员）
 *   - POST /api/payments/create              创建待支付订单（不立即入账）
 *   - POST /api/payments/mock/confirm        模拟支付确认并入账（仅 MOCK 模式）
 *
 * 支付通道：商户真实凭证未接入前，后端恒定返回 paymentMode=MOCK，
 * 弹窗据此展示「模拟支付」并标注"测试环境·非真实收款"。真实商户接入是后续独立批次。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Coins,
  CreditCard,
  CheckCircle2,
  Loader2,
  Wallet,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance } from "@/utils/quota";

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
  payUrl: string | null;
}

const PAYMENT_METHODS = [
  { value: "WECHAT_PAY", label: "微信支付", icon: "/icons/wechat-pay.png" },
  { value: "ALIPAY", label: "支付宝", icon: "/icons/alipay.png" },
] as const;

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 充值成功入账后回调（父组件据此刷新余额/流水） */
  onSuccess?: (points: number) => void;
  /** 打开时默认选中的归属空间 */
  defaultWorkspaceId?: string;
}

export default function RechargeModal({
  isOpen,
  onClose,
  onSuccess,
  defaultWorkspaceId,
}: RechargeModalProps) {
  const toast = useToast();

  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [membershipDiscount, setMembershipDiscount] = useState(0); // 百分比，10=9折
  const [membershipName, setMembershipName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"WECHAT_PAY" | "ALIPAY">("WECHAT_PAY");

  const [loading, setLoading] = useState(false);
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [packRes, wsRes, quotaRes] = await Promise.all([
        authFetch("/api/workspace/quota/token-packs"),
        authFetch("/api/workspace/list"),
        authFetch("/api/workspace/quota").catch(() => null),
      ]);

      const list: TokenPack[] = Array.isArray(packRes?.packs) ? packRes.packs : [];
      setPacks(list);
      if (packRes?.membership) {
        setMembershipDiscount(Number(packRes.membership.tokenPackDiscount) || 0);
        setMembershipName(packRes.membership.nameZh || null);
      }
      if (list.length > 0) {
        const popular = list.find((p) => p.isPopular);
        setSelectedPackId((prev) => prev || (popular || list[0]).id);
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
      setSelectedWorkspaceId((prev) => {
        if (prev && allWs.some((w) => w.id === prev)) return prev;
        if (defaultWorkspaceId && allWs.some((w) => w.id === defaultWorkspaceId)) {
          return defaultWorkspaceId;
        }
        return allWs[0]?.id || "";
      });

      if (quotaRes?.success) setBalance(Number(quotaRes.tokenBalance) || 0);
    } catch (e) {
      setError((e as Error)?.message || "加载充值信息失败");
    } finally {
      setLoading(false);
    }
  }, [authFetch, defaultWorkspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    setOrder(null);
    setConfirmResult(null);
    setError(null);
    void loadAll();
  }, [isOpen, loadAll]);

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
      const created: CreatedOrder = {
        orderNo: data.orderNo,
        amountCents: Number(data.amountCents) || 0,
        points: Number(data.points) || selectedPack.points,
        discountPercent: Number(data.discountPercent) || 0,
        paymentMode: data.paymentMode === "REAL" ? "REAL" : "MOCK",
        payUrl: data.payUrl || null,
      };
      setOrder(created);
      if (created.paymentMode === "REAL" && created.payUrl) {
        // 真实网关：跳转到网关收银台（本批次不接入，仅保留通道兼容）
        window.location.href = created.payUrl;
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
      // 刷新余额（下单后余额已由后端入账）
      try {
        const quotaRes = await authFetch("/api/workspace/quota");
        if (quotaRes?.success) setBalance(Number(quotaRes.tokenBalance) || 0);
      } catch {
        /* 余额刷新失败不阻断成功态 */
      }
      onSuccess?.(order.points);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[88vh] overflow-y-auto z-10">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm flex items-center justify-between px-5 py-4 border-b border-slate-100 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">算力充值</h3>
              <p className="text-[10px] text-slate-400 font-bold">购买算力包，实时到账、随用随扣</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 余额 */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <Wallet className="w-3.5 h-3.5 text-[#3182ce]" />
              当前算力点余额
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black text-slate-800 tabular-nums font-mono">
                {balance == null ? "—" : formatTokenBalance(balance)}
              </span>
              <span className="text-[10px] text-slate-400 font-bold">算力点</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-bold">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-400 gap-2 text-xs font-bold">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载充值信息…
            </div>
          ) : order && order.paymentMode === "MOCK" && confirmResult ? (
            /* 成功态 */
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-7 text-center space-y-3">
              <CheckCircle2 className="w-11 h-11 text-emerald-500 mx-auto" />
              <div className="text-sm font-black text-emerald-700">充值成功</div>
              <p className="text-[11px] text-emerald-700 font-medium">支付成功，算力点已实时到账。</p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                <span>当前余额</span>
                <span className="font-black text-slate-800 tabular-nums font-mono">
                  {balance == null ? "—" : formatTokenBalance(balance)} 算力点
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={resetOrder}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all"
                >
                  再充一笔
                </button>
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl bg-[#3182ce] text-white font-bold text-xs hover:brightness-105 transition-all"
                >
                  完成
                </button>
              </div>
            </div>
          ) : order && order.paymentMode === "MOCK" ? (
            /* 模拟收银台 */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-700">
                <CreditCard className="w-4 h-4" />
                <span className="text-xs font-black">收银台</span>
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
                    {paymentMethod === "ALIPAY" ? "支付宝" : "微信支付"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-slate-200">
                  <span>应付金额</span>
                  <span className="text-lg font-black text-slate-900 tabular-nums">
                    ¥{(order.amountCents / 100).toFixed(2)}
                  </span>
                </div>
                {order.discountPercent > 0 && (
                  <div className="text-[10px] text-emerald-600 font-semibold">
                    会员{order.discountPercent}% 优惠已计入
                  </div>
                )}
              </div>
              <button
                onClick={() => void confirmMock()}
                disabled={confirming}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {confirming ? "支付确认中…" : "确认支付"}
              </button>
              <button
                onClick={resetOrder}
                disabled={confirming}
                className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-600"
              >
                取消并返回
              </button>
            </div>
          ) : (
            /* 选包 + 下单 */
            <div className="space-y-4">
              {/* 充值归属空间 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">充值归属空间</label>
                {workspaces.length === 0 ? (
                  <p className="text-[11px] text-slate-400">未找到可充值空间，请先创建个人或企业空间。</p>
                ) : (
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#3182ce]"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}（{w.type === "ENTERPRISE" ? "企业空间·共享池" : "个人空间·钱包"}）
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  个人空间充值进入个人钱包；企业空间充值进入该企业共享池，成员共用。
                </p>
              </div>

              {/* 算力包列表 */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span className="text-xs font-black text-slate-700">选择算力包</span>
                  {membershipDiscount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {membershipName || "会员"}专享 {membershipDiscount}% 折扣
                    </span>
                  )}
                </div>
                {/* 兑换比例：随所选算力包实时变化，来自后台真实定价 */}
                <p className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">
                  {selectedPack
                    ? `兑换比例：¥${selectedPack.price.toFixed(2)} = ${selectedPack.points.toLocaleString("zh-CN")} 算力点（1 元 ≈ ${(Math.round((selectedPack.points / selectedPack.price) * 10) / 10).toLocaleString("zh-CN")} 点）${membershipDiscount > 0 ? "，会员折扣后更低" : ""}`
                    : "兑换比例以所选算力包为准"}
                </p>
                {/* 包数量后期扩充时在此内部滚动，弹窗高度不失控 */}
                <div className="grid grid-cols-2 gap-2 max-h-[264px] overflow-y-auto pr-0.5">
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
                        className={`relative text-left rounded-xl border p-3 transition-all ${
                          active
                            ? "border-[#3182ce] bg-[#3182ce]/[0.04] ring-1 ring-[#3182ce]/30"
                            : "border-slate-200 bg-white hover:border-[#3182ce]/40"
                        }`}
                      >
                        {p.isPopular && (
                          <span className="absolute -top-1.5 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-100">
                            推荐
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ background: `${p.color}1a` }}
                          >
                            {p.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-black text-slate-800 truncate">{p.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {p.points.toLocaleString()} 点
                            </div>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <span className="text-sm font-black text-slate-900 tabular-nums">
                            ¥{mp.toFixed(2)}
                          </span>
                          {membershipDiscount > 0 && (
                            <span className="text-[10px] text-slate-400 line-through">
                              ¥{p.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 支付方式 */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1.5">支付方式</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const active = paymentMethod === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setPaymentMethod(m.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          active
                            ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                            : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <img src={m.icon} alt="" className="w-5 h-5 object-contain shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 去支付 */}
              <button
                onClick={() => void startPay()}
                disabled={!canPay}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {creating
                  ? "正在创建订单…"
                  : selectedPack && memberPrice != null
                    ? `去支付 ¥${memberPrice.toFixed(2)}`
                    : "去支付"}
              </button>
              {!selectedWorkspaceId && workspaces.length > 0 && (
                <p className="text-center text-[10px] text-rose-500 font-medium">请先选择充值归属空间</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
