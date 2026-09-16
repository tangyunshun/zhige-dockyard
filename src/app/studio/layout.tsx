import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "组件工坊 · 知阁·舟坊",
  description:
    "浏览与装配 50+ 研发效能组件，覆盖标书解析、PRD 生成、架构设计、数据库建模、代码评审与单测等研发全链路，开箱即用。",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
