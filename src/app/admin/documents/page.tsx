"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import {
  Search,
  Plus,
  FileText,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Book,
  HelpCircle,
  Bell,
  Settings,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string;
  isPublished: boolean;
  sortOrder: number;
  viewCount: number;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentFormData {
  title: string;
  content: string;
  category: string;
  tags: string;
  isPublished: boolean;
  sortOrder: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  "user-guide": "用户指南",
  "api-doc": "API 文档",
  "system-doc": "系统文档",
  faq: "常见问题",
  announcement: "公告",
};

const CATEGORY_ICONS: Record<string, any> = {
  "user-guide": Book,
  "api-doc": FileText,
  "system-doc": Settings,
  faq: HelpCircle,
  announcement: Bell,
};

export default function AdminDocumentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPublished, setFilterPublished] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [formData, setFormData] = useState<
    DocumentFormData & { errors?: Record<string, string> }
  >({
    title: "",
    content: "",
    category: "",
    tags: "",
    isPublished: false,
    sortOrder: 0,
    errors: {},
  });
  const [submitting, setSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "warning" | "danger";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {},
  });

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      console.log("加载文档，用户ID:", userId);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "10",
        ...(searchQuery && { search: searchQuery }),
        ...(filterCategory && { category: filterCategory }),
        ...(filterPublished && { published: filterPublished }),
      });

      const res = await fetch(`/api/admin/documents?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      console.log("文档API响应状态:", res.status);

      if (res.ok) {
        const data = await res.json();
        console.log("文档数据:", data);
        setDocuments(data.data.documents);
        setTotalPages(data.data.totalPages);
        setTotal(data.data.total);
      } else {
        // 先获取响应文本，看看返回的到底是什么
        const errorText = await res.text();
        console.error("加载文档错误响应:", errorText);
        try {
          const error = JSON.parse(errorText);
          console.error("加载文档错误解析:", error);
          toast.error(error.error || error.message || "加载文档失败");
        } catch (e) {
          console.error("解析错误响应失败:", e);
          toast.error("加载文档失败");
        }
      }
    } catch (error) {
      console.error("Load documents error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [currentPage, searchQuery, filterCategory, filterPublished]);

  const handleTogglePublished = async (id: string, isPublished: boolean) => {
    const action = isPublished ? "下架" : "上架";
    setConfirmModal({
      isOpen: true,
      title: `${action}确认`,
      message: `${action}后，用户将${isPublished ? "无法" : "可以"}查看此文档。\n\n请确认是否继续？`,
      type: "info",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch(`/api/admin/documents?id=${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({
              id,
              isPublished: !isPublished,
            }),
          });

          if (res.ok) {
            toast.success(isPublished ? "已下架" : "已上架");
            loadDocuments();
          } else {
            const error = await res.json();
            toast.error(error.message || "操作失败");
          }
        } catch (error) {
          console.error("Toggle published error:", error);
          toast.error("操作失败");
        }
      },
    });
  };

  const handleDelete = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) {
      toast.error("文档不存在");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "⚠️ 删除确认",
      message: `文档标题：${doc.title}\n\n此操作不可恢复，删除后将无法找回！\n\n请确认是否继续？`,
      type: "danger",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch(`/api/admin/documents?id=${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${userId}`,
            },
          });

          if (res.ok) {
            toast.success("删除成功");
            loadDocuments();
          } else {
            const error = await res.json();
            toast.error(error.message || "删除失败");
          }
        } catch (error) {
          console.error("Delete document error:", error);
          toast.error("删除失败");
        }
      },
    });
  };

  const openCreateModal = () => {
    setFormData({
      title: "",
      content: "",
      category: "",
      tags: "",
      isPublished: false,
      sortOrder:
        documents.length > 0
          ? Math.max(...documents.map((d) => d.sortOrder)) + 1
          : 1,
      errors: {},
    });
    setShowCreateModal(true);
  };

  const openEditModal = (doc: Document) => {
    setFormData({
      title: doc.title,
      content: doc.content || "",
      category: doc.category,
      tags: doc.tags || "",
      isPublished: doc.isPublished,
      sortOrder: doc.sortOrder,
      errors: {},
    });
    setEditingDoc(doc);
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title || !formData.title.trim()) {
      newErrors.title = "请输入文档标题";
    }

    if (!formData.category) {
      newErrors.category = "请选择文档分类";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      return;
    }

    setSubmitting(true);

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const url = editingDoc
        ? `/api/admin/documents?id=${editingDoc.id}`
        : "/api/admin/documents";

      const method = editingDoc ? "PATCH" : "POST";

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
        toast.success(editingDoc ? "更新成功" : "创建成功");
        setShowCreateModal(false);
        loadDocuments();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (error) {
      console.error("Submit document error:", error);
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 顶部标题区 */}
      <div className="bg-white/50 backdrop-blur-sm border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="mb-2">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              文档管理
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              管理系统文档、用户指南、API 文档、常见问题、公告
            </p>
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
                  总文档数
                </div>
                <FileText className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {total}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  已发布
                </div>
                <CheckCircle className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {documents.filter((d) => d.isPublished).length}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  未发布
                </div>
                <XCircle className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {documents.filter((d) => !d.isPublished).length}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总浏览量
                </div>
                <Eye className="w-6 h-6 text-[#8b5cf6]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {documents.reduce((sum, d) => sum + d.viewCount, 0)}
              </div>
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden mb-6">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

          <div className="relative space-y-3">
            {/* 第一行：搜索框和新增按钮 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索文档标题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>新增文档</span>
              </button>
            </div>

            {/* 第二行：筛选条件 */}
            <div className="flex items-center gap-3">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80 whitespace-nowrap"
              >
                <option value="">全部分类</option>
                <option value="user-guide">用户指南</option>
                <option value="api-doc">API 文档</option>
                <option value="system-doc">系统文档</option>
                <option value="faq">常见问题</option>
                <option value="announcement">公告</option>
              </select>
              <select
                value={filterPublished}
                onChange={(e) => setFilterPublished(e.target.value)}
                className="px-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80 whitespace-nowrap"
              >
                <option value="">全部状态</option>
                <option value="true">已发布</option>
                <option value="false">未发布</option>
              </select>
            </div>
          </div>
        </div>

        {/* 文档列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载文档列表中...</p>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium text-sm">暂无文档数据</p>
          </div>
        ) : (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

            <div className="relative overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      文档信息
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      分类
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      发布状态
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      浏览量
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      创建时间
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => {
                    const IconComponent =
                      CATEGORY_ICONS[doc.category] || FileText;
                    return (
                      <tr
                        key={doc.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <IconComponent className="w-5 h-5 text-[#3182ce]" />
                              <span className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                {doc.title}
                              </span>
                            </div>
                            {doc.tags && (
                              <div className="text-xs text-slate-500 font-medium ml-7">
                                标签：{doc.tags}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-3 py-1.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                            {CATEGORY_LABELS[doc.category] || doc.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {doc.isPublished ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#10b981]/10 text-[#10b981]">
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              已发布
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              未发布
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{doc.viewCount}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-600 font-medium">
                            {new Date(doc.createdAt).toLocaleDateString(
                              "zh-CN",
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(doc)}
                              className="p-2.5 hover:bg-[#3182ce]/10 rounded-xl transition-all duration-300 group/btn"
                              title="编辑"
                            >
                              <Edit className="w-4.5 h-4.5 text-slate-600 group-hover/btn:text-[#3182ce]" />
                            </button>
                            <button
                              onClick={() =>
                                handleTogglePublished(doc.id, doc.isPublished)
                              }
                              className="p-2.5 hover:bg-[#f59e0b]/10 rounded-xl transition-all duration-300 group/btn"
                              title={doc.isPublished ? "下架" : "上架"}
                            >
                              {doc.isPublished ? (
                                <EyeOff className="w-4.5 h-4.5 text-[#f59e0b] group-hover/btn:text-[#d97706]" />
                              ) : (
                                <Eye className="w-4.5 h-4.5 text-[#10b981] group-hover/btn:text-[#059669]" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="p-2.5 hover:bg-red-50 rounded-xl transition-all duration-300 group/btn"
                              title="删除"
                            >
                              <Trash2 className="w-4.5 h-4.5 text-red-600 group-hover/btn:text-red-700" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 分页组件 */}
        {totalPages > 1 && (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-sm mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 font-medium">
                共 {total} 条数据，第 {currentPage} / {totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  首页
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  上一页
                </button>
                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: Math.min(5, totalPages) },
                    (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                            currentPage === pageNum
                              ? "bg-[#3182ce] text-white"
                              : "hover:bg-slate-50 border border-slate-200"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    },
                  )}
                </div>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  下一页
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  末页
                </button>
              </div>
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
                {editingDoc ? "编辑文档" : "新增文档"}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  文档标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="如：系统使用指南"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] ${
                    formData.errors?.title ? "border-red-500" : "border-slate-200"
                  }`}
                />
                {formData.errors?.title && (
                  <p className="mt-1 text-xs text-red-500">
                    {formData.errors.title}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    文档分类 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] ${
                      formData.errors?.category
                        ? "border-red-500"
                        : "border-slate-200"
                    }`}
                  >
                    <option value="">请选择分类</option>
                    <option value="user-guide">用户指南</option>
                    <option value="api-doc">API 文档</option>
                    <option value="system-doc">系统文档</option>
                    <option value="faq">常见问题</option>
                    <option value="announcement">公告</option>
                  </select>
                  {formData.errors?.category && (
                    <p className="mt-1 text-xs text-red-500">
                      {formData.errors.category}
                    </p>
                  )}
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
                  placeholder="如：入门，教程，指南"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  文档内容（Markdown 格式）
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  rows={12}
                  placeholder="# 文档标题&#10;&#10;这里是文档内容，支持 Markdown 格式..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] font-mono text-sm"
                />
              </div>

              <div>
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
                    已发布
                  </span>
                </label>
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
                {editingDoc ? "更新" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}
