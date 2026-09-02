"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";

export default function WorkspaceStatsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <WorkspaceInternalLayout activeTab="stats">
      {/* 统一视图：继承 WorkspaceInternalLayout 容器中的 UsageStatsTab 全量大盘 */}
    </WorkspaceInternalLayout>
  );
}
