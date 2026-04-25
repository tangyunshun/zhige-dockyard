"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import {
  Search,
  ChevronDown,
  FileText,
  Code,
  Shield,
  Rocket,
  Server,
  Database,
  Activity,
  Star,
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
  Award,
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
  Server as ServerIcon,
  Layers,
  Terminal,
  CreditCard,
  FolderLock,
  MonitorPlay,
  Star as StarIcon,
  Clock,
  TrendingUp as TrendingUpIcon,
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
  Zap as ZapIcon,
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
      {
        id: "C01",
        emoji: "📄",
        name: "标书智能解析",
        description: "提取标书关键条款，自动对比产品能力生成偏离表",
        icon: FileText,
        calls: 3421,
        successRate: 98.5,
      },
      {
        id: "C02",
        emoji: "🛡️",
        name: "方案合规审查",
        description: "离线扫描技术方案，检查等保、国密等合规风险",
        icon: ShieldCheck,
        calls: 2156,
        successRate: 97.8,
      },
      {
        id: "C03",
        emoji: "⚔️",
        name: "竞品对比分析",
        description: "提取竞品文档核心数据，生成多维度对比矩阵",
        icon: TrendingUp,
        calls: 1876,
        successRate: 96.5,
      },
      {
        id: "C04",
        emoji: "🗣️",
        name: "汇报话术转换",
        description: "根据汇报对象（高管/技术），自动调整技术方案的表达深度",
        icon: Languages,
        calls: 2543,
        successRate: 99.1,
      },
      {
        id: "C05",
        emoji: "🧮",
        name: "项目成本测算",
        description: "结合历史数据推算项目隐性成本与预估毛利",
        icon: Calculator,
        calls: 1234,
        successRate: 95.8,
      },
      {
        id: "C06",
        emoji: "📈",
        name: "商业价值评估",
        description: "量化功能收益与开发成本，生成投入产出比报告",
        icon: Lightbulb,
        calls: 987,
        successRate: 94.2,
      },
    ],
  },
  {
    title: "第二阶段：需求定义与产品设计",
    components: [
      {
        id: "C07",
        emoji: "🧩",
        name: "需求转 PRD",
        description: "将会议纪要或聊天记录，整理为结构化需求文档",
        icon: MessageSquare,
        calls: 4521,
        successRate: 98.9,
      },
      {
        id: "C08",
        emoji: "🕸️",
        name: "异常场景补全",
        description: "根据主流程自动补充边界、并发等异常场景的处理建议",
        icon: AlertTriangle,
        calls: 3245,
        successRate: 97.6,
      },
      {
        id: "C09",
        emoji: "🎭",
        name: "客诉归因分析",
        description: "聚类分析多渠道客诉数据，自动生成研发缺陷单",
        icon: Heart,
        calls: 2876,
        successRate: 96.8,
      },
      {
        id: "C10",
        emoji: "💉",
        name: "仿真数据生成",
        description: "依据真实行业规则，批量生成高逼真的业务测试数据",
        icon: Database,
        calls: 5432,
        successRate: 99.5,
      },
    ],
  },
  {
    title: "第三阶段：大前端与交互",
    components: [
      {
        id: "C11",
        emoji: "🧹",
        name: "CSS 样式重构",
        description: "分析旧项目冗余样式，精简代码并提取设计规范 Token",
        icon: Palette,
        calls: 2134,
        successRate: 97.2,
      },
      {
        id: "C12",
        emoji: "🌐",
        name: "国际化词条校验",
        description: "检查多语言配置的完整性，智能翻译并预警 UI 文本截断",
        icon: Languages,
        calls: 1765,
        successRate: 98.1,
      },
      {
        id: "C13",
        emoji: "♿",
        name: "页面合规检测",
        description: "扫描前端代码结构，输出无障碍访问及 SEO 优化建议",
        icon: Accessibility,
        calls: 1432,
        successRate: 96.5,
      },
      {
        id: "C14",
        emoji: "🎨",
        name: "SVG 组件转换",
        description: "压缩图标体积，一键转换为可复用的前端代码组件",
        icon: Image,
        calls: 2987,
        successRate: 99.2,
      },
      {
        id: "C15",
        emoji: "📐",
        name: "设计稿转代码",
        description: "识别设计图布局，生成基础的 HTML5 与 CSS 结构",
        icon: LayoutTemplate,
        calls: 3654,
        successRate: 98.7,
      },
    ],
  },
  {
    title: "第四阶段：架构设计与 DBA",
    components: [
      {
        id: "C16",
        emoji: "🗄️",
        name: "数据库逆向解析",
        description: "扫描老旧数据库，自动生成 ER 关系图与数据字典",
        icon: Database,
        calls: 4123,
        successRate: 97.9,
      },
      {
        id: "C17",
        emoji: "🩺",
        name: "慢 SQL 优化",
        description: "分析数据库执行计划，提供索引建立与查询重写建议",
        icon: Activity,
        calls: 3567,
        successRate: 96.8,
      },
      {
        id: "C18",
        emoji: "✂️",
        name: "微服务拆分建议",
        description: "基于表关联度与访问频率，自动推荐服务拆分边界",
        icon: Scissors,
        calls: 2345,
        successRate: 95.6,
      },
      {
        id: "C19",
        emoji: "🚚",
        name: "数据迁移脚本",
        description: "跨数据库类型映射，生成数据清洗与迁移脚本",
        icon: FileSpreadsheet,
        calls: 1876,
        successRate: 94.8,
      },
      {
        id: "C20",
        emoji: "🇨",
        name: "国产库语法转换",
        description: "将 Oracle 等传统 SQL 自动转换为达梦或人大金仓语法",
        icon: Chinese,
        calls: 1234,
        successRate: 93.5,
      },
      {
        id: "C21",
        emoji: "📊",
        name: "架构图代码生成",
        description: "根据自然语言描述，直接生成 Mermaid 架构和时序图代码",
        icon: GitMerge,
        calls: 2987,
        successRate: 98.3,
      },
    ],
  },
  {
    title: "第五阶段：后端研发与 API",
    components: [
      {
        id: "C22",
        emoji: "🔒",
        name: "生产数据脱敏",
        description: "对导出的生产数据进行掩码处理，保障测试环境隐私安全",
        icon: Key,
        calls: 3421,
        successRate: 99.1,
      },
      {
        id: "C23",
        emoji: "📡",
        name: "接口文档逆向",
        description: "扫描后端源码，反向生成标准 OpenAPI/Swagger 文档",
        icon: FileCode,
        calls: 2654,
        successRate: 97.5,
      },
      {
        id: "C24",
        emoji: "🧱",
        name: "JSON 转实体类",
        description: "粘贴 JSON 报文，一键生成 Java/Go/TS 等强类型实体代码",
        icon: Braces,
        calls: 4532,
        successRate: 98.8,
      },
      {
        id: "C25",
        emoji: "🔌",
        name: "接口参数映射",
        description: "推理无文档 API 的参数含义，生成字段映射表与测试脚本",
        icon: Plug,
        calls: 1987,
        successRate: 96.2,
      },
      {
        id: "C26",
        emoji: "🔍",
        name: "正则表达式解析",
        description: "将复杂正则翻译为自然语言和图表，检测回溯性能风险",
        icon: SearchCheck,
        calls: 1543,
        successRate: 95.8,
      },
      {
        id: "C27",
        emoji: "💊",
        name: "硬件错误码诊断",
        description: "匹配设备厂商错误码库，直接给出硬件或 SDK 报错原因",
        icon: Bug,
        calls: 2876,
        successRate: 97.3,
      },
    ],
  },
  {
    title: "第六阶段：质量保证 QA",
    components: [
      {
        id: "C28",
        emoji: "🧪",
        name: "测试用例生成",
        description: "解析需求文档，自动生成涵盖正逆向与边界的用例表",
        icon: TestTube2,
        calls: 3765,
        successRate: 98.6,
      },
      {
        id: "C29",
        emoji: "☢️",
        name: "漏洞 Payload 构造",
        description: "批量生成用于安全测试的注入、越权及超长脏数据",
        icon: Wind,
        calls: 2134,
        successRate: 96.9,
      },
      {
        id: "C30",
        emoji: "📸",
        name: "缺陷单自动完善",
        description: "识别报错截图，自动补全复现步骤与环境前置条件",
        icon: ImageMinus,
        calls: 2987,
        successRate: 97.8,
      },
      {
        id: "C31",
        emoji: "📈",
        name: "压测脚本与分析",
        description: "根据性能指标生成 JMeter 脚本，并解析测试报告瓶颈",
        icon: Activity,
        calls: 1876,
        successRate: 95.5,
      },
      {
        id: "C32",
        emoji: "🩹",
        name: "UI 自动化修复",
        description: "对比前端 DOM 变更，批量修复失效的测试选择器",
        icon: Wrench,
        calls: 2345,
        successRate: 96.7,
      },
    ],
  },
  {
    title: "第七阶段：DevOps 与运维",
    components: [
      {
        id: "C33",
        emoji: "⚡",
        name: "报错日志根因分析",
        description: "过滤海量日志，聚合报错堆栈并定位故障根本原因",
        icon: Activity,
        calls: 4321,
        successRate: 98.9,
      },
      {
        id: "C34",
        emoji: "💸",
        name: "云资源降本优化",
        description: "识别闲置云资源，一键生成资源释放或降配脚本",
        icon: Cloud,
        calls: 1654,
        successRate: 94.8,
      },
      {
        id: "C35",
        emoji: "⚖️",
        name: "开源合规审计",
        description: "扫描代码依赖树，预警 GPL 等传染性开源协议风险",
        icon: Scale,
        calls: 2123,
        successRate: 97.2,
      },
      {
        id: "C36",
        emoji: "🛡️",
        name: "漏扫报告转化",
        description: "将第三方安全扫描报告，转化为开发可直接执行的代码修复单",
        icon: FileWarning,
        calls: 2876,
        successRate: 96.5,
      },
      {
        id: "C37",
        emoji: "🚥",
        name: "配置文件检查",
        description: "校验 Nginx/K8s 配置的逻辑冲突，预防发布事故",
        icon: Settings,
        calls: 1987,
        successRate: 95.8,
      },
      {
        id: "C38",
        emoji: "🐳",
        name: "容器镜像瘦身",
        description: "优化 Dockerfile 构建步骤，清理冗余依赖以压缩镜像体积",
        icon: Package,
        calls: 3245,
        successRate: 98.3,
      },
    ],
  },
  {
    title: "第八阶段：交付实施与协同",
    components: [
      {
        id: "C39",
        emoji: "👔",
        name: "项目汇报美化",
        description: "润色项目延期或技术阻碍等敏感汇报的语言表达",
        icon: Shirt,
        calls: 2654,
        successRate: 97.6,
      },
      {
        id: "C40",
        emoji: "🔌",
        name: "硬件日志诊断",
        description: "解析非标准设备日志，辅助软硬件联调排障",
        icon: Phone,
        calls: 1876,
        successRate: 96.2,
      },
      {
        id: "C41",
        emoji: "✍️",
        name: "验收单据生成",
        description: "提取往来邮件记录，批量生成符合甲方规范的验收确认单",
        icon: Signature,
        calls: 1234,
        successRate: 95.5,
      },
      {
        id: "C42",
        emoji: "📚",
        name: "操作手册生成",
        description: "识别系统截图交互点，自动生成图文并茂的用户使用手册",
        icon: FileText,
        calls: 3421,
        successRate: 98.7,
      },
      {
        id: "C43",
        emoji: "🧊",
        name: "敏捷回顾总结",
        description: "过滤情绪化发言，从会议记录中提炼具体的改进任务",
        icon: Smile,
        calls: 2134,
        successRate: 96.8,
      },
      {
        id: "C44",
        emoji: "🕵️",
        name: "研发效能分析",
        description: "结合代码提交与工单数据，客观评估团队成员技术贡献度",
        icon: Users,
        calls: 1543,
        successRate: 94.9,
      },
      {
        id: "C45",
        emoji: "🧠",
        name: "团队知识库问答",
        description: "索引本地多格式文档，构建团队内部安全的知识问答助手",
        icon: Network,
        calls: 2987,
        successRate: 97.5,
      },
    ],
  },
  {
    title: "第九阶段：系统扩展底座",
    components: [
      {
        id: "C46",
        emoji: "🔀",
        name: "多模型路由网关",
        description: "统一调度云端与本地大模型 API，实现负载均衡与计费控制",
        icon: Server,
        calls: 5432,
        successRate: 99.2,
      },
      {
        id: "C47",
        emoji: "💅",
        name: "全局视觉内核",
        description: "统管平台设计规范，提供标准化前端 UI 组件库",
        icon: Palette,
        calls: 4321,
        successRate: 98.9,
      },
      {
        id: "C48",
        emoji: "⚙️",
        name: "工作流编排器",
        description: "可视化拖拽编排工具，支持多组件串联的复杂任务流",
        icon: Settings,
        calls: 3654,
        successRate: 97.8,
      },
      {
        id: "C49",
        emoji: "🖥️",
        name: "脚本 UI 化工具",
        description: "将命令行脚本一键封装为带交互界面的可执行桌面程序",
        icon: Terminal,
        calls: 2876,
        successRate: 96.5,
      },
      {
        id: "C50",
        emoji: "🗃️",
        name: "本地向量数据库",
        description: "提供轻量级本地向量存储与检索，支持断网环境运作",
        icon: Database,
        calls: 2134,
        successRate: 98.1,
      },
      {
        id: "C51",
        emoji: "💳",
        name: "授权与计费中心",
        description: "管理组件调用配额，提供机器码绑定的本地防破解验证",
        icon: CreditCard,
        calls: 1765,
        successRate: 95.8,
      },
      {
        id: "C52",
        emoji: "🧫",
        name: "沙箱隔离环境",
        description: "限制模型对本地文件的读写权限，确保数据处理绝对安全",
        icon: FolderLock,
        calls: 2345,
        successRate: 97.2,
      },
    ],
  },
  {
    title: "第十阶段：交付与可视化",
    components: [
      {
        id: "C53",
        emoji: "🖼️",
        name: "架构可视化渲染",
        description: "将底层代码/文本，无缝渲染为标准交互式系统架构图与脑图",
        icon: MonitorPlay,
        calls: 3987,
        successRate: 98.6,
      },
    ],
  },
];

const categories = ["全部", "分析类", "生成类", "工具类"];

// 热门搜索关键词
const hotSearches = [
  "PRD 文档",
  "ER 图",
  "代码 Diff",
  "标书解析",
  "SQL 优化",
  "CSS 净化",
  "API 测试",
];

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
  C01: {
    id: "C01",
    name: "RFP 标书偏离表极速拆解器",
    description: "解析长篇招标文件，自动提取资质要求与明标暗坑",
    fullDescription:
      "本组件采用先进的 NLP 技术，能够快速解析数百页的招标文件，自动识别并提取关键信息。支持 PDF、Word、Excel 等多种格式，准确率高达 98% 以上。",
    usage:
      "1. 上传招标文件（支持 PDF/Word/Excel）\n2. 选择解析模式（快速/深度）\n3. 点击'开始解析'按钮\n4. 查看提取结果并导出",
    apiDoc:
      "输入参数：\n- file: File (招标文件)\n- mode: 'fast' | 'deep' (解析模式)\n\n返回结果：\n- requirements: 资质要求列表\n- risks: 风险提示列表\n- deviations: 偏离表数据",
    faq: [
      {
        q: "支持哪些文件格式？",
        a: "支持 PDF、Word (.docx)、Excel (.xlsx) 格式。",
      },
      {
        q: "解析需要多长时间？",
        a: "根据文件大小，通常 100 页文档需要 30-60 秒。",
      },
      {
        q: "准确率如何？",
        a: "在标准格式下准确率可达 98%，复杂格式建议人工复核。",
      },
    ],
  },
};

export default function StudioPage() {
  const toast = useToast();
  // 搜索相关
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);

  // 从 localStorage 加载搜索历史
  useEffect(() => {
    const saved = localStorage.getItem("studio_search_history");
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.error("加载搜索历史失败:", e);
      }
    }
  }, []);

  // 保存搜索历史到 localStorage
  const saveSearchHistory = (history: string[]) => {
    setSearchHistory(history);
    localStorage.setItem("studio_search_history", JSON.stringify(history));
  };

  // 筛选和排序
  const [selectedStage, setSelectedStage] = useState<number>(-1); // -1 表示全部
  const [sortBy, setSortBy] = useState<"default" | "hot" | "success" | "new">(
    "default",
  );
  const [showFilters, setShowFilters] = useState(false);

  // 收藏和最近使用
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "favorites">("recent"); // Tab 切换：recent-最近使用，favorites-我的收藏
  const [expandedStages, setExpandedStages] = useState<Record<number, boolean>>(
    {},
  ); // 各阶段展开状态
  const [monthlyUsage, setMonthlyUsage] = useState<Record<string, number>>({}); // 组件月使用量
  const [semiAnnualUsage, setSemiAnnualUsage] = useState<
    Record<string, number>
  >({}); // 组件半年使用量
  const [monthlySuccessRate, setMonthlySuccessRate] = useState<
    Record<string, number>
  >({}); // 月成功率
  const [semiAnnualSuccessRate, setSemiAnnualSuccessRate] = useState<
    Record<string, number>
  >({}); // 半年成功率

  // 组件详情
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  );
  const [showDetail, setShowDetail] = useState(false);

  // 视图和引导
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showGuide, setShowGuide] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(true);

  // 批量操作
  const [selectMode, setSelectMode] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);

  // 统计总组件数
  const totalComponents = componentStages.reduce(
    (sum, stage) => sum + stage.components.length,
    0,
  );

  // 加载用户偏好设置和月使用量数据
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // 从 API 加载收藏
        const favResponse = await fetch("/api/studio?action=favorites");
        const favResult = await favResponse.json();
        if (favResult.success) {
          setFavorites(favResult.data);
        }

        // 从 API 加载最近使用（去重处理）
        const recentResponse = await fetch("/api/studio?action=recent");
        const recentResult = await recentResponse.json();
        if (recentResult.success) {
          // 去重并限制为 6 个
          const uniqueRecent: string[] = Array.from(
            new Set(recentResult.data as string[]),
          ).slice(0, 6);
          setRecentlyUsed(uniqueRecent);
        }

        // 加载月使用量和半年使用量数据（模拟数据，实际应从 API 获取）
        const mockMonthlyUsage: Record<string, number> = {};
        const mockSemiAnnualUsage: Record<string, number> = {};
        const mockMonthlySuccessRate: Record<string, number> = {};
        const mockSemiAnnualSuccessRate: Record<string, number> = {};

        componentStages.forEach((stage) => {
          stage.components.forEach((comp) => {
            // 模拟月使用量为总调用量的 30%
            mockMonthlyUsage[comp.id] = Math.floor(comp.calls * 0.3);
            // 模拟半年使用量为总调用量的 60%
            mockSemiAnnualUsage[comp.id] = Math.floor(comp.calls * 0.6);
            // 模拟成功率（在原始成功率基础上轻微波动）
            mockMonthlySuccessRate[comp.id] = Math.min(
              99.9,
              comp.successRate + (Math.random() * 2 - 1),
            );
            mockSemiAnnualSuccessRate[comp.id] = Math.min(
              99.9,
              comp.successRate + (Math.random() * 1 - 0.5),
            );
          });
        });

        setMonthlyUsage(mockMonthlyUsage);
        setSemiAnnualUsage(mockSemiAnnualUsage);
        setMonthlySuccessRate(mockMonthlySuccessRate);
        setSemiAnnualSuccessRate(mockSemiAnnualSuccessRate);
      } catch (error) {
        console.error("加载用户数据失败:", error);
        // 首次加载失败不显示 toast，避免打扰用户
      }
    };

    const savedViewMode = localStorage.getItem("studio_view_mode") as
      | "grid"
      | "list";
    const hasVisited = localStorage.getItem("studio_has_visited");

    if (savedViewMode) setViewMode(savedViewMode);
    if (hasVisited) setIsFirstVisit(false);

    // 首次访问显示引导
    if (!hasVisited) {
      setShowGuide(true);
      localStorage.setItem("studio_has_visited", "true");
    }

    loadUserData();
  }, []);

  // 保存用户偏好
  useEffect(() => {
    localStorage.setItem("studio_favorites", JSON.stringify(favorites));
    localStorage.setItem("studio_recently_used", JSON.stringify(recentlyUsed));
    localStorage.setItem("studio_view_mode", viewMode);
  }, [favorites, recentlyUsed, viewMode]);

  // 高亮显示的组件 ID
  const [highlightedComponent, setHighlightedComponent] = useState<
    string | null
  >(null);
  // 弹出到眼前的组件 ID
  const [poppedComponent, setPoppedComponent] = useState<string | null>(null);

  // 处理搜索 - 只更新搜索词，不自动滚动
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // 保存搜索历史
    if (query.trim() && !searchHistory.includes(query.trim())) {
      const newHistory = [query.trim(), ...searchHistory].slice(0, 10);
      saveSearchHistory(newHistory);
    }
  };

  // 执行搜索并滚动到匹配的组件
  const executeSearch = (query?: string) => {
    const searchQueryValue = query || searchQuery.trim();
    console.log("执行搜索:", searchQueryValue);

    if (!searchQueryValue) {
      setHighlightedComponent(null);
      return;
    }

    const allComponents = componentStages.flatMap((s) => s.components);
    const matchedComponent = allComponents.find(
      (c) =>
        c.name.toLowerCase().includes(searchQueryValue.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQueryValue.toLowerCase()),
    );

    console.log("匹配的组件:", matchedComponent);

    if (matchedComponent) {
      // 滚动到该组件
      const scrollToComponent = (retries = 0) => {
        const element = document.getElementById(
          `component-${matchedComponent.id}`,
        );
        console.log("查找元素:", `component-${matchedComponent.id}`, element);

        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          console.log("滚动到组件成功");

          // 立即弹出到用户眼前
          setPoppedComponent(matchedComponent.id);

          // 2 秒后恢复原位，只保留金色边框高亮
          setTimeout(() => {
            setPoppedComponent(null);
            setHighlightedComponent(matchedComponent.id);

            // 再 3 秒后完全移除高亮
            setTimeout(() => {
              setHighlightedComponent(null);
            }, 3000);
          }, 2000);
        } else if (retries < 5) {
          // 如果没找到，100ms 后重试，最多重试 5 次
          setTimeout(() => scrollToComponent(retries + 1), 100);
        } else {
          console.error("未找到组件元素，重试失败");
        }
      };

      // 开始滚动
      scrollToComponent();
    } else {
      console.log("未找到匹配的组件");
    }
  };

  // 点击搜索历史或热门搜索项时 - 填充输入框并显示匹配卡片的下拉框
  const handleSearchItemClick = (query: string) => {
    console.log("点击搜索项:", query);
    setSearchQuery(query);
    // 保持下拉框打开，显示匹配的卡片
    setShowSearchHistory(true);
  };

  // 清除搜索历史
  const clearSearchHistory = () => {
    saveSearchHistory([]);
  };

  // 删除单个搜索历史
  const removeSearchHistory = (term: string) => {
    const newHistory = searchHistory.filter((item) => item !== term);
    saveSearchHistory(newHistory);
  };

  // 切换收藏
  const toggleFavorite = async (componentId: string) => {
    try {
      const isFavorite = favorites.includes(componentId);
      console.log("切换收藏:", { componentId, isFavorite });

      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isFavorite ? "unfavorite" : "favorite",
          componentId,
        }),
      });

      console.log("API 响应状态:", response.status);
      const result = await response.json();
      console.log("API 响应结果:", result);

      if (result.success) {
        if (isFavorite) {
          setFavorites(favorites.filter((id) => id !== componentId));
          toast.info("已取消收藏");
        } else {
          setFavorites([...favorites, componentId]);
          toast.success("已添加到收藏");
        }
      } else {
        console.error("API 返回失败:", result);
        toast.error(result.error || "操作失败");
      }
    } catch (error) {
      console.error("切换收藏失败:", error);
      toast.error("操作失败，请稍后重试");
    }
  };

  // 添加到最近使用（去重、限制 6 个）
  const addToRecentlyUsed = async (componentId: string) => {
    try {
      // 记录到数据库
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "use",
          componentId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 更新本地状态：去重并限制为 6 个
        setRecentlyUsed((prev) => {
          const filtered = prev.filter((id) => id !== componentId);
          return [componentId, ...filtered].slice(0, 6);
        });
      }
    } catch (error) {
      console.error("记录最近使用失败:", error);
    }
  };

  // 打开组件详情
  const openComponentDetail = (componentId: string) => {
    setSelectedComponent(componentId);
    setShowDetail(true);
    addToRecentlyUsed(componentId);
  };

  // 使用组件
  const useComponent = async (componentId: string) => {
    addToRecentlyUsed(componentId);

    try {
      // 记录使用到数据库
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "use",
          componentId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("组件已启动，即将跳转到使用页面");
        // TODO: 跳转到组件使用页面
      } else {
        toast.error("启动组件失败，请重试");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
      console.error("记录组件使用失败:", error);
    }
  };

  // 切换选择模式
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (!selectMode) {
      // 进入选择模式时，清空已选组件
      setSelectedComponents([]);
    }
  };

  // 切换组件选中状态
  const toggleComponentSelection = (componentId: string) => {
    if (selectedComponents.includes(componentId)) {
      setSelectedComponents(
        selectedComponents.filter((id) => id !== componentId),
      );
    } else {
      setSelectedComponents([...selectedComponents, componentId]);
    }
  };

  // 全选当前阶段的所有组件
  const selectAllComponents = () => {
    const allComponentIds = componentStages
      .flatMap((s) => s.components)
      .map((c) => c.id);
    setSelectedComponents(allComponentIds);
  };

  // 取消全选
  const deselectAllComponents = () => {
    setSelectedComponents([]);
  };

  // 批量收藏
  const batchFavorite = async () => {
    try {
      if (selectedComponents.length === 0) {
        toast.warning("请先选择要收藏的组件");
        return;
      }

      // 批量添加到收藏
      await Promise.all(
        selectedComponents.map((componentId) =>
          fetch("/api/studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "favorite",
              componentId,
            }),
          }),
        ),
      );

      setFavorites((prev) => [...new Set([...prev, ...selectedComponents])]);
      setSelectedComponents([]);
      setSelectMode(false);
      toast.success(`已成功收藏 ${selectedComponents.length} 个组件`);
    } catch (error) {
      toast.error("批量收藏失败，请稍后重试");
      console.error("批量收藏失败:", error);
    }
  };

  // 批量取消收藏
  const batchUnfavorite = async () => {
    try {
      if (selectedComponents.length === 0) {
        toast.warning("请先选择要取消收藏的组件");
        return;
      }

      // 批量取消收藏
      await Promise.all(
        selectedComponents.map((componentId) =>
          fetch("/api/studio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "unfavorite",
              componentId,
            }),
          }),
        ),
      );

      setFavorites((prev) =>
        prev.filter((id) => !selectedComponents.includes(id)),
      );
      setSelectedComponents([]);
      setSelectMode(false);
      toast.success(`已取消 ${selectedComponents.length} 个组件的收藏`);
    } catch (error) {
      toast.error("批量操作失败，请稍后重试");
      console.error("批量取消收藏失败:", error);
    }
  };

  // 获取热门标签
  const getComponentTags = (component: any) => {
    const tags = [];
    if (component.calls > 3000) tags.push({ type: "hot", text: "周热门" });
    if (component.calls > 5000) tags.push({ type: "superhot", text: "月热门" });
    if (component.successRate > 99)
      tags.push({ type: "quality", text: "高质量" });
    return tags;
  };

  // 根据排序规则获取组件列表
  const getSortedComponents = (components: any[]) => {
    return [...components].sort((a, b) => {
      switch (sortBy) {
        case "hot":
          return b.calls - a.calls; // 按调用量降序
        case "success":
          return b.successRate - a.successRate; // 按成功率降序
        case "new":
          return parseInt(b.id.substring(1)) - parseInt(a.id.substring(1)); // 按组件编号降序
        default:
          return parseInt(a.id.substring(1)) - parseInt(b.id.substring(1)); // 默认按组件编号升序
      }
    });
  };

  // 切换阶段展开/收起
  const toggleStageExpand = (stageIndex: number) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageIndex]: !prev[stageIndex],
    }));
  };

  return (
    <div
      className="min-h-screen bg-[#f0f8ff]"
      onClick={() => setShowSearchHistory(false)}
    >
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
            <a
              href="/workspace-hub"
              className="text-slate-500 hover:text-[#3182ce] transition-all"
            >
              返回空间首页
            </a>
            <ChevronDown className="w-4 h-4 text-slate-400 rotate-[-90deg]" />
            <span className="text-slate-800 font-bold">舟坊空间组件库</span>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* 全局搜索 - 增加宽度 */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件、阶段、功能..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowSearchHistory(true)}
              className="w-96 h-9 pl-10 pr-4 rounded-lg border border-[#e2e8f0] bg-white/80 text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
            />

            {/* 搜索历史和热门搜索下拉 */}
            {showSearchHistory &&
              (searchHistory.length > 0 || searchQuery.trim()) && (
                <div
                  className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-[#e2e8f0] p-4 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 热门搜索 */}
                  {!searchQuery.trim() && searchHistory.length > 0 && (
                    <>
                      <div className="mb-3">
                        <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <TrendingUpIcon className="w-3 h-3 text-[#f59e0b]" />
                          热门搜索
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {hotSearches.slice(0, 5).map((term, index) => (
                            <button
                              key={index}
                              onClick={() => handleSearchItemClick(term)}
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
                            title="清空所有搜索历史"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="space-y-1">
                          {searchHistory.slice(0, 5).map((term, index) => (
                            <div
                              key={index}
                              className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded transition-all group"
                            >
                              <button
                                onClick={() => handleSearchItemClick(term)}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                <Clock className="w-3 h-3 text-slate-400" />
                                {term}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSearchHistory(term);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                                title="删除此搜索历史"
                              >
                                <X className="w-3 h-3 text-red-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* 搜索结果预览 */}
                  {searchQuery.trim() && (
                    <div>
                      <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <SearchCheck className="w-3 h-3" />
                        搜索结果
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {componentStages
                          .flatMap((s) => s.components)
                          .filter(
                            (c) =>
                              c.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) ||
                              c.description
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()),
                          )
                          .slice(0, 8)
                          .map((component) => {
                            // 根据组件 ID 找到对应的颜色主题 - 与卡片视图一致
                            const componentIndex = componentStages
                              .flatMap((s) => s.components)
                              .findIndex((c) => c.id === component.id);
                            const colorThemes = [
                              {
                                color: "#3182ce",
                                bgColor: "from-blue-400/10 to-blue-600/10",
                              },
                              {
                                color: "#10b981",
                                bgColor:
                                  "from-emerald-400/10 to-emerald-600/10",
                              },
                              {
                                color: "#f59e0b",
                                bgColor: "from-amber-400/10 to-amber-600/10",
                              },
                              {
                                color: "#8b5cf6",
                                bgColor: "from-violet-400/10 to-violet-600/10",
                              },
                              {
                                color: "#ec4899",
                                bgColor: "from-pink-400/10 to-pink-600/10",
                              },
                              {
                                color: "#ef4444",
                                bgColor: "from-red-400/10 to-red-600/10",
                              },
                            ];
                            const theme = colorThemes[componentIndex % 6];
                            const IconComponent = component.icon;

                            return (
                              <button
                                key={component.id}
                                onClick={() => {
                                  setShowSearchHistory(false);
                                  // 执行搜索高亮和滚动
                                  setHighlightedComponent(component.id);
                                  setTimeout(() => {
                                    const element = document.getElementById(
                                      `component-${component.id}`,
                                    );
                                    if (element) {
                                      element.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                      });
                                      // 高亮效果增强：持续 5 秒，带脉冲动画
                                      setTimeout(() => {
                                        setHighlightedComponent(null);
                                      }, 5000);
                                    }
                                  }, 100);
                                }}
                                className="w-full text-left p-3 hover:bg-slate-50 rounded-lg transition-all group"
                              >
                                <div className="flex items-start gap-3">
                                  {/* 组件图标 */}
                                  <div
                                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.bgColor} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}
                                  >
                                    <IconComponent
                                      className="w-5 h-5"
                                      style={{ color: theme.color }}
                                    />
                                  </div>

                                  {/* 组件信息 */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                        {component.id}
                                      </span>
                                      <div className="text-sm font-bold text-slate-800 truncate">
                                        {component.name}
                                      </div>
                                    </div>
                                    <div className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                      {component.description}
                                    </div>
                                    {/* 调用统计 */}
                                    <div className="flex items-center gap-3 mt-2">
                                      <div className="flex items-center gap-1">
                                        <Activity className="w-3 h-3 text-[#f59e0b]" />
                                        <span className="text-[10px] font-bold text-slate-500">
                                          {component.calls.toLocaleString()}{" "}
                                          次调用
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3 text-[#10b981]" />
                                        <span className="text-[10px] font-bold text-slate-500">
                                          成功率{" "}
                                          {component.successRate.toFixed(1)}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* 用户头像 - 仅作为身份标识，无交互 */}
          <div
            className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[#3182ce]/20"
            title="当前用户"
          >
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
              <span className="text-xs font-bold text-[#3182ce] bg-[#3182ce]/10 px-2 py-1 rounded-full">
                全部
              </span>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">
              {totalComponents}
            </div>
            <div className="text-xs text-slate-500 font-bold">总组件数</div>
          </div>

          {/* 我的收藏 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">
              {favorites.length}
            </div>
            <div className="text-xs text-slate-500 font-bold">我的收藏</div>
          </div>

          {/* 最近使用 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">
              {recentlyUsed.length}
            </div>
            <div className="text-xs text-slate-500 font-bold">最近使用</div>
          </div>

          {/* 今日调用 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#e2e8f0]/80 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-[#8b5cf6] bg-[#8b5cf6]/10 px-2 py-1 rounded-full">
                +12.5%
              </span>
            </div>
            <div className="text-2xl font-black text-slate-800 mb-1">
              12,847
            </div>
            <div className="text-xs text-slate-500 font-bold">今日调用</div>
          </div>
        </div>

        {/* 最近使用 & 我的收藏快速访问 */}
        {(recentlyUsed.length > 0 || favorites.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg shadow-[#10b981]/30">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-black text-slate-800">快速访问</h3>

              {/* Tab 切换 */}
              <div className="flex gap-2 ml-4 bg-slate-100/80 backdrop-blur-sm p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab("recent")}
                  className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all cursor-pointer ${
                    activeTab === "recent"
                      ? "bg-[#10b981] text-white shadow-md"
                      : "text-slate-600 hover:bg-white/60"
                  }`}
                >
                  最近使用 ({recentlyUsed.length})
                </button>
                <button
                  onClick={() => setActiveTab("favorites")}
                  className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all cursor-pointer ${
                    activeTab === "favorites"
                      ? "bg-[#f59e0b] text-white shadow-md"
                      : "text-slate-600 hover:bg-white/60"
                  }`}
                >
                  我的收藏 ({favorites.length})
                </button>
              </div>

              {/* 清空按钮 */}
              {activeTab === "recent" && recentlyUsed.length > 0 && (
                <button
                  onClick={() => {
                    setRecentlyUsed([]);
                    if (recentlyUsed.length === 1) setActiveTab("favorites");
                  }}
                  className="ml-auto text-xs text-slate-500 hover:text-[#ef4444] transition-all flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-[#ef4444]/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空记录
                </button>
              )}
              {activeTab === "favorites" && favorites.length > 0 && (
                <button
                  onClick={() => {
                    setFavorites([]);
                    if (favorites.length === 1) setActiveTab("recent");
                  }}
                  className="ml-auto text-xs text-slate-500 hover:text-[#ef4444] transition-all flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-[#ef4444]/10 cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5" />
                  清空收藏
                </button>
              )}
            </div>

            {/* Tab 内容 */}
            {activeTab === "recent" && recentlyUsed.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentlyUsed.slice(0, 6).map((componentId) => {
                  const component = componentStages
                    .flatMap((s) => s.components)
                    .find((c) => c.id === componentId);
                  if (!component) return null;
                  const isFavorite = favorites.includes(componentId);
                  return (
                    <div
                      key={componentId}
                      className="group relative overflow-visible bg-white/80 backdrop-blur-xl rounded-xl border-2 border-[#10b981]/20 p-5 hover:border-[#10b981]/50 hover:shadow-xl hover:shadow-[#10b981]/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer text-left"
                    >
                      {/* 背景渐变 */}
                      <div className="absolute inset-0 bg-gradient-to-br from-[#10b981]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                      {/* 右上角删除按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentlyUsed(
                            recentlyUsed.filter((id) => id !== componentId),
                          );
                        }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border-2 border-slate-200 flex items-center justify-center hover:scale-110 hover:border-[#ef4444] transition-all z-20 cursor-pointer opacity-0 group-hover:opacity-100"
                        title="删除此记录"
                      >
                        <X className="w-4 h-4 text-slate-400 hover:text-[#ef4444]" />
                      </button>

                      <div
                        className="relative z-10 flex items-start gap-3"
                        onClick={() => openComponentDetail(componentId)}
                      >
                        {/* 图标 */}
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#10b981]/20 to-[#059669]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <component.icon className="w-7 h-7 text-[#10b981]" />
                        </div>

                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-black text-slate-800 mb-1 line-clamp-2 leading-tight">
                            {component.name}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[12px] font-bold text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded-full">
                              {component.calls.toLocaleString()} 次调用
                            </span>
                            <div className="relative group">
                              <span className="text-[12px] font-bold text-[#10b981]/70 bg-[#10b981]/5 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-help">
                                成功率 {component.successRate.toFixed(1)}%
                                <HelpCircle className="w-3.5 h-3.5" />
                              </span>
                              {/* 悬停提示 */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] p-4 bg-[#1e293b]/95 backdrop-blur-md text-white text-[11px] rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999]">
                                {/* 箭头 */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                                  <div className="w-2.5 h-2.5 bg-[#1e293b]/95 rotate-45"></div>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#10b981] font-bold flex-shrink-0">
                                      公式:
                                    </span>
                                    <span className="whitespace-nowrap">
                                      成功率 = 成功次数 / 总调用 × 100%
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#10b981] font-bold flex-shrink-0">
                                      范围:
                                    </span>
                                    <span>近 30 天</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#10b981] font-bold flex-shrink-0">
                                      说明:
                                    </span>
                                    <span>越高越稳定</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 底部操作按钮 */}
                      <div className="relative z-10 flex items-center gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useComponent(componentId);
                          }}
                          className="flex-1 h-7 rounded-lg bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-[11px] font-bold hover:shadow-lg hover:shadow-[#10b981]/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          使用
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(componentId);
                          }}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center hover:scale-110 transition-all cursor-pointer ${isFavorite ? "border-[#f59e0b] bg-[#f59e0b]/10" : "border-slate-200 hover:border-[#10b981]"}`}
                        >
                          <Star
                            className={`w-4 h-4 ${isFavorite ? "fill-[#f59e0b] text-[#f59e0b]" : "text-slate-400"}`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 我的收藏 Tab 内容 */}
            {activeTab === "favorites" && favorites.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {favorites.slice(0, 6).map((componentId) => {
                  const component = componentStages
                    .flatMap((s) => s.components)
                    .find((c) => c.id === componentId);
                  if (!component) return null;
                  return (
                    <div
                      key={componentId}
                      className="group relative overflow-visible bg-white/80 backdrop-blur-xl rounded-xl border-2 border-[#f59e0b]/20 p-5 hover:border-[#f59e0b]/50 hover:shadow-xl hover:shadow-[#f59e0b]/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer text-left"
                    >
                      {/* 背景渐变 */}
                      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                      <div
                        className="relative z-10 flex items-start gap-3"
                        onClick={() => openComponentDetail(componentId)}
                      >
                        {/* 图标 */}
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f59e0b]/20 to-[#d97706]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <component.icon className="w-7 h-7 text-[#f59e0b]" />
                        </div>

                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-black text-slate-800 mb-1 line-clamp-2 leading-tight">
                            {component.name}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[12px] font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full">
                              {component.calls.toLocaleString()} 次调用
                            </span>
                            <div className="relative group">
                              <span className="text-[12px] font-bold text-[#f59e0b]/70 bg-[#f59e0b]/5 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-help">
                                成功率 {component.successRate.toFixed(1)}%
                                <HelpCircle className="w-3.5 h-3.5" />
                              </span>
                              {/* 悬停提示 */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] p-4 bg-[#1e293b]/95 backdrop-blur-md text-white text-[11px] rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999]">
                                {/* 箭头 */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                                  <div className="w-2.5 h-2.5 bg-[#1e293b]/95 rotate-45"></div>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#f59e0b] font-bold flex-shrink-0">
                                      公式:
                                    </span>
                                    <span className="whitespace-nowrap">
                                      成功率 = 成功次数 / 总调用 × 100%
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#f59e0b] font-bold flex-shrink-0">
                                      范围:
                                    </span>
                                    <span>近 30 天</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-[#f59e0b] font-bold flex-shrink-0">
                                      说明:
                                    </span>
                                    <span>越高越稳定</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 底部操作按钮 */}
                      <div className="relative z-10 flex items-center gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useComponent(componentId);
                          }}
                          className="flex-1 h-7 rounded-lg bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-[11px] font-bold hover:shadow-lg hover:shadow-[#f59e0b]/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          使用
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(componentId);
                          }}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center hover:scale-110 transition-all cursor-pointer ${true ? "border-[#f59e0b] bg-[#f59e0b]/10" : "border-slate-200 hover:border-[#f59e0b]"}`}
                        >
                          <Star
                            className={`w-4 h-4 ${true ? "fill-[#f59e0b] text-[#f59e0b]" : "text-slate-400"}`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 工具栏 - 筛选和排序 */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* 阶段筛选 */}
              <div className="relative">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`h-10 px-6 rounded-xl border-2 flex items-center gap-2.5 text-sm font-bold transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer ${showFilters ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white border-[#3182ce] shadow-[#3182ce]/20" : "bg-white text-slate-700 border-[#e2e8f0] hover:border-[#3182ce] hover:bg-[#3182ce]/5"}`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="flex-1 text-left">
                    {selectedStage === -1
                      ? "全部阶段"
                      : componentStages[selectedStage]?.title}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`}
                  />
                </button>

                {/* 筛选下拉菜单 */}
                {showFilters && (
                  <div
                    className="absolute top-full left-0 mt-2 w-fit min-w-[320px] bg-white rounded-xl shadow-2xl border-2 border-[#e2e8f0] py-3 z-[9999] max-h-[400px] overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <div className="px-4 py-2 text-xs font-bold text-slate-600 border-b border-slate-100 mb-2">
                      选择阶段
                    </div>
                    <div className="flex flex-col gap-1 px-2">
                      <button
                        onClick={() => {
                          setSelectedStage(-1);
                          setShowFilters(false);
                        }}
                        className={`text-left px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedStage === -1 ? "bg-[#3182ce] text-white" : "text-slate-700 hover:bg-slate-100"}`}
                      >
                        全部阶段
                      </button>
                      {componentStages.map((stage, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSelectedStage(index);
                            setShowFilters(false);
                          }}
                          className={`text-left px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedStage === index ? "bg-[#3182ce] text-white" : "text-slate-700 hover:bg-slate-100"}`}
                        >
                          {stage.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 排序 */}
              <button
                className="h-10 px-5 rounded-xl border-2 border-[#e2e8f0] bg-white flex items-center gap-2.5 text-sm font-bold hover:border-[#3182ce] hover:bg-[#3182ce]/5 hover:shadow-md transition-all duration-300 shadow-sm cursor-pointer"
                onClick={() =>
                  setSortBy(
                    sortBy === "default"
                      ? "hot"
                      : sortBy === "hot"
                        ? "success"
                        : sortBy === "success"
                          ? "new"
                          : "default",
                  )
                }
              >
                {sortBy === "default" && (
                  <>
                    <SortAsc className="w-4 h-4" />
                    <span>默认排序</span>
                  </>
                )}
                {sortBy === "hot" && (
                  <>
                    <TrendingUpIcon className="w-4 h-4 text-[#f59e0b]" />
                    <span className="text-[#f59e0b]">按热度</span>
                  </>
                )}
                {sortBy === "success" && (
                  <>
                    <CheckCircle className="w-4 h-4 text-[#10b981]" />
                    <span className="text-[#10b981]">按成功率</span>
                  </>
                )}
                {sortBy === "new" && (
                  <>
                    <SortDesc className="w-4 h-4 text-[#8b5cf6]" />
                    <span className="text-[#8b5cf6]">按新旧</span>
                  </>
                )}
              </button>

              {/* 批量操作 */}
              <button
                onClick={toggleSelectMode}
                className={`h-10 px-5 rounded-xl border-2 flex items-center gap-2.5 text-sm font-bold transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer ${selectMode ? "bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white border-[#8b5cf6] shadow-[#8b5cf6]/20" : "bg-white text-slate-700 border-[#e2e8f0] hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/5"}`}
              >
                {selectMode ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>已选 {selectedComponents.length} 个</span>
                    {selectedComponents.length > 0 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          deselectAllComponents();
                        }}
                        className="ml-2 text-xs underline hover:text-white cursor-pointer"
                      >
                        取消选择
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4" />
                    <span>批量操作</span>
                  </>
                )}
              </button>

              {selectMode && (
                <>
                  {/* 根据选中组件的收藏状态，智能显示批量操作按钮 */}
                  {(() => {
                    // 检查选中的组件是否全部已收藏
                    const allFavorited = selectedComponents.every((id) =>
                      favorites.includes(id),
                    );
                    // 检查选中的组件是否有已收藏的
                    const hasFavorited = selectedComponents.some((id) =>
                      favorites.includes(id),
                    );

                    if (!hasFavorited) {
                      // 都没有收藏，显示"批量收藏"
                      return (
                        <button
                          onClick={batchFavorite}
                          className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#f59e0b]/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                        >
                          <Star className="w-4 h-4" />
                          <span>批量收藏</span>
                        </button>
                      );
                    } else if (allFavorited) {
                      // 全部已收藏，显示"批量取消"
                      return (
                        <button
                          onClick={batchUnfavorite}
                          className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#ef4444]/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                        >
                          <Star className="w-4 h-4" />
                          <span>批量取消</span>
                        </button>
                      );
                    } else {
                      // 部分收藏，显示两个按钮
                      return (
                        <>
                          <button
                            onClick={batchFavorite}
                            className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#f59e0b]/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                          >
                            <Star className="w-4 h-4" />
                            <span>批量收藏</span>
                          </button>
                          <button
                            onClick={batchUnfavorite}
                            className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#ef4444]/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                          >
                            <Star className="w-4 h-4" />
                            <span>批量取消</span>
                          </button>
                        </>
                      );
                    }
                  })()}
                  <button
                    onClick={() => {
                      setSelectedComponents([]);
                      setSelectMode(false);
                    }}
                    className="h-10 px-5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-slate-300 hover:bg-slate-50 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>取消</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* 视图切换 */}
              <div className="flex items-center gap-1 p-1.5 bg-white rounded-xl border-2 border-[#e2e8f0] shadow-sm">
                <button
                  onClick={() => {
                    setViewMode("grid");
                    localStorage.setItem("studio_view_mode", "grid");
                  }}
                  className={`p-2 rounded-lg transition-all duration-300 cursor-pointer ${viewMode === "grid" ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
                  title="卡片视图"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setViewMode("list");
                    localStorage.setItem("studio_view_mode", "list");
                  }}
                  className={`p-2 rounded-lg transition-all duration-300 cursor-pointer ${viewMode === "list" ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
                  title="列表视图"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表视图 */}
        {viewMode === "list" && (
          <div className="space-y-6 mb-8">
            {componentStages.map((stage, stageIndex) => {
              // 阶段筛选逻辑
              if (selectedStage !== -1 && stageIndex !== selectedStage)
                return null;

              // 收藏筛选逻辑
              const componentsToShow = showFavoritesOnly
                ? stage.components.filter((c) => favorites.includes(c.id))
                : stage.components;

              if (componentsToShow.length === 0) return null;

              return (
                <div
                  key={stageIndex}
                  className="bg-white/80 backdrop-blur-xl rounded-xl border border-[#e2e8f0] overflow-hidden"
                >
                  {/* 阶段标题 */}
                  <div className="bg-gradient-to-r from-[#3182ce]/10 to-[#8b5cf6]/10 px-6 py-4 border-b border-[#e2e8f0]">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-black text-slate-800">
                        {stage.title}
                      </div>
                      {/* 组件数量标签 - 与卡片视图一致 */}
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-[#3182ce] to-[#8b5cf6] text-white shadow-md">
                        {componentsToShow.length} 个组件
                      </span>
                    </div>
                  </div>
                  {/* 组件列表 */}
                  <div className="divide-y divide-[#e2e8f0]">
                    {getSortedComponents(componentsToShow).map(
                      (component, compIndex) => {
                        const isFavorite = favorites.includes(component.id);
                        // 根据索引分配不同的颜色主题 (6 种配色循环) - 与卡片视图一致
                        const colorThemes = [
                          {
                            color: "#3182ce",
                            bgColor: "from-blue-400/10 to-blue-600/10",
                          }, // 蓝色
                          {
                            color: "#10b981",
                            bgColor: "from-emerald-400/10 to-emerald-600/10",
                          }, // 绿色
                          {
                            color: "#f59e0b",
                            bgColor: "from-amber-400/10 to-amber-600/10",
                          }, // 橙色
                          {
                            color: "#8b5cf6",
                            bgColor: "from-violet-400/10 to-violet-600/10",
                          }, // 紫色
                          {
                            color: "#ec4899",
                            bgColor: "from-pink-400/10 to-pink-600/10",
                          }, // 粉色
                          {
                            color: "#ef4444",
                            bgColor: "from-red-400/10 to-red-600/10",
                          }, // 红色
                        ];
                        const theme = colorThemes[compIndex % 6];
                        const IconComponent = component.icon;

                        return (
                          <div
                            id={`component-${component.id}`}
                            key={component.id}
                            className={`flex items-center justify-between p-4 hover:bg-slate-50 transition-all duration-500 cursor-pointer border-l-4 ${
                              poppedComponent === component.id
                                ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[600px] bg-white rounded-xl shadow-[0_0_100px_rgba(245,158,11,1)] animate-bounce border-[#f59e0b]"
                                : highlightedComponent === component.id
                                  ? "bg-gradient-to-r from-[#f59e0b]/20 to-[#f59e0b]/5 border-[#f59e0b] scale-[1.02] shadow-lg shadow-[#f59e0b]/30"
                                  : "border-transparent"
                            }`}
                            onClick={() => {
                              if (selectMode) {
                                toggleComponentSelection(component.id);
                              } else {
                                openComponentDetail(component.id);
                              }
                            }}
                          >
                            {/* 选择模式下的复选框 */}
                            {selectMode && (
                              <div
                                className="mr-3"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedComponents.includes(
                                    component.id,
                                  )}
                                  onChange={() =>
                                    toggleComponentSelection(component.id)
                                  }
                                  className="w-5 h-5 rounded border-2 border-[#8b5cf6] text-[#8b5cf6] focus:ring-[#8b5cf6] cursor-pointer"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-4 flex-1">
                              {/* 排序标识 */}
                              <div className="w-16 flex-shrink-0">
                                {sortBy === "hot" && (
                                  <span className="inline-block px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#f59e0b]/20 text-[#f59e0b]">
                                    🔥 {component.calls.toLocaleString()}
                                  </span>
                                )}
                                {sortBy === "success" && (
                                  <span className="inline-block px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#10b981]/20 text-[#10b981]">
                                    ✓ {component.successRate.toFixed(1)}%
                                  </span>
                                )}
                                {sortBy === "new" && (
                                  <span className="inline-block px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#8b5cf6]/20 text-[#8b5cf6]">
                                    🆕 新组件
                                  </span>
                                )}
                                {sortBy === "default" && (
                                  <span className="text-[10px] font-bold text-slate-400">
                                    #{component.id.replace("C", "")}
                                  </span>
                                )}
                              </div>

                              <div
                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${theme.bgColor} flex items-center justify-center`}
                              >
                                <IconComponent
                                  className="w-6 h-6"
                                  style={{ color: theme.color }}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {component.id}
                                  </span>
                                  <div className="font-bold text-slate-800 text-[15px]">
                                    {component.name}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-700 line-clamp-2">
                                  {component.description}
                                </div>
                                {/* 调用统计 - 与卡片视图一致 */}
                                <div className="flex items-center gap-4 mt-2">
                                  <div className="flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-[#f59e0b]" />
                                    <span className="text-[11px] font-bold text-slate-600">
                                      近 30 天 调用
                                      {monthlyUsage[component.id] || 0} 次
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-[#3182ce]" />
                                    <span className="text-[11px] font-bold text-slate-600">
                                      近 180 天调用{" "}
                                      {semiAnnualUsage[component.id] || 0} 次
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* 使用按钮 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useComponent(component.id);
                                }}
                                className="h-9 px-4 rounded-[8px] text-white text-[11px] font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                style={{
                                  background: `linear-gradient(135deg, ${theme.color} 0%, ${theme.color}cc 100%)`,
                                  boxShadow: `0 4px 12px -2px ${theme.color}40`,
                                }}
                              >
                                <Zap className="w-3.5 h-3.5" />
                                使用
                              </button>
                              {/* 分享按钮 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 分享功能 - 生成包含用户 ID 和组件信息的链接
                                  const currentUserId = "user_123"; // TODO: 从登录信息中获取真实用户 ID
                                  const shareUrl = `${window.location.origin}/studio?sharedBy=${currentUserId}&component=${component.id}`;
                                  navigator.clipboard
                                    .writeText(shareUrl)
                                    .then(() => {
                                      toast.success(
                                        "分享链接已复制，好友可通过链接查看此组件！",
                                      );
                                    })
                                    .catch(() => {
                                      toast.error("复制失败，请手动复制链接");
                                    });
                                }}
                                className="w-9 h-9 rounded-[8px] border-2 flex items-center justify-center hover:scale-110 transition-all cursor-pointer"
                                style={{
                                  borderColor: `${theme.color}30`,
                                  color: theme.color,
                                }}
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              {/* 收藏按钮 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(component.id);
                                }}
                                className="w-9 h-9 rounded-lg border-2 flex items-center justify-center hover:scale-110 transition-all cursor-pointer"
                                style={{
                                  borderColor: isFavorite
                                    ? "#f59e0b"
                                    : "#e2e8f0",
                                }}
                              >
                                <Star
                                  className={`w-4 h-4 ${isFavorite ? "fill-[#f59e0b] text-[#f59e0b]" : "text-slate-400"}`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 卡片视图 */}
        {viewMode === "grid" && (
          <div>
            {/* 按阶段分组的组件矩阵 */}
            {componentStages.map((stage, stageIndex) => {
              // 阶段筛选逻辑
              if (selectedStage !== -1 && stageIndex !== selectedStage)
                return null;

              // 收藏筛选逻辑
              const componentsToShow = showFavoritesOnly
                ? stage.components.filter((c) => favorites.includes(c.id))
                : stage.components;

              if (componentsToShow.length === 0) return null;

              return (
                <div key={stageIndex} className="mb-10">
                  {/* 阶段标题 - 优化版（带展开/收起） */}
                  <div className="mb-6 relative">
                    <div className="flex items-center gap-3 mb-3">
                      {/* 左侧彩色竖条 */}
                      <div
                        className="w-1.5 h-8 rounded-full"
                        style={{
                          background: `linear-gradient(180deg, #3182ce 0%, #8b5cf6 100%)`,
                        }}
                      ></div>

                      {/* 阶段标题 */}
                      <h2 className="text-[16px] font-black text-slate-800 tracking-tight">
                        {stage.title}
                      </h2>

                      {/* 组件数量标签 */}
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-[#3182ce] to-[#8b5cf6] text-white shadow-md">
                        {componentsToShow.length} 个组件
                      </span>
                    </div>

                    {/* 底部渐变分割线 */}
                    <div
                      className="h-1 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, #3182ce 0%, #8b5cf6 50%, #3182ce 100%)`,
                        opacity: 0.3,
                      }}
                    ></div>
                  </div>

                  {/* 组件 Grid 容器 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                    {getSortedComponents(componentsToShow).map(
                      (component, compIndex) => {
                        const IconComponent = component.icon;
                        const isFavorite = favorites.includes(component.id);
                        // 根据索引分配不同的颜色主题 (6 种配色循环)
                        const colorThemes = [
                          {
                            color: "#3182ce",
                            bgColor: "from-blue-400/10 to-blue-600/10",
                          }, // 蓝色
                          {
                            color: "#10b981",
                            bgColor: "from-emerald-400/10 to-emerald-600/10",
                          }, // 绿色
                          {
                            color: "#f59e0b",
                            bgColor: "from-amber-400/10 to-amber-600/10",
                          }, // 橙色
                          {
                            color: "#8b5cf6",
                            bgColor: "from-violet-400/10 to-violet-600/10",
                          }, // 紫色
                          {
                            color: "#ec4899",
                            bgColor: "from-pink-400/10 to-pink-600/10",
                          }, // 粉色
                          {
                            color: "#ef4444",
                            bgColor: "from-red-400/10 to-red-600/10",
                          }, // 红色
                        ];
                        const theme = colorThemes[compIndex % 6];

                        return (
                          <div
                            id={`component-${component.id}`}
                            key={component.id}
                            className={`matrix-item min-h-[220px] bg-white/95 backdrop-blur-[16px] rounded-[12px] border-2 transition-all duration-500 cursor-pointer group hover:-translate-y-2 hover:shadow-2xl flex flex-col relative overflow-hidden ${
                              poppedComponent === component.id
                                ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] scale-150 shadow-[0_0_100px_rgba(245,158,11,1)] animate-bounce"
                                : highlightedComponent === component.id
                                  ? "ring-4 ring-[#f59e0b] ring-offset-4 scale-105 shadow-2xl shadow-[#f59e0b]/50"
                                  : ""
                            }`}
                            onClick={() => {
                              if (selectMode) {
                                toggleComponentSelection(component.id);
                              } else {
                                openComponentDetail(component.id);
                              }
                            }}
                            style={{
                              borderColor: `${theme.color}30`,
                              background: `linear-gradient(135deg, ${theme.color}08 0%, ${theme.color}03 100%)`,
                              boxShadow:
                                poppedComponent === component.id
                                  ? "0 0 100px rgba(245, 158, 11, 1), 0 20px 60px rgba(0,0,0,0.3)"
                                  : highlightedComponent === component.id
                                    ? "0 20px 50px -12px rgba(245, 158, 11, 0.8), inset 0 1px 0 rgba(255,255,255,0.8)"
                                    : `0 4px 24px -8px ${theme.color}20, inset 0 1px 0 rgba(255,255,255,0.8)`,
                            }}
                          >
                            {/* 左上角：选择模式下显示复选框，否则显示编号 */}
                            {selectMode ? (
                              <div
                                className="absolute top-3 left-3 z-[100]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedComponents.includes(
                                    component.id,
                                  )}
                                  onChange={() =>
                                    toggleComponentSelection(component.id)
                                  }
                                  className="w-5 h-5 rounded border-2 border-[#8b5cf6] text-[#8b5cf6] focus:ring-[#8b5cf6] cursor-pointer"
                                />
                              </div>
                            ) : (
                              <span
                                className="matrix-tag absolute top-3 left-3 px-2 py-1 text-[10px] font-black rounded-[6px] z-10"
                                style={{
                                  backgroundColor: `${theme.color}15`,
                                  color: theme.color,
                                }}
                              >
                                {component.id}
                              </span>
                            )}

                            {/* 排序标识 */}
                            {sortBy === "hot" && (
                              <span className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#f59e0b]/20 text-[#f59e0b]">
                                🔥 热度 {component.calls.toLocaleString()}
                              </span>
                            )}
                            {sortBy === "success" && (
                              <span className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#10b981]/20 text-[#10b981]">
                                ✓ 成功率 {component.successRate.toFixed(1)}%
                              </span>
                            )}
                            {sortBy === "new" && (
                              <span className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 text-[9px] font-black rounded-[6px] bg-[#8b5cf6]/20 text-[#8b5cf6]">
                                🆕 新组件
                              </span>
                            )}

                            {/* 右上角收藏按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                toggleFavorite(component.id);
                              }}
                              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm border-2 flex items-center justify-center hover:scale-110 transition-all cursor-pointer z-[100]"
                              style={{ borderColor: `${theme.color}30` }}
                            >
                              <Star
                                className={`w-4 h-4 ${isFavorite ? "fill-[#f59e0b] text-[#f59e0b]" : "text-slate-400"}`}
                              />
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
                                  boxShadow: `0 8px 24px -4px ${theme.color}30`,
                                }}
                              >
                                <IconComponent
                                  className="w-8 h-8"
                                  style={{ color: theme.color }}
                                />
                              </div>

                              {/* 组件名称 */}
                              <div className="text-[15px] font-black text-slate-800 tracking-tight text-center leading-snug mb-3 line-clamp-2 px-2">
                                {component.name}
                              </div>

                              {/* 组件描述 (直接显示) */}
                              <div className="text-[12px] text-slate-700 text-center leading-relaxed line-clamp-3 px-3 font-medium mb-3">
                                {component.description}
                              </div>

                              {/* 调用统计 */}
                              <div className="w-full space-y-1.5">
                                <div className="flex items-center justify-center gap-2">
                                  <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
                                  <span className="text-[11px] font-bold text-slate-600">
                                    近 30 天 调用
                                    {monthlyUsage[component.id] || 0} 次
                                  </span>
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                  <Zap className="w-3.5 h-3.5 text-[#3182ce]" />
                                  <span className="text-[11px] font-bold text-slate-600">
                                    近 180 天调用{" "}
                                    {semiAnnualUsage[component.id] || 0} 次
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 底部操作按钮 */}
                            <div className="px-4 pb-4 pt-2 flex items-center gap-2 relative z-10">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useComponent(component.id);
                                }}
                                className="flex-1 h-9 rounded-[8px] text-white text-[11px] font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                style={{
                                  background: `linear-gradient(135deg, ${theme.color} 0%, ${theme.color}cc 100%)`,
                                  boxShadow: `0 4px 12px -2px ${theme.color}40`,
                                }}
                              >
                                <Zap className="w-3.5 h-3.5" />
                                使用
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 分享功能 - 生成包含用户 ID 和组件信息的链接
                                  const currentUserId = "user_123"; // TODO: 从登录信息中获取真实用户 ID
                                  const shareUrl = `${window.location.origin}/studio?sharedBy=${currentUserId}&component=${component.id}`;
                                  navigator.clipboard
                                    .writeText(shareUrl)
                                    .then(() => {
                                      toast.success(
                                        "分享链接已复制，好友可通过链接查看此组件！",
                                      );
                                    })
                                    .catch(() => {
                                      toast.error("复制失败，请手动复制");
                                    });
                                }}
                                className="w-9 h-9 rounded-[8px] bg-white border-2 flex items-center justify-center hover:scale-110 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                style={{ borderColor: `${theme.color}30` }}
                                title="分享"
                              >
                                <Share2
                                  className="w-4 h-4"
                                  style={{ color: theme.color }}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
      {showDetail &&
        selectedComponent &&
        componentDetails[selectedComponent] && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDetail(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="sticky top-0 bg-white border-b border-[#e2e8f0] px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                    <span className="text-2xl">
                      {componentDetails[selectedComponent].name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">
                      {componentDetails[selectedComponent].name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {componentDetails[selectedComponent].description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer"
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
                    {componentDetails[selectedComponent].faq.map(
                      (item, index) => (
                        <div
                          key={index}
                          className="bg-white border border-[#e2e8f0] rounded-lg p-4"
                        >
                          <div className="flex items-start gap-2 mb-2">
                            <HelpCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                            <p className="text-sm font-bold text-slate-800">
                              {item.q}
                            </p>
                          </div>
                          <p className="text-xs text-slate-600 ml-6">
                            {item.a}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* 评分和评论 */}
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 text-[#10b981]" />
                    用户评分与评论
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                    <p className="text-xs text-slate-500">
                      💡 评分和评论功能即将上线，敬请期待！
                    </p>
                    {/* TODO: 实现真实的评分和评论 UI */}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-between pt-4 border-t border-[#e2e8f0]">
                  <button
                    onClick={() => toggleFavorite(selectedComponent)}
                    className={`px-4 py-2 rounded-lg border flex items-center gap-2 text-sm font-bold transition-all cursor-pointer ${favorites.includes(selectedComponent) ? "bg-[#f59e0b] text-white border-[#f59e0b]" : "bg-white text-slate-700 border-[#e2e8f0] hover:border-[#f59e0b]"}`}
                  >
                    <Star className="w-4 h-4" />
                    {favorites.includes(selectedComponent)
                      ? "已收藏"
                      : "添加收藏"}
                  </button>

                  <div className="flex items-center gap-3">
                    <button className="px-4 py-2 rounded-lg border border-[#e2e8f0] flex items-center gap-2 text-sm font-bold text-slate-700 hover:border-[#3182ce] transition-all cursor-pointer">
                      <Share2 className="w-4 h-4" />
                      分享
                    </button>
                    <button
                      onClick={() => useComponent(selectedComponent)}
                      className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-sm font-bold hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
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
                    <Lightbulb className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800">
                    欢迎使用 Studio 组件库
                  </h2>
                </div>
                <button
                  onClick={() => setShowGuide(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer"
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
                    <h3 className="text-sm font-bold text-slate-800 mb-1">
                      浏览组件
                    </h3>
                    <p className="text-xs text-slate-600">
                      53 个核心组件按 10 大软件工程阶段分类，快速找到所需工具
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#10b981]">2</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">
                      搜索与筛选
                    </h3>
                    <p className="text-xs text-slate-600">
                      使用搜索框、阶段筛选、排序等功能快速定位组件
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#f59e0b]">3</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">
                      收藏与使用
                    </h3>
                    <p className="text-xs text-slate-600">
                      点击卡片查看详情，收藏常用组件，一键启动使用
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-[#8b5cf6]">4</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">
                      批量操作
                    </h3>
                    <p className="text-xs text-slate-600">
                      点击"批量操作"按钮，可多选组件进行批量收藏等操作
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowGuide(false)}
                  className="text-sm text-slate-600 hover:text-slate-800 transition-all cursor-pointer"
                >
                  跳过引导
                </button>
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-sm font-bold hover:shadow-lg transition-all cursor-pointer"
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
