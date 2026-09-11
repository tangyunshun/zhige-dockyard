"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Search,
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  Star,
  CheckCircle,
  X,
  Code,
  Zap,
  Copy,
  ExternalLink,
  Calendar,
  Activity,
  Eye,
  AlertCircle,
  Filter,
  MoreVertical,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

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
  const toast = useToast();
  const router = useRouter();
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PUBLISHED" | "DRAFT" | "ARCHIVED">("ALL");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", description: "", status: "" });
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComponents();
  }, []);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/components", {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setComponents(data.data || []);
      }
    } catch (error) {
      console.error("Load components error:", error);
      toast.error("加载组件资产列表失败");
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

  const copyComponentId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("组件 ID 已复制到剪贴板");
  };

  const confirmDelete = async () => {
    if (!selectedComponent) return;

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/components?id=${selectedComponent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        toast.success(`组件 [${selectedComponent.name}] 已成功删除`);
        loadComponents();
        setShowDeleteConfirm(false);
        setSelectedComponent(null);
      } else {
        const error = await res.json();
        toast.error(error.message || "删除组件失败");
      }
    } catch (error) {
      console.error("Delete component error:", error);
      toast.error("删除组件异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComponent) return;
    if (!editFormData.name.trim()) {
      setEditNameError("组件名称不能为空");
      return;
    }

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/components?id=${selectedComponent.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        toast.success("组件信息已更新");
        loadComponents();
        setShowEditModal(false);
        setSelectedComponent(null);
        setEditNameError(null);
      } else {
        const error = await res.json();
        const msg = error.message || error.error || "更新组件失败";
        if (msg.includes("名称") || msg.includes("组件")) {
          setEditNameError(msg);
        } else {
          toast.error(msg);
        }
      }
    } catch (error) {
      console.warn("Update component error:", error);
      toast.error("网络异常，更新组件失败");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/65">
            已发布
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200/60">
            开发草稿
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200/60">
            已归档
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 font-medium text-sm">正在加载组件资产...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1">
            我的组件资产
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            查看个人封装的业务模块、低代码组件与使用统计，支持一键在工作室进行研发调试
          </p>
        </div>
        <button
          onClick={() => router.push("/studio")}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-xs hover:brightness-105 transition-all cursor-pointer w-fit"
        >
          <Plus className="w-3.5 h-3.5" />
          组件工作室
        </button>
      </div>

      {/* 操作与检索栏 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索组件资产名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 transition-all outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-[#3182ce] outline-none text-slate-700 font-medium"
        >
          <option value="ALL">全部发布状态</option>
          <option value="PUBLISHED">已发布</option>
          <option value="DRAFT">开发草稿</option>
          <option value="ARCHIVED">已归档</option>
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-white/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold mb-1">总组件数量</div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {components.length}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center">
            <Box className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-white/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold mb-1">已发布组件</div>
            <div className="text-2xl font-black text-[#10b981] tracking-tight">
              {components.filter((c) => c.status === "PUBLISHED").length}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 text-[#10b981] flex items-center justify-center">
            <Star className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-white/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold mb-1">累计引用装配</div>
            <div className="text-2xl font-black text-[#f59e0b] tracking-tight">
              {components.reduce((sum, c) => sum + (c.usageCount || 0), 0)}
              <span className="text-xs font-normal text-slate-400 ml-1">次</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 组件列表 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
            资产物料矩阵
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            共 {filteredComponents.length} 项资产
          </span>
        </div>

        {filteredComponents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredComponents.map((component) => (
              <div
                key={component.id}
                className="group relative p-5 rounded-xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-[#3182ce]/40 transition-all duration-200 hover:shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                        <Box className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors line-clamp-1">
                          {component.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {getStatusBadge(component.status)}
                          {component.category && (
                            <span className="text-[10px] text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">
                              {component.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleViewDetail(component)}
                        className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-md transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(component)}
                        className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-md transition-colors"
                        title="编辑组件"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(component)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="删除组件"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 mt-2 mb-3 min-h-[32px]">
                    {component.description || "暂无组件描述信息，可点击编辑进行补充说明。"}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    装配 {component.usageCount || 0} 次 · 更新于 {formatTimeAgo(component.updatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push("/studio")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#3182ce] hover:text-[#2b6cb0] transition-colors"
                  >
                    前往工作室
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
              <Box className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-bold text-slate-700 mb-1">未找到匹配的组件资产</h3>
            <p className="text-[11px] text-slate-400 mb-4">您可以进入可视化工作室研发并发布您的第一个业务组件</p>
            <button
              onClick={() => router.push("/studio")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-xs hover:brightness-105 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              进入组件工作室
            </button>
          </div>
        )}
      </div>

      {/* 编辑模态框 */}
      {showEditModal && selectedComponent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-slate-800 mb-4">编辑组件资产</h3>
            <form onSubmit={handleUpdateComponent}>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    <span className="zg-required">组件名称</span>
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
                    placeholder="请输入组件名称"
                  />
                  {editNameError && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{editNameError}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">组件简介</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full p-3 text-xs rounded-lg border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="请输入组件用途、入参与调用说明..."
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">发布状态</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-[#3182ce] outline-none"
                  >
                    <option value="DRAFT">开发草稿 (仅自己可见)</option>
                    <option value="PUBLISHED">正式发布 (空间成员可用)</option>
                    <option value="ARCHIVED">历史归档 (停止新装配)</option>
                  </select>
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
      {showDeleteConfirm && selectedComponent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
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
              <h3 className="text-base font-bold text-slate-800">确认删除组件资产</h3>
              <p className="text-xs text-slate-500 mt-1">
                确定要删除组件 <span className="font-bold text-slate-800">[{selectedComponent.name}]</span> 吗？
              </p>
              <p className="text-[11px] text-rose-500 mt-1.5">
                此操作将永久下架并抹除该组件源码，不可逆转。
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

      {/* 详情查看模态框 */}
      {showDetailModal && selectedComponent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setShowDetailModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">{selectedComponent.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {getStatusBadge(selectedComponent.status)}
                  {selectedComponent.category && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {selectedComponent.category}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="text-slate-400 font-bold mb-1">功能描述</div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl text-slate-600 leading-relaxed">
                  {selectedComponent.description || "暂无描述信息"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl">
                  <div className="text-slate-400 text-[11px] mb-0.5">装配与引用量</div>
                  <div className="text-base font-black font-mono text-slate-800">
                    {selectedComponent.usageCount || 0} 次
                  </div>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl">
                  <div className="text-slate-400 text-[11px] mb-0.5">最后更新时间</div>
                  <div className="text-xs font-semibold text-slate-700">
                    {new Date(selectedComponent.updatedAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-bold mb-1">唯一组件标识符 (Component ID)</div>
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700">
                  <span className="truncate mr-2">{selectedComponent.id}</span>
                  <button
                    type="button"
                    onClick={() => copyComponentId(selectedComponent.id)}
                    className="text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 shrink-0 font-sans font-semibold"
                  >
                    <Copy className="w-3 h-3" />
                    复制
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false);
                  router.push("/studio");
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                在工作室调试
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false);
                  handleEdit(selectedComponent);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg transition-colors"
              >
                编辑此组件
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
