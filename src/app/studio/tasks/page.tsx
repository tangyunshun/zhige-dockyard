"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  ChevronDown,
  Cpu,
  Activity,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  User,
  Folder,
  Box,
  CheckCircle,
  Clock,
  Zap,
  TrendingUp,
} from "lucide-react";

// Mock 数据
const mockSpaces = [
  { id: 1, name: "个人空间", type: "personal", icon: User },
  { id: 2, name: "某某企业空间", type: "enterprise", icon: User },
];

const mockProjects = [
  { id: 1, name: "默认项目" },
  { id: 2, name: "标书解析系统" },
  { id: 3, name: "代码生成平台" },
];

const mockTasks = [
  { id: 1, componentName: "PDF 解析引擎", taskName: "标书 PDF 结构化解析", status: "running", progress: 75, startTime: "2024-01-15 09:30", lastUpdate: "10 分钟前" },
  { id: 2, componentName: "ER 图生成器", taskName: "数据库 ER 图逆向", status: "completed", progress: 100, startTime: "2024-01-15 10:15", lastUpdate: "已完成" },
  { id: 3, componentName: "代码 Diff 评审", taskName: "核心模块代码评审", status: "running", progress: 45, startTime: "2024-01-15 11:00", lastUpdate: "5 分钟前" },
  { id: 4, componentName: "安全漏洞扫描", taskName: "系统安全扫描", status: "blocked", progress: 20, startTime: "2024-01-15 13:20", lastUpdate: "已阻塞" },
  { id: 5, componentName: "自动化部署", taskName: "生产环境部署", status: "pending", progress: 0, startTime: "-", lastUpdate: "待开始" },
  { id: 6, componentName: "性能监控", taskName: "API 性能监控配置", status: "running", progress: 60, startTime: "2024-01-15 14:00", lastUpdate: "刚刚" },
  { id: 7, componentName: "日志分析器", taskName: "系统日志分析任务", status: "completed", progress: 100, startTime: "2024-01-15 08:00", lastUpdate: "2 小时前完成" },
];

const statusFilters = ["全部", "运行中", "已完成", "已阻塞", "待开始"];

export default function TasksPage() {
  const [currentSpace, setCurrentSpace] = useState(mockSpaces[0]);
  const [currentProject, setCurrentProject] = useState(mockProjects[0]);
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTasks = mockTasks.filter((task) => {
    const matchesStatus = statusFilter === "全部" || task.status === statusFilter;
    const matchesSearch = searchQuery === "" || task.taskName.toLowerCase().includes(searchQuery.toLowerCase()) || task.componentName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
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

  const getStatusText = (status: string) => {
    switch (status) {
      case "running": return "进行中";
      case "completed": return "已完成";
      case "blocked": return "已阻塞";
      case "pending": return "待开始";
      default: return "未知";
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f0f8ff]">
      {/* 背景网格装饰 */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

      {/* 1. 顶部 Header */}
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
            <span className="text-slate-800 font-bold">任务追踪</span>
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
          {/* 全局搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索任务..."
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
            href="/studio"
            className="w-9 h-9 rounded-lg bg-white/80 border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all"
            title="返回组件库"
          >
            <Box className="w-5 h-5 text-slate-600" />
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
            className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg transition-all"
          >
            <Box className="w-4 h-4 inline mr-2" />
            组件库
          </a>
          <a
            href="/studio/tasks"
            className="px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#4299e1] to-[#3182ce] rounded-t-lg border-t border-l border-r border-[#3182ce]/20"
          >
            <Activity className="w-4 h-4 inline mr-2" />
            任务追踪
          </a>
        </div>
      </div>

      {/* 3. 主内容区 - 任务追踪 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex-shrink-0 h-12 border-b border-[#e2e8f0]/80 flex items-center justify-between px-6 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-800">
              <Activity className="w-5 h-5 text-[#3182ce]" />
              <span className="text-sm font-bold">我的任务</span>
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
                className="p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-[#e2e8f0]/80 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-[#3182ce]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-slate-800">{task.taskName}</h3>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${getStatusColor(task.status)}`}>
                          {getStatusText(task.status)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{task.componentName} · 开始于 {task.startTime} · {task.lastUpdate}</p>
                    </div>
                    <div className="w-64">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">进度</span>
                        <span className="text-xs font-bold text-slate-700">{task.progress}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {task.status === "running" && (
                      <>
                        <button className="w-9 h-9 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all" title="暂停">
                          <Pause className="w-4 h-4 text-slate-600" />
                        </button>
                        <button className="w-9 h-9 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#10b981] transition-all group" title="完成">
                          <CheckCircle className="w-4 h-4 text-slate-400 group-hover:text-[#10b981]" />
                        </button>
                      </>
                    )}
                    {task.status === "completed" && (
                      <button className="w-9 h-9 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-[#3182ce] transition-all" title="重试">
                        <RotateCcw className="w-4 h-4 text-slate-600" />
                      </button>
                    )}
                    {task.status === "blocked" && (
                      <button className="w-9 h-9 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center hover:shadow-lg transition-all" title="继续">
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {task.status === "pending" && (
                      <button className="w-9 h-9 rounded-[8px] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center hover:shadow-lg transition-all" title="开始">
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button className="w-9 h-9 rounded-[8px] bg-white border border-[#e2e8f0] flex items-center justify-center hover:border-red-300 transition-all group" title="删除">
                      <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
                    </button>
                  </div>
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
