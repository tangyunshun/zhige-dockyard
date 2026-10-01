"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 原「系统日志」页面已与「审计日志」页面融合为统一页面（操作审计流水 + 登录安全历史）。
// 此处保留路由并重定向，确保侧边栏入口与历史链接依然可用，不丢失任何能力。
export default function AdminLogsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/operation-logs");
  }, [router]);

  return null;
}
