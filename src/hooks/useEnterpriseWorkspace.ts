"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface UseEnterpriseWorkspaceProps {
  refresh: () => void;
}

export function useEnterpriseWorkspace({ refresh }: UseEnterpriseWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();

  const [newEnterpriseName, setNewEnterpriseName] = useState("");
  const [newEnterpriseEmail, setNewEnterpriseEmail] = useState("");
  const [newEnterprisePhone, setNewEnterprisePhone] = useState("");
  const [newEnterpriseTeamSize, setNewEnterpriseTeamSize] = useState("1-5");
  const [newEnterpriseDesc, setNewEnterpriseDesc] = useState("");
  const [creatingEnterprise, setCreatingEnterprise] = useState(false);

  // 获取当前鉴权凭证：以真实 JWT auth_token 为准，未登录时引导重新登录
  const checkUserId = () => {
    const authToken = getAuthToken();
    if (!authToken) {
      toast.error("会话已过期，请重新登录");
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      router.push("/auth/login");
      return null;
    }
    return authToken;
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
      const authToken = getAuthToken();
      if (!authToken) return;

      const res = await fetch("/api/workspace/create-enterprise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
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
        toast.success("企业协作空间创建成功", 1000);
        setNewEnterpriseName("");
        setNewEnterpriseEmail("");
        setNewEnterprisePhone("");
        setNewEnterpriseTeamSize("1-5");
        setNewEnterpriseDesc("");
        
        refresh();
        
        if (data.workspace && data.workspace.id) {
          router.push(`/workspace/${data.workspace.id}`);
        }
      } else {
        const errorMsg = data.details ? `创建失败: ${data.details}` : (data.error || data.message || "创建失败");
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("创建企业空间失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreatingEnterprise(false);
    }
  };

  return {
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
    creatingEnterprise,
    handleCreateEnterprise,
  };
}
