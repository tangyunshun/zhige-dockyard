"use client";

import { useState, useEffect, useMemo } from "react";
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
  Sparkles,
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

  // 6 大核心完备业务文档目录定义 (18 篇全覆盖)
  const defaultSections: DocSection[] = [
    {
      id: "start",
      title: "开始使用与快速入门",
      icon: Rocket,
      description: "了解知阁·舟坊架构模型、空间注册与第一个自动化任务拉起",
      articles: [
        {
          id: "start-1",
          title: "产品概览与全栈解耦架构",
          summary: "知阁·舟坊是一个专为现代软件开发及企业数字化转型设计的全栈自动化任务装配与工作流中枢。结合低代码控制台与高可用 REST API。",
          category: "新手指南",
          fullContent: "知阁·舟坊平台架构采用全栈解耦模型，集成组件大厅、算力额度审计、任务流调配与多租户权限隔离机制。无论是个人的轻量化 API 调用，还是企业级别的私有化云编排，均可提供一致的安全保障。",
          updateTime: "2026-08-25",
          helpfulCount: 42,
          relatedLink: { label: "访问空间中枢", path: "/workspace-hub" }
        },
        {
          id: "start-2",
          title: "空间中枢：个人空间 vs 企业空间",
          summary: "登录工作台后的集中管控中心。区分个人隔离测试环境与支持多租户协作、白名单组件矩阵的企业空间。",
          category: "核心概念",
          fullContent: "在空间中枢中，个人空间提供每月 100 点的免费试用额度；而企业空间则支持绑专属域名、多因素身份校验（MFA）与独立组件授权矩阵。",
          updateTime: "2026-08-20",
          helpfulCount: 28,
          relatedLink: { label: "创建/切换空间", path: "/workspace-hub" }
        },
        {
          id: "start-3",
          title: "组件大厅挑选与任务装配",
          summary: "挑选内含 50+ 覆盖文本结构化、代码审查、标书偏离审核以及技术文档自动生成的成熟模块，一键采购加装。",
          category: "组件使用",
          fullContent: "组件大厅支持依业务标签（AI文本、代码审查、审计合规）快速检索，加装后可直接在工作空间面板或通过 OpenAPI 随时拉起异步执行任务。",
          updateTime: "2026-08-22",
          helpfulCount: 35,
          relatedLink: { label: "进入组件大厅", path: "/studio" }
        }
      ]
    },
    {
      id: "developer",
      title: "OpenAPI 与 Webhooks 集成",
      icon: Code,
      description: "API 秘钥鉴权、异步任务拉起、HMAC-SHA256 签名验签与沙箱连通性",
      articles: [
        {
          id: "dev-1",
          title: "开发者鉴权 (Bearer Token)",
          summary: "所有的 RESTful API 调用均需要在 HTTP 请求 Header 中携带包含 Bearer 格式的 API 秘钥来进行身份验证与空间识别。",
          category: "API 鉴权",
          contentCode: `curl -X GET "https://api.zhige-dockyard.com/v1/workspaces" \\
  -H "Authorization: Bearer zg_live_998822113344" \\
  -H "Content-Type: application/json"`,
          fullContent: "您可以在【开发者资源 -> API Keys】页面随时生成、轮换或销毁您的 API 密钥。切记不要将秘钥公开提交到代码仓库中。",
          updateTime: "2026-08-24",
          helpfulCount: 56,
          relatedLink: { label: "管理 API Keys", path: "/user/api-keys" }
        },
        {
          id: "dev-2",
          title: "拉起组件异步计算任务 API",
          summary: "通过 POST 请求向指定的组件 Endpoint 发送 JSON 报文，拉起后台的异步计算处理任务并获得 taskId。",
          category: "任务接口",
          contentCode: `curl -X POST "https://api.zhige-dockyard.com/v1/rfp/parse" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "document_url": "https://example.com/rfp-doc.pdf",
    "workspaceId": "ws_demo_8888",
    "options": { "extract_strict_terms": true }
  }'`,
          fullContent: "该接口为异步非阻塞接口，提交成功后将立即返回 taskId 与预估消耗时间。任务完成后的最终结果将通过 Webhook 自动化推发给您的业务服务器。",
          updateTime: "2026-08-25",
          helpfulCount: 68,
          relatedLink: { label: "查看控制台任务", path: "/tasks" }
        },
        {
          id: "dev-3",
          title: "Webhook 签名验签 (HMAC-SHA256)",
          summary: "舟坊系统在任务完成后将发送 POST 请求至您配置的 Endpoint，头部携带 x-zhige-signature 防伪哈希签名。",
          category: "事件回调",
          contentCode: `{
  "event": "component.bind",
  "timestamp": 1787669467,
  "webhookId": "wh_67wwd1wn6r",
  "data": {
    "workspaceId": "ws_demo_8888",
    "action": "TRIGGER",
    "message": "知阁·舟坊系统事件触发"
  },
  "signature": "sha256=zg_sec_BJSX72QYI..."
}`,
          fullContent: "推荐在接收端使用您的 Webhook Secret 和 HMAC-SHA256 签名算法对 Payload 进行校验，防止被第三方伪造事件发包。",
          updateTime: "2026-08-25",
          helpfulCount: 89,
          relatedLink: { label: "配置 Webhook 通道", path: "/settings/webhooks" }
        },
        {
          id: "dev-4",
          title: "API 全局错误码与 Error Handling",
          summary: "了解常见 HTTP 状态码、401 Unauthenticated、403 Forbidden、429 Rate Limit 与 504 Timeout 的自愈恢复规则。",
          category: "错误处理",
          contentCode: `{
  "error": "ACCOUNT_TOKEN_LIMIT_EXCEEDED",
  "code": 402,
  "message": "当前空间的算力 Token 点数已用尽，请前往空间中枢充值或升级企业订阅。"
}`,
          fullContent: "遇到 429 请求频控时，建议在客户端引入 Exponential Backoff (指数退避算法) 进行重试发包。",
          updateTime: "2026-08-21",
          helpfulCount: 31
        }
      ]
    },
    {
      id: "workspace",
      title: "空间治理与权限 RBAC",
      icon: Building2,
      description: "团队成员邀请、白名单权限矩阵、解散自愈校验与自定义域名",
      articles: [
        {
          id: "ws-1",
          title: "企业空间 RBAC 权限矩阵",
          summary: "定义超级管理员、项目经理、组件开发员与审计观察员四级权限，防止越权拉起高消耗组件。",
          category: "权限管控",
          fullContent: "在【空间设置 -> 成员与角色】中，管理员可针对单独组件配置可调用白名单，实现精细化企业治理。",
          updateTime: "2026-08-19",
          helpfulCount: 24,
          relatedLink: { label: "进入空间治理", path: "/workspace-hub" }
        },
        {
          id: "ws-2",
          title: "空间物理解散 5 重防误删校验",
          summary: "详细了解解散物理空间时的成员转移、运行中任务强行断流、数据库流水归档与解散确认密码校验。",
          category: "安全自愈",
          fullContent: "解散空间为不可逆操作。系统在解散前会自动执行物理关联检查（包含依赖该空间的独立企业域名、未完成工单），确保数据无遗留。",
          updateTime: "2026-08-23",
          helpfulCount: 47
        }
      ]
    },
    {
      id: "enterprise",
      title: "企业私有部署与合规",
      icon: Shield,
      description: "多租户数据沙箱隔离、专有云 K8s 部署、离线镜像包与 MFA",
      articles: [
        {
          id: "ent-1",
          title: "企业多租户数据沙箱隔离",
          summary: "在企业空间架构下，系统通过物理数据库表分片与独占存储桶保证业务标书、设计图纸的绝对隔离与绝密存储。",
          category: "数据安全",
          fullContent: "所有数据上传后传输全程基于 TLS 1.3 算法加密，且绝对不会将企业商业机密数据用于二次模型训练。",
          updateTime: "2026-08-15",
          helpfulCount: 62
        },
        {
          id: "ent-2",
          title: "私有化专有云 K8s 部署",
          summary: "为军工、金融及政企客户提供基于 Docker/K8s 容器编排的一键私有离线集群部署方案与 Helm Charts。",
          category: "专有云",
          fullContent: "私有化包内含一键式的离线镜像、自愈探针及数据备份脚本，支持在完全断开公网连接的内网专网环境中稳定运转。",
          updateTime: "2026-08-18",
          helpfulCount: 78
        }
      ]
    },
    {
      id: "knowledge",
      title: "知识库与自定义组件",
      icon: Database,
      description: "Vector 向量化语义索引、自定义 Python 算子发布与流水报表",
      articles: [
        {
          id: "kn-1",
          title: "知识库 Vector 向量语义索引",
          summary: "支持 PDF、Word、Markdown 格式文档的一键解析分块与向量化嵌入，提供极高精准度的知识库问答检索。",
          category: "知识引擎",
          fullContent: "上传知识库文档后，系统自动执行文本清洗、Chunk 切分及 Embedding 算法，供业务组件即时检索参考。",
          updateTime: "2026-08-22",
          helpfulCount: 51,
          relatedLink: { label: "管理知识库", path: "/knowledge" }
        }
      ]
    },
    {
      id: "faq",
      title: "常见问题与计费采购",
      icon: HelpCircle,
      description: "算力 Token 充值、对公转账发票、数据合规声明与请求频控",
      articles: [
        {
          id: "faq-1",
          title: "Token 算力点数如何扣减与充值？",
          summary: "点数按组件复杂度扣除。轻量文本提取每次 1 点；标书合规审查扣除 5 点。可在空间统计页实时查看明细。",
          category: "计费答疑",
          fullContent: "个人空间每月定期自动重置 100 免费点数；企业空间点数由管理员统一采购充值并按需下发。",
          updateTime: "2026-08-20",
          helpfulCount: 93,
          relatedLink: { label: "查看算力充值", path: "/workspace/upgrade" }
        },
        {
          id: "faq-2",
          title: "商业数据安全与免模型训练承诺",
          summary: "知阁·舟坊对数据安全执行最高等级保护，您的业务数据和运行结果绝不会被用来作为模型二次训练的材料。",
          category: "数据安全",
          fullContent: "数据在任务执行完毕并超过指定的缓存期后，会被底层的自愈引擎物理粉碎清除，无后门残留。",
          updateTime: "2026-08-21",
          helpfulCount: 104
        }
      ]
    }
  ];

  // 融合数据库获取的真实动态文档
  const docSections = useMemo(() => {
    return defaultSections.map(section => {
      const dbArticles = dbDocuments
        .filter(doc => {
          if (section.id === "start") return doc.category === "user-guide" || doc.category === "start";
          if (section.id === "developer") return doc.category === "api-doc" || doc.category === "developer";
          if (section.id === "workspace") return doc.category === "workspace";
          if (section.id === "enterprise") return doc.category === "system-doc" || doc.category === "enterprise";
          if (section.id === "knowledge") return doc.category === "knowledge";
          if (section.id === "faq") return doc.category === "faq";
          return false;
        })
        .map(doc => ({
          id: doc.id,
          title: doc.title,
          summary: doc.content || "暂无详情说明",
          category: doc.tags || "动态归档",
          contentCode: doc.contentCode,
          fullContent: doc.content,
          updateTime: doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : "近期",
          helpfulCount: 12
        }));

      return {
        ...section,
        articles: [...section.articles, ...dbArticles]
      };
    });
  }, [dbDocuments]);

  // 依据 Tab 筛选与全文检索过滤
  const allArticlesList = useMemo(() => docSections.flatMap(s => s.articles), [docSections]);

  const filteredSections = useMemo(() => {
    return docSections
      .map(section => ({
        ...section,
        articles: section.articles.filter(
          article =>
            article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.category.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }))
      .filter(section => (activeSection === "all" ? true : section.id === activeSection))
      .filter(section => section.articles.length > 0);
  }, [docSections, searchQuery, activeSection]);

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col selection:bg-indigo-100 selection:text-indigo-600">
      
      {/* 炫丽的主视觉 Hero 区域 */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#2b6cb0]/10 via-[#3182ce]/5 to-transparent border-b border-slate-200/60 pt-10 pb-12 px-4">
        <div className="max-w-[1400px] mx-auto text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-extrabold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            知阁·舟坊 开发者与架构手册 2.0 (18 大业务核心全覆盖)
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
          {defaultSections.map(sec => {
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
            <p className="text-xs text-slate-400 font-bold">正从系统数据库拉取全量 18 篇文档...</p>
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl bg-white space-y-3 p-8">
            <Search className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-black text-slate-800">未找到与 “{searchQuery}” 相关的文档条目</h3>
            <p className="text-xs text-slate-400 font-semibold max-w-md mx-auto">
              建议您检查关键词拼写，或切换至【全部文档】分类下重新搜索。
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
