"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Building2,
  Users,
  ArrowRight,
  Search,
  Edit,
  Trash2,
  Activity,
  X,
  Compass,
  ExternalLink,
  Box,
  Zap,
  HardDrive,
  RotateCw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  componentCount?: number;
  tokenBalance?: number;
  storageUsed?: number;
  storageLimit?: number;
  isOwner?: boolean;
  workspacemember?: Array<{
    user: { name: string | null; email: string | null };
  }>;
}

export default function UserWorkspacesPage() {
  const toast = useToast();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PERSONAL" | "ENTERPRISE">("ALL");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", description: "" });
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const authToken = getAuthToken();
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = authToken.startsWith("Bearer ")
          ? authToken
          : `Bearer ${authToken}`;
      }

      const res = await fetch("/api/user/workspaces", {
        headers,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.data || []);
        if (isManualRefresh) {
          toast.success("空间数据已同步更新");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn("Load workspaces failed:", res.status, errData);
        toast.error(errData.error || "加载工作空间列表失败");
      }
    } catch (error) {
      console.error("Load workspaces error:", error);
      toast.error("加载工作空间列表异常，请重试");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredWorkspaces = workspaces.filter((workspace) => {
    const matchesSearch =
      workspace.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (workspace.description && workspace.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === "ALL" || workspace.type === filterType;
    return matchesSearch && matchesType;
  });

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return "刚刚";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "刚刚";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  const formatStorage = (bytes?: number) => {
    if (!bytes || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const totalTokens = workspaces.reduce((sum, ws) => sum + (ws.tokenBalance || 0), 0);

  const handleEdit = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setEditFormData({
      name: workspace.name,
      description: workspace.description || "",
    });
    setShowEditModal(true);
  };

  const handleDelete = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!selectedWorkspace) return;

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        toast.success(`工作空间 [${selectedWorkspace.name}] 已成功删除`);
        loadWorkspaces();
        setShowDeleteConfirm(false);
        setSelectedWorkspace(null);
      } else {
        const error = await res.json();
        toast.error(error.message || "删除空间失败");
      }
    } catch (error) {
      console.error("Delete workspace error:", error);
      toast.error("删除空间异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;
    if (!editFormData.name.trim()) {
      setEditNameError("工作空间名称不能为空");
      return;
    }

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        toast.success("工作空间信息修改成功");
        loadWorkspaces();
        setShowEditModal(false);
        setSelectedWorkspace(null);
        setEditNameError(null);
      } else {
        const error = await res.json();
        const msg = error.message || error.error || "更新空间信息失败";
        if (msg.includes("名称") || msg.includes("工作空间")) {
          setEditNameError(msg);
        } else {
          toast.error(msg);
        }
      }
    } catch (error) {
      console.warn("Update workspace error:", error);
      toast.error("网络异常，更新空间信息失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 font-medium text-sm">正在加载工作空间资产...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题及导航引导 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1">
            工作空间资产
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            集中管理个人空间与企业空间的组件集成、团队成员与算力点信息（空间开通与新建请前往空间中枢）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadWorkspaces(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200/80 shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
            title="刷新空间数据"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button
            onClick={() => router.push("/workspace-hub")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-2xs hover:brightness-105 transition-all cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-blue-100" />
            前往空间中枢
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* 4 项核心数据指标统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1">全部空间总数</div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {workspaces.length}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1">企业协同空间</div>
            <div className="text-2xl font-black text-[#10b981] tracking-tight">
              {workspaces.filter((w) => w.type === "ENTERPRISE").length}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1">个人独立空间</div>
            <div className="text-2xl font-black text-[#2b6cb0] tracking-tight">
              {workspaces.filter((w) => w.type === "PERSONAL").length}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#2b6cb0]/10 text-[#2b6cb0] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[#dd6b20] font-bold mb-1">可用算力储备</div>
            <div className="text-2xl font-black text-[#dd6b20] tracking-tight">
              {totalTokens.toLocaleString()}
              <span className="text-xs font-normal text-[#dd6b20]/80 ml-1">点</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#dd6b20]/10 text-[#dd6b20] flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 检索与空间类型过滤栏 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="按空间名称或简介搜索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200/90 bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 transition-all outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200/90 bg-white focus:border-[#3182ce] outline-none text-slate-700 font-medium"
        >
          <option value="ALL">全部空间类别</option>
          <option value="ENTERPRISE">企业协同空间</option>
          <option value="PERSONAL">个人独立空间</option>
        </select>
      </div>

      {/* 空间核心信息列表展示 */}
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
            空间资产与配额明细
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            共查询到 {filteredWorkspaces.length} 个空间
          </span>
        </div>

        {filteredWorkspaces.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="group relative p-5 rounded-xl bg-slate-50/60 hover:bg-white border border-slate-200/80 hover:border-[#3182ce]/40 transition-all duration-200 hover:shadow-sm flex flex-col justify-between"
              >
                <div>
                  {/* 顶部标题与类型徽章 */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          workspace.type === "ENTERPRISE"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                            : "bg-blue-50 text-[#2b6cb0] border border-blue-200/60"
                        }`}
                      >
                        {workspace.type === "ENTERPRISE" ? (
                          <Building2 className="w-5 h-5" />
                        ) : (
                          <FolderOpen className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors line-clamp-1">
                            {workspace.name}
                          </h3>
                          {workspace.isOwner && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              所有者
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mt-1 ${
                            workspace.type === "ENTERPRISE"
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                              : "bg-blue-50 text-[#2b6cb0] border border-blue-200/60"
                          }`}
                        >
                          {workspace.type === "ENTERPRISE" ? "企业协同空间" : "个人专属空间"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(workspace)}
                        className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-md transition-colors"
                        title="编辑空间信息"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {workspace.isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDelete(workspace)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="删除空间"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 空间简介 */}
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-3.5 min-h-[32px] leading-relaxed">
                    {workspace.description || "暂无空间描述信息，可在右上方编辑空间简介"}
                  </p>

                  {/* 核心指标三元组：组件数、成员数、算力点数 */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-white border border-slate-100 mb-3.5">
                    <div className="text-center">
                      <div className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-1 mb-0.5">
                        <Box className="w-3 h-3 text-[#3182ce]" />
                        集成组件
                      </div>
                      <div className="text-xs font-black text-slate-700">
                        {workspace.componentCount || 0}{" "}
                        <span className="text-[10px] font-normal text-slate-400">项</span>
                      </div>
                    </div>

                    <div className="text-center border-x border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-1 mb-0.5">
                        <Users className="w-3 h-3 text-emerald-600" />
                        团队成员
                      </div>
                      <div className="text-xs font-black text-slate-700">
                        {workspace.memberCount || 1}{" "}
                        <span className="text-[10px] font-normal text-slate-400">人</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-[10px] text-[#dd6b20] font-bold flex items-center justify-center gap-1 mb-0.5">
                        <Zap className="w-3 h-3 text-[#dd6b20]" />
                        算力点余额
                      </div>
                      <div className="text-xs font-black text-[#dd6b20]">
                        {(workspace.tokenBalance || 0).toLocaleString()}{" "}
                        <span className="text-[10px] font-normal text-[#dd6b20]/70">点</span>
                      </div>
                    </div>
                  </div>

                  {/* 存储配额进度条 */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-slate-400" />
                        存储空间
                      </span>
                      <span className="text-slate-600 font-medium">
                        {formatStorage(workspace.storageUsed)} / {formatStorage(workspace.storageLimit)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#3182ce] to-[#10b981] rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              4,
                              ((workspace.storageUsed || 0) / (workspace.storageLimit || 1073741824)) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 卡片底栏操作 */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-2">
                  <span className="text-slate-400 text-[11px]">
                    更新于 {formatTimeAgo(workspace.updatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/workspace/${workspace.id}`)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#3182ce] hover:text-[#2b6cb0] transition-colors"
                  >
                    进入空间
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
              <FolderOpen className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-bold text-slate-700 mb-1">未匹配到符合条件的工作空间</h3>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto mb-4">
              个人后台不提供空间新建能力，若需创建企业协同空间或全新个人空间，请前往空间中枢统一办理
            </p>
            <button
              onClick={() => router.push("/workspace-hub")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-2xs hover:brightness-105 transition-all"
            >
              <Compass className="w-3.5 h-3.5 text-blue-100" />
              前往空间中枢
            </button>
          </div>
        )}
      </div>

      {/* 编辑模态框 */}
      {showEditModal && selectedWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative border border-slate-100">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-slate-800 mb-4">编辑工作空间信息</h3>
            <form onSubmit={handleUpdateWorkspace}>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    <span className="zg-required">工作空间名称</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, name: e.target.value });
                      if (editNameError) setEditNameError(null);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-lg border outline-none transition-all ${
                      editNameError
                        ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                    placeholder="请输入工作空间名称"
                  />
                  {editNameError && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{editNameError}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">空间简介</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full p-3 text-xs rounded-lg border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="简述该空间的研发目标或业务范围..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? "正在保存..." : "保存修改"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认模态框 */}
      {showDeleteConfirm && selectedWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative border border-slate-100">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">确认删除工作空间</h3>
              <p className="text-xs text-slate-500 mt-1">
                确定要删除工作空间 <span className="font-bold text-slate-800">[{selectedWorkspace.name}]</span> 吗？
              </p>
              <p className="text-[11px] text-rose-500 mt-1.5">
                此操作将清空该空间内的配置，不可逆转。
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "正在删除..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

