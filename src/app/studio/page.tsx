"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

// 引入组件浏览器大厅
import ComponentBrowser from "@/components/studio/ComponentBrowser";
import Footer from "@/components/Footer";

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f8ff]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600 font-bold">正在加载组件工坊...</p>
          </div>
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}

function StudioContent() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userState } = useAppContext();

  const queryWorkspaceId = searchParams?.get("workspaceId");
  const queryComponentId = searchParams?.get("componentId");

  const workspaces = userState?.workspaces || [];
  const currentWorkspace =
    workspaces.find((w) => w.id === queryWorkspaceId) ||
    workspaces.find((w) => w.id === userState?.currentWorkspaceId) ||
    workspaces[0] ||
    null;

  const [workspaceToken, setWorkspaceToken] = useState<number>(0);
  const [restrictedComponentIds, setRestrictedComponentIds] = useState<string[]>([]);

  // 1. 核心自动重定向调度：已登录用户如果带有组件参数，一律无缝分发重定向到工作空间进行物理运行
  useEffect(() => {
    if (userState?.isLoggedIn && queryComponentId && currentWorkspace?.id) {
      console.log(`[Studio] Auto redirecting Component ${queryComponentId} to Workspace ${currentWorkspace.id}`);
      router.push(`/workspace/${currentWorkspace.id}?componentId=${queryComponentId}`);
    }
  }, [userState?.isLoggedIn, queryComponentId, currentWorkspace?.id, router]);

  // 加载当前空间的算力配额与岗位受限组件列表（使用 Promise.all 进行批处理，消除多次异步渲染引起的页面闪烁）
  useEffect(() => {
    const loadWorkspaceData = async () => {
      if (!currentWorkspace || !userState.isLoggedIn) {
        setRestrictedComponentIds([]);
        setWorkspaceToken(0);
        return;
      }
      try {
        const authToken = getAuthToken();
        if (!authToken) return;
        const headers: Record<string, string> = { Authorization: `Bearer ${authToken}` };

        // 并行发起数据拉取
        const [resRestricted, resQuota] = await Promise.all([
          fetch(`/api/studio?action=restricted&workspaceId=${currentWorkspace.id}`, { headers }),
          fetch("/api/user/workspace-hub/quota", { headers })
        ]);

        let restrictedData: string[] = [];
        let tokenVal = 0;

        if (resRestricted.ok) {
          const data = await resRestricted.json();
          if (data && data.success) {
            restrictedData = data.data || [];
          }
        }

        if (resQuota.ok) {
          const data = await resQuota.json();
          const wsData = data.data?.workspaces?.find((w: any) => w.id === currentWorkspace.id);
          if (wsData?.quota) {
            tokenVal = Number(wsData.quota.tokenBalance);
          }
        }

        // 同步批处理更新状态，只触发一次 React 重绘
        setRestrictedComponentIds(restrictedData);
        setWorkspaceToken(tokenVal);
      } catch (e) {
        console.error("加载空间数据失败:", e);
      }
    };
    loadWorkspaceData();
  }, [currentWorkspace, userState.isLoggedIn, userState.userInfo?.id]);

  // 处理返回逻辑
  const handleGoBack = () => {
    if (currentWorkspace?.id) {
      router.push(`/workspace/${currentWorkspace.id}`);
    } else {
      router.push("/workspace-hub");
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] flex flex-col relative overflow-hidden">
      {/* 背景装饰网格 */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />



      {/* 主体大厅 */}
      <main className="flex-1 overflow-y-auto relative z-0">
        <ComponentBrowser
          workspaceId={currentWorkspace?.id || null}
          workspaceName={currentWorkspace?.name || ""}
          workspaceToken={workspaceToken}
          restrictedComponentIds={restrictedComponentIds}
          onSelectComponent={(compId, targetWsId) => {
            if (userState?.isLoggedIn) {
              const routeWsId = targetWsId || currentWorkspace?.id;
              if (routeWsId) {
                console.log(`[Studio] Selected component ${compId}, routing to workspace ${routeWsId}`);
                router.push(`/workspace/${routeWsId}?componentId=${compId}`);
              } else {
                toast.error("您尚未创建工作空间，请先创建空间");
                router.push("/workspace-hub");
              }
            } else {
              toast.error("您尚未登录，请先登录系统");
              router.push(`/auth/login?redirect=${encodeURIComponent(`/studio?componentId=${compId}`)}`);
            }
          }}
          onTokenUpdate={(newToken) => setWorkspaceToken(newToken)}
        />
      </main>
      <Footer />
    </div>
  );
}
