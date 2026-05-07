"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Search,
  Filter,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  TrendingUp,
  Activity,
  Star,
  Calendar,
  CheckCircle,
  AlertCircle,
  X,
  Code,
  Layers,
  Zap,
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

export default function UserComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PUBLISHED" | "DRAFT" | "ARCHIVED">("ALL");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", description: "", status: "" });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadComponents();
  }, []);

  const loadComponents = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/components", {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        setComponents(data.data || []);
      }
    } catch (error) {
      console.error("Load components error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredComponents = components.filter((component) => {
    const matchesSearch = component.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "ALL" || component.status === filterStatus;
    return matchesSearch && matchesStatus;
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

  const handleEdit = (component: Component) => {
    setSelectedComponent(component);
    setEditFormData({
      name: component.name,
      description: component.description || "",
      status: component.status,
    });
    setShowEditModal(true);
  };

  const handleDelete = (component: Component) => {
    setSelectedComponent(component);
    setShowDeleteConfirm(true);
  };

  const handleViewDetail = (component: Component) => {
    setSelectedComponent(component);
    setShowDetailModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedComponent) return;

    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/user/components?id=${selectedComponent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        setMessage({ type: "success", text: "组件已删除" });
        loadComponents();
        setShowDeleteConfirm(false);
        setSelectedComponent(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "删除失败" });
      }
    } catch (error) {
      console.error("Delete component error:", error);
      setMessage({ type: "error", text: "删除失败" });
    }
  };

  const handleUpdateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComponent) return;

    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/user/components?id=${selectedComponent.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "组件已更新" });
        loadComponents();
        setShowEditModal(false);
        setSelectedComponent(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "更新失败" });
      }
    } catch (error) {
      console.error("Update component error:", error);
      setMessage({ type: "error", text: "更新失败" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "text-[#10b981] bg-[#10b981]/10";
      case "DRAFT":
        return "text-[#f59e0b] bg-[#f59e0b]/10";
      case "ARCHIVED":
        return "text-slate-500 bg-slate-100";
      default:
        return "text-slate-500 bg-slate-100";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return "已发布";
      case "DRAFT":
        return "草稿";
      case "ARCHIVED":
        return "已归档";
      default:
        return status;
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
          我的组件
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          查看组件列表和使用统计，前往工作室开发新组件
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
            placeholder="搜索组件..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none bg-white"
          >
            <option value="ALL">全部状态</option>
            <option value="PUBLISHED">已发布</option>
            <option value="DRAFT">草稿</option>
            <option value="ARCHIVED">已归档</option>
          </select>
          <button
            onClick={() => (window.location.href = "/studio")}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300"
          >
            <Plus className="w-5 h-5" />
            创建组件
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
                <Box className="w-7 h-7 text-[#3182ce]" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {components.length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">总组件数</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <Star className="w-7 h-7 text-[#10b981]" />
              </div>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {components.filter((c) => c.status === "PUBLISHED").length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">已发布</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center">
                <Activity className="w-7 h-7 text-[#f59e0b]" />
              </div>
              <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {components.reduce((sum, c) => sum + (c.usageCount || 0), 0)}
            </div>
            <div className="text-sm text-slate-500 font-semibold">总使用次数</div>
          </div>
        </div>
      </div>

      {/* 组件列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
              组件列表
            </h2>
            <span className="text-sm text-slate-500 font-medium">
              共 {filteredComponents.length} 个组件
            </span>
          </div>

          {filteredComponents.length > 0 ? (
            <div className="space-y-3">
              {filteredComponents.map((component) => (
                <div
                  key={component.id}
                  className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2563eb]/5 border border-slate-200 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-x-1"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center flex-shrink-0">
                      <Box className="w-6 h-6 text-[#3182ce]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                          {component.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded-full ${getStatusColor(component.status)}`}
                        >
                          {getStatusText(component.status)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {component.description || "暂无描述"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-500 mb-1">使用次数</div>
                      <div className="text-sm font-bold text-slate-700">
                        {component.usageCount || 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 mb-1">更新时间</div>
                      <div className="text-xs text-slate-600">
                        {formatTimeAgo(component.updatedAt)}
                      </div>
                    </div>
                    <div className="relative group/menu">
                      <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                      {/* 操作菜单 */}
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-2 hidden group-hover/menu:block z-10">
                        <button
                          onClick={() => handleViewDetail(component)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          查看
                        </button>
                        <button
                          onClick={() => handleEdit(component)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(component)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Box className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">暂无组件</h3>
              <p className="text-slate-500 mb-6">创建您的第一个组件开始使用</p>
              <button
                onClick={() => (window.location.href = "/studio")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300"
              >
                <Plus className="w-5 h-5" />
                创建组件
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 编辑模态框 */}
      {showEditModal && selectedComponent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <h3 className="text-xl font-black text-slate-800 mb-6">编辑组件</h3>
            <form onSubmit={handleUpdateComponent}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <span className="zg-required">组件名称</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入组件名称"
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
                    placeholder="请输入组件描述"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    状态
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white"
                  >
                    <option value="DRAFT">草稿</option>
                    <option value="PUBLISHED">已发布</option>
                    <option value="ARCHIVED">已归档</option>
                  </select>
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
      {showDeleteConfirm && selectedComponent && (
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
                确定要删除组件 <span className="font-bold text-slate-800">"{selectedComponent.name}"</span> 吗？
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

      {/* 详情查看模态框 */}
      {showDetailModal && selectedComponent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowDetailModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                  <Box className="w-6 h-6 text-[#3182ce]" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selectedComponent.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${getStatusColor(selectedComponent.status)}`}>
                      {getStatusText(selectedComponent.status)}
                    </span>
                    {selectedComponent.category && (
                      <span className="text-xs text-slate-500">{selectedComponent.category}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">组件描述</h4>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-4">
                  {selectedComponent.description || "暂无描述"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">使用次数</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Zap className="w-5 h-5 text-[#f59e0b]" />
                    <span className="text-lg font-black text-slate-800">{selectedComponent.usageCount || 0}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">创建时间</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-[#3182ce]" />
                    <span className="text-sm font-bold text-slate-800">{new Date(selectedComponent.createdAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">更新时间</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Activity className="w-5 h-5 text-[#10b981]" />
                    <span className="text-sm font-bold text-slate-800">{formatTimeAgo(selectedComponent.updatedAt)}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">组件 ID</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Code className="w-5 h-5 text-[#8b5cf6]" />
                    <span className="text-xs font-mono text-slate-600 truncate">{selectedComponent.id}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleEdit(selectedComponent);
                  }}
                  className="w-full px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all"
                >
                  编辑此组件
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
