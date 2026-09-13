import type { Metadata } from "next";
import "./globals.css";
import AppLayout from "@/components/AppLayout";

export const metadata: Metadata = {
  title: "知阁·舟坊 (ZhiGe Dockyard) - 全链路软件研发效能操作系统",
  description:
    "打破工具孤岛，从 RFP 标书解析到系统架构、PRD 生成、项目验收，提效 300%。",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏外观偏好应用：在其他脚本之前读取本地缓存，避免主题/密度闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=JSON.parse(localStorage.getItem('zhige_appearance')||'{}');var d=document.documentElement;d.dataset.density=p.displayDensity||'comfortable';var t=p.theme||'light';if(t==='auto'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.dataset.theme=t;}catch(e){}})();",
          }}
        />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </head>
      <body className="antialiased min-h-screen w-full flex flex-col overflow-y-auto" suppressHydrationWarning>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}