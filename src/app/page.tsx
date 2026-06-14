"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import HeroSection from "@/components/HeroSection";
import UserQuickAccess from "@/components/UserQuickAccess";
import CoreFeatures from "@/components/CoreFeatures";
import RoleCapabilities from "@/components/RoleCapabilities";
import EnterpriseSecurity from "@/components/EnterpriseSecurity";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import DemoRequestModal from "@/components/DemoRequestModal";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  LogOut,
  RotateCcw,
} from "lucide-react";

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [deletionDaysRemaining, setDeletionDaysRemaining] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const [cancelling, setCancelling] = useState(false);
  const cancellingRef = useRef(false);

  useEffect(() => {
    // 检查是否是冷静期用户 - 使用authToken检查
    const checkDeletionStatus = async () => {
      const userId = localStorage.getItem("userId");
      const authToken = localStorage.getItem("auth_token");

      // 如果有userId或authToken其中之一，就检查状态
      if (!userId && !authToken) {
        console.log("[首页] 没有userId也没有authToken，跳过状态检查");
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${userId || authToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          console.log("[首页] 用户状态:", data.user?.status);
          if (data.user?.status === "deleting") {
            setDeletionDaysRemaining(data.user.deletionDaysRemaining || 7);
            setShowDeletionModal(true);
          } else {
            // 已登录且状态正常的用户，自动重定向至工作台
            router.replace("/workspace-hub");
          }
        }
      } catch (error) {
        console.error("Check deletion status error:", error);
      }
    };

    checkDeletionStatus();

    // 处理注销申请成功后的跳转（从URL参数）
    const urlParams = new URLSearchParams(window.location.search);
    const deletionPending = urlParams.get("deletion_pending");
    const daysRemaining = urlParams.get("daysRemaining");

    if (deletionPending === "true" && daysRemaining) {
      setDeletionDaysRemaining(parseInt(daysRemaining) || 7);
      setShowDeletionModal(true);
      // 清除 URL 参数
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }

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
  }, [toast]);

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
      // 获取认证信息
      const userId = localStorage.getItem("userId");
      const authToken = localStorage.getItem("auth_token");

      if (!userId && !authToken) {
        cancellingRef.current = false;
        setCancelling(false);
        window.location.href = "/auth/login";
        return;
      }

      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId || authToken}`,
        },
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 清除所有数据
        localStorage.clear();
        sessionStorage.clear();
        document.cookie = "auth_token=; path=/; max-age=0";
        // 跳转到首页（未登录状态）
        window.location.href = "/";
      } else {
        // 失败，重置状态
        cancellingRef.current = false;
        setCancelling(false);
      }
    } catch (error) {
      console.error("撤销失败:", error);
      cancellingRef.current = false;
      setCancelling(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
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
      <EnterpriseSecurity />
      <CTA onDemoRequest={() => setShowDemoModal(true)} />
      <Footer />
      <DemoRequestModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />

      {/* 冷静期遮罩弹窗 */}
      {showDeletionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-orange-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-1">
                账号注销申请中
              </h2>
              <p className="text-sm text-slate-500">
                您的账号已进入冷静期，请谨慎操作
              </p>
            </div>

            {/* 倒计时 */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-3 mb-3 text-center">
              <p className="text-xs text-orange-600 mb-1">冷静期剩余时间</p>
              <p className="text-xl font-bold text-orange-600 font-mono">
                {formatCountdown(countdown)}
              </p>
              <p className="text-xs text-orange-500 mt-1">
                约 {deletionDaysRemaining} 天后账号将被永久删除
              </p>
            </div>

            {/* 说明 */}
            <div className="space-y-1.5 mb-4 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-slate-600">
                  <span className="font-medium text-red-600">冷静期内</span>
                  可点击下方"撤销注销"恢复正常
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-slate-600">
                  撤销后，所有数据将
                  <span className="font-medium text-green-600">完整保留</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <LogOut className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="text-slate-600">
                  退出登录后，冷静期仍在
                  <span className="font-medium">继续计时</span>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="space-y-2">
              <button
                onClick={handleCancelDeletion}
                disabled={cancelling}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all text-sm disabled:opacity-50"
              >
                {cancelling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>撤销中...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>撤销注销</span>
                  </>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>退出登录</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 text-center mt-3">
              冷静期结束后，账号将被永久删除且无法恢复
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
