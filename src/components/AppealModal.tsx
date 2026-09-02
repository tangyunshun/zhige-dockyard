"use client";

import React, { useState, useEffect } from "react";
import { X, AlertCircle, CheckCircle, FileText, Clock, RotateCcw, Shield, MessageSquare, AlertTriangle, Flame, Lock, XCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface AppealModalProps {
  account: string;
  onClose: () => void;
  onStatusChange?: () => void;
  initialBanReason?: string;
}

interface ExistingAppeal {
  id: string;
  userAccount: string;
  userName?: string;
  banReason?: string;
  banRule?: string;
  bannedAt?: string;
  bannedUntil?: string;
  appealReason: string;
  appealEvidence?: string | null;
  businessType?: string;
  contactInfo?: string;
  status: "pending" | "approved" | "rejected" | "canceled" | "ban_recorded";
  adminComment?: string;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AppealModal({ account, onClose, onStatusChange, initialBanReason }: AppealModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [existingAppeal, setExistingAppeal] = useState<ExistingAppeal | null>(null);

  const [lastRejectedAppeal, setLastRejectedAppeal] = useState<ExistingAppeal | null>(null);
  const [showReAppealForm, setShowReAppealForm] = useState<boolean>(false);

  // 申诉机会与 30 天销户风控指标
  const [remainingAppeals, setRemainingAppeals] = useState<number>(3);
  const [rejectedCount, setRejectedCount] = useState<number>(0);
  const [isDepleted, setIsDepleted] = useState<boolean>(false);
  const [autoDeleteAt, setAutoDeleteAt] = useState<string | null>(null);
  const [userBanMeta, setUserBanMeta] = useState<{
    status?: string;
    banReason?: string;
    bannedUntil?: string | null;
    lockedUntil?: string | null;
  } | null>(initialBanReason ? { banReason: initialBanReason } : null);

  const [formData, setFormData] = useState({
    appealReason: "",
    contactInfo: "",
  });

  const [defaultContact, setDefaultContact] = useState<string>("");

  // 查询当前账号的申诉进度与风控次数
  const fetchMyAppeal = async () => {
    if (!account) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/account-appeal/my-appeal?account=${encodeURIComponent(account)}`);
      if (res.ok) {
        const json = await res.json();
        setRemainingAppeals(json.remainingAppeals ?? 3);
        setRejectedCount(json.rejectedCount ?? 0);
        setIsDepleted(!!json.isDepleted);
        setAutoDeleteAt(json.autoDeleteAt || null);
        if (json.lastRejectedAppeal) {
          setLastRejectedAppeal(json.lastRejectedAppeal);
        }
        if (json.defaultContactInfo) {
          setDefaultContact(json.defaultContactInfo);
          setFormData((prev) => ({
            ...prev,
            contactInfo: prev.contactInfo ? prev.contactInfo : json.defaultContactInfo,
          }));
        }
        if (json.userBanMeta) {
          setUserBanMeta((prev) => ({
            ...prev,
            ...json.userBanMeta,
            banReason: json.userBanMeta.banReason || prev?.banReason || initialBanReason,
          }));
        }

        if (json.hasAppeal && json.data) {
          setExistingAppeal(json.data);
        } else {
          setExistingAppeal(null);
        }
      }
    } catch (e) {
      console.error("Fetch appeal status error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyAppeal();
  }, [account]);

  // 提交新申诉
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDepleted) {
      toast.error("您的 3 次解封申诉机会已耗尽，账号已被锁定并进入 30 天自动注销流程。");
      return;
    }

    if (!formData.appealReason.trim()) {
      toast.error("请填写具体的申诉原因");
      return;
    }

    if (formData.appealReason.trim().length < 10) {
      toast.error("申诉原因至少需要 10 个字符");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/account-appeal/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAccount: account,
          appealReason: formData.appealReason.trim(),
          contactInfo: formData.contactInfo.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || "申诉提交成功！", 3000);
        onClose();
        setShowReAppealForm(false);
        if (onStatusChange) onStatusChange();
      } else {
        toast.error(data.error || data.message || "提交失败");
      }
    } catch (error) {
      console.error("Submit appeal error:", error);
      toast.error("网络开小差了，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  // 撤销已有申诉
  const executeCancelAppeal = async () => {
    if (!existingAppeal) return;
    setShowConfirmCancel(false);
    setCanceling(true);
    try {
      const res = await fetch("/api/account-appeal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId: existingAppeal.id }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || "申诉已成功撤销");
        onClose();
        setExistingAppeal(null);
        if (onStatusChange) onStatusChange();
      } else {
        toast.error(data.error || "撤销失败");
      }
    } catch (e) {
      console.error("Cancel appeal error:", e);
      toast.error("网络异常，撤销失败");
    } finally {
      setCanceling(false);
    }
  };

  // 格式化时间
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-100 font-sans z-10 animate-in zoom-in-95 duration-200">
        {/* 头部固定 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800">账号解封申诉中枢</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isDepleted
                    ? "bg-red-100 text-red-600"
                    : remainingAppeals === 3
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  申诉机会: {remainingAppeals}/3 次
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isDepleted
                  ? "3次申诉机会已耗尽，账号已被系统锁定"
                  : existingAppeal
                  ? "查看与管理您的解封申诉进度"
                  : "提交申诉申请，请求风控管理员解封账号"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors border border-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容自适应滚动区域 */}
        <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">
            <div className="w-6 h-6 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3" />
            正在查询您的申诉风控凭证...
          </div>
        ) : isDepleted ? (
          /* 模式零：3 次申诉全被驳回 - 30 天自动注销销户看板 */
          <div className="p-6 space-y-5">
            <div className="p-4 bg-gradient-to-br from-red-600 to-rose-700 rounded-2xl text-white shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-base">
                  <Flame className="w-5 h-5 text-amber-300 animate-bounce" />
                  <span>⛔ 申诉次数已耗尽 (3/3 次均被驳回)</span>
                </div>
                <span className="px-2 py-0.5 bg-black/20 rounded-md text-xs font-mono font-bold">
                  进入销户倒计时
                </span>
              </div>
              <p className="text-xs text-red-100 leading-relaxed font-medium">
                由于您的 3 次解封申诉申请已全被安全风控团队驳回判定，该账号已被系统永久锁定，并自动触发 30 天倒计时物理注销销户流程。
              </p>
            </div>

            {/* 30天自动销户倒计时卡片 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-200/60 pb-2">
                <span className="font-bold text-slate-500">申诉解封尝试:</span>
                <span className="font-black text-red-600">3 次全被驳回 (机会耗尽)</span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-red-600" />
                  预估自动物理销户到期时间:
                </span>
                <div className="font-mono font-black text-sm text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 text-center">
                  {autoDeleteAt ? formatDateTime(autoDeleteAt) : "30 天后自动系统注销销户"}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal">
                提示：销户倒计时到期后，系统将自动物理清除该账号及其所有关联的项目、资产与记录，无法恢复。
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                已了解
              </button>
            </div>
          </div>
        ) : existingAppeal && existingAppeal.status === "pending" ? (
          /* 模式一：已有待审核申诉 - 查看进度与一键撤销 */
          <div className="p-6 space-y-5">
            {/* 申诉处理中 Header 提示 Banner */}
            <div className="bg-amber-50/90 p-4 rounded-2xl border border-amber-200/80 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-1.5 flex-1">
                <div className="font-black text-sm text-amber-900 flex items-center justify-between">
                  <span>⏳ 申诉正在审核中</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 font-bold text-[10px]">
                    处理中 (剩余 {remainingAppeals} 次申诉机会)
                  </span>
                </div>
                <p className="text-amber-800 leading-relaxed">
                  您的解封申请已成功递交给安全风控审核团队，管理员将在 24 小时内完成核查。
                </p>
                <div className="flex items-center justify-between text-[11px] text-amber-900/90 pt-2 border-t border-amber-200/60">
                  <span>申诉账号: <strong className="text-slate-900 font-sans font-bold">{existingAppeal.userAccount}</strong></span>
                  <span>提交时间: <strong className="text-slate-900 font-mono font-bold">{formatDateTime(existingAppeal.createdAt)}</strong></span>
                </div>
              </div>
            </div>

            {/* 申诉明细卡片 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
              {/* 真实封禁原因与判定规则看板 */}
              <div className="bg-red-50/90 p-3.5 rounded-xl border border-red-200/80 space-y-2.5 text-xs">
                {/* 优雅整齐的判定原因独立展示框 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>管理员判定封禁原因:</span>
                  </div>
                  <div className="font-mono text-red-900 font-bold bg-white/90 px-3 py-1.5 rounded-lg border border-red-200/80 leading-relaxed text-xs break-words whitespace-pre-wrap shadow-2xs">
                    {userBanMeta?.banReason || initialBanReason || existingAppeal?.banReason || "账号存在违规行为，已被限制使用"}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-red-700 border-t border-red-200/50 pt-2">
                  <span>判定依据规则:</span>
                  <span className="font-bold bg-white/90 px-2 py-0.5 rounded-md text-red-900 border border-red-200">
                    《知阁·舟坊安全风控准则与平台合规声明》
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-red-700 pt-0.5">
                  <span>封禁截至时间:</span>
                  <span className="font-mono font-bold text-red-800">
                    {userBanMeta?.bannedUntil
                      ? formatDateTime(userBanMeta.bannedUntil)
                      : userBanMeta?.lockedUntil
                      ? formatDateTime(userBanMeta.lockedUntil)
                      : "永久封禁"}
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-200/60 pt-2.5 space-y-3">
                <div>
                  <span className="text-slate-400 font-bold text-xs">申诉具体原因与情况说明:</span>
                  <p className="text-xs text-slate-700 font-medium mt-1 bg-white p-3 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                    {existingAppeal.appealReason || "暂无申诉说明内容"}
                  </p>
                </div>
                {existingAppeal.appealEvidence && (
                  <div>
                    <span className="text-slate-400 font-bold text-xs">申诉证据材料:</span>
                    <p className="text-xs text-slate-700 font-medium mt-1 bg-white p-3 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                      {existingAppeal.appealEvidence}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 font-bold text-xs">管理员处理意见 / 解封理由:</span>
                  {existingAppeal.status === "pending" ? (
                    <p className="text-xs text-slate-500 font-medium mt-1 bg-slate-100 p-3 rounded-xl border border-slate-200 leading-relaxed">
                      暂无管理员处理意见，请耐心等待审核
                    </p>
                  ) : existingAppeal.adminComment ? (
                    <p className="text-xs text-slate-700 font-medium mt-1 bg-white p-3 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                      {existingAppeal.adminComment}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium mt-1 bg-slate-100 p-3 rounded-xl border border-slate-200 leading-relaxed">
                      管理员未填写处理意见
                    </p>
                  )}
                </div>
              </div>
              {existingAppeal.contactInfo && (
                <div className="text-xs">
                  <span className="text-slate-400 font-bold">留存联系方式:</span>
                  <span className="font-mono text-slate-700 ml-2">{existingAppeal.contactInfo}</span>
                </div>
              )}
            </div>

            {/* 底部撤销操作按钮 */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmCancel(true)}
                disabled={canceling}
                className="flex-1 py-3 bg-red-50 text-red-600 border border-red-200/80 hover:bg-red-600 hover:text-white rounded-xl font-bold text-xs transition-all duration-200 shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{canceling ? "正在撤销..." : "撤销申诉"}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        ) : lastRejectedAppeal && !existingAppeal && !isDepleted && !showReAppealForm ? (
          /* 模式四：申诉已被驳回 - 极简震撼大厂视觉卡片 */
          <div className="p-6 space-y-5 font-sans">
            {/* 顶栏鲜明警示 Header */}
            <div className="bg-[#fff5f5] p-5 rounded-2xl border border-red-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-500/20">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-base text-red-950 tracking-tight">解封申诉未通过</h4>
                    <p className="text-xs text-red-700 font-medium mt-0.5">
                      风控安全团队已核查您提交的解封依据
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-red-100 text-red-700 font-black text-xs rounded-xl border border-red-200 shrink-0">
                  剩余 {remainingAppeals}/3 次申诉机会
                </span>
              </div>
            </div>

            {/* 官方具体驳回理由卡片 */}
            <div className="bg-slate-50/90 p-4.5 rounded-2xl border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-700 font-bold">
                <span className="flex items-center gap-1.5 text-slate-800 font-black">
                  <Shield className="w-4 h-4 text-[#3182ce]" />
                  官方驳回理由与处理说明:
                </span>
                <span className="font-mono text-[11px] text-slate-400 font-bold">
                  {formatDateTime(lastRejectedAppeal.processedAt || lastRejectedAppeal.updatedAt)}
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-red-200/80 text-xs font-bold text-red-700 leading-relaxed font-sans whitespace-pre-wrap shadow-2xs">
                {lastRejectedAppeal.adminComment || "您的申诉申请核查未通过，理由不充分，已被管理员驳回。"}
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-1">
                💡 提示：若连续被驳回 3 次，账号将被锁定并进入 30 天自动销户倒计时。
              </p>
            </div>

            {/* 底部按钮组 */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer active:scale-95"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => setShowReAppealForm(true)}
                className="px-6 h-11 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black rounded-xl text-xs hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all duration-200 cursor-pointer shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                <span>📝 重新填写并再次申诉</span>
              </button>
            </div>
          </div>
        ) : existingAppeal && existingAppeal.status === "rejected" ? (
          /* 模式二：上一笔申诉被驳回 - 展示驳回反馈与重新填写入口 */
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-2xl border flex items-start gap-3 bg-red-50 border-red-200 text-red-900">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <div className="font-black text-sm flex items-center justify-between">
                  <span>❌ 申诉已被驳回</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-black/10 rounded-md">
                    已驳回 {rejectedCount}/3 次 (剩 {remainingAppeals} 次机会)
                  </span>
                </div>
                <p className="opacity-90">
                  安全团队核查后驳回了您的申请。您还剩余 {remainingAppeals} 次申诉机会，耗尽 3 次后账号将进入 30 天自动销户倒计时。
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">审核业务类型:</span>
                <span className="font-black text-blue-700">{existingAppeal.businessType || "账号解封申诉"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">提交时间:</span>
                <span className="font-mono font-bold text-slate-700">{formatDateTime(existingAppeal.createdAt)}</span>
              </div>
            </div>

            {existingAppeal.adminComment && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 text-xs">
                <span className="text-slate-400 font-bold flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#3182ce]" />
                  管理员审阅回复意见:
                </span>
                <p className="text-slate-800 font-medium bg-white p-3 rounded-xl border border-slate-100 mt-1">
                  {existingAppeal.adminComment}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              {existingAppeal.status === "rejected" && remainingAppeals > 0 && (
                <button
                  type="button"
                  onClick={() => setExistingAppeal(null)}
                  className="px-4 py-2.5 bg-[#3182ce] text-white hover:bg-[#2b6cb0] rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs"
                >
                  重新填写提交申诉 (剩余 {remainingAppeals} 次)
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        ) : (
          /* 模式三：新申诉表单提交 */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3.5 bg-red-50/90 border border-red-200/80 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  当前判定依据规则:
                </span>
                <span className="font-bold bg-white/90 px-2 py-0.5 rounded-md text-red-900 border border-red-200">
                  《知阁·舟坊安全风控准则与平台合规声明》
                </span>
              </div>
              <div className="flex items-center justify-between text-red-700 border-t border-red-200/60 pt-1.5">
                <span>管理员判定原因:</span>
                <span className="font-mono font-bold text-red-800 bg-white/80 px-2 py-0.5 rounded-md border border-red-100 break-words whitespace-pre-wrap max-w-[70%] text-right">
                  {userBanMeta?.banReason || initialBanReason || existingAppeal?.banReason || "管理员暂未填写具体原因"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-red-100">
                <span>申诉账号：<strong className="text-slate-900">{account || "未识别账号"}</strong></span>
                <span className="font-black text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                  剩余申诉机会: {remainingAppeals}/3 次
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                申诉具体原因与情况说明 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <textarea
                  value={formData.appealReason}
                  onChange={(e) => setFormData({ ...formData, appealReason: e.target.value })}
                  rows={4}
                  maxLength={500}
                  className="w-full px-3.5 pt-2.5 pb-7 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all resize-none leading-relaxed font-sans"
                  placeholder="请至少输入 10 个字，详细说明导致封禁的操作背景或误封解封理由..."
                />
                {/* 放置在输入框内部右下角的精致灰色字数与规范统计提示 */}
                <div className="absolute right-3 bottom-2.5 flex items-center gap-2 text-[11px] font-mono select-none pointer-events-none">
                  {formData.appealReason.length < 10 ? (
                    <span className="text-slate-400 font-normal">
                      还需输入 <strong className="text-slate-500 font-bold">{10 - formData.appealReason.length}</strong> 字
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5 text-[10px] bg-emerald-50/80 px-1.5 py-0.5 rounded border border-emerald-200/50">
                      ✓ 已符合要求
                    </span>
                  )}
                  <span className="text-slate-400 font-normal">
                    {formData.appealReason.length}/500
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-700">
                  联系方式 (邮箱 / 手机号，选填)
                </label>
                {defaultContact && formData.contactInfo !== defaultContact && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contactInfo: defaultContact })}
                    className="text-[11px] text-[#3182ce] hover:underline cursor-pointer font-bold"
                  >
                    恢复默认绑定
                  </button>
                )}
              </div>
              <input
                type="text"
                value={formData.contactInfo}
                onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all font-mono"
                placeholder="用于接收审查结果通知"
              />
              <p className="text-[11px] text-slate-400 font-normal leading-normal pt-0.5">
                💡 系统已自动获取您绑定的账号联系方式，可进行编辑更改。
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-black text-xs hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {submitting ? "正在提交..." : `确认提交申诉 (还剩${remainingAppeals}次)`}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>

      {/* 系统统一的 ConfirmDialog 撤销确认弹窗 */}
      <ConfirmDialog
        isOpen={showConfirmCancel}
        title="确认撤销解封申诉"
        message="您确定要撤销此笔解封申诉申请吗？撤销后申请单将被作废，您可以重新补充更详尽的解封理由后再次提交。"
        confirmText="确认撤销"
        cancelText="取消"
        type="danger"
        onConfirm={executeCancelAppeal}
        onCancel={() => setShowConfirmCancel(false)}
      />
    </div>
  );
}
