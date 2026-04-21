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
} from "lucide-react";

// Mock 数据
const mockSpaces = [
  { id: 1, name: "个人空间", type: "personal", icon: User },
  { id: 2, name: "某某企业空间", type: "enterprise", icon: Building2 },
];

const mockComponents = [
  { id: 1, name: "PDF 解析引擎", category: "分析类", description: "将 PDF 文件进行结构化解析，提取关键内容", icon: FileText, status: "active", calls: 1234, successRate: 98.5 },
  { id: 2, name: "偏离表提取器", category: "分析类", description: "从技术偏离表中提取关键指标参数", icon: Shield, status: "active", calls: 856, successRate: 96.2 },
  { id: 3, name: "ER 图生成器", category: "生成类", description: "根据数据库结构自动生成 ER 图", icon: Database, status: "active", calls: 2341, successRate: 99.1 },
  { id: 4, name: "PRD 文档助手", category: "生成类", description: "基于需求描述自动生成 PRD 文档框架", icon: FileText, status: "maintenance", calls: 1567, successRate: 97.8 },
  { id: 5, name: "代码 Diff 评审", category: "工具类", description: "对代码变更进行智能评审和建议", icon: Code, status: "active", calls: 3421, successRate: 99.5 },
  { id: 6, name: "安全漏洞扫描", category: "工具类", description: "扫描系统安全漏洞并提供修复建议", icon: Shield, status: "active", calls: 987, successRate: 95.3 },
  { id: 7, name: "自动化部署", category: "工具类", description: "一键部署应用到生产环境", icon: Rocket, status: "active", calls: 654, successRate: 98.9 },
  { id: 8, name: "性能监控", category: "分析类", description: "实时监控应用性能指标", icon: Activity, status: "disabled", calls: 0, successRate: 0 },
];

const mockTasks = [
  { id: 1, componentName: "PDF 解析引擎", taskName: "标书 PDF 结构化解析", status: "running", progress: 75, startTime: "2024-01-15 09:30" },
  { id: 2, componentName: "ER 图生成器", taskName: "数据库 ER 图逆向", status: "completed", progress: 100, startTime: "2024-01-15 10:15" },
  { id: 3, componentName: "代码 Diff 评审", taskName: "核心模块代码评审", status: "running", progress: 45, startTime: "2024-01-15 11:00" },
  { id: 4, componentName: "安全漏洞扫描", taskName: "系统安全扫描", status: "blocked", progress: 20, startTime: "2024-01-15 13:20" },
  { id: 5, componentName: "自动化部署", taskName: "生产环境部署", status: "pending", progress: 0, startTime: "-" },
];

const categories = ["全部", "分析类", "生成类", "工具类"];
const statusFilters = ["全部", "运行中", "已完成", "已阻塞", "待开始"];

export default function StudioPage() {
  const [currentSpace, setCurrentSpace] = useState(mockSpaces[0]);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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

      {/* 1. 顶部 Header - 空间切换与全局操作 */}
      <header className="flex-shrink-0 h-14 bg-white/80 backdrop-blur-xl border-b border-[#e2e8f0]/80 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          {/* 空间切换 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">知阁·舟坊 Studio</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </div>
          </div>

          {/* 空间选择器 */}
          <div className="flex items-center gap-2 pl-4 border-l border-[#e2e8f0]">
            <Home className="w-4 h-4 text-slate-400" />
            <select
              value={currentSpace.id}
              onChange={(e) => {
                const space = mockSpaces.find(s => s.id === parseInt(e.target.value));
                if (space) setCurrentSpace(space);
              }}
              className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer"
            >
              {mockSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
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
              placeholder="搜索组件、任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 h-9 pl-10 pr-4 rounded-lg border border-[#e2e8f0] bg-white/80 text-sm text-slate-800 placeholder-slate-400 focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 transition-all outline-none"
            />
          </div>
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

      {/* 2. 主内容区 - 上下结构 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* 上部：组件库（兵器库）- 固定高度 */}
        <div className="flex-shrink-0 h-[calc(100vh-24rem)] border-b border-[#e2e8f0]/80 bg-white/40 backdrop-blur-sm overflow-hidden">
          <div className="h-full flex flex-col">
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

        {/* 下部：用户操作区 - 任务追踪与指标 */}
        <div className="flex-1 bg-white/60 backdrop-blur-sm overflow-hidden">
          <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex-shrink-0 h-12 border-b border-[#e2e8f0]/80 flex items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-slate-800">
                  <Activity className="w-5 h-5 text-[#3182ce]" />
                  <span className="text-sm font-bold">任务追踪</span>
                  <span className="px-2 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                    {filteredTasks.length}
                  </span>
                </div>
                
                {/* 状态筛选 */}
                <div className="flex items-center gap-2 pl-4 border-l border-[#e2e8f0]">
                  {statusFilters.map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-[8px] text-xs font-bold transition-all ${
                        statusFilter === status
                          ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-md"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <button className="flex items-center gap-2 h-8 px-4 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white text-xs font-bold hover:shadow-lg transition-all">
                <Plus className="w-4 h-4" />
                新建任务
              </button>
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-[#e2e8f0]/80 flex items-center justify-between hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-[#3182ce]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-800 mb-1">{task.taskName}</h3>
                        <p className="text-xs text-slate-500">{task.componentName} · {task.startTime}</p>
                      </div>
                      <div className="w-48">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">进度</span>
                          <span className="text-xs font-bold text-slate-700">{task.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              task.progress === 100
                                ? "bg-[#10b981]"
                                : task.status === "blocked"
                                ? "bg-[#f59e0b]"
                                : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0]"
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status, true)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.status === "running" && (
                        <button className="w-8 h-8 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
                          <Pause className="w-4 h-4 text-slate-600" />
                        </button>
                      )}
                      {task.status === "completed" && (
                        <button className="w-8 h-8 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all">
                          <RotateCcw className="w-4 h-4 text-slate-600" />
                        </button>
                      )}
                      {task.status === "blocked" && (
                        <button className="w-8 h-8 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center hover:shadow-lg transition-all">
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button className="w-8 h-8 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-red-300 transition-all group">
                        <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部指标栏 */}
            <div className="flex-shrink-0 h-20 border-t border-[#e2e8f0]/80 bg-white/80 backdrop-blur-sm px-6">
              <div className="h-full flex items-center justify-between">
                <div className="grid grid-cols-4 gap-6 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-[#3182ce]" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">组件调用率</p>
                      <p className="text-lg font-bold text-slate-800">89%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-[#10b981]" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">成功率</p>
                      <p className="text-lg font-bold text-slate-800">98.2%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#f59e0b]" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">平均响应</p>
                      <p className="text-lg font-bold text-slate-800">125ms</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#8b5cf6]" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">今日调用</p>
                      <p className="text-lg font-bold text-slate-800">12,450</p>
                    </div>
                  </div>
                </div>
              </div>
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
