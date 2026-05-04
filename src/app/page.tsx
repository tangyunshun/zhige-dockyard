"use client";

import { useEffect } from "react";
import { useToast } from "@/components/Toast";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
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
      // 显示退出成功提示
      toast.success("已退出登录", 2000);
      console.log("首页：显示退出登录成功提示");
    }
  }, [toast]);

  return (
    <main className="min-h-screen bg-[#f8fafc] w-full overflow-x-hidden">
      <Header />
      <HeroSection />
      <CoreFeatures />
      <RoleCapabilities />
      <EnterpriseSecurity />
      <CTA />
      <Footer />
    </main>
  );
}
