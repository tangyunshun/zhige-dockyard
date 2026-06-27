"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  ownerId: string;
  status: "ACTIVE" | "DISABLED";
  componentCount?: number;
  memberCount?: number;
  createdAt: string;
  role?: "OWNER" | "ADMIN" | "MEMBER";
  isOwner?: boolean;
  description?: string;
  upgraded?: boolean;
}

export interface EnterpriseQuota {
  hasEnterprise: boolean;
  enterpriseCount: number;
  maxEnterprise: number;
  isMember: boolean;
}

export type PersonalState = "NORMAL" | "PARALLEL" | "REPLACE" | "MIGRATE" | "DELETED" | "NONE";

export const derivePersonalState = (
  workspace: Workspace | null,
  upgradeMode: string | null,
  isDeleted: boolean
): PersonalState => {
  if (isDeleted) return "DELETED";
  if (!workspace) return "NONE";
  if (upgradeMode === "parallel") return "PARALLEL";
  if (upgradeMode === "replace") return "REPLACE";
  if (upgradeMode === "migrate") return "MIGRATE";
  return "NORMAL";
};

export function useWorkspaceHubData() {
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<any>(null);
  const [personalWorkspace, setPersonalWorkspace] = useState<Workspace | null>(null);
  const [enterpriseWorkspace, setEnterpriseWorkspace] = useState<Workspace | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<any>(null);
  const [quota, setQuota] = useState<EnterpriseQuota | null>(null);
  const [usageStats, setUsageStats] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  const [personalWorkspaceDeleted, setPersonalWorkspaceDeleted] = useState(false);
  const [upgradeMode, setUpgradeMode] = useState<"parallel" | "replace" | "migrate" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");

      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          const errorData = await res.json();
          console.log("[useWorkspaceHubData] 用户认证失效:", errorData);

          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("personalWorkspaceDeleted");
          localStorage.removeItem("personalWorkspaceUpgraded");
          localStorage.removeItem("upgradeMode");

          toast.error("会话已过期，请重新登录");
          setTimeout(() => {
            // 保留当前 URL 参数（如 invitationCode），登录后可回到原页面
            const currentPath = window.location.pathname + window.location.search;
            const redirectParam = currentPath !== "/workspace-hub" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
            router.push(`/auth/login${redirectParam}`);
          }, 1000);
        }
        return;
      }

      const data = await res.json();
      setUser(data.user);

      // 加载所有的工作空间列表
      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${data.user.id}`,
        },
      });

      if (workspacesRes.ok) {
        const workspacesData = await workspacesRes.json();

        const personal = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "PERSONAL"
        );
        const enterprise = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "ENTERPRISE"
        );

        // 如果获取到个人空间，重置已删除标记
        if (personal) {
          setPersonalWorkspace(personal);
          setPersonalWorkspaceDeleted(false);
          localStorage.setItem("personalWorkspaceDeleted", "false");
        } else {
          setPersonalWorkspace(null);
        }
        setEnterpriseWorkspace(enterprise || null);
      }

      // 获取用户主工作区看板聚合数据
      const userId = localStorage.getItem("userId") || data.user.id;
      const dashboardRes = await fetch("/api/user/workspace-hub/dashboard", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (dashboardRes.ok) {
        const resData = await dashboardRes.json();
        if (resData.success && resData.data) {
          const bentoData = resData.data;
          setDashboardData(bentoData);

          if (bentoData.user) {
            setUser(bentoData.user);
          }
          if (bentoData.personalWorkspace) {
            setPersonalWorkspace(bentoData.personalWorkspace);
            setPersonalWorkspaceDeleted(false);
            localStorage.setItem("personalWorkspaceDeleted", "false");
          } else {
            // 没有个人空间，如果本地没有删除记录，则置空
            setPersonalWorkspace(null);
          }
          if (bentoData.enterpriseWorkspaces) {
            setEnterpriseWorkspace(bentoData.enterpriseWorkspaces);
            setEnterpriseData({
              success: true,
              workspaces: bentoData.enterpriseWorkspaces,
              statistics: {
                totalWorkspaces: bentoData.enterpriseWorkspaces.length,
                totalComponents: bentoData.enterpriseWorkspaces.reduce(
                  (acc: number, ws: any) => acc + (ws.componentCount || 0),
                  0
                ),
                totalMembers: bentoData.enterpriseWorkspaces.reduce(
                  (acc: number, ws: any) => acc + (ws.memberCount || 0),
                  0
                ),
              },
            });
          }

          if (bentoData.userQuota) {
            const quotas = bentoData.userQuota.quotas;
            setQuota({
              hasEnterprise: quotas.enterpriseSlots.used > 0,
              enterpriseCount: quotas.enterpriseSlots.used,
              maxEnterprise: quotas.enterpriseSlots.total,
              isMember:
                quotas.enterpriseSlots.total > 1 ||
                bentoData.user?.role === "admin" ||
                bentoData.user?.role === "super_admin",
            });

            setUsageStats({
              monthlyTokens: quotas.tokenBalance.used,
              totalTokens: quotas.tokenBalance.historyTotalUsed || quotas.tokenBalance.used,
            });
          }
        }
      }
    } catch (error) {
      console.error("加载聚合数据失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.warn("用户未登录，即将重定向...");
      setRedirecting(true);
      // 保留当前 URL 参数（如 invitationCode），登录后可回到原页面继续邀请流程
      const currentPath = window.location.pathname + window.location.search;
      const redirectParam = currentPath !== "/workspace-hub" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
      window.location.href = `/auth/login${redirectParam}`;
      return;
    }

    // 从 localStorage 读取升级方式与删除标记
    const mode = localStorage.getItem("upgradeMode");
    if (mode && ["parallel", "replace", "migrate"].includes(mode)) {
      setUpgradeMode(mode as "parallel" | "replace" | "migrate");
    }

    const deleted = localStorage.getItem("personalWorkspaceDeleted");
    if (deleted === "true") {
      setPersonalWorkspaceDeleted(true);
    }

    loadUserInfo();
  }, []);

  // 派生出来的个人工作空间状态
  const personalState = derivePersonalState(personalWorkspace, upgradeMode, personalWorkspaceDeleted);

  return {
    user,
    personalWorkspace,
    enterpriseWorkspace,
    enterpriseData,
    quota,
    usageStats,
    dashboardData,
    personalState,
    personalWorkspaceDeleted,
    upgradeMode,
    isLoading,
    redirecting,
    refresh: loadUserInfo,
  };
}
