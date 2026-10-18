"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface SeatAddonModalProps {
  open: boolean;
  onClose: () => void;
  /** 增购成功后回调（如刷新空间配额） */
  onSuccess?: () => void;
  workspaceId: string;
  workspaceName?: string;
  /** 当前套餐到期时间（ISO 字符串），用于提示增购席位有效期 */
  planExpiresAt?: string | null;
  currentPlanKey?: string;
}

/**
 * 席位增购弹窗。
 * 企业 / 旗舰等付费空间的所有者，可按剩余计费时长折算价格，为空间增购团队席位。
 * 增购席位有效期至当前套餐到期日，随套餐一并清零。
 */
export default function SeatAddonModal({
  open,
  onClose,
  onSuccess,
  workspaceId,
  workspaceName,
  planExpiresAt,
  currentPlanKey,
}: SeatAddonModalProps) {
  const [seats, setSeats] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    amount: number;
    seats: number;
    expiresAt: string;
    message: string;
  } | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isFinite(seats) || seats <= 0) {
      setError("请输入有效的增购席位数（至少 1 个）");
      return;
    }
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/workspace/seat-addon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ workspaceId, seats: Math.floor(seats) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.payUrl) {
        // 真实支付链路：跳转到收银台完成支付后，席位才会在支付确认时生效
        window.location.href = data.payUrl;
        return;
      }
      setError(data.error || "席位增购下单失败，请稍后重试");
    } catch {
      setError("网络异常，席位增购下单失败");
    } finally {
      setLoading(false);
    }
  };

  const closeAndReset = () => {
    setSeats(1);
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-[#3182ce]" />
          增购团队席位
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          为空间「<strong>{workspaceName}</strong>」增购席位，新增席位有效期至当前套餐到期日
          {planExpiresAt ? `（{new Date(planExpiresAt).toLocaleDateString("zh-CN")}）` : ""}
          ，金额按剩余天数折算，一次性买断。
        </p>

        {result ? (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 font-bold leading-relaxed">
            {result.message}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600">增购席位数</label>
              <input
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#3182ce]"
              />
            </div>
            {error && (
              <p className="text-[11px] text-red-500 font-bold leading-relaxed">{error}</p>
            )}
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          {result ? (
            <button
              onClick={closeAndReset}
              className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer"
            >
              完成
            </button>
          ) : (
            <>
              <button
                onClick={closeAndReset}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading ? "处理中..." : "确认增购"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
