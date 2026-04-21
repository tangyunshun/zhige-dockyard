"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ArrowLeft,
  FileText,
  Video,
  HelpCircle,
  Search,
  ChevronRight,
  ExternalLink,
  Box,
  Target,
  Layers,
  Server,
} from "lucide-react";

interface GuideSection {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: GuideItem[];
}

interface GuideItem {
  title: string;
  description: string;
  link: string;
}

const guideSections: GuideSection[] = [
  {
    title: "快速入门",
    icon: <FileText className="w-5 h-5" />,
    color: "#3182ce",
    items: [
      {
        title: "组件库概览",
        description: "了解 Studio 组件库的整体结构和使用方法",
        link: "/studio",
      },
      {
        title: "第一个组件调用",
        description: "5 分钟快速上手，体验组件调用的完整流程",
        link: "/studio",
      },
      {
        title: "常见使用场景",
        description: "了解不同项目阶段应该使用哪些组件",
        link: "/studio",
      },
    ],
  },
  {
    title: "商机与售前打单",
    icon: <Target className="w-5 h-5" />,
    color: "#3182ce",
    items: [
      {
        title: "PDF 解析引擎使用指南",
        description: "学习如何上传和解析 PDF 文件，提取关键信息",
        link: "/studio?stage=0",
      },
      {
        title: "偏离表提取器教程",
        description: "从技术偏离表中快速提取关键指标参数",
        link: "/studio?stage=0",
      },
      {
        title: "招标文件分析",
        description: "智能分析招标文件，提取重要条款和要求",
        link: "/studio?stage=0",
      },
      {
        title: "竞品分析助手",
        description: "输入竞品信息，自动生成对比分析报告",
        link: "/studio?stage=0",
      },
      {
        title: "方案生成器",
        description: "基于客户需求，快速生成技术方案文档",
        link: "/studio?stage=0",
      },
      {
        title: "报价计算器",
        description: "根据项目规模和需求，智能计算报价",
        link: "/studio?stage=0",
      },
    ],
  },
  {
    title: "需求定义与设计",
    icon: <Layers className="w-5 h-5" />,
    color: "#10b981",
    items: [
      {
        title: "PRD 文档助手",
        description: "输入需求描述，自动生成 PRD 文档框架和要点",
        link: "/studio?stage=1",
      },
      {
        title: "ER 图生成器",
        description: "根据数据库结构或业务描述，自动生成 ER 图",
        link: "/studio?stage=1",
      },
      {
        title: "API 设计工具",
        description: "设计 RESTful API 接口，生成接口文档",
        link: "/studio?stage=1",
      },
      {
        title: "原型图生成器",
        description: "基于需求描述，快速生成 UI 原型图",
        link: "/studio?stage=1",
      },
    ],
  },
  {
    title: "后端核心与 API",
    icon: <Server className="w-5 h-5" />,
    color: "#f59e0b",
    items: [
      {
        title: "代码 Diff 评审",
        description: "上传代码变更，获取智能评审意见和改进建议",
        link: "/studio?stage=2",
      },
      {
        title: "自动化部署",
        description: "配置部署流程，一键部署到生产环境",
        link: "/studio?stage=2",
      },
      {
        title: "性能监控",
        description: "实时监控系统性能指标，设置告警规则",
        link: "/studio?stage=2",
      },
      {
        title: "日志分析器",
        description: "上传日志文件，智能分析异常和性能问题",
        link: "/studio?stage=2",
      },
      {
        title: "安全漏洞扫描",
        description: "扫描代码和依赖，发现潜在安全风险",
        link: "/studio?stage=2",
      },
      {
        title: "接口测试器",
        description: "自动化 API 接口测试，生成测试报告",
        link: "/studio?stage=2",
      },
    ],
  },
  {
    title: "高级功能",
    icon: <Video className="w-5 h-5" />,
    color: "#8b5cf6",
    items: [
      {
        title: "工作空间管理",
        description: "学习如何管理和切换不同的工作空间",
        link: "/workspace-hub/settings",
      },
      {
        title: "团队协作配置",
        description: "邀请团队成员，分配角色和权限",
        link: "/workspace-hub/settings",
      },
      {
        title: "集成配置指南",
        description: "配置 GitHub、GitLab 等第三方服务集成",
        link: "/workspace-hub/settings",
      },
      {
        title: "研发偏好设置",
        description: "自定义 AI 引擎、系统提示词等偏好设置",
        link: "/workspace-hub/settings",
      },
    ],
  },
];

const faqs = [
  {
    question: "如何开始使用第一个组件？",
    answer: `1. 进入 Studio 组件库页面
2. 浏览或搜索您需要的组件
3. 点击组件卡片查看详情
4. 点击"使用"按钮开始配置
5. 按照引导完成参数设置
6. 查看运行结果和输出`,
  },
  {
    question: "个人空间和企业空间有什么区别？",
    answer: `个人空间：
- 适合独立开发者
- 包含基础组件体验
- 数据仅自己可见

企业空间：
- 支持团队协作
- 解锁全量 16 个高阶组件
- 支持成员管理和资源共享
- 完整业务流程`,
  },
  {
    question: "如何邀请团队成员？",
    answer: `1. 进入企业空间设置页面
2. 点击"成员管理"标签
3. 点击"邀请成员"按钮
4. 输入成员邮箱或生成邀请链接
5. 设置成员角色和权限
6. 发送邀请`,
  },
  {
    question: "组件调用次数如何计算？",
    answer: `每次成功调用组件 API 计为 1 次调用。
- 调用成功：计入次数
- 调用失败：不计入次数
- 测试调用：同样计入次数

可在"使用统计"中查看详细调用记录。`,
  },
  {
    question: "如何查看组件调用历史？",
    answer: `1. 进入工作空间页面
2. 点击左侧导航的"调用历史"
3. 可按时间、组件名称筛选
4. 点击单条记录查看详细输入输出`,
  },
];

export default function StudioGuide() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleGoToStudio = () => {
    router.push("/studio");
  };

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold">返回工作区</span>
          </button>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#8b5cf6]" />
            <h1 className="text-lg font-black text-slate-800">
              Studio 组件库 - 操作手册
            </h1>
          </div>
        </div>
        <button
          onClick={handleGoToStudio}
          className="px-4 py-2 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
        >
          <span>前往组件库</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      </header>

      {/* 核心区 */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* 标题区 */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] shadow-xl shadow-[#8b5cf6]/30 mb-4">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-800 mb-3">
              Studio 组件库操作手册
            </h1>
            <p className="text-slate-600 text-base max-w-2xl mx-auto">
              全面的使用指南和教程，帮助您快速掌握 16 个高阶组件的使用方法
            </p>
          </div>

          {/* 搜索框 */}
          <div className="mb-8">
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索教程、指南或常见问题..."
                className="w-full pl-12 pr-4 py-3 bg-white/80 backdrop-blur-xl border border-[#e2e8f0] rounded-xl text-sm focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* 教程分类 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {guideSections.map((section) => (
              <div
                key={section.title}
                className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border shadow-sm"
                style={{ borderColor: `${section.color}30` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: `${section.color}10`,
                      color: section.color,
                    }}
                  >
                    {section.icon}
                  </div>
                  <h2 className="text-lg font-black text-slate-800">
                    {section.title}
                  </h2>
                </div>
                <div className="space-y-3">
                  {section.items.map((item, index) => (
                    <div
                      key={index}
                      className="group flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-800 mb-1 group-hover:text-[#3182ce] transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-600">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 常见问题 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-[#e2e8f0]/80">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-lg shadow-[#f59e0b]/30">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-black text-slate-800">
                常见问题 FAQ
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="border border-[#e2e8f0] rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedFaq(expandedFaq === index ? null : index)
                    }
                    className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-all text-left"
                  >
                    <span className="text-sm font-bold text-slate-800">
                      {faq.question}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        expandedFaq === index ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                  {expandedFaq === index && (
                    <div className="p-4 bg-slate-50 border-t border-[#e2e8f0]">
                      <p className="text-sm text-slate-600 whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 底部提示 */}
          <div className="mt-8 p-6 bg-gradient-to-br from-[#8b5cf6]/10 to-[#7c3aed]/10 backdrop-blur-xl rounded-xl border-2 border-[#8b5cf6]/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#8b5cf6]/30">
                <Box className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-800 mb-2">
                  需要更多帮助？
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  如果您在操作手册中未找到答案，可以联系我们的技术支持团队，或查看系统全局帮助文档。
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.push("/docs")}
                    className="px-4 py-2 bg-white border border-[#e2e8f0] text-slate-700 text-sm font-bold rounded-lg hover:shadow-md transition-all"
                  >
                    查看全局帮助文档
                  </button>
                  <button
                    onClick={() => router.push("/workspace-hub/settings")}
                    className="px-4 py-2 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-sm font-bold rounded-lg hover:shadow-lg transition-all"
                  >
                    联系技术支持
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
