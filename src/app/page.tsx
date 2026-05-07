"use client";

import { useEffect } from "react";
import { useToast } from "@/components/Toast";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import UserQuickAccess from "@/components/UserQuickAccess";
import CoreFeatures from "@/components/CoreFeatures";
import RoleCapabilities from "@/components/RoleCapabilities";
import EnterpriseSecurity from "@/components/EnterpriseSecurity";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  const toast = useToast();

  useEffect(() => {
    // 如果是关闭浏览器后重新打开，设置 sessionStorage 标记
    const userId = localStorage.getItem("userId");
    const hasSession = sessionStorage.getItem("hasActiveSession");

    if (userId && !hasSession) {
      sessionStorage.setItem("hasActiveSession", "true");
      console.log("首页：检测到浏览器重新打开，已激活会话");
    }

    // 检查是否是从退出登录跳转过来的
    const justLoggedOut = localStorage.getItem("just_logged_out");
    if (justLoggedOut === "true") {
      // 清除标记
      localStorage.removeItem("just_logged_out");
      
      // 设置临时标志，防止 ActivityMonitor 误判
      sessionStorage.setItem("just_showed_logout", "true");
      
      // 显示退出成功提示
      toast.success("已退出登录", 2000);
      console.log("首页：显示退出登录成功提示");
      
      // 2.5 秒后清除标志（确保 toast 已消失）
      setTimeout(() => {
        sessionStorage.removeItem("just_showed_logout");
        console.log("首页：清除 just_showed_logout 标志");
      }, 2500);
    }
  }, [toast]);

  return (
    <main className="min-h-screen bg-[#f8fafc] w-full overflow-x-hidden">
      <Header />
      <HeroSection />
      <UserQuickAccess />
      <CoreFeatures />
      <RoleCapabilities />
      <EnterpriseSecurity />
      <CTA />
      <Footer />
    </main>
  );
}
