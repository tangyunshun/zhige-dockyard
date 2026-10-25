"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import HeroSection from "@/components/HeroSection";
import CoreFeatures from "@/components/CoreFeatures";
import RoleCapabilities from "@/components/RoleCapabilities";
import TestimonialsSection from "@/components/TestimonialsSection";
import EnterpriseSecurity from "@/components/EnterpriseSecurity";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import DemoRequestModal from "@/components/DemoRequestModal";
import LogoutConfirmDialog from "@/components/LogoutConfirmDialog";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  LogOut,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [deletionDaysRemaining, setDeletionDaysRemaining] = useState<number>(7);
  const [countdown, setCountdown] = useState<number>(0);
  const [cancelling, setCancelling] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const cancellingRef = useRef(false);

  // 遮罩层激活时，严格锁定全站滚动（body 与 html 双重锁定，彻底阻断背景穿透）
  useEffect(() => {
    if (mounted && showDeletionModal) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [mounted, showDeletionModal]);

  useEffect(() => {
    setMounted(true);

    // 检查注销申请状态（URL 参数 / 本地持久标记 / 服务端会话三重保障）
    const urlParams = new URLSearchParams(window.location.search);
    const deletionPending = urlParams.get("deletion_pending");
    const daysParam = urlParams.get("daysRemaining");
    const storedActive = localStorage.getItem("deletion_pending_active") === "true";
    const storedDays = localStorage.getItem("deletion_pending_days");
    const isPendingDeletion = deletionPending === "true" || storedActive || !!storedDays;

    if (isPendingDeletion) {
      const days = parseInt(daysParam || storedDays || "7", 10) || 7;
      setDeletionDaysRemaining(days);
      setCountdown(days * 24 * 60 * 60);
      setShowDeletionModal(true);
      // 持久化活跃标记：锁定冷静期状态，禁止在组件加载时清空，直至用户主动撤销或退出
      localStorage.setItem("deletion_pending_active", "true");
      localStorage.setItem("deletion_pending_days", String(days));
    }

    // 后台向 /api/auth/me 获取权威状态，校验冷静期天数或拦截非法穿透
    const checkDeletionStatus = async () => {
      const userId = localStorage.getItem("userId");
      const authToken = localStorage.getItem("auth_token");

      if (!userId && !authToken) {
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          credentials: "include",
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          if (data.user?.status === "deleting") {
            const days = data.user.deletionDaysRemaining || 7;
            setDeletionDaysRemaining(days);
            setShowDeletionModal(true);
            localStorage.setItem("deletion_pending_active", "true");
            localStorage.setItem("deletion_pending_days", String(days));
          } else if (data.user?.status && !isPendingDeletion) {
            // 已登录且状态正常的用户，且未处于冷静期，才自动重定向至工作台
            router.replace("/workspace-hub");
          }
        }
      } catch (error) {
        console.error("Check deletion status error:", error);
      }
    };

    void checkDeletionStatus();

    // 如果是关闭浏览器后重新打开，设置 sessionStorage 标记
    const userId = localStorage.getItem("userId");
    const hasSession = sessionStorage.getItem("hasActiveSession");

    if (userId && !hasSession) {
      sessionStorage.setItem("hasActiveSession", "true");
    }

    // 检查是否是从退出登录跳转过来的
    const justLoggedOut = localStorage.getItem("just_logged_out");
    if (justLoggedOut === "true") {
      localStorage.removeItem("just_logged_out");
      sessionStorage.setItem("just_showed_logout", "true");
      toast.success("已退出登录", 2000);
      setTimeout(() => {
        sessionStorage.removeItem("just_showed_logout");
      }, 2500);
    }
  }, [router, toast]);

  // 冷静期倒计时
  useEffect(() => {
    if (!showDeletionModal || deletionDaysRemaining <= 0) return;

    let totalSeconds = deletionDaysRemaining * 24 * 60 * 60;
    setCountdown(totalSeconds);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showDeletionModal, deletionDaysRemaining]);

  const formatCountdown = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = seconds % 60;
    return `${days}天 ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 撤销注销
  const handleCancelDeletion = async () => {
    // 防重复提交
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(true);

    try {
      // 获取认证信息：身份凭证一律使用 JWT（auth_token），禁止用明文 userId 冒充 Bearer
      const authToken = localStorage.getItem("auth_token");

      if (!authToken) {
        cancellingRef.current = false;
        setCancelling(false);
        localStorage.removeItem("deletion_pending_active");
        localStorage.removeItem("deletion_pending_days");
        setShowDeletionModal(false);
        window.location.href = "/auth/login";
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

      const data = await res.json();

      if (res.ok && data.success) {
        // 撤销成功：清除本地冷静期活跃标记，恢复账号正常状态
        localStorage.removeItem("deletion_pending_active");
        localStorage.removeItem("deletion_pending_days");
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        if (data.userId) {
          localStorage.setItem("userId", data.userId);
        }
        setShowDeletionModal(false);
        toast.success("撤销成功，已恢复登录并进入空间中枢", 1200);
        setTimeout(() => {
          window.location.href = "/workspace-hub";
        }, 300);
      } else if (res.status === 401) {
        // 会话已失效，引导重新登录
        cancellingRef.current = false;
        setCancelling(false);
        localStorage.removeItem("deletion_pending_active");
        localStorage.removeItem("deletion_pending_days");
        setShowDeletionModal(false);
        window.location.href = "/auth/login";
      } else {
        toast.error(data.error || data.message || "撤销失败，请稍后重试");
        cancellingRef.current = false;
        setCancelling(false);
      }
    } catch (error) {
      console.error("撤销失败:", error);
      toast.error("网络异常，撤销失败");
      cancellingRef.current = false;
      setCancelling(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    // 清除冷静期专属锁定标记与状态
    localStorage.removeItem("deletion_pending_active");
    localStorage.removeItem("deletion_pending_days");
    setShowDeletionModal(false);

    // 设置多标签页同步标记，通知其他标签页同步退出
    localStorage.setItem("logged_out", "true");
    
    // 清除所有本地存储
    localStorage.removeItem("userId");
    localStorage.removeItem("userRole");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    localStorage.removeItem("rememberMe");
    localStorage.removeItem("userMembership");
    localStorage.removeItem("tokenBalance");
    localStorage.removeItem("enterpriseSpaceLimit");
    localStorage.removeItem("userWorkspaces");
    
    // 设置标记，告诉首页显示退出成功提示
    localStorage.setItem("just_logged_out", "true");
    
    // 清除所有 sessionStorage
    sessionStorage.clear();
    
    // 清除所有相关 cookies
    document.cookie = "auth_token=; path=/; max-age=0; secure; sameSite=lax";
    document.cookie = "session_token=; path=/; max-age=0; secure; sameSite=lax";
    document.cookie = "refresh_token=; path=/; max-age=0; secure; sameSite=lax";
    
    // 跳转到首页（未登录状态）
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen bg-transparent w-full overflow-x-hidden relative">
      <HeroSection onDemoRequest={() => setShowDemoModal(true)} />
      <CoreFeatures />
      <RoleCapabilities />
      <TestimonialsSection onDemoRequest={() => setShowDemoModal(true)} />
      <EnterpriseSecurity />
      <CTA onDemoRequest={() => setShowDemoModal(true)} />
      <Footer />
      <DemoRequestModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />

      {/* 账号注销冷静期全局最高级阻断遮罩与知阁规范居中弹窗：通过 createPortal 挂载到 document.body 根节点，彻底覆盖包括全局 Header 在内的所有页面区域 */}
      {mounted && showDeletionModal && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deletion-modal-title"
          className="fixed inset-0 z-[99990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="zg-modal max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[calc(100vh-24px)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏警示 Header */}
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-5 py-3.5 border-b border-amber-100 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0 text-amber-600 shadow-sm">
                <Clock className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h2
                    id="deletion-modal-title"
                    className="text-sm font-bold text-slate-800"
                  >
                    账号注销申请保护中
                  </h2>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    冷静期锁定
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  您的账号已进入注销安全冷静期，当前系统业务已全面锁定。
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
              {/* 倒计时精美仪表卡片 */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200/90 rounded-xl p-3 text-center shadow-inner">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-700 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>冷静期剩余倒计时</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-800 tracking-wider font-mono py-0.5">
                  {formatCountdown(countdown)}
                </div>
                <div className="text-[10px] text-amber-600/90 mt-0.5 flex items-center justify-center gap-1">
                  <span>约 {deletionDaysRemaining} 天后生效</span>
                  <span>·</span>
                  <span>到期后数据将被永久抹除且不可恢复</span>
                </div>
              </div>

              {/* 核心权益与规则告知 */}
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="leading-snug">
                    <strong className="text-slate-800">随时一键恢复：</strong>
                    冷静期内点击下方“撤销注销进入系统”可即刻恢复正常使用并进入空间中枢，所有资产完整留存。
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce] mt-0.5 flex-shrink-0" />
                  <span className="leading-snug">
                    <strong className="text-slate-800">资产受控冻结：</strong>
                    为保护资产免遭篡改，冷静期内业务接口处于只读安全冻结态。
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <LogOut className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span className="leading-snug">
                    <strong className="text-slate-800">安全退出登录：</strong>
                    您也可以安全退出当前账号，冷静期结束后系统将自动执行最终注销。
                  </span>
                </div>
              </div>

              {/* 操作按钮区 */}
              <div className="space-y-2 pt-1 shrink-0">
                <button
                  type="button"
                  onClick={handleCancelDeletion}
                  disabled={cancelling}
                  className="zg-btn zg-btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-60"
                  style={{ backgroundColor: "#3182ce", borderColor: "#2b6cb0" }}
                >
                  {cancelling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>正在撤销注销进入系统...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>撤销注销进入系统</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  disabled={cancelling}
                  className="zg-btn zg-btn-default w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>安全退出登录</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 退出登录二次确认弹窗 */}
      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
    </main>
  );
}
