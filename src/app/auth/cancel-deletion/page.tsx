"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
  X,
  Sparkles,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface DeletingUserInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  avatar?: string | null;
}

export default function CancelDeletionPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [cooldownDays, setCooldownDays] = useState<number>(7);
  const [checkComplete, setCheckComplete] = useState(false);
  const [currentUser, setCurrentUser] = useState<DeletingUserInfo | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAccountStatus();
  }, []);

  const checkAccountStatus = async () => {
    try {
      const authToken = getAuthToken();
      if (!authToken) {
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user?.status === "deleting") {
          setDaysRemaining(data.user.deletionDaysRemaining ?? 0);
          setCooldownDays(data.user.deletionCooldownDays || 7);
          setCurrentUser({
            name: data.user.name,
            email: data.user.email,
            phone: data.user.phone,
            role: data.user.role,
            avatar: data.user.avatar,
          });
          setCheckComplete(true);
        } else {
          router.push("/");
        }
      } else {
        router.push("/auth/login");
      }
    } catch (error) {
      console.error("Check status error:", error);
      router.push("/auth/login");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkAccountStatus();
    setRefreshing(false);
    toast.info("账号冷静期状态已刷新");
  };

  const maskAccount = (user: DeletingUserInfo | null) => {
    if (!user) return "当前账号";
    if (user.name) return user.name;
    if (user.email) {
      const [name, domain] = user.email.split("@");
      if (!domain) return user.email;
      const maskedName = name.length <= 2 ? name + "***" : `${name.slice(0, 2)}***${name.slice(-1)}`;
      return `${maskedName}@${domain}`;
    }
    if (user.phone) {
      return user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
    }
    return "当前账号";
  };

  // 冷静期内不能进入正式系统（工作台等业务入口由服务端拦截 ACCOUNT_DELETING）。
  // 本页不提供「返回首页」：冷静期内不得进入正式系统，首页也无业务可办。
  // 但必须保留一个出口——否则用户不撤销注销就无法离开本页（换账号登录也做不到），
  // 因此提供「退出登录」：退出后冷静期仍在服务端继续计时，可随时重新登录撤销。
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
        () => { },
      );
    } finally {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("userId");
      localStorage.removeItem("sessionToken");
      router.replace("/auth/login");
    }
  };

  const handleCancelDeletion = async () => {
    setLoading(true);
    try {
      const authToken = getAuthToken();
      if (!authToken) {
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
      });

      if (res.ok) {
        localStorage.removeItem("deletion_pending_active");
        localStorage.removeItem("deletion_pending_days");
        toast.success("撤销成功，您的账号已恢复正常", 1200);
        setTimeout(() => {
          // 撤销成功保持登录态，直接进入工作台继续操作
          router.replace("/workspace-hub");
        }, 800);
      } else {
        const data = await res.json();
        toast.error(data.error || "撤销失败");
      }
    } catch (error) {
      console.error("Cancel deletion error:", error);
      toast.error("撤销失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (!checkComplete) {
    return (
      <div className="min-h-screen bg-[var(--zhige-bg-page,#f0f8ff)] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl p-8 max-w-sm w-full text-center shadow-lg border border-blue-100/60">
          <div className="w-12 h-12 border-3 border-blue-200 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-800 mb-1">正在核验账号状态</h3>
          <p className="text-xs text-slate-500">正在获取冷静期剩余时间及安全数据...</p>
        </div>
      </div>
    );
  }

  const elapsedDays = Math.max(0, cooldownDays - (daysRemaining ?? 0));
  const progressPercent = Math.min(100, Math.max(8, Math.round((elapsedDays / cooldownDays) * 100)));
  const estimatedDateText = daysRemaining !== null
    ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : "";

  return (
    <div className="min-h-screen bg-[var(--zhige-bg-page,#f0f8ff)] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 p-5 sm:p-7 relative transition-all">
        {/* 顶部标题与状态栏 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Logo
              variant="light"
              onClick={() => {
                toast.info("账号目前处于注销冷静期受限保护中");
              }}
            />
            <div className="hidden sm:block h-4 w-px bg-slate-200" />
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              冷静期保护中
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="刷新账号冷静期状态"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/70 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
              <span className="hidden xs:inline">同步状态</span>
            </button>
          </div>
        </div>

        {/* 账号与冷静期倒计时高能展示卡片 */}
        <div className="mt-4 bg-gradient-to-r from-blue-50/70 via-sky-50/40 to-slate-50/80 border border-blue-100/80 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* 用户身份 */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white font-bold flex items-center justify-center text-base shadow-sm shrink-0">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate max-w-[160px] sm:max-w-[200px]">
                    {maskAccount(currentUser)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100/80 text-[#2b6cb0]">
                    {currentUser?.role === "superadmin" ? "超管" : currentUser?.role === "admin" ? "管理员" : "注册用户"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {currentUser?.email ? currentUser.email : currentUser?.phone ? currentUser.phone : "账号处于申请注销中"}
                </p>
              </div>
            </div>

            {/* 倒计时看板 */}
            <div className="flex sm:flex-col sm:items-end justify-between items-center pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-100/60">
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-slate-500 font-medium">冷静期还剩</span>
                <span className="text-2xl font-black text-amber-600 tracking-tight">
                  {daysRemaining ?? 0}
                </span>
                <span className="text-xs font-bold text-amber-700">天</span>
              </div>
              {estimatedDateText && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  预计彻底注销：{estimatedDateText}
                </p>
              )}
            </div>
          </div>

          {/* 进度条与天数刻度 */}
          <div className="mt-3.5 pt-3 border-t border-blue-100/50">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5 font-medium">
              <span>注销申请提出</span>
              <span className="text-amber-700 font-semibold">
                第 {elapsedDays} 天 / 共 {cooldownDays} 天
              </span>
              <span>到期物理清除</span>
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-400 to-amber-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* 规则与权益双栏精致对比网格（左右排布，大幅压缩高度） */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 左栏：冷静期保护规则 */}
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3.5 text-left">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>冷静期安全规则</span>
            </div>
            <ul className="space-y-1.5 text-xs text-amber-700/90 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-amber-500 font-bold">•</span>
                <span>冷静期为 {cooldownDays} 天，期间随时可撤销</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-500 font-bold">•</span>
                <span>冷静期内所有业务数据、模型资产均被完整保留</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-500 font-bold">•</span>
                <span>冷静期结束后系统将彻底物理清空，不可恢复</span>
              </li>
            </ul>
          </div>

          {/* 右栏：撤销恢复保障 */}
          <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3.5 text-left">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>撤销恢复权益保障</span>
            </div>
            <ul className="space-y-1.5 text-xs text-emerald-700/90 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">•</span>
                <span>撤销后账号状态立即恢复，无需漫长审核</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">•</span>
                <span>全部工作空间、算力点额度及配置完整解冻</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">•</span>
                <span>保持当前登录态，无缝直达工作台中枢</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 快捷操作区：主次并排 */}
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => setShowCancelModal(true)}
            disabled={loading}
            className="w-full sm:flex-1 h-10 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:brightness-105 active:scale-[0.99] text-white rounded-lg text-sm font-semibold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>撤销注销申请并恢复账号</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full sm:w-36 h-10 border border-slate-300/80 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-700 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4 text-slate-500" />
            <span>退出登录</span>
          </button>
        </div>

        {/* 底部紧凑说明 */}
        <p className="text-center text-xs text-slate-400 mt-3.5">
          退出登录后冷静期将按规则继续倒计时，重新登录后仍可随时撤销注销申请
        </p>

        {/* 二次确认模态框 (统一使用 .zg-modal 规范) */}
        {showCancelModal && (
          <div className="zg-modal-overlay">
            <div className="zg-modal animate-in zoom-in-95 duration-150">
              <div className="zg-modal-header">
                <div className="flex items-center gap-2 text-slate-800">
                  <ShieldCheck className="w-5 h-5 text-[#3182ce]" />
                  <span>确认撤销账号注销申请</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="zg-modal-body space-y-3 text-slate-600 text-sm">
                <p>
                  您确定要撤销账号{" "}
                  <strong className="text-slate-900 font-bold">
                    {maskAccount(currentUser)}
                  </strong>{" "}
                  的注销申请吗？
                </p>
                <div className="bg-blue-50/70 border border-blue-200/60 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold text-blue-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#3182ce]" />
                    撤销后将立即生效：
                  </p>
                  <p>• 账号状态恢复为正常使用状态</p>
                  <p>• 工作台及所有专属资产将直接恢复正常使用</p>
                  <p>• 确认后无需重新登录，即可直接进入工作台</p>
                </div>
              </div>

              <div className="zg-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={loading}
                  className="zg-btn zg-btn-default cursor-pointer text-xs"
                >
                  暂不撤销
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleCancelDeletion();
                    setShowCancelModal(false);
                  }}
                  disabled={loading}
                  className="zg-btn zg-btn-primary cursor-pointer text-xs"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>正在恢复...</span>
                    </div>
                  ) : (
                    <span>确认撤销并恢复</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}