"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markdownToPlainText, exportDocumentAsMarkdown, exportDocumentAsWord } from "@/utils/document-export";
import { useToast } from "@/components/Toast";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";
import Pagination from "@/components/Pagination";
import Footer from "@/components/Footer";

import {
  BookOpen as BookIcon, Plus as PlusIcon, Search as SearchIcon, RefreshCw as RefreshIcon,
  CheckCircle2 as CheckIcon, Clock as ClockIcon, Building2 as BuildingIcon,
  FileText as FileIcon, Eye as EyeIcon, X as XIcon, Inbox as InboxIcon,
  Loader2 as LoaderIcon, ShieldCheck as ShieldIcon, Landmark as LandmarkIcon,
  LibraryBig as ArchiveIcon,
  Boxes as BoxesIcon, Copy as CopyIcon, Trash2 as TrashIcon, FolderOpen as FolderIcon, Calendar as CalendarIcon,
  Check as CheckmarkIcon,
  LayoutGrid as GridIcon, List as ListIcon, UserCheck as UserCheckIcon,
  Crown as CrownIcon, User as UserIcon,
  AlertTriangle as AlertTriangleIcon,
  PencilIcon, Download as DownloadIcon, Tag as TagIcon,
  Settings as SettingsIcon, UploadCloud as UploadCloudIcon, Paperclip as PaperclipIcon
} from "lucide-react";
import DocumentContentRenderer from "@/components/docs/DocumentContentRenderer";

// KB-V2：知识库自身分类体系（后端 knowledges 接口随列表下发的 categories 字段）
const KNOWLEDGE_CATEGORIES = ["规约与SOP", "经验总结", "问题记录", "使用心得"];

type CreatorRoleFilter = "ALL" | "OWNER" | "MEMBER" | "MINE";
type ViewMode = "grid" | "table";

interface KnowledgeRecord {
  id: string;
  title: string;
  content: string | null;
  category?: string;
  sourceTaskId: string | null;
  sourceTaskName?: string;
  createdAt: number;
  time: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "PERSONAL" | "ENTERPRISE";
  // KN-1：真实创建人（后端返回），替代此前伪造的 authorName/authorRole
  uploaderId: string;
  uploaderName: string;
  uploaderRole: "OWNER" | "ADMIN" | "MEMBER";
  // KN-3：审核状态与驳回理由（真实返回）
  status: "APPROVED" | "PENDING" | "REJECTED";
  reviewComment?: string | null;
  // KB-2：来源组件与标签
  componentName?: string;
  componentId?: string;
  tags?: string[];
  attachments: Array<{ id: string; title: string; originalName: string; fileSize: number | null; mimeType: string | null }>;
}

// KB-2：知识卡片来源标注 + 标签 chips（模块内局部组件，非默认导出）
function KnowledgeSourceTags({ item }: { item: KnowledgeRecord }) {
  const router = useRouter();
  const isUuid = (s?: string | null) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const taskName =
    item.sourceTaskName && !isUuid(item.sourceTaskName) && item.sourceTaskName !== "空间研发任务"
      ? item.sourceTaskName
      : null;
  return (
    <div className="space-y-1.5">
      {item.componentName ? (
        <button
          type="button"
          onClick={() => router.push(`/workspace/${item.workspaceId}?componentId=${item.componentId}`)}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2b6cb0] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded px-1.5 py-0.5 cursor-pointer max-w-full"
          title="跳转到该知识所在空间，并定位到来源组件"
        >
          <BuildingIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">来源：{item.componentName} 组件执行</span>
        </button>
      ) : taskName ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <FileIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">来自任务：{taskName}</span>
        </span>
      ) : item.sourceTaskId ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <FileIcon className="w-3 h-3 shrink-0" />
          <span>空间研发任务</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <FileIcon className="w-3 h-3 shrink-0" />
          <span>手工创建</span>
        </span>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((t, i) => (
            <span
              key={i}
              className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// KB-V1：清洗知识卡片摘要——去掉组件执行产生的技术元信息（# 标题、输入共 N 字符、有效行、语言、来源任务、分隔线等），仅保留可读正文前 120 字
function cleanKnowledgeSummary(content: string | null): string {
  if (!content) return "";
  // 组件执行沉淀的条目包含大量执行日志元信息（编号结论、高频关键词、组件契约覆盖等），
  // 这些是技术过程数据而非知识正文，摘要中需要过滤掉，只保留有实际阅读价值的经验内容。
  const EXEC_METADATA_RE = /输入共|有效行|语言「|来源任务：|检测到的语言类型|高频关键词|组件契约共要求|未在输入材料中识别到|组件契约|已覆盖\s*\d+\s*个/;
  return content
    .split("\n")
    .map((raw) => raw.trim())
    .filter((line) => {
      if (!line) return false;
      if (line === "---") return false;
      if (line.startsWith("#")) return false;
      if (EXEC_METADATA_RE.test(line)) return false;
      return true;
    })
    .map((line) =>
      line
        .replace(/^\s*#+\s*/, "")
        .replace(/^\s*[-*]\s+/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(" ")
    .slice(0, 120);
}

const OWNER_ROLE_FILTERS: { key: CreatorRoleFilter; label: string; icon: any }[] = [
  { key: "ALL", label: "全部所属", icon: UserCheckIcon },
  { key: "OWNER", label: "空间所有者沉淀", icon: CrownIcon },
  { key: "MEMBER", label: "协同成员沉淀", icon: UserIcon },
  { key: "MINE", label: "我沉淀的", icon: CheckIcon },
];

export default function KnowledgeLibraryPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [knowledges, setKnowledges] = useState<KnowledgeRecord[]>([]);
  const [knowledgeCategories, setKnowledgeCategories] = useState<string[]>([]);
  // KN-CAT-V2：个人分类（仅创建人可见、可自删）
  const [myCategories, setMyCategories] = useState<string[]>([]);
  const [deleteCatConfirm, setDeleteCatConfirm] = useState<string | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [myCatName, setMyCatName] = useState("");
  // 新建/编辑弹窗内的「➕ 新建分类」内联输入
  const [inlineCatCreate, setInlineCatCreate] = useState(false);
  const [inlineCatName, setInlineCatName] = useState("");
  // 知识预览视图切换：排版视图（Markdown 渲染）vs 纯文本
  const [previewMode, setPreviewMode] = useState<'rendered' | 'plain'>('rendered');
  // KN-CAT：分类管理（仅管理员可见）
  const [showCatManage, setShowCatManage] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // KB-V3：当前登录用户 ID（从 localStorage 读取，存为 state 以保证响应式）
  const [currentUserId, setCurrentUserId] = useState<string>("");
  // KN-CAT-V3：是否平台管理员（决定能否增删系统内置分类；普通用户仅可管理个人分类）
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean>(false);

  // 视图与筛选控制
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<CreatorRoleFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  // KB-V4：开始 / 结束时间筛选（按知识创建时间 createdAt 过滤）
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 分页状态 (卡片每页9条，列表每页10条)
  const [currentPage, setCurrentPage] = useState(1);

  // 阅览 Modal
  const [previewItem, setPreviewItem] = useState<KnowledgeRecord | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // 删除确认 Modal (替代原生 confirm)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<KnowledgeRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 新建知识 Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createWorkspaceId, setCreateWorkspaceId] = useState("");
  const [createCategory, setCreateCategory] = useState<string>("");
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  // KB-2：新建/编辑时的标签输入（逗号分隔文本，提交时拆成数组）
  const [createTags, setCreateTags] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  // KN-2：编辑模式（复用新建弹窗；后端 update_knowledge，创建人/管理员可改）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string; percent: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const attInputRef = useRef<HTMLInputElement | null>(null);

  // KN-ATT：附件客户端预校验（与服务端白名单/大小上限一致）
  const ATT_ALLOWED_EXTS = [
    "pdf","doc","docx","xls","xlsx","ppt","pptx","csv","txt","md",
    "png","jpg","jpeg","gif","svg","webp","bmp",
    "zip","rar","7z","tar","gz","mp4","mp3","wav","json","xml","yaml","yml",
  ];
  const formatAttSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  };
  const addPendingFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    let overLimit = false;
    const errs: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (!ATT_ALLOWED_EXTS.includes(ext)) { errs.push(f.name + "（不支持的格式 ." + ext + "）"); continue; }
      if (f.size > 20 * 1024 * 1024) { errs.push(f.name + "（超过 20MB 上限）"); continue; }
      accepted.push(f);
    }
    if (accepted.length > 0) {
      setPendingFiles((prev) => {
        const seen = new Set(prev.map((p) => p.name + p.size));
        const deduped = accepted.filter((f) => !seen.has(f.name + f.size));
        const merged = [...prev, ...deduped];
        if (merged.length > 5) {
          overLimit = true;
          return merged.slice(0, 5);
        }
        return merged;
      });
    }
    if (errs.length > 0) toast.error("以下文件未加入：" + errs.join("、"));
    if (overLimit) toast.error("一个知识最多上传 5 个附件，已截取前 5 个");
  };
  const [editingWsId, setEditingWsId] = useState<string>("");

  // 直查数据库全量知识库
  const fetchKnowledges = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      // 获取用户所有工作空间
      const wsRes = await fetch("/api/workspace/list", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!wsRes.ok) {
        setLoadError(`拉取工作空间列表失败（HTTP ${wsRes.status}）`);
        return;
      }
      const wsData = await wsRes.json();
      const wsList: any[] = Array.isArray(wsData.workspaces) ? wsData.workspaces : [];
      setWorkspaces(wsList);
      if (wsList.length === 0) {
        setKnowledges([]);
        return;
      }
      setCreateWorkspaceId((prev) => (prev && wsList.some((w) => w.id === prev) ? prev : wsList[0].id));

      let collectedCategories: string[] = [];

      // 并行从 /api/studio?action=knowledges&workspaceId=xxx 直查数据库真实知识
      const results = await Promise.allSettled(
        wsList.map(async (ws) => {
          const res = await fetch(`/api/studio?action=knowledges&workspaceId=${ws.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (!res.ok) return [];
          const data = await res.json();
          const list = data.data || data.knowledges || [];
          const kCategories: string[] = Array.isArray(data.categories) ? data.categories : [];
          if (kCategories.length) collectedCategories = kCategories;
          // KN-CAT-V2：个人分类（后端按登录用户过滤，仅返回本人创建的）
          const myCats: string[] = Array.isArray(data.myCategories) ? data.myCategories : [];
          setMyCategories(myCats);
          return list.map((doc: any) => {
            const contentText = doc.content || "";

            return {
              id: doc.id,
              title: doc.title || "未命名知识",
              content: contentText,
              category: doc.category || doc.componentCategory || "",
              sourceTaskId: doc.sourceTaskId || null,
              sourceTaskName: doc.sourceTaskName || null,
              status: (doc.status || "APPROVED") as "APPROVED" | "PENDING" | "REJECTED",
              reviewComment: doc.reviewComment || null,
              attachments: Array.isArray(doc.attachments) ? doc.attachments : [],
              createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : 0,
              time: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN") : "—",
              workspaceId: ws.id,
              workspaceName: ws.name,
              workspaceType: ws.type as "PERSONAL" | "ENTERPRISE",
              // KN-1：作者身份真实化（后端返回真实创建人与空间内角色）
              uploaderId: doc.uploaderId || "",
              uploaderName: doc.uploaderName || "早期成员",
              uploaderRole: (doc.uploaderRole || "MEMBER") as "OWNER" | "ADMIN" | "MEMBER",
              componentName: doc.componentName || "",
              componentId: doc.componentId || "",
              tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
            };
          });
        })
      );

      const aggregated: KnowledgeRecord[] = [];
      results.forEach((r) => {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          aggregated.push(...r.value);
        }
      });

      aggregated.sort((a, b) => b.createdAt - a.createdAt);
      setKnowledges(aggregated);
      if (collectedCategories.length) {
        setKnowledgeCategories(collectedCategories);
      }
    } catch (e: any) {
      const errMsg = e?.message || "拉取知识数据失败";
      // 已有数据时降级为轻提示：网络抖动 / dev 热更新瞬间的重拉失败，不打断当前列表
      if (knowledges.length > 0) {
        toast.warning(`刷新失败（${errMsg}），已保留当前列表，可点击刷新重试`);
      } else {
        setLoadError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // 切换空间 / 分类 / 沉淀人筛选时重新拉取真实数据（不再只靠挂载与手动刷新）
  useEffect(() => {
    fetchKnowledges();
  }, [selectedWorkspaceId, categoryFilter, creatorRoleFilter]);

  // KB-V3：当前用户 ID 在挂载后从 localStorage 读取并存入 state（避免渲染期读 localStorage 导致的非响应式）
  useEffect(() => {
    setCurrentUserId(getCurrentUserId());
    const role = (localStorage.getItem("userRole") || "").toLowerCase();
    setIsPlatformAdmin(["super_admin", "superadmin", "admin"].includes(role));
  }, []);

  // 当筛选或视图发生变化时，自动将页码重置为 1
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedWorkspaceId, categoryFilter, creatorRoleFilter, searchQuery, viewMode, startDate, endDate]);

  // 唤起高颜值二段确认 Modal（拒绝原生 confirm）
  const handleDeleteKnowledge = (item: KnowledgeRecord) => {
    setDeleteConfirmItem(item);
  };

  // 执行真正删除落库
  const confirmExecuteDelete = async () => {
    if (!deleteConfirmItem) return;
    setIsDeleting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/studio?action=deleteDocument&workspaceId=${deleteConfirmItem.workspaceId}&documentId=${deleteConfirmItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`知识【${deleteConfirmItem.title}】已成功删除`);
        setKnowledges((prev) => prev.filter((k) => k.id !== deleteConfirmItem.id));
        setDeleteConfirmItem(null);
      } else {
        toast.error("删除知识失败");
      }
    } catch {
      toast.error("网络异常，无法删除知识");
    } finally {
      setIsDeleting(false);
    }
  };

  // 一键复制内容
  const handleCopyContent = (text: string) => {
    navigator.clipboard.writeText(markdownToPlainText(text));
    setCopied(true);
    toast.success("知识正文已成功复制到剪贴板！");
    setTimeout(() => setCopied(false), 2000);
  };

  // 新建知识提交
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      toast.error("请输入知识标题");
      return;
    }
    if (!createWorkspaceId) {
      toast.error("请选择保存的目标工作空间");
      return;
    }

    setIsCreating(true);
    try {
      const token = getAuthToken();

      let finalContent = createContent.trim();

      // KB-2：标签解析（逗号/中文逗号分隔；trim；每个超长截断到 20 字；去重；最多 5 个）
      const finalTags = Array.from(
        new Set(
          createTags
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => (s.length > 20 ? s.slice(0, 20) : s)),
        ),
      ).slice(0, 5);

      const isEdit = !!editingId;
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          isEdit
            ? {
                action: "update_knowledge",
                knowledgeId: editingId,
                title: createTitle.trim(),
                content: finalContent,
                category: createCategory || "",
                tags: finalTags,
              }
            : {
                action: "save_knowledge",
                workspaceId: createWorkspaceId,
                title: createTitle.trim(),
                content: finalContent,
                category: createCategory || knowledgeCategories[0] || "未分类",
                tags: finalTags,
              },
        ),
      });

      const data = await res.json();
      if (!res.ok && !data.success) throw new Error(data.error || (isEdit ? "更新失败" : "创建知识失败"));

      // KN-3：提示语按真实审核状态说话，绝不谎称"已生效"
      const newStatus = isEdit ? "APPROVED" : (data.data?.status || data.status || "APPROVED");

      // KN-ATT：多文件上传（逐个上传，弹窗保持打开以显示进度）
      const entryId = isEdit ? editingId : ((data.data && typeof data.data === "object" && data.data.id) || data.data);
      if (pendingFiles.length > 0 && entryId && typeof entryId === "string") {
        const targetWsId = isEdit ? editingWsId : createWorkspaceId;
        for (let fi = 0; fi < pendingFiles.length; fi++) {
          const f = pendingFiles[fi];
          setUploadProgress({ current: fi + 1, total: pendingFiles.length, fileName: f.name, percent: 0 });
          const fd = new FormData();
          fd.append("file", f);
          fd.append("knowledgeId", entryId);
          fd.append("workspaceId", targetWsId);
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/studio?action=upload_knowledge_attachment");
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                setUploadProgress({ current: fi + 1, total: pendingFiles.length, fileName: f.name, percent: pct });
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 400) {
                let msg = "上传失败";
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* keep default */ }
                reject(new Error(msg));
              } else {
                resolve();
              }
            };
            xhr.onerror = () => reject(new Error("网络异常，上传失败"));
            xhr.send(fd);
          }).catch((upErr: Error) => toast.error(`附件「${f.name}」：${upErr.message}`));
        }
        setUploadProgress(null);
      }
      setPendingFiles([]);

      if (isEdit) {
        toast.success("知识条目已更新");
      } else if (newStatus === "PENDING") {
        toast.info("已提交，等待空间管理员审核通过后对其他成员可见");
      } else {
        toast.success("知识条目已发布生效");
      }

      setShowCreateModal(false);
      setEditingId(null);
      setCreateTitle("");
      setCreateContent("");
      setCreateTags("");
      fetchKnowledges();
    } catch (err: any) {
      toast.error(err.message || "创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  const myUserId = currentUserId;
  // KN-3 编辑权限：用户是否在任一空间拥有 OWNER/ADMIN 角色
  const canManageAny = workspaces.some((w) => w.role === "OWNER" || w.role === "ADMIN");

  // KN-CAT-V2：新建个人分类（所有用户；仅自己可见）
  const handleCreateMyCategory = async (rawName: string, onDone?: (name: string) => void) => {
    const name = rawName.trim();
    if (!name) return;
    setCatBusy(true);
    const token = getAuthToken();
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "create_my_knowledge_category", categoryName: name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMyCategories(data.data || []);
        toast.success(data.message || "分类已创建（仅你自己可见）");
        onDone?.((data.data || []).slice(-1)[0] || name);
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  // KN-CAT-V2：删除个人分类（仅创建人；挂在该分类下的条目回退「未分类」）
  const confirmExecuteDeleteCategory = async () => {
    if (!deleteCatConfirm) return;
    setCatBusy(true);
    const token = getAuthToken();
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete_my_knowledge_category", categoryName: deleteCatConfirm }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMyCategories(data.data || []);
        if (categoryFilter === deleteCatConfirm) setCategoryFilter("ALL");
        toast.success(data.message || "分类已删除");
        setDeleteCatConfirm(null);
        fetchKnowledges();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  // KN-CAT-V2：弹窗下拉内联新建确认
  const confirmInlineCatCreate = async () => {
    if (!inlineCatName.trim()) return;
    await handleCreateMyCategory(inlineCatName, (name) => {
      setCreateCategory(name);
      setInlineCatCreate(false);
      setInlineCatName("");
    });
  };

  // KN-CAT：添加/删除知识分类（仅管理员）
  const handleAddCategory = async () => {
    if (!isPlatformAdmin) return; // 系统内置分类仅平台管理员可增（与后端 403 口径一致）
    if (!newCatName.trim()) return;
    const token = getAuthToken();
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "add_knowledge_category", categoryName: newCatName.trim(), workspaceId: "" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKnowledgeCategories(data.data);
        setNewCatName("");
        toast.success(data.message || "分类已添加");
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch { toast.error("网络异常"); }
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!isPlatformAdmin) return; // 系统内置分类仅平台管理员可删（与后端 403 口径一致）
    const token = getAuthToken();
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "remove_knowledge_category", categoryName: cat, workspaceId: "" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKnowledgeCategories(data.data);
        if (categoryFilter === cat) setCategoryFilter("ALL");
        toast.success(data.message || "分类已删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch { toast.error("网络异常"); }
  };

  // 过滤逻辑
  const filtered = knowledges.filter((item) => {
    if (selectedWorkspaceId !== "ALL" && item.workspaceId !== selectedWorkspaceId) return false;
    if (categoryFilter === "UNCATEGORIZED") {
      if (item.category && item.category.trim() !== "") return false;
    } else if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
      return false;
    }

    if (creatorRoleFilter === "OWNER" && item.uploaderRole !== "OWNER") return false;
    if (creatorRoleFilter === "MEMBER" && item.uploaderRole === "OWNER") return false;
    if (creatorRoleFilter === "MINE" && item.uploaderId !== myUserId) return false;

    if (startDate && item.createdAt < new Date(startDate + "T00:00:00").getTime()) return false;
    if (endDate && item.createdAt > new Date(endDate + "T23:59:59").getTime()) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = (item.content || "").toLowerCase().includes(q);
      const matchWs = item.workspaceName.toLowerCase().includes(q);
      const matchTags = Array.isArray(item.tags) && item.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchWs && !matchTags) return false;
    }
    return true;
  });

  // 分页计算: 卡片模式每页9条，列表模式每页10条
  const pageSize = viewMode === "grid" ? 9 : 10;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

  // 统计数据
  const totalCount = knowledges.length;
  const ownerKnowledgeCount = knowledges.filter((k) => k.uploaderRole === "OWNER").length;
  const memberKnowledgeCount = knowledges.filter((k) => k.uploaderRole !== "OWNER").length;

  const wsCountMap = (wsId: string) => knowledges.filter((k) => k.workspaceId === wsId).length;
  const coveredWorkspaceCount = new Set(knowledges.map((k) => k.workspaceId)).size;

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col font-sans">
      {/* 主内容区 */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-6 relative z-10 flex-1 text-left space-y-6">
        {/* 产品 Header 功能价值 Banner (与组件大厅保持 100% 架构一致的顶通流光 Banner) */}
        <section className="bg-gradient-to-br from-[#f0f8ff] via-[#ebf8ff] to-[#ffffff] rounded-2xl p-6 shadow-xs border border-blue-100 relative overflow-hidden text-left">
          {/* 装饰背景流光 */}
          <div className="absolute right-0 top-0 w-96 h-96 bg-[#63b3ed]/10 rounded-full filter blur-3xl pointer-events-none scale-150 transform translate-x-20 -translate-y-20" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#3182ce]/10 text-[#2b6cb0] rounded-full text-xs font-black tracking-wider border border-[#3182ce]/20 uppercase">
                <BookIcon className="w-3.5 h-3.5 text-[#2b6cb0]" />
                <span>知阁·舟坊 · 团队研发知识中心</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-800">
                知识库 <span className="text-xs font-bold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 ml-2">团队研发经验沉淀与复用</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                集中沉淀与管理全团队在各工作空间产生的研发知识、规约与经验总结，支持按分类/创建者/标签多维检索与引用执行。
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
              <button
                onClick={() => { setPendingFiles([]); setUploadProgress(null); setIsDragOver(false); setShowCreateModal(true); }}
                className="h-10 px-5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/30"
              >
                <PlusIcon className="w-4 h-4 stroke-[3]" />
                <span>新增知识</span>
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ================= 左侧：空间书架与所属视角导航 ================= */}
          <aside className="lg:w-60 shrink-0 space-y-4">
            {/* 库房概览 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#3182ce]/20 flex items-center justify-center shrink-0">
                  <LandmarkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-black text-slate-900 tracking-tight leading-tight">知识库</h1>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">团队知识 · 经验复用</p>
                </div>
              </div>

              {/* 状态与归属统计 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3.5 py-2.5 border border-slate-100">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <BoxesIcon className="w-4 h-4 text-slate-400" /> 知识总数
                  </span>
                  <span className="text-base font-black font-mono text-slate-900">{loading ? "···" : totalCount}</span>
                </div>
                <div className="flex items-center justify-between bg-blue-50/70 rounded-lg px-3.5 py-2 border border-blue-100/80">
                  <span className="text-xs font-bold text-[#3182ce] flex items-center gap-1.5">
                    <CrownIcon className="w-3.5 h-3.5" /> 所有者沉淀
                  </span>
                  <span className="text-sm font-black font-mono text-[#3182ce]">{loading ? "···" : ownerKnowledgeCount}</span>
                </div>
                <div className="flex items-center justify-between bg-purple-50/70 rounded-lg px-3.5 py-2 border border-purple-100/80">
                  <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" /> 成员沉淀
                  </span>
                  <span className="text-sm font-black font-mono text-purple-600">{loading ? "···" : memberKnowledgeCount}</span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                  各工作空间知识沉淀后立即可用，全团队协同查阅复用。
                </p>
              </div>
            </div>

            {/* 空间筛选 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-1.5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 pb-1 flex items-center gap-1.5">
                <FolderIcon className="w-3.5 h-3.5" /> 按空间筛选知识
              </p>

              <button
                onClick={() => setSelectedWorkspaceId("ALL")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedWorkspaceId === "ALL"
                    ? "bg-[#3182ce] text-white shadow-md shadow-[#3182ce]/20"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  <ArchiveIcon className="w-3.5 h-3.5" /> 全部空间
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md ${
                  selectedWorkspaceId === "ALL" ? "bg-white/25" : "bg-slate-200 text-slate-500"
                }`}>
                  {loading ? "···" : totalCount}
                </span>
              </button>

              {workspaces.map((ws) => {
                const active = selectedWorkspaceId === ws.id;
                const count = wsCountMap(ws.id);
                return (
                  <button
                    key={ws.id}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? "bg-[#3182ce] text-white shadow-md shadow-[#3182ce]/20"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <BuildingIcon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-white" : "text-[#3182ce]"}`} />
                      <span className="truncate">{ws.type === "ENTERPRISE" ? "团队" : "个人"} · {ws.name}</span>
                    </span>
                    <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                      active ? "bg-white/25" : count > 0 ? "bg-[#3182ce]/10 text-[#2b6cb0]" : "bg-slate-200 text-slate-400"
                    }`}>
                      {loading ? "···" : count}
                    </span>
                  </button>
                );
              })}

              <p className="px-1 pt-1 text-[10px] text-slate-400 font-medium">
                已覆盖 {coveredWorkspaceCount} / {workspaces.length || 0} 个空间
              </p>
            </div>

            {/* 时间范围筛选 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 pb-1 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" /> 按时间筛选
              </p>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 px-1">开始时间</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full mt-0.5 px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all text-slate-700"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 px-1">结束时间</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full mt-0.5 px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all text-slate-700"
                  />
                </label>
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="w-full px-3 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
                >
                  清除时间筛选
                </button>
              )}
            </div>
          </aside>

          {/* ================= 右侧：知识文档流 ================= */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* 顶部控制条：搜索 + 所有者/成员所属筛选 + 卡片/列表视图切换 + 动态分类 Tab */}
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-4 rounded-2xl shadow-xs space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="relative w-full lg:w-72">
                  <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="搜索知识名称、文件、内容或空间..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 h-9 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-auto">
                  {/* 1. 按空间所有者 / 空间成员 知识所属筛选 */}
                  <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-xs font-bold border border-slate-200/60">
                    {OWNER_ROLE_FILTERS.map((filter) => {
                      const Icon = filter.icon;
                      return (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setCreatorRoleFilter(filter.key)}
                          className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 text-[11px] ${
                            creatorRoleFilter === filter.key
                              ? "bg-white text-slate-900 shadow-xs font-black scale-[1.02]"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 text-[#3182ce]" />
                          <span>{filter.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 2. 卡片 (Grid) 与 列表 (Table/List) 视图切换 */}
                  <div className="flex items-center p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        viewMode === "grid"
                          ? "bg-white text-[#3182ce] shadow-xs font-bold"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                      title="卡片网格视图 (每页9条)"
                    >
                      <GridIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        viewMode === "table"
                          ? "bg-white text-[#3182ce] shadow-xs font-bold"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                      title="紧凑列表视图 (每页10条)"
                    >
                      <ListIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={fetchKnowledges}
                    className="p-2 text-slate-500 hover:text-[#3182ce] rounded-xl hover:bg-slate-100 transition-all cursor-pointer border border-slate-200/60 bg-white"
                    title="刷新知识库"
                  >
                    <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* KB-V2：知识库自身分类体系（规约与SOP / 经验总结 / 问题记录 / 使用心得 + 未分类） */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100">
                <button
                  onClick={() => setCategoryFilter("ALL")}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    categoryFilter === "ALL"
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                  }`}
                >
                  全部分类
                </button>
                {knowledgeCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat
                        ? "bg-[#3182ce] text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                {myCategories.map((cat) => (
                  <div
                    key={cat}
                    className={`flex items-center gap-1 pl-3 pr-1.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat
                        ? "bg-[#3182ce] text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    <span onClick={() => setCategoryFilter(cat)} title="个人分类（仅你自己可见）">{cat}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteCatConfirm(cat); }}
                      className={`shrink-0 p-0.5 rounded cursor-pointer ${categoryFilter === cat ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-rose-500"}`}
                      title="删除此个人分类（分类下知识将归入「未分类」）"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setCategoryFilter("UNCATEGORIZED")}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    categoryFilter === "UNCATEGORIZED"
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                  }`}
                >
                  未分类
                </button>
                <button
                  onClick={() => setShowCatManage(!showCatManage)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                    showCatManage
                      ? 'bg-[#3182ce] text-white border-[#2b6cb0]'
                      : 'bg-blue-50 text-[#2b6cb0] border-blue-200 hover:bg-blue-100'
                  }`}
                  title={isPlatformAdmin ? '管理知识分类（系统内置 + 我的个人分类）' : '管理我的个人分类（仅你自己可见）'}
                >
                  <SettingsIcon className='w-3.5 h-3.5' /> 分类管理
                </button>
              </div>
            </div>

            {/* 错误兜底 */}
            {loadError && (
              <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-red-600 flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4" /> {loadError}
                </span>
                <button
                  onClick={fetchKnowledges}
                  className="px-3 py-1.5 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                >
                  重新加载
                </button>
              </div>
            )}

            {/* 空状态 */}
            {!loading && !loadError && totalCount === 0 && (
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-12 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <BookIcon className="w-7 h-7 text-[#3182ce]" />
                </div>
                <p className="text-sm font-black text-slate-800">知识库房暂无沉淀的团队知识</p>
                <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                  你可以手动录入或上传本地文件知识，沉淀下来的经验与知识全团队随时可查、可复用。
                </p>
                <button
                  onClick={() => { setPendingFiles([]); setUploadProgress(null); setIsDragOver(false); setShowCreateModal(true); }}
                  className="mt-2 px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md cursor-pointer inline-flex items-center gap-1.5"
                >
                  <PlusIcon className="w-4 h-4" /> 录入第一条知识
                </button>
              </div>
            )}

            {/* 知识文档列表/卡片流 */}
            {!loading && totalCount > 0 && (
              <div className="space-y-4">
                {filtered.length === 0 ? (
                  <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <SearchIcon className="w-7 h-7 text-slate-300" />
                      <p className="text-xs font-bold text-slate-400">未找到符合条件的知识记录</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 pb-1">
                      <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                        <ArchiveIcon className="w-3.5 h-3.5" />
                        当前视角下共 {filtered.length} 篇知识文档 (当前页展示 {paginatedItems.length} 项)
                      </p>
                    </div>

                    {/* 视角 A: 网格卡片视图 (每页9条) */}
                    {viewMode === "grid" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {paginatedItems.map((item) => {
                          const displayCatName = item.category || "未分类";
                          return (
                            <article
                              key={item.id}
                              className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden flex flex-col"
                            >
                              {/* 书脊条 */}
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3182ce]" />

                              <div className="pl-4 p-4 flex flex-col gap-2.5 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 bg-blue-50 text-[#3182ce] border-blue-100">
                                      <FileIcon className="w-4 h-4" />
                                    </div>
                                    <h4
                                      className="font-extrabold text-slate-900 text-sm truncate group-hover:text-[#3182ce] transition-colors"
                                      title={item.title}
                                    >
                                      {item.title}
                                    </h4>
                                  </div>
                                </div>

                                <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 min-h-[2.5rem]">
                                  {cleanKnowledgeSummary(item.content) || "该知识暂无正文内容。"}
                                </p>

                                <KnowledgeSourceTags item={item} />

                                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <button
                                      onClick={() => router.push(`/workspace/${item.workspaceId}`)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[#3182ce] hover:underline shrink-0"
                                    >
                                      <BuildingIcon className="w-3 h-3" />
                                      <span className="truncate max-w-[90px]">{item.workspaceName}</span>
                                    </button>
                                    <span className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
                                      <TagIcon className="w-3 h-3" />
                                      {displayCatName}
                                    </span>
                                    {item.attachments && item.attachments.length > 0 && (
                                      <span
                                        className="text-[10px] text-[#2b6cb0] font-bold inline-flex items-center gap-0.5 shrink-0 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"
                                        title={"附件：" + item.attachments.map((a: { originalName: string }) => a.originalName).join("、")}
                                      >
                                        <PaperclipIcon className="w-3 h-3" />
                                        {item.attachments.length}
                                      </span>
                                    )}
                                  </div>

                                  {/* 空间所有者 / 空间成员 所属 Role Badge */}
                                  {item.status === "PENDING" && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">待审核</span>
                                  )}
                                  {item.status === "REJECTED" && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 shrink-0" title={item.reviewComment || "未通过审核"}>已驳回</span>
                                  )}
<span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
                                    item.uploaderRole === "OWNER"
                                      ? "text-[#3182ce] bg-blue-50 border-blue-200"
                                      : "text-purple-700 bg-purple-50 border-purple-200"
                                  }`}>
                                    {item.uploaderRole === "OWNER" ? <CrownIcon className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                    <span>{item.uploaderRole === "OWNER" ? "所有者沉淀" : item.uploaderName || "成员沉淀"}</span>
                                  </span>
                                </div>

                                <div className="pt-1 border-t border-slate-100/60">
                                  <div className="flex items-center justify-between gap-2 pt-1.5">
                                    <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                                  </div>
                                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyContent(item.content || item.title)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                                      title="复制知识正文"
                                    >
                                      <CopyIcon className="w-3.5 h-3.5" /> 复制
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(item.id);
                                        setEditingWsId(item.workspaceId);
                                        setCreateWorkspaceId(item.workspaceId);
                                        setCreateTitle(item.title);
                                        setCreateContent(item.content || "");
                                        setCreateCategory(item.category || knowledgeCategories[0] || "");
                                        setCreateTags((item.tags || []).join(","));
                                        setPendingFiles([]); setUploadProgress(null); setIsDragOver(false); setShowCreateModal(true);;
                                      }}
                                      disabled={item.uploaderId !== myUserId && !canManageAny}
                                      title={item.uploaderId === myUserId || canManageAny ? "编辑此条目" : "仅创建人或空间管理员可编辑"}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <PencilIcon className="w-3.5 h-3.5" /> 编辑
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteKnowledge(item)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                                      title="删除知识"
                                    >
                                      <TrashIcon className="w-3.5 h-3.5" /> 删除
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => { setPreviewItem(item); setShowPreviewModal(true); }}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-500 hover:text-white transition-colors cursor-pointer"
                                      title="阅览知识正文"
                                    >
                                      <EyeIcon className="w-3.5 h-3.5" /> 阅览
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => router.push(`/workspace/${item.workspaceId}?componentId=&knowledgeId=${item.id}`)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-[#3182ce] text-white border border-[#2b6cb0] hover:bg-[#2b6cb0] transition-colors cursor-pointer shadow-xs"
                                      title="跳转到该知识所在空间的工作台，带入本知识作为执行材料（到目标空间自行选择组件）"
                                    >
                                      <BookIcon className="w-3.5 h-3.5" /> 带入执行
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {/* 视角 B: 紧凑列表视图 (Table Mode - 每页10条) */}
                    {viewMode === "table" && (
                      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[760px]">
                            <thead>
                              <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider h-11">
                                <th className="py-3 pl-5 pr-3 whitespace-nowrap min-w-[180px]">知识标题</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[160px]">来源 / 标签</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">知识所属</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">所属空间</th>

                                <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">分类</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[120px]">创建时间</th>
                                <th className="py-3 pl-3 pr-6 whitespace-nowrap text-right min-w-[180px] sticky right-0 z-20 bg-slate-50 border-l border-slate-200/80 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                              {paginatedItems.map((item) => {
                                const displayCatName = item.category || "未分类";
                                return (
                                  <tr key={item.id} className="group hover:bg-blue-50/40 transition-colors h-14">
                                    <td className="py-3 pl-5 pr-3 font-extrabold text-slate-900">
                                      <div className="flex items-center gap-2 max-w-[260px]">
                                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100/80">
                                          <FileIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                          <span className="truncate block" title={item.title}>{item.title}</span>
                                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{cleanKnowledgeSummary(item.content) || "—"}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 align-top">
                                      <KnowledgeSourceTags item={item} />
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                                        item.uploaderRole === "OWNER"
                                          ? "text-[#3182ce] bg-blue-50/80 border-blue-200"
                                          : "text-purple-700 bg-purple-50/80 border-purple-200"
                                      }`}>
                                        {item.uploaderRole === "OWNER" ? <CrownIcon className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                        <span>{item.uploaderRole === "OWNER" ? "所有者" : "成员"}</span>
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <button
                                        onClick={() => router.push(`/workspace/${item.workspaceId}`)}
                                        className="text-xs font-extrabold text-[#3182ce] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap max-w-[130px] truncate"
                                        title={item.workspaceName}
                                      >
                                        <BuildingIcon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{item.workspaceName}</span>
                                      </button>
                                    </td>

                                    <td className="py-3 px-3 text-xs whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-extrabold whitespace-nowrap border border-slate-200/60 inline-block inline-flex items-center gap-1">
                                          <TagIcon className="w-3 h-3" />
                                          {displayCatName}
                                        </span>
                                        {item.attachments && item.attachments.length > 0 && (
                                          <span
                                            className="text-[11px] text-[#2b6cb0] font-bold inline-flex items-center gap-0.5 bg-blue-50 px-1.5 py-1 rounded border border-blue-100"
                                            title={"附件：" + item.attachments.map((a: { originalName: string }) => a.originalName).join("、")}
                                          >
                                            <PaperclipIcon className="w-3 h-3" />
                                            {item.attachments.length}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">{item.time}</td>
                                    <td className="py-3 pl-3 pr-6 text-right whitespace-nowrap sticky right-0 z-10 bg-white group-hover:bg-blue-50/40 border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">
                                      <div className="flex items-center justify-end gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleCopyContent(item.content || item.title)}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                                          title="复制正文"
                                        >
                                          <CopyIcon className="w-3.5 h-3.5" /> 复制
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingId(item.id);
                                            setEditingWsId(item.workspaceId);
                                            setCreateWorkspaceId(item.workspaceId);
                                            setCreateTitle(item.title);
                                            setCreateContent(item.content || "");
                                            setCreateCategory(item.category || knowledgeCategories[0] || "");
                                            setCreateTags((item.tags || []).join(","));
                                            setPendingFiles([]); setUploadProgress(null); setIsDragOver(false); setShowCreateModal(true);;
                                          }}
                                          disabled={item.uploaderId !== myUserId && !canManageAny}
                                          title={item.uploaderId === myUserId || canManageAny ? "编辑此条目" : "仅创建人或空间管理员可编辑"}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <PencilIcon className="w-3.5 h-3.5" /> 编辑
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteKnowledge(item)}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                                          title="删除知识"
                                        >
                                          <TrashIcon className="w-3.5 h-3.5" /> 删除
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setPreviewItem(item); setShowPreviewModal(true); }}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-500 hover:text-white transition-colors cursor-pointer"
                                        >
                                          <EyeIcon className="w-3.5 h-3.5" /> 阅览
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => router.push(`/workspace/${item.workspaceId}?componentId=&knowledgeId=${item.id}`)}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg bg-[#3182ce] text-white border border-[#2b6cb0] hover:bg-[#2b6cb0] transition-colors cursor-pointer shadow-xs"
                                          title="跳转到该知识所在空间的工作台，带入本知识作为执行材料（到目标空间自行选择组件）"
                                        >
                                          <BookIcon className="w-3.5 h-3.5" /> 带入执行
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

                    {/* 全系统统一标准动态分页控制组件 */}
                    {!loading && filtered.length > 0 && (
                      <Pagination
                        currentPage={safeCurrentPage}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                        onPageChange={(page) => setCurrentPage(page)}
                        itemLabel="条知识"
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 加载骨架 */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-5 space-y-3 min-h-[160px]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg animate-pulse" />
                      <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
                    </div>
                    <div className="h-3 w-2/3 bg-slate-50 rounded animate-pulse" />
                    <div className="h-3 w-full bg-slate-50 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 删除确认 Modal (替代浏览器原生 confirm) */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">删除知识条目</h3>
                <p className="text-xs text-slate-400 font-medium">此操作将永久移除该条团队沉淀知识，不可恢复。</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-700 font-medium">
              确定要删除知识 <span className="font-extrabold text-slate-900">【{deleteConfirmItem.title}】</span> 吗？
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmExecuteDelete}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                    <span>删除中...</span>
                  </>
                ) : (
                  <span>确认删除</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建知识 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative max-h-[90vh] overflow-y-auto no-scrollbar flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookIcon className="w-5 h-5 text-[#3182ce]" />
                <h3 className="text-base font-black text-slate-900">新增知识</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 my-auto">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">知识标题 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="例如：微服务 API 规范"
                  className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">知识分类 <span className="text-red-500">*</span></label>
                  <select
                    value={createCategory}
                    onChange={(e) => {
                      if (e.target.value === "__CREATE_NEW__") {
                        setInlineCatCreate(true);
                        setInlineCatName("");
                      } else {
                        setInlineCatCreate(false);
                        setCreateCategory(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#3182ce] font-medium cursor-pointer"
                  >
                    {createCategory && !knowledgeCategories.includes(createCategory) && !myCategories.includes(createCategory) && (
                      <option value={createCategory}>{createCategory}（当前）</option>
                    )}
                    {knowledgeCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {myCategories.map((c) => (
                      <option key={c} value={c}>{c}（我的）</option>
                    ))}
                    <option value="未分类">未分类</option>
                    <option value="__CREATE_NEW__">➕ 新建分类…</option>
                  </select>
                  {inlineCatCreate && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmInlineCatCreate(); } }}
                        maxLength={30}
                        placeholder="输入新分类名（1~30 字，仅你自己可见）"
                        autoFocus
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce] font-medium"
                      />
                      <button
                        type="button"
                        onClick={confirmInlineCatCreate}
                        disabled={!inlineCatName.trim() || catBusy}
                        className="px-3 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {catBusy ? "创建中…" : "创建"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setInlineCatCreate(false); setInlineCatName(""); }}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg cursor-pointer shrink-0"
                      >
                        取消
                      </button>
                    </div>
                  )}
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">知识正文 (支持 Markdown)</label>
                <textarea
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder="填写知识正文，可以是经验总结、架构方案或技术文档。"
                  className="w-full h-32 p-2.5 text-xs font-mono font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400 resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">附件（可选，最多 5 个，单个不超过 20MB）</label>
                <div
                  onClick={() => attInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addPendingFiles(e.dataTransfer.files); }}
                  className={
                    "flex flex-col items-center justify-center gap-1 py-5 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors " +
                    (isDragOver
                      ? "border-[#3182ce] bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:border-[#3182ce]/60 hover:bg-blue-50/40")
                  }
                >
                  <UploadCloudIcon className="w-6 h-6 text-slate-400" />
                  <p className="text-xs font-bold text-slate-600">点击选择或拖拽文件到此处上传</p>
                  <p className="text-[11px] text-slate-400">支持文档、图片、压缩包、音视频等常见格式（pdf / docx / xlsx / pptx / png / zip 等）</p>
                  <input
                    ref={attInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { addPendingFiles(e.target.files || []); e.target.value = ""; }}
                  />
                </div>
                {pendingFiles.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {pendingFiles.map((f, idx) => (
                      <li key={f.name + "-" + idx} className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg">
                        <FileIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-700 truncate flex-1" title={f.name}>{f.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{formatAttSize(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="shrink-0 p-0.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="移除此文件"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {uploadProgress && (
                  <div className="mt-2 px-2.5 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-[11px] font-bold text-blue-700 truncate">
                      正在保存附件（{uploadProgress.current}/{uploadProgress.total}）：{uploadProgress.fileName}
                    </p>
                    <div className="h-1.5 mt-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#3182ce] rounded-full transition-all" style={{ width: uploadProgress.percent + "%" }} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">保存到哪个工作空间 <span className="text-red-500">*</span></label>
                <select
                  value={createWorkspaceId || (workspaces[0]?.id || "")}
                  onChange={(e) => setCreateWorkspaceId(e.target.value)}
                  className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.type === "ENTERPRISE" ? "团队" : "个人"} | {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">标签（可选，逗号分隔，最多 5 个，每个 1~20 字）</label>
                <input
                  type="text"
                  value={createTags}
                  onChange={(e) => setCreateTags(e.target.value)}
                  placeholder="例如：标书解析,话术,避坑"
                  className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LoaderIcon className="w-3.5 h-3.5 animate-spin" /> 保存中...
                  </span>
                ) : (
                  "保存知识"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 阅览 Modal */}
      {showPreviewModal && previewItem && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 text-left relative">
            {/* 顶部固定区：标题 + 元信息 + 视图切换 */}
            <div className="sticky top-0 z-10 bg-white px-6 pt-6 pb-3 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <BookIcon className="w-5 h-5 text-[#3182ce] shrink-0" />
                  <h3 className="text-base font-black text-slate-900 truncate" title={previewItem.title}>
                    {previewItem.title}
                  </h3>
                </div>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer shrink-0"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                  <TagIcon className="w-3 h-3" /> {previewItem.category || "未分类"}
                </span>
                {previewItem.attachments && previewItem.attachments.length > 0 && (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200 inline-flex items-center gap-1"
                    title={(previewItem.attachments.map((a) => a.originalName)).join("\n")}
                  >
                    <PaperclipIcon className="w-3 h-3" /> {previewItem.attachments.length} 个附件
                  </span>
                )}
              </div>

              {/* 视图切换：滑动指示器分段控件 */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex bg-slate-200/70 rounded-full p-0.5 relative select-none">
                  <div
                    className={`absolute top-0.5 bottom-0.5 w-[76px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      previewMode === "plain" ? "translate-x-[76px]" : "translate-x-0"
                    }`}
                  />
                  <button
                    onClick={() => setPreviewMode("rendered")}
                    className={`relative z-10 px-4 py-1 text-[11px] font-bold rounded-full transition-colors duration-200 cursor-pointer w-[76px] text-center ${
                      previewMode === "rendered" ? "text-[#3182ce]" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    排版视图
                  </button>
                  <button
                    onClick={() => setPreviewMode("plain")}
                    className={`relative z-10 px-4 py-1 text-[11px] font-bold rounded-full transition-colors duration-200 cursor-pointer w-[76px] text-center ${
                      previewMode === "plain" ? "text-[#3182ce]" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    纯文本
                  </button>
                </div>
                <span className="text-[10px] text-slate-300 font-medium">共 {previewItem.content?.length || 0} 字</span>
              </div>
            </div>

            {/* 中间可滚动区：正文 */}
            <div className="px-6 py-4">
              <div className="border border-slate-200/70 rounded-xl bg-slate-50">
                {previewMode === "rendered" ? (
                  <DocumentContentRenderer
                    content={previewItem.content || ""}
                    title={previewItem.title}
                    category={previewItem.category || ""}
                  />
                ) : (
                  <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap break-words font-sans leading-relaxed">{markdownToPlainText(previewItem.content || "") || "（无内容）"}</pre>
                )}
              </div>
            </div>

            {/* 知识附件列表（可下载） */}
            {previewItem.attachments && previewItem.attachments.length > 0 && (
              <div className="px-6 py-2 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">📎 知识附件</p>
                {previewItem.attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100/60 transition-colors">
                    <span className="text-xs font-bold text-slate-600 truncate max-w-[300px]">{att.originalName}</span>
                    <a
                      href={`/api/workspace/assets/${att.id}/file`}
                      download={att.originalName}
                      className="text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer shrink-0"
                    >
                      下载 ({att.fileSize ? (att.fileSize / 1024).toFixed(1) + " KB" : "—"})
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* 其他信息：归属与沉淀者（按标题→分类→正文→附件→其他的信息层级排在附件之后） */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">其他信息</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  previewItem.uploaderRole === "OWNER" ? "text-[#3182ce] bg-blue-50 border-blue-200" : "text-purple-700 bg-purple-50 border-purple-200"
                }`}>
                  {previewItem.uploaderRole === "OWNER" ? "所有者沉淀" : "成员沉淀"}
                </span>
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                  <BuildingIcon className="w-3.5 h-3.5" /> {previewItem.workspaceName}
                </span>
                <span className="text-[11px] font-bold text-slate-400 font-mono">
                  {previewItem.time}
                </span>
              </div>
            </div>

            {/* 底部固定区：操作按钮 */}
            <div className="sticky bottom-0 z-10 bg-white px-6 pt-3 pb-6 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => router.push(`/workspace/${previewItem.workspaceId}?componentId=&knowledgeId=${previewItem.id}`)}
                  className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="跳转到该知识所在空间的工作台，带入本知识作为执行材料（到目标空间自行选择组件）"
                >
                  <BookIcon className="w-3.5 h-3.5" /> 带入执行
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopyContent(previewItem.content || previewItem.title)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    {copied ? <CheckmarkIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                    <span>{copied ? "已复制正文" : "复制知识正文"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await exportDocumentAsWord(previewItem.title, previewItem.content || "");
                        toast.success(`知识《${previewItem.title}》已导出为 Word 文档 (.docx)`);
                      } catch {
                        toast.error("导出 Word 文档时发生异常");
                      }
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer shadow-2xs"
                    title="导出为可编辑 Word 文档 (.docx)"
                  >
                    <FileIcon className="w-3.5 h-3.5 text-slate-500" /> 导出 Word
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        exportDocumentAsMarkdown(previewItem.title, previewItem.content || "");
                        toast.success(`知识《${previewItem.title}》已导出为 Markdown 文件`);
                      } catch {
                        toast.error("导出 Markdown 文件时发生异常");
                      }
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer shadow-2xs"
                    title="导出为 Markdown 文件"
                  >
                    <DownloadIcon className="w-3.5 h-3.5 text-slate-500" /> 导出 MD
                  </button>
                  <button
                    onClick={() => setShowPreviewModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── KN-CAT-V2：删除个人分类确认弹窗 ── */}
      {deleteCatConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDeleteCatConfirm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800">删除个人分类「{deleteCatConfirm}」？</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              删除后该分类将从你的分类列表中移除，<strong className="text-slate-700">挂在该分类下的知识条目会自动归入「未分类」</strong>，条目本身不会被删除。此操作仅影响你自己创建的分类。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteCatConfirm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={confirmExecuteDeleteCategory}
                disabled={catBusy}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
              >
                {catBusy ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 分类管理弹窗（所有用户；管理员含系统内置分区，普通用户仅我的个人分类） ── */}
      {showCatManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCatManage(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 text-left shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">管理知识分类</h3>
              <button onClick={() => setShowCatManage(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">×</button>
            </div>

            {/* 分区一：系统内置分类（仅管理员可见可管理） */}
            {isPlatformAdmin && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <ShieldIcon className="w-3.5 h-3.5 text-[#3182ce]" /> 系统内置分类
                    <span className="text-[10px] font-bold text-slate-400 font-normal">全员可见 · 普通用户不可删改</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">添加或删除系统分类。分类下仍有知识条目时不可删除。</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
                    placeholder="输入新系统分类名（1~30 字）"
                    maxLength={30}
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce] font-medium"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCatName.trim()}
                    className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    添加
                  </button>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {knowledgeCategories.map((cat) => (
                    <div key={cat} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{cat}</span>
                      <button
                        onClick={() => handleRemoveCategory(cat)}
                        disabled={knowledgeCategories.length <= 1}
                        className="text-[11px] text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer disabled:opacity-30"
                        title={knowledgeCategories.length <= 1 ? "至少保留一个分类" : "删除此系统分类"}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 分区二：我的个人分类（所有用户；仅自己可见、可自删） */}
            <div className={"space-y-3 " + (canManageAny ? "pt-4 border-t border-slate-100" : "")}>
              <div>
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-purple-600" /> 我的个人分类
                  <span className="text-[10px] font-bold text-slate-400 font-normal">仅你自己可见 · 可随时删除</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">删除后挂在该分类下的知识条目会自动归入「未分类」。</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={myCatName}
                  onChange={(e) => setMyCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && myCatName.trim()) {
                      handleCreateMyCategory(myCatName, () => setMyCatName(""));
                    }
                  }}
                  placeholder="输入新个人分类名（1~30 字）"
                  maxLength={30}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce] font-medium"
                />
                <button
                  onClick={() => handleCreateMyCategory(myCatName, () => setMyCatName(""))}
                  disabled={!myCatName.trim() || catBusy}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {catBusy ? "创建中…" : "创建"}
                </button>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {myCategories.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-3">你还没有创建个人分类</p>
                ) : (
                  myCategories.map((cat) => (
                    <div key={cat} className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50/50 border border-purple-100">
                      <span className="text-xs font-bold text-slate-700">{cat}</span>
                      <button
                        onClick={() => setDeleteCatConfirm(cat)}
                        className="text-[11px] text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer"
                        title="删除此个人分类（分类下知识将归入「未分类」）"
                      >
                        删除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}
