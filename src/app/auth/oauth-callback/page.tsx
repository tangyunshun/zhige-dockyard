"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";

export default function OAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // 从 URL 参数中获取用户信息
        const userData = searchParams.get("user");
        const isNewUser = searchParams.get("new") === "true";

        if (!userData) {
          toast.error("登录失败：缺少用户信息");
          router.push("/auth/login");
          return;
        }

        // 解析用户信息
        const user = JSON.parse(decodeURIComponent(userData));

        // 存储用户信息到 localStorage
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userRole", user.role);
        if (user.sessionToken) {
          localStorage.setItem("sessionToken", user.sessionToken);
        }

        // 设置 sessionStorage 标记，表示当前浏览器会话是活跃的
        sessionStorage.setItem("hasActiveSession", "true");

        // 直接跳转到首页
        router.push("/");
      } catch (error) {
        console.error("OAuth 回调处理失败:", error);
        toast.error("登录失败，请重试");
        router.push("/auth/login");
      } finally {
        setIsProcessing(false);
      }
    };

    handleOAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">
          {isProcessing ? "登录中..." : "跳转中..."}
        </p>
      </div>
    </div>
  );
}
