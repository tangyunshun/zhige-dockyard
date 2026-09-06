"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import Pagination from "@/components/Pagination";
import { getAuthToken } from "@/utils/auth";
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
  CheckCircle2,
  XCircle,
  ExternalLink,
  BookOpen,
  FileCode,
  RotateCcw,
  Calendar,
  Sparkles,
  AlertTriangle,
  Copy,
  Check,
  Share2,
  X,
  Clock,
  User,
  Tag,
  ArrowUpDown,
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

interface DocumentSummary {
  totalDocs: number;
  publishedDocs: number;
  unPublishedDocs: number;
  totalViews: number;
  categoryCounts: Record<string, number>;
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
  "user_guide": "用户指南",
  guide: "用户指南",
  "api-doc": "API 文档",
  "api_doc": "API 文档",
  api: "API 文档",
  "system-doc": "系统文档",
  "system_doc": "系统文档",
  system: "系统文档",
  faq: "常见问题",
  help: "帮助与支持",
  announcement: "官方公告",
  notice: "官方通知",
  "privacy-policy": "平台隐私协议",
  "privacy_policy": "平台隐私协议",
  "terms-of-service": "平台服务条款",
  "terms_of_service": "平台服务条款",
  agreement: "法律协议",
  policy: "合规政策",
};

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "综合文档";
  const raw = String(category).trim();
  if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
  const normalized = raw.toLowerCase().replace(/_/g, "-");
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];
  if (normalized.includes("privacy")) return "平台隐私协议";
  if (normalized.includes("term")) return "平台服务条款";
  if (normalized.includes("guide")) return "使用指南";
  if (normalized.includes("api")) return "API 文档";
  if (normalized.includes("faq")) return "常见问题";
  if (normalized.includes("system")) return "系统文档";
  return raw;
}

const CATEGORY_ICONS: Record<string, any> = {
  "user-guide": Book,
  "api-doc": FileCode,
  "system-doc": Settings,
  faq: HelpCircle,
  announcement: Bell,
  "privacy-policy": BookOpen,
  "terms-of-service": FileText,
};

export function getCategoryIcon(category: string | null | undefined): any {
  if (!category) return FileText;
  const raw = String(category).trim();
  if (CATEGORY_ICONS[raw]) return CATEGORY_ICONS[raw];
  const normalized = raw.toLowerCase().replace(/_/g, "-");
  if (CATEGORY_ICONS[normalized]) return CATEGORY_ICONS[normalized];
  if (normalized.includes("privacy")) return BookOpen;
  if (normalized.includes("term")) return FileText;
  if (normalized.includes("guide")) return Book;
  if (normalized.includes("api")) return FileCode;
  if (normalized.includes("faq")) return HelpCircle;
  if (normalized.includes("system")) return Settings;
  return FileText;
}

const STANDARD_CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: "user-guide", label: "用户指南", icon: Book },
  { key: "api-doc", label: "API 文档", icon: FileCode },
  { key: "system-doc", label: "系统文档", icon: Settings },
  { key: "faq", label: "常见问题", icon: HelpCircle },
  { key: "announcement", label: "官方公告", icon: Bell },
  { key: "privacy-policy", label: "平台隐私协议", icon: BookOpen },
  { key: "terms-of-service", label: "服务条款", icon: FileText },
];

export default function AdminDocumentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [summary, setSummary] = useState<DocumentSummary>({
    totalDocs: 0,
    publishedDocs: 0,
    unPublishedDocs: 0,
    totalViews: 0,
    categoryCounts: {},
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPublished, setFilterPublished] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
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

  const loadDocuments = async (isSilent: boolean = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
      }
      const authToken = getAuthToken();

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        ...(searchQuery.trim() && { search: searchQuery.trim() }),
        ...(filterCategory && { category: filterCategory }),
        ...(filterPublished && { isPublished: filterPublished }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const res = await fetch(`/api/admin/documents?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.data.documents || []);
        setTotalPages(data.data.totalPages || 1);
        setTotal(data.data.total || 0);
        if (data.data.summary) {
          setSummary(data.data.summary);
        }
      } else {
        const errorText = await res.text();
        try {
          const error = JSON.parse(errorText);
          toast.error(error.error || error.message || "加载文档失败");
        } catch {
          toast.error("加载文档失败");
        }
      }
    } catch (error) {
      console.error("Load documents error:", error);
      toast.error("加载失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [currentPage, searchQuery, filterCategory, filterPublished, startDate, endDate]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterCategory("");
    setFilterPublished("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const handleCopyDocLink = (docId: string, title: string) => {
    const url = `${window.location.origin}/docs#doc-${docId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(docId);
    toast.success(`《${title}》访问链接已复制到剪贴板`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTogglePublished = async (id: string, isPublished: boolean) => {
    const action = isPublished ? "下架" : "上架";
    setConfirmModal({
      isOpen: true,
      title: `${action}确认`,
      message: `${action}后，用户将${isPublished ? "无法" : "可以"}查看此文档。\n\n请确认是否继续？`,
      type: "info",
      onConfirm: async () => {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === id ? { ...doc, isPublished: !isPublished } : doc
          )
        );
        try {
          const authToken = getAuthToken();

          const res = await fetch(`/api/admin/documents?id=${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              id,
              isPublished: !isPublished,
            }),
          });

          if (res.ok) {
            toast.success(isPublished ? "已下架" : "已上架");
            loadDocuments(true);
          } else {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === id ? { ...doc, isPublished } : doc
              )
            );
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
          const authToken = getAuthToken();

          const res = await fetch(`/api/admin/documents?id=${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authToken}`,
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
      category: "user-guide",
      tags: "",
      isPublished: true,
      sortOrder:
        documents.length > 0
          ? Math.max(...documents.map((d) => d.sortOrder || 0)) + 1
          : 1,
      errors: {},
    });
    setEditingDoc(null);
    setEditorTab("edit");
    setShowCreateModal(true);
  };

  const openEditModal = (doc: Document) => {
    setFormData({
      title: doc.title,
      content: doc.content || "",
      category: doc.category || "user-guide",
      tags: doc.tags || "",
      isPublished: doc.isPublished,
      sortOrder: doc.sortOrder ?? 0,
      errors: {},
    });
    setEditingDoc(doc);
    setEditorTab("edit");
    setShowCreateModal(true);
  };

  // 快捷插入 Markdown 语法标号
  const handleInsertMarkdown = (prefix: string, suffix: string = "") => {
    const current = formData.content || "";
    setFormData((prev) => ({
      ...prev,
      content: current ? `${current}\n${prefix}${suffix}` : `${prefix}${suffix}`,
      errors: { ...prev.errors, content: "" },
    }));
  };

  // 表单字段合法性实时检验
  const isTitleValid =
    formData.title.trim().length >= 2 && formData.title.trim().length <= 50;
  const isCategoryValid = Boolean(formData.category);
  const isContentValid =
    formData.content.trim().length >= 5 && formData.content.length <= 20000;
  const isTagsValid = (formData.tags || "").length <= 100;
  const isFormValid =
    isTitleValid && isCategoryValid && isContentValid && isTagsValid;

  const handleSubmit = async (targetPublished?: boolean) => {
    const newErrors: Record<string, string> = {};

    if (!formData.title || !formData.title.trim()) {
      newErrors.title = "请输入文档标题 (2-50 字)";
    } else if (formData.title.trim().length < 2) {
      newErrors.title = "文档标题至少需要 2 个字符";
    } else if (formData.title.trim().length > 50) {
      newErrors.title = "文档标题不能超过 50 个字符";
    }

    if (!formData.category) {
      newErrors.category = "请选择归属分类";
    }

    if (!formData.content || !formData.content.trim()) {
      newErrors.content = "文档正文内容不能为空";
    } else if (formData.content.trim().length < 5) {
      newErrors.content = "文档正文内容至少需要 5 个字符";
    } else if (formData.content.length > 20000) {
      newErrors.content = "文档正文内容不能超过 20,000 字";
    }

    if ((formData.tags || "").length > 100) {
      newErrors.tags = "标签内容总长度不能超过 100 字";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      toast.error("表单包含未通过验证的字段，请核对后重新提交");
      return;
    }

    setSubmitting(true);

    // 计算最终发布状态
    const finalPublished =
      targetPublished !== undefined ? targetPublished : formData.isPublished;

    try {
      const authToken = getAuthToken();
      const url = editingDoc
        ? `/api/admin/documents?id=${editingDoc.id}`
        : "/api/admin/documents";

      const method = editingDoc ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: formData.content.trim(),
          category: formData.category,
          tags: (formData.tags || "").trim(),
          isPublished: finalPublished,
          sortOrder: Number(formData.sortOrder) || 0,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (finalPublished) {
          toast.success(editingDoc ? "文档已成功更新并发布上线！" : "新知识文档已立即发布上线！");
        } else {
          toast.success(editingDoc ? "文档草稿已更新保存！" : "文档已成功保存为未发布草稿！");
        }
        setShowCreateModal(false);
        loadDocuments(true);
      } else {
        toast.error(data.error || data.message || "保存文档失败");
      }
    } catch (error) {
      console.error("Submit document error:", error);
      toast.error("网络异常，提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 轻量级 Markdown 排版渲染器（保证后台预览排版美观、安全、无外部臃肿依赖）
  const renderMarkdownContent = (text: string) => {
    if (!text) return <p className="text-slate-400 italic">暂无正文内容</p>;

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    lines.forEach((line, idx) => {
      // 代码块检测
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${idx}`}
              className="p-3 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto my-2 border border-slate-800"
            >
              <code>{codeBuffer.join("\n")}</code>
            </pre>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // 标题
      if (line.startsWith("# ")) {
        elements.push(
          <h2
            key={idx}
            className="text-lg font-black text-slate-900 border-b border-slate-200 pb-1.5 mt-4 mb-2"
          >
            {line.replace("# ", "")}
          </h2>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h3
            key={idx}
            className="text-base font-bold text-slate-800 border-b border-slate-100 pb-1 mt-3 mb-1.5"
          >
            {line.replace("## ", "")}
          </h3>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h4 key={idx} className="text-sm font-bold text-[#3182ce] mt-2 mb-1">
            {line.replace("### ", "")}
          </h4>
        );
      } else if (line.startsWith("> ")) {
        // 引用块
        elements.push(
          <blockquote
            key={idx}
            className="border-l-4 border-[#3182ce] pl-3 py-1 bg-blue-50/50 text-xs text-slate-700 rounded-r-lg my-2 font-medium"
          >
            {line.replace("> ", "")}
          </blockquote>
        );
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        // 列表
        elements.push(
          <li key={idx} className="ml-4 list-disc text-xs text-slate-700 my-0.5">
            {line.substring(2)}
          </li>
        );
      } else if (line.trim() === "---") {
        elements.push(<hr key={idx} className="my-3 border-slate-200" />);
      } else if (line.trim() === "") {
        elements.push(<div key={idx} className="h-2" />);
      } else {
        // 普通段落，支持行内加粗和行内代码
        elements.push(
          <p key={idx} className="text-xs text-slate-700 leading-relaxed my-1">
            {line}
          </p>
        );
      }
    });

    if (inCodeBlock && codeBuffer.length > 0) {
      elements.push(
        <pre
          key="code-last"
          className="p-3 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto my-2 border border-slate-800"
        >
          <code>{codeBuffer.join("\n")}</code>
        </pre>
      );
    }

    return elements;
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 pb-12 font-sans text-left">
      {/* 主页面容器 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* 顶部标头 Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  帮助与知识文档中心 (Docs & Knowledge)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80">
                  知识库引擎
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                集中编排与纳管系统用户指南、API 开发者手册、架构文档与官方公告
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/docs"
              target="_blank"
              className="h-9 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="在新标签页中访问前台公开文档中心"
            >
              <FileCode className="w-4 h-4 text-[#3182ce]" />
              <span>公开文档中心</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              href="/help"
              target="_blank"
              className="h-9 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              title="在新标签页中访问前台帮助中心"
            >
              <HelpCircle className="w-4 h-4 text-[#3182ce]" />
              <span>前台帮助中心</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <button
              onClick={() => loadDocuments()}
              disabled={loading}
              className="h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all inline-flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              title="刷新文档数据"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* 4 大标准 Bento 指标统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                知识文档总数
              </div>
              <div className="text-2xl font-black font-mono text-[#3182ce]">
                {summary.totalDocs}{" "}
                <span className="text-xs font-normal text-slate-400">篇</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                全库收录知识资产
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                已发布上线
              </div>
              <div className="text-2xl font-black font-mono text-emerald-600">
                {summary.publishedDocs}{" "}
                <span className="text-xs font-normal text-slate-400">篇</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                上线率{" "}
                {summary.totalDocs > 0
                  ? Math.round(
                      (summary.publishedDocs / summary.totalDocs) * 100
                    )
                  : 0}
                %
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                未发布草稿
              </div>
              <div className="text-2xl font-black font-mono text-amber-600">
                {summary.unPublishedDocs}{" "}
                <span className="text-xs font-normal text-slate-400">篇</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                待完善或维护中
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">
                全网累计阅读量
              </div>
              <div className="text-2xl font-black font-mono text-purple-600">
                {summary.totalViews}{" "}
                <span className="text-xs font-normal text-slate-400">次</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                用户查阅点击频次
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Eye className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 搜索与多维筛选卡片 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 flex-wrap">
            {/* 左侧筛选控件群 */}
            <div className="flex items-center gap-2.5 flex-wrap flex-1">
              {/* 搜索输入框 */}
              <div className="relative min-w-[220px] flex-1 sm:flex-initial sm:w-64">
                <input
                  type="text"
                  placeholder="搜索文档标题或标签..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-slate-50/50 focus:bg-white"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              {/* 分类筛选 */}
              <div className="w-36 shrink-0">
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                >
                  <option value="">全部分类</option>
                  <option value="user-guide">用户指南</option>
                  <option value="api-doc">API 文档</option>
                  <option value="system-doc">系统文档</option>
                  <option value="faq">常见问题</option>
                  <option value="announcement">官方公告</option>
                  <option value="privacy-policy">平台隐私协议</option>
                  <option value="terms-of-service">服务条款</option>
                </select>
              </div>

              {/* 状态筛选 */}
              <div className="w-36 shrink-0">
                <select
                  value={filterPublished}
                  onChange={(e) => {
                    setFilterPublished(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                >
                  <option value="">全部发布状态</option>
                  <option value="true">🟢 已发布上线</option>
                  <option value="false">⚪ 未发布草稿</option>
                </select>
              </div>

              {/* 创建起止时间筛选 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-32 px-2 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium text-slate-700 bg-slate-50/50 focus:bg-white cursor-pointer"
                  title="起始创建时间"
                />
                <span className="text-xs text-slate-400 font-bold">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-32 px-2 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium text-slate-700 bg-slate-50/50 focus:bg-white cursor-pointer"
                  title="截止创建时间"
                />
              </div>

              {/* 重置筛选按钮 (独立无挤压) */}
              {(searchQuery || filterCategory || filterPublished || startDate || endDate) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                  title="重置所有筛选条件"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重置</span>
                </button>
              )}
            </div>

            {/* 右侧核心主操作：新增知识文档按钮 */}
            <div className="shrink-0 flex items-center justify-end">
              <button
                onClick={openCreateModal}
                className="h-10 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>新增知识文档</span>
              </button>
            </div>
          </div>

          {/* 快捷分类胶囊栏 (Pills) */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-100 overflow-x-auto pb-0.5 text-xs">
            <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap mr-1 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              <span>快速分类:</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setFilterCategory("");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                filterCategory === ""
                  ? "bg-[#3182ce] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>全部文档</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  filterCategory === ""
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {summary.totalDocs}
              </span>
            </button>

            {STANDARD_CATEGORIES.map((cat) => {
              const count =
                (summary.categoryCounts[cat.key] || 0) +
                (summary.categoryCounts[cat.key.replace(/-/g, "_")] || 0);
              const Icon = cat.icon;
              const isSelected = filterCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setFilterCategory(cat.key);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 文档列表卡片与表格 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-3"></div>
              <p className="text-xs text-slate-500 font-bold">
                正在加载知识文档数据...
              </p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-black text-slate-800 mb-1">
                暂未检索到知识文档
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                当前筛选条件下没有匹配的数据，您可以尝试重置筛选或新增一篇知识文档。
              </p>
              <div className="flex items-center justify-center gap-3">
                {(searchQuery ||
                  filterCategory ||
                  filterPublished ||
                  startDate ||
                  endDate) && (
                  <button
                    onClick={handleResetFilters}
                    className="px-3.5 h-8.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    重置所有筛选
                  </button>
                )}
                <button
                  onClick={openCreateModal}
                  className="px-4 h-8.5 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>立即新增文档</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1020px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-5 whitespace-nowrap">
                      文档基本信息与标签
                    </th>
                    <th className="py-3 px-5 whitespace-nowrap">文档分类</th>
                    <th className="py-3 px-5 whitespace-nowrap">发布状态</th>
                    <th className="py-3 px-5 whitespace-nowrap">累计浏览</th>
                    <th className="py-3 px-5 whitespace-nowrap">维护作者</th>
                    <th className="py-3 px-5 whitespace-nowrap">更新时间</th>
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                      业务操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {documents.map((doc) => {
                    const IconComponent = getCategoryIcon(doc.category);
                    const categoryLabel = getCategoryLabel(doc.category);
                    return (
                      <tr
                        key={doc.id}
                        className="hover:bg-blue-50/30 transition-colors group"
                      >
                        {/* 标题与基本信息 */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0 mt-0.5">
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="font-bold text-slate-800 hover:text-[#3182ce] cursor-pointer transition-colors max-w-[320px] truncate block"
                                  title={doc.title}
                                  onClick={() => setPreviewDoc(doc)}
                                >
                                  {doc.title}
                                </span>
                                <span
                                  className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0"
                                  title={`排序权重：${doc.sortOrder}`}
                                >
                                  #{doc.sortOrder}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {doc.tags ? (
                                  doc.tags.split(/[,，]/).map((tag, tIdx) => (
                                    <span
                                      key={tIdx}
                                      className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium"
                                    >
                                      #{tag.trim()}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    未配置标签
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 分类 (100% 映射标准中文) */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-blue-50 text-[#3182ce] border border-blue-200/80 text-xs font-bold rounded-lg inline-flex items-center gap-1.5">
                            <IconComponent className="w-3.5 h-3.5 shrink-0" />
                            <span>{categoryLabel}</span>
                          </span>
                        </td>

                        {/* 发布状态 */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          {doc.isPublished ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>已发布上线</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              <span>未发布草稿</span>
                            </span>
                          )}
                        </td>

                        {/* 浏览量 */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-slate-600 font-mono font-bold">
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>{doc.viewCount}</span>
                          </div>
                        </td>

                        {/* 维护作者 */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{doc.user?.name || doc.user?.email || "系统官方"}</span>
                          </div>
                        </td>

                        {/* 更新时间 */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="text-[11px] text-slate-500 font-mono">
                            {new Date(doc.updatedAt || doc.createdAt).toLocaleString(
                              "zh-CN",
                              { hour12: false }
                            )}
                          </div>
                        </td>

                        {/* 操作列 (严格依据发布状态隔离) */}
                        <td className="sticky right-0 bg-white/95 group-hover:bg-blue-50/95 backdrop-blur-xs z-10 py-3.5 px-5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 阅读预览（无论上线还是草稿均可查阅） */}
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="px-2.5 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="在后台弹出模态框预览 Markdown 渲染排版"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>预览</span>
                            </button>

                            {/* 状态控制：上线文档可下架为草稿；草稿文档可发布上线 */}
                            <button
                              onClick={() =>
                                handleTogglePublished(doc.id, doc.isPublished)
                              }
                              className={`px-2.5 h-7 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer ${
                                doc.isPublished
                                  ? "bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white"
                                  : "bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white"
                              }`}
                              title={
                                doc.isPublished
                                  ? "下架此文档转为草稿，下架后方可重新编辑或删除"
                                  : "立即发布上线此文档"
                              }
                            >
                              {doc.isPublished ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>下架</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>发布</span>
                                </>
                              )}
                            </button>

                            {/* 核心业务控制：已发布上线的文档不可直接编辑与删除（彻底隐藏按钮，绝不置灰误导） */}
                            {!doc.isPublished && (
                              <>
                                {/* 编辑草稿 */}
                                <button
                                  onClick={() => openEditModal(doc)}
                                  className="px-2.5 h-7 bg-blue-50 hover:bg-[#3182ce] text-[#3182ce] hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  title="编辑草稿内容与分类"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>编辑</span>
                                </button>

                                {/* 删除草稿（带有清晰文字描述） */}
                                <button
                                  onClick={() => handleDelete(doc.id)}
                                  className="px-2.5 h-7 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  title="永久删除此文档草稿"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>删除</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 统一分页组件容器：提供自适应滚动与足够间距，杜绝截断 */}
          {total > 0 && (
            <div className="p-4 border-t border-slate-100 w-full overflow-x-auto">
              <Pagination
                currentPage={currentPage}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={(page) => setCurrentPage(page)}
                itemLabel="篇文档"
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑文档 顶级规范模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* 模态框知性蓝渐变头部 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-white backdrop-blur-xs">
                  {editingDoc ? (
                    <Edit className="w-5 h-5" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingDoc ? "编辑知识文档" : "新增知识文档"}
                  </h3>
                  <p className="text-[11px] text-blue-100/80 font-medium">
                    {editingDoc
                      ? `当前正在修改：《${editingDoc.title}》`
                      : "编写并发布系统使用手册、API 说明或常见疑问解答"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 模态框主体内容（Bento 卡片分组） */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[#f0f8ff]/50">
              {/* 卡片 1：基础元数据与分类 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    文档基础元数据与归属
                  </h4>
                </div>

                {/* 文档标题 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>文档标题</span>
                      <span className="text-red-500 font-black">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                        formData.title.trim().length > 50
                          ? "bg-red-50 text-red-600 font-bold border border-red-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {formData.title.trim().length} / 50 字
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={50}
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        title: e.target.value,
                        errors: { ...formData.errors, title: "" },
                      })
                    }
                    placeholder="如：知阁系统快速入门指南、REST API 认证接口说明（最多50字）"
                    className={`w-full px-3.5 h-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white ${
                      formData.errors?.title
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-[#3182ce]"
                    }`}
                  />
                  {formData.errors?.title && (
                    <p className="mt-1 text-[11px] text-red-500 font-bold">
                      {formData.errors.title}
                    </p>
                  )}
                </div>

                {/* 分类与排序权重双列 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 分类 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      文档归属分类 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          category: e.target.value,
                          errors: { ...formData.errors, category: "" },
                        })
                      }
                      className="w-full px-3 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                    >
                      <option value="user-guide">📘 用户指南 (User Guide)</option>
                      <option value="api-doc">💻 API 开发者文档 (API Docs)</option>
                      <option value="system-doc">⚙️ 系统架构文档 (System Docs)</option>
                      <option value="faq">❓ 常见问题汇总 (FAQ)</option>
                      <option value="announcement">📢 官方更新公告 (Announcement)</option>
                      <option value="privacy-policy">🛡️ 平台隐私协议 (Privacy Policy)</option>
                      <option value="terms-of-service">📜 服务条款 (Terms of Service)</option>
                    </select>
                  </div>

                  {/* 排序权重 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        排序权重 (数值越小越靠前)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        用于前台目录排序
                      </span>
                    </div>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sortOrder: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white font-mono"
                    />
                  </div>
                </div>

                {/* 标签 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      文档标签 (Tags，支持中英文逗号分隔)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      最多100字
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={100}
                    value={formData.tags}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tags: e.target.value,
                        errors: { ...formData.errors, tags: "" },
                      })
                    }
                    placeholder="如：入门指南, 快速配置, 接口认证, 常见报错"
                    className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white"
                  />
                  {/* 常用热门标签快捷点选 */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
                    <span className="text-slate-400">快捷填充:</span>
                    {["新手教程", "系统设置", "API对接", "权限配置", "故障排除"].map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const tags = formData.tags.trim();
                            if (!tags.includes(preset)) {
                              setFormData({
                                ...formData,
                                tags: tags ? `${tags}, ${preset}` : preset,
                              });
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
                        >
                          +{preset}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* 卡片 2：正文内容编辑器与实时预览 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-3.5 rounded-full bg-emerald-500" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      文档正文排版 (Markdown 语法)
                    </h4>
                    <span className="text-red-500 font-black">*</span>
                  </div>

                  {/* 编辑 / 预览 Tab 切换 */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEditorTab("edit")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        editorTab === "edit"
                          ? "bg-white text-[#3182ce] shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      📝 编辑模式
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("preview")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        editorTab === "preview"
                          ? "bg-white text-[#3182ce] shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      👁️ 实时效果预览
                    </button>
                  </div>
                </div>

                {editorTab === "edit" ? (
                  <>
                    {/* Markdown 语法快捷插入工具条 */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">
                        格式助手:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("## ", "二级标题")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        H2 标题
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("### ", "三级标题")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        H3 标题
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("**加粗文字**")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        B 加粗
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("- 列表项")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        • 无序列表
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertMarkdown("```bash\n# 在此输入示例命令\n```")
                        }
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        &lt;/&gt; 代码块
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("> 重要提示或注意事项")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        ” 引用提示
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertMarkdown("---")}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                      >
                        — 分割线
                      </button>
                    </div>

                    {/* 正文输入文本域 */}
                    <div>
                      <textarea
                        value={formData.content}
                        maxLength={20000}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            content: e.target.value,
                            errors: { ...formData.errors, content: "" },
                          })
                        }
                        rows={13}
                        placeholder="# 文档大纲标题&#10;&#10;## 1. 概述&#10;在这里详述该指南的核心背景与适用场景...&#10;&#10;## 2. 步骤指引&#10;- 第一步：前往控制台&#10;- 第二步：配置相关参数&#10;&#10;```bash&#10;curl -X GET 'https://api.zhige.com/v1/ping'&#10;```"
                        className={`w-full p-3.5 bg-slate-50/50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-mono text-slate-800 transition-all leading-relaxed focus:bg-white resize-y ${
                          formData.errors?.content
                            ? "border-red-400 focus:border-red-500"
                            : "border-slate-200 focus:border-[#3182ce]"
                        }`}
                      />
                      <div className="flex items-center justify-between mt-1 text-[11px]">
                        {formData.errors?.content ? (
                          <span className="text-red-500 font-bold">
                            {formData.errors.content}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            支持完整的 Markdown 标记与代码块高亮排版
                          </span>
                        )}
                        <span
                          className={`font-mono px-2 py-0.5 rounded ${
                            formData.content.length > 20000
                              ? "bg-red-50 text-red-600 font-bold"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {formData.content.length} / 20,000 字
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="min-h-[300px] max-h-[420px] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="mb-3 pb-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">
                        排版渲染预览效果
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formData.content.length} 字符
                      </span>
                    </div>
                    {renderMarkdownContent(formData.content)}
                  </div>
                )}
              </div>

              {/* 卡片 3：发布与访问状态 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-2 h-3.5 rounded-full bg-purple-500" />
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    发布控制与前台公开可见性
                  </h4>
                </div>

                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors select-none">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                        formData.isPublished
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {formData.isPublished ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        立即公开并设为发布上线状态
                      </span>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        发布后，普通用户与开发者可在前台帮助中心或文档专区查阅此内容
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.isPublished}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isPublished: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce] cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* 模态框操作底部 */}
            <div className="bg-white border-t border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="text-xs font-medium">
                {!isTitleValid ? (
                  <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>请输入 2-50 字的文档标题</span>
                  </span>
                ) : !isContentValid ? (
                  <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>正文内容至少需要 5 个字符，且不能超过 20,000 字</span>
                  </span>
                ) : !isTagsValid ? (
                  <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>标签总长度不能超过 100 字</span>
                  </span>
                ) : (
                  <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>表单填写符合规范要求</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                {/* 保存为草稿通道 */}
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={submitting || !isFormValid}
                  className="px-4 h-9 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:cursor-not-allowed text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="暂不向前台公开，保存到数据库作为草稿"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>保存为草稿</span>
                </button>
                {/* 立即发布上线通道 */}
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={submitting || !isFormValid}
                  className="px-5 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="立即保存并在前台文档中心发布上线"
                >
                  {submitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>立即发布上线</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 独立文档阅读预览模态框 (Document Preview) */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* 模态框头部：知性蓝品牌渐变，与全站UI系统保持绝对统一 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-white shrink-0 backdrop-blur-xs">
                  {(() => {
                    const CategoryIcon = getCategoryIcon(previewDoc.category);
                    return <CategoryIcon className="w-5 h-5 text-white" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/30 backdrop-blur-xs">
                      {getCategoryLabel(previewDoc.category)}
                    </span>
                    <h3 className="text-sm font-black truncate max-w-[420px] text-white">
                      {previewDoc.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-blue-100/90 mt-1 font-medium">
                    <span>
                      作者: {previewDoc.user?.name || previewDoc.user?.email || "系统官方"}
                    </span>
                    <span>•</span>
                    <span>浏览: {previewDoc.viewCount} 次</span>
                    <span>•</span>
                    <span>
                      更新于:{" "}
                      {new Date(
                        previewDoc.updatedAt || previewDoc.createdAt
                      ).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 预览正文区 */}
            <div className="p-6 overflow-y-auto flex-1 bg-white space-y-3">
              {renderMarkdownContent(previewDoc.content)}
            </div>

            {/* 底部操作区 */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyDocLink(previewDoc.id, previewDoc.title)}
                  className="px-3 h-8 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === previewDoc.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">已复制链接</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>复制文档访问链接</span>
                    </>
                  )}
                </button>

                <Link
                  href={`/docs#doc-${previewDoc.id}`}
                  target="_blank"
                  className="px-3 h-8 bg-white border border-slate-200 hover:bg-slate-100 text-[#3182ce] text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>前台新窗口打开</span>
                </Link>
              </div>

              <div className="flex items-center gap-2">
                {!previewDoc.isPublished ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewDoc;
                      setPreviewDoc(null);
                      openEditModal(target);
                    }}
                    className="px-4 h-8 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>前往编辑</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const targetId = previewDoc.id;
                      setPreviewDoc(null);
                      await handleTogglePublished(targetId, true);
                    }}
                    className="px-3.5 h-8 bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer border border-amber-200 hover:border-amber-500"
                    title="下架此文档转为草稿，之后可进行编辑或删除"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>下架为草稿</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="px-3.5 h-8 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  关闭
                </button>
              </div>
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
