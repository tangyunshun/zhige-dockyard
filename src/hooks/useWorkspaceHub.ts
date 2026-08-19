"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useLogout } from "@/hooks/useLogout";

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
  if (workspace && (workspace as any).upgraded) {
    if (upgradeMode === "parallel") return "PARALLEL";
    if (upgradeMode === "replace") return "REPLACE";
    if (upgradeMode === "migrate") return "MIGRATE";
  }
  if (!workspace) return "NONE";
  return "NORMAL";
};

export function useWorkspaceHub() {
  const router = useRouter();
  const toast = useToast();
  const { logout: handleLogoutHook } = useLogout();

  // 核心数据状态
  const [user, setUser] = useState<any>(null);
  const [personalWorkspace, setPersonalWorkspace] = useState<Workspace | null>(null);
  const [enterpriseWorkspace, setEnterpriseWorkspace] = useState<Workspace | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<any>(null);
  const [quota, setQuota] = useState<EnterpriseQuota | null>(null);
  const [usageStats, setUsageStats] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // 个人空间状态机相关状态
  const [personalWorkspaceDeleted, setPersonalWorkspaceDeleted] = useState(false);
  const [personalWorkspaceUpgraded, setPersonalWorkspaceUpgraded] = useState(false);
  const [upgradeMode, setUpgradeMode] = useState<"parallel" | "replace" | "migrate" | null>(null);

  // 加载与跳转状态
  const [isLoading, setIsLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  // 弹窗控制状态
  const [showCreateEnterpriseModal, setShowCreateEnterpriseModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpPurpose, setStepUpPurpose] = useState<"delete_workspace" | "delete_upgraded_personal" | null>(null);

  // 各种输入表单状态
  const [newEnterpriseName, setNewEnterpriseName] = useState("");
  const [newEnterpriseEmail, setNewEnterpriseEmail] = useState("");
  const [newEnterprisePhone, setNewEnterprisePhone] = useState("");
  const [newEnterpriseTeamSize, setNewEnterpriseTeamSize] = useState("1-5");
  const [newEnterpriseDesc, setNewEnterpriseDesc] = useState("");
  
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationInfo, setInvitationInfo] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 操作处理中 Loading 状态
  const [creatingEnterprise, setCreatingEnterprise] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [joiningCode, setJoiningCode] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 分享邀请相关状态
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);

  // 被选定操作的 Workspace
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState<any>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"personal" | "enterprise">("personal");
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");

  useEffect(() => {
    // 首先检查用户是否已登录
    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.warn("用户未登录，即将重定向到登录页面...");
      setRedirecting(true);
      window.location.href = "/auth/login";
      return;
    }

    // 检查 URL 参数中的邀请码
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("invitationCode");
    if (codeFromUrl) {
      setInvitationCode(codeFromUrl);
      setShowJoinModal(true);
      verifyInvitation(codeFromUrl);
    }
    
    // 从 localStorage 读取升级方式
    const mode = localStorage.getItem("upgradeMode");
    if (mode && ["parallel", "replace", "migrate"].includes(mode)) {
      setUpgradeMode(mode as "parallel" | "replace" | "migrate");
    }
    
    // 从 localStorage 读取个人空间删除状态
    const deleted = localStorage.getItem("personalWorkspaceDeleted");
    if (deleted === "true") {
      setPersonalWorkspaceDeleted(true);
      setPersonalWorkspaceUpgraded(false);
      localStorage.setItem("personalWorkspaceUpgraded", "false");
    } else {
      const upgraded = localStorage.getItem("personalWorkspaceUpgraded");
      if (upgraded === "true") {
        setPersonalWorkspaceUpgraded(true);
      }
    }

    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");

      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          const errorData = await res.json();
          console.log("[loadUserInfo] 用户认证失效:", errorData);

          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("personalWorkspaceDeleted");
          localStorage.removeItem("personalWorkspaceUpgraded");
          localStorage.removeItem("upgradeMode");
          
          setTimeout(() => {
            router.push("/auth/login");
          }, 1000);
        }
        return;
      }

      const data = await res.json();
      setUser(data.user);

      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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

        if (personal) {
          setPersonalWorkspace(personal);
          setPersonalWorkspaceDeleted(false);
          localStorage.setItem("personalWorkspaceDeleted", "false");
        } else if (!personal && data.user?.id) {
          if (personalWorkspaceDeleted) {
            setPersonalWorkspace(null);
          } else if (
            personalWorkspaceUpgraded &&
            (upgradeMode === "replace" || upgradeMode === "migrate")
          ) {
            setPersonalWorkspace(null);
          } else if (personalWorkspaceUpgraded && upgradeMode === "parallel") {
            setPersonalWorkspace(null);
          } else {
            const createRes = await fetch("/api/workspace/create-personal", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.user.id}`,
              },
            });

            if (createRes.ok) {
              const createData = await createRes.json();
              setPersonalWorkspace(createData.workspace);
            } else {
              setPersonalWorkspace(null);
            }
          }
        } else {
          setPersonalWorkspace(personal || null);
        }

        setEnterpriseWorkspace(enterprise || null);
      }

      // 聚合加载 Dashboard 数据
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        router.push("/auth/login");
        return;
      }

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
          } else {
            setPersonalWorkspace(null);
          }
          if (bentoData.enterpriseWorkspaces) {
            setEnterpriseWorkspace(bentoData.enterpriseWorkspaces);
            setEnterpriseData({
              success: true,
              workspaces: bentoData.enterpriseWorkspaces,
              statistics: {
                totalWorkspaces: bentoData.enterpriseWorkspaces.length,
                totalComponents: bentoData.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.componentCount || 0), 0),
                totalMembers: bentoData.enterpriseWorkspaces.reduce((acc: number, ws: any) => acc + (ws.memberCount || 0), 0),
              }
            });
          }

          if (bentoData.userQuota) {
            const quotas = bentoData.userQuota.quotas;
            setQuota({
              hasEnterprise: quotas.enterpriseSlots.used > 0,
              enterpriseCount: quotas.enterpriseSlots.used,
              maxEnterprise: quotas.enterpriseSlots.total,
              isMember: quotas.enterpriseSlots.total > 1 || bentoData.user?.role === "admin" || bentoData.user?.role === "super_admin",
            });

            setUsageStats({
              monthlyTokens: quotas.tokenBalance.used,
              totalTokens: quotas.tokenBalance.historyTotalUsed || quotas.tokenBalance.used,
            });
          }
        }
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
      setPersonalWorkspace(null);
      setEnterpriseWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    handleLogoutHook();
  };

  const handleEnterWorkspace = async (workspace: Workspace | null) => {
    toast.info("正在加载空间信息...", 1000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (workspace) {
      router.push(`/workspace/${workspace.id}`);
    } else {
      router.push("/workspace-hub/create");
    }
  };

  const handleGoToCreateEnterprise = () => {
    if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
      toast.error(`您当前最多可创建${quota.maxEnterprise}个企业空间`);
      return;
    }
    router.push("/workspace-hub/create");
  };

  const handleExpandEnterprise = (workspaceId: string) => {
    router.push(`/workspace-hub/create?action=expand&workspaceId=${workspaceId}`);
  };

  const handleAuthError = (errorMessage: string, statusCode?: number) => {
    if (errorMessage.includes("用户不存在") || statusCode === 404) {
      toast.error("会话已过期，请重新登录");
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
      return true;
    }
    return false;
  };

  const checkUserId = () => {
    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
    if (!userId) {
      toast.error("会话已过期，请重新登录");
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      router.push("/auth/login");
      return null;
    }
    return userId;
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      setCheckingDelete(true);
      setWorkspaceToDelete(workspaceId);

      const res = await fetch(`/api/workspace/check-delete?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        const errorMsg = errorData.error || errorData.message || "检查失败";
        if (handleAuthError(errorMsg, res.status)) return;

        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        throw new Error(errorMsg);
      }

      const checkData = await res.json();
      setDeleteCheckResult(checkData);

      if (checkData.issues && checkData.issues.length > 0) {
        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        const errorMessage = `❌ 无法注销：${checkData.issues.join('；')}`;
        toast.error(errorMessage);
        return;
      }

      setCheckingDelete(false);
      setShowDeleteModal(true);
    } catch (error) {
      console.warn("Check delete workspace error:", error);
      setCheckingDelete(false);
      setWorkspaceToDelete(null);
      toast.error(error instanceof Error ? error.message : "检查失败");
    }
  };

  const handleCreateEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnterpriseName.trim()) {
      toast.error("请输入工作空间名称");
      return;
    }
    if (!newEnterpriseEmail.trim()) {
      toast.error("请输入联系邮箱");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEnterpriseEmail.trim())) {
      toast.error("请输入有效的联系邮箱");
      return;
    }

    try {
      setCreatingEnterprise(true);
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/create-enterprise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          name: newEnterpriseName.trim(),
          description: newEnterpriseDesc.trim(),
          teamSize: newEnterpriseTeamSize,
          contactEmail: newEnterpriseEmail.trim(),
          contactPhone: newEnterprisePhone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("企业协作空间创建成功");
        setShowCreateEnterpriseModal(false);
        setNewEnterpriseName("");
        setNewEnterpriseEmail("");
        setNewEnterprisePhone("");
        setNewEnterpriseTeamSize("1-5");
        setNewEnterpriseDesc("");
        
        await loadUserInfo();
        
        if (data.workspace && data.workspace.id) {
          router.push(`/workspace/${data.workspace.id}`);
        }
      } else {
        const errorMsg = data.error || data.message || "创建失败";
        if (handleAuthError(errorMsg, res.status)) return;
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("创建企业空间失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreatingEnterprise(false);
    }
  };

  const handleCreatePersonal = async () => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        setPersonalWorkspace(createData.workspace);
        toast.success("个人空间创建成功");
        setTimeout(() => {
          router.push(`/workspace/${createData.workspace.id}`);
        }, 500);
      } else {
        const errorData = await createRes.json();
        const errorMsg = errorData.error || errorData.message || "创建失败";
        if (handleAuthError(errorMsg, createRes.status)) return;
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.warn("Create personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  const handleDeleteUpgradedPersonal = () => {
    setShowDeleteConfirmModal(true);
    setDeleteConfirmText("");
  };

  const confirmDeleteUpgradedPersonal = async (token?: string) => {
    if (deleteConfirmText !== "重置") {
      toast.error('请输入"重置"以确认操作');
      return;
    }

    if (!personalWorkspace) {
      toast.error("个人空间不存在");
      return;
    }

    const actualToken = typeof token === "string" ? token : undefined;
    if (!actualToken) {
      setStepUpPurpose("delete_upgraded_personal");
      setShowStepUpModal(true);
      return;
    }

    try {
      setDeleting(true);
      const userId = checkUserId();
      if (!userId) return;

      const deleteRes = await fetch(
        `/api/workspace/delete?workspaceId=${personalWorkspace.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({
            workspaceId: personalWorkspace.id,
            action: "DELETE",
            verifyToken: actualToken,
          }),
        }
      );

      if (deleteRes.ok) {
        setPersonalWorkspace(null);
        setPersonalWorkspaceDeleted(true);
        localStorage.setItem("personalWorkspaceDeleted", "true");
        setShowDeleteConfirmModal(false);
        setDeleteConfirmText("");
        toast.success("个人空间已重置");
      } else {
        const errorData = await deleteRes.json();
        const errorMsg = errorData.error || errorData.message || "注销失败";
        if (handleAuthError(errorMsg, deleteRes.status)) return;
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Delete upgraded personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "注销失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleRecreatePersonal = async () => {
    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("请先登录");
        setTimeout(() => {
          router.push("/auth/login");
        }, 1500);
        return;
      }

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        setPersonalWorkspace(createData.workspace);
        setPersonalWorkspaceDeleted(false);
        setPersonalWorkspaceUpgraded(false);
        setUpgradeMode(null);
        localStorage.setItem("personalWorkspaceDeleted", "false");
        localStorage.setItem("personalWorkspaceUpgraded", "false");
        localStorage.removeItem("upgradeMode");
        toast.success("个人空间创建成功");
      } else {
        const errorData = await createRes.json();
        const errorMessage = errorData.error || errorData.message || "创建失败";

        if (errorMessage.includes("用户不存在") || createRes.status === 404) {
          toast.error("会话已过期，请重新登录");
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          setTimeout(() => {
            router.push("/auth/login");
          }, 1500);
        } else {
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      console.warn("Recreate personal workspace error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  const confirmDeleteWorkspace = async (token?: string) => {
    if (!workspaceToDelete) return;

    const actualToken = typeof token === "string" ? token : undefined;
    if (!actualToken) {
      setStepUpPurpose("delete_workspace");
      setShowStepUpModal(true);
      return;
    }

    try {
      const userId = checkUserId();
      if (!userId) return;

      setDeletingWorkspaceId(workspaceToDelete);
      const deleteRes = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: workspaceToDelete,
          action: "DELETE",
          verifyToken: actualToken,
        }),
      });

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        const errorMsg = errorData.error || errorData.message || "注销失败";
        if (handleAuthError(errorMsg, deleteRes.status)) return;
        throw new Error(errorMsg);
      }

      toast.success("空间已注销");
      setShowDeleteModal(false);
      setWorkspaceToDelete(null);
      setDeleteCheckResult(null);
      setDeleteConfirmText("");

      await loadUserInfo();
    } catch (error) {
      console.error("Delete workspace error:", error);
      toast.error(error instanceof Error ? error.message : "注销失败");
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const cancelDeleteWorkspace = () => {
    setShowDeleteModal(false);
    setWorkspaceToDelete(null);
    setDeleteCheckResult(null);
    setDeleteConfirmText("");
  };

  const handleUpgradeWorkspace = () => {
    if (!personalWorkspace) {
      toast.error("请先创建个人空间");
      return;
    }
    if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
      toast.error(`您当前最多可拥有${quota.maxEnterprise}个企业空间`);
      return;
    }
    router.push(`/workspace/upgrade?workspaceId=${personalWorkspace.id}`);
  };

  const handleOpenEditModal = (id: string, name: string, description: string) => {
    toast.info("工作空间信息编辑功能即将上线，敬请期待");
  };

  const verifyInvitation = async (code: string) => {
    try {
      setVerifyingCode(true);
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch(`/api/workspace/invitation/verify?code=${code}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setInvitationInfo(data.invitation);
      } else {
        const errorMsg = data.error || data.message || "邀请码无效";
        if (handleAuthError(errorMsg, res.status)) return;

        setInvitationInfo(null);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("验证邀请码失败:", error);
      toast.error("验证邀请码失败");
      setInvitationInfo(null);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleJoinWorkspace = async () => {
    if (!invitationCode) {
      toast.error("请输入邀请码");
      return;
    }

    if (!invitationInfo) {
      toast.error("请先验证邀请码");
      return;
    }

    try {
      setJoiningCode(true);
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          invitationCode,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`已成功加入空间 "${data.workspace.name}"`);
        setShowJoinModal(false);
        setInvitationCode("");
        setInvitationInfo(null);
        await loadUserInfo();
        router.push(`/workspace/${data.workspace.id}`);
      } else {
        const errorMsg = data.error || data.message || "加入空间失败";
        if (handleAuthError(errorMsg, res.status)) return;
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("加入空间失败:", error);
      toast.error("加入空间失败");
    } finally {
      setJoiningCode(false);
    }
  };

  const handleOpenJoinModal = () => {
    setShowJoinModal(true);
    setInvitationCode("");
    setInvitationInfo(null);
  };

  const handleCloseJoinModal = () => {
    setShowJoinModal(false);
    setInvitationCode("");
    setInvitationInfo(null);
  };

  const loadShareableWorkspaces = async () => {
    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) return;

      const res = await fetch("/api/workspace/shareable-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) throw new Error("加载失败");

      const data = await res.json();
      const rawWorkspaceList = data.workspaces || data.data || [];
      // 与工作台口径一致：将后端返回的 _count.workspacemember 映射到 memberCount，确保成员数量正确
      const workspaceList = rawWorkspaceList.map((ws: any) => ({
        ...ws,
        memberCount:
          ws.memberCount ?? (ws._count ? ws._count.workspacemember : 0) ?? 0,
      }));
      const invitationList = data.invitations || [];
      
      setWorkspaces(workspaceList);
      setInvitations(invitationList);

      if (workspaceList.length > 0) {
        setSelectedWorkspace(workspaceList[0].id);
      }
    } catch (error) {
      console.error("加载可分享空间失败:", error);
      toast.error("加载失败");
    }
  };

  const handleOpenShareModal = async () => {
    setShowShareModal(true);
    await loadShareableWorkspaces();
  };

  const handleGenerateInvitation = async () => {
    if (!selectedWorkspace) {
      toast.error("请选择要分享的空间");
      return;
    }

    try {
      setGenerating(true);
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          email: null,
          expiresInDays: showAdvanced ? expiresInDays : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");

      toast.success("邀请码生成成功");
      await loadShareableWorkspaces();
    } catch (error) {
      console.warn("生成邀请码失败:", error);
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    const text = `【知阁·舟坊】项目协同邀请码：${code}\n(请在知阁·舟坊工作台输入以加入企业协作空间)`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("邀请码已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/workspace-hub?invitationCode=${code}`;
    const text = `【知阁·舟坊】项目协同快捷加入链接：${url}\n(点击链接即可一键加入企业协作空间)`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("链接已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyInvitation = (code: string, invitationUrl: string) => {
    const text = `【知阁·舟坊】项目协同邀请函 ✉️\n\n您的团队负责人正在邀请您加入项目工作空间进行实时协作与自动化流程运行。\n\n🔑 专属邀请码：${code}\n🚀 专属快捷加入链接（点击即入）：${invitationUrl}\n\n—— 知阁·舟坊：高效、智能的团队研发协同中枢，让开发化繁为简。`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // 派生出来的个人工作空间状态机状态
  const personalState = derivePersonalState(personalWorkspace, upgradeMode, personalWorkspaceDeleted);

  return {
    user,
    personalWorkspace,
    enterpriseWorkspace,
    enterpriseData,
    quota,
    usageStats,
    dashboardData,
    
    // 状态机与状态
    personalState,
    personalWorkspaceDeleted,
    personalWorkspaceUpgraded,
    upgradeMode,
    isLoading,
    redirecting,
    
    // 弹窗显隐
    showCreateEnterpriseModal,
    setShowCreateEnterpriseModal,
    showJoinModal,
    setShowJoinModal,
    showShareModal,
    setShowShareModal,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    showDeleteModal,
    setShowDeleteModal,
    showStepUpModal,
    setShowStepUpModal,
    stepUpPurpose,
    setStepUpPurpose,

    // 各表单输入项
    newEnterpriseName,
    setNewEnterpriseName,
    newEnterpriseEmail,
    setNewEnterpriseEmail,
    newEnterprisePhone,
    setNewEnterprisePhone,
    newEnterpriseTeamSize,
    setNewEnterpriseTeamSize,
    newEnterpriseDesc,
    setNewEnterpriseDesc,
    deleteConfirmText,
    setDeleteConfirmText,
    invitationCode,
    setInvitationCode,
    invitationInfo,
    setInvitationInfo,
    copiedCode,
    setCopiedCode,

    // 操作 Loading
    creatingEnterprise,
    deletingWorkspaceId,
    checkingDelete,
    verifyingCode,
    joiningCode,
    deleting,

    // 分享及其他子项
    workspaces,
    invitations,
    selectedWorkspace,
    setSelectedWorkspace,
    generating,
    showAdvanced,
    setShowAdvanced,
    inviteRole,
    setInviteRole,
    expiresInDays,
    setExpiresInDays,
    workspaceToDelete,
    setWorkspaceToDelete,
    deleteCheckResult,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    workspaceSearchQuery,
    setWorkspaceSearchQuery,

    // 方法暴露
    loadUserInfo,
    handleLogout,
    handleEnterWorkspace,
    handleGoToCreateEnterprise,
    handleExpandEnterprise,
    handleDeleteWorkspace,
    handleCreateEnterprise,
    handleCreatePersonal,
    handleDeleteUpgradedPersonal,
    confirmDeleteUpgradedPersonal,
    handleRecreatePersonal,
    confirmDeleteWorkspace,
    cancelDeleteWorkspace,
    handleUpgradeWorkspace,
    handleOpenEditModal,
    verifyInvitation,
    handleJoinWorkspace,
    handleOpenJoinModal,
    handleCloseJoinModal,
    handleOpenShareModal,
    handleGenerateInvitation,
    handleCopyCode,
    handleCopyLink,
    handleCopyInvitation
  };
}
