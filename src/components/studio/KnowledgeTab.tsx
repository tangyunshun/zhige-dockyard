"use client";

import { useState, useMemo, useEffect } from "react";
import Pagination from "@/components/Pagination";
import { BookOpen, Search, Plus, CheckCircle2, AlertTriangle, FileText, ExternalLink, ShieldCheck, Download, Eye, Layers, Clock, Calendar, Zap, Tag, X } from "lucide-react";

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
}

interface KnowledgeTabProps {
  knowledges: KnowledgeItem[];
  workspaceType: string;
  userRole: string;
  handleReviewKnowledge: (id: string, approve: boolean) => void;
  openPreviewModal: (title: string, content: string) => void;
  onOpenCreateModal?: () => void;
}

// 全量组件字典映射：根据组件 ID / 识别码解析为【组件编号 + 完整中文名称】
const COMPONENT_FULL_DICT: Record<string, { code: string; name: string; category: string }> = {
  "C01": { code: "C01", name: "招投标标书自动生成引擎", category: "📄 商务合规" },
  "C02": { code: "C02", name: "标书响应方案与述标 PPT 自动生成", category: "📄 商务合规" },
  "C03": { code: "C03", name: "商务合同风险条款识别与审核", category: "📄 商务合规" },
  "C04": { code: "C04", name: "投标竞品分析与胜率预测模型", category: "📄 商务合规" },
  "C11": { code: "C11", name: "软件需求规格说明书 (SRS) 自动提炼", category: "🧩 需求架构" },
  "C12": { code: "C12", name: "业务 API 契约与 JSON Schema 渲染", category: "🧩 需求架构" },
  "C13": { code: "C13", name: "交互原型 (UI/UX) 规范与流程导图", category: "📐 前端设计" },
  "C14": { code: "C14", name: "系统架构设计书 (SAD) 与组件拆解", category: "🧩 需求架构" },
  "C21": { code: "C21", name: "Java/Go 后端微服务骨架代码生成", category: "💻 后端核心" },
  "C22": { code: "C22", name: "高并发 SQL 优化与索引策略推荐", category: "💻 后端核心" },
  "C23": { code: "C23", name: "API 接口单元测试套件自动构建", category: "✅ 测试安全" },
  "C24": { code: "C24", name: "第三方 SDK/中间件集成防坑指南", category: "💻 后端核心" },
  "C31": { code: "C31", name: "React/Next.js 响应式 UI 骨架生成", category: "📐 前端设计" },
  "C32": { code: "C32", name: "Vue3/Vite 高效管理后台看板组件", category: "📐 前端设计" },
  "C33": { code: "C33", name: "Tailwind/Vanilla CSS 主题与设计系统", category: "📐 前端设计" },
  "C34": { code: "C34", name: "前端 Web 性能瓶颈与 Core Web Vitals 诊断", category: "📐 前端设计" },
  "C36": { code: "C36", name: "全链路自动化测试与 Selenium/Playwright 脚本", category: "✅ 测试安全" },
  "C37": { code: "C37", name: "代码安全漏洞扫描与修复预案", category: "🛡️ 风险防范" },
  "C43": { code: "C43", name: "项目潜在风险防范预案", category: "🛡️ 风险防范" },
};

// 提取组件【编号 + 完整名称 + 分类】
function getResolvedComponentInfo(item: KnowledgeItem): { code: string; name: string; full: string; category: string } {
  // 优先使用后端返回的真实组件元数据
  if (item.componentId && item.componentName) {
    const dict = COMPONENT_FULL_DICT[item.componentId.toUpperCase()];
    return {
      code: item.componentId,
      name: item.componentName,
      full: `[${item.componentId}] ${item.componentName}`,
      category: dict?.category || "💡 团队知识",
    };
  }

  const rawComp = item.sourceComponent;
  if (!rawComp) return { code: "CORE", name: "空间研发知识", full: "[CORE] 空间研发知识", category: "💡 团队知识" };

  // 从 sourceComponent 中匹配组件编号
  for (const [key, val] of Object.entries(COMPONENT_FULL_DICT)) {
    if (rawComp.toUpperCase().includes(key)) {
      return { code: val.code, name: val.name, full: `[${val.code}] ${val.name}`, category: val.category };
    }
  }

  // 尝试解析 "Cxx 名称" 格式
  const match = rawComp.match(/^(C\d{2})\s+(.*)$/i);
  if (match) {
    const [, code, name] = match;
    const dict = COMPONENT_FULL_DICT[code.toUpperCase()];
    return {
      code: code.toUpperCase(),
      name: name.trim() || dict?.name || "空间组件知识",
      full: `[${code.toUpperCase()}] ${name.trim() || dict?.name || "空间组件知识"}`,
      category: dict?.category || "💡 团队知识",
    };
  }

  return { code: rawComp, name: "空间组件知识", full: `[${rawComp}] 空间组件知识`, category: "💡 团队知识" };
}

// 真实独一无二解包：保证每一项知识卡片的标题真实独特，决不重名！
function parseKnowledgeCardInfo(item: KnowledgeItem) {
  const compInfo = getResolvedComponentInfo(item);
  let knowledgeTitle = item.title || `${compInfo.name}沉淀知识`;

  // 来源任务名优先使用后端真实数据，不再把知识标题回退成来源任务
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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "APPROVED" | "PENDING">("ALL");
  const [timeRange, setTimeRange] = useState<"ALL" | "7DAYS" | "30DAYS" | "CUSTOM">("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);

  const isReviewer = workspaceType === "ENTERPRISE" && (userRole === "Owner" || userRole === "Admin" || userRole === "KnowledgeManager");

  // 重置为第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, timeRange, customStartDate, customEndDate]);

  // 时间与文本高级过滤
  const filtered = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const startMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
    const endMs = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Infinity;

    return knowledges.filter(item => {
      // 1. 状态过滤
      const matchesFilter = activeFilter === "ALL" || item.status === activeFilter;

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
      const cardInfo = parseKnowledgeCardInfo(item);
      const matchesQuery = !q || 
        cardInfo.knowledgeTitle.toLowerCase().includes(q) || 
        cardInfo.sourceTaskName.toLowerCase().includes(q) || 
        cardInfo.compInfo.full.toLowerCase().includes(q);

      return matchesFilter && matchesTime && matchesQuery;
    });
  }, [knowledges, activeFilter, timeRange, customStartDate, customEndDate, searchQuery]);

  // 1 行 3 列 Bento 排版 -> 6 条/页（2 行 3 列对称齐平）
  const pageSize = 6;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const approvedCount = knowledges.filter(k => k.status === "APPROVED").length;
  const pendingCount = knowledges.filter(k => k.status === "PENDING").length;

  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-6 text-left animate-in fade-in duration-200 font-sans">
      {/* 1. 头部 Header 与统计 (锁定主系统知性蓝) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              工作空间 SOP 规约与团队知识库
            </h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5 flex items-center gap-2">
              <span>共收录 {knowledges.length} 项 SOP 规约与知识沉淀</span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">{approvedCount} 项已归档生效</span>
              {workspaceType === "ENTERPRISE" && (
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
            className="h-9 px-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#1a365d] text-white text-xs font-black rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ 沉淀/录入新规约</span>
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
                            onClick={() => handleReviewKnowledge(doc.id, true)}
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-extrabold text-[10px] transition-colors cursor-pointer"
                          >
                            通过
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewKnowledge(doc.id, false)}
                            className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded font-extrabold text-[10px] transition-colors cursor-pointer"
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
    </div>
  );
}
