"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Sparkles,
  CornerDownLeft,
  ArrowRight,
  ShieldCheck,
  Workflow,
  BarChart3,
  Users,
} from "lucide-react";

export default function HeroSection() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (targetPath: string) => {
    if (loading) return;
    
    if (isLoggedIn) {
      router.push(targetPath);
    } else {
      // 未登录，跳转到登录页并携带回调参数
      router.push(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    console.log("Clicked suggestion:", suggestion);
    // 根据不同的建议跳转到不同的功能页面
    const targetPaths: Record<string, string> = {
      "生成 PRD 文档": "/studio",
      "逆向数据库 ER 图": "/studio",
      "对比代码 Diff": "/studio",
      "提取标书偏离表": "/studio",
    };
    const targetPath = targetPaths[suggestion] || "/studio";
    handleNavigate(targetPath);
  };

  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1]">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200/50 text-[#3182ce] text-xs font-semibold mb-8 animate-fade-in shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3182ce]"></span>
            </span>
            🚀 V5.0 全新发布:50+ AI 效能组件引擎上线
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-[#3182ce] via-[#2563eb] to-[#1e40af] bg-clip-text text-transparent leading-[1.15] mb-6">
            重塑软件工程:
            <br />
            全链路 AI 效能操作系统
          </h1>

          {/* Subtitle */}
          <p className="text-base md:text-lg text-slate-500 max-w-3xl mx-auto mb-8 leading-relaxed">
            打破工具孤岛，从 RFP 标书解析到系统架构、PRD 生成、项目验收，提效{" "}
            <span className="text-[#3182ce] font-semibold">300%</span>。
          </p>

          {/* Spotlight Input & Suggestion Tags */}
          <div className="max-w-2xl mx-auto mb-12">
            {/* 搜索框主体 */}
            <div className="spotlight-input relative flex items-center bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl transition-all group shadow-lg shadow-slate-200/50">
              <div className="pl-3 text-[#3182ce]">
                <Sparkles className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="✨ 尝试输入：解析《政务云二期标书.pdf》并生成微服务架构图..."
                className="w-full px-3 py-2 bg-transparent border-none focus:ring-0 text-slate-700 outline-none text-sm md:text-base"
              />
              <button
                onClick={() => handleNavigate("/studio")}
                className="bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white p-2 rounded-lg hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all cursor-pointer"
              >
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Suggestion Tags */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-sm">
              <span className="text-slate-400 font-medium mr-1">试试:</span>
              <span
                onClick={() => handleSuggestionClick("生成 PRD 文档")}
                className="px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-full hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50 hover:text-[#3182ce] hover:border-[#3182ce]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm"
              >
                生成 PRD 文档
              </span>
              <span
                onClick={() => handleSuggestionClick("逆向数据库 ER 图")}
                className="px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-full hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50 hover:text-[#3182ce] hover:border-[#3182ce]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm"
              >
                逆向数据库 ER 图
              </span>
              <span
                onClick={() => handleSuggestionClick("对比代码 Diff")}
                className="px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-full hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50 hover:text-[#3182ce] hover:border-[#3182ce]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm"
              >
                对比代码 Diff
              </span>
              <span
                onClick={() => handleSuggestionClick("提取标书偏离表")}
                className="px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-full hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100/50 hover:text-[#3182ce] hover:border-[#3182ce]/30 cursor-pointer transition-all text-xs font-medium text-slate-600 shadow-sm"
              >
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
                      <div className="flex items-center gap-3 text-sm font-bold text-[#3182ce] bg-blue-50 px-2 py-2 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></div>
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
                        <div className="flex bg-slate-50 border border-slate-100 rounded-lg p-1">
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
                          <div className="absolute top-[10%] left-[10%] px-5 py-2 bg-white border border-[#3182ce] text-[#3182ce] text-xs font-semibold rounded-lg shadow-sm z-10 w-20 text-center">
                            Web
                          </div>
                          <div className="absolute top-[10%] left-[50%] -translate-x-1/2 px-5 py-2 bg-white border border-[#3182ce] text-[#3182ce] text-xs font-semibold rounded-lg shadow-sm z-10 w-20 text-center">
                            Mobile
                          </div>
                          <div className="absolute top-[10%] right-[10%] px-5 py-2 bg-white border border-purple-400 text-purple-600 text-xs font-semibold rounded-lg shadow-sm z-10 w-24 text-center">
                            API GW
                          </div>

                          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 px-5 py-2.5 bg-[#3182ce] text-white text-xs font-bold rounded-lg shadow-md z-10 w-32 text-center tracking-wide">
                            Service Mesh
                          </div>

                          <div className="absolute bottom-[10%] left-[10%] px-5 py-2 bg-white border border-[#3182ce] text-[#3182ce] text-xs font-semibold rounded-lg shadow-sm z-10 w-20 text-center">
                            Auth
                          </div>
                          <div className="absolute bottom-[10%] left-[50%] -translate-x-1/2 px-5 py-2 bg-white border border-[#3182ce] text-[#3182ce] text-xs font-semibold rounded-lg shadow-sm z-10 w-20 text-center">
                            Order
                          </div>
                          <div className="absolute bottom-[10%] right-[10%] px-5 py-2 bg-white border border-[#3182ce] text-[#3182ce] text-xs font-semibold rounded-lg shadow-sm z-10 w-20 text-center">
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
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3182ce] to-indigo-500 shadow-inner"></div>
                        <span className="font-bold text-slate-800 text-sm tracking-wide">
                          AI 副驾
                        </span>
                      </div>

                      <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed relative mb-4">
                        已识别{" "}
                        <span className="font-bold text-[#3182ce]">127 项</span>{" "}
                        功能点，正在生成服务边界...
                      </div>

                      <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed">
                        建议将 <br />
                        <span className="text-[#3182ce] font-semibold">
                          UserService
                        </span>{" "}
                        与 <br />
                        <span className="text-[#3182ce] font-semibold">
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
                            <div className="bg-gradient-to-r from-[#3182ce] to-indigo-400 h-full w-full"></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-2">
                            <span>架构生成</span>
                            <span>72%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#3182ce] to-indigo-500 h-full w-[72%]"></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-2">
                            <span>PRD 撰写</span>
                            <span>34%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#3182ce] h-full w-[34%]"></div>
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
      <section className="py-24 bg-gradient-to-b from-[#eaf4fc] to-white">
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
              <div className="text-5xl md:text-6xl font-bold text-[#10b981] mb-2 group-hover:scale-110 transition-transform duration-300">
                50+
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                内置全链路原子组件
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#10b981] mx-auto rounded-full opacity-60"></div>
            </div>
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#f59e0b] mb-2 group-hover:scale-110 transition-transform duration-300">
                300%+
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                平均效能提升
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#f59e0b] mx-auto rounded-full opacity-60"></div>
            </div>
            <div className="group text-center">
              <div className="text-5xl md:text-6xl font-bold text-[#ef4444] mb-2 group-hover:scale-110 transition-transform duration-300">
                99.9%
              </div>
              <div className="text-xs text-[#64748b] font-medium uppercase tracking-wide">
                SLA 服务可用性
              </div>
              <div className="mt-3 w-8 h-0.5 bg-[#ef4444] mx-auto rounded-full opacity-60"></div>
            </div>
          </div>

          {/* 核心优势卡片 */}
          <div className="grid md:grid-cols-4 gap-6">
            {/* Card 1: 企业级安全 */}
            <div className="group relative bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#fef2f2] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
              <div className="relative">
                <div className="w-12 h-12 bg-[#ef4444] rounded-lg flex items-center justify-center mb-4 shadow-md">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-2">
                  企业级安全
                </h3>
                <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                  采用 AES-256
                  加密存储，支持私有化部署，通过等保三级认证，全方位守护数据安全。
                </p>
                <button 
                  onClick={() => handleNavigate("/docs")}
                  className="flex items-center text-[#3182ce] font-semibold text-xs group-hover:translate-x-1 transition-transform cursor-pointer bg-transparent border-none p-0"
                >
                  了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>
            </div>

            {/* Card 2: 自动化流程 */}
            <button 
              onClick={() => handleNavigate("/studio")}
              className="group relative bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer text-left w-full"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#ecfdf5] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
              <div className="relative">
                <div className="w-12 h-12 bg-[#10b981] rounded-lg flex items-center justify-center mb-4 shadow-md">
                  <Workflow className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-2">
                  自动化流程
                </h3>
                <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                  智能编排引擎，可视化工作流设计器，从需求到上线全流程自动化，减少人工干预。
                </p>
                <div className="flex items-center text-[#10b981] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                  了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>

            {/* Card 3: 效能提升 */}
            <button 
              onClick={() => handleNavigate("/studio")}
              className="group relative bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer text-left w-full"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#fffbeb] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
              <div className="relative">
                <div className="w-12 h-12 bg-[#f59e0b] rounded-lg flex items-center justify-center mb-4 shadow-md">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-2">
                  效能提升
                </h3>
                <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                  AI 驱动的代码生成、智能测试、自动文档，平均提效
                  300%，让团队专注于核心创新。
                </p>
                <div className="flex items-center text-[#f59e0b] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                  了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>

            {/* Card 4: 全角色覆盖 */}
            <button 
              onClick={() => handleNavigate("/workspace-hub")}
              className="group relative bg-white rounded-2xl p-6 border border-[#e2e8f0] shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer text-left w-full"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#fef2f2] rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
              <div className="relative">
                <div className="w-12 h-12 bg-[#ef4444] rounded-lg flex items-center justify-center mb-4 shadow-md">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#0f172a] mb-2">
                  全角色覆盖
                </h3>
                <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                  从产品经理、开发、测试到运维，全角色工具链覆盖，打破部门墙，实现高效协同。
                </p>
                <div className="flex items-center text-[#ef4444] font-semibold text-xs group-hover:translate-x-1 transition-transform">
                  了解更多 <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
