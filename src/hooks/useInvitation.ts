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

  // 挂载时检测 URL 是否有邀请码
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("invitationCode");
    if (codeFromUrl) {
      setInvitationCode(codeFromUrl);
      verifyInvitation(codeFromUrl);
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
        toast.success(`已成功加入空间 "${data.workspace.name}"`);
        setInvitationCode("");
        setInvitationInfo(null);
        refresh();
        router.push(`/workspace/${data.workspace.id}`);
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
      setWorkspaces(data.workspaces);
      setInvitations(data.invitations);

      if (data.workspaces.length > 0) {
        setSelectedWorkspace(data.workspaces[0].id);
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
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("邀请码已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/workspace-hub?invitationCode=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("链接已复制");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyInvitation = (code: string, invitationUrl: string) => {
    const text = `邀请您加入工作空间！\n\n邀请码：${code}\n\n点击链接加入：${invitationUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedCode(null), 2000);
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
  };
}
