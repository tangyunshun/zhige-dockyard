"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  User,
  Settings,
  Users,
  Plus,
  ArrowRight,
  ChevronRight,
  HardDrive,
  FileText,
  GitBranch,
  Zap,
  Database,
  BarChart3,
  LogOut,
  Shield,
  Crown,
  Sparkles,
} from "lucide-react";
import { COMPONENTS, COMPONENT_CATEGORIES, getComponentsByCategory, ComponentCategory } from "@/constants/components";
import UpgradeModal from "@/components/UpgradeModal";
import { useToast } from "@/components/Toast";

interface QuotaData {
  enterpriseSlots: number;
  usedEnterpriseSlots: number;
  availableEnterpriseSlots: number;
  maxTeamSize: number;
  maxStorage: number;
  maxApiCalls: number;
  tokenBalance: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  role: string;
}

interface AggregatedStats {
  totalProjects: number;
  totalDocuments: number;
  totalDiagrams: number;
  totalTokenBalance: number;
  totalStorageUsed: number;
  totalStorageLimit: number;
}

interface HubData {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    membershipLevel: string;
  };
  quotas: QuotaData;
  workspaces: {
    personal: WorkspaceInfo[];
    enterprise: WorkspaceInfo[];
  };
  aggregatedStats: AggregatedStats;
}

export default function WorkspaceHubPage() {
  const router = useRouter();
  const toast = useToast();
  const [hubData, setHubData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPersonalWorkspace, setSelectedPersonalWorkspace] = useState<string | null>(null);

  const fetchHubData = useCallback(async () => {
    try {
      const response = await fetch("/api/user/workspace-hub/quota", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("获取工作空间信息失败");
      }

      const data = await response.json();
      if (data.success) {
        setHubData(data.data);
      } else {
        throw new Error(data.error || "获取工作空间信息失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 处理个人空间升级
  const handleUpgradePersonalSpace = () => {
    if (hubData?.workspaces.personal && hubData.workspaces.personal.length > 0) {
      setSelectedPersonalWorkspace(hubData.workspaces.personal[0].id);
      setShowUpgradeModal(true);
    }
  };

  // 确认升级
  const handleConfirmUpgrade = async (mode: "migrate" | "parallel" | "replace") => {
    if (!selectedPersonalWorkspace) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/workspace/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          personalWorkspaceId: selectedPersonalWorkspace,
          mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || "升级成功");
        setShowUpgradeModal(false);
        fetchHubData();
      } else {
        const error = await res.json();
        toast.error(error.error || "升级失败");
      }
    } catch (err) {
      console.error("Upgrade error:", err);
      toast.error("升级失败，请重试");
    }
  };

  const storagePercentage = hubData
    ? Math.min(100, (hubData.aggregatedStats.totalStorageUsed / hubData.aggregatedStats.totalStorageLimit) * 100)
    : 0;

  const isVip = hubData?.user.membershipLevel !== "FREE";
  const canCreateEnterprise = (hubData?.quotas.availableEnterpriseSlots || 0) > 0;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50/50">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">加载失败</h3>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={fetchHubData}
            className="zg-btn zg-btn-primary px-6"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/50">
      {/* 顶部导航栏 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => router.push("/user/dashboard")}
              className="text-slate-500 hover:text-[#3182ce] font-medium transition-colors"
            >
              工作台
            </button>
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <span className="text-slate-800 font-bold">空间中枢</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* 用户欢迎区 */}
        <div className="bg-gradient-to-r from-[#3182ce]/5 to-[#2b6cb0]/5 rounded-2xl p-6 border border-[#3182ce]/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#3182ce]/20">
                {hubData?.user.name?.charAt(0) || "U"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-800">
                    欢迎回来，{hubData?.user.name || "用户"}
                  </h2>
                  {isVip && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-full shadow-sm">
                      <Crown className="w-3 h-3" />
                      VIP
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  {hubData?.user.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-500 font-medium">当前会员等级</div>
                <div className="text-sm font-bold text-slate-800">
                  {hubData?.user.membershipLevel === "FREE" ? "免费版" : 
                   hubData?.user.membershipLevel === "PRO" ? "专业版" : "企业版"}
                </div>
              </div>
              {!isVip && (
                <button
                  onClick={() => router.push("/user/membership")}
                  className="zg-btn zg-btn-primary px-4 py-2 text-sm"
                >
                  升级会员
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4-Card 架构：空间控制卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 卡片 A: 进入个人空间 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:border-[#3182ce]/30 hover:shadow-md transition-all duration-300 group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <User className="w-6 h-6 text-slate-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-[#3182ce] group-hover:translate-x-1 transition-all duration-300" />
            </div>
            <h3 className="font-bold text-slate-800 mb-2">个人空间</h3>
            <p className="text-sm text-slate-500 mb-4">
              私密沙盒，数据绝对隔离，不支持团队协作
            </p>
            {hubData?.workspaces.personal && hubData.workspaces.personal.length > 0 ? (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const workspaceId = hubData.workspaces.personal[0].id;
                    localStorage.setItem("currentWorkspaceId", workspaceId);
                    router.push("/user/dashboard");
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-[#3182ce]/10 text-slate-700 hover:text-[#3182ce] rounded-xl font-medium text-sm transition-colors"
                >
                  进入空间
                </button>
                <button
                  onClick={handleUpgradePersonalSpace}
                  className="w-full py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-medium text-sm transition-colors hover:shadow-md"
                >
                  升级企业空间
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  // 创建个人空间
                  const response = await fetch("/api/user/workspaces", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                    body: JSON.stringify({
                      name: "我的个人空间",
                      type: "PERSONAL",
                    }),
                  });
                  if (response.ok) {
                    fetchHubData();
                  }
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-[#3182ce]/10 text-slate-700 hover:text-[#3182ce] rounded-xl font-medium text-sm transition-colors"
              >
                创建个人空间
              </button>
            )}
          </div>

          {/* 卡片 B: 创建/升级企业空间 */}
          <div className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 group ${
            canCreateEnterprise 
              ? "border-slate-200 hover:border-[#3182ce]/30 hover:shadow-md" 
              : "border-orange-200 bg-orange-50/50"
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                canCreateEnterprise 
                  ? "bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10" 
                  : "bg-gradient-to-br from-orange-100 to-orange-200"
              }`}>
                <Building2 className={`w-6 h-6 ${canCreateEnterprise ? "text-[#3182ce]" : "text-orange-500"}`} />
              </div>
              <ArrowRight className={`w-5 h-5 transition-all duration-300 group-hover:translate-x-1 ${
                canCreateEnterprise ? "text-slate-300 group-hover:text-[#3182ce]" : "text-orange-300"
              }`} />
            </div>
            <h3 className="font-bold text-slate-800 mb-2">企业空间</h3>
            <p className="text-sm text-slate-500 mb-4">
              {canCreateEnterprise 
                ? `创建或加入企业空间，支持团队协作 (剩余 ${hubData?.quotas.availableEnterpriseSlots} 个槽位)`
                : "企业空间槽位已用完，请先升级会员"}
            </p>
            <button
              onClick={() => {
                if (canCreateEnterprise) {
                  router.push("/user/workspaces/new");
                } else {
                  router.push("/user/membership");
                }
              }}
              disabled={!canCreateEnterprise}
              className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors ${
                canCreateEnterprise
                  ? "bg-[#3182ce] hover:bg-[#2b6cb0] text-white"
                  : "bg-orange-100 text-orange-600 cursor-not-allowed"
              }`}
            >
              {canCreateEnterprise ? "创建企业空间" : "升级获取更多槽位"}
            </button>
          </div>

          {/* 卡片 C: 个人空间配置 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:border-[#3182ce]/30 hover:shadow-md transition-all duration-300 group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Settings className="w-6 h-6 text-emerald-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all duration-300" />
            </div>
            <h3 className="font-bold text-slate-800 mb-2">空间配置</h3>
            <p className="text-sm text-slate-500 mb-4">
              针对当前空间的引擎、System Prompt 及数据清理进行深度调优
            </p>
            <button
              onClick={() => router.push("/user/preference")}
              className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 rounded-xl font-medium text-sm transition-colors"
            >
              配置空间
            </button>
          </div>

          {/* 卡片 D: 加入已有空间 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:border-[#3182ce]/30 hover:shadow-md transition-all duration-300 group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Users className="w-6 h-6 text-violet-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-1 transition-all duration-300" />
            </div>
            <h3 className="font-bold text-slate-800 mb-2">加入空间</h3>
            <p className="text-sm text-slate-500 mb-4">
              处理待办邀请或输入 6 位企业邀请码快速入组
            </p>
            <button
              onClick={() => router.push("/user/workspaces/join")}
              className="w-full py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 hover:text-violet-800 rounded-xl font-medium text-sm transition-colors"
            >
              加入空间
            </button>
          </div>
        </div>

        {/* 数字资产看板 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#3182ce]" />
              数字资产看板
            </h3>
            <span className="text-xs text-slate-500">统计范围：您名下的所有空间</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="w-4 h-4 text-[#3182ce]" />
                <span className="text-xs text-slate-500 font-medium">项目总数</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {hubData?.aggregatedStats.totalProjects || 0}
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-slate-500 font-medium">文档总数</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {hubData?.aggregatedStats.totalDocuments || 0}
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-xs text-slate-500 font-medium">架构图</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {hubData?.aggregatedStats.totalDiagrams || 0}
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-slate-500 font-medium">Token 余额</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {hubData?.aggregatedStats.totalTokenBalance.toLocaleString() || 0}
              </div>
            </div>
          </div>

          {/* 资源使用进度条 */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  云端存储
                </span>
                <span className="text-sm text-slate-500">
                  {formatBytes(hubData?.aggregatedStats.totalStorageUsed || 0)} / {formatBytes(hubData?.aggregatedStats.totalStorageLimit || 0)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, storagePercentage)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  API 调用额度
                </span>
                <span className="text-sm text-slate-500">
                  {hubData?.quotas.maxApiCalls.toLocaleString() || 0} 次/月
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 能力橱窗 - 53 个组件展示 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#3182ce]" />
              能力橱窗
            </h3>
            <span className="text-xs text-slate-500">10 大研发阶段 · 53 个专业组件</span>
          </div>

          <div className="space-y-6">
            {(Object.keys(COMPONENT_CATEGORIES) as ComponentCategory[]).map((category) => {
              const categoryInfo = COMPONENT_CATEGORIES[category];
              const categoryComponents = getComponentsByCategory(category);
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="px-3 py-1 rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: categoryInfo.color }}
                    >
                      {categoryInfo.name}
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      {categoryInfo.range}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {categoryComponents.map((comp) => (
                      <div
                        key={comp.id}
                        className="group relative bg-slate-50/80 hover:bg-white rounded-xl p-3 border border-slate-100 hover:border-slate-200 transition-all duration-200 cursor-default"
                      >
                        <div className="flex items-center justify-center mb-2 text-lg">
                          {comp.icon}
                        </div>
                        <div className="text-xs font-bold text-slate-600 text-center truncate">
                          {comp.name}
                        </div>
                        <div className="absolute inset-0 bg-slate-900/95 rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center">
                          <div className="text-xs font-bold text-white mb-1">{comp.name}</div>
                          <div className="text-xs text-slate-300 text-center leading-relaxed">
                            {comp.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 已有空间快速入口 */}
        {hubData?.workspaces.enterprise && hubData.workspaces.enterprise.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#3182ce]" />
              我的企业空间
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hubData.workspaces.enterprise.map((workspace) => (
                <div
                  key={workspace.id}
                  className="bg-slate-50/80 rounded-xl border border-slate-100 overflow-hidden"
                >
                  {/* 空间信息卡片 */}
                  <button
                    onClick={() => {
                      localStorage.setItem("currentWorkspaceId", workspace.id);
                      router.push("/user/dashboard");
                    }}
                    className="w-full flex items-center gap-4 p-4 hover:bg-[#3182ce]/5 transition-all duration-200 text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-[#3182ce]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{workspace.name}</div>
                      <div className="text-xs text-slate-500">
                        角色：{workspace.role === "OWNER" ? "所有者" : 
                               workspace.role === "ADMIN" ? "管理员" : "成员"}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#3182ce] transition-colors" />
                  </button>
                  
                  {/* 管理操作栏 */}
                  {(workspace.role === "OWNER" || workspace.role === "ADMIN") && (
                    <div className="px-4 py-3 bg-white border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/user/workspace-hub/posts?workspaceId=${workspace.id}`)}
                        className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-[#3182ce]/10 hover:text-[#3182ce] rounded-lg transition-colors"
                        title="岗位管理"
                      >
                        <Users className="w-3.5 h-3.5 inline mr-1" />
                        岗位管理
                      </button>
                      <button
                        onClick={() => router.push(`/user/workspace-hub/matrix?workspaceId=${workspace.id}`)}
                        className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg transition-colors"
                        title="权限配置"
                      >
                        <Shield className="w-3.5 h-3.5 inline mr-1" />
                        权限配置
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 升级决策 Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onConfirm={handleConfirmUpgrade}
        workspaceName={hubData?.workspaces.personal?.[0]?.name}
      />
    </div>
  );
}
