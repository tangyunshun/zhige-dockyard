"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  AlertTriangle,
  Copy,
  Check,
  Share2,
  X,
  Clock,
  User,
  Tag,
  ArrowUpDown,
  History,
  Building2,
  Database,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Lock,
} from "lucide-react";

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string;
  summary?: string;
  codeSample?: string;
  relatedLink?: string;
  helpfulCount?: number;
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
  customCategories?: Array<{ key: string; label: string; description?: string }>;
}

interface DocumentFormData {
  title: string;
  content: string;
  category: string;
  tags: string;
  summary: string;
  codeSample: string;
  relatedLinkLabel: string;
  relatedLinkPath: string;
  isPublished: boolean;
  sortOrder: number;
}

interface SystemDocumentHistoryItem {
  id: string;
  documentId: string;
  title: string;
  content: string | null;
  category: string;
  tags: string | null;
  isPublished: boolean;
  sortOrder: number;
  editorId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "user-guide": "用户指南·快速入门",
  "user_guide": "用户指南·快速入门",
  guide: "用户指南·快速入门",
  start: "用户指南·快速入门",
  "api-doc": "接口开发与接入文档",
  "api_doc": "接口开发与接入文档",
  api: "接口开发与接入文档",
  developer: "接口开发与接入文档",
  workspace: "工作空间治理与权限说明",
  workspaces: "工作空间治理与权限说明",
  "system-doc": "企业部署与系统运行手册",
  "system_doc": "企业部署与系统运行手册",
  system: "企业部署与系统运行手册",
  enterprise: "企业部署与系统运行手册",
  knowledge: "知识库与组件规范指南",
  faq: "常见问题与故障排查",
  help: "常见问题与故障排查",
  announcement: "平台官方更新公告",
  notice: "平台官方更新公告",
  "privacy-policy": "平台用户隐私保护协议",
  "privacy_policy": "平台用户隐私保护协议",
  "terms-of-service": "平台用户服务条款协议",
  "terms_of_service": "平台用户服务条款协议",
  agreement: "平台用户服务条款协议",
  policy: "平台用户隐私保护协议",
};

// 数据库动态自定义分类运行时缓存（确保列表Badge、弹窗、快照等所有联动处100%展示中文名称）
export const DYNAMIC_CATEGORY_CACHE = new Map<string, string>();

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "综合知识文档";
  const raw = String(category).trim();
  // 1. 优先从数据库动态分类缓存匹配
  if (DYNAMIC_CATEGORY_CACHE.has(raw)) return DYNAMIC_CATEGORY_CACHE.get(raw)!;
  if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
  const normalized = raw.toLowerCase().replace(/_/g, "-");
  if (DYNAMIC_CATEGORY_CACHE.has(normalized)) return DYNAMIC_CATEGORY_CACHE.get(normalized)!;
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];
  if (normalized.includes("privacy")) return "平台用户隐私保护协议";
  if (normalized.includes("term")) return "平台用户服务条款协议";
  if (normalized.includes("guide")) return "用户指南·快速入门";
  if (normalized.includes("api")) return "接口开发与接入文档";
  if (normalized.includes("faq")) return "常见问题与故障排查";
  if (normalized.includes("system") || normalized.includes("enterprise")) return "企业部署与系统运行手册";
  if (normalized.includes("workspace")) return "工作空间治理与权限说明";
  if (normalized.includes("knowledge")) return "知识库与组件规范指南";
  if (normalized.includes("announcement") || normalized.includes("notice")) return "平台官方更新公告";
  return raw;
}

const CATEGORY_ICONS: Record<string, any> = {
  "user-guide": Book,
  "api-doc": FileCode,
  "system-doc": Settings,
  workspace: Building2,
  knowledge: Database,
  enterprise: Building2,
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
  if (normalized.includes("system") || normalized.includes("enterprise")) return Settings;
  if (normalized.includes("workspace")) return Building2;
  if (normalized.includes("knowledge")) return Database;
  return FileText;
}

const STANDARD_CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: "user-guide", label: "用户指南·快速入门", icon: Book },
  { key: "api-doc", label: "接口开发与接入文档", icon: FileCode },
  { key: "workspace", label: "工作空间治理与权限说明", icon: Building2 },
  { key: "system-doc", label: "企业部署与系统运行手册", icon: Settings },
  { key: "knowledge", label: "知识库与组件规范指南", icon: Database },
  { key: "faq", label: "常见问题与故障排查", icon: HelpCircle },
  { key: "announcement", label: "平台官方更新公告", icon: Bell },
  { key: "privacy-policy", label: "平台用户隐私保护协议", icon: BookOpen },
  { key: "terms-of-service", label: "平台用户服务条款协议", icon: FileText },
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
  const [historyDoc, setHistoryDoc] = useState<Document | null>(null);
  const [historyList, setHistoryList] = useState<SystemDocumentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
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
    summary: "",
    codeSample: "",
    relatedLinkLabel: "",
    relatedLinkPath: "",
    isPublished: false,
    sortOrder: 0,
    errors: {},
  });
  const [submitting, setSubmitting] = useState(false);

  // 数据库持久化的自定义分类列表（从数据库 systemconfig 动态读取）
  const [customCategories, setCustomCategories] = useState<
    Array<{ key: string; label: string; description?: string; isCustom?: boolean }>
  >([]);

  // 弹窗内快捷新建业务分类面板状态
  const [showInlineNewCategory, setShowInlineNewCategory] = useState(false);
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatKey, setNewCatKey] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [catSubmitting, setCatSubmitting] = useState(false);

  // 顶部分类胶囊栏与全局快捷重命名分类模态框状态
  const [editCatModal, setEditCatModal] = useState<{
    isOpen: boolean;
    key: string;
    label: string;
    description: string;
    docCount: number;
    submitting: boolean;
  }>({
    isOpen: false,
    key: "",
    label: "",
    description: "",
    docCount: 0,
    submitting: false,
  });

  // 动态融合数据库中真实存在的分类项（标准分类 + 数据库持久化自定义分类 + 存量文档分类），零静态写死
  const availableCategories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; isCustom?: boolean; icon?: any }>();

    // 1. 系统标准基础分类
    STANDARD_CATEGORIES.forEach((cat) => {
      map.set(cat.key, {
        key: cat.key,
        label: cat.label,
        count: summary?.categoryCounts?.[cat.key] || 0,
        isCustom: false,
        icon: cat.icon,
      });
    });

    // 2. 数据库自定义分类（覆盖或动态注入）
    customCategories.forEach((cat) => {
      const existing = map.get(cat.key);
      map.set(cat.key, {
        key: cat.key,
        label: cat.label,
        count: summary?.categoryCounts?.[cat.key] || (existing?.count || 0),
        isCustom: true,
        icon: Tag,
      });
    });

    // 3. 存量文档中已存在的历史孤儿分类（兼容性兜底）
    if (summary?.categoryCounts) {
      Object.keys(summary.categoryCounts).forEach((k) => {
        if (!map.has(k)) {
          map.set(k, {
            key: k,
            label: getCategoryLabel(k),
            count: summary.categoryCounts[k] || 0,
            isCustom: true,
            icon: Tag,
          });
        }
      });
    }

    return Array.from(map.values());
  }, [summary?.categoryCounts, customCategories]);

  // 新建文档分类提交方法（持久化存入数据库 systemconfig 表，并即时联动选中）
  const handleCreateNewCategory = async () => {
    const trimmedLabel = newCatLabel.trim();
    if (!trimmedLabel) {
      toast.warning("请输入分类中文名称");
      return;
    }
    if (trimmedLabel.length < 2 || trimmedLabel.length > 30) {
      toast.warning("分类名称长度须在 2 到 30 个字之间");
      return;
    }

    try {
      setCatSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/documents/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          label: trimmedLabel,
          key: newCatKey.trim() || undefined,
          description: newCatDesc.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "新建分类失败，请重试");
        return;
      }

      const createdCat = json.data;
      DYNAMIC_CATEGORY_CACHE.set(createdCat.key, createdCat.label);
      DYNAMIC_CATEGORY_CACHE.set(createdCat.key.toLowerCase().replace(/_/g, "-"), createdCat.label);

      setCustomCategories((prev) => {
        if (prev.some((c) => c.key === createdCat.key)) return prev;
        return [...prev, createdCat];
      });

      // 自动在文档表单中选中新分类并清除错误提示
      setFormData((prev) => ({
        ...prev,
        category: createdCat.key,
        errors: { ...prev.errors, category: "" },
      }));

      // 重置新建表单并关闭内联面板
      setNewCatLabel("");
      setNewCatKey("");
      setNewCatDesc("");
      setShowInlineNewCategory(false);

      toast.success(`新业务分类【${createdCat.label}】已成功存入数据库并选中！`);
      // 静默刷新列表与统计指标
      loadDocuments(true);
    } catch (err: any) {
      console.error("创建分类异常:", err);
      toast.error("网络异常，创建分类失败");
    } finally {
      setCatSubmitting(false);
    }
  };

  // 启动自定义分类重命名/编辑
  const handleStartEditCategory = (cat: { key: string; label: string; description?: string }) => {
    setShowInlineNewCategory(true);
    setEditingCategoryKey(cat.key);
    setNewCatLabel(cat.label);
    setNewCatKey(cat.key);
    setNewCatDesc(cat.description || "");
  };

  // 取消分类编辑
  const handleCancelCategoryEdit = () => {
    setEditingCategoryKey(null);
    setNewCatLabel("");
    setNewCatKey("");
    setNewCatDesc("");
  };

  // 提交自定义分类名称与说明修改（持久化写入数据库 systemconfig 表并即时全系统联动）
  const handleUpdateCategory = async () => {
    if (!editingCategoryKey) return;
    const trimmedLabel = newCatLabel.trim();
    if (!trimmedLabel) {
      toast.warning("请输入分类中文名称");
      return;
    }
    if (trimmedLabel.length < 2 || trimmedLabel.length > 30) {
      toast.warning("分类名称长度须在 2 到 30 个字之间");
      return;
    }

    try {
      setCatSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/documents/categories", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          key: editingCategoryKey,
          label: trimmedLabel,
          description: newCatDesc.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "修改分类失败，请重试");
        return;
      }

      const updated = json.data;
      DYNAMIC_CATEGORY_CACHE.set(updated.key, updated.label);
      DYNAMIC_CATEGORY_CACHE.set(updated.key.toLowerCase().replace(/_/g, "-"), updated.label);

      setCustomCategories((prev) =>
        prev.map((c) =>
          c.key === updated.key
            ? { ...c, label: updated.label, description: updated.description }
            : c
        )
      );

      handleCancelCategoryEdit();
      toast.success(json.message || `分类【${updated.label}】名称已更新`);
      loadDocuments(true);
    } catch (err: any) {
      console.error("更新分类异常:", err);
      toast.error("网络异常，修改分类失败");
    } finally {
      setCatSubmitting(false);
    }
  };

  // 打开顶部分类胶囊栏上的自定义分类编辑/重命名模态框
  const handleOpenEditCategoryModal = (cat: {
    key: string;
    label: string;
    description?: string;
    count?: number;
  }) => {
    const targetCustom = customCategories.find((c) => c.key === cat.key);
    const count =
      cat.count !== undefined
        ? cat.count
        : (summary.categoryCounts[cat.key] || 0) +
          (summary.categoryCounts[cat.key.replace(/-/g, "_")] || 0);

    setEditCatModal({
      isOpen: true,
      key: cat.key,
      label: cat.label,
      description: targetCustom?.description || cat.description || "",
      docCount: count,
      submitting: false,
    });
  };

  // 提交分类重命名与描述保存（持久化更新数据库 systemconfig，全平台即时生效）
  const handleSaveEditCategoryModal = async () => {
    if (!editCatModal.key) return;
    const trimmedLabel = editCatModal.label.trim();
    if (!trimmedLabel) {
      toast.warning("请输入分类中文名称");
      return;
    }
    if (trimmedLabel.length < 2 || trimmedLabel.length > 30) {
      toast.warning("分类名称长度须在 2 到 30 个字之间");
      return;
    }

    try {
      setEditCatModal((prev) => ({ ...prev, submitting: true }));
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/documents/categories", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          key: editCatModal.key,
          label: trimmedLabel,
          description: editCatModal.description.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "修改分类失败，请重试");
        setEditCatModal((prev) => ({ ...prev, submitting: false }));
        return;
      }

      const updated = json.data;
      DYNAMIC_CATEGORY_CACHE.set(updated.key, updated.label);
      DYNAMIC_CATEGORY_CACHE.set(
        updated.key.toLowerCase().replace(/_/g, "-"),
        updated.label
      );

      setCustomCategories((prev) =>
        prev.map((c) =>
          c.key === updated.key
            ? { ...c, label: updated.label, description: updated.description }
            : c
        )
      );

      setEditCatModal({
        isOpen: false,
        key: "",
        label: "",
        description: "",
        docCount: 0,
        submitting: false,
      });

      toast.success(json.message || `分类【${updated.label}】名称已更新`);
      loadDocuments(true);
    } catch (err: any) {
      console.error("更新自定义分类异常:", err);
      toast.error("网络异常，修改分类失败");
      setEditCatModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // 删除自定义业务分类（严格业务校验：分类下必须无任何文档，有文档时阻断并提示用户先移除文档）
  const handleDeleteCategory = (catKey: string, catLabel: string, count: number) => {
    // 1. 前置业务强校验：若仍有关联文档，严禁删除，阻断并提示用户移出文档
    if (count > 0) {
      toast.warning(
        `业务分类【${catLabel}】下仍关联 ${count} 篇知识文档，无法直接删除！请先将该分类下的文档迁移至其他分类或移除后再行删除。`
      );
      return;
    }

    // 2. 检查是否为内置标准分类（绝对保护）
    if (STANDARD_CATEGORIES.some((c) => c.key === catKey)) {
      toast.error("系统内置标准业务分类属于平台核心基础设施，受保护不可修改或删除");
      return;
    }

    // 3. 唤起知阁设计系统统一确认模态框（去除生硬拼接机器码，呈现大厂级精致确认卡片）
    setConfirmModal({
      isOpen: true,
      title: "确认删除业务分类",
      message: (
        <div className="space-y-3 pt-1 text-left">
          <div className="p-3 bg-rose-50/80 rounded-xl border border-rose-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-bold text-slate-800 text-sm truncate">
                【{catLabel}】
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-white text-emerald-700 border border-emerald-200 text-[11px] font-bold font-mono shrink-0 shadow-2xs">
              关联文档：0 篇 (可安全删除)
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            确定要从数据库中永久物理移除该业务分类吗？删除后该分类将不再可供选用，此操作不可撤销。
          </p>
        </div>
      ),
      type: "danger",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch(`/api/admin/documents/categories?key=${encodeURIComponent(catKey)}`, {
            method: "DELETE",
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
          });

          const json = await res.json();
          if (!res.ok || !json.success) {
            toast.error(json.error || "删除分类失败");
            return;
          }

          // 同步清理动态字典缓存
          DYNAMIC_CATEGORY_CACHE.delete(catKey);
          DYNAMIC_CATEGORY_CACHE.delete(catKey.toLowerCase().replace(/_/g, "-"));

          // 从当前分类列表中剔除
          setCustomCategories((prev) => prev.filter((c) => c.key !== catKey));

          // 若当前文档弹窗正选中该分类，安全回退至系统默认快速入门
          setFormData((prev) => {
            if (prev.category === catKey) {
              return { ...prev, category: "user-guide" };
            }
            return prev;
          });

          // 若顶部筛选正选中该分类，重置筛选
          if (filterCategory === catKey) {
            setFilterCategory("");
          }

          toast.success(json.message || `分类【${catLabel}】已成功删除`);
          loadDocuments(true);
        } catch (err: any) {
          console.error("删除分类异常:", err);
          toast.error("网络异常，删除分类失败");
        }
      },
    });
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    type: "info" | "warning" | "danger";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {},
  });

  // 上下架专属高级模态框状态（知阁设计系统顶级视觉规范）
  const [publishModal, setPublishModal] = useState<{
    isOpen: boolean;
    doc: Document | null;
    nextStatus: boolean;
    loading: boolean;
  }>({
    isOpen: false,
    doc: null,
    nextStatus: false,
    loading: false,
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
          // 联动注入从数据库拉取的自定义分类字典
          if (Array.isArray(data.data.summary.customCategories)) {
            setCustomCategories(data.data.summary.customCategories);
            data.data.summary.customCategories.forEach((c: any) => {
              if (c?.key && c?.label) {
                DYNAMIC_CATEGORY_CACHE.set(c.key, c.label);
                DYNAMIC_CATEGORY_CACHE.set(c.key.toLowerCase().replace(/_/g, "-"), c.label);
              }
            });
          }
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

  const loadHistory = async (doc: Document) => {
    setHistoryDoc(doc);
    setHistoryLoading(true);
    setHistoryPage(1);
    try {
      const authToken = getAuthToken();
      const res = await fetch(
        `/api/admin/documents?mode=history&documentId=${doc.id}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const list = data.data || [];
        setHistoryList(list);
        // 默认展开最新一条，其余收起保持清爽
        if (list.length > 0) {
          setExpandedHistoryIds(new Set([list[0].id]));
        } else {
          setExpandedHistoryIds(new Set());
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          toast.error(data.error || "登录已过期，请重新登录");
        } else {
          toast.error(data.error || "加载历史版本失败");
        }
      }
    } catch (error) {
      console.error("Load history error:", error);
      toast.error("加载历史版本失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  // 历史版本分页（每页严格 10 条）与展开/收起辅助函数
  const HISTORY_PAGE_SIZE = 10;
  const historyTotalPages = Math.max(1, Math.ceil(historyList.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = historyList.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );

  const toggleExpandHistory = (id: string) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAllHistory = () => {
    setExpandedHistoryIds(new Set(historyList.map((item) => item.id)));
  };

  const collapseAllHistory = () => {
    setExpandedHistoryIds(new Set());
  };

  // 打开知阁顶级规范的上下架确认模态框
  const handleOpenPublishModal = (doc: Document) => {
    setPublishModal({
      isOpen: true,
      doc,
      nextStatus: !doc.isPublished,
      loading: false,
    });
  };

  // 执行上下架状态变更闭环
  const handleExecutePublishToggle = async () => {
    if (!publishModal.doc) return;
    const doc = publishModal.doc;
    const targetStatus = publishModal.nextStatus;
    setPublishModal((prev) => ({ ...prev, loading: true }));

    try {
      const authToken = getAuthToken();
      const res = await fetch(`/api/admin/documents?id=${doc.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          id: doc.id,
          isPublished: targetStatus,
        }),
      });

      if (res.ok) {
        toast.success(
          targetStatus
            ? `文档《${doc.title}》已成功发布上线`
            : `文档《${doc.title}》已下架为草稿，现已开放编辑与删除权限`
        );
        setPublishModal({
          isOpen: false,
          doc: null,
          nextStatus: false,
          loading: false,
        });
        loadDocuments(true);
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || error.message || "状态变更失败");
        setPublishModal((prev) => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error("Toggle published error:", error);
      toast.error("网络异常，状态变更失败");
      setPublishModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleDelete = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) {
      toast.error("文档不存在");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "删除确认",
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

  // 解析数据库中关联链接字段 (JSON: {label, path})
  const parseRelatedLink = (
    raw: string | null | undefined
  ): { label: string; path: string } => {
    if (!raw) return { label: "", path: "" };
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return {
        label: parsed?.label || "",
        path: parsed?.path || "",
      };
    } catch {
      return { label: "", path: "" };
    }
  };

  const openCreateModal = () => {
    setFormData({
      title: "",
      content: "",
      category: "user-guide",
      tags: "",
      summary: "",
      codeSample: "",
      relatedLinkLabel: "",
      relatedLinkPath: "",
      isPublished: true,
      sortOrder:
        documents.length > 0
          ? Math.max(...documents.map((d) => d.sortOrder || 0)) + 1
          : 1,
      errors: {},
    });
    setEditingDoc(null);
    setEditorTab("edit");
    setShowInlineNewCategory(false);
    setNewCatLabel("");
    setNewCatKey("");
    setNewCatDesc("");
    setShowCreateModal(true);
  };

  const openEditModal = (doc: Document) => {
    const related = parseRelatedLink(doc.relatedLink);
    setFormData({
      title: doc.title,
      content: doc.content || "",
      category: doc.category || "user-guide",
      tags: doc.tags || "",
      summary: doc.summary || "",
      codeSample: doc.codeSample || "",
      relatedLinkLabel: related.label,
      relatedLinkPath: related.path,
      isPublished: doc.isPublished,
      sortOrder: doc.sortOrder ?? 0,
      errors: {},
    });
    setEditingDoc(doc);
    setEditorTab("edit");
    setShowInlineNewCategory(false);
    setNewCatLabel("");
    setNewCatKey("");
    setNewCatDesc("");
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
          summary: (formData.summary || "").trim() || undefined,
          codeSample: (formData.codeSample || "").trim() || undefined,
          relatedLink:
            (formData.relatedLinkLabel || "").trim() &&
            (formData.relatedLinkPath || "").trim()
              ? JSON.stringify({
                  label: formData.relatedLinkLabel.trim(),
                  path: formData.relatedLinkPath.trim(),
                })
              : undefined,
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
      <div className="pt-6">
        {/* 顶部标头 Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  帮助与知识文档中心
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

              {/* 分类筛选（动态从数据库分类统计聚合，包含真实文档篇数） */}
              <div className="w-full sm:w-44 sm:shrink-0">
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                >
                  <option value="">全部分类</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label} {cat.count ? `(${cat.count})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 状态筛选 */}
              <div className="w-full sm:w-36 sm:shrink-0">
                <select
                  value={filterPublished}
                  onChange={(e) => {
                    setFilterPublished(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-700 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                >
                  <option value="">全部发布状态</option>
                  <option value="true">已发布上线</option>
                  <option value="false">未发布草稿</option>
                </select>
              </div>

              {/* 创建起止时间筛选 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (v && endDate && v > endDate) setEndDate("");
                    setCurrentPage(1);
                  }}
                  className="w-32 px-2 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium text-slate-700 bg-slate-50/50 focus:bg-white cursor-pointer"
                  title="起始创建时间"
                />
                <span className="text-xs text-slate-400 font-bold">-</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && startDate && v < startDate) return;
                    setEndDate(v);
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

            {availableCategories.map((cat) => {
              const count =
                cat.count !== undefined
                  ? cat.count
                  : (summary.categoryCounts[cat.key] || 0) +
                    (summary.categoryCounts[cat.key.replace(/-/g, "_")] || 0);
              const Icon = cat.icon || Tag;
              const isSelected = filterCategory === cat.key;
              return (
                <div
                  key={cat.key}
                  className={`inline-flex items-center rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isSelected
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setFilterCategory(cat.key);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 inline-flex items-center gap-1.5 cursor-pointer"
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
                  {cat.isCustom && (
                    <div className="inline-flex items-center gap-0.5 pr-2 pl-0.5">
                      <button
                        type="button"
                        title={`编辑/重命名自定义分类【${cat.label}】`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditCategoryModal({ ...cat, count });
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isSelected
                            ? "text-white/80 hover:text-white hover:bg-white/20"
                            : "text-slate-400 hover:text-[#3182ce] hover:bg-blue-50"
                        }`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title={
                          count > 0
                            ? `该分类下仍关联 ${count} 篇文档，需先将文档移出才可删除`
                            : `删除自定义分类【${cat.label}】`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(cat.key, cat.label, count);
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isSelected
                            ? "text-white/80 hover:text-white hover:bg-white/20"
                            : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
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
                              {(doc.summary || doc.codeSample || doc.relatedLink) && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {doc.summary && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                      <FileText className="w-2.5 h-2.5" /> 已配摘要
                                    </span>
                                  )}
                                  {doc.codeSample && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                      <FileCode className="w-2.5 h-2.5" /> 代码示例
                                    </span>
                                  )}
                                  {doc.relatedLink && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                      <ExternalLink className="w-2.5 h-2.5" /> 关联跳转
                                    </span>
                                  )}
                                </div>
                              )}
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

                            {/* 历史版本：查看该文档历次编辑快照 */}
                            <button
                              onClick={() => loadHistory(doc)}
                              className="px-2.5 h-7 bg-indigo-50 hover:bg-indigo-500 text-indigo-700 hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="查看该文档的编辑历史版本"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>历史版本</span>
                            </button>

                            {/* 状态控制：上线文档可下架为草稿；草稿文档可发布上线 */}
                            <button
                              onClick={() => handleOpenPublishModal(doc)}
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
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        文档归属分类 <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowInlineNewCategory(!showInlineNewCategory)}
                        className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showInlineNewCategory ? "收起新建面板" : "新建业务分类"}</span>
                      </button>
                    </div>
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === "__CREATE_NEW_CATEGORY__") {
                          setShowInlineNewCategory(true);
                          return;
                        }
                        setFormData({
                          ...formData,
                          category: e.target.value,
                          errors: { ...formData.errors, category: "" },
                        });
                      }}
                      className="w-full px-3 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white cursor-pointer"
                    >
                      <option value="">-- 请选择归属业务分类 --</option>
                      {availableCategories.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label} {cat.isCustom ? " (自定义)" : ""}
                        </option>
                      ))}
                      <option value="__CREATE_NEW_CATEGORY__" className="text-[#3182ce] font-bold bg-blue-50/60">
                        ➕ 新建自定义业务分类...
                      </option>
                    </select>

                    {/* 业务分类管理与内联拓展面板（支持新建与名称修改，持久化写入数据库 systemconfig 表并自动联动） */}
                    {showInlineNewCategory && (
                      <div className="mt-2.5 p-3.5 rounded-xl border border-blue-200/90 bg-blue-50/50 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></div>
                            <span>
                              {editingCategoryKey ? "修改业务分类名称" : "新建业务分类入库"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {editingCategoryKey ? "（修改后全系统实时生效）" : "（自动持久化至数据库）"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleCancelCategoryEdit();
                              setShowInlineNewCategory(false);
                            }}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="关闭分类管理面板"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {/* 分类中文名称 */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-700">
                                分类名称 <span className="text-red-500">*</span>
                              </span>
                              <span className="text-[10px] text-slate-400">2-30 字</span>
                            </div>
                            <input
                              type="text"
                              value={newCatLabel}
                              onChange={(e) => setNewCatLabel(e.target.value)}
                              placeholder="如：安全运维与合规审计、算力与计费规则"
                              className="w-full px-3 h-8.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                            />
                          </div>

                          {/* 分类标识 Key */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-700">
                                分类代码 Key{" "}
                                <span className="text-slate-400 font-normal">
                                  {editingCategoryKey ? "(唯一标识不可修改)" : "(选填，留空自动生成)"}
                                </span>
                              </span>
                              <span className="text-[10px] text-slate-400">限小写英文与短横线</span>
                            </div>
                            <input
                              type="text"
                              disabled={!!editingCategoryKey}
                              value={newCatKey}
                              onChange={(e) => setNewCatKey(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                              placeholder="如：security-audit、billing-rules"
                              className={`w-full px-3 h-8.5 text-xs font-mono font-medium rounded-lg border ${
                                editingCategoryKey
                                  ? "bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed"
                                  : "text-slate-700 bg-white border-slate-200 focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                              }`}
                            />
                          </div>

                          {/* 简要描述 */}
                          <div>
                            <span className="block text-[11px] font-bold text-slate-700 mb-1">
                              分类简要说明 <span className="text-slate-400 font-normal">(选填)</span>
                            </span>
                            <input
                              type="text"
                              value={newCatDesc}
                              onChange={(e) => setNewCatDesc(e.target.value)}
                              placeholder="简述该分类收录的文档范畴与定位"
                              className="w-full px-3 h-8.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20"
                            />
                          </div>
                        </div>

                        {/* 已有自定义业务分类列表与编辑/安全删除维护 */}
                        {customCategories.length > 0 && (
                          <div className="pt-2 border-t border-blue-100/90 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                              <span>已建自定义业务分类 ({customCategories.length})</span>
                              <span className="text-[10px] text-slate-400 font-normal">支持重命名 · 关联 0 篇可删除</span>
                            </div>
                            <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                              {customCategories.map((c) => {
                                const docCount =
                                  (summary.categoryCounts[c.key] || 0) +
                                  (summary.categoryCounts[c.key.replace(/-/g, "_")] || 0);
                                const isCurrentEditing = editingCategoryKey === c.key;
                                return (
                                  <div
                                    key={c.key}
                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                      isCurrentEditing
                                        ? "bg-blue-100/60 border-blue-300"
                                        : "bg-white border-slate-200 hover:border-blue-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 truncate mr-2 min-w-0">
                                      <Tag className="w-3 h-3 text-[#3182ce] shrink-0" />
                                      <span className="font-bold text-slate-800 truncate">{c.label}</span>
                                      <span className="text-[10px] text-slate-400 font-mono shrink-0">({c.key})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                          docCount > 0
                                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        }`}
                                      >
                                        {docCount > 0 ? `${docCount} 篇` : "0 篇"}
                                      </span>
                                      {/* 编辑名称按钮 */}
                                      <button
                                        type="button"
                                        title={`修改分类【${c.label}】名称`}
                                        onClick={() =>
                                          handleOpenEditCategoryModal({ ...c, count: docCount })
                                        }
                                        className="p-1 rounded text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 transition-colors cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      {/* 删除按钮 */}
                                      <button
                                        type="button"
                                        title={
                                          docCount > 0
                                            ? `该分类下仍关联 ${docCount} 篇文档，需先将文档移出才可删除`
                                            : `从数据库删除分类【${c.label}】`
                                        }
                                        onClick={() => handleDeleteCategory(c.key, c.label, docCount)}
                                        className={`p-1 rounded transition-colors cursor-pointer ${
                                          docCount > 0
                                            ? "text-slate-300 hover:text-amber-600 hover:bg-amber-50"
                                            : "text-red-500 hover:bg-red-50 hover:text-red-600"
                                        }`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 操作按钮组 */}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-blue-100">
                          <button
                            type="button"
                            onClick={() => {
                              handleCancelCategoryEdit();
                              setShowInlineNewCategory(false);
                            }}
                            className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                          >
                            取消
                          </button>
                          {editingCategoryKey ? (
                            <button
                              type="button"
                              onClick={handleUpdateCategory}
                              disabled={catSubmitting || !newCatLabel.trim()}
                              className="px-3 py-1 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                            >
                              {catSubmitting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>更新中...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>保存名称修改</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleCreateNewCategory}
                              disabled={catSubmitting || !newCatLabel.trim()}
                              className="px-3 py-1 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                            >
                              {catSubmitting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>保存入库中...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>确认入库并选中</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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

              {/* 卡片 2：前台文档中心展示增强字段（可选） */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-2 h-3.5 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    前台文档中心展示增强（可选，公开 /docs 页面生效）
                  </h4>
                </div>

                {/* 文档摘要 / 简介 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>文档摘要 / 简介</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        (留空则前台自动截取正文前 120 字)
                      </span>
                    </label>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                        (formData.summary || "").length > 300
                          ? "bg-red-50 text-red-600 font-bold border border-red-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {(formData.summary || "").length} / 300 字
                    </span>
                  </div>
                  <textarea
                    value={formData.summary}
                    maxLength={300}
                    rows={3}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        summary: e.target.value,
                      })
                    }
                    placeholder="用 1-2 句话概括本文档核心要点，将展示在 /docs 文档卡片上…"
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs text-slate-800 font-medium transition-all focus:bg-white resize-y leading-relaxed"
                  />
                </div>

                {/* 代码示例 / cURL 命令 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <FileCode className="w-3.5 h-3.5 text-slate-400" />
                      <span>代码示例内容</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        (展示在文档详情弹层的代码块，支持 curl / JSON / 签名载荷)
                      </span>
                    </label>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                        (formData.codeSample || "").length > 5000
                          ? "bg-red-50 text-red-600 font-bold border border-red-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {(formData.codeSample || "").length} / 5000 字
                    </span>
                  </div>
                  <textarea
                    value={formData.codeSample}
                    maxLength={5000}
                    rows={6}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        codeSample: e.target.value,
                      })
                    }
                    placeholder={'示例：\ncurl -X GET "https://api.zhige-dockyard.com/v1/workspaces" \\\n  -H "Authorization: Bearer zg_live_****" \\\n  -H "Content-Type: application/json"'}
                    className="w-full p-3 bg-slate-900 text-indigo-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/30 text-xs font-mono transition-all resize-y leading-relaxed"
                  />
                </div>

                {/* 关联跳转链接 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    <span>关联跳转链接（按钮文字 + 站内路径，均填才会展示）</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={formData.relatedLinkLabel}
                      maxLength={40}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          relatedLinkLabel: e.target.value,
                        })
                      }
                      placeholder="如：管理 API Keys"
                      className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white"
                    />
                    <input
                      type="text"
                      value={formData.relatedLinkPath}
                      maxLength={200}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          relatedLinkPath: e.target.value,
                        })
                      }
                      placeholder="站内路径，如：/user/api-keys"
                      className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white font-mono"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    保存后作为 JSON 写入数据库，需登录后前台点击方可跳转，如留空则不展示。
                  </p>
                </div>
              </div>

              {/* 卡片 3：正文内容编辑器与实时预览 */}
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
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        editorTab === "edit"
                          ? "bg-white text-[#3182ce] shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      编辑模式
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab("preview")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        editorTab === "preview"
                          ? "bg-white text-[#3182ce] shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      实时效果预览
                    </button>
                  </div>
                </div>

                {editorTab === "edit" ? (
                  <>
                    {/* Markdown 语法快捷插入工具条 */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">
                        格式工具:
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

              {/* 卡片 4：发布与访问状态 */}
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
                    onClick={() => {
                      const target = previewDoc;
                      setPreviewDoc(null);
                      handleOpenPublishModal(target);
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

      {/* 历史版本查看模态框 */}
      {historyDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-indigo-600 to-[#3182ce] text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-white shrink-0 backdrop-blur-xs">
                  <History className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black truncate max-w-[420px] text-white">
                    《{historyDoc.title}》编辑历史
                  </h3>
                  <p className="text-[11px] text-blue-100/90 mt-1 font-medium">
                    每次编辑/上下架前自动保存快照，共 {historyList.length} 个历史版本
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHistoryDoc(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-white space-y-4">
              {historyLoading ? (
                <div className="py-12 text-center text-xs text-slate-500 font-medium flex flex-col items-center justify-center">
                  <Loader2 className="w-6 h-6 text-[#3182ce] animate-spin mb-2" />
                  <span>正在加载历史版本...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-medium">
                  暂无编辑历史记录
                </div>
              ) : (
                <>
                  {/* 顶部统计与全部展开/收起快捷工具栏 */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="text-xs text-slate-500 font-medium">
                      共 <strong className="text-slate-800 font-bold">{historyList.length}</strong> 个历史版本快照
                      {historyTotalPages > 1 && (
                        <span className="ml-2 text-slate-400 font-mono text-[11px]">
                          (当前第 {historyPage} / {historyTotalPages} 页)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={expandAllHistory}
                        className="text-[11px] font-bold text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-slate-100"
                      >
                        全部展开
                      </button>
                      <span className="text-slate-200 text-xs">|</span>
                      <button
                        type="button"
                        onClick={collapseAllHistory}
                        className="text-[11px] font-bold text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-slate-100"
                      >
                        全部收起
                      </button>
                    </div>
                  </div>

                  {/* 历史版本列表（每页 10 条） */}
                  <div className="space-y-3">
                    {paginatedHistory.map((item) => {
                      const isExpanded = expandedHistoryIds.has(item.id);
                      const originalIndex = historyList.findIndex((h) => h.id === item.id);
                      const versionNum = historyList.length - originalIndex;

                      return (
                        <div
                          key={item.id}
                          className="border border-slate-200 rounded-xl overflow-hidden transition-all shadow-2xs"
                        >
                          {/* 快照条目头部：支持整行点击切换展开/收起 */}
                          <div
                            onClick={() => toggleExpandHistory(item.id)}
                            className="bg-slate-50 hover:bg-slate-100/80 px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-transparent"
                            style={isExpanded ? { borderBottomColor: "#e2e8f0" } : {}}
                          >
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span
                                className={`text-[11px] font-black px-2 py-0.5 rounded border ${
                                  versionNum === 1
                                    ? "bg-blue-50 text-[#3182ce] border-blue-200"
                                    : "bg-white text-slate-600 border-slate-200"
                                }`}
                              >
                                {versionNum === 1
                                  ? "V1.0 初始基线版本"
                                  : `V${versionNum}.0 修订快照`}
                              </span>
                              <span className="text-xs font-bold text-slate-700">
                                {new Date(item.createdAt).toLocaleString("zh-CN", {
                                  hour12: false,
                                })}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                操作者：{item.user?.name || item.user?.email || "系统官方"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-[10px] text-slate-400 font-mono">
                                正文约 {(item.content || "").length} 字
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  item.isPublished
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {item.isPublished ? "已发布上线" : "未发布草稿"}
                              </span>

                              {/* 展开/收起状态指示器 */}
                              <div className="flex items-center gap-1 text-[11px] font-bold text-[#3182ce] ml-1 pl-2 border-l border-slate-200">
                                <span>{isExpanded ? "收起" : "展开"}</span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </div>
                            </div>
                          </div>

                          {/* 展开的正文内容区域 */}
                          {isExpanded && (
                            <div className="px-4 py-3.5 bg-white space-y-3 animate-in fade-in-50 duration-150">
                              <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                  快照标题
                                </div>
                                <div className="text-xs font-bold text-slate-800">
                                  {item.title}
                                </div>
                              </div>

                              <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                  <span>快照正文内容</span>
                                  <span className="font-normal text-slate-400">
                                    分类：{getCategoryLabel(item.category)}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-100 max-h-60 overflow-y-auto leading-relaxed">
                                  {renderMarkdownContent(item.content || "")}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 弹窗底部：分页（每页严格 10 条）与关闭按钮 */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
              {historyTotalPages > 1 ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 text-[11px]">
                    显示第 {(historyPage - 1) * HISTORY_PAGE_SIZE + 1} -{" "}
                    {Math.min(historyPage * HISTORY_PAGE_SIZE, historyList.length)} 条，共{" "}
                    {historyList.length} 条
                  </span>

                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>上一页</span>
                    </button>

                    <span className="px-2 text-xs font-mono font-bold text-slate-700">
                      {historyPage} / {historyTotalPages}
                    </span>

                    <button
                      type="button"
                      disabled={historyPage >= historyTotalPages}
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <span>下一页</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-[11px]">
                  共 {historyList.length} 条历史版本快照（每页 10 条）
                </div>
              )}

              <button
                type="button"
                onClick={() => setHistoryDoc(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 知阁设计系统顶级标准 · 上下架专属确认模态框 */}
      {publishModal.isOpen && publishModal.doc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !publishModal.loading && setPublishModal({ ...publishModal, isOpen: false })}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏 Header：上架为知阁蓝渐变，下架为暖色琥珀橙渐变 */}
            <div
              className={`px-6 py-4.5 flex items-center justify-between shrink-0 text-white ${
                publishModal.nextStatus
                  ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce]"
                  : "bg-gradient-to-r from-amber-500 to-orange-500"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold text-white shrink-0 backdrop-blur-xs shadow-xs">
                  {publishModal.nextStatus ? (
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    {publishModal.nextStatus ? "确认发布上线文档" : "确认下架文档为草稿"}
                  </h3>
                  <p className="text-[11px] text-white/80 mt-0.5 font-medium">
                    {publishModal.nextStatus
                      ? "发布后将实时面向全站用户与外部开发者公开查阅"
                      : "下架后前台将立即隐藏此文档，并恢复编辑与删除权限"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={publishModal.loading}
                onClick={() => setPublishModal({ ...publishModal, isOpen: false })}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 核心内容区 */}
            <div className="p-6 space-y-4">
              {/* 文档详情概要卡片 */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  待处理目标文档
                </div>
                <div className="text-sm font-black text-slate-800 break-all leading-snug">
                  《{publishModal.doc.title}》
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
                    {getCategoryLabel(publishModal.doc.category)}
                  </span>
                  <span className="text-xs font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    排序权重 #{publishModal.doc.sortOrder}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    累计浏览 {publishModal.doc.viewCount} 次
                  </span>
                </div>
              </div>

              {/* 业务影响与操作指引提示 */}
              {publishModal.nextStatus ? (
                <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-[#2b6cb0] leading-relaxed">
                  <CheckCircle className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">上线业务规则说明：</span>
                    文档发布后将立即在前台帮助文档中心（<span className="font-mono font-bold text-slate-700">/docs</span>）向所有注册用户与访客公开。线上已发布文档将自动开启安全锁定，禁止直接编辑或删除。如需调整正文，请随时下架后编辑。
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-800 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">下架业务规则说明：</span>
                    文档下架后将转入“未发布草稿”状态，前台页面实时下线不可见。管理员将解锁针对此文档的<span className="font-bold text-slate-800">【编辑正文】</span>、<span className="font-bold text-slate-800">【修改分类】</span>与<span className="font-bold text-red-600">【永久删除】</span>权限，亦可随时再次发布上线。
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作工具条 */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={publishModal.loading}
                onClick={() => setPublishModal({ ...publishModal, isOpen: false })}
                className="px-4 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={publishModal.loading}
                onClick={handleExecutePublishToggle}
                className={`px-5 h-9 rounded-xl text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5 ${
                  publishModal.nextStatus
                    ? "bg-[#3182ce] hover:bg-[#2b6cb0]"
                    : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {publishModal.loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>处理中...</span>
                  </>
                ) : publishModal.nextStatus ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>确认发布上线</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>确认下架为草稿</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定义业务分类编辑/重命名模态框（知阁设计系统标准高阶交互） */}
      {editCatModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() =>
            !editCatModal.submitting &&
            setEditCatModal((prev) => ({ ...prev, isOpen: false }))
          }
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏 Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center font-bold text-white shrink-0 backdrop-blur-xs shadow-xs">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight text-white">
                    编辑自定义业务分类
                  </h3>
                  <p className="text-[11px] text-white/80 mt-0.5 font-medium">
                    修改分类展示名称与说明，全系统实时同步生效
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={editCatModal.submitting}
                onClick={() => setEditCatModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 核心内容区 */}
            <div className="p-6 space-y-4 text-left">
              {/* 分类代码只读提示 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>分类唯一标识代码 (Key)</span>
                </label>
                <div className="px-3.5 h-10 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-mono font-bold text-slate-500">
                  <span>{editCatModal.key}</span>
                  <span className="text-[10px] text-slate-400 font-sans font-normal">
                    物理外键绑定·锁定保护
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  作为数据库与文档外键绑定的核心底层键，受保护禁止变更以确保数据一致性。
                </p>
              </div>

              {/* 分类中文名称 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>分类中文名称</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {editCatModal.label.trim().length} / 30 字
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={30}
                  value={editCatModal.label}
                  onChange={(e) =>
                    setEditCatModal((prev) => ({ ...prev, label: e.target.value }))
                  }
                  placeholder="如：合规治理、计费结算、安全审计"
                  className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white"
                />
              </div>

              {/* 分类简要描述 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    分类简要说明 <span className="text-slate-400 font-normal">(选填)</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {editCatModal.description.length} / 100 字
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={100}
                  value={editCatModal.description}
                  onChange={(e) =>
                    setEditCatModal((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="简述该分类收录的业务文档定位与范畴"
                  className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs text-slate-800 font-medium transition-all focus:bg-white resize-none"
                />
              </div>

              {/* 关联文档提示条 */}
              <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span className="font-bold text-slate-700">当前归属知识文档：</span>
                </div>
                <span className="font-mono font-bold text-[#3182ce] bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                  {editCatModal.docCount} 篇
                </span>
              </div>
            </div>

            {/* 底部操作条 */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={editCatModal.submitting}
                onClick={() => setEditCatModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  editCatModal.submitting ||
                  !editCatModal.label.trim() ||
                  editCatModal.label.trim().length < 2
                }
                onClick={handleSaveEditCategoryModal}
                className="px-5 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                {editCatModal.submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>保存修改</span>
                  </>
                )}
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
