"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  Settings,
  ChevronDown,
  FileText,
  Code,
  Shield,
  Rocket,
  Cpu,
  Database,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Zap,
  TrendingUp,
  Activity,
  Sparkles,
  Box,
  Plus,
  Trash2,
  Edit,
  Filter,
  Grid3X3,
  List,
  Play,
  Pause,
  RotateCcw,
  Home,
  Building2,
  User,
  Folder,
  Layers,
} from "lucide-react";

// Mock 数据 - 模拟从后端获取
const mockSpaces = [
  { id: 1, name: "个人空间", type: "personal", icon: User },
  { id: 2, name: "某某企业空间", type: "enterprise", icon: Building2 },
];

const mockProjects = [
  { id: 1, name: "默认项目" },
  { id: 2, name: "标书解析系统" },
  { id: 3, name: "代码生成平台" },
];

// 50+ 组件库（模拟真实数据）
const mockComponents = [
  { id: 1, name: "PDF 解析引擎", category: "分析类", description: "将 PDF 文件进行结构化解析，提取关键内容", icon: FileText, status: "active", calls: 1234, successRate: 98.5 },
  { id: 2, name: "偏离表提取器", category: "分析类", description: "从技术偏离表中提取关键指标参数", icon: Shield, status: "active", calls: 856, successRate: 96.2 },
  { id: 3, name: "ER 图生成器", category: "生成类", description: "根据数据库结构自动生成 ER 图", icon: Database, status: "active", calls: 2341, successRate: 99.1 },
  { id: 4, name: "PRD 文档助手", category: "生成类", description: "基于需求描述自动生成 PRD 文档框架", icon: FileText, status: "active", calls: 1567, successRate: 97.8 },
  { id: 5, name: "代码 Diff 评审", category: "工具类", description: "对代码变更进行智能评审和建议", icon: Code, status: "active", calls: 3421, successRate: 99.5 },
  { id: 6, name: "安全漏洞扫描", category: "工具类", description: "扫描系统安全漏洞并提供修复建议", icon: Shield, status: "active", calls: 987, successRate: 95.3 },
  { id: 7, name: "自动化部署", category: "工具类", description: "一键部署应用到生产环境", icon: Rocket, status: "active", calls: 654, successRate: 98.9 },
  { id: 8, name: "性能监控", category: "分析类", description: "实时监控应用性能指标", icon: Activity, status: "active", calls: 2156, successRate: 97.6 },
  { id: 9, name: "接口测试器", category: "工具类", description: "自动化 API 接口测试工具", icon: Zap, status: "active", calls: 1876, successRate: 98.2 },
  { id: 10, name: "数据迁移工具", category: "工具类", description: "数据库数据迁移和转换", icon: Database, status: "active", calls: 543, successRate: 96.8 },
  { id: 11, name: "日志分析器", category: "分析类", description: "系统日志智能分析和告警", icon: Activity, status: "active", calls: 3245, successRate: 99.3 },
  { id: 12, name: "UI 组件生成器", category: "生成类", description: "根据设计稿生成前端 UI 组件", icon: Sparkles, status: "active", calls: 1234, successRate: 97.5 },
];

const mockTasks = [
  { id: 1, componentName: "PDF 解析引擎", taskName: "标书 PDF 结构化解析", status: "running", progress: 75, startTime: "2024-01-15 09:30", lastUpdate: "10 分钟前" },
  { id: 2, componentName: "ER 图生成器", taskName: "数据库 ER 图逆向", status: "completed", progress: 100, startTime: "2024-01-15 10:15", lastUpdate: "已完成" },
  { id: 3, componentName: "代码 Diff 评审", taskName: "核心模块代码评审", status: "running", progress: 45, startTime: "2024-01-15 11:00", lastUpdate: "5 分钟前" },
  { id: 4, componentName: "安全漏洞扫描", taskName: "系统安全扫描", status: "blocked", progress: 20, startTime: "2024-01-15 13:20", lastUpdate: "已阻塞" },
  { id: 5, componentName: "自动化部署", taskName: "生产环境部署", status: "pending", progress: 0, startTime: "-", lastUpdate: "待开始" },
];

const categories = ["全部", "分析类", "生成类", "工具类"];
const statusFilters = ["全部", "运行中", "已完成", "已阻塞", "待开始"];

export default function StudioPage() {
  // 空间和项目状态
  const [currentSpace, setCurrentSpace] = useState(mockSpaces[0]);
  const [currentProject, setCurrentProject] = useState(mockProjects[0]);
  
  // 组件库筛选状态
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // 任务操作状态
  const [selectedTask, setSelectedTask] = useState<typeof mockTasks[0] | null>(null);

  const filteredComponents = mockComponents.filter((component) => {
    const matchesCategory = selectedCategory === "全部" || component.category === selectedCategory;
    const matchesSearch = searchQuery === "" || component.name.toLowerCase().includes(searchQuery.toLowerCase()) || component.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredTasks = mockTasks.filter((task) => {
    const matchesStatus = statusFilter === "全部" || task.status === statusFilter;
    return matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20";
      case "maintenance":
        return "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20";
      case "disabled":
        return "bg-slate-100 text-slate-400 border-slate-200";
      case "running":
        return "bg-[#3182ce]/10 text-[#3182ce] border-[#3182ce]/20";
      case "completed":
        return "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20";
      case "blocked":
        return "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20";
      case "pending":
        return "bg-slate-100 text-slate-500 border-slate-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getStatusText = (status: string, isTask: boolean = false) => {
    if (isTask) {
      switch (status) {
        case "running": return "进行中";
        case "completed": return "已完成";
        case "blocked": return "已阻塞";
        case "pending": return "待开始";
        default: return "未知";
      }
    } else {
      switch (status) {
        case "active": return "正常";
        case "maintenance": return "维护中";
        case "disabled": return "已禁用";
        default: return "未知";
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f0f8ff]">
      {/* 背景网格装饰 */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

      {/* 1. 顶部 Header - 融入系统导航 */}
      <header className="flex-shrink-0 h-14 bg-white/80 backdrop-blur-xl border-b border-[#e2e8f0]/80 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          {/* 返回 workspace-hub */}
          <a
            href="/workspace-hub"
            className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
            title="返回空间首页"
          >
            <div className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
          </a>

          {/* 面包屑导航 */}
          <nav className="flex items-center gap-2 text-sm">
            <a href="/workspace-hub" className="text-slate-500 hover:text-[#3182ce] transition-all">
              空间首页
            </a>
            <ChevronDown className="w-4 h-4 text-slate-400 rotate-[-90deg]" />
            <span className="text-slate-800 font-bold">组件库</span>
          </nav>

          {/* 工作空间切换 */}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-[#e2e8f0]">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={currentSpace.id}
              onChange={(e) => {
                const space = mockSpaces.find(s => s.id === parseInt(e.target.value));
                if (space) setCurrentSpace(space);
              }}
              className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer hover:text-[#3182ce]"
            >
              {mockSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>

          {/* 项目切换 */}
          <div className="flex items-center gap-2 pl-4 border-l border-[#e2e8f0]">
            <Folder className="w-4 h-4 text-slate-400" />
            <select
              value={currentProject.id}
              onChange={(e) => {
                const project = mockProjects.find(p => p.id === parseInt(e.target.value));
                if (project) setCurrentProject(project);
              }}
              className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer hover:text-[#3182ce]"
            >
              {mockProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索组件..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 h-9 pl-10 pr-4 rounded-lg border border-[#e2e8f0] bg-white/80 text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
            />
          </div>
          <button className="relative w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ef4444] rounded-full border-2 border-white" />
          </button>
          <a
            href="/studio/tasks"
            className="w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all"
            title="查看任务追踪"
          >
            <Layers className="w-5 h-5 text-slate-600" />
          </a>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-[#3182ce]/20 cursor-pointer">
            A
          </div>
        </div>
      </header>

      {/* 2. 顶部导航标签 */}
      <div className="flex-shrink-0 bg-white/60 backdrop-blur-sm border-b border-[#e2e8f0]/80">
        <div className="flex items-center gap-1 px-6">
          <a
            href="/studio"
            className="px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#4299e1] to-[#3182ce] rounded-t-lg border-t border-l border-r border-[#3182ce]/20"
          >
            <Box className="w-4 h-4 inline mr-2" />
            组件库
          </a>
          <a
            href="/studio/tasks"
            className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg transition-all"
          >
            <Activity className="w-4 h-4 inline mr-2" />
            任务追踪
          </a>
        </div>
      </div>

      {/* 2. 主内容区 - 上下结构，各占 50% 高度 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* 上部：组件库（兵器库）- 占 50% 高度 */}
        <div className="flex-1 min-h-0 border-b-2 border-[#e2e8f0]/80 bg-white/40 backdrop-blur-sm overflow-hidden flex flex-col">
          {/* 工具栏 */}
          <div className="flex-shrink-0 h-12 border-b border-[#e2e8f0]/80 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Box className="w-5 h-5 text-[#3182ce]" />
                <span className="text-sm font-bold">组件库</span>
                <span className="px-2 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                  {filteredComponents.length}
                </span>
              </div>
              
              {/* 分类筛选 */}
              <div className="flex items-center gap-2 pl-4 border-l border-[#e2e8f0]">
                {categories.map((category) => (
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

          {/* 组件列表 */}
          <div className="flex-1 overflow-y-auto p-6">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-4 gap-4">
                {filteredComponents.map((component) => (
                  <div
                    key={component.id}
                    className={`p-4 bg-white/80 backdrop-blur-sm rounded-xl border transition-all cursor-pointer hover:shadow-lg ${
                      component.status === "disabled"
                        ? "opacity-50 border-slate-200"
                        : component.status === "maintenance"
                        ? "border-[#f59e0b]/30"
                        : "border-[#e2e8f0]/80 hover:border-[#3182ce]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                        <component.icon className="w-6 h-6 text-[#3182ce]" />
                      </div>
                      <span className={`px-2 py-1 text-xs font-bold rounded-full border ${getStatusColor(component.status)}`}>
                        {getStatusText(component.status)}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">{component.name}</h3>
                    <p className="text-xs text-slate-500 mb-3 line-clamp-2">{component.description}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="px-2 py-1 bg-slate-100 rounded-full">{component.category}</span>
                      <span>{component.calls.toLocaleString()} 次调用</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
                      <button className="flex-1 h-8 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-bold hover:shadow-lg transition-all">
                        使用
                      </button>
                      <button className="w-8 h-8 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
                        <MoreHorizontal className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredComponents.map((component) => (
                  <div
                    key={component.id}
                    className={`p-4 bg-white/80 backdrop-blur-sm rounded-xl border flex items-center justify-between ${
                      component.status === "disabled"
                        ? "opacity-50 border-slate-200"
                        : component.status === "maintenance"
                        ? "border-[#f59e0b]/30"
                        : "border-[#e2e8f0]/80"
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                        <component.icon className="w-6 h-6 text-[#3182ce]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-800 mb-1">{component.name}</h3>
                        <p className="text-xs text-slate-500">{component.description}</p>
                      </div>
                      <span className="px-2 py-1 bg-slate-100 rounded-full text-xs text-slate-600">{component.category}</span>
                      <span className="text-xs text-slate-400">{component.calls.toLocaleString()} 次调用</span>
                      <span className={`px-2 py-1 text-xs font-bold rounded-full border ${getStatusColor(component.status)}`}>
                        {getStatusText(component.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="h-8 px-4 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-bold hover:shadow-lg transition-all">
                        使用
                      </button>
                      <button className="w-8 h-8 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
                        <MoreHorizontal className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
