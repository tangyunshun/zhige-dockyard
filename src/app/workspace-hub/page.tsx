"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";

// 引入 5 个独立拆分的 Hooks
import { useWorkspaceHubData } from "@/hooks/useWorkspaceHubData";
import { usePersonalWorkspace } from "@/hooks/usePersonalWorkspace";
import { useEnterpriseWorkspace } from "@/hooks/useEnterpriseWorkspace";
import { useInvitation } from "@/hooks/useInvitation";
import { useDeleteWorkspace } from "@/hooks/useDeleteWorkspace";

// 引入 Bento 基础子组件
import UserGreeting from "@/components/workspace-hub/UserGreeting";
import PersonalWorkspaceCard from "@/components/workspace-hub/PersonalWorkspaceCard";
import EnterpriseWorkspaceList from "@/components/workspace-hub/EnterpriseWorkspaceList";
import ResourceOverview from "@/components/workspace-hub/ResourceOverview";
import QuickActions from "@/components/workspace-hub/QuickActions";
import FeaturedComponents from "@/components/workspace-hub/FeaturedComponents";
import PendingSection from "@/components/workspace-hub/PendingSection";
import PageSkeleton from "@/components/workspace-hub/PageSkeleton";

// 引入全量封装的 Modals
import UpgradeModal from "@/components/workspace-hub/modals/UpgradeModal";
import JoinEnterpriseModal from "@/components/workspace-hub/modals/JoinEnterpriseModal";
import ShareWorkspaceModal from "@/components/workspace-hub/modals/ShareWorkspaceModal";
import DeleteConfirmModal from "@/components/workspace-hub/modals/DeleteConfirmModal";
import CreateEnterpriseModal from "@/components/workspace-hub/modals/CreateEnterpriseModal";
import StepUpAuthModal from "@/components/StepUpAuthModal";

export default function WorkspaceHub() {
  const router = useRouter();
  const toast = useToast();

  // 1. 数据状态与加载 Hook
  const {
    user,
    personalWorkspace,
    enterpriseWorkspace,
    enterpriseData,
    quota,
    usageStats,
    dashboardData,
    personalState,
    isLoading,
    redirecting,
    refresh,
  } = useWorkspaceHubData();

  // 2. 个人空间核心 CRUD Hook
  const {
    handleCreatePersonal,
    handleRecreatePersonal,
  } = usePersonalWorkspace({ refresh });

  // 3. 企业空间核心创建 Hook
  const {
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
  } = useEnterpriseWorkspace({ refresh });

  // 4. 协作邀请加入与分享生成 Hook
  const {
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
  } = useInvitation({ refresh });

  // 5. 注销、重置物理状态与二次鉴权 Step-Up Hook
  const {
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
    deleting,
    handleDeleteWorkspace,
    confirmDeleteWorkspace,
    confirmDeleteUpgradedPersonal,
    cancelDeleteWorkspace,
    handleDeleteUpgradedPersonal,
  } = useDeleteWorkspace({ refresh });

  // 6. 前端专属 Modal 显隐控制
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCreateEnterpriseModal, setShowCreateEnterpriseModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // 真正个人工作空间一键重置相关状态
  const [showPersonalResetModal, setShowPersonalResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  // 绑定全局命令，使无数据时的“输入邀请码加入”按钮能隔空呼出邀请 Modal
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__toggleJoinModal = () => setShowJoinModal(true);
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__toggleJoinModal;
      }
    };
  }, []);

  // 7. 进入空间跳转与包装
  const handleEnterWorkspace = async (workspace: any) => {
    toast.info("正在加载空间信息...", 1000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (workspace && workspace.id) {
      router.push(`/workspace/${workspace.id}`);
    } else {
      router.push("/workspace-hub/create");
    }
  };

  const handleOpenShare = async (id?: string) => {
    if (id) setSelectedWorkspace(id);
    setShowShareModal(true);
    await loadShareableWorkspaces();
  };

  const handleOpenResetPersonal = () => {
    setShowPersonalResetModal(true);
    setResetConfirmText("");
  };

  const handleConfirmResetPersonal = async (token?: string) => {
    if (resetConfirmText !== "确认重置") {
      toast.error('请输入"确认重置"以确认操作');
      return;
    }

    const actualToken = typeof token === "string" ? token : undefined;
    if (!actualToken) {
      setStepUpPurpose("reset_personal" as any);
      setShowStepUpModal(true);
      setShowPersonalResetModal(false);
      return;
    }

    try {
      setResetting(true);
      const userId = localStorage.getItem("userId");
      if (!userId) return;

      // 1. 获取个人空间 ID
      const workspacesRes = await fetch("/api/workspace/list", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!workspacesRes.ok) throw new Error("获取空间信息失败");
      const listData = await workspacesRes.json();
      const personal = listData.workspaces.find((w: any) => w.type === "PERSONAL");

      if (!personal) {
        toast.error("个人空间不存在");
        return;
      }

      // 2. 调用清空工作空间数据接口（真正的重置）
      const resetRes = await fetch("/api/workspace/clear-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: personal.id,
          confirmText: resetConfirmText,
          verifyToken: actualToken,
        }),
      });

      if (resetRes.ok) {
        setShowPersonalResetModal(false);
        setResetConfirmText("");
        toast.success("个人沙箱数据已成功重置为出厂状态");
        refresh();
      } else {
        const errorData = await resetRes.json();
        throw new Error(errorData.error || errorData.message || "重置失败");
      }
    } catch (error) {
      console.error("重置个人空间数据失败:", error);
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (redirecting) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f8ff]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">正在跳转到登录页面...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative pb-6">
      {/* 背景渐变效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.06] rounded-full blur-[120px]" />
      </div>



      {/* 主核心区 */}
      <main className="relative z-10 max-w-[1440px] mx-auto px-6 pt-8 pb-0 space-y-4">
        <UserGreeting user={user} />

        {/* 待处理邀请（条件渲染） */}
        <PendingSection
          pendingItems={dashboardData?.pendingItems}
          onAcceptInvitation={(code) => {
            setInvitationCode(code);
            setShowJoinModal(true);
            verifyInvitation(code);
          }}
        />

        {/* Bento Bento 12 列网格布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-6">
          {/* 左侧区域：占 8 列 */}
          <div className="lg:col-span-8 space-y-4">
            <PersonalWorkspaceCard
              state={personalState}
              workspace={personalWorkspace}
              onEnter={handleEnterWorkspace}
              onCreate={handleCreatePersonal}
              onRecreate={handleRecreatePersonal}
              onRename={(id) => router.push(`/workspace/${id}/settings`)}
              onReset={handleOpenResetPersonal}
              onDelete={handleDeleteUpgradedPersonal}
              onUpgrade={() => setShowUpgradeModal(true)}
              onViewEnterprise={() => {
                if (enterpriseWorkspace) {
                  handleEnterWorkspace(enterpriseWorkspace);
                } else {
                  router.push("/workspace-hub");
                }
              }}
              showUpgradeLink={quota ? quota.enterpriseCount < quota.maxEnterprise : false}
            />

            <EnterpriseWorkspaceList
              workspaces={enterpriseData?.workspaces || []}
              quota={quota}
              searchQuery={""}
              onSearchChange={() => {}}
              onCreateClick={() => setShowCreateEnterpriseModal(true)}
              onEnter={handleEnterWorkspace}
              onManage={(id) => router.push(`/workspace/${id}/members`)}
              onInvite={handleOpenShare}
              onManageComponents={(id) => router.push(`/workspace/${id}/components`)}
              onEnterpriseSettings={(id) => router.push(`/workspace/${id}/settings`)}
              onUpgradePackage={(id) => router.push(`/workspace/${id}/settings`)}
              onViewStats={(id) => router.push(`/workspace/${id}/stats`)}
              onDelete={handleDeleteWorkspace}
              onUpgrade={() => setShowUpgradeModal(true)}
            />

            <FeaturedComponents />
          </div>

          {/* 右侧边栏监控与操作：占 4 列 */}
          <div className="lg:col-span-4 space-y-4">
            <ResourceOverview user={user} dashboardData={dashboardData} quota={quota} />

            <QuickActions
              onJoinClick={() => setShowJoinModal(true)}
            />
          </div>
        </div>
      </main>

      {/* 8. 声明式挂载外部 Modals 组件 */}
      <CreateEnterpriseModal
        isOpen={showCreateEnterpriseModal}
        onClose={() => setShowCreateEnterpriseModal(false)}
        newEnterpriseName={newEnterpriseName}
        setNewEnterpriseName={setNewEnterpriseName}
        newEnterpriseEmail={newEnterpriseEmail}
        setNewEnterpriseEmail={setNewEnterpriseEmail}
        newEnterprisePhone={newEnterprisePhone}
        setNewEnterprisePhone={setNewEnterprisePhone}
        newEnterpriseTeamSize={newEnterpriseTeamSize}
        setNewEnterpriseTeamSize={setNewEnterpriseTeamSize}
        newEnterpriseDesc={newEnterpriseDesc}
        setNewEnterpriseDesc={setNewEnterpriseDesc}
        creatingEnterprise={creatingEnterprise}
        onCreate={handleCreateEnterprise}
      />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        personalWorkspace={personalWorkspace}
        quota={quota}
        onUpgradeSuccess={refresh}
      />

      <JoinEnterpriseModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        invitationCode={invitationCode}
        setInvitationCode={setInvitationCode}
        invitationInfo={invitationInfo}
        setInvitationInfo={setInvitationInfo}
        verifyingCode={verifyingCode}
        joiningCode={joiningCode}
        verifyInvitation={verifyInvitation}
        onJoin={handleJoinWorkspace}
      />

      <ShareWorkspaceModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        workspaces={workspaces}
        invitations={invitations}
        selectedWorkspace={selectedWorkspace}
        setSelectedWorkspace={setSelectedWorkspace}
        generating={generating}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        expiresInDays={expiresInDays}
        setExpiresInDays={setExpiresInDays}
        copiedCode={copiedCode}
        handleGenerateInvitation={handleGenerateInvitation}
        handleCopyCode={handleCopyCode}
        handleCopyLink={handleCopyLink}
        handleCopyInvitation={handleCopyInvitation}
      />

      {/* 注销协作空间确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteModal && deleteCheckResult}
        title="注销空间确认"
        confirmWord="确认注销"
        warnings={deleteCheckResult?.warnings || []}
        workspaceName={deleteCheckResult?.workspace?.name}
        workspaceMeta={`成员数：${deleteCheckResult?.workspace?.memberCount || 0}人 | 组件数：${deleteCheckResult?.workspace?.componentCount || 0}个`}
        isLoading={deletingWorkspaceId !== null}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        onConfirm={() => confirmDeleteWorkspace()}
        onCancel={cancelDeleteWorkspace}
      />

      {/* 注销个人工作空间确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirmModal}
        title="注销个人空间确认"
        confirmWord="确认注销"
        warnings={[
          "个人空间将被物理注销并删除所有数据，此操作不可逆",
          "空间下的全部组件研发资产和环境备份将被永久清空",
          "注销后您可以随时在控制台重新创建一个全新的干净开发沙箱",
        ]}
        workspaceName={personalWorkspace?.name || "个人工作空间"}
        workspaceMeta={`组件数：${personalWorkspace?.componentCount || 0}个`}
        isLoading={deleting}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        onConfirm={() => confirmDeleteUpgradedPersonal()}
        onCancel={() => {
          setShowDeleteConfirmModal(false);
          setDeleteConfirmText("");
        }}
      />

      {/* 一键重置个人空间数据确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showPersonalResetModal}
        title="重置个人空间数据"
        confirmWord="确认重置"
        warnings={[
          "个人空间数据将被清空，并自动为您重新开辟一个干净的全新沙箱环境",
          "个人空间内的所有组件、研发存档将被物理抹除且无法恢复",
          "当前绑定的协作企业空间将不受任何影响，您可以照常使用",
        ]}
        workspaceName={personalWorkspace?.name || "个人工作空间"}
        workspaceMeta={`组件数：${personalWorkspace?.componentCount || 0}个`}
        isLoading={resetting}
        deleteConfirmText={resetConfirmText}
        setDeleteConfirmText={setResetConfirmText}
        onConfirm={() => handleConfirmResetPersonal()}
        onCancel={() => {
          setShowPersonalResetModal(false);
          setResetConfirmText("");
        }}
      />

      {/* 9. 二次身份验证 Step-Up 弹窗 */}
      <StepUpAuthModal
        isOpen={showStepUpModal}
        title="注销空间安全验证"
        message="物理注销或重置为高危操作，需要验证您的登录密码以确认身份。"
        action="delete_workspace"
        onConfirm={(token) => {
          setShowStepUpModal(false);
          if (stepUpPurpose === "delete_workspace") {
            confirmDeleteWorkspace(token);
          } else if (stepUpPurpose === "delete_upgraded_personal") {
            confirmDeleteUpgradedPersonal(token);
          } else if (stepUpPurpose as any === "reset_personal") {
            handleConfirmResetPersonal(token);
          }
          setStepUpPurpose(null);
        }}
        onCancel={() => {
          setShowStepUpModal(false);
          setStepUpPurpose(null);
        }}
      />
    </div>
  );
}
