"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { AppProvider } from "@/contexts/AppContext";
import RouterGuards from "@/components/RouterGuards";
import GlobalHeader from "@/components/GlobalHeader";
import { ToastProvider } from "@/components/Toast";
import AuthCheck from "@/components/AuthCheck";
import { ActivityMonitor } from "@/components/ActivityMonitor";
import { ResponsiveProvider } from "@/contexts/ResponsiveContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [scrollProgress, setScrollProgress] = useState(0);

  // 检查是否应该隐藏全局 Header 和 pt-[60px] 容器偏移
  const shouldHideGlobalHeader =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/platform-admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/workspace/") ||
    pathname === "/studio" ||
    pathname.startsWith("/studio/") ||
    pathname.startsWith("/user/") ||
    pathname.startsWith("/docs");

  useEffect(() => {
    if (shouldHideGlobalHeader) return;
    
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    // 切换页面时重置进度条
    setScrollProgress(0);

    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname, shouldHideGlobalHeader]);

  return (
    <ResponsiveProvider>
      <AppProvider>
        <ToastProvider>
          <AuthCheck>
            <RouterGuards>
              {/* 根据路由显示或隐藏 GlobalHeader */}
              {shouldHideGlobalHeader ? (
                children
              ) : (
                <>
                  <GlobalHeader />
                  {/* 顶部滚动进度条 */}
                  <div
                    className="fixed top-[60px] left-0 right-0 h-1 z-[60] transition-all duration-300 pointer-events-none"
                    style={{
                      backgroundColor: "#3182ce",
                      width: `${scrollProgress}%`,
                    }}
                  />
                  <div className="pt-[60px]">
                    {children}
                  </div>
                  {/* 全局悬浮回到顶部按钮 */}
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    aria-label="回到顶部"
                    className={`fixed bottom-8 right-8 z-50 w-12 h-12 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center cursor-pointer border border-[#3182ce]/20 ${
                      scrollProgress > 5
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-4 pointer-events-none"
                    }`}
                    style={{
                      backgroundColor: "#3182ce",
                      backgroundImage: "linear-gradient(135deg, #3182ce 0%, #2b6cb0 100%)"
                    }}
                  >
                    <ArrowUp className="w-5 h-5 text-white" />
                  </button>
                </>
              )}
            </RouterGuards>
          </AuthCheck>
          <ActivityMonitor />
        </ToastProvider>
      </AppProvider>
    </ResponsiveProvider>
  );
}
