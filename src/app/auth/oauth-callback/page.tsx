"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // 从 URL 参数中获取用户信息与 token 凭证
        const userData = searchParams.get("user");
        const token = searchParams.get("token");
        const isNewUser = searchParams.get("new") === "true";

        if (!userData) {
          toast.error("登录失败：缺少用户信息");
          window.location.href = "/auth/login";
          return;
        }

        // 解析用户信息
        const user = JSON.parse(decodeURIComponent(userData));

        // 存储用户核心凭据到 localStorage
        if (token) {
          localStorage.setItem("auth_token", token);
          // 补充非 httpOnly Cookie 兜底，确保前端探测和 AppContext 状态即时生效
          document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Lax`;
        }
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userRole", user.role);
        if (user.sessionToken) {
          localStorage.setItem("sessionToken", user.sessionToken);
        }

        // 设置 sessionStorage 标记，表示当前浏览器会话是活跃的
        sessionStorage.setItem("hasActiveSession", "true");

        // 第三方登录新用户首次登录时，标记需要弹出完善资料引导弹窗
        if (isNewUser) {
          sessionStorage.setItem("show_oauth_profile_modal", "true");
        }

        // 优先读取先前保存的目标页面（如工作空间邀请或受保护页面）
        const savedPath = sessionStorage.getItem("redirectAfterLogin");
        sessionStorage.removeItem("redirectAfterLogin");
        const targetPath = savedPath && savedPath !== "/auth/login" ? savedPath : "/workspace-hub";

        // 关键防护：使用 window.location.href 进行全新初始化跳转，
        // 彻底消除 SPA router.push 时 AppContext 内存状态落后被 RouterGuards 瞬时弹回登录页的闪屏死循环！
        window.location.href = targetPath;
      } catch (error) {
        console.error("OAuth 回调处理失败:", error);
        toast.error("登录失败，请重试");
        window.location.href = "/auth/login";
      } finally {
        setIsProcessing(false);
      }
    };

    handleOAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">
          {isProcessing ? "登录中..." : "跳转中..."}
        </p>
      </div>
    </div>
  );
}

export default function OAuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">加载中...</p>
        </div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}
