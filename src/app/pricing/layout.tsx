import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "定价与会员 · 知阁·舟坊",
  description:
    "会员等级、空间扩容与算力点定价：全系统统一以「算力点」结算，1 token = 1 算力点，按需配给、实时到账、随用随扣。",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
