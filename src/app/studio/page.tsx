"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  Settings,
  ChevronDown,
  Folder,
  FileText,
  Code,
  Shield,
  Rocket,
  Cpu,
  Database,
  Layers,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Zap,
  TrendingUp,
  Activity,
  Sparkles,
  Terminal,
  Box,
  RefreshCw,
  ArrowRight,
  MessageSquare,
  Send,
  HardDrive,
  Plus,
  Trash2,
  Edit,
  X,
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
  Filter,
} from "lucide-react";

// Mock 数据
const mockStats = {
  systemLoad: 68,
  activeTasks: 24,
  componentCallRate: 89,
  tokenConsumption: 12450,
};

const mockComponents = [
  { id: 1, name: "PDF 解析引擎", category: "分析类", status: "active", icon: FileText },
  { id: 2, name: "偏离表提取器", category: "分析类", status: "active", icon: Search },
  { id: 3, name: "ER 图生成器", category: "生成类", status: "active", icon: Database },
  { id: 4, name: "PRD 文档助手", category: "生成类", status: "active", icon: FileText },
  { id: 5, name: "代码 Diff 评审", category: "工具类", status: "active", icon: Code },
  { id: 6, name: "安全漏洞扫描", category: "工具类", status: "maintenance", icon: Shield },
  { id: 7, name: "自动化部署", category: "工具类", status: "active", icon: Rocket },
  { id: 8, name: "性能监控", category: "分析类", status: "disabled", icon: Activity },
];

const mockKanbanTasks = [
  { id: 1, title: "标书 PDF 结构化解析", phase: "需求定义", progress: 100, status: "completed", component: "PDF 解析引擎", description: "将标书 PDF 文件进行结构化解析，提取关键章节和内容" },
  { id: 2, title: "关键技术指标提取", phase: "需求定义", progress: 75, status: "running", component: "偏离表提取器", description: "从技术偏离表中提取关键指标参数" },
  { id: 3, title: "数据库 ER 图逆向", phase: "产物建模", progress: 45, status: "running", component: "ER 图生成器", description: "根据现有数据库结构逆向生成 ER 图" },
  { id: 4, title: "PRD 文档自动生成", phase: "产物建模", progress: 30, status: "running", component: "PRD 文档助手", description: "基于需求描述自动生成 PRD 文档框架" },
  { id: 5, title: "核心模块代码评审", phase: "生成阶段", progress: 60, status: "running", component: "代码 Diff 评审", description: "对核心业务模块进行代码 Diff 评审" },
  { id: 6, title: "接口自动化测试", phase: "测试阶段", progress: 80, status: "running", component: "性能监控", description: "为核心接口编写自动化测试用例" },
  { id: 7, title: "安全漏洞扫描修复", phase: "测试阶段", progress: 20, status: "blocked", component: "安全漏洞扫描", description: "扫描并修复系统安全漏洞" },
  { id: 8, title: "CI/CD 流水线搭建", phase: "部署阶段", progress: 90, status: "running", component: "自动化部署", description: "搭建持续集成和部署流水线" },
  { id: 9, title: "生产环境部署", phase: "部署阶段", progress: 50, status: "running", component: "自动化部署", description: "将应用部署到生产环境" },
];

const phases = [
  { id: "需求定义", name: "需求定义", icon: FileText },
  { id: "产物建模", name: "产物建模", icon: Database },
  { id: "生成阶段", name: "生成阶段", icon: Sparkles },
  { id: "测试阶段", name: "测试阶段", icon: Shield },
  { id: "部署阶段", name: "部署阶段", icon: Rocket },
];

const componentCategories = ["全部", "分析类", "生成类", "工具类"];

export default function StudioPage() {
  const [selectedTask, setSelectedTask] = useState<typeof mockKanbanTasks[0] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20";
      case "running":
        return "bg-[#3182ce]/10 text-[#3182ce] border-[#3182ce]/20";
      case "blocked":
        return "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "已完成";
      case "running":
        return "进行中";
      case "blocked":
        return "已阻塞";
      default:
        return "未知";
    }
  };

  const filteredComponents = mockComponents.filter((component) => {
    const matchesCategory = selectedCategory === "全部" || component.category === selectedCategory;
    const matchesSearch = searchQuery === "" || component.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleTaskClick = (task: typeof mockKanbanTasks[0]) => {
    setSelectedTask(task);
    setRightPanelWidth(320);
  };

  const closeRightPanel = () => {
    setSelectedTask(null);
    setRightPanelWidth(0);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f0f8ff]">
      {/* 背景网格装饰 */}
      <div 
        className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50"
      />

      {/* 1. 顶层神经中枢 - h-14 shrink-0 */}
      <header className="flex-shrink-0 h-14 bg-white/80 backdrop-blur-xl border-b border-[#e2e8f0]/80 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">知阁·舟坊 Studio</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <ArrowRight className="w-4 h-4" />
              <span className="text-xs">默认项目</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 max-w-xl mx-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件、任务或命令 (Cmd+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-4 rounded-lg border border-[#e2e8f0] bg-white/80 text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ef4444] rounded-full border-2 border-white" />
          </button>
          <button className="w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Settings className="w-5 h-5 text-slate-600" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[#3182ce]/20 cursor-pointer">
            A
          </div>
        </div>
      </header>

      {/* 2. 伪悬浮指标岛 - shrink-0 p-4 (物理推挤，不遮挡) */}
      <div className="flex-shrink-0 p-4 bg-white/60 backdrop-blur-xl border-b border-[#e2e8f0]/80">
        <div className="grid grid-cols-4 gap-4 max-w-[96rem] mx-auto">
          <div className="p-4 bg-white/80 backdrop-blur-md rounded-xl border border-[#e2e8f0]/80 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#3182ce]" />
              </div>
              <span className="text-xs font-medium text-slate-600">系统负载</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{mockStats.systemLoad}%</p>
            <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-full"
                style={{ width: `${mockStats.systemLoad}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-white/80 backdrop-blur-md rounded-xl border border-[#e2e8f0]/80 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-[#10b981]" />
              </div>
              <span className="text-xs font-medium text-slate-600">活跃任务</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{mockStats.activeTasks}</p>
            <p className="text-xs text-[#10b981] mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12% 较昨日
            </p>
          </div>

          <div className="p-4 bg-white/80 backdrop-blur-md rounded-xl border border-[#e2e8f0]/80 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#f59e0b]" />
              </div>
              <span className="text-xs font-medium text-slate-600">组件调用率</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{mockStats.componentCallRate}%</p>
            <p className="text-xs text-slate-500 mt-1">高效运行中</p>
          </div>

          <div className="p-4 bg-white/80 backdrop-blur-md rounded-xl border border-[#e2e8f0]/80 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-[#8b5cf6]" />
              </div>
              <span className="text-xs font-medium text-slate-600">Token 消耗</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">
              {mockStats.tokenConsumption.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">今日累计</p>
          </div>
        </div>
      </div>

      {/* 3. 核心主画板 - flex-1 flex overflow-hidden */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左区：无界看板 (Kanban Canvas) - flex-1 overflow-x-auto */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-4 h-full min-w-max">
            {phases.map((phase) => {
              const phaseTasks = mockKanbanTasks.filter((task) => task.phase === phase.id);
              return (
                <div
                  key={phase.id}
                  className="flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-sm"
                >
                  <div className="p-3 border-b border-[#e2e8f0]/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <phase.icon className="w-4 h-4 text-[#3182ce]" />
                      <h3 className="text-sm font-bold text-slate-800">{phase.name}</h3>
                      <span className="px-2 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                        {phaseTasks.length}
                      </span>
                    </div>
                    <button className="w-6 h-6 rounded-[6px] hover:bg-slate-100 flex items-center justify-center transition-all">
                      <MoreHorizontal className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>

                  <div className="p-3 space-y-3">
                    {phaseTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className={`p-3 bg-white/80 rounded-xl border border-[#e2e8f0]/80 shadow-sm transition-all cursor-grab active:cursor-grabbing hover:shadow-lg ${
                          selectedTask?.id === task.id
                            ? "border-[#3182ce] shadow-[#3182ce]/20"
                            : "hover:border-[#3182ce]/50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-bold text-slate-800 flex-1 pr-2">
                            {task.title}
                          </h4>
                          <span
                            className={`px-2 py-1 text-xs font-bold rounded-full border ${getStatusColor(
                              task.status
                            )}`}
                          >
                            {getStatusText(task.status)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                          {task.description}
                        </p>

                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                            <Cpu className="w-3 h-3 text-[#3182ce]" />
                          </div>
                          <span className="text-xs text-slate-600">{task.component}</span>
                        </div>

                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-500">进度</span>
                            <span className="text-xs font-bold text-slate-700">
                              {task.progress}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                task.progress === 100
                                  ? "bg-[#10b981]"
                                  : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0]"
                              }`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                              A
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="w-5 h-5 rounded-[6px] hover:bg-slate-100 flex items-center justify-center transition-all">
                              <Edit className="w-3 h-3 text-slate-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button className="w-full p-2 border-2 border-dashed border-[#e2e8f0] rounded-xl hover:border-[#3182ce]/50 hover:bg-[#3182ce]/5 transition-all flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-500 font-medium">添加任务</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右区：推拉式 AI 配置舱 - 挤压式，不遮挡 */}
        <div
          className="flex-shrink-0 bg-white/90 backdrop-blur-xl border-l border-[#e2e8f0]/80 transition-all duration-300 overflow-hidden"
          style={{ width: rightPanelWidth }}
        >
          {selectedTask && (
            <div className="w-80 h-full flex flex-col">
              <div className="p-4 border-b border-[#e2e8f0]/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PanelRightOpen className="w-5 h-5 text-[#3182ce]" />
                  <h3 className="text-sm font-bold text-slate-800">AI 配置舱</h3>
                </div>
                <button
                  onClick={closeRightPanel}
                  className="w-6 h-6 rounded-[6px] hover:bg-slate-100 flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2">{selectedTask.title}</h4>
                  <p className="text-xs text-slate-500 mb-3">{selectedTask.description}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                      {selectedTask.phase}
                    </span>
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(selectedTask.status)}`}>
                      {getStatusText(selectedTask.status)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-[#e2e8f0]/80">
                  <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Code className="w-3 h-3 text-[#3182ce]" />
                    JSON 配置
                  </h5>
                  <pre className="text-xs text-slate-600 overflow-x-auto">
                    {JSON.stringify({
                      id: selectedTask.id,
                      title: selectedTask.title,
                      component: selectedTask.component,
                      progress: selectedTask.progress,
                    }, null, 2)}
                  </pre>
                </div>

                <div className="p-3 bg-gradient-to-br from-[#3182ce]/5 to-[#2b6cb0]/5 rounded-xl border border-[#3182ce]/20">
                  <h5 className="text-xs font-bold text-[#3182ce] mb-2 flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    AI Copilot 建议
                  </h5>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    基于当前任务进度，建议优先完成{selectedTask.component}的配置优化。
                    可以自动生成功率测试用例，提升代码质量。
                  </p>
                  <button className="mt-3 w-full h-8 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all">
                    应用 AI 建议
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. 底部智能兵器库 - h-[220px] shrink-0 */}
      <div className="flex-shrink-0 h-[220px] bg-white/90 backdrop-blur-xl border-t border-[#e2e8f0]/80">
        <div className="h-full flex flex-col">
          {/* 顶部：分类 Tab + 搜索 */}
          <div className="flex-shrink-0 h-12 border-b border-[#e2e8f0]/80 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 pr-4 border-r border-[#e2e8f0]/80">
                <Box className="w-5 h-5 text-[#3182ce]" />
                <span className="text-sm font-bold text-slate-800">兵器库</span>
              </div>
              {componentCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all ${
                    selectedCategory === category
                      ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-md"
                      : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索组件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-10 pr-4 rounded-[8px] border border-[#e2e8f0] bg-white text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
              />
            </div>
          </div>

          {/* 下方：横向滚动组件库 */}
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 h-full">
              {filteredComponents.map((component) => (
                <div
                  key={component.id}
                  className={`flex-shrink-0 w-40 p-3 bg-white/80 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                    component.status === "disabled"
                      ? "opacity-50 border-slate-200"
                      : component.status === "maintenance"
                      ? "border-[#f59e0b]/30 hover:border-[#f59e0b]/50"
                      : "border-[#e2e8f0]/80 hover:border-[#3182ce]/50 hover:shadow-lg hover:shadow-[#3182ce]/10"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center mb-2">
                    <component.icon className="w-5 h-5 text-[#3182ce]" />
                  </div>
                  <p className="text-xs font-bold text-slate-800 mb-1 truncate">{component.name}</p>
                  <p className="text-xs text-slate-500">{component.category}</p>
                  {component.status === "disabled" && (
                    <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                      <X className="w-3 h-3" />
                      已禁用
                    </div>
                  )}
                  {component.status === "maintenance" && (
                    <div className="mt-2 text-xs text-[#f59e0b] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      维护中
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 自定义滚动条样式 */}
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
      `}</style>
    </div>
  );
}
