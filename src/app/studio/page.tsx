"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  Settings,
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
  GripVertical,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Move,
  Plus,
  Trash2,
  Edit,
  X,
} from "lucide-react";

// 模拟数据
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
  { id: 1, title: "标书 PDF 结构化解析", phase: "需求定义", progress: 100, status: "completed", component: "PDF 解析引擎" },
  { id: 2, title: "关键技术指标提取", phase: "需求定义", progress: 75, status: "running", component: "偏离表提取器" },
  { id: 3, title: "数据库 ER 图逆向", phase: "设计阶段", progress: 45, status: "running", component: "ER 图生成器" },
  { id: 4, title: "PRD 文档自动生成", phase: "设计阶段", progress: 30, status: "running", component: "PRD 文档助手" },
  { id: 5, title: "核心模块代码评审", phase: "开发阶段", progress: 60, status: "running", component: "代码 Diff 评审" },
  { id: 6, title: "安全漏洞扫描修复", phase: "测试阶段", progress: 20, status: "blocked", component: "安全漏洞扫描" },
  { id: 7, title: "CI/CD 流水线搭建", phase: "部署阶段", progress: 90, status: "running", component: "自动化部署" },
];

const mockResourceTree = [
  {
    id: 1,
    name: "分析类组件",
    icon: Search,
    children: [
      { id: 11, name: "PDF 解析引擎", icon: FileText },
      { id: 12, name: "偏离表提取器", icon: Search },
      { id: 13, name: "性能监控", icon: Activity },
    ],
  },
  {
    id: 2,
    name: "生成类组件",
    icon: Sparkles,
    children: [
      { id: 21, name: "ER 图生成器", icon: Database },
      { id: 22, name: "PRD 文档助手", icon: FileText },
    ],
  },
  {
    id: 3,
    name: "工具类组件",
    icon: Code,
    children: [
      { id: 31, name: "代码 Diff 评审", icon: Code },
      { id: 32, name: "安全漏洞扫描", icon: Shield },
      { id: 33, name: "自动化部署", icon: Rocket },
    ],
  },
];

const phases = ["需求定义", "设计阶段", "开发阶段", "测试阶段", "部署阶段"];

export default function StudioPage() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<number[]>([1, 2, 3]);
  const [selectedComponent, setSelectedComponent] = useState<number | null>(null);

  const toggleCategory = (id: number) => {
    setExpandedCategories((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

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

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#f0f8ff]">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

      {/* 顶部 Header - z-40 */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-[#e2e8f0]/80 z-40 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">知阁·舟坊 Studio</h1>
              <p className="text-xs text-slate-500">原子化组件工作台</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件或任务..."
              className="w-64 h-[38px] pl-10 pr-4 rounded-[8px] border-[1.5px] border-[#e2e8f0] bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none text-[14px]"
            />
          </div>
          <button className="relative w-[38px] h-[38px] rounded-[8px] bg-white/80 border-[1.5px] border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ef4444] rounded-full border-2 border-white" />
          </button>
          <button className="w-[38px] h-[38px] rounded-[8px] bg-white/80 border-[1.5px] border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Settings className="w-5 h-5 text-slate-600" />
          </button>
          <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-lg shadow-[#3182ce]/20 cursor-pointer">
            A
          </div>
        </div>
      </header>

      {/* 左侧资源树抽屉 - z-50（覆盖在 Kanban 上方） */}
      <aside
        className={`fixed top-16 left-0 bottom-0 bg-white/90 backdrop-blur-xl border-r border-[#e2e8f0]/80 transition-all duration-300 z-50 shadow-2xl ${
          sidebarExpanded ? "w-64" : "w-16"
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            {sidebarExpanded && (
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#3182ce]" />
                原子组件库
              </h2>
            )}
            <button className="w-8 h-8 rounded-[8px] hover:bg-slate-100 flex items-center justify-center transition-all">
              {sidebarExpanded ? (
                <PanelLeftClose className="w-5 h-5 text-slate-600" />
              ) : (
                <PanelLeftOpen className="w-5 h-5 text-slate-600" />
              )}
            </button>
          </div>

          <div className="space-y-2">
            {mockResourceTree.map((category) => (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-[8px] hover:bg-slate-100 transition-all ${
                    sidebarExpanded ? "justify-start" : "justify-center"
                  }`}
                >
                  <category.icon
                    className={`w-5 h-5 flex-shrink-0 ${
                      sidebarExpanded ? "text-[#3182ce]" : "text-slate-600"
                    }`}
                  />
                  {sidebarExpanded && (
                    <>
                      <span className="flex-1 text-sm font-medium text-slate-700 text-left">
                        {category.name}
                      </span>
                      {expandedCategories.includes(category.id) ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </>
                  )}
                </button>

                {sidebarExpanded && expandedCategories.includes(category.id) && (
                  <div className="ml-4 mt-1 space-y-1">
                    {category.children.map((child) => (
                      <button
                        key={child.id}
                        className="w-full flex items-center gap-3 p-2 rounded-[8px] hover:bg-[#3182ce]/10 transition-all"
                      >
                        <child.icon className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">{child.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 主内容区域 - Kanban 画布（带安全呼吸区） */}
      <main className="fixed inset-0 pt-24 pb-32 pl-72 pr-72 overflow-auto">
        <div className="min-w-full h-full">
          {/* 指标卡片区 - 悬浮在顶部 */}
          <div className="absolute top-4 right-0 z-30 flex gap-4">
            <div className="p-4 bg-white/80 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-lg min-w-[180px]">
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

            <div className="p-4 bg-white/80 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-lg min-w-[180px]">
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

            <div className="p-4 bg-white/80 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-lg min-w-[180px]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <span className="text-xs font-medium text-slate-600">组件调用率</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">{mockStats.componentCallRate}%</p>
              <p className="text-xs text-slate-500 mt-1">高效运行中</p>
            </div>

            <div className="p-4 bg-white/80 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-lg min-w-[180px]">
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

          {/* Kanban 看板 */}
          <div className="flex gap-6 min-h-full pb-8">
            {phases.map((phase, phaseIndex) => {
              const phaseTasks = mockKanbanTasks.filter((task) => task.phase === phase);
              return (
                <div
                  key={phase}
                  className="flex-shrink-0 w-80 bg-white/60 backdrop-blur-xl rounded-xl border border-[#e2e8f0]/80 shadow-sm"
                >
                  <div className="p-4 border-b border-[#e2e8f0]/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-slate-800">{phase}</h3>
                      <span className="px-2 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                        {phaseTasks.length}
                      </span>
                    </div>
                    <button className="w-6 h-6 rounded-[6px] hover:bg-slate-100 flex items-center justify-center transition-all">
                      <MoreHorizontal className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    {phaseTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-4 bg-white/80 rounded-xl border border-[#e2e8f0]/80 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-lg hover:border-[#3182ce]/30 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
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

                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                            <Cpu className="w-3 h-3 text-[#3182ce]" />
                          </div>
                          <span className="text-xs text-slate-600">{task.component}</span>
                        </div>

                        <div className="mb-3">
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

                        {/* 组件挂载区（虚线框） */}
                        <div className="mt-3 pt-3 border-t border-dashed border-[#e2e8f0]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Box className="w-3 h-3" />
                              组件挂载区
                            </span>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="w-4 h-4 text-[#3182ce]" />
                            </button>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <div className="w-8 h-8 rounded-[6px] bg-[#3182ce]/10 border border-[#3182ce]/20 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-[#3182ce]/20 transition-all">
                              <FileText className="w-4 h-4 text-[#3182ce]" />
                            </div>
                            <div className="w-8 h-8 rounded-[6px] bg-slate-100 border border-slate-200 border-dashed flex items-center justify-center cursor-pointer hover:border-[#3182ce] hover:bg-[#3182ce]/10 transition-all">
                              <Plus className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                              A
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="w-6 h-6 rounded-[6px] hover:bg-slate-100 flex items-center justify-center transition-all">
                              <Edit className="w-3 h-3 text-slate-500" />
                            </button>
                            <button className="w-6 h-6 rounded-[6px] hover:bg-red-50 flex items-center justify-center transition-all">
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button className="w-full p-3 border-2 border-dashed border-[#e2e8f0] rounded-xl hover:border-[#3182ce]/50 hover:bg-[#3182ce]/5 transition-all flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-500 font-medium">添加任务</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 底部 Dock 栏（兵器库）- z-40 */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ${
          dockCollapsed ? "h-12" : "h-32"
        }`}
      >
        {/* 折叠/展开把手 */}
        <button
          onClick={() => setDockCollapsed(!dockCollapsed)}
          className="absolute -top-6 left-1/2 -translate-x-1/2 w-32 h-6 bg-white/80 backdrop-blur-xl border border-[#e2e8f0]/80 rounded-t-xl flex items-center justify-center gap-2 shadow-lg hover:bg-white transition-all cursor-pointer"
        >
          <GripVertical className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">
            {dockCollapsed ? "展开兵器库" : "收起兵器库"}
          </span>
          <GripVertical className="w-4 h-4 text-slate-400" />
        </button>

        <div className="w-full h-full bg-white/90 backdrop-blur-xl border-t border-[#e2e8f0]/80 shadow-lg">
          <div className="h-full flex items-center px-6 gap-6">
            <div className="flex items-center gap-3 pr-6 border-r border-[#e2e8f0]/80">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
                <Box className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">兵器库</h3>
                <p className="text-xs text-slate-500">拖拽组件到任务卡片</p>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-3 overflow-x-auto">
              {mockComponents.slice(0, 6).map((component) => (
                <div
                  key={component.id}
                  className={`flex-shrink-0 p-3 bg-white/80 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                    selectedComponent === component.id
                      ? "border-[#3182ce] shadow-lg shadow-[#3182ce]/20"
                      : "border-[#e2e8f0]/80 hover:border-[#3182ce]/50 hover:shadow-md"
                  }`}
                  onClick={() => setSelectedComponent(component.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center mb-2">
                    <component.icon className="w-5 h-5 text-[#3182ce]" />
                  </div>
                  <p className="text-xs font-bold text-slate-700 whitespace-nowrap">{component.name}</p>
                  <p className="text-xs text-slate-500">{component.category}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-[#e2e8f0]/80">
              <button className="w-[38px] h-[38px] rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <Plus className="w-5 h-5" />
              </button>
              <button className="w-[38px] h-[38px] rounded-[8px] bg-white border-[1.5px] border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
                <RefreshCw className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
