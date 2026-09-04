"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

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
import QuotaUpgradeModal, { type UpgradeHighlight } from "@/components/workspace-hub/modals/QuotaUpgradeModal";
import { DissolveWorkspaceCheckModal } from "@/components/workspace/DissolveWorkspaceCheckModal";
import { DissolvePersonalWorkspaceModal } from "@/components/workspace/DissolvePersonalWorkspaceModal";
import { ResetPersonalWorkspaceModal } from "@/components/workspace/ResetPersonalWorkspaceModal";
import Footer from "@/components/Footer";
import { ShieldCheck, X } from "lucide-react";

export default function WorkspaceHub() {
  const router = useRouter();
  const toast = useToast();

  // 1. 数据状态与加载 Hook
  const {
    user,
    personalWorkspace,
    setPersonalWorkspace,
    enterpriseWorkspace,
    enterpriseData,
    quota,
    usageStats,
    dashboardData,
    personalState,
    isLoading,
    needsPersonalWorkspace,
    redirecting,
    refresh,
  } = useWorkspaceHubData();

  const [enterpriseSearchQuery, setEnterpriseSearchQuery] = useState("");
  const [dissolveCheckWorkspace, setDissolveCheckWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [dissolvePersonalWorkspace, setDissolvePersonalWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [showResetPersonalWorkspaceModal, setShowResetPersonalWorkspaceModal] = useState(false);

  // 第三方登录用户安全绑定横幅（弹窗由全局 OAuthProfilePrompt 统一接管）
  const [showSecurityBanner, setShowSecurityBanner] = useState(true);

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

  const [hubDetailComp, setHubDetailComp] = useState<any | null>(null);

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
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQuotaUpgradeModal, setShowQuotaUpgradeModal] = useState(false);
  // 唤起升级中枢时锚定的权益维度（由触发入口决定，用于高亮对应权益行）
  const [upgradeHighlight, setUpgradeHighlight] = useState<UpgradeHighlight>(null);

  /** 统一升级中枢入口：记录触发场景后打开中枢 */
  const openUpgradeHub = (highlight: UpgradeHighlight) => {
    setUpgradeHighlight(highlight);
    setShowQuotaUpgradeModal(true);
  };

  // 真正个人工作空间一键重置相关状态
  const [showPersonalResetModal, setShowPersonalResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  // 协同成员退出空间数据检测与安全确认状态
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [leavingWorkspaceId, setLeavingWorkspaceId] = useState<string | null>(null);
  const [leavingWorkspaceName, setLeavingWorkspaceName] = useState("");
  const [memberDataStats, setMemberDataStats] = useState<{ taskCount: number; assetCount: number } | null>(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [scanningStats, setScanningStats] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // 额外前端状态定义 (2.0/2.1 视觉收敛)
  const [showSelectWorkspaceModal, setShowSelectWorkspaceModal] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [boundStatus, setBoundStatus] = useState<Record<string, boolean>>({});
  const [componentWorkspaceBoundNames, setComponentWorkspaceBoundNames] = useState<Record<string, string[]>>({});

  // 监听选中推荐组件以装配时，静默拉取每个空间是否已绑定该组件的状态
  useEffect(() => {
    async function checkBindings() {
      if (!showSelectWorkspaceModal || !selectedComponentId) return;
      const status: Record<string, boolean> = {};
      
      if (enterpriseData?.workspaces) {
        await Promise.all(
          enterpriseData.workspaces.map(async (ws: any) => {
            try {
              const checkRes = await fetch(`/api/studio?action=bound&workspaceId=${ws.id}`);
              if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.success) {
                  const boundIds: string[] = checkData.data || [];
                  if (boundIds.includes(selectedComponentId)) {
                    status[ws.id] = true;
                  }
                }
              }
            } catch (e) {
              console.error(e);
            }
          })
        );
      }
      setBoundStatus(status);
    }
    checkBindings();
  }, [showSelectWorkspaceModal, selectedComponentId, enterpriseData]);

  // 监听加入成功弹窗开启状态，设置定时器实现 4 秒后自动隐去消失 (契合用户对自动隐去描述的要求)
  useEffect(() => {
    if (showJoinSuccessModal) {
      const timer = setTimeout(() => {
        setShowJoinSuccessModal(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [showJoinSuccessModal, setShowJoinSuccessModal]);

  // 动态获取当前中枢渲染展示的推荐组件ID列表（数据来自数据库 30 天真实调用聚合，无数据时为空）
  const getRecommendedComponentIds = () => {
    if (dashboardData?.topComponents && dashboardData.topComponents.length > 0) {
      return dashboardData.topComponents.slice(0, 3).map((item: any) => item.id || item.componentId);
    }
    return [];
  };

  // 页面加载或空间数据变化时，拉取当前正在展示的 3 个推荐组件的所有已绑定空间名称列表
  useEffect(() => {
    async function fetchAllWorkspaceBindings() {
      const workspaces: Array<{ id: string; name: string; type: string }> = [];
      if (personalWorkspace) {
        workspaces.push({ id: personalWorkspace.id, name: personalWorkspace.name, type: "PERSONAL" });
      }
      if (enterpriseData?.workspaces) {
        workspaces.push(...enterpriseData.workspaces.map((w: any) => ({ id: w.id, name: w.name, type: "ENTERPRISE" })));
      }
      
      if (workspaces.length === 0) return;
      
      const bindingNames: Record<string, string[]> = {};
      const targetComponentIds = getRecommendedComponentIds();
      
      await Promise.all(
        workspaces.map(async (ws) => {
          // 个人空间拥有所有权限，默认接入所有推荐组件
          if (ws.type === "PERSONAL") {
            targetComponentIds.forEach((cId: string) => {
              if (!bindingNames[cId]) bindingNames[cId] = [];
              bindingNames[cId].push(ws.name);
            });
            return;
          }
          
          try {
            const checkRes = await fetch(`/api/studio?action=bound&workspaceId=${ws.id}`);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.success) {
                const boundIds: string[] = checkData.data || [];
                boundIds.forEach((cId) => {
                  if (targetComponentIds.includes(cId)) {
                    if (!bindingNames[cId]) bindingNames[cId] = [];
                    bindingNames[cId].push(ws.name);
                  }
                });
              }
            }
          } catch (e) {
            console.error(e);
          }
        })
      );
      
      setComponentWorkspaceBoundNames(bindingNames);
    }
    
    fetchAllWorkspaceBindings();
  }, [personalWorkspace, enterpriseData, dashboardData]);

  // 7. 进入空间跳转与包装 (升级为无缝即时物理跳转)
  const handleEnterWorkspace = (workspace: any) => {
    if (workspace && workspace.id) {
      toast.info("正在进入工作空间...", 600);
      try {
        localStorage.setItem("currentWorkspaceId", workspace.id);
        sessionStorage.setItem("currentWorkspaceId", workspace.id);
      } catch (e) {
        console.error("写入空间缓存失败:", e);
      }
      window.location.href = `/workspace/${workspace.id}`;
    } else {
      window.location.href = "/workspace-hub/create";
    }
  };

  // 智能路由分流：统一执行真实后端物理装配，装配成功后带上 newBoundComponentId 触发高亮跳转
  const navigateToWorkspaceComponent = async (workspaceId: string, type: "PERSONAL" | "ENTERPRISE", componentId: string) => {
    toast.info("正在装配组件并连接环境...", 1000);
    
    try {
      // 1. 检查是否已经绑定
      const checkRes = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`);
      let isAlreadyBound = false;
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.success) {
          const boundIds: string[] = checkData.data || [];
          if (boundIds.includes(componentId)) {
            isAlreadyBound = true;
          }
        }
      }

      if (!isAlreadyBound) {
        // 2. 发送绑定请求进行真实物理装配
        const bindRes = await fetch("/api/studio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "bind",
            workspaceId,
            componentId,
          }),
        });

        if (bindRes.ok) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("zhige_workspace_components_updated", { detail: { workspaceId, componentId, action: "bind" } }));
          }
        } else {
          const bindData = await bindRes.json();
          throw new Error(bindData.error || bindData.message || "装配组件失败");
        }
      }

      // 跳转并携带最新装配组件 ID 与精确目标空间 ID
      router.push(`/workspace/${workspaceId}?newBoundComponentId=${componentId}&boundTargetWs=${workspaceId}`);
      toast.success("组件装配成功，已就位！");
    } catch (err: any) {
      console.error("装配组件失败:", err);
      toast.error(err.message || "装配组件失败，请重试");
    }
  };

  const handleOpenShare = async (id?: string) => {
    if (id) setSelectedWorkspace(id);
    setShowShareModal(true);
    await loadShareableWorkspaces();
  };

  const handleOpenResetPersonal = () => {
    setShowResetPersonalWorkspaceModal(true);
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

      // 1. 获取个人空间 ID
      const workspacesRes = await fetch("/api/workspace/list");

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
        toast.success("个人空间数据已成功重置为出厂状态");
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

  // 跨空间组件装配引导逻辑
  const handleComponentClick = (componentId: string) => {
    const targetId = personalWorkspace?.id;
    if (targetId && (!enterpriseData?.workspaces || enterpriseData.workspaces.length === 0)) {
      // 只有个人空间，直接安装
      navigateToWorkspaceComponent(targetId, "PERSONAL", componentId);
      return;
    }

    const allWorkspaces: any[] = [];
    if (personalWorkspace) {
      allWorkspaces.push({ ...personalWorkspace, type: "PERSONAL" });
    }
    if (enterpriseData?.workspaces) {
      allWorkspaces.push(...enterpriseData.workspaces.map((w: any) => ({ ...w, type: "ENTERPRISE" })));
    }

    if (allWorkspaces.length === 0) {
      toast.error("您当前暂无可用空间，请先开辟或加入空间");
      return;
    }

    // 如果只有一个空间，调用智能装配跳转分流函数
    if (allWorkspaces.length === 1) {
      navigateToWorkspaceComponent(allWorkspaces[0].id, allWorkspaces[0].type, componentId);
      return;
    }

    // 拥有多个空间时（不论单空间已配或全空间已配），均弹出目标空间选择弹窗，供用户自由选择前往或装配
    setSelectedComponentId(componentId);
    setShowSelectWorkspaceModal(true);
  };

  // 高危企业空间解散数据前置校验与合规审计弹窗逻辑
  const handleWorkspaceDeleteClick = (workspaceId: string) => {
    const workspace = enterpriseData?.workspaces?.find((ws: any) => ws.id === workspaceId);
    setDissolveCheckWorkspace({
      id: workspaceId,
      name: workspace?.name || "企业空间",
    });
  };

  const handleDissolveCheckPassed = (workspaceId: string) => {
    setDissolveCheckWorkspace(null);
    handleDeleteWorkspace(workspaceId);
  };

  // 个人空间注销数据前置校验与沙箱检测弹窗逻辑
  const handlePersonalDeleteClick = (workspaceId: string) => {
    const wsName = personalWorkspace?.name || "个人开发沙箱";
    setDissolvePersonalWorkspace({
      id: workspaceId,
      name: wsName,
    });
  };

  const handleDissolvePersonalPassed = (workspaceId: string) => {
    setDissolvePersonalWorkspace(null);
    handleDeleteWorkspace(workspaceId);
  };

  // 协同成员退出空间数据盘点与安全防爆破确认逻辑 (退群审计)
  const handleLeaveWorkspaceClick = async (workspaceId: string) => {
    const workspace = enterpriseData?.workspaces?.find((ws: any) => ws.id === workspaceId);
    if (!workspace) return;

    setLeavingWorkspaceId(workspaceId);
    setLeavingWorkspaceName(workspace.name);
    setShowLeaveConfirmModal(true);
    setScanningStats(true);
    setScanProgress(0);

    // 启动模拟的扫描进度条动画 (为了体感真实的检测过程，时长共 1.2 秒)
    let progress = 0;
    const progressTimer = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(progressTimer);
      }
      setScanProgress(progress);
    }, 100);

    try {
      const authToken = localStorage.getItem("auth_token");
      const startTime = Date.now();
      
      // 真实请求后端盘点接口
      const res = await fetch(`/api/workspace/member-stats?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.success && resData.stats) {
          // 为了确保用户能看清扫描过程，至少停留 1.2 秒
          const elapsedTime = Date.now() - startTime;
          const waitTime = Math.max(1200 - elapsedTime, 0);
          
          setTimeout(() => {
            clearInterval(progressTimer);
            setScanProgress(100);
            setMemberDataStats(resData.stats);
            setScanningStats(false);
          }, waitTime);
          return;
        }
      }
      // 降级防崩溃
      setTimeout(() => {
        clearInterval(progressTimer);
        setScanProgress(100);
        setMemberDataStats({ taskCount: 0, assetCount: 0 });
        setScanningStats(false);
      }, 1200);
    } catch (error) {
      console.error("加载退出空间盘点数据失败:", error);
      setTimeout(() => {
        clearInterval(progressTimer);
        setScanProgress(100);
        setMemberDataStats({ taskCount: 0, assetCount: 0 });
        setScanningStats(false);
      }, 1200);
    }
  };

  // 调用后端 API 退出协作空间
  const handleConfirmLeaveWorkspace = async () => {
    if (!leavingWorkspaceId) return;
    setSubmittingLeave(true);
    try {
      const authToken = localStorage.getItem("auth_token");
      const res = await fetch("/api/workspace/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ workspaceId: leavingWorkspaceId }),
      });

      if (res.ok) {
        toast.success(`您已成功退出 “${leavingWorkspaceName}” 协作空间`);
        setShowLeaveConfirmModal(false);
        refresh();
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || errorData.message || "退出空间失败，请稍后重试");
      }
    } catch (error) {
      console.error("退出空间异常:", error);
      toast.error("退出空间失败");
    } finally {
      setSubmittingLeave(false);
    }
  };

  // 计算智能默认工作空间 (个人空间优先；无个人空间时指向最早加入的企业空间)
  const defaultWorkspace = personalWorkspace || (enterpriseData?.workspaces && enterpriseData.workspaces[0]);
  const hasWorkspace = !!defaultWorkspace;

  if (isLoading) {
    return <PageSkeleton />;
  }

  // 装配弹窗：被选中组件的信息（编号 + 名称）
  const selectedCompInfo = (() => {
    if (!selectedComponentId) return null;
    const item = (dashboardData?.topComponents || []).find(
      (c: any) => (c.id || c.componentId) === selectedComponentId
    );
    return {
      id: item?.id || item?.componentId || selectedComponentId,
      name: item?.name || "",
    };
  })();

  if (redirecting) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-slate-600">正在跳转到登录页面...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* 背景效果 (系统浅蓝底纹，单一主色光晕，保持克制不喧宾夺主) */}
      <div className="absolute inset-0 bg-[#f0f8ff] pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#3182ce]/[0.05] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-[#3182ce]/[0.03] rounded-full blur-[120px]" />
      </div>

      {/* 主核心区 (统一全站大厂 max-w-[1400px] 黄金标准，两侧留白与组件大厅、文档中心 100% 物理对齐) */}
      <main className="relative z-10 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-8 pt-8 pb-0 space-y-6 flex-1">
        
        {/* 0. 第三方登录用户未设密码与绑定全局安全建议横幅 */}
        {showSecurityBanner && user?.needsProfileCompletion && (
          <div className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-50/95 via-amber-50/80 to-orange-50/70 border border-amber-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start md:items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100/90 border border-amber-300/60 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-xs font-black text-amber-900 flex items-center gap-2">
                  <span>账号安全绑定与独立密码设置建议</span>
                  <span className="text-[10px] font-bold bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded-full font-mono">
                    第三方快捷登录提醒
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                  您当前使用第三方账号（微信/QQ等）登录。<strong>若不设置专属账号密码及绑定手机/邮箱，后续在其他浏览器或移动设备上将无法通过账号密码直接登录</strong>。建议您立即设置专属登录凭证。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
              <button
                type="button"
                onClick={() => router.push("/user/security")}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>立即设置专属账号密码</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSecurityBanner(false)}
                className="p-2 text-amber-600 hover:text-amber-900 hover:bg-amber-100/60 rounded-xl transition-colors cursor-pointer"
                title="稍后提醒"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 1. UserGreeting (100% 宽度大顶通栏) */}
        <div className="w-full">
          <UserGreeting 
            user={user} 
            personalWorkspace={defaultWorkspace}
            needsPersonalWorkspace={!hasWorkspace}
            onEnterPersonal={() => handleEnterWorkspace(defaultWorkspace)}
            onCreatePersonal={handleCreatePersonal}
          />
        </div>

        {/* 待处理邀请 */}
        <PendingSection
          pendingItems={dashboardData?.pendingItems}
          onAcceptInvitation={(code) => {
            setInvitationCode(code);
            setShowJoinModal(true);
            verifyInvitation(code);
          }}
        />

        {/* 2. 中间黄金 Bento 双栏 (左 70% 占 7 列，右 30% 占 3 列) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
          {/* 左侧栏 (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            <PersonalWorkspaceCard
              state={personalState}
              workspace={personalWorkspace}
              onEnter={handleEnterWorkspace}
              onCreate={handleCreatePersonal}
              onRecreate={handleRecreatePersonal}
              onRename={(id) => router.push(`/workspace/${id}?tab=settings`)}
              onReset={handleOpenResetPersonal}
              onDelete={handlePersonalDeleteClick}
              onUpgrade={() => setShowUpgradeModal(true)}
              onViewEnterprise={() => {
                if (enterpriseWorkspace) {
                  handleEnterWorkspace(enterpriseWorkspace);
                } else {
                  router.push("/workspace-hub");
                }
              }}
              showUpgradeLink={quota ? (enterpriseData?.workspaces || []).filter((ws: any) => ws.role === "OWNER" || ws.isOwner).length < quota.maxEnterprise : false}
            />

            <EnterpriseWorkspaceList
              workspaces={enterpriseData?.workspaces || []}
              quota={quota ? { ...quota, enterpriseCount: (enterpriseData?.workspaces || []).filter((ws: any) => ws.role === "OWNER" || ws.isOwner).length } : null}
              statistics={enterpriseData?.statistics}
              searchQuery={enterpriseSearchQuery}
              onSearchChange={setEnterpriseSearchQuery}
              onCreateClick={() => setShowCreateEnterpriseModal(true)}
              onEnter={handleEnterWorkspace}
              onManage={(id) => router.push(`/workspace/${id}?tab=members`)}
              onInvite={handleOpenShare}
              onManageComponents={(id) => router.push(`/studio?workspaceId=${id}`)}
              onEnterpriseSettings={(id) => router.push(`/workspace/${id}?tab=settings`)}
              onUpgradePackage={(id) => router.push(`/user/billing-center?workspaceId=${id}`)}
              onViewStats={(id) => router.push(`/workspace/${id}/stats`)}
              onDelete={handleWorkspaceDeleteClick}
              onLeave={handleLeaveWorkspaceClick}
              onUpgrade={openUpgradeHub}
              onJoinClick={() => setShowJoinModal(true)}
            />
          </div>

          {/* 右侧边栏 (lg:col-span-3 - 快捷工具与资源额度垂直排列，高度完美咬合左侧) */}
          <div className="lg:col-span-3 space-y-6">
            <QuickActions
              onJoinClick={() => setShowJoinModal(true)}
            />
            
            <ResourceOverview
              user={user}
              dashboardData={dashboardData}
              quota={quota}
              onUpgrade={openUpgradeHub}
            />
          </div>
        </div>

        {/* 3. 推荐组件 (100% 宽度大底通栏，完美横向平铺渲染，杜绝任何空白) */}
        <div className="w-full pt-4 border-t border-slate-200/50">
          <FeaturedComponents 
            topComponents={dashboardData?.topComponents}
            onComponentClick={handleComponentClick}
            boundNames={componentWorkspaceBoundNames}
            onViewDetail={(comp) => setHubDetailComp(comp)}
          />
        </div>
      </main>

      <Footer />

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
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        expiresInDays={expiresInDays}
        setExpiresInDays={setExpiresInDays}
        copiedCode={copiedCode}
        handleGenerateInvitation={handleGenerateInvitation}
        handleCopyCode={handleCopyCode}
        handleCopyLink={handleCopyLink}
        handleCopyInvitation={handleCopyInvitation}
        onDeleteInvitation={handleDeleteInvitation}
        onRevokeInvitation={handleRevokeInvitation}
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

      {/* 注销个人空间确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirmModal}
        title="注销个人空间确认"
        confirmWord="确认注销"
        warnings={[
          "个人空间将被物理注销并删除所有数据，此操作不可逆",
          "空间下的全部组件研发资产 and 环境备份将被永久清空",
          "注销后您可以随时在控制台重新创建一个全新的干净开发沙箱",
        ]}
        workspaceName={personalWorkspace?.name || "个人空间"}
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
        workspaceName={personalWorkspace?.name || "个人空间"}
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

      {/* 二次身份验证 Step-Up 弹窗 */}
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

      {/* 选择空间装配弹窗 */}
      {showSelectWorkspaceModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] border border-slate-100 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)] max-w-sm w-full p-6 text-left animate-in fade-in zoom-in-95 duration-200 relative">
            {/* 右上角关闭按钮 */}
            <button
              onClick={() => {
                setShowSelectWorkspaceModal(false);
                setSelectedComponentId(null);
              }}
              className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all border-none bg-transparent cursor-pointer"
              title="关闭"
            >
              ✕
            </button>

            <h3 className="text-sm font-extrabold text-slate-800 mb-2.5 flex items-center gap-1.5">
              <span>选择装配的目标空间</span>
            </h3>
            
            {selectedCompInfo && (
              <div className="mb-4 px-3 py-2.5 bg-blue-50/70 border border-blue-100/90 rounded-xl flex items-center gap-2 text-xs">
                <span className="font-mono font-black text-[#2b6cb0] shrink-0 bg-white/80 px-1.5 py-0.5 rounded border border-blue-200/60 shadow-2xs">
                  {selectedCompInfo.id}
                </span>
                <span className="font-bold text-slate-700 truncate">{selectedCompInfo.name || "组件"}</span>
              </div>
            )}
            
            <p className="text-xs text-slate-400 font-semibold mb-4 leading-normal">请选择要将该组件装配并运行的目标空间环境：</p>
            
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {/* 个人空间 */}
              {personalWorkspace && (
                <button
                  onClick={() => {
                    setShowSelectWorkspaceModal(false);
                    navigateToWorkspaceComponent(personalWorkspace.id, "PERSONAL", selectedComponentId!);
                  }}
                  className="w-full p-3.5 text-left border border-slate-200/60 hover:border-[#2b6cb0] hover:bg-blue-50/30 rounded-xl flex items-center justify-between transition-all duration-150 group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-700 block leading-none">{personalWorkspace.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100/80 rounded font-black shrink-0 leading-none flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                        已装载
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-semibold block mt-1.5 leading-none flex items-center gap-1">
                      <span>👤</span> 个人空间
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[#2b6cb0] transition-transform group-hover:translate-x-0.5">
                    直接前往 ➔
                  </span>
                </button>
              )}
              
              {/* 企业空间 */}
              {enterpriseData?.workspaces?.map((ws: any) => {
                const isBound = boundStatus[ws.id] || false;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setShowSelectWorkspaceModal(false);
                      navigateToWorkspaceComponent(ws.id, "ENTERPRISE", selectedComponentId!);
                    }}
                    className="w-full p-3.5 text-left border border-slate-200/60 hover:border-[#2b6cb0] hover:bg-blue-50/30 rounded-xl flex items-center justify-between transition-all duration-150 group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-700 block leading-none">{ws.name}</span>
                        {isBound && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100/80 rounded font-black shrink-0 leading-none flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                            已装载
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-semibold block mt-1.5 leading-none flex items-center gap-1">
                        <span>🏢</span> 企业空间
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#2b6cb0] transition-transform group-hover:translate-x-0.5">
                      {isBound ? "直接前往 ➔" : "装配 ➔"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowSelectWorkspaceModal(false);
                  setSelectedComponentId(null);
                }}
                className="zg-btn zg-btn-default px-4 h-[38px] text-sm font-semibold border-none rounded-lg cursor-pointer transition-all bg-slate-100 hover:bg-slate-200 text-slate-500 shadow-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 统一升级中枢：按触发场景锚定高亮权益维度 */}
      <QuotaUpgradeModal
        isOpen={showQuotaUpgradeModal}
        onClose={() => setShowQuotaUpgradeModal(false)}
        currentLevel={user?.membershipLevel || "FREE"}
        currentCount={quota?.enterpriseCount || 0}
        maxLimit={quota?.maxEnterprise || 1}
        highlight={upgradeHighlight}
      />

      {/* 恭喜加入空间成功弹窗 (仪式感极客 Onboarding) */}
      {showJoinSuccessModal && joinedWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] border border-white/90 shadow-2xl max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              ✓
            </div>
            
            <h3 className="text-base font-black text-slate-800 mb-2">加入工作空间成功</h3>
            
            <p className="text-xs text-slate-500 font-medium leading-relaxed px-2">
              恭喜您已成功加入 <strong className="text-emerald-600 font-extrabold">{joinedWorkspace.name}</strong> 工作空间，快去进行使用吧！
            </p>
            <span className="text-[10px] text-slate-400 block mt-2 font-semibold">( 本提示将在数秒后自动隐去 )</span>
            
            <div className="flex flex-col gap-2 mt-6 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowJoinSuccessModal(false);
                  router.push(`/workspace/${joinedWorkspace.id}`);
                }}
                className="w-full h-10 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                立即进入工作空间
              </button>
              
              <button
                onClick={() => setShowJoinSuccessModal(false)}
                className="w-full h-9 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                留在当前页面
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 成员退出协作空间前置审计确认弹窗 (SaaS大厂风范) */}
      {showLeaveConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] border border-white/90 shadow-2xl max-w-sm w-full p-6 text-left animate-in fade-in zoom-in-95 duration-200">
            {scanningStats ? (
              // 1. 正在检测过程的动态扫描面板 (科技感极强)
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100 animate-pulse" />
                  <div className="absolute inset-0 rounded-full border-4 border-[#2b6cb0] border-t-transparent animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-[#2b6cb0]">
                    {scanProgress}%
                  </span>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-800">系统正在深度审计中</h3>
                  <p className="text-[11px] text-slate-400 font-semibold animate-pulse">
                    {scanProgress < 30 ? "正在检索任务队列..." : scanProgress < 75 ? "正在统计已上传组件材料..." : "正在完成安全归档校对..."}
                  </p>
                </div>

                {/* 科技感进度条 */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#4299e1] to-[#2b6cb0] transition-all duration-150 rounded-full" 
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            ) : memberDataStats ? (
              // 2. 真实审计结果展示面板 (真实从数据库拉取)
              <>
                <h3 className="text-sm font-extrabold text-slate-800 mb-2">确认退出该协作空间？</h3>
                <p className="text-xs text-slate-400 font-semibold mb-4 leading-relaxed">
                  您当前正在申请退出 <strong className="text-slate-700 font-bold">“{leavingWorkspaceName}”</strong> 团队协作空间。系统检测到您在该空间下沉淀了以下个人研发资产：
                </p>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">已执行的效能任务</span>
                    <span className="text-slate-800 font-mono font-bold">{memberDataStats.taskCount} 条</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">已上传的组件材料</span>
                    <span className="text-slate-800 font-mono font-bold">{memberDataStats.assetCount} 份</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-600 font-medium leading-relaxed mb-5">
                  ⚠️ <strong>安全提示：</strong>退出空间后，您将无法再访问和管理此空间。您在此空间产生的上述所有任务报告与关联数据将作为企业总数据<strong>安全留存归档</strong>，不会被物理删除。
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setShowLeaveConfirmModal(false);
                      setLeavingWorkspaceId(null);
                    }}
                    className="px-4 h-[38px] text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg cursor-pointer transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmLeaveWorkspace}
                    disabled={submittingLeave}
                    className="px-4.5 h-[38px] text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {submittingLeave ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>确认退出</span>
                    )}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* 企业空间解散合规检测前置弹窗 */}
      {dissolveCheckWorkspace && (
        <DissolveWorkspaceCheckModal
          isOpen={!!dissolveCheckWorkspace}
          workspaceId={dissolveCheckWorkspace.id}
          workspaceName={dissolveCheckWorkspace.name}
          onClose={() => setDissolveCheckWorkspace(null)}
          onPassed={handleDissolveCheckPassed}
        />
      )}

      {/* 个人空间注销合规检测前置弹窗 */}
      {dissolvePersonalWorkspace && (
        <DissolvePersonalWorkspaceModal
          isOpen={!!dissolvePersonalWorkspace}
          workspaceId={dissolvePersonalWorkspace.id}
          workspaceName={dissolvePersonalWorkspace.name}
          onClose={() => setDissolvePersonalWorkspace(null)}
          onPassed={handleDissolvePersonalPassed}
        />
      )}

      {/* 个人空间重置前置盘点与真实复位 Modal */}
      {showResetPersonalWorkspaceModal && personalWorkspace && (
        <ResetPersonalWorkspaceModal
          isOpen={showResetPersonalWorkspaceModal}
          workspaceId={personalWorkspace.id}
          workspaceName={personalWorkspace.name}
          onClose={() => setShowResetPersonalWorkspaceModal(false)}
          onSuccess={() => {
            refresh();
          }}
        />
      )}

      {/* 推荐组件权威详情 Modal */}
      {hubDetailComp && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-white/90 overflow-hidden animate-in zoom-in-95 duration-200 text-left">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold text-sm border border-blue-100 shadow-2xs">
                  {hubDetailComp.id?.slice(0, 4)}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-slate-500">{hubDetailComp.id}</div>
                  <div className="text-sm font-black text-slate-900">{hubDetailComp.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHubDetailComp(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件简介</div>
                <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{hubDetailComp.description}</div>
              </div>

              {hubDetailComp.detail && (
                <>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">深度功能解读</div>
                    <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{hubDetailComp.detail.fullDescription}</div>
                  </div>
                  {hubDetailComp.detail.usage && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">使用操作指南</div>
                      <div className="space-y-1">
                        {String(hubDetailComp.detail.usage).split("\n").filter(Boolean).map((line: string, i: number) => (
                          <p key={i} className="text-xs font-medium text-slate-600 leading-relaxed">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {hubDetailComp.detail.apiDoc && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">API 接口契约</div>
                      <pre className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-lg text-[11px] text-slate-700 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                        {hubDetailComp.detail.apiDoc}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {hubDetailComp.tags?.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">核心领域标签</div>
                  <div className="flex flex-wrap gap-1.5">
                    {hubDetailComp.tags.map((tag: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <span className="text-[11px] text-slate-400 font-bold">按组件矩阵标准成本扣减（预估 5 点）</span>
              <button
                type="button"
                onClick={() => setHubDetailComp(null)}
                className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-xs"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
