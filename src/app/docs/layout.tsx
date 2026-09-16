import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "文档中心 · 知阁·舟坊",
  description:
    "知阁·舟坊官方文档中心：快速上手指南、组件与开放接口（OpenAPI）、算力点计费说明、私有化部署与数据合规指引。",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
