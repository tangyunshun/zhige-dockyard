import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "行业解决方案 · 知阁·舟坊",
  description:
    "面向系统集成商、政企与外包交付团队的行业解决方案：标书解析、技术方案与报价生成、成本精算与交付全链路提效。",
};

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
