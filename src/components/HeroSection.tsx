"use client";

import {
  Sparkles,
  CornerDownLeft,
  FileSearch,
  GitMerge,
  Code,
  Database,
  Layers,
  Briefcase,
  PenTool,
  Blocks,
  TerminalSquare,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Lock,
  ExternalLink,
  Hexagon,
  MessageSquare,
  Send,
  FileText,
  Users,
  CheckCircle,
  BarChart3,
  Workflow,
  Settings,
  Bell,
  Calendar,
  PieChart,
} from "lucide-react";

export default function HeroSection() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[#2b6cb0] text-xs font-semibold mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            🚀 V5.0 全新发布:50+ AI 效能组件引擎上线
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-extrabold hero-gradient-text leading-[1.1] mb-6">
            重塑软件工程:
            <br />
            全链路 AI 效能操作系统
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-slate-500 max-w-3xl mx-auto mb-10 leading-relaxed">
            打破工具孤岛，从 RFP 标书解析到系统架构、PRD 生成、项目验收，提效{" "}
            <span className="text-[#2b6cb0] font-semibold">300%</span>。
          </p>

          {/* Spotlight Input & Suggestion Tags */}
          <div className="max-w-2xl mx-auto mb-16">
            {/* 搜索框主体 */}
            <div className="spotlight-input relative flex items-center bg-white border border-slate-200 p-2 rounded-12 transition-all group">
              <div className="pl-4 text-blue-500">
                <Sparkles className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="✨ 尝试输入:解析《政务云二期标书.pdf》并生成微服务架构图..."
                className="w-full px-4 py-3 bg-transparent border-none focus:ring-0 text-slate-700 outline-none text-sm md:text-base"
              />
              <button className="bg-[#2b6cb0] text-white p-2.5 rounded-8 hover:bg-[#2c5282] transition-shadow">
                <CornerDownLeft className="w-5 h-5" />
              </button>
            </div>

            {/* Suggestion Tags */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-5 text-sm">
              <span className="text-slate-400 font-medium mr-1">试试:</span>
              <span className="px-4 py-1.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-[#2b6cb0] hover:border-[#2b6cb0]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm">
                生成 PRD 文档
              </span>
              <span className="px-4 py-1.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-[#2b6cb0] hover:border-[#2b6cb0]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm">
                逆向数据库 ER 图
              </span>
              <span className="px-4 py-1.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-[#2b6cb0] hover:border-[#2b6cb0]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm">
                对比代码 Diff
              </span>
              <span className="px-4 py-1.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-[#2b6cb0] hover:border-[#2b6cb0]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm">
                提取标书偏离表
              </span>
            </div>
          </div>

          {/* Mockup - 3D Architecture Diagram */}
          <div className="mockup-container mt-12 relative">
            <div className="mockup-content relative mx-auto max-w-5xl">
              {/* Terminal Background Layer */}
              <div className="absolute -top-10 -left-10 w-full h-full bg-slate-900 rounded-12 shadow-2xl opacity-40 border border-slate-700 transform translate-z-[-20px]"></div>

              {/* Main UI Panel */}
              <div className="relative bg-white rounded-12 shadow-2xl border border-slate-200 overflow-hidden">
                {/* Browser Header */}
                <div className="h-12 border-b border-slate-100 flex items-center px-4 gap-4 bg-white">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                  </div>
                  <div className="flex-1 flex px-4">
                    <div className="bg-white border border-slate-200 rounded-full flex items-center px-4 py-1.5 text-xs text-slate-500 shadow-sm w-full max-w-lg mx-auto md:ml-4 md:mr-auto">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                      app.zhige.os / workbench / project-0328
                    </div>
                  </div>
                </div>

                {/* App Content */}
                <div className="overflow-x-auto">
                  <div className="flex w-full min-w-[800px] h-[520px] bg-white text-left">
                    {/* Left Sidebar - Workflow */}
                    <div className="w-48 border-r border-slate-100 p-6 flex flex-col gap-4">
                      <div className="text-[13px] font-bold text-slate-500 mb-2">
                        工作流
                      </div>

                      <div className="flex items-center gap-3 text-sm font-medium text-slate-700 px-2 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        标书解析
                      </div>
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-700 px-2 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        需求转 PRD
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-[#2b6cb0] bg-blue-50 px-2 py-2 rounded-8">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2b6cb0]"></div>
                        架构设计
                      </div>
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-400 px-2 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                        ER 图生成
                      </div>
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-400 px-2 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                        API 契约
                      </div>
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-400 px-2 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                        代码落盘
                      </div>
                    </div>

                    {/* Center Canvas */}
                    <div className="flex-1 flex flex-col p-8 relative">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            系统架构图 <span className="text-slate-300">•</span>{" "}
                            v1.2
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            自动生成 • 12 服务节点 • 24 链路
                          </p>
                        </div>
                        <div className="flex bg-slate-50 border border-slate-100 rounded-8 p-1">
                          <button className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-md shadow-sm">
                            画布
                          </button>
                          <button className="px-5 py-2 text-slate-600 text-xs font-medium hover:bg-slate-100 rounded-md transition-colors">
                            代码
                          </button>
                          <button className="px-5 py-2 text-slate-600 text-xs font-medium hover:bg-slate-100 rounded-md transition-colors">
                            预览
                          </button>
                        </div>
                      </div>

                      {/* Diagram Area */}
                      <div className="flex-1 flex items-center justify-center relative">
                        <div className="relative w-full max-w-sm h-56">
                          {/* Connections */}
                          <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ zIndex: 0 }}
                          >
                            <line
                              x1="20%"
                              y1="20%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                            <line
                              x1="50%"
                              y1="20%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                            <line
                              x1="80%"
                              y1="20%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                            <line
                              x1="20%"
                              y1="80%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                            <line
                              x1="50%"
                              y1="80%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                            <line
                              x1="80%"
                              y1="80%"
                              x2="50%"
                              y2="50%"
                              stroke="#cbd5e1"
                              strokeWidth="1.5"
                            />
                          </svg>

                          {/* Nodes */}
                          <div className="absolute top-[10%] left-[10%] px-5 py-2 bg-white border border-[#2b6cb0] text-[#2b6cb0] text-xs font-semibold rounded-md shadow-sm z-10 w-20 text-center">
                            Web
                          </div>
                          <div className="absolute top-[10%] left-[50%] -translate-x-1/2 px-5 py-2 bg-white border border-[#2b6cb0] text-[#2b6cb0] text-xs font-semibold rounded-md shadow-sm z-10 w-20 text-center">
                            Mobile
                          </div>
                          <div className="absolute top-[10%] right-[10%] px-5 py-2 bg-white border border-purple-400 text-purple-600 text-xs font-semibold rounded-md shadow-sm z-10 w-24 text-center">
                            API GW
                          </div>

                          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 px-5 py-2.5 bg-[#2b6cb0] text-white text-xs font-bold rounded-md shadow-md z-10 w-32 text-center tracking-wide">
                            Service Mesh
                          </div>

                          <div className="absolute bottom-[10%] left-[10%] px-5 py-2 bg-white border border-[#2b6cb0] text-[#2b6cb0] text-xs font-semibold rounded-md shadow-sm z-10 w-20 text-center">
                            Auth
                          </div>
                          <div className="absolute bottom-[10%] left-[50%] -translate-x-1/2 px-5 py-2 bg-white border border-[#2b6cb0] text-[#2b6cb0] text-xs font-semibold rounded-md shadow-sm z-10 w-20 text-center">
                            Order
                          </div>
                          <div className="absolute bottom-[10%] right-[10%] px-5 py-2 bg-white border border-[#2b6cb0] text-[#2b6cb0] text-xs font-semibold rounded-md shadow-sm z-10 w-20 text-center">
                            Data
                          </div>
                        </div>
                      </div>

                      {/* Bottom Stats Cards */}
                      <div className="grid grid-cols-4 gap-4 mt-8">
                        <div className="bg-slate-50 border border-slate-100 rounded-12 p-4 flex flex-col justify-center">
                          <div className="text-[11px] font-medium text-slate-400 mb-1">
                            节点
                          </div>
                          <div className="text-xl font-bold text-slate-800">
                            12
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-12 p-4 flex flex-col justify-center">
                          <div className="text-[11px] font-medium text-slate-400 mb-1">
                            耦合度
                          </div>
                          <div className="text-xl font-bold text-slate-800">
                            低
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-12 p-4 flex flex-col justify-center">
                          <div className="text-[11px] font-medium text-slate-400 mb-1">
                            QPS 预估
                          </div>
                          <div className="text-xl font-bold text-slate-800">
                            8.2k
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-12 p-4 flex flex-col justify-center">
                          <div className="text-[11px] font-medium text-slate-400 mb-1">
                            合规
                          </div>
                          <div className="text-xl font-bold text-slate-800">
                            ✓
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Sidebar - AI Copilot */}
                    <div className="w-72 border-l border-slate-100 p-6 flex flex-col bg-slate-50/50">
                      <div className="flex items-center gap-2.5 mb-6">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#2b6cb0] to-indigo-500 shadow-inner"></div>
                        <span className="font-bold text-slate-800 text-sm tracking-wide">
                          AI 副驾
                        </span>
                      </div>

                      <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed relative mb-4">
                        已识别{" "}
                        <span className="font-bold text-[#2b6cb0]">127 项</span>{" "}
                        功能点，正在生成服务边界...
                      </div>

                      <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed">
                        建议将 <br />
                        <span className="text-[#2b6cb0] font-semibold">
                          UserService
                        </span>{" "}
                        与 <br />
                        <span className="text-[#2b6cb0] font-semibold">
                          AuthService
                        </span>{" "}
                        合并
                      </div>

                      <div className="mt-auto space-y-5 pt-8">
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-2">
                            <span>解析进度</span>
                            <span>100%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#2b6cb0] to-indigo-400 h-full w-full"></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-2">
                            <span>架构生成</span>
                            <span>72%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#2b6cb0] to-indigo-500 h-full w-[72%]"></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-2">
                            <span>PRD 撰写</span>
                            <span>34%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#2b6cb0] h-full w-[34%]"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Data Dashboard & Trust */}
      <section className="py-24 bg-gradient-to-b from-[#f0f8ff] to-white">
        <div className="max-w-7xl mx-auto px-6">
          {/* 统计数据矩阵 - 无边界卡片设计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-24">
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#3182ce] mb-2 group-hover:scale-110 transition-transform duration-300">
                1.2M+
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                本月为企业节省工时
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#3182ce] mx-auto rounded-full opacity-60"></div>
            </div>
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#38a169] mb-2 group-hover:scale-110 transition-transform duration-300">
                50+
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                内置全链路原子组件
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#38a169] mx-auto rounded-full opacity-60"></div>
            </div>
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#dd6b20] mb-2 group-hover:scale-110 transition-transform duration-300">
                300%+
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                平均研发效能提升
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#dd6b20] mx-auto rounded-full opacity-60"></div>
            </div>
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#e53e3e] mb-2 group-hover:scale-110 transition-transform duration-300">
                99.99%
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                系统高可用 SLA
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#e53e3e] mx-auto rounded-full opacity-60"></div>
            </div>
          </div>

          {/* Trust Indicators - 产品核心优势 */}
          <div className="mt-16">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold text-[#3182ce] uppercase tracking-[0.2em] mb-4">
                WHY CHOOSE US
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1e293b]">
                专为软件研发团队打造
              </h2>
              <p className="text-sm text-[#64748b] mt-3 max-w-2xl mx-auto">
                从需求分析到代码生成，从自动化测试到部署运维，全流程智能化工具链
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {/* Card 1: 企业级安全 */}
              <div className="group relative bg-white rounded-[8px] p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#ebf8ff] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                <div className="relative">
                  <div className="w-12 h-12 bg-[#3182ce] rounded-[4px] flex items-center justify-center mb-4 shadow-md">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1e293b] mb-2">
                    企业级安全
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                    采用 AES-256
                    加密存储，支持私有化部署，通过等保三级认证，全方位守护数据安全。
                  </p>
                  <div className="flex items-center text-[#3182ce] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                    了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              </div>

              {/* Card 2: 自动化流程 */}
              <div className="group relative bg-white rounded-[8px] p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#f0fff4] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                <div className="relative">
                  <div className="w-12 h-12 bg-[#38a169] rounded-[4px] flex items-center justify-center mb-4 shadow-md">
                    <Workflow className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1e293b] mb-2">
                    自动化流程
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                    智能编排引擎，可视化工作流设计器，从需求到上线全流程自动化，减少人工干预。
                  </p>
                  <div className="flex items-center text-[#38a169] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                    了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              </div>

              {/* Card 3: 效能提升 */}
              <div className="group relative bg-white rounded-[8px] p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#fffaf0] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                <div className="relative">
                  <div className="w-12 h-12 bg-[#dd6b20] rounded-[4px] flex items-center justify-center mb-4 shadow-md">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1e293b] mb-2">
                    效能提升
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                    AI 驱动的代码生成、智能测试、自动文档，平均提效
                    300%，让团队专注于核心创新。
                  </p>
                  <div className="flex items-center text-[#dd6b20] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                    了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              </div>

              {/* Card 4: 全角色覆盖 */}
              <div className="group relative bg-white rounded-[8px] p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#fff5f5] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                <div className="relative">
                  <div className="w-12 h-12 bg-[#e53e3e] rounded-[4px] flex items-center justify-center mb-4 shadow-md">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1e293b] mb-2">
                    全角色覆盖
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                    从产品经理、开发、测试到运维，全角色工具链覆盖，打破部门墙，实现高效协同。
                  </p>
                  <div className="flex items-center text-[#e53e3e] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                    了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
