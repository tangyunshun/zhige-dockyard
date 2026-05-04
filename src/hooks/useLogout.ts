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
      // 显示加载中提示
      toast.info("正在退出登录...", 1500);
      
      // 等待 1.5 秒，让用户看到提示
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 调用退出登录 API
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        // 清除所有本地存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        localStorage.removeItem("rememberMe");
        sessionStorage.clear();
        document.cookie = "auth_token=; path=/; max-age=0";

        // 显示成功提示
        toast.success("已退出登录", 1500);
        
        // 等待提示显示完后跳转
        await new Promise(resolve => setTimeout(resolve, 1600));

        // 跳转到首页
        router.push("/");
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
