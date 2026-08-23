"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import AvatarDropdown from "@/components/AvatarDropdown";

import {
  BookOpen as BookIcon, Plus as PlusIcon, Search as SearchIcon, RefreshCw as RefreshIcon,
  CheckCircle2 as CheckIcon, Clock as ClockIcon, Building2 as BuildingIcon,
  FileText as FileIcon, Eye as EyeIcon, X as XIcon, Inbox as InboxIcon,
  Loader2 as LoaderIcon, ShieldCheck as ShieldIcon, ChevronRight as ArrowIcon,
  Layers as LayersIcon, Library as LibraryIcon, Landmark as LandmarkIcon,
  LibraryBig as ArchiveIcon, ScrollText as ScrollIcon, Zap as ZapIcon,
  FolderOpen as FolderIcon, Boxes as BoxesIcon
} from "lucide-react";

type KnowledgeStatus = "APPROVED" | "PENDING" | "REJECTED";

interface KnowledgeRecord {
  id: string;
  title: string;
  content: string | null;
  status: KnowledgeStatus;
  sourceTaskId: string | null;
  createdAt: number;
  time: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "PERSONAL" | "ENTERPRISE";
  canReview: boolean;
}

const STATUS_META: Record<KnowledgeStatus, { label: string; cls: string; spine: string; iconBg: string }> = {
  APPROVED: {
    label: "已生效",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
    spine: "bg-emerald-600",
    iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
  PENDING: {
    label: "待审核",
    cls: "text-amber-700 bg-amber-50 border-amber-200",
    spine: "bg-amber-500",
    iconBg: "bg-amber-50 text-amber-600 border-amber-100",
  },
  REJECTED: {
    label: "已驳回",
    cls: "text-red-600 bg-red-50 border-red-200",
    spine: "bg-red-500",
    iconBg: "bg-red-50 text-red-500 border-red-100",
  },
};

const STATUS_FILTERS: { key: string; label: string; dotCls?: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "APPROVED", label: "已生效", dotCls: "bg-emerald-500" },
  { key: "PENDING", label: "待审核", dotCls: "bg-amber-500" },
  { key: "REJECTED", label: "已驳回", dotCls: "bg-red-500" },
];

// 拥有审核权的工作空间逻辑角色（与后端 review_knowledge 校验一致）
const REVIEWER_ROLES = ["OWNER", "ADMIN", "KNOWLEDGE_MANAGER"];

export default function KnowledgeLibraryPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [knowledges, setKnowledges] = useState<KnowledgeRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 筛选
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // 阅览 Modal
  const [previewItem, setPreviewItem] = useState<KnowledgeRecord | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // 新建知识 Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createWorkspaceId, setCreateWorkspaceId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchKnowledges = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      // 1. 用户所有工作空间（含逻辑角色，用于判定审核权限）
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

      // 2. 并行聚合各空间知识库（单空间失败不影响整体）
      const settled = await Promise.allSettled(
        wsList.map(async (ws) => {
          const res = await fetch(`/api/studio?action=knowledges&workspaceId=${encodeURIComponent(ws.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (!res.ok) return [];
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.data)) return [];
          const canReview = REVIEWER_ROLES.includes(String(ws.role || "").toUpperCase());
          return data.data.map((k: any): KnowledgeRecord => ({
            id: k.id,
            title: k.title || "未命名知识",
            content: k.content ?? null,
            status: (k.status === "APPROVED" || k.status === "REJECTED" ? k.status : "PENDING") as KnowledgeStatus,
            sourceTaskId: k.sourceTaskId || null,
            createdAt: k.createdAt ? new Date(k.createdAt).getTime() : 0,
            time: k.createdAt ? new Date(k.createdAt).toLocaleString("zh-CN", { hour12: false }) : "",
            workspaceId: ws.id,
            workspaceName: ws.name,
            workspaceType: ws.type,
            canReview,
          }));
        })
      );
      const all: KnowledgeRecord[] = [];
      settled.forEach((r) => {
        if (r.status === "fulfilled") all.push(...r.value);
      });
      all.sort((a, b) => b.createdAt - a.createdAt);
      setKnowledges(all);
    } catch (err) {
      console.error("[KnowledgePage] Fetch error:", err);
      setLoadError("加载知识库数据失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledges();
  }, []);

  // 筛选
  const filtered = knowledges.filter((k) => {
    const matchesWs = selectedWorkspaceId === "ALL" || k.workspaceId === selectedWorkspaceId;
    const matchesStatus = statusFilter === "ALL" || k.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q ||
      k.title.toLowerCase().includes(q) ||
      (k.content || "").toLowerCase().includes(q) ||
      k.workspaceName.toLowerCase().includes(q);
    return matchesWs && matchesStatus && matchesQuery;
  });

  // 统计（按当前空间维度，与任务中心形成差异化语义）
  const approvedCount = knowledges.filter((k) => k.status === "APPROVED").length;
  const pendingCount = knowledges.filter((k) => k.status === "PENDING").length;
  const rejectedCount = knowledges.filter((k) => k.status === "REJECTED").length;
  const totalCount = knowledges.length;
  const coveredWorkspaceCount = new Set(knowledges.map((k) => k.workspaceId)).size;

  // 当前选中空间（用于侧栏徽标）
  const wsCountMap = (wsId: string) => knowledges.filter((k) => k.workspaceId === wsId).length;

  // 新建知识（个人空间直接生效，企业空间进入审核流）
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createWorkspaceId) {
      toast.warning("请选择要保存知识的目标工作空间");
      return;
    }
    if (!createTitle.trim()) {
      toast.warning("请填写知识标题");
      return;
    }
    if (isCreating) return;
    setIsCreating(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "save_knowledge",
          workspaceId: createWorkspaceId,
          title: createTitle.trim(),
          content: createContent.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const ws = workspaces.find((w) => w.id === createWorkspaceId);
        if (ws?.type === "ENTERPRISE") {
          toast.success("知识已提交，等待知识库管理员审核后生效");
        } else {
          toast.success("知识已保存到知识库，立即生效");
        }
        setShowCreateModal(false);
        setCreateTitle("");
        setCreateContent("");
        await fetchKnowledges();
      } else {
        toast.error(data?.error || "保存失败，请稍后重试");
      }
    } catch (err) {
      toast.error("网络请求异常，请稍后重试");
    } finally {
      setIsCreating(false);
    }
  };

  // 审核：通过 / 驳回
  const handleReview = async (item: KnowledgeRecord, approve: boolean) => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "review_knowledge",
          workspaceId: item.workspaceId,
          knowledgeId: item.id,
          approve,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(approve ? `已审核通过「${item.title}」` : `已驳回「${item.title}」`);
        await fetchKnowledges();
      } else {
        toast.error(data?.error || "审核操作失败，请重试");
      }
    } catch (err) {
      toast.error("网络请求异常，请重试");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f1f5f9] flex flex-col font-sans relative">
      {/* 背景效果（全系统统一浅蓝灰底，知识库更偏暖纸感） */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#fafbf8] via-[#f1f5f9] to-[#ffffff]" />
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: `radial-gradient(#94a3b8 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute top-[-8%] right-[-5%] w-[42%] h-[42%] bg-emerald-500/[0.04] rounded-full blur-[160px]" />
      </div>

      {/* 主内容区：左侧书架导航 + 右侧知识列表 */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-6 pb-16 relative z-10 flex-1 text-left space-y-6">
        {/* 产品 Header 功能价值宣介与提示指南 Banner */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#3182ce]/20 flex items-center justify-center shrink-0">
              <LibraryIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">知识与 SOP 规约中心</h1>
                <span className="text-[11px] font-extrabold text-[#3182ce] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/80">
                  💡 研发资产归档与协同复用
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-1 leading-relaxed max-w-3xl">
                【功能价值说明】：集中沉淀与管理全团队在各个工作空间产生的规范文档、架构契约与 SOP 指南。支持企业级多级角色审核流，随时查阅与跨项目一键复用。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-10 px-5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#1a365d] text-white text-xs font-black rounded-xl shadow-md shadow-[#3182ce]/20 hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PlusIcon className="w-4 h-4 fill-current" />
              <span>沉淀/新建团队规范</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ================= 左侧：空间书架导航 ================= */}
          <aside className="lg:w-64 shrink-0 space-y-4">
            {/* 库房概览 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4.5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#3182ce]/20 flex items-center justify-center shrink-0">
                  <LandmarkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-black text-slate-900 tracking-tight leading-tight">知识库</h1>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">团队规范 · 经验沉淀</p>
                </div>
              </div>

              {/* 状态计数（垂直列表） */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                    <BoxesIcon className="w-3.5 h-3.5 text-slate-400" /> 知识总数
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900">{loading ? "···" : totalCount}</span>
                </div>
                <div className="flex items-center justify-between bg-emerald-50/70 rounded-lg px-3 py-2 border border-emerald-100/80">
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5" /> 已生效
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-600">{loading ? "···" : approvedCount}</span>
                </div>
                <div className="flex items-center justify-between bg-amber-50/70 rounded-lg px-3 py-2 border border-amber-100/80">
                  <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5" /> 待审核
                  </span>
                  <span className="text-sm font-black font-mono text-amber-600">{loading ? "···" : pendingCount}</span>
                </div>
                <div className="flex items-center justify-between bg-red-50/60 rounded-lg px-3 py-2 border border-red-100/70">
                  <span className="text-[11px] font-bold text-red-600 flex items-center gap-1.5">
                    <ShieldIcon className="w-3.5 h-3.5" /> 已驳回
                  </span>
                  <span className="text-sm font-black font-mono text-red-600">{loading ? "···" : rejectedCount}</span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100">
                <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                  企业空间的规范知识需经管理员审核后生效；个人空间知识保存后立即可用。
                </p>
              </div>
            </div>

            {/* 空间筛选：按空间切换知识集 */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-1.5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 pb-1 flex items-center gap-1.5">
                <FolderIcon className="w-3.5 h-3.5" /> 按空间筛选
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
            {/* 顶部控制条：搜索 + 状态筛选 + 刷新 */}
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-4 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索知识标题、内容或空间..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-xs font-bold border border-slate-200/60">
                  {STATUS_FILTERS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                        statusFilter === tab.key
                          ? "bg-white text-slate-900 shadow-xs font-black scale-[1.02]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.dotCls && <span className={`w-2 h-2 rounded-full ${tab.dotCls}`} />}
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchKnowledges}
                  className="p-2 text-slate-500 hover:text-[#3182ce] rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                  title="刷新知识库"
                >
                  <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <ScrollIcon className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-sm font-black text-slate-800">知识库还没有沉淀任何内容</p>
                <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                  你可以把任务运行的结果保存为知识，也可以手动录入一份团队规范，沉淀下来的经验随时可查、可复用。
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-2 px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#4299e1] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md cursor-pointer inline-flex items-center gap-1.5"
                >
                  <PlusIcon className="w-4 h-4" /> 录入第一条知识
                </button>
              </div>
            )}

            {/* 知识文档卡片流 */}
            {!loading && totalCount > 0 && (
              <div>
                {filtered.length === 0 ? (
                  <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xs py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <SearchIcon className="w-7 h-7 text-slate-300" />
                      <p className="text-xs font-bold text-slate-400">没有符合条件的知识记录</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-slate-400 px-1 pb-2 flex items-center gap-1.5">
                      <ArchiveIcon className="w-3.5 h-3.5" />
                      当前书架共 {filtered.length} 篇文档
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filtered.map((item) => {
                        const meta = STATUS_META[item.status];
                        return (
                          <article
                            key={item.id}
                            className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden flex flex-col"
                          >
                            {/* 书脊条 */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${meta.spine}`} />

                            <div className="pl-4 p-4 flex flex-col gap-2.5 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                                    {item.status === "APPROVED" ? (
                                      <FileIcon className="w-4 h-4" />
                                    ) : item.status === "PENDING" ? (
                                      <ClockIcon className="w-4 h-4" />
                                    ) : (
                                      <ShieldIcon className="w-4 h-4" />
                                    )}
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

                              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <button
                                    onClick={() => router.push(`/workspace/${item.workspaceId}`)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-[#3182ce] hover:underline shrink-0"
                                  >
                                    <BuildingIcon className="w-3 h-3" />
                                    <span className="truncate max-w-[100px]">{item.workspaceName}</span>
                                  </button>
                                  {item.sourceTaskId && (
                                    <span className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1 shrink-0">
                                      <LayersIcon className="w-3 h-3" /> 来自任务
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${meta.cls}`}>
                                  {meta.label}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {item.status === "PENDING" && item.canReview && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleReview(item, true)}
                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-md font-extrabold text-[10px] transition-colors cursor-pointer"
                                      >
                                        通过
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReview(item, false)}
                                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-md font-extrabold text-[10px] transition-colors cursor-pointer"
                                      >
                                        驳回
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => { setPreviewItem(item); setShowPreviewModal(true); }}
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

      {/* 新建知识 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-left space-y-4 relative max-h-[85vh] overflow-y-auto no-scrollbar flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookIcon className="w-5 h-5 text-[#3182ce]" />
                <h3 className="text-base font-black text-slate-900">沉淀新知识</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 my-auto">
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
                <p className="mt-1 text-[10px] text-slate-400 font-medium">
                  {workspaces.find((w) => w.id === createWorkspaceId)?.type === "ENTERPRISE"
                    ? "保存到团队空间后需知识库管理员审核，审核通过后成员可见"
                    : "保存到个人空间后立即生效，无需审核"}
                </p>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">知识标题 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="例如：接口开发规范、交付检查清单"
                  className="w-full p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">知识内容</label>
                <textarea
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder="填写知识正文，可以是规范说明、经验总结或注意事项。"
                  className="w-full h-32 p-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400 resize-none"
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
                <FileIcon className="w-5 h-5 text-[#3182ce] shrink-0" />
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
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${STATUS_META[previewItem.status].cls}`}>
                {STATUS_META[previewItem.status].label}
              </span>
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <BuildingIcon className="w-3 h-3" /> {previewItem.workspaceName}
              </span>
              <span className="text-[11px] font-bold text-slate-400 font-mono">
                {previewItem.time}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-xs font-mono leading-relaxed text-slate-700 max-h-96 overflow-y-auto border border-slate-200/70 whitespace-pre-wrap">
              {previewItem.content || "该知识暂无正文内容。"}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => router.push(`/workspace/${previewItem.workspaceId}`)}
                className="text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
              >
                前往空间查看相关任务
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
    </div>
  );
}
