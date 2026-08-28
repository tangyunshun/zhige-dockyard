"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";
import Pagination from "@/components/Pagination";
import Footer from "@/components/Footer";

import {
  BookOpen as BookIcon, Plus as PlusIcon, Search as SearchIcon, RefreshCw as RefreshIcon,
  CheckCircle2 as CheckIcon, Clock as ClockIcon, Building2 as BuildingIcon,
  FileText as FileIcon, Eye as EyeIcon, X as XIcon, Inbox as InboxIcon,
  Loader2 as LoaderIcon, ShieldCheck as ShieldIcon, ChevronRight as ArrowIcon,
  Layers as LayersIcon, Landmark as LandmarkIcon, LibraryBig as ArchiveIcon,
  Boxes as BoxesIcon, Copy as CopyIcon, Trash2 as TrashIcon, FolderOpen as FolderIcon,
  Upload as UploadIcon, FileUp as FileUpIcon, Check as CheckmarkIcon,
  LayoutGrid as GridIcon, List as ListIcon, UserCheck as UserCheckIcon,
  Crown as CrownIcon, User as UserIcon, Paperclip as PaperclipIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  AlertTriangle as AlertTriangleIcon
} from "lucide-react";

interface DbCategory {
  key: string;
  name: string;
  color?: string;
}

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
  authorRole: "OWNER" | "MEMBER";
  authorName: string;
  authorId?: string;
  fileName?: string;
  fileSize?: string;
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
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 视图与筛选控制
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<CreatorRoleFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

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
  const [isCreating, setIsCreating] = useState(false);

  // 文件上传
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 1. 从数据库 componentcategory 表直查分类字典
  const fetchDbCategories = async () => {
    try {
      const res = await fetch("/api/components");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.categories)) {
          const catList: DbCategory[] = json.data.categories;
          setDbCategories(catList);
          if (catList.length > 0 && !createCategory) {
            setCreateCategory(catList[0].key);
          }
        }
      }
    } catch (e) {
      console.warn("[KnowledgePage] 静默拉取数据库 componentcategory 分类失败", e);
    }
  };

  // 2. 直查数据库全量知识库
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
      let wsList: any[] = [];
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        if (Array.isArray(wsData.workspaces)) {
          wsList = wsData.workspaces;
          setWorkspaces(wsList);
        }
      }
      if (wsList.length === 0) {
        setKnowledges([]);
        return;
      }
      setCreateWorkspaceId((prev) => (prev && wsList.some((w) => w.id === prev) ? prev : wsList[0].id));

      const myUserId = getCurrentUserId();

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
          return list.map((doc: any) => {
            const contentText = doc.content || "";
            let extractedFile: { name?: string; size?: string } = {};
            const fileMatch = contentText.match(/\[附件知识文件\]:\s*([^\n(]+)\s*\(([^)]+)\)/);
            if (fileMatch) {
              extractedFile = { name: fileMatch[1].trim(), size: fileMatch[2].trim() };
            } else if (doc.sourceTaskId || doc.title.endsWith(".md") || doc.title.endsWith(".pdf") || doc.title.endsWith(".json")) {
              extractedFile = { name: doc.title };
            }

            const isOwner = ws.role === "OWNER" || doc.authorRole === "OWNER" || ws.type === "PERSONAL";

            return {
              id: doc.id,
              title: doc.title || "未命名知识",
              content: contentText,
              category: doc.componentCategory || doc.category || "",
              sourceTaskId: doc.sourceTaskId || null,
              sourceTaskName: doc.sourceTaskName || null,
              createdAt: new Date(doc.createdAt).getTime() || Date.now(),
              time: doc.createdAt ? new Date(doc.createdAt).toLocaleString("zh-CN") : "刚刚",
              workspaceId: ws.id,
              workspaceName: ws.name,
              workspaceType: ws.type as "PERSONAL" | "ENTERPRISE",
              authorRole: (isOwner ? "OWNER" : "MEMBER") as "OWNER" | "MEMBER",
              authorName: doc.authorName || (isOwner ? `${ws.ownerName || "空间所有者"}` : "协同成员"),
              authorId: doc.authorId || (isOwner ? myUserId : ""),
              fileName: extractedFile.name,
              fileSize: extractedFile.size,
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
    } catch (e: any) {
      setLoadError(e.message || "拉取知识数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDbCategories();
    fetchKnowledges();
  }, []);

  // 当筛选或视图发生变化时，自动将页码重置为 1
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedWorkspaceId, categoryFilter, creatorRoleFilter, searchQuery, viewMode]);

  // 文件解析处理
  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    if (!createTitle.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setCreateTitle(nameWithoutExt);
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["md", "txt", "json", "csv", "js", "ts", "html", "css", "yaml", "yml"].includes(ext || "")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (buffer) {
          let text = "";
          try {
            const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
            text = decoderUtf8.decode(buffer);
          } catch (err) {
            try {
              const decoderGbk = new TextDecoder("gbk");
              text = decoderGbk.decode(buffer);
            } catch (err2) {
              const decoderLoose = new TextDecoder("utf-8");
              text = decoderLoose.decode(buffer);
            }
          }
          if (text) {
            setCreateContent((prev) => (prev ? `${prev}\n\n${text}` : text));
            toast.success(`已安全解析并读取文件【${file.name}】的内容！`);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.success(`已选中文件【${file.name}】！`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
    navigator.clipboard.writeText(text);
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
      if (selectedFile) {
        const fileTag = `[附件知识文件]: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`;
        finalContent = finalContent ? `${finalContent}\n\n${fileTag}` : fileTag;
      }

      const res = await fetch("/api/studio?action=save_knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "save_knowledge",
          workspaceId: createWorkspaceId,
          title: createTitle.trim(),
          content: finalContent,
          category: createCategory || (dbCategories[0]?.key || ""),
        }),
      });

      const data = await res.json();
      if (!res.ok && !data.success) throw new Error(data.error || "创建知识失败");

      toast.success("知识新建成功，已即刻保存生效！");

      setShowCreateModal(false);
      setCreateTitle("");
      setCreateContent("");
      setSelectedFile(null);
      fetchKnowledges();
    } catch (err: any) {
      toast.error(err.message || "创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  // 映射分类名称字典
  const categoryMap = new Map(dbCategories.map((c) => [c.key, c.name]));
  const myUserId = getCurrentUserId();

  // 过滤逻辑
  const filtered = knowledges.filter((item) => {
    if (selectedWorkspaceId !== "ALL" && item.workspaceId !== selectedWorkspaceId) return false;
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;

    if (creatorRoleFilter === "OWNER" && item.authorRole !== "OWNER") return false;
    if (creatorRoleFilter === "MEMBER" && item.authorRole !== "MEMBER") return false;
    if (creatorRoleFilter === "MINE" && item.authorId !== myUserId && item.authorRole !== "OWNER") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = (item.content || "").toLowerCase().includes(q);
      const matchWs = item.workspaceName.toLowerCase().includes(q);
      const matchFile = (item.fileName || "").toLowerCase().includes(q);
      if (!matchTitle && !matchContent && !matchWs && !matchFile) return false;
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
  const ownerKnowledgeCount = knowledges.filter((k) => k.authorRole === "OWNER").length;
  const memberKnowledgeCount = knowledges.filter((k) => k.authorRole === "MEMBER").length;

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
                <span>知阁舟坊 · 团队研发资产沉淀中心</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-800">
                知识库中心 <span className="text-xs font-bold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 ml-2">研发资产归档与知识复用</span>
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                集中沉淀与管理全团队在各个工作空间产生的研发知识、架构方案与技术文档。支持按所有者/协同成员视角归档查阅，支持列表与卡片多维度视图切换与动态分页。
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
              <button
                onClick={() => setShowCreateModal(true)}
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
          <aside className="lg:w-64 shrink-0 space-y-4">
            {/* 库房概览 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4.5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#3182ce]/20 flex items-center justify-center shrink-0">
                  <LandmarkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-black text-slate-900 tracking-tight leading-tight">知识库房</h1>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">团队知识 · 经验沉淀</p>
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

              {/* 从数据库 componentcategory 表直查的动态分类 Filter Bar */}
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
                {dbCategories.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setCategoryFilter(cat.key)}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat.key
                        ? "bg-[#3182ce] text-white shadow-xs"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
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
                  onClick={() => setShowCreateModal(true)}
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
                          const displayCatName = categoryMap.get(item.category || "") || item.category || "研发知识";
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
                                  {item.content || "该知识暂无正文内容。"}
                                </p>

                                {/* 上传的文件附件信息 */}
                                {item.fileName && (
                                  <div className="bg-slate-50 border border-slate-200/70 p-2 rounded-xl flex items-center justify-between text-[11px] font-mono text-slate-700">
                                    <span className="flex items-center gap-1.5 truncate max-w-[200px]" title={item.fileName}>
                                      <PaperclipIcon className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                                      <span className="truncate font-bold">{item.fileName}</span>
                                    </span>
                                    {item.fileSize && (
                                      <span className="text-[10px] text-slate-400 font-semibold shrink-0">{item.fileSize}</span>
                                    )}
                                  </div>
                                )}

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
                                      🏷️ {displayCatName}
                                    </span>
                                  </div>

                                  {/* 空间所有者 / 空间成员 所属 Role Badge */}
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
                                    item.authorRole === "OWNER"
                                      ? "text-[#3182ce] bg-blue-50 border-blue-200"
                                      : "text-purple-700 bg-purple-50 border-purple-200"
                                  }`}>
                                    {item.authorRole === "OWNER" ? <CrownIcon className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                    <span>{item.authorRole === "OWNER" ? "所有者沉淀" : "成员沉淀"}</span>
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100/60">
                                  <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyContent(item.content || item.title)}
                                      className="p-1 text-slate-400 hover:text-[#3182ce] rounded-lg transition-colors cursor-pointer"
                                      title="复制知识正文"
                                    >
                                      <CopyIcon className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteKnowledge(item)}
                                      className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                                      title="删除知识"
                                    >
                                      <TrashIcon className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => { setPreviewItem(item); setShowPreviewModal(false); setTimeout(() => setShowPreviewModal(true), 10); }}
                                      className="px-3 py-1 bg-slate-100 hover:bg-[#3182ce] hover:text-white text-slate-700 text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <EyeIcon className="w-3.5 h-3.5" /> 阅览
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
                                <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">知识所属</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">所属空间</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[140px]">关联文件附件</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">分类</th>
                                <th className="py-3 px-3 whitespace-nowrap min-w-[120px]">创建时间</th>
                                <th className="py-3 pl-3 pr-6 whitespace-nowrap text-right min-w-[130px]">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                              {paginatedItems.map((item) => {
                                const displayCatName = categoryMap.get(item.category || "") || item.category || "研发知识";
                                return (
                                  <tr key={item.id} className="hover:bg-blue-50/40 transition-colors h-14">
                                    <td className="py-3 pl-5 pr-3 font-extrabold text-slate-900 whitespace-nowrap">
                                      <div className="flex items-center gap-2 max-w-[200px]">
                                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100/80">
                                          <FileIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="truncate" title={item.title}>{item.title}</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                                        item.authorRole === "OWNER"
                                          ? "text-[#3182ce] bg-blue-50/80 border-blue-200"
                                          : "text-purple-700 bg-purple-50/80 border-purple-200"
                                      }`}>
                                        {item.authorRole === "OWNER" ? <CrownIcon className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                        <span>{item.authorRole === "OWNER" ? "所有者" : "成员"}</span>
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
                                    <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                                      {item.fileName ? (
                                        <span className="inline-flex items-center gap-1.5 text-[#3182ce] bg-blue-50/90 px-2 py-1 rounded-lg border border-blue-200/80 font-bold max-w-[140px] truncate whitespace-nowrap" title={item.fileName}>
                                          <PaperclipIcon className="w-3.5 h-3.5 shrink-0 text-[#3182ce]" />
                                          <span className="truncate">{item.fileName}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px] font-medium font-sans">无附件</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-xs whitespace-nowrap">
                                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-extrabold whitespace-nowrap border border-slate-200/60 inline-block">
                                        {displayCatName}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">{item.time}</td>
                                    <td className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleCopyContent(item.content || item.title)}
                                          className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                          title="复制正文"
                                        >
                                          <CopyIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteKnowledge(item)}
                                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                          title="删除知识"
                                        >
                                          <TrashIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setPreviewItem(item); setShowPreviewModal(false); setTimeout(() => setShowPreviewModal(true), 10); }}
                                          className="px-2.5 py-1 bg-slate-100 hover:bg-[#3182ce] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                                        >
                                          <EyeIcon className="w-3.5 h-3.5" /> 阅览
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
                <h3 className="text-base font-black text-slate-900">确认删除知识</h3>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">知识分类 <span className="text-red-500">*</span></label>
                  <select
                    value={createCategory || (dbCategories[0]?.key || "")}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

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
              </div>

              {/* 上传知识文件组件区域 */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  上传知识附件文档 (可选，自动提取内容)
                </label>
                {selectedFile ? (
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#3182ce] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        <FileUpIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-extrabold text-slate-800 truncate" title={selectedFile.name}>{selectedFile.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono font-medium">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="px-2 py-1 text-[10px] font-bold text-red-600 bg-white hover:bg-red-50 rounded-lg border border-red-200 transition-colors cursor-pointer shrink-0"
                    >
                      更换/移除
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDropFile}
                    className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-[#3182ce] bg-blue-50/60 scale-[1.01]"
                        : "border-slate-200 bg-slate-50/70 hover:bg-white hover:border-[#3182ce]/50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.pdf,.doc,.docx,.json,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-[#3182ce] flex items-center justify-center shrink-0">
                        <UploadIcon className="w-4 h-4" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs font-bold text-slate-700 leading-tight">
                          点击选择本地文件，或拖拽文件至此处
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                          支持 .md, .txt, .pdf, .docx, .json 格式自动读取
                        </p>
                      </div>
                    </div>
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
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
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
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                previewItem.authorRole === "OWNER" ? "text-[#3182ce] bg-blue-50 border-blue-200" : "text-purple-700 bg-purple-50 border-purple-200"
              }`}>
                {previewItem.authorRole === "OWNER" ? "👑 所有者沉淀" : "👤 成员沉淀"}
              </span>
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <BuildingIcon className="w-3.5 h-3.5" /> {previewItem.workspaceName}
              </span>
              <span className="text-[11px] font-bold text-slate-400 font-mono">
                {previewItem.time}
              </span>
            </div>

            {previewItem.fileName && (
              <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PaperclipIcon className="w-4 h-4 text-[#3182ce]" />
                  <span className="text-xs font-bold text-slate-800">{previewItem.fileName}</span>
                </div>
                {previewItem.fileSize && <span className="text-xs font-mono text-slate-400">{previewItem.fileSize}</span>}
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl text-xs font-mono leading-relaxed text-slate-700 max-h-96 overflow-y-auto border border-slate-200/70 whitespace-pre-wrap">
              {previewItem.content || "该知识暂无正文内容。"}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => handleCopyContent(previewItem.content || previewItem.title)}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#3182ce] text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                {copied ? <CheckmarkIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                <span>{copied ? "已复制正文" : "复制知识正文"}</span>
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
      )}

      <Footer />
    </div>
  );
}
