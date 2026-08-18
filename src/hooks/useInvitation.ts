"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Workspace } from "./useWorkspaceHubData";

interface UseInvitationProps {
  refresh: () => void;
}

export function useInvitation({ refresh }: UseInvitationProps) {
  const router = useRouter();
  const toast = useToast();

  // 加入空间状态
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationInfo, setInvitationInfo] = useState<any>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [joiningCode, setJoiningCode] = useState(false);
  const [joinedWorkspace, setJoinedWorkspace] = useState<any>(null);
  const [showJoinSuccessModal, setShowJoinSuccessModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // 分享生成状态
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  const handleDirectJoin = async (code: string) => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      // 1. 静默验证邀请码以获取空间基本信息
      const verifyRes = await fetch(`/api/workspace/invitation/verify?code=${code}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (!verifyRes.ok) return;
      const verifyData = await verifyRes.json();

      // 2. 直接加入空间
      const joinRes = await fetch("/api/workspace/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          invitationCode: code,
        }),
      });

      const joinData = await joinRes.json();
      if (joinRes.ok) {
        setJoinedWorkspace({
          id: joinData.workspace.id,
          name: joinData.workspace.name
        });
        setShowJoinSuccessModal(true);
        setShowJoinModal(false);
        setInvitationCode("");
        setInvitationInfo(null);
        refresh();
      }
    } catch (e) {
      console.error("静默加入空间失败:", e);
    }
  };

  // 挂载时检测邀请逻辑，支持未登录暂存与登录后自愈自动验证
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("invitationCode") || params.get("inviteCode");
    
    // 如果 URL 中有邀请码，先放入暂存区 (双保险：sessionStorage 域会话 + localStorage 跨页暂存)
    if (codeFromUrl) {
      sessionStorage.setItem("pendingInviteCode", codeFromUrl);
      localStorage.setItem("pendingInviteCode", codeFromUrl);
      setInvitationCode(codeFromUrl);
    }

    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
    const pendingCode = sessionStorage.getItem("pendingInviteCode") || localStorage.getItem("pendingInviteCode");

    if (!userId) {
      // 未登录状态：如果带有邀请码，重定向到登录页去进行 Onboarding (带上重定向参数以透传全链路)
      if (pendingCode) {
        console.log("检测到协同邀请，已暂存凭证，即将重定向到登录/注册页面...");
        const redirectTarget = `/workspace-hub?invitationCode=${pendingCode}`;
        router.push(`/auth/login?redirect=${encodeURIComponent(redirectTarget)}`);
      }
    } else {
      // 已登录状态：优先提取暂存的邀请凭证进行自动验证消费
      if (pendingCode) {
        handleDirectJoin(pendingCode);
        sessionStorage.removeItem("pendingInviteCode"); // 消费完即刻销毁
        localStorage.removeItem("pendingInviteCode");
      } else if (codeFromUrl) {
        handleDirectJoin(codeFromUrl);
        // 清理 URL 参数，防止刷新时再次弹窗加入
        if (typeof window !== "undefined") {
          const urlWithoutParams = window.location.pathname;
          window.history.replaceState({}, document.title, urlWithoutParams);
        }
      }
    }
  }, []);

  const verifyInvitation = async (code: string) => {
    if (!code) return;
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
        setJoinedWorkspace({
          id: data.workspace.id,
          name: data.workspace.name
        });
        setShowJoinSuccessModal(true);
        setShowJoinModal(false);
        setInvitationCode("");
        setInvitationInfo(null);
        refresh();
      } else {
        const errorMsg = data.error || data.message || "加入空间失败";
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("加入空间失败:", error);
      toast.error("加入空间失败");
    } finally {
      setJoiningCode(false);
    }
  };

  // 加载"当前选中空间"的邀请码，使用与工作台成员页完全相同的接口与去重口径，
  // 以保证两处"已生成邀请码"的数量与有效/无效状态完全一致
  const loadSelectedWorkspaceInvitations = async (wsId?: string) => {
    const target = wsId || selectedWorkspace;
    if (!target) return;
    try {
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch(`/api/workspace/members?workspaceId=${target}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (!res.ok) {
        setInvitations([]);
        return;
      }

      const data = await res.json();
      const raw = data.activeInvitations || [];

      // 与工作控制台完全一致：按邀请码去重（保留首次出现的一条），再按状态/时间排序
      const seenCodes = new Set<string>();
      const deduped = raw.filter((inv: any) => {
        if (seenCodes.has(inv.code)) return false;
        seenCodes.add(inv.code);
        return true;
      });

      const statusRank = (inv: any): number => {
        if (inv.status === "REVOKED") return 1;
        if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) return 2;
        return 0;
      };
      const timeValue = (inv: any): number => {
        const t = inv.createdAt
          ? new Date(inv.createdAt).getTime()
          : inv.expiresAt
          ? new Date(inv.expiresAt).getTime()
          : 0;
        return t;
      };

      const sorted = [...deduped].sort(
        (a: any, b: any) => statusRank(a) - statusRank(b) || timeValue(a) - timeValue(b)
      );
      setInvitations(sorted);
    } catch (error) {
      console.error("加载选中空间邀请码失败:", error);
      setInvitations([]);
    }
  };

  // 切换选中空间时，同步刷新该空间的邀请码列表（与工作台口径一致）
  useEffect(() => {
    if (selectedWorkspace) {
      loadSelectedWorkspaceInvitations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace]);

  const loadShareableWorkspaces = async () => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/shareable-list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) throw new Error("加载失败");

      const data = await res.json();
      const rawWorkspaceList = data.workspaces || data.data || [];
      // 兼容后端成员数字段：优先 memberCount，否则取 _count.workspacemember，确保实时且正确
      const workspaceList = rawWorkspaceList.map((ws: any) => ({
        ...ws,
        memberCount:
          ws.memberCount ?? (ws._count ? ws._count.workspacemember : 0) ?? 0,
      }));
      setWorkspaces(workspaceList);

      // 选中空间的邀请码改为调用与工作台完全相同的 /api/workspace/members，
      // 以保证两处"已生成邀请码"的数量与有效/无效口径完全一致
      if (workspaceList.length > 0) {
        const firstId = workspaceList[0].id;
        setSelectedWorkspace(firstId);
        await loadSelectedWorkspaceInvitations(firstId);
      }
    } catch (error) {
      console.error("加载可分享空间失败:", error);
      toast.error("加载失败");
    }
  };

  const handleGenerateInvitation = async () => {
    if (!selectedWorkspace) {
      toast.error("请选择要分享的空间");
      return;
    }

    try {
      setGenerating(true);
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/invitation/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          email: showAdvanced ? inviteEmail : null,
          expiresInDays: showAdvanced ? expiresInDays : null,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");

      toast.success("邀请码生成成功");
      await loadShareableWorkspaces();
      await loadSelectedWorkspaceInvitations();
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

  const handleDeleteInvitation = async (invitationId: string) => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/invitation/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({ invitationId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");

      toast.success("邀请记录已成功删除");
      await loadShareableWorkspaces();
    } catch (error: any) {
      console.error("删除邀请记录失败:", error);
      toast.error(error.message || "删除失败，请重试");
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const userId = checkUserId();
      if (!userId) return;

      const res = await fetch("/api/workspace/invitation/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({ invitationId, action: "revoke" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "作废失败");

      toast.success("邀请记录已成功作废");
      await loadShareableWorkspaces();
      await loadSelectedWorkspaceInvitations();
    } catch (error: any) {
      console.error("作废邀请记录失败:", error);
      toast.error(error.message || "作废失败，请重试");
    }
  };

  return {
    invitationCode,
    setInvitationCode,
    invitationInfo,
    setInvitationInfo,
    verifyingCode,
    joiningCode,
    verifyInvitation,
    handleJoinWorkspace,
    joinedWorkspace,
    showJoinSuccessModal,
    setShowJoinSuccessModal,
    showJoinModal,
    setShowJoinModal,

    workspaces,
    invitations,
    selectedWorkspace,
    setSelectedWorkspace,
    generating,
    showAdvanced,
    setShowAdvanced,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    expiresInDays,
    setExpiresInDays,
    copiedCode,
    loadShareableWorkspaces,
    handleGenerateInvitation,
    handleCopyCode,
    handleCopyLink,
    handleCopyInvitation,
    handleDeleteInvitation,
    handleRevokeInvitation,
  };
}
