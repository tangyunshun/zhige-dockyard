"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Workspace } from "./useWorkspaceHubData";
import { getAuthToken } from "@/utils/auth";
import { safeJsonResponse } from "@/utils/api-helpers";

interface UseDeleteWorkspaceProps {
  refresh: () => void;
}

export function useDeleteWorkspace({ refresh }: UseDeleteWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpPurpose, setStepUpPurpose] = useState<"delete_workspace" | "delete_upgraded_personal" | null>(null);

  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null);
  const [deleteCheckResult, setDeleteCheckResult] = useState<any>(null);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const authToken = getAuthToken();
      if (!authToken) return;

      setCheckingDelete(true);
      setWorkspaceToDelete(workspaceId);

      const res = await fetch(`/api/workspace/check-delete?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const parsed = await safeJsonResponse(res, "检查失败");
      if (!parsed.success) {
        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        throw new Error(parsed.error);
      }

      const checkData = parsed.data;
      setDeleteCheckResult(checkData);

      if (checkData.issues && checkData.issues.length > 0) {
        setCheckingDelete(false);
        setWorkspaceToDelete(null);
        const errorMessage = `❌ 无法注销：${checkData.issues.join("；")}`;
        toast.error(errorMessage);
        return;
      }

      setCheckingDelete(false);
      setShowDeleteModal(true);
    } catch (error) {
      console.warn("检查删除协作空间失败:", error);
      setCheckingDelete(false);
      setWorkspaceToDelete(null);
      toast.error(error instanceof Error ? error.message : "检查失败");
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
      const authToken = getAuthToken();
      if (!authToken) return;

      setDeletingWorkspaceId(workspaceToDelete);
      const deleteRes = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          workspaceId: workspaceToDelete,
          action: "DELETE",
          verifyToken: actualToken,
        }),
      });

      const deleteParsed = await safeJsonResponse(deleteRes, "注销失败");
      if (!deleteParsed.success) {
        throw new Error(deleteParsed.error);
      }

      toast.success("空间已注销");
      setShowDeleteModal(false);
      setWorkspaceToDelete(null);
      setDeleteCheckResult(null);
      setDeleteConfirmText("");

      refresh();
    } catch (error) {
      console.error("注销协作空间失败:", error);
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

  const handleDeleteUpgradedPersonal = () => {
    setShowDeleteConfirmModal(true);
    setDeleteConfirmText("");
  };

  const confirmDeleteUpgradedPersonal = async (token?: string) => {
    if (deleteConfirmText !== "确认注销") {
      toast.error('请输入"确认注销"以确认操作');
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
      const authToken = getAuthToken();
      if (!authToken) return;

      // 首先需要获取个人工作空间 ID
      // 可以在组件内部传给此函数，或是通过 API /api/workspace/list 获得。
      // 为保持独立，我们先查一下列表
      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const workspacesParsed = await safeJsonResponse(workspacesRes, "获取空间信息失败");
      if (!workspacesParsed.success) throw new Error(workspacesParsed.error);
      const listData = workspacesParsed.data;
      const personal = listData?.workspaces?.find((w: Workspace) => w.type === "PERSONAL");

      if (!personal) {
        toast.error("个人空间不存在");
        return;
      }

      const deleteRes = await fetch(
        `/api/workspace/delete?workspaceId=${personal.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            workspaceId: personal.id,
            action: "DELETE",
            verifyToken: actualToken,
          }),
        }
      );

      const deleteParsed = await safeJsonResponse(deleteRes, "注销失败");
      if (deleteParsed.success) {
        localStorage.setItem("personalWorkspaceDeleted", "true");
        localStorage.setItem("personalWorkspaceUpgraded", "false");
        localStorage.removeItem("upgradeMode");
        
        setShowDeleteConfirmModal(false);
        setDeleteConfirmText("");
        toast.success("个人空间已注销");
        
        refresh();
      } else {
        throw new Error(deleteParsed.error);
      }
    } catch (error) {
      console.error("注销个人空间失败:", error);
      toast.error(error instanceof Error ? error.message : "注销失败");
    } finally {
      setDeleting(false);
    }
  };

  return {
    deleteConfirmText,
    setDeleteConfirmText,
    showDeleteModal,
    setShowDeleteModal,
    showDeleteConfirmModal,
    setShowDeleteConfirmModal,
    showStepUpModal,
    setShowStepUpModal,
    stepUpPurpose,
    setStepUpPurpose,
    workspaceToDelete,
    deleteCheckResult,
    deletingWorkspaceId,
    checkingDelete,
    deleting,

    handleDeleteWorkspace,
    confirmDeleteWorkspace,
    confirmDeleteUpgradedPersonal,
    cancelDeleteWorkspace,
    handleDeleteUpgradedPersonal,
  };
}
