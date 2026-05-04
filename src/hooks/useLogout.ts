"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * 全局退出登录 Hook
 * 
 * 提供统一的退出登录逻辑，包含：
 * - 加载提示（正在退出登录...）
 * - 调用退出 API
 * - 成功提示（已退出登录）
 * - 自动跳转到首页
 * 
 * @returns {Function} handleLogout - 退出登录函数
 * 
 * @example
 * // 在组件中使用
 * const handleLogout = useLogout();
 * 
 * // 在按钮点击事件中调用
 * <button onClick={handleLogout}>退出登录</button>
 */
export function useLogout() {
  const router = useRouter();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      // 设置退出登录标志，防止 ActivityMonitor 误判
      // 使用 sessionStorage，页面刷新后会自动消失
      sessionStorage.setItem("is_logging_out", "true");
      
      // 显示加载中提示
      toast.info("正在退出登录...", 1000);
      
      // 等待 1 秒，让用户看到提示
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 调用退出登录 API
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        // 设置标记，告诉首页显示退出成功提示
        localStorage.setItem("just_logged_out", "true");

        // 清除所有本地存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        localStorage.removeItem("rememberMe");
        sessionStorage.clear();
        document.cookie = "auth_token=; path=/; max-age=0";

        // 使用 window.location.href 直接跳转到首页
        window.location.href = "/";
      } else {
        toast.error("退出登录失败");
      }
    } catch (error) {
      console.error("退出登录失败:", error);
      toast.error("退出登录失败，请稍后重试");
    }
  };

  return handleLogout;
}
