import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知阁·舟坊 (ZhiGe Dockyard) - 全链路 AI 软件研发效能操作系统",
  description:
    "打破工具孤岛，从 RFP 标书解析到系统架构、PRD 生成、项目验收，提效200%。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
