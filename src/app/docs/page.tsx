"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useLogout } from "@/hooks/useLogout";
import { useRouter } from "next/navigation";
import SearchInput from "@/components/common/SearchInput";
import { useToast } from "@/components/Toast";
import {
  BookOpen,
  ChevronRight,
  Code,
  Rocket,
  Shield,
  HelpCircle,
  Check,
  Copy,
  MessageSquare,
  Play,
  LifeBuoy,
  Search,
  Terminal,
  ThumbsUp,
  ThumbsDown,
  Download,
  Share2,
  Lock,
  Layers,
  Cpu,
  Database,
  Building2,
  FileCheck,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import Footer from "@/components/Footer";

interface DocArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  contentCode?: string;
  fullContent?: string;
  updateTime?: string;
  helpfulCount?: number;
  unhelpfulCount?: number;
  relatedLink?: { label: string; path: string };
}

interface DocSection {
  id: string;
  title: string;
  icon: any;
  description: string;
  articles: DocArticle[];
}

interface User {
  id: string;
  name: string | null;
  avatar: string | null;
  email: string | null;
  role?: string | null;
}

// ===== 一级栏目目录骨架（栏目元信息固定，每个栏目下的文档条目 100% 由后台数据库 systemdocument 驱动）=====
interface DocSectionDef {
  id: string;
  title: string;
  icon: any;
  description: string;
  categories: string[];
}

const DOC_SECTION_DEFS: DocSectionDef[] = [
  {
    id: "start",
    title: "开始使用与快速入门",
    icon: Rocket,
    description: "了解知阁·舟坊架构模型、空间注册与第一个自动化任务拉起",
    categories: ["user-guide", "user_guide", "guide", "start"],
  },
  {
    id: "developer",
    title: "OpenAPI 与 Webhooks 集成",
    icon: Code,
    description: "API 秘钥鉴权、异步任务拉起、HMAC-SHA256 签名验签与沙箱连通性",
    categories: ["api-doc", "api_doc", "api", "developer"],
  },
  {
    id: "workspace",
    title: "空间治理与权限 RBAC",
    icon: Building2,
    description: "团队成员邀请、白名单权限矩阵、解散自愈校验与自定义域名",
    categories: ["workspace", "workspaces"],
  },
  {
    id: "enterprise",
    title: "企业私有部署与合规",
    icon: Shield,
    description: "企业数据沙箱隔离、专有云 K8s 部署、离线镜像包与平台法律协议",
    categories: [
      "system-doc",
      "system_doc",
      "system",
      "enterprise",
      "terms-of-service",
      "privacy-policy",
      "terms_of_service",
      "privacy_policy",
    ],
  },
  {
    id: "knowledge",
    title: "知识库与自定义组件",
    icon: Database,
    description: "Vector 向量化语义索引、自定义 Python 算子发布与流水报表",
    categories: ["knowledge"],
  },
  {
    id: "faq",
    title: "常见问题与计费采购",
    icon: HelpCircle,
    description: "算力点充值、对公转账发票、数据合规声明与请求频控",
    categories: ["faq", "help"],
  },
];

// 文档卡片徽标回退表：优先取后台「标签」第一个作为微分类，无标签时按一级分类码给出可读名
const CATEGORY_BADGE_FALLBACK: Record<string, string> = {
  "user-guide": "快速入门",
  "user_guide": "快速入门",
  guide: "快速入门",
  start: "快速入门",
  "api-doc": "API 开发",
  "api_doc": "API 开发",
  api: "API 开发",
  developer: "开发者集成",
  workspace: "空间治理",
  workspaces: "空间治理",
  "system-doc": "企业部署",
  "system_doc": "企业部署",
  system: "系统架构",
  enterprise: "私有部署",
  knowledge: "知识库文档",
  faq: "常见问题",
  help: "帮助中心",
  announcement: "官方公告",
  notice: "官方通知",
  "privacy-policy": "平台隐私协议",
  "privacy_policy": "平台隐私协议",
  "terms-of-service": "平台服务条款",
  "terms_of_service": "平台服务条款",
};

const toCategoryBadgeLabel = (
  category: string | null | undefined,
  tags: string | null | undefined
): string => {
  const firstTag = (tags || "")
    .split(/[,，、]/)
    .map(t => t.trim())
    .find(Boolean);
  if (firstTag) return firstTag;
  if (!category) return "综合文档";
  const raw = String(category).trim();
  const normalized = raw.toLowerCase().replace(/_/g, "-");
  if (CATEGORY_BADGE_FALLBACK[normalized]) return CATEGORY_BADGE_FALLBACK[normalized];
  if (normalized.includes("privacy")) return "隐私协议";
  if (normalized.includes("term")) return "服务条款";
  if (normalized.includes("guide")) return "快速入门";
  if (normalized.includes("api")) return "API 文档";
  if (normalized.includes("faq")) return "常见问题";
  if (normalized.includes("workspace")) return "空间治理";
  if (normalized.includes("knowledge")) return "知识库文档";
  if (normalized.includes("system") || normalized.includes("enterprise")) return "企业部署";
  return raw;
};

// 关联跳转链接兼容数据库 JSON 字符串与历史遗留的 JSON 对象两种存储
const parseRelatedLink = (
  value: string | null | undefined | { label?: string; path?: string }
): { label: string; path: string } | undefined => {
  if (!value) return undefined;
  if (typeof value === "object") {
    return value.label && value.path
      ? { label: value.label, path: value.path }
      : undefined;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed?.label && parsed?.path) {
      return { label: parsed.label, path: parsed.path };
    }
  } catch {
    // 忽略非法 JSON，视为未配置
  }
  return undefined;
};

// 将数据库 systemdocument 行转换为前台卡片所需的 DocArticle
const toDocArticle = (doc: any): DocArticle => {
  const rawContent: string = doc.content || "";
  const hasSummary = typeof doc.summary === "string" && doc.summary.trim().length > 0;
  return {
    id: doc.id,
    title: doc.title || "未命名文档",
    summary: hasSummary
      ? doc.summary.trim()
      : rawContent.length > 120
        ? `${rawContent.slice(0, 120)}…`
        : rawContent || "本文档暂无简介，点击卡片阅读全文",
    category: toCategoryBadgeLabel(doc.category, doc.tags),
    contentCode: doc.codeSample || undefined,
    fullContent: rawContent || undefined,
    updateTime: doc.updatedAt
      ? new Date(doc.updatedAt).toLocaleDateString()
      : undefined,
    helpfulCount:
      typeof doc.helpfulCount === "number" && doc.helpfulCount > 0
        ? doc.helpfulCount
        : undefined,
    relatedLink: parseRelatedLink(doc.relatedLink),
  };
};

export default function DocsPage() {
  const router = useRouter();
  const { confirmDialog } = useLogout();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("all");
  const [selectedArticle, setSelectedArticle] = useState<DocArticle | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [articleFeedbackState, setArticleFeedbackState] = useState<Record<string, "up" | "down">>({});

  // 真实 API 反馈 Modal 状态
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState("suggestion");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  const [dbDocuments, setDbDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    loadUserInfo();
    fetchPublicDocs();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        if (data.user?.email) {
          setFeedbackContact(data.user.email);
        }
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
    }
  };

  const fetchPublicDocs = async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch("/api/documents/list");
      if (res.ok) {
        const json = await res.json();
        setDbDocuments(json.data || []);
      }
    } catch (e) {
      console.error("加载公开文档失败:", e);
    } finally {
      setLoadingDocs(false);
    }
  };

  // 快捷登录/权限路由保护拦截
  const handleProtectedAction = (targetPath: string) => {
    if (!user) {
      toast.info("登录后可查看和配置您的开发者资源");
      router.push(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
    } else {
      router.push(targetPath);
    }
  };

  // 代码一键复制
  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    toast.success("代码示例与 cURL 指令已成功复制到剪贴板");
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // 导出文档内容为 Markdown 文件
  const handleExportMarkdown = (article: DocArticle) => {
    const markdownText = `# ${article.title}\n\n**分类**: ${article.category}\n**更新时间**: ${article.updateTime || "最新"}\n\n## 概述\n${article.summary}\n\n## 详细说明\n${article.fullContent || "暂无"}\n\n${article.contentCode ? `\`\`\`bash\n${article.contentCode}\n\`\`\`` : ""}\n\n---\n*导出自 知阁·舟坊 官方文档中心*`;
    const blob = new Blob([markdownText], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${article.id}_${article.title}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`文档《${article.title}》已导出为 Markdown 文件`);
  };

  // 文章 Useful / Not Helpful 反馈评价
  const handleRateArticle = (articleId: string, rating: "up" | "down") => {
    if (articleFeedbackState[articleId]) {
      toast.info("您已提交过对该文档的评价");
      return;
    }
    setArticleFeedbackState(prev => ({ ...prev, [articleId]: rating }));
    if (rating === "up") {
      toast.success("感谢您的评价！我们将持续优化该文档。");
    } else {
      toast.info("感谢反馈，已将该文档标记为需更新提示。");
    }
  };

  // 真实提交后端 /api/feedback 持久化工单
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = feedbackTitle.trim();
    const cleanContent = feedbackContent.trim();

    if (!cleanTitle) {
      toast.error("请输入反馈主题标题");
      return;
    }
    if (!cleanContent || cleanContent.length < 10) {
      toast.error("详细反馈内容至少需要 10 个字符");
      return;
    }

    try {
      setSubmittingFeedback(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          title: cleanTitle,
          content: cleanContent,
          contact: feedbackContact
        })
      });

      if (res.ok) {
        const json = await res.json();
        const ticketId = json.data?.id || `FB_${Date.now()}`;
        setSubmittedTicketId(ticketId);
        toast.success(`反馈提交成功！已自动生成官方工单 ${ticketId}`);
        setFeedbackTitle("");
        setFeedbackContent("");
      } else {
        const errJson = await res.json();
        toast.error(errJson.error || "提交反馈失败，请重试");
      }
    } catch (err: any) {
      toast.error("网络通信失败，请检查网络连接");
    } finally {
      setSubmittingFeedback(false);
    }
  };



  // 由后台发布的公开文档实时组装 6 大栏目（完全数据库驱动：后台增删改/上下架即时生效）
  const docSections = useMemo(() => {
    const sections: DocSection[] = DOC_SECTION_DEFS.map(def => ({
      id: def.id,
      title: def.title,
      icon: def.icon,
      description: def.description,
      articles: [],
    }));

    dbDocuments.forEach((doc: any) => {
      const normalized = String(doc?.category || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
      const defIndex = DOC_SECTION_DEFS.findIndex(def =>
        def.categories.some(c => c.toLowerCase() === normalized)
      );
      if (defIndex >= 0) {
        sections[defIndex].articles.push(toDocArticle(doc));
      }
    });

    return sections;
  }, [dbDocuments]);

  // 依据 Tab 筛选与全文检索过滤
  const allArticlesList = useMemo(() => docSections.flatMap(s => s.articles), [docSections]);

  const filteredSections = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return docSections
      .map(section => ({
        ...section,
        articles: section.articles.filter(
          article =>
            article.title.toLowerCase().includes(keyword) ||
            article.summary.toLowerCase().includes(keyword) ||
            article.category.toLowerCase().includes(keyword) ||
            (article.fullContent || "").toLowerCase().includes(keyword) ||
            (article.contentCode || "").toLowerCase().includes(keyword)
        )
      }))
      .filter(section => (activeSection === "all" ? true : section.id === activeSection))
      .filter(section => section.articles.length > 0);
  }, [docSections, searchQuery, activeSection]);

  // 支持 URL 锚点直达文档：访问 /docs#doc-<文档ID> 自动弹出对应阅读弹层（数据库加载完成后执行）
  useEffect(() => {
    if (!dbDocuments.length || loadingDocs) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#doc-")) return;
    const docId = hash.replace(/^#doc-/, "");
    const found = docSections.flatMap(sec => sec.articles).find(a => a.id === docId);
    if (found) setSelectedArticle(found);
  }, [dbDocuments, docSections, loadingDocs]);

  // 阅读弹层开关时同步 URL hash，保证 #doc- 链接可分享/回退
  const lastSelectedRef = useRef<DocArticle | null>(null);
  useEffect(() => {
    if (selectedArticle) {
      const baseUrl = window.location.href.split("#")[0];
      history.replaceState(null, "", `${baseUrl}#doc-${selectedArticle.id}`);
      lastSelectedRef.current = selectedArticle;
    } else if (lastSelectedRef.current) {
      // 仅当由“打开弹层”切换到“关闭”时清除 hash，避免初次挂载时误删直达锚点
      history.replaceState(null, "", window.location.href.split("#")[0]);
      lastSelectedRef.current = null;
    }
  }, [selectedArticle]);

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col selection:bg-indigo-100 selection:text-indigo-600">
      
      {/* 炫丽的主视觉 Hero 区域 */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#2b6cb0]/10 via-[#3182ce]/5 to-transparent border-b border-slate-200/60 pt-10 pb-12 px-4">
        <div className="max-w-[1400px] mx-auto text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-extrabold shadow-2xs">
            知阁·舟坊 开发者与架构手册 2.0
          </div>
          
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight">
            探索全栈自动化中枢、OpenAPI 与企业部署指南
          </h1>
          <p className="text-xs md:text-sm font-semibold text-slate-500 max-w-4xl mx-auto leading-relaxed whitespace-normal md:whitespace-nowrap truncate">
            提供涵盖 API 鉴权、Webhooks 异步推发、组件挑选、RBAC 空间治理与企业部署全套技术文档
          </p>

          {/* 全能搜索框 */}
          <div className="max-w-2xl mx-auto pt-2">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索文档要点、API 接口（如 Bearer Token / Webhook）或解散自愈..."
              debounceMs={150}
            />
            {/* 热门搜索标签 */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs font-semibold text-slate-400">
              <span>热门检索:</span>
              {["OpenAPI", "Webhook 验签", "组件授权", "解散校验", "算力计费", "私有部署"].map(tag => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="px-2.5 py-0.5 bg-white border border-slate-200/80 hover:border-indigo-400 hover:text-indigo-600 rounded-md text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                >
                  {tag}
                </button>
              ))}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-red-500 hover:underline font-bold text-[11px] cursor-pointer ml-1"
                >
                  ✕ 清空搜索
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 主面板内容 */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 md:px-8 md:py-8 space-y-6 text-left">
        
        {/* 顶部分类 Tab 控制栏 (纯粹分类筛选) */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-4 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveSection("all")}
            className={`px-4 h-9 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              activeSection === "all"
                ? "bg-[#2b6cb0] text-white shadow-xs"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            全部文档 ({allArticlesList.length})
          </button>
          {docSections
            .filter(sec => sec.articles.length > 0)
            .map(sec => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`px-4 h-9 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-[#2b6cb0] text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {sec.title}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {sec.articles.length}
                  </span>
                </button>
              );
            })}
        </div>

        {/* 登录用户开发者资源入口 Banner */}
        {user && (
          <div className="p-4 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/60 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                Dev
              </div>
              <div>
                <h4 className="text-xs md:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  您已登录开发者空间 ({user.email || user.name})
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-black">已鉴权</span>
                </h4>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  可以直接进行线上 API Keys 管理与 Webhooks 连通发包测试。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleProtectedAction("/settings/webhooks")}
                className="px-3.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" /> Webhook 通道
              </button>
              <button
                onClick={() => handleProtectedAction("/studio")}
                className="px-3.5 h-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-extrabold transition-all cursor-pointer"
              >
                组件大厅
              </button>
            </div>
          </div>
        )}

        {/* 文档内容瀑布流网格展示 */}
        {loadingDocs ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#2b6cb0]/30 border-t-[#2b6cb0] rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-bold">正从系统数据库拉取后台已发布的全部文档...</p>
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl bg-white space-y-3 p-8">
            <Search className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-slate-800">
              {searchQuery.trim()
                ? `未找到与 “${searchQuery}” 相关的文档条目`
                : "暂无可展示的公开文档"}
            </h3>
            <p className="text-xs text-slate-400 font-semibold max-w-md mx-auto">
              {searchQuery.trim()
                ? "建议您检查关键词拼写，或切换至【全部文档】分类下重新搜索。"
                : "请进入管理后台「文档管理」创建并发布文档，此处将自动实时呈现。"}
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveSection("all");
              }}
              className="px-4 h-9 bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
            >
              重置所有搜索条件
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredSections.map(section => {
              const Icon = section.icon;
              return (
                <section key={section.id} className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
                        {section.title}
                      </h2>
                      <span className="text-xs font-bold text-slate-400">({section.articles.length} 篇)</span>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold hidden md:block">{section.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {section.articles.map(article => (
                      <div
                        key={article.id}
                        onClick={() => setSelectedArticle(article)}
                        className="p-5 bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer group text-left space-y-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-0.5 bg-indigo-50/80 text-indigo-700 border border-indigo-100 rounded text-[10px] font-black">
                              {article.category}
                            </span>
                            {article.contentCode && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                                <Code className="w-3 h-3 text-indigo-500" /> 代码示例
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-800 group-hover:text-[#2b6cb0] transition-colors leading-snug">
                            {article.title}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium line-clamp-3 leading-relaxed">
                            {article.summary}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-bold group-hover:text-indigo-600 transition-colors">
                          <div className="flex items-center gap-2">
                            <span>阅读完整说明与代码</span>
                            {article.helpfulCount && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                👍 {article.helpfulCount}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* 底部技术支持 Banner */}
        <div className="pt-6">
          <div className="p-6 bg-gradient-to-r from-[#2b6cb0] to-indigo-700 rounded-2xl text-white flex flex-wrap items-center justify-between gap-4 shadow-lg">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-200" />
                需要专属大客户方案或私有部署支持？
              </h3>
              <p className="text-xs text-indigo-100 font-medium">
                我们的架构师团队提供 7x24 小时技术保障与定制化组件解耦服务。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // 提交官方工单需登录后方可操作
                  if (!user) {
                    toast.info("提交官方工单需先登录");
                    router.push("/auth/login?redirect=" + encodeURIComponent(window.location.pathname));
                    return;
                  }
                  setSubmittedTicketId(null);
                  setIsFeedbackOpen(true);
                }}
                className="px-4 h-9 bg-white text-[#2b6cb0] hover:bg-indigo-50 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                提交官方架构工单
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 详细文档全屏/半屏阅读 Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] border border-white/90 shadow-2xl max-w-3xl w-full max-h-[85vh] p-6 flex flex-col animate-fadeIn text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-black shrink-0">
                  {selectedArticle.category}
                </span>
                <h3 className="text-base font-extrabold text-slate-800 truncate">
                  {selectedArticle.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleExportMarkdown(selectedArticle)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1 transition-all border border-slate-200 cursor-pointer"
                  title="导出为 Markdown 文件"
                >
                  <Download className="w-3.5 h-3.5" /> 导出 MD
                </button>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer text-sm ml-2"
                >
                  ✕ 关闭
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 overflow-y-auto space-y-4 text-xs py-4 my-1 pr-1 custom-scrollbar">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-slate-700 leading-relaxed font-bold">
                {selectedArticle.summary}
              </div>

              {selectedArticle.fullContent && (
                <div className="space-y-2">
                  <h4 className="font-extrabold text-slate-800 text-xs">📖 详细架构与操作规范</h4>
                  <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 text-slate-600 leading-relaxed font-medium">
                    {selectedArticle.fullContent}
                  </div>
                </div>
              )}

              {selectedArticle.contentCode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1">
                      <Code className="w-4 h-4 text-indigo-600" />
                      开发者 API & Webhook 代码示例
                    </h4>
                    <button
                      onClick={() => handleCopyCode(selectedArticle.contentCode!, selectedArticle.id)}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all border border-indigo-100 cursor-pointer"
                    >
                      {copiedCodeId === selectedArticle.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> 一键复制代码
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-4 bg-slate-900 text-indigo-200 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto shadow-inner">
                    <code>{selectedArticle.contentCode}</code>
                  </pre>
                </div>
              )}

              {/* 点赞有用评价与关联模块快捷跳转 */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-[11px]">这篇文章对您有帮助吗？</span>
                  <button
                    onClick={() => handleRateArticle(selectedArticle.id, "up")}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border transition-all flex items-center gap-1 cursor-pointer ${
                      articleFeedbackState[selectedArticle.id] === "up"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" /> 有帮助
                  </button>
                  <button
                    onClick={() => handleRateArticle(selectedArticle.id, "down")}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border transition-all flex items-center gap-1 cursor-pointer ${
                      articleFeedbackState[selectedArticle.id] === "down"
                        ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <ThumbsDown className="w-3 h-3" /> 需改进
                  </button>
                </div>

                {selectedArticle.relatedLink && (
                  <button
                    onClick={() => {
                      const path = selectedArticle.relatedLink!.path;
                      setSelectedArticle(null);
                      handleProtectedAction(path);
                    }}
                    className="text-indigo-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {selectedArticle.relatedLink.label}
                  </button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 shrink-0 flex justify-end gap-2 border-t border-slate-100">
              {selectedArticle.contentCode && (
                <button
                  onClick={() => {
                    setSelectedArticle(null);
                    handleProtectedAction("/settings/webhooks");
                  }}
                  className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  前往 Webhooks 通道测试
                </button>
              )}
              <button
                onClick={() => setSelectedArticle(null)}
                className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                关闭阅读
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提交官方工单与文档反馈 Modal (对接真实 /api/feedback 后端数据库) */}
      {isFeedbackOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] border border-white/90 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fadeIn text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4.5 h-4.5 text-indigo-600" />
                提交官方文档反馈工单
              </h3>
              <button
                onClick={() => setIsFeedbackOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {submittedTicketId ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-800">官方反馈工单提交成功！</h4>
                <div className="p-3 bg-slate-50 font-mono text-indigo-600 rounded-xl border border-slate-200 font-bold text-xs inline-block">
                  工单单号: {submittedTicketId}
                </div>
                <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                  已成功写入系统数据库 `userfeedback` 记录。舟坊架构师团队将评估并在 24 小时内跟进。
                </p>
                <button
                  onClick={() => setIsFeedbackOpen(false)}
                  className="px-5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs mt-2"
                >
                  完成
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-4 text-xs">
                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">反馈分类</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "suggestion", label: "功能建议" },
                      { id: "bug", label: "问题报错" },
                      { id: "experience", label: "文档补充" },
                      { id: "other", label: "架构咨询" }
                    ].map(item => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setFeedbackType(item.id)}
                        className={`h-8 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                          feedbackType === item.id
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">
                    反馈主题标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={feedbackTitle}
                    onChange={e => setFeedbackTitle(e.target.value)}
                    placeholder="如：Webhook 签名验证文档缺少 Node.js 样例代码"
                    maxLength={50}
                    className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:border-indigo-500 text-slate-800 text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-600 font-bold block">
                      详细说明内容 <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {feedbackContent.length} / 5000 字
                    </span>
                  </div>
                  <textarea
                    value={feedbackContent}
                    onChange={e => setFeedbackContent(e.target.value)}
                    placeholder="请描述具体的建议或问题，至少 10 个字符..."
                    rows={4}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-indigo-500 text-slate-800 text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">联系方式 (选填)</label>
                  <input
                    type="text"
                    value={feedbackContact}
                    onChange={e => setFeedbackContact(e.target.value)}
                    placeholder="您的联系邮箱或电话，方便反馈结果接收"
                    className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-indigo-500 text-slate-800 text-xs"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {submittingFeedback ? "写入数据库中..." : "提交官方工单"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFeedbackOpen(false)}
                    className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />

      {/* 退出登录二次确认弹窗 */}
      {confirmDialog}
    </div>
  );
}
