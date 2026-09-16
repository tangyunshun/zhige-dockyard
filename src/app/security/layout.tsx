import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "安全与合规 · 知阁·舟坊",
  description:
    "面向关键业务的企业级安全底座：数据物理隔离、本地私有化部署、国产信创适配、RBAC 细粒度权限与全链路审计，并提供架构与安全自诊断。",
};

export default function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
