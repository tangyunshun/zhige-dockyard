"use client";

import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Building2,
  Users,
  Calendar,
  ArrowRight,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Settings,
  TrendingUp,
  Activity,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: Array<{
    user: { name: string | null; email: string | null };
  }>;
}

export default function UserWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PERSONAL" | "ENTERPRISE">("ALL");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", description: "" });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/workspaces", {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.data || []);
      }
    } catch (error) {
      console.error("Load workspaces error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkspaces = workspaces.filter((workspace) => {
    const matchesSearch = workspace.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "ALL" || workspace.type === filterType;
    return matchesSearch && matchesType;
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

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
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        setMessage({ type: "success", text: "工作空间已删除" });
        loadWorkspaces();
        setShowDeleteConfirm(false);
        setSelectedWorkspace(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "删除失败" });
      }
    } catch (error) {
      console.error("Delete workspace error:", error);
      setMessage({ type: "error", text: "删除失败" });
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;

    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "工作空间已更新" });
        loadWorkspaces();
        setShowEditModal(false);
        setSelectedWorkspace(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "更新失败" });
      }
    } catch (error) {
      console.warn("Update workspace error:", error);
      setMessage({ type: "error", text: "更新失败" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          我的工作空间
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          查看和管理个人空间，前往工作空间中心创建新空间
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 shrink-0 ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-4 shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索工作空间..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none bg-white"
          >
            <option value="ALL">全部类型</option>
            <option value="PERSONAL">个人空间</option>
            <option value="ENTERPRISE">企业空间</option>
          </select>
          <button
            onClick={() => (window.location.href = "/workspace-hub")}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300"
          >
            <Plus className="w-5 h-5" />
            创建工作空间
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-[#3182ce]" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {workspaces.length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">总空间数</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-[#10b981]" />
              </div>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {workspaces.filter((w) => w.type === "ENTERPRISE").length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">企业空间</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center">
                <Users className="w-7 h-7 text-[#f59e0b]" />
              </div>
              <Users className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {workspaces.filter((w) => w.type === "PERSONAL").length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">个人空间</div>
          </div>
        </div>
      </div>

      {/* 工作空间列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
              空间列表
            </h2>
            <span className="text-sm text-slate-500 font-medium">
              共 {filteredWorkspaces.length} 个空间
            </span>
          </div>

          {filteredWorkspaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="group p-6 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2563eb]/5 border border-slate-200 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          workspace.type === "ENTERPRISE"
                            ? "bg-[#10b981]/10"
                            : "bg-[#3182ce]/10"
                        }`}
                      >
                        {workspace.type === "ENTERPRISE" ? (
                          <Building2 className="w-6 h-6 text-[#10b981]" />
                        ) : (
                          <FolderOpen className="w-6 h-6 text-[#3182ce]" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                          {workspace.name}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {workspace.type === "ENTERPRISE" ? "企业空间" : "个人空间"}
                        </p>
                      </div>
                    </div>
                    <div className="relative group/menu">
                      <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                      {/* 操作菜单 */}
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-2 hidden group-hover/menu:block z-10">
                        <button
                          onClick={() => handleEdit(workspace)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(workspace)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>

                  {workspace.description && (
                    <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                      {workspace.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Users className="w-4 h-4" />
                        <span>{workspace.members?.length || 1} 名成员</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-4 h-4" />
                        <span>{formatTimeAgo(workspace.createdAt)}</span>
                      </div>
                    </div>
                    <button className="flex items-center gap-1.5 text-sm text-[#3182ce] font-semibold hover:text-[#2563eb] transition-colors">
                      管理
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">暂无工作空间</h3>
              <p className="text-slate-500 mb-6">创建您的第一个工作空间开始使用</p>
              <button
                onClick={() => (window.location.href = "/workspace-hub")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300"
              >
                <Plus className="w-5 h-5" />
                创建工作空间
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 编辑模态框 */}
      {showEditModal && selectedWorkspace && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <h3 className="text-xl font-black text-slate-800 mb-6">编辑工作空间</h3>
            <form onSubmit={handleUpdateWorkspace}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <span className="zg-required">工作空间名称</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入工作空间名称"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    描述
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all resize-none"
                    rows={4}
                    placeholder="请输入工作空间描述"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认模态框 */}
      {showDeleteConfirm && selectedWorkspace && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">确认删除</h3>
              <p className="text-slate-600">
                确定要删除工作空间 <span className="font-bold text-slate-800">"{selectedWorkspace.name}"</span> 吗？
              </p>
              <p className="text-sm text-red-500 mt-2 font-medium">
                此操作不可逆，删除后数据将无法恢复
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-red-500/30 transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
