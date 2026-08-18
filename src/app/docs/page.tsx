"use client";

import { useState, useEffect } from "react";
import { useLogout } from "@/hooks/useLogout";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import SearchInput from "@/components/common/SearchInput";
import { useToast } from "@/components/Toast";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Users,
  Settings,
  Shield,
  Rocket,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Search,
  Code,
  Layers,
  HelpCircle,
  Server,
  Terminal,
  ArrowRight
} from "lucide-react";
import Footer from "@/components/Footer";

interface DocSection {
  id: string;
  title: string;
  icon: any;
  articles: DocArticle[];
}

interface DocArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  contentCode?: string; // 选填的代码示例或高级说明，用于开发者文档 Mock
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
  const handleLogout = useLogout();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("start");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // 精准拦截敏感操作
  const handleProtectedAction = (targetPath: string) => {
    if (!user) {
      toast.info("登录后可查看和配置你的开发者资源", { id: "auth-guard" });
      router.push(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
    } else {
      router.push(targetPath);
    }
  };

  // 六大核心展示目录设计
  const defaultSections: DocSection[] = [
    {
      id: "start",
      title: "开始使用",
      icon: Rocket,
      articles: [
        {
          id: "start-1",
          title: "产品概览",
          summary: "知阁舟坊是一个专为现代软件开发及企业数字化转型设计的全栈自动化任务装配与工作流中枢。它不仅为技术开发者提供了开放、稳定的 OpenAPI 集成，也为业务人员、技术管理层以及审计合规团队设计了免代码的“舟坊操作台”面板，能够直观进行组件拼装与资源监管。",
          category: "新手指南"
        },
        {
          id: "start-2",
          title: "注册与登录",
          summary: "在前台导航栏直接点击【免费体验工作台】即可发起账号注册。系统支持手机验证码、第三方快捷登录以及企业级多因素安全认证（MFA），确保账户入口防御安全。",
          category: "新手指南"
        },
        {
          id: "start-3",
          title: "空间中枢",
          summary: "空间中枢是您登录工作台后的第一站。在此集中汇聚了您的个人空间和加入的所有企业协作空间。提供各个空间的运行健康度、可用调用点数明细、以及组件近期自动化调用的工期优化趋势。",
          category: "核心概念"
        },
        {
          id: "start-4",
          title: "个人空间",
          summary: "专属于个人调试与零星任务的物理隔离单元。系统默认每月为每个个人空间划拨 100 点的免费额度，供用户零门槛装配和执行系统组件。",
          category: "核心概念"
        },
        {
          id: "start-5",
          title: "企业空间",
          summary: "面向企业协作、支持多租户隔离与精细权限树（RBAC）的多人协作容器。企业空间能绑定专属域名，统一采购和共享资源额度，并记录全部协作日志。",
          category: "核心概念"
        },
        {
          id: "start-6",
          title: "组件大厅",
          summary: "平台组件的“挑选超市”。内含 53 项覆盖文本结构化、代码审查、标书偏离审核以及技术文档编写的成熟业务模块，支持一键挑选并加装进指定的工作空间。",
          category: "核心概念"
        }
      ]
    },
    {
      id: "flow",
      title: "工作流程",
      icon: Layers,
      articles: [
        {
          id: "flow-1",
          title: "创建自动化任务",
          summary: "在工作空间操作台内，点击左侧【挑选大厅】挂载好组件后，点击控制台的【新建自动化任务】即可拉起该组件的参数表单视口。",
          category: "操作流程"
        },
        {
          id: "flow-2",
          title: "上传业务材料",
          summary: "支持 PDF, Word, Excel, ZIP 等多格式材料附件上传。单文件上传上限为 50MB。数据传输及静止状态均实行 AES-256 全流程加密防护。",
          category: "操作流程"
        },
        {
          id: "flow-3",
          title: "智能推荐组件",
          summary: "平台配有智能调度算法。可根据您上传文件的词汇密度与任务领域，自动在页面推荐出效率最高、耗点最省的沙箱处理组件组合。",
          category: "智能辅助"
        },
        {
          id: "flow-4",
          title: "执行自动化任务",
          summary: "确认参数后点击【开始运行】。系统会将任务以异步队列派发给分布式独立容器沙箱处理，并实时返回耗时进度条与状态看板。",
          category: "操作流程"
        },
        {
          id: "flow-5",
          title: "查看结构化结果",
          summary: "组件任务执行成功后，结果中心将实时输出工整易读的 Markdown 报告和标准的 JSON 返回值，并提供可视化折线和柱状统计图。",
          category: "操作流程"
        },
        {
          id: "flow-6",
          title: "沉淀知识库 (SOP)",
          summary: "一键将优秀的运行结果或防坑经验归档为团队规范。经空间所有者审核通过后即可正式生效，为后续流程提供规范化避坑指引。",
          category: "知识管理"
        }
      ]
    },
    {
      id: "components",
      title: "组件能力",
      icon: Server,
      articles: [
        {
          id: "comp-1",
          title: "标书偏离审核组件",
          summary: "自动扫描上传的招标文件，快速识别出对己方不利的苛刻商务偏离、工程账期风险以及惩罚性条款。预计点数消耗：5 点/次。",
          category: "招投标场景"
        },
        {
          id: "comp-2",
          title: "产品需求分析组件",
          summary: "抓取业务方散乱的功能邮件或口头纪要，自动生成满足国标标准的大厂级产品需求文档（PRD）和模块大纲。预计点数消耗：3 点/次。",
          category: "系统设计场景"
        },
        {
          id: "comp-3",
          title: "源码安全审查组件",
          summary: "拉取提交的代码包，自动执行静态测试、语法树扫描、已知开源漏洞库排查以及圈复杂度安全审查。预计点数消耗：4 点/次。",
          category: "开发测试场景"
        },
        {
          id: "comp-4",
          title: "文档撰写与 SOP 生成组件",
          summary: "提取系统设计大纲，一键转写为精细的部署操作 SOP、学生/开发者快速上手指南或运维操作手册。预计点数消耗：2 点/次。",
          category: "项目交接场景"
        }
      ]
    },
    {
      id: "developer",
      title: "开发者接入",
      icon: Code,
      articles: [
        {
          id: "dev-1",
          title: "RESTful API 接入概览",
          summary: "知阁舟坊为开发者提供了开放的 API 集成接口，支持外部系统对装配组件进行高并发异步调用。统一 Endpoint 根入口：https://api.zhige-dockyard.com/v1",
          category: "API 参考"
        },
        {
          id: "dev-2",
          title: "API 认证机制 (凭证安全)",
          summary: "所有调用接口均需在 HTTP Header 中附带鉴权凭证。为了保障您的资产安全，前台只展示 Mock 示例数据，请勿将真实的 API Key 上传至任何公共 Git 仓库中。",
          category: "安全认证",
          contentCode: "Authorization: Bearer YOUR_API_KEY\nContent-Type: application/json"
        },
        {
          id: "dev-3",
          title: "组件调用请求示例",
          summary: "以下是使用 curl 命令行异步拉起标书偏离审核组件的 JSON 请求示例：",
          category: "代码示例",
          contentCode: `curl -X POST "https://api.zhige-dockyard.com/v1/rfp/parse" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "document_url": "https://example.com/attachments/rfp-doc.pdf",
    "workspaceId": "workspace_xxx",
    "options": {
      "extract_strict_terms": true
    }
  }'`
        },
        {
          id: "dev-4",
          title: "标准化 JSON 响应示例",
          summary: "组件任务拉起成功后返回的异步任务标识信息样例如下：",
          category: "代码示例",
          contentCode: `{
  "success": true,
  "data": {
    "taskId": "task_xxx",
    "status": "RUNNING",
    "componentId": "comp-rfp-parser",
    "estimatedTimeSeconds": 8,
    "pointsDeducted": 5,
    "createdAt": "2026-06-28T23:50:00Z"
  }
}`
        },
        {
          id: "dev-5",
          title: "Webhook 异步事件订阅",
          summary: "当空间内的自动化任务处理完成（SUCCESS 或 FAILED）时，舟坊后端的通知引擎会主动向您配置的 Webhook URL 推送 POST 状态回调。示例如下：",
          category: "消息订阅",
          contentCode: `{
  "event": "task.completed",
  "workspaceId": "workspace_xxx",
  "payload": {
    "taskId": "task_xxx",
    "status": "SUCCESS",
    "resultSummary": "标书扫描完成，共识别出 3 项高危法务偏离款项。"
  }
}`
        }
      ]
    },
    {
      id: "enterprise",
      title: "企业与私有化",
      icon: Shield,
      articles: [
        {
          id: "ent-1",
          title: "企业多租户隔离与安全",
          summary: "多租户架构下实现数据物理隔离与私有容器沙箱。企业上传的所有标书与项目设计资料均存储于物理隔离的专属存储桶中，确保数据安全不泄露。",
          category: "安全防护"
        },
        {
          id: "ent-2",
          title: "精细组件授权矩阵",
          summary: "企业空间管理员可根据研发岗位的具体职责，白名单授权特定组件的可运行范围，阻断非授权用户滥用空间点数或越权配置高危组件。",
          category: "合规治理"
        },
        {
          id: "ent-3",
          title: "私有化集群部署方案",
          summary: "支持私有云（阿云/腾讯云）、专有网络（VPC）以及内网物理机集群部署。提供一键打包的 Docker 镜像集与 K8s 集群编排配置文件。",
          category: "私有化"
        }
      ]
    },
    {
      id: "faq",
      title: "常见问题",
      icon: HelpCircle,
      articles: [
        {
          id: "faq-1",
          title: "点数额度是如何扣除的？",
          summary: "任务消耗的点数依赖于所选组件的复杂程度。例如，标书解析因为处理文本量巨大，每次扣除 5 点；需求分析扣除 3 点。可在空间统计页中实时查看消耗流水。",
          category: "额度计费"
        },
        {
          id: "faq-2",
          title: "上传的数据会作为 AI 训练的材料吗？",
          summary: "绝对不会。知阁舟坊对商业机密安全执行极高等级保护，您的业务数据和运行结果绝不会被用来作为大模型的二次训练材料，并在缓存到期后彻底粉碎清除。",
          category: "数据安全"
        },
        {
          id: "faq-3",
          title: "如何升级为企业空间？",
          summary: "点击个人空间切换器中的【创建/升级企业空间】即可发起容量及协作人数升级，或联系客户经理获取专属的企业私有化定制方案。",
          category: "购买咨询"
        }
      ]
    }
  ];

  // 融合数据库数据源 (对齐分类，做活数据流)
  const docSections = defaultSections.map(section => {
    // 过滤出数据库里属于这个分类的活文档
    const dbArticles = dbDocuments
      .filter(doc => {
        if (section.id === "start") return doc.category === "user-guide" || doc.category === "start";
        if (section.id === "components") return doc.category === "api-doc" || doc.category === "components";
        if (section.id === "enterprise") return doc.category === "system-doc" || doc.category === "enterprise";
        if (section.id === "faq") return doc.category === "faq";
        if (section.id === "developer") return doc.category === "developer";
        return doc.category === section.id;
      })
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        summary: doc.content || "暂无详情",
        category: doc.tags || "动态归档"
      }));

    return {
      ...section,
      articles: [...section.articles, ...dbArticles]
    };
  });

  const filteredSections = docSections.map((section) => ({
    ...section,
    articles: section.articles.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.summary.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((section) => section.articles.length > 0 && (activeSection ? section.id === activeSection : true));

  return (
    <div 
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.08) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 炫丽的大厂感毛玻璃背景模糊气泡 */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.05] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.05] rounded-full blur-[130px] pointer-events-none" />

      {/* Main Container */}
      <main className="relative z-10 flex items-start justify-center px-4 py-8 pt-4">
        <div className="w-full max-w-7xl bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 overflow-hidden">
          
          {/* 大气恢弘的首屏搜索及大标题区域 */}
          <div className="px-6 py-12 border-b border-slate-100 bg-gradient-to-r from-[#3182ce]/5 via-purple-500/[0.02] to-[#10b981]/5">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#2b6cb0]/20">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
                知阁舟坊文档中心
              </h1>
              <p className="text-xs md:text-sm text-slate-500 max-w-2xl mx-auto font-bold mt-2.5 leading-relaxed">
                了解空间、组件、任务、知识库和企业接入方式，快速完成从组件试用到企业落地。
              </p>
            </div>

            {/* 顶栏大厂搜索条 */}
            <div className="max-w-xl mx-auto">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="搜索文档要点、使用指南或 API 常见问题..."
                debounceMs={300}
              />
            </div>
          </div>

          {/* 首屏四大主入口卡片 (快速链接大目录) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/50 border-b border-slate-100">
            <button 
              onClick={() => setActiveSection("start")}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl hover:border-[#3182ce] hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center mb-3">
                <Rocket className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-850 flex items-center gap-1 group-hover:text-[#3182ce] transition-colors">
                新手入门 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </h4>
              <p className="text-xs text-slate-500 font-semibold mt-2 leading-relaxed">
                从注册、空间中枢到第一次执行组件。
              </p>
            </button>

            <button 
              onClick={() => setActiveSection("components")}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl hover:border-[#3182ce] hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <Server className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-850 flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                组件使用 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </h4>
              <p className="text-xs text-slate-500 font-semibold mt-2 leading-relaxed">
                了解各类工作组件的输入、输出和场景。
              </p>
            </button>

            <button 
              onClick={() => setActiveSection("developer")}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl hover:border-[#3182ce] hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                <Code className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-850 flex items-center gap-1 group-hover:text-purple-600 transition-colors">
                开发者接入 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </h4>
              <p className="text-xs text-slate-500 font-semibold mt-2 leading-relaxed">
                查看 API、Webhook、沙箱和接入方式。
              </p>
            </button>

            <button 
              onClick={() => setActiveSection("enterprise")}
              className="p-5 bg-white border border-slate-200/60 rounded-2xl hover:border-[#3182ce] hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-850 flex items-center gap-1 group-hover:text-orange-600 transition-colors">
                企业部署 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </h4>
              <p className="text-xs text-slate-500 font-semibold mt-2 leading-relaxed">
                企业空间、组件安全矩阵及私有云部署。
              </p>
            </button>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* 左侧 6 大目录导航 */}
            <div className="w-full lg:w-60 lg:border-r border-slate-100 p-5 shrink-0 bg-slate-50/20">
              <span className="text-xs font-extrabold text-slate-400 uppercase block px-4 mb-3 tracking-widest">手册目录</span>
              <nav className="space-y-1">
                {defaultSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => {
                        setActiveSection(section.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-800"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{section.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* 右侧主文档展示区 */}
            <div className="flex-1 p-6 md:p-8">
              
              {/* 登录后增设的“我的开发者资源”快捷入口，不混入正文 */}
              {user && (
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-wrap items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🛠️</span>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">我的开发者资源</h4>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">您已成功登录，可在此快速访问开发者控制台。</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={() => handleProtectedAction("/user/api-keys")}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      我的 API Key
                    </button>
                    <button 
                      onClick={() => handleProtectedAction("/user/webhooks")}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      Webhooks 设置
                    </button>
                    <button 
                      onClick={() => handleProtectedAction("/studio")}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      沙箱测试
                    </button>
                    <button 
                      onClick={() => handleProtectedAction("/workspace-hub")}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-[#3182ce] hover:text-[#3182ce] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      调用统计
                    </button>
                  </div>
                </div>
              )}

              {/* 文档加载状态与列表呈现 */}
              {loadingDocs ? (
                <div className="text-center py-20">
                  <div className="w-10 h-10 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs text-slate-500 font-bold">正在加载系统手册中...</p>
                </div>
              ) : filteredSections.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <Search className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 mb-1">
                    未找到匹配的手册文章
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    可以更换其他关键词，或联系技术支持团队。
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {filteredSections.map((section) => (
                    <div key={section.id} className="space-y-5 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-sm text-white">
                          <section.icon className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                          {section.title}
                        </h2>
                      </div>

                      <div className="grid gap-4">
                        {section.articles.map((article) => (
                          <div
                            key={article.id}
                            className="p-6 bg-slate-50/30 backdrop-blur-md rounded-[20px] border border-slate-200/50 hover:border-[#3182ce]/40 hover:bg-white hover:shadow-lg hover:shadow-blue-500/[0.02] transition-all duration-300"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center mb-2">
                                  <span className="px-2.5 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                                    {article.category}
                                  </span>
                                </div>
                                <h3 className="text-sm sm:text-base font-extrabold text-slate-850 mb-2">
                                  {article.title}
                                </h3>
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                  {article.summary}
                                </p>

                                {/* 开发者文档 Mock 代码与凭证安全展示规范 */}
                                {article.contentCode && (
                                  <div className="mt-3.5 relative rounded-xl overflow-hidden border border-slate-200/70 bg-slate-900 font-mono text-xs leading-relaxed text-slate-300">
                                    <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-500 font-bold select-none">
                                      <span>MOCK_SHELL_SANDBOX</span>
                                      <span className="text-[#3182ce]">Bearer Token 样例</span>
                                    </div>
                                    <pre className="p-4 overflow-x-auto select-all whitespace-pre-wrap break-all">
                                      <code>{article.contentCode}</code>
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Support Actions banner */}
              <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 rounded-[20px] p-6 text-center">
                  <h3 className="text-sm font-extrabold text-slate-850 mb-1">
                    需要更高级的专属部署或咨询支持？
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-semibold leading-relaxed">
                    如果您需要定制化业务组件开发或驻场离线私有云部署，欢迎联系我们的专家架构师。
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button 
                      onClick={() => router.push("/solutions")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#3182ce] hover:bg-[#3182ce]/10 rounded-xl transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      查看解决方案
                    </button>
                    <button 
                      onClick={() => handleProtectedAction("/docs")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-xl shadow-sm hover:shadow hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      联系专家技术支持
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>
      
      <Footer />
    </div>
  );
}
