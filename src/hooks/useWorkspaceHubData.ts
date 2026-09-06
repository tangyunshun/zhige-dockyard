"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { dedupeFetch } from "@/lib/requestDedupe";

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
  disabledUntil?: string | null;
  disabledReason?: string | null;
  disabledDuration?: string | null;
  appealStatus?: "none" | "pending" | "approved" | "rejected";
  appealCount?: number;
  /** 空间共享算力池信息（来自 dashboard 序列化） */
  quota?: {
    id?: string;
    tokenBalance?: number | null;
    storageUsed?: number;
    storageLimit?: number;
    apiCallsUsed?: number;
    apiCallsLimit?: number;
  } | null;
  /** 兼容旧字段：与 quota 同值 */
  workspacequota?: {
    id?: string;
    tokenBalance?: number | null;
  } | null;
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
  // 个人空间只要实际存在，就以数据为准展示（NORMAL），避免遗留的升级模式标记
  // 将已存在的个人空间误判为 PARALLEL/REPLACE/MIGRATE 而隐藏卡片。
  if (workspace) return "NORMAL";
  if (isDeleted) return "DELETED";
  if (upgradeMode === "migrate") return "MIGRATE";
  if (upgradeMode === "replace") return "REPLACE";
  return "NONE";
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
  const [needsPersonalWorkspace, setNeedsPersonalWorkspace] = useState<boolean>(false);

  const [personalWorkspaceDeleted, setPersonalWorkspaceDeleted] = useState(false);
  const [upgradeMode, setUpgradeMode] = useState<"parallel" | "replace" | "migrate" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const loadUserInfo = async () => {
    try {
      const authToken = getAuthToken();
      const authHeaders: Record<string, string> = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {};

      // P1 优化：互不依赖的请求并行发起（网络耗时从“相加”降为“取最大”），
      // 且走 dedupeFetch 并发去重，与全局 AppProvider / WorkspaceProvider /
      // AuthCheck 等同刻请求共享同一次往返，避免同接口重复打库。
      const meReq = dedupeFetch("/api/auth/me", {
        headers: authHeaders,
        credentials: "include",
      });
      // P2 优化：dashboard 聚合接口已内含用户/空间列表/配额/计数等全部展示数据，
      // 因此中枢不再默认额外请求 /api/workspace/list；仅当 dashboard 不可用时才兜底补拉。
      const dashboardReq = dedupeFetch(`/api/user/workspace-hub/dashboard?_t=${Date.now()}`, {
        headers: authHeaders,
        credentials: "include",
        cache: "no-store",
      });

      const res = await meReq;

      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          const contentType = res.headers.get("content-type");
          let errorData = {};
          if (contentType && contentType.includes("application/json")) {
            errorData = await res.json().catch(() => ({}));
          }
          console.log("[useWorkspaceHubData] 用户认证失效:", errorData);

          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("personalWorkspaceDeleted");
          localStorage.removeItem("personalWorkspaceUpgraded");
          localStorage.removeItem("upgradeMode");

          setTimeout(() => {
            // 保留当前 URL 参数（如 invitationCode），登录后可回到原页面
            const currentPath = window.location.pathname + window.location.search;
            const redirectParam = currentPath !== "/workspace-hub" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
            router.push(`/auth/login${redirectParam}`);
          }, 1000);
        }
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("[useWorkspaceHubData] 接口未返回 valid JSON:", contentType);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data) return;
      setUser(data.user);

      // P2 优化：以 dashboard 聚合接口为主数据源（它已包含 user / 空间列表 / 计数 / 配额）。
      // 仅当 dashboard 不可用时才兜底请求 /api/workspace/list，避免进入中枢重复触发重量级列表。
      const dashboardRes = await dashboardReq;
      let dashboardOk = false;

      if (dashboardRes.ok) {
        const dbContentType = dashboardRes.headers.get("content-type");
        if (dbContentType && dbContentType.includes("application/json")) {
          const resData = await dashboardRes.json().catch(() => null);
          if (resData && resData.success && resData.data) {
            dashboardOk = true;
            const bentoData = resData.data;
            setDashboardData(bentoData);
            setNeedsPersonalWorkspace(!!bentoData.needsPersonalWorkspace);

            if (bentoData.user) {
              setUser(bentoData.user);
            }
            if (bentoData.personalWorkspace) {
              setPersonalWorkspace(bentoData.personalWorkspace);
              setPersonalWorkspaceDeleted(false);
              localStorage.setItem("personalWorkspaceDeleted", "false");
            } else {
              // dashboard 明确无个人空间时同样置空，避免旧状态残留
              setPersonalWorkspace(null);
            }
            if (bentoData.enterpriseWorkspaces) {
              setEnterpriseWorkspace(bentoData.enterpriseWorkspaces[0] || null);
              setEnterpriseData({
                success: true,
                workspaces: bentoData.enterpriseWorkspaces,
                statistics: {
                  totalWorkspaces: bentoData.enterpriseWorkspaces.length,
                  totalComponents: bentoData.enterpriseWorkspaces.reduce(
                    (acc: number, ws: any) => acc + (ws.componentCount || 0),
                    0
                  ),
                  totalMembers:
                    typeof bentoData.uniqueEnterpriseMemberCount === "number"
                      ? bentoData.uniqueEnterpriseMemberCount
                      : bentoData.enterpriseWorkspaces.reduce(
                        (acc: number, ws: any) => acc + (ws.memberCount || 0),
                        0
                      ),
                },
              });
            } else {
              setEnterpriseWorkspace(null);
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
      }

      // 兜底：dashboard 异常时回退到 workspace/list，保证中枢仍能展示基础空间卡片
      if (!dashboardOk) {
        const workspacesRes = await dedupeFetch(`/api/workspace/list?_t=${Date.now()}`, {
          headers: authHeaders,
          credentials: "include",
          cache: "no-store",
        });

        if (workspacesRes.ok) {
          const wsContentType = workspacesRes.headers.get("content-type");
          if (wsContentType && wsContentType.includes("application/json")) {
            const workspacesData = await workspacesRes.json().catch(() => null);

            if (workspacesData && workspacesData.workspaces) {
              const personal = workspacesData.workspaces.find(
                (w: Workspace) => w.type === "PERSONAL" && (w.role === "OWNER" || w.isOwner)
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
          }
        }
      }
    } catch (error) {
      console.error("加载聚合数据失败:", error);
    } finally {
      setIsLoading(false);
      // 升级流程遗留的标记仅用于一次性判断；数据加载完成后清除，
      // 避免刷新后缓存的 upgradeMode/personalWorkspaceUpgraded 误判个人空间状态而隐藏卡片
      //（此前必须重新登录才会被 auth/login 清除才恢复，故刷新无效）。
      localStorage.removeItem("personalWorkspaceUpgraded");
      localStorage.removeItem("upgradeMode");
    }
  };

  useEffect(() => {
    if (!getAuthToken()) {
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

    // 监听全网组件装配/卸载更新事件，实时刷新中枢卡片与列表
    const handleComponentUpdate = () => {
      console.log("[useWorkspaceHubData] 捕获全网组件装配变更事件，自动同步刷新中枢...");
      loadUserInfo();
    };
    window.addEventListener("zhige_workspace_components_updated", handleComponentUpdate);
    return () => {
      window.removeEventListener("zhige_workspace_components_updated", handleComponentUpdate);
    };
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
    needsPersonalWorkspace,
    redirecting,
    refresh: loadUserInfo,
    setPersonalWorkspace,
  };
}
