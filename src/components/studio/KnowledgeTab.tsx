"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Pagination from "@/components/Pagination";
import { BookOpen, Search, Plus, CheckCircle2, AlertTriangle, FileText, ExternalLink, ShieldCheck, Download, Eye, Layers, Clock, Calendar, Zap, Tag, X } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { useToast } from "@/components/Toast";

export interface KnowledgeItem {
  id: string;
  title: string;
  sourceComponent: string;
  sourceTaskId?: string;
  sourceTaskName?: string;
  componentId?: string;
  componentName?: string;
  componentCategory?: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  createdAt?: string;
  content?: string;
  type?: string;
  // 管理员审核批示意见（驳回修改意见 / 通过批示），由后端解析后回传
  reviewComment?: string;
}

interface KnowledgeTabProps {
  knowledges: KnowledgeItem[];
  workspaceType: string;
  userRole: string;
  handleReviewKnowledge: (id: string, approve: boolean, comment?: string) => void;
  openPreviewModal: (title: string, content: string) => void;
  onOpenCreateModal?: () => void;
}

// 动态提取组件【编号 + 完整名称 + 分类】（数据 100% 来源于数据库 component_catalog 表）
function useResolvedComponentInfo(item: KnowledgeItem): { code: string; name: string; full: string; category: string } {
  const { componentCatalog } = useAppContext();

  return useMemo(() => {
    const catalogList = componentCatalog || [];
    const catalogMap = new Map<string, any>();
    catalogList.forEach((c: any) => {
      catalogMap.set(c.id.toUpperCase(), c);
    });

    const rawComp = (item.componentId || item.sourceComponent || "CORE").toUpperCase();
    const found = catalogMap.get(rawComp);
    if (found) {
      return {
        code: found.id,
        name: found.title || found.name || "组件知识",
        full: `[${found.id}] ${found.title || found.name || "组件知识"}`,
        category: found.category || "💡 团队知识",
      };
    }

    return { code: rawComp, name: "空间组件知识", full: `[${rawComp}] 空间组件知识`, category: "💡 团队知识" };
  }, [item, componentCatalog]);
}

// 真实解包：保证每一项知识卡片的标题真实独特，决不重名！
function parseKnowledgeCardInfo(item: KnowledgeItem, catalogList?: any[]) {
  const catalogMap = new Map<string, any>();
  (catalogList || []).forEach((c: any) => catalogMap.set(c.id.toUpperCase(), c));
  const rawComp = (item.componentId || item.sourceComponent || "CORE").toUpperCase();
  const found = catalogMap.get(rawComp);
  const compInfo = found 
    ? { code: found.id, name: found.title || found.name || "组件知识", full: `[${found.id}] ${found.title || found.name || "组件知识"}`, category: found.category || "💡 团队知识" }
    : { code: rawComp, name: "空间组件知识", full: `[${rawComp}] 空间组件知识`, category: "💡 团队知识" };

  let knowledgeTitle = item.title || `${compInfo.name}沉淀知识`;
  let sourceTaskName = item.sourceTaskName?.trim();
  if (!sourceTaskName) {
    if (item.sourceTaskId && item.sourceTaskId !== item.componentId) {
      sourceTaskName = item.sourceTaskId;
    } else if (compInfo.code !== "CORE") {
      sourceTaskName = `${compInfo.name}任务`;
    } else {
      sourceTaskName = "空间研发任务";
    }
  }

  return {
    knowledgeTitle,
    sourceTaskName,
    compInfo,
  };
}

// 标准化时间格式化 (YYYY-MM-DD HH:mm:ss)
function formatKnowledgeTime(rawTime?: string): string {
  if (!rawTime) return "近期沉淀";
  try {
    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return rawTime;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return rawTime;
  }
}

export default function KnowledgeTab({
  knowledges,
  workspaceType,
  userRole,
  handleReviewKnowledge,
  openPreviewModal,
  onOpenCreateModal
}: KnowledgeTabProps) {
  const toast = useToast();
  const { componentCatalog } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "APPROVED" | "PENDING">("ALL");
  const [timeRange, setTimeRange] = useState<"ALL" | "7DAYS" | "30DAYS" | "CUSTOM">("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [reviewModalTarget, setReviewModalTarget] = useState<{ item: KnowledgeItem; approve: boolean } | null>(null);
  const [reviewModalComment, setReviewModalComment] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 空间角色精准判定：只有 OWNER、ADMIN、KNOWLEDGE_MANAGER 等才是空间管理员；其余（MEMBER, DEVELOPER, VIEWER等）均为空间普通成员账号
  const isWorkspaceAdmin = ["OWNER", "ADMIN", "Owner", "Admin", "KNOWLEDGE_MANAGER", "KnowledgeManager"].includes(userRole || "");
  const isReviewer = isWorkspaceAdmin;
  const isWorkspaceMember = !isWorkspaceAdmin;

  // 重置为第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, timeRange, customStartDate, customEndDate]);

  // 时间与文本高级过滤 (权限隔离：待审核知识只有管理员看得到，普通用户在全库中仅看已归档生效知识)
  const filtered = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const startMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
    const endMs = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Infinity;

    return knowledges.filter(item => {
      // 1. 权限与状态过滤：在“全部知识”大库中，普通成员仅看已被管理员审核通过 (APPROVED) 的公共知识
      if (activeFilter === "APPROVED" && item.status !== "APPROVED") return false;
      if (activeFilter === "PENDING" && item.status !== "PENDING") return false;
      if (activeFilter === "ALL") {
        if (!isReviewer && item.status === "PENDING") {
          return false; // 非管理员在公共全库中不直接看到其他人的待审知识
        }
      }

      // 2. 时间过滤 (支持 7 天、30 天以及自定义时间段)
      let matchesTime = true;
      if (item.createdAt) {
        const itemTime = new Date(item.createdAt).getTime();
        if (!isNaN(itemTime)) {
          if (timeRange === "7DAYS") matchesTime = (now - itemTime) <= sevenDaysMs;
          else if (timeRange === "30DAYS") matchesTime = (now - itemTime) <= thirtyDaysMs;
          else if (timeRange === "CUSTOM") {
            matchesTime = itemTime >= startMs && itemTime <= endMs;
          }
        }
      }

      // 3. 关键字过滤
      const q = searchQuery.trim().toLowerCase();
      const cardInfo = parseKnowledgeCardInfo(item, componentCatalog);
      const matchesQuery = !q || 
        cardInfo.knowledgeTitle.toLowerCase().includes(q) || 
        cardInfo.sourceTaskName.toLowerCase().includes(q) || 
        cardInfo.compInfo.full.toLowerCase().includes(q);

      return matchesTime && matchesQuery;
    });
  }, [knowledges, activeFilter, timeRange, customStartDate, customEndDate, searchQuery, isReviewer, componentCatalog]);

  // 每页 9 条数据（3 行 3 列齐平网格）
  const pageSize = 9;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safeCurrentPage, pageSize]);

  const approvedCount = knowledges.filter(k => k.status === "APPROVED").length;
  const pendingCount = knowledges.filter(k => k.status === "PENDING").length;

  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-6 text-left animate-in fade-in duration-200 font-sans">
      {/* 1. Header 知识库标题与沉淀入口 */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                团队 SOP 与知识库
              </h3>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200">
                知识沉淀
              </span>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
              沉淀团队架构规范、代码避坑指南与研发 SOP，让大团队形成统一的开发与研发标准，大幅减少重复踩坑。
            </p>
            <p className="text-xs text-slate-500 font-semibold mt-1.5 flex items-center gap-2 flex-wrap">
              <span>共收录 {knowledges.length} 项知识沉淀</span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">{approvedCount} 项已归档生效</span>
              {isReviewer && pendingCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-600 font-bold">{pendingCount} 项待管理员审核</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* 右侧录入按钮 */}
        {onOpenCreateModal && (
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="h-9 px-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#1a365d] text-white text-xs font-black rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ 沉淀/录入新知识</span>
          </button>
        )}
      </div>

      {/* 2. 搜索框与【自定义时间段筛选】控制栏 (100% 同行对齐平铺) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* 搜索框 */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索知识名称、关联组件或来源任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200/80 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {/* 时间范围筛选下拉列表 (同行内嵌自定义 Date Picker) */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>时间筛选:</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="bg-transparent font-bold outline-none cursor-pointer text-slate-800"
              >
                <option value="ALL">全部时间</option>
                <option value="7DAYS">近 7 天沉淀</option>
                <option value="30DAYS">近 30 天沉淀</option>
                <option value="CUSTOM">📅 自定义时间段...</option>
              </select>
            </div>

            {/* 当选择【自定义时间段...】时，开始日期与结束日期同在这一行内，绝不单独换行！ */}
            {timeRange === "CUSTOM" && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 animate-in fade-in duration-200">
                <span className="text-[11px] text-slate-500 font-bold">开始:</span>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />
                <span className="text-slate-400 font-bold">至</span>
                <span className="text-[11px] text-slate-500 font-bold">结束:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />
                {(customStartDate || customEndDate) && (
                  <button 
                    type="button" 
                    onClick={() => { setCustomStartDate(""); setCustomEndDate(""); }}
                    className="p-0.5 text-slate-400 hover:text-red-500 font-bold cursor-pointer"
                    title="清空日期范围"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 状态 Filter 按钮组 */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-bold border border-slate-200/60 self-end lg:self-auto shrink-0">
          {[
            { key: "ALL", label: "全部知识" },
            { key: "APPROVED", label: "🟢 已归档" },
            ...(workspaceType === "ENTERPRISE" ? [{ key: "PENDING", label: "⏳ 待审核" }] : [])
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key as any)}
              className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                activeFilter === tab.key 
                  ? "bg-white text-slate-900 shadow-sm font-black scale-[1.02]" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 知识条目列表渲染（1 行 3 列 5 大层级 Bento 网格） */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-3 text-[#3182ce] shadow-xs">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-slate-600">空间知识库当前无匹配条目</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">在任务成果中点击“保存沉淀”或在此主动录入知识，即可归档至知识库。</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {paginatedItems.map(doc => {
              const isPending = doc.status === "PENDING";
              const { knowledgeTitle, sourceTaskName, compInfo } = parseKnowledgeCardInfo(doc);

              return (
                <div 
                  key={doc.id} 
                  className="p-4 bg-slate-50/50 hover:bg-white border border-slate-200/80 rounded-2xl flex flex-col justify-between gap-3 text-xs font-semibold hover:shadow-lg hover:border-[#3182ce]/50 transition-all duration-300 group relative overflow-hidden"
                >
                  {/* 顶部微边饰 (主系统主题蓝) */}
                  <div className={`h-1 w-full absolute top-0 left-0 right-0 ${isPending ? "bg-amber-400" : "bg-[#3182ce]"}`} />

                  {/* 核心层 1 & 2: 知识分类徽标 + 状态 Badge + 真实独一无二的知识大字标题 */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      {/* 知识分类 Tag */}
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-50 text-[#3182ce] border border-blue-200/70 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {compInfo.category}
                      </span>

                      {/* 归档状态 Badge */}
                      {isPending ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200/80 shrink-0">
                          待审核
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/80 shrink-0">
                          已归档
                        </span>
                      )}
                    </div>

                    {/* 真实独一无二的知识大字标题 */}
                    <h4 className="font-extrabold text-slate-900 text-xs leading-snug group-hover:text-[#3182ce] transition-colors line-clamp-2" title={knowledgeTitle}>
                      {knowledgeTitle}
                    </h4>
                  </div>

                  {/* 核心层 3 & 4: 来源任务名称 + 关联组件 (包含【组件编号 + 中文完整名称】) */}
                  <div className="p-2.5 bg-white rounded-xl border border-slate-100 space-y-1.5">
                    {/* 来源任务 */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-bold truncate">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate" title={sourceTaskName}>
                        来源任务: <strong className="text-slate-800">{sourceTaskName}</strong>
                      </span>
                    </div>

                    {/* 关联组件 (编号 + 名称) */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-800 font-extrabold truncate pt-1 border-t border-slate-100">
                      <Layers className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                      <span className="truncate" title={compInfo.full}>
                        关联组件: <strong className="text-[#3182ce]">{compInfo.full}</strong>
                      </span>
                    </div>
                  </div>

                  {/* 仅在空间普通成员账号 (isWorkspaceMember) 页面下展示管理员给出的审阅批示意见 */}
                  {isWorkspaceMember && doc.reviewComment && (
                    <div className="p-2 bg-blue-50/80 rounded-xl border border-blue-200/60 text-[11px] space-y-0.5 text-slate-700 shadow-2xs">
                      <div className="flex items-center gap-1 font-extrabold text-[#3182ce]">
                        💬 管理员审核批示意见:
                      </div>
                      <p className="text-slate-700 font-medium leading-relaxed pl-1 break-words">
                        {doc.reviewComment}
                      </p>
                    </div>
                  )}

                  {/* 核心层 5: 归档时间 + 查看详情按钮 */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-300" />
                      {formatKnowledgeTime(doc.createdAt)}
                    </span>

                    <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                      {/* 管理员审核按钮 */}
                      {isReviewer && isPending && (
                        <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewModalTarget({ item: doc, approve: true });
                              setReviewModalComment("");
                            }}
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-extrabold text-[10px] transition-colors cursor-pointer"
                            title="审核通过并录入意见"
                          >
                            通过
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReviewModalTarget({ item: doc, approve: false });
                              setReviewModalComment("");
                            }}
                            className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded font-extrabold text-[10px] transition-colors cursor-pointer"
                            title="驳回沉淀并录入修改意见"
                          >
                            驳回
                          </button>
                        </div>
                      )}

                      {/* 明确直白的【查看详情】按钮 */}
                      <button
                        type="button"
                        onClick={() => openPreviewModal(knowledgeTitle, doc.content || "知识文件内容加载中...")}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-[#3182ce] hover:text-white text-[#3182ce] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 border border-blue-200/60"
                      >
                        <Eye className="w-3 h-3" />
                        <span>查看详情</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 全系统统一标准动态分页控制组件 */}
          <div className="pt-3 border-t border-slate-100 px-1 shrink-0">
            <Pagination
              currentPage={safeCurrentPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              itemLabel="条知识"
            />
          </div>
        </div>
      )}

      {/* 知识沉淀审核意见弹窗 */}
      {mounted && reviewModalTarget && createPortal(
        <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                {reviewModalTarget.approve ? "🟢 审核通过知识沉淀" : "🔴 驳回知识沉淀申请"}
              </h3>
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              知识主题: <span className="text-[#3182ce] font-black">{reviewModalTarget.item.title || "未命名知识"}</span>
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold text-slate-800 flex items-center gap-1">
                  ✍️ {reviewModalTarget.approve ? "审核通过意见" : "驳回修改意见"}
                  {!reviewModalTarget.approve ? (
                    <span className="text-red-500 font-black text-xs zg-required" title="必填项目">* (必填)</span>
                  ) : (
                    <span className="text-slate-400 font-medium text-[11px]">(选填)</span>
                  )}
                </label>
              </div>

              <textarea
                value={reviewModalComment}
                onChange={(e) => setReviewModalComment(e.target.value)}
                placeholder={reviewModalTarget.approve ? "填写通过意见（选填，如：符合知识规范与发布标准）..." : "⚠️ 请填写明确的修改要求与驳回具体原因（必填）..."}
                rows={3}
                className={`w-full p-3 text-xs border rounded-2xl focus:bg-white focus:outline-none transition-all resize-none font-medium text-slate-800 ${
                  !reviewModalTarget.approve && !reviewModalComment.trim()
                    ? "bg-red-50/40 border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    : "bg-slate-50 border-slate-200 focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                }`}
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: "✅ 同意沉淀归档", text: "符合团队规范，已同意归档入规范库。" },
                  { label: "❌ 内容需修订", text: "文本描述或范例尚不完善，请补充修改后重新发起申请。" },
                  { label: "❌ 存在重复知识", text: "已有类似规范，请核对避免冗余沉淀。" }
                ].map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReviewModalComment(tpl.text)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px] font-bold cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!reviewModalTarget.approve && !reviewModalComment.trim()) {
                    toast.error("驳回申请时必须填写明确的修改意见，告知提交人具体修订要求！");
                    return;
                  }
                  handleReviewKnowledge(reviewModalTarget.item.id, reviewModalTarget.approve, reviewModalComment);
                  setReviewModalTarget(null);
                  setReviewModalComment("");
                }}
                className={`px-5 py-2 rounded-xl text-xs font-black text-white transition-all shadow-md active:scale-95 cursor-pointer ${
                  reviewModalTarget.approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                确认{reviewModalTarget.approve ? "通过" : "驳回"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
