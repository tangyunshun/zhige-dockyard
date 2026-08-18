"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface UsePersonalWorkspaceProps {
  refresh: () => void;
}

export function usePersonalWorkspace({ refresh }: UsePersonalWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [creatingPersonal, setCreatingPersonal] = useState(false);

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

  const handleCreatePersonal = async () => {
    try {
      setCreatingPersonal(true);
      const userId = checkUserId();
      if (!userId) return;

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        toast.success("个人空间创建成功");
        refresh();
        setTimeout(() => {
          router.push(`/workspace/${createData.workspace.id}`);
        }, 500);
      } else {
        const errorData = await createRes.json();
        const errorMsg = errorData.error || errorData.message || "创建失败";
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("创建个人空间失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreatingPersonal(false);
    }
  };

  const handleRecreatePersonal = async () => {
    try {
      setCreatingPersonal(true);
      const userId = checkUserId();
      if (!userId) return;

      const createRes = await fetch("/api/workspace/create-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        
        // 重置客户端 localStorage 状态标记
        localStorage.setItem("personalWorkspaceDeleted", "false");
        localStorage.setItem("personalWorkspaceUpgraded", "false");
        localStorage.removeItem("upgradeMode");
        
        toast.success("个人空间重建成功");
        refresh();
      } else {
        const errorData = await createRes.json();
        const errorMsg = errorData.error || errorData.message || "创建失败";
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("重建个人空间失败:", error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreatingPersonal(false);
    }
  };

  return {
    handleCreatePersonal,
    handleRecreatePersonal,
    creatingPersonal,
  };
}
