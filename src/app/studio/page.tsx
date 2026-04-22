"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Bell,
  ChevronDown,
  FileText,
  Code,
  Shield,
  Rocket,
  Cpu,
  Database,
  Activity,
  Sparkles,
  Box,
  MoreHorizontal,
  Grid3X3,
  List,
  User,
  ArrowLeft,
  Search as SearchIcon,
  ShieldCheck,
  TrendingUp,
  Languages,
  Calculator,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  Heart,
  Palette,
  Wand2,
  LayoutTemplate,
  Globe,
  Accessibility,
  Image,
  FileCode,
  GitMerge,
  Scissors,
  FileSpreadsheet,
  Languages as Chinese,
  Key,
  Braces,
  Plug,
  SearchCheck,
  Bug,
  TestTube2,
  Wind,
  ImageMinus,
  Wrench,
  Cloud,
  Scale,
  FileWarning,
  Settings,
  Package,
  Shirt,
  Phone,
  Signature,
  Smile,
  Users,
  Network,
  Server,
  Layers,
  Terminal,
  CreditCard,
  FolderLock,
  MonitorPlay,
  Star,
  Clock,
  Flame,
  CheckCircle,
  X,
  ExternalLink,
  BookOpen,
  HelpCircle,
  Filter,
  SortAsc,
  SortDesc,
  Trash2,
  ChevronRight,
  BarChart3,
  Calendar,
  Zap,
  Bookmark,
  Share2,
  Download,
  Eye,
  ThumbsUp,
  MessageCircle,
  Info,
} from "lucide-react";

// 53 个核心组件完整数据 - 按 10 大软件工程阶段分组
const componentStages = [
  {
    title: "第一阶段：商机捕获与售前打单",
    components: [
      { id: "C01", emoji: "📄", name: "RFP 标书偏离表极速拆解器", description: "解析长篇招标文件，自动提取资质要求与明标暗坑", icon: FileText, calls: 3421, successRate: 98.5 },
      { id: "C02", emoji: "🛡️", name: "国家标准与合规防漏检扫描仪", description: "离线扫描技术方案，发现等保、国密等安全合规漏洞", icon: ShieldCheck, calls: 2156, successRate: 97.8 },
      { id: "C03", emoji: "⚔️", name: "竞品方案/行业研报萃取对比引擎", description: "提取竞品技术栈与价格，生成多维度对比矩阵与 SWOT", icon: TrendingUp, calls: 1876, successRate: 96.5 },
      { id: "C04", emoji: "🗣️", name: "行业黑话重写与降维器", description: "针对不同层级听众（董事长/技术），自动升降维技术话术", icon: Languages, calls: 2543, successRate: 99.1 },
      { id: "C05", emoji: "🧮", name: "非标项目防坑毛利测算盘", description: "基于历史数据自动推算隐性成本，精准预估项目毛利", icon: Calculator, calls: 1234, successRate: 95.8 },
      { id: "C06", emoji: "📈", name: "商业需求变现 ROI 推演沙盘", description: "量化功能价值与市场溢价，生成投入产出比推演报告", icon: Lightbulb, calls: 987, successRate: 94.2 },
    ],
  },
  {
    title: "第二阶段：需求定义与产品设计",
    components: [
      { id: "C07", emoji: "🧩", name: "混沌沟通记录转 PRD/Jira 引擎", description: "从微信语音或会议中萃取结构化 PRD 与 User Story", icon: MessageSquare, calls: 4521, successRate: 98.9 },
      { id: "C08", emoji: "🕸️", name: "异常分支 (Edge Case) 补全器", description: "自动发散并发、边界、网络等极端异常状态与修复建议", icon: AlertTriangle, calls: 3245, successRate: 97.6 },
      { id: "C09", emoji: "🎭", name: "客诉工单/差评情感聚类与提单仪", description: "多源客诉文本分析，聚类情绪并转化为可落地的研发 Bug 单", icon: Heart, calls: 2876, successRate: 96.8 },
      { id: "C10", emoji: "💉", name: "UI 占位仿真业务数据注入器", description: "按行业规则（如身份证/号段）批量生成高逼真 Mock 数据", icon: Database, calls: 5432, successRate: 99.5 },
    ],
  },
  {
    title: "第三阶段：视觉、交互与大前端",
    components: [
      { id: "C11", emoji: "🧹", name: "屎山 CSS 净化与 Token 提取仪", description: "AST 解析旧项目，合并冗余样式并提取 Design Token", icon: Palette, calls: 2134, successRate: 97.2 },
      { id: "C12", emoji: "🌐", name: "多语言 i18n 保结构安全翻译引擎", description: "验证 JSON 键值完整性，智能补译并预警 UI 爆框风险", icon: Languages, calls: 1765, successRate: 98.1 },
      { id: "C13", emoji: "♿", name: "无障碍 (a11y) 与 SEO 结构离线自检器", description: "自动扫描 DOM 树，输出 WCAG 合规报告与 SEO 修复建议", icon: Accessibility, calls: 1432, successRate: 96.5 },
      { id: "C14", emoji: "🎨", name: "SVG 冗余清理与本地组件化生成器", description: "剥离设计软件元数据，极致压缩并一键转 React/Vue 组件", icon: Image, calls: 2987, successRate: 99.2 },
      { id: "C15", emoji: "📐", name: "设计稿切图转语义化 HTML 骨架", description: "视觉识别布局网格，生成符合 Tailwind 规范的 HTML5 骨架", icon: LayoutTemplate, calls: 3654, successRate: 98.7 },
    ],
  },
  {
    title: "第四阶段：架构设计与 DBA",
    components: [
      { id: "C16", emoji: "🗄️", name: "遗留数据库逆向 ER 图与字典生成器", description: "解析无文档的旧库，推断业务语义并生成可视化关系图", icon: Database, calls: 4123, successRate: 97.9 },
      { id: "C17", emoji: "🩺", name: "复杂表结构与慢 SQL 性能调优诊断室", description: "解析执行计划，推荐最优联合索引与 SQL 重写方案", icon: Activity, calls: 3567, successRate: 96.8 },
      { id: "C18", emoji: "✂️", name: "微服务拆分 (DDD) 实体边界划线器", description: "通过图算法聚类外键与高频查询，自动推荐限界上下文", icon: Scissors, calls: 2345, successRate: 95.6 },
      { id: "C19", emoji: "🚚", name: "异构老旧系统数据清洗与 ETL 脚本机", description: "跨库类型智能映射，自动处理脏数据并生成零停机迁移脚本", icon: FileSpreadsheet, calls: 1876, successRate: 94.8 },
      { id: "C20", emoji: "🇨🇳", name: "信创迁移 (国产化) 语法转换助手", description: "Oracle 复杂存储过程自动转译为达梦/人大金仓兼容语法", icon: Chinese, calls: 1234, successRate: 93.5 },
      { id: "C21", emoji: "📊", name: "白话文转 Mermaid 时序图/架构图渲染器", description: "自然语言理解时序并发逻辑，直接输出精准代码与架构图", icon: GitMerge, calls: 2987, successRate: 98.3 },
    ],
  },
  {
    title: "第五阶段：后端核心与 API 研发",
    components: [
      { id: "C22", emoji: "🔒", name: "生产库数据本地脱敏加密器", description: "保证外键一致性的同时，对生产数据进行不可逆隐私掩码", icon: Key, calls: 3421, successRate: 99.1 },
      { id: "C23", emoji: "📡", name: "无文档老系统逆向 Swagger 契约生成器", description: "扫描 Controller 层源码，自动反推生成 OpenAPI 3.0 规范", icon: FileCode, calls: 2654, successRate: 97.5 },
      { id: "C24", emoji: "🧱", name: "JSON 报文极速反转强类型实体类", description: "根据复杂 JSON 样本，瞬时推断类型并生成多语言 POJO", icon: Braces, calls: 4532, successRate: 98.8 },
      { id: "C25", emoji: "🔌", name: "第三方 API 奇葩参数自动映射器", description: "语义推断无文档的黑盒参数，生成数据字典与自测验证脚本", icon: Plug, calls: 1987, successRate: 96.2 },
      { id: "C26", emoji: "🔍", name: "老旧正则降维解释与可视化调试器", description: "翻译上古正则，生成状态机图表并评估灾难性回溯风险", icon: SearchCheck, calls: 1543, successRate: 95.8 },
      { id: "C27", emoji: "💊", name: "第三方黑盒 SDK 错误码解码库", description: "本地映射 5000+ 硬件设备错误码，推断深层根因与修复建议", icon: Bug, calls: 2876, successRate: 97.3 },
    ],
  },
  {
    title: "第六阶段：质量保证 QA",
    components: [
      { id: "C28", emoji: "🧪", name: "PRD 转全覆盖 Test Case 矩阵萃取器", description: "基于需求穷举正逆向/边界场景，直出标准化测试用例表", icon: TestTube2, calls: 3765, successRate: 98.6 },
      { id: "C29", emoji: "☢️", name: "极端脏数据与 Payload 本地批量注射器", description: "自动构造超长文本、Emoji、注入型等万级 Fuzzing 测试集", icon: Wind, calls: 2134, successRate: 96.9 },
      { id: "C30", emoji: "📸", name: "测试 Bug 截图转开发复现 SOP 描述仪", description: "视觉识别报错 UI，结合上下文推导并撰写标准缺陷复现单", icon: ImageMinus, calls: 2987, successRate: 97.8 },
      { id: "C31", emoji: "📈", name: "JMeter 压测场景脚本极速生成与脱水仪", description: "自动推导 TPS 阈值生成脚本，并将硬核 JTL 解析为可读报告", icon: Activity, calls: 1876, successRate: 95.5 },
      { id: "C32", emoji: "🩹", name: "UI 自动化测试脆性定位器修复仪", description: "对比 DOM 结构变更，自动修复大批量失效的 XPath 选择器", icon: Wrench, calls: 2345, successRate: 96.7 },
    ],
  },
  {
    title: "第七阶段：DevOps 与运维",
    components: [
      { id: "C33", emoji: "⚡", name: "脱敏生产 Log 报错根因排雷针", description: "GB 级日志极速脱敏，聚类分析 Exception 堆栈并锁定根因", icon: Activity, calls: 4321, successRate: 98.9 },
      { id: "C34", emoji: "💸", name: "云厂商账单刺客侦测与 Terraform 降本脚本", description: "识别闲置资源与冗余配置，一键生成降本销毁执行脚本", icon: Cloud, calls: 1654, successRate: 94.8 },
      { id: "C35", emoji: "⚖️", name: "开源组件许可证 (License) 商业合规扫描仪", description: "审计依赖树的 GPL 传染风险，输出法务级合规与替换报告", icon: Scale, calls: 2123, successRate: 97.2 },
      { id: "C36", emoji: "🛡️", name: "漏扫报告脱水与修复分发器", description: "翻译生涩的安服漏扫 PDF，直接给到开发对应代码的修复示例", icon: FileWarning, calls: 2876, successRate: 96.5 },
      { id: "C37", emoji: "🚥", name: "本地 Nginx/K8s 配置文件纠错器", description: "语义级排查路由冲突与选择器失配，避免语法正确但逻辑错误的线上故障", icon: Settings, calls: 1987, successRate: 95.8 },
      { id: "C38", emoji: "🐳", name: "Docker/K8s 镜像体积极限瘦身器", description: "剥离多余依赖并重组多阶段构建，压缩 80% 容器镜像体积", icon: Package, calls: 3245, successRate: 98.3 },
    ],
  },
  {
    title: "第八阶段：交付实施与软技能",
    components: [
      { id: "C39", emoji: "👔", name: "甲方驻场'高情商'汇报包装机", description: "将技术延期或事故转化为具建设性、高情商的业务汇报稿", icon: Shirt, calls: 2654, successRate: 97.6 },
      { id: "C40", emoji: "🔌", name: "软硬件联调非标日志白话文解析仪", description: "本地解析各大厂私有协议日志，关联链路并给出通俗诊断", icon: Phone, calls: 1876, successRate: 96.2 },
      { id: "C41", emoji: "✍️", name: "驻场验收单批量签字审批补录台", description: "解析历史邮件时间戳，批量生成合规的甲方功能验收确认单", icon: Signature, calls: 1234, successRate: 95.5 },
      { id: "C42", emoji: "📚", name: "一键操作手册（帮助文档）编撰机", description: "识别系统截图交互点，自动生成并排版供最终用户使用的指南", icon: FileText, calls: 3421, successRate: 98.7 },
      { id: "C43", emoji: "🧊", name: "敏捷回顾会议情绪降温与 Action 提取器", description: "分析团队语音情绪曲线，剔除抱怨并萃取 SMART 执行目标", icon: Smile, calls: 2134, successRate: 96.8 },
      { id: "C44", emoji: "🕵️", name: "技术团队简历库与人效模型暗中盘点器", description: "交叉 Git 与 Jira 真实数据，脱敏输出团队真实的技能与人效雷达", icon: Users, calls: 1543, successRate: 94.9 },
      { id: "C45", emoji: "🧠", name: "团队内网 Wiki 孤岛串联 RAG", description: "本地化向量索引多格式沉睡文档，打造不涉密的极速内网 AI 智库", icon: Network, calls: 2987, successRate: 97.5 },
    ],
  },
  {
    title: "第九阶段：知阁·舟坊扩展底座",
    components: [
      { id: "C46", emoji: "🔀", name: "大模型 API 多端聚合调度池", description: "统一接管多平台 LLM 与本地模型，智能路由并发与计费控制", icon: Server, calls: 5432, successRate: 99.2 },
      { id: "C47", emoji: "💅", name: "知阁·舟坊 UI/组件库视觉内核", description: "统领系统的全局 Design Token 与 50+ 高级业务前端组件规范", icon: Palette, calls: 4321, successRate: 98.9 },
      { id: "C48", emoji: "⚙️", name: "自定义 Prompt 工作流封装向导", description: "拖拽式编排工具链，支持高级用户串联多个节点实现非标自动化", icon: Settings, calls: 3654, successRate: 97.8 },
      { id: "C49", emoji: "🖥️", name: "本地 Python/Shell 脚本 UI 化套壳", description: "解析脚本参数，秒级生成带界面的可执行跨平台桌面应用", icon: Terminal, calls: 2876, successRate: 96.5 },
      { id: "C50", emoji: "🗃️", name: "离线微型向量知识库底座", description: "内存级 FAISS 引擎，千万级向量秒级检索的本地化存储支撑", icon: Database, calls: 2134, successRate: 98.1 },
      { id: "C51", emoji: "💳", name: "组件计费与 License 鉴权锁", description: "机器码与 RSA 双重校验，实现细粒度组件授权与本地反破解", icon: CreditCard, calls: 1765, successRate: 95.8 },
      { id: "C52", emoji: "🧫", name: "本地文件系统沙箱隔离机制", description: "严格的进程与目录白名单管控，确保 AI 读写本地文件绝对安全", icon: FolderLock, calls: 2345, successRate: 97.2 },
    ],
  },
  {
    title: "第十阶段：可视化与终极交付",
    components: [
      { id: "C53", emoji: "🖼️", name: "大模型跨端可视化产物组装站", description: "彻底打通'文本到图表'的最后一公里，将 Markdown/Mermaid 完美渲染为企业级技术图谱", icon: MonitorPlay, calls: 3987, successRate: 98.6 },
    ],
  },
];

const categories = ["全部", "分析类", "生成类", "工具类"];

// 热门搜索关键词
const hotSearches = ["PRD 文档", "ER 图", "代码 Diff", "标书解析", "SQL 优化", "CSS 净化", "API 测试"];

// 组件详情页数据结构
interface ComponentDetail {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  usage: string;
  apiDoc: string;
  faq: Array<{ q: string; a: string }>;
}

// 组件详情数据
const componentDetails: Record<string, ComponentDetail> = {
  "C01": {
    id: "C01",
    name: "RFP 标书偏离表极速拆解器",
    description: "解析长篇招标文件，自动提取资质要求与明标暗坑",
    fullDescription: "本组件采用先进的 NLP 技术，能够快速解析数百页的招标文件，自动识别并提取关键信息。支持 PDF、Word、Excel 等多种格式，准确率高达 98% 以上。",
    usage: "1. 上传招标文件（支持 PDF/Word/Excel）\n2. 选择解析模式（快速/深度）\n3. 点击'开始解析'按钮\n4. 查看提取结果并导出",
    apiDoc: "输入参数：\n- file: File (招标文件)\n- mode: 'fast' | 'deep' (解析模式)\n\n返回结果：\n- requirements: 资质要求列表\n- risks: 风险提示列表\n- deviations: 偏离表数据",
    faq: [
      { q: "支持哪些文件格式？", a: "支持 PDF、Word (.docx)、Excel (.xlsx) 格式。" },
      { q: "解析需要多长时间？", a: "根据文件大小，通常 100 页文档需要 30-60 秒。" },
      { q: "准确率如何？", a: "在标准格式下准确率可达 98%，复杂格式建议人工复核。" },
    ],
  },
};

export default function StudioPage() {
  // 搜索相关
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  
  // 筛选和排序
  const [selectedStage, setSelectedStage] = useState<number>(-1); // -1 表示全部
  const [sortBy, setSortBy] = useState<"default" | "hot" | "success" | "new">("default");
  const [showFilters, setShowFilters] = useState(false);
  
  // 收藏和最近使用
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  // 组件详情
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // 视图和引导
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showGuide, setShowGuide] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  
  // 批量操作
  const [selectMode, setSelectMode] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  
  // 统计总组件数
  const totalComponents = componentStages.reduce((sum, stage) => sum + stage.components.length, 0);
  
  // 加载用户偏好设置
  useEffect(() => {
    const savedFavorites = localStorage.getItem("studio_favorites");
    const savedRecentlyUsed = localStorage.getItem("studio_recently_used");
    const savedViewMode = localStorage.getItem("studio_view_mode") as "grid" | "list";
    const hasVisited = localStorage.getItem("studio_has_visited");
    
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
    if (savedRecentlyUsed) setRecentlyUsed(JSON.parse(savedRecentlyUsed));
    if (savedViewMode) setViewMode(savedViewMode);
    if (hasVisited) setIsFirstVisit(false);
    
    // 首次访问显示引导
    if (!hasVisited) {
      setShowGuide(true);
      localStorage.setItem("studio_has_visited", "true");
    }
  }, []);
  
  // 保存用户偏好
  useEffect(() => {
    localStorage.setItem("studio_favorites", JSON.stringify(favorites));
    localStorage.setItem("studio_recently_used", JSON.stringify(recentlyUsed));
    localStorage.setItem("studio_view_mode", viewMode);
  }, [favorites, recentlyUsed, viewMode]);
  
  // 处理搜索
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && !searchHistory.includes(query.trim())) {
      setSearchHistory([query.trim(), ...searchHistory].slice(0, 10));
    }
  };
  
  // 清除搜索历史
  const clearSearchHistory = () => {
    setSearchHistory([]);
  };
  
  // 切换收藏
  const toggleFavorite = (componentId: string) => {
    if (favorites.includes(componentId)) {
      setFavorites(favorites.filter(id => id !== componentId));
    } else {
      setFavorites([...favorites, componentId]);
    }
  };
  
  // 添加到最近使用
  const addToRecentlyUsed = (componentId: string) => {
    setRecentlyUsed([componentId, ...recentlyUsed.filter(id => id !== componentId)].slice(0, 10));
  };
  
  // 打开组件详情
  const openComponentDetail = (componentId: string) => {
    setSelectedComponent(componentId);
    setShowDetail(true);
    addToRecentlyUsed(componentId);
  };
  
  // 使用组件
  const useComponent = (componentId: string) => {
    addToRecentlyUsed(componentId);
    // TODO: 跳转到组件使用页面
    alert(`即将使用组件：${componentId}`);
  };
  
  // 切换选择模式
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedComponents([]);
  };
  
  // 切换组件选择
  const toggleComponentSelection = (componentId: string) => {
    if (selectedComponents.includes(componentId)) {
      setSelectedComponents(selectedComponents.filter(id => id !== componentId));
    } else {
      setSelectedComponents([...selectedComponents, componentId]);
    }
  };
  
  // 批量收藏
  const batchFavorite = () => {
    setFavorites([...new Set([...favorites, ...selectedComponents])]);
    setSelectedComponents([]);
    setSelectMode(false);
  };
  
  // 获取热门标签
  const getComponentTags = (component: any) => {
    const tags = [];
    if (component.calls > 3000) tags.push({ type: "hot", text: "周热门" });
    if (component.calls > 5000) tags.push({ type: "superhot", text: "月热门" });
    if (component.successRate > 99) tags.push({ type: "quality", text: "高质量" });
    return tags;
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff]">
      {/* 背景网格装饰 */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

      {/* 1. 顶部 Header - 融入系统导航 */}
      <header className="relative z-10 flex-shrink-0 h-14 bg-white/80 backdrop-blur-xl border-b border-[#e2e8f0]/80 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          {/* 返回 workspace-hub */}
          <a
            href="/workspace-hub"
            className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
            title="返回空间首页"
          >
            <div className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
              <ArrowLeft className="w-5 h-5" />
            </div>
          </a>

          {/* 面包屑导航 */}
          <nav className="flex items-center gap-2 text-sm">
            <a href="/workspace-hub" className="text-slate-500 hover:text-[#3182ce] transition-all">
              空间首页
            </a>
            <ChevronDown className="w-4 h-4 text-slate-400 rotate-[-90deg]" />
            <span className="text-slate-800 font-bold">Studio 组件库</span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* 全局搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件、阶段、功能..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowSearchHistory(true)}
              onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
              className="w-72 h-9 pl-10 pr-4 rounded-lg border border-[#e2e8f0] bg-white/80 text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
            />
            
            {/* 搜索历史和热门搜索下拉 */}
            {showSearchHistory && (searchHistory.length > 0 || searchQuery.trim()) && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-[#e2e8f0] p-4 z-50">
                {/* 热门搜索 */}
                {!searchQuery.trim() && searchHistory.length > 0 && (
                  <>
                    <div className="mb-3">
                      <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-[#f59e0b]" />
                        热门搜索
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hotSearches.slice(0, 5).map((term, index) => (
                          <button
                            key={index}
                            onClick={() => handleSearch(term)}
                            className="px-2 py-1 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-bold rounded-md hover:bg-[#f59e0b]/20 transition-all"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="border-t border-[#e2e8f0] pt-3">
                      <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          搜索历史
                        </span>
                        <button
                          onClick={clearSearchHistory}
                          className="text-slate-400 hover:text-[#ef4444] transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {searchHistory.slice(0, 5).map((term, index) => (
                          <button
                            key={index}
                            onClick={() => handleSearch(term)}
                            className="w-full text-left px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded transition-all flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {term}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                
                {/* 搜索结果预览 */}
                {searchQuery.trim() && (
                  <div>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                      搜索结果
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {componentStages.flatMap(s => s.components).filter(c => 
                        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.description.toLowerCase().includes(searchQuery.toLowerCase())
                      ).slice(0, 8).map((component) => (
                        <button
                          key={component.id}
                          onClick={() => {
                            openComponentDetail(component.id);
                            setShowSearchHistory(false);
                          }}
                          className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{component.emoji}</span>
                            <div>
                              <div className="text-sm font-bold text-slate-800">{component.name}</div>
                              <div className="text-xs text-slate-500 truncate">{component.description}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="relative w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ef4444] rounded-full border-2 border-white" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[#3182ce]/20 cursor-pointer">
            A
          </div>
        </div>
      </header>

      {/* 2. 主内容区 - 53 个组件矩阵墙 */}
      <main className="relative z-0 p-6">
        {/* 统计面板 */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 总组件数 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                <Box className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#3182ce] bg-[#3182ce]/10 px-2 py-1 rounded-full">全部</span>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">{totalComponents}</div>
            <div className="text-xs text-slate-500 font-bold">总组件数</div>
          </div>
          
          {/* 我的收藏 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
              <button 
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`text-xs font-bold px-2 py-1 rounded-full transition-all ${showFavoritesOnly ? 'bg-[#f59e0b] text-white' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}
              >
                {showFavoritesOnly ? '已启用' : '查看全部'}
              </button>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">{favorites.length}</div>
            <div className="text-xs text-slate-500 font-bold">我的收藏</div>
          </div>
          
          {/* 最近使用 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#10b981] bg-[#10b981]/10 px-2 py-1 rounded-full">Top 10</span>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">{recentlyUsed.length}</div>
            <div className="text-xs text-slate-500 font-bold">最近使用</div>
          </div>
          
          {/* 今日调用 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#8b5cf6] bg-[#8b5cf6]/10 px-2 py-1 rounded-full">+12.5%</span>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">12,847</div>
            <div className="text-xs text-slate-500 font-bold">今日调用</div>
          </div>
        </div>
        
        {/* 最近使用快速访问 */}
        {recentlyUsed.length > 0 && (
          <div className="mb-8 bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#10b981]" />
                <h3 className="text-sm font-black text-slate-800">最近使用</h3>
              </div>
              <button 
                onClick={() => setRecentlyUsed([])}
                className="text-xs text-slate-500 hover:text-[#ef4444] transition-all flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                清空
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {recentlyUsed.slice(0, 10).map((componentId) => {
                const component = componentStages.flatMap(s => s.components).find(c => c.id === componentId);
                if (!component) return null;
                return (
                  <button
                    key={componentId}
                    onClick={() => openComponentDetail(componentId)}
                    className="flex-shrink-0 px-3 py-2 bg-gradient-to-r from-[#10b981]/10 to-[#059669]/10 border border-[#10b981]/20 rounded-lg hover:border-[#10b981]/40 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{component.emoji}</span>
                      <div className="text-left">
                        <div className="text-[11px] font-black text-slate-800">{component.name}</div>
                        <div className="text-[9px] text-slate-500">{component.calls.toLocaleString()} 次调用</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 工具栏 - 筛选和排序 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 阶段筛选 */}
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`h-9 px-4 rounded-lg border flex items-center gap-2 text-sm font-bold transition-all ${showFilters ? 'bg-[#3182ce] text-white border-[#3182ce]' : 'bg-white/80 text-slate-700 border-[#e2e8f0] hover:border-[#3182ce]'}`}
              >
                <Filter className="w-4 h-4" />
                筛选
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              
              {/* 筛选下拉菜单 */}
              {showFilters && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-[#e2e8f0] p-4 z-50">
                  <div className="mb-4">
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">按阶段筛选</div>
                    <div className="space-y-1">
                      <button
                        onClick={() => setSelectedStage(-1)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedStage === -1 ? 'bg-[#3182ce] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                      >
                        全部阶段
                      </button>
                      {componentStages.map((stage, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedStage(index)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedStage === index ? 'bg-[#3182ce] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                        >
                          {stage.title}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">显示选项</div>
                    <button
                      onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${showFavoritesOnly ? 'bg-[#f59e0b] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                    >
                      <span className="flex items-center gap-2">
                        <Star className="w-4 h-4" />
                        只看收藏
                      </span>
                      {showFavoritesOnly && <CheckCircle className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* 排序 */}
            <div className="relative">
              <button
                className="h-9 px-4 rounded-lg border border-[#e2e8f0] bg-white/80 flex items-center gap-2 text-sm font-bold hover:border-[#3182ce] transition-all"
                onClick={() => setSortBy(sortBy === "default" ? "hot" : sortBy === "hot" ? "success" : sortBy === "success" ? "new" : "default")}
              >
                {sortBy === "default" && <><SortAsc className="w-4 h-4" />默认排序</>}
                {sortBy === "hot" && <><Flame className="w-4 h-4" />按热度</>}
                {sortBy === "success" && <><CheckCircle className="w-4 h-4" />按成功率</>}
                {sortBy === "new" && <><SortDesc className="w-4 h-4" />按新旧</>}
              </button>
            </div>
            
            {/* 批量操作 */}
            <button
              onClick={toggleSelectMode}
              className={`h-9 px-4 rounded-lg border flex items-center gap-2 text-sm font-bold transition-all ${selectMode ? 'bg-[#8b5cf6] text-white border-[#8b5cf6]' : 'bg-white/80 text-slate-700 border-[#e2e8f0] hover:border-[#8b5cf6]'}`}
            >
              {selectMode ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  已选择 {selectedComponents.length} 个
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4" />
                  批量操作
                </>
              )}
            </button>
            
            {selectMode && (
              <button
                onClick={batchFavorite}
                className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Star className="w-4 h-4" />
                批量收藏
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* 视图切换 */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white shadow" : "hover:bg-slate-200"}`}
              >
                <Grid3X3 className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded ${viewMode === "list" ? "bg-white shadow" : "hover:bg-slate-200"}`}
              >
                <List className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        {/* 按阶段分组的组件矩阵 */}
        {componentStages.map((stage, stageIndex) => (
          <div key={stageIndex} className="mb-10">
            {/* 阶段标题 - 优化版 */}
            <div className="mb-6 relative">
              <div className="flex items-center gap-3 mb-3">
                {/* 左侧彩色竖条 */}
                <div 
                  className="w-1.5 h-8 rounded-full"
                  style={{
                    background: `linear-gradient(180deg, #3182ce 0%, #8b5cf6 100%)`
                  }}
                ></div>
                
                {/* 阶段标题 */}
                <h2 className="text-[16px] font-black text-slate-800 tracking-tight">
                  {stage.title}
                </h2>
                
                {/* 组件数量标签 */}
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-[#3182ce] to-[#8b5cf6] text-white shadow-md">
                  {stage.components.length} 个组件
                </span>
              </div>
              
              {/* 底部渐变分割线 */}
              <div className="h-1 rounded-full" style={{
                background: `linear-gradient(90deg, #3182ce 0%, #8b5cf6 50%, #3182ce 100%)`,
                opacity: 0.3
              }}></div>
            </div>

            {/* 组件 Grid 容器 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {stage.components.map((component, compIndex) => {
                const IconComponent = component.icon;
                const isFavorite = favorites.includes(component.id);
                // 根据索引分配不同的颜色主题 (6 种配色循环)
                const colorThemes = [
                  { color: '#3182ce', bgColor: 'from-blue-400/10 to-blue-600/10' }, // 蓝色
                  { color: '#10b981', bgColor: 'from-emerald-400/10 to-emerald-600/10' }, // 绿色
                  { color: '#f59e0b', bgColor: 'from-amber-400/10 to-amber-600/10' }, // 橙色
                  { color: '#8b5cf6', bgColor: 'from-violet-400/10 to-violet-600/10' }, // 紫色
                  { color: '#ec4899', bgColor: 'from-pink-400/10 to-pink-600/10' }, // 粉色
                  { color: '#ef4444', bgColor: 'from-red-400/10 to-red-600/10' }, // 红色
                ];
                const theme = colorThemes[compIndex % 6];
                
                return (
                  <div
                    key={component.id}
                    className="matrix-item min-h-[220px] bg-white/95 backdrop-blur-[16px] rounded-[12px] border-2 transition-all duration-300 cursor-pointer group hover:-translate-y-2 hover:shadow-2xl flex flex-col relative overflow-hidden"
                    onClick={() => openComponentDetail(component.id)}
                    style={{
                      borderColor: `${theme.color}30`,
                      background: `linear-gradient(135deg, ${theme.color}08 0%, ${theme.color}03 100%)`,
                      boxShadow: `0 4px 24px -8px ${theme.color}20, inset 0 1px 0 rgba(255,255,255,0.8)`
                    }}
                  >
                    {/* 左上角编号 */}
                    <span 
                      className="matrix-tag absolute top-3 left-3 px-2 py-1 text-[10px] font-black rounded-[6px] z-10"
                      style={{
                        backgroundColor: `${theme.color}15`,
                        color: theme.color
                      }}
                    >
                      {component.id}
                    </span>

                    {/* 右上角收藏按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(component.id);
                      }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border-2 flex items-center justify-center hover:scale-110 transition-all z-10"
                      style={{ borderColor: `${theme.color}30` }}
                    >
                      <Star className={`w-4 h-4 ${isFavorite ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-slate-400'}`} />
                    </button>

                    {/* 背景装饰 */}
                    <div 
                      className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20 blur-3xl"
                      style={{ backgroundColor: theme.color }}
                    ></div>
                    <div 
                      className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full opacity-10 blur-3xl"
                      style={{ backgroundColor: theme.color }}
                    ></div>

                    {/* 内容区 */}
                    <div className="flex flex-col items-center justify-center flex-1 px-4 pt-10 pb-4 relative z-10">
                      {/* 中心 Icon */}
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                        style={{
                          background: `linear-gradient(135deg, ${theme.color}20 0%, ${theme.color}10 100%)`,
                          boxShadow: `0 8px 24px -4px ${theme.color}30`
                        }}
                      >
                        <IconComponent className="w-8 h-8" style={{ color: theme.color }} />
                      </div>
                      
                      {/* 组件名称 */}
                      <div className="text-[15px] font-black text-slate-800 tracking-tight text-center leading-snug mb-3 line-clamp-2 px-2">
                        {component.name}
                      </div>
                      
                      {/* 组件描述 (直接显示) */}
                      <div className="text-[12px] text-slate-700 text-center leading-relaxed line-clamp-3 px-3 font-medium">
                        {component.description}
                      </div>
                    </div>

                    {/* 底部操作按钮 */}
                    <div className="px-4 pb-4 pt-2 flex items-center gap-2 relative z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          useComponent(component.id);
                        }}
                        className="flex-1 h-9 rounded-[8px] text-white text-[11px] font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1.5"
                        style={{
                          background: `linear-gradient(135deg, ${theme.color} 0%, ${theme.color}cc 100%)`,
                          boxShadow: `0 4px 12px -2px ${theme.color}40`
                        }}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        使用
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // 分享功能
                          alert(`分享组件：${component.name}`);
                        }}
                        className="w-9 h-9 rounded-[8px] bg-white border-2 flex items-center justify-center hover:scale-110 transition-all"
                        style={{ borderColor: `${theme.color}30` }}
                        title="分享"
                      >
                        <Share2 className="w-4 h-4" style={{ color: theme.color }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* 封底卡片 C150 */}
        <div className="mt-12 mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#3182ce] via-[#4299e1] to-[#63b3ed] p-8 shadow-2xl shadow-[#3182ce]/30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>
            <div className="relative z-10 text-center">
              <h2 className="text-2xl font-black text-white mb-3">
                10 大阶段，53 款原生组件全量挂载完成！
              </h2>
              <p className="text-white/90 text-sm font-bold">
                持续进化中，重新定义软件全生命周期 AI 效能
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 组件详情弹窗 */}
      {showDetail && selectedComponent && componentDetails[selectedComponent] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* 弹窗头部 */}
            <div className="sticky top-0 bg-white border-b border-[#e2e8f0] px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                  <span className="text-2xl">{componentDetails[selectedComponent].name.charAt(0)}</span>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">{componentDetails[selectedComponent].name}</h2>
                  <p className="text-xs text-slate-500">{componentDetails[selectedComponent].description}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
            {/* 弹窗内容 */}
            <div className="p-6 space-y-6">
              {/* 功能说明 */}
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#3182ce]" />
                  功能说明
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {componentDetails[selectedComponent].fullDescription}
                </p>
              </div>
              
              {/* 使用教程 */}
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#10b981]" />
                  使用教程
                </h3>
                <div className="bg-slate-50 rounded-lg p-4">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                    {componentDetails[selectedComponent].usage}
                  </pre>
                </div>
              </div>
              
              {/* API 文档 */}
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                  <Code className="w-4 h-4 text-[#8b5cf6]" />
                  API 文档
                </h3>
                <div className="bg-slate-900 rounded-lg p-4">
                  <pre className="text-xs text-white whitespace-pre-wrap font-mono">
                    {componentDetails[selectedComponent].apiDoc}
                  </pre>
                </div>
              </div>
              
              {/* FAQ */}
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-[#f59e0b]" />
                  常见问题
                </h3>
                <div className="space-y-3">
                  {componentDetails[selectedComponent].faq.map((item, index) => (
                    <div key={index} className="bg-white border border-[#e2e8f0] rounded-lg p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <HelpCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                        <p className="text-sm font-bold text-slate-800">{item.q}</p>
                      </div>
                      <p className="text-xs text-slate-600 ml-6">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0]">
                <button
                  onClick={() => toggleFavorite(selectedComponent)}
                  className={`px-4 py-2 rounded-lg border flex items-center gap-2 text-sm font-bold transition-all ${favorites.includes(selectedComponent) ? 'bg-[#f59e0b] text-white border-[#f59e0b]' : 'bg-white text-slate-700 border-[#e2e8f0] hover:border-[#f59e0b]'}`}
                >
                  <Star className="w-4 h-4" />
                  {favorites.includes(selectedComponent) ? '已收藏' : '添加收藏'}
                </button>
                
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 rounded-lg border border-[#e2e8f0] flex items-center gap-2 text-sm font-bold text-slate-700 hover:border-[#3182ce] transition-all">
                    <Share2 className="w-4 h-4" />
                    分享
                  </button>
                  <button
                    onClick={() => useComponent(selectedComponent)}
                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-sm font-bold hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    立即使用
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 新手引导弹窗 */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800">欢迎使用 Studio 组件库</h2>
                </div>
                <button
                  onClick={() => setShowGuide(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#3182ce]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#3182ce]">1</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">浏览组件</h3>
                    <p className="text-xs text-slate-600">53 个核心组件按 10 大软件工程阶段分类，快速找到所需工具</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#10b981]">2</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">搜索与筛选</h3>
                    <p className="text-xs text-slate-600">使用搜索框、阶段筛选、排序等功能快速定位组件</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#f59e0b]">3</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">收藏与使用</h3>
                    <p className="text-xs text-slate-600">点击卡片查看详情，收藏常用组件，一键启动使用</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#8b5cf6]">4</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">批量操作</h3>
                    <p className="text-xs text-slate-600">点击"批量操作"按钮，可多选组件进行批量收藏等操作</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowGuide(false)}
                  className="text-sm text-slate-600 hover:text-slate-800 transition-all"
                >
                  跳过引导
                </button>
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-sm font-bold hover:shadow-lg transition-all"
                >
                  开始使用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 自定义滚动条样式和矩阵卡片样式 */}
      <style jsx global>{`
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(241, 245, 249, 0.5);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(49, 130, 206, 0.4);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(49, 130, 206, 0.7);
        }
        
        /* 矩阵卡片样式 */
        .matrix-item {
          position: relative;
          overflow: hidden;
        }
        
        .matrix-tag {
          z-index: 10;
        }
      `}</style>
    </div>
  );
}
