"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Search,
  Plus,
  ArrowLeft,
  Package as PackageIcon,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Award,
  Star,
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  icon: string;
  category: string;
  tags: string;
  sortOrder: number;
  isPublished: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ComponentFormData {
  name: string;
  description: string;
  type: string;
  icon: string;
  category: string;
  tags: string;
  sortOrder: number;
  isPublished: boolean;
  config?: any;
}

export default function AdminComponentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<Component[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    status: "",
    published: "",
  });
  const [types, setTypes] = useState<string[]>([]);
  const [formData, setFormData] = useState<ComponentFormData>({
    name: "",
    description: "",
    type: "",
    icon: "",
    category: "",
    tags: "",
    sortOrder: 0,
    isPublished: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComponents();
  }, []);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const params = new URLSearchParams({
        page: "1",
        limit: "100",
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status }),
      });

      const res = await fetch(`/api/admin/components?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setComponents(data.data.components);
        setTypes(data.data.types);
      } else {
        const error = await res.json();
        toast.error(error.message || "加载组件失败");
      }
    } catch (error) {
      console.error("Load components error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublished = async (id: string, isPublished: boolean) => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch(`/api/admin/components?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          isPublished: !isPublished,
        }),
      });

      if (res.ok) {
        toast.success(isPublished ? "已下架" : "已上架");
        loadComponents();
      } else {
        toast.error("操作失败");
      }
    } catch (error) {
      console.error("Toggle published error:", error);
      toast.error("操作失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个组件吗？")) return;

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch(`/api/admin/components?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        toast.success("删除成功");
        loadComponents();
      } else {
        const error = await res.json();
        toast.error(error.message || "删除失败");
      }
    } catch (error) {
      console.error("Delete component error:", error);
      toast.error("删除失败");
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: "",
      description: "",
      type: "",
      icon: "",
      category: "",
      tags: "",
      sortOrder:
        components.length > 0
          ? Math.max(...components.map((c) => c.sortOrder)) + 1
          : 1,
      isPublished: true,
    });
    setShowCreateModal(true);
  };

  const openEditModal = (component: Component) => {
    setFormData({
      name: component.name,
      description: component.description || "",
      type: component.type,
      icon: component.icon || "",
      category: component.category || "",
      tags: component.tags || "",
      sortOrder: component.sortOrder,
      isPublished: component.isPublished,
    });
    setEditingComponent(component);
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    // 验证必填字段
    if (!formData.name || !formData.type) {
      toast.error("请填写组件名称和类型");
      return;
    }

    setSubmitting(true);

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const url = editingComponent
        ? `/api/admin/components?id=${editingComponent.id}`
        : "/api/admin/components";

      const method = editingComponent ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(editingComponent ? "更新成功" : "创建成功");
        setShowCreateModal(false);
        loadComponents();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (error) {
      console.error("Submit component error:", error);
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              组件管理
            </h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总组件数
                </div>
                <PackageIcon className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {components.length}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  已上架
                </div>
                <Eye className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {components.filter((c) => c.isPublished).length}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  组件类型
                </div>
                <Layers className="w-6 h-6 text-[#8b5cf6]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {types.length}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总使用次数
                </div>
                <Star className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {components.reduce((sum, c) => sum + (c.usageCount || 0), 0)}
              </div>
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden mb-6">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索组件名称..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
              >
                <option value="">全部类型</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={filters.published}
                onChange={(e) =>
                  setFilters({ ...filters, published: e.target.value })
                }
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
              >
                <option value="">全部状态</option>
                <option value="true">已上架</option>
                <option value="false">未上架</option>
              </select>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 h-11 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Plus className="w-5 h-5" />
              <span>新增组件</span>
            </button>
          </div>
        </div>

        {/* 组件列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载组件列表中...</p>
            </div>
          </div>
        ) : components.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <PackageIcon className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium text-sm">暂无组件数据</p>
          </div>
        ) : (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

            <div className="relative overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      组件信息
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      类型/分类
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      上架状态
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      使用次数
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {components.map((component) => (
                    <tr
                      key={component.id}
                      className="group hover:bg-white/60 transition-all duration-300"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-sm">
                            {component.icon || "📦"}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {component.name}
                            </div>
                            <div className="text-xs text-slate-500 font-medium truncate max-w-xs">
                              {component.description || "-"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm text-slate-600 font-medium">
                          <div className="font-bold text-slate-800">
                            {component.type}
                          </div>
                          <div className="text-xs text-slate-400">
                            {component.category || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() =>
                            handleTogglePublished(
                              component.id,
                              component.isPublished,
                            )
                          }
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            component.isPublished
                              ? "bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {component.isPublished ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              已上架
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              未上架
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm font-bold text-slate-800">
                          {component.usageCount || 0}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm text-slate-600 font-medium">
                          {new Date(component.createdAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(component)}
                            className="p-2.5 hover:bg-[#3182ce]/10 rounded-xl transition-all duration-300 group/btn"
                            title="编辑"
                          >
                            <Edit className="w-4.5 h-4.5 text-slate-600 group-hover/btn:text-[#3182ce]" />
                          </button>
                          <button
                            onClick={() => handleDelete(component.id)}
                            className="p-2.5 hover:bg-red-50 rounded-xl transition-all duration-300 group/btn"
                            title="删除"
                          >
                            <Trash2 className="w-4.5 h-4.5 text-red-600 group-hover/btn:text-red-700" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 创建/编辑弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {editingComponent ? "编辑组件" : "新增组件"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  基本信息
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      组件名称 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="如：标书智能解析"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      描述
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      placeholder="组件功能描述"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      类型/阶段 *
                    </label>
                    <input
                      type="text"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      placeholder="如：第一阶段：商机捕获与售前打单"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      分类
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    >
                      <option value="">请选择分类</option>
                      <option value="分析类">分析类</option>
                      <option value="生成类">生成类</option>
                      <option value="工具类">工具类</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      图标
                    </label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData({ ...formData, icon: e.target.value })
                      }
                      placeholder="📦"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      标签（逗号分隔）
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData({ ...formData, tags: e.target.value })
                      }
                      placeholder="标书，解析，分析"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      排序权重
                    </label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sortOrder: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPublished}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isPublished: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce]"
                      />
                      <span className="text-sm font-medium text-slate-700">
                        已上架（前端可见）
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {editingComponent ? "更新" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
